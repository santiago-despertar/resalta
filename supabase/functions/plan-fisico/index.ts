// Writes the month's nutrition and training plan for a subscriber's latest body check-in (table public.fisico):
// a 4-week day-by-day menu with recipes and shopping lists, and a 4-week progressive training block, then emails it.
// Calories and macros are worked out here with fixed, conservative rules; the model only turns them into
// meals and a training week that fit the person. The work continues after the response is sent and the
// panel asks again until the plan is there.
// Secrets: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, SITE_URL, SENDER_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type Obj = Record<string, unknown>;

const ACTIVIDAD: Record<string, number> = { sedentario: 1.2, ligero: 1.375, moderado: 1.55, muy: 1.725 };
const OBJETIVO: Record<string, [number, string]> = {
  bajar: [-0.2, "bajar grasa"],
  recomp: [-0.1, "bajar grasa y ganar músculo al mismo tiempo"],
  musculo: [0.08, "ganar músculo"],
  mantener: [0, "mantener su peso y definir"],
};

// Mifflin-St Jeor, a moderate adjustment for the goal, and floors so the plan is never a crash diet.
function numeros(d: Obj) {
  const mujer = d.sexo === "mujer";
  const peso = Number(d.peso_kg), est = Number(d.estatura_cm), edad = Number(d.edad);
  const imc = peso / ((est / 100) ** 2);
  const bmr = 10 * peso + 6.25 * est - 5 * edad + (mujer ? -161 : 5);
  const tdee = bmr * (ACTIVIDAD[String(d.actividad)] ?? 1.375);
  let [ajuste] = OBJETIVO[String(d.objetivo)] ?? OBJETIVO.mantener;
  if (imc < 18.5 && ajuste < 0) ajuste = 0.05; // underweight: never a deficit
  if (imc < 20 && ajuste < -0.1) ajuste = -0.1;
  const piso = mujer ? 1400 : 1700;
  const kcal = Math.round(Math.max(piso, tdee * (1 + ajuste), ajuste < 0 ? bmr : 0) / 50) * 50;
  const pesoRef = Math.min(peso, 25 * (est / 100) ** 2); // protein on a healthy reference weight
  const prot = Math.round(pesoRef * (mujer ? 1.6 : 1.8) / 5) * 5;
  const grasa = Math.round(Math.max(peso * 0.7, kcal * 0.25 / 9) / 5) * 5;
  const carbs = Math.max(80, Math.round((kcal - prot * 4 - grasa * 9) / 4 / 5) * 5);
  const ritmo = ajuste < 0 ? `entre ${(peso * 0.004).toFixed(1)} y ${(peso * 0.008).toFixed(1)} kg por semana` : ajuste > 0 ? "entre 0.2 y 0.4 kg por semana" : "peso estable";
  return { kcal, prot, grasa, carbs, agua: Math.round(peso * 0.035 * 10) / 10, tdee: Math.round(tdee), imc: Math.round(imc * 10) / 10, ajuste, ritmo };
}

