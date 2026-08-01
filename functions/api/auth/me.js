import { getSessionUser, jsonResponse } from "../../_lib/auth.js";

var ALLOWED_MARKETS = ["spain", "uk", "germany", "france", "usa", "indices"];

export async function onRequestGet(context) {
  var user = await getSessionUser(context.request, context.env.DB);
  if (!user) return jsonResponse({ user: null }, 200);
  return jsonResponse({ user: user }, 200);
}

export async function onRequestPost(context) {
  // Permite actualizar el perfil de riesgo y/o los mercados guardados del usuario.
  var user = await getSessionUser(context.request, context.env.DB);
  if (!user) return jsonResponse({ error: "No has iniciado sesión." }, 401);

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse({ error: "Cuerpo inválido." }, 400);
  }

  if (body.riskProfile !== undefined) {
    var allowedProfiles = ["conservador", "moderado", "agresivo"];
    if (allowedProfiles.indexOf(body.riskProfile) === -1) {
      return jsonResponse({ error: "Perfil de riesgo inválido." }, 400);
    }
    await context.env.DB.prepare("UPDATE users SET risk_profile = ? WHERE id = ?").bind(body.riskProfile, user.id).run();
  }

  if (body.markets !== undefined) {
    if (!Array.isArray(body.markets) || !body.markets.length || !body.markets.every(function (m) { return ALLOWED_MARKETS.indexOf(m) !== -1; })) {
      return jsonResponse({ error: "Selección de mercados inválida." }, 400);
    }
    await context.env.DB.prepare("UPDATE users SET markets = ? WHERE id = ?").bind(JSON.stringify(body.markets), user.id).run();
  }

  return jsonResponse({ ok: true }, 200);
}
