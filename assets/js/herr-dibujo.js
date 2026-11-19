import { dist, lineaMedia } from "./herr-core.js";

export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export function marco(img, P, opt = {}) {
  const xs = P.map(q => q.x), ys = P.map(q => q.y);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  if (opt.size) {
    const [W, H] = opt.size, zoom = opt.zoom || 1.7;
    let h = (by1 - by0) * zoom, w = h * W / H;
    const s = Math.min(1, img.width / w, img.height / h); w *= s; h *= s;
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2 + (by1 - by0) * 0.04;
    const x0 = Math.min(Math.max(0, cx - w / 2), img.width - w), y0 = Math.min(Math.max(0, cy - h / 2), img.height - h);
    return { x0, y0, x1: x0 + w, y1: y0 + h, W, H };
  }
  const pad = opt.pad ?? 0.4, pw = (bx1 - bx0) * pad, ph = (by1 - by0) * 0.35;
  return { x0: Math.max(0, bx0 - pw), x1: Math.min(img.width, bx1 + pw), y0: Math.max(0, by0 - ph), y1: Math.min(img.height, by1 + ph * 0.7) };
}

function lienzo(canvas, img, P, box, disp = 420) {
  const W = box.W || Math.min(900, Math.round(box.x1 - box.x0)), k = W / (box.x1 - box.x0), H = box.H || Math.round((box.y1 - box.y0) * k);
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d");
  g.drawImage(img, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, 0, 0, W, H);
  g.fillStyle = "rgba(22,25,29,.16)"; g.fillRect(0, 0, W, H);
  const S = Math.max(W, H * 0.8) / disp;
  const q = (pt) => ({ x: (pt.x - box.x0) * k, y: (pt.y - box.y0) * k });
  const p = (i) => q(P[i]);
  const m = lineaMedia(P), A = q(m.a), B = q(m.b);
  const L = Math.hypot(B.x - A.x, B.y - A.y), d = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, r = { x: -d.y, y: d.x };
  if (r.x < 0) { r.x = -r.x; r.y = -r.y; }
  const add = (a, v, t) => ({ x: a.x + v.x * t, y: a.y + v.y * t });
  const WH = "rgba(255,255,255,.95)";
  const linea = (a, b, o = {}) => {
    g.save(); g.strokeStyle = o.color || WH; g.lineWidth = (o.w || 1.6) * S; g.lineCap = "round"; g.setLineDash(o.dash ? o.dash.map(v => v * S) : []);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
  };
  const punto = (a, rad = 3) => { g.save(); g.fillStyle = "#fff"; g.beginPath(); g.arc(a.x, a.y, rad * S, 0, 7); g.fill(); g.restore(); };
  const aro = (a, rad = 5) => { g.save(); g.strokeStyle = WH; g.lineWidth = 1.4 * S; g.beginPath(); g.arc(a.x, a.y, rad * S, 0, 7); g.stroke(); g.restore(); };
  const tick = (a, v, len = 12) => linea(add(a, v, -len * S / 2), add(a, v, len * S / 2), { w: 1.6 });
  const medida = (a, b, o = {}) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y), n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
    linea(a, b, o); tick(a, n); tick(b, n);
  };
  const etiqueta = (txt, a, align = "left", alt) => {
    const fs = Math.round(10.5 * S + 2);
    g.save(); g.font = "500 " + fs + "px Inter, system-ui, sans-serif";
    const tw = g.measureText(txt).width, px = 6 * S, h = fs + 8 * S;
    if (alt && align === "left" && a.x + tw + 2 * px > W - 4) { a = alt; align = "right"; }
    let x = align === "left" ? a.x : align === "right" ? a.x - tw - 2 * px : a.x - tw / 2 - px;
    x = Math.max(4, Math.min(W - tw - 2 * px - 4, x));
    const y = Math.max(4, Math.min(H - h - 4, a.y - h / 2));
    g.fillStyle = "rgba(18,24,30,.62)"; g.beginPath(); g.roundRect(x, y, tw + 2 * px, h, h / 2); g.fill();
    g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(txt, x + px, y + h / 2 + 0.5); g.restore();
  };
  const derecha = (i, j) => { const a = p(i), b = p(j); return (a.x - b.x) * r.x + (a.y - b.y) * r.y > 0 ? a : b; };
  return { g, W, H, S, k, p, q, d, r, A, B, add, linea, punto, aro, tick, medida, etiqueta, derecha };
}

