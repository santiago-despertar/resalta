// Monthly follow-up plan: one full rescan per billing period, progress and compare.
// Actions: estado, activar (one click after a purchase, on the card just used), suscribir (checkout),
// usar (spend this month's rescan on a draft order), cancelar, reactivar.
// The Plan Completo includes the first month free, once per person (see mesGratis); otherwise the first month is charged when they subscribe.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_SUB, SITE_URL, SENDER_API_KEY
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ACTIVAS = ["active", "trialing"];

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

async function guardarFila(userId: string, sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await admin.from("suscripciones").upsert({
    user_id: userId, stripe_customer: customer, stripe_subscription: sub.id, estado: sub.status,
    periodo_inicio: new Date(periodo(sub, "current_period_start") * 1000).toISOString(),
    periodo_fin: new Date(periodo(sub, "current_period_end") * 1000).toISOString(),
    cancela: sub.cancel_at_period_end, actualizado: new Date().toISOString(),
  }, { onConflict: "user_id" });
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

// Reads the subscription from Stripe so the answer never depends on a missed webhook.
async function leer(userId: string) {
  const { data: row } = await admin.from("suscripciones").select("*").eq("user_id", userId).maybeSingle();
  if (!row?.stripe_subscription) return { row, sub: null as Stripe.Subscription | null };
  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription);
  const upd = {
    estado: sub.status,
    periodo_inicio: new Date(periodo(sub, "current_period_start") * 1000).toISOString(),
    periodo_fin: new Date(periodo(sub, "current_period_end") * 1000).toISOString(),
    cancela: sub.cancel_at_period_end,
    actualizado: new Date().toISOString(),
  };
  await admin.from("suscripciones").update(upd).eq("user_id", userId);
  return { row: { ...row, ...upd }, sub };
}

// The Plan Completo includes the first month of the follow-up, once per person (never a second free month).
async function mesGratis(userId: string, row: { stripe_subscription?: string | null } | null, esperar = false) {
  if (row?.stripe_subscription) return false;
  for (let i = 0; i < (esperar ? 6 : 1); i++) {
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("tier", "hard").in("status", ["pagado", "listo"]).or("origen.is.null,origen.neq.suscripcion");
    if ((count ?? 0) > 0) return true;
    if (esperar) await new Promise((r) => setTimeout(r, 1500)); // an upgrade paid on Stripe's page can take a moment to land
  }
  return false;
}

async function usado(userId: string, desde: string) {
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("origen", "suscripcion").gte("paid_at", desde);
  return (count ?? 0) > 0;
}

