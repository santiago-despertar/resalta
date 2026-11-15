// Email opens and clicks. Every email we send has a 1px image (?a=o&i=<id>) and its resalta.co links go
// through here (?a=c&i=<id>&u=<url>). Both are logged in public.correos_log. Only resalta.co destinations
// are allowed, so this can't be used as an open redirect. Deploy with JWT verification off.
// Note: Apple Mail loads images on its own, so opens are an estimate. Clicks are exact.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const SITE = Deno.env.get("SITE_URL") ?? "https://resalta.co";

async function marcar(i: string, t: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(i)) return;
  try { await admin.rpc("correo_evento", { i, t }); } catch (e) { console.error("correo_evento", e); }
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const a = u.searchParams.get("a"), i = u.searchParams.get("i") ?? "";
  if (a === "c") {
    let destino = SITE;
    try {
      const d = new URL(u.searchParams.get("u") ?? "");
      if (d.protocol === "https:" && /(^|\.)resalta\.co$/.test(d.hostname)) destino = d.toString();
    } catch { /* bad url: go home */ }
    await marcar(i, "clic");
    return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store" } });
  }
  await marcar(i, "abierto");
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } });
});
