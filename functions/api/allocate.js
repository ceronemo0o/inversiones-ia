/*
 * functions/api/allocate.js
 * Motor de "gestión automática (práctica)": calcula una distribución de
 * cartera sugerida entre valores del IBEX 35 según un perfil de riesgo,
 * usando un modelo transparente y explicable (no una caja negra) basado en:
 *   - momentum reciente (variación de los últimos días),
 *   - posición dentro del rango de 52 semanas,
 *   - volatilidad reciente (dispersión de los retornos diarios).
 * Todo el dinero que mueve la web con esto es virtual (ver Portfolio/js).
 */

import { jsonResponse } from "../_lib/auth.js";

var BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var PROFILES = {
  conservador: { numPicks: 10, cashBuffer: 0.30, wMomentum: 0.2, wTrend: 0.2, wLowVol: 0.6 },
  moderado: { numPicks: 7, cashBuffer: 0.12, wMomentum: 0.4, wTrend: 0.35, wLowVol: 0.25 },
  agresivo: { numPicks: 5, cashBuffer: 0.03, wMomentum: 0.55, wTrend: 0.35, wLowVol: 0.10 }
};

async function fetchYahoo(symbol) {
  var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=1d&range=1mo";
  var res = await fetch(url, { headers: { "User-Agent": BROWSER_USER_AGENT, "Accept": "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  var json = await res.json();
  var result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error("Sin datos");
  return result;
}

function computeMetrics(result) {
  var meta = result.meta;
  var q = result.indicators.quote[0];
  var closes = [];
  for (var i = 0; i < result.timestamp.length; i++) {
    if (q.close[i] != null) closes.push(q.close[i]);
  }
  if (closes.length < 2) return null;

  var price = meta.regularMarketPrice;
  var first = closes[0];
  var momentum = (price - first) / first; // variación aproximada del periodo

  var returns = [];
  for (var j = 1; j < closes.length; j++) returns.push((closes[j] - closes[j - 1]) / closes[j - 1]);
  var mean = returns.reduce(function (a, b) { return a + b; }, 0) / returns.length;
  var variance = returns.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / returns.length;
  var volatility = Math.sqrt(variance);

  var high52 = meta.fiftyTwoWeekHigh, low52 = meta.fiftyTwoWeekLow;
  var trendPosition = (high52 > low52) ? (price - low52) / (high52 - low52) : 0.5;

  return { price: price, momentum: momentum, volatility: volatility, trendPosition: trendPosition, changePercent: momentum * 100 };
}

function normalize(values) {
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  if (max === min) return values.map(function () { return 0.5; });
  return values.map(function (v) { return (v - min) / (max - min); });
}

export async function onRequestPost(context) {
  var request = context.request, env = context.env;
  var body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  var riskProfile = PROFILES[body.riskProfile] ? body.riskProfile : "moderado";
  var profile = PROFILES[riskProfile];

  var assetsRes = await env.ASSETS.fetch(new URL("/data/ibex35.json", request.url));
  var data = await assetsRes.json();
  var constituents = data.constituents;

  var settled = await Promise.all(constituents.map(function (c) {
    return fetchYahoo(c.symbol).then(
      function (result) { return { c: c, result: result }; },
      function (err) { return { c: c, error: err }; }
    );
  }));

  var scored = [];
  settled.forEach(function (item) {
    if (item.error) return;
    var metrics = computeMetrics(item.result);
    if (!metrics) return;
    scored.push(Object.assign({ symbol: item.c.symbol, name: item.c.name, sector: item.c.sector }, metrics));
  });

  if (!scored.length) return jsonResponse({ error: "No se han podido obtener datos de mercado ahora mismo." }, 502);

  var momNorm = normalize(scored.map(function (s) { return s.momentum; }));
  var trendNorm = normalize(scored.map(function (s) { return s.trendPosition; }));
  var volNorm = normalize(scored.map(function (s) { return s.volatility; }));

  scored.forEach(function (s, i) {
    var lowVolScore = 1 - volNorm[i];
    s.score = profile.wMomentum * momNorm[i] + profile.wTrend * trendNorm[i] + profile.wLowVol * lowVolScore;
  });

  scored.sort(function (a, b) { return b.score - a.score; });
  var picks = scored.slice(0, profile.numPicks);

  var totalScore = picks.reduce(function (a, p) { return a + Math.max(p.score, 0.01); }, 0);
  var investable = 1 - profile.cashBuffer;

  var allocations = picks.map(function (p) {
    var weight = (Math.max(p.score, 0.01) / totalScore) * investable;
    var reasonParts = [];
    reasonParts.push("momentum " + (p.changePercent >= 0 ? "+" : "") + p.changePercent.toFixed(1) + "% (último mes)");
    reasonParts.push("posición en su rango de 52 semanas: " + Math.round(p.trendPosition * 100) + "%");
    reasonParts.push("volatilidad diaria reciente: " + (p.volatility * 100).toFixed(2) + "%");
    return {
      symbol: p.symbol,
      name: p.name,
      sector: p.sector,
      price: p.price,
      weight: Math.round(weight * 1000) / 1000,
      reasoning: reasonParts.join(" · ")
    };
  });

  return jsonResponse({
    riskProfile: riskProfile,
    cashBufferPct: Math.round(profile.cashBuffer * 100),
    allocations: allocations,
    generatedAt: Date.now(),
    disclaimer: "Distribución generada por un modelo educativo simplificado (momentum, posición en rango de 52 semanas y volatilidad reciente), aplicada únicamente sobre la cartera de práctica con dinero virtual. No es asesoramiento financiero real."
  }, 200);
}
