/* ============================================================
   ТЕЛЕМАСТЕР — PCB-мандала для void-полосы
   Композиция с референса: чип и расходящиеся во все стороны
   дорожки с переходными отверстиями, но в языке Dala —
   треугольники, янтарь и фиолет на чёрном.
   Импульсы бегут по дорожкам, рядом с курсором всё разгорается,
   клик даёт вспышку.
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("voidCanvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["#8052ff", "#ffb829", "#e879f9", "#ffffff", "#ff4d4d"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  let W = 0, H = 0;
  let traces = [], pulses = [], tris = [], flashes = [];
  let raf = 0, running = false, visible = false;
  let mx = -9999, my = -9999;

  function measure(poly) {
    let len = 0;
    const acc = [0];
    for (let i = 1; i < poly.length; i++) {
      len += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
      acc.push(len);
    }
    return { len, acc };
  }

  function pointAt(poly, m, s) {
    const s2 = Math.max(0, Math.min(s, m.len));
    let i = 1;
    while (i < m.acc.length - 1 && m.acc[i] < s2) i++;
    const a = poly[i - 1], b = poly[i];
    const seg = m.acc[i] - m.acc[i - 1] || 1;
    const t = (s2 - m.acc[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  // дорожка от чипа наружу: горизонталь, излом 45°, снова горизонталь
  function tracePts(side, y0, x0) {
    const pts = [[x0, y0]];
    let x = x0, y = y0;
    x += side * rand(50, 160);
    pts.push([x, y]);
    if (Math.random() < 0.75) {
      const d = rand(25, 80), up = Math.random() < 0.5 ? 1 : -1;
      x += side * d;
      y += up * d;
      pts.push([x, y]);
    }
    pts.push([side > 0 ? W + 30 : -30, y]);
    return pts;
  }

  function setup() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const r = canvas.parentElement.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // чип правее центра — там живёт интерактивная микросхема
    const cx = W * 0.7, cy = H / 2;
    traces = [];
    const n = Math.max(10, Math.round(W / 70));
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.6 ? 1 : -1;
      const y0 = cy + rand(-H * 0.32, H * 0.32);
      const x0 = cx + side * rand(70, 110);
      const poly = tracePts(side, y0, x0);
      traces.push({ poly, m: measure(poly), via: Math.random() < 0.45 });
    }
    pulses = traces
      .filter((_, i) => i % 2 === 0)
      .map((t, i) => ({
        trace: traces.indexOf(t),
        s: rand(0, t.m.len),
        speed: rand(60, 140),
        color: COLORS[i % COLORS.length],
      }));
    const tn = Math.max(16, Math.min(40, Math.round((W * H) / 22000)));
    tris = Array.from({ length: tn }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: rand(1.8, 3.4),
      rot: Math.random() * Math.PI * 2,
      vr: rand(-0.4, 0.4),
      vx: rand(-5, 5),
      vy: rand(-4, 4),
      tw: rand(0, Math.PI * 2),
      ts: rand(0.6, 1.8),
      color: pick(COLORS),
    }));
    flashes = [];
  }

  function nearMouse(poly) {
    let best = Infinity;
    for (const [vx, vy] of poly) {
      const d = Math.hypot(vx - mx, vy - my);
      if (d < best) best = d;
    }
    return best;
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const tr of traces) {
      const d = nearMouse(tr.poly);
      const hot = d < 150 ? 1 - d / 150 : 0;
      ctx.lineWidth = 1 + hot;
      ctx.strokeStyle = hot > 0
        ? `rgba(255, 184, 41, ${(0.1 + hot * 0.4).toFixed(3)})`
        : "rgba(255, 255, 255, 0.09)";
      ctx.beginPath();
      ctx.moveTo(tr.poly[0][0], tr.poly[0][1]);
      for (let i = 1; i < tr.poly.length; i++) ctx.lineTo(tr.poly[i][0], tr.poly[i][1]);
      ctx.stroke();
      if (tr.via) {
        const [vx, vy] = tr.poly[tr.poly.length - 1];
        if (vx > -20 && vx < W + 20) {
          ctx.beginPath();
          ctx.strokeStyle = hot > 0 ? "rgba(255, 184, 41, 0.6)" : "rgba(255, 255, 255, 0.16)";
          ctx.lineWidth = 1.2;
          ctx.arc(Math.max(14, Math.min(W - 14, vx)), vy, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    for (const p of pulses) {
      const tr = traces[p.trace];
      if (!tr) continue;
      const [hx, hy] = pointAt(tr.poly, tr.m, p.s);
      if (hx < -10 || hx > W + 10) continue;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 1.2;
    for (const p of tris) {
      const a = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin((t / 1000) * p.ts + p.tw));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.s);
      ctx.lineTo(p.s * 0.87, p.s * 0.5);
      ctx.lineTo(-p.s * 0.87, p.s * 0.5);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const f of flashes) {
      ctx.beginPath();
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = Math.max(f.a, 0) * 0.6;
      ctx.lineWidth = 1.5;
      ctx.arc(f.x, f.y, 4 + (1 - f.a) * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function update(dt) {
    for (const p of pulses) {
      const tr = traces[p.trace];
      p.s += p.speed * dt;
      if (tr && p.s >= tr.m.len) p.s = 0;
    }
    for (const p of tris) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.x < -12) p.x = W + 12;
      if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12;
      if (p.y > H + 12) p.y = -12;
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].a -= dt * 1.6;
      if (flashes[i].a <= 0) flashes.splice(i, 1);
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

  const host = canvas.parentElement;
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
  host.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    flashes.push({ x: e.clientX - r.left, y: e.clientY - r.top, a: 1, color: pick(COLORS) });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          if (visible && !document.hidden) start();
          else stop();
        });
      },
      { threshold: 0.05 }
    ).observe(host);
  } else {
    visible = true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (visible) start();
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setup();
      if (reduced) render(800);
    }, 250);
  });

  setup();
  start();
})();
