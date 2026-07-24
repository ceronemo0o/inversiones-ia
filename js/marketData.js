/*
 * marketData.js
 * Capa de datos de mercado. Fuente: Yahoo Finance (endpoint no oficial, usado
 * ampliamente en proyectos de este tipo), sin necesidad de clave ni registro.
 *
 * Diseño pensado para una web sin backend propio, que funciona igual tanto en
 * local como publicada (por ejemplo en Cloudflare Pages), probando en orden:
 *  1. Llamada directa desde el navegador (casi siempre fallará: Yahoo no
 *     envía cabeceras CORS).
 *  2. Proxy en el mismo origen, en la ruta /proxy — es la función serverless
 *     de functions/proxy.js cuando la web está publicada en Cloudflare Pages.
 *  3. Proxy local explícito (proxy/proxy.js, por defecto en localhost:8787),
 *     para cuando se navega la web en local con un servidor estático simple
 *     que no sirve la ruta /proxy.
 * Una vez que uno de los métodos funciona, se recuerda para el resto de la
 * sesión y se prueba directamente, sin repetir los pasos anteriores.
 *
 * Cachea resultados en memoria un tiempo corto para no repetir peticiones
 * idénticas en ráfagas cortas (por ejemplo, al cambiar rápido de valor).
 *
 * Migrar esto a una app nativa en el futuro solo exige sustituir fetch() por el
 * cliente HTTP que use la nueva plataforma; el resto de la lógica es reutilizable.
 */

