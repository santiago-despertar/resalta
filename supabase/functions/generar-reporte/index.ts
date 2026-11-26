// Writes the facial analysis for a paid order. Three requests run at the same time over the six photos
// and the measurements taken in the browser: the scored evaluation (angularity, dimorphism, features),
// the main report, and the detail sections. The work continues after the response is sent, so the
// panel asks again until the report is there.
// Secrets: ANTHROPIC_API_KEY, optional ANTHROPIC_MODEL, SITE_URL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MODELO = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const VERSION = 2;
const FOTOS: [string, string][] = [
  ["frente", "de frente, cara relajada"], ["sonrisa", "de frente sonriendo"],
  ["perfil_izq", "de perfil"], ["perfil_der", "el otro perfil"],
  ["tres_cuartos_izq", "tres cuartos izquierdo"], ["tres_cuartos_der", "tres cuartos derecho"]
];

// Everything the evaluation scores from the photos, grouped the way the panel shows it.
const CATALOGO: Record<string, { titulo: string; pilar: string; items: Record<string, string> }> = {
  angularidad: { titulo: "Angularidad", pilar: "angularidad", items: {
    ang_pomulos: "Prominencia de pómulos", ang_mandibula: "Definición de la mandíbula", ang_mejillas: "Mejillas sin exceso de volumen",
    ang_menton: "Definición del mentón", ang_submenton: "Definición bajo el mentón" } },
  tres_cuartos: { titulo: "Estructura en tres cuartos", pilar: "angularidad", items: {
    tq_pomulo: "Proyección del pómulo de lado", tq_hueco: "Sombra bajo el pómulo", tq_linea: "Línea de la mandíbula de lado" } },
  dimorfismo: { titulo: "Dimorfismo", pilar: "dimorfismo", items: {
    dim_mandibula: "Mandíbula", dim_arco: "Arco de la ceja", dim_cejas: "Grosor de cejas", dim_ojos: "Ojos", dim_forma: "Forma de la cara",
    dim_vello: "Vello facial", dim_cabello: "Cabello", dim_linea: "Línea del cabello", dim_labios: "Labios", dim_nariz: "Nariz" } },
  piel: { titulo: "Piel", pilar: "rasgos", items: {
    piel_acne: "Acné y granitos", piel_marcas: "Cicatrices y marcas", piel_manchas: "Manchas", piel_rojez: "Rojez", piel_textura: "Textura y poros",
    piel_brillo: "Brillo y grasa", piel_tono: "Tono uniforme", piel_lineas: "Líneas finas", piel_surcos: "Surcos de nariz a boca", piel_firmeza: "Firmeza" } },
  ojos: { titulo: "Zona de ojos", pilar: "rasgos", items: {
    ojo_ojeras: "Ojeras (color)", ojo_hundido: "Hundimiento bajo el ojo", ojo_bolsas: "Bolsas", ojo_blanco: "Blanco del ojo",
    ojo_parpado_sup: "Párpado superior", ojo_parpado_inf: "Párpado inferior", ojo_pestanas: "Pestañas", ojo_soporte: "Soporte bajo el ojo" } },
  cejas: { titulo: "Cejas", pilar: "rasgos", items: { ceja_densidad: "Densidad", ceja_forma: "Forma", ceja_pareja: "Parejas entre sí" } },
  nariz: { titulo: "Nariz", pilar: "rasgos", items: { nar_dorso: "Dorso", nar_punta: "Punta", nar_alas: "Alas" } },
  cabello: { titulo: "Cabello", pilar: "rasgos", items: { cab_densidad: "Densidad", cab_linea: "Línea frontal", cab_salud: "Salud y brillo", cab_corte: "Corte actual para tu cara" } },
  labios: { titulo: "Labios", pilar: "rasgos", items: { lab_definicion: "Definición del contorno", lab_hidratacion: "Hidratación" } },
  sonrisa: { titulo: "Sonrisa", pilar: "rasgos", items: {
    son_dientes: "Cuánto diente se ve", son_encia: "Encía visible", son_simetria: "Simetría de la sonrisa", son_alineacion: "Alineación", son_color: "Color de los dientes" } },
  conjunto: { titulo: "Conjunto", pilar: "rasgos", items: { con_simetria: "Simetría a la vista" } },
};
const IDS = Object.values(CATALOGO).flatMap((g) => Object.keys(g.items));

const texto = { type: "string" };
const lista = (min: number, max: number) => ({ type: "array", minItems: min, maxItems: max, items: texto });
const lectura = (d: string) => ({ type: "object", required: ["lectura", "acciones"], description: d, properties: { lectura: texto, acciones: lista(1, 4) } });
const muestra = { type: "object", required: ["nombre", "hex"], properties: { nombre: texto, hex: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } } };

