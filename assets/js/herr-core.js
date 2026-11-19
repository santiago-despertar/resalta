// Shared face math for the free tools (/herramientas). Everything runs in the browser.
// Landmarks come from MediaPipe Face Landmarker (478 points), converted to pixels before measuring.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const toPx = (L, w, h) => L.map(p => ({ x: p.x * w, y: p.y * h, z: p.z * w }));

function angle(a, o, b) {
  const v1 = { x: a.x - o.x, y: a.y - o.y }, v2 = { x: b.x - o.x, y: b.y - o.y };
  return Math.acos((v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))) * 180 / Math.PI;
}

// how turned the head is: 0 = straight at the camera
export function giro(P) {
  const W = dist(P[234], P[454]);
  return Math.abs(dist(P[1], P[234]) - dist(P[1], P[454])) / W;
}

// ---------- midline: least-squares line x = m*y + b through the centre points of the face
const MID = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 17, 18, 200, 199, 175, 152];
export function lineaMedia(P) {
  const pts = MID.map(i => P[i]), n = pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / n, mx = pts.reduce((s, p) => s + p.x, 0) / n;
  let num = 0, den = 0;
  pts.forEach(p => { num += (p.y - my) * (p.x - mx); den += (p.y - my) ** 2; });
  const m = num / den, b = mx - m * my;
  const a = { x: m * P[10].y + b, y: P[10].y }, c = { x: m * P[152].y + b, y: P[152].y };
  return { a, b: c, angulo: Math.atan(m) }; // angulo: tilt of the midline from vertical (radians)
}
function reflejar(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const fx = a.x + t * dx, fy = a.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}

// ---------- symmetry, by zone
export const ZONAS = {
  "Cejas": [[70, 300], [63, 293], [105, 334], [66, 296], [107, 336]],
  "Ojos": [[33, 263], [133, 362], [159, 386], [145, 374], [468, 473]],
  "Nariz": [[98, 327], [64, 294], [48, 278], [129, 358]],
  "Boca": [[61, 291], [37, 267], [84, 314], [40, 270]],
  "Pómulos": [[234, 454], [50, 280], [116, 345], [123, 352]],
  "Mandíbula": [[172, 397], [58, 288], [136, 365], [150, 379], [176, 400]],
};
const PESO_ZONA = { "Cejas": 0.14, "Ojos": 0.22, "Nariz": 0.16, "Boca": 0.16, "Pómulos": 0.14, "Mandíbula": 0.18 };
export const K_SIM = 0.09; // deviation (share of face width) that would score 0
export function simetria(P) {
  const W = dist(P[234], P[454]), m = lineaMedia(P);
  const zonas = Object.entries(ZONAS).map(([k, pares]) => {
    const dev = pares.reduce((s, [l, r]) => s + dist(P[l], reflejar(P[r], m.a, m.b)), 0) / pares.length / W;
    return { k, dev, v: clamp(100 * (1 - dev / K_SIM)) };
  });
  const total = zonas.reduce((s, z) => s + z.v * PESO_ZONA[z.k], 0);
  return { total, zonas, linea: m };
}

// ---------- face shape. MediaPipe fits every face to a similar mesh, so raw ratios vary little;
// shapes are read from how far each ratio sits from the average face (z-scores), calibrated on studio photos.
export const FORMAS = ["ovalado", "redondo", "cuadrado", "alargado", "corazon", "diamante"];
export function formaCara(P) {
  const W = dist(P[234], P[454]), H = dist(P[10], P[152]), F = dist(P[54], P[284]);
  const J = dist(P[172], P[397]), C = dist(P[176], P[400]);
  const ang = (angle(P[234], P[172], P[152]) + angle(P[454], P[397], P[152])) / 2;
  const z = { r: (H / W - 1.22) / 0.04, f: (F / W - 0.85) / 0.025, j: (J / W - 0.81) / 0.022, a: (ang - 133.5) / 3, c: (C / J - 0.40) / 0.013 };
  const s = {
    alargado: z.r * 1.1 - 0.2 * Math.abs(z.f - z.j),
    redondo: -z.r * 0.8 + z.a * 0.7 + 0.2 * z.j,
    cuadrado: -z.r * 0.4 + z.j * 0.9 - z.a * 0.8,
    corazon: z.f * 0.8 - z.j * 0.9 - z.c * 0.4,
    diamante: -z.f * 0.9 - z.j * 0.6 + 0.2 * z.r,
  };
  const orden = Object.entries(s).sort((a, b) => b[1] - a[1]);
  let forma = "ovalado", segunda = null;
  if (orden[0][1] >= 1.0) { forma = orden[0][0]; if (orden[1][1] >= 0.6) segunda = orden[1][0]; }
  else if (orden[0][1] >= 0.5) segunda = orden[0][0];
  return { forma, segunda, s, z, medidas: { largo: H * 1.08 / W, frente: F / W, mandibula: J / W, angulo: ang } };
}

// ---------- colour
function srgb2lab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  X = h(X); Y = h(Y); Z = h(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function lab2rgb([L, a, b]) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const f = (t) => t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;
  x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
  const g = (c) => 255 * (c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c);
  return [g(x * 3.2406 + y * -1.5372 + z * -0.4986), g(x * -0.9689 + y * 1.8758 + z * 0.0415), g(x * 0.0557 + y * -0.2040 + z * 1.0570)].map(v => Math.round(Math.max(0, Math.min(255, v))));
}
const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };

