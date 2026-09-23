/* ============================================================
   ТЕЛЕМАСТЕР — созвездия Dala
   Один движок, три сцены: void-полоса (полный спектр),
   модалка входа (фиолет + янтарь) и подвал (тёплая пыль).
   Треугольники дрейфуют, мерцают, сторонятся курсора.
   Каждая сцена живёт только пока видна.
   ============================================================ */
(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // раскалённые сигнатуры 3D-моделей вместо пастели Dala:
  // чип — бело-красный, резистор — золотой, паяльник — оранжевый
  const MODEL_COLORS = {
    chip: ["#ffffff", "#ff4d4d", "#ffb829", "#ff6a00"],
    resistor: ["#ffb829", "#ffd166", "#ffffff", "#e05a2b"],
    iron: ["#ff6a00", "#ffb703", "#ffffff", "#ff3b3b"],
    led: ["#b3f0ff", "#ffffff", "#40c4ff", "#0288d1"],
    cap: ["#e0e0e0", "#90caf9", "#ffffff", "#64b5f6"],
    meter: ["#ffd54f", "#ffb300", "#ffffff", "#ff8f00"],
    toroid: ["#ffab91", "#ff8f00", "#ffd180", "#ffffff"],
    tv: ["#666666", "#999999", "#cccccc", "#888888"],
  };
  // единый шаблон Dala: полный спектр во всех сценах
  const DALA = ["#8052ff", "#ffb829", "#ffffff", "#e879f9", "#40c4ff", "#15846e"];
  // реестр полей: после подгрузки шрифтов геометрия едет — пересобрать всех
  const liveFields = [];
  // цветовой код резисторов: цифра 0-9
  const BAND_COLORS = ["#1a1a1a", "#6b3a1f", "#c23b3b", "#e07b2a", "#ffd23b", "#2fae5f", "#2b6fd4", "#7a3fd1", "#8a8f98", "#f2f2f2"];
  const TV_NOISE = ["#666666", "#999999", "#cccccc", "#444444", "#888888"];
  const TV_BARS = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0", "#ffffff"];
  const MODEL_SPIN = { tv: 0.1 };

  function createField(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext("2d");
    const o = Object.assign(
      { divisor: 9000, max: 140, min: 40, interactive: true, alpha: 1, size: "parent" },
      opts || {}
    );

    let W = 0, H = 0, parts = [], bulbLinks = [];
    let raf = 0, running = false, awake = false, booted = false;
    let mx = -9999, my = -9999;
    // 3D-карусель: угол, скорость (клик разгоняет), наклон и фокус проекции
    let spin = Math.random() * Math.PI * 2, spinV = 0.28;
    const TILT = 0.42, CT = Math.cos(TILT), ST = Math.sin(TILT), FOCUS = 480;

    function measure() {
      if (o.size === "window") return { w: window.innerWidth, h: window.innerHeight };
      const r = canvas.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return { w: Math.round(r.width), h: Math.round(r.height) };
      const p = canvas.parentElement.getBoundingClientRect();
      return { w: Math.max(1, Math.round(p.width)), h: Math.max(1, Math.round(p.height)) };
    }

    function setup() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const m = measure();
      W = m.w;
      H = m.h;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = o.shape === "bulb" ? (o.bulbScale > 1.5 ? 650 : 430) : o.three ? 260 : o.shape === "chip" ? 150 : o.shape === "crimea" ? 150 : Math.max(o.min, Math.min(o.max, Math.round((W * H) / o.divisor)));
    parts = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: o.shape === "bulb" ? rand(2.4, 4.4) : o.three ? rand(1.6, 3.4) : o.shape === "chip" ? rand(1.4, 2.6) : rand(1.6, 3.2),
      // раскалённые сигнатуры моделей вместо пастели Dala
      // (перекрашиваются в setModel, стартуем с чипа)
      rot: Math.random() * Math.PI * 2,
      vr: rand(-0.4, 0.4),
      vx: rand(-6, 6) * (o.drift != null ? o.drift : 1),
      vy: (o.fall ? rand(12, 30) : rand(-5, 5)) * (o.drift != null ? o.drift : 1),
      svx: 0,
      svy: 0,
      ax: null,
      ay: null,
      tw: rand(0, Math.PI * 2),
      ts: rand(0.6, 1.8),
      color: o.shape === "bulb" && Math.random() < 0.6 ? "#ffb829" : o.palette[(Math.random() * o.palette.length) | 0],
    }));
    if (o.shape === "chip") {
      if (!o.three) buildChip();
      else if (o.model === "resistor") buildResistor3d();
      else if (o.model === "iron") buildIron3d();
      else if (o.model === "led") buildLed3d();
      else if (o.model === "cap") buildCap3d();
      else if (o.model === "meter") buildMeter3d();
      else if (o.model === "toroid") buildToroid3d();
      else if (o.model === "tv") buildTv3d();
      else buildChip3d();
    } else if (o.shape === "bulb") {
      buildBulb();
    } else if (o.shape === "crimea") {
      buildCrimea();
    }
  }

  // лампочка 3D: стеклянная сфера-каркас + цоколь с резьбой + нить
  // (нить помечается p.fil, горит тёплым и гаснет по клику)
  function buildBulb() {
    const s = Math.max(48, Math.min(W, H) * 0.3 * (o.bulbScale || 1));
    const R = s * 0.55;
    const pts = [];
    const fil = [];
    // сфера: 12 широт + 12 меридиан — плотный каркас колбы по-Dala
    [-0.9, -0.72, -0.54, -0.36, -0.18, 0.0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.88].forEach((f) => {
      const y = R * f, r = R * Math.sqrt(Math.max(0, 1 - f * f));
      if (r > 4) ringPts(pts, 0, y, 0, r, "y", 16);
    });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = R * Math.cos(a), z = R * Math.sin(a);
      sampleEdge(pts, x * 0.32, -R, z * 0.32, x, 0, z, 9);
      sampleEdge(pts, x, 0, z, x * 0.72, R * 0.72, z * 0.72, 9);
    }
    // цоколь: 4 кольца резьбы + накатка + контактная пятка (стальной цвет)
    const bas = [];
    const br = R * 0.42, by0 = R * 0.78, by1 = R * 1.18;
    ringPts(bas, 0, by0, 0, br, "y", 12);
    ringPts(bas, 0, by0 + (by1 - by0) * 0.33, 0, br + 1.5, "y", 12);
    ringPts(bas, 0, by0 + (by1 - by0) * 0.66, 0, br + 1.5, "y", 12);
    ringPts(bas, 0, by1, 0, br, "y", 12);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const kx = (br + 1) * Math.cos(a), kz = (br + 1) * Math.sin(a);
      sampleEdge(bas, kx, by0 + 2, kz, kx, by1 - 2, kz, Math.max(4, R * 0.05));
    }
    sampleEdge(bas, 0, by1, 0, 0, by1 + 9, 0, 4);
    ringPts(bas, 0, by1 + 9, 0, 4, "y", 8);
    // держатели нити + сама нить — всё в масштабе R
    const hw = R * 0.2, fy = R * 0.12, fst = Math.max(1.6, R * 0.02);
    sampleEdge(pts, -hw * 0.8, by0 - 4, 0, -hw * 0.8, fy - R * 0.1, 0, 6);
    sampleEdge(pts, hw * 0.8, by0 - 4, 0, hw * 0.8, fy - R * 0.1, 0, 6);
    // нить: две классические петли с объёмной волной
    const loop = (x0, x1, peaks, amp, y0) => {
      for (let i = 0; i < peaks; i++) {
        const xa = x0 + ((x1 - x0) * i) / peaks, xb = x0 + ((x1 - x0) * (i + 1)) / peaks;
        const xm = (xa + xb) / 2, ym = y0 + (i % 2 ? -amp : amp), zm = R * 0.05 * Math.sin(i * 1.7);
        sampleEdge(fil, xa, y0, 0, xm, ym, zm, fst);
        sampleEdge(fil, xm, ym, zm, xb, y0, 0, fst);
      }
    };
    loop(-hw, -hw * 0.1, 5, R * 0.12, fy);
    loop(hw * 0.1, hw, 5, R * 0.12, fy);
    // блик на стекле: дуга слева сверху, всегда белая
    const hi = [];
    for (let i = 0; i <= 12; i++) {
      const f = 0.3 + (i / 12) * 0.5, r = R * Math.sqrt(Math.max(0, 1 - f * f));
      hi.push({ x: r * -0.94, y: R * f, z: r * 0.34 });
    }
    // лимит якорей для гигантских сцен (hero-лампа): плотность вместо мусора
    if (pts.length > 1400) {
      const k = Math.ceil(pts.length / 1400);
      const f = pts.filter((_, i) => i % k === 0);
      pts.length = 0;
      pts.push(...f);
    }
    const all = pts.map((p) => ({ x: p[0], y: p[1], z: p[2] || 0, fil: false, hi: false, base: false }))
      .concat(fil.map((p) => ({ x: p.x, y: p.y, z: p.z || 0, fil: true, hi: false, base: false })))
      .concat(hi.map((p) => ({ x: p.x, y: p.y, z: p.z || 0, fil: false, hi: true, base: false })))
      .concat(bas.map((p) => ({ x: p[0], y: p[1], z: p[2] || 0, fil: false, hi: false, base: true })));
    // сдвиг центра (доля canvas): гигантская лампа живёт сбоку hero
    const DX = o.bx != null ? (o.bx - 0.5) * W : 0, DY = o.by != null ? (o.by - 0.5) * H : 0;
    if (DX || DY) all.forEach((p) => { p.x += DX; p.y += DY; });
    for (let i = all.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = all[i];
      all[i] = all[j];
      all[j] = t;
    }
    const FIL_COLORS = ["#fff8e6", "#ffd166", "#ffb829"];
    parts.forEach((p, i) => {
      if (i < all.length && (o.shape === "bulb" || Math.random() < 0.94)) {
        p.ax = all[i].x;
        p.ay = all[i].y;
        p.az = all[i].z;
        p.fil = all[i].fil;
        p.hi = all[i].hi;
        p.base = all[i].base;
        if (p.fil) {
          p.s = rand(3, 4.6);
          p.color = pick(FIL_COLORS);
        } else if (p.hi) {
          p.s = rand(1.6, 2.4);
          p.color = "#ffffff";
        } else if (p.base) {
          p.s = rand(1.8, 2.8);
          p.color = "#c9d2e0";
        }
      } else {
        p.ax = null;
        p.fil = false;
        p.hi = false;
        p.base = false;
      }
      p.s0 = p.s;
      p.dal = 1;
      p.svx = 0;
      p.svy = 0;
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    });

    // линии-связи «созвездия»: соединяем соседние якоря каркаса лампы,
    // чтобы силуэт читался (стекло — ледяные, цоколь — стальные, нить — тёплые)
    bulbLinks = [];
    if (o.shape === "bulb") {
      const R = Math.max(48, Math.min(W, H) * 0.3 * (o.bulbScale || 1)) * 0.55;
      const maxD = R * 0.34, maxDeg = 4;
      const anchored = parts.map((p, i) => ({ i, p })).filter((x) => x.p.ax != null);
      const deg = new Map();
      for (let a = 0; a < anchored.length; a++) {
        for (let b = a + 1; b < anchored.length; b++) {
          const A = anchored[a].p, B = anchored[b].p;
          const d = Math.hypot(A.ax - B.ax, A.ay - B.ay, A.az - B.az);
          if (d > maxD) continue;
          if ((deg.get(A) || 0) >= maxDeg || (deg.get(B) || 0) >= maxDeg) continue;
          deg.set(A, (deg.get(A) || 0) + 1);
          deg.set(B, (deg.get(B) || 0) + 1);
          bulbLinks.push([anchored[a].i, anchored[b].i, A.fil || B.fil, A.base || B.base]);
        }
      }
    }
  }

  /* ---------- Общие сэмплеры каркасов ---------- */
  function sampleEdge(pts, x1, y1, z1, x2, y2, z2, st) {
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const n = Math.max(1, Math.round(len / st));
    for (let i = 0; i <= n; i++) {
      pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, z1 + ((z2 - z1) * i) / n]);
    }
  }

  function ringPts(pts, cx, cy, cz, r, axis, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
      const P = (t) => axis === "x"
        ? [cx, cy + r * Math.cos(t), cz + r * Math.sin(t)]
        : axis === "y"
          ? [cx + r * Math.cos(t), cy, cz + r * Math.sin(t)]
          : [cx + r * Math.cos(t), cy + r * Math.sin(t), cz];
      const A = P(a), B = P(b);
      sampleEdge(pts, A[0], A[1], A[2], B[0], B[1], B[2], 6);
    }
  }

  function boxPts(pts, cx, cy, cz, hx, hy, hz, st) {
    const X = [cx - hx, cx + hx], Y = [cy - hy, cy + hy], Z = [cz - hz, cz + hz];
    for (const y of Y) for (const z of Z) sampleEdge(pts, X[0], y, z, X[1], y, z, st);
    for (const x of X) for (const z of Z) sampleEdge(pts, x, Y[0], z, x, Y[1], z, st);
    for (const x of X) for (const y of Y) sampleEdge(pts, x, y, Z[0], x, y, Z[1], st);
  }

  function assignAnchors(pts) {
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pts[i];
      pts[i] = pts[j];
      pts[j] = t;
    }
    parts.forEach((p, i) => {
      if (i < pts.length && Math.random() < 0.92) {
        p.ax = pts[i][0];
        p.ay = pts[i][1];
        p.az = pts[i][2];
      } else {
        p.ax = null;
      }
      p.s0 = p.s;
      p.dal = 1;
      p.svx = 0;
      p.svy = 0;
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    });
  }

  // резистор: корпус-цилиндр + кольца-номиналы + выводы
  function buildResistor3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const R = s * 0.22, L = s * 0.95;
    const pts = [];
    ringPts(pts, -L / 2, 0, 0, R, "x", 8);
    ringPts(pts, L / 2, 0, 0, R, "x", 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const y = R * Math.cos(a), z = R * Math.sin(a);
      sampleEdge(pts, -L / 2, y, z, L / 2, y, z, 12);
    }
    [-0.2, 0, 0.2].forEach((f) => ringPts(pts, L * f, 0, 0, R + 1, "x", 8));
    sampleEdge(pts, -L / 2, 0, 0, -L / 2 - 26, 0, 0, 8);
    sampleEdge(pts, L / 2, 0, 0, L / 2 + 26, 0, 0, 8);
    assignAnchors(pts);
    // цветовой код номинала: o.bands = [цифра, цифра, множитель], допуск золото
    const bd = o.bands || [2, 7, 3];
    const bands = [
      { x: -L * 0.2, color: BAND_COLORS[bd[0]] },
      { x: 0, color: BAND_COLORS[bd[1]] },
      { x: L * 0.2, color: BAND_COLORS[bd[2]] },
    ];
    parts.forEach((p) => {
      if (p.ax == null) return;
      for (const b of bands) {
        if (Math.abs(p.ax - b.x) < 4 && Math.hypot(p.ay, p.az) > R - 3) {
          p.color = b.color;
          break;
        }
      }
    });
  }

  // светодиод: купол + фланец + ножки
  function buildLed3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const pts = [];
    ringPts(pts, 0, 0, 0, s * 0.3, "y", 10);
    ringPts(pts, 0, -s * 0.18, 0, s * 0.24, "y", 10);
    ringPts(pts, 0, -s * 0.34, 0, s * 0.16, "y", 8);
    ringPts(pts, 0, -s * 0.46, 0, s * 0.07, "y", 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      sampleEdge(pts, s * 0.3 * Math.cos(a), 0, s * 0.3 * Math.sin(a), s * 0.07 * Math.cos(a), -s * 0.46, s * 0.07 * Math.sin(a), 7);
    }
    sampleEdge(pts, s * 0.08, 0, 0, s * 0.08, s * 0.62, 0, 7);
    sampleEdge(pts, -s * 0.08, 0, 0, -s * 0.08, s * 0.52, 0, 7);
    assignAnchors(pts);
  }

  // конденсатор: цилиндр + поясок + выводы
  function buildCap3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const R = s * 0.34, Hh = s * 0.5;
    const pts = [];
    ringPts(pts, 0, -Hh, 0, R, "y", 10);
    ringPts(pts, 0, Hh, 0, R, "y", 10);
    ringPts(pts, 0, 0, 0, R + 1, "y", 10);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      sampleEdge(pts, R * Math.cos(a), -Hh, R * Math.sin(a), R * Math.cos(a), Hh, R * Math.sin(a), 10);
    }
    sampleEdge(pts, -R * 0.4, Hh, 0, -R * 0.4, Hh + 26, 0, 7);
    sampleEdge(pts, R * 0.4, Hh, 0, R * 0.4, Hh + 26, 0, 7);
    assignAnchors(pts);
  }

  // мультиметр: корпус + экран + крутилка
  function buildMeter3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const pts = [];
    boxPts(pts, 0, 0, 0, s * 0.52, s * 0.8, s * 0.2, 11);
    const sw = s * 0.36, sh = s * 0.2, sy = -s * 0.48, sz = s * 0.2 + 1;
    sampleEdge(pts, -sw, sy - sh, sz, sw, sy - sh, sz, 7);
    sampleEdge(pts, sw, sy - sh, sz, sw, sy + sh, sz, 7);
    sampleEdge(pts, sw, sy + sh, sz, -sw, sy + sh, sz, 7);
    sampleEdge(pts, -sw, sy + sh, sz, -sw, sy - sh, sz, 7);
    ringPts(pts, 0, s * 0.28, sz, s * 0.2, "z", 10);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      sampleEdge(pts, s * 0.2 * Math.cos(a), s * 0.28 + s * 0.2 * Math.sin(a), sz, 0, s * 0.28, sz, 5);
    }
    assignAnchors(pts);
  }

  // тороидальная катушка: бублик из обмотки
  function buildToroid3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const R = s * 0.52, r = s * 0.2;
    const pts = [];
    const N = 16, M = 6;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        const b0 = (j / M) * Math.PI * 2, b1 = ((j + 1) / M) * Math.PI * 2;
        const P = (a, b) => [
          (R + r * Math.cos(b)) * Math.cos(a),
          r * Math.sin(b),
          (R + r * Math.cos(b)) * Math.sin(a),
        ];
        const A = P(a0, b0), B = P(a1, b0), C = P(a0, b1);
        sampleEdge(pts, A[0], A[1], A[2], B[0], B[1], B[2], 7);
        sampleEdge(pts, A[0], A[1], A[2], C[0], C[1], C[2], 5);
      }
    }
    sampleEdge(pts, R, 0, 0, R + 26, 14, 0, 7);
    sampleEdge(pts, -R, 0, 0, -R - 26, 14, 0, 7);
    assignAnchors(pts);
  }

  // телевизор с антенной: корпус + экран из частиц + мачта
  function buildTv3d() {
    const s = Math.max(44, Math.min(W, H) * 0.3);
    const pts = [];
    boxPts(pts, s * 0.1, s * 0.2, 0, s * 0.62, s * 0.44, s * 0.12, 11);
    sampleEdge(pts, -s * 0.3, s * 0.64, 0, -s * 0.3, s * 0.64, 0, 1);
    sampleEdge(pts, s * 0.5, s * 0.64, 0, s * 0.5, s * 0.64, 0, 1);
    sampleEdge(pts, -s * 0.3, s * 0.64, 0, -s * 0.3, s * 0.78, 0, 5);
    sampleEdge(pts, s * 0.5, s * 0.64, 0, s * 0.5, s * 0.78, 0, 5);
    const mx = -s * 0.42;
    sampleEdge(pts, mx, -s * 0.24, 0, mx, -s * 1.05, 0, 10);
    [0.42, 0.62, 0.82].forEach((f, k) => {
      const w = s * (0.5 - k * 0.11), y = -s * f;
      sampleEdge(pts, mx - w, y, 0, mx + w, y, 0, 8);
    });
    assignAnchors(pts);
    // экран 8×5 из отдельных частиц: шум ↔ цветные полосы
    const cols = 8, rows = 5;
    const x0 = s * 0.1 - s * 0.48, x1 = s * 0.1 + s * 0.48;
    const y0 = s * 0.2 - s * 0.3, y1 = s * 0.2 + s * 0.3;
    const scr = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        scr.push({
          x: x0 + ((x1 - x0) * (c + 0.5)) / cols,
          y: y0 + ((y1 - y0) * (r + 0.5)) / rows,
          bar: TV_BARS[c % TV_BARS.length],
        });
      }
    }
    parts.forEach((p) => {
      const g = scr.pop();
      if (g) {
        p.ax = g.x;
        p.ay = g.y;
        p.az = s * 0.12 + 1;
        p.screen = true;
        p.bar = g.bar;
      }
    });
  }

  // паяльник: ручка + гильза + жало-конус + шнур
  function buildIron3d() {
    const s = Math.max(40, Math.min(W, H) * 0.26);
    const pts = [];
    boxPts(pts, -s * 0.55, 0, 0, s * 0.45, s * 0.15, s * 0.15, 11);
    boxPts(pts, s * 0.28, 0, 0, s * 0.32, s * 0.06, s * 0.06, 9);
    const ax = s * 0.98, bx = s * 0.6, br = s * 0.06;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sampleEdge(pts, ax, 0, 0, bx, br * Math.cos(a), br * Math.sin(a), 6);
    }
    ringPts(pts, bx, 0, 0, br, "x", 8);
    sampleEdge(pts, -s, 0, 0, -s - 18, 8, 10, 7);
    sampleEdge(pts, -s - 18, 8, 10, -s - 26, 22, 16, 7);
    assignAnchors(pts);
  }

  // объёмный каркас: корпус-параллелепипед + выводы + кристалл сверху
  function buildChip3d() {
    const s = Math.max(46, Math.min(W, H) * 0.3);
    const h = s * 0.28;
    const pts = [];
    const edge = (x1, y1, z1, x2, y2, z2, st) => {
      const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
      const n = Math.max(1, Math.round(len / st));
      for (let i = 0; i <= n; i++) {
        pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, z1 + ((z2 - z1) * i) / n]);
      }
    };
    const c = [
      [-s, -h, -s], [s, -h, -s], [s, -h, s], [-s, -h, s],
      [-s, h, -s], [s, h, -s], [s, h, s], [-s, h, s],
    ];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    E.forEach(([a, b]) => edge(c[a][0], c[a][1], c[a][2], c[b][0], c[b][1], c[b][2], 12));
    for (let i = 0; i < 4; i++) {
      const z = (-s * 0.6 + (i * s * 1.2) / 3);
      for (const sx of [-1, 1]) edge(sx * s, 0, z, sx * (s + 16), 0, z, 8);
    }
    const d = s * 0.36, dh = 7;
    const k = [
      [-d, -h, -d], [d, -h, -d], [d, -h, d], [-d, -h, d],
      [-d, -h - dh, -d], [d, -h - dh, -d], [d, -h - dh, d], [-d, -h - dh, d],
    ];
    E.forEach(([a, b]) => edge(k[a][0], k[a][1], k[a][2], k[b][0], k[b][1], k[b][2], 9));
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pts[i];
      pts[i] = pts[j];
      pts[j] = t;
    }
    parts.forEach((p, i) => {
      if (i < pts.length && Math.random() < 0.92) {
        p.ax = pts[i][0];
        p.ay = pts[i][1];
        p.az = pts[i][2];
      } else {
        p.ax = null;
      }
      p.s0 = p.s;
      p.dal = 1;
      p.svx = 0;
      p.svy = 0;
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    });
  }

  // якоря микросхемы: корпус + выводы + кристалл, вперемешку
  function buildChip() {
    const cx = W / 2, cy = H / 2;
    const half = Math.max(40, Math.min(W, H) * 0.3);
    const step = 8;
    const pts = [];
    for (let x = -half; x <= half; x += step) {
      pts.push([cx + x, cy - half], [cx + x, cy + half]);
    }
    for (let y = -half + step; y <= half - step; y += step) {
      pts.push([cx - half, cy + y], [cx + half, cy + y]);
    }
    for (let i = 0; i < 4; i++) {
      const x = cx - half * 0.6 + (i * half * 1.2) / 3;
      for (let k = 1; k <= 3; k++) {
        pts.push([x, cy - half - k * 5], [x, cy + half + k * 5]);
      }
    }
    const d = half * 0.38;
    for (let x = -d; x <= d; x += step) pts.push([cx + x, cy - d], [cx + x, cy + d]);
    for (let y = -d + step; y <= d - step; y += step) pts.push([cx - d, cy + y], [cx + d, cy + y]);
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pts[i];
      pts[i] = pts[j];
      pts[j] = t;
    }
    parts.forEach((p, i) => {
      if (i < pts.length && Math.random() < 0.88) {
        p.ax = pts[i][0];
        p.ay = pts[i][1];
      } else {
        p.ax = null;
      }
      p.svx = 0;
      p.svy = 0;
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    });
  }

  // контур Крыма для блока доставки: собирается сам, курсор разметает
  function buildCrimea() {
    const cx = W / 2, cy = H / 2, R = Math.max(30, Math.min(W, H) * 0.46), YS = 1;
    const CR = [
      [-0.4, -0.68],
      [-0.32, -0.74], [-0.28, -0.68], [-0.24, -0.76], [-0.2, -0.7],
      [-0.14, -0.78], [-0.1, -0.72], [-0.04, -0.76], [0.0, -0.68],
      [0.04, -0.6], [0.1, -0.52], [0.16, -0.44], [0.2, -0.36],
      [0.32, -0.38], [0.44, -0.42], [0.56, -0.4], [0.68, -0.38],
      [0.8, -0.36], [0.9, -0.28], [0.92, -0.2],
      [0.8, -0.12], [0.64, -0.1], [0.48, -0.14], [0.36, -0.12],
      [0.24, -0.04], [0.16, 0.08],
      [0.04, 0.2], [-0.08, 0.32], [-0.2, 0.44],
      [-0.32, 0.58], [-0.4, 0.6],
      [-0.48, 0.52], [-0.54, 0.4], [-0.56, 0.28],
      [-0.6, 0.16], [-0.58, 0.0], [-0.54, -0.12], [-0.6, -0.2],
      [-0.52, -0.28], [-0.64, -0.32],
      [-0.76, -0.28], [-0.8, -0.3],
      [-0.94, -0.36], [-0.86, -0.46],
      [-0.72, -0.52], [-0.6, -0.6], [-0.5, -0.64],
    ];
    const pts = [];
    for (let i = 0; i < CR.length; i++) {
      const a = CR[i], b = CR[(i + 1) % CR.length];
      sampleEdge(pts, cx + a[0] * R, cy + a[1] * R * YS, 0, cx + b[0] * R, cy + b[1] * R * YS, 0, R * 0.04);
    }
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pts[i];
      pts[i] = pts[j];
      pts[j] = t;
    }
    parts.forEach((p, i) => {
      if (i < pts.length && Math.random() < 0.96) {
        p.ax = pts[i][0];
        p.ay = pts[i][1];
      } else {
        p.ax = null;
      }
      p.svx = 0;
      p.svy = 0;
      p.x = Math.random() * W;
      p.y = Math.random() * H;
    });
  }

    function render(t) {
      ctx.clearRect(0, 0, W, H);
      // линии-связи созвездия лампы — то, из чего читается силуэт
      if (o.shape === "bulb" && bulbLinks.length) {
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        for (const [i, j, isFil, isBase] of bulbLinks) {
          const A = parts[i], B = parts[j];
          if (!A || !B || A.ax == null || B.ax == null) continue;
          const glow = o.lit !== false;
          ctx.globalAlpha = (isFil ? 0.5 : isBase ? 0.34 : 0.26) * o.alpha * (glow ? 1 : 0.55);
          ctx.strokeStyle = isFil ? "#ffd166" : isBase ? "#9fb4c8" : "#7fd3ff";
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // объёмные модели: жирнее линия и выше пол мерцания — читаются издали
      // лампа: почти без мерцания (эпилептологам — 0 вспышек)
      ctx.lineWidth = o.three ? 1.8 : 1.2;
      const isBulb = o.shape === "bulb";
      const floor = isBulb ? 0.88 : (o.three ? 0.45 : 0.25), ceil = isBulb ? 0.12 : (o.three ? 0.55 : 0.55);
      for (const p of parts) {
        const flick = isBulb && reduced ? 0 : (floor + ceil * (0.5 + 0.5 * Math.sin((t / 1000) * p.ts + p.tw)));
        const a = o.alpha * flick * (p.dal == null ? 1 : p.dal) * ((o.shape === "bulb" && p.fil && !o.lit) ? 0.12 : 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = a;
        if (o.shape === "bulb") {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.s);
          ctx.lineTo(p.s * 0.87, p.s * 0.5);
          ctx.lineTo(-p.s * 0.87, p.s * 0.5);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.strokeStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.s);
          ctx.lineTo(p.s * 0.87, p.s * 0.5);
          ctx.lineTo(-p.s * 0.87, p.s * 0.5);
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function update(dt) {
    const shaped = o.shape === "chip" || o.shape === "bulb" || o.shape === "crimea";
    const K = o.spring || 26;
    const DAMP = o.damp || 3.2;
    const three = shaped && o.three;
    const baseSpin = o.spinRate != null ? o.spinRate : (MODEL_SPIN[o.model] != null ? MODEL_SPIN[o.model] : 0.28);
    const tvSignal = o.model === "tv" && performance.now() < (o.tvUntil || 0);
    let ca = 1, sa = 0;
    if (three) {
      // карусель: клик разгоняет, потом скорость тает к базовой
      spin += spinV * dt;
      spinV += (baseSpin - spinV) * Math.min(1, dt * 1.2);
      ca = Math.cos(spin);
      sa = Math.sin(spin);
    }
    for (const p of parts) {
      if (three && p.ax != null) {
        // проекция якоря: поворот вокруг Y + наклон + перспектива
        const x1 = p.ax * ca + p.az * sa;
        const z1 = -p.ax * sa + p.az * ca;
        const y1 = p.ay * CT - z1 * ST;
        const z2 = p.ay * ST + z1 * CT;
        const sc = FOCUS / (FOCUS + z2);
        let tx = W / 2 + x1 * sc, ty = H / 2 + y1 * sc;
        p.s = (p.s0 || p.s) * sc;
        p.dal = Math.min(1, Math.max(0.3, (sc - 0.7) * 1.7));
        if (three && p.screen) {
          // экран ТВ: есть сигнал — цветные полосы по якорям,
          // нет — жёсткий шум вокруг якоря
          if (tvSignal) {
            p.color = p.bar;
          } else {
            tx += rand(-18, 18);
            ty += rand(-13, 13);
            p.color = pick(TV_NOISE);
            p.x = tx;
            p.y = ty;
          }
        }
        p.svx += (tx - p.x) * K * dt;
        p.svy += (ty - p.y) * K * dt;
        const damp = Math.exp(-DAMP * dt);
        p.svx *= damp;
        p.svy *= damp;
        // жёсткий потолок скорости: без него резкий спин выбрасывает
        // частицы за край, wrap-around телепортирует их на другую сторону
        // и линии-связи растягиваются через весь экран — «хаос»
        const VM = 520;
        if (p.svx > VM) p.svx = VM; else if (p.svx < -VM) p.svx = -VM;
        if (p.svy > VM) p.svy = VM; else if (p.svy < -VM) p.svy = -VM;
        p.x += p.svx * dt;
        p.y += p.svy * dt;
      } else if (shaped && p.ax != null) {
        // пружина к якорю: чип собирается сам
        p.svx += (p.ax - p.x) * K * dt;
        p.svy += (p.ay - p.y) * K * dt;
        const damp = Math.exp(-DAMP * dt);
        p.svx *= damp;
        p.svy *= damp;
        p.x += p.svx * dt;
        p.y += p.svy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      p.rot += p.vr * dt;
      if (o.interactive) {
        const dx = p.x - mx, dy = p.y - my;
        const d = Math.hypot(dx, dy);
        if (d < 120 && d > 0.1) {
          if (p.ax != null) {
            const f = (1 - d / 120) * 2600;
            p.svx += (dx / d) * f * dt;
            p.svy += (dy / d) * f * dt;
          } else {
            const f = (1 - d / 120) * 34;
            p.x += (dx / d) * f * dt;
            p.y += (dy / d) * f * dt;
          }
        }
      }
      if (p.ax == null) {
        // сквозной перенос — только для свободного фонового мусора;
        // якорные частицы всегда возвращаются пружиной на место
        if (p.x < -14) { p.x = W + 14; p.svx = 0; }
        if (p.x > W + 14) { p.x = -14; p.svx = 0; }
        if (p.y < -14) { p.y = H + 14; p.svy = 0; }
        if (p.y > H + 14) { p.y = -14; p.svy = 0; }
      }
    }
  }

    function frame(now) {
      if (!running) return;
      update(0.016);
      render(now);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduced) {
        render(800);
        return;
      }
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    // смена видимости извне: observe(el) или setAwake(bool).
    // setup — при первом показе и при изменении размеров:
    // иначе замер на недогруженных шрифтах навсегда ломал геометрию
    // (мелкий backing растягивался в треугольники-гиганты без лампы)
    function sizeDrifted() {
      const m = measure();
      return Math.abs(m.w - W) > 2 || Math.abs(m.h - H) > 2;
    }
    function setAwake(on) {
      awake = on;
      if (awake && !document.hidden) {
        try {
          if (!booted || sizeDrifted()) {
            setup();
            booted = true;
          }
          start();
        } catch (err) {
          if (window.console && console.error) console.error("[stars] setup failed:", err);
          stop();
        }
      } else {
        stop();
      }
    }

    if (o.interactive) {
      const host = o.size === "window" ? document : canvas.parentElement;
      host.addEventListener(
        "pointermove",
        (e) => {
          const r = canvas.getBoundingClientRect();
          mx = e.clientX - r.left;
          my = e.clientY - r.top;
        },
        { passive: true }
      );
    host.addEventListener("pointerleave", () => {
      mx = -9999;
      my = -9999;
    });
  }

  // ударная волна по клику: только для сцен с физикой скоростей
  if (o.shockwave) {
    canvas.parentElement.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      for (const p of parts) {
        const dx = p.x - px, dy = p.y - py;
        const d = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - d / 260) * 520;
        p.svx += (dx / d) * f;
        p.svy += (dy / d) * f;
      }
      if (o.three) spinV = Math.min(spinV + 0.9, 2.2); // клик мягко подкручивает, потолок 2.2 рад/с
      if (o.model === "tv") o.tvUntil = performance.now() + 6000; // стукнул — 6 секунд сигнала
    });
  }

  // лампочка вкл/выкл по клику (нимб — классом на обёртке)
  if (o.toggleLit) {
    if (o.lit == null) o.lit = true;
    canvas.addEventListener("pointerdown", () => {
      o.lit = !o.lit;
      canvas.parentElement.classList.toggle("is-lit", o.lit);
    });
  }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (awake) start();
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (awake) {
          setup();
          if (reduced) render(800);
        }
      }, 250);
    });

    // смена модели на лету: своя палитра + перестроение якорей,
    // частицы слетаются заново уже в новом цвете
    function setModel(m) {
      o.model = m;
      if (o.modelColors && o.modelColors[m]) {
        o.palette = o.modelColors[m];
        parts.forEach((p) => { p.color = pick(o.palette); });
      }
      setup();
      if (reduced) render(800);
    }

    // донастройка на лету: configure({ bands }) + пересборка
    function configure(patch) {
      Object.assign(o, patch || {});
      setup();
      if (reduced) render(800);
    }

    // один кадр для prefers-reduced-motion после внешней пересборки
    function refresh() {
      if (reduced) render(800);
    }

    const api = { setAwake, setup, setModel, configure, refresh };
    liveFields.push(api);
    return api;
  }

  function watchVisibility(el, field) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => field.setAwake(entry.isIntersecting));
        },
        { threshold: 0.05 }
      ).observe(el);
    } else {
      field.setAwake(true);
    }
  }

  // 1. void-полоса: фон теперь рисует pcb-field.js (чип + дорожки),
  // здесь остаётся только интерактивная 3D-микросхема (см. ниже)

  // 1b. интерактивные 3D-фигуры из созвездия: собираются сами,
  // курсор разметает, клик даёт ударную волну и раскрутку
  let chipField = null;
  const chipCanvas = document.getElementById("chipCanvas");
  if (chipCanvas) {
    const field = createField(chipCanvas, {
      palette: DALA,
      modelColors: MODEL_COLORS,
      shape: "chip",
      three: true,
      model: "chip",
      shockwave: true,
      interactive: true,
    });
    if (field) {
      chipField = field;
      watchVisibility(chipCanvas.parentElement, field);
    }
  }

  // 1c. лампочка в hero: собирается сама, клик гасит/зажигает нить
  const bulbCanvas = document.getElementById("bulbCanvas");
  if (bulbCanvas) {
    const field = createField(bulbCanvas, {
      palette: DALA,
      shape: "bulb",
      three: true,
      toggleLit: true,
      interactive: false,
      bulbScale: 1,
      bx: 0.12,
      by: 0.8,
      drift: 0,
      damp: 4.8,
      spring: 28,
      spinRate: 0.018,
    });
      if (field) watchVisibility(bulbCanvas.parentElement, field);
  }

  // 1d. Крым в блоке доставки: контур собирается сам, курсор разметает
  const crimeaCanvas = document.getElementById("crimeaCanvas");
  if (crimeaCanvas) {
    const field = createField(crimeaCanvas, {
      palette: DALA,
      shape: "crimea",
      spring: 32,
      interactive: true,
    });
    if (field) watchVisibility(crimeaCanvas.parentElement, field);
  }
  document.querySelectorAll("[data-model]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-model]").forEach((x) => x.classList.toggle("is-active", x === b));
      if (chipField) chipField.setModel(b.dataset.model);
    });
  });

  // расселённые 3D-модели: любой <canvas data-model3d="resistor">
  // подхватывается сам, в т.ч. на перерисованных страницах.
  // Резистор — живой: клик выдаёт случайный номинал E12 с подписью.
  const randBands = () => [1 + ((Math.random() * 9) | 0), (Math.random() * 10) | 0, (Math.random() * 7) | 0];
  const formatResistor = (b) => {
    const v = (10 * b[0] + b[1]) * Math.pow(10, b[2]);
    const num = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
    const s = v >= 1e6 ? num(v / 1e6) + " МОм" : v >= 1e3 ? num(v / 1e3) + " кОм" : num(v) + " Ом";
    return s + " · 5% · клик — новый";
  };
  function wireResistorLab(cv, field) {
    if (!field || !field.configure) return;
    const lab = cv.parentElement.querySelector("[data-resval]");
    const apply = (bands) => {
      field.configure({ bands });
      if (lab) lab.textContent = formatResistor(bands);
    };
    apply(randBands());
    cv.style.cursor = "pointer";
    cv.addEventListener("pointerdown", () => apply(randBands()));
  };
  const mountedModels = new WeakSet();
  window.__modelsRefresh = () => {
    document.querySelectorAll("canvas[data-model3d]").forEach((cv) => {
      if (mountedModels.has(cv)) return;
      mountedModels.add(cv);
      const field = createField(cv, {
        palette: DALA.slice(),
        shape: "chip",
        three: true,
        model: cv.dataset.model3d,
        shockwave: cv.dataset.model3d === "tv",
        interactive: true,
      });
      if (cv.dataset.model3d === "resistor") wireResistorLab(cv, field);
      if (field) watchVisibility(cv.parentElement, field);
    });
  };
  window.__modelsRefresh();

  // 2. модалка входа: фиолет + янтарь, живёт пока открыта
  const authCanvas = document.getElementById("authCanvas");
  const authModal = document.getElementById("authModal");
  if (authCanvas && authModal) {
    const field = createField(authCanvas, {
      palette: DALA,
      divisor: 16000,
      max: 70,
      interactive: false,
      size: "window",
    });
    if (field) {
      const sync = () => field.setAwake(!authModal.hidden);
      new MutationObserver(sync).observe(authModal, { attributes: true, attributeFilter: ["hidden"] });
      sync();
    }
  }

  // динамические канвасы (админка перерисовывается): data-stars="preset"
  const DYN_PRESETS = {
    admin: { palette: DALA, divisor: 18000, max: 60, interactive: false },
  };
  const mountedStars = new WeakSet();
  window.__starsRefresh = () => {
    document.querySelectorAll("canvas[data-stars]").forEach((cv) => {
      if (mountedStars.has(cv)) return;
      if (!DYN_PRESETS[cv.dataset.stars]) return;
      mountedStars.add(cv);
      const field = createField(cv, DYN_PRESETS[cv.dataset.stars]);
      if (field) {
        if ("IntersectionObserver" in window) {
          new IntersectionObserver(
            (es) => es.forEach((en) => field.setAwake(en.isIntersecting)),
            { threshold: 0.05 }
          ).observe(cv.parentElement);
        } else field.setAwake(true);
      }
    });
  };
  window.__starsRefresh();

  // контакты: тёплое созвездие за формой
  const ctaCanvas = document.getElementById("ctaCanvas");
  if (ctaCanvas) {
    const field = createField(ctaCanvas, {
      palette: DALA,
      divisor: 16000,
      max: 70,
      alpha: 0.55,
      interactive: false,
    });
    if (field) watchVisibility(ctaCanvas.parentElement, field);
  }

  // 3. подвал: тёплая пыль
  const footCanvas = document.getElementById("footCanvas");
  if (footCanvas) {
    const field = createField(footCanvas, {
      palette: DALA,
      divisor: 14000,
      max: 80,
      alpha: 0.6,
      interactive: false,
    });
    if (field) watchVisibility(footCanvas.parentElement, field);
  }

  // шрифты приехали позже замера — геометрия могла уплыть: пересобрать всех
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      liveFields.forEach((f) => {
        try {
          f.setup();
          f.refresh();
        } catch (err) {}
      });
    });
  }
})();