const lista = (desc: string, item: Obj = { type: "string" }, extra: Obj = {}) => ({ type: "array", description: desc, items: item, ...extra });
const DIAS_SEM = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Two tools so nutrition and training are written at the same time (each well under the function's time limit).
const T_COMIDA = {
  name: "plan_comida",
  description: "El plan de alimentación del mes, día por día.",
  input_schema: {
    type: "object",
    required: ["resumen", "en_tu_cara", "meta_cara", "recetas", "semanas", "cambios"],
    properties: {
      resumen: { type: "string", description: "2 o 3 frases: qué vamos a hacer este mes y por qué." },
      en_tu_cara: { type: "string", description: "2 o 3 frases: cómo se va a notar en su cara (mandíbula, pómulos, hinchazón, piel), ligado a lo que dice su análisis facial. Sin prometer resultados exactos." },
      meta_cara: { type: "string", description: "Una frase: qué zona de su cara debería empezar a verse mejor este mes según su análisis." },
      recetas: lista("Entre 12 y 16 platillos para todo el mes. Cada uno con su id (R1, R2...).", {
        type: "object", required: ["id", "nombre", "momento", "ingredientes", "pasos", "kcal", "prot"],
        properties: {
          id: { type: "string" }, nombre: { type: "string" },
          momento: { type: "string", description: "Desayuno, Comida, Cena o Colación" },
          ingredientes: lista("Cada ingrediente con su porción exacta (gramos, piezas, tazas, cucharadas)."),
          pasos: lista("Entre 2 y 5 pasos cortos."),
          kcal: { type: "number" }, prot: { type: "number", description: "Gramos de proteína" },
        },
      }),
      semanas: lista("Exactamente 4 semanas.", {
        type: "object", required: ["enfoque", "dias", "lista"],
        properties: {
          enfoque: { type: "string", description: "Una frase: en qué se enfoca esta semana." },
          dias: lista("Exactamente 7 días, de lunes a domingo.", {
            type: "object", required: ["comidas"],
            properties: { comidas: lista("Una por cada momento de comida del día, con el id de la receta.", {
              type: "object", required: ["momento", "receta"],
              properties: { momento: { type: "string" }, receta: { type: "string", description: "id de la receta, por ejemplo R3" } },
            }) },
          }, { minItems: 7, maxItems: 7 }),
          lista: lista("Lista del súper de esa semana con cantidades aproximadas, agrupada por tipo de alimento."),
        },
      }, { minItems: 4, maxItems: 4 }),
      cambios: lista("Entre 6 y 10 cambios fáciles: si no tienes X, usa Y (en la misma porción)."),
    },
  },
};
const T_ENTRENO = {
  name: "plan_entreno",
  description: "El entrenamiento de 4 semanas y los hábitos para la cara.",
  input_schema: {
    type: "object",
    required: ["calentamiento", "dias", "estiramiento", "cardio", "progresion", "cara"],
    properties: {
      calentamiento: lista("4 a 6 movimientos de calentamiento con tiempo o repeticiones."),
      dias: lista("Un objeto por día de entrenamiento de la semana. La rutina se repite las 4 semanas subiendo carga.", {
        type: "object", required: ["dia", "enfoque", "ejercicios"],
        properties: {
          dia: { type: "string", description: "Día 1, Día 2..." }, enfoque: { type: "string" },
          ejercicios: lista("Entre 4 y 7 ejercicios.", {
            type: "object", required: ["nombre", "semanas", "descanso", "tecnica"],
            properties: {
              nombre: { type: "string" },
              semanas: lista("Exactamente 4 textos, series y repeticiones de la semana 1 a la 4, por ejemplo 3×10, 3×12, 4×10, 4×12.", { type: "string" }, { minItems: 4, maxItems: 4 }),
              descanso: { type: "string", description: "Descanso entre series, por ejemplo 60 s" },
              tecnica: { type: "string", description: "Una o dos frases de técnica: cómo hacerlo bien y el error más común." },
              casa: { type: "string", description: "Alternativa para hacer en casa, si el ejercicio es de gimnasio. Opcional." },
            },
          }),
        },
      }),
      estiramiento: lista("4 a 6 estiramientos para el final, con tiempo."),
      cardio: lista("Exactamente 4 textos: pasos diarios y cardio de la semana 1 a la 4.", { type: "string" }, { minItems: 4, maxItems: 4 }),
      progresion: { type: "string", description: "Cómo saber cuándo subir peso y qué hacer si una semana no se puede." },
      cara: {
        type: "object", required: ["hinchazon", "grasa", "habitos"],
        properties: {
          hinchazon: lista("4 o 5 puntos: qué hincha la cara (sal, alcohol, sueño, agua, etc.) y qué hacer, concreto."),
          grasa: { type: "string", description: "2 o 3 frases: cómo bajar grasa corporal va a cambiar su cara en particular, según su análisis." },
          habitos: lista("Entre 4 y 6 hábitos diarios concretos que más impactan la cara."),
        },
      },
    },
  },
};

function limpiar(v: unknown): Obj | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Obj;
  for (const k of Object.keys(o)) if (typeof o[k] === "string" && /^\s*[\[{]/.test(o[k] as string)) { try { o[k] = JSON.parse(o[k] as string); } catch { /* keep */ } }
  return o;
}
const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Obj[];
function validoComida(p: Obj | null) {
  if (!p || typeof p.resumen !== "string") return false;
  const ids = new Set(arr(p.recetas).map((r) => String(r.id)));
  if (ids.size < 6) return false;
  const sem = arr(p.semanas);
  if (sem.length !== 4) return false;
  for (const s of sem) {
    const dias = arr(s.dias);
    if (dias.length !== 7) return false;
    for (const d of dias) {
      // a meal pointing at a recipe that doesn't exist is dropped, a day left empty fails the plan
      d.comidas = arr(d.comidas).filter((c) => ids.has(String(c.receta)));
      if (!(d.comidas as unknown[]).length) return false;
    }
  }
  return true;
}
const validoEntreno = (p: Obj | null) => !!p && arr(p.dias).length >= 1 && arr(p.dias).every((d) => arr(d.ejercicios).length >= 2) && !!p.cara;

async function fotoB64(path: string) {
  const { data } = await admin.storage.from("fotos").download(path);
  if (!data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(s) } };
}

// The latest face report, in short, so the plan talks about this person's face.
async function analisisCara(userId: string) {
  const { data: ords } = await admin.from("orders").select("id").eq("user_id", userId).eq("status", "listo").order("paid_at", { ascending: false }).limit(1);
  if (!ords?.length) return "";
  const { data: rep } = await admin.from("reports").select("data").eq("order_id", ords[0].id).maybeSingle();
  const r = (rep?.data ?? {}) as Obj;
  if (!r.resumen) return "";
  const zonas = arr(r.zonas).map((z) => `${z.zona ?? z.id ?? z.nombre}: ${String(z.lectura ?? "").slice(0, 180)}`).join("\n");
  const prior = arr(r.prioridades).slice(0, 3).map((p) => typeof p === "string" ? p : String(p.titulo ?? p.accion ?? p.texto ?? JSON.stringify(p).slice(0, 160))).join("; ");
  return `\nSu análisis facial de Resalta dice: ${String(r.resumen).slice(0, 700)}\nPuntajes: ${JSON.stringify(r.puntajes ?? {})}\nZonas:\n${zonas.slice(0, 1400)}\nPrioridades: ${prior.slice(0, 500)}`;
}

async function llamar(sistema: string, contenido: unknown[], herramienta: Obj, maxTokens: number, valido: (p: Obj | null) => boolean) {
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO, max_tokens: maxTokens, system: sistema, tools: [herramienta], tool_choice: { type: "tool", name: herramienta.name },
        messages: [{ role: "user", content: contenido }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 400)); continue; }
    const resp = await r.json();
    const bloque = (resp.content ?? []).find((c: Obj) => c.type === "tool_use") as Obj | undefined;
    const plan = bloque ? limpiar(bloque.input) : null;
    if (valido(plan)) return plan;
    console.warn("plan incompleto", herramienta.name, resp.stop_reason);
  }
  return null;
}

