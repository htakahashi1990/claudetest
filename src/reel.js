/*
 * CLAUDE — Motion Design Showreel 2026
 * ------------------------------------
 * 15 seconds · 1920×1080 · 60 fps · 128 BPM (32 beats, 8 bars, one scene per bar)
 *
 * Every frame is a pure function of time: REEL.drawFrame(t, samples).
 * No state is carried between frames, so the reel can be rendered in any
 * order, in parallel, and with sub-frame motion blur (samples > 1).
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────── constants
  const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
  const FPS = 60, DUR = 15, BPM = 128, B = 60 / BPM, BAR = 4 * B;
  const SHUTTER = 0.5; // 180° shutter
  const TAU = Math.PI * 2;

  const C = {
    ink: '#0B0B0D',
    paper: '#F3EFE6',
    signal: '#FF4A1C',
    cobalt: '#2633FF',
  };
  const FD = '"Inter Display", "Inter", sans-serif';
  const FT = '"Inter", sans-serif';
  const FM = '"DejaVu Sans Mono", monospace';
  const FJ = '"IPAPGothic", "IPAGothic", sans-serif';

  // ───────────────────────────────────────────── math
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const spring = (t, decay, freq) => (t <= 0 ? 0 : Math.exp(-t * decay) * Math.sin(t * freq));

  const E = {
    linear: (t) => t,
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
  };

  // CSS-style cubic-bezier(x1, y1, x2, y2)
  function bezier(x1, y1, x2, y2) {
    const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    const by = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
    const f = (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1;
      for (let i = 0; i < 28; i++) {
        const m = (lo + hi) / 2;
        if (bx(m) < x) lo = m; else hi = m;
      }
      return by((lo + hi) / 2);
    };
    f.points = [x1, y1, x2, y2];
    return f;
  }
  const SIG = bezier(0.83, 0, 0.17, 1); // the signature curve of this reel

  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

  const rgbCache = new Map();
  function rgba(hex, a) {
    let c = rgbCache.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  function mixHex(h1, h2, t) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
    return `rgb(${r},${g},${bl})`;
  }

  // ───────────────────────────────────────────── canvas helpers
  const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const font = (w, s, f = FD) => `${w} ${s}px ${f}`;
  function fill(ctx, color) { ctx.fillStyle = color; ctx.fillRect(-400, -400, W + 800, H + 800); }
  function disc(ctx, x, y, r, color) { if (r <= 0) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function diamond(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }

  const mcache = new Map();
  function measure(ctx, str) {
    const key = ctx.font + '|' + ctx.letterSpacing + '|' + str;
    let xs = mcache.get(key);
    if (!xs) {
      xs = [];
      for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width);
      mcache.set(key, xs);
    }
    return xs;
  }
  function textX(ctx, str, x, align) {
    const w = measure(ctx, str)[str.length];
    return align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  }

  // per-character masked reveal (chars rise from below a baseline mask)
  function revealText(ctx, str, x, y, size, u, o = {}) {
    const stagger = o.stagger ?? 0.03, dur = o.dur ?? 0.5, ease = o.ease || E.outExpo;
    const xs = measure(ctx, str), x0 = textX(ctx, str, x, o.align);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.02, xs[str.length] + size * 2, size * 1.28); ctx.clip();
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === ' ') continue;
      const p = ease(prog(u, i * stagger, i * stagger + dur));
      if (p <= 0) continue;
      ctx.save();
      ctx.translate(x0 + xs[i], y + (1 - p) * size * 1.1);
      if (o.rot) ctx.rotate((1 - p) * o.rot);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    return xs[str.length];
  }

  // per-character vertical flip-in
  function flipText(ctx, str, x, y, size, u, o = {}) {
    const stagger = o.stagger ?? 0.03, dur = o.dur ?? 0.5;
    const xs = measure(ctx, str), x0 = textX(ctx, str, x, o.align);
    ctx.save();
    ctx.textAlign = 'left';
    for (let i = 0; i < str.length; i++) {
      const p = E.outBack(prog(u, i * stagger, i * stagger + dur));
      if (p <= 0.001) continue;
      const cw = xs[i + 1] - xs[i];
      ctx.save();
      ctx.globalAlpha *= clamp(p * 3);
      ctx.translate(x0 + xs[i] + cw / 2, y - size * 0.36 + (1 - p) * 60);
      ctx.scale(1, p);
      ctx.rotate((1 - p) * 0.25);
      ctx.fillText(str[i], -cw / 2, size * 0.36);
      ctx.restore();
    }
    ctx.restore();
  }

  const GLYPHS = '!<>-_\\/[]{}=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(str, p, seed, t) {
    const n = str.length, done = Math.floor(p * n);
    let out = '';
    for (let i = 0; i < n; i++) {
      if (i < done || str[i] === ' ') out += str[i];
      else if (i < done + 4) out += GLYPHS[Math.floor(hash(i * 13.1 + seed + Math.floor(t * 40) * 7.7) * GLYPHS.length)];
    }
    return out;
  }
  const typed = (str, p) => str.slice(0, Math.floor(str.length * clamp(p) + 1e-6));

  // ───────────────────────────────────────────── global rhythm / camera
  // [time, strength] — drives camera shake and chromatic aberration
  const IMPACTS = [
    [3 * B, 0.55],
    [BAR + 2 * B, 1.0],
    [3 * BAR, 0.45],
    [6 * BAR + 3 * B, 0.5],
    [6 * BAR + 3.25 * B, 0.35],
    [6 * BAR + 3.5 * B, 0.35],
    [6 * BAR + 3.625 * B, 0.3],
    [6 * BAR + 3.75 * B, 0.3],
    [6 * BAR + 3.875 * B, 0.3],
    [7 * BAR, 1.3],
    [7 * BAR + 3 * B, 0.3],
  ];
  function shake(t) {
    let x = 0, y = 0, r = 0, z = 1;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti;
      if (tau < 0 || tau > 1.2) continue;
      const a = s * Math.exp(-tau * 9);
      x += a * 24 * noise1(tau * 36 + ti * 10);
      y += a * 24 * noise1(tau * 36 + ti * 10 + 57);
      r += a * 0.01 * noise1(tau * 28 + ti * 3 + 11);
      z += a * 0.025;
    }
    return { x, y, r, z };
  }
  function chromaAmt(t) {
    let a = 0;
    for (const [ti, s] of IMPACTS) { const tau = t - ti; if (tau >= 0 && tau < 1) a += s * 18 * Math.exp(-tau * 11); }
    return a;
  }
  const kickEnv = (t) => (t >= BAR && t < 6 * BAR + 3 * B ? Math.exp(-(t % B) * 10) : 0);

  // ═════════════════════════════════════════════ SCENE 1 — IGNITE (physics)
  function s1(ctx, u) {
    fill(ctx, C.ink);
    const FY = 650, XA = CX - 440, XB = CX, T3 = 3 * B;
    const H0 = 700, g = (2 * H0) / (B * B);
    const segs = [[B, 2 * B], [2 * B, 2.5 * B], [2.5 * B, 2.75 * B], [2.75 * B, 3 * B]];
    const hAt = (t) => {
      if (t < B) return H0 - 0.5 * g * t * t;
      for (const [a, b] of segs) if (t < b) { const d = b - a, tau = t - a; return (g * d / 2) * tau - 0.5 * g * tau * tau; }
      return 0;
    };
    const xAt = (t) => lerp(XA, XB, clamp(t / T3));
    const hits = [B, 2 * B, 2.5 * B, 2.75 * B];
    const hitAmp = [0.55, 0.42, 0.28, 0.18];
    const tp = u - T3;
    const fadeAll = 1 - prog(u, T3 + 0.05, T3 + 0.35);

    // headline, typed
    ctx.save();
    ctx.font = font(300, 40); ctx.letterSpacing = '0.5px'; ctx.textAlign = 'center';
    const head = 'Everything starts with a dot.';
    const hs = typed(head, prog(u, 0.12, 0.95));
    ctx.globalAlpha = 0.92 * fadeAll; ctx.fillStyle = C.paper;
    const hw = measure(ctx, head)[head.length];
    ctx.textAlign = 'left';
    ctx.fillText(hs, CX - hw / 2, 330);
    if (u < T3 && Math.floor(u * 6) % 2 === 0) {
      const cw = measure(ctx, hs)[hs.length];
      ctx.fillStyle = C.signal; ctx.fillRect(CX - hw / 2 + cw + 6, 296, 3, 44);
    }
    ctx.restore();

    // timeline ruler
    const rp = E.outExpo(prog(u, 0.04, 0.7));
    const L = 790 * rp;
    if (L > 1) {
      ctx.save();
      ctx.strokeStyle = C.paper;
      ctx.lineWidth = 2; ctx.globalAlpha = 0.85 * fadeAll;
      line(ctx, CX - L, FY, CX + L, FY);
      ctx.lineWidth = 1.5;
      for (let k = -49; k <= 49; k++) {
        const x = CX + k * 16, ax = Math.abs(x - CX);
        if (ax > L) continue;
        let dy = 0;
        for (let j = 0; j < hits.length; j++) {
          const tau = u - hits[j]; if (tau <= 0) continue;
          const dx = Math.abs(x - xAt(hits[j])); if (dx > tau * 1500) continue;
          dy += hitAmp[j] * 34 * Math.exp(-tau * 3.2) * Math.exp(-dx / 300) * Math.sin(dx / 30 - tau * 32);
        }
        if (tp > 0) { const dx = Math.abs(x - XB); if (dx < tp * 1800) dy += 46 * Math.exp(-tp * 3) * Math.exp(-dx / 420) * Math.sin(dx / 40 - tp * 30); }
        const major = k % 5 === 0;
        ctx.globalAlpha = (major ? 0.8 : 0.38) * clamp((L - ax) / 80) * fadeAll;
        line(ctx, x, FY + 9 + dy, x, FY + 9 + (major ? 20 : 9) + dy);
      }
      ctx.font = font(400, 14, FM); ctx.textAlign = 'center';
      for (let k = 0; k <= 3; k++) {
        const x = lerp(XA, XB, k / 3);
        ctx.globalAlpha = 0.6 * prog(u, 0.3 + k * 0.06, 0.6 + k * 0.06) * fadeAll;
        ctx.fillStyle = C.paper;
        ctx.fillText('F' + String(Math.round(k * 28.125)).padStart(2, '0'), x, FY + 62);
        const since = u - k * B;
        const pulse = since >= 0 ? 1 + 0.9 * Math.exp(-since * 9) : 1;
        ctx.globalAlpha = prog(u, 0.25 + k * 0.06, 0.5 + k * 0.06) * fadeAll;
        diamond(ctx, x, FY, 7 * pulse);
        if (since >= 0) { ctx.fillStyle = C.signal; ctx.fill(); } else { ctx.fillStyle = C.ink; ctx.fill(); ctx.strokeStyle = C.paper; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      ctx.restore();
    }

    // the dot
    if (u < T3) {
      const h = Math.max(0, hAt(u)), x0 = xAt(u);
      const v = (hAt(u + 0.004) - hAt(u - 0.004)) / 0.008;
      let j = -1; for (let i = 0; i < hits.length; i++) if (u >= hits[i]) j = i;
      const since = j >= 0 ? u - hits[j] : 9;
      const stW = clamp((since - 0.015) / 0.06);
      const st = 1 + Math.min(Math.abs(v) / 5200, 0.5) * stW;
      let sx = 1 / st, sy = st;
      if (j >= 0) { const q = hitAmp[j] * Math.exp(-since * 20) * Math.cos(since * 40); sx *= 1 + q; sy *= 1 - q; }
      const a = prog(u, 2.8 * B, 3 * B);
      const r = 22 + 16 * E.inCubic(a);
      sx *= 1 + 0.25 * a; sy *= 1 - 0.2 * a;
      const x = x0 + Math.sin(u * 190) * 3 * a;
      // contact glow
      ctx.save();
      ctx.globalAlpha = 0.22 * (1 - h / H0);
      ctx.fillStyle = C.paper;
      ctx.beginPath(); ctx.ellipse(x, FY + 1, 34 * (1 - h / 1100), 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x, FY - 3 - h - r * sy);
      ctx.scale(sx, sy);
      disc(ctx, 0, 0, r, a > 0 ? mixHex(C.paper, C.signal, a) : C.paper);
      ctx.restore();
    }

    // burst
    if (tp >= 0) {
      const BX = XB, BY = FY - 30;
      ctx.save();
      disc(ctx, BX, BY, 50 + tp * 900, rgba(C.paper, Math.exp(-tp * 22)));
      const rings = [[0, 300, C.signal, 26], [0.04, 520, C.paper, 6], [0.09, 760, C.paper, 2]];
      for (const [d, R, col, lw] of rings) {
        const p = prog(tp, d, d + 0.7); if (p <= 0 || p >= 1) continue;
        ctx.strokeStyle = col; ctx.lineWidth = lw * Math.pow(1 - p, 1.4);
        ctx.beginPath(); ctx.arc(BX, BY, E.outExpo(p) * R, 0, TAU); ctx.stroke();
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const an = (i / 18) * TAU + 0.17;
        const len = i % 2 ? 1 : 0.7;
        const ro = 40 + E.outExpo(prog(tp, 0, 0.42)) * 380 * len;
        const ri = 40 + E.outExpo(prog(tp, 0.07, 0.5)) * 380 * len;
        if (ro - ri < 1) continue;
        ctx.strokeStyle = i % 3 === 0 ? C.signal : C.paper; ctx.lineWidth = 5;
        line(ctx, BX + Math.cos(an) * ri, BY + Math.sin(an) * ri, BX + Math.cos(an) * ro, BY + Math.sin(an) * ro);
      }
      const rnd = mulberry(7);
      for (let i = 0; i < 26; i++) {
        const an = rnd() * TAU, sp = 300 + rnd() * 900, sz = 2 + rnd() * 5;
        const dd = (sp * (1 - Math.exp(-tp * 5))) / 5 * 4;
        disc(ctx, BX + Math.cos(an) * dd, BY + Math.sin(an) * dd + tp * tp * 300, sz * (1 - prog(tp, 0.2, 0.5)), i % 4 ? C.paper : C.signal);
      }
      ctx.restore();
    }

    // circle wipe → signal
    const w1 = E.inOutCubic(prog(u, 3 * B + 0.05, 4 * B - 0.035));
    const w2 = E.inOutCubic(prog(u, 3 * B + 0.12, 4 * B));
    if (w1 > 0) disc(ctx, XB, FY - 30, w1 * 1300, C.paper);
    if (w2 > 0) disc(ctx, XB, FY - 30, w2 * 1300, C.signal);
  }

  // ═════════════════════════════════════════════ SCENE 2 — KINETIC TYPE
  function s2(ctx, u) {
    fill(ctx, C.signal);
    const X = 118;
    const jolt = -26 * spring(u - 2 * B - 0.02, 9, 24);
    ctx.fillStyle = C.ink;

    // side column
    const cp = E.outExpo(prog(u, 0.15, 0.7));
    ctx.save();
    ctx.globalAlpha = cp; ctx.translate(0, (1 - cp) * 40);
    ctx.font = font(900, 190); ctx.letterSpacing = '-4px';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeText('02', 1552, 286);
    ctx.font = font(500, 22, FT); ctx.letterSpacing = '0px';
    const notes = ['Kinetic typography', 'Mask reveal / overshoot', 'Squash & stretch'];
    notes.forEach((s, k) => ctx.fillText(typed(s, prog(u, 0.3 + k * 0.12, 0.7 + k * 0.12)), 1558, 350 + k * 34));
    ctx.fillRect(1558, 460, 230 * E.outExpo(prog(u, 0.5, 1.1)), 3);
    ctx.restore();

    // I MAKE
    const m1 = E.outExpo(prog(u, B, B + 0.45));
    ctx.save();
    ctx.translate(X, lerp(610, 318, m1) + jolt);
    const sc1 = lerp(1, 0.84, m1); ctx.scale(sc1, sc1);
    ctx.font = font(900, 250); ctx.letterSpacing = '-8px';
    revealText(ctx, 'I MAKE', 0, 0, 250, u - 0.02, { stagger: 0.035, dur: 0.55 });
    ctx.restore();

    // THINGS
    ctx.save();
    ctx.font = font(900, 210); ctx.letterSpacing = '-7px';
    flipText(ctx, 'THINGS', X, 548 + jolt * 0.6, 210, u - B, { stagger: 0.032, dur: 0.5 });
    ctx.restore();

    // MOVE.
    const ts = u - 2 * B;
    if (ts >= 0) {
      const k = E.outExpo(clamp(ts / 0.3));
      const sc = lerp(2.7, 1, k);
      ctx.save();
      ctx.font = font(900, 330); ctx.letterSpacing = '-11px';
      const str = 'MOVE.', xs = measure(ctx, str), w = xs[5], BL = 905;
      const cxT = X + w / 2, cyT = BL - 120;
      ctx.globalAlpha = clamp(ts / 0.03);
      ctx.translate(cxT, cyT); ctx.scale(sc, sc); ctx.rotate((1 - k) * -0.07); ctx.translate(-cxT, -cyT);
      for (let i = 0; i < 5; i++) {
        const cw = xs[i + 1] - xs[i], px = X + xs[i] + cw / 2;
        const tau = u - 3 * B - i * 0.035;
        ctx.save();
        ctx.translate(px, BL);
        if (i === 0) { const q = 0.34 * spring(tau, 8, 26); ctx.scale(1 + q * 0.7, 1 - q); }
        if (i === 1) {
          const jp = clamp(tau / 0.32);
          ctx.translate(0, -120 * Math.sin(Math.PI * jp) * (tau > 0 ? 1 : 0));
          const q = 0.3 * spring(tau - 0.32, 11, 30); ctx.scale(1 + q, 1 - q);
        }
        if (i === 2) { const f = E.inOutCubic(clamp(tau / 0.36)); ctx.translate(0, -120); ctx.scale(1, Math.cos(TAU * f)); ctx.translate(0, 120); }
        if (i === 3) ctx.translate(80 * spring(tau, 7, 20), 0);
        if (i === 4) ctx.translate(0, tau > 0 ? -140 * Math.abs(Math.sin(tau * 13)) * Math.exp(-tau * 4) : 0);
        ctx.fillStyle = i === 4 ? C.paper : C.ink;
        ctx.textAlign = 'center';
        ctx.fillText(str[i], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    // band wipe → ink
    for (let i = 0; i < 9; i++) {
      const p = E.inOutCubic(prog(u, 3.5 * B + i * 0.011, 3.5 * B + i * 0.011 + 0.135));
      if (p <= 0) continue;
      ctx.fillStyle = C.ink;
      const x = lerp(W + 400, -400, p);
      ctx.fillRect(x, i * 120 - (i === 0 ? 400 : 0), W + 800, 121 + (i === 0 || i === 8 ? 400 : 0));
    }
  }

  // ═════════════════════════════════════════════ SCENE 3 — TIMING & EASING
  const LANES = [
    { n: 'linear', f: E.linear },
    { n: 'ease-in-out', f: E.inOutCubic },
    { n: 'cubic-bezier(.83,0,.17,1)  ★', f: SIG, hot: true },
    { n: 'back.out', f: E.outBack },
    { n: 'elastic.out', f: E.outElastic },
  ];
  function s3(ctx, u) {
    fill(ctx, C.ink);
    const out = E.inExpo(prog(u, 3 * B, 3.75 * B));
    const q = prog(u, B, 3 * B);

    // graph editor
    const PX = 150 - out * 600, PY = 250, PS = 540;
    const gx = (x) => PX + x * PS, gy = (y) => PY + PS - y * PS;
    ctx.save();
    ctx.globalAlpha = 1 - out;
    const gp = E.outExpo(prog(u, 0, 0.5));
    ctx.strokeStyle = rgba(C.paper, 0.08); ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      line(ctx, gx(i / 8), PY, gx(i / 8), PY + PS * gp);
      line(ctx, PX, gy(i / 8), PX + PS * gp, gy(i / 8));
    }
    ctx.strokeStyle = rgba(C.paper, 0.35); ctx.strokeRect(PX, PY, PS * gp, PS);
    ctx.font = font(400, 16, FM); ctx.fillStyle = rgba(C.paper, 0.6);
    ctx.fillText(typed('GRAPH EDITOR — VALUE / TIME', prog(u, 0.05, 0.4)), PX, PY - 22);
    ctx.fillText(typed('t →', prog(u, 0.3, 0.4)), PX + PS - 32, PY + PS + 26);

    // curve
    const dp = E.outCubic(prog(u, 0.08, 0.6));
    ctx.strokeStyle = C.paper; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    const N = 140;
    for (let i = 0; i <= N * dp; i++) { const x = i / N; i === 0 ? ctx.moveTo(gx(x), gy(SIG(x))) : ctx.lineTo(gx(x), gy(SIG(x))); }
    ctx.stroke();

    // bezier handles
    const hp = E.outBack(prog(u, 0.35, 0.62));
    if (hp > 0) {
      const [x1, y1, x2, y2] = SIG.points;
      ctx.strokeStyle = C.signal; ctx.lineWidth = 2;
      line(ctx, gx(0), gy(0), gx(lerp(0, x1, hp)), gy(lerp(0, y1, hp)));
      line(ctx, gx(1), gy(1), gx(lerp(1, x2, hp)), gy(lerp(1, y2, hp)));
      ctx.fillStyle = C.signal;
      const ks = 9 * hp;
      ctx.fillRect(gx(x1 * hp) - ks, gy(y1 * hp) - ks, ks * 2, ks * 2);
      ctx.fillRect(gx(lerp(1, x2, hp)) - ks, gy(lerp(1, y2, hp)) - ks, ks * 2, ks * 2);
    }
    const kp = E.outBack(prog(u, 0.2, 0.45));
    ctx.fillStyle = C.paper;
    diamond(ctx, gx(0), gy(0), 10 * kp); ctx.fill();
    diamond(ctx, gx(1), gy(1), 10 * kp); ctx.fill();

    ctx.font = font(400, 22, FM); ctx.fillStyle = C.signal;
    ctx.fillText(typed('cubic-bezier(.83, 0, .17, 1)', prog(u, 0.3, 0.8)), PX, PY + PS + 62);

    // playhead
    if (u > B - 0.1) {
      const pa = prog(u, B - 0.1, B);
      const px = gx(q), py = gy(SIG(q));
      ctx.globalAlpha = (1 - out) * pa;
      ctx.strokeStyle = C.signal; ctx.lineWidth = 2;
      line(ctx, px, PY - 8, px, PY + PS + 8);
      ctx.setLineDash([4, 6]); ctx.strokeStyle = rgba(C.paper, 0.5); ctx.lineWidth = 1;
      line(ctx, PX, py, px, py);
      ctx.setLineDash([]);
      disc(ctx, px, py, 18, rgba(C.signal, 0.25));
      disc(ctx, px, py, 8, C.signal);
      ctx.font = font(400, 15, FM); ctx.fillStyle = C.paper;
      ctx.fillText(SIG(q).toFixed(3), px + 18, py - 14);
    }
    ctx.restore();

    // lanes
    const LX0 = 880, LX1 = 1780, bx0 = LX0 + 24, bx1 = LX1 - 24;
    LANES.forEach((ln, i) => {
      const ly = 300 + i * 112;
      const lp = E.outExpo(prog(u, 0.1 + i * 0.05, 0.6 + i * 0.05));
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.strokeStyle = rgba(C.paper, 0.22); ctx.lineWidth = 2;
      line(ctx, LX0, ly, LX0 + (LX1 - LX0) * lp, ly);
      ctx.font = font(400, 17, FM); ctx.fillStyle = ln.hot ? C.signal : rgba(C.paper, 0.6);
      ctx.fillText(typed(ln.n, prog(u, 0.15 + i * 0.05, 0.55 + i * 0.05)), LX0, ly - 28);
      ctx.fillStyle = rgba(C.paper, 0.7);
      const dk = E.outBack(prog(u, 0.3 + i * 0.05, 0.55 + i * 0.05));
      diamond(ctx, bx0, ly, 6 * dk); ctx.fill();
      diamond(ctx, bx1, ly, 6 * dk); ctx.fill();
      // onion skin
      ctx.strokeStyle = ln.hot ? rgba(C.signal, 0.55) : rgba(C.paper, 0.3); ctx.lineWidth = 1.5;
      const steps = 14;
      for (let k = 0; k <= steps; k++) {
        if (k / steps > q || q <= 0) break;
        ctx.beginPath(); ctx.arc(lerp(bx0, bx1, ln.f(k / steps)), ly, 13, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      // ball
      const ap = E.outBack(prog(u, 0.3 + i * 0.05, 0.6 + i * 0.05));
      if (ap <= 0) return;
      let x = lerp(bx0, bx1, ln.f(q)), y = ly;
      const vel = (ln.f(clamp(q + 0.005)) - ln.f(clamp(q - 0.005))) / 0.01 * (bx1 - bx0) / (2 * B);
      const st = 1 + Math.min(Math.abs(vel) / 2800, 0.7);
      const ex = E.inExpo(prog(u, 3 * B + i * 0.025, 3.8 * B));
      x = lerp(x, CX, ex); y = lerp(y, CY, ex);
      ctx.save();
      ctx.translate(x, y); ctx.scale(st, 1 / Math.sqrt(st));
      disc(ctx, 0, 0, 16 * ap, ln.hot ? C.signal : C.paper);
      ctx.restore();
    });

    // merge
    const mp = prog(u, 3.78 * B, 4 * B);
    if (mp > 0) {
      disc(ctx, CX, CY, 40 + 140 * E.inExpo(mp), rgba(C.signal, 0.25 * mp));
      disc(ctx, CX, CY, 18 + 10 * mp, C.paper);
    }
  }

  // ═════════════════════════════════════════════ SCENE 4 — DEPTH (3D)
  const N4 = 900;
  const P4 = { sph: new Float32Array(N4 * 3), tor: new Float32Array(N4 * 3), cub: new Float32Array(N4 * 3), d: new Float32Array(N4) };
  (function () {
    const r = mulberry(42), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N4; i++) {
      const y = 1 - (i / (N4 - 1)) * 2, rr = Math.sqrt(1 - y * y), th = ga * i;
      P4.sph.set([Math.cos(th) * rr, y, Math.sin(th) * rr], i * 3);
      const a = ((i % 36) / 36) * TAU, b = (Math.floor(i / 36) / 25) * TAU;
      const R = 0.82, rt = 0.34;
      P4.tor.set([(R + rt * Math.cos(a)) * Math.cos(b), rt * Math.sin(a), (R + rt * Math.cos(a)) * Math.sin(b)], i * 3);
      const f = i % 6, k = Math.floor(i / 6), s = ((k % 10) / 9) * 2 - 1, t = (Math.floor(k / 10) / 14) * 2 - 1, c = 0.68;
      const v = [[c, s * c, t * c], [-c, s * c, t * c], [s * c, c, t * c], [s * c, -c, t * c], [s * c, t * c, c], [s * c, t * c, -c]][f];
      P4.cub.set(v, i * 3);
      P4.d[i] = r();
    }
  })();
  const s4buf = { x: new Float32Array(N4), y: new Float32Array(N4), z: new Float32Array(N4), idx: new Uint16Array(N4).map((_, i) => i) };

  function s4(ctx, u) {
    fill(ctx, C.ink);
    let rotY = u * 0.8 - 0.4;
    for (let j = 1; j <= 3; j++) rotY += 0.7 * E.outExpo(prog(u, j * B, j * B + 0.5));
    const rotX = 0.42 + 0.08 * Math.sin(u * 2);
    const dive = E.inExpo(prog(u, 3.35 * B, 4 * B));
    const camD = 4 - dive * 3.6, F = 1320;
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);

    // backdrop type
    ctx.save();
    ctx.font = font(900, 470); ctx.letterSpacing = '12px'; ctx.textAlign = 'center';
    ctx.strokeStyle = rgba(C.paper, 0.1 * (1 - dive)); ctx.lineWidth = 2;
    const bp = E.outExpo(prog(u, 0.05, 0.8));
    ctx.translate(CX - Math.sin(rotY) * 50, CY + 170 + (1 - bp) * 80);
    ctx.globalAlpha = bp;
    ctx.strokeText('DEPTH', 0, 0);
    ctx.restore();

    const X = s4buf.x, Y = s4buf.y, Z = s4buf.z;
    for (let i = 0; i < N4; i++) {
      const d = P4.d[i];
      const m1 = E.inOutCubic(prog(u, B + d * 0.15, B + d * 0.15 + 0.34));
      const m2 = E.inOutCubic(prog(u, 2 * B + d * 0.15, 2 * B + d * 0.15 + 0.34));
      const m3 = E.inOutCubic(prog(u, 3 * B + d * 0.12, 3 * B + d * 0.12 + 0.28));
      const em = E.outBack(prog(u, d * 0.2, d * 0.2 + 0.5));
      let px = lerp(P4.sph[i * 3], P4.tor[i * 3], m1), py = lerp(P4.sph[i * 3 + 1], P4.tor[i * 3 + 1], m1), pz = lerp(P4.sph[i * 3 + 2], P4.tor[i * 3 + 2], m1);
      px = lerp(px, P4.cub[i * 3], m2); py = lerp(py, P4.cub[i * 3 + 1], m2); pz = lerp(pz, P4.cub[i * 3 + 2], m2);
      if (m3 > 0) {
        const gx = ((i % 30) / 29) * 2 - 1, gz = (Math.floor(i / 30) / 29) * 2 - 1;
        const wx = gx * 1.7, wz = gz * 1.7, wy = 0.2 * Math.sin(wx * 2.6 + u * 6) * Math.cos(wz * 2.4 + u * 4);
        px = lerp(px, wx, m3); py = lerp(py, wy, m3); pz = lerp(pz, wz, m3);
      }
      px *= em; py *= em; pz *= em;
      const x1 = px * cy + pz * sy, z1 = -px * sy + pz * cy;
      const y2 = py * cx - z1 * sx, z2 = py * sx + z1 * cx;
      X[i] = x1; Y[i] = y2; Z[i] = z2;
    }
    const idx = s4buf.idx;
    idx.sort((a, b) => Z[b] - Z[a]);

    // orbit rings (behind + front drawn together, light)
    const op = E.outExpo(prog(u, 0.3, 1.1));
    ctx.save();
    ctx.globalAlpha = 1 - dive;
    for (let rI = 0; rI < 2; rI++) {
      const tilt = rI ? 1.15 : -0.5, R = rI ? 1.5 : 1.75;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      ctx.strokeStyle = rgba(C.paper, 0.2); ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true, sat = null;
      for (let k = 0; k <= 120 * op; k++) {
        const a = (k / 120) * TAU + rI * 2;
        let px = Math.cos(a) * R, py = 0, pz = Math.sin(a) * R;
        const qy = py * ct - px * st, qx = py * st + px * ct; px = qx; py = qy;
        const x1 = px * cy + pz * sy, z1 = -px * sy + pz * cy, y2 = py * cx - z1 * sx, z2 = py * sx + z1 * cx;
        const s = F / (z2 + camD); if (z2 + camD < 0.2) { first = true; continue; }
        const sxp = CX + x1 * s, syp = CY + y2 * s;
        first ? ctx.moveTo(sxp, syp) : ctx.lineTo(sxp, syp); first = false;
      }
      ctx.stroke();
      const a = u * (rI ? 2.6 : -2.1) + rI;
      let px = Math.cos(a) * R, py = 0, pz = Math.sin(a) * R;
      const qy = py * ct - px * st, qx = py * st + px * ct; px = qx; py = qy;
      const x1 = px * cy + pz * sy, z1 = -px * sy + pz * cy, y2 = py * cx - z1 * sx, z2 = py * sx + z1 * cx;
      const s = F / (z2 + camD);
      if (op > 0.2 && z2 + camD > 0.2) { disc(ctx, CX + x1 * s, CY + y2 * s, 12 * s / 330, rgba(C.signal, 0.3)); disc(ctx, CX + x1 * s, CY + y2 * s, 5.5 * s / 330, C.signal); }
    }
    ctx.restore();

    for (let n = 0; n < N4; n++) {
      const i = idx[n], zz = Z[i] + camD;
      if (zz < 0.15) continue;
      const s = F / zz;
      const depth = clamp((Z[i] + 1.3) / 2.6);
      const r = Math.max(0.7, 3.4 * s / 330);
      const hot = i % 9 === 0;
      ctx.fillStyle = hot ? C.signal : rgba(C.paper, lerp(1, 0.3, depth));
      ctx.beginPath(); ctx.arc(CX + X[i] * s, CY + Y[i] * s, r, 0, TAU); ctx.fill();
    }

    // caption
    ctx.save();
    ctx.font = font(400, 15, FM); ctx.fillStyle = rgba(C.paper, 0.55 * (1 - dive)); ctx.textAlign = 'center';
    const labels = ['SPHERE', 'TORUS', 'CUBE', 'FIELD'];
    const li = Math.min(3, Math.floor(u / B));
    ctx.fillText(scramble(`900 POINTS · MORPH ${li + 1}/4 · ${labels[li]}`, prog(u - li * B, 0, 0.25), li, u), CX, 905);
    ctx.restore();

    // spin-square wipe → cobalt
    const wp = prog(u, 3.45 * B, 4 * B);
    if (wp > 0) {
      ctx.save();
      ctx.translate(CX, CY);
      ctx.save(); ctx.rotate(-(1 - E.outCubic(wp)) * 2.2 + 0.08 * (1 - wp)); const s2s = 2500 * E.inExpo(clamp(wp * 1.08));
      ctx.strokeStyle = C.paper; ctx.lineWidth = 3; ctx.strokeRect(-s2s / 2, -s2s / 2, s2s, s2s); ctx.restore();
      ctx.rotate(-(1 - E.outCubic(wp)) * 2.2); const ss = 2500 * E.inExpo(wp);
      ctx.fillStyle = C.cobalt; ctx.fillRect(-ss / 2, -ss / 2, ss, ss);
      ctx.restore();
    }
  }

  // ═════════════════════════════════════════════ SCENE 5 — SYSTEMS / RHYTHM
  const K5 = 72;
  const SHAPES = (function () {
    const rayRect = (th, a, b) => Math.min(a / Math.max(1e-6, Math.abs(Math.cos(th))), b / Math.max(1e-6, Math.abs(Math.sin(th))));
    const poly = (th, n, R, off) => { const seg = TAU / n; const m = ((((th - off) % seg) + seg) % seg) - seg / 2; return (R * Math.cos(Math.PI / n)) / Math.cos(m); };
    const fns = [
      () => 1, // circle
      (th) => poly(th, 4, 1.22, Math.PI / 4), // square
      (th) => poly(th, 3, 1.45, -Math.PI / 2), // triangle
      (th) => 0.42 + 0.95 * Math.pow(Math.abs(Math.cos(2 * th)), 5), // sparkle ✦
      (th) => Math.max(rayRect(th, 1.1, 0.36), rayRect(th, 0.36, 1.1)), // plus
    ];
    return fns.map((f) => Float32Array.from({ length: K5 }, (_, k) => f((k / K5) * TAU)));
  })();
  // waves: [beat, originX, originY, shape, rotation]
  const WAVES = [
    [1, 0, 0, 1, Math.PI / 2],
    [2, W, H, 2, (2 * Math.PI) / 3],
    [2.5, CX, CY, 3, Math.PI / 4],
    [2.75, W, 0, 4, Math.PI / 4],
  ];
  const r5 = new Float32Array(K5);
  function s5(ctx, u) {
    fill(ctx, C.cobalt);
    const cell = 120;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 16; c++) {
        const x = c * cell + cell / 2, y = r * cell + cell / 2;
        const dc = Math.hypot(x - CX, y - CY);
        const app = E.outBack(prog(u, dc / 3200, dc / 3200 + 0.35));
        r5.set(SHAPES[0]);
        let rot = 0, flash = 0, pulse = 0;
        for (const [bt, ox, oy, sh, rr] of WAVES) {
          const d = Math.hypot(x - ox, y - oy) / 4200;
          const p = prog(u, bt * B + d, bt * B + d + 0.28);
          if (p <= 0) continue;
          const e = E.inOutCubic(p);
          const tgt = SHAPES[sh];
          for (let k = 0; k < K5; k++) r5[k] = lerp(r5[k], tgt[k], e);
          rot += rr * E.outBack(p);
          pulse += Math.sin(Math.PI * p) * 0.45;
          if (sh === 3) flash = Math.max(flash, Math.sin(Math.PI * clamp(p * 1.4)));
        }
        // transition: tile wipe → paper
        const tw = E.inOutCubic(prog(u, 3 * B + ((c + r) / 24) * 0.2, 3 * B + ((c + r) / 24) * 0.2 + 0.22));
        if (tw > 0) {
          for (let k = 0; k < K5; k++) r5[k] = lerp(r5[k], SHAPES[1][k], tw);
          const snap = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
          rot = lerp(rot, snap, tw);
        }
        const breathe = 0.1 * Math.sin(dc / 80 - u * 9);
        let R = 30 * app * (1 + pulse + breathe * (1 - tw));
        R = lerp(R, 61 / (1.22 * Math.SQRT1_2), tw); // square inradius → half cell (+1px overlap)
        ctx.fillStyle = tw > 0 ? mixHex(flash > 0 ? C.signal : C.paper, C.paper, tw) : flash > 0 ? mixHex(C.paper, C.signal, flash) : C.paper;
        ctx.beginPath();
        for (let k = 0; k < K5; k++) {
          const th = (k / K5) * TAU + rot, rr = r5[k] * R;
          const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }
    // overlay guide lines in empty space (grid system detail)
    ctx.save();
    ctx.strokeStyle = rgba(C.paper, 0.18 * (1 - prog(u, 3 * B, 3.4 * B)));
    ctx.lineWidth = 1;
    const gp = E.outExpo(prog(u, 0, 0.6));
    for (let c = 1; c < 16; c++) line(ctx, c * cell, 0, c * cell, H * gp);
    for (let r = 1; r < 9; r++) line(ctx, 0, r * cell, W * gp, r * cell);
    ctx.restore();
  }

  // ═════════════════════════════════════════════ SCENE 6 — DATA / UI
  const ENERGY = [0.22, 0.28, 0.42, 0.58, 0.7, 0.62, 0.8, 0.74, 0.6, 0.55, 0.72, 0.66, 0.76, 0.7, 0.86, 0.8, 0.72, 0.78, 0.82, 0.88, 0.8, 0.76, 0.92, 0.86, 0.86, 0.9, 0.96, 1.0, 1.0, 0.62, 0.44, 0.24];
  const STATS = [
    { v: 900, pad: 3, l: 'FRAMES' },
    { v: 128, pad: 3, l: 'BPM' },
    { v: 8, pad: 2, l: 'SCENES' },
    { v: 0, from: 99, pad: 1, l: 'TEMPLATES' },
  ];
  function s6(ctx, u, tGlobal) {
    const t = tGlobal ?? 5 * BAR + u;
    fill(ctx, C.paper);
    const M = 120;
    ctx.fillStyle = C.ink;

    ctx.save();
    ctx.font = font(400, 16, FM); ctx.fillStyle = rgba(C.ink, 0.6);
    ctx.fillText(typed('06 / BY THE NUMBERS', prog(u, 0.02, 0.3)), M, 168);
    ctx.fillStyle = C.ink;
    ctx.font = font(700, 76); ctx.letterSpacing = '-2px';
    revealText(ctx, 'This reel, by the numbers.', M, 252, 76, u - 0.05, { stagger: 0.012, dur: 0.5 });
    ctx.restore();

    ctx.fillRect(M, 296, (W - 2 * M) * E.outExpo(prog(u, 0.1, 0.7)), 3);

    // stats
    STATS.forEach((s, i) => {
      const x = M + i * 420, t0 = 0.15 + i * 0.07;
      const e = E.outExpo(prog(u, t0, t0 + 0.75));
      const val = s.from !== undefined ? Math.round(lerp(s.from, s.v, e)) : Math.round(s.v * e);
      const str = String(val).padStart(s.pad, '0');
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 10, 330, 410, 220); ctx.clip();
      const ap = E.outExpo(prog(u, t0, t0 + 0.4));
      ctx.translate(0, (1 - ap) * 200);
      ctx.font = font(900, 172); ctx.letterSpacing = '-6px';
      const adv = 104;
      for (let k = 0; k < str.length; k++) { ctx.textAlign = 'center'; ctx.fillStyle = i === 3 ? C.signal : C.ink; ctx.fillText(str[k], x + adv / 2 + k * adv - 6, 520); }
      ctx.restore();
      ctx.save();
      ctx.font = font(600, 21, FT); ctx.letterSpacing = '4px'; ctx.fillStyle = rgba(C.ink, 0.75);
      ctx.fillText(typed(s.l, prog(u, t0 + 0.15, t0 + 0.45)), x, 580);
      if (i > 0) { ctx.fillStyle = rgba(C.ink, 0.25); ctx.fillRect(x - 28, 340, 1.5, 250 * E.outExpo(prog(u, t0, t0 + 0.5))); }
      ctx.restore();
    });

    // energy map — one bar per beat of this reel
    const bx = M, bw = (W - 2 * M) / 32, base = 960, maxH = 250;
    const cur = Math.floor(t / B);
    ctx.save();
    ctx.font = font(400, 14, FM); ctx.fillStyle = rgba(C.ink, 0.6);
    ctx.fillText(typed('ENERGY MAP — 32 BEATS', prog(u, 0.3, 0.6)), M, 680);
    ctx.textAlign = 'right';
    ctx.fillText(typed(`BEAT ${String(cur + 1).padStart(2, '0')}/32`, prog(u, 0.35, 0.6)), W - M, 680);
    ctx.textAlign = 'left';
    for (let i = 0; i < 32; i++) {
      const gp = E.outExpo(prog(u, 0.25 + i * 0.012, 0.75 + i * 0.012));
      const pulse = 0.82 + 0.18 * kickEnv(t) * (0.6 + 0.4 * hash(i));
      let h = ENERGY[i] * maxH * gp * pulse;
      let x = bx + i * bw + 7, w = bw - 14, top = base - h;
      const tw = E.inOutExpo(prog(u, 3 * B + i * 0.006, 3 * B + i * 0.006 + 0.27));
      if (tw > 0) { x = lerp(x, i * 60 - 2, tw); w = lerp(w, 64, tw); top = lerp(top, -40, tw); h = lerp(h, H + 80, tw); }
      ctx.fillStyle = i === cur && tw < 0.5 ? C.signal : i < cur || tw > 0 ? C.ink : rgba(C.ink, 0.18);
      ctx.fillRect(x, top, w, h);
      if (i % 4 === 0 && tw === 0) {
        ctx.fillStyle = rgba(C.ink, 0.5 * gp);
        ctx.fillText(`BAR ${i / 4 + 1}`, x, base + 28);
      }
    }
    ctx.restore();
  }

  // ═════════════════════════════════════════════ SCENE 7 — PARTICLES (+ montage)
  let P7 = null;
  function initParticles() {
    const c = mk(), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.font = font(900, 360); x.letterSpacing = '-8px'; x.textAlign = 'center';
    x.fillText('MOTION', CX, CY + 128);
    const img = x.getImageData(0, 0, W, H).data, pts = [];
    const step = 7;
    for (let yy = 0; yy < H; yy += step) for (let xx = 0; xx < W; xx += step) if (img[(yy * W + xx) * 4 + 3] > 128) pts.push(xx, yy);
    const n = pts.length / 2, r = mulberry(1234);
    P7 = { n, tx: new Float32Array(n), ty: new Float32Array(n), r0: new Float32Array(n), a0: new Float32Array(n), w: new Float32Array(n), dl: new Float32Array(n), sz: new Float32Array(n), arc: new Float32Array(n), ph: new Float32Array(n), hot: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      P7.tx[i] = pts[i * 2] + (r() - 0.5) * 2; P7.ty[i] = pts[i * 2 + 1] + (r() - 0.5) * 2;
      const rr = 90 + Math.pow(r(), 0.75) * 820;
      const arm = Math.floor(r() * 3);
      P7.r0[i] = rr; P7.a0[i] = (arm * TAU) / 3 + rr * 0.0065 + (r() - 0.5) * 0.55;
      P7.w[i] = 0.7 + 130 / (rr + 40);
      P7.dl[i] = (P7.tx[i] / W) * 0.3 + r() * 0.07;
      P7.sz[i] = 2.2 + r() * 2.2; P7.arc[i] = (r() - 0.5) * 220; P7.ph[i] = r() * TAU;
      P7.hot[i] = arm === 0 && r() < 0.5 ? 1 : 0;
    }
  }
  const snapC = mk(), snapX = snapC.getContext('2d');
  const MONTAGE = [
    [3.0, s2, 2.2 * B],
    [3.25, s4, 1.55 * B],
    [3.5, s5, 2.62 * B],
    [3.625, s6, 1.7 * B],
    [3.75, s3, 2.0 * B],
    [3.875, s1, 3.08 * B],
  ];
  function s7(ctx, u) {
    if (u >= 3 * B) return montage(ctx, u);
    fill(ctx, C.ink);
    const P = P7, n = P.n;
    const sweep = lerp(150, 1770, E.inOutCubic(prog(u, 2.35 * B, 3 * B)));
    for (let i = 0; i < n; i++) {
      const em = E.outExpo(prog(u, 0, 0.55 + (P.r0[i] / 900) * 0.25));
      const a = P.a0[i] + P.w[i] * u * 1.3;
      const rr = P.r0[i] * em * (1 + 0.08 * Math.sin(u * 3 + P.ph[i]));
      const vx = CX + Math.cos(a) * rr * 1.15, vy = CY + Math.sin(a) * rr * 0.52;
      const c0 = 1.05 * B + P.dl[i];
      const c = E.inOutCubic(prog(u, c0, c0 + 0.5));
      let x = lerp(vx, P.tx[i], c), y = lerp(vy, P.ty[i], c);
      const sa = Math.sin(Math.PI * c) * P.arc[i];
      x += -(P.ty[i] - vy) / 900 * sa; y += (P.tx[i] - vx) / 900 * sa;
      if (c >= 1) { x += Math.sin(u * 7 + P.ph[i]) * 0.8; y += Math.cos(u * 6 + P.ph[i]) * 0.8; }
      const near = c >= 1 ? Math.exp(-Math.pow((x - sweep) / 40, 2)) : 0;
      const s = P.sz[i] * (1 + near * 0.8) * lerp(1, 0.85, c);
      ctx.fillStyle = near > 0.3 || (P.hot[i] && c < 1) ? C.signal : C.paper;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.save();
    ctx.font = font(400, 15, FM); ctx.textAlign = 'center'; ctx.fillStyle = rgba(C.paper, 0.55);
    ctx.fillText(typed(`${n.toLocaleString('en-US')} PARTICLES → 1 WORD`, prog(u, 2.2 * B, 2.8 * B)), CX, 860);
    ctx.restore();
  }
  function montage(ctx, u) {
    let k = 0;
    for (let i = 0; i < MONTAGE.length; i++) if (u >= MONTAGE[i][0] * B) k = i;
    const [b0, fn, us] = MONTAGE[k];
    const lu = u - b0 * B;
    snapX.save();
    snapX.setTransform(1, 0, 0, 1, 0, 0);
    fn(snapX, us + lu);
    snapX.restore();
    ctx.save();
    ctx.drawImage(snapC, 0, 0);
    // slice displacement
    const decay = Math.exp(-lu * 18);
    for (let s = 0; s < 7; s++) {
      const y = Math.floor(hash(k * 31 + s) * H), h = 8 + hash(k * 17 + s * 3) * 90;
      const dx = (hash(k * 7 + s * 11) - 0.5) * 260 * (0.35 + decay);
      ctx.drawImage(snapC, 0, y, W, h, dx, y, W, h);
    }
    if (k % 2 === 1) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(-400, -400, W + 800, H + 800); }
    ctx.restore();
    // frame-index flash
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = '#fff'; ctx.font = font(900, 130); ctx.textAlign = 'right';
    ctx.fillText(String([2, 4, 5, 6, 3, 1][k]).padStart(2, '0'), W - 110, 220);
    ctx.restore();
  }

  // ═════════════════════════════════════════════ SCENE 8 — END CARD
  const endC = mk(), endX = endC.getContext('2d');
  function endContent(ctx, u) {
    fill(ctx, C.ink);
    // shockwave
    const sp = prog(u, 0, 0.8);
    if (sp > 0 && sp < 1) {
      ctx.strokeStyle = rgba(C.signal, 1 - sp); ctx.lineWidth = 30 * (1 - sp);
      ctx.beginPath(); ctx.arc(CX, CY, 80 + E.outExpo(sp) * 1100, 0, TAU); ctx.stroke();
    }
    ctx.save();
    ctx.font = font(400, 16, FM); ctx.textAlign = 'center'; ctx.letterSpacing = '6px';
    ctx.fillStyle = rgba(C.paper, 0.6);
    ctx.fillText(scramble('SHOWREEL 2026', prog(u, 0.1, 0.45), 3, u), CX, 300);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = C.paper;
    ctx.font = font(900, 290); ctx.letterSpacing = '-10px';
    revealText(ctx, 'CLAUDE', CX, 560, 290, u - 0.02, { stagger: 0.035, dur: 0.6, rot: 0.12, align: 'center' });
    const xs = measure(ctx, 'CLAUDE'), w = xs[6] - 10, x0 = CX - w / 2 - 5;
    const b1 = E.outExpo(prog(u, 0.22, 0.62)), b2 = E.inOutCubic(prog(u, 0.62, 0.95));
    ctx.fillStyle = C.signal;
    ctx.fillRect(x0 + w * b2 * 0.0, 598, w * b1, 14);
    ctx.restore();

    ctx.save();
    const tp = E.outExpo(prog(u, 0.3, 1.1));
    ctx.font = font(600, 34, FT); ctx.letterSpacing = `${lerp(48, 16, tp)}px`; ctx.textAlign = 'center';
    ctx.fillStyle = rgba(C.paper, tp);
    ctx.fillText('MOTION DESIGNER', CX + lerp(48, 16, tp) / 2, 690);
    ctx.restore();

    ctx.save();
    const gp = E.outCubic(prog(u, 0.55, 1.0));
    ctx.globalAlpha = gp; ctx.textAlign = 'center';
    ctx.font = font(400, 26, FD); ctx.fillStyle = rgba(C.paper, 0.75);
    ctx.fillText('Every frame, on purpose.', CX, 760 + (1 - gp) * 16);
    ctx.font = font(400, 21, FJ); ctx.fillStyle = rgba(C.paper, 0.5);
    ctx.fillText('すべてのフレームに、意図を。', CX, 798 + (1 - gp) * 16);
    ctx.restore();

    ctx.save();
    const rp = E.outExpo(prog(u, 0.4, 1.0));
    ctx.fillStyle = rgba(C.paper, 0.3); ctx.fillRect(CX - 840 * rp, 948, 1680 * rp, 1);
    ctx.font = font(400, 14, FM); ctx.fillStyle = rgba(C.paper, 0.6 * rp); ctx.letterSpacing = '2px';
    ctx.fillText('CLAUDE.AI', 120, 984);
    ctx.textAlign = 'right';
    ctx.fillText('15 SEC · 900 FRAMES · 128 BPM · 100% CODE', W - 120, 984);
    ctx.restore();
  }
  function s8(ctx, u) {
    const c0 = 3 * B;
    if (u < c0) {
      endContent(ctx, u);
    } else {
      // CRT power-off: squash to a line, then to a dot — bookends the opening dot
      endX.save(); endX.setTransform(1, 0, 0, 1, 0, 0); endContent(endX, u); endX.restore();
      fill(ctx, '#000');
      const p1 = prog(u, c0, c0 + 0.11), p2 = prog(u, c0 + 0.11, c0 + 0.22), p3 = prog(u, c0 + 0.22, c0 + 0.42);
      const sy = lerp(1, 0.006, E.inCubic(p1)), sx = lerp(1, 0.003, E.inCubic(p2));
      if (p2 < 1) {
        ctx.save();
        ctx.translate(CX, CY); ctx.scale(sx, sy); ctx.translate(-CX, -CY);
        ctx.drawImage(endC, 0, 0);
        ctx.restore();
        ctx.fillStyle = rgba('#FFFFFF', E.inCubic(p1) * (1 - p2 * 0.2));
        ctx.fillRect(CX - (W / 2) * sx, CY - Math.max(2, (H / 2) * sy), W * sx, Math.max(4, H * sy));
      }
      if (p2 > 0.8 && p3 < 1) {
        const a = 1 - E.inCubic(p3);
        disc(ctx, CX, CY, 34 * a, rgba(C.paper, 0.18 * a));
        disc(ctx, CX, CY, 9 + 3 * Math.sin(p3 * 20) * a, rgba('#FFFFFF', a));
      }
    }
    // impact flash
    const fl = Math.exp(-u * 16);
    if (fl > 0.01) { ctx.fillStyle = rgba('#FFFFFF', fl * 0.9); ctx.fillRect(-400, -400, W + 800, H + 800); }
  }

  const SCENES = [s1, s2, s3, s4, s5, s6, s7, s8];
  const NAMES = ['IGNITE — PHYSICS', 'KINETIC TYPE', 'TIMING & EASING', 'DEPTH — 3D', 'SYSTEMS — RHYTHM', 'DATA — UI', 'PARTICLES', 'END'];

  // ───────────────────────────────────────────── renderer
  let main, mctx, sc, sctx, tmp, tctx, chan, cctx, tiny, tyx;
  function renderScene(ctx, t) {
    const i = Math.min(7, Math.max(0, Math.floor(t / BAR)));
    const u = t - i * BAR;
    const sh = shake(t);
    const pulse = 1 + 0.007 * kickEnv(t);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(CX + sh.x, CY + sh.y); ctx.rotate(sh.r); ctx.scale(pulse * sh.z, pulse * sh.z); ctx.translate(-CX, -CY);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
    SCENES[i](ctx, u);
    ctx.restore();
  }

  function chroma(amt) {
    if (amt < 0.6) return;
    tctx.globalCompositeOperation = 'copy'; tctx.drawImage(main, 0, 0); tctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, W, H);
    const chans = [['#FF0000', amt, 0], ['#00FF00', 0, 0], ['#0000FF', -amt, amt * 0.3]];
    for (const [col, dx, dy] of chans) {
      cctx.globalCompositeOperation = 'copy'; cctx.drawImage(tmp, 0, 0);
      cctx.globalCompositeOperation = 'multiply'; cctx.fillStyle = col; cctx.fillRect(0, 0, W, H);
      mctx.globalCompositeOperation = 'lighter';
      // scale slightly from center so edges never show black
      mctx.drawImage(chan, -Math.abs(amt) + dx, -Math.abs(amt) + dy, W + 2 * Math.abs(amt), H + 2 * Math.abs(amt));
    }
    mctx.globalCompositeOperation = 'source-over';
  }

  let vignette;
  function post(t) {
    chroma(chromaAmt(t));
    mctx.fillStyle = vignette; mctx.fillRect(0, 0, W, H);
  }

  // ── HUD: colour adapts to whatever is underneath it
  function hud(t) {
    const a = 1 - prog(t, 7 * BAR - 0.08, 7 * BAR + 0.02);
    if (a <= 0) return;
    tyx.drawImage(main, 0, 0, 48, 27);
    const d = tyx.getImageData(0, 0, 48, 27).data;
    const lumAt = (x, y) => { const i = (Math.min(26, Math.max(0, Math.floor((y / H) * 27))) * 48 + Math.min(47, Math.max(0, Math.floor((x / W) * 48)))) * 4; return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };
    const colAt = (x, y) => (lumAt(x, y) > 0.42 ? C.ink : C.paper);
    const boot = (d0) => prog(t, d0, d0 + 0.35);
    const ctx = mctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textBaseline = 'alphabetic';
    // crop marks
    const m = 40, l = 26;
    ctx.lineWidth = 2;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      const bp = E.outExpo(boot(0.02));
      ctx.strokeStyle = colAt(x + sx * 10, y + sy * 10);
      ctx.beginPath(); ctx.moveTo(x, y + sy * l * bp); ctx.lineTo(x, y); ctx.lineTo(x + sx * l * bp, y); ctx.stroke();
    }
    // top-left
    ctx.font = font(600, 15, FT); ctx.letterSpacing = '3px'; ctx.textAlign = 'left';
    ctx.fillStyle = colAt(150, 82);
    ctx.fillText(scramble('CLAUDE — MOTION DESIGN', boot(0.05), 1, t), 72, 84);
    ctx.font = font(400, 12, FM); ctx.letterSpacing = '1px'; ctx.globalAlpha = a * 0.6;
    ctx.fillText(scramble('SHOWREEL 2026 · REEL_v12_FINAL_final2.mov', boot(0.12), 2, t), 72, 106);
    ctx.globalAlpha = a;
    // top-right timecode
    const f = Math.min(899, Math.floor(t * FPS + 1e-4));
    const tc = `TC 00:00:${String(Math.floor(f / FPS)).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`;
    ctx.textAlign = 'right'; ctx.font = font(400, 16, FM); ctx.letterSpacing = '1px';
    ctx.fillStyle = colAt(W - 140, 82);
    ctx.fillText(scramble(tc, boot(0.08), 3, t), W - 72, 84);
    ctx.font = font(400, 12, FM); ctx.globalAlpha = a * 0.6;
    ctx.fillText(scramble(`FRAME ${String(f + 1).padStart(3, '0')}/900`, boot(0.15), 4, t), W - 92, 106);
    ctx.globalAlpha = a * boot(0.15);
    disc(ctx, W - 78, 102, 4.5, (t % B) < B / 2 ? C.signal : rgba(C.signal, 0.25));
    ctx.globalAlpha = a;
    // bottom-left: scene
    const si = Math.min(7, Math.floor(t / BAR)), su = t - si * BAR;
    ctx.textAlign = 'left';
    ctx.fillStyle = colAt(160, H - 66);
    ctx.font = font(400, 13, FM); ctx.letterSpacing = '1px';
    ctx.fillText(`${String(si + 1).padStart(2, '0')}/08`, 72, H - 62);
    ctx.font = font(600, 15, FT); ctx.letterSpacing = '3px';
    ctx.fillText(scramble(NAMES[si], prog(su, 0.02, 0.4), si * 5, t), 126, H - 62);
    // bottom-right
    ctx.textAlign = 'right'; ctx.fillStyle = colAt(W - 200, H - 66);
    ctx.font = font(400, 12, FM); ctx.letterSpacing = '1px'; ctx.globalAlpha = a * 0.7;
    ctx.fillText(scramble('1920×1080 · 60 FPS · 128 BPM', boot(0.2), 6, t), W - 72, H - 62);
    ctx.globalAlpha = a;
    // progress bar (per-column colour)
    const y = H - 40, x0 = 72, x1 = W - 72, pp = t / DUR;
    const bpp = E.outExpo(boot(0.1));
    for (let c = 0; c < 48; c++) {
      const cx0 = Math.max(x0, (c / 48) * W), cx1 = Math.min(x1 * bpp + x0 * (1 - bpp), ((c + 1) / 48) * W);
      if (cx1 <= cx0) continue;
      const col = colAt((cx0 + cx1) / 2, y);
      ctx.fillStyle = col; ctx.globalAlpha = a * 0.25; ctx.fillRect(cx0, y, cx1 - cx0, 1);
      const fx1 = Math.min(cx1, lerp(x0, x1, pp));
      if (fx1 > cx0) { ctx.globalAlpha = a; ctx.fillRect(cx0, y - 1, fx1 - cx0, 3); }
      for (let k = 0; k <= 32; k++) {
        const tx = lerp(x0, x1, k / 32);
        if (tx < cx0 || tx >= cx1) continue;
        ctx.globalAlpha = a * (k % 4 === 0 ? 0.8 : 0.35);
        ctx.fillRect(tx, y - (k % 4 === 0 ? 7 : 3), 1, k % 4 === 0 ? 7 : 3);
      }
    }
    ctx.restore();
  }

  function drawFrame(t, samples = 1) {
    t = clamp(t, 0, DUR - 1e-6);
    if (samples <= 1) {
      renderScene(sctx, t);
      mctx.globalCompositeOperation = 'copy'; mctx.globalAlpha = 1; mctx.drawImage(sc, 0, 0); mctx.globalCompositeOperation = 'source-over';
    } else {
      for (let k = 0; k < samples; k++) {
        const tt = clamp(t + ((k + 0.5) / samples - 0.5) * (SHUTTER / FPS), 0, DUR - 1e-6);
        renderScene(sctx, tt);
        mctx.globalCompositeOperation = k === 0 ? 'copy' : 'source-over';
        mctx.globalAlpha = 1 / (k + 1);
        mctx.drawImage(sc, 0, 0);
      }
      mctx.globalAlpha = 1; mctx.globalCompositeOperation = 'source-over';
    }
    post(t);
    hud(t);
  }

  async function init(canvas) {
    main = canvas; main.width = W; main.height = H;
    mctx = main.getContext('2d');
    sc = mk(); sctx = sc.getContext('2d');
    tmp = mk(); tctx = tmp.getContext('2d');
    chan = mk(); cctx = chan.getContext('2d');
    tiny = mk(48, 27); tyx = tiny.getContext('2d', { willReadFrequently: true });
    vignette = mctx.createRadialGradient(CX, CY, 420, CX, CY, 1180);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.32)');
    const specs = [font(900, 100), font(700, 100), font(600, 100, FT), font(500, 100, FT), font(400, 100), font(300, 100), font(400, 100, FM), font(400, 100, FJ)];
    if (document.fonts) await Promise.all(specs.map((s) => document.fonts.load(s, 'AaあMOTION')));
    initParticles();
  }

  global.REEL = { init, drawFrame, W, H, FPS, DUR, BPM, B, BAR, frames: Math.round(DUR * FPS) };
})(window);
