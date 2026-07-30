import { parseCookies, clearSessionCookieHeader, jsonResponse } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  var request = context.request, env = context.env;
  var cookies = parseCookies(request);
  var token = cookies["invia_session"];
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookieHeader(request) });
}
