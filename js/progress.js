/*
 * progress.js
 * Progreso de cursos (localStorage) + theme toggle compartido por toda la web.
 * Se incluye como <script> clásico (no módulo) en todas las páginas.
 */

var Progress = (function () {
  var KEY = "invia_progress_v1";

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function markDone(nivel, leccionId, done) {
    var data = readAll();
    if (!data[nivel]) data[nivel] = {};
    data[nivel][leccionId] = done !== false;
    writeAll(data);
  }

  function isDone(nivel, leccionId) {
    var data = readAll();
    return !!(data[nivel] && data[nivel][leccionId]);
  }

  function levelStats(nivel, leccionIds) {
    var data = readAll();
    var done = 0;
    leccionIds.forEach(function (id) {
      if (data[nivel] && data[nivel][id]) done++;
    });
    return { done: done, total: leccionIds.length, pct: leccionIds.length ? Math.round((done / leccionIds.length) * 100) : 0 };
  }

  function resetAll() {
    localStorage.removeItem(KEY);
  }

  return { markDone: markDone, isDone: isDone, levelStats: levelStats, resetAll: resetAll };
})();

/* ---------------- Theme toggle ---------------- */
(function () {
  var THEME_KEY = "invia_theme";

  function apply(theme) {
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  var saved = localStorage.getItem(THEME_KEY);
  apply(saved);

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;

    function currentIsDark() {
      var attr = document.documentElement.getAttribute("data-theme");
      if (attr === "dark") return true;
      if (attr === "light") return false;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    btn.textContent = currentIsDark() ? "☀️" : "🌙";

    btn.addEventListener("click", function () {
      var next = currentIsDark() ? "light" : "dark";
      apply(next);
      localStorage.setItem(THEME_KEY, next);
      btn.textContent = next === "dark" ? "☀️" : "🌙";
    });
  });
})();

/* ---------------- Estado de una lección: indicador + marcado en el índice lateral ---------------- */
function initLessonProgressUI(nivel, leccionId) {
  document.addEventListener("DOMContentLoaded", function () {
    var pill = document.getElementById("lessonDoneState");

    function refreshToc() {
      document.querySelectorAll(".lesson-toc a[data-lid]").forEach(function (a) {
        var lid = a.getAttribute("data-lid");
        if (Progress.isDone(nivel, lid)) a.classList.add("done");
        else a.classList.remove("done");
      });
    }

    function refresh() {
      var done = Progress.isDone(nivel, leccionId);
      if (pill) {
        pill.textContent = done ? "✓ Lección completada" : "Lección no completada todavía";
        pill.style.color = done ? "var(--success)" : "var(--text-muted)";
      }
      refreshToc();
    }
    refresh();
    document.addEventListener("invia:lesson-done", refresh);
  });
}
