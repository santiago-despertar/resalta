// Chat about the customer's own results. The report, measurements, answers and their body plan (if any) go in the system prompt.
// Secrets: ANTHROPIC_API_KEY, ANTHROPIC_CHAT_MODEL (optional, default claude-haiku-5-5), SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODELO = Deno.env.get("ANTHROPIC_CHAT_MODEL") ?? "claude-haiku-5-5";
const LIMITE_DIA = 40;
type Obj = Record<string, any>;

function medidasTexto(m: Obj | null) {
  if (!m) return "";
  const fila = (x: Obj) => `${x.nombre}: ${x.valor}${x.unidad || ""} (rango ideal ${Array.isArray(x.rango) ? x.rango.join(" a ") : "?"}, ${Math.round(x.puntaje) / 10}/10)`;
  const frente = (m.medidas || []).map(fila).join("\n");
  const perfil = ((m.perfil || {}).medidas || []).map(fila).join("\n");
  return `Medidas de frente:\n${frente}${perfil ? `\n\nMedidas de perfil:\n${perfil}` : ""}`;
}

function reporteTexto(r: Obj) {
  const copia = { ...r };
  for (const k of ["uso", "modelo", "segundos", "estado", "desde", "v"]) delete copia[k];
  // evaluated items without the long arrays of numbers
  if (Array.isArray(copia.evaluaciones)) delete copia.evaluaciones;
  return JSON.stringify(copia);
}

