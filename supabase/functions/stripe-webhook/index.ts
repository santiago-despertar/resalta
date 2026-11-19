// Marks an order as paid when Stripe confirms the payment (card right away, OXXO when the voucher is paid).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SENDER_API_KEY, META_CAPI_TOKEN. Deploy with --no-verify-jwt.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Affiliate commission for a paid order or upgrade. Unique per order and concept, so retries never double-pay.
// Local prices, in the smallest unit Stripe uses for each currency (CLP has no cents). Keep in sync with MONEDAS in assets/js/config.js.
const PRECIOS: Record<string, { soft: number; hard: number; up: number; sub: number }> = {
  MXN: { soft: 149900, hard: 299900, up: 99900, sub: 34900 },
  USD: { soft: 7900, hard: 15900, up: 4900, sub: 1900 },
  EUR: { soft: 6900, hard: 13900, up: 4500, sub: 1600 },
  COP: { soft: 25900000, hard: 51900000, up: 16900000, sub: 5900000 },
  CLP: { soft: 79990, hard: 159990, up: 49990, sub: 18990 },
  PEN: { soft: 27900, hard: 55900, up: 18900, sub: 6500 },
};
const monedaDe = (m: unknown) => { const c = String(m ?? "").toUpperCase(); return PRECIOS[c] ? c : "MXN"; };
// Any charged amount expressed in pesos, using the same ratio as the price table. Commissions are always in pesos.
const aPesos = (amount: number | null | undefined, currency: string | null | undefined) => {
  const c = monedaDe(currency); if (!amount) return 0;
  return c === "MXN" ? Math.round(amount / 100) : Math.round(amount * 1499 / PRECIOS[c].soft);
};

// Meta Conversions API: the same purchase the browser pixel reports, sent from the server so it is not lost
// to ad blockers or iPhone tracking limits. Same event_id as the pixel, so Meta counts it once.
// Secret: META_CAPI_TOKEN (without it nothing is sent). Pixel: META_PIXEL_ID (default Resalta's).
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function capi(nombre: string, id: string, s: Stripe.Checkout.Session, userId?: string | null) {
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!token || !s.amount_total) return;
  // Test-account charges ($10 MXN) are not sales.
  if ((s.currency ?? "mxn") === "mxn" && s.amount_total <= 1000) return;
  try {
    const moneda = (s.currency ?? "mxn").toUpperCase();
    const valor = moneda === "CLP" ? s.amount_total : s.amount_total / 100;
    const email = s.customer_details?.email ?? s.customer_email ?? "";
    const user_data: Record<string, unknown> = {};
    if (email) user_data.em = [await sha256(email.trim().toLowerCase())];
    if (userId) user_data.external_id = [await sha256(userId)];
    if (s.metadata?.fbp) user_data.fbp = s.metadata.fbp;
    if (s.metadata?.fbc) user_data.fbc = s.metadata.fbc;
    const pixel = Deno.env.get("META_PIXEL_ID") ?? "3159447567559166";
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [{
        event_name: nombre, event_time: Math.floor(Date.now() / 1000), event_id: id, action_source: "website",
        event_source_url: `${Deno.env.get("SITE_URL") ?? "https://resalta.co"}/gracias`, user_data,
        custom_data: { value: valor, currency: moneda },
      }] }),
    });
    if (!r.ok) console.error("capi", r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error("capi", e); }
}