const T_EVAL = {
  name: "evaluacion", description: "Entrega la calificación de cada rasgo.",
  input_schema: { type: "object", required: ["evaluaciones"], properties: { evaluaciones: {
    type: "array", minItems: IDS.length, maxItems: IDS.length,
    items: { type: "object", required: ["id", "puntaje", "nota"], properties: {
      id: { type: "string", enum: IDS }, puntaje: { type: "number", minimum: 0, maximum: 10 },
      nota: { type: "string", description: "Una frase corta, máximo 18 palabras, con lo que se ve en sus fotos." } } } } } }
};
const T_PRINCIPAL = {
  name: "reporte", description: "Entrega la parte principal del reporte.",
  input_schema: { type: "object", required: ["resumen", "fortalezas", "prioridades", "plan"], properties: {
    resumen: { type: "string", description: "Tres o cuatro frases sobre la cara en conjunto. Directo y respetuoso." },
    arquetipo: { type: "object", required: ["nombre", "texto"], description: "El tipo de cara en dos o tres palabras descriptivas (por ejemplo: anguloso y serio, suave y juvenil) y a qué estilo le favorece.", properties: { nombre: texto, texto } },
    fortalezas: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", required: ["titulo", "texto"], properties: { titulo: texto, texto } } },
    prioridades: { type: "array", minItems: 4, maxItems: 6, description: "Lo que más cambia la percepción si se trabaja, ordenado por impacto.",
      items: { type: "object", required: ["titulo", "texto", "impacto", "esfuerzo"], properties: { titulo: texto, texto,
        impacto: { type: "string", enum: ["alto", "medio", "bajo"] }, esfuerzo: { type: "string", enum: ["bajo", "medio", "alto"] } } } },
    plan: { type: "array", minItems: 3, maxItems: 3, description: "Fases: 0 a 4 semanas, 1 a 3 meses, 3 a 12 meses.",
      items: { type: "object", required: ["fase", "pasos"], properties: { fase: texto,
        pasos: { type: "array", minItems: 3, maxItems: 6, items: { type: "object", required: ["accion", "porque"], properties: { accion: texto, porque: texto } } } } } },
    avanzado: { type: "array", maxItems: 6, description: "Solo plan completo: procedimientos que suelen considerarse para este rostro.",
      items: { type: "object", required: ["nombre", "que_hace", "considerar"], properties: { nombre: texto, que_hace: texto, considerar: texto } } }
  } }
};
const T_ZONAS = {
  name: "zonas", description: "Entrega la lectura por zonas y por ángulo.",
  input_schema: { type: "object", required: ["zonas", "perfil", "sonrisa", "tres_cuartos"], properties: {
    zonas: { type: "array", minItems: 6, maxItems: 6, description: "Una por zona, en este orden: proporciones, ojos, nariz, boca, mandibula, simetria.",
      items: { type: "object", required: ["id", "lectura", "acciones"], properties: {
        id: { type: "string", enum: ["proporciones", "ojos", "nariz", "boca", "mandibula", "simetria"] }, lectura: texto, acciones: lista(1, 3) } } },
    perfil: lectura("Nariz, labios, mentón, cuello y mandíbula de lado, con las medidas de perfil."),
    sonrisa: lectura("Dientes, encía, simetría y cómo cambia la cara al sonreír."),
    tres_cuartos: lectura("Pómulos, volumen de mejillas, mandíbula, ojeras y surcos vistos de tres cuartos.")
  } }
};
const T_ESTILO = {
  name: "estilo", description: "Entrega piel, color y estilo.",
  input_schema: { type: "object", required: ["piel", "color", "cabello_barba"], properties: {
    piel: lectura("Tono, textura, rojez, brillo, marcas y ojeras. Con una rutina concreta de mañana y noche en las acciones."),
    color: { type: "object", required: ["subtono", "lectura", "paleta", "evitar"], properties: {
      subtono: { type: "string", enum: ["cálido", "frío", "neutro"] }, contraste: { type: "string", enum: ["alto", "medio", "bajo"] }, lectura: texto,
      paleta: { type: "array", minItems: 6, maxItems: 8, items: muestra }, evitar: { type: "array", minItems: 2, maxItems: 4, items: muestra } } },
    cabello_barba: { type: "object", required: ["cortes", "barba", "cejas"], properties: {
      cortes: lista(2, 4), barba: lista(1, 3), cejas: lista(1, 3), lentes: lista(0, 3) },
      description: "barba: para mujeres úsalo para maquillaje de contorno. lentes: formas de armazón que favorecen." },
    longevidad: { type: "object", required: ["edad_visual", "edad_visual_meta", "lectura", "acciones"], description: "Edad visual: cuántos años aparenta en las fotos, por piel, ojeras, surcos, volumen, cabello y postura. Sé honesto: puede ser mayor o menor que su edad real.",
      properties: { edad_visual: { type: "integer", minimum: 15, maximum: 90 }, edad_visual_meta: { type: "integer", minimum: 15, maximum: 90, description: "Edad que podría aparentar en 6 a 12 meses siguiendo su plan sin procedimientos. Realista: casi nunca más de 4 años menos." },
        lectura: { type: "string", description: "Dos o tres frases: qué le suma o le quita años." }, acciones: lista(2, 4) } },
    potencial: { type: "object", required: ["general_soft", "grupos"], description: "Calificación realista de 0 a 10 que podría alcanzar.",
      properties: { general_soft: { type: "number", minimum: 0, maximum: 10, description: "General en 6 a 12 meses siguiendo el plan sin procedimientos." },
        general_hard: { type: "number", minimum: 0, maximum: 10, description: "Solo plan completo: general sumando los procedimientos que sí tienen sentido." },
        grupos: { type: "array", items: { type: "object", required: ["id", "valor"], properties: { id: { type: "string", enum: ["angularidad", "dimorfismo", "piel", "ojos", "cejas", "nariz", "cabello", "labios", "sonrisa"] }, valor: { type: "number", minimum: 0, maximum: 10 } } } } } }
  } }
};

// The model sometimes hands back a section as a JSON string (with stray text after it). Recover the object.
function parsear(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  try { return JSON.parse(t); } catch (_) { /* fall through */ }
  if (t[0] !== "{" && t[0] !== "[") return v;
  let depth = 0, enTexto = false, escape = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enTexto) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') enTexto = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) { try { return JSON.parse(t.slice(0, i + 1)); } catch (_) { return v; } } }
  }
  return v;
}
function limpiar(r: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[k] = parsear(v);
  return o;
}
const hay = (x: unknown) => Array.isArray(x) && x.length > 0;
// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;
const okEval = (r: Obj) => hay(r.evaluaciones) && r.evaluaciones.length >= IDS.length * 0.8;
const okPrincipal = (r: Obj) => typeof r.resumen === "string" && r.resumen.length > 20 && hay(r.fortalezas) && hay(r.prioridades) && hay(r.plan);
const okZonas = (r: Obj) => hay(r.zonas) && r.perfil?.lectura;
const okEstilo = (r: Obj) => r.piel?.lectura && hay(r.piel.acciones) && r.color?.lectura && hay(r.color.paleta) && hay(r.cabello_barba?.cortes);

