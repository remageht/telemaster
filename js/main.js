/* ============================================================
   ТЕЛЕМАСТЕР — интерактив магазина
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Шапка и полоса прогресса при скролле ---------- */
  const header = document.getElementById("header");
  const progressBar = document.getElementById("scrollProgress");

  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 10);
    if (progressBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Прелоадер «впаиваем чип» ---------- */
  const boot = document.getElementById("boot");
  const bootSvg = document.getElementById("bootScheme");
  const hideBoot = () => {
    if (!boot || boot.classList.contains("is-done")) return;
    if (window.__bootField) window.__bootField.setAwake(false);
    boot.classList.add("is-done");
    // отклик главной: витрина «включается» вместе с сайтом
    document.body.classList.add("is-live");
    boot.addEventListener("transitionend", () => boot.remove(), { once: true });
    setTimeout(() => boot.remove(), 900); // страховка, если transition не долетел
  };
  // финал сцены зовёт сам SMIL (событие onend) — отдаём наружу для инлайна
  window.__bootDone = hideBoot;
  // рестарт SMIL-часов в момент показа: сцена всегда начинается с паяльника,
  // а не с середины (часы могли стартовать раньше первой отрисовки)
  try {
    if (bootSvg && bootSvg.setCurrentTime) {
      bootSvg.setCurrentTime(0);
      if (bootSvg.unpauseAnimations) bootSvg.unpauseAnimations();
    }
  } catch { /* ignore */ }
  // показ минимум ~3с (пайка идёт 3с), прячем по load;
  // клик — пропуск, абсолютный таймер — страховка
  const bootMin = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 300 : 3200;
  let bootLoaded = false, bootMinDone = false;
  const tryHideBoot = () => { if (bootLoaded && bootMinDone) hideBoot(); };
  window.addEventListener("load", () => { bootLoaded = true; tryHideBoot(); });
  setTimeout(() => { bootMinDone = true; tryHideBoot(); }, bootMin);
  setTimeout(hideBoot, 7000);
  if (boot) boot.addEventListener("pointerdown", hideBoot);

  /* ---------- PWA: установка как приложение + офлайн ---------- */
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", () => {
      // updateViaCache:"none" — sw.js и оболочка всегда мимо HTTP-кэша
      navigator.serviceWorker
        .register("sw.js", { updateViaCache: "none" })
        .catch(() => {});
    });
    // новый SW взял управление — один раз за сессию перезагружаемся за
    // свежей оболочкой. Без флага контроллер-чейндж зацикливал перезагрузку
    if (!sessionStorage.getItem("tm-sw-claimed")) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        sessionStorage.setItem("tm-sw-claimed", "1");
        window.location.reload();
      });
    }
  }

  /* Чистим кэш-бастер обновления из URL (чтобы ссылки оставались чистыми) */
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("fresh")) {
      u.searchParams.delete("fresh");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  } catch { /* ignore */ }

  /* ---------- Проверка обновлений: кеш больше не прячет новинки ---------- */
  // версию running-кода читаем из DOM, а не из константы: рассинхрон
  // константы и тега давал вечный тост «обновись» — больше невозможно
  const assetVersions = (root) => {
    const out = {};
    root.querySelectorAll('script[src*="?v="], link[rel="stylesheet"][href*="?v="]').forEach((el) => {
      const url = el.src || el.href;
      const m = url.match(/\/([^\/?#]+)\?v=(\d+)/);
      if (m) out[m[1]] = parseInt(m[2], 10);
    });
    return out;
  };
  let lastUpdateCheck = 0;
  const showUpdateToast = () => {
    if (document.getElementById("updateToast")) return;
    const box = ensureToastBox();
    const el = document.createElement("div");
    el.className = "toast toast--update";
    el.id = "updateToast";
    el.innerHTML = `<span>Вышла новая версия сайта</span>
      <button type="button" class="btn btn--primary btn--sm" id="updateBtn">Обновить</button>`;
    box.appendChild(el);
    document.getElementById("updateBtn").addEventListener("click", async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* ignore */ }
      // кэш-бастер гарантирует свежие байты (голый reload может отдать
      // закэшированный index.html — отсюда и вечный тост), потом URL чистим
      const u = new URL(location.href);
      u.searchParams.set("fresh", Date.now().toString(36));
      location.replace(u.toString());
    });
  };
  const checkUpdate = async () => {
    const now = Date.now();
    if (now - lastUpdateCheck < 60000) return;
    lastUpdateCheck = now;
    try {
      const res = await fetch("index.html", { cache: "no-store" });
      if (!res.ok) return;
      const html = await res.text();
      const cur = assetVersions(document);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const fresh = assetVersions(doc);
      const stale = Object.keys(fresh).some((name) => cur[name] != null && fresh[name] > cur[name]);
      if (stale) showUpdateToast();
    } catch { /* офлайн или file:// — молчим */ }
  };
  window.addEventListener("load", () => setTimeout(checkUpdate, 4000));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });

  /* ---------- Бейдж сборки в подвале: видно, какая версия реально запущена ---------- */
  try {
    const badge = document.getElementById("footerBuild");
    if (badge) {
      const cur = assetVersions(document);
      const parts = Object.keys(cur).sort().map((n) => `${n.replace(/\.(js|css)$/, "")} v${cur[n]}`);
      badge.textContent = parts.length ? "сборка " + parts.join(" · ") : "";
    }
  } catch { /* ignore */ }

  /* ---------- Темы: светлая ↔ Dala (Dala — тёмная тема) ---------- */
  const THEMES = ["light", "dala"];
  const THEME_NAMES = { light: "светлая", dala: "Dala" };
  const themeBtn = document.getElementById("themeBtn");
  const applyThemeLabel = () => {
    if (themeBtn) themeBtn.setAttribute("aria-label", `Тема: ${THEME_NAMES[document.documentElement.dataset.theme] || "светлая"}. Переключить`);
  };
  const chipPaths = `%3Crect x='20' y='20' width='24' height='24' rx='4' fill='none' stroke='%STROKE%' stroke-width='4'/%3E%3Cpath d='M26 20v-8M38 20v-8M26 44v8M38 44v8M20 26h-8M20 38h-8M44 26h8M44 38h8' stroke='%STROKE%' stroke-width='4' stroke-linecap='round'/%3E`;
  const faviconFor = (bg, stroke) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='${bg}'/%3E${chipPaths.replaceAll("%STROKE%", stroke)}%3C/svg%3E`;
  const FAVICONS = {
    light: faviconFor("%23c8102e", "%23fff"),
    dala: faviconFor("%23000", "%238052ff"),
  };
  const THEME_COLORS = { light: "#c8102e", dala: "#000000" };
  const applyThemeIcon = () => {
    const t = document.documentElement.dataset.theme;
    const link = document.querySelector('link[rel="icon"]');
    if (link && FAVICONS[t]) link.href = FAVICONS[t];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && THEME_COLORS[t]) meta.content = THEME_COLORS[t];
  };
  const initTheme = () => {
    let t = null;
    try { t = localStorage.getItem("tm-theme"); } catch { t = null; }
    if (t === "dark") t = "dala"; // средняя тёмная слита с Dala
    if (!THEMES.includes(t)) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dala" : "light";
    document.documentElement.dataset.theme = t;
    applyThemeLabel();
    applyThemeIcon();
  };
  initTheme();
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const cur = THEMES.indexOf(document.documentElement.dataset.theme);
      const next = THEMES[(cur + 1) % THEMES.length];
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("tm-theme", next); } catch { /* ignore */ }
      applyThemeLabel();
      applyThemeIcon();
      themeBtn.classList.remove("is-spin");
      void themeBtn.offsetWidth;
      themeBtn.classList.add("is-spin");
      showToast(`Тема: ${THEME_NAMES[next]}`);
    });
  }

  /* ---------- Мобильное меню ---------- */
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");

  const closeMenu = () => {
    burger.classList.remove("is-open");
    nav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    burger.setAttribute("aria-expanded", "false");
  };

  burger.addEventListener("click", () => {
    const opened = !nav.classList.contains("is-open");
    burger.classList.toggle("is-open", opened);
    nav.classList.toggle("is-open", opened);
    document.body.classList.toggle("menu-open", opened);
    burger.setAttribute("aria-expanded", String(opened));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) closeMenu();
  });

  /* ---------- Поиск: переход на страницу результатов ---------- */
  const searchForm = document.getElementById("searchForm");
  const searchInput = searchForm ? searchForm.querySelector("input") : null;
  const goSearch = (q) => {
    const query = (q || "").trim();
    if (!query) return;
    location.hash = "#/search/" + encodeURIComponent(query);
  };
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      goSearch(searchInput.value);
    });
  }
  const searchFormMobile = document.getElementById("searchFormMobile");
  if (searchFormMobile) {
    searchFormMobile.addEventListener("submit", (e) => {
      e.preventDefault();
      goSearch(searchFormMobile.querySelector("input").value);
    });
  }

  /* ---------- Плавающая связь + живой статус «открыто» ---------- */
  const openStatus = () => {
    const d = new Date(), day = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
    if (day >= 1 && day <= 5 && h >= 9 && h < 19) return { open: true, text: "Сейчас открыто · до 19:00" };
    if (day === 6 && h >= 10 && h < 15) return { open: true, text: "Сейчас открыто · до 15:00" };
    if (day === 6 && h >= 15) return { open: false, text: "Откроемся в понедельник в 9:00" };
    if (day === 0) return { open: false, text: "Откроемся в понедельник в 9:00" };
    if (day === 5 && h >= 19) return { open: false, text: "Откроемся в понедельник в 9:00" };
    if (h < 9) return { open: false, text: `Откроемся сегодня в ${day === 6 ? "10" : "9"}:00` };
    return { open: false, text: "Откроемся завтра в 9:00" };
  };
  // рубильник дублирует клик по лампе (движок сам переключит свет)
  const lampSwitch = document.getElementById("lampSwitch");
  if (lampSwitch) {
    lampSwitch.addEventListener("click", () => {
      const cv = document.getElementById("bulbCanvas");
      if (cv) cv.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
  }
  const fab = document.getElementById("contactFab");
  const fabBtn = document.getElementById("contactFabBtn");
  const fabPanel = document.getElementById("contactFabPanel");
  if (fab && fabBtn && fabPanel) {
    const st = openStatus();
    const dot = document.getElementById("contactDot");
    const txt = document.getElementById("contactStatus");
    if (dot && txt) {
      txt.textContent = st.text;
      txt.parentElement.classList.toggle("is-closed", !st.open);
    }
    fabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fabPanel.hidden = !fabPanel.hidden;
      fabBtn.setAttribute("aria-expanded", String(!fabPanel.hidden));
    });
    document.addEventListener("pointerdown", (e) => {
      if (!fabPanel.hidden && !fab.contains(e.target)) {
        fabPanel.hidden = true;
        fabBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Корзина ---------- */
  const cartCount = document.getElementById("cartCount");
  const cartBtn = document.getElementById("cartBtn");
  const USE_API = true;
  const API_BASE = "http://localhost:8000";
  // Этап 1: админ-чтение пытается взять данные с API, при 401/ошибке — fallback localStorage (JWT появится в Этапе 2)
  const apiGet = async (path) => {
    try {
      const token = (() => { try { return JSON.parse(sessionStorage.getItem("tm-admin"))?.token || sessionStorage.getItem("tm-jwt") || ""; } catch { return sessionStorage.getItem("tm-jwt") || ""; } })();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}${path}`, { headers });
      if (!res.ok) throw new Error("api");
      return await res.json();
    } catch { return null; }
  };
  const RL_WINDOW = 15 * 60 * 1000, RL_MAX = 5;
  const hitRateLimit = (key) => {
    try {
      const k = "tm-rl:" + key;
      const now = Date.now();
      let arr = JSON.parse(localStorage.getItem(k) || "[]");
      arr = arr.filter((t) => now - t < RL_WINDOW);
      if (arr.length >= RL_MAX) return false;
      arr.push(now);
      localStorage.setItem(k, JSON.stringify(arr));
      return true;
    } catch { return true; }
  };
  const CART_KEY = "tm-cart";

  const cartStore = {
    read() {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
    },
    write(cart) {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      updateCartBadge();
    },
    add(id, qty = 1) {
      const p = findProduct(id);
      if (!p) return;
      const cart = this.read();
      const max = Number.isFinite(p.stock) ? p.stock : 999999;
      cart[id] = Math.min((cart[id] || 0) + qty, max);
      if (cart[id] <= 0) delete cart[id];
      this.write(cart);
      if (cart[id] === max && qty > 0) showToast(`Достигнут лимит: ${max} шт`);
    },
    setQty(id, qty) {
      const p = findProduct(id);
      const max = p && Number.isFinite(p.stock) ? p.stock : 999999;
      const cart = this.read();
      if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, max);
      this.write(cart);
    },
    remove(id) { this.setQty(id, 0); },
    clear() { this.write({}); },
    count() { return Object.values(this.read()).reduce((sum, n) => sum + n, 0); },
  };

  /* ---------- Избранное ---------- */
  const FAV_KEY = "tm-fav";
  const favStore = {
    read() {
      try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
    },
    write(list) { localStorage.setItem(FAV_KEY, JSON.stringify(list)); },
    has(id) { return this.read().includes(id); },
    toggle(id) {
      const list = this.read();
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      this.write(list);
      return i < 0;
    },
  };
  const HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4 15.4 4 9.6C4 7 6 5 8.5 5c1.6 0 2.9.9 3.5 2 .6-1.1 1.9-2 3.5-2C18 5 20 7 20 9.6c0 5.8-8 10.9-8 10.9z"/></svg>';

  const HIT_IDS = ["stm32f103", "esp32", "mf50set", "ker300", "ds18b20", "rel4ch", "bb830", "dupont"];

  // сердечки и бейджи «ХИТ» на статичных карточках главной: id из кнопки data-add
  document.querySelectorAll("#hits .product").forEach((card) => {
    const addBtn = card.querySelector("[data-add]");
    if (!addBtn) return;
    if (!card.querySelector("[data-fav]")) {
      const fav = document.createElement("button");
      fav.className = "fav-btn" + (favStore.has(addBtn.dataset.add) ? " is-active" : "");
      fav.type = "button";
      fav.dataset.fav = addBtn.dataset.add;
      fav.setAttribute("aria-label", "В избранное");
      fav.title = "В избранное";
      fav.innerHTML = HEART_SVG;
      card.appendChild(fav);
    }
    if (!card.querySelector(".product__hit")) {
      const hit = document.createElement("span");
      hit.className = "product__hit";
      hit.textContent = "ХИТ";
      card.appendChild(hit);
    }
  });

  const updateCartBadge = () => {
    const n = cartStore.count();
    cartCount.hidden = n === 0;
    cartCount.textContent = n;
  };

  const popCartCounter = () => {
    cartCount.classList.remove("is-pop");
    void cartCount.offsetWidth; // сброс анимации
    cartCount.classList.add("is-pop");
  };

  // кружок «летит» от кнопки «В корзину» к корзине в шапке
  const flyToCart = (fromBtn) => {
    if (!cartBtn) return;
    const from = fromBtn.getBoundingClientRect();
    const to = cartBtn.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "fly-dot";
    dot.style.left = `${from.left + from.width / 2 - 7}px`;
    dot.style.top = `${from.top + from.height / 2 - 7}px`;
    document.body.appendChild(dot);
    requestAnimationFrame(() => {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      dot.style.transform = `translate(${dx}px, ${dy}px) scale(0.25)`;
      dot.style.opacity = "0.35";
    });
    dot.addEventListener(
      "transitionend",
      () => {
        dot.remove();
        // корзина «качнётся» от прилёта
        cartBtn.classList.remove("is-bump");
        void cartBtn.offsetWidth;
        cartBtn.classList.add("is-bump");
      },
      { once: true }
    );
    setTimeout(() => dot.remove(), 900); // страховка, если переход не долетел
  };

  const cartFeedback = (btn) => {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = "Добавлено ✓";
    btn.classList.add("is-added");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.textContent = btn.dataset.label;
      btn.classList.remove("is-added");
    }, 1200);
  };

  /* ---------- Появление блоков при скролле ---------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
          // страховка: даже если transition «замер» в среде, фиксируем конечное состояние
          setTimeout(() => {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "none";
          }, 900);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  // класс js — только если скрипт дожил до наблюдателя: без него контент
  // всегда видим (иначе упавший скрипт = пустая страница)
  document.documentElement.classList.add("js");
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  /* ---------- Анимация счётчиков ---------- */
  const formatNumber = (num) => num.toLocaleString("ru-RU");

  const animateCounter = (el) => {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || "";
    const decimals = parseInt(el.dataset.decimal || "0", 10);
    const duration = 2100;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo: быстрый старт и долгое шёлковое затухание
      const eased = progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      if (decimals) {
        // дробные значения (например, рейтинг 4,9) — через запятую по-русски
        el.textContent = ((target * eased) / 10).toFixed(decimals).replace(".", ",") + suffix;
      } else {
        el.textContent = formatNumber(Math.round(target * eased)) + suffix;
      }
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.delay || "0", 10);
          setTimeout(() => animateCounter(entry.target), delay);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 }
  );
  // каскадный старт: цифры догоняют друг друга
  document.querySelectorAll(".stat-num").forEach((el, i) => {
    el.dataset.delay = (i % 4) * 140;
    counterObserver.observe(el);
  });

  /* ---------- Форма прайс-листа ---------- */
  const form = document.getElementById("leadForm");
  const success = document.getElementById("formSuccess");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!hitRateLimit("lead")) { showToast("Слишком много заявок — попробуйте через 15 минут"); return; }

    const name = form.elements.name;
    const phone = form.elements.phone;
    let valid = true;

    const nameOk = /^[A-Za-zА-Яа-яЁё \-]{2,40}$/.test(name.value.trim());
    const phoneOk = phone.value.trim().length >= 7 && phone.value.trim().length <= 32;
    if (!nameOk) { name.classList.add("is-error"); valid = false; } else name.classList.remove("is-error");
    if (!phoneOk) { phone.classList.add("is-error"); valid = false; } else phone.classList.remove("is-error");
    const ch = form.elements.contact.value;
    if (ch && !["Telegram","Звонок","WhatsApp","E-mail",""].includes(ch)) valid = false;

    if (!valid) return;

    // hybrid: пробуем API, при ошибке — localStorage
    const leadPayload = {
      name: name.value.trim(),
      contact: phone.value.trim(),
      channel: form.elements.contact.value || "Не указано",
    };
    const saveLocal = () => {
      const leads = getLeadsRaw();
      leads.unshift({
        id: Date.now(),
        name: leadPayload.name,
        contact: leadPayload.contact,
        channel: leadPayload.channel,
        date: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        done: false,
      });
      saveLeads(leads);
    };
    if (USE_API) {
      fetch(`${API_BASE}/api/leads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leadPayload) })
        .then((r) => { if (!r.ok) throw new Error("api"); return r.json(); })
        .then(() => { /* ok — админка подтянет с API, локально не дублируем */ })
        .catch(() => saveLocal());
    } else {
      saveLocal();
    }
    const lastLead = leads[0];
    const clean = (s) => String(s == null ? "" : s).replace(/[<>&]/g, "");
    sendTelegramInsecureDemo(`Новая заявка\nИмя: ${clean(lastLead.name)}\nКонтакт: ${clean(lastLead.contact)}\nКанал: ${clean(lastLead.channel)}`);

    success.hidden = false;
    form.reset();
    setTimeout(() => {
      success.hidden = true;
    }, 6000);
  });

  form.querySelectorAll("input").forEach((field) => {
    field.addEventListener("input", () => field.classList.remove("is-error"));
  });

  /* ---------- Ripple при нажатии на кнопки ---------- */
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .add-to-cart, .auth__tab");
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  });

  /* ---------- Параллакс + 3D-наклон витрины на hero ---------- */
  const heroVisual = document.querySelector(".hero__visual");
  const showcase = heroVisual ? heroVisual.querySelector(".showcase") : null;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (heroVisual && showcase && !prefersReduced) {
    // скролл двигает ТОЛЬКО декоративный слой: инлайн-трансформ на heroVisual
    // ломал reveal-анимацию (дёргание при загрузке), сюда его больше не пишем
    const shapes = heroVisual.querySelector(".hero__shapes");
    window.addEventListener(
      "scroll",
      () => {
        if (!shapes) return;
        const y = Math.min(window.scrollY, 900);
        shapes.style.transform = `translateY(${(y * 0.04).toFixed(1)}px)`;
      },
      { passive: true }
    );
    if (finePointer) {
      heroVisual.addEventListener("pointermove", (e) => {
        const r = heroVisual.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        showcase.style.transform = `rotateX(${(-ny * 10).toFixed(2)}deg) rotateY(${(nx * 12).toFixed(2)}deg)`;
        // параллакс-слои: каждый едет со своей глубиной через CSS-переменные
        heroVisual.style.setProperty("--px", nx.toFixed(3));
        heroVisual.style.setProperty("--py", ny.toFixed(3));
      });
      heroVisual.addEventListener("pointerleave", () => {
        showcase.style.transform = "rotateX(0deg) rotateY(0deg)";
        heroVisual.style.setProperty("--px", 0);
        heroVisual.style.setProperty("--py", 0);
      });
    }
  }

  /* ---------- Магнитные кнопки: тянутся за курсором ---------- */
  if (finePointer && !prefersReduced) {
    let magnetEl = null;
    document.addEventListener(
      "pointermove",
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".btn--primary") : null;
        if (magnetEl && magnetEl !== btn) {
          magnetEl.style.transform = "";
          magnetEl = null;
        }
        if (btn) {
          const r = btn.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
          const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
          btn.style.transform = `translate(${(dx * 6).toFixed(1)}px, ${(dy * 5).toFixed(1)}px)`;
          magnetEl = btn;
        }
      },
      { passive: true }
    );

    /* ---------- 3D-tilt карточек каталога и хитов ---------- */
    let tiltEl = null;
    document.addEventListener(
      "pointermove",
      (e) => {
        const card = e.target && e.target.closest
          ? e.target.closest("#catalogGrid .product, #catalogGrid .trow, #hits .product")
          : null;
        if (tiltEl && tiltEl !== card) {
          tiltEl.style.transform = "";
          tiltEl = null;
        }
        if (card) {
          const r = card.getBoundingClientRect();
          const rx = ((e.clientY - r.top) / r.height - 0.5) * -7;
          const ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
          card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
          tiltEl = card;
        }
      },
      { passive: true }
    );
  }

  /* ============================================================
     ЛИЧНЫЙ КАБИНЕТ: МОДАЛКА ВХОДА
     ============================================================ */
  const loginBtn = document.getElementById("loginBtn");
  const authModal = document.getElementById("authModal");
  const authForm = document.getElementById("authForm");
  const authTabs = document.getElementById("authTabs");
  const authNameField = document.getElementById("authNameField");
  const authSubmit = document.getElementById("authSubmit");
  const authSubmitLabel = document.getElementById("authSubmitLabel");
  /* Аккаунты живут в браузере (демо без сервера):
     tm-users — {цифрыТелефона: {name, phone, pass, salt, created}},
     tm-session — телефон текущего входа. Пароли храним только хешем. */
  const USERS_KEY = "tm-users";
  const SESSION_KEY = "tm-session";
  const LEGACY_NAME_KEY = "tm-user";
  const LEGACY_PHONE_KEY = "tm-user-phone";

  const normPhone = (s) => String(s || "").replace(/\D/g, "");

  const getUsers = () => {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch { return {}; }
  };
  const saveUsers = (u) => localStorage.setItem(USERS_KEY, JSON.stringify(u));

  // переезд со старого формата, где хранилось просто имя
  const migrateLegacy = () => {
    let legacy = null;
    try { legacy = localStorage.getItem(LEGACY_NAME_KEY); } catch { legacy = null; }
    if (!legacy) return;
    try {
      if (localStorage.getItem(SESSION_KEY)) return;
      const users = getUsers();
      const phone = localStorage.getItem(LEGACY_PHONE_KEY) || "";
      const key = normPhone(phone) || "guest";
      if (!users[key]) users[key] = { name: legacy, phone, pass: "", salt: "", created: Date.now() };
      saveUsers(users);
      localStorage.setItem(SESSION_KEY, key);
      localStorage.removeItem(LEGACY_NAME_KEY);
      localStorage.removeItem(LEGACY_PHONE_KEY);
    } catch { /* ignore */ }
  };
  migrateLegacy();

  const sessionKey = () => {
    try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
  };
  const currentUser = () => getUsers()[sessionKey()] || null;
  const userName = () => (currentUser() || {}).name || "";
  const userPhone = () => (currentUser() || {}).phone || "";

  const hashPass = async (salt, password) => {
    const data = salt + "::" + password;
    // SubtleCrypto обязателен; если недоступен — демо-вход недоступен (не маскируем слабым хешем)
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const makeSalt = () => {
    const buf = crypto.getRandomValues(new Uint8Array(16));
    return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const refreshLoginBtn = () => {
    const label = loginBtn.querySelector(".login-btn__label");
    const name = userName();
    label.textContent = name ? name.split(" ")[0] : "Войти";
  };
  refreshLoginBtn();

  const openModal = () => {
    authModal.hidden = false;
    authForm.hidden = false;
    // сбрасываем состояние после прошлого входа: форма видна, спиннер снят
    authSubmit.classList.remove("is-loading");
    if (authErr) authErr.hidden = true;
    smsSent = false;
    syncAuthMode();
    document.body.classList.add("modal-open");
  };

  const closeModal = () => {
    authModal.classList.add("is-closing");
    setTimeout(() => {
      authModal.classList.remove("is-closing");
      authModal.hidden = true;
      document.body.classList.remove("modal-open");
    }, 240);
  };

  loginBtn.addEventListener("click", () => {
    // уже входили — сразу в кабинет, иначе показываем форму
    userName() ? (location.hash = "#/cabinet") : openModal();
  });

  authModal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  // SMS-коды живут только в памяти вкладки (как и положено одноразовым)
  let smsSent = false;
  const smsData = {};
  const smsBtn = document.getElementById("smsBtn");
  const smsDemo = document.getElementById("smsDemo");
  const smsCodeEl = document.getElementById("smsCode");
  const authPassField = document.getElementById("authPassField");
  const authCodeField = document.getElementById("authCodeField");

  const syncAuthMode = () => {
    // страховка от старой разметки без новых полей
    if (!authPassField || !authCodeField || !smsBtn) return;
    const mode = authTabs.dataset.active;
    const isSignup = mode === "signup";
    const isCode = mode === "code";
    authNameField.hidden = !isSignup;
    authPassField.hidden = isCode;
    authCodeField.hidden = !isCode || !smsSent;
    smsBtn.hidden = !isCode;
    smsBtn.textContent = smsSent ? "Отправить код снова" : "Получить код";
    if (smsDemo) smsDemo.hidden = !isCode || !smsSent;
    authSubmit.hidden = isCode && !smsSent;
    authSubmitLabel.textContent = isSignup ? "Создать аккаунт" : isCode ? "Подтвердить и войти" : "Войти";
    authForm.querySelectorAll(".is-error").forEach((f) => f.classList.remove("is-error"));
    authForm.querySelectorAll(".field-err").forEach((el) => { el.hidden = true; });
    if (authErr) authErr.hidden = true;
  };

  authTabs.querySelectorAll(".auth__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      authTabs.querySelectorAll(".auth__tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      authTabs.dataset.active = tab.dataset.tab;
      smsSent = false;
      syncAuthMode();
    });
  });

  const SMS_TTL_MS = 2 * 60 * 1000;
  const SMS_COOLDOWN_MS = 60 * 1000;
  const SMS_MAX_ATTEMPTS = 3;
  if (smsBtn) smsBtn.addEventListener("click", () => {
    const phone = normPhone(authForm.elements.phone.value.trim());
    if (phone.length < 11) {
      setFieldError(authForm.elements.phone, "Введите телефон полностью (11 цифр)");
      return;
    }
    setFieldError(authForm.elements.phone, "");
    const rec = smsData[phone];
    if (rec && Date.now() - rec.ts < SMS_COOLDOWN_MS) {
      const wait = Math.ceil((SMS_COOLDOWN_MS - (Date.now() - rec.ts)) / 1000);
      setFieldError(authForm.elements.phone, `Подождите ${wait} сек перед повтором`);
      return;
    }
    // здесь будет интеграция: POST /api/sms/send
    let code = "";
    try {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      code = String(1000 + (buf[0] % 9000));
    } catch {
      code = String(1000 + Math.floor(Math.random() * 9000));
    }
    smsData[phone] = { code, ts: Date.now(), attempts: 0 };
    // DEMO: в проде код уходит в SMS, в браузере не показывается
    // smsCodeEl.textContent = code; // убрано — не светим код в DOM
    if (smsCodeEl) smsCodeEl.textContent = "••••";
    if (smsDemo) {
      smsDemo.hidden = false;
      // показываем подсказку только в консоли для теста, не в вёрстке
      try { console.info("[telemaster] demo sms code for", phone, ":", code); } catch { /* ignore */ }
    }
    smsSent = true;
    syncAuthMode();
    authForm.elements.code.focus();
    showToast("Код отправлен на " + phone.replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, "+$1 ($2) $3-$4-$5") + " (демо: см. консоль)");
  });

  const authErr = document.getElementById("authErr");

  const setFieldError = (field, msg) => {
    field.classList.toggle("is-error", !!msg);
    const err = field.closest("label").querySelector(".field-err");
    if (err) { err.textContent = msg || ""; err.hidden = !msg; }
  };

  /* Тосты поверх всего: клик закрывает сразу, автоскрытие — приятное
     дополнение (если браузер глушит таймеры, тост просто висит до клика) */
  const ensureToastBox = () => {
    let box = document.getElementById("toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "toasts";
      box.className = "toasts";
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    return box;
  };
  const showToast = (msg) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "toast";
    el.textContent = msg;
    el.addEventListener("click", () => el.remove());
    ensureToastBox().appendChild(el);
    setTimeout(() => el.classList.add("is-out"), 3200);
    setTimeout(() => el.remove(), 3700);
  };

  // салют из фирменных цветов при оформленном заказе
  const boomConfetti = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = document.createElement("canvas");
    cv.className = "confetti";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    const cx = cv.getContext("2d");
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    const colors = ["#c8102e", "#e05a2b", "#d4a017", "#b08968", "#1c7c3c"];
    const parts = Array.from({ length: 130 }, () => ({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * cv.height * 0.3,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.1 + Math.random() * 0.2,
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    const tick = (now) => {
      const el = now - t0;
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const pt of parts) {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.rot += pt.vr;
        pt.vy += 0.03;
        cx.save();
        cx.translate(pt.x, pt.y);
        cx.rotate(pt.rot);
        cx.fillStyle = pt.color;
        cx.globalAlpha = el > 2200 ? Math.max(0, 1 - (el - 2200) / 600) : 1;
        cx.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h);
        cx.restore();
      }
      if (el < 2900) requestAnimationFrame(tick);
      else cv.remove();
    };
    requestAnimationFrame(tick);
  };

  // Вход завершается СИНХРОННО: ни одного таймера в критическом пути —
  // модалка прячется и открывается кабинет сразу, без экрана-прокладки
  const doLoginSuccess = (user, isSignup, forceKey) => {
    try { localStorage.setItem(SESSION_KEY, forceKey || normPhone(user.phone) || "guest"); } catch { /* ignore */ }
    refreshLoginBtn();
    authForm.reset();
    authModal.hidden = true;
    authModal.classList.remove("is-closing");
    document.body.classList.remove("modal-open");
    if (location.hash === "#/cabinet") renderRoute();
    else location.hash = "#/cabinet";
    const first = (user.name || "Покупатель").split(" ")[0];
    showToast(isSignup ? `Аккаунт создан. Добро пожаловать, ${first}!` : `С возвращением, ${first}!`);
  };

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawPhone = authForm.elements.phone.value.trim();
    if (!hitRateLimit("auth:" + (normPhone(rawPhone) || "guest"))) { showToast("Слишком много попыток входа — попробуйте через 15 минут"); return; }
    const mode = authTabs.dataset.active;
    const isSignup = mode === "signup";
    const isCode = mode === "code";
    const phone = rawPhone;
    const password = authForm.elements.password.value;
    const name = authForm.elements.name.value.trim();
    let ok = true;

    if (normPhone(phone).length < 11) { setFieldError(authForm.elements.phone, "Введите телефон полностью (11 цифр)"); ok = false; }
    else setFieldError(authForm.elements.phone, "");
    if (!isCode) {
      if (password.length < 4) { setFieldError(authForm.elements.password, "Пароль — минимум 4 символа"); ok = false; }
      else setFieldError(authForm.elements.password, "");
    }
    if (isSignup && name.length < 2) { setFieldError(authForm.elements.name, "Представьтесь, пожалуйста"); ok = false; }
    else if (isSignup) setFieldError(authForm.elements.name, "");
    if (isCode) {
      const rec = smsData[normPhone(phone)];
      const cfield = authForm.elements.code;
      if (!rec) { setFieldError(cfield, "Нажмите «Получить код»"); ok = false; }
      else if (Date.now() - rec.ts > SMS_TTL_MS) { setFieldError(cfield, "Код истёк — запросите новый"); ok = false; }
      else if ((rec.attempts || 0) >= SMS_MAX_ATTEMPTS) { setFieldError(cfield, "Превышено число попыток — запросите новый код"); ok = false; }
      else if (cfield.value.trim() !== rec.code) { rec.attempts = (rec.attempts || 0) + 1; setFieldError(cfield, `Неверный код (попытка ${rec.attempts}/${SMS_MAX_ATTEMPTS})`); ok = false; }
      else setFieldError(cfield, "");
    }
    if (authErr) authErr.hidden = true;
    if (!ok) return;

    const users = getUsers();
    const key = normPhone(phone);
    authSubmit.classList.add("is-loading");
    try {
      if (isSignup) {
        if (users[key]) {
          if (authErr) { authErr.textContent = "Этот телефон уже зарегистрирован — войдите."; authErr.hidden = false; }
          return;
        }
        // здесь будет интеграция: POST /api/register
        const salt = makeSalt();
        users[key] = { name, phone, pass: await hashPass(salt, password), salt, created: Date.now() };
        saveUsers(users);
      } else if (isCode) {
        // здесь будет интеграция: POST /api/sms/verify
        if (!users[key]) {
          users[key] = { name: "Покупатель", phone, pass: "", salt: "", created: Date.now() };
          saveUsers(users);
        }
        delete smsData[key];
        smsSent = false;
      } else {
        const u = users[key];
        if (!u) {
          if (authErr) { authErr.textContent = "Аккаунт не найден — зарегистрируйтесь."; authErr.hidden = false; }
          return;
        }
        // здесь будет интеграция: POST /api/login
        if (u.pass && (await hashPass(u.salt, password)) !== u.pass) {
          setFieldError(authForm.elements.password, "Неверный пароль");
          return;
        }
      }
    } finally {
      authSubmit.classList.remove("is-loading");
    }
    doLoginSuccess(users[key], isSignup);
  });

  authForm.querySelectorAll("input").forEach((field) => {
    field.addEventListener("input", () => {
      field.classList.remove("is-error");
      const err = field.closest("label").querySelector(".field-err");
      if (err) err.hidden = true;
      if (authErr) authErr.hidden = true;
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !authModal.hidden) closeModal();
  });

  /* ============================================================
     РОУТЕР: ГЛАВНАЯ / КАТАЛОГ / КАТЕГОРИЯ / КОРЗИНА / КАБИНЕТ
     ============================================================ */
  const homeMain = document.getElementById("homeMain");
  const pageMain = document.getElementById("pageMain");
  const ORDERS_KEY = "tm-orders";

  const { ICONS, ART, CATALOG, ALL } = window.TM;
  // демо-админка: открытый пароль убран, проверка через hash + TTL.
  // В продакшене — только серверная авторизация (POST /api/admin/login → JWT).
  const ADMIN_PASSWORD_HASH = "15a7c0ff68a9da13f64228fbb0413b0a38699e4b9bf9efd31a47bcbdb6d4df1e"; // sha256("telemaster2026")
  const ADMIN_TTL_MS = 30 * 60 * 1000;

  const findProduct = (id) => getProducts().find((p) => p.id === id) || null;

  // товары, добавленные через админпанель, живут отдельно от базового каталога
  const getCustomProducts = () => {
    try { return JSON.parse(localStorage.getItem("tm-custom-products")) || []; } catch { return []; }
  };
  const saveCustomProducts = (list) => localStorage.setItem("tm-custom-products", JSON.stringify(list));
  // правки цен/остатков из админки: базовый каталог перекрывается словарём,
  // свои товары правятся напрямую в tm-custom-products
  const getOverrides = () => {
    try { return JSON.parse(localStorage.getItem("tm-overrides")) || {}; } catch { return {}; }
  };
  const saveOverrides = (o) => localStorage.setItem("tm-overrides", JSON.stringify(o));

  // свои категории из админки живут после базовых
  const getCustomCats = () => {
    try { return JSON.parse(localStorage.getItem("tm-custom-cats")) || []; } catch { return []; }
  };
  const saveCustomCats = (list) => localStorage.setItem("tm-custom-cats", JSON.stringify(list));
  const getCatalog = () => CATALOG.concat(getCustomCats());

  // промокоды: {code, type: "pct"|"fix", value, active}
  const PROMOS_KEY = "tm-promos";
  const getPromos = () => {
    try {
      const v = JSON.parse(localStorage.getItem(PROMOS_KEY));
      if (Array.isArray(v)) return v;
    } catch { /* ignore */ }
    return [{ code: "TELE10", type: "pct", value: 10, active: true }];
  };
  const savePromos = (list) => localStorage.setItem(PROMOS_KEY, JSON.stringify(list));
  let activePromo = null;
  const promoDiscount = (subtotal) => {
    if (!activePromo) return 0;
    const found = getPromos().find((p) => p.active && p.code === activePromo.code);
    if (!found) return 0;
    activePromo = { code: found.code, type: found.type, value: found.value };
    return found.type === "pct" ? Math.round(subtotal * found.value / 100) : Math.min(subtotal, found.value);
  };

  // полоса категорий в шапке дорисовывается своими категориями
  const renderCatnav = () => {
    const inner = document.querySelector(".catnav__inner");
    if (!inner) return;
    inner.querySelectorAll("[data-custom-cat]").forEach((a) => a.remove());
    getCustomCats().forEach((c) => {
      const a = document.createElement("a");
      a.className = "catnav__link";
      a.href = "#/category/" + encodeURIComponent(String(c.id));
      a.textContent = String(c.name);
      a.dataset.customCat = "1";
      inner.appendChild(a);
    });
  };
  renderCatnav();

  // файл с устройства: ужимаем до 900px и жмём в JPEG, чтобы влезть в quota
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const k = Math.min(1, 900 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * k));
        cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });

  const getProducts = () => {
    const ov = getOverrides();
    const base = ALL.map((p) => {
      const o = ov[p.id];
      if (!o) return p;
      return { ...p, price: o.price ?? p.price, stock: o.stock ?? p.stock, ...(o.img ? { img: o.img } : {}) };
    });
    return base.concat(
      getCustomProducts().map((p) => ({
        ...p,
        cat: getCatalog().find((c) => c.id === p.catId) || getCatalog()[0],
      }))
    );
  };

  const money = (n) => n.toLocaleString("ru-RU") + " ₽";

  // опт как у дистрибьюторов: от 10 шт одной позиции −25% на каждую штуку
  const BULK_MIN = 10, BULK_OFF = 0.25;
  const linePrice = (p, qty) => (qty >= BULK_MIN ? Math.max(1, Math.round(p.price * (1 - BULK_OFF))) : p.price);
  const lineSum = (p, qty) => linePrice(p, qty) * qty;

  const getOrders = () => {
    if (!isAdmin()) return [];
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; }
  };
  const getOrdersRaw = () => {
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; } catch { return []; }
  };
  // кабинет показывает заказы текущего браузера — без админ-проверки
  const getOrdersForCabinet = () => getOrdersRaw();

  // страховка для сред, где анимационные часы могут «замерзать»:
  // через 800 мс отключаем анимации в поддереве — базовые стили видимы
  const unfreeze = (root) => {
    setTimeout(() => {
      if (!root) return;
      [root, ...root.querySelectorAll("*")].forEach((el) => {
        el.style.animation = "none";
      });
    }, 800);
  };

  const stockBadge = (p) =>
    p.stock <= 50
      ? `<span class="product__stock product__stock--few">Осталось ${p.stock} шт</span>`
      : `<span class="product__stock">В наличии</span>`;

  // Фото товара: если у позиции есть img — показываем <img>, иначе SVG-иконку.
  // Как добавить фото: положить файл в img/ и прописать в js/data.js img: "img/stm32.jpg"
  // какая иллюстрация какому товару: сначала точное совпадение, потом дефолт категории
  const CAT_ART = { mcu: "chip", ic: "dip", passive: "resistor", sensors: "probe", conn: "terminal", tools: "iron" };
  const ART_OVERRIDE = {
    esp32: "wifi", nano: "board", rp2040: "board", l298n: "driver", ams1117: "sot",
    ker300: "ceramic", c100nf: "ceramic", electro: "electro",
    dht22: "box", bmp280: "board", pir: "dome", rel4ch: "relay",
    dupont: "wires", jst: "terminal", usba: "usb",
    bb830: "breadboard", solder: "spool", flux: "syringe", dt832: "meter",
  };
  const artFor = (p) => ART_OVERRIDE[p.id] || CAT_ART[(p.cat && p.cat.id) || ""] || "chip";

  const productImg = (p, cls) => {
    if (p.img) {
      const safe = sanitizeImgSrc(p.img);
      if (!safe) {
        if (ART && ART[artFor(p)]) return ART[artFor(p)];
        return ICONS[p.cat.icon];
      }
      return `<img class="${escAttr(cls || "")}" src="${safe}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">`;
    }
    if (ART && ART[artFor(p)]) return ART[artFor(p)];
    return ICONS[p.cat.icon];
  };

  // Галерея карточки: p.imgs = [фото...], p.img = одно фото, иначе SVG.
  // Фото кладутся в img/, путь прописывается в js/data.js или в админке.
  const galleryHtml = (p) => {
    const imgs = (p.imgs && p.imgs.length ? p.imgs : (p.img ? [p.img] : [])).map(sanitizeImgSrc).filter(Boolean);
    if (!imgs.length) return productImg(p, "p-gallery__img");
    return `
      <img class="p-gallery__img" id="pGalleryMain" src="${imgs[0]}" alt="${esc(p.name)}" onerror="this.remove()">
      ${imgs.length > 1 ? `<div class="p-thumbs">${imgs.map((s, i) => `<button type="button" class="p-thumb${i === 0 ? " is-active" : ""}" data-thumb="${escAttr(s)}" aria-label="Фото ${i + 1}"><img src="${escAttr(s)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></button>`).join("")}</div>` : ""}`;
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c]));
  const escAttr = (s) => esc(s);
  const sanitizeImgSrc = (src) => {
    const s = String(src == null ? "" : src).trim();
    if (!s) return "";
    if (/^\s*javascript:/i.test(s) || /^\s*vbscript:/i.test(s) || /^\s*data:(?!image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,)/i.test(s)) return "";
    if (/["'`<>\s]/.test(s) && !/^data:image\//i.test(s)) {
      // если в пути есть кавычки/уголки — режем, кроме валидных data:image
      if (/["'`<>]/.test(s)) return "";
    }
    return escAttr(s);
  };

  const matchQuery = (p, q) => {
    const hay = `${p.name} ${p.sku} ${p.cat.name}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  };

  const searchProducts = (q) => {
    const query = (q || "").trim();
    if (!query) return [];
    return getProducts().filter((p) => matchQuery(p, query));
  };

const productCard = (p) => {
    const price = p.oldPrice
      ? `${money(p.price)} ${money(p.oldPrice)} `
      : money(p.price);
    return `
      <article class="product">
        <a class="product__img" href="#/product/${escAttr(p.id)}" aria-label="${esc(p.name)}">
          ${stockBadge(p)}
          ${p.oldPrice ? `<span class="product__badge">−${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}
          ${HIT_IDS.includes(p.id) ? `<span class="product__hit">ХИТ</span>` : ""}
          ${productImg(p)}
        </a>
        <button class="fav-btn${favStore.has(p.id) ? " is-active" : ""}" type="button" data-fav="${escAttr(p.id)}" aria-label="В избранное" title="В избранное">${HEART_SVG}</button>
        <span class="product__sku">Арт. ${esc(p.sku)}</span>
        <h3><a href="#/product/${escAttr(p.id)}">${esc(p.name)}</a></h3>
        <div class="product__meta">
          <span class="product__price">${price}</span>
          <button class="add-to-cart" type="button" data-add="${escAttr(p.id)}">В корзину</button>
        </div>
      </article>`;
  };

  const catalogState = { cat: "", q: "", sort: "default", view: "grid" };

  const getCatalogItems = () => {
    // базовый каталог + товары из админки → фильтр по категории и поиску → сортировка
    let items = getProducts();
    if (catalogState.cat) items = items.filter((p) => p.cat.id === catalogState.cat);
    if (catalogState.q.trim()) items = items.filter((p) => matchQuery(p, catalogState.q));
    if (catalogState.sort === "price-asc") items = items.slice().sort((a, b) => a.price - b.price);
    if (catalogState.sort === "price-desc") items = items.slice().sort((a, b) => b.price - a.price);
    if (catalogState.sort === "name") items = items.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return items;
  };

  const catalogGridHtml = () => {
    const items = getCatalogItems();
    if (!items.length) return `<div class="cart-empty" style="grid-column:1/-1"><b>Ничего не нашли</b>Попробуйте другой запрос или категорию.</div>`;
    if (catalogState.view === "table") return items.map((p) => tableRowHtml(p)).join("");
    return items.map((p) => productCard(p)).join("");
  };

  // строка таблицы в духе DigiKey: артикул, наличие, цена, опт — в одну линию
  const tableRowHtml = (p) => {
    const price = p.oldPrice
      ? `${money(p.price)} <s>${money(p.oldPrice)}</s>`
      : money(p.price);
    return `
      <div class="trow">
        <a class="trow__img" href="#/product/${escAttr(p.id)}" aria-label="${esc(p.name)}">${productImg(p)}</a>
        <span class="trow__main">
          <a href="#/product/${escAttr(p.id)}">${esc(p.name)}</a>
          <small>Арт. ${esc(p.sku)} · ${esc(p.cat.name)}</small>
        </span>
        ${stockBadge(p)}
        <span class="trow__price">${price}</span>
        <button class="add-to-cart" type="button" data-add="${escAttr(p.id)}">В корзину</button>
        <button class="fav-btn${favStore.has(p.id) ? " is-active" : ""}" type="button" data-fav="${escAttr(p.id)}" aria-label="В избранное" title="В избранное">${HEART_SVG}</button>
      </div>`;
  };

  const viewCatalog = () => `
    <section class="page container">
      <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Каталог</span></nav>
      <h2 class="page-title">Каталог продукции</h2>
      <p class="page-sub" id="catalogCount"></p>
      <div class="chips" id="catalogChips">
        <button class="chip-btn is-active" data-cat="">Все товары</button>
        ${getCatalog().map((c) => `<button class="chip-btn" data-cat="${escAttr(c.id)}">${esc(c.name)}</button>`).join("")}
      </div>
      <div class="cat-tools">
        <div class="seg" role="tablist" aria-label="Вид каталога">
          <button class="seg__btn${catalogState.view === "grid" ? " is-active" : ""}" data-view="grid">Сетка</button>
          <button class="seg__btn${catalogState.view === "table" ? " is-active" : ""}" data-view="table">Таблица</button>
        </div>
        <input type="search" id="catalogSearch" placeholder="Фильтр: название или артикул…" value="${escAttr(catalogState.q)}" aria-label="Фильтр товаров">
        <select id="catalogSort" aria-label="Сортировка">
          <option value="default">Сначала популярные</option>
          <option value="price-asc">Дешевле</option>
          <option value="price-desc">Дороже</option>
          <option value="name">По названию</option>
        </select>
      </div>
      <div class="products" id="catalogGrid">${catalogGridHtml()}</div>
    </section>`;

  let categorySort = "default";

  // своя 3D-фигура для шапки каждой категории
  const CAT_MODEL = { mcu: "chip", ic: "cap", passive: "resistor", sensors: "led", conn: "toroid", tools: "iron" };

  const categoryGridHtml = (id) => {
    let items = getProducts().filter((p) => p.cat.id === id);
    if (categorySort === "price-asc") items = items.slice().sort((a, b) => a.price - b.price);
    if (categorySort === "price-desc") items = items.slice().sort((a, b) => b.price - a.price);
    if (categorySort === "name") items = items.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return items.map((p) => productCard(p)).join("");
  };

  const viewCategory = (id) => {
    const cat = getCatalog().find((c) => c.id === id);
    if (!cat) return null;
    return `
      <section class="page container">
        <nav class="crumbs">
          <a href="#/">Главная</a><span>/</span>
          <a href="#/catalog">Каталог</a><span>/</span>
          <span>${esc(cat.name)}</span>
        </nav>
        <div class="cat-head">
          <div>
            <h2 class="page-title">${esc(cat.name)}</h2>
            <p class="page-sub">${esc(cat.desc)}</p>
          </div>
          <div class="cat-3d"><canvas data-model3d="${escAttr(CAT_MODEL[cat.id] || "chip")}" aria-hidden="true"></canvas>${(CAT_MODEL[cat.id] || "chip") === "resistor" ? '<span class="cat-resval" data-resval></span>' : ""}</div>
        </div>
        <div class="cat-tools">
          <select id="categorySort" aria-label="Сортировка">
            <option value="default">Сначала популярные</option>
            <option value="price-asc">Дешевле</option>
            <option value="price-desc">Дороже</option>
            <option value="name">По названию</option>
          </select>
        </div>
        <div class="products" id="categoryGrid">${categoryGridHtml(id)}</div>
        <div class="page-back"><a class="btn btn--ghost" href="#/catalog">← Все категории</a></div>
      </section>`;
  };

  const viewCart = () => {
    const entries = Object.entries(cartStore.read())
      .map(([id, qty]) => ({ p: findProduct(id), qty }))
      .filter((x) => x.p);

    if (!entries.length) {
      return `
        <section class="page container">
          <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Корзина</span></nav>
          <h2 class="page-title">Корзина</h2>
          <div class="cart-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1.5 12.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5L6 7z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
            <b>Корзина пуста</b>
            Загляните в каталог — там резисторы, контроллеры и готовые наборы.
            <div><a class="btn btn--primary" href="#/catalog">Перейти в каталог</a></div>
          </div>
        </section>`;
    }

    const total = entries.reduce((sum, x) => sum + lineSum(x.p, x.qty), 0);
    const count = entries.reduce((sum, x) => sum + x.qty, 0);
    return `
      <section class="page container">
        <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Корзина</span></nav>
        <h2 class="page-title">Корзина</h2>
        <p class="page-sub">${count} поз. — отправим в течение 24 часов после оплаты · от ${BULK_MIN} шт одной позиции скидка 25%</p>
        <div class="cart-list">
          ${entries.map(({ p, qty }) => {
            const unit = linePrice(p, qty);
            const bulk = unit < p.price;
            return `
            <div class="cart-item">
              <div class="cart-item__img">${productImg(p)}</div>
              <div>
                <div class="cart-item__name">${esc(p.name)}</div>
                <div class="cart-item__sku">Арт. ${esc(p.sku)} · ${bulk ? `<s>${money(p.price)}</s> ` : ""}${money(unit)} / шт${bulk ? ` · <b class="bulk-tag">опт −25%</b>` : ""}</div>
              </div>
              <div class="qty">
                <button type="button" data-qty="minus" data-id="${escAttr(p.id)}" aria-label="Меньше">−</button>
                <span>${qty}</span>
                <button type="button" data-qty="plus" data-id="${escAttr(p.id)}" aria-label="Больше">+</button>
              </div>
              <span class="cart-item__sum">${money(lineSum(p, qty))}</span>
              <button class="cart-remove" type="button" data-remove="${escAttr(p.id)}" aria-label="Убрать">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>`; }).join("")}
        </div>
        <div class="cart-total-bar">
          <span class="cart-total-label">Итого к оплате</span>
          <b>${money(total)}</b>
        </div>
        <a class="btn btn--primary btn--full" href="#/checkout">Оформить заказ</a>
        <p class="cart-note" style="margin-top:12px;text-align:center">Оплата картой онлайн, СБП или при получении. От 3 000 ₽ доставим по Крыму бесплатно.</p>
      </section>`;
  };

  // доставка пока только по Крыму
  const FREE_FROM = 3000, COURIER_FEE = 490, CRIMEA_FEE = 350;
  const deliveryFee = (method, subtotal) => {
    if (method === "pickup" || subtotal >= FREE_FROM) return 0;
    return method === "crimea" ? CRIMEA_FEE : COURIER_FEE;
  };
  const DELIVERY_NAMES = { pickup: "Самовывоз", courier: "Курьер по городу", crimea: "Доставка по Крыму", post: "Доставка по Крыму" };

  const viewCheckout = () => {
    const entries = Object.entries(cartStore.read())
      .map(([id, qty]) => ({ p: findProduct(id), qty }))
      .filter((x) => x.p);
    if (!entries.length) {
      return `
        <section class="page container">
          <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Оформление</span></nav>
          <h2 class="page-title">Оформление заказа</h2>
          <div class="cart-empty"><b>Корзина пуста</b>Сначала добавьте товары из каталога.<div><a class="btn btn--primary" href="#/catalog">Перейти в каталог</a></div></div>
        </section>`;
    }
    const subtotal = entries.reduce((s, x) => s + lineSum(x.p, x.qty), 0);
    const count = entries.reduce((s, x) => s + x.qty, 0);
    const savedPhone = userPhone();
    return `
      <section class="page container">
        <nav class="crumbs"><a href="#/">Главная</a><span>/</span><a href="#/cart">Корзина</a><span>/</span><span>Оформление</span></nav>
        <h2 class="page-title">Оформление заказа</h2>
        <p class="page-sub">${count} поз. на ${money(subtotal)} · от ${money(FREE_FROM)} доставка по Крыму бесплатно</p>
        <form class="co-grid" id="checkoutForm" novalidate>
          <div class="co-form admin-card">
            <b class="admin-form-title">Контакты</b>
            <label><span>Имя</span><input name="name" value="${esc(userName())}" placeholder="Иван" required></label>
            <label><span>Телефон</span><input name="phone" type="tel" value="${esc(savedPhone)}" placeholder="+7 (___) ___-__-__" required></label>
            <b class="admin-form-title" style="margin-top:18px">Доставка</b>
            <div class="co-radios" id="coDelivery">
              <label class="co-radio"><input type="radio" name="delivery" value="pickup" checked><span><b>Самовывоз</b><i>в Крыму · бесплатно, адрес подскажет менеджер</i></span></label>
              <label class="co-radio"><input type="radio" name="delivery" value="courier"><span><b>Курьер по городу</b><i>${money(COURIER_FEE)} · бесплатно от ${money(FREE_FROM)}</i></span></label>
              <label class="co-radio"><input type="radio" name="delivery" value="crimea"><span><b>Доставка по Крыму</b><i>${money(CRIMEA_FEE)} · бесплатно от ${money(FREE_FROM)}</i></span></label>
            </div>
            <label id="coAddressWrap" hidden><span>Адрес доставки</span><input name="address" placeholder="Город, улица, дом, квартира"></label>
            <b class="admin-form-title" style="margin-top:18px">Оплата</b>
            <div class="co-radios">
              <label class="co-radio"><input type="radio" name="pay" value="card" checked><span><b>Картой онлайн</b><i>ссылку пришлёт менеджер</i></span></label>
              <label class="co-radio"><input type="radio" name="pay" value="sbp"><span><b>СБП</b><i>по номеру телефона</i></span></label>
              <label class="co-radio"><input type="radio" name="pay" value="cash"><span><b>При получении</b><i>наличными или картой</i></span></label>
            </div>
            <label style="margin-top:14px"><span>Комментарий (необязательно)</span><input name="comment" placeholder="Позвонить за час, нужен чек…"></label>
            <p class="admin-err" id="coErr" hidden>Заполните имя и телефон</p>
          </div>
          <div class="co-side admin-card">
            <b class="admin-form-title">Ваш заказ (${count})</b>
            <div class="co-items">${entries.map(({ p, qty }) => `<div class="co-item"><span>${esc(p.name)} × ${qty}${linePrice(p, qty) < p.price ? ` <b class="bulk-tag">опт −25%</b>` : ""}</span><b>${money(lineSum(p, qty))}</b></div>`).join("")}</div>
            <div class="co-item"><span>Товары</span><b>${money(subtotal)}</b></div>
            <div class="co-item"><span>Доставка</span><b id="coFee">${money(deliveryFee("pickup", subtotal))}</b></div>
            <div class="promo-row">
              <input id="promoInput" placeholder="Промокод" autocomplete="off">
              <button class="btn btn--ghost btn--sm" id="promoApply" type="button">OK</button>
            </div>
            <p class="admin-err" id="promoMsg" hidden></p>
            <div class="co-item" id="promoLine" hidden><span>Скидка <b id="promoName"></b></span><b id="promoSum"></b></div>
            <div class="co-total"><span>Итого</span><b id="coTotal">${money(subtotal)}</b></div>
            <button class="btn btn--primary btn--full" type="submit">Подтвердить заказ</button>
            <p class="cart-note" style="margin-top:10px;text-align:center">Менеджер подтвердит заказ и пришлёт ссылку на оплату.</p>
          </div>
        </form>
      </section>`;
  };

  const viewOrderDone = (order) => `
    <section class="page container">
      <div class="order-done">
        <canvas data-model3d="toroid" aria-hidden="true"></canvas>
        <svg class="done-svg" viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="24"/>
          <path d="M15 27l8 8 15-16"/>
          <g>
            <circle class="done-dot" cx="15" cy="27" r="0"><animate attributeName="r" values="0;2.6" begin="0.1s" dur="0.2s" fill="freeze"/></circle>
            <circle class="done-dot" cx="23" cy="35" r="0"><animate attributeName="r" values="0;2.6" begin="0.45s" dur="0.2s" fill="freeze"/></circle>
            <circle class="done-dot" cx="38" cy="19" r="0"><animate attributeName="r" values="0;2.6" begin="1.3s" dur="0.2s" fill="freeze"/></circle>
          </g>
          <g class="done-iron" stroke-width="2.4" stroke-linecap="round">
            <path d="M0 0L-9 9"/>
            <path d="M-9 9l-6 6" stroke-width="1.4"/>
            <animateMotion dur="1.3s" fill="freeze" path="M15 27l8 8 15-16"/>
          </g>
        </svg>
        <h3>Заказ оформлен!</h3>
        <p>Заказ <span class="order-no">№ ${esc(String(order.no))}</span> на сумму ${money(order.total)} —<br>${order.name ? esc(order.name) + ", " : ""}менеджер подтвердит его (${esc(DELIVERY_NAMES[order.delivery] || "доставка")}) и пришлёт ссылку на оплату.</p>
        <a class="btn btn--primary" href="#/catalog">Продолжить покупки</a>
      </div>
    </section>`;

  const viewCabinet = () => {
    if (!userName()) {
      return `
        <section class="page container">
          <div class="login-required">
            <span class="lock-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>
            </span>
            <h3>Войдите в кабинет</h3>
            <p>История заказов, избранное и бонусная программа — после входа по телефону.</p>
            <button class="btn btn--primary" data-open-auth>Войти или зарегистрироваться</button>
          </div>
        </section>`;
    }

    const orders = getOrdersForCabinet();
    const favs = favStore.read().map((id) => findProduct(id)).filter(Boolean);
    // трекинг последнего заказа + прогресс до скидки 5% (даётся с 3-го заказа)
    const lastOrder = orders[0] || null;
    const trackSteps = ["Собирается", "Отправлен", "Выдан"];
    const trackIdx = lastOrder ? Math.max(0, trackSteps.indexOf(lastOrder.status || "Собирается")) : -1;
    const saleNeed = Math.max(0, 3 - orders.length);
    const salePct = Math.min(100, Math.round((orders.length / 3) * 100));
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem("tm-recent") || "[]"); } catch { recent = []; }
    const recentProducts = recent.map((id) => findProduct(id)).filter(Boolean);
    const recentHtml = recentProducts.length
      ? recentProducts.map((p) => `
          <a class="recent" href="#/product/${escAttr(p.id)}">
            <span class="recent__img">${productImg(p)}</span>
            <span class="recent__name">${esc(p.name)}</span>
            <b>${money(linePrice(p, 1))}</b>
          </a>`).join("")
      : `<span class="cab-favs-empty">Вы ещё ничего не смотрели — начните с <a class="cab-link" href="#/catalog">каталога →</a></span>`;
    const favsHtml = favs.length
      ? favs.map((p) => `
              <span class="cab-fav">
                <a href="#/product/${escAttr(p.id)}">${esc(p.name)}</a>
                <button type="button" data-fav="${escAttr(p.id)}" aria-label="Убрать из избранного">×</button>
              </span>`).join("")
      : `<span class="cab-favs-empty">Жмите ♥ на карточке товара — сохраним его здесь.</span>`;
    const ordersList = orders.length
      ? orders.map((o, i) => `
          <li>
            <b>№ ${esc(String(o.no))}</b>
            <span class="cab-order-name">${esc(String(o.items))} поз. на ${money(o.total)}</span>
            <span class="cab-status ${o.status === "Выдан" ? "cab-status--done" : "cab-status--ship"}">${esc(o.status || "Собирается")}</span>
            ${(o.lines || []).length ? `<button class="btn btn--ghost btn--sm" data-reorder="${i}">↻ Повторить</button>` : ""}
            ${(o.lines || []).length ? `<small class="cab-lines">${o.lines.map((l) => `${esc(l.name)} × ${l.qty}`).join(" · ")}</small>` : ""}
          </li>`).join("")
      : `<li class="cab-empty">Заказов пока нет — <a class="cab-link" href="#/catalog">загляните в каталог →</a></li>`;

    return `
      <section class="cab-page container">
        <div class="cab-head">
          <h2>Личный кабинет</h2>
          <button class="btn btn--ghost btn--sm" data-logout>Выйти</button>
        </div>
        <div class="cab-hello">
          <h2>Привет, <span>${esc(userName())}</span>!</h2>
          <p>Рады видеть вас снова в ТЕЛЕМАСТЕР</p>
        </div>
        <div class="cab-grid">
          <div class="cab-card cab-card--bonus">
            <canvas data-model3d="meter" aria-hidden="true"></canvas>
            <span class="cab-label">Бонусный счёт</span>
            <b class="cab-bonus" data-bonus="1250">0</b>
            <i>1 бонус = 1 ₽ при следующем заказе</i>
          </div>
          <div class="cab-card cab-card--orders">
            <span class="cab-label">Последние заказы</span>
            <ul class="cab-orders">${ordersList}</ul>
            <a class="cab-link" href="#/cart">Перейти в корзину →</a>
          </div>
          <div class="cab-card cab-card--track">
            <span class="cab-label">Где мой заказ</span>
            ${lastOrder ? `
            <div class="track">
              ${trackSteps.map((s, i) => `<span class="track__step${i < trackIdx ? " is-done" : ""}${i === trackIdx ? " is-now" : ""}"><i>${i + 1}</i>${esc(s)}</span>`).join("")}
            </div>
            <p class="track__no">Заказ № ${esc(String(lastOrder.no))} · ${money(lastOrder.total)}</p>` : `
            <p class="track__no">Заказов пока нет — <a class="cab-link" href="#/catalog">оформить первый →</a></p>`}
          </div>
          <div class="cab-card cab-card--sale">
            <span class="cab-label">Скидка 5% навсегда</span>
            ${saleNeed ? `
            <b class="cab-sale-num">${saleNeed} ${plural(saleNeed, ["заказ", "заказа", "заказов"])}</b>
            <div class="sale-bar"><span style="width:${salePct}%"></span></div>
            <i>осталось до постоянной скидки — даём с 3-го заказа</i>` : `
            <b class="cab-sale-num">Ваша!</b>
            <i>постоянная скидка 5% активна — назовёт менеджер при заказе</i>`}
          </div>
          <div class="cab-card cab-card--fav">
            <span class="cab-label">Избранное${favs.length ? ` · ${favs.length}` : ""}</span>
            <div class="cab-favs">${favsHtml}</div>
          </div>
          <div class="cab-card cab-card--profile">
            <span class="cab-label">Профиль</span>
            <div class="cab-profile">
              <div>
                <b>${esc(userPhone() || "не указан")}</b>
                <span>телефон для входа</span>
              </div>
              <div>
                <b>Курьером до двери</b>
                <span>способ доставки по умолчанию</span>
              </div>
            </div>
          </div>
          <div class="cab-card cab-card--recent">
            <span class="cab-label">Недавно смотрели</span>
            <div class="recent-row">${recentHtml}</div>
          </div>
        </div>
      </section>`;
  };

  /* ---------- Отзывы о товарах (модерация в админке) ---------- */
  const REVIEWS_KEY = "tm-reviews";
  const getReviews = () => {
    try { return JSON.parse(localStorage.getItem(REVIEWS_KEY)) || {}; } catch { return {}; }
  };
  const saveReviews = (r) => localStorage.setItem(REVIEWS_KEY, JSON.stringify(r));
  const SEED_REVIEWS = {
    stm32f103: [
      { id: "seed1", name: "Дмитрий", rating: 5, text: "Оригинал, прошивается без танцев. Взял 10 шт — опт посчитался сам.", date: "12.08.2026", ts: 1786500000000, ok: true },
      { id: "seed2", name: "Ольга", rating: 4, text: "Хороший чип, программатор лучше иметь сразу — через USB-UART дольше.", date: "28.08.2026", ts: 1787800000000, ok: true },
    ],
    esp32: [
      { id: "seed3", name: "Тимур", rating: 5, text: "Wi-Fi держит уверенно через две стены. Для умного дома — топ.", date: "02.09.2026", ts: 1788300000000, ok: true },
    ],
    ds18b20: [
      { id: "seed4", name: "Сергей", rating: 5, text: "Гильза герметичная, сутки в ведре — полёт нормальный. Точность совпала.", date: "20.08.2026", ts: 1787200000000, ok: true },
    ],
  };
  const productReviews = (id) => {
    const all = getReviews();
    if (!all.__seeded) {
      Object.assign(all, SEED_REVIEWS);
      all.__seeded = true;
      saveReviews(all);
    }
    return ((all[id] || []).slice()).sort((a, b) => b.ts - a.ts);
  };
  const approvedReviews = (id) => productReviews(id).filter((r) => r.ok);
  const avgRating = (id) => {
    const list = approvedReviews(id);
    if (!list.length) return null;
    return list.reduce((s, r) => s + r.rating, 0) / list.length;
  };
  const pendingReviewsCount = () => Object.keys(getReviews())
    .filter((k) => k !== "__seeded")
    .reduce((n, k) => n + getReviews()[k].filter((r) => !r.ok).length, 0);

  const plural = (n, forms) => {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  };

  const starsHtml = (n) => {
    const v = Math.max(0, Math.min(5, Math.round(n)));
    return `<span class="stars" aria-label="Оценка ${v} из 5">${"★".repeat(v)}${"☆".repeat(5 - v)}</span>`;
  };

  let reviewRating = 5;

  const reviewsHtml = (p) => {
    const list = approvedReviews(p.id);
    const avg = avgRating(p.id);
    return `
      <div class="p-reviews">
        <h3 class="p-analogs-title">Отзывы</h3>
        ${avg
          ? `<div class="rev-summary">${starsHtml(avg)}<b>${avg.toFixed(1).replace(".", ",")}</b><span>· ${list.length} ${plural(list.length, ["отзыв", "отзыва", "отзывов"])}</span></div>`
          : `<div class="rev-summary"><span>Отзывов пока нет — станьте первым</span></div>`}
        <div class="rev-list">
          ${list.map((r) => `
            <article class="rev-card">
              <div class="rev-card__head">${starsHtml(r.rating)}<b>${esc(r.name)}</b><span>${esc(r.date || "")}</span></div>
              <p>${esc(r.text)}</p>
            </article>`).join("")}
        </div>
        <form class="rev-form admin-card" id="reviewForm" data-pid="${escAttr(p.id)}" novalidate>
          <b class="admin-form-title">Оставить отзыв</b>
          <div class="star-pick" id="starPick" role="radiogroup" aria-label="Ваша оценка">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn${n <= reviewRating ? " is-active" : ""}" data-star="${n}" aria-label="Оценка ${n}">★</button>`).join("")}
          </div>
          <label><span>Имя</span><input name="name" placeholder="Как к вам обращаться" autocomplete="name"></label>
          <label><span>Отзыв</span><textarea name="text" placeholder="Что понравилось, для чего брали…"></textarea></label>
          <p class="admin-err" id="revErr" hidden></p>
          <button class="btn btn--primary" type="submit">Отправить на модерацию</button>
        </form>
      </div>`;
  };

  const viewProduct = (id) => {
    const p = findProduct(id);
    if (!p) return null;
    const price = p.oldPrice
      ? `${money(p.price)} <s>${money(p.oldPrice)}</s>`
      : money(p.price);
    const analogs = getProducts().filter((x) => x.cat.id === p.cat.id && x.id !== p.id).slice(0, 4);
    const desc = p.desc || p.cat.desc || "";
    return `
      <section class="page container">
        <nav class="crumbs">
          <a href="#/">Главная</a><span>/</span>
          <a href="#/catalog">Каталог</a><span>/</span>
          <a href="#/category/${escAttr(p.cat.id)}">${esc(p.cat.name)}</a><span>/</span>
          <span>${esc(p.name)}</span>
        </nav>
        <div class="p-detail">
          <div class="p-gallery">
            ${stockBadge(p)}
            ${galleryHtml(p)}
          </div>
          <div class="p-info">
            <span class="product__sku">Арт. ${esc(p.sku)}</span>
            <h2 class="page-title">${esc(p.name)}</h2>
            <p class="page-sub">${esc(desc)}</p>
            <div class="p-buy">
              <span class="p-price">${price}</span>
              <button class="add-to-cart" type="button" data-add="${escAttr(p.id)}">В корзину</button>
              <button class="fav-btn fav-btn--static${favStore.has(p.id) ? " is-active" : ""}" type="button" data-fav="${escAttr(p.id)}" aria-label="В избранное" title="В избранное">${HEART_SVG}</button>
              <a class="btn btn--ghost" href="#/cart">В корзину →</a>
            </div>
            <p class="bulk-hint">От ${BULK_MIN} шт — ${money(linePrice(p, BULK_MIN))} / шт: опт −25% применится в корзине сам</p>
            <p class="p-ask">Остались вопросы? <a href="https://t.me/telemaster" target="_blank" rel="noopener">Спросите в Telegram →</a></p>
            <ul class="p-specs">
              <li><span>Категория</span><b><a href="#/category/${escAttr(p.cat.id)}">${esc(p.cat.name)}</a></b></li>
              <li><span>Артикул</span><b>${esc(p.sku)}</b></li>
              <li><span>Наличие</span><b>${p.stock > 0 ? "В наличии · " + p.stock + " шт" : "Нет в наличии"}</b></li>
              <li><span>Доставка</span><b>24 часа · от 3 000 ₽ бесплатно</b></li>
            </ul>
          </div>
        </div>
        ${analogs.length ? `
        <h3 class="p-analogs-title">Похожие товары</h3>
        <div class="products">${analogs.map((a) => productCard(a)).join("")}</div>` : ""}
        ${reviewsHtml(p)}
        <div class="page-back">
          <a class="btn btn--ghost" href="#/category/${escAttr(p.cat.id)}">← Назад в категорию</a>
          <button class="btn btn--ghost" type="button" data-share="${escAttr(p.id)}">Поделиться</button>
        </div>
      </section>`;
  };

  const viewSearch = (rawQuery) => {
    let query = "";
    try { query = decodeURIComponent(rawQuery || "").trim(); } catch { query = ""; }
    const results = searchProducts(query);
    const grid = results.length
      ? `<div class="products">${results.map((p) => productCard(p)).join("")}</div>`
      : `<div class="cart-empty"><b>Ничего не нашли</b>Попробуйте «ESP32», «резистор», «WAGO» или артикул — например, STM-F103-C8T6.<div><a class="btn btn--primary" href="#/catalog">Смотреть весь каталог</a></div></div>`;
    return `
      <section class="page container">
        <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Поиск</span></nav>
        <h2 class="page-title">Поиск: «${esc(query)}»</h2>
        <p class="page-sub">${results.length ? `Найдено: ${results.length}` : "Совпадений нет"}</p>
        <form class="p-search" id="pageSearchForm">
          <input type="search" name="q" value="${escAttr(query)}" placeholder="Артикул или название…" aria-label="Поиск по каталогу">
          <button class="btn btn--primary" type="submit">Найти</button>
        </form>
        ${grid}
      </section>`;
  };

  const viewNotFound = () => `
    <section class="page container">
      <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Страница не найдена</span></nav>
      <div class="cart-empty">
        <b>Такой страницы нет</b>
        Зато есть каталог, корзина и личный кабинет.
        <div><a class="btn btn--primary" href="#/catalog">В каталог</a></div>
      </div>
    </section>`;

  const renderRoute = () => {
    const hash = location.hash;
    const parts = hash.startsWith("#/") ? hash.slice(2).split("/").filter(Boolean) : [];
    const view = parts[0] || "home";

    if (view === "home") {
      pageMain.hidden = true;
      homeMain.hidden = false;
      // возврат на якорь лендинга (например, #hits или #hero)
      if (hash.length > 1) {
        const anchor = document.getElementById(hash.slice(1));
        if (anchor) anchor.scrollIntoView({ behavior: "auto", block: "start" });
      }
      return;
    }

    homeMain.hidden = true;
    pageMain.hidden = false;

    if (view === "catalog") {
      pageMain.innerHTML = viewCatalog();
      wireCatalog();
    } else if (view === "category" && parts[1]) {
      pageMain.innerHTML = viewCategory(parts[1]) || viewNotFound();
      const catSort = document.getElementById("categorySort");
      if (catSort) {
        catSort.value = categorySort;
        catSort.addEventListener("change", () => { categorySort = catSort.value; renderRoute(); });
      }
    } else if (view === "product" && parts[1]) {
      reviewRating = 5;
      // недавно просмотренные для кабинета
      try {
        const rk = "tm-recent";
        const list = JSON.parse(localStorage.getItem(rk) || "[]").filter((x) => x !== parts[1]);
        list.unshift(parts[1]);
        localStorage.setItem(rk, JSON.stringify(list.slice(0, 8)));
      } catch { /* ignore */ }
      pageMain.innerHTML = viewProduct(parts[1]) || viewNotFound();
    } else if (view === "search") {
      const raw = hash.startsWith("#/search/") ? hash.slice("#/search/".length) : (parts[1] || "");
      pageMain.innerHTML = viewSearch(raw);
      const f = document.getElementById("pageSearchForm");
      if (f) f.addEventListener("submit", (e) => { e.preventDefault(); goSearch(f.elements.q.value); });
    } else if (view === "cart") {
      pageMain.innerHTML = viewCart();
    } else if (view === "checkout") {
      pageMain.innerHTML = viewCheckout();
      const form = document.getElementById("checkoutForm");
      if (form) {
        const subtotal = Object.entries(cartStore.read()).reduce((s, [id, qty]) => {
          const p = findProduct(id);
          return s + (p ? lineSum(p, qty) : 0);
        }, 0);
        // восстанавливаем промокод с прошлого раза
        try {
          const saved = localStorage.getItem("tm-promo-active");
          if (saved) {
            const f = getPromos().find((p) => p.active && p.code === saved);
            activePromo = f ? { code: f.code, type: f.type, value: f.value } : null;
            if (!f) localStorage.removeItem("tm-promo-active");
          }
        } catch { /* ignore */ }
        const promoInput = document.getElementById("promoInput");
        const promoMsg = document.getElementById("promoMsg");
        const promoLine = document.getElementById("promoLine");
        if (activePromo && promoInput) promoInput.value = activePromo.code;
        const recalc = () => {
          const method = form.elements.delivery.value;
          const fee = deliveryFee(method, subtotal);
          const disc = promoDiscount(subtotal);
          document.getElementById("coFee").textContent = money(fee);
          if (promoLine) {
            promoLine.hidden = !(disc > 0);
            if (disc > 0) {
              document.getElementById("promoName").textContent = activePromo.code;
              document.getElementById("promoSum").textContent = "−" + money(disc);
            }
          }
          document.getElementById("coTotal").textContent = money(subtotal - disc + fee);
          document.getElementById("coAddressWrap").hidden = method === "pickup";
        };
        const applyBtn = document.getElementById("promoApply");
        if (applyBtn) {
          applyBtn.addEventListener("click", () => {
            const code = ((promoInput && promoInput.value) || "").trim().toUpperCase();
            const found = getPromos().find((p) => p.active && p.code === code);
            if (!found) {
              activePromo = null;
              try { localStorage.removeItem("tm-promo-active"); } catch { /* ignore */ }
              if (promoMsg) { promoMsg.textContent = code ? "Такого промокода нет" : "Введите промокод"; promoMsg.hidden = false; }
            } else {
              activePromo = { code: found.code, type: found.type, value: found.value };
              try { localStorage.setItem("tm-promo-active", found.code); } catch { /* ignore */ }
              if (promoMsg) promoMsg.hidden = true;
              showToast("Промокод применён: " + found.code);
            }
            recalc();
          });
        }
        form.addEventListener("change", recalc);
        recalc();
      }
    } else if (view === "cabinet") {
      pageMain.innerHTML = viewCabinet();
      // анимированный подсчёт бонусов
      const bonusEl = pageMain.querySelector(".cab-bonus");
      if (bonusEl) {
        const target = parseInt(bonusEl.dataset.bonus, 10);
        const start = performance.now();
        const step = (now) => {
          const p = Math.min((now - start) / 1200, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          bonusEl.textContent = formatNumber(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    } else if (view === "admin") {
      pageMain.innerHTML = isAdmin() ? viewAdmin() : viewAdminLogin();
      if (isAdmin() && USE_API) {
        // Этап 1: фоновая попытка взять данные с API (401 → fallback localStorage, пока нет JWT)
        apiGet("/api/leads").then((d) => { if (d) console.info("[api] leads from server", d.length); });
        apiGet("/api/orders").then((d) => { if (d) console.info("[api] orders from server", d.length); });
      }
    } else {
      pageMain.innerHTML = viewNotFound();
    }

    // 3D-вход страницы: сброс + ретриггер анимации (чистый CSS, контент не зависит от таймеров)
    pageMain.classList.remove("page-anim");
    void pageMain.offsetWidth;
    pageMain.classList.add("page-anim");
    window.scrollTo({ top: 0, behavior: "auto" });
    unfreeze(pageMain);
    if (window.__starsRefresh) window.__starsRefresh();
    if (window.__modelsRefresh) window.__modelsRefresh();
  };

  // hybrid: сначала API, при ошибке — localStorage (старый код не удаляем)
  const placeOrder = async (form) => {
    let entries = Object.entries(cartStore.read());
    if (!entries.length) return;
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    const err = document.getElementById("coErr");
    const ok = name.length >= 2 && phone.replace(/\D/g, "").length >= 11;
    if (err) err.hidden = ok;
    form.elements.name.classList.toggle("is-error", name.length < 2);
    form.elements.phone.classList.toggle("is-error", phone.replace(/\D/g, "").length < 11);
    if (!ok) return;
    entries = entries.map(([id, qty]) => {
      const p = findProduct(id);
      if (!p) return null;
      const capped = Math.min(qty, Number.isFinite(p.stock) ? p.stock : qty);
      if (capped <= 0) return null;
      return [id, capped];
    }).filter(Boolean);
    if (!entries.length) { showToast("Корзина пуста или товар закончился"); return; }
    const delivery = form.elements.delivery.value;
    const subtotal = entries.reduce((sum, [id, qty]) => {
      const p = findProduct(id);
      return sum + (p ? lineSum(p, qty) : 0);
    }, 0);
    const fee = deliveryFee(delivery, subtotal);
    const discount = promoDiscount(subtotal);
    const promoCode = activePromo ? activePromo.code : "";
    const items = entries.reduce((sum, [, qty]) => sum + qty, 0);
    const lines = entries.map(([id, qty]) => {
      const p = findProduct(id);
      return p ? { id, name: p.name, price: linePrice(p, qty), qty } : null;
    }).filter(Boolean);
    const payload = {
      name, phone, delivery, pay: form.elements.pay.value,
      address: form.elements.address.value.trim(), comment: form.elements.comment.value.trim(),
      items, subtotal, fee, total: subtotal - discount + fee, discount, promo: promoCode, lines,
    };
    const doLocal = () => {
      const orders = getOrdersRaw();
      const order = { no: orders.reduce((m, o) => Math.max(m, o.no || 0), 1042) + 1, ...payload, status: "Собирается" };
      orders.unshift(order);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 10)));
      return order;
    };
    let order = null;
    if (USE_API) {
      try {
        const res = await fetch(`${API_BASE}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error("api");
        const data = await res.json();
        order = { ...payload, no: data.no || payload.no || 1043, status: data.status || "Собирается" };
        // кэшируем и локально для fallback-видимости кабинета до Этапа 5
        try { const l = getOrdersRaw(); l.unshift(order); localStorage.setItem(ORDERS_KEY, JSON.stringify(l.slice(0, 10))); } catch { /* ignore */ }
      } catch {
        order = doLocal();
      }
    } else {
      order = doLocal();
    }
    const clean = (s) => String(s == null ? "" : s).replace(/[<>&]/g, "");
    sendTelegramInsecureDemo(`Новый заказ № ${order.no} на ${money(order.total)}\n${clean(order.name)}, ${clean(order.phone)}\n${DELIVERY_NAMES[order.delivery] || ""}${order.address ? " · " + clean(order.address) : ""}${promoCode ? `\nПромокод ${promoCode}: −${money(discount)}` : ""}\n${(order.lines || []).map((l) => `${clean(l.name)} × ${l.qty}`).join("\n")}`);
    cartStore.clear();
    activePromo = null;
    try { localStorage.removeItem("tm-promo-active"); } catch { /* ignore */ }
    pageMain.classList.remove("page-anim");
    void pageMain.offsetWidth;
    pageMain.innerHTML = viewOrderDone(order);
    pageMain.classList.add("page-anim");
    boomConfetti();
    window.scrollTo({ top: 0, behavior: "auto" });
    unfreeze(pageMain);
    if (window.__modelsRefresh) window.__modelsRefresh();
  };

  const renderCatalogGrid = () => {
    const grid = document.getElementById("catalogGrid");
    if (!grid) return;
    grid.innerHTML = catalogGridHtml();
    grid.classList.toggle("is-table", catalogState.view === "table");
    document.querySelectorAll("#catalogChips .chip-btn").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.cat === catalogState.cat);
    });
    document.querySelectorAll(".seg__btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.view === catalogState.view);
    });
    const count = document.getElementById("catalogCount");
    if (count) {
      const n = getCatalogItems().length;
      const total = getProducts().length;
      count.textContent = n === total
        ? `${total} позиций в наличии — от одной штуки, без минимального заказа`
        : `Показано ${n} из ${total}`;
    }
  };

  const wireCatalog = () => {
    renderCatalogGrid();
    const search = document.getElementById("catalogSearch");
    const sort = document.getElementById("catalogSort");
    if (sort) sort.value = catalogState.sort;
    if (search) search.addEventListener("input", () => { catalogState.q = search.value; renderCatalogGrid(); });
    if (sort) sort.addEventListener("change", () => { catalogState.sort = sort.value; renderCatalogGrid(); });
  };

  // единый обработчик кликов для всех динамических страниц
  document.addEventListener("click", (e) => {
    const target = e.target.closest(
      "[data-add], [data-qty], [data-remove], [data-fav], [data-pass-eye], [data-star], [data-thumb], [data-share], [data-tg-login], [data-social], [data-checkout], [data-open-auth], [data-logout], [data-cat], [data-view], [data-admin-tab], [data-admin-logout], [data-lead-done], [data-lead-del], [data-del-product], [data-save-product], [data-export], [data-review-ok], [data-review-del], [data-del-order], [data-del-cat], [data-reset-demo], [data-img-product], [data-del-img], [data-reorder], [data-promo-toggle], [data-promo-del], [data-tg-test]"
    );
    if (!target) return;

    if (target.dataset.add) {
      cartStore.add(target.dataset.add);
      popCartCounter();
      flyToCart(target);
      cartFeedback(target);
    } else if (target.dataset.qty) {
      const id = target.dataset.id;
      const delta = target.dataset.qty === "plus" ? 1 : -1;
      cartStore.setQty(id, (cartStore.read()[id] || 0) + delta);
      renderRoute();
    } else if (target.dataset.remove) {
      cartStore.remove(target.dataset.remove);
      renderRoute();
    } else if (target.dataset.fav) {
      const on = favStore.toggle(target.dataset.fav);
      // обновляем сердечки на месте, без перерисовки (не теряем фокус фильтра)
      document.querySelectorAll(`[data-fav="${target.dataset.fav}"]`).forEach((b) => {
        b.classList.toggle("is-active", on);
      });
      // в кабинете список избранного перерисовываем целиком
      if (location.hash.startsWith("#/cabinet")) renderRoute();
    } else if (target.hasAttribute("data-share")) {
      const url = location.origin + location.pathname + "#/product/" + target.dataset.share;
      if (navigator.share) {
        navigator.share({ title: document.title, url }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(
          () => showToast("Ссылка скопирована — отправьте другу"),
          () => showToast(url)
        );
      } else {
        showToast(url);
      }
    } else if (target.dataset.thumb) {
      const main = document.getElementById("pGalleryMain");
      if (main) main.src = target.dataset.thumb;
      document.querySelectorAll(".p-thumb").forEach((b) => {
        b.classList.toggle("is-active", b === target || b.contains(target));
      });
    } else if (target.dataset.star) {
      reviewRating = parseInt(target.dataset.star, 10) || 5;
      document.querySelectorAll("#starPick .star-btn").forEach((b) => {
        b.classList.toggle("is-active", (parseInt(b.dataset.star, 10) || 0) <= reviewRating);
      });
    } else if (target.hasAttribute("data-pass-eye")) {
      const input = authForm.elements.password;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      target.textContent = show ? "Скрыть" : "Показать";
      target.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
    } else if (target.hasAttribute("data-reorder")) {
      const o = getOrdersForCabinet()[parseInt(target.dataset.reorder, 10)];
      if (o && o.lines) {
        const cart = cartStore.read();
        let added = 0;
        o.lines.forEach((l) => {
          const p = findProduct(l.id);
          if (!p) return;
          cart[l.id] = Math.min((cart[l.id] || 0) + l.qty, p.stock || 999999);
          added++;
        });
        cartStore.write(cart);
        showToast(added ? "Товары снова в корзине" : "Этих товаров уже нет в каталоге");
        location.hash = "#/cart";
      }
    } else if (target.hasAttribute("data-tg-login")) {
      // здесь будет интеграция: Telegram Login Widget → POST /api/auth/tg
      const users = getUsers();
      if (!users.tg) users.tg = { name: "Гость из Telegram", phone: "", pass: "", salt: "", created: Date.now() };
      saveUsers(users);
      authForm.reset();
      doLoginSuccess(users.tg, false, "tg");
    } else if (target.dataset.social) {
      // здесь будет интеграция: OAuth VK/Google → POST /api/auth/oauth
      const kind = target.dataset.social;
      const names = { vk: "Гость из VK", gg: "Гость из Google" };
      const users = getUsers();
      if (!users[kind]) users[kind] = { name: names[kind] || "Гость", phone: "", pass: "", salt: "", created: Date.now() };
      saveUsers(users);
      authForm.reset();
      doLoginSuccess(users[kind], false, kind);
    } else if (target.hasAttribute("data-checkout")) {
      location.hash = "#/checkout";
    } else if (target.hasAttribute("data-open-auth")) {
      openModal();
    } else if (target.hasAttribute("data-logout")) {
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_NAME_KEY);
        localStorage.removeItem(LEGACY_PHONE_KEY);
      } catch { /* ignore */ }
      refreshLoginBtn();
      renderRoute();
      showToast("Вы вышли из аккаунта");
    } else if (target.hasAttribute("data-cat")) {
      catalogState.cat = target.dataset.cat;
      renderCatalogGrid();
    } else if (target.dataset.view) {
      catalogState.view = target.dataset.view;
      renderCatalogGrid();
    } else if (target.hasAttribute("data-admin-tab")) {
      adminTab = target.dataset.adminTab;
      renderRoute();
    } else if (target.hasAttribute("data-admin-logout")) {
      sessionStorage.removeItem("tm-admin");
      location.hash = "#/";
      renderRoute();
    } else if (target.hasAttribute("data-lead-done")) {
      const id = Number(target.dataset.leadDone);
      saveLeads(getLeadsRaw().map((l) => (l.id === id ? { ...l, done: !l.done } : l)));
      renderRoute();
    } else if (target.hasAttribute("data-tg-test")) {
      const { tgToken, tgChat } = getSettings();
      if (!tgToken || !tgChat) { showToast("Сначала сохраните токен и ID чата"); return; }
      sendTelegramInsecureDemo("Проверка связи: ТЕЛЕМАСТЕР на связи ✅");
      showToast("Тест отправлен — проверьте чат");
    } else if (target.hasAttribute("data-lead-del")) {
      const id = Number(target.dataset.leadDel);
      saveLeads(getLeadsRaw().filter((l) => l.id !== id));
      renderRoute();
    } else if (target.hasAttribute("data-promo-toggle")) {
      const code = target.dataset.promoToggle;
      savePromos(getPromos().map((p) => (p.code === code ? { ...p, active: !p.active } : p)));
      renderRoute();
    } else if (target.hasAttribute("data-promo-del")) {
      const code = target.dataset.promoDel;
      savePromos(getPromos().filter((p) => p.code !== code));
      if (activePromo && activePromo.code === code) {
        activePromo = null;
        try { localStorage.removeItem("tm-promo-active"); } catch { /* ignore */ }
      }
      renderRoute();
    } else if (target.hasAttribute("data-del-product")) {
      saveCustomProducts(getCustomProducts().filter((p) => p.id !== target.dataset.delProduct));
      renderRoute();
    } else if (target.hasAttribute("data-save-product")) {
      const id = target.dataset.saveProduct;
      const row = target.closest("[data-row]");
      const price = Math.max(0, parseInt(row.querySelector('[data-f="price"]').value, 10) || 0);
      const stock = Math.max(0, parseInt(row.querySelector('[data-f="stock"]').value, 10) || 0);
      const custom = getCustomProducts();
      const ci = custom.findIndex((p) => p.id === id);
      if (ci >= 0) {
        custom[ci].price = price;
        custom[ci].stock = stock;
        saveCustomProducts(custom);
      } else {
        const ov = getOverrides();
        ov[id] = { ...(ov[id] || {}), price, stock };
        saveOverrides(ov);
      }
      showToast("Цена и остаток сохранены");
      renderRoute();
    } else if (target.hasAttribute("data-img-product")) {
      const id = target.dataset.imgProduct;
      const fi = document.createElement("input");
      fi.type = "file";
      fi.accept = "image/*";
      fi.onchange = async () => {
        const file = fi.files && fi.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { showToast("Файл больше 8 МБ"); return; }
        let url = "";
        try { url = await fileToDataUrl(file); }
        catch { showToast("Не получилось прочитать файл"); return; }
        try {
          const custom = getCustomProducts();
          const ci = custom.findIndex((x) => x.id === id);
          if (ci >= 0) {
            custom[ci].img = url;
            saveCustomProducts(custom);
          } else {
            const ov = getOverrides();
            const base = ALL.find((x) => x.id === id);
            ov[id] = {
              price: (ov[id] && ov[id].price) ?? (base ? base.price : 0),
              stock: (ov[id] && ov[id].stock) ?? (base ? base.stock : 0),
              img: url,
            };
            saveOverrides(ov);
          }
        } catch { showToast("Хранилище переполнено — сожмите фото"); return; }
        showToast("Фото сохранено");
        renderRoute();
      };
      fi.click();
    } else if (target.hasAttribute("data-del-img")) {
      const id = target.dataset.delImg;
      const custom = getCustomProducts();
      const ci = custom.findIndex((x) => x.id === id);
      if (ci >= 0) {
        custom[ci].img = "";
        saveCustomProducts(custom);
      } else {
        const ov = getOverrides();
        if (ov[id]) {
          delete ov[id].img;
          if (ov[id].price == null && ov[id].stock == null) delete ov[id];
          saveOverrides(ov);
        }
      }
      showToast("Фото убрано");
      renderRoute();
    } else if (target.dataset.export) {
      // здесь будет интеграция: выгрузка из CRM вместо localStorage
      const kind = target.dataset.export;
      const head = kind === "leads"
        ? ["Имя", "Контакт", "Канал", "Дата", "Статус"]
        : kind === "products"
          ? ["Название", "Артикул", "Категория", "Цена", "Остаток"]
          : ["Номер", "Позиций", "Сумма", "Имя", "Телефон", "Доставка", "Оплата", "Состав", "Статус"];
      const rows = kind === "leads"
        ? getLeads().map((l) => [l.name, l.contact, l.channel, l.date, l.done ? "Обработана" : "Новая"])
        : kind === "products"
          ? getProducts().map((p) => [p.name, p.sku, p.cat.name, p.price, p.stock])
          : getOrders().map((o) => [o.no, o.items, o.total, o.name || "", o.phone || "", DELIVERY_NAMES[o.delivery] || o.delivery || "", o.pay || "", (o.lines || []).map((l) => `${l.name} × ${l.qty}`).join("; "), o.status || "Собирается"]);
      const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = kind === "leads" ? "telemaster-leads.csv" : kind === "products" ? "telemaster-products.csv" : "telemaster-orders.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("CSV скачан");
    } else if (target.dataset.reviewOk) {
      const [pid, rid] = target.dataset.reviewOk.split("|");
      const all = getReviews();
      const r = (all[pid] || []).find((x) => x.id === rid);
      if (r) {
        r.ok = true;
        saveReviews(all);
        showToast("Отзыв опубликован");
      }
      renderRoute();
    } else if (target.dataset.reviewDel) {
      const [pid, rid] = target.dataset.reviewDel.split("|");
      const all = getReviews();
      all[pid] = (all[pid] || []).filter((x) => x.id !== rid);
      saveReviews(all);
      showToast("Отзыв удалён");
      renderRoute();
    } else if (target.hasAttribute("data-del-order")) {
      const orders = getOrders();
      orders.splice(parseInt(target.dataset.delOrder, 10), 1);
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
      showToast("Заказ удалён");
      renderRoute();
    } else if (target.hasAttribute("data-del-cat")) {
      const id = target.dataset.delCat;
      if (getProducts().some((p) => p.cat.id === id)) {
        showToast("В категории есть товары — сначала удалите их");
      } else {
        saveCustomCats(getCustomCats().filter((c) => c.id !== id));
        renderCatnav();
        renderRoute();
        showToast("Категория удалена");
      }
    } else if (target.hasAttribute("data-reset-demo")) {
      if (confirm("Удалить свои товары, категории и правки цен? Заказы, заявки и отзывы останутся.")) {
        ["tm-overrides", "tm-custom-products", "tm-custom-cats"].forEach((k) => {
          try { localStorage.removeItem(k); } catch { /* ignore */ }
        });
        renderCatnav();
        renderRoute();
        showToast("Демо-данные сброшены");
      }
    }
  });

  window.addEventListener("hashchange", renderRoute);

  /* ============================================================
     АДМИНПАНЕЛЬ (#/admin) — пароль, товары, заявки, заказы
     ============================================================ */
  let adminTab = "products";

  const isAdmin = () => {
    try {
      const raw = sessionStorage.getItem("tm-admin");
      if (!raw) return false;
      const sess = JSON.parse(raw);
      if (!sess || sess.ok !== 1 || typeof sess.exp !== "number" || Date.now() > sess.exp) {
        sessionStorage.removeItem("tm-admin");
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };
  const setAdminSession = () => {
    try {
      sessionStorage.setItem("tm-admin", JSON.stringify({ ok: 1, exp: Date.now() + ADMIN_TTL_MS }));
    } catch { /* ignore */ }
  };

  // фолбек для :has() — старые браузеры без :has
  document.addEventListener("change", (e) => {
    const r = e.target.closest && e.target.closest(".co-radio");
    if (!r || e.target.type !== "radio") return;
    document.querySelectorAll(".co-radio").forEach((x) => x.classList.remove("is-checked"));
    r.classList.add("is-checked");
  });

  const getLeads = () => {
    if (!isAdmin()) return [];
    try { return JSON.parse(localStorage.getItem("tm-leads")) || []; } catch { return []; }
  };
  const getLeadsRaw = () => {
    try { return JSON.parse(localStorage.getItem("tm-leads")) || []; } catch { return []; }
  };
  const saveLeads = (list) => localStorage.setItem("tm-leads", JSON.stringify(list.slice(0, 100)));

  const SETTINGS_KEY = "tm-settings";
  // WARNING: INSECURE DEMO — токен Telegram хранится в localStorage в открытую.
  // Любой XSS или доступ к DevTools раскрывает tgToken. В продакшене: хранить токен
  // только на сервере, клиент шлёт POST /api/telegram/send {text}, сервер сам дергает Bot API.
  const getSettings = () => {
    try {
      const s = Object.assign({ tgToken: "", tgChat: "" }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
      if (s.tgToken) {
        try { console.warn("[telemaster] WARNING: tgToken хранится в localStorage (небезопасно). В проде вынести в серверный прокси."); } catch { /* ignore */ }
      }
      return s;
    } catch { return { tgToken: "", tgChat: "" }; }
  };
  /**
   * ⚠️ DEMO ONLY — INSECURE
   * Токен уходит прямо из браузера: fetch("https://api.telegram.org/bot"+tgToken+"/sendMessage")
   * Токен виден в DevTools → Network, доступен любому XSS. Не использовать в продакшене.
   * Прод: клиент → POST /api/telegram/send {text} → сервер (токен в env) → Bot API.
   * Fire-and-forget, молча терпим офлайн и пустые ключи.
   */
  const sendTelegramInsecureDemo = (text) => {
    try {
      const { tgToken, tgChat } = getSettings();
      if (!tgToken || !tgChat) return;
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text, parse_mode: "HTML", disable_web_page_preview: true }),
      }).catch(() => {});
    } catch { /* ignore */ }
  };
  // alias для обратной совместимости (если где-то остался старый вызов)
  const sendTelegram = sendTelegramInsecureDemo;

  const viewAdminLogin = () => `
    <section class="page container">
      <form class="login-required" id="adminLoginForm">
        <span class="lock-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
        </span>
        <h3>Админпанель</h3>
        <p>Доступ только для сотрудников магазина</p>
        <div class="admin-demo-banner" role="note" style="background:var(--beige);border:1px solid var(--border);border-left:3px solid var(--red);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.4;color:var(--muted);margin-bottom:14px">⚠️ Демо-защита. Пароль хранится на клиенте — в продакшене нужна серверная авторизация (JWT + POST /api/admin/login).</div>
        <label>
          <span>Пароль</span>
          <input type="password" name="password" placeholder="••••••••" required>
        </label>
        <button class="btn btn--primary btn--full" type="submit">Войти</button>
        <p class="admin-err" id="adminErr" hidden>Неверный пароль</p>
      </form>
    </section>`;

  const adminProductsTab = () => {
    const customCats = getCustomCats();
    return `
    <div class="admin-card admin-cats">
      <b class="admin-form-title">Категории</b>
      <div class="catman">
        <div class="catman__list">
          ${CATALOG.map((c) => `<span class="catman__item">${esc(c.name)}<i>база</i></span>`).join("")}
          ${customCats.map((c) => {
            const n = getProducts().filter((p) => p.cat.id === c.id).length;
            return `<span class="catman__item">${esc(c.name)}<i>${n} поз.</i><button type="button" data-del-cat="${c.id}" aria-label="Удалить категорию">×</button></span>`;
          }).join("")}
        </div>
        <form class="catman__form" id="adminCatForm">
          <input name="name" placeholder="Название — например, Светодиоды" required aria-label="Название категории">
          <input name="desc" placeholder="Описание" aria-label="Описание категории">
          <select name="icon" aria-label="Иконка">
            <option value="chip">Чип</option>
            <option value="ic">Микросхема</option>
            <option value="wave">Волна</option>
            <option value="sensor">Датчик</option>
            <option value="conn">Разъём</option>
            <option value="tool">Инструмент</option>
          </select>
          <button class="btn btn--primary btn--sm" type="submit">+ Категория</button>
        </form>
      </div>
    </div>
    <div class="admin-grid">
      <form class="admin-card" id="adminProductForm">
        <b class="admin-form-title">Новая позиция</b>
        <label>
          <span>Категория</span>
          <select name="catId">${getCatalog().map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
        </label>
        <label>
          <span>Название</span>
          <input name="name" placeholder="Датчик HC-SR04" required>
        </label>
        <label>
          <span>Артикул</span>
          <input name="sku" placeholder="S-HC-SR04" required>
        </label>
        <label>
          <span>Цена, ₽</span>
          <input name="price" type="number" min="1" placeholder="95" required>
        </label>
        <label>
          <span>Остаток, шт</span>
          <input name="stock" type="number" min="0" placeholder="100" required>
        </label>
        <label>
          <span>Фото (URL, необязательно)</span>
          <input name="img" placeholder="img/datchik.jpg или https://…">
        </label>
        <button class="btn btn--primary btn--full" type="submit">Добавить товар</button>
        <p class="admin-ok" id="productOk" hidden>✓ Товар добавлен в каталог</p>
      </form>
      <div class="admin-card">
        <b class="admin-form-title">Все позиции (${getProducts().length})</b>
        <div class="admin-products">
          ${getProducts().map((p) => `
            <div class="admin-product" data-row="${p.id}">
              <span class="admin-thumb">${productImg(p)}</span>
              <span class="admin-product__name">${esc(p.name)}<small>${esc(p.sku)}</small></span>
              <label>₽<input class="admin-mini" type="number" min="0" step="1" value="${p.price}" data-f="price" aria-label="Цена"></label>
              <label>шт<input class="admin-mini" type="number" min="0" step="1" value="${p.stock}" data-f="stock" aria-label="Остаток"></label>
              <button class="btn btn--ghost btn--sm" type="button" data-save-product="${escAttr(p.id)}">OK</button>
              <button class="btn btn--ghost btn--sm" type="button" data-img-product="${escAttr(p.id)}">Фото</button>
              ${p.img ? `<button class="linklike" type="button" data-del-img="${escAttr(p.id)}">убрать</button>` : ""}
              ${p.custom
                ? `<button class="cart-remove" type="button" data-del-product="${escAttr(p.id)}" aria-label="Удалить">×</button>`
                : `<span class="admin-base-tag">база</span>`}
            </div>`).join("")}
        </div>
      </div>
    </div>`;
  };

  const adminLeadsTab = (leads) => {
    if (!leads.length) {
      return `<div class="cart-empty"><b>Заявок пока нет</b>Форма «Задать вопрос» на главной складывает их сюда.</div>`;
    }
    return `
      <div class="admin-leads">
        ${leads.map((l) => `
          <div class="lead-card ${l.done ? "is-done" : ""}">
            <div class="lead-card__main">
              <b>${esc(l.name)}</b>
              <span>${esc(l.contact)} · ответить: ${esc(l.channel)}</span>
              <small>${esc(l.date)}</small>
            </div>
            <div class="lead-card__actions">
              <button class="btn btn--ghost btn--sm" data-lead-done="${escAttr(String(l.id))}">${l.done ? "Вернуть в новые" : "Обработано ✓"}</button>
              <button class="cart-remove" type="button" data-lead-del="${escAttr(String(l.id))}" aria-label="Удалить">×</button>
            </div>
          </div>`).join("")}
      </div>`;
  };

  const adminOrdersTab = () => {
    const orders = getOrders();
    if (!orders.length) {
      return `<div class="cart-empty"><b>Заказов пока нет</b>Оформленные на сайте заказы появятся здесь.</div>`;
    }
    return `
      <div class="admin-leads">
        ${orders.map((o, i) => `
          <div class="lead-card">
            <div class="lead-card__main">
              <b>№ ${esc(String(o.no))}</b>
              <span>${esc(String(o.items))} поз. на ${money(o.total)}${o.name ? ` · ${esc(o.name)}, ${esc(o.phone || "")}` : ""}</span>
              ${o.delivery ? `<small>${esc(DELIVERY_NAMES[o.delivery] || o.delivery)}${o.address ? " · " + esc(o.address) : ""}${o.pay ? " · оплата: " + esc(o.pay) : ""}</small>` : ""}
              ${(o.lines || []).length ? `<small class="order-lines">${o.lines.map((l) => `${esc(l.name)} × ${l.qty}`).join("; ")}</small>` : ""}
            </div>
            <div class="lead-card__actions">
              <select class="admin-status" data-order-status="${i}">
                ${["Собирается", "Отправлен", "Выдан"].map((s) => `<option ${((o.status || "Собирается") === s) ? "selected" : ""}>${s}</option>`).join("")}
              </select>
              <button class="cart-remove" type="button" data-del-order="${i}" aria-label="Удалить заказ">×</button>
            </div>
          </div>`).join("")}
      </div>`;
  };

  const adminReviewsTab = () => {
    const all = getReviews();
    const pids = Object.keys(all).filter((k) => k !== "__seeded" && (all[k] || []).length);
    if (!pids.length) {
      return `<div class="cart-empty"><b>Отзывов пока нет</b>Когда покупатели напишут отзывы, они появятся здесь на проверке.</div>`;
    }
    return `
      <div class="admin-leads">
        ${pids.map((pid) => {
          const p = findProduct(pid);
          return all[pid].map((r) => `
            <div class="lead-card ${r.ok ? "is-done" : ""}">
              <div class="lead-card__main">
                <b>${esc(r.name)} ${starsHtml(r.rating)}</b>
                <span>${p ? `<a href="#/product/${escAttr(pid)}">${esc(p.name)}</a>` : esc(pid)} · ${esc(r.date || "")}${r.ok ? "" : " · на проверке"}</span>
                <small>${esc(r.text)}</small>
              </div>
              <div class="lead-card__actions">
                ${r.ok ? "" : `<button class="btn btn--ghost btn--sm" data-review-ok="${escAttr(pid)}|${escAttr(String(r.id))}">Опубликовать</button>`}
                <button class="cart-remove" type="button" data-review-del="${escAttr(pid)}|${escAttr(String(r.id))}" aria-label="Удалить отзыв">×</button>
              </div>
            </div>`).join("");
        }).join("")}
      </div>`;
  };

  const promoDesc = (p) => (p.type === "pct" ? `−${p.value}%` : `−${money(p.value)}`);

  const adminPromosTab = () => {
    const list = getPromos();
    return `
      <form class="admin-card" id="adminPromoForm" style="max-width:560px;margin-bottom:16px">
        <b class="admin-form-title">Новый промокод</b>
        <label><span>Код</span><input name="code" placeholder="SALE20" autocomplete="off"></label>
        <label><span>Тип</span>
          <select name="type">
            <option value="pct">Процент от суммы</option>
            <option value="fix">Фиксированная сумма ₽</option>
          </select>
        </label>
        <label><span>Значение</span><input name="value" type="number" min="1" placeholder="10" inputmode="numeric"></label>
        <button class="btn btn--primary" type="submit">Добавить</button>
      </form>
      ${list.length ? `
      <div class="admin-leads">
        ${list.map((p) => `
          <div class="lead-card ${p.active ? "" : "is-done"}">
            <div class="lead-card__main">
              <b>${esc(p.code)} · ${promoDesc(p)}</b>
              <span>${p.active ? "активен" : "выключен"}</span>
            </div>
            <div class="lead-card__actions">
              <button class="btn btn--ghost btn--sm" type="button" data-promo-toggle="${escAttr(p.code)}">${p.active ? "Выключить" : "Включить"}</button>
              <button class="cart-remove" type="button" data-promo-del="${escAttr(p.code)}" aria-label="Удалить промокод">×</button>
            </div>
          </div>`).join("")}
      </div>` : `<div class="cart-empty"><b>Промокодов нет</b>Добавьте первый через форму выше.</div>`}`;
  };

  const adminSettingsTab = () => {
    const s = getSettings();
    return `
      <form class="admin-card" id="adminSettingsForm" style="max-width:560px">
        <div role="note" style="background:#fff3cd;border:1px solid #f0c36d;border-left:4px solid #c8102e;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.45;color:#5a3e00;margin-bottom:16px">⚠️ <b>Telegram-токен хранится в браузере. Это небезопасно.</b> Токен виден в DevTools → Application → Local Storage и в Network (URL <code>api.telegram.org/bot&lt;token&gt;/sendMessage</code>). При любом XSS токен утечёт и позволит слать сообщения от вашего бота. В продакшене нужен серверный прокси: клиент → <code>POST /api/telegram/send {text}</code> → сервер (токен в <code>.env</code> на сервере) → Bot API.</div>
        <b class="admin-form-title">Уведомления в Telegram</b>
        <p class="cart-note" style="margin-bottom:14px">Заявки и заказы будут падать в чат. Бот: @BotFather → токен; ID чата: @userinfobot.</p>
        <label>
          <span>Токен бота</span>
          <input name="tgToken" type="password" value="${esc(s.tgToken)}" placeholder="123456:ABC-DEF..." autocomplete="off">
        </label>
        <label>
          <span>ID чата</span>
          <input name="tgChat" value="${esc(s.tgChat)}" placeholder="123456789" inputmode="numeric">
        </label>
        <button class="btn btn--primary" type="submit">Сохранить</button>
        <button class="btn btn--ghost" type="button" data-tg-test style="margin-left:8px">Отправить тест</button>
        <p class="cart-note" style="margin-top:10px;font-size:12px;color:var(--muted)">Токен остаётся в <code>localStorage:tm-settings</code> до ручной очистки. Кнопка «Отправить тест» шлёт запрос напрямую из браузера — токен светится в Network.</p>
      </form>`;
  };

  const viewAdmin = () => {
    const newLeads = getLeads().filter((l) => !l.done).length;
    const orders = getOrders();
    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const pendRev = pendingReviewsCount();
    const tabs = [
      ["products", "Товары"],
      ["leads", `Заявки${newLeads ? ` · ${newLeads}` : ""}`],
      ["orders", `Заказы${orders.length ? ` · ${orders.length}` : ""}`],
      ["reviews", `Отзывы${pendRev ? ` · ${pendRev}` : ""}`],
      ["promos", "Промокоды"],
      ["settings", "Настройки"],
    ];
    let body = "";
    if (adminTab === "products") body = adminProductsTab();
    if (adminTab === "leads") body = adminLeadsTab(getLeads());
    if (adminTab === "orders") body = adminOrdersTab();
    if (adminTab === "reviews") body = adminReviewsTab();
    if (adminTab === "promos") body = adminPromosTab();
    if (adminTab === "settings") body = adminSettingsTab();
    const stats = [
      [getProducts().length, "позиций в каталоге"],
      [orders.length, "заказов"],
      [money(revenue), "выручка"],
      [newLeads, "новых заявок"],
    ];
    return `
      <section class="page container">
        <nav class="crumbs"><a href="#/">Главная</a><span>/</span><span>Админпанель</span></nav>
        <div class="cab-head admin-hero">
          <canvas class="admin__stars" id="adminCanvas" data-stars="admin" aria-hidden="true"></canvas>
          <h2>Админпанель</h2>
          <button class="btn btn--ghost btn--sm" data-reset-demo>Сбросить демо</button>
          <button class="btn btn--ghost btn--sm" data-admin-logout>Выйти</button>
        </div>
        <div class="stat-cards">
          ${stats.map(([v, l]) => `<div class="stat-card"><b>${v}</b><span>${l}</span></div>`).join("")}
        </div>
        <div class="chips">
          ${tabs.map(([id, label]) => `<button class="chip-btn ${adminTab === id ? "is-active" : ""}" data-admin-tab="${id}">${label}</button>`).join("")}
        </div>
        <div class="admin-toolbar">
          ${adminTab === "leads" && getLeads().length ? `<button class="btn btn--ghost btn--sm" data-export="leads">Скачать CSV</button>` : ""}
          ${adminTab === "orders" && getOrders().length ? `<button class="btn btn--ghost btn--sm" data-export="orders">Скачать CSV</button>` : ""}
          ${adminTab === "products" ? `<button class="btn btn--ghost btn--sm" data-export="products">Скачать CSV</button>` : ""}
        </div>
        ${body}
      </section>`;
  };

  // формы переживают перерисовки — слушаем делегированно
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "checkoutForm") {
      e.preventDefault();
      if (!hitRateLimit("checkout:" + (normPhone(e.target.elements.phone?.value || "") || "guest"))) { showToast("Слишком много заказов — попробуйте через 15 минут"); return; }
      placeOrder(e.target);
      return;
    }
    if (e.target.id === "reviewForm") {
      e.preventDefault();
      const f = e.target;
      const name = f.elements.name.value.trim();
      const text = f.elements.text.value.trim();
      const err = document.getElementById("revErr");
      const ok = /^[A-Za-zА-Яа-яЁё \-]{2,40}$/.test(name) && text.length >= 4 && text.length <= 500;
      if (err) { err.textContent = "Представьтесь и напишите пару слов о товаре (до 500 символов)"; err.hidden = ok; }
      f.elements.name.classList.toggle("is-error", !/^[A-Za-zА-Яа-яЁё \-]{2,40}$/.test(name));
      f.elements.text.classList.toggle("is-error", text.length < 4 || text.length > 500);
      if (!ok) return;
      // здесь будет интеграция: POST /api/reviews (модерация на сервере)
      const all = getReviews();
      const pid = f.dataset.pid;
      (all[pid] = all[pid] || []).push({
        id: "r" + Date.now(), name, rating: reviewRating, text,
        date: new Date().toLocaleDateString("ru-RU"), ts: Date.now(), ok: false,
      });
      saveReviews(all);
      reviewRating = 5;
      showToast("Спасибо! Отзыв появится после проверки");
      renderRoute();
      return;
    }
    if (e.target.id === "adminCatForm") {
      e.preventDefault();
      const f = e.target;
      const name = f.elements.name.value.trim();
      if (name.length < 2) return;
      const list = getCustomCats();
      list.push({
        id: "u" + Date.now(),
        name,
        desc: f.elements.desc.value.trim(),
        icon: f.elements.icon.value,
      });
      saveCustomCats(list);
      renderCatnav();
      renderRoute();
      showToast("Категория добавлена");
      return;
    }
    if (e.target.id === "adminPromoForm") {
      e.preventDefault();
      const f = e.target;
      const code = (f.elements.code.value || "").toUpperCase().replace(/[^A-ZА-Я0-9]/gi, "");
      const type = f.elements.type.value === "fix" ? "fix" : "pct";
      const value = Math.max(1, parseInt(f.elements.value.value, 10) || 0);
      if (code.length < 3 || !(value > 0)) { showToast("Код от 3 символов и значение больше 0"); return; }
      const list = getPromos().filter((p) => p.code !== code);
      list.unshift({ code, type, value, active: true });
      savePromos(list);
      renderRoute();
      showToast("Промокод " + code + " добавлен");
      return;
    }
    if (e.target.id === "adminSettingsForm") {
      e.preventDefault();
      const f = e.target;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          tgToken: f.elements.tgToken.value.trim(),
          tgChat: f.elements.tgChat.value.trim(),
        }));
      } catch { /* ignore */ }
      showToast("Настройки сохранены");
      return;
    }
    if (e.target.id === "adminLoginForm") {
      e.preventDefault();
      const input = e.target.elements.password;
      const raw = String(input.value || "");
      // демо: хешируем ввод и сравниваем с ADMIN_PASSWORD_HASH
      let ok = false;
      try {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
        ok = hex === ADMIN_PASSWORD_HASH;
      } catch {
        ok = false;
      }
      if (ok) {
        setAdminSession();
        renderRoute();
      } else {
        input.value = "";
        const err = document.getElementById("adminErr");
        if (err) err.hidden = false;
      }
    }
    if (e.target.id === "adminProductForm") {
      e.preventDefault();
      const f = e.target;
      const custom = getCustomProducts();
      custom.push({
        id: "c" + Date.now(),
        name: f.elements.name.value.trim(),
        sku: f.elements.sku.value.trim().toUpperCase(),
        price: parseInt(f.elements.price.value, 10) || 0,
        stock: parseInt(f.elements.stock.value, 10) || 0,
        img: f.elements.img.value.trim(),
        catId: f.elements.catId.value,
        custom: true,
      });
      saveCustomProducts(custom);
      f.reset();
      renderRoute();
    }
  });

  // смена статуса заказа в админке
  document.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-order-status]");
    if (!sel) return;
    const orders = getOrders();
    const order = orders[parseInt(sel.dataset.orderStatus, 10)];
    if (order) {
      order.status = sel.value;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
  });

  // первичный рендер — строго после определения всех вью и обработчиков
  renderRoute();
  updateCartBadge();
})();