// Sender: a buyer leaves the sales sequence (group "Leads calificación gratis") and joins "Clientes",
// which is the automation's exit condition too. Both the checkout email and the account email, if they differ.
// Secret: SENDER_API_KEY (without it nothing is sent).
const GRUPO_LEADS = Deno.env.get("SENDER_GROUP_ID") ?? "aM2mX5";
const GRUPO_CLIENTES = Deno.env.get("SENDER_CLIENTES_ID") ?? "b2oAXN";
async function aClientes(s: Stripe.Checkout.Session, userId?: string | null) {
  const key = Deno.env.get("SENDER_API_KEY");
  if (!key) return;
  try {
    const correos = new Set<string>();
    const e1 = s.customer_details?.email ?? s.customer_email;
    if (e1) correos.add(e1.trim().toLowerCase());
    if (userId) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user?.email) correos.add(data.user.email.trim().toLowerCase());
    }
    if (!correos.size) return;
    const h = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
    const nombre = s.customer_details?.name?.split(/\s+/)[0] ?? "";
    for (const email of correos) {
      await fetch("https://api.sender.net/v2/subscribers", { method: "POST", headers: h,
        body: JSON.stringify({ email, ...(nombre ? { firstname: nombre } : {}), groups: [GRUPO_CLIENTES], trigger_automation: false }) });
    }
    const lista = [...correos];
    await fetch(`https://api.sender.net/v2/subscribers/groups/${GRUPO_CLIENTES}`, { method: "POST", headers: h, body: JSON.stringify({ subscribers: lista, trigger_automation: false }) });
    const r = await fetch(`https://api.sender.net/v2/subscribers/groups/${GRUPO_LEADS}`, { method: "DELETE", headers: h, body: JSON.stringify({ subscribers: lista, trigger_automation: false }) });
    if (!r.ok) console.error("sender leads", r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error("sender", e); }
}

// Email design shared with the other functions (copied here because each function deploys as one file).
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