async function generar(fila: Obj, anterior: Obj | null) {
  const d = fila.datos as Obj, n = numeros(d), mujer = d.sexo === "mujer";
  const [fotos, cara] = await Promise.all([
    Promise.all(((fila.fotos as string[]) ?? []).slice(0, 3).map(fotoB64)).then((x) => x.filter(Boolean)),
    analisisCara(String(fila.user_id)),
  ]);
  const peso = Number(d.peso_kg);
  const metaPeso = n.ajuste < 0 ? `${(peso - peso * 0.016).toFixed(1)} a ${(peso - peso * 0.008).toFixed(1)} kg` : n.ajuste > 0 ? `${(peso + 0.8).toFixed(1)} a ${(peso + 1.6).toFixed(1)} kg` : `${peso.toFixed(1)} kg, con menos cintura`;
  const previo = anterior ? `\nMes anterior (${String(anterior.created_at).slice(0, 10)}): pesaba ${anterior.peso_kg} kg. Hoy pesa ${fila.peso_kg} kg. Ajusta el plan a ese avance y menciónalo en el resumen.` : "";
  const sistema = `Eres el coach de nutrición y entrenamiento de Resalta, un servicio de análisis facial para hispanohablantes. Escribes en español neutro, de tú, claro y directo, sin frases motivacionales ni relleno, y sin guiones largos. Que no suene escrito por una máquina.
Tu enfoque: que el cliente se vea mejor, sobre todo de la cara. Bajar grasa corporal define mandíbula y pómulos; menos sal, alcohol y mejor sueño bajan la hinchazón.
${mujer ? "Es mujer: prioriza bajar grasa e hinchazón y tonificar; fuerza con cargas progresivas sin miedo a ponerse grande; nada de dietas extremas." : "Es hombre: prioriza bajar grasa para marcar la mandíbula, fuerza en espalda, hombros y cuello que enmarcan la cara, y buena postura."}
Reglas: respeta las calorías y macros que te doy (cada día debe sumar cerca de ellas). Comida real, casera y fácil de conseguir en ${d.pais || "Latinoamérica"}, con nombres de ingredientes de ese país. Nada de suplementos raros. Respeta lo que no come. Nunca recomiendes ayunos largos, purgas, menos calorías de las indicadas ni pesarse a diario de forma obsesiva. No diagnostiques ni hables de enfermedades.`;
  const datos = `Datos: ${mujer ? "mujer" : "hombre"}, ${d.edad} años, ${d.estatura_cm} cm, ${d.peso_kg} kg (IMC ${n.imc}). Actividad: ${d.actividad}. Objetivo: ${(OBJETIVO[String(d.objetivo)] ?? OBJETIVO.mantener)[1]}.
Entrena ${d.dias} días por semana, ${d.minutos} minutos por sesión, en ${d.lugar === "gym" ? "gimnasio" : d.lugar === "casa_equipo" ? "casa con mancuernas o ligas" : "casa sin equipo"}.
Come ${d.comidas} veces al día. Tipo de alimentación: ${d.dieta}. No come o no le gusta: ${d.no_come || "nada en especial"}.
Objetivos del día (no los cambies): ${n.kcal} kcal, ${n.prot} g de proteína, ${n.carbs} g de carbohidratos, ${n.grasa} g de grasa, ${n.agua} litros de agua. Ritmo esperado: ${n.ritmo}. Meta de peso al terminar el mes: ${metaPeso}.${previo}${cara}`;
  const conFotos = (t: string) => [...fotos, { type: "text", text: `${datos}\n${fotos.length ? "Las fotos son de su físico; úsalas solo para orientar (postura, zonas a priorizar), sin comentar su cuerpo de forma negativa.\n" : ""}\n${t}` }];
  const [comida, entreno] = await Promise.all([
    llamar(sistema, [{ type: "text", text: `${datos}\n\nArma su menú de 4 semanas, de lunes a domingo, con ${d.comidas} momentos de comida al día. Primero define entre 12 y 16 recetas y luego asígnalas a cada día; repite recetas para que sea fácil de cocinar, pero que cada semana cambie un poco. Entrégalo con la herramienta plan_comida.` }], T_COMIDA, 14000, validoComida),
    llamar(sistema, conFotos(`Arma su entrenamiento de ${d.dias} días por semana para 4 semanas, con progresión semana a semana, y la parte de hábitos para su cara. Entrégalo con la herramienta plan_entreno.`), T_ENTRENO, 9000, validoEntreno),
  ]);
  if (!comida || !entreno) return null;
  const cr = entreno.cara as Obj;
  return {
    v: 2,
    resumen: comida.resumen, en_tu_cara: comida.en_tu_cara,
    metas: { peso: metaPeso, cara: comida.meta_cara, ritmo: n.ritmo },
    recetas: comida.recetas, semanas: arr(comida.semanas).map((s, i) => ({ ...s, dias: arr(s.dias).map((x, j) => ({ ...x, dia: DIAS_SEM[j] })), semana: i + 1 })),
    cambios: comida.cambios,
    entreno: { calentamiento: entreno.calentamiento, dias: entreno.dias, estiramiento: entreno.estiramiento, cardio: entreno.cardio, progresion: entreno.progresion },
    cara: cr, habitos: cr?.habitos ?? [],
    numeros: n,
  };
}

