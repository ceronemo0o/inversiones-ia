/*
 * functions/proxy.js — Cloudflare Pages Function.
 *
 * Es el equivalente, para el despliegue público en Cloudflare Pages, de
 * proxy/proxy.js (que se usa para desarrollo local). Cloudflare detecta
 * automáticamente cualquier archivo dentro de /functions y lo publica como
 * una función serverless en la ruta correspondiente: este archivo queda
 * disponible en https://tu-sitio.pages.dev/proxy — sin necesidad de que el
 * ordenador de nadie esté encendido para que funcione.
 *
 * Hace lo mismo que el proxy local: reenvía la petición a Yahoo Finance
 * añadiendo un User-Agent de navegador (si no, Yahoo responde 429) y
 * añadiendo las cabeceras CORS necesarias para que el navegador pueda leer
 * la respuesta.
 */

var ALLOWED_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
var BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS)
  });
}

export async function onRequestGet(context) {
  var reqUrl = new URL(context.request.url);
  var target = reqUrl.searchParams.get("url");

  if (!target) return jsonError("Falta el parámetro 'url'.", 400);

  var targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (e) {
    return jsonError("URL de destino inválida.", 400);
  }

  if (ALLOWED_HOSTS.indexOf(targetUrl.hostname) === -1) {
    return jsonError("Host no permitido: " + targetUrl.hostname, 403);
  }

  try {
    var upstream = await fetch(targetUrl.toString(), {
      headers: { "User-Agent": BROWSER_USER_AGENT, "Accept": "application/json" }
    });
    var body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: Object.assign(
        { "Content-Type": upstream.headers.get("content-type") || "application/json" },
        CORS_HEADERS
      )
    });
  } catch (err) {
    return jsonError("No se pudo contactar con el servidor de datos: " + String(err && err.message || err), 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