// Test accounts (table "testers") pay $10 MXN for everything and get a 1-day free month, so live charges can be tested cheaply.
const PRUEBA_MXN = 1000;
async function esTester(db: any, userId: string) {
  const { data } = await db.from("testers").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

// Newer Stripe API versions keep the billing period on the subscription item, older ones on the subscription.
const periodo = (sub: Stripe.Subscription, k: "current_period_start" | "current_period_end"): number =>
  Number((sub as unknown as Record<string, unknown>)[k] ?? (sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined)?.[k] ?? Date.now() / 1000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const accion = body.accion ?? "estado";
    // Pesos use the Stripe price; other currencies a monthly price in that currency on the same product.
    const moneda = monedaDe(body.moneda);
    let item: { price: string } | { price_data: { currency: string; product: string; unit_amount: number; recurring: { interval: "month" } } } = { price: Deno.env.get("STRIPE_PRICE_SUB")! };
    if (moneda !== "MXN" && ["activar", "suscribir"].includes(accion)) {
      const p = await stripe.prices.retrieve(Deno.env.get("STRIPE_PRICE_SUB")!);
      item = { price_data: { currency: moneda.toLowerCase(), product: typeof p.product === "string" ? p.product : p.product.id, unit_amount: PRECIOS[moneda].sub, recurring: { interval: "month" } } };
    }
    const tester = ["activar", "suscribir"].includes(accion) && await esTester(admin, user.id);
    if (tester) {
      const p = await stripe.prices.retrieve(Deno.env.get("STRIPE_PRICE_SUB")!);
      item = { price_data: { currency: "mxn", product: typeof p.product === "string" ? p.product : p.product.id, unit_amount: PRUEBA_MXN, recurring: { interval: "month" } } };
    }
    const DIAS = tester ? 1 : 30;
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";

    // One click right after paying for an analysis: subscribe on the card saved at that checkout,
    // free for the first month. Falls back to a checkout page (still with the free month) if there is no saved card.
    if (accion === "activar") {
      const { row, sub } = await leer(user.id);
      if (sub && ACTIVAS.includes(sub.status)) return json({ ya: true });
      const gratis = await mesGratis(user.id, row, !!body.mejora);
      const { data: order } = await supabase.from("orders").select("id,status,stripe_session_id").eq("id", body.order_id).single();
      let customer: string | undefined, pm: string | undefined;
      if (order?.stripe_session_id) {
        const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id, { expand: ["payment_intent", "payment_intent.payment_method"] });
        customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const pi = session.payment_intent as Stripe.PaymentIntent | null;
        const met = pi?.payment_method as Stripe.PaymentMethod | string | null | undefined;
        const metodo = typeof met === "string" ? await stripe.paymentMethods.retrieve(met) : met;
        // only a card that was saved to the customer can be charged later
        if (metodo && metodo.type === "card" && metodo.customer) pm = metodo.id;
      }
      if (customer && pm) {
        try {
          const nueva = await stripe.subscriptions.create({
            customer,
            items: [item],
            default_payment_method: pm,
            metadata: { user_id: user.id, origen: "upsell" },
            // Plan Completo: first month free, the card is charged when it ends. Otherwise charged right away.
            ...(gratis ? { trial_period_days: DIAS } : {}),
            payment_behavior: "error_if_incomplete" as const, off_session: true,
          }, { idempotencyKey: `sub-${user.id}-${order!.id}${gratis ? "-g" : ""}${tester ? "-t" : ""}` });
          if (ACTIVAS.includes(nueva.status)) {
            await guardarFila(user.id, nueva);
            await bienvenidaSub(user.id, nueva);
            return json({ ok: true, prueba: gratis, siguiente_cobro: new Date(((nueva.trial_end ?? periodo(nueva, "current_period_end"))) * 1000).toISOString() });
          }
          await stripe.subscriptions.cancel(nueva.id).catch(() => {});
        } catch (e) { console.error("one-click subscription failed, sending to checkout", e); }
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ ...item, quantity: 1 }],
        ...(row?.stripe_customer ? { customer: row.stripe_customer } : customer ? { customer } : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata: { user_id: user.id, tipo: "suscripcion" },
        subscription_data: { metadata: { user_id: user.id }, ...(gratis ? { trial_period_days: DIAS } : {}) },
        locale: "es-419",
        success_url: `${site}/panel?suscripcion=ok`,
        cancel_url: `${site}/gracias?pedido=${body.order_id ?? ""}`,
      });
      return json({ url: session.url });
    }

    if (accion === "suscribir") {
      const { row, sub } = await leer(user.id);
      if (sub && ACTIVAS.includes(sub.status)) return json({ ya: true });
      const gratis = await mesGratis(user.id, row);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ ...item, quantity: 1 }],
        ...(row?.stripe_customer ? { customer: row.stripe_customer } : { customer_email: user.email }),
        client_reference_id: user.id,
        metadata: { user_id: user.id, tipo: "suscripcion" },
        subscription_data: { metadata: { user_id: user.id }, ...(gratis ? { trial_period_days: DIAS } : {}) },
        locale: "es-419",
        success_url: `${site}/panel?suscripcion=ok`,
        cancel_url: `${site}/panel`,
      });
      return json({ url: session.url });
    }

    const { row, sub } = await leer(user.id);
    const activa = !!sub && ACTIVAS.includes(sub.status);

    if (accion === "estado") {
      return json({
        activa,
        periodo_fin: row?.periodo_fin ?? null,
        cancela: row?.cancela ?? false,
        prueba: sub?.status === "trialing",
        // the free month is covered by the analysis they bought; the first monthly rescan opens when billing starts
        disponible: activa && sub?.status !== "trialing" ? !(await usado(user.id, row!.periodo_inicio)) : false,
        nuevo: !row?.stripe_subscription,
        // the Plan Completo includes the first month (only if they never had the follow-up)
        mes_gratis: !activa && await mesGratis(user.id, row),
      });
    }

    if (accion === "usar") {
      if (!activa) return json({ error: "Sin suscripción activa" }, 400);
      if (sub?.status === "trialing") return json({ error: "Tu primer escaneo del seguimiento se libera al terminar el mes gratis" }, 400);
      if (await usado(user.id, row!.periodo_inicio)) return json({ error: "Ya usaste el escaneo de este mes" }, 400);
      const { data: order } = await supabase.from("orders").select("id,status,photos_consent_at").eq("id", body.order_id).single();
      if (!order || order.status !== "borrador") return json({ error: "Pedido no válido" }, 400);
      if (!order.photos_consent_at) return json({ error: "Faltan fotos o consentimiento" }, 400);
      const { error } = await admin.from("orders").update({
        status: "pagado", tier: "hard", origen: "suscripcion", amount_mxn: 0, paid_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "borrador");
      if (error) throw error;
      return json({ url: `${site}/panel` });
    }

    if (accion === "cancelar" || accion === "reactivar") {
      if (!sub) return json({ error: "Sin suscripción" }, 400);
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: accion === "cancelar" });
      await admin.from("suscripciones").update({ cancela: accion === "cancelar" }).eq("user_id", user.id);
      return json({ ok: true, cancela: accion === "cancelar", periodo_fin: row?.periodo_fin });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo completar" }, 500);
  }
});