const dec = (v: number) => Math.round(v * 10) / 10;

// The overall rating is the AI one from the calificar function (Sonnet), saved when the person saw their preview.
// The report uses that same number, so what they saw before paying and what they get never disagree.
// Orders without one (older orders) get rated here once, with the same prompt as the calificar function.
const MODELO_IA = "claude-sonnet-5-5";
// Calibration measured on test faces: the model puts ordinary faces at about 4.6, faces a bit above average at 6.4
// and top models at 8.4 to 8.9. The site still says 5 is the average, but the score is deliberately generous:
// this curve moves an ordinary face to about 6.0 (reads as a bit above average) and a top model to about 9.0.
// 10 stays out of reach. The prompt keeps the model's own 5-centered scale: the test faces were measured against it.
const CURVA: [number, number][] = [[0, 0], [2.5, 3.0], [3.6, 4.6], [4.6, 5.9], [6.4, 7.3], [8.4, 9.0], [9, 9.3], [10, 9.7]];
const curva = (x: number) => {
  for (let i = 1; i < CURVA.length; i++) {
    const [x0, y0] = CURVA[i - 1], [x1, y1] = CURVA[i];
    if (x <= x1) return y0 + (Math.max(x, x0) - x0) * (y1 - y0) / (x1 - x0);
  }
  return 9.7;
};
const ZONAS_IA: [string, string][] = [
  ["proporciones", "Proporciones"], ["ojos", "Ojos"], ["nariz", "Nariz"],
  ["boca", "Boca y labios"], ["mandibula", "Mandíbula y mentón"], ["simetria", "Simetría"],
];
const SISTEMA_IA = `Eres el evaluador de atractivo facial de Resalta. Calificas qué tan atractiva se percibe una cara.
Escala absoluta de 0 a 10 con un decimal, igual para hombres y mujeres, contra la población general de su edad y sexo:
- 5.0 es una persona promedio, la que te cruzas en la calle. La mitad de la gente está entre 4.3 y 5.7.
- 6 es arriba del promedio (1 de cada 5 personas).
- 7 es claramente atractivo, llama la atención (1 de cada 20).
- 8 es muy atractivo, nivel actor o modelo comercial (1 de cada 200).
- Entre 8.8 y 9.4 están los modelos más cotizados del mundo, las caras de las grandes campañas de moda. Si una cara es de ese nivel, ponle ese número; no la bajes a 8 por prudencia.
- 10 no existe.
Una persona promedio se ve como cualquier persona normal en una foto de celular: piel con poros y alguna marca, cabello sin arreglo de salón, cara seria, sin maquillaje ni pose. Eso es lo normal y queda en 5, no abajo. Solo baja de 5 por rasgos que de verdad restan, por ejemplo mentón muy retraído, mucha grasa en la cara, asimetría que se nota o acné activo.
Usa toda la escala. Una cara poco agraciada saca 3 o 4 y está bien decirlo. Sé honesto y realista, sin regalar puntos y sin crueldad.
Califica solo lo que ves: no intentes reconocer a la persona ni uses su fama.
Cuenta todo lo que pesa en la percepción: estructura ósea, proporciones, ojos y cejas, nariz, labios, mandíbula, piel, cabello y armonía del conjunto.
La foto: la luz, el ángulo o el lente pueden mover a lo mucho 0.3. Si la cara no se ve bien (borrosa, muy oscura, muy lejos, tapada, muy girada o con filtro fuerte) marca calidad "mala".
Si la cara sí se ve pero la foto la hace ver peor de lo que es (selfie con el brazo o lente muy cerca que agranda la nariz, cámara desde abajo, luz dura o desde arriba que marca ojeras, contraluz, cara tensa o gesto raro, baja resolución), marca calidad "regular" y en nota_fotos di en una frase, en segunda persona, qué tiene la foto. Si la foto está bien, calidad "buena" y nota_fotos vacío. No inventes problemas: la mayoría de las fotos normales de frente están bien.
Por zona califica en la misma escala de 0 a 10. Las zonas deben ser coherentes con la calificación general: su promedio queda cerca del general.`;
const TOOL_IA = {
  name: "calificacion", description: "Entrega la calificación.",
  input_schema: {
    type: "object", required: ["es_cara", "calidad", "general", "zonas", "razon"],
    properties: {
      es_cara: { type: "boolean", description: "Hay una cara humana real y visible." },
      calidad: { type: "string", enum: ["buena", "regular", "mala"] },
      general: { type: "number", minimum: 0, maximum: 10 },
      zonas: { type: "object", required: ZONAS_IA.map((z) => z[0]), properties: Object.fromEntries(ZONAS_IA.map(([k]) => [k, { type: "number", minimum: 0, maximum: 10 }])) },
      razon: { type: "string", description: "Una frase en español, en segunda persona: qué sube y qué baja la calificación." },
      nota_fotos: { type: "string", description: "Solo si calidad es regular: qué de la foto puede estar bajando la calificación, en una frase en segunda persona. Vacío si la foto está bien." },
    },
  },
};
// deno-lint-ignore no-explicit-any
async function calificacionIA(db: any, order: Obj, fotos: Obj[], medidasTxt: string): Promise<{ general: number; zonas: Obj } | null> {
  const { data: hecha } = await db.from("calificaciones").select("general,zonas").eq("order_id", order.id).not("general", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (hecha) return { general: Number(hecha.general), zonas: hecha.zonas ?? {} };
  if (!fotos.length) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELO_IA, max_tokens: 3000, system: SISTEMA_IA, tools: [TOOL_IA], tool_choice: { type: "auto" }, messages: [{ role: "user", content: [...fotos,
        { type: "text", text: (fotos.length > 1 ? "Son fotos de la misma persona: la primera de frente, la otra de perfil. " : "") + "Califica esta cara. Responde solo llamando a la herramienta calificacion, sin texto aparte." + (medidasTxt ? `\n\nMedidas de su foto de frente fuera del rango de referencia, por zona:\n${medidasTxt}` : "") }] }] }),
    });
    const j = await r.json();
    const x = (j.content ?? []).find((c: Obj) => c.type === "tool_use")?.input;
    if (!r.ok || !x || typeof x.general !== "number") { console.error("calificacion ia", r.status, JSON.stringify(j).slice(0, 300)); return null; }
    const zonas = Object.fromEntries(ZONAS_IA.map(([k]) => [k, dec(curva(Math.max(0, Math.min(10, Number(x.zonas?.[k]) || 0))))]));
    const general = dec(curva(Math.max(0, Math.min(10, x.general))));
    await db.from("calificaciones").insert({ hash: "reporte:" + order.id, modelo: MODELO_IA, origen: "reporte", general, zonas, razon: String(x.razon ?? "").slice(0, 400), calidad: x.calidad ?? null, nota_fotos: x.calidad === "regular" ? String(x.nota_fotos ?? "").trim().slice(0, 240) || null : null, order_id: order.id, user_id: order.user_id, uso: j.usage });
    return { general, zonas };
  } catch (e) { console.error("calificacion ia", e); return null; }
}
const prom = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
// Proportion alone says little about how a face is perceived, so the curve is strict: an ordinary set of ratios lands near 5.5.
const armonia = (m: Obj) => {
  const ps = [...(m.medidas ?? []), ...(m.perfil?.medidas ?? [])].map((x: Obj) => x.puntaje).filter((x: unknown) => typeof x === "number");
  return ps.length ? dec(10 * Math.pow((prom(ps) as number) / 100, 2.2)) : null;
};