// Welcome email when the monthly follow-up starts (one-click or checkout). Says what is included, never mentions charges or renewal. Sent once: skipped if one went out in the last 3 days.
async function bienvenidaSub(userId: string, sub: Stripe.Subscription) {
  const key = Deno.env.get("SENDER_API_KEY");
  if (!key || !["active", "trialing"].includes(sub.status)) return;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const email = data?.user?.email?.toLowerCase(); if (!email) return;
    const hace = new Date(Date.now() - 3 * 864e5).toISOString();
    const { data: ya } = await admin.from("correos_log").select("id").eq("email", email).eq("tipo", "bienvenida_sub").gt("enviado_at", hace).limit(1);
    if (ya?.length) return;
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    const nombre = String((data?.user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "").split(" ")[0];
    const prueba = sub.status === "trialing" && !!sub.trial_end;
    const li = (t: string) => `<tr><td style="padding:7px 0;font-family:${EM_SANS};font-size:15px;line-height:23px;color:#FFFFFF">· ${t}</td></tr>`;
    const asunto = prueba ? "Tu mes gratis de seguimiento ya empezó" : "Tu seguimiento mensual está activo";
    const html = emShell({
      site, etiqueta: "Seguimiento mensual", titulo: nombre ? `${nombre}, ya estás dentro` : "Ya estás dentro",
      preview: "Esto es lo que incluye tu seguimiento cada mes.",
      filas: emTexto(`<div style="text-align:center;color:${EM_SUAVE}">${prueba ? `Tu seguimiento ya está activo y este primer mes no te cuesta nada.` : `Tu seguimiento ya está activo.`} Esto es lo que tienes cada mes:</div>`)
        + emCaja(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${li("Un nuevo escaneo completo de tu cara para medir tu avance.")}${li("Tu plan de nutrición y ejercicio: menú de 4 semanas con recetas, lista del súper y entrenamiento día por día.")}${li("El chat para preguntar lo que quieras sobre tu reporte y tu plan.")}${li("Tus fotos de antes y después, mes contra mes.")}</table>`, "18px 22px")
        + emBoton("Ir a mi cuenta", `${site}/panel?utm_source=email&utm_medium=suscripcion&utm_campaign=bienvenida`),
      pie: "Resalta · resalta.co",
    });
    const r = await fetch("https://api.sender.net/v2/message/send", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ from: { name: "Resalta", email: Deno.env.get("SENDER_FROM") ?? "contacto@resalta.co" }, to: { email }, subject: asunto, html }),
    });
    await admin.from("correos_log").insert({ email, tipo: "bienvenida_sub", asunto, ok: r.ok }).then(() => {}, () => {});
  } catch (e) { console.error("bienvenida suscripcion", e); }
}

async function comision(orderId: string, concepto: string, ventaMxn: number) {
  if (!ventaMxn) return;
  const { data: o } = await admin.from("orders").select("afiliado_id,user_id").eq("id", orderId).single();
  if (!o?.afiliado_id) return;
  const { data: a } = await admin.from("afiliados").select("id,comision_pct,activo,user_id").eq("id", o.afiliado_id).single();
  if (!a || !a.activo || a.user_id === o.user_id) return;
  await admin.from("comisiones").insert({
    afiliado_id: a.id, order_id: orderId, concepto, venta_mxn: ventaMxn,
    comision_mxn: Math.round(ventaMxn * Number(a.comision_pct) / 100),
  });
}

// Newer Stripe API versions keep the billing period on the subscription item, older ones on the subscription.
const periodo = (sub: Stripe.Subscription, k: "current_period_start" | "current_period_end"): number =>
  Number((sub as unknown as Record<string, unknown>)[k] ?? (sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined)?.[k] ?? Date.now() / 1000);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const paidEvents = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
  if (paidEvents.includes(event.type)) {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode === "subscription") {
      // Monthly follow-up plan: remember who it belongs to; the status is re-read from Stripe when used.
      const userId = s.metadata?.user_id || s.client_reference_id;
      if (userId && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(String(s.subscription));
        await admin.from("suscripciones").upsert({
          user_id: userId,
          stripe_customer: String(s.customer ?? ""),
          stripe_subscription: sub.id,
          estado: sub.status,
          periodo_inicio: new Date(periodo(sub, "current_period_start") * 1000).toISOString(),
          periodo_fin: new Date(periodo(sub, "current_period_end") * 1000).toISOString(),
          cancela: sub.cancel_at_period_end,
          actualizado: new Date().toISOString(),
        });
        await capi("Subscribe", `sub-${sub.id}`, s, userId);
        await bienvenidaSub(userId, sub);
      }
    } else if (s.payment_status === "paid" && s.client_reference_id && s.metadata?.upgrade === "true") {
      // Upgrade paid through a separate checkout (fallback when the one-click charge was not possible).
      const { data: o } = await admin.from("orders").select("amount_mxn,tier").eq("id", s.client_reference_id).single();
      if (o && o.tier === "soft") {
        await admin.from("orders").update({
          tier: "hard",
          amount_mxn: (o.amount_mxn ?? 0) + (aPesos(s.amount_total, s.currency)),
        }).eq("id", s.client_reference_id).in("status", ["pagado", "listo"]);
        await comision(s.client_reference_id, "mejora", aPesos(s.amount_total, s.currency));
      }
    } else if (s.payment_status === "paid" && s.client_reference_id) {
      const { data: cambiado } = await admin.from("orders").update({
        status: "pagado",
        tier: s.metadata?.tier === "hard" ? "hard" : "soft",
        stripe_session_id: s.id,
        amount_mxn: s.amount_total ? aPesos(s.amount_total, s.currency) : null,
        paid_at: new Date().toISOString(),
      }).eq("id", s.client_reference_id).eq("status", "borrador").select("id");
      if (cambiado && cambiado.length) {
        await comision(s.client_reference_id, "venta", aPesos(s.amount_total, s.currency));
        await capi("Purchase", "compra-" + s.client_reference_id, s, s.metadata?.user_id);
        const { data: ord } = await admin.from("orders").select("user_id").eq("id", s.client_reference_id).single();
        await aClientes(s, s.metadata?.user_id || ord?.user_id);
      }
    }
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await admin.from("suscripciones").update({
      estado: sub.status,
      periodo_inicio: new Date(periodo(sub, "current_period_start") * 1000).toISOString(),
      periodo_fin: new Date(periodo(sub, "current_period_end") * 1000).toISOString(),
      cancela: sub.cancel_at_period_end,
      actualizado: new Date().toISOString(),
    }).eq("stripe_subscription", sub.id);
  }
  return new Response("ok");
});
