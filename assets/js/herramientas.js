// Free tools (/herramientas/*). One controller for every tool: the page says which one with <main data-tool="...">.
// Each tool measures its own thing in the browser (face shape, symmetry, colors, visual age). The beauty test and the
// "send it to my email" step of every tool use the same AI rating as /calificacion (calificar function, 0-10, where 5 is
// the average): only then a face crop is sent, and it is not stored.
import * as H from "./herr-core.js";
import * as D from "./herr-dibujo.js";

const $ = (s, r = document) => r.querySelector(s);
const main = $("main[data-tool]");
const TOOL = main ? main.dataset.tool : null;
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const espera = ms => new Promise(r => setTimeout(r, ms));
function track(ev, extra) {
  try { if (window.resaltaTrack) window.resaltaTrack(ev, Object.assign({ herramienta: TOOL }, extra || {})); } catch (e) {}
  try { if (window.gtag) window.gtag("event", ev, Object.assign({ herramienta: TOOL }, extra || {})); } catch (e) {}
}

// ---------- step navigation
const pasos = [...document.querySelectorAll(".cal-paso")];
function ir(p) {
  pasos.forEach(x => x.classList.toggle("on", x.dataset.p === p));
  const panel = $(".tool-hero .panel");
  if (panel) { const y = panel.getBoundingClientRect().top + scrollY - 90; if (Math.abs(scrollY - y) > 40) scrollTo({ top: y, behavior: "smooth" }); }
}
const msg = $("#toolMsg");
function say(t) { if (msg) { msg.textContent = t; msg.className = "msg show err"; } }

// =====================================================================
// Body shape: a short form, no photo
// =====================================================================
if (TOOL === "cuerpo") initCuerpo();
else if (TOOL) initFoto();

// =====================================================================
// Photo tools
// =====================================================================
let img = null, landmarker = null, L = null, P = null;

function initFoto() {
  const file = $("#toolFile"), adult = $("#toolAdult"), go = $("#toolGo");
  const ready = () => { go.disabled = !(img && adult.checked); };
  adult.addEventListener("change", ready);

  async function usar(f) {
    img = await createImageBitmap(f); _cal = null;
    const slot = $("#toolDrop");
    let p = slot.querySelector(":scope > img"); if (!p) { p = document.createElement("img"); slot.prepend(p); }
    p.src = URL.createObjectURL(f); slot.classList.add("done");
    $("#camBtn").textContent = "Tomar otra con mi cámara";
    getLandmarker().catch(() => {});
    if (TOOL === "edad") cargarEdad().catch(() => {});
    ready();
  }
  file.addEventListener("change", () => {
    msg.className = "msg";
    const f = file.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return say("Ese archivo no es una imagen.");
    usar(f);
  });

  // camera
  const camBox = $("#camBox"), camVideo = $("#camVideo");
  let camStream = null;
  const cerrarCam = () => { if (camStream) camStream.getTracks().forEach(t => t.stop()); camStream = null; camBox.hidden = true; file.disabled = false; };
  $("#camBtn").addEventListener("click", async () => {
    msg.className = "msg";
    if (!navigator.mediaDevices?.getUserMedia) return say("Tu navegador no deja usar la cámara. Sube una foto.");
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }); }
    catch (e) { return say(e.name === "NotAllowedError" ? "Necesitamos permiso para usar tu cámara. Actívalo en tu navegador o sube una foto." : "No encontramos una cámara. Sube una foto."); }
    file.disabled = true; camVideo.srcObject = camStream; camBox.hidden = false;
    await camVideo.play().catch(() => {});
    $("#toolDrop").scrollIntoView({ behavior: "smooth", block: "center" });
    getLandmarker().catch(() => {});
    if (TOOL === "edad") cargarEdad().catch(() => {});
  });
  $("#camX").addEventListener("click", (e) => { e.preventDefault(); cerrarCam(); });
  $("#camShot").addEventListener("click", (e) => {
    e.preventDefault();
    const w = camVideo.videoWidth, h = camVideo.videoHeight; if (!w) return;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.translate(w, 0); g.scale(-1, 1); g.drawImage(camVideo, 0, 0, w, h);
    c.toBlob(b => { cerrarCam(); if (b) usar(b); }, "image/jpeg", 0.92);
  });

  go.addEventListener("click", async () => {
    if (!img || !adult.checked) return;
    go.disabled = true; const t0 = go.textContent; go.textContent = "Preparando…"; msg.className = "msg";
    try {
      const lm = await getLandmarker();
      const faces = lm.detect(img).faceLandmarks || [];
      if (!faces.length) throw new Error("noface");
      if (faces.length > 1) throw new Error("many");
      L = faces[0]; P = H.toPx(L, img.width, img.height);
      if (H.giro(P) > 0.16) throw new Error("turned");
      // the age model, or the AI rating for the beauty test, runs while the scan plays
      const pre = TOOL === "edad" ? edadPrep() : TOOL === "belleza" ? calificarIA() : null;
      if (pre) pre.catch(() => {});
      await procesar();
      const res = await RESULTADOS[TOOL](pre);
      track("herramienta_resultado", res && res.evento);
      ir("resultado");
    } catch (e) {
      ir("foto");
      const t = { foto_mala: "Tu cara no se ve bien en esta foto, así que la calificación no saldría justa. Usa una foto de frente, nítida, con buena luz y sin filtros.", sin_cara: "No encontramos una cara en la foto. Prueba con una foto de frente y buena luz.", menor: "Esta herramienta es solo para mayores de 18 años.", limitado: "Hiciste varias calificaciones seguidas. Vuelve a intentarlo en una hora.", noface: "No encontramos una cara en la foto. Prueba con una foto de frente y buena luz.", many: "Hay más de una cara en la foto. Usa una foto donde solo salgas tú.", turned: "Tu cara está muy girada. Mira directo a la cámara y vuelve a intentar.", gris: "La foto parece en blanco y negro o con filtro. Usa una foto a color, sin filtros.", edad: "No pudimos calcular tu edad visual con esta foto. Prueba con otra de frente y con buena luz." }[e.message];
      say(t || "No pudimos analizar la foto. Revisa tu conexión e inténtalo de nuevo.");
    } finally { go.disabled = false; go.textContent = t0; }
  });

  $("#leadForm")?.addEventListener("submit", enviarLead);
  document.querySelectorAll("[data-otra]").forEach(b => b.addEventListener("click", () => { ir("foto"); }));
}