function estilo(tier: string, a: Obj) {
  const datos = Object.entries(a).filter(([, v]) => v !== null && v !== "" && v !== undefined).map(([k, v]) => `${k}: ${v}`).join("; ");
  return `Eres el analista de Resalta, un servicio de análisis de estética facial para México y Latinoamérica. Escribes para un cliente que ya pagó, a partir de sus fotos y de sus medidas. Algunas fotos son opcionales: si falta un ángulo, no inventes lo que no se ve y dilo cuando importe.

Datos que dio el cliente: ${datos || "ninguno"}. Plan contratado: ${tier === "hard" ? "completo" : "esencial"}.

Cómo escribir:
- Español de México, de tú, claro y directo. Nada de relleno ni de frases motivacionales.
- Nunca uses guiones largos. Usa comas o reescribe la frase.
- Que no suene a texto escrito por una máquina. Frases normales, como las diría una persona que sabe del tema.
- Habla de lo que de verdad se ve en sus fotos y en sus números, no de generalidades. Cita medidas concretas cuando apoyen lo que dices.
- Honesto y respetuoso. Puedes decir qué está fuera de rango sin insultar ni dramatizar. No infles: decirle a alguien que todo está bien cuando no lo está no le sirve.
- Ajusta las recomendaciones a lo que el cliente dijo de su presupuesto, su tiempo y si le interesan procedimientos. "presupuesto" es lo que puede gastar al mes en su cuidado diario; "presupuesto_procedimientos" es lo que puede invertir en total en procedimientos. Si un procedimiento que conviene queda fuera de ese presupuesto, dilo y ofrece primero la opción que sí le alcanza.
- Las medidas vienen de fotos de celular, así que son estimaciones. Si una foto está girada o inclinada, dilo en vez de sacar conclusiones.
- Grasa facial: si en las fotos se nota grasa acumulada en la cara (mejillas llenas, papada, mandíbula y pómulos poco marcados, cuello que se une con la barbilla) y la persona no se ve delgada, dilo con respeto y pon bajar de peso de forma gradual entre las primeras acciones: es de lo que más define la mandíbula, los pómulos y el cuello, mejora casi todas las medidas y suele cambiar más la cara que cualquier tratamiento. Antes de sugerir procedimientos para definir (rellenos de mandíbula, lipo de papada, bichectomía), aclara que primero conviene bajar de peso y ver cómo queda. Sin cifras de kilos, calorías ni dietas específicas; sugiere hacerlo con un médico o nutriólogo. Si la cara ya se ve delgada, no lo menciones.
- No diagnostiques ni recetes. Nada de medicamentos con nombre ni dosis.
- Sé concreto y breve: cada texto de dos a cuatro frases, cada acción en una frase. No pienses en voz alta ni expliques tu proceso.`;
}

