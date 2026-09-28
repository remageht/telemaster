/**
 * ТЕЛЕМАСТЕР — конфигурация фронтенда для продакшена / дева.
 * Позволяет переопределять API_BASE без пересборки статики.
 */
window.__CONFIG__ = window.__CONFIG__ || {
  API_BASE: window.location.origin.includes(":8080")
    ? "http://localhost:8000"
    : (window.location.origin.startsWith("http") ? window.location.origin : "http://localhost:8000")
};