async function getLandmarker() {
  if (landmarker) return landmarker;
  const { FaceLandmarker, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
  const fs = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(fs, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
    runningMode: "IMAGE", numFaces: 2
  });
  return landmarker;
}

async function procesar() {
  ir("proceso");
  const c = $("#scanCanvas"), W = Math.min(720, img.width), Hh = Math.round(img.height * W / img.width);
  c.width = W; c.height = Hh;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, W, Hh);
  const items = [...document.querySelectorAll("#calPasos li")];
  items.forEach(li => li.className = "");
  for (let i = 0; i < items.length; i++) {
    items[i].className = "act";
    if (i === 0) {
      g.fillStyle = "rgba(255,255,255,.85)";
      for (let k = 0; k < L.length; k += 3) { g.beginPath(); g.arc(L[k].x * W, L[k].y * Hh, Math.max(1, W / 420), 0, 7); g.fill(); if (k % 45 === 0) await espera(16); }
    } else await espera(800 + Math.random() * 350);
    items[i].className = "ok";
  }
  await espera(250);
}

// =====================================================================
// Results, one per tool
// =====================================================================
const RESULTADOS = {
  // the same AI rating as /calificacion: the overall number is shown, the zones go by email
  belleza: async (pre) => {
    const c = await pre;
    dibujarPuntaje($("#resCanvas"));
    $("#resScore").textContent = c.general.toFixed(1);
    $("#resVerdict").textContent = nivel(c.general) + (nivel(c.general) === "En el promedio" ? ", donde está la mayoría de la gente." : ". 5 es el promedio.");
    $("#resRows").innerHTML = ZONAS.map(([, k]) => `<div class="report-row"><span>${k}</span><b class="mono cal-borroso">8.8</b></div>`).join("");
    let nf = $("#resFotoNota");
    if (!nf) { $("#resRows").insertAdjacentHTML("beforebegin", '<div class="tool-tips" id="resFotoNota" style="margin:4px 0 16px"></div>'); nf = $("#resFotoNota"); }
    nf.innerHTML = notaFotosHTML(c.nota_fotos); nf.hidden = !nf.innerHTML;
    return { evento: { score: c.general } };
  },

  forma: async () => {
    const f = H.formaCara(P), info = FORMAS[f.forma];
    D.dibujarForma($("#resCanvas"), img, P);
    $("#resNombre").textContent = info.nombre;
    $("#resDesc").textContent = info.desc + (f.segunda ? ` También tiene rasgos de cara ${FORMAS[f.segunda].corto}.` : "");
    const pct = (v) => Math.round(v * 100) + "%";
    $("#resRows").innerHTML = [
      ["Largo contra ancho", f.medidas.largo.toFixed(2) + " a 1"],
      ["Frente contra pómulos", pct(f.medidas.frente)],
      ["Mandíbula contra pómulos", pct(f.medidas.mandibula)],
      ["Ángulo de la mandíbula", Math.round(f.medidas.angulo) + "°"],
    ].map(([k, v]) => `<div class="report-row"><span>${k}</span><b class="mono">${v}</b></div>`).join("");
    $("#resTips").innerHTML = [["Cortes de pelo", info.cortes], ["Lentes", info.lentes], ["Cejas", info.cejas], ["Barba y aretes", info.extra]]
      .map(([k, v]) => `<div><b>${k}</b><p>${esc(v)}</p></div>`).join("");
    return { evento: { forma: f.forma } };
  },

  simetria: async () => {
    const s = H.simetria(P);
    D.dibujarSimetria($("#resCanvas"), img, P);
    nota("Cada círculo marca dónde estaría ese punto si tu cara fuera idéntica de los dos lados. Entre más cerca del punto, más simétrica es esa zona.");
    const total = Math.round(s.total);
    $("#resScore").textContent = total;
    $("#resVerdict").textContent = total >= 92 ? "Muy simétrica" : total >= 85 ? "Simétrica" : total >= 78 ? "Simetría media" : "Con diferencias visibles entre lados";
    $("#resRows").innerHTML = s.zonas.map(z => `<div class="report-row"><span>${z.k}</span><b class="mono">${Math.round(z.v)}%</b><span class="bar"><i style="width:${Math.round(z.v)}%"></i></span></div>`).join("");
    espejos(s.linea);
    return { evento: { simetria: total } };
  },

  color: async () => {
    const c = H.colorimetria(img, P);
    if (c.gris) throw new Error("gris");
    const e = H.estacion(c), key = e.est + "_" + e.sub, info = PALETAS[key];
    D.dibujarColor($("#resCanvas"), img, P);
    nota("Los círculos son las zonas donde medimos el color de tu piel, tus ojos y tus cejas.");
    $("#resNombre").textContent = info.nombre;
    $("#resDesc").textContent = info.desc;
    $("#resPiel").innerHTML = `<i style="background:rgb(${c.rgb.join(",")})"></i><p>Subtono <b>${{ calido: "cálido", frio: "frío", neutro_c: "neutro tirando a cálido", neutro_f: "neutro tirando a frío" }[e.tono]}</b> · contraste <b>${e.nivel}</b><br><span style="opacity:.8">Metales: ${e.tono === "calido" ? "dorado y cobre" : e.tono === "frio" ? "plateado y oro blanco" : e.tono === "neutro_c" ? "dorado, y también plateado" : "plateado, y también dorado"}</span></p>`;
    $("#resPaleta").innerHTML = info.sí.map(h => `<i style="background:${h}" title="${h}"></i>`).join("");
    $("#resEvita").innerHTML = info.no.map(h => `<i style="background:${h}" title="${h}"></i>`).join("");
    $("#resTips").innerHTML = [["Ropa", info.ropa], ["Cabello", info.pelo], ["Maquillaje y lentes", info.make]].map(([k, v]) => `<div><b>${k}</b><p>${esc(v)}</p></div>`).join("");
    return { evento: { estacion: key } };
  },

  edad: async (pre) => {
    const r = await pre;
    if (!r) throw new Error("edad");
    const est = Math.round(r.edad), lo = Math.max(18, est - 2), hi = Math.max(lo + 3, est + 2);
    D.dibujarEdad($("#resCanvas"), img, P);
    nota("Estos son los 478 puntos de tu cara que usamos para leer tu foto.");
    $("#resScore").textContent = `${lo}–${hi}`.replace("–", " a ");
    const real = parseInt($("#toolEdadReal")?.value, 10);
    let txt = "Esta es la edad que suele leer la gente al verte en una foto.";
    if (real >= 18 && real <= 99) {
      const dif = est - real;
      txt = dif <= -2 ? `Aparentas unos ${-dif} años menos que tu edad real.`
        : dif >= 2 ? `Tu foto se lee unos ${dif} años mayor que tu edad real. La piel, la zona de los ojos, el cabello y la luz de la foto son lo que más influye, y casi todo se trabaja con hábitos.`
        : "Aparentas más o menos tu edad real.";
    }
    $("#resVerdict").textContent = txt;
    return { evento: { edad: est } };
  },
};

