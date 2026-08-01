import { hashPassword, newId, createSession, sessionCookieHeader, jsonResponse, isValidEmail } from "../../_lib/auth.js";

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

  if (!isValidEmail(email)) return jsonResponse({ error: "Introduce un email válido." }, 400);
  if (password.length < 8) return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);

  var existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return jsonResponse({ error: "Ya existe una cuenta con ese email." }, 409);

  var derived = await hashPassword(password);
  var userId = newId();
  var now = Date.now();

  await env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, password_salt, risk_profile, created_at) VALUES (?, ?, ?, ?, 'moderado', ?)"
  ).bind(userId, email, derived.hash, derived.salt, now).run();

  var session = await createSession(env.DB, userId);

  return jsonResponse(
    { ok: true, user: { id: userId, email: email, riskProfile: "moderado", markets: ["spain"] } },
    201,
    { "Set-Cookie": sessionCookieHeader(request, session.token, session.maxAgeSeconds) }
  );
}