// The body plan (panel > Cuerpo), condensed, so the chat can answer food and training questions from it.
function planCuerpoTexto(p: Obj | null) {
  if (!p) return "";
  const L = (v: unknown) => (Array.isArray(v) ? v : []) as Obj[];
  const N = p.numeros || {}, M = p.metas || {}, E = p.entreno || {};
  const recetas = L(p.recetas).map((r) => `${r.id} (${r.momento}) ${r.nombre}: ${r.kcal} kcal, ${r.prot} g proteína. Ingredientes: ${L(r.ingredientes).join("; ")}`).join("\n");
  const ent = L(E.dias).map((d) => `${d.dia} · ${d.enfoque}: ${L(d.ejercicios).map((e) => `${e.nombre} (${L(e.semanas).join(" / ") || [e.series, e.reps].filter(Boolean).join("x")})`).join(", ")}`).join("\n");
  const comidasV1 = L(p.comidas).map((c) => `${c.momento}: ${L(c.opciones).join(" | ")}`).join("\n");
  return `\n\nSU PLAN DE NUTRICIÓN Y EJERCICIO DE ESTE MES (pestaña Cuerpo de su cuenta):
Objetivos diarios: ${N.kcal} kcal, ${N.prot} g proteína, ${N.carbs} g carbohidratos, ${N.grasa} g grasa, ${N.agua} L de agua. Ritmo: ${N.ritmo || M.ritmo || ""}. Meta del mes: ${M.peso || ""}. ${M.cara || ""}
Resumen: ${p.resumen || ""}
${recetas ? `Recetas (el menú de las 4 semanas rota estas):\n${recetas}` : comidasV1}
${L(p.cambios).length ? `Cambios permitidos: ${L(p.cambios).join("; ")}` : ""}
Entrenamiento (series x repeticiones por semana 1/2/3/4):\n${ent}
Cardio: ${L(E.cardio).join(" / ") || E.cardio || ""}. Progresión: ${E.progresion || ""}
Hábitos: ${L(p.habitos).join("; ")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id || "");

    // the user's own order and report only (RLS on the user's client)
    const { data: order } = await supabase.from("orders").select("id,tier,answers,medidas,status,paid_at").eq("id", orderId).maybeSingle();
    if (!order || !["pagado", "listo"].includes(order.status)) return json({ error: "Pedido no válido" }, 400);

    if (body.accion === "historial") {
      const { data } = await admin.from("chat").select("rol,texto,creado").eq("order_id", orderId).eq("user_id", user.id).order("id", { ascending: true }).limit(60);
      return json({ mensajes: data ?? [] });
    }

    // The chat is part of the Plan Completo; Esencial orders paid before 17-nov-2026 keep it.
    if (order.tier === "soft" && !(order.paid_at && new Date(order.paid_at) < new Date("2026-11-17T06:00:00Z")))
      return json({ error: "El chat viene con el plan Completo" }, 403);

    const texto = String(body.mensaje || "").trim().slice(0, 1500);
    if (!texto) return json({ error: "Mensaje vacío" }, 400);

    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("chat").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("rol", "user").gte("creado", desde);
    if ((count ?? 0) >= LIMITE_DIA) return json({ error: "limite", texto: "Llegaste al límite de preguntas por hoy. Mañana puedes seguir." }, 429);

    const { data: rep } = await supabase.from("reports").select("data").eq("order_id", orderId).maybeSingle();
    if (!rep?.data?.resumen) return json({ error: "Tu reporte todavía no está listo" }, 400);

    // Both rows of a turn are saved in one insert with the same timestamp, so order by id (insertion order), not by time.
    const { data: previos } = await admin.from("chat").select("rol,texto").eq("order_id", orderId).eq("user_id", user.id).order("id", { ascending: false }).limit(16);
    // Keep only complete question/answer pairs, starting with a question, so the model answers just the new one.
    const historia: { role: string; content: string }[] = [];
    for (const m of (previos ?? []).reverse()) {
      const role = m.rol === "user" ? "user" : "assistant";
      if (!historia.length && role !== "user") continue;
      if (historia.length && historia[historia.length - 1].role === role) historia[historia.length - 1] = { role, content: m.texto };
      else historia.push({ role, content: m.texto });
    }
    if (historia.length && historia[historia.length - 1].role === "user") historia.pop();

    const { data: fis } = await admin.from("fisico").select("plan").eq("user_id", user.id).eq("estado", "listo").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const plan = planCuerpoTexto(fis?.plan ?? null);
    const a = order.answers || {};
    const avanzado = order.tier === "hard";
    const sistema = `Eres el asesor de Resalta, un servicio de análisis estético facial. Hablas con un cliente sobre SU reporte, que ya pagó y ya leyó.

Cómo respondes:
- Español de México, tono cercano y directo, como un asesor que sabe del tema. Tutea.
- Respuestas cortas: 2 a 6 frases, o una lista breve si de verdad ayuda. Nada de introducciones ni de repetir la pregunta.
- No uses guiones largos (el carácter "—"). Usa comas o puntos.
- Basa todo en los datos de abajo: sus medidas, puntajes y el reporte. Cita números concretos cuando sirvan.
- La escala es de 0 a 10 y 5 es el promedio. Sé honesto: no infles ni consueles con mentiras, pero tampoco seas cruel.
- Si pregunta algo que los datos no cubren, dilo y da la mejor orientación general que puedas.
- Cortes, barba, cuidado de piel, ejercicio de cuello, postura, lentes, ropa y hábitos: da recomendaciones concretas.
- ${avanzado ? "Tiene el plan completo: puedes hablar de tratamientos médicos y procedimientos (rellenos, rinoplastia, implantes, etc.) como información general, con rangos realistas, y siempre recomendar consultarlo con un médico certificado." : "Tiene el plan esencial: sobre procedimientos médicos o cirugía da solo información muy general y dile que el plan completo incluye esa parte en detalle. Recomienda consultar a un médico certificado."}
- Grasa facial: si en las fotos se nota grasa acumulada en la cara (mejillas llenas, papada, mandíbula y pómulos poco marcados, cuello que se une con la barbilla) y la persona no se ve delgada, dilo con respeto y pon bajar de peso de forma gradual entre las primeras acciones: es de lo que más define la mandíbula, los pómulos y el cuello, mejora casi todas las medidas y suele cambiar más la cara que cualquier tratamiento. Antes de sugerir procedimientos para definir (rellenos de mandíbula, lipo de papada, bichectomía), aclara que primero conviene bajar de peso y ver cómo queda. Sin cifras de kilos, calorías ni dietas específicas; sugiere hacerlo con un médico o nutriólogo. Si la cara ya se ve delgada, no lo menciones.
- No diagnosticas enfermedades. Si menciona algo médico (dolor, lesiones, cambios raros en la piel), recomiéndale ver a un médico.
- Simulaciones: si pregunta cómo se vería con un cambio de su cara (un procedimiento, bajar de peso, mejor piel, menos ojeras), contesta normal y al final agrega una sola línea, sola, con este formato exacto: SIM {"vista":"frente","claves":{"mandibula":3},"magro":false,"extras":[]}
  Esa línea crea un botón para que vea el resultado en su foto. "vista" es "frente" o "perfil". En "claves" usa solo estas, con milímetros entre -6 y 6 (positivo es lo que dice "más"):
  frente: menton_largo (mentón más largo), menton_ancho (mentón más ancho), mandibula (mandíbula más ancha), pomulos (pómulos más anchos), nariz_ancho (nariz más ancha), nariz_punta (punta más abajo; negativo la sube), labios (labios más gruesos), boca_ancho (boca más ancha), boca_altura (labio superior más largo; negativo es lip lift), cejas_altura (cejas más altas), cejas_cola (cola de ceja más alta), ojos (ojos más rasgados).
  perfil: menton_proy (mentón más adelante), menton_vert (mentón más largo), cuello (línea bajo el mentón más definida), nariz_proy (punta más proyectada), nariz_rot (punta más arriba), nariz_dorso (más giba; negativo la quita), labios_proy (labios más adelante), ceja (arco de ceja más marcado).
  "magro": true si es bajar de peso o grasa en la cara. "extras": "piel" para piel más limpia, "ojeras" para ojeras corregidas. Usa valores realistas para su cara. Si la pregunta no es sobre verse con un cambio, no agregues la línea.
${plan ? `- Tiene un plan de nutrición y ejercicio (abajo). Contesta con gusto cualquier pregunta de comida, recetas, sustituciones, porciones, calorías, súper, ejercicios, técnica o progresión usando ese plan: qué cenar si le falta algo (propón otra receta de su plan o un cambio con calorías y proteína parecidas), cuántas calorías tiene algo, cómo hacer un ejercicio. Cita sus recetas por nombre y respeta sus calorías y lo que no come. Aquí sí puedes dar cifras de calorías y porciones porque vienen de su plan.
` : ""}- Si pide algo que no tiene que ver con su cara, su imagen, su reporte${plan ? " o su plan de nutrición y ejercicio" : ""}, regrésalo amablemente al tema.

Datos del cliente: sexo ${a.sexo || "no indicado"}, edad ${a.edad || "no indicada"}, país ${a.pais || "no indicado"}, objetivo "${a.objetivo || ""}", presupuesto ${a.presupuesto || "no indicado"}, rutina actual "${a.rutina || ""}", procedimientos previos "${a.procedimientos || ""}", notas "${a.notas || ""}".

${medidasTexto(order.medidas)}

Reporte completo (JSON):
${reporteTexto(rep.data)}${plan}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 900,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        messages: [...historia, { role: "user", content: texto }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 400)); return json({ error: "No pude responder ahorita" }, 502); }
    const out = await r.json();
    const respuesta = (out.content || []).filter((c: Obj) => c.type === "text").map((c: Obj) => c.text).join("\n").replace(/—/g, ", ").trim();
    if (!respuesta) return json({ error: "No pude responder ahorita" }, 502);

    await admin.from("chat").insert([
      { user_id: user.id, order_id: orderId, rol: "user", texto },
      { user_id: user.id, order_id: orderId, rol: "assistant", texto: respuesta },
    ]);
    return json({ respuesta, quedan: LIMITE_DIA - (count ?? 0) - 1 });
  } catch (e) {
    console.error(e);
    return json({ error: "No pude responder ahorita" }, 500);
  }
});
