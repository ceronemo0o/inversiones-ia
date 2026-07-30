import { getSessionUser, jsonResponse } from "../_lib/auth.js";

var ALLOWED_KEYS = ["practica", "invertir", "trading", "auto"];

export async function onRequestGet(context) {
  var request = context.request, env = context.env;
  var user = await getSessionUser(request, env.DB);
  if (!user) return jsonResponse({ error: "No has iniciado sesión." }, 401);

  var url = new URL(request.url);
  var key = url.searchParams.get("key");
  if (ALLOWED_KEYS.indexOf(key) === -1) return jsonResponse({ error: "Cartera desconocida." }, 400);

  var row = await env.DB.prepare(
    "SELECT state_json as stateJson, updated_at as updatedAt FROM portfolios WHERE user_id = ? AND portfolio_key = ?"
  ).bind(user.id, key).first();

  if (!row) return jsonResponse({ state: null }, 200);
  return jsonResponse({ state: JSON.parse(row.stateJson), updatedAt: row.updatedAt }, 200);
}

export async function onRequestPost(context) {
  var request = context.request, env = context.env;
  var user = await getSessionUser(request, env.DB);
  if (!user) return jsonResponse({ error: "No has iniciado sesión." }, 401);

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Cuerpo inválido." }, 400);
  }

  var key = body.key;
  if (ALLOWED_KEYS.indexOf(key) === -1) return jsonResponse({ error: "Cartera desconocida." }, 400);
  if (!body.state || typeof body.state !== "object") return jsonResponse({ error: "Falta el estado de la cartera." }, 400);

  var now = Date.now();
  var stateJson = JSON.stringify(body.state);

  await env.DB.prepare(
    "INSERT INTO portfolios (user_id, portfolio_key, state_json, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(user_id, portfolio_key) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at"
  ).bind(user.id, key, stateJson, now).run();

  return jsonResponse({ ok: true, updatedAt: now }, 200);
}
