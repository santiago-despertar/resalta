// Resalta public configuration. These values are safe to publish (publishable keys only).
// Never put the Stripe secret key or the Supabase service_role key here.
window.RESALTA = {
  SUPABASE_URL: "https://jxluabbugwdonqchbaxm.supabase.co",        // e.g. https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_WPce-iugGd2zyglAsGfnLQ_nR-JUXYI",   // Supabase "anon public" key
  // Shown on the site. The real charge comes from the Stripe prices.
  PRICES: { soft: "$1,499", hard: "$2,999" },
  // Offer on the thank-you page for people who skipped the upgrade. "now" must match UPGRADE_PRICE_MXN in Supabase.
  UPSELL: { was: "$1,500", now: "$999" },
  // Affiliate commission, % of what the buyer paid. Must match afiliados.comision_pct in Supabase.
  AF_PCT: 50,
  PLAN_NAMES: { soft: "Plan Esencial", hard: "Plan Completo" },
  // Monthly follow-up plan. Must match the Stripe price in STRIPE_PRICE_SUB.
  SUB_PRICE: "$349",
  // Price levels by onboarding answers: [Esencial, Completo, upgrade to Completo], in each currency's own units.
  // The visitor only ever sees their own level. The server charges from the same table (create-checkout and
  // upgrade-order keep a copy: keep all three in sync). "normal" is the regular price shown on the public pages.
  NIVELES: {
    MXN: { bajo: [199, 399, 149], medio: [699, 1299, 449], normal: [1499, 2999, 999], alto: [2499, 4999, 1699] },
    USD: { bajo: [10, 20, 8], medio: [35, 69, 25], normal: [79, 159, 49], alto: [129, 259, 85] },
    EUR: { bajo: [9, 19, 7], medio: [29, 59, 22], normal: [69, 139, 45], alto: [119, 239, 79] },
    COP: { bajo: [35000, 69000, 25000], medio: [119000, 229000, 79000], normal: [259000, 519000, 169000], alto: [429000, 859000, 289000] },
    CLP: { bajo: [10990, 21990, 7990], medio: [36990, 69990, 23990], normal: [79990, 159990, 49990], alto: [129990, 259990, 84990] },
    PEN: { bajo: [39, 79, 29], medio: [129, 249, 85], normal: [279, 559, 189], alto: [459, 919, 309] }
  },
  // Local prices, shown and charged in the visitor's currency. Rounded on purpose, not live exchange rates.
  // The amounts the server charges are in supabase/functions/_precios.ts (keep both in sync). MXN uses the Stripe prices above.
  MONEDAS: {
    MXN: { soft: "$1,499", hard: "$2,999", was: "$1,500", now: "$999", sub: "$349", n: { soft: 1499, hard: 2999 },
           proc: ["Menos de $10,000 MXN", "$10,000 a $30,000 MXN", "$30,000 a $80,000 MXN", "Más de $80,000 MXN"],
           dia: ["Menos de $500 MXN", "$500 a $2,000 MXN", "$2,000 a $5,000 MXN", "Más de $5,000 MXN"] },
    USD: { soft: "US$79", hard: "US$159", was: "US$80", now: "US$49", sub: "US$19", n: { soft: 79, hard: 159 },
           proc: ["Menos de US$500", "US$500 a US$1,500", "US$1,500 a US$4,000", "Más de US$4,000"],
           dia: ["Menos de US$25", "US$25 a US$100", "US$100 a US$250", "Más de US$250"] },
    EUR: { soft: "69 €", hard: "139 €", was: "70 €", now: "45 €", sub: "16 €", n: { soft: 69, hard: 139 },
           proc: ["Menos de 500 €", "500 € a 1.500 €", "1.500 € a 4.000 €", "Más de 4.000 €"],
           dia: ["Menos de 25 €", "25 € a 100 €", "100 € a 250 €", "Más de 250 €"] },
    COP: { soft: "$259.000", hard: "$519.000", was: "$260.000", now: "$169.000", sub: "$59.000", n: { soft: 259000, hard: 519000 },
           proc: ["Menos de $2.000.000 COP", "$2.000.000 a $6.000.000 COP", "$6.000.000 a $15.000.000 COP", "Más de $15.000.000 COP"],
           dia: ["Menos de $100.000 COP", "$100.000 a $400.000 COP", "$400.000 a $1.000.000 COP", "Más de $1.000.000 COP"] },
    CLP: { soft: "$79.990", hard: "$159.990", was: "$80.000", now: "$49.990", sub: "$18.990", n: { soft: 79990, hard: 159990 },
           proc: ["Menos de $500.000 CLP", "$500.000 a $1.500.000 CLP", "$1.500.000 a $4.000.000 CLP", "Más de $4.000.000 CLP"],
           dia: ["Menos de $25.000 CLP", "$25.000 a $100.000 CLP", "$100.000 a $250.000 CLP", "Más de $250.000 CLP"] },
    PEN: { soft: "S/ 279", hard: "S/ 559", was: "S/ 280", now: "S/ 189", sub: "S/ 65", n: { soft: 279, hard: 559 },
           proc: ["Menos de S/ 2,000", "S/ 2,000 a S/ 5,000", "S/ 5,000 a S/ 15,000", "Más de S/ 15,000"],
           dia: ["Menos de S/ 100", "S/ 100 a S/ 350", "S/ 350 a S/ 900", "Más de S/ 900"] }
  }
};

// Which price level an order gets, from its onboarding answers. Same rules as nivelPrecio() in create-checkout.
//   bajo:   18 to 21 years old, or the lowest monthly budget
//   alto:   the highest monthly budget, or $30,000 MXN (or the local equivalent) or more for procedures
//   medio:  the second monthly budget option
//   normal: everyone else (the third monthly budget option, or no answer)
window.RESALTA.nivelPrecio = function (a) {
  a = a || {};
  var p = String(a.presupuesto || "").trim(), pp = String(a.presupuesto_procedimientos || "").trim(), edad = Number(a.edad) || 0;
  var DIA2 = ["$500 a $2,000 MXN", "$500 a $2,000", "US$25 a US$100", "25 € a 100 €", "$100.000 a $400.000 COP", "$25.000 a $100.000 CLP", "S/ 100 a S/ 350"];
  var PROC3 = ["$30,000 a $80,000 MXN", "$30,000 a $80,000", "US$1,500 a US$4,000", "1.500 € a 4.000 €", "$6.000.000 a $15.000.000 COP", "$1.500.000 a $4.000.000 CLP", "S/ 5,000 a S/ 15,000"];
  if ((edad >= 18 && edad <= 21) || /^menos/i.test(p)) return "bajo";
  if (/^m[aá]s/i.test(p) || /^m[aá]s/i.test(pp) || PROC3.indexOf(pp) >= 0) return "alto";
  if (DIA2.indexOf(p) >= 0) return "medio";
  return "normal";
};