function muestras(ctx, centros, radio, W, H) {
  const px = [];
  centros.forEach(c => {
    const x0 = Math.max(0, Math.round(c.x - radio)), y0 = Math.max(0, Math.round(c.y - radio));
    const w = Math.min(W - x0, Math.round(radio * 2)), h = Math.min(H - y0, Math.round(radio * 2));
    if (w <= 0 || h <= 0) return;
    const d = ctx.getImageData(x0, y0, w, h).data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x - w / 2) ** 2 + (y - h / 2) ** 2 > radio * radio) continue;
      const i = (y * w + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]);
    }
  });
  return px;
}

export function colorimetria(img, P) {
  const W0 = img.width, H0 = img.height;
  const cv = document.createElement("canvas"); cv.width = W0; cv.height = H0;
  const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const FW = dist(P[234], P[454]);
  // white balance from the whites of the eyes (partial correction, lighting varies a lot in selfies)
  const esc = muestras(ctx, [
    { x: (P[33].x * 2 + P[468].x) / 3, y: (P[33].y * 2 + P[468].y) / 3 }, { x: (P[263].x * 2 + P[473].x) / 3, y: (P[263].y * 2 + P[473].y) / 3 },
    { x: (P[133].x * 2 + P[468].x) / 3, y: (P[133].y * 2 + P[468].y) / 3 }, { x: (P[362].x * 2 + P[473].x) / 3, y: (P[362].y * 2 + P[473].y) / 3 },
  ], FW * 0.008, W0, H0).sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2])).slice(0, 40);
  let gain = [1, 1, 1];
  if (esc.length > 8) {
    const m = [0, 1, 2].map(k => median(esc.map(p => p[k])));
    const avg = (m[0] + m[1] + m[2]) / 3;
    if (avg > 90) gain = m.map(v => 1 + 0.6 * (avg / Math.max(1, v) - 1));
  }
  const lab = (pxs) => pxs.map(p => srgb2lab(Math.min(255, p[0] * gain[0]), Math.min(255, p[1] * gain[1]), Math.min(255, p[2] * gain[2])));
  // skin: cheeks and forehead, without shadows or shine
  let piel = lab(muestras(ctx, [50, 101, 118, 205, 280, 330, 347, 425, 151, 108, 337].map(i => P[i]), FW * 0.03, W0, H0));
  const Ls = piel.map(p => p[0]), lo = median(Ls) - 12, hi = median(Ls) + 10;
  piel = piel.filter(p => p[0] > lo && p[0] < hi);
  const skin = [0, 1, 2].map(k => median(piel.map(p => p[k])));
  const hue = Math.atan2(skin[2], skin[1]) * 180 / Math.PI, chroma = Math.hypot(skin[1], skin[2]);
  // brows (closest proxy to hair colour in a face photo) and iris
  const cejas = lab(muestras(ctx, [70, 63, 105, 66, 107, 300, 293, 334, 296, 336].map(i => P[i]), FW * 0.012, W0, H0)).map(p => p[0]).sort((a, b) => a - b);
  const browL = cejas[Math.floor(cejas.length * 0.3)] ?? skin[0];
  const rIris = Math.max(2, (dist(P[469], P[471]) + dist(P[474], P[476])) / 4 * 0.6);
  const iris = lab(muestras(ctx, [P[468], P[473]], rIris, W0, H0)).sort((a, b) => a[0] - b[0]);
  const irisMid = iris.slice(Math.floor(iris.length * 0.25), Math.floor(iris.length * 0.85));
  const eye = [0, 1, 2].map(k => median(irisMid.map(p => p[k])));
  const contraste = skin[0] - Math.min(browL, eye[0]);
  const rgb = lab2rgb(skin);
  return { skin, rgb, hue, chroma, browL, eye, contraste, gain, gris: chroma < 5 };
}

// season from the colour reading. t: warm(+)/cool(-), v: light(+)/deep(-), k: contrast, s: brightness
export function estacion(c) {
  const t = (c.hue - 55) / 6, v = (c.skin[0] - 66) / 8, k = (c.contraste - 56) / 8, s = (c.chroma - 17) / 5;
  let est, sub;
  if (t > 0) {
    est = (v > 0.3 && k < 0.6) ? "primavera" : "otono";
    if (est === "primavera") sub = Math.abs(v) >= Math.abs(t) && Math.abs(v) >= Math.abs(s) ? "clara" : (s > Math.abs(t) ? "brillante" : "calida");
    else sub = -v >= Math.max(t, Math.abs(s)) ? "profundo" : (s < -0.3 && -s > t && k < 0.3 ? "suave" : "calido");
  } else {
    est = (k > 0.3 || v < -0.5) ? "invierno" : "verano";
    if (est === "invierno") sub = -v >= Math.max(-t, k) ? "profundo" : (k > -t ? "brillante" : "frio");
    else sub = v >= Math.max(-t, -s) ? "claro" : (-s > -t ? "suave" : "frio");
  }
  const tono = t > 0.5 ? "calido" : t < -0.5 ? "frio" : t > 0 ? "neutro_c" : "neutro_f";
  const nivel = k > 0.5 ? "alto" : k < -0.5 ? "bajo" : "medio";
  return { est, sub, tono, nivel, t, v, k, s };
}