export function dibujarBelleza(canvas, img, P, opt = {}) {
  const c = lienzo(canvas, img, P, marco(img, P, { pad: 0.45, ...opt }), opt.disp);
  const half = dist(c.p(234), c.p(454)) / 2;
  const nivel = (i) => c.add(c.p(i), c.r, 0);
  const lado = (i) => {
    const a = c.p(i), cen = c.add(c.p(168), c.d, ((a.x - c.p(168).x) * c.d.x + (a.y - c.p(168).y) * c.d.y));
    return c.add(cen, c.r, half + 16 * c.S);
  };
  for (const i of [9, 2, 152]) {
    const a = nivel(i), b = lado(i);
    c.linea(c.add(a, c.r, -(half * 0.95)), b, { w: 1.2, dash: [4, 5], color: "rgba(255,255,255,.7)" });
  }
  const t9 = lado(9), t2 = lado(2), t152 = lado(152);
  c.linea(t9, t152, { w: 1.6 });
  [t9, t2, t152].forEach(t => c.tick(t, c.r, 12));
  const lab = (a, b, txt) => { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; c.etiqueta(txt, c.add(m, c.r, 9 * c.S), "left", c.add(m, c.r, -(2 * half + 30 * c.S))); };
  lab(t9, t2, "Tercio medio"); lab(t2, t152, "Tercio inferior");
  c.linea(c.p(33), c.p(263), { w: 1.1, color: "rgba(255,255,255,.55)" });
  [33, 133, 362, 263].forEach(i => c.tick(c.p(i), c.d, 11));
  c.medida(c.p(172), c.p(397), { w: 1.6 });
  { const a = c.p(172), b = c.p(397); c.etiqueta("Mandíbula", c.add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, c.d, 15 * c.S), "center"); }
  [9, 2, 152, 172, 397, 61, 291].forEach(i => c.punto(c.p(i), 2.6));
}

export function dibujarForma(canvas, img, P, opt = {}) {
  const c = lienzo(canvas, img, P, marco(img, P, { pad: 0.42, ...opt }));
  const pts = OVAL.map(i => c.p(i)), n = pts.length, g = c.g;
  g.save(); g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 2 * c.S; g.lineJoin = "round"; g.beginPath();
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let s = mid(pts[n - 1], pts[0]); g.moveTo(s.x, s.y);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y); }
  g.closePath(); g.stroke(); g.restore();
  const anchos = [[54, 284, "Frente"], [234, 454, "Pómulos"], [172, 397, "Mandíbula"]];
  for (const [a, b, txt] of anchos) {
    c.medida(c.p(a), c.p(b), { w: 1.5, dash: [5, 4] });
    c.etiqueta(txt, c.add(c.derecha(a, b), c.r, 12 * c.S), "left");
  }
  c.medida(c.p(10), c.p(152), { w: 1.5, dash: [5, 4] });
  const top = c.p(10), bot = c.p(152);
  c.etiqueta("Largo", c.add(top, c.d, -16 * c.S), "center");
  [54, 284, 234, 454, 172, 397, 10, 152].forEach(i => c.punto(c.p(i), 3));
}

export function dibujarSimetria(canvas, img, P, opt = {}) {
  const c = lienzo(canvas, img, P, marco(img, P, { pad: 0.4, ...opt }));
  const ext = 0.16, L = { x: c.B.x - c.A.x, y: c.B.y - c.A.y };
  c.linea(c.add(c.A, L, -ext), c.add(c.B, L, ext * 0.6), { w: 1.6 });
  const a = c.A, b = c.B, dx = b.x - a.x, dy = b.y - a.y, dd = dx * dx + dy * dy;
  const espejo = (pt) => { const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / dd, fx = a.x + t * dx, fy = a.y + t * dy; return { x: 2 * fx - pt.x, y: 2 * fy - pt.y }; };
  const pares = [[105, 334], [33, 263], [133, 362], [98, 327], [61, 291], [234, 454], [172, 397], [58, 288]];
  for (const [i, j] of pares) {
    const pi = c.p(i), pj = c.p(j);
    const izq = (pi.x - pj.x) * c.r.x + (pi.y - pj.y) * c.r.y < 0 ? pi : pj, der = izq === pi ? pj : pi;
    const m = espejo(izq);
    if (dist(m, der) > 2 * c.S) c.linea(m, der, { w: 1.2, color: "rgba(255,255,255,.8)" });
    c.punto(izq, 2.6); c.punto(der, 2.6); c.aro(m, 5.5);
  }
}

export function dibujarColor(canvas, img, P, opt = {}) {
  const c = lienzo(canvas, img, P, marco(img, P, { pad: 0.4, ...opt }));
  [50, 101, 118, 205, 280, 330, 347, 425, 151, 108, 337].forEach(i => c.aro(c.p(i), 9));
  return c;
}

export function dibujarEdad(canvas, img, P, opt = {}) {
  const c = lienzo(canvas, img, P, marco(img, P, { pad: 0.4, ...opt }));
  c.g.save(); c.g.fillStyle = "rgba(255,255,255,.55)";
  P.forEach(pt => { const a = c.q(pt); c.g.beginPath(); c.g.arc(a.x, a.y, 1.15 * c.S, 0, 7); c.g.fill(); });
  c.g.restore();
}