// ---------- symmetry: the two "same side" faces
function espejos(linea) {
  const a = linea.a, b = linea.b, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const fw = H.dist(P[234], P[454]), fh = H.dist(P[10], P[152]);
  const cw = Math.round(Math.min(600, fw * 1.25)), sc = cw / (fw * 1.25), ch = Math.round(fh * 1.45 * sc);
  const phi = Math.atan2(b.x - a.x, b.y - a.y);
  const A = document.createElement("canvas"); A.width = cw; A.height = ch;
  const g = A.getContext("2d");
  g.translate(cw / 2, ch / 2); g.rotate(phi); g.scale(sc, sc); g.drawImage(img, -cx, -cy);
  const hacer = (cv, izq) => {
    cv.width = cw; cv.height = ch; const x = cv.getContext("2d");
    if (izq) {
      x.drawImage(A, 0, 0, cw / 2, ch, 0, 0, cw / 2, ch);
      x.save(); x.translate(cw, 0); x.scale(-1, 1); x.drawImage(A, 0, 0, cw / 2, ch, 0, 0, cw / 2, ch); x.restore();
    } else {
      x.drawImage(A, cw / 2, 0, cw / 2, ch, cw / 2, 0, cw / 2, ch);
      x.save(); x.translate(cw, 0); x.scale(-1, 1); x.drawImage(A, cw / 2, 0, cw / 2, ch, cw / 2, 0, cw / 2, ch); x.restore();
    }
  };
  hacer($("#resIzq"), true); hacer($("#resDer"), false);
}

// ---------- visual age: face-api age model, averaged over flips and crops so one bad crop does not decide it
let faceapi = null;
async function cargarEdad() {
  if (faceapi) return faceapi;
  const mod = await import("https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js");
  const M = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";
  await Promise.all([mod.nets.ssdMobilenetv1.loadFromUri(M), mod.nets.ageGenderNet.loadFromUri(M)]);
  faceapi = mod; return mod;
}
async function edadPrep() {
  try {
    const fa = await cargarEdad();
    const c0 = document.createElement("canvas"); c0.width = img.width; c0.height = img.height; c0.getContext("2d").drawImage(img, 0, 0);
    const det = await fa.detectSingleFace(c0, new fa.SsdMobilenetv1Options({ minConfidence: 0.4 }));
    if (!det) return null;
    const b = det.box, ages = [];
    for (const [sc, fl, dx, dy] of [[1, 0, 0, 0], [1, 1, 0, 0], [1.25, 0, 0, 0], [1.25, 1, 0, 0], [1.5, 0, 0, .05], [1.5, 1, 0, .05], [1.15, 0, .04, 0], [1.15, 1, -.04, 0]]) {
      const s = Math.max(b.width, b.height) * sc, cx = b.x + b.width / 2 + dx * b.width, cy = b.y + b.height / 2 + dy * b.height;
      const c = document.createElement("canvas"); c.width = c.height = 224; const g = c.getContext("2d");
      if (fl) { g.translate(224, 0); g.scale(-1, 1); }
      g.drawImage(c0, cx - s / 2, cy - s / 2, s, s, 0, 0, 224, 224);
      const r = await fa.nets.ageGenderNet.predictAgeAndGender(c); ages.push(r.age);
    }
    ages.sort((x, y) => x - y);
    return { edad: (ages[3] + ages[4]) / 2 };
  } catch (e) { return null; }
}

