// Receives Google Cloud budget notifications (Pub/Sub push) and keeps this month's real Google bill in gasto_google, for the admin.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const CUENTA = "014641-A3F1AE-F24B51";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const b = await req.json(); const m = b?.message ?? {};
    if ((m.attributes?.billingAccountId ?? "") !== CUENTA) return new Response("ignorado", { status: 200 });
    const d = JSON.parse(atob(m.data ?? ""));
    const periodo = String(d.costIntervalStart ?? "").slice(0, 10);
    if (!periodo) return new Response("sin periodo", { status: 200 });
    const { error } = await admin.from("gasto_google").upsert({ periodo, presupuesto: d.budgetDisplayName ?? null, costo: Number(d.costAmount ?? 0), moneda: d.currencyCode ?? null, monto_presupuesto: Number(d.budgetAmount ?? 0), actualizado: new Date().toISOString() });
    if (error) console.error(error.message);
  } catch (e) { console.error("google-gasto", String(e)); }
  return new Response("ok");
});
