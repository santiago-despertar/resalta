// AI face rating: the one number Resalta gives a face. Claude Sonnet looks at the photo(s) and returns an
// overall score on a strict 0-10 scale (5 = average person) plus a score for each of the six zones the
// measurements use. The same saved result is shown in the free rating, the onboarding preview and the report,
// so a person never sees two different numbers.
// Each photo is hashed: the same photo always gets the same result and is only paid for once.
// Calls from one IP are capped so the free rating can't be used to run up the bill.
// Secrets: ANTHROPIC_API_KEY. Table: calificaciones (service role only).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODELO = "claude-sonnet-5-5";
const POR_HORA = 12, POR_DIA = 30;
// bump when the rating prompt changes, so cached results from the old prompt are not reused
const RUBRICA = "v6";

export const ZONAS: [string, string][] = [
  ["proporciones", "Proporciones"], ["ojos", "Ojos"], ["nariz", "Nariz"],
  ["boca", "Boca y labios"], ["mandibula", "Mandíbula y mentón"], ["simetria", "Simetría"],
];

const SISTEMA = `Eres el evaluador de atractivo facial de Resalta. Calificas qué tan atractiva se percibe una cara.
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

const TOOL = {
  name: "calificacion", description: "Entrega la calificación.",
  input_schema: {
    type: "object", required: ["es_cara", "calidad", "general", "zonas", "razon"],
    properties: {
      es_cara: { type: "boolean", description: "Hay una cara humana real y visible." },
      calidad: { type: "string", enum: ["buena", "regular", "mala"] },
      general: { type: "number", minimum: 0, maximum: 10 },
      zonas: { type: "object", required: ZONAS.map((z) => z[0]), properties: Object.fromEntries(ZONAS.map(([k]) => [k, { type: "number", minimum: 0, maximum: 10 }])) },
      razon: { type: "string", description: "Una frase en español, en segunda persona: qué sube y qué baja la calificación." },
      nota_fotos: { type: "string", description: "Solo si calidad es regular: qué de la foto puede estar bajando la calificación, en una frase en segunda persona. Vacío si la foto está bien." },
    },
  },
};

const dec = (x: number) => Math.round(x * 10) / 10;
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
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function calificarFotos(fotos: string[], medidas: string) {
  const content = [
    ...fotos.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } })),
    { type: "text", text: (fotos.length > 1 ? "Son fotos de la misma persona: la primera de frente, la otra de perfil. " : "") +
      "Califica esta cara. Responde solo llamando a la herramienta calificacion, sin texto aparte." + (medidas ? `\n\nMedidas de su foto de frente fuera del rango de referencia, por zona:\n${medidas}` : "") },
  ];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODELO, max_tokens: 3000, temperature: 0, system: SISTEMA, tools: [TOOL], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("anthropic " + JSON.stringify(j).slice(0, 300));
  const t = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!t) throw new Error("sin respuesta");
  const x = t.input;
  const zonas = Object.fromEntries(ZONAS.map(([k]) => [k, dec(curva(Math.max(0, Math.min(10, Number(x.zonas?.[k]) || 0))))]));
  return {
    es_cara: x.es_cara !== false, calidad: ["buena", "regular", "mala"].includes(x.calidad) ? x.calidad : "regular",
    general: dec(curva(Math.max(0, Math.min(10, Number(x.general) || 0)))), zonas, razon: String(x.razon ?? "").slice(0, 400),
    nota_fotos: x.calidad === "regular" ? String(x.nota_fotos ?? "").trim().slice(0, 240) || null : null, uso: j.usage,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const fotos = (Array.isArray(b.fotos) ? b.fotos : []).slice(0, 2).map((f: unknown) => String(f ?? "").replace(/^data:image\/jpeg;base64,/, ""))
      .filter((f: string) => /^[A-Za-z0-9+/=]+$/.test(f) && f.length > 2000 && f.length < 1_500_000);
    if (!fotos.length) return json({ error: "Falta la foto" }, 400);
    const origen = b.order_id ? "onboarding" : "gratis";
    // the measurements are not sent to the model: they are estimates from a phone photo and pulled good faces down
    const medidas = "";

    // onboarding: the order has to belong to whoever is calling
    let orderId: string | null = null, userId: string | null = null;
    if (b.order_id) {
      const auth = req.headers.get("Authorization") ?? "";
      const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: ud } = await u.auth.getUser();
      const { data: o } = await u.from("orders").select("id,user_id").eq("id", String(b.order_id)).maybeSingle();
      if (!o || !ud?.user || o.user_id !== ud.user.id) return json({ error: "Pedido no encontrado" }, 403);
      orderId = o.id; userId = ud.user.id;
    }

    // Same photo, same result, no new charge. foto_id is the SHA-256 of the original front photo file, computed in the
    // browser by every flow (free rating, beauty test, onboarding), so the same picture gets the same number everywhere.
    const fotoId = /^[0-9a-f]{64}$/.test(String(b.foto_id ?? "")) ? String(b.foto_id) : null;
    const hash = await sha(RUBRICA + "|" + (fotoId ? "foto:" + fotoId : fotos.join("|")));
    const { data: hecho } = await admin.from("calificaciones").select("id,general,zonas,razon,calidad,nota_fotos,order_id").eq("hash", hash).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (hecho && hecho.general == null) return json({ ok: false, motivo: hecho.calidad === "mala" ? "foto_mala" : hecho.calidad });
    if (hecho) {
      if (orderId && hecho.order_id !== orderId) {
        const { data: copia } = await admin.from("calificaciones").insert({ hash, modelo: MODELO, origen, general: hecho.general, zonas: hecho.zonas, razon: hecho.razon, calidad: hecho.calidad, nota_fotos: hecho.nota_fotos, order_id: orderId, user_id: userId }).select("id").single();
        return json({ ok: true, id: copia?.id ?? hecho.id, general: Number(hecho.general), zonas: hecho.zonas, razon: hecho.razon, calidad: hecho.calidad, nota_fotos: hecho.nota_fotos ?? null });
      }
      return json({ ok: true, id: hecho.id, general: Number(hecho.general), zonas: hecho.zonas, razon: hecho.razon, calidad: hecho.calidad, nota_fotos: hecho.nota_fotos ?? null });
    }

    const ipRaw = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
    const ip = (await sha("resalta:" + ipRaw)).slice(0, 24);
    if (!orderId) {
      const hora = new Date(Date.now() - 3600e3).toISOString(), dia = new Date(Date.now() - 864e5).toISOString();
      const [{ count: h }, { count: d }] = await Promise.all([
        admin.from("calificaciones").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hora),
        admin.from("calificaciones").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", dia),
      ]);
      if ((h ?? 0) >= POR_HORA || (d ?? 0) >= POR_DIA) return json({ ok: false, limitado: true });
    }

    const c = await calificarFotos(fotos, medidas);
    // unusable photos are saved too (without a score), so retrying the same photo is free and still counts toward the cap
    // Age is never judged from the photo: the person states it (and confirms 18+) before rating.
    const motivo = !c.es_cara ? "sin_cara" : c.calidad === "mala" ? "foto_mala" : null;
    const { data: fila, error } = await admin.from("calificaciones").insert({
      hash, modelo: MODELO, origen, general: motivo ? null : c.general, zonas: motivo ? null : c.zonas, razon: c.razon,
      calidad: motivo === "foto_mala" ? "mala" : motivo ?? c.calidad, nota_fotos: motivo ? null : c.nota_fotos, order_id: orderId, user_id: userId, ip, uso: c.uso,
    }).select("id").single();
    if (error) console.error(error.message);
    if (motivo) return json({ ok: false, motivo });
    return json({ ok: true, id: fila?.id ?? null, general: c.general, zonas: c.zonas, razon: c.razon, calidad: c.calidad, nota_fotos: c.nota_fotos });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos calificar la foto" }, 500);
  }
});
