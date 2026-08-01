import { verifyPassword, createSession, sessionCookieHeader, jsonResponse, parseMarkets } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  var request = context.request, env = context.env;
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Cuerpo de la petición inválido." }, 400);
  }

  var email = (body.email || "").trim().toLowerCase();
  var password = body.password || "";

  var user = await env.DB.prepare(
    "SELECT id, email, password_hash, password_salt, risk_profile, markets FROM users WHERE email = ?"
  ).bind(email).first();

  if (!user) return jsonResponse({ error: "Email o contraseña incorrectos." }, 401);

  var ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return jsonResponse({ error: "Email o contraseña incorrectos." }, 401);

  var session = await createSession(env.DB, user.id);

  return jsonResponse(
    { ok: true, user: { id: user.id, email: user.email, riskProfile: user.risk_profile, markets: parseMarkets(user.markets) } },
    200,
    { "Set-Cookie": sessionCookieHeader(request, session.token, session.maxAgeSeconds) }
  );
}
