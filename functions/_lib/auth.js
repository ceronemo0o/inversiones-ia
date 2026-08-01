/*
 * functions/_lib/auth.js
 * Utilidades compartidas de autenticación para las funciones de Cloudflare Pages.
 * Los archivos y carpetas que empiezan por "_" dentro de /functions no se
 * publican como rutas, así que este módulo solo se usa como librería interna.
 *
 * Contraseñas: se derivan con PBKDF2-SHA256 (100.000 iteraciones) usando la
 * Web Crypto API nativa del runtime de Cloudflare Workers — no hace falta
 * ninguna dependencia externa.
 */

const PBKDF2_ITERATIONS = 100000;
const SESSION_COOKIE = "invia_session";
const SESSION_DAYS = 30;

function bytesToHex(bytes) {
  return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
function hexToBytes(hex) {
  var arr = new Uint8Array(hex.length / 2);
  for (var i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

export async function hashPassword(password, existingSaltHex) {
  var enc = new TextEncoder();
  var salt = existingSaltHex ? hexToBytes(existingSaltHex) : crypto.getRandomValues(new Uint8Array(16));
  var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password, saltHex, expectedHashHex) {
  var derived = await hashPassword(password, saltHex);
  if (derived.hash.length !== expectedHashHex.length) return false;
  var diff = 0;
  for (var i = 0; i < derived.hash.length; i++) {
    diff |= derived.hash.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

export function newId() {
  return crypto.randomUUID();
}

export function newSessionToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function parseCookies(request) {
  var header = request.headers.get("Cookie") || "";
  var out = {};
  header.split(";").forEach(function (pair) {
    var idx = pair.indexOf("=");
    if (idx === -1) return;
    var k = pair.slice(0, idx).trim();
    var v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookieHeader(request, token, maxAgeSeconds) {
  var isHttps = new URL(request.url).protocol === "https:";
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAgeSeconds + (isHttps ? "; Secure" : "");
}

export function clearSessionCookieHeader(request) {
  var isHttps = new URL(request.url).protocol === "https:";
  return SESSION_COOKIE + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (isHttps ? "; Secure" : "");
}

export async function createSession(db, userId) {
  var token = newSessionToken();
  var now = Date.now();
  var expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, now, expiresAt).run();
  return { token: token, maxAgeSeconds: SESSION_DAYS * 24 * 60 * 60 };
}

export function parseMarkets(marketsJson) {
  try {
    var parsed = JSON.parse(marketsJson);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (e) {}
  return ["spain"];
}

export async function getSessionUser(request, db) {
  var cookies = parseCookies(request);
  var token = cookies[SESSION_COOKIE];
  if (!token) return null;
  var row = await db.prepare(
    "SELECT s.token as token, s.expires_at as expiresAt, u.id as id, u.email as email, u.risk_profile as riskProfile, u.markets as markets " +
    "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?"
  ).bind(token).first();
  if (!row) return null;
  if (row.expiresAt < Date.now()) return null;
  return { id: row.id, email: row.email, riskProfile: row.riskProfile, markets: parseMarkets(row.markets) };
}

export function jsonResponse(data, status, extraHeaders) {
  var headers = Object.assign({ "Content-Type": "application/json" }, extraHeaders || {});
  return new Response(JSON.stringify(data), { status: status || 200, headers: headers });
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
