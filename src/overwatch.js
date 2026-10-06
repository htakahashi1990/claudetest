/*
 * OVERWATCH — fan-made concept promo (unofficial)
 * ----------------------------------------------
 * 24 seconds · 1920×1080 · 60 fps · 120 BPM (48 beats, 12 bars)
 * Built in the same style/engine as src/reel.js: every frame is a pure
 * function of time — PROMO.drawFrame(t, samples).
 *
 * Not affiliated with or endorsed by Blizzard Entertainment. All heroes,
 * names, icons and copy here are original stand-ins.
 */
(function (global) {
  'use strict';

  // ───────────────────────────────────────────── constants
  const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
  const FPS = 60, BPM = 120, B = 60 / BPM, BAR = 4 * B, BARS = 12, DUR = BARS * BAR;
  const SHUTTER = 0.5;
  const TAU = Math.PI * 2;

  const C = {
    ink: '#0A0D14',
    paper: '#F4F1EA',
    orange: '#F99E1A',
    ally: '#38B6FF',
    enemy: '#FF3B4E',
    heal: '#FFE45C',
    slate: '#1B2232',
    slate2: '#2A3348',
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
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inOutExpo: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
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
  function rgbOf(hex) {
    let c = rgbCache.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
    return c;
  }
  const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  function mixHex(h1, h2, t) {
    const a = rgbOf(h1), b = rgbOf(h2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }

  // ───────────────────────────────────────────── canvas helpers
  const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const font = (w, s, f = FD) => `${w} ${s}px ${f}`;
  const ifont = (w, s) => `italic ${w} ${s}px ${FD}`;
  function fill(ctx, color) { ctx.fillStyle = color; ctx.fillRect(-400, -400, W + 800, H + 800); }
  function disc(ctx, x, y, r, color) { if (r <= 0) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function ring(ctx, x, y, r, color, lw) { if (r <= 0) return; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function poly(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function circ(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  function diamond(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }
  // condensed italic display type
  const CD = 0.86;
  function cond(ctx, x, y) { ctx.translate(x, y); ctx.scale(CD, 1); }

  const mcache = new Map();
  function measure(ctx, str) {
    const key = ctx.font + '|' + ctx.letterSpacing + '|' + str;
    let xs = mcache.get(key);
    if (!xs) { xs = []; for (let i = 0; i <= str.length; i++) xs.push(ctx.measureText(str.slice(0, i)).width); mcache.set(key, xs); }
    return xs;
  }
  function textX(ctx, str, x, align) {
    const w = measure(ctx, str)[str.length];
    return align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  }
  function revealText(ctx, str, x, y, size, u, o = {}) {
    const stagger = o.stagger ?? 0.03, dur = o.dur ?? 0.5, ease = o.ease || E.outExpo;
    const xs = measure(ctx, str), x0 = textX(ctx, str, x, o.align);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.02, xs[str.length] + size * 2, size * 1.28); ctx.clip();
    for (let i = 0; i < str.length; i++) {
      if (str[i] === ' ') continue;
      const p = ease(prog(u, i * stagger, i * stagger + dur));
      if (p <= 0) continue;
      ctx.save();
      ctx.translate(x0 + xs[i], y + (1 - p) * size * 1.1);
      if (o.rot) ctx.rotate((1 - p) * o.rot);
      ctx.fillText(str[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
    return xs[str.length];
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
  const pad = (n, k) => String(n).padStart(k, '0');

  // ═════════════════════════════════════════════ shared graphics
  // Original stand-in hero silhouettes (100 units tall, feet at origin)
  function heroPath(ctx, role) {
    ctx.beginPath();
    poly(ctx, [[-13, 0], [-4, 0], [-2, -44], [-15, -44]]);
    poly(ctx, [[4, 0], [13, 0], [15, -44], [2, -44]]);
    if (role === 'tank') {
      poly(ctx, [[-30, -40], [30, -40], [38, -80], [-38, -80]]);
      circ(ctx, -36, -76, 15); circ(ctx, 36, -76, 15);
      circ(ctx, 0, -91, 11);
      poly(ctx, [[-62, -98], [-42, -102], [-42, -22], [-62, -26]]);
    } else if (role === 'damage') {
      poly(ctx, [[-15, -42], [15, -42], [19, -78], [-19, -78]]);
      circ(ctx, 0, -88, 9.5); circ(ctx, 17, -75, 7);
      poly(ctx, [[6, -66], [56, -75], [57, -68], [8, -57]]);
      poly(ctx, [[14, -62], [23, -63], [21, -50], [14, -50]]);
    } else {
      poly(ctx, [[-15, -42], [15, -42], [17, -78], [-17, -78]]);
      poly(ctx, [[-17, -48], [17, -48], [27, -12], [-27, -12]]);
      circ(ctx, 0, -88, 9.5);
      poly(ctx, [[27, -106], [31, -106], [31, 0], [27, 0]]);
      circ(ctx, 29, -108, 5);
    }
  }
  function hero2D(ctx, x, y, s, role, o = {}) {
    const k = s / 100;
    const rim = o.rim || C.ally, body = o.fill || C.slate;
    ctx.save();
    ctx.translate(x, y); ctx.scale(o.flip ? -k : k, k);
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    heroPath(ctx, role);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rim; ctx.lineWidth = (o.rimW ?? 3.2) / Math.max(0.35, k);
    if (o.glow !== false) { ctx.shadowColor = rim; ctx.shadowBlur = o.glow ?? 18; }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = o.flash ? mixHex(body, '#FFFFFF', o.flash) : body;
    ctx.fill();
    // visor + support halo
    ctx.fillStyle = rim;
    if (role === 'tank') ctx.fillRect(-8, -94, 16, 3.5);
    else ctx.fillRect(-6, -90, 12, 3);
    if (role === 'support') {
      ctx.strokeStyle = rim; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(0, -104, 13, 3.5, 0, 0, TAU); ctx.stroke();
    }
    if (role === 'damage') { ctx.fillRect(40, -73, 14, 2.5); }
    ctx.restore();
  }

  // original role icons
  function roleIcon(ctx, role, x, y, s, col) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    if (role === 'tank') {
      ctx.beginPath();
      ctx.moveTo(-0.42, -0.5); ctx.lineTo(0.42, -0.5); ctx.lineTo(0.42, 0.06);
      ctx.quadraticCurveTo(0.42, 0.36, 0, 0.56); ctx.quadraticCurveTo(-0.42, 0.36, -0.42, 0.06); ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.moveTo(-0.2, -0.3); ctx.lineTo(0.2, -0.3); ctx.lineTo(0, 0.28); ctx.closePath(); ctx.fill();
    } else if (role === 'damage') {
      ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.09;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(ctx, Math.cos(a) * 0.22, Math.sin(a) * 0.22, Math.cos(a) * 0.56, Math.sin(a) * 0.56); }
      ctx.beginPath(); ctx.arc(0, 0, 0.08, 0, TAU); ctx.fill();
    } else {
      const a = 0.17, b = 0.5;
      ctx.beginPath();
      ctx.moveTo(-a, -b); ctx.lineTo(a, -b); ctx.lineTo(a, -a); ctx.lineTo(b, -a); ctx.lineTo(b, a); ctx.lineTo(a, a);
      ctx.lineTo(a, b); ctx.lineTo(-a, b); ctx.lineTo(-a, a); ctx.lineTo(-b, a); ctx.lineTo(-b, -a); ctx.lineTo(-a, -a); ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function hexGrid(ctx, cx, cy, r, alpha, col, off = 0) {
    ctx.save();
    ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 1;
    const hx = r * Math.sqrt(3), hy = r * 1.5;
    ctx.beginPath();
    for (let row = -1; row < H / hy + 2; row++) {
      for (let c = -1; c < W / hx + 2; c++) {
        const x = c * hx + (row % 2 ? hx / 2 : 0) + ((off * hx) % hx), y = row * hy;
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3, a2 = a + Math.PI / 3;
          ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a2) * r, y + Math.sin(a2) * r);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ═════════════════════════════════════════════ 3D ENGINE (first-person scenes)
  const F3 = 880, NEAR = 0.08;
  const SUN = (() => { const v = [0.45, 0.55, 0.7], l = Math.hypot(...v); return v.map((x) => x / l); })();
  const SUNC = [255, 168, 72];
  const FOGC = [214, 118, 70];
  let cam = { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0, cy: 1, sy: 0, cp: 1, sp: 0 };
  function setCam(c) { cam = c; cam.cy = Math.cos(c.yaw); cam.sy = Math.sin(c.yaw); cam.cp = Math.cos(c.pitch); cam.sp = Math.sin(c.pitch); }
  function toCam(px, py, pz) {
    const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
    const x1 = dx * cam.cy - dz * cam.sy, z1 = dx * cam.sy + dz * cam.cy;
    return [x1, dy * cam.cp - z1 * cam.sp, dy * cam.sp + z1 * cam.cp];
  }
  function rotN(n) {
    const x1 = n[0] * cam.cy - n[2] * cam.sy, z1 = n[0] * cam.sy + n[2] * cam.cy;
    return [x1, n[1] * cam.cp - z1 * cam.sp, n[1] * cam.sp + z1 * cam.cp];
  }
  const proj = (v) => [CX + (v[0] / v[2]) * F3, CY - (v[1] / v[2]) * F3];
  function project(px, py, pz) { const v = toCam(px, py, pz); return v[2] > NEAR ? { x: CX + (v[0] / v[2]) * F3, y: CY - (v[1] / v[2]) * F3, z: v[2], s: F3 / v[2] } : null; }
  function clipNear(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]); }
    }
    return out;
  }
  function shadeRGB(col, n, flat, depth) {
    let r, g, b;
    if (flat) {
      const k = 0.92 + 0.08 * n[1];
      r = col[0] * k; g = col[1] * k; b = col[2] * k;
    } else {
      const d = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
      const amb = 0.5 + 0.2 * Math.max(0, n[1]) + 0.12 * Math.max(0, -n[2]);
      r = col[0] * amb + SUNC[0] * 0.5 * d; g = col[1] * amb + SUNC[1] * 0.5 * d; b = col[2] * amb + SUNC[2] * 0.5 * d;
      const f = 0.75 * (1 - Math.exp(-depth / 75));
      r = lerp(r, FOGC[0], f); g = lerp(g, FOGC[1], f); b = lerp(b, FOGC[2], f);
    }
    return `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
  }

  // ── world geometry
  const WORLD = [], GROUND = [];
  const N = { up: [0, 1, 0], dn: [0, -1, 0], fw: [0, 0, 1], bk: [0, 0, -1], lf: [-1, 0, 0], rt: [1, 0, 0] };
  function addFace(p, n, col, o = {}) { const f = { p, n, col, flat: !!o.flat, decals: o.decals || [], edge: o.edge ?? 0.1 }; WORLD.push(f); return f; }
  function addBox(cx, y0, cz, w, h, d, col, o = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h, z0 = cz - d / 2, z1 = cz + d / 2;
    const f = {};
    f.top = addFace([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], N.up, col, o);
    f.front = addFace([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], N.bk, col, o);
    f.back = addFace([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], N.fw, col, o);
    f.left = addFace([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], N.lf, col, o);
    f.right = addFace([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], N.rt, col, o);
    if (y0 > 0) f.bottom = addFace([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], N.dn, col, o);
    return f;
  }
  // window / stripe decals on a vertical face (axis 'z' = face spans x at fixed z, 'x' = spans z at fixed x)
  function windows(face, axis, fixed, a0, a1, y0, y1, cols, rows, col, off) {
    const r = mulberry(Math.floor(a0 * 13 + fixed * 7 + 99));
    const cw = (a1 - a0) / cols, rh = (y1 - y0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (r() < 0.35) continue;
      const u0 = a0 + i * cw + cw * 0.2, u1 = a0 + (i + 1) * cw - cw * 0.2, v0 = y0 + j * rh + rh * 0.25, v1 = y0 + (j + 1) * rh - rh * 0.2;
      const p = axis === 'z' ? [[u0, v0, fixed + off], [u1, v0, fixed + off], [u1, v1, fixed + off], [u0, v1, fixed + off]]
        : [[fixed + off, v0, u0], [fixed + off, v0, u1], [fixed + off, v1, u1], [fixed + off, v1, u0]];
      face.decals.push({ p, col: r() < 0.7 ? col : [255, 232, 190], glow: true });
    }
  }
  (function buildWorld() {
    // spawn room (interior, normals inward)
    const RC = [24, 30, 46];
    addFace([[-4, 0, -13], [4, 0, -13], [4, 4.2, -13], [-4, 4.2, -13]], N.fw, RC, { flat: true });
    const lw = addFace([[-4, 0, -13], [-4, 0, -2], [-4, 4.2, -2], [-4, 4.2, -13]], N.rt, [28, 35, 52], { flat: true });
    const rw = addFace([[4, 0, -13], [4, 0, -2], [4, 4.2, -2], [4, 4.2, -13]], N.lf, [28, 35, 52], { flat: true });
    const ce = addFace([[-4, 4.2, -13], [4, 4.2, -13], [4, 4.2, -2], [-4, 4.2, -2]], N.dn, [20, 25, 38], { flat: true });
    for (let k = 0; k < 4; k++) {
      const z = -11.5 + k * 2.6;
      lw.decals.push({ p: [[-3.98, 0.4, z], [-3.98, 0.4, z + 0.12], [-3.98, 3.6, z + 0.12], [-3.98, 3.6, z]], col: [249, 158, 26], glow: true });
      rw.decals.push({ p: [[3.98, 0.4, z], [3.98, 0.4, z + 0.12], [3.98, 3.6, z + 0.12], [3.98, 3.6, z]], col: [249, 158, 26], glow: true });
    }
    for (const x of [-1.6, 1.6]) ce.decals.push({ p: [[x - 0.08, 4.18, -12.5], [x + 0.08, 4.18, -12.5], [x + 0.08, 4.18, -2.4], [x - 0.08, 4.18, -2.4]], col: [244, 241, 234], glow: true });
    const fl = addFace([[-4, 0, -2], [-1.6, 0, -2], [-1.6, 4.2, -2], [-4, 4.2, -2]], N.bk, [34, 41, 60], { flat: true });
    const fr = addFace([[1.6, 0, -2], [4, 0, -2], [4, 4.2, -2], [1.6, 4.2, -2]], N.bk, [34, 41, 60], { flat: true });
    const ft = addFace([[-1.6, 3.2, -2], [1.6, 3.2, -2], [1.6, 4.2, -2], [-1.6, 4.2, -2]], N.bk, [34, 41, 60], { flat: true });
    fl.decals.push({ p: [[-1.85, 0, -2.01], [-1.6, 0, -2.01], [-1.6, 3.2, -2.01], [-1.85, 3.2, -2.01]], col: [249, 158, 26], glow: true });
    fr.decals.push({ p: [[1.6, 0, -2.01], [1.85, 0, -2.01], [1.85, 3.2, -2.01], [1.6, 3.2, -2.01]], col: [249, 158, 26], glow: true });
    ft.decals.push({ p: [[-1.85, 3.2, -2.01], [1.85, 3.2, -2.01], [1.85, 3.42, -2.01], [-1.85, 3.42, -2.01]], col: [249, 158, 26], glow: true });
    GROUND.push({ p: [[-4, 0, -13], [4, 0, -13], [4, 0, -2], [-4, 0, -2]], col: 'rgb(18,22,33)' });
    GROUND.push({ p: [[-0.06, 0, -12.5], [0.06, 0, -12.5], [0.06, 0, -2.2], [-0.06, 0, -2.2]], col: 'rgba(249,158,26,0.55)' });

    // arena
    const S1 = [44, 52, 74], S2 = [34, 41, 60], CR = [58, 66, 90];
    const back = addBox(0, 0, 48, 64, 16, 4, S2);
    windows(back.front, 'z', 46, -30, 30, 2, 15, 22, 6, [255, 176, 84], -0.02);
    const lb = addBox(-16, 0, 24, 8, 9, 22, S1);
    windows(lb.right, 'x', -12, 13.5, 34.5, 1.5, 8.5, 8, 4, [255, 176, 84], 0.02);
    const rb = addBox(16, 0, 26, 8, 11, 20, S1);
    windows(rb.left, 'x', 12, 16.5, 35.5, 1.5, 10.5, 7, 5, [255, 176, 84], -0.02);
    const br = addBox(0, 6, 34, 26, 1.4, 3, S2);
    br.front.decals.push({ p: [[-13, 6.55, 32.48], [13, 6.55, 32.48], [13, 6.75, 32.48], [-13, 6.75, 32.48]], col: [249, 158, 26], glow: true });
    addBox(-9, 0, 34, 1.6, 6, 1.6, S1); addBox(9, 0, 34, 1.6, 6, 1.6, S1);
    for (const [x, z, w, h, d] of [[5.5, 10, 1.6, 1.2, 1.6], [-4.5, 8.5, 2.6, 1.0, 1.2], [-8.5, 17, 1.2, 2.4, 4.5], [9.5, 17, 2.2, 1.6, 2.2], [3.5, 30, 3, 1.2, 1.2], [-6.5, 29, 1.4, 1.4, 1.4]]) {
      const b = addBox(x, 0, z, w, h, d, CR);
      const z0 = z - d / 2 - 0.01;
      b.front.decals.push({ p: [[x - w / 2, h * 0.72, z0], [x + w / 2, h * 0.72, z0], [x + w / 2, h * 0.8, z0], [x - w / 2, h * 0.8, z0]], col: [249, 158, 26], glow: false });
    }
  })();

  // skyline silhouettes (angular)
  const SKY = (() => {
    const r = mulberry(5), out = [];
    let a = -1.9;
    while (a < 1.9) { const w = 0.03 + r() * 0.09; out.push({ a, w, h: 0.03 + r() * 0.12 + (r() < 0.1 ? 0.12 : 0), win: r() }); a += w + r() * 0.01; }
    return out;
  })();
  function drawSky(ctx) {
    const hz = CY + Math.tan(cam.pitch) * F3;
    const g = ctx.createLinearGradient(0, hz - 900, 0, hz);
    g.addColorStop(0, '#0B1020'); g.addColorStop(0.45, '#2A2142'); g.addColorStop(0.8, '#C9603E'); g.addColorStop(1, '#FFC27A');
    ctx.fillStyle = g; ctx.fillRect(-400, -400, W + 800, hz + 400);
    // sun
    const sa = 0.32 - cam.yaw;
    if (Math.abs(sa) < 1.3) {
      const sx = CX + Math.tan(sa) * F3, sy = hz - Math.tan(0.07) * F3;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 520);
      sg.addColorStop(0, 'rgba(255,214,150,0.85)'); sg.addColorStop(0.08, 'rgba(255,190,110,0.55)'); sg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 520, sy - 520, 1040, 1040);
      disc(ctx, sx, sy, 38, '#FFE6B8');
    }
    // skyline
    ctx.fillStyle = '#3B2A3F';
    for (const s of SKY) {
      const d0 = s.a - cam.yaw, d1 = d0 + s.w;
      if (d1 < -1.4 || d0 > 1.4) continue;
      const x0 = CX + Math.tan(d0) * F3, x1 = CX + Math.tan(d1) * F3, h = Math.tan(s.h) * F3;
      ctx.fillRect(x0, hz - h, x1 - x0 + 1, h + 2);
    }
    return hz;
  }
  function drawGround(ctx, hz, t, ringCol) {
    const g = ctx.createLinearGradient(0, hz, 0, H + 200);
    g.addColorStop(0, '#9A5A4A'); g.addColorStop(0.08, '#3A2E3A'); g.addColorStop(1, '#12151F');
    ctx.fillStyle = g; ctx.fillRect(-400, hz, W + 800, H + 400 - hz);
    // grid
    ctx.lineWidth = 1;
    const seg = (a, b) => {
      let va = toCam(...a), vb = toCam(...b);
      if (va[2] < NEAR && vb[2] < NEAR) return;
      if (va[2] < NEAR) { const k = (NEAR - va[2]) / (vb[2] - va[2]); va = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k), NEAR]; }
      if (vb[2] < NEAR) { const k = (NEAR - vb[2]) / (va[2] - vb[2]); vb = [lerp(vb[0], va[0], k), lerp(vb[1], va[1], k), NEAR]; }
      const pa = proj(va), pb = proj(vb);
      ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
    };
    ctx.strokeStyle = 'rgba(255,190,130,0.07)';
    ctx.beginPath();
    for (let x = -40; x <= 40; x += 2.5) seg([x, 0, -2], [x, 0, 70]);
    for (let z = -2; z <= 70; z += 2.5) seg([-40, 0, z], [40, 0, z]);
    ctx.stroke();
    // floor polys (spawn room)
    for (const gp of GROUND) {
      const pts = clipNear(gp.p.map((p) => toCam(...p)));
      if (pts.length < 3) continue;
      ctx.fillStyle = gp.col; ctx.beginPath(); poly(ctx, pts.map(proj)); ctx.fill();
    }
    // capture point ring
    const rc = ringCol || C.paper;
    for (const [r, lw, a] of [[4.6, 3, 0.9], [4.1, 1.5, 0.35]]) {
      ctx.strokeStyle = rgba(rc, a); ctx.lineWidth = lw; ctx.beginPath();
      let first = true;
      for (let k = 0; k <= 72; k++) {
        const an = (k / 72) * TAU, v = toCam(Math.cos(an) * r, 0.02, 20 + Math.sin(an) * r);
        if (v[2] < NEAR) { first = true; continue; }
        const p = proj(v); first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false;
      }
      ctx.stroke();
    }
    const pa = project(0, 0.02, 20);
    if (pa) {
      ctx.save(); ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 6);
      ctx.fillStyle = rc; ctx.beginPath(); ctx.ellipse(pa.x, pa.y, 4.6 * pa.s, 4.6 * pa.s * 0.14, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  // dynamic world faces (spawn doors)
  function doorFaces(open) {
    const out = [], o = open * 1.62;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -1.6 - o : 0 + o, x1 = x0 + 1.6, z = -2.12;
      const f = { p: [[x0, 0, z], [x1, 0, z], [x1, 3.2, z], [x0, 3.2, z]], n: N.bk, col: [46, 54, 78], flat: true, decals: [], edge: 0.15 };
      for (let k = 0; k < 4; k++) {
        const y = 0.5 + k * 0.62;
        const ex = side < 0 ? x1 : x0;
        f.decals.push({ p: [[ex - side * 0.02, y, z - 0.01], [ex - side * 0.7, y + 0.35, z - 0.01], [ex - side * 0.7, y + 0.5, z - 0.01], [ex - side * 0.02, y + 0.15, z - 0.01]], col: [249, 158, 26], glow: true });
      }
      f.decals.push({ p: [[x0 + 0.15, 2.85, z - 0.01], [x1 - 0.15, 2.85, z - 0.01], [x1 - 0.15, 2.95, z - 0.01], [x0 + 0.15, 2.95, z - 0.01]], col: [56, 182, 255], glow: true });
      out.push(f);
    }
    return out;
  }

  // render faces + billboards, painter-sorted
  function drawWorld(ctx, extraFaces, billboards) {
    const items = [];
    const all = extraFaces ? WORLD.concat(extraFaces) : WORLD;
    for (const f of all) {
      const cv = f.p.map((p) => toCam(p[0], p[1], p[2]));
      const nc = rotN(f.n);
      if (nc[0] * cv[0][0] + nc[1] * cv[0][1] + nc[2] * cv[0][2] >= 0) continue;
      const pc = clipNear(cv);
      if (pc.length < 3) continue;
      let maxz = 0, sz = 0;
      for (const v of pc) { if (v[2] > maxz) maxz = v[2]; sz += v[2]; }
      items.push({ k: maxz, f, pts: pc.map(proj), depth: sz / pc.length });
    }
    for (const b of billboards) items.push(b);
    items.sort((a, b) => b.k - a.k);
    for (const it of items) {
      if (it.draw) { it.draw(ctx); continue; }
      const f = it.f;
      ctx.fillStyle = shadeRGB(f.col, f.n, f.flat, it.depth);
      ctx.beginPath(); poly(ctx, it.pts); ctx.fill();
      if (f.edge) { ctx.strokeStyle = `rgba(255,214,170,${f.edge})`; ctx.lineWidth = 1; ctx.stroke(); }
      for (const d of f.decals) {
        const pc = clipNear(d.p.map((p) => toCam(p[0], p[1], p[2])));
        if (pc.length < 3) continue;
        const fog = 1 - 0.55 * (1 - Math.exp(-it.depth / 70));
        ctx.fillStyle = `rgba(${d.col[0]},${d.col[1]},${d.col[2]},${fog})`;
        ctx.beginPath(); poly(ctx, pc.map(proj)); ctx.fill();
      }
    }
  }

  // ═════════════════════════════════════════════ FPS GAMEPLAY DATA
  const ROSTER = {
    ally: [['ATLAS', 'tank'], ['YOU', 'damage'], ['NOVA', 'damage'], ['SOL', 'support'], ['LUX', 'support']],
    enemy: [['RONIN', 'tank'], ['VANTA', 'damage'], ['MOTH', 'damage'], ['LOTUS', 'support'], ['SABLE', 'support']],
  };
  const ULT_T = 14.0, SLOW = 0.3;
  const warp = (t) => (t < ULT_T ? t : ULT_T + (t - ULT_T) * SLOW);
  const ENEMIES = {
    // engagement 1 (bar 5)
    VANTA1: { name: 'VANTA', role: 'damage', hp: 200, on: [8.2, 10.4], pos(t) {
      const j = prog(t, 8.25, 8.58);
      if (j < 1) return [lerp(6.2, 4.2, j), 1.2 * (1 - j) + Math.sin(Math.PI * j) * 1.3, lerp(10, 12, j)];
      return [4.2 + 0.7 * Math.sin((t - 8.58) * 6), 0, 12];
    } },
    MOTH1: { name: 'MOTH', role: 'damage', hp: 200, on: [9.1, 10.4], pos(t) {
      const r = E.outCubic(prog(t, 9.1, 9.42));
      return [lerp(-10, -3.4, r) + 0.4 * Math.sin((t - 9.42) * 7) * (r >= 1 ? 1 : 0), 0, 9.6];
    } },
    // team fight (bars 7–8)
    RONIN: { name: 'RONIN', role: 'tank', hp: 500, on: [11.5, 16.5], barrier: [11.5, 15.5], pos(t) { const w = warp(t); return [0.8 + 0.9 * Math.sin(w * 1.3), 0, 25]; } },
    VANTA: { name: 'VANTA', role: 'damage', hp: 200, on: [11.5, 16.5], pos(t) { const w = warp(t); return [-5.6 + 1.1 * Math.sin(w * 2.1), 0, 20.5]; } },
    MOTH: { name: 'MOTH', role: 'damage', hp: 200, on: [11.5, 16.5], pos(t) { const w = warp(t); return [5.2 + 0.9 * Math.sin(w * 1.8 + 1), 0, 19.5]; } },
    LOTUS: { name: 'LOTUS', role: 'support', hp: 200, on: [11.5, 16.5], pos(t) { const w = warp(t); return [3.4 + 0.8 * Math.sin(w * 1.5), 0, 29.5]; } },
    SABLE: { name: 'SABLE', role: 'support', hp: 200, on: [11.5, 16.5], pos(t) { const w = warp(t); return [-3.0 + 0.8 * Math.sin(w * 1.7 + 2), 0, 30.5]; } },
  };
  // player shots: [time, enemyKey, dmg, crit]
  const SHOTS = [
    [8.75, 'VANTA1', 40], [8.875, 'VANTA1', 40], [9.0, 'VANTA1', 40], [9.125, 'VANTA1', 40], [9.25, 'VANTA1', 40],
    [9.5, 'MOTH1', 40], [9.625, 'MOTH1', 40], [9.75, 'MOTH1', 120, true],
    [13.0, 'MOTH', 40], [13.125, 'MOTH', 40], [13.25, 'MOTH', 40], [13.375, 'MOTH', 80, true],
  ];
  const LOCKS = [[14.5, 'RONIN'], [14.625, 'VANTA'], [14.75, 'LOTUS'], [14.875, 'SABLE']];
  const FIRE_T = 15.25, BOOM_T = 15.5;
  const DMG = []; // derived: [t, key, dmg, crit]
  for (const s of SHOTS) DMG.push(s);
  for (const [, k] of LOCKS) DMG.push([BOOM_T, k, 9999, true]);
  function hpAt(key, t) { let h = ENEMIES[key].hp; for (const d of DMG) if (d[1] === key && d[0] <= t) h -= d[2]; return Math.max(0, h); }
  function deathT(key) { let h = ENEMIES[key].hp; for (const d of DMG.slice().sort((a, b) => a[0] - b[0])) if (d[1] === key) { h -= d[2]; if (h <= 0) return d[0]; } return Infinity; }
  const DEATH = {}; for (const k in ENEMIES) DEATH[k] = deathT(k);
  const KILLFEED = [];
  for (const k in DEATH) if (DEATH[k] < Infinity) KILLFEED.push({ t: DEATH[k] + (DEATH[k] === BOOM_T ? LOCKS.findIndex((l) => l[1] === k) * 0.07 : 0), killer: 'YOU', victim: ENEMIES[k].name, crit: DMG.some((d) => d[1] === k && d[3]) });
  KILLFEED.sort((a, b) => a.t - b.t);
  const chest = (key, t) => { const p = ENEMIES[key].pos(t); return [p[0], p[1] + 1.3, p[2]]; };

  // incoming enemy fire + ally fire (bar 7)
  const INCOMING = [12.05, 12.13, 12.21, 12.29, 12.37];
  const ALLYFIRE = Array.from({ length: 22 }, (_, i) => {
    const tg = ['RONIN', 'VANTA', 'MOTH', 'RONIN', 'LOTUS'][i % 5];
    return { t: 12.0 + i * 0.09 + hash(i) * 0.03, from: i % 2 ? [-7, 1.5, 11] : [6.5, 1.4, 10], tg, col: i % 3 === 0 ? C.heal : C.ally };
  });
  function playerHp(t) {
    let h = 250;
    for (const ti of INCOMING) if (t >= ti) h -= 29;
    if (t >= 12.5) h = lerp(h, 250, E.outCubic(prog(t, 12.5, 13.0)));
    return Math.round(h);
  }
  function ultPct(t) {
    if (t < 12) return lerp(0.41, 0.63, prog(t, 8.7, 9.8));
    if (t < ULT_T) return lerp(0.63, 1, E.inOutCubic(prog(t, 12.0, 13.55)));
    return 1 - prog(t, ULT_T, 15.7);
  }

  // ── camera
  function aimAngles(p) {
    const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
    return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }
  function recoil(t) { let r = 0; for (const s of SHOTS) { const d = t - s[0]; if (d >= 0 && d < 0.5) r += Math.exp(-d * 16) * (1 - Math.exp(-d * 120)); } return r; }
  function camAt(t) {
    let c;
    if (t < 11) {
      const mv = E.inOutCubic(prog(t, 7.6, 8.85));
      const walk = t > 7.6 && t < 8.95 ? 1 : 0;
      c = { x: lerp(0, 0.5, mv) + 0.03 * Math.sin(t * TAU * 2) * walk, y: 1.65 + 0.045 * Math.sin(t * TAU * 4) * walk + 0.006 * Math.sin(t * 2.4), z: lerp(-8.6, 2.2, mv),
        yaw: lerp(-0.2, 0.04, E.inOutCubic(prog(t, 6.0, 7.3))) + 0.12 * Math.sin(Math.PI * prog(t, 7.9, 8.6)), pitch: 0.012 * Math.sin(t * 1.9) - 0.02 };
      setCam(c);
      const w1 = E.outExpo(prog(t, 8.38, 8.66)) * (1 - prog(t, 9.38, 9.5));
      const w2 = E.outExpo(prog(t, 9.38, 9.52));
      let yaw = c.yaw, pitch = c.pitch;
      if (w1 > 0) { const a = aimAngles(chest('VANTA1', t)); yaw = lerp(yaw, a[0], w1); pitch = lerp(pitch, a[1], w1); }
      if (w2 > 0) { const a = aimAngles(chest('MOTH1', t)); yaw = lerp(yaw, a[0], w2); pitch = lerp(pitch, a[1], w2); }
      yaw += 1.5 * E.inExpo(prog(t, 9.8, 10.0));
      c.yaw = yaw; c.pitch = pitch;
    } else {
      const sl = t > ULT_T ? E.outCubic(prog(t, ULT_T, 15.5)) : 0;
      c = { x: 0.4 + 0.45 * Math.sin(warp(t) * 1.7), y: 1.65 + 0.02 * Math.sin(t * 3) + 0.25 * sl, z: 11 + (t - 12) * 0.35, yaw: 0.02, pitch: 0.03 + 0.03 * sl };
      setCam(c);
      const base = aimAngles([0.4, 1.3, 23]);
      let yaw = base[0] + 0.02 * Math.sin(t * 2.2), pitch = base[1] + 0.04 * sl;
      const w = E.outExpo(prog(t, 12.85, 13.0)) * (1 - E.inOutCubic(prog(t, 13.5, 13.8)));
      if (w > 0) { const a = aimAngles(chest('MOTH', t)); yaw = lerp(yaw, a[0], w); pitch = lerp(pitch, a[1], w); }
      // tiny pans across lock-ons
      for (const [lt, k] of LOCKS) { const wl = 0.12 * Math.sin(Math.PI * prog(t, lt - 0.05, lt + 0.15)); if (wl > 0) { const a = aimAngles(chest(k, t)); yaw = lerp(yaw, a[0], wl); } }
      c.yaw = yaw; c.pitch = pitch;
      // incoming hits jolt
      for (const ti of INCOMING) { const d = t - ti; if (d >= 0 && d < 0.4) { c.yaw += 0.012 * spring(d, 12, 40); c.pitch += 0.01 * spring(d, 12, 33); } }
    }
    c.pitch += recoil(t) * 0.028;
    setCam(c);
    return c;
  }

  // ── viewmodel weapon (original design)
  function gun(ctx, t, o = {}) {
    const r = recoil(t);
    const ux = -0.76, uy = -0.65, vx = 0.65, vy = -0.76;
    const ox = 1660 + 14 * Math.sin(t * 1.9) + (o.bobX || 0) - ux * -r * 34, oy = 1125 + 8 * Math.sin(t * 2.6) + (o.bobY || 0) - uy * -r * 34 + r * 6;
    const L = 470;
    const P = (u, v) => { const k = 1.35 * (1 - (u / L) * 0.45); return [ox + ux * u + vx * v * k, oy + uy * u + vy * v * k]; };
    const Q = (u0, u1, v0, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    ctx.save();
    ctx.translate(ox, oy); ctx.rotate(-r * 0.05); ctx.translate(-ox, -oy);
    const glow = o.ult || 0;
    const fillQ = (q, col) => { ctx.fillStyle = col; ctx.beginPath(); poly(ctx, q); ctx.fill(); };
    // hand
    ctx.fillStyle = '#141925'; ctx.beginPath(); poly(ctx, [P(30, -80), P(180, -80), P(200, -190), P(50, -230)]); ctx.fill();
    fillQ([P(160, -92), P(190, -90), P(196, -140), P(166, -146)], C.orange);
    // body
    fillQ(Q(0, 290, -96, 70), '#1E2638');
    fillQ(Q(0, 290, -96, -60), '#161C2A');
    fillQ(Q(20, 310, 70, 104), '#3A4766');
    fillQ(Q(20, 310, 66, 74), C.orange);
    fillQ(Q(250, 300, -110, 90), '#2A3450');
    fillQ(Q(290, 440, -44, 44), '#151B29');
    fillQ(Q(290, 440, 30, 46), '#2E3A55');
    for (const u of [320, 365, 410]) fillQ(Q(u, u + 12, -46, 48), C.orange);
    // energy cell
    ctx.save();
    ctx.shadowColor = C.ally; ctx.shadowBlur = 24 + glow * 40;
    fillQ(Q(110, 230, -40, 46), mixHex(C.ally, '#FFFFFF', 0.15 + glow * 0.5));
    ctx.restore();
    fillQ(Q(124, 216, -14, 22), rgba('#FFFFFF', 0.55 + glow * 0.4));
    if (glow > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const u of [250, 280]) fillQ(Q(u, u + 10, -70, 60), rgba(C.orange, glow)); ctx.restore(); }
    // muzzle ring
    const m = P(L, 0);
    fillQ(Q(436, 470, -50, 50), '#0E121C');
    disc(ctx, m[0], m[1], 10, rgba(C.ally, 0.8));
    ctx.restore();
    return m;
  }
  function muzzleFlash(ctx, m, t) {
    for (const s of SHOTS) {
      const d = t - s[0];
      if (d < 0 || d > 0.05) continue;
      const a = 1 - d / 0.05, rot = hash(s[0] * 10) * TAU;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(m[0], m[1], 0, m[0], m[1], 170);
      g.addColorStop(0, rgba('#FFF2D0', a)); g.addColorStop(0.3, rgba(C.orange, 0.6 * a)); g.addColorStop(1, rgba(C.orange, 0));
      ctx.fillStyle = g; ctx.fillRect(m[0] - 170, m[1] - 170, 340, 340);
      ctx.translate(m[0], m[1]); ctx.rotate(rot);
      ctx.fillStyle = rgba('#FFF6E0', a);
      ctx.beginPath();
      for (let k = 0; k < 16; k++) { const rr = k % 2 ? 22 : 70 + 30 * hash(k + s[0]); const an = (k / 16) * TAU; k ? ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.7) : ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.7); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ── game HUD
  function crosshair(ctx, t, col = C.paper) {
    const sp = recoil(t) * 10;
    ctx.save();
    ctx.lineCap = 'round';
    for (const [lw, c] of [[5, 'rgba(0,0,0,0.45)'], [2.2, col]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw;
      const g = 9 + sp, l = 11;
      line(ctx, CX - g - l, CY, CX - g, CY); line(ctx, CX + g, CY, CX + g + l, CY);
      line(ctx, CX, CY - g - l, CX, CY - g); line(ctx, CX, CY + g, CX, CY + g + l);
    }
    disc(ctx, CX, CY, 2.4, col);
    // hit markers
    for (const s of SHOTS) {
      const d = t - s[0];
      if (d < 0 || d > 0.16) continue;
      const kill = DEATH[s[1]] === s[0];
      const a = 1 - d / 0.16, k = kill ? 1.5 : 1;
      ctx.strokeStyle = kill || s[3] ? rgba(C.enemy, a) : rgba('#FFFFFF', a); ctx.lineWidth = 3.2 * k;
      for (let q = 0; q < 4; q++) { const an = Math.PI / 4 + q * Math.PI / 2; line(ctx, CX + Math.cos(an) * 13 * k, CY + Math.sin(an) * 13 * k, CX + Math.cos(an) * 26 * k, CY + Math.sin(an) * 26 * k); }
    }
    ctx.restore();
  }
  function killFeed(ctx, t) {
    const live = KILLFEED.filter((k) => t >= k.t && t < k.t + 3.2);
    ctx.save();
    ctx.textBaseline = 'middle';
    live.reverse().forEach((k, i) => {
      const a = E.outExpo(prog(t, k.t, k.t + 0.3));
      const y = 96 + i * 46, x1 = W - 84 + (1 - a) * 300;
      ctx.font = ifont(800, 22);
      const vw = measure(ctx, k.victim)[k.victim.length], kw = measure(ctx, k.killer)[k.killer.length];
      const wTot = kw + vw + 92;
      ctx.fillStyle = 'rgba(10,13,20,0.62)'; ctx.fillRect(x1 - wTot, y - 18, wTot, 36);
      ctx.fillStyle = k.killer === 'YOU' ? C.orange : C.ally; ctx.fillRect(x1 - wTot, y - 18, 4, 36);
      ctx.fillStyle = k.killer === 'YOU' ? '#FFFFFF' : C.ally; ctx.textAlign = 'left';
      ctx.fillText(k.killer, x1 - wTot + 16, y + 1);
      ctx.save(); ctx.translate(x1 - vw - 46, y);
      if (k.crit) { ctx.fillStyle = C.orange; diamond(ctx, 0, 0, 10); ctx.fill(); disc(ctx, 0, 0, 3, C.ink); }
      else { roleIcon(ctx, k.icon === 'break' ? 'tank' : 'damage', 0, 0, 22, '#FFFFFF'); }
      ctx.restore();
      ctx.fillStyle = k.ally ? rgba(C.enemy, 0.8) : C.enemy; ctx.textAlign = 'right';
      ctx.fillText(k.victim, x1 - 14, y + 1);
    });
    ctx.restore();
  }
  function gameHud(ctx, t, o = {}) {
    ctx.save();
    // health
    const hp = o.hp ?? 250;
    const hx = 120, hy = 960;
    ctx.save(); cond(ctx, hx, hy);
    ctx.font = ifont(900, 64); ctx.fillStyle = hp < 150 ? C.enemy : '#FFFFFF';
    ctx.fillText(String(hp), 0, 0);
    const hw = measure(ctx, String(hp))[String(hp).length];
    ctx.font = ifont(700, 24); ctx.fillStyle = rgba('#FFFFFF', 0.6); ctx.fillText('/ 250', hw + 12, 0);
    ctx.restore();
    for (let i = 0; i < 10; i++) {
      const full = hp >= (i + 1) * 25 ? 1 : clamp((hp - i * 25) / 25);
      const x = hx + i * 30, y = 990;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); poly(ctx, [[x + 4, y], [x + 28, y], [x + 24, y + 16], [x, y + 16]]); ctx.fill();
      if (full > 0) { ctx.fillStyle = hp < 150 ? C.enemy : '#FFFFFF'; ctx.beginPath(); poly(ctx, [[x + 4, y], [x + 4 + 24 * full, y], [x + 24 * full, y + 16], [x, y + 16]]); ctx.fill(); }
    }
    ctx.font = font(500, 14, FM); ctx.fillStyle = rgba('#FFFFFF', 0.7);
    ctx.fillText('YOU · DAMAGE', hx, 900);
    // ult meter
    const u = o.ult ?? 0.4, ready = u >= 0.999;
    const ux = CX, uy = 968;
    ctx.save();
    if (ready) { ctx.shadowColor = C.orange; ctx.shadowBlur = 30 + 14 * Math.sin(t * 18); }
    ring(ctx, ux, uy, 44, 'rgba(255,255,255,0.18)', 7);
    ctx.strokeStyle = ready ? C.orange : '#FFFFFF'; ctx.lineWidth = 7; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(ux, uy, 44, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.font = ifont(900, ready ? 30 : 26); ctx.fillStyle = ready ? C.orange : '#FFFFFF';
    ctx.fillText(ready ? 'Q' : `${Math.floor(u * 100)}%`, ux, uy + 10);
    // ammo + abilities
    const ammo = o.ammo ?? 30;
    ctx.textAlign = 'right';
    ctx.save(); cond(ctx, W - 120, 990);
    ctx.font = ifont(900, 64); ctx.fillStyle = ammo < 10 ? C.orange : '#FFFFFF'; ctx.fillText(pad(ammo, 2), 0, 0);
    ctx.font = ifont(700, 26); ctx.fillStyle = rgba('#FFFFFF', 0.55); ctx.textAlign = 'left'; ctx.fillText('/ 30', 10, 0);
    ctx.restore();
    for (const [i, key] of [[0, 'E'], [1, 'SHIFT']]) {
      const bx = W - 470 - i * 96, by = 930;
      ctx.fillStyle = 'rgba(10,13,20,0.55)'; ctx.beginPath(); poly(ctx, [[bx + 10, by], [bx + 80, by], [bx + 70, by + 64], [bx, by + 64]]); ctx.fill();
      ctx.strokeStyle = rgba('#FFFFFF', 0.5); ctx.lineWidth = 1.5; ctx.stroke();
      roleIcon(ctx, i ? 'support' : 'damage', bx + 40, by + 30, 28, '#FFFFFF');
      ctx.font = font(600, 11, FM); ctx.fillStyle = rgba('#FFFFFF', 0.7); ctx.textAlign = 'center'; ctx.fillText(key, bx + 40, by + 82);
    }
    // objective
    const op = o.obj ?? 0.32;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(CX, 92);
    ring(ctx, 0, 0, 30, 'rgba(255,255,255,0.2)', 5);
    ctx.strokeStyle = o.contested ? C.orange : C.ally; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * op); ctx.stroke();
    ctx.font = ifont(900, 30); ctx.fillStyle = '#FFFFFF'; ctx.fillText('A', 0, 11);
    ctx.font = font(600, 13, FM); ctx.fillStyle = rgba('#FFFFFF', 0.75);
    ctx.fillText(o.objLabel || 'CAPTURE THE OBJECTIVE', 0, 62);
    const secs = Math.max(0, 167 - Math.floor(t));
    ctx.font = ifont(800, 22); ctx.fillStyle = '#FFFFFF'; ctx.fillText(`${pad(Math.floor(secs / 60), 2)}:${pad(secs % 60, 2)}`, 0, -44);
    for (let i = 0; i < 5; i++) {
      disc(ctx, -150 + i * 22, 0, 7, C.ally);
      const alive = o.enemyAlive ? o.enemyAlive[i] : true;
      disc(ctx, 62 + i * 22, 0, 7, alive ? C.enemy : 'rgba(255,255,255,0.15)');
    }
    ctx.restore();
    ctx.restore();
  }

  // floating combat text + tracers for player shots
  function shotFx(ctx, t, m) {
    for (const s of SHOTS) {
      const d = t - s[0];
      if (d < 0 || d > 0.7) continue;
      const p = project(...chest(s[1], s[0]));
      if (!p) continue;
      const hit = project(...chest(s[1], t)) || p;
      if (d < 0.07) {
        const a = 1 - d / 0.07;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(C.orange, a); ctx.lineWidth = 5 * a + 1; ctx.lineCap = 'round';
        const k = clamp(d / 0.025);
        line(ctx, lerp(m[0], hit.x, k * 0.6), lerp(m[1], hit.y, k * 0.6), hit.x, hit.y);
        ctx.strokeStyle = rgba('#FFFFFF', a); ctx.lineWidth = 2; line(ctx, lerp(m[0], hit.x, k * 0.6), lerp(m[1], hit.y, k * 0.6), hit.x, hit.y);
        ctx.restore();
      }
      // sparks
      if (d < 0.22) {
        for (let k = 0; k < 8; k++) {
          const an = hash(s[0] * 7 + k) * TAU, sp = 120 + hash(k + s[0]) * 260;
          disc(ctx, hit.x + Math.cos(an) * sp * d, hit.y + Math.sin(an) * sp * d + 300 * d * d, 3 * (1 - d / 0.22), k % 2 ? C.orange : '#FFFFFF');
        }
      }
      // damage numbers
      const a = 1 - prog(d, 0.4, 0.7);
      ctx.save();
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = ifont(900, s[3] ? 44 : 30);
      ctx.fillStyle = s[3] ? C.orange : '#FFFFFF';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
      const nx = hit.x + 40 + hash(s[0]) * 30, ny = hit.y - 40 - d * 120;
      ctx.strokeText(String(s[2]), nx, ny); ctx.fillText(String(s[2]), nx, ny);
      ctx.restore();
    }
  }
  function eliminated(ctx, t) {
    let best = null;
    for (const k in DEATH) { const d = t - DEATH[k]; if (d >= 0 && d < 1.1 && (!best || DEATH[k] > DEATH[best])) best = k; }
    if (!best || DEATH[best] === BOOM_T) return;
    const d = t - DEATH[best], a = 1 - prog(d, 0.85, 1.1), s = 1 + 0.35 * Math.exp(-d * 14);
    ctx.save();
    ctx.globalAlpha = a; ctx.translate(CX, CY + 150); ctx.scale(s * CD, s);
    ctx.textAlign = 'center'; ctx.font = ifont(900, 34);
    const str = 'ELIMINATED ', nm = ENEMIES[best].name, w1 = measure(ctx, str)[str.length], w2 = measure(ctx, nm)[nm.length];
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(str, -(w1 + w2) / 2, 0);
    ctx.fillStyle = C.enemy; ctx.fillText(nm, -(w1 + w2) / 2 + w1, 0);
    ctx.restore();
  }
  function enemyBillboard(key, t) {
    const en = ENEMIES[key];
    if (t < en.on[0] || t > en.on[1]) return null;
    const dt = DEATH[key];
    if (t > dt + 0.6) return null;
    const p = en.pos(Math.min(t, dt));
    const v = toCam(p[0], p[1], p[2]);
    if (v[2] < 0.5) return null;
    return {
      k: v[2],
      draw(ctx) {
        const sp = proj(v), s = (1.85 / v[2]) * F3;
        const dead = t >= dt, dd = t - dt;
        let flash = 0;
        for (const d of DMG) if (d[1] === key) { const q = t - d[0]; if (q >= 0 && q < 0.08) flash = Math.max(flash, 1 - q / 0.08); }
        if (!dead || dd < 0.08) hero2D(ctx, sp[0], sp[1], s, en.role, { rim: C.enemy, fill: '#1A1420', flash, glow: 14, rimW: 3, flip: p[0] > cam.x });
        if (dead) {
          for (let k = 0; k < 26; k++) {
            const an = hash(k * 3.1 + dt) * TAU, sp2 = (0.4 + hash(k + dt * 3)) * s * 1.3;
            const x = sp[0] + Math.cos(an) * sp2 * E.outCubic(clamp(dd / 0.6)), y = sp[1] - s * 0.5 + Math.sin(an) * sp2 * 0.7 * E.outCubic(clamp(dd / 0.6)) - dd * s * 0.3;
            const sz = Math.max(1.5, s * 0.035) * (1 - dd / 0.6);
            ctx.fillStyle = k % 3 ? C.enemy : C.orange; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
          }
        } else {
          // segmented health bar
          const hp = hpAt(key, t), segs = Math.ceil(en.hp / 50), bw = Math.max(36, s * 0.42), bx = sp[0] - bw / 2, by = sp[1] - s * 1.15;
          for (let i = 0; i < segs; i++) {
            const sw = bw / segs - 2;
            ctx.fillStyle = hp > i * 50 ? C.enemy : 'rgba(255,255,255,0.2)';
            ctx.fillRect(bx + i * (sw + 2), by, sw, Math.max(3, s * 0.03));
          }
        }
      },
    };
  }
  function barrierBillboard(t) {
    const [b0, b1] = ENEMIES.RONIN.barrier;
    if (t < b0 || t > b1 + 0.3) return null;
    const p = ENEMIES.RONIN.pos(t), z = p[2] - 1.8;
    const corners = [[p[0] - 2.6, 0, z], [p[0] + 2.6, 0, z], [p[0] + 2.6, 3.0, z], [p[0] - 2.6, 3.0, z]].map((q) => toCam(...q));
    if (corners.some((c) => c[2] < NEAR)) return null;
    const pts = corners.map(proj);
    const fade = 1 - prog(t, b1, b1 + 0.3);
    return {
      k: corners[0][2] + 0.01,
      draw(ctx) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.beginPath(); poly(ctx, pts); ctx.clip();
        ctx.fillStyle = 'rgba(255,59,78,0.13)'; ctx.fillRect(0, 0, W, H);
        const cx = (pts[0][0] + pts[1][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2, r = Math.abs(pts[1][0] - pts[0][0]) / 14;
        ctx.strokeStyle = 'rgba(255,90,100,0.45)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = -8; i <= 8; i++) for (let j = -5; j <= 5; j++) {
          const x = cx + i * r * 1.73 + (j % 2 ? r * 0.86 : 0), y = cy + j * r * 1.5;
          for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; k ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
          ctx.closePath();
        }
        ctx.stroke();
        // impact ripples from ally fire
        for (const f of ALLYFIRE) {
          if (f.tg !== 'RONIN') continue;
          const d = t - (f.t + 0.05); if (d < 0 || d > 0.35) continue;
          ring(ctx, cx + (hash(f.t) - 0.5) * r * 8, cy + (hash(f.t + 1) - 0.5) * r * 4, r * (0.5 + d * 14), rgba('#FFC0C5', 1 - d / 0.35), 2.5);
        }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = 'rgba(255,90,100,0.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); poly(ctx, pts); ctx.stroke(); ctx.restore();
      },
    };
  }

  function fpsWorld(ctx, t, o = {}) {
    camAt(t);
    const hz = drawSky(ctx);
    drawGround(ctx, hz, t, o.ringCol);
    const bills = [];
    for (const k in ENEMIES) { const b = enemyBillboard(k, t); if (b) bills.push(b); }
    const bar = barrierBillboard(t); if (bar) bills.push(bar);
    if (o.allies) for (const a of o.allies) {
      const v = toCam(...a.p);
      if (v[2] > 0.5) bills.push({ k: v[2], draw(ctx) {
        const sp = proj(v), s = (1.85 / v[2]) * F3;
        hero2D(ctx, sp[0], sp[1], s, a.role, { rim: C.ally, fill: '#141B2A', glow: 10, rimW: 2.4, flip: a.flip });
        ctx.save(); ctx.font = ifont(800, Math.max(14, s * 0.07)); ctx.textAlign = 'center'; ctx.fillStyle = C.ally;
        ctx.fillText(a.name, sp[0], sp[1] - s * 1.12); ctx.restore();
      } });
    }
    drawWorld(ctx, o.doors, bills);
  }

  // ═════════════════════════════════════════════ SCENES
  // S1 — MATCH FOUND
  function s1(ctx, u) {
    fill(ctx, C.ink);
    hexGrid(ctx, CX, CY, 46, 0.035 + 0.02 * prog(u, 0, 1), C.paper, u * 0.05);
    const found = 2 * B;
    // dot → loading ring
    const dp = E.outBack(prog(u, 0.05, 0.35));
    if (u < found) {
      const spin = u * 7;
      disc(ctx, CX, CY - 40, 9 * dp, C.orange);
      const rp = E.outExpo(prog(u, 0.2, 0.6));
      ctx.save(); ctx.lineCap = 'round';
      ring(ctx, CX, CY - 40, 70 * rp, 'rgba(244,241,234,0.12)', 6);
      ctx.strokeStyle = C.paper; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(CX, CY - 40, 70 * rp, spin, spin + 1.2 + 0.8 * Math.sin(u * 5)); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.font = font(500, 16, FM); ctx.textAlign = 'center'; ctx.letterSpacing = '6px';
      ctx.fillStyle = rgba(C.paper, 0.75 * prog(u, 0.2, 0.4));
      ctx.fillText(scramble('SEARCHING FOR MATCH', prog(u, 0.2, 0.55), 1, u), CX, CY + 90);
      ctx.letterSpacing = '2px'; ctx.fillStyle = rgba(C.paper, 0.45 * prog(u, 0.3, 0.5));
      const secs = Math.floor(lerp(0, 47, E.inCubic(prog(u, 0.3, found))));
      ctx.fillText(`TIME ELAPSED 00:${pad(secs, 2)} · EST. 00:30 · ROLE: DAMAGE`, CX, CY + 124);
      ctx.restore();
    } else {
      const v = u - found;
      // burst
      ring(ctx, CX, CY - 40, 70 + E.outExpo(clamp(v / 0.6)) * 900, rgba(C.orange, 1 - clamp(v / 0.6)), 22 * (1 - clamp(v / 0.6)));
      disc(ctx, CX, CY - 40, 400 * E.outExpo(clamp(v / 0.25)), rgba('#FFFFFF', 0.25 * (1 - clamp(v / 0.25))));
      ctx.save();
      cond(ctx, CX, CY + 40);
      const k = E.outExpo(clamp(v / 0.3)); ctx.scale(lerp(1.8, 1, k), lerp(1.8, 1, k));
      ctx.font = ifont(900, 170); ctx.letterSpacing = '-4px'; ctx.fillStyle = C.paper;
      ctx.globalAlpha = clamp(v / 0.04);
      ctx.textAlign = 'center'; ctx.fillText('MATCH FOUND', 0, 0);
      ctx.restore();
      ctx.fillStyle = C.orange; const bw = 980 * E.outExpo(prog(v, 0.08, 0.4));
      ctx.fillRect(CX - bw / 2, CY + 78, bw, 12);
      ctx.save();
      ctx.font = font(600, 22, FT); ctx.letterSpacing = '10px'; ctx.textAlign = 'center';
      ctx.fillStyle = rgba(C.paper, prog(v, 0.25, 0.45));
      ctx.fillText(scramble('5V5 · ROLE QUEUE · CONTROL', prog(v, 0.25, 0.6), 4, u), CX + 5, CY + 150);
      ctx.restore();
    }
    // slanted wipe → orange
    for (let i = 0; i < 6; i++) {
      const p = E.inOutCubic(prog(u, 3.45 * B + i * 0.025, 3.45 * B + i * 0.025 + 0.2));
      if (p <= 0) continue;
      ctx.save(); ctx.fillStyle = C.orange; ctx.translate(lerp(-W - 600, 0, p), 0); ctx.transform(1, 0, -0.35, 1, 0, 0);
      ctx.fillRect(-200, i * 180 - (i === 0 ? 400 : 0), W + 1000, 181 + (i === 0 || i === 5 ? 400 : 0)); ctx.restore();
    }
  }

  // S2 — ROLES
  const ROLES = [['tank', 'TANK', '×1', 'Hold the line'], ['damage', 'DAMAGE', '×2', 'Win the duels'], ['support', 'SUPPORT', '×2', 'Keep them standing']];
  function s2(ctx, u) {
    fill(ctx, C.orange);
    ctx.save();
    ctx.font = font(500, 16, FM); ctx.fillStyle = rgba(C.ink, 0.7); ctx.letterSpacing = '2px';
    ctx.fillText(typed('02 / BUILD THE TEAM', prog(u, 0.05, 0.35)), 120, 168);
    ctx.restore();
    const up = E.outExpo(prog(u, 3 * B, 3 * B + 0.35));
    ROLES.forEach(([role, label, n, note], i) => {
      const t0 = i * B, v = u - t0;
      if (v < 0) return;
      const x = 380 + i * 580, k = E.outExpo(clamp(v / 0.35));
      ctx.save();
      ctx.translate(x + (1 - k) * -240, lerp(0, -60, up));
      ctx.globalAlpha = clamp(v / 0.05);
      // card
      ctx.fillStyle = C.ink;
      ctx.beginPath(); poly(ctx, [[-200, 250], [220, 250], [190, 820], [-230, 820]]); ctx.fill();
      ctx.fillStyle = C.orange; ctx.fillRect(-190, 262, 40 * k, 6);
      const ip = E.outBack(prog(v, 0.05, 0.4));
      roleIcon(ctx, role, 0, 430, 210 * ip, C.paper);
      ctx.save(); cond(ctx, -175, 650);
      ctx.font = ifont(900, 84); ctx.letterSpacing = '-2px'; ctx.fillStyle = C.paper;
      revealText(ctx, label, 0, 0, 84, v - 0.05, { stagger: 0.025, dur: 0.4 });
      ctx.restore();
      ctx.font = ifont(900, 54); ctx.fillStyle = C.orange; ctx.textAlign = 'right';
      ctx.fillText(n, 170, 740);
      ctx.textAlign = 'left'; ctx.font = font(500, 20, FT); ctx.fillStyle = rgba(C.paper, 0.7);
      ctx.fillText(typed(note, prog(v, 0.2, 0.5)), -170, 740);
      ctx.restore();
    });
    // headline on beat 3
    if (u > 3 * B) {
      ctx.save(); cond(ctx, CX, 950);
      ctx.font = ifont(900, 74); ctx.fillStyle = C.ink; ctx.letterSpacing = '-1px';
      revealText(ctx, 'FIVE HEROES. ONE TEAM.', 0, 0, 74, u - 3 * B, { stagger: 0.012, dur: 0.35, align: 'center' });
      ctx.restore();
    }
    // diagonal split → ink
    const sp = E.inOutExpo(prog(u, 3.55 * B, 4 * B));
    if (sp > 0) {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); poly(ctx, [[CX - 300 - sp * 1600, -100], [CX - 300, -100], [CX + 300, H + 100], [CX + 300 - sp * 1600, H + 100]]); ctx.fill();
      ctx.beginPath(); poly(ctx, [[CX - 300, -100], [CX - 300 + sp * 1600, -100], [CX + 300 + sp * 1600, H + 100], [CX + 300, H + 100]]); ctx.fill();
    }
  }

  // S3 — VERSUS (pre-fight)
  function lineup(ctx, u, side) {
    const list = ROSTER[side], sgn = side === 'ally' ? -1 : 1, col = side === 'ally' ? C.ally : C.enemy;
    const slots = [[0, 1.0], [1, 0.84], [-1, 0.84], [2, 0.7], [-2, 0.7]];
    const order = [3, 4, 1, 2, 0];
    for (const oi of order) {
      const [nm, role] = list[oi];
      const [sl, sc] = slots[oi];
      const t0 = oi * 0.11 + (side === 'enemy' ? 0.06 : 0), p = E.outExpo(prog(u, t0, t0 + 0.5));
      if (p <= 0) continue;
      const x = CX + sgn * (540 + sl * 175) + sgn * (1 - p) * 900;
      const y = 830 - (1 - sc) * 200;
      const s = 400 * sc;
      hero2D(ctx, x, y, s, role, { rim: col, fill: side === 'ally' ? '#0F1726' : '#1A0F18', glow: 26, rimW: 3.6, flip: side === 'enemy' });
      ctx.save();
      ctx.globalAlpha = p; ctx.textAlign = 'center';
      ctx.font = ifont(900, 26 * sc + 6); ctx.fillStyle = nm === 'YOU' ? C.orange : col;
      ctx.fillText(nm, x, y + 40);
      ctx.font = font(500, 12, FM); ctx.fillStyle = rgba(C.paper, 0.6);
      ctx.fillText(role.toUpperCase(), x, y + 60);
      ctx.restore();
    }
  }
  function s3(ctx, u) {
    fill(ctx, C.ink);
    const push = 1 + 0.06 * E.inOutCubic(prog(u, 0, 3.5 * B)) + 1.5 * E.inExpo(prog(u, 3.55 * B, 4 * B));
    ctx.save();
    ctx.translate(CX, CY); ctx.scale(push, push); ctx.translate(-CX, -CY);
    // split backgrounds
    ctx.fillStyle = '#0B1830'; ctx.beginPath(); poly(ctx, [[-400, -400], [CX + 160, -400], [CX - 160, H + 400], [-400, H + 400]]); ctx.fill();
    ctx.fillStyle = '#2A0D18'; ctx.beginPath(); poly(ctx, [[CX + 160, -400], [W + 400, -400], [W + 400, H + 400], [CX - 160, H + 400]]); ctx.fill();
    hexGrid(ctx, CX, CY, 40, 0.05, C.paper, u * 0.1);
    // team labels
    ctx.save();
    ctx.font = font(600, 16, FM); ctx.letterSpacing = '4px';
    ctx.fillStyle = C.ally; ctx.fillText(scramble('YOUR TEAM', prog(u, 0.1, 0.4), 2, u), 120, 230);
    ctx.textAlign = 'right'; ctx.fillStyle = C.enemy; ctx.fillText(scramble('ENEMY TEAM', prog(u, 0.15, 0.45), 3, u), W - 120, 230);
    ctx.restore();
    lineup(ctx, u, 'ally');
    lineup(ctx, u, 'enemy');
    // divider
    ctx.save();
    ctx.strokeStyle = C.orange; ctx.lineWidth = 6; ctx.shadowColor = C.orange; ctx.shadowBlur = 30;
    const dp = E.outExpo(prog(u, 0.0, 0.5));
    line(ctx, CX + 160, -100, lerp(CX + 160, CX - 160, dp), lerp(-100, H + 100, dp));
    ctx.restore();
    // VS
    const v = u - 2 * B;
    if (v >= 0) {
      const k = E.outExpo(clamp(v / 0.3));
      ctx.save(); cond(ctx, CX, CY + 70);
      ctx.scale(lerp(2.4, 1, k), lerp(2.4, 1, k));
      ctx.globalAlpha = clamp(v / 0.03);
      ctx.font = ifont(900, 230); ctx.textAlign = 'center';
      ctx.fillStyle = C.paper; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40;
      ctx.fillText('VS', 0, 0);
      ctx.restore();
    }
    ctx.save();
    ctx.font = font(600, 18, FT); ctx.letterSpacing = '8px'; ctx.textAlign = 'center';
    ctx.fillStyle = rgba(C.paper, prog(u, 3 * B, 3 * B + 0.2));
    ctx.fillText(scramble('ALL EYES ON THE OBJECTIVE', prog(u, 3 * B, 3.6 * B), 7, u), CX, 1000);
    ctx.restore();
    ctx.restore();
    const wf = E.inExpo(prog(u, 3.7 * B, 4 * B));
    if (wf > 0) { ctx.fillStyle = rgba('#FFFFFF', wf); ctx.fillRect(-400, -400, W + 800, H + 800); }
  }

  // S4 — FPS: SPAWN ROOM (setup countdown, doors open)
  const SPAWN_ALLIES = [
    { p: [-2.3, 0, -4.8], role: 'tank', name: 'ATLAS' },
    { p: [2.5, 0, -5.4], role: 'support', name: 'SOL', flip: true },
    { p: [1.3, 0, -3.6], role: 'damage', name: 'NOVA', flip: true },
  ];
  function s4(ctx, u) {
    const t = 3 * BAR + u;
    const open = E.inOutCubic(prog(t, 7.5, 7.95));
    fpsWorld(ctx, t, { doors: doorFaces(open), allies: SPAWN_ALLIES.map((a) => ({ ...a, p: [a.p[0], 0, a.p[2] + E.inOutCubic(prog(t, 7.62 + Math.abs(a.p[0]) * 0.05, 8.8)) * 11] })) });
    // door hologram countdown
    const hp = project(0, 3.75, -2.2);
    if (hp && open < 0.5) {
      const n = Math.max(0, 3 - Math.floor(u / B));
      const ph = (u % B) / B;
      ctx.save();
      ctx.translate(hp.x, hp.y); ctx.scale(hp.s / 220 * CD, hp.s / 220);
      ctx.globalAlpha = 1 - open * 2;
      ctx.textAlign = 'center'; ctx.font = ifont(900, 150);
      ctx.shadowColor = C.orange; ctx.shadowBlur = 40;
      ctx.fillStyle = mixHex(C.orange, '#FFFFFF', Math.exp(-ph * 6) * 0.7);
      ctx.fillText(n > 0 ? String(n) : 'GO', 0, 0);
      ctx.restore();
    }
    const m = gun(ctx, t, { bobY: 10 * Math.sin(t * TAU * 4) * (t > 7.6 ? 1 : 0) });
    crosshair(ctx, t);
    gameHud(ctx, t, { hp: 250, ult: 0.41, ammo: 30, obj: 0, objLabel: 'SETUP — ASSEMBLE YOUR TEAM' });
    // setup banner
    const bn = 1 - prog(t, 7.4, 7.6);
    if (bn > 0) {
      ctx.save(); ctx.globalAlpha = bn * prog(u, 0.05, 0.25);
      ctx.fillStyle = 'rgba(10,13,20,0.55)'; ctx.fillRect(CX - 300, 770, 600, 60);
      ctx.fillStyle = C.orange; ctx.fillRect(CX - 300, 770, 6, 60);
      cond(ctx, CX, 814);
      ctx.font = ifont(900, 36); ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`ROUND STARTS IN 00:0${Math.max(0, 3 - Math.floor(u / B))}`, 0, 0);
      ctx.restore();
    }
    // light flood on open
    const fl = Math.sin(Math.PI * prog(t, 7.5, 8.1));
    if (fl > 0) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = rgba('#FFB060', 0.18 * fl); ctx.fillRect(-400, -400, W + 800, H + 800); ctx.restore(); }
    muzzleFlash(ctx, m, t);
  }

  // S5 — FPS: FIRST ENGAGEMENT
  function s5(ctx, u) {
    const t = 4 * BAR + u;
    const walk = t < 8.95 ? 1 : 0;
    fpsWorld(ctx, t, { allies: [{ p: [-6.2, 0, lerp(4, 7, prog(t, 8, 10))], role: 'tank', name: 'ATLAS' }] });
    const m = gun(ctx, t, { bobY: 10 * Math.sin(t * TAU * 4) * walk, bobX: 8 * Math.sin(t * TAU * 2) * walk });
    shotFx(ctx, t, m);
    muzzleFlash(ctx, m, t);
    crosshair(ctx, t);
    eliminated(ctx, t);
    killFeed(ctx, t);
    const shots = SHOTS.filter((s) => s[0] <= t).length;
    gameHud(ctx, t, { hp: 250, ult: ultPct(t), ammo: 30 - shots, obj: 0.05, enemyAlive: [true, t < DEATH.VANTA1, t < DEATH.MOTH1, true, true] });
  }

  // S6 — TACTICAL (moments before the teamfight)
  const MP = (x, z) => [250 + (z + 10) * 25, CY + x * 25];
  const TAC = {
    ally: [[-2.5, 8], [0.5, 9], [3, 7.5], [-1, 4], [2, 3.5]],
    enemy: [[0.8, 28], [-6.8, 24], [6.4, 23], [3.6, 33], [-3.4, 34]],
  };
  function s6(ctx, u) {
    fill(ctx, C.ink);
    const t = 5 * BAR + u;
    const zoom = 1 + 3.2 * E.inExpo(prog(u, 3.5 * B, 4 * B));
    const oc = MP(0, 20);
    ctx.save();
    ctx.translate(oc[0], oc[1]); ctx.scale(zoom, zoom); ctx.translate(-oc[0], -oc[1]);
    // grid
    ctx.strokeStyle = 'rgba(244,241,234,0.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) line(ctx, x, 0, x, H);
    for (let y = 0; y < H; y += 50) line(ctx, 0, y, W, y);
    // map geometry (top view of the same arena)
    const mp = E.outExpo(prog(u, 0, 0.6));
    ctx.save();
    ctx.globalAlpha = mp;
    for (const f of WORLD) {
      if (f.n !== N.up || f.flat) continue;
      const pts = f.p.map((p) => MP(p[0], p[2]));
      ctx.fillStyle = 'rgba(244,241,234,0.06)'; ctx.beginPath(); poly(ctx, pts); ctx.fill();
      ctx.strokeStyle = 'rgba(244,241,234,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // spawn room
    const sr = [MP(-4, -13), MP(4, -2)];
    ctx.strokeStyle = rgba(C.ally, 0.5); ctx.strokeRect(sr[0][0], sr[0][1], sr[1][0] - sr[0][0], sr[1][1] - sr[0][1]);
    ctx.restore();
    // objective
    const op = E.outBack(prog(u, 0.15, 0.5));
    ring(ctx, oc[0], oc[1], 4.6 * 25 * op, C.orange, 3);
    ctx.save(); ctx.setLineDash([6, 8]); ctx.lineDashOffset = -u * 40;
    ring(ctx, oc[0], oc[1], 14 * 25 * op, rgba(C.orange, 0.35), 1.5); ctx.restore();
    ctx.save(); cond(ctx, oc[0], oc[1] + 16); ctx.font = ifont(900, 46); ctx.textAlign = 'center'; ctx.fillStyle = rgba(C.orange, op); ctx.fillText('A', 0, 0); ctx.restore();
    // teams
    for (const side of ['ally', 'enemy']) {
      const col = side === 'ally' ? C.ally : C.enemy;
      TAC[side].forEach(([x, z], i) => {
        const role = ROSTER[side][i][1];
        const from = side === 'ally' ? [x * 0.4, z - 12] : [x * 0.5, z + 12];
        const p = E.inOutCubic(prog(u, 0.1 + i * 0.05, 1.2 + i * 0.04));
        const surge = E.inExpo(prog(u, 3.3 * B, 4 * B)) * (side === 'ally' ? 5 : -5);
        const jx = x + 0.3 * Math.sin(t * 3 + i), jz = z + 0.3 * Math.cos(t * 2.4 + i);
        const cx = lerp(from[0], jx, p), cz = lerp(from[1], jz, p) + surge;
        const [px, py] = MP(cx, cz);
        // path trail
        ctx.save();
        ctx.setLineDash([3, 7]); ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 2;
        const [fx, fy] = MP(from[0], from[1]); line(ctx, fx, fy, px, py);
        ctx.restore();
        // sight cone toward objective
        const ang = Math.atan2(oc[1] - py, oc[0] - px) + 0.25 * Math.sin(t * 1.6 + i);
        ctx.fillStyle = rgba(col, 0.08);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 230, ang - 0.35, ang + 0.35); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16;
        disc(ctx, px, py, 20, col);
        ctx.restore();
        roleIcon(ctx, role, px, py, 22, C.ink);
        if (side === 'ally' && i === 1) { ring(ctx, px, py, 28, C.orange, 2.5); ctx.font = ifont(800, 18); ctx.fillStyle = C.orange; ctx.textAlign = 'center'; ctx.fillText('YOU', px, py - 34); }
      });
    }
    // engagement distance
    const da = MP(0.5, 9 + E.inExpo(prog(u, 3.3 * B, 4 * B)) * 5), db = MP(0.8, 28 - E.inExpo(prog(u, 3.3 * B, 4 * B)) * 5);
    const dl = prog(u, 0.9, 1.2);
    if (dl > 0) {
      ctx.strokeStyle = rgba(C.paper, 0.7 * dl); ctx.lineWidth = 1.5; line(ctx, da[0] + 26, da[1] - 50, db[0] - 26, db[1] - 50);
      line(ctx, da[0] + 26, da[1] - 58, da[0] + 26, da[1] - 42); line(ctx, db[0] - 26, db[1] - 58, db[0] - 26, db[1] - 42);
      ctx.font = font(600, 15, FM); ctx.textAlign = 'center'; ctx.fillStyle = rgba(C.paper, dl);
      const dist = Math.round((db[0] - da[0]) / 25);
      ctx.fillText(`${dist} M`, (da[0] + db[0]) / 2, da[1] - 62);
    }
    ctx.restore();
    // labels
    ctx.save();
    ctx.font = font(500, 16, FM); ctx.letterSpacing = '2px'; ctx.fillStyle = rgba(C.paper, 0.7);
    ctx.fillText(typed('06 / THE MOMENT BEFORE', prog(u, 0.05, 0.3)), 120, 168);
    cond(ctx, 120, 250);
    ctx.font = ifont(900, 72); ctx.fillStyle = C.paper;
    revealText(ctx, 'TEAMFIGHT IN', 0, 0, 72, u - 0.1, { stagger: 0.02, dur: 0.4 });
    ctx.restore();
    // countdown 3-2-1
    for (let k = 1; k <= 3; k++) {
      const v = u - k * B + 0.0;
      if (v < 0 || v > B) continue;
      ctx.save(); cond(ctx, 120 + 600, 250);
      const s = lerp(1.6, 1, E.outExpo(clamp(v / 0.2)));
      ctx.scale(s, s);
      ctx.font = ifont(900, 150); ctx.fillStyle = k === 3 ? C.orange : C.paper;
      ctx.globalAlpha = 1 - prog(v, 0.35, 0.5);
      ctx.fillText(String(4 - k), 0, 40);
      ctx.restore();
    }
    const fl = E.inExpo(prog(u, 3.8 * B, 4 * B));
    if (fl > 0) { ctx.fillStyle = rgba('#FFFFFF', fl); ctx.fillRect(-400, -400, W + 800, H + 800); }
  }

  // S7 — FPS: TEAMFIGHT
  function allyTracers(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const f of ALLYFIRE) {
      const d = t - f.t; if (d < 0 || d > 0.09) continue;
      if (t > DEATH[f.tg]) continue;
      const a = project(...f.from), b = project(...chest(f.tg, t));
      if (!b) continue;
      const ax = a ? a.x : f.from[0] < 0 ? -200 : W + 200, ay = a ? a.y : CY + 140;
      const k = clamp(d / 0.05), al = 1 - d / 0.09;
      ctx.strokeStyle = rgba(f.col, al); ctx.lineWidth = 4;
      line(ctx, lerp(ax, b.x, k * 0.7), lerp(ay, b.y, k * 0.7), lerp(ax, b.x, k), lerp(ay, b.y, k));
    }
    ctx.restore();
  }
  function incomingFx(ctx, t) {
    for (const ti of INCOMING) {
      const d = t - ti; if (d < 0 || d > 0.5) continue;
      const src = project(...chest(ti % 0.16 < 0.08 ? 'VANTA' : 'RONIN', ti));
      if (src && d < 0.06) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(C.enemy, 1 - d / 0.06); ctx.lineWidth = 5; ctx.lineCap = 'round';
        const ex = CX + (hash(ti) - 0.5) * 700, ey = H + 100;
        line(ctx, lerp(src.x, ex, d / 0.06 * 0.6), lerp(src.y, ey, d / 0.06 * 0.6), lerp(src.x, ex, d / 0.06), lerp(src.y, ey, d / 0.06));
        ctx.restore();
      }
    }
    // damage vignette
    let dmg = 0; for (const ti of INCOMING) { const d = t - ti; if (d >= 0) dmg = Math.max(dmg, Math.exp(-d * 5)); }
    if (t > 12.5) dmg *= 1 - prog(t, 12.5, 12.8);
    if (dmg > 0.01) {
      const g = ctx.createRadialGradient(CX, CY, 300, CX, CY, 1150);
      g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,40,60,${0.55 * dmg})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // healing
    const hp = prog(t, 12.48, 13.1);
    if (hp > 0 && hp < 1) {
      const g = ctx.createRadialGradient(CX, CY, 350, CX, CY, 1150);
      g.addColorStop(0, 'rgba(255,228,92,0)'); g.addColorStop(1, `rgba(255,228,92,${0.32 * Math.sin(Math.PI * hp)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let k = 0; k < 18; k++) {
        const x = 200 + hash(k * 3.3) * 1520, y = H - 80 - ((hp * 900 + hash(k) * 500) % 900);
        ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * hp) * 0.9;
        roleIcon(ctx, 'support', x, y, 26 + hash(k + 9) * 18, C.heal); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * hp); ctx.textAlign = 'center';
      cond(ctx, CX, CY + 210); ctx.font = ifont(900, 30); ctx.fillStyle = C.heal; ctx.fillText('+ HEALED BY SOL', 0, 0); ctx.restore();
    }
  }
  function s7(ctx, u) {
    const t = 6 * BAR + u;
    fpsWorld(ctx, t, { ringCol: C.orange });
    allyTracers(ctx, t);
    const m = gun(ctx, t, { ult: u > 3 * B ? 0.4 + 0.3 * Math.sin(t * 20) : 0 });
    shotFx(ctx, t, m);
    muzzleFlash(ctx, m, t);
    incomingFx(ctx, t);
    crosshair(ctx, t);
    eliminated(ctx, t);
    killFeed(ctx, t);
    const shots = SHOTS.filter((s) => s[0] <= t).length;
    gameHud(ctx, t, { hp: playerHp(t), ult: ultPct(t), ammo: 30 - shots, obj: 0.32 + u * 0.05, contested: true, objLabel: 'CONTESTED', enemyAlive: [true, true, t < DEATH.MOTH, true, true] });
    // ENGAGE slam
    const e = 1 - prog(u, 0.32, 0.5);
    if (e > 0) {
      const k = E.outExpo(clamp(u / 0.2));
      ctx.save(); cond(ctx, CX, CY + 60);
      ctx.scale(lerp(1.7, 1, k), lerp(1.7, 1, k)); ctx.globalAlpha = e;
      ctx.font = ifont(900, 210); ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30;
      ctx.fillText('ENGAGE', 0, 0);
      ctx.restore();
      ctx.fillStyle = rgba(C.orange, e); const bw = 900 * k; ctx.fillRect(CX - bw / 2, CY + 100, bw, 14);
    }
    // ULTIMATE READY
    const ur = prog(t, 13.55, 13.7);
    if (ur > 0) {
      ctx.save(); cond(ctx, CX, 860);
      const s = 1 + 0.25 * Math.exp(-(t - 13.55) * 10);
      ctx.scale(s, s);
      ctx.globalAlpha = ur * (0.75 + 0.25 * Math.sin(t * 22));
      ctx.font = ifont(900, 44); ctx.textAlign = 'center'; ctx.fillStyle = C.orange;
      ctx.shadowColor = C.orange; ctx.shadowBlur = 24;
      ctx.fillText('ULTIMATE READY — PRESS Q', 0, 0);
      ctx.restore();
    }
  }

  // S8 — FPS: ULTIMATE → TEAM KILL
  function s8(ctx, u) {
    const t = 7 * BAR + u;
    fpsWorld(ctx, t, { ringCol: C.orange });
    // ult tint
    const ut = Math.min(1, prog(t, ULT_T, ULT_T + 0.15)) * (1 - prog(t, 15.6, 15.9));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba('#5A6A90', 0.55 * ut); ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(CX, CY, 360, CX, CY, 1150);
    g.addColorStop(0, 'rgba(249,158,26,0)'); g.addColorStop(1, `rgba(249,158,26,${0.35 * ut})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // activation shockwave
    const av = t - ULT_T;
    if (av >= 0 && av < 0.5) { ring(ctx, CX, CY, E.outExpo(av / 0.5) * 1300, rgba(C.orange, 1 - av / 0.5), 30 * (1 - av / 0.5)); }
    // lock-ons
    for (const [lt, key] of LOCKS) {
      const v = t - lt; if (v < 0 || t > BOOM_T + 0.05) continue;
      const p = project(...chest(key, t)); if (!p) continue;
      const k = E.outExpo(clamp(v / 0.14));
      const sz = lerp(200, 46 + p.s * 0.08, k), rot = (1 - k) * 1.6 + Math.PI / 4;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.save(); ctx.rotate(rot);
      ctx.strokeStyle = k >= 1 ? C.orange : '#FFFFFF'; ctx.lineWidth = 3; ctx.shadowColor = C.orange; ctx.shadowBlur = 16;
      ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      if (k >= 0.99) {
        ctx.fillStyle = C.orange;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.fillRect(sx * (sz * 0.75) - 5, sy * (sz * 0.75) - 5, 10, 10); }
        ctx.font = font(700, 14, FM); ctx.textAlign = 'center';
        ctx.fillText(`LOCKED · ${Math.round(p.z)}M`, 0, sz * 0.75 + 30);
      }
      ctx.restore();
    }
    // missiles
    const mzl = gun(ctx, t, { ult: ut, bobY: 0 });
    const fp = prog(t, FIRE_T, BOOM_T);
    if (fp > 0 && fp < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      LOCKS.forEach(([, key], i) => {
        const p = project(...chest(key, t)); if (!p) return;
        const c1 = [lerp(mzl[0], p.x, 0.3) + (i - 1.5) * 260, mzl[1] - 520 - i * 60];
        const at = (q) => [(1 - q) * (1 - q) * mzl[0] + 2 * (1 - q) * q * c1[0] + q * q * p.x, (1 - q) * (1 - q) * mzl[1] + 2 * (1 - q) * q * c1[1] + q * q * p.y];
        const e = E.inOutCubic(fp);
        ctx.strokeStyle = rgba(C.orange, 0.85); ctx.lineWidth = 7;
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) { const q = Math.max(0, e - 0.35) + (e - Math.max(0, e - 0.35)) * (s / 24); const pt = at(q); s ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]); }
        ctx.stroke();
        const hd = at(e); disc(ctx, hd[0], hd[1], 14, '#FFF3D6');
      });
      ctx.restore();
    }
    // explosions
    const bv = t - BOOM_T;
    if (bv >= 0) {
      for (const [, key] of LOCKS) {
        const p = project(...chest(key, BOOM_T)); if (!p) continue;
        const R = p.s * 2.6, a = 1 - clamp(bv / 0.6);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * (0.4 + E.outExpo(clamp(bv / 0.3))));
        g2.addColorStop(0, rgba('#FFF2D0', a)); g2.addColorStop(0.35, rgba(C.orange, 0.8 * a)); g2.addColorStop(1, rgba(C.orange, 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(p.x, p.y, R * 1.4, 0, TAU); ctx.fill();
        ctx.restore();
        ring(ctx, p.x, p.y, R * E.outExpo(clamp(bv / 0.5)) * 1.3, rgba('#FFFFFF', a), 6 * a);
      }
      const fl = Math.exp(-bv * 10);
      ctx.fillStyle = rgba('#FFF4E0', 0.6 * fl); ctx.fillRect(-400, -400, W + 800, H + 800);
    }
    crosshair(ctx, t, ut > 0.5 ? C.orange : C.paper);
    killFeed(ctx, t);
    const alive = ROSTER.enemy.map(([nm]) => { const key = Object.keys(ENEMIES).find((k) => ENEMIES[k].name === nm && ENEMIES[k].on[0] > 11); return t < DEATH[key]; });
    gameHud(ctx, t, { hp: 250, ult: ultPct(t), ammo: 18, obj: lerp(0.4, 0.9, prog(t, 15.5, 16)), contested: t < BOOM_T, objLabel: t < BOOM_T ? 'CONTESTED' : 'CAPTURING', enemyAlive: alive });
    // centre callout
    const cv = t - (ULT_T + 0.05);
    if (cv > 0 && t < FIRE_T) {
      ctx.save(); cond(ctx, CX, 300);
      ctx.globalAlpha = clamp(cv / 0.1) * (1 - prog(t, FIRE_T - 0.1, FIRE_T));
      ctx.font = ifont(900, 54); ctx.textAlign = 'center'; ctx.fillStyle = C.orange; ctx.shadowColor = C.orange; ctx.shadowBlur = 20;
      ctx.fillText(scramble('TARGETS ACQUIRED', prog(cv, 0, 0.35), 9, t), 0, 0);
      ctx.restore();
    }
    // TEAM KILL
    if (bv > 0.04) {
      const k = E.outExpo(clamp((bv - 0.04) / 0.25));
      ctx.save(); cond(ctx, CX, CY + 40);
      ctx.scale(lerp(2.2, 1, k), lerp(2.2, 1, k));
      ctx.font = ifont(900, 190); ctx.textAlign = 'center';
      ctx.fillStyle = C.paper; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40;
      ctx.fillText('TEAM KILL', 0, 0);
      ctx.restore();
      ctx.fillStyle = C.orange;
      const bw = 1100 * E.outExpo(prog(bv, 0.1, 0.35));
      ctx.save(); ctx.translate(CX, CY + 90); ctx.transform(1, 0, -0.3, 1, 0, 0); ctx.fillRect(-bw / 2, 0, bw, 16); ctx.restore();
    }
    const wo = E.inExpo(prog(u, 3.6 * B, 4 * B));
    if (wo > 0) { ctx.fillStyle = mixHex('#FFFFFF', C.orange, prog(u, 3.85 * B, 4 * B)); ctx.globalAlpha = wo; ctx.fillRect(-400, -400, W + 800, H + 800); ctx.globalAlpha = 1; }
  }

  // S9 — KINETIC TYPE
  function s9(ctx, u) {
    fill(ctx, C.orange);
    const fl = Math.exp(-u * 14); if (fl > 0.01) { ctx.fillStyle = rgba('#FFFFFF', fl); ctx.fillRect(-400, -400, W + 800, H + 800); }
    const X = 130;
    const jolt = -26 * spring(u - 2 * B - 0.02, 9, 24);
    ctx.fillStyle = C.ink;
    // side column
    const cp = E.outExpo(prog(u, 0.15, 0.7));
    ctx.save();
    ctx.globalAlpha = cp; ctx.translate(0, (1 - cp) * 40);
    ctx.save(); cond(ctx, 1540, 290); ctx.font = ifont(900, 190); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeText('09', 0, 0); ctx.restore();
    ctx.font = font(500, 22, FT);
    ['Tank · Damage · Support', 'Five roles, one plan', 'Win it together'].forEach((s, k) => ctx.fillText(typed(s, prog(u, 0.3 + k * 0.12, 0.7 + k * 0.12)), 1548, 350 + k * 34));
    ctx.fillRect(1548, 460, 230 * E.outExpo(prog(u, 0.5, 1.1)), 3);
    ctx.restore();
    const m1 = E.outExpo(prog(u, B, B + 0.4));
    ctx.save();
    cond(ctx, X, lerp(620, 320, m1) + jolt); const sc = lerp(1, 0.84, m1); ctx.scale(sc, sc);
    ctx.font = ifont(900, 260); ctx.letterSpacing = '-6px';
    revealText(ctx, 'NO HERO', 0, 0, 260, u - 0.02, { stagger: 0.03, dur: 0.5 });
    ctx.restore();
    if (u > B) {
      ctx.save(); cond(ctx, X, 556 + jolt * 0.6);
      ctx.font = ifont(900, 218); ctx.letterSpacing = '-6px';
      revealText(ctx, 'FIGHTS', 0, 0, 218, u - B, { stagger: 0.028, dur: 0.45, rot: -0.2 });
      ctx.restore();
    }
    const ts = u - 2 * B;
    if (ts >= 0) {
      const k = E.outExpo(clamp(ts / 0.3)), s = lerp(2.7, 1, k);
      ctx.save();
      ctx.font = ifont(900, 330); ctx.letterSpacing = '-10px';
      const str = 'ALONE.', xs = measure(ctx, str), BL = 905;
      const cxT = X + (xs[6] * CD) / 2, cyT = BL - 120;
      ctx.globalAlpha = clamp(ts / 0.03);
      ctx.translate(cxT, cyT); ctx.scale(s, s); ctx.rotate((1 - k) * -0.07); ctx.translate(-cxT, -cyT);
      ctx.translate(X, BL); ctx.scale(CD, 1);
      for (let i = 0; i < 6; i++) {
        const cw = xs[i + 1] - xs[i], tau = u - 3 * B - i * 0.035;
        ctx.save();
        ctx.translate(xs[i] + cw / 2, 0);
        const q = 0.25 * spring(tau, 9, 28);
        ctx.scale(1 + q * 0.6, 1 - q);
        if (i === 5) ctx.translate(0, tau > 0 ? -140 * Math.abs(Math.sin(tau * 13)) * Math.exp(-tau * 4) : 0);
        ctx.fillStyle = i === 5 ? C.paper : C.ink; ctx.textAlign = 'center';
        ctx.fillText(str[i], 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }
    for (let i = 0; i < 9; i++) {
      const p = E.inOutCubic(prog(u, 3.5 * B + i * 0.012, 3.5 * B + i * 0.012 + 0.14));
      if (p <= 0) continue;
      ctx.save(); ctx.fillStyle = C.ink; ctx.translate(lerp(W + 600, -200, p), 0); ctx.transform(1, 0, -0.3, 1, 0, 0);
      ctx.fillRect(0, i * 120 - (i === 0 ? 400 : 0), W + 1200, 121 + (i === 0 || i === 8 ? 400 : 0)); ctx.restore();
    }
  }

  // S10 — MONTAGE → VICTORY
  const snapC = mk(), snapX = snapC.getContext('2d');
  const vicC = mk(1600, 420), vicX = vicC.getContext('2d');
  const MONTAGE = [[0, s5, 1.05], [0.25, s3, 1.7], [0.5, s7, 1.25], [0.625, s6, 1.3], [0.75, s8, 1.62], [0.875, s2, 1.6]];
  function s10(ctx, u) {
    if (u < 1.0) {
      let k = 0; for (let i = 0; i < MONTAGE.length; i++) if (u >= MONTAGE[i][0]) k = i;
      const [b0, fn, us] = MONTAGE[k], lu = u - b0;
      snapX.save(); snapX.setTransform(1, 0, 0, 1, 0, 0); fn(snapX, us + lu); snapX.restore();
      ctx.drawImage(snapC, 0, 0);
      const decay = Math.exp(-lu * 18);
      for (let s = 0; s < 7; s++) {
        const y = Math.floor(hash(k * 31 + s) * H), h = 8 + hash(k * 17 + s * 3) * 90;
        ctx.drawImage(snapC, 0, y, W, h, (hash(k * 7 + s * 11) - 0.5) * 260 * (0.35 + decay), y, W, h);
      }
      if (k % 2) { ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(-400, -400, W + 800, H + 800); ctx.restore(); }
      return;
    }
    const v = u - 1.0;
    fill(ctx, C.ink);
    // sunburst
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(v * 0.25);
    ctx.fillStyle = rgba(C.orange, 0.1 * E.outExpo(clamp(v / 0.3)));
    for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1500, (i / 24) * TAU, (i / 24) * TAU + TAU / 48); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    hexGrid(ctx, CX, CY, 40, 0.04, C.paper, v * 0.2);
    // sparks
    const r = mulberry(77);
    for (let i = 0; i < 90; i++) {
      const an = r() * TAU, sp = 300 + r() * 1100, sz = 2 + r() * 5, d = (sp * (1 - Math.exp(-v * 3))) / 3;
      disc(ctx, CX + Math.cos(an) * d, CY - 30 + Math.sin(an) * d * 0.7 + v * v * 120, sz * (1 - prog(v, 0.6, 1.0)), i % 3 ? C.orange : C.paper);
    }
    const k = E.outExpo(clamp(v / 0.3));
    ctx.save(); cond(ctx, CX, CY + 85);
    ctx.scale(lerp(2.6, 1, k), lerp(2.6, 1, k)); ctx.globalAlpha = clamp(v / 0.03);
    vicX.save(); vicX.setTransform(1, 0, 0, 1, 0, 0); vicX.clearRect(0, 0, 1600, 420);
    vicX.font = ifont(900, 290); vicX.textAlign = 'center'; vicX.letterSpacing = '-4px';
    vicX.fillStyle = C.orange; vicX.fillText('VICTORY', 800, 330);
    vicX.globalCompositeOperation = 'source-atop';
    const sx = lerp(-200, 1800, E.inOutCubic(prog(v, 0.2, 0.75)));
    const g = vicX.createLinearGradient(sx - 140, 0, sx + 140, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    vicX.fillStyle = g; vicX.fillRect(0, 0, 1600, 420);
    vicX.restore();
    ctx.drawImage(vicC, -800, -330);
    ctx.restore();
    ctx.save();
    ctx.font = font(600, 18, FT); ctx.letterSpacing = '8px'; ctx.textAlign = 'center'; ctx.fillStyle = rgba(C.paper, prog(v, 0.2, 0.4));
    ctx.fillText(scramble('OBJECTIVE SECURED · TEAM KILL', prog(v, 0.2, 0.55), 11, u), CX, CY + 170);
    ctx.restore();
    const fl = Math.exp(-v * 14); if (fl > 0.01) { ctx.fillStyle = rgba('#FFFFFF', fl * 0.8); ctx.fillRect(-400, -400, W + 800, H + 800); }
    const wo = E.inExpo(prog(v, 0.85, 1.0)); if (wo > 0) { ctx.fillStyle = rgba('#FFFFFF', wo); ctx.fillRect(-400, -400, W + 800, H + 800); }
  }

  // S11 — END CARD (2 bars)
  const endC = mk(), endX = endC.getContext('2d');
  function endContent(ctx, u) {
    fill(ctx, C.ink);
    hexGrid(ctx, CX, CY, 46, 0.035, C.paper, u * 0.03);
    const sp = prog(u, 0, 0.8);
    if (sp < 1) ring(ctx, CX, CY, 80 + E.outExpo(sp) * 1100, rgba(C.orange, 1 - sp), 30 * (1 - sp));
    ctx.save();
    ctx.font = font(500, 16, FM); ctx.textAlign = 'center'; ctx.letterSpacing = '6px'; ctx.fillStyle = rgba(C.paper, 0.6);
    ctx.fillText(scramble('A FAN-MADE CONCEPT PROMO', prog(u, 0.1, 0.5), 3, u), CX, 300);
    ctx.restore();
    ctx.save();
    cond(ctx, CX, 545);
    ctx.font = ifont(900, 230); ctx.letterSpacing = '-4px'; ctx.fillStyle = C.paper;
    revealText(ctx, 'OVERWATCH', 0, 0, 230, u - 0.02, { stagger: 0.03, dur: 0.6, rot: 0.1, align: 'center' });
    ctx.restore();
    const w = 1240, b1 = E.outExpo(prog(u, 0.25, 0.7));
    ctx.save(); ctx.translate(CX, 582); ctx.transform(1, 0, -0.3, 1, 0, 0); ctx.fillStyle = C.orange; ctx.fillRect(-w / 2, 0, w * b1, 14); ctx.restore();
    // tagline
    ctx.save();
    const gp = E.outCubic(prog(u, 0.45, 0.9));
    ctx.globalAlpha = gp; ctx.textAlign = 'center';
    ctx.save(); cond(ctx, CX, 668 + (1 - gp) * 16); ctx.font = ifont(800, 40); ctx.letterSpacing = '6px'; ctx.fillStyle = C.paper; ctx.fillText('NO HERO FIGHTS ALONE.', 0, 0); ctx.restore();
    ctx.font = font(400, 22, FJ); ctx.fillStyle = rgba(C.paper, 0.6);
    ctx.fillText('ヒーローは、ひとりじゃない。', CX, 712 + (1 - gp) * 16);
    ctx.restore();
    // CTA pill
    const cp = E.outBack(prog(u, 0.7, 1.05));
    if (cp > 0) {
      const beat = Math.exp(-((u + 20) % B) * 8) * prog(u, 1.2, 1.3);
      ctx.save(); ctx.translate(CX, 812); ctx.scale(cp * (1 + 0.04 * beat), cp * (1 + 0.04 * beat));
      ctx.fillStyle = C.orange; ctx.shadowColor = C.orange; ctx.shadowBlur = 20 + 30 * beat;
      ctx.beginPath(); poly(ctx, [[-230, -36], [250, -36], [230, 36], [-250, 36]]); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.scale(CD, 1); ctx.font = ifont(900, 34); ctx.textAlign = 'center'; ctx.fillStyle = C.ink; ctx.letterSpacing = '4px';
      ctx.fillText('JOIN THE FIGHT', 0, 12);
      ctx.restore();
    }
    ctx.save();
    const rp = E.outExpo(prog(u, 0.9, 1.4));
    ctx.fillStyle = rgba(C.paper, 0.3); ctx.fillRect(CX - 840 * rp, 948, 1680 * rp, 1);
    ctx.font = font(400, 13, FM); ctx.fillStyle = rgba(C.paper, 0.6 * rp); ctx.letterSpacing = '2px';
    ctx.fillText('FAN-MADE CONCEPT · NOT AN OFFICIAL TRAILER', 120, 984);
    ctx.textAlign = 'right';
    ctx.fillText('NOT AFFILIATED WITH OR ENDORSED BY BLIZZARD ENTERTAINMENT', W - 120, 984);
    ctx.restore();
  }
  function s11(ctx, u) {
    const c0 = 3.25;
    if (u < c0) endContent(ctx, u);
    else {
      endX.save(); endX.setTransform(1, 0, 0, 1, 0, 0); endContent(endX, u); endX.restore();
      fill(ctx, '#000');
      const p1 = prog(u, c0, c0 + 0.11), p2 = prog(u, c0 + 0.11, c0 + 0.22), p3 = prog(u, c0 + 0.22, c0 + 0.7);
      const sy = lerp(1, 0.006, E.inCubic(p1)), sx = lerp(1, 0.003, E.inCubic(p2));
      if (p2 < 1) {
        ctx.save(); ctx.translate(CX, CY); ctx.scale(sx, sy); ctx.translate(-CX, -CY); ctx.drawImage(endC, 0, 0); ctx.restore();
        ctx.fillStyle = rgba('#FFFFFF', E.inCubic(p1) * (1 - p2 * 0.2));
        ctx.fillRect(CX - (W / 2) * sx, CY - Math.max(2, (H / 2) * sy), W * sx, Math.max(4, H * sy));
      }
      // dot → crosshair
      if (p2 > 0.8) {
        const a = 1 - prog(p3, 0.7, 1), k = E.outExpo(clamp(p3 / 0.4));
        disc(ctx, CX, CY, 4.5, rgba(C.orange, a));
        ctx.strokeStyle = rgba(C.paper, a * k); ctx.lineWidth = 3; ctx.lineCap = 'round';
        const g = 8 + 14 * k, l = 16 * k;
        line(ctx, CX - g - l, CY, CX - g, CY); line(ctx, CX + g, CY, CX + g + l, CY);
        line(ctx, CX, CY - g - l, CX, CY - g); line(ctx, CX, CY + g, CX, CY + g + l);
      }
    }
    const fl = Math.exp(-u * 16); if (fl > 0.01) { ctx.fillStyle = rgba('#FFFFFF', fl * 0.9); ctx.fillRect(-400, -400, W + 800, H + 800); }
  }

  // bar → scene
  const SCENES = [[0, 1, s1], [1, 1, s2], [2, 1, s3], [3, 1, s4], [4, 1, s5], [5, 1, s6], [6, 1, s7], [7, 1, s8], [8, 1, s9], [9, 1, s10], [10, 2, s11]];
  const NAMES = ['MATCH FOUND', 'ROLES', 'VERSUS', 'SPAWN', 'FIRST PICK', 'THE MOMENT BEFORE', 'TEAMFIGHT', 'ULTIMATE', 'NO HERO FIGHTS ALONE', 'VICTORY', 'JOIN THE FIGHT'];
  const FPS_SCENES = new Set([3, 4, 6, 7]);
  function sceneAt(t) {
    const bar = Math.min(BARS - 1, Math.floor(t / BAR));
    for (let i = 0; i < SCENES.length; i++) { const [b0, n] = SCENES[i]; if (bar >= b0 && bar < b0 + n) return { i, u: t - b0 * BAR, fn: SCENES[i][2] }; }
    return { i: SCENES.length - 1, u: t - 10 * BAR, fn: s11 };
  }

  // ───────────────────────────────────────────── camera / post
  const IMPACTS = [
    [2 * B, 0.7], [BAR, 0.25], [2 * BAR + 2 * B, 0.9], [7.5, 0.35],
    ...SHOTS.map((s) => [s[0], s[3] ? 0.3 : 0.14]),
    [6 * BAR, 0.8], ...INCOMING.map((x) => [x, 0.25]),
    [ULT_T, 0.5], [BOOM_T, 1.5], [8 * BAR + 2 * B, 1.0],
    ...MONTAGE.map((m) => [9 * BAR + m[0], 0.35]), [9 * BAR + 1.0, 1.1], [10 * BAR, 1.2], [10 * BAR + 3.25, 0.3],
  ];
  function shake(t) {
    let x = 0, y = 0, r = 0, z = 1;
    for (const [ti, s] of IMPACTS) {
      const tau = t - ti; if (tau < 0 || tau > 1.2) continue;
      const a = s * Math.exp(-tau * 9);
      x += a * 24 * noise1(tau * 36 + ti * 10); y += a * 24 * noise1(tau * 36 + ti * 10 + 57);
      r += a * 0.01 * noise1(tau * 28 + ti * 3 + 11); z += a * 0.025;
    }
    return { x, y, r, z };
  }
  function chromaAmt(t) { let a = 0; for (const [ti, s] of IMPACTS) { const tau = t - ti; if (tau >= 0 && tau < 1) a += s * 16 * Math.exp(-tau * 11); } return Math.min(a, 30); }
  const kickEnv = (t) => ((t >= 4 * BAR && t < 5 * BAR) || (t >= 6 * BAR && t < 7 * BAR) || (t >= 8 * BAR && t < 9 * BAR) ? Math.exp(-(t % B) * 10) : 0);

  let main, mctx, sc, sctx, tmp, tctx, chan, cctx, tiny, tyx, vignette;
  function renderScene(ctx, t) {
    const { fn, u } = sceneAt(t);
    const sh = shake(t), pulse = 1 + 0.006 * kickEnv(t);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(CX + sh.x, CY + sh.y); ctx.rotate(sh.r); ctx.scale(pulse * sh.z, pulse * sh.z); ctx.translate(-CX, -CY);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
    fn(ctx, u);
    ctx.restore();
  }
  function chroma(amt) {
    if (amt < 0.6) return;
    tctx.globalCompositeOperation = 'copy'; tctx.drawImage(main, 0, 0); tctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, W, H);
    for (const [col, dx, dy] of [['#FF0000', amt, 0], ['#00FF00', 0, 0], ['#0000FF', -amt, amt * 0.3]]) {
      cctx.globalCompositeOperation = 'copy'; cctx.drawImage(tmp, 0, 0);
      cctx.globalCompositeOperation = 'multiply'; cctx.fillStyle = col; cctx.fillRect(0, 0, W, H);
      mctx.globalCompositeOperation = 'lighter';
      mctx.drawImage(chan, -Math.abs(amt) + dx, -Math.abs(amt) + dy, W + 2 * Math.abs(amt), H + 2 * Math.abs(amt));
    }
    mctx.globalCompositeOperation = 'source-over';
  }

  function hud(t) {
    const { i: si, u: su } = sceneAt(t);
    const fpsMode = FPS_SCENES.has(si);
    const end = si === SCENES.length - 1;
    let a = end ? 1 - prog(su, 0, 0.1) : 1;
    if (a <= 0) return;
    tyx.drawImage(main, 0, 0, 48, 27);
    const d = tyx.getImageData(0, 0, 48, 27).data;
    const lumAt = (x, y) => { const i = (Math.min(26, Math.max(0, Math.floor((y / H) * 27))) * 48 + Math.min(47, Math.max(0, Math.floor((x / W) * 48)))) * 4; return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };
    const colAt = (x, y) => (lumAt(x, y) > 0.5 ? C.ink : C.paper);
    const boot = (d0) => prog(t, d0, d0 + 0.35);
    const ctx = mctx;
    ctx.save(); ctx.globalAlpha = a; ctx.textBaseline = 'alphabetic';
    const m = 40, l = 26;
    ctx.lineWidth = 2;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      const bp = E.outExpo(boot(0.02));
      ctx.strokeStyle = colAt(x + sx * 10, y + sy * 10);
      ctx.beginPath(); ctx.moveTo(x, y + sy * l * bp); ctx.lineTo(x, y); ctx.lineTo(x + sx * l * bp, y); ctx.stroke();
    }
    if (!fpsMode) {
      ctx.font = font(600, 15, FT); ctx.letterSpacing = '3px'; ctx.textAlign = 'left';
      ctx.fillStyle = colAt(150, 82);
      ctx.fillText(scramble('OVERWATCH — FAN PROMO', boot(0.05), 1, t), 72, 84);
      ctx.font = font(400, 12, FM); ctx.letterSpacing = '1px'; ctx.globalAlpha = a * 0.6;
      ctx.fillText(scramble('CONCEPT TRAILER · UNOFFICIAL · 2026', boot(0.12), 2, t), 72, 106);
      ctx.globalAlpha = a;
      const f = Math.min(1439, Math.floor(t * FPS + 1e-4));
      ctx.textAlign = 'right'; ctx.font = font(400, 16, FM);
      ctx.fillStyle = colAt(W - 140, 82);
      ctx.fillText(scramble(`TC 00:00:${pad(Math.floor(f / FPS), 2)}:${pad(f % FPS, 2)}`, boot(0.08), 3, t), W - 72, 84);
      ctx.font = font(400, 12, FM); ctx.globalAlpha = a * 0.6;
      ctx.fillText(`FRAME ${pad(f + 1, 4)}/1440`, W - 92, 106);
      ctx.globalAlpha = a * boot(0.15);
      disc(ctx, W - 78, 102, 4.5, (t % B) < B / 2 ? C.orange : rgba(C.orange, 0.25));
      ctx.globalAlpha = a;
      ctx.textAlign = 'left'; ctx.fillStyle = colAt(160, H - 66);
      ctx.font = font(400, 13, FM); ctx.letterSpacing = '1px';
      ctx.fillText(`${pad(si + 1, 2)}/11`, 72, H - 62);
      ctx.font = font(600, 15, FT); ctx.letterSpacing = '3px';
      ctx.fillText(scramble(NAMES[si], prog(su, 0.02, 0.4), si * 5, t), 126, H - 62);
      ctx.textAlign = 'right'; ctx.fillStyle = colAt(W - 200, H - 66);
      ctx.font = font(400, 12, FM); ctx.letterSpacing = '1px'; ctx.globalAlpha = a * 0.7;
      ctx.fillText('1920×1080 · 60 FPS · 120 BPM', W - 72, H - 62);
      ctx.globalAlpha = a;
    }
    // progress
    const y = H - 40, x0 = 72, x1 = W - 72, pp = t / DUR, bpp = E.outExpo(boot(0.1));
    for (let c = 0; c < 48; c++) {
      const cx0 = Math.max(x0, (c / 48) * W), cx1 = Math.min(x1 * bpp + x0 * (1 - bpp), ((c + 1) / 48) * W);
      if (cx1 <= cx0) continue;
      const col = fpsMode ? C.paper : colAt((cx0 + cx1) / 2, y);
      ctx.fillStyle = col; ctx.globalAlpha = a * (fpsMode ? 0.12 : 0.25); ctx.fillRect(cx0, y, cx1 - cx0, 1);
      const fx1 = Math.min(cx1, lerp(x0, x1, pp));
      if (fx1 > cx0) { ctx.globalAlpha = a * (fpsMode ? 0.5 : 1); ctx.fillRect(cx0, y - 1, fx1 - cx0, 3); }
      if (!fpsMode) for (let k = 0; k <= 48; k++) {
        const tx = lerp(x0, x1, k / 48); if (tx < cx0 || tx >= cx1) continue;
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
    chroma(chromaAmt(t));
    mctx.fillStyle = vignette; mctx.fillRect(0, 0, W, H);
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
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
    const specs = [ifont(900, 100), ifont(800, 100), ifont(700, 100), font(600, 100, FT), font(500, 100, FT), font(400, 100, FM), font(400, 100, FJ), font(400, 100)];
    if (document.fonts) await Promise.all(specs.map((s) => document.fonts.load(s, 'AaあOVERWATCH')));
  }

  global.REEL = { init, drawFrame, W, H, FPS, DUR, BPM, B, BAR, frames: Math.round(DUR * FPS), audio: 'dist/overwatch-soundtrack.wav' };
})(window);
