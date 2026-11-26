// Creates a Stripe Checkout session for one of the signed-in user's draft orders.
// Secrets (set in Supabase > Edge Functions > Secrets): STRIPE_SECRET_KEY, STRIPE_PRICE_SOFT, STRIPE_PRICE_HARD, SITE_URL
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://resalta.co",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Local prices, in the smallest unit Stripe uses for each currency (CLP has no cents). Keep in sync with MONEDAS in assets/js/config.js.
const PRECIOS: Record<string, { soft: number; hard: number; up: number; sub: number }> = {
  MXN: { soft: 149900, hard: 299900, up: 99900, sub: 34900 },
  USD: { soft: 7900, hard: 15900, up: 4900, sub: 1900 },
  EUR: { soft: 6900, hard: 13900, up: 4500, sub: 1600 },
  COP: { soft: 25900000, hard: 51900000, up: 16900000, sub: 5900000 },
  CLP: { soft: 79990, hard: 159990, up: 49990, sub: 18990 },
  PEN: { soft: 27900, hard: 55900, up: 18900, sub: 6500 },
};
// Price levels by onboarding answers: [Esencial, Completo, upgrade to Completo], in each currency's own units
// (pesos, dollars...). Keep in sync with NIVELES and nivelPrecio in assets/js/config.js and the other functions.
const NIVELES: Record<string, Record<string, [number, number, number]>> = {
  MXN: { bajo: [199, 399, 149], medio: [699, 1299, 449], normal: [1499, 2999, 999], alto: [2499, 4999, 1699] },
  USD: { bajo: [10, 20, 8], medio: [35, 69, 25], normal: [79, 159, 49], alto: [129, 259, 85] },
  EUR: { bajo: [9, 19, 7], medio: [29, 59, 22], normal: [69, 139, 45], alto: [119, 239, 79] },
  COP: { bajo: [35000, 69000, 25000], medio: [119000, 229000, 79000], normal: [259000, 519000, 169000], alto: [429000, 859000, 289000] },
  CLP: { bajo: [10990, 21990, 7990], medio: [36990, 69990, 23990], normal: [79990, 159990, 49990], alto: [129990, 259990, 84990] },
  PEN: { bajo: [39, 79, 29], medio: [129, 249, 85], normal: [279, 559, 189], alto: [459, 919, 309] },
};
// Stripe amounts are in cents, except CLP, which has none.
const enStripe = (moneda: string, n: number) => Math.round(n * (moneda === "CLP" ? 1 : 100));
//   bajo:   18 to 21 years old, or the lowest monthly budget
//   alto:   the highest monthly budget, or $30,000 MXN (or the local equivalent) or more for procedures
//   medio:  the second monthly budget option
//   normal: everyone else
// deno-lint-ignore no-explicit-any
function nivelPrecio(a: any): string {
  a = a ?? {};
  const p = String(a.presupuesto ?? "").trim(), pp = String(a.presupuesto_procedimientos ?? "").trim(), edad = Number(a.edad) || 0;
  const DIA2 = ["$500 a $2,000 MXN", "$500 a $2,000", "US$25 a US$100", "25 € a 100 €", "$100.000 a $400.000 COP", "$25.000 a $100.000 CLP", "S/ 100 a S/ 350"];
  const PROC3 = ["$30,000 a $80,000 MXN", "$30,000 a $80,000", "US$1,500 a US$4,000", "1.500 € a 4.000 €", "$6.000.000 a $15.000.000 COP", "$1.500.000 a $4.000.000 CLP", "S/ 5,000 a S/ 15,000"];
  if ((edad >= 18 && edad <= 21) || /^menos/i.test(p)) return "bajo";
  if (/^m[aá]s/i.test(p) || /^m[aá]s/i.test(pp) || PROC3.includes(pp)) return "alto";
  if (DIA2.includes(p)) return "medio";
  return "normal";
}
const monedaDe = (m: unknown) => { const c = String(m ?? "").toUpperCase(); return PRECIOS[c] ? c : "MXN"; };
// Any charged amount expressed in pesos, using the same ratio as the price table. Commissions are always in pesos.
const aPesos = (amount: number | null | undefined, currency: string | null | undefined) => {
  const c = monedaDe(currency); if (!amount) return 0;
  return c === "MXN" ? Math.round(amount / 100) : Math.round(amount * 1499 / PRECIOS[c].soft);
};

