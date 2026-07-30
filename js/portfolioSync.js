/*
 * portfolioSync.js
 * Sincroniza una cartera de PortfolioFactory con la cuenta del usuario
 * (guardada en D1 vía /api/portfolio), cuando ha iniciado sesión. Si no hay
 * sesión, todo sigue funcionando igual que siempre con localStorage, sin
 * ningún cambio de comportamiento.
 */

var PortfolioSync = (function () {
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
    } catch (e) {}
    return false;
  }

  function save(key, portfolioInstance) {
    Auth.me().then(function (user) {
      if (!user) return;
      fetch("/api/portfolio", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key, state: portfolioInstance.getState() })
      }).catch(function () {});
    });
  }

  return { load: load, save: save };
})();
