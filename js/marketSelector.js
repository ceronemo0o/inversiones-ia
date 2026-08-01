/*
 * marketSelector.js
 * Gestiona qué mercados están activos (España, Reino Unido, Alemania, Francia,
 * EEUU, fondos/índices) y expone el listado de constituentes de cada uno.
 * La preferencia se guarda en la cuenta si hay sesión iniciada, o si no en
 * localStorage, para que funcione igual estando logueado o no.
 */

var MarketSelector = (function () {
  var LOCAL_KEY = "invia_active_markets";
  var registryPromise = null;
  var constituentsCache = {}; // marketId -> promise<{ meta, market, exchangeSuffix, note, constituents }>

  function dataPath(file) {
    // Todas las páginas que usan este módulo están un nivel por debajo de la raíz
    // (practica/, invertir/, trading/...), igual que ya asume el resto de fetch a /data.
    var depth = (location.pathname.match(/\//g) || []).length - 1;
    return (depth > 0 ? "../" : "") + "data/" + file;
  }

  function loadRegistry() {
    if (!registryPromise) {
      registryPromise = fetch(dataPath("markets.json")).then(function (res) { return res.json(); }).then(function (data) { return data.markets; });
    }
    return registryPromise;
  }

  async function getActive() {
    var user = null;
    try { user = await Auth.me(); } catch (e) {}
    if (user && Array.isArray(user.markets) && user.markets.length) return user.markets;
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}
    return ["spain"];
  }

  async function setActive(markets) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(markets)); } catch (e) {}
    var user = null;
    try { user = await Auth.me(); } catch (e) {}
    if (user) { try { await Auth.setMarkets(markets); } catch (e) {} }
  }

  function loadMarketConstituents(marketId) {
    if (!constituentsCache[marketId]) {
      constituentsCache[marketId] = loadRegistry().then(function (registry) {
        var meta = registry.filter(function (m) { return m.id === marketId; })[0];
        if (!meta) return null;
        return fetch(dataPath(meta.file)).then(function (res) { return res.json(); }).then(function (data) {
          return { meta: meta, market: data.market, exchangeSuffix: data.exchangeSuffix, note: data.note, constituents: data.constituents };
        });
      });
    }
    return constituentsCache[marketId];
  }

  /**
   * Crea el botón + panel desplegable de selección de mercados dentro de
   * `container`. Llama a onChange(activeMarketIds) cuando el usuario cambia
   * (y guarda) la selección. Siempre queda al menos un mercado activo.
   */
  async function renderWidget(container, onChange) {
    var registry = await loadRegistry();
    var active = await getActive();

    var wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.display = "inline-block";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline btn-sm";
    btn.textContent = "🌍 Mercados";
    wrap.appendChild(btn);

    var panel = document.createElement("div");
    panel.style.cssText = "position:absolute; right:0; top:115%; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:12px; min-width:270px; box-shadow:0 8px 24px rgba(0,0,0,.18); z-index:50; display:none";

    registry.forEach(function (m) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex; align-items:center; gap:8px; padding:5px 0; font-size:.88rem; cursor:pointer";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = active.indexOf(m.id) !== -1;
      cb.dataset.marketId = m.id;
      cb.addEventListener("change", async function () {
        var checked = Array.prototype.slice.call(panel.querySelectorAll("input[type=checkbox]:checked")).map(function (i) { return i.dataset.marketId; });
        if (!checked.length) { cb.checked = true; return; } // siempre al menos un mercado activo
        active = checked;
        await setActive(active);
        if (onChange) onChange(active);
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(" " + m.flag + " " + m.label));
      panel.appendChild(row);
    });

    var note = document.createElement("p");
    note.style.cssText = "font-size:.72rem; color:var(--text-muted); margin:8px 0 0";
    note.textContent = "Puedes activar varios mercados a la vez. La selección se guarda en tu cuenta.";
    panel.appendChild(note);

    wrap.appendChild(panel);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });
    document.addEventListener("click", function () { panel.style.display = "none"; });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });

    container.appendChild(wrap);
  }

  return {
    loadRegistry: loadRegistry,
    getActive: getActive,
    setActive: setActive,
    loadMarketConstituents: loadMarketConstituents,
    renderWidget: renderWidget
  };
})();