// Test accounts (table "testers") pay $10 MXN for everything and get a 1-day free month, so live charges can be tested cheaply.
const PRUEBA_MXN = 1000;
async function esTester(db: any, userId: string) {
  const { data } = await db.from("testers").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { order_id, tier: wanted, ref, moneda: m, fbp, fbc } = await req.json();
    const moneda = monedaDe(m);
    const { data: order } = await supabase.from("orders").select("id,status,tier,photos_consent_at,afiliado_id,answers").eq("id", order_id).single();
    if (!order || order.status !== "borrador") return json({ error: "Pedido no válido" }, 400);
    const tier = (wanted ?? order.tier) === "hard" ? "hard" : "soft";
    if (!order.photos_consent_at) return json({ error: "Faltan fotos o consentimiento" }, 400);

    // Keep the stored plan in sync with what the customer picked on the payment step.
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // The price depends on the answers saved with the order (age and budget), never on what the browser sends.
    const nivel = nivelPrecio(order.answers);
    await admin.from("orders").update({ tier, nivel_precio: nivel }).eq("id", order.id).eq("status", "borrador");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

    // Affiliate: keep the one already on the order, otherwise use the link the buyer came from.
    // Nobody earns a commission on their own purchase.
    let afiliado: { id: string; descuento_pct: number } | null = null;
    if (order.afiliado_id) {
      const { data } = await admin.from("afiliados").select("id,descuento_pct,activo,user_id").eq("id", order.afiliado_id).maybeSingle();
      if (data && data.activo && data.user_id !== user.id) afiliado = data;
    } else if (ref) {
      const codigo = String(ref).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
      const { data } = await admin.from("afiliados").select("id,descuento_pct,activo,user_id").eq("codigo", codigo).maybeSingle();
      if (data && data.activo && data.user_id !== user.id) {
        afiliado = data;
        await admin.from("orders").update({ afiliado_id: data.id }).eq("id", order.id).eq("status", "borrador");
      }
    }
    let discounts: { coupon: string }[] | undefined;
    const pct = afiliado ? Math.round(Number(afiliado.descuento_pct) || 0) : 0;
    if (pct > 0) {
      const id = `AFILIADO_${pct}`;
      // Only apply the discount if the coupon really exists, so a Stripe hiccup never blocks the payment.
      const cupon = await stripe.coupons.retrieve(id).catch(() =>
        stripe.coupons.create({ id, percent_off: pct, duration: "once", name: `Invitación ${pct}%` }).catch(e => { console.error("coupon", e); return null; }));
      if (cupon) discounts = [{ coupon: id }];
    }
    const site = Deno.env.get("SITE_URL") ?? "https://resalta.co";
    // The regular price in pesos uses the Stripe prices; any other level or currency charges the amount from the
    // table on the same Stripe product.
    const priceId = Deno.env.get(tier === "hard" ? "STRIPE_PRICE_HARD" : "STRIPE_PRICE_SOFT")!;
    let linea: Stripe.Checkout.SessionCreateParams.LineItem = { price: priceId, quantity: 1 };
    if (moneda !== "MXN" || nivel !== "normal") {
      const precio = await stripe.prices.retrieve(priceId);
      const product = typeof precio.product === "string" ? precio.product : precio.product.id;
      const t = (NIVELES[moneda] ?? NIVELES.MXN)[nivel];
      linea = { quantity: 1, price_data: { currency: moneda.toLowerCase(), product, unit_amount: enStripe(moneda, tier === "hard" ? t[1] : t[0]) } };
    }
    if (await esTester(admin, user.id)) {
      const precio = await stripe.prices.retrieve(priceId);
      const product = typeof precio.product === "string" ? precio.product : precio.product.id;
      linea = { quantity: 1, price_data: { currency: "mxn", product, unit_amount: PRUEBA_MXN } };
    }
    // Months without interest only exist for Mexican cards in pesos.
    const cuotas = moneda === "MXN" ? { installments: { enabled: true } } : {};
    const base = {
      mode: "payment" as const,
      line_items: [linea],
      customer_creation: "always" as const,
      customer_email: user.email,
      client_reference_id: order.id,
      metadata: { order_id: order.id, user_id: user.id, tier, moneda, nivel, afiliado_id: afiliado ? afiliado.id : "",
        // Meta browser ids, so the server-side purchase matches the visitor
        fbp: String(fbp ?? "").slice(0, 200), fbc: String(fbc ?? "").slice(0, 400) },
      ...(discounts ? { discounts } : {}),
      locale: "es-419" as const,
      success_url: `${site}/gracias?pedido=${order.id}`,
      cancel_url: `${site}/analisis`,
    };
    let session;
    try {
      // Saves the card so the one-click upgrade on the thank-you page can reuse it.
      session = await stripe.checkout.sessions.create({
        ...base,
        payment_method_options: { card: { ...cuotas, setup_future_usage: "off_session" } },
      });
    } catch (e) {
      console.error("checkout with saved card failed, retrying without it", e);
      session = await stripe.checkout.sessions.create({
        ...base,
        ...(moneda === "MXN" ? { payment_method_options: { card: cuotas } } : {}),
      });
    }
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo crear el pago" }, 500);
  }
});
