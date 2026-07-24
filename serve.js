/*
 * serve.js — Servidor estático local, sin dependencias externas.
 *
 * Por qué existe: abrir index.html con doble clic (file://) puede hacer que el
 * navegador bloquee la carga de data/ibex35.json y otros archivos. Este script
 * sirve la carpeta del proyecto por HTTP, evitando ese problema.
 *
 * Uso:
 *   node serve.js
 *   (o: PORT=8080 node serve.js  para usar otro puerto)
 *
 * Luego abre http://localhost:8000 (o el puerto indicado) en el navegador.
 */

var http = require("http");
var fs = require("fs");
var path = require("path");

var PORT = process.env.PORT || 8000;
var ROOT = __dirname;

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

var server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  var filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end("Prohibido");
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No encontrado: " + urlPath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, function () {
  console.log("Inversiones IA disponible en http://localhost:" + PORT);
});
