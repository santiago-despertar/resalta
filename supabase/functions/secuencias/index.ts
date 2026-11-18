// Follow-up sequences for people who finished the onboarding questions but did not pay, and (secuencia 'gratis')
// for people who only did the free rating.
// Runs every hour (pg_cron). One hour after someone leaves the offer page without paying, they join the
// sequence that matches what they want to improve, leave the free-rating sequence in Sender, and get one
// email per step on the days set in public.secuencia_correos (editable from admin.resalta.co).
// Paying, unsubscribing or deleting the account stops it. Safe to call often: it only sends what is due.
// Secrets: SENDER_API_KEY, SENDER_FROM (default contacto@resalta.co), SITE_URL. Deploy with JWT verification off.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = Deno.env.get("SITE_URL") ?? "https://resalta.co";
const GRUPO_LEADS = Deno.env.get("SENDER_GROUP_ID") ?? "aM2mX5";
const ESPERA_MIN = 60;          // minutes after the onboarding before the first email
const MAX_POR_CORRIDA = 150;    // emails per run, well under Sender's limits
type Obj = Record<string, any>; // deno-lint-ignore no-explicit-any

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const html = (b: string, s = 200) => new Response(b, { status: s, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function firma(email: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase() + "|" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));
  return [...new Uint8Array(d)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Everyone gets the same general sequence for now. Once we see in the admin ("Qué quiere mejorar")
// which goals people actually pick, the most common ones get their own sequence again. The old
// per-goal routing is kept below so it can be switched back on.
export function elegir(_objetivo: string) {
  return "general";
}
export function elegirPorObjetivo(objetivo: string) {
  const o = (objetivo || "").toLowerCase();
  if (/mand[ií]bula|perfil/.test(o)) return "mandibula";
  if (/piel/.test(o)) return "piel";
  if (/joven/.test(o)) return "joven";
  if (/cabello|cejas|vello|ojos/.test(o)) return "rasgos";
  return "fotos";
}

export function banderas(a: Obj) {
  const p = String(a.procedimientos ?? ""), pr = String(a.presupuesto ?? "");
  return {
    sin_proc: /^Solo/.test(p),
    proc: /Abierto/.test(p),
    cirugia: /cirug[ií]a/i.test(p) && !/sin cirug/i.test(p),
    presupuesto_bajo: /Menos de|\$500 a \$2,000/.test(pr),
  };
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
<style>@media only screen and (max-width:520px){.pn{border-radius:0!important}.pi{padding:34px 18px 26px!important}.cd{padding:22px 18px!important}.ti{font-size:28px!important;line-height:34px!important}.sc{font-size:84px!important}.fi{width:100%!important;max-width:100%!important;height:auto!important}}</style></head>
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

export function render(cuerpo: string, vars: Obj, flags: Obj, enlace: string) {
  let t = cuerpo.replace(/\[\[(\w+)\]\]([\s\S]*?)\[\[\/\1\]\]/g, (_, k, dentro) => (flags[k] ? dentro : ""));
  t = t.replace(/\{(nombre|objetivo|puntaje|fuerte|debil)\}/g, (_, k) => String(vars[k] ?? ""));
  const partes = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return partes.map((p) => {
    const b = p.match(/^\{boton:([^}]+)\}$/);
    if (b) return emBoton(esc(b[1]), enlace);
    // {imagen:/assets/img/x.jpg} or a full URL: a picture in a translucent card
    const im = p.match(/^\{imagen:([^}]+)\}$/);
    if (im) { const src = /^https?:/.test(im[1]) ? im[1] : SITE + im[1]; return emCaja(`<img src="${esc(src)}" width="100%" class="fi" alt="" style="display:block;width:100%;max-width:510px;height:auto;margin:0 auto;border:0;border-radius:14px">`, "9px"); }
    // {dato:0.1 s|What the number means}: a big number in a card, like the site's stat cards
    const da = p.match(/^\{dato:([^|}]+)\|([^}]+)\}$/);
    if (da) return emCaja(`<div style="text-align:center"><div class="sc" style="font-family:${EM_SANS};font-size:72px;line-height:1;font-weight:300;letter-spacing:-.04em;color:#FFFFFF">${esc(da[1])}</div><div style="margin:12px auto 0;max-width:380px;font-family:${EM_MONO};font-size:12px;line-height:19px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.75)">${esc(da[2])}</div></div>`, "30px 24px");
    return emTexto(esc(p).split("\n").join("<br>"));
  }).join("");
}

