/*
 * charts.js
 * Envoltorio simple sobre TradingView Lightweight Charts (cargado vía CDN)
 * para pintar velas de un valor en la zona de práctica.
 */

var Charts = (function () {
  function isDark() {
    var attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function themeOptions() {
    var dark = isDark();
    return {
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: dark ? "#96a5b3" : "#56636f"
      },
      grid: {
        vertLines: { color: dark ? "#2a3a48" : "#e1e6ec" },
        horzLines: { color: dark ? "#2a3a48" : "#e1e6ec" }
      },
      rightPriceScale: { borderColor: dark ? "#2a3a48" : "#e1e6ec" },
      timeScale: { borderColor: dark ? "#2a3a48" : "#e1e6ec" }
    };
  }

  function create(containerId) {
    var el = document.getElementById(containerId);
    if (!el || typeof LightweightCharts === "undefined") return null;

    var chart = LightweightCharts.createChart(el, Object.assign({
      width: el.clientWidth,
      height: el.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false }
    }, themeOptions()));

    var series = chart.addCandlestickSeries({
      upColor: "#1c7c3f",
      downColor: "#b3261e",
      borderVisible: false,
      wickUpColor: "#1c7c3f",
      wickDownColor: "#b3261e"
    });

    function resize() {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    }
    window.addEventListener("resize", resize);

    var mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    function refreshTheme() {
      chart.applyOptions(themeOptions());
    }
    if (mql && mql.addEventListener) mql.addEventListener("change", refreshTheme);
    var themeBtn = document.getElementById("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", function () { setTimeout(refreshTheme, 0); });

    return {
      setData: function (candles) {
        // Se usa un timestamp UTC en segundos (no solo la fecha) para que las
        // velas intradía (1min/5min/15min/1h) se distribuyan correctamente;
        // funciona igual de bien para velas diarias.
        series.setData(candles.map(function (c) {
          return { time: Math.floor(new Date(c.time).getTime() / 1000), open: c.open, high: c.high, low: c.low, close: c.close };
        }));
        chart.timeScale().fitContent();
      },
      destroy: function () {
        window.removeEventListener("resize", resize);
        chart.remove();
      }
    };
  }

  /**
   * Gráfico de área simple para la evolución acumulada del valor de una
   * cartera día a día (no velas). Verde si el valor ha subido desde el
   * primer punto, rojo si ha bajado, igual que el resto de indicadores
   * de P&L de la web.
   */
  function createEquityCurve(containerId) {
    var el = document.getElementById(containerId);
    if (!el || typeof LightweightCharts === "undefined") return null;

    var chart = LightweightCharts.createChart(el, Object.assign({
      width: el.clientWidth,
      height: el.clientHeight,
      timeScale: { timeVisible: false, secondsVisible: false }
    }, themeOptions()));

    var series = chart.addAreaSeries({ lineWidth: 2 });

    function resize() {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    }
    window.addEventListener("resize", resize);

    var mql = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    function refreshTheme() {
      chart.applyOptions(themeOptions());
    }
    if (mql && mql.addEventListener) mql.addEventListener("change", refreshTheme);
    var themeBtn = document.getElementById("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", function () { setTimeout(refreshTheme, 0); });

    return {
      setData: function (points) {
        if (!points || points.length < 2) return;
        var up = points[points.length - 1].value >= points[0].value;
        var color = up ? "#1c7c3f" : "#b3261e";
        series.applyOptions({
          lineColor: color,
          topColor: up ? "rgba(28,124,63,.25)" : "rgba(179,38,30,.25)",
          bottomColor: up ? "rgba(28,124,63,.02)" : "rgba(179,38,30,.02)"
        });
        series.setData(points.map(function (p) { return { time: p.date, value: p.value }; }));
        chart.timeScale().fitContent();
      },
      destroy: function () {
        window.removeEventListener("resize", resize);
        chart.remove();
      }
    };
  }

  return { create: create, createEquityCurve: createEquityCurve };
})();
