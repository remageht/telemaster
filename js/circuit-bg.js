/* ============================================================
   ТЕЛЕМАСТЕР — живой фон «печатная плата»
   Процедурная графика на canvas: дорожки с переходными
   отверстиями, корпуса МК и микросхем, резисторы, конденсаторы,
   кварцы, площадки — и сигналы, бегущие по дорожкам.
   Ни одного растрового изображения: резкость на любом DPI.
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("circuitCanvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PALETTE = {
    trace: "rgba(139, 108, 78, 0.14)",    // тёпло-серые дорожки на светлом фоне
    body: "rgba(93, 76, 60, 0.28)",       // обводка корпусов
    bodyFill: "rgba(255, 255, 255, 0.65)",// заливка корпусов — светлее фона
    label: "rgba(93, 76, 60, 0.40)",      // маркировка
    pad: "rgba(176, 137, 104, 0.35)",     // контактные площадки
    pulses: ["#c8102e", "#e05a2b", "#b08968"], // фирменный красный + терракота
  };

  // палитра подстраивается под тему сайта (светлая/Dala)
  function applyCircuitTheme() {
    const dala = document.documentElement.dataset.theme === "dala";
    PALETTE.trace = dala ? "rgba(139, 132, 255, 0.20)" : "rgba(139, 108, 78, 0.14)";
    PALETTE.body = dala ? "rgba(150, 140, 255, 0.35)" : "rgba(93, 76, 60, 0.28)";
    PALETTE.bodyFill = dala ? "rgba(10, 10, 10, 0.70)" : "rgba(255, 255, 255, 0.65)";
    PALETTE.label = dala ? "rgba(199, 211, 234, 0.50)" : "rgba(93, 76, 60, 0.40)";
    PALETTE.pad = dala ? "rgba(255, 184, 41, 0.40)" : "rgba(176, 137, 104, 0.35)";
    PALETTE.pulses = dala
      ? ["#8052ff", "#a385ff", "#ffb829"]
      : ["#c8102e", "#e05a2b", "#b08968"];
    // живые сигналы тоже перекрашиваем, иначе старые цвета висят на чёрном
    pulses.forEach((p) => { p.color = pick(PALETTE.pulses); });
  }
  new MutationObserver(applyCircuitTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // от честного NE555 до советской К155ЛА3 — дань уважения радиокомпонентам
  const CHIP_LABELS = [
    "STM32F4", "ESP32", "ATMEGA328P", "TDA7294",
    "NE555", "LM358", "К155ЛА3", "КР580ВМ80А",
  ];
  const BAND_COLORS = ["#a1543b", "#d4a017", "#c23b3b", "#b45f2b", "#caa42a", "#3b7a3b", "#3d3d3d"];

  let W = 0, H = 0;
  let traces = [], components = [], pulses = [], flashes = [];
  let rafId = 0, lastT = 0, running = false;
  let parallaxX = 0, parallaxY = 0, targetX = 0, targetY = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ---------- Геометрия ---------- */

  // Дорожка: ломаная по сетке, ортогональные участки и повороты под 45°,
  // как на настоящей PCB. Выход за экран на две ячейки — запас под параллакс.
  function buildTrace(w, h) {
    const cell = 64;
    const bleed = cell * 2;
    const pts = [[randInt(-1, Math.ceil(w / cell)) * cell, randInt(-1, Math.ceil(h / cell)) * cell]];
    let [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    let [x, y] = pts[0];

    const steps = randInt(3, 7);
    for (let i = 0; i < steps; i++) {
      if (Math.random() < 0.3) {
        // диагональный сегмент 45°
        const [px, py] = dx === 0 ? [1, 0] : [0, 1];
        const sgn = Math.random() < 0.5 ? 1 : -1;
        x += (dx + px * sgn) * cell;
        y += (dy + py * sgn) * cell;
      } else {
        // прямой участок длиной 1–3 ячейки, затем возможный поворот
        const len = randInt(1, 3);
        x += dx * cell * len;
        y += dy * cell * len;
        if (Math.random() < 0.55) {
          [dx, dy] = dx === 0 ? [pick([1, -1]), 0] : [0, pick([1, -1])];
        }
      }
      x = Math.max(-bleed, Math.min(w + bleed, x));
      y = Math.max(-bleed, Math.min(h + bleed, y));
      pts.push([x, y]);
    }
    return pts;
  }

  function measure(poly) {
    let len = 0;
    const acc = [0];
    for (let i = 1; i < poly.length; i++) {
      len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
      acc.push(len);
    }
    return { len, acc };
  }

  // точка на ломаной по пройденному расстоянию
  function pointAt(poly, m, s) {
    const s2 = Math.max(0, Math.min(s, m.len));
    let i = 1;
    while (i < m.acc.length - 1 && m.acc[i] < s2) i++;
    const a = poly[i - 1], b = poly[i];
    const seg = m.acc[i] - m.acc[i - 1] || 1;
    const t = (s2 - m.acc[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function buildComponent(w, h) {
    const cell = 64;
    const cols = Math.max(1, Math.floor(w / cell) - 1);
    const rows = Math.max(1, Math.floor(h / cell) - 1);
    return {
      type: pick(["mcu", "mcu", "ic", "ic", "resistor", "capacitor", "crystal", "pads"]),
      x: randInt(1, cols) * cell,
      y: randInt(1, rows) * cell,
      label: pick(CHIP_LABELS),
      bands: Array.from({ length: 4 }, () => pick(BAND_COLORS)),
      rot: pick([0, Math.PI / 2]),
    };
  }

  /* ---------- Отрисовка компонентов ---------- */

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMcu(c) {
    const s = 86;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.strokeStyle = PALETTE.body;
    ctx.lineWidth = 1.3;
    // выводы по четырём сторонам + контактные отверстия
    for (let i = -2; i <= 2; i++) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * (s / 2), i * 14);
        ctx.lineTo(side * (s / 2 + 9), i * 14);
        ctx.moveTo(i * 14, side * (s / 2));
        ctx.lineTo(i * 14, side * (s / 2 + 9));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side * (s / 2 + 12), i * 14, 1.8, 0, Math.PI * 2);
        ctx.arc(i * 14, side * (s / 2 + 12), 1.8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    roundRectPath(-s / 2, -s / 2, s, s, 8);
    ctx.fillStyle = PALETTE.bodyFill;
    ctx.fill();
    ctx.stroke();
    // метка первого вывода и маркировка
    ctx.beginPath();
    ctx.arc(-s / 2 + 11, -s / 2 + 11, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.label;
    ctx.font = "700 10px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, 0, 0);
    ctx.restore();
  }

  function drawIc(c) {
    const w = 84, h = 38;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.strokeStyle = PALETTE.body;
    ctx.lineWidth = 1.3;
    // два ряда выводов (DIP-корпус)
    for (let i = -1; i <= 1; i++) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(i * 20, side * (h / 2));
        ctx.lineTo(i * 20, side * (h / 2 + 8));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(i * 20, side * (h / 2 + 11), 1.7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    roundRectPath(-w / 2, -h / 2, w, h, 5);
    ctx.fillStyle = PALETTE.bodyFill;
    ctx.fill();
    ctx.stroke();
    // ключ первого вывода
    ctx.beginPath();
    ctx.arc(0, -h / 2, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.label;
    ctx.font = "700 9px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, 0, 1);
    ctx.restore();
  }

  function drawResistor(c) {
    const len = 72, hh = 17;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.strokeStyle = PALETTE.body;
    ctx.lineWidth = 1.2;
    // выводы с площадками
    ctx.beginPath();
    ctx.moveTo(-len / 2 - 16, 0);
    ctx.lineTo(-len / 2, 0);
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(len / 2 + 16, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-len / 2 - 19, 0, 1.8, 0, Math.PI * 2);
    ctx.arc(len / 2 + 19, 0, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    roundRectPath(-len / 2, -hh / 2, len, hh, hh / 2);
    ctx.fillStyle = PALETTE.bodyFill;
    ctx.fill();
    ctx.stroke();
    // цветовые кольца номинала
    c.bands.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(-len / 2 + 10 + i * 12, -hh / 2 + 2, 4, hh - 4);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawCapacitor(c) {
    const r = 14;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.strokeStyle = PALETTE.body;
    ctx.lineWidth = 1.3;
    // электролит: корпус + насечка + маркировка полярности
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.bodyFill;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.lineTo(-3, 4);
    ctx.moveTo(-6, 1);
    ctx.lineTo(-6, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(0, r + 10);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, -r - 10);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrystal(c) {
    const w = 20, h = 38;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.strokeStyle = PALETTE.body;
    ctx.lineWidth = 1.3;
    roundRectPath(-w / 2, -h / 2, w, h, 9);
    ctx.fillStyle = PALETTE.bodyFill;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(0, h / 2 + 9);
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, -h / 2 - 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, h / 2 + 12, 1.8, 0, Math.PI * 2);
    ctx.arc(0, -h / 2 - 12, 1.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPads(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = PALETTE.pad;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        ctx.fillRect(col * 12 - 26, row * 12 - 6, 7, 7);
      }
    }
    ctx.restore();
  }

  const DRAW = {
    mcu: drawMcu,
    ic: drawIc,
    resistor: drawResistor,
    capacitor: drawCapacitor,
    crystal: drawCrystal,
    pads: drawPads,
  };

  /* ---------- Кадр ---------- */

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(parallaxX * -14, parallaxY * -14);

    // слой дорожек с переходными отверстиями
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = PALETTE.trace;
    for (const t of traces) {
      ctx.beginPath();
      ctx.moveTo(t.poly[0][0], t.poly[0][1]);
      for (let i = 1; i < t.poly.length; i++) ctx.lineTo(t.poly[i][0], t.poly[i][1]);
      ctx.stroke();
      for (let i = 1; i < t.poly.length - 1; i++) {
        if (!t.vias[i]) continue;
        ctx.beginPath();
        ctx.arc(t.poly[i][0], t.poly[i][1], 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // подсветка дорожек рядом с курсором (в координатах платы)
    if (mouseSeen && !reducedMotion) {
      const mx = mousePX + parallaxX * 14, my = mousePY + parallaxY * 14;
      ctx.lineWidth = 1.6;
      for (const t of traces) {
        let best = Infinity;
        for (const [vx, vy] of t.poly) {
          const d = Math.hypot(vx - mx, vy - my);
          if (d < best) best = d;
        }
        if (best < 170) {
          ctx.beginPath();
          ctx.moveTo(t.poly[0][0], t.poly[0][1]);
          for (let i = 1; i < t.poly.length; i++) ctx.lineTo(t.poly[i][0], t.poly[i][1]);
          ctx.strokeStyle = `rgba(200, 16, 46, ${((1 - best / 170) * 0.35).toFixed(3)})`;
          ctx.stroke();
        }
      }
      ctx.strokeStyle = PALETTE.trace;
    }

    // слой компонентов
    for (const c of components) DRAW[c.type](c);

    // слой сигналов: хвост из затухающих точек + ядро
    for (const p of pulses) {
      const t = traces[p.trace];
      if (!t) continue;
      const TRAIL = 9;
      for (let i = 0; i < TRAIL; i++) {
        const sBack = p.s - i * 9;
        if (sBack < 0) break;
        const [bx, by] = pointAt(t.poly, t.m, sBack);
        const k = 1 - i / TRAIL;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.26 * k * k;
        ctx.arc(bx, by, 1.4 + 2.6 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      const [hx, hy] = pointAt(t.poly, t.m, p.s);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // вспышки на площадках, где сигнал пришёл
    for (const f of flashes) {
      ctx.beginPath();
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = Math.max(f.a, 0) * 0.5;
      ctx.lineWidth = 1.4;
      ctx.arc(f.x, f.y, 3 + (1 - f.a) * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // тёплое свечение за курсором (в экранных координатах)
    if (mouseSeen && !reducedMotion) {
      const g = ctx.createRadialGradient(mousePX, mousePY, 0, mousePX, mousePY, 190);
      g.addColorStop(0, "rgba(200, 16, 46, 0.10)");
      g.addColorStop(1, "rgba(200, 16, 46, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(mousePX - 190, mousePY - 190, 380, 380);
    }
  }

  function update(dt) {
    parallaxX += (targetX - parallaxX) * 0.05;
    parallaxY += (targetY - parallaxY) * 0.05;
    scrollBoost *= Math.pow(0.05, dt);

    for (const p of pulses) {
      p.s += p.speed * dt * (1 + scrollBoost);
      const t = traces[p.trace];
      if (!t) continue;
      if (p.s >= t.m.len) {
        const end = t.poly[t.poly.length - 1];
        flashes.push({ x: end[0], y: end[1], a: 1, color: p.color });
        // сигнал перерождается на другой дорожке со случайной задержкой
        p.trace = randInt(0, traces.length - 1);
        p.s = -rand(100, 900);
        p.speed = rand(90, 190);
        p.color = pick(PALETTE.pulses);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].a -= dt * 1.8;
      if (flashes[i].a <= 0) flashes.splice(i, 1);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - lastT) / 1000, 0.05); // защита от прыжка после сна вкладки
    lastT = now;
    update(dt);
    render();
    rafId = requestAnimationFrame(frame);
  }

  /* ---------- Жизненный цикл ---------- */

  // плотность элементов масштабируем от площади, чтобы мобильный не задыхался
  function setup() {
    applyCircuitTheme();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = W * H;
    traces = Array.from({ length: Math.round(area / 70000) }, () => {
      const poly = buildTrace(W, H);
      return { poly, m: measure(poly), vias: poly.map(() => Math.random() < 0.35) };
    });
    components = Array.from({ length: Math.round(area / 110000) }, () => buildComponent(W, H));
    pulses = Array.from({ length: Math.max(4, Math.round(area / 120000)) }, () => ({
      trace: randInt(0, Math.max(0, traces.length - 1)),
      s: rand(-800, 0),
      speed: rand(90, 190),
      color: pick(PALETTE.pulses),
    }));
    flashes = [];
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function start() {
    if (reducedMotion) {
      // статичный кадр: сигналы просто «стоят» на дорожках
      render();
      return;
    }
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  // курсор: параллакс + свечение + подсветка nearby-дорожек
  let mousePX = -9999, mousePY = -9999, mouseSeen = false;

  // скролл-энергия: прокрутка разгоняет сигналы (затухает сама)
  let scrollBoost = 0;
  window.addEventListener(
    "scroll",
    () => { scrollBoost = Math.min(2.5, scrollBoost + 0.5); },
    { passive: true }
  );

  window.addEventListener(
    "pointermove",
    (e) => {
      targetX = e.clientX / W - 0.5;
      targetY = e.clientY / H - 0.5;
      mousePX = e.clientX;
      mousePY = e.clientY;
      mouseSeen = true;
    },
    { passive: true }
  );
  document.documentElement.addEventListener("mouseleave", () => { mouseSeen = false; });

  // клик/тап — «залп сигналов»: ближайшие импульсы стартуют заново быстрее
  window.addEventListener(
    "pointerdown",
    (e) => {
      mousePX = e.clientX;
      mousePY = e.clientY;
      mouseSeen = true;
      if (reducedMotion || !traces.length) return;
      let nudged = 0;
      for (const p of pulses) {
        if (nudged >= 4) break;
        p.s = Math.min(p.s, 0);
        p.speed = rand(200, 320);
        p.color = PALETTE.pulses[0];
        nudged++;
      }
      flashes.push({ x: e.clientX + parallaxX * 14, y: e.clientY + parallaxY * 14, a: 1, color: PALETTE.pulses[0] });
    },
    { passive: true }
  );

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setup();
      if (reducedMotion) render();
    }, 250);
  });

  // не жжём батарею в фоновой вкладке
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (heroVisible) start();
  });

  // ниже первого экрана фон перекрыт секциями — анимацию можно гасить
  let heroVisible = true;
  const heroSection = document.getElementById("hero");
  if (heroSection && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          heroVisible = entry.isIntersecting;
          if (heroVisible && !document.hidden) start();
          else stop();
        });
      },
      { threshold: 0.02 }
    ).observe(heroSection);
  }

  setup();
  start();
})();
