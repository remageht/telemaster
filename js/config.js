/**
 * ТЕЛЕМАСТЕР — конфигурация фронтенда для продакшена / дева.
 * Позволяет переопределять API_BASE без пересборки статики.
 *
 * - локально (localhost/127.0.0.1) — отдельный API на :8000
 * - GitHub Pages — API нет, сразу работаем из localStorage
 * - любой другой хост (nginx + docker) — относительный /api (same-origin proxy)
 */
(function () {
  const host = window.location.hostname;
  const isPages = /\.github\.io$/i.test(host);
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const configured = window.__CONFIG__ && typeof window.__CONFIG__.API_BASE === "string";

  window.__CONFIG__ = window.__CONFIG__ || {
    API_BASE: isPages ? "" : (isLocal ? "http://localhost:8000" : ""),
    USE_API: !isPages,
  };
  if (configured && window.__CONFIG__.USE_API === undefined) {
    window.__CONFIG__.USE_API = window.__CONFIG__.API_BASE !== "";
  }
})();