// ---------- the AI rating (same as /calificacion), for the beauty test and for the email
const ZONAS = [
  ["proporciones", "Proporciones", "El volumen del cabello y la forma de la barba cambian cómo se perciben las proporciones de tu cara."],
  ["ojos", "Ojos", "La forma de tus cejas, el descanso y la piel alrededor de los ojos cambian mucho tu mirada."],
  ["nariz", "Nariz", "El corte, la barba y las cejas pueden equilibrar visualmente la nariz con el resto de la cara."],
  ["boca", "Boca y labios", "Hidratación, cuidado de los labios y una barba bien recortada mejoran cómo se ve tu boca."],
  ["mandibula", "Mandíbula y mentón", "Menos grasa facial, postura de cuello y una barba bien definida marcan la mandíbula."],
  ["simetria", "Simetría", "Pequeñas asimetrías se notan menos con el corte, la barba y la postura correctos."]
];
const nivel = v => v < 4.5 ? "Por debajo del promedio" : v < 5.5 ? "En el promedio" : v < 6.5 ? "Arriba del promedio" : v < 7.5 ? "Atractivo" : v < 8.5 ? "Muy atractivo" : "Excepcional";
// the face with some margin, without lines: what the AI looks at
function recorte() {
  const xs = P.map(q => q.x), ys = P.map(q => q.y);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const pw = (bx1 - bx0) * 0.6, ph = (by1 - by0) * 0.55;
  const x0 = Math.max(0, bx0 - pw), x1 = Math.min(img.width, bx1 + pw), y0 = Math.max(0, by0 - ph), y1 = Math.min(img.height, by1 + ph * 0.6);
  const k = Math.min(1, 900 / Math.max(x1 - x0, y1 - y0)), W = Math.round((x1 - x0) * k), Hh = Math.round((y1 - y0) * k);
  const c = document.createElement("canvas"); c.width = W; c.height = Hh;
  c.getContext("2d").drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, W, Hh);
  return c.toDataURL("image/jpeg", 0.88);
}
let _cal = null;
async function calificarIA() {
  if (_cal) return _cal;
  const C = window.RESALTA || {};
  const r = await fetch(`${C.SUPABASE_URL}/functions/v1/calificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${C.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ fotos: [recorte()] }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.limitado) throw new Error("limitado");
  if (j.motivo) throw new Error(j.motivo);
  if (!r.ok || !j.ok) throw new Error("ia");
  _cal = j; return j;
}
function notaFotosHTML(nota) {
  // the AI flags photos that make a face look worse than it is; the person is told so, with how to take a better one
  const t = String(nota || "").trim().replace(/[.\s]+$/, "");
  if (!t) return "";
  const e = s => s.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  return `<div><b>Un comentario sobre tu foto</b><p>${e(t)}. Eso suele bajar la calificación unas décimas. Para la más justa, toma otra con luz de frente, el celular a la altura de tus ojos y a un brazo de distancia o más, y la cara relajada.</p></div>`;
}
function dibujarPuntaje(canvas) { D.dibujarBelleza(canvas, img, P, { disp: 260 }); }
function nota(t) {
  let n = $("#resCanvasNota");
  if (!n) { $("#resCanvas").insertAdjacentHTML("afterend", '<p class="hint" id="resCanvasNota" style="margin:-8px 0 16px;font-size:13px"></p>'); n = $("#resCanvasNota"); }
  n.textContent = t;
}
function fotoCorreo() {
  try {
    const c = document.createElement("canvas"); dibujarPuntaje(c);
    const W = Math.min(600, c.width), Hh = Math.round(c.height * W / c.width);
    const o = document.createElement("canvas"); o.width = W; o.height = Hh;
    o.getContext("2d").drawImage(c, 0, 0, W, Hh);
    return o.toDataURL("image/jpeg", 0.82);
  } catch (e) { return null; }
}

async function enviarLead(ev) {
  ev.preventDefault();
  const f = ev.target, m2 = $("#leadMsg"), b = f.querySelector("button");
  const nombre = f.nombre.value.trim().slice(0, 60), email = f.email.value.trim().toLowerCase();
  m2.className = "msg";
  if (!nombre) { m2.textContent = "Escribe tu nombre."; m2.className = "msg show err"; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { m2.textContent = "Escribe un correo válido."; m2.className = "msg show err"; return; }
  const C = window.RESALTA || {};
  b.disabled = true; const t0 = b.textContent; b.textContent = "Enviando…";
  try {
    const cal = await calificarIA();
    const parts = ZONAS.map(([id, k, tip]) => ({ k, tip, v: Number((cal.zonas || {})[id]) || 0 }));
    const r = await fetch(`${C.SUPABASE_URL}/functions/v1/resultado-gratis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${C.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        nombre, email, score: cal.general, cal_id: cal.id,
        partes: parts.map(p => ({ k: p.k, v: p.v, tip: p.tip })),
        vid: (() => { try { return (localStorage.getItem("rs_vid") || "").slice(0, 40) || null; } catch (e) { return null; } })(),
        foto: fotoCorreo(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (j.limitado) {
      m2.textContent = `Ya te mandamos ${j.max || 3} resultados a este correo hoy. Revisa tu bandeja (y spam) o vuelve a intentarlo mañana.`;
      m2.className = "msg show err"; return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const metodo = "herramienta_" + TOOL;
    try { if (window.resaltaTrack) window.resaltaTrack("generate_lead", { method: metodo, score: cal.general }); } catch (e) {}
    try { if (window.gtag) window.gtag("event", "generate_lead", { method: metodo }); } catch (e) {}
    try { if (window.fbq) window.fbq("track", "Lead", { content_name: metodo }); } catch (e) {}
    try { sessionStorage.setItem("resalta_lead", JSON.stringify({ nombre, email })); } catch (e) {}
    document.querySelectorAll("[data-cal-nombre]").forEach(e => { e.textContent = nombre.split(/\s+/)[0]; });
    document.querySelectorAll("[data-cal-email]").forEach(e => { e.textContent = email; });
    ir("gracias");
  } catch (e) {
    const t = { foto_mala: "Tu cara no se ve bien en esta foto, así que la calificación no saldría justa. Prueba con otra foto de frente, nítida y con buena luz.", sin_cara: "No encontramos bien tu cara en esta foto. Prueba con otra de frente.", menor: "La calificación es solo para mayores de 18 años.", limitado: "Hiciste varias calificaciones seguidas. Vuelve a intentarlo en una hora." }[e.message];
    m2.textContent = t || "No pudimos enviarlo. Revisa tu correo e inténtalo de nuevo."; m2.className = "msg show err";
  } finally { b.disabled = false; b.textContent = t0; }
}

// =====================================================================
// Body shape
// =====================================================================
function initCuerpo() {
  let sexo = "mujer";
  const opts = [...document.querySelectorAll("[data-sexo]")];
  const pinta = () => {
    opts.forEach(o => o.classList.toggle("on", o.dataset.sexo === sexo));
    document.querySelectorAll("[data-solo]").forEach(e => { e.hidden = e.dataset.solo !== sexo; });
  };
  opts.forEach(o => o.addEventListener("click", () => { sexo = o.dataset.sexo; pinta(); }));
  pinta();
  $("#cuerpoForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const n = (id) => parseFloat(String($(id).value).replace(",", "."));
    const B = n(sexo === "mujer" ? "#cBusto" : "#cPecho"), W = n("#cCintura"), Hc = n("#cCadera");
    if (![B, W, Hc].every(v => v >= 40 && v <= 250)) return say("Escribe tus medidas en centímetros, entre 40 y 250.");
    msg.className = "msg";
    const tipo = sexo === "mujer" ? cuerpoMujer(B, W, Hc) : cuerpoHombre(B, W, Hc), info = CUERPOS[tipo];
    $("#resNombre").textContent = info.nombre;
    $("#resDesc").textContent = info.desc;
    const r = (a, b) => (a / b).toFixed(2);
    $("#resRows").innerHTML = [
      [sexo === "mujer" ? "Busto contra cadera" : "Pecho contra cadera", r(B, Hc)],
      [sexo === "mujer" ? "Cintura contra busto" : "Pecho contra cintura", sexo === "mujer" ? r(W, B) : r(B, W)],
      ["Cintura contra cadera", r(W, Hc)],
    ].map(([k, v]) => `<div class="report-row"><span>${k}</span><b class="mono">${v}</b></div>`).join("");
    $("#resTips").innerHTML = [["Arriba", info.arriba], ["Abajo", info.abajo], ["Qué evitar", info.evita]].map(([k, v]) => `<div><b>${k}</b><p>${esc(v)}</p></div>`).join("");
    track("herramienta_resultado", { cuerpo: tipo });
    ir("resultado");
  });
  document.querySelectorAll("[data-otra]").forEach(b => b.addEventListener("click", () => ir("foto")));
}
function cuerpoMujer(B, W, Hc) {
  const mx = Math.max(B, Hc), mn = Math.min(B, Hc);
  if (W >= 0.92 * mx) return "ovalado";
  if ((Hc - B) / Hc > 0.05) return "triangulo";
  if ((B - Hc) / B > 0.05) return "triangulo_inv";
  return W <= 0.75 * mn ? "reloj" : "rectangulo";
}
function cuerpoHombre(C, W, Hc) {
  if (W >= C) return "ovalado_h";
  if ((Hc - C) / Hc > 0.05) return "triangulo_h";
  if (C / W >= 1.25) return "v";
  if (C / W >= 1.1) return "trapecio";
  return "rectangulo_h";
}

// =====================================================================
// Content
// =====================================================================
const FORMAS = {
  ovalado: { nombre: "Ovalada", corto: "ovalada", desc: "Tu cara es un poco más larga que ancha, con la frente algo más ancha que la mandíbula y una línea suave hacia la barbilla. Es la forma más versátil.", cortes: "Casi cualquier corte te funciona. Puedes jugar con volumen arriba, flequillo o raya de lado sin perder el equilibrio.", lentes: "Casi todos los armazones. Los cuadrados o rectangulares agregan definición.", cejas: "Arco suave y natural que siga tu forma.", extra: "Barba corta y pareja. Aretes de cualquier forma." },
  redondo: { nombre: "Redonda", corto: "redonda", desc: "El largo y el ancho de tu cara son parecidos, con mejillas llenas y una mandíbula de ángulos suaves.", cortes: "Volumen arriba con lados más cortos, o capas largas que caigan por debajo de la barbilla. Las dos cosas alargan la cara.", lentes: "Armazones rectangulares o con ángulos, más anchos que altos.", cejas: "Con arco marcado y un poco elevado, para sumar altura.", extra: "Barba más larga en el mentón que en las mejillas. Aretes largos o colgantes." },
  cuadrado: { nombre: "Cuadrada", corto: "cuadrada", desc: "Tu frente, tus pómulos y tu mandíbula tienen un ancho parecido, con ángulos de mandíbula marcados.", cortes: "Capas y textura que suavicen los lados. En hombre, laterales cortos con algo de altura arriba.", lentes: "Redondos u ovalados, para contrastar los ángulos.", cejas: "Curvas suaves, sin ángulos duros.", extra: "Barba corta que siga la mandíbula o un poco redondeada en el mentón. Aretes redondos o de aro." },
  alargado: { nombre: "Alargada", corto: "alargada", desc: "Tu cara es claramente más larga que ancha, con frente, pómulos y mandíbula de ancho parecido.", cortes: "Volumen a los lados y flequillo o raya de lado para acortar visualmente. Mejor evitar mucho volumen arriba.", lentes: "Armazones grandes y con altura, cuadrados o tipo aviador.", cejas: "Rectas o con arco bajo, para ensanchar.", extra: "Barba más llena en las mejillas para sumar ancho. Aretes cortos y anchos." },
  corazon: { nombre: "Corazón", corto: "de corazón", desc: "Tu frente y tus pómulos son más anchos que la mandíbula, que termina en una barbilla más fina.", cortes: "Volumen de la barbilla hacia abajo, raya de lado y flequillo ligero.", lentes: "Armazones más anchos abajo, ovalados o con la parte de arriba ligera.", cejas: "Arco suave y redondeado.", extra: "Barba que sume volumen en el mentón. Aretes que se ensanchen hacia abajo." },
  diamante: { nombre: "Diamante", corto: "de diamante", desc: "Tus pómulos son la parte más ancha de tu cara, con la frente y la mandíbula más estrechas.", cortes: "Flequillo o volumen en la frente y a la altura de la mandíbula, para equilibrar los pómulos.", lentes: "Ovalados o con detalle en la parte de arriba, como el ojo de gato.", cejas: "Curvas, con el arco ligeramente hacia afuera.", extra: "Barba con algo de volumen en el mentón. Aretes que caigan a la altura de la mandíbula." },
};

const PALETAS = {
  primavera_clara: { nombre: "Primavera clara", desc: "Tus colores son claros y cálidos: tonos suaves con un toque dorado que iluminan tu cara sin endurecerla.", sí: ["#FFE5B4", "#F7CAC9", "#F4A988", "#F3E5AB", "#AEE0D7", "#9AD3DE", "#B5D99C", "#E6C27A", "#C9B3E6", "#FFF5E1"], no: ["#000000", "#4B0082", "#2F4F4F", "#800020"], ropa: "Colores claros y cálidos cerca de la cara: melocotón, marfil, aqua y coral suave. El negro total te endurece; cámbialo por camel claro o azul marino suave.", pelo: "Rubios dorados, miel y castaños claros cálidos.", make: "Base de subtono cálido, rubor durazno, labial coral o rosa cálido. Armazones dorados, carey claro o tonos miel." },
  primavera_calida: { nombre: "Primavera cálida", desc: "Tu color es cálido y luminoso. Los tonos con base amarilla y dorada son los que mejor te sientan.", sí: ["#FFB347", "#FF7F50", "#F4C430", "#9ACD32", "#40E0D0", "#E2725B", "#C19A6B", "#FFDAB9", "#6B8E23", "#FFF3D6"], no: ["#000000", "#708090", "#C0C0C0", "#FF00FF"], ropa: "Coral, mandarina, verde lima, turquesa y camel. Los grises fríos y el negro te apagan.", pelo: "Cobrizos, miel, dorados y castaños con reflejos cálidos.", make: "Bronceador en lugar de contorno gris, rubor coral y labiales durazno o terracota claro. Armazones dorados o carey." },
  primavera_brillante: { nombre: "Primavera brillante", desc: "Tienes color cálido con mucho contraste, así que te favorecen los tonos vivos y limpios.", sí: ["#FF5A36", "#FFC000", "#00A693", "#2E86DE", "#F7786B", "#50C878", "#FF8C00", "#40E0D0", "#FFFDD0", "#E4002B"], no: ["#808080", "#BC8F8F", "#696969", "#D8BFD8"], ropa: "Colores vivos y claros: rojo coral, verde esmeralda, azul brillante y amarillo. Los tonos apagados o grisáceos te restan luz.", pelo: "Castaños dorados intensos y cobrizos brillantes.", make: "Labiales vivos como coral o rojo cálido, rubor durazno y delineado marcado. Armazones dorados o de color." },
  verano_claro: { nombre: "Verano claro", desc: "Tu color es claro y frío, con poco contraste. Los tonos suaves con base azul o rosa te iluminan.", sí: ["#B0C4DE", "#E6E6FA", "#F4C2C2", "#AFEEEE", "#D8BFD8", "#C1E1C1", "#87CEEB", "#B39EB5", "#FADADD", "#DCDCDC"], no: ["#000000", "#FF8C00", "#8B4513", "#FFD700"], ropa: "Pasteles fríos: azul cielo, lavanda, rosa claro y gris perla. El negro y los naranjas te endurecen.", pelo: "Rubios cenizos, castaños claros sin reflejos dorados.", make: "Rubor rosa, labiales rosa suave o malva. Armazones plateados, transparentes o gris claro." },
  verano_frio: { nombre: "Verano frío", desc: "Tu subtono es claramente frío y tu contraste medio. Te favorecen los azules, rosas y morados suaves.", sí: ["#4682B4", "#6A5ACD", "#DB7093", "#5F9EA0", "#708090", "#B0E0E6", "#C71585", "#483D8B", "#E0B0FF", "#F5F5F5"], no: ["#FF8C00", "#FFDB58", "#C19A6B", "#8B4513"], ropa: "Azul acero, frambuesa, lavanda y gris azulado. Los tonos cálidos como mostaza o camel te ponen amarilla la piel.", pelo: "Castaños fríos y cenizos, sin reflejos cobrizos.", make: "Labiales frambuesa o rosa frío, rubor rosado. Armazones plateados, gris o azul." },
  verano_suave: { nombre: "Verano suave", desc: "Tu color es fresco y apagado: te favorecen los tonos empolvados, sin colores muy intensos.", sí: ["#9AA8B8", "#C8A2C8", "#B784A7", "#8FBC8F", "#D8B4B8", "#7B9EB1", "#C9C0BB", "#A2849C", "#B0C4C4", "#E8CFCF"], no: ["#000000", "#FF4500", "#FFD700", "#00FF7F"], ropa: "Tonos empolvados: salvia, malva, gris azulado y rosa viejo. Los colores fosforescentes o muy brillantes te opacan.", pelo: "Castaño ceniza o rubio oscuro mate.", make: "Labiales nude rosado o malva, rubor suave. Armazones gris, plata mate o carey frío." },
  otono_suave: { nombre: "Otoño suave", desc: "Tienes un subtono cálido pero apagado, con contraste bajo. Te quedan los tonos tierra suaves.", sí: ["#C2B280", "#A0785A", "#BC8F8F", "#8F9779", "#D2B48C", "#B5835A", "#9C8A6E", "#C9A27E", "#6E7F80", "#E3C9A8"], no: ["#000000", "#FF00FF", "#00BFFF", "#FFFFFF"], ropa: "Arena, salvia, rosa viejo y taupe. El blanco puro y el negro te endurecen; usa marfil y café en su lugar.", pelo: "Castaño medio con reflejos suaves, miel apagada.", make: "Labiales nude cálido o rosa tierra, rubor melocotón suave. Armazones carey, café o dorado mate." },
  otono_calido: { nombre: "Otoño cálido", desc: "Tu color es claramente cálido y rico. Te favorecen los tonos tierra, mostaza y verdes oliva.", sí: ["#CC5500", "#B7410E", "#DAA520", "#808000", "#8B4513", "#E2725B", "#C19A6B", "#556B2F", "#FFDB58", "#F5DEB3"], no: ["#FF69B4", "#4169E1", "#C0C0C0", "#E6E6FA"], ropa: "Terracota, mostaza, oliva, óxido y camel. Los rosas fríos y el azul rey te apagan.", pelo: "Cobrizos, castaños chocolate y dorados intensos.", make: "Bronceador, rubor terracota y labiales ladrillo o café. Armazones carey, café o dorados." },
  otono_profundo: { nombre: "Otoño profundo", desc: "Tienes color cálido y profundo, con buen contraste. Te favorecen los tonos oscuros y ricos.", sí: ["#5C4033", "#800000", "#2E5E4E", "#8B0000", "#B8860B", "#4B5320", "#A0522D", "#CC5500", "#3B3C36", "#E1A95F"], no: ["#FFB6C1", "#E6E6FA", "#AFEEEE", "#C0C0C0"], ropa: "Café oscuro, vino, verde bosque, dorado oscuro y verde militar. Los pasteles fríos te deslavan.", pelo: "Castaño oscuro con brillo cálido, chocolate y caoba.", make: "Labiales vino o ladrillo, rubor terracota profundo. Armazones carey oscuro o dorado envejecido." },
  invierno_profundo: { nombre: "Invierno profundo", desc: "Tienes colores profundos con subtono frío o neutro y mucho contraste. Te sientan los tonos intensos y oscuros.", sí: ["#000000", "#FFFFFF", "#8B0000", "#191970", "#4B0082", "#006400", "#800080", "#DC143C", "#2F4F4F", "#C0C0C0"], no: ["#F5DEB3", "#FFDAB9", "#DAA520", "#F4A460"], ropa: "Negro, blanco puro, rojo profundo, azul marino y verde botella. Los beige y tonos durazno te apagan.", pelo: "Negro, castaño muy oscuro y tonos fríos profundos.", make: "Labiales rojo profundo o vino frío, delineado marcado. Armazones negros, plateados o de color oscuro." },
  invierno_frio: { nombre: "Invierno frío", desc: "Tu subtono es frío y tu contraste alto. Te favorecen los azules, rojos azulados y el blanco puro.", sí: ["#0047AB", "#C2185B", "#E0115F", "#4169E1", "#FFFFFF", "#000000", "#50C878", "#8A2BE2", "#B0E0E6", "#708090"], no: ["#FF8C00", "#C19A6B", "#FFDB58", "#E2725B"], ropa: "Azul cobalto, rubí, esmeralda, blanco puro y negro. Los naranjas, mostazas y camel te ponen gris la piel.", pelo: "Negro azulado, castaño frío o cenizo oscuro.", make: "Labiales rojo azulado, fucsia o ciruela. Armazones plateados, negros o azul oscuro." },
  invierno_brillante: { nombre: "Invierno brillante", desc: "Tienes mucho contraste entre piel, cabello y ojos. Te favorecen los colores puros e intensos.", sí: ["#FF0000", "#0033CC", "#00A86B", "#FF1493", "#FFFFFF", "#000000", "#1E90FF", "#9400D3", "#FFFF33", "#00CED1"], no: ["#C2B280", "#BC8F8F", "#A0785A", "#8F9779"], ropa: "Colores puros: rojo, azul eléctrico, verde esmeralda, fucsia, blanco y negro. Los tonos tierra apagados te restan fuerza.", pelo: "Negro o castaño oscuro con brillo, sin reflejos dorados.", make: "Labiales intensos como rojo puro o fucsia, delineado definido. Armazones negros o de color vivo." },
};

const CUERPOS = {
  reloj: { nombre: "Reloj de arena", desc: "Tu busto y tu cadera tienen medidas parecidas y tu cintura está marcada.", arriba: "Escotes en V o cruzados y prendas que sigan tu forma.", abajo: "Tiro alto, faldas lápiz o con vuelo y pantalones rectos.", evita: "Prendas muy amplias que escondan la cintura." },
  triangulo: { nombre: "Triángulo", desc: "Tu cadera es más ancha que tu busto. Es una de las formas más comunes.", arriba: "Atención arriba: escotes en V, hombros con detalle y colores claros o estampados.", abajo: "Cortes rectos o acampanados y colores lisos u oscuros.", evita: "Bolsillos grandes o estampados llamativos a la altura de la cadera." },
  triangulo_inv: { nombre: "Triángulo invertido", desc: "Tus hombros y tu busto son más anchos que tu cadera.", arriba: "Líneas simples, escote en V y colores lisos.", abajo: "Volumen abajo: faldas en A, pantalones anchos y estampados.", evita: "Hombreras, mangas abullonadas y cuellos muy cerrados." },
  rectangulo: { nombre: "Rectángulo", desc: "Tu busto, tu cintura y tu cadera tienen medidas parecidas, con una silueta recta.", arriba: "Capas, peplum y prendas que marquen la cintura.", abajo: "Faldas con vuelo o pantalones con pinzas para sumar curva.", evita: "Prendas rectas de una sola pieza sin nada que marque la cintura." },
  ovalado: { nombre: "Ovalado", desc: "Tu cintura es igual o más amplia que tu busto y tu cadera.", arriba: "Telas con caída, cortes imperio y escote en V que alarguen el torso.", abajo: "Pantalones rectos y faldas de largo a la rodilla.", evita: "Cinturones anchos en la cintura y telas muy pegadas." },
  v: { nombre: "Triángulo invertido (V)", desc: "Tu pecho y tus hombros son claramente más anchos que tu cintura.", arriba: "Cortes slim en la cintura y cuellos sencillos.", abajo: "Pantalones rectos o con algo de volumen para equilibrar.", evita: "Hombreras o chaquetas muy estructuradas en los hombros." },
  trapecio: { nombre: "Trapecio", desc: "Tu pecho es un poco más ancho que tu cintura y tu cadera. Es una silueta equilibrada.", arriba: "Casi todo te queda: corte regular o slim.", abajo: "Pantalones rectos o slim.", evita: "Prendas muy holgadas que escondan tu silueta." },
  rectangulo_h: { nombre: "Rectángulo", desc: "Tu pecho, tu cintura y tu cadera tienen medidas parecidas.", arriba: "Capas como chaquetas y sobrecamisas, y hombros estructurados.", abajo: "Pantalones rectos de tiro medio.", evita: "Prendas muy pegadas de una sola capa." },
  triangulo_h: { nombre: "Triángulo", desc: "Tu cadera es más ancha que tu pecho.", arriba: "Hombros estructurados, rayas horizontales y colores claros.", abajo: "Pantalones rectos y colores oscuros.", evita: "Pantalones muy ajustados o con bolsillos voluminosos." },
  ovalado_h: { nombre: "Ovalado", desc: "Tu cintura es igual o más amplia que tu pecho.", arriba: "Prendas rectas que no ajusten en el abdomen, cuello en V y colores oscuros.", abajo: "Pantalones rectos de tiro medio.", evita: "Camisas muy pegadas y cinturones que corten la silueta." },
};
