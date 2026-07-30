import { getSessionUser, jsonResponse } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  var user = await getSessionUser(context.request, context.env.DB);
  if (!user) return jsonResponse({ user: null }, 200);
  return jsonResponse({ user: user }, 200);
}

export async function onRequestPost(context) {
  // Permite actualizar el perfil de riesgo guardado del usuario.
  var user = await getSessionUser(context.request, context.env.DB);
  if (!user) return jsonResponse({ error: "No has iniciado sesión." }, 401);

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse({ error: "Cuerpo inválido." }, 400);
  }
  var allowed = ["conservador", "moderado", "agresivo"];
  if (allowed.indexOf(body.riskProfile) === -1) {
    return jsonResponse({ error: "Perfil de riesgo inválido." }, 400);
  }
  await context.env.DB.prepare("UPDATE users SET risk_profile = ? WHERE id = ?").bind(body.riskProfile, user.id).run();
  return jsonResponse({ ok: true }, 200);
}
