// Free rating: saves the lead and emails the result. The result is only delivered by email, so the
// address has to be real and the first email gets opened (good for the follow-up sequence).
// The email shows the annotated face crop the browser sends (stored 30 days) and every score.
// From /calificacion the rating is the AI one (0-10, saved by the calificar function, looked up here by cal_id
// so the browser can't send a made-up number). The tools in /herramientas still send their own 0-100 harmony score.
// It also adds the contact to a Sender group, which is what starts the email sequence.
// Secrets: SENDER_API_KEY, SENDER_GROUP_ID (optional, defaults to the "Leads calificación gratis" group), SENDER_FROM (default contacto@resalta.co), SITE_URL
// Without SENDER_API_KEY the lead is still saved with enviado_at empty. Every later call also retries
// a few leads that were never sent, so a backlog clears itself once the key exists.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Parte = { k: string; v: number; tip?: string };
const MAX_DIA = 3;

// Email styled like the site: a rounded blue-gray panel on a light page, white type, soft translucent cards.
// Built for Gmail: no width percentages on tables that Gmail can collapse, bars as divs, a 600px panel that
// shrinks on phones, and solid bgcolor fallbacks where rgba is ignored (Outlook desktop).
function correo(nombre: string, score: number, partes: Parte[], fuerte: string, debil: { k: string; tip?: string } | null, site: string, foto: string | null, diez = false, notaFotos = "") {
  const nivel = diez
    ? (score >= 7.4 ? "Estás claramente arriba del promedio. Tu margen está en los detalles finos." : score >= 6.6 ? "Estás arriba del promedio y tienes mejoras claras a tu alcance." : score >= 5.2 ? "Estás en el promedio. Los cambios correctos se van a notar bastante." : "Tienes mucho margen para subir, y los cambios correctos se van a notar bastante.")
    : (score >= 72 ? "Tienes una cara muy armónica. Tu margen está en los detalles finos." : score >= 55 ? "Tienes una buena base y varias mejoras claras a tu alcance." : "Tienes mucho potencial. Los cambios correctos se van a notar bastante.");
  const nf = String(notaFotos || "").trim().replace(/[.\s]+$/, "");
  const tope = diez ? 10 : 100, txt = (v: number) => diez ? v.toFixed(1) : String(Math.round(v));
  const url = `${site}/cuenta?next=/analisis&utm_source=email&utm_medium=resultado&utm_campaign=calificacion`;
  const mono = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
  const sans = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
  const W = "rgba(255,255,255,.78)";
  const label = (t: string, center = false) => `<div style="font-family:${mono};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7);${center ? "text-align:center;" : ""}">${t}</div>`;
  // one card = one table cell, so Gmail can't shrink it
  const card = (inner: string, pad = "26px 24px") => `<tr><td class="cd" bgcolor="#A0AEB9" style="background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.26);border-radius:22px;padding:${pad}">${inner}</td></tr><tr><td style="height:14px;line-height:14px;font-size:0">&nbsp;</td></tr>`;
  const fila = (p: Parte, i: number) => {
    const v = p.v, w = Math.max(3, Math.min(100, Math.round(v * 100 / tope)));
    return `<div style="padding:${i ? 18 : 14}px 0 0">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="font-family:${sans};font-size:16px;line-height:22px;color:#FFFFFF">${esc(p.k)}</td>
        <td align="right" style="font-family:${mono};font-size:16px;line-height:22px;color:#FFFFFF;white-space:nowrap">${txt(v)}</td>
      </tr></table>
      <div style="margin-top:9px;height:5px;line-height:5px;font-size:0;background-color:#8E9DAA;background:rgba(255,255,255,.22);border-radius:5px"><div style="width:${w}%;height:5px;line-height:5px;font-size:0;background:#FFFFFF;border-radius:5px">&nbsp;</div></div>
    </div>`;
  };
  const filas = partes.map(fila).join("");
  const s = txt(score);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>Tu calificación facial</title>
<style>
@media only screen and (max-width:520px){
  .pn{border-radius:0!important}
  .pi{padding:34px 16px 26px!important}
  .cd{padding:22px 18px!important}
  .ti{font-size:28px!important;line-height:34px!important}
  .sc{font-size:84px!important}
  .fi{width:100%!important;max-width:100%!important;height:auto!important}
}
</style></head>
<body style="margin:0;padding:0;background:#FFFFFF;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${diez ? `Tu calificación facial: ${s}/10` : `Tu armonía facial: ${s}/100`} y tus puntajes, con tu foto medida.</div>
<div style="width:100%;background-color:#FFFFFF;margin:0;padding:0"><center style="width:100%;table-layout:fixed;background-color:#FFFFFF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FFFFFF" style="width:100%;min-width:100%;background:#FFFFFF"><tr><td align="center" valign="top" style="padding:32px 0;text-align:center">
<table role="presentation" class="pn" align="center" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#97A6B2" style="margin:0 auto;width:100%;max-width:600px;background-color:#97A6B2;background-image:linear-gradient(180deg,#8B9BA8 0%,#A9B6C0 100%);border-radius:28px">
<tr><td class="pi" style="padding:44px 36px 34px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center" style="padding:0 0 34px"><a href="${site}" style="text-decoration:none"><img src="${site}/assets/img/email/logo-blanco.png" width="136" height="38" alt="resalta" style="display:block;border:0;width:136px;height:38px"></a></td></tr>
    <tr><td align="center" style="padding:0 0 16px"><span style="display:inline-block;font-family:${mono};font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#FFFFFF;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);border-radius:999px;padding:8px 16px">Tu calificación facial</span></td></tr>
    <tr><td align="center" class="ti" style="padding:0 0 30px;font-family:${sans};font-size:34px;line-height:40px;font-weight:300;letter-spacing:-.02em;color:#FFFFFF">${esc(nombre)}, este es tu resultado</td></tr>
    ${foto ? card(`<img src="${esc(foto)}" width="100%" class="fi" alt="Tu foto con tus medidas" style="display:block;width:100%;max-width:510px;height:auto;margin:0 auto;border:0;border-radius:14px">`, "9px") : ""}
    ${card(`<div style="text-align:center">${label(diez ? "Calificación facial" : "Armonía facial", true)}
      <div class="sc" style="margin-top:10px;font-family:${sans};font-size:96px;line-height:1;font-weight:300;letter-spacing:-.045em;color:#FFFFFF">${s}<span style="font-size:24px;letter-spacing:0;color:${W}">&nbsp;/ ${tope}</span></div>
      <div style="margin:16px auto 0;max-width:400px;font-family:${sans};font-size:17px;line-height:26px;color:${W}">${esc(nivel)}</div></div>`, "32px 24px 30px")}
    ${nf ? card(`${label("Un comentario sobre tu foto")}<div style="margin-top:10px;font-family:${sans};font-size:16px;line-height:25px;color:${W}">${esc(nf)}. Eso suele bajar la calificación unas décimas. Para la más justa, toma otra con luz de frente, el celular a la altura de tus ojos y a un brazo de distancia o más, y la cara relajada. <a href="${site}/calificacion" style="color:#FFFFFF">Calificar otra foto</a>.</div>`) : ""}
    ${filas ? card(`${label("Tus puntajes")}${filas}
      ${fuerte ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.22);font-family:${sans};font-size:16px;line-height:25px;color:${W}">Tu punto más fuerte es <b style="color:#FFFFFF;font-weight:600">${esc(fuerte.toLowerCase())}</b>.${debil && debil.k && debil.k !== fuerte ? ` Lo que más te baja el puntaje es <b style="color:#FFFFFF;font-weight:600">${esc(debil.k.toLowerCase())}</b>.` : ""}</div>` : ""}`) : ""}
    ${card(`<div style="text-align:center">
      <div style="font-family:${sans};font-size:24px;line-height:31px;font-weight:300;letter-spacing:-.01em;color:#FFFFFF">¿Quieres saber por qué te dimos ${s}?</div>
      <div style="margin:14px auto 26px;max-width:430px;font-family:${sans};font-size:16px;line-height:25px;color:${W}">${diez ? "Esta calificación ve tu cara de frente en una escala real donde 6 es el promedio." : "Este puntaje mide unas cuantas proporciones de tu cara de frente."} El análisis completo revisa más de 110 rasgos con tus fotos de frente y de perfil, y te dice qué cambiar primero, qué no vale la pena y cómo te verías con tu plan.</div>
      <a href="${url}" style="display:inline-block;background:#FFFFFF;color:#16191D;text-decoration:none;padding:17px 34px;border-radius:999px;font-family:${sans};font-size:16px;font-weight:600">Ver mi análisis completo</a></div>`, "34px 24px 34px")}
  </table>
</td></tr></table>
<table role="presentation" align="center" width="600" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;width:100%;max-width:600px"><tr><td align="center" style="padding:20px 24px 8px;font-family:${sans};font-size:13px;line-height:20px;color:#5B6470">${diez ? "Calificación estética y educativa basada en una foto." : "Puntaje estético y educativo basado en proporciones medidas en una foto."} No es un juicio sobre tu valor ni un diagnóstico.${foto ? " La imagen de este correo se borra de nuestros servidores en 30 días." : ""}<br><a href="${site}" style="color:#4A5866;text-decoration:none">resalta.co</a></td></tr></table>
</td></tr></table></center></div></body></html>`;
}

// The annotated face crop the browser made. It lives in a public bucket under an unguessable name only so
// the email can show it, and every call deletes the ones older than 30 days.
const BUCKET = "correo";
async function subirFoto(id: string, dataUrl: unknown): Promise<string | null> {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m || m[1].length > 700_000) return null;
  const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
  const path = `${id}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const up = () => admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  let { error } = await up();
  if (error && /not.?found/i.test(error.message)) { await admin.storage.createBucket(BUCKET, { public: true }); ({ error } = await up()); }
  if (error) { console.error("foto", error.message); return null; }
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
async function limpiarFotos() {
  const { data } = await admin.storage.from(BUCKET).list("", { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  const viejas = (data ?? []).filter(f => f.created_at && Date.now() - new Date(f.created_at).getTime() > 30 * 864e5).map(f => f.name);
  if (viejas.length) await admin.storage.from(BUCKET).remove(viejas);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 200);
    const nombre = String(b.nombre ?? "").trim().slice(0, 60);
    // AI rating from /calificacion: the numbers come from the saved row, not from the browser
    let cal: { id: string; general: number; zonas: Record<string, number>; nota_fotos: string | null } | null = null;
    if (/^[0-9a-f-]{36}$/.test(String(b.cal_id ?? ""))) {
      const { data } = await admin.from("calificaciones").select("id,general,zonas,nota_fotos").eq("id", String(b.cal_id)).not("general", "is", null).maybeSingle();
      if (data) cal = { id: data.id, general: Number(data.general), zonas: data.zonas ?? {}, nota_fotos: data.nota_fotos ?? null };
    }
    const score = cal ? cal.general : Math.round(Number(b.score));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nombre || !(score >= 0 && score <= 100)) return json({ error: "Datos no válidos" }, 400);
    const ZN: Record<string, string> = { proporciones: "Proporciones", ojos: "Ojos", nariz: "Nariz", boca: "Boca y labios", mandibula: "Mandíbula y mentón", simetria: "Simetría" };
    const tips: Record<string, string> = Object.fromEntries((Array.isArray(b.partes) ? b.partes : []).map((p: Parte) => [String(p.k), String(p.tip ?? "").slice(0, 300)]));
    const partes: Parte[] = cal
      ? Object.entries(ZN).filter(([id]) => typeof cal!.zonas[id] === "number").map(([id, k]) => ({ k, v: Number(cal!.zonas[id]), tip: tips[k] ?? "" }))
      : (Array.isArray(b.partes) ? b.partes : []).slice(0, 8).map((p: Parte) => ({ k: String(p.k).slice(0, 40), v: Math.max(0, Math.min(100, Number(p.v) || 0)), tip: String(p.tip ?? "").slice(0, 300) }));
    const ordenadas = [...partes].sort((x, y) => y.v - x.v);
    const fuerte = cal ? (ordenadas[0]?.k ?? "") : String(b.fuerte ?? "").slice(0, 40);
    const ult = ordenadas[ordenadas.length - 1];
    const debil = cal ? (ult ? { k: ult.k, tip: ult.tip } : null) : b.debil ? { k: String(b.debil.k ?? "").slice(0, 40), tip: String(b.debil.tip ?? "").slice(0, 300) } : null;

    // Repeating the rating is allowed (new photo, better light), but each result is one email, so an
    // address gets at most 3 results in 24 hours. Past that nothing is saved or sent and the page says so.
    const desde = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("email", email).eq("source", "calificacion").gte("created_at", desde);
    if ((count ?? 0) >= MAX_DIA) return json({ ok: false, limitado: true, max: MAX_DIA });

    // device id from the site's tracking, so the admin can show this person's visits
    const vid = /^[A-Za-z0-9_-]{6,64}$/.test(String(b.vid ?? "")) ? String(b.vid) : null;
    // leads.score keeps 0-100 for both kinds (6.4 is saved as 64); metrics.escala says which one it is
    const base = { partes, fuerte, debil, ...(vid ? { vid } : {}), ...(cal ? { escala: 10, general: cal.general, cal_id: cal.id, ...(cal.nota_fotos ? { nota_fotos: cal.nota_fotos } : {}) } : {}) };
    const { data: lead, error } = await admin.from("leads").insert({ email, nombre, score: cal ? Math.round(cal.general * 10) : score, metrics: base, source: "calificacion" }).select("id").single();
    if (error) throw error;
    const foto = await subirFoto(lead.id, b.foto).catch(() => null);
    if (foto) await admin.from("leads").update({ metrics: { ...base, foto } }).eq("id", lead.id);
    limpiarFotos().catch(() => {});

    const key = Deno.env.get("SENDER_API_KEY");
    if (!key) return json({ ok: true, pendiente: true });
    const enviado = await enviar(key, { id: lead.id, email, nombre, score: cal ? Math.round(cal.general * 10) : score, metrics: { ...base, foto } });

    // clear any backlog (leads saved while email was not set up yet)
    const { data: atrasados } = await admin.from("leads").select("id,email,nombre,score,metrics")
      .eq("source", "calificacion").is("enviado_at", null).neq("id", lead.id).order("created_at").limit(5);
    for (const l of atrasados ?? []) await enviar(key, l);

    return json({ ok: true, enviado });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo enviar" }, 500);
  }
});

type Lead = { id: string; email: string; nombre: string; score: number; metrics: { partes?: Parte[]; fuerte?: string; debil?: { k: string; tip?: string } | null; foto?: string | null; escala?: number; general?: number; nota_fotos?: string } | null };


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

async function enviar(key: string, l: Lead) {
  const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
  const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  const m = l.metrics ?? {};
  const nombre = l.nombre || "Hola";
  const diez = m.escala === 10, valor = diez ? Number(m.general ?? l.score / 10) : l.score;
  const asunto = `${nombre.split(/\s+/)[0]}, tu calificación facial: ${diez ? valor.toFixed(1) + "/10" : Math.round(valor) + "/100"}`;
  const idc = await registrarCorreo(admin, { email: l.email, tipo: "resultado", asunto });
  const envio = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST", headers: h,
    body: JSON.stringify({
      from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" },
      to: { email: l.email, name: nombre },
      subject: asunto,
      html: rastrear(correo(nombre, valor, m.partes ?? [], m.fuerte ?? "", m.debil ?? null, site, m.foto ?? null, diez, m.nota_fotos ?? ""), idc),
    }),
  });
  const r = await envio.text();
  if (!envio.ok || !/"success"\s*:\s*true/.test(r)) { console.error("sender send", envio.status, r); await cerrarCorreo(admin, idc, false); return false; }
  await cerrarCorreo(admin, idc, true);
  await admin.from("leads").update({ enviado_at: new Date().toISOString() }).eq("id", l.id);

  // the group is what starts the sequence in Sender. Only the first free rating of an address joins it:
  // repeating the test sends the new result but never restarts the sequence, and someone who already
  // signed up (and so is in, or past, another sequence) is not put back into this one.
  const { count: previos } = await admin.from("leads").select("id", { count: "exact", head: true })
    .eq("email", l.email).neq("id", l.id).or("and(source.eq.calificacion,enviado_at.not.is.null),source.eq.registro");
  if ((previos ?? 0) > 0) return true;
  const grupo = Deno.env.get("SENDER_GROUP_ID") ?? "aM2mX5"; // "Leads calificación gratis"
  const sub = await fetch("https://api.sender.net/v2/subscribers", {
    method: "POST", headers: h,
    body: JSON.stringify({ email: l.email, firstname: nombre, ...(grupo ? { groups: [grupo] } : {}), trigger_automation: true }),
  });
  if (!sub.ok) console.error("sender subscriber", sub.status, await sub.text());
  return true;
}
