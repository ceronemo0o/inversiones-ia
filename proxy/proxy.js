/*
 * proxy.js — Proxy CORS local, sin dependencias externas.
 *
 * Por qué existe: esta web es estática (sin backend propio) y llama a Yahoo Finance
 * (fuente de datos de mercado, sin necesidad de clave/registro) desde el navegador.
 * Yahoo no envía cabeceras CORS ni acepta peticiones sin un User-Agent de navegador,
 * así que este proxy reenvía la petición desde el servidor (Node), añadiendo esa
 * cabecera y las cabeceras CORS necesarias para que el navegador pueda leer la respuesta.
 *
 * Uso:
 *   node proxy.js
 *   (o: PORT=9000 node proxy.js  para usar otro puerto)
 *
 * Este archivo es también el primer paso natural para, en el futuro,
 * convertir este proyecto en una aplicación con backend propio.
 */

var http = require("http");
var https = require("https");
var { URL } = require("url");

var PORT = process.env.PORT || 8787;

// Por seguridad, solo se permite reenviar peticiones a hosts conocidos de datos de mercado.
var ALLOWED_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

// Yahoo Finance bloquea (HTTP 429) las peticiones que no parezcan venir de un navegador real.
var BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function fetchUpstream(targetUrl, res, redirectsLeft) {
  var lib = targetUrl.protocol === "http:" ? http : https;
  var upstream = lib.get(targetUrl, { headers: { "User-Agent": BROWSER_USER_AGENT, "Accept": "application/json" } }, function (upstreamRes) {
    var status = upstreamRes.statusCode || 502;
    if ((status === 301 || status === 302 || status === 307) && upstreamRes.headers.location && redirectsLeft > 0) {
      upstreamRes.resume(); // descarta el cuerpo de la redirección
      var nextUrl;
      try {
        nextUrl = new URL(upstreamRes.headers.location, targetUrl);
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Redirección inválida del servidor de datos." }));
        return;
      }
      fetchUpstream(nextUrl, res, redirectsLeft - 1);
      return;
    }
    res.writeHead(status, { "Content-Type": upstreamRes.headers["content-type"] || "application/json" });
    upstreamRes.pipe(res);
  });

  upstream.on("error", function (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No se pudo contactar con el servidor de datos.", detail: err.message }));
  });
}

var server = http.createServer(function (req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  var reqUrl = new URL(req.url, "http://localhost:" + PORT);

  if (reqUrl.pathname !== "/proxy") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Ruta no encontrada. Usa /proxy?url=..." }));
    return;
  }

  var target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Falta el parámetro 'url'." }));
    return;
  }

  var targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "URL de destino inválida." }));
    return;
  }

  if (ALLOWED_HOSTS.indexOf(targetUrl.hostname) === -1) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Host no permitido: " + targetUrl.hostname }));
    return;
  }

  fetchUpstream(targetUrl, res, 2);
});

server.listen(PORT, function () {
  console.log("Proxy CORS escuchando en http://localhost:" + PORT);
  console.log("La web lo usará automáticamente si la petición directa falla.");
});