var MarketData = (function () {
  var KEY_PROXY = "invia_market_proxy_url";
  var DEFAULT_LOCAL_PROXY = "http://localhost:8787";
  var BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";

  var quoteCache = {}; // symbol -> { data, ts }
  var seriesCache = {}; // key -> { data, ts }
  var QUOTE_TTL_MS = 15 * 1000;
  var SERIES_TTL_MS = 45 * 1000;
  var fetchMode = "direct"; // 'direct' | 'relative' | 'explicit'

  function getProxyBase() {
    return localStorage.getItem(KEY_PROXY) || DEFAULT_LOCAL_PROXY;
  }
  function setProxyBase(url) {
    localStorage.setItem(KEY_PROXY, (url || DEFAULT_LOCAL_PROXY).trim());
  }

  function buildUrl(symbol, interval, range) {
    return BASE_URL + encodeURIComponent(symbol) + "?interval=" + encodeURIComponent(interval) + "&range=" + encodeURIComponent(range);
  }

  async function rawFetch(url) {
    var res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var json = await res.json();
    if (json && json.chart && json.chart.error) {
      throw new Error(json.chart.error.description || "Error de la fuente de datos");
    }
    return json;
  }

  async function fetchWithFallback(url) {
    if (fetchMode === "direct") {
      try {
        return await rawFetch(url);
      } catch (e) {
        // Yahoo no admite CORS: se reintenta vía proxy antes de rendirnos.
      }
    }
    if (fetchMode === "direct" || fetchMode === "relative") {
      try {
        var relData = await rawFetch("/proxy?url=" + encodeURIComponent(url));
        fetchMode = "relative";
        return relData;
      } catch (e) {
        // Ni CORS directo ni /proxy en el mismo origen: probamos el proxy local explícito.
      }
    }
    var explicitData = await rawFetch(getProxyBase() + "/proxy?url=" + encodeURIComponent(url));
    fetchMode = "explicit";
    return explicitData;
  }

  function getFetchMode() {
    return fetchMode;
  }

  /** Convierte la respuesta de Yahoo en { quote, candles }. */
  function parseChartResponse(symbol, json) {
    var result = json && json.chart && json.chart.result && json.chart.result[0];
    if (!result || !result.meta) return null;
    var meta = result.meta;
    var timestamps = result.timestamp || [];
    var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
    if (!q) return null;

    var candles = [];
    for (var i = 0; i < timestamps.length; i++) {
      if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
      candles.push({
        time: new Date(timestamps[i] * 1000).toISOString(),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume[i] || 0
      });
    }

    var price = meta.regularMarketPrice;
    if (!isFinite(price)) return null;

    // El "previousClose" de meta cambia de significado según el rango pedido
    // (no siempre es "el cierre de ayer"), así que se calcula a partir de las
    // dos últimas velas diarias devueltas, que es fiable independientemente del rango.
    var prevClose = candles.length >= 2 ? candles[candles.length - 2].close : (meta.previousClose || meta.chartPreviousClose || price);
    var change = price - prevClose;
    var changePercent = prevClose ? (change / prevClose) * 100 : 0;
    var last = candles.length ? candles[candles.length - 1] : null;

    var quote = {
      symbol: symbol,
      name: meta.longName || meta.shortName || symbol,
      price: price,
      open: last ? last.open : price,
      high: meta.regularMarketDayHigh != null ? meta.regularMarketDayHigh : (last ? last.high : price),
      low: meta.regularMarketDayLow != null ? meta.regularMarketDayLow : (last ? last.low : price),
      previousClose: prevClose,
      change: change,
      changePercent: changePercent,
      volume: meta.regularMarketVolume != null ? meta.regularMarketVolume : (last ? last.volume : null),
      timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
      currency: meta.currency || "EUR"
    };

    return { quote: quote, candles: candles };
  }

  async function fetchSymbol(symbol, interval, range) {
    var url = buildUrl(symbol, interval, range);
    var json = await fetchWithFallback(url);
    var parsed = parseChartResponse(symbol, json);
    if (!parsed) throw new Error("Sin datos disponibles para " + symbol);
    return parsed;
  }

  /**
   * Obtiene cotizaciones para una lista de símbolos. Yahoo no ofrece un
   * endpoint de lote sin autenticación, así que se hace una petición por
   * símbolo, con una concurrencia moderada (probado sin problemas con las
   * 35 acciones del IBEX 35 a la vez). Si un símbolo falla puntualmente,
   * simplemente se omite y se reintenta en el siguiente ciclo de refresco.
   */
  async function getQuotes(symbols) {
    var now = Date.now();
    var toFetch = [];
    var result = {};

    symbols.forEach(function (s) {
      var cached = quoteCache[s];
      if (cached && now - cached.ts < QUOTE_TTL_MS) {
        result[s] = cached.data;
      } else {
        toFetch.push(s);
      }
    });
    if (!toFetch.length) return result;

    var CONCURRENCY = 8;
    for (var i = 0; i < toFetch.length; i += CONCURRENCY) {
      var slice = toFetch.slice(i, i + CONCURRENCY);
      var settled = await Promise.all(slice.map(function (sym) {
        return fetchSymbol(sym, "1d", "5d").then(
          function (parsed) { return { ok: true, sym: sym, parsed: parsed }; },
          function (err) { return { ok: false, sym: sym, err: err }; }
        );
      }));
      settled.forEach(function (r) {
        if (r.ok) {
          quoteCache[r.sym] = { data: r.parsed.quote, ts: now };
          result[r.sym] = r.parsed.quote;
        }
      });
    }
    return result;
  }

  /**
   * Serie temporal (velas) de un símbolo para el gráfico.
   * interval/range siguen la nomenclatura de Yahoo Finance, p. ej.:
   *   ("1d", "1y")   -> velas diarias del último año
   *   ("5m", "1d")   -> velas de 5 minutos del día actual
   *   ("60m", "3mo") -> velas de 1 hora de los últimos 3 meses
   */
  async function getTimeSeries(symbol, interval, range) {
    interval = interval || "1d";
    range = range || "6mo";
    var cacheKey = symbol + "|" + interval + "|" + range;
    var now = Date.now();
    var cached = seriesCache[cacheKey];
    if (cached && now - cached.ts < SERIES_TTL_MS) return cached.data;

    var parsed = await fetchSymbol(symbol, interval, range);
    seriesCache[cacheKey] = { data: parsed.candles, ts: now };
    quoteCache[symbol] = { data: parsed.quote, ts: now }; // aprovechamos la misma llamada para refrescar la cotización
    return parsed.candles;
  }

  return {
    getProxyBase: getProxyBase,
    setProxyBase: setProxyBase,
    getFetchMode: getFetchMode,
    getQuotes: getQuotes,
    getTimeSeries: getTimeSeries
  };
})();