// Shared look for every Resalta email: a centered rounded blue-gray panel on white, the white logo,
// white type and soft translucent cards, like resalta.co. Built for Gmail (centered wrapper, no
// collapsible percentage tables) with solid bgcolor fallbacks for Outlook desktop.
const EM_SANS = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const EM_MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
const EM_SUAVE = "rgba(255,255,255,.82)";
function emCaja(inner: string, pad = "26px 24px") {
  return `<tr><td class="cd" bgcolor="#A0AEB9" style="background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.26);border-radius:22px;padding:${pad}">${inner}</td></tr><tr><td style="height:14px;line-height:14px;font-size:0">&nbsp;</td></tr>`;
}
function emBoton(texto: string, href: string) {
  return `<tr><td align="center" style="padding:8px 0 22px"><a href="${href}" style="display:inline-block;background:#FFFFFF;color:#16191D;text-decoration:none;padding:17px 34px;border-radius:999px;font-family:${EM_SANS};font-size:16px;font-weight:600">${texto}</a></td></tr>`;
}
function emTexto(html: string) {
  return `<tr><td style="padding:0 4px 18px;font-family:${EM_SANS};font-size:17px;line-height:27px;color:#FFFFFF">${html}</td></tr>`;
}
function emShell(o: { site: string; etiqueta?: string; titulo?: string; filas: string; pie: string; preview?: string }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>Resalta</title>
<style>@media only screen and (max-width:520px){.pn{border-radius:0!important}.pi{padding:34px 18px 26px!important}.cd{padding:22px 18px!important}.ti{font-size:28px!important;line-height:34px!important}.sc{font-size:84px!important}}</style></head>
<body style="margin:0;padding:0;background:#FFFFFF;-webkit-text-size-adjust:100%">
${o.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${o.preview}</div>` : ""}
<div style="width:100%;background-color:#FFFFFF;margin:0;padding:0"><center style="width:100%;table-layout:fixed;background-color:#FFFFFF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FFFFFF" style="width:100%;min-width:100%;background:#FFFFFF"><tr><td align="center" valign="top" style="padding:32px 0;text-align:center">
<table role="presentation" class="pn" align="center" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#97A6B2" style="margin:0 auto;width:100%;max-width:600px;background-color:#97A6B2;background-image:linear-gradient(180deg,#8B9BA8 0%,#A9B6C0 100%);border-radius:28px">
<tr><td class="pi" style="padding:44px 36px 26px;text-align:left">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center" style="padding:0 0 ${o.etiqueta || o.titulo ? 30 : 34}px"><a href="${o.site}" style="text-decoration:none"><img src="${o.site}/assets/img/email/logo-blanco.png" width="136" height="38" alt="resalta" style="display:block;border:0;width:136px;height:38px"></a></td></tr>
    ${o.etiqueta ? `<tr><td align="center" style="padding:0 0 16px"><span style="display:inline-block;font-family:${EM_MONO};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFFFFF;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);border-radius:999px;padding:8px 16px">${o.etiqueta}</span></td></tr>` : ""}
    ${o.titulo ? `<tr><td align="center" class="ti" style="padding:0 0 28px;font-family:${EM_SANS};font-size:34px;line-height:40px;font-weight:300;letter-spacing:-.02em;color:#FFFFFF">${o.titulo}</td></tr>` : ""}
    ${o.filas}
  </table>
</td></tr></table>
<table role="presentation" align="center" width="600" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;width:100%;max-width:600px"><tr><td align="center" style="padding:20px 24px 8px;font-family:${EM_SANS};font-size:13px;line-height:20px;color:#5B6470">${o.pie}</td></tr></table>
</td></tr></table></center></div></body></html>`;
}


// Email tracking: each email gets a row in correos_log (sent, opened, clicked), a 1px open image and
// resalta.co links that pass through the 'correo' function. Admin > Correos reads it.
// deno-lint-ignore no-explicit-any
async function registrarCorreo(db: any, datos: { email: string; tipo: string; secuencia?: string | null; paso?: number | null; asunto: string }) {
  try {
    const { data } = await db.from("correos_log").insert({ ...datos, email: datos.email.toLowerCase() }).select("id").single();
    return (data?.id as string | undefined) ?? undefined;
  } catch { return undefined; }
}
function rastrear(html: string, id?: string) {
  if (!id) return html;
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/correo`;
  const con = html.replace(/href="(https:\/\/(?:www\.)?resalta\.co[^"]*)"/g, (_m, u: string) => `href="${base}?a=c&amp;i=${id}&amp;u=${encodeURIComponent(u.replace(/&amp;/g, "&"))}"`);
  const px = `<img src="${base}?a=o&amp;i=${id}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0">`;
  return con.includes("</body>") ? con.replace("</body>", px + "</body>") : con + px;
}
// deno-lint-ignore no-explicit-any
async function cerrarCorreo(db: any, id: string | undefined, ok: boolean) {
  if (id) { try { await db.from("correos_log").update({ ok }).eq("id", id); } catch { /* ignore */ } }
}

// "Your analysis is ready" email, through Sender. Secret: SENDER_API_KEY (without it nothing is sent).
// deno-lint-ignore no-explicit-any
async function avisarListo(db: any, email: string, nombre: string, general: unknown, tier = "soft") {
  const key = Deno.env.get("SENDER_API_KEY");
  if (!key) return;
  const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const primero = nombre.trim().split(/\s+/)[0] || "";
  const nota = typeof general === "number" ? emCaja(`<div style="text-align:center"><div style="font-family:${EM_MONO};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7)">Calificación general</div>
    <div class="sc" style="margin-top:10px;font-family:${EM_SANS};font-size:96px;line-height:1;font-weight:300;letter-spacing:-.045em;color:#FFFFFF">${general.toFixed(1)}<span style="font-size:24px;letter-spacing:0;color:${EM_SUAVE}">&nbsp;/ 10</span></div></div>`, "32px 24px 30px") : "";
  const html = emShell({
    site, etiqueta: "Tu análisis facial", titulo: `${primero ? esc(primero) + ", tu" : "Tu"} análisis está listo`,
    preview: "Tus puntajes por zona, qué cambiar primero y tu plan paso a paso.",
    filas: emTexto(`<div style="text-align:center;color:${EM_SUAVE}">Ya revisamos tus fotos y tus medidas. En tu panel tienes tus puntajes por zona, lo que más te conviene cambiar primero y tu plan paso a paso.</div>`)
      + nota + emBoton("Ver mi análisis", `${site}/panel?utm_source=email&utm_medium=reporte&utm_campaign=listo`)
      + emTexto(`<div style="text-align:center;font-size:14px;line-height:22px;color:${EM_SUAVE}">Entra con el mismo correo con el que compraste. Tu análisis se queda guardado en tu cuenta.</div>`)
      + emCaja(`<div style="text-align:center;font-size:15px;line-height:24px;color:#FFFFFF"><b>Siguiente paso: mide tu avance.</b><br>${tier === "hard" ? "Tu Plan Completo incluye tu primer mes de seguimiento: un escaneo nuevo cada mes, tu progreso y tu plan de nutrición y ejercicio. Lo activas desde tu cuenta." : "Con el seguimiento mensual haces un escaneo nuevo cada mes, ves tu progreso y recibes tu plan de nutrición y ejercicio. Lo activas desde tu cuenta cuando quieras."}</div>`, "22px 22px"),
    pie: "Resalta · resalta.co<br>Si tienes dudas, responde a este correo.",
  });
  const asunto = primero ? `${primero}, tu análisis facial está listo` : "Tu análisis facial está listo";
  const idc = await registrarCorreo(db, { email, tipo: "listo", asunto });
  try {
    const r = await fetch("https://api.sender.net/v2/message/send", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" }, to: { email, name: primero || email },
        subject: asunto, html: rastrear(html, idc) }),
    });
    await cerrarCorreo(db, idc, r.ok);
    if (!r.ok) console.error("sender listo", r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error("sender listo", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const body = await req.json();
    const { data: order } = await userClient.from("orders")
      .select("id,user_id,status,tier,answers,medidas").eq("id", body.order_id).single();
    if (!order) return json({ error: "Pedido no encontrado" }, 404);
    if (order.status !== "pagado" && order.status !== "listo") return json({ error: "Este pedido todavía no está pagado" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ahora = new Date().toISOString();

    // The customer moved landmarks by hand: keep the new measurements and update the harmony score.
    if (body.accion === "ajustar") {
      const vista = body.vista === "perfil" ? "perfil" : "frente", m = body.datos;
      const ok = m && Array.isArray(m.medidas) && m.medidas.length > 3 && m.medidas.length < 80 && m.resumen && m.caja && JSON.stringify(m).length < 150000
        && m.medidas.every((x: Obj) => x && typeof x.id === "string" && typeof x.puntaje === "number" && x.puntaje >= 0 && x.puntaje <= 100);
      if (!ok || !order.medidas?.medidas) return json({ error: "datos" }, 400);
      const nuevas: Obj = vista === "perfil" ? { ...order.medidas, perfil: m } : { ...m, perfil: order.medidas.perfil };
      if (!nuevas.perfil) delete nuevas.perfil;
      nuevas.ajustado = ahora;
      await admin.from("orders").update({ medidas: nuevas }).eq("id", order.id);
      const { data: rp } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
      // with the AI rating the overall score doesn't depend on the landmarks, so moving them changes nothing here
      if (rp?.data?.puntajes && !rp.data.zonas_ia) {
        const pz: Obj = { ...rp.data.puntajes, armonia: armonia(nuevas) };
        const vals = ["armonia", "angularidad", "dimorfismo", "rasgos"].map((k) => pz[k]).filter((x) => typeof x === "number" && x > 0) as number[];
        pz.general = vals.length ? dec(Math.pow(vals.reduce((s2, x) => s2 * x, 1), 1 / vals.length)) : pz.general;
        await admin.from("reports").update({ data: { ...rp.data, puntajes: pz } }).eq("order_id", order.id);
        return json({ ok: true, puntajes: pz });
      }
      return json({ ok: true });
    }

    // Already written for this plan and this version: hand it back instead of paying for it twice.
    const { data: previo } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    const pd = previo?.data ?? null;
    const vigente = pd?.resumen && pd.v === VERSION && !(order.tier === "hard" && pd.tier !== "hard");
    if (vigente && pd.estado !== "generando") return json({ ok: true, data: pd });
    if (pd?.estado === "generando" && Date.now() - Date.parse(pd.desde) < 200000) return json({ ok: true, generando: true });

    // Orders paid before measuring existed can send the measurements now, once.
    if (!order.medidas?.medidas?.length) {
      const m = body.medidas;
      const valido = m && Array.isArray(m.medidas) && m.medidas.length > 5 && m.medidas.length < 80 && m.resumen?.zonas && m.caja && JSON.stringify(m).length < 150000;
      if (!valido) return json({ error: "sin_medidas" }, 400);
      await admin.from("orders").update({ medidas: m }).eq("id", order.id);
      order.medidas = m;
    }
    if (!order.medidas.perfil && body.perfil) {
      const pf = body.perfil;
      if (Array.isArray(pf.medidas) && pf.medidas.length > 3 && pf.medidas.length < 60 && pf.caja && JSON.stringify(pf).length < 80000) {
        order.medidas = { ...order.medidas, perfil: pf };
        await admin.from("orders").update({ medidas: order.medidas }).eq("id", order.id);
      }
    }

    // Claim the job so two open tabs don't each pay for a report.
    const viejo = pd?.resumen ? pd : null;
    const marca = { ...(viejo ?? {}), estado: "generando", desde: ahora };
    if (!previo) {
      const { error } = await admin.from("reports").insert({ order_id: order.id, user_id: order.user_id, data: marca });
      if (error) return json({ ok: true, generando: true });
    } else {
      await admin.from("reports").update({ data: marca }).eq("order_id", order.id);
    }
    const fallar = (motivo: string) => admin.from("reports").update({ data: { ...(viejo ?? {}), estado: "error", motivo, desde: new Date().toISOString() } }).eq("order_id", order.id);

    const trabajo = (async () => {
      try {
        const imagenes: unknown[] = [], vistas: string[] = [];
        await Promise.all(FOTOS.map(async ([slot, etiqueta], i) => {
          const { data: file } = await admin.storage.from("fotos").download(`${order.user_id}/${order.id}/${slot}.jpg`);
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          let bin = ""; for (let j = 0; j < bytes.length; j += 8192) bin += String.fromCharCode(...bytes.subarray(j, j + 8192));
          imagenes[i] = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } }; vistas[i] = etiqueta;
        }));
        const fotos = imagenes.filter(Boolean), nombres = vistas.filter(Boolean);
        if (!fotos.length) { await fallar("sin_fotos"); return; }
        // Only score and describe what the photos show: no smile photo means no smile section, and the same for
        // the three-quarter views (both are optional now).
        const tiene = new Set(FOTOS.filter((_, i) => imagenes[i]).map(([slot]) => slot));
        const conSonrisa = tiene.has("sonrisa"), conTq = tiene.has("tres_cuartos_izq") || tiene.has("tres_cuartos_der");
        const CAT = Object.fromEntries(Object.entries(CATALOGO).filter(([id]) => (id !== "sonrisa" || conSonrisa) && (id !== "tres_cuartos" || conTq)));
        const ids = Object.values(CAT).flatMap((g) => Object.keys(g.items));
        const tEval: Obj = JSON.parse(JSON.stringify(T_EVAL));
        const ev0 = tEval.input_schema.properties.evaluaciones; ev0.minItems = ids.length; ev0.maxItems = ids.length; ev0.items.properties.id.enum = ids;
        const tZonas: Obj = JSON.parse(JSON.stringify(T_ZONAS));
        for (const [k, ok] of [["sonrisa", conSonrisa], ["tres_cuartos", conTq]] as [string, boolean][]) {
          if (ok) continue;
          delete tZonas.input_schema.properties[k];
          tZonas.input_schema.required = tZonas.input_schema.required.filter((x: string) => x !== k);
        }
        const angulos = ["perfil", ...(conSonrisa ? ["sonrisa"] : []), ...(conTq ? ["tres cuartos"] : [])];

        const m = order.medidas;
        const fueraTxt = ZONAS_IA.map(([id, n]) => {
          const xs = (m.medidas ?? []).filter((x: Obj) => x.zona === id && x.estado && x.estado !== "dentro"); if (!xs.length) return "";
          return `${n}: ` + xs.map((x: Obj) => `${x.nombre} (${x.valor}${x.unidad ?? ""}, referencia ${x.rango[0]} a ${x.rango[1]})`).join("; ");
        }).filter(Boolean).join("\n");
        const fotosIA = [imagenes[0], imagenes[2] ?? imagenes[3]].filter(Boolean) as Obj[];
        const cal = await calificacionIA(admin, order, fotosIA, ""); // rated from the photos only, like the calificar function
        const fila = (x: Obj) => `${x.nombre} (${x.zona}): ${x.valor}${x.unidad ?? ""} | referencia ${x.rango[0]} a ${x.rango[1]} | ${x.estado} | ${dec(x.puntaje / 10)}/10`;
        const datos = `Fotos, en este orden: ${nombres.join("; ")}.

Medidas de frente:
${m.medidas.map(fila).join("\n")}
${m.perfil?.medidas?.length ? `\nMedidas de perfil (tomadas de la silueta; los milímetros son aproximados):\n${m.perfil.medidas.map(fila).join("\n")}` : "\nNo hay medidas de perfil para este pedido."}
${m.avisos?.length ? `\nAvisos de calidad de la foto de frente: ${m.avisos.join(" ")}` : ""}
${cal ? `\nCalificación de Resalta, ya fijada y que el cliente ya vio: ${cal.general.toFixed(1)}/10 en general (en la escala que ve el cliente, 5 es el promedio, así que un 6 se lee como un poco arriba del promedio). Por zona: ${ZONAS_IA.map(([k, n]) => `${n} ${Number(cal.zonas[k]).toFixed(1)}`).join(", ")}.
Todo lo que escribas y califiques tiene que ser coherente con esa calificación: tus puntajes por rasgo deben promediar cerca de ${cal.general.toFixed(1)}, las zonas más bajas son las que más le restan y el potencial parte de ese número. No des otra calificación general distinta. Las medidas son estimaciones de una foto de celular: si una medida sale fuera de rango pero en la foto no se nota, dale más peso a lo que se ve.` : ""}`;

        const sistema = estilo(order.tier, order.answers ?? {});
        const inicio = Date.now();
        const pedir = async (tool: Obj, instruccion: string, valido: (r: Obj) => boolean, max: number) => {
          // a second try only if the first one failed fast, so the whole job fits in the time the server allows
          for (let intento = 0; intento < 2 && (intento === 0 || Date.now() - inicio < 45000); intento++) {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
              body: JSON.stringify({
                model: MODELO, max_tokens: max, system: sistema, tools: [tool], tool_choice: { type: "auto" },
                messages: [{ role: "user", content: [...fotos, { type: "text", text: `${datos}\n\n${instruccion}\n\nEntrega el resultado llamando a la herramienta ${tool.name}. No escribas nada fuera de la herramienta.` }] }]
              })
            });
            if (!r.ok) { console.error("anthropic", tool.name, r.status, (await r.text()).slice(0, 400)); continue; }
            const resp = await r.json();
            const bloque = (resp.content ?? []).find((c: Obj) => c.type === "tool_use");
            let input: Obj | null = bloque ? limpiar(bloque.input) : null;
            if (!input) { // some models answer with the JSON as text instead of calling the tool
              const t = (resp.content ?? []).filter((c: Obj) => c.type === "text").map((c: Obj) => c.text).join("");
              const obj = t.indexOf("{") >= 0 ? parsear(t.slice(t.indexOf("{"))) : null;
              if (obj && typeof obj === "object") input = limpiar(obj as Obj);
            }
            if (input && valido(input)) return { input, usage: resp.usage ?? null };
            console.warn("respuesta incompleta", tool.name, resp.stop_reason, JSON.stringify(resp.usage ?? {}));
          }
          return null;
        };

        const [ev, pr, zo, es] = await Promise.all([
          pedir(tEval, `Califica de 0 a 10 cada uno de estos rasgos a partir de las fotos, uno por cada id, sin saltarte ninguno:
${Object.values(CAT).map((g) => `${g.titulo}: ${Object.entries(g.items).map(([id, n]) => `${id} (${n})`).join(", ")}`).join("\n")}

Escala: la misma de la calificación de Resalta, que es generosa. Una persona común de su edad y sexo saca alrededor de 6 y la mayoría de la gente queda entre 5 y 7. Un 7.5 ya destaca, un 8.5 es poco común y un 9 es nivel de modelo profesional. Al cliente se le dice que 5 es el promedio, así que a un 6 nunca le digas promedio: es un poco arriba del promedio. Sé estricto y usa decimales; no regales puntos. Más alto siempre es mejor (por ejemplo, en acné un 9 es piel limpia).
En dimorfismo, califica qué tanto ese rasgo se acerca a lo que se percibe como atractivo para su sexo. Si un rasgo no aplica o no se alcanza a ver (por ejemplo vello facial en una mujer, o cabello tapado), pon 6 y dilo en la nota.`, (r: Obj) => hay(r.evaluaciones) && r.evaluaciones.length >= ids.length * 0.8, 12000),
          pedir(T_PRINCIPAL, `Escribe la parte principal del reporte: resumen, arquetipo, fortalezas, prioridades y plan por fases.${order.tier === "hard"
            ? " Incluye también avanzado: procedimientos estéticos que se suelen considerar para un rostro con estas proporciones, qué hace cada uno y qué pensar antes. Preséntalo como información general que debe evaluar un médico certificado, no como una recomendación tuya, y di cuando algo no parece indicado."
            : " No llenes avanzado, este cliente tiene el plan esencial."}`, okPrincipal, 12000),
          pedir(tZonas, `Escribe la lectura zona por zona y las de ${angulos.join(", ").replace(/, ([^,]*)$/, " y $1")}.${conSonrisa ? "" : " No hay foto sonriendo: no opines sobre dientes ni sonrisa."}`, okZonas, 12000),
          pedir(T_ESTILO, `Escribe piel, color personal y cabello, barba, cejas y lentes. Además: longevidad (edad visual contra su edad real de ${(order.answers ?? {}).edad || "?"} años, y la que podría aparentar con su plan) y potencial (calificación realista que podría alcanzar en general y en cada grupo, en la misma escala de su calificación; el potencial casi nunca sube más de 1.5 puntos sin procedimientos).${order.tier === "hard" ? " Incluye general_hard." : " No llenes general_hard."}`, okEstilo, 12000),
        ]);
        if (!pr) { await fallar("modelo"); return; }

        // group the scored items and work out the pillars
        const porId: Obj = {};
        for (const e of (ev?.input.evaluaciones ?? [])) if (e && IDS.includes(e.id) && typeof e.puntaje === "number") porId[e.id] = e;
        const grupos = Object.entries(CATALOGO).map(([id, g]) => {
          const items = Object.entries(g.items).filter(([k]) => porId[k]).map(([k, nombre]) => ({ id: k, nombre, puntaje: dec(Math.max(0, Math.min(10, porId[k].puntaje))), nota: String(porId[k].nota ?? "") }));
          return { id, titulo: g.titulo, pilar: g.pilar, puntaje: items.length ? dec(prom(items.map((x) => x.puntaje)) as number) : null, items };
        }).filter((g) => g.items.length);
        const pilar = (p: string) => { const xs = grupos.filter((g) => g.pilar === p).flatMap((g) => g.items.map((x) => x.puntaje)); return xs.length ? dec(prom(xs) as number) : null; };
        const zIA = cal ? ZONAS_IA.map(([k]) => Number(cal.zonas[k])).filter((x) => x > 0) : [];
        const puntajes: Obj = { armonia: zIA.length ? dec(prom(zIA) as number) : armonia(m), angularidad: pilar("angularidad"), dimorfismo: pilar("dimorfismo"), rasgos: pilar("rasgos") };
        const vals = Object.values(puntajes).filter((x) => typeof x === "number" && x > 0) as number[];
        // the overall is the AI rating they already saw; without it, close to a geometric mean of the pillars
        puntajes.general = cal ? cal.general : vals.length ? dec(Math.pow(vals.reduce((s, x) => s * x, 1), 1 / vals.length)) : null;
        const nMedidas = (m.medidas?.length ?? 0) + (m.perfil?.medidas?.length ?? 0);

        const data: Obj = { ...pr.input, ...(zo?.input ?? {}), ...(es?.input ?? {}), grupos, puntajes, ...(cal ? { zonas_ia: cal.zonas } : {}), evaluaciones: nMedidas + Object.keys(porId).length,
          v: VERSION, tier: order.tier, modelo: MODELO, generado: new Date().toISOString(), uso: [ev?.usage, pr.usage, zo?.usage, es?.usage], segundos: Math.round((Date.now() - inicio) / 1000) };
        if (order.tier !== "hard") { delete data.avanzado; if (data.potencial) delete data.potencial.general_hard; }
        await admin.from("reports").update({ data }).eq("order_id", order.id);
        const { data: entregado } = await admin.from("orders").update({ status: "listo", delivered_at: new Date().toISOString() }).eq("id", order.id).eq("status", "pagado").select("id");
        // first delivery only: let them know by email, in case they closed the page while it was being written
        if (entregado?.length && user.email) await avisarListo(admin, user.email, String((order.answers ?? {}).nombre || user.user_metadata?.full_name || ""), puntajes.general, String(order.tier || "soft"));
      } catch (e) {
        console.error(e);
        await fallar("excepcion");
      }
    })();

    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) { rt.waitUntil(trabajo); return json({ ok: true, generando: true }); }
    await trabajo;
    const { data: fin } = await admin.from("reports").select("data").eq("order_id", order.id).maybeSingle();
    return fin?.data?.resumen && fin.data.estado !== "error" ? json({ ok: true, data: fin.data }) : json({ error: "No pudimos generar tu reporte en este momento" }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos generar tu reporte en este momento" }, 500);
  }
});