export function plantilla(contenido: string, baja: string, porque = "empezaste tu análisis") {
  return emShell({ site: SITE, filas: contenido, pie: `Te escribimos porque ${porque} en resalta.co.<br><a href="${baja}" style="color:#4A5866">No quiero recibir estos correos</a>` });
}

// Free-rating leads: the rating does not ask sex, so it is guessed from the first name (only used to pick
// the man or woman example pictures). Unknown names get the man's pictures, like the homepage.
const MUJER_SIN_A = new Set(("carmen isabel raquel ruth rut beatriz ines inés rocio rocío pilar belen belén luz soledad mercedes dolores consuelo abigail ester esther miriam maribel marisol lourdes monserrat montserrat itzel citlali xochitl nayeli yaretzi jennifer karen evelyn ivonne michelle nicole denise jazmin jazmín abril sol flor mar noemi noemí zoe zoé irene guadalupe lupe ximena jimena araceli estefany estefani yuridia yazmin yazmín madeleine allison ashley kimberly lizbeth elizabeth isabel maite nohemi ingrid iris raquel").split(" "));
const HOMBRE_CON_A = new Set("luca nicola joshua jeremia borja elias garcia sasha misha nikita kosta".split(" "));
export function esMujer(nombre: string) {
  const n = (nombre || "").trim().split(/\s+/)[0].toLowerCase();
  if (!n) return false;
  if (MUJER_SIN_A.has(n)) return true;
  if (HOMBRE_CON_A.has(n)) return false;
  return /a$/.test(n);
}
// "Mandíbula" -> "tu mandíbula": the rating's measure names, ready to drop into a sentence
const CON_ARTICULO: Record<string, string> = { "simetría": "tu simetría", "tercios faciales": "tus tercios faciales", "tercio inferior": "tu tercio inferior", "ojos": "tus ojos", "inclinación de ojos": "la inclinación de tus ojos", "mandíbula": "tu mandíbula", "proporción del rostro": "la proporción de tu rostro" };
const conArticulo = (k: string) => { const x = (k || "").trim().toLowerCase(); return x ? (CON_ARTICULO[x] ?? x) : ""; };
const LANZAMIENTO_GRATIS = "2026-11-15T23:59:00Z"; // only people who did the free rating from here on
const PUNTAJE_ALTO = 80;

const nombreDe = (a: Obj, u: Obj) => String(a?.nombre || u?.user_metadata?.full_name || "").trim().split(/\s+/)[0] || "Hola";
const objetivoTexto = (o: string) => (o || "").split(", ").filter(Boolean).map((x) => x.toLowerCase()).join(" y ") || "tu imagen";


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

