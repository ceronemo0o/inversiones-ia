import { getSessionUser, jsonResponse } from "../_lib/auth.js";

var MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
var MAX_HISTORY_MESSAGES = 12;

function buildSystemPrompt(riskProfile, marketSnapshot) {
  var lines = [];
  lines.push("Eres el 'Asesor IA' de Inversiones IA, una plataforma EDUCATIVA (en español) para aprender a invertir y hacer trading, actualmente en fase de pruebas y sin usuarios reales ni dinero real.");
  lines.push("Todo el dinero de esta plataforma es virtual/de práctica. Nunca des a entender que gestionas dinero real ni que eres un asesor financiero autorizado por la CNMV.");
  lines.push("Tu función es ayudar a aprender: explica el razonamiento (fundamentales, técnico, macro, diversificación, riesgo) detrás de cualquier sugerencia, no des solo un veredicto.");
  lines.push("Cuando sugieras valores o una distribución de cartera, hazlo como EJEMPLO EDUCATIVO ilustrativo para practicar, nunca como recomendación personalizada garantizada, y recuerda brevemente que rentabilidades pasadas no garantizan resultados futuros.");
  lines.push("El perfil de riesgo declarado por este usuario es: " + (riskProfile || "moderado") + ".");
  if (marketSnapshot && marketSnapshot.length) {
    lines.push("Precios actuales (aproximados, con posible retraso) de algunos valores del IBEX 35, para que tus ejemplos sean coherentes con la realidad del mercado español:");
    marketSnapshot.slice(0, 20).forEach(function (q) {
      lines.push("- " + q.name + " (" + q.symbol + "): " + q.price + " € (" + (q.changePercent >= 0 ? "+" : "") + q.changePercent.toFixed(2) + "% hoy)");
    });
  }
  lines.push("Responde siempre en español, de forma clara y bien estructurada (usa listas cuando ayude), y con un tono cercano pero riguroso. Sé conciso: normalmente unos pocos párrafos o una lista corta, no un ensayo.");
  return lines.join("\n");
}

export async function onRequestPost(context) {
  var request = context.request, env = context.env;
  var body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Cuerpo de la petición inválido." }, 400);
  }

  var message = (body.message || "").trim();
  if (!message) return jsonResponse({ error: "Escribe un mensaje." }, 400);
  if (message.length > 2000) return jsonResponse({ error: "Mensaje demasiado largo." }, 400);

  var user = await getSessionUser(request, env.DB);
  var riskProfile = body.riskProfile || (user && user.riskProfile) || "moderado";
  var marketSnapshot = Array.isArray(body.marketSnapshot) ? body.marketSnapshot : [];

  var clientHistory = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_MESSAGES) : [];
  var messages = [{ role: "system", content: buildSystemPrompt(riskProfile, marketSnapshot) }]
    .concat(clientHistory.map(function (m) {
      return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) };
    }))
    .concat([{ role: "user", content: message }]);

  var aiResult;
  try {
    aiResult = await env.AI.run(MODEL, { messages: messages, max_tokens: 800 });
  } catch (e) {
    return jsonResponse({ error: "El asesor no está disponible ahora mismo. Inténtalo de nuevo en unos segundos." }, 502);
  }

  var reply = (aiResult && aiResult.response) ? aiResult.response.trim() : "";
  if (!reply) return jsonResponse({ error: "El asesor no ha podido generar una respuesta." }, 502);

  if (user) {
    var now = Date.now();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO advisor_messages (user_id, role, content, created_at) VALUES (?, 'user', ?, ?)").bind(user.id, message, now),
        env.DB.prepare("INSERT INTO advisor_messages (user_id, role, content, created_at) VALUES (?, 'assistant', ?, ?)").bind(user.id, reply, now + 1)
      ]);
    } catch (e) {
      // Si falla el guardado del historial, no bloqueamos la respuesta al usuario.
    }
  }

  return jsonResponse({ reply: reply }, 200);
}

export async function onRequestGet(context) {
  // Devuelve el historial guardado del usuario (si ha iniciado sesión).
  var user = await getSessionUser(context.request, context.env.DB);
  if (!user) return jsonResponse({ messages: [] }, 200);
  var rows = await context.env.DB.prepare(
    "SELECT role, content, created_at as createdAt FROM advisor_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 100"
  ).bind(user.id).all();
  return jsonResponse({ messages: rows.results || [] }, 200);
}
