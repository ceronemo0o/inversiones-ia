/*
 * auth.js
 * Cliente ligero para el sistema de cuentas (registro/login/logout) y para
 * pintar el estado de sesión en la barra de navegación. Habla con las
 * funciones serverless de Cloudflare Pages en /api/auth/*.
 */

var Auth = (function () {
  var cached; // undefined = no consultado, null = sin sesión, objeto = usuario

  async function me(force) {
    if (cached !== undefined && !force) return cached;
    try {
      var res = await fetch("/api/auth/me", { credentials: "include" });
      var data = await res.json();
      cached = data.user || null;
    } catch (e) {
      cached = null;
    }
    return cached;
  }

  async function register(email, password) {
    var res = await fetch("/api/auth/register", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo crear la cuenta.");
    cached = data.user;
    return data.user;
  }

  async function login(email, password) {
    var res = await fetch("/api/auth/login", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
    cached = data.user;
    return data.user;
  }

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch (e) {}
    cached = null;
  }

  async function setRiskProfile(riskProfile) {
    var res = await fetch("/api/auth/me", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskProfile: riskProfile })
    });
    if (!res.ok) { var d = await res.json(); throw new Error(d.error || "No se pudo guardar."); }
    if (cached) cached.riskProfile = riskProfile;
  }

  async function setMarkets(markets) {
    var res = await fetch("/api/auth/me", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markets: markets })
    });
    if (!res.ok) { var d = await res.json(); throw new Error(d.error || "No se pudo guardar."); }
    if (cached) cached.markets = markets;
  }

  return { me: me, register: register, login: login, logout: logout, setRiskProfile: setRiskProfile, setMarkets: setMarkets };
})();

/* ---------------- Estado de sesión en la barra de navegación ---------------- */
(function () {
  function prefix() {
    // Todas las páginas que incluyen este script están a un nivel de la raíz
    // (index.html) o dentro de una subcarpeta de primer nivel (practica/, invertir/...).
    var path = location.pathname;
    var depth = (path.match(/\//g) || []).length - 1;
    return depth > 0 ? "../" : "";
  }

  document.addEventListener("DOMContentLoaded", async function () {
    var navLinks = document.querySelector(".nav-links");
    if (!navLinks) return;

    var slot = document.createElement("span");
    slot.id = "authSlot";
    slot.style.display = "flex";
    slot.style.alignItems = "center";
    slot.style.gap = "8px";
    slot.style.fontSize = ".85rem";

    var themeBtn = document.getElementById("themeToggle");
    if (themeBtn) navLinks.insertBefore(slot, themeBtn); else navLinks.appendChild(slot);

    function render(user) {
      var base = prefix();
      if (user) {
        slot.innerHTML =
          '<a href="' + base + 'cuenta/index.html" style="color:var(--text-muted)">' + user.email + "</a>" +
          '<button class="btn btn-outline btn-sm" id="navLogoutBtn" type="button">Salir</button>';
        var btn = document.getElementById("navLogoutBtn");
        if (btn) btn.addEventListener("click", async function () { await Auth.logout(); location.reload(); });
      } else {
        slot.innerHTML = '<a class="btn btn-outline btn-sm" href="' + base + 'cuenta/index.html">Iniciar sesión</a>';
      }
    }

    render(await Auth.me());
  });
})();