// "Your plan is ready" email, same look as every Resalta email. Secret: SENDER_API_KEY.
const EM_SANS = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const EM_MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
const EM_SUAVE = "rgba(255,255,255,.82)";
const emCaja = (inner: string, pad = "26px 24px") => `<tr><td class="cd" bgcolor="#A0AEB9" style="background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.26);border-radius:22px;padding:${pad}">${inner}</td></tr><tr><td style="height:14px;line-height:14px;font-size:0">&nbsp;</td></tr>`;
const emBoton = (texto: string, href: string) => `<tr><td align="center" style="padding:8px 0 22px"><a href="${href}" style="display:inline-block;background:#FFFFFF;color:#16191D;text-decoration:none;padding:17px 34px;border-radius:999px;font-family:${EM_SANS};font-size:16px;font-weight:600">${texto}</a></td></tr>`;
const emTexto = (html: string) => `<tr><td style="padding:0 4px 18px;font-family:${EM_SANS};font-size:17px;line-height:27px;color:#FFFFFF">${html}</td></tr>`;
function emShell(o: { site: string; etiqueta?: string; titulo?: string; filas: string; pie: string; preview?: string }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>Resalta</title>
<style>@media only screen and (max-width:520px){.pn{border-radius:0!important}.pi{padding:34px 18px 26px!important}.cd{padding:22px 18px!important}.ti{font-size:28px!important;line-height:34px!important}}</style></head>
<body style="margin:0;padding:0;background:#FFFFFF;-webkit-text-size-adjust:100%">
${o.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${o.preview}</div>` : ""}
<div style="width:100%;background-color:#FFFFFF;margin:0;padding:0"><center style="width:100%;table-layout:fixed;background-color:#FFFFFF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FFFFFF" style="width:100%;min-width:100%;background:#FFFFFF"><tr><td align="center" valign="top" style="padding:32px 0;text-align:center">
<table role="presentation" class="pn" align="center" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#97A6B2" style="margin:0 auto;width:100%;max-width:600px;background-color:#97A6B2;background-image:linear-gradient(180deg,#8B9BA8 0%,#A9B6C0 100%);border-radius:28px">
<tr><td class="pi" style="padding:44px 36px 26px;text-align:left">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center" style="padding:0 0 30px"><a href="${o.site}" style="text-decoration:none"><img src="${o.site}/assets/img/email/logo-blanco.png" width="136" height="38" alt="resalta" style="display:block;border:0;width:136px;height:38px"></a></td></tr>
    ${o.etiqueta ? `<tr><td align="center" style="padding:0 0 16px"><span style="display:inline-block;font-family:${EM_MONO};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFFFFF;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);border-radius:999px;padding:8px 16px">${o.etiqueta}</span></td></tr>` : ""}
    ${o.titulo ? `<tr><td align="center" class="ti" style="padding:0 0 28px;font-family:${EM_SANS};font-size:34px;line-height:40px;font-weight:300;letter-spacing:-.02em;color:#FFFFFF">${o.titulo}</td></tr>` : ""}
    ${o.filas}
  </table>
</td></tr></table>
<table role="presentation" align="center" width="600" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;width:100%;max-width:600px"><tr><td align="center" style="padding:20px 24px 8px;font-family:${EM_SANS};font-size:13px;line-height:20px;color:#5B6470">${o.pie}</td></tr></table>
</td></tr></table></center></div></body></html>`;
}
async function avisarPlan(userId: string, filaId: string, plan: Obj) {
  const key = Deno.env.get("SENDER_API_KEY");
  if (!key) return;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email; if (!email) return;
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const N = (plan.numeros ?? {}) as Obj, M = (plan.metas ?? {}) as Obj;
    const dato = (v: unknown, t: string) => `<td align="center" style="padding:6px 4px;font-family:${EM_SANS};color:#FFFFFF"><div style="font-size:24px;font-weight:300">${esc(v)}</div><div style="font-size:12px;color:${EM_SUAVE}">${t}</div></td>`;
    const html = emShell({
      site, etiqueta: "Tu seguimiento mensual", titulo: "Tu plan del mes está listo",
      preview: "Tu menú de 4 semanas, tus recetas y tu entrenamiento, día por día.",
      filas: emTexto(`<div style="text-align:center;color:${EM_SUAVE}">${esc(plan.resumen)}</div>`)
        + emCaja(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${dato(N.kcal, "calorías al día")}${dato(`${N.prot} g`, "proteína")}${dato(`${N.agua} L`, "agua")}</tr></table>`, "18px 12px")
        + emCaja(`<div style="font-family:${EM_SANS};font-size:15px;line-height:24px;color:#FFFFFF"><b>Tu meta del mes</b><br>Peso: ${esc(M.peso)}<br>${esc(M.cara)}</div>`, "20px 22px")
        + emTexto(`<div style="text-align:center;font-size:15px;line-height:24px;color:${EM_SUAVE}">Adentro tienes tu menú de lunes a domingo para las 4 semanas, tus recetas, la lista del súper de cada semana y tu entrenamiento con cómo ir subiendo.</div>`)
        + emBoton("Ver y descargar mi plan", `${site}/plan?f=${filaId}&utm_source=email&utm_medium=plan&utm_campaign=listo`),
      pie: "Resalta · resalta.co<br>Es una guía general de alimentación y ejercicio, no un tratamiento médico.",
    });
    await fetch("https://api.sender.net/v2/message/send", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" }, to: { email }, subject: "Tu plan de nutrición y ejercicio está listo", html }),
    });
    await admin.from("correos_log").insert({ email: email.toLowerCase(), tipo: "plan_fisico", asunto: "Tu plan de nutrición y ejercicio está listo" }).then(() => {}, () => {});
  } catch (e) { console.error("aviso plan", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { data: sub } = await admin.from("suscripciones").select("estado").eq("user_id", user.id).maybeSingle();
    if (!sub || !["active", "trialing"].includes(sub.estado)) return json({ error: "Necesitas el seguimiento mensual activo." }, 403);

    const { data: filas } = await admin.from("fisico").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2);
    const fila = filas?.[0];
    if (!fila) return json({ error: "Primero llena tus datos." }, 400);
    if (fila.estado === "listo") return json({ ok: true, listo: true });
    // one plan at a time; a job that got stuck for more than 4 minutes can start again
    if (fila.estado === "generando" && Date.now() - new Date(fila.plan_at ?? fila.created_at).getTime() < 300000) return json({ ok: true, generando: true });
    const d = fila.datos ?? {};
    if (!(Number(d.edad) >= 18 && Number(d.estatura_cm) >= 120 && Number(d.peso_kg) >= 30)) return json({ error: "Revisa tu edad, estatura y peso." }, 400);

    await admin.from("fisico").update({ estado: "generando", plan_at: new Date().toISOString() }).eq("id", fila.id);
    const trabajo = (async () => {
      try {
        const plan = await generar(fila, filas?.[1] ?? null);
        await admin.from("fisico").update(plan ? { estado: "listo", plan, plan_at: new Date().toISOString() } : { estado: "error" }).eq("id", fila.id);
        if (plan) await avisarPlan(user.id, String(fila.id), plan as Obj);
      } catch (e) { console.error(e); await admin.from("fisico").update({ estado: "error" }).eq("id", fila.id); }
    })();
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(trabajo); return json({ ok: true, generando: true }); }
    await trabajo;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo generar tu plan" }, 500);
  }
});
