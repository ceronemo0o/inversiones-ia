/*
 * portfolioSync.js
 * Sincroniza una cartera de PortfolioFactory con la cuenta del usuario
 * (guardada en D1 vía /api/portfolio), cuando ha iniciado sesión. Si no hay
 * sesión, todo sigue funcionando igual que siempre con localStorage, sin
 * ningún cambio de comportamiento.
 */

var PortfolioSync = (function () {
  function hasLocalActivity(state) {
    return (state.history && state.history.length > 0) ||
      (state.positions && Object.keys(state.positions).length > 0) ||
      state.cash !== state.initialBalance;
  }

  async function load(key, portfolioInstance) {
    var user = await Auth.me();
    if (!user) return false;
    try {
      var res = await fetch("/api/portfolio?key=" + encodeURIComponent(key), { credentials: "include" });
      if (!res.ok) return false;
      var data = await res.json();
      if (data.state) {
        portfolioInstance.setState(data.state);
        return true;
      }
      // Todavía no hay nada guardado en la cuenta para esta cartera. Si el
      // navegador ya tenía operaciones (por ejemplo, hechas antes de
      // registrarse), las adoptamos ahora en la cuenta para no perderlas.
      var local = portfolioInstance.getState();
      if (hasLocalActivity(local)) {
        save(key, portfolioInstance);
      }
    } catch (e) {}
    return false;
  }

  function save(key, portfolioInstance) {
    return Auth.me().then(function (user) {
      if (!user) return false;
      return fetch("/api/portfolio", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key, state: portfolioInstance.getState() })
      }).then(function (res) { return res.ok; }).catch(function () { return false; });
    });
  }

  return { load: load, save: save };
})();