async function enviar(key: string, email: string, asunto: string, cuerpo: string, nombre: string) {
  const r = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" }, to: { email, name: nombre }, subject: asunto, html: cuerpo }),
  });
  const t = await r.text();
  if (!r.ok || !/"success"\s*:\s*true/.test(t)) { console.error("sender", r.status, t.slice(0, 200)); return false; }
  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // unsubscribe link from the email footer
  if (req.method === "GET" && url.searchParams.get("baja")) {
    const email = String(url.searchParams.get("baja")).toLowerCase().slice(0, 200), t = url.searchParams.get("t") ?? "";
    const pagina = (m: string) => html(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#FFFFFF;font-family:${EM_SANS};display:grid;place-items:center;min-height:100vh"><div style="max-width:420px;padding:36px 30px;background:#97A6B2;background-image:linear-gradient(180deg,#8B9BA8,#A9B6C0);border-radius:28px;margin:20px;text-align:center;color:#FFFFFF"><img src="${SITE}/assets/img/email/logo-blanco.png" width="136" height="38" alt="resalta" style="display:block;margin:0 auto 22px"><p style="font-size:17px;line-height:1.6;margin:0">${m}</p></div></body></html>`);
    if (t !== await firma(email)) return pagina("Este enlace no es válido.");
    await admin.from("bajas").upsert({ email });
    await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "baja" }).eq("email", email).is("salio_at", null);
    await admin.from("lead_secuencia").update({ salio_at: new Date().toISOString(), motivo: "baja" }).eq("email", email).is("salio_at", null);
    return pagina("Listo. Ya no te vamos a mandar estos correos. Los avisos de tu cuenta (por ejemplo, cuando tu análisis está listo) te siguen llegando.");
  }
  if (req.method !== "POST") return new Response("ok");

  const key = Deno.env.get("SENDER_API_KEY");
  if (!key) return json({ ok: false, motivo: "sin_sender" });
  const ahora = Date.now();
  const resumen = { inscritos: 0, enviados: 0, fallidos: 0, salieron: 0 };

  const [{ data: correos }, { data: pagos }, { data: bajasL }] = await Promise.all([
    admin.from("secuencia_correos").select("*").eq("activo", true).order("paso"),
    admin.from("orders").select("user_id").in("status", ["pagado", "listo"]),
    admin.from("bajas").select("email"),
  ]);
  const compro = new Set((pagos ?? []).map((o: Obj) => o.user_id));
  const bajas = new Set((bajasL ?? []).map((b: Obj) => b.email));
  const porSec: Record<string, Obj[]> = {};
  for (const c of correos ?? []) (porSec[c.secuencia] ??= []).push(c);

  // 1) new people: finished the questions at least an hour ago, no payment, not enrolled yet
  const limite = new Date(ahora - ESPERA_MIN * 60e3).toISOString(), mes = new Date(ahora - 30 * 864e5).toISOString();
  const { data: borradores } = await admin.from("orders").select("id,user_id,answers,created_at").eq("status", "borrador")
    .not("answers", "is", null).lt("created_at", limite).gt("created_at", mes).order("created_at", { ascending: false }).limit(500);
  const { data: ya } = await admin.from("secuencia_inscritos").select("user_id");
  const inscritos = new Set((ya ?? []).map((x: Obj) => x.user_id));
  for (const o of borradores ?? []) {
    if (inscritos.has(o.user_id) || compro.has(o.user_id) || !o.answers?.objetivo) continue;
    const { data: ud } = await admin.auth.admin.getUserById(o.user_id);
    const email = (ud?.user?.email ?? "").toLowerCase();
    if (!email || bajas.has(email)) continue;
    const sec = elegir(o.answers.objetivo);
    if (!porSec[sec]?.length) continue;
    const { error } = await admin.from("secuencia_inscritos").insert({ user_id: o.user_id, email, secuencia: sec, order_id: o.id });
    if (error) continue;
    inscritos.add(o.user_id); resumen.inscritos++;
    // out of the free-rating sequence: this one is about what they told us
    await fetch(`https://api.sender.net/v2/subscribers/groups/${GRUPO_LEADS}`, { method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ subscribers: [email], trigger_automation: false }) }).catch(() => {});
  }

  // 2) send whatever is due
  const { data: activos } = await admin.from("secuencia_inscritos").select("*").is("salio_at", null).limit(2000);
  const { data: hechos } = await admin.from("secuencia_envios").select("user_id,secuencia,paso").eq("ok", true);
  const enviados = new Set((hechos ?? []).map((e: Obj) => `${e.user_id}|${e.secuencia}|${e.paso}`));
  let cuenta = 0;
  for (const ins of activos ?? []) {
    if (cuenta >= MAX_POR_CORRIDA) break;
    if (compro.has(ins.user_id)) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "compra" }).eq("user_id", ins.user_id); resumen.salieron++; continue; }
    if (bajas.has(ins.email)) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "baja" }).eq("user_id", ins.user_id); continue; }
    const pasos = porSec[ins.secuencia] ?? [];
    const sig = pasos.find((c) => !enviados.has(`${ins.user_id}|${ins.secuencia}|${c.paso}`));
    if (!sig) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "terminó" }).eq("user_id", ins.user_id); continue; }
    if (ahora + 120000 < new Date(ins.desde).getTime() + Number(sig.dias) * 864e5) continue;
    // never two emails on the same day
    const { data: ult } = await admin.from("secuencia_envios").select("enviado_at").eq("user_id", ins.user_id).eq("ok", true).order("enviado_at", { ascending: false }).limit(1);
    if (ult?.[0] && ahora - new Date(ult[0].enviado_at).getTime() < 20 * 3600e3) continue;

    const { data: o } = await admin.from("orders").select("answers").eq("id", ins.order_id).maybeSingle();
    const { data: ud } = await admin.auth.admin.getUserById(ins.user_id);
    if (!ud?.user) { await admin.from("secuencia_inscritos").update({ salio_at: new Date().toISOString(), motivo: "sin_cuenta" }).eq("user_id", ins.user_id); continue; }
    const a = o?.answers ?? {}, nombre = nombreDe(a, ud.user);
    const vars = { nombre, objetivo: objetivoTexto(a.objetivo) };
    const enlace = `${SITE}/analisis?utm_source=email&utm_medium=abandono&utm_campaign=${ins.secuencia}-${sig.paso}`;
    const baja = `${Deno.env.get("SUPABASE_URL")}/functions/v1/secuencias?baja=${encodeURIComponent(ins.email)}&t=${await firma(ins.email)}`;
    const asunto = String(sig.asunto).replace(/\{(nombre|objetivo)\}/g, (_: string, k: string) => String((vars as Obj)[k] ?? ""));
    const idc = await registrarCorreo(admin, { email: ins.email, tipo: "secuencia", secuencia: ins.secuencia, paso: sig.paso, asunto });
    const ok = await enviar(key, ins.email, asunto, rastrear(plantilla(render(sig.cuerpo, vars, banderas(a), enlace), baja), idc), nombre);
    await cerrarCorreo(admin, idc, ok);
    await admin.from("secuencia_envios").upsert({ user_id: ins.user_id, email: ins.email, secuencia: ins.secuencia, paso: sig.paso, ok, enviado_at: new Date().toISOString() }, { onConflict: "user_id,secuencia,paso" });
    cuenta++; ok ? resumen.enviados++ : resumen.fallidos++;
    if (!ok) break; // Sender is refusing (limit or account issue): try again next hour
  }
  // 3) free-rating sequence: people who only did the free rating get one email per step after their result.
  // They leave it as soon as they create an account and start the plan form (then the general sequence takes
  // over), buy, or unsubscribe. One run per email address, however many times they repeat the rating.
  const gratis = porSec["gratis"] ?? [];
  if (gratis.length && cuenta < MAX_POR_CORRIDA && resumen.fallidos === 0) {
    const { data: nuevos } = await admin.from("leads").select("id,email,created_at").eq("source", "calificacion")
      .not("enviado_at", "is", null).gt("created_at", LANZAMIENTO_GRATIS).gt("created_at", mes).order("created_at", { ascending: true }).limit(1000);
    const { data: yaL } = await admin.from("lead_secuencia").select("email");
    const enLeads = new Set((yaL ?? []).map((x: Obj) => x.email));
    for (const l of nuevos ?? []) {
      const email = String(l.email).toLowerCase();
      if (enLeads.has(email) || bajas.has(email)) continue;
      const { error } = await admin.from("lead_secuencia").insert({ email, lead_id: l.id, desde: l.created_at });
      if (!error) { enLeads.add(email); resumen.inscritos++; }
    }
    const { data: activosL } = await admin.from("lead_secuencia").select("*").is("salio_at", null).limit(2000);
    const { data: hechosL } = await admin.from("lead_envios").select("email,paso,enviado_at").eq("ok", true);
    const hechoL = new Set((hechosL ?? []).map((e: Obj) => `${e.email}|${e.paso}`));
    const ultimoL: Record<string, number> = {};
    for (const e of hechosL ?? []) ultimoL[e.email] = Math.max(ultimoL[e.email] ?? 0, new Date(e.enviado_at).getTime());
    for (const ins of activosL ?? []) {
      if (cuenta >= MAX_POR_CORRIDA) break;
      const sale = (motivo: string) => admin.from("lead_secuencia").update({ salio_at: new Date().toISOString(), motivo }).eq("email", ins.email);
      if (bajas.has(ins.email)) { await sale("baja"); continue; }
      const { data: estado } = await admin.rpc("lead_estado", { e: ins.email });
      if (estado) { await sale(String(estado)); resumen.salieron++; continue; }
      const sig = gratis.find((c) => !hechoL.has(`${ins.email}|${c.paso}`));
      if (!sig) { await sale("terminó"); continue; }
      if (ahora + 120000 < new Date(ins.desde).getTime() + Number(sig.dias) * 864e5) continue;
      if (ahora - (ultimoL[ins.email] ?? 0) < 20 * 3600e3) continue;
      // their most recent rating: if they repeated it, the emails talk about the newest number
      const { data: ls } = await admin.from("leads").select("nombre,score,metrics").eq("email", ins.email).eq("source", "calificacion").order("created_at", { ascending: false }).limit(1);
      const l = ls?.[0] ?? {};
      const nombre = String(l.nombre || "").trim().split(/\s+/)[0] || "Hola";
      const m = l.metrics ?? {};
      const vars = { nombre, puntaje: String(l.score ?? ""), fuerte: conArticulo(m.fuerte) || "algunos rasgos", debil: conArticulo(m.debil?.k) || "algunos detalles" };
      const mujer = esMujer(nombre);
      const flags = { mujer, hombre: !mujer, alto: Number(l.score) >= PUNTAJE_ALTO, bajo: !(Number(l.score) >= PUNTAJE_ALTO) };
      const enlace = `${SITE}/analisis?utm_source=email&utm_medium=calificacion&utm_campaign=gratis-${sig.paso}`;
      const baja = `${Deno.env.get("SUPABASE_URL")}/functions/v1/secuencias?baja=${encodeURIComponent(ins.email)}&t=${await firma(ins.email)}`;
      const asunto = String(sig.asunto).replace(/\{(nombre|puntaje)\}/g, (_: string, k: string) => String((vars as Obj)[k] ?? ""));
      const idc = await registrarCorreo(admin, { email: ins.email, tipo: "secuencia", secuencia: "gratis", paso: sig.paso, asunto });
      const ok = await enviar(key, ins.email, asunto, rastrear(plantilla(render(sig.cuerpo, vars, flags, enlace), baja, "hiciste tu calificación gratis"), idc), nombre);
      await cerrarCorreo(admin, idc, ok);
      await admin.from("lead_envios").upsert({ email: ins.email, paso: sig.paso, ok, enviado_at: new Date().toISOString() }, { onConflict: "email,paso" });
      cuenta++; ok ? resumen.enviados++ : resumen.fallidos++;
      if (!ok) break;
    }
  }
  // 3) the free month of the follow-up (Plan Completo) ends in 3 days: say when the first charge comes and how to cancel
  const fmtFecha = (d: string) => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" });
  const yaMandado = async (email: string, sec: string, desde?: string) => {
    let q = admin.from("correos_log").select("id", { count: "exact", head: true }).eq("email", email).eq("secuencia", sec);
    if (desde) q = q.gte("enviado_at", desde);
    const { count } = await q; return (count ?? 0) > 0;
  };
  const precioSub = async (subId: string) => {
    const k = Deno.env.get("STRIPE_SECRET_KEY"); if (!k) return "";
    try {
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, { headers: { Authorization: `Bearer ${k}` } });
      const j = await r.json(); const p = j?.items?.data?.[0]?.price; if (!p) return "";
      const cur = String(p.currency).toUpperCase(), n = cur === "CLP" ? p.unit_amount : p.unit_amount / 100;
      return new Intl.NumberFormat("es-MX", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) + (["MXN", "COP", "CLP"].includes(cur) ? " " + cur : "");
    } catch { return ""; }
  };
  if (cuenta < MAX_POR_CORRIDA) {
    const en3 = new Date(ahora + 3.2 * 864e5).toISOString();
    const { data: pruebas } = await admin.from("suscripciones").select("user_id,stripe_subscription,periodo_inicio,periodo_fin,cancela,estado")
      .eq("estado", "trialing").eq("cancela", false).gt("periodo_fin", new Date(ahora).toISOString()).lt("periodo_fin", en3);
    for (const s of pruebas ?? []) {
      if (cuenta >= MAX_POR_CORRIDA) break;
      const { data: ud } = await admin.auth.admin.getUserById(s.user_id);
      const email = (ud?.user?.email ?? "").toLowerCase(); if (!email) continue;
      if (await yaMandado(email, "aviso_prueba", s.periodo_inicio)) continue;
      const nombre = nombreDe({}, ud?.user ?? {}), fecha = fmtFecha(s.periodo_fin), precio = await precioSub(s.stripe_subscription);
      const asunto = `Tu mes gratis de seguimiento termina el ${fecha}`;
      const cuerpo = emShell({ site: SITE, etiqueta: "Tu seguimiento", titulo: "Tu mes gratis termina pronto", preview: `El ${fecha} empieza tu seguimiento mensual.`,
        filas: emTexto(`${nombre !== "Hola" ? esc(nombre) + ", tu" : "Tu"} primer mes de seguimiento, el que venía con tu Plan Completo, termina el <b>${fecha}</b>. Ese día se hace el primer cobro${precio ? ` de <b>${esc(precio)}</b> al mes` : ""} en la misma tarjeta y se libera tu escaneo para comparar tu avance con tu primer análisis.`)
          + emTexto("Si quieres seguir, no tienes que hacer nada. Si prefieres no seguir, cancélalo desde tu cuenta antes de esa fecha y no se te cobra nada.")
          + emBoton("Ir a mi cuenta", `${SITE}/panel?utm_source=email&utm_medium=aviso&utm_campaign=fin-prueba`),
        pie: "Resalta · resalta.co<br>Te escribimos porque activaste el seguimiento mensual. Si tienes dudas, responde a este correo." });
      const idc = await registrarCorreo(admin, { email, tipo: "aviso", secuencia: "aviso_prueba", paso: 1, asunto });
      const ok = await enviar(key, email, asunto, rastrear(cuerpo, idc), nombre);
      await cerrarCorreo(admin, idc, ok); cuenta++; ok ? resumen.enviados++ : resumen.fallidos++;
    }
  }

  // 4) about five weeks after their analysis, people without the follow-up get one note: time for a second scan
  if (cuenta < MAX_POR_CORRIDA) {
    const d45 = new Date(ahora - 45 * 864e5).toISOString(), d35 = new Date(ahora - 35 * 864e5).toISOString();
    const { data: viejos } = await admin.from("orders").select("user_id,tier,origen,paid_at").eq("status", "listo")
      .gt("paid_at", d45).lt("paid_at", d35).order("paid_at", { ascending: false }).limit(300);
    const { data: subs } = await admin.from("suscripciones").select("user_id,estado,stripe_subscription");
    const conSub = new Map((subs ?? []).map((x: Obj) => [x.user_id, x]));
    const vistos = new Set<string>();
    for (const o of viejos ?? []) {
      if (cuenta >= MAX_POR_CORRIDA) break;
      if (o.origen === "suscripcion" || vistos.has(o.user_id)) continue; vistos.add(o.user_id);
      const sx = conSub.get(o.user_id) as Obj | undefined;
      if (sx && ["active", "trialing", "past_due"].includes(sx.estado)) continue;
      const { data: ud } = await admin.auth.admin.getUserById(o.user_id);
      const email = (ud?.user?.email ?? "").toLowerCase();
      if (!email || bajas.has(email) || await yaMandado(email, "segundo_escaneo")) continue;
      const { count: hard } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("user_id", o.user_id).eq("tier", "hard").in("status", ["pagado", "listo"]).or("origen.is.null,origen.neq.suscripcion");
      const gratis = (hard ?? 0) > 0 && !sx?.stripe_subscription;
      const nombre = nombreDe({}, ud?.user ?? {});
      const asunto = `${nombre !== "Hola" ? nombre + ", ya" : "Ya"} puedes ver si está funcionando`;
      const baja = `${Deno.env.get("SUPABASE_URL")}/functions/v1/secuencias?baja=${encodeURIComponent(email)}&t=${await firma(email)}`;
      const cuerpo = plantilla(
        emTexto(`${nombre !== "Hola" ? esc(nombre) + ", ya" : "Ya"} pasó más de un mes desde tu análisis. Es justo cuando los cambios de piel, peso, barba o corte se empiezan a notar en las medidas.`)
        + emTexto("Con el seguimiento mensual subes tus fotos otra vez, comparamos el escaneo nuevo con el primero y ves qué cambió, número por número. También recibes tu plan de nutrición y ejercicio, y se ajusta cada mes con tu avance.")
        + (gratis ? emTexto("Con tu Plan Completo, el primer mes del seguimiento va incluido.") : "")
        + emBoton(gratis ? "Activar mi mes gratis" : "Activar mi seguimiento", `${SITE}/panel?utm_source=email&utm_medium=seguimiento&utm_campaign=segundo-escaneo`),
        baja, "hiciste tu análisis");
      const idc = await registrarCorreo(admin, { email, tipo: "secuencia", secuencia: "segundo_escaneo", paso: 1, asunto });
      const ok = await enviar(key, email, asunto, rastrear(cuerpo, idc), nombre);
      await cerrarCorreo(admin, idc, ok); cuenta++; ok ? resumen.enviados++ : resumen.fallidos++;
      if (!ok) break;
    }
  }
  return json({ ok: true, ...resumen });
});
