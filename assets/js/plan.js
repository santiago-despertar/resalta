// Reading version of the month's nutrition and training plan, made to be saved as a PDF from the browser (vector, sharp at any zoom).
(function () {
  const C = window.RESALTA || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lst = a => (Array.isArray(a) ? a : []);
  const li = a => lst(a).map(x => `<li>${esc(x)}</li>`).join("");
  const fecha = d => new Date(d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const fallo = t => { $("#docWait").hidden = true; const m = $("#docMsg"); m.textContent = t; m.className = "msg show err"; };
  const seccion = (titulo, cuerpo, sub, nueva) => cuerpo ? `<section class="doc-s${nueva ? " doc-nueva" : ""}"><h2>${titulo}</h2>${sub ? `<p class="doc-sub">${sub}</p>` : ""}${cuerpo}</section>` : "";

  (async () => {
    if (!window.supabase || !C.SUPABASE_URL) return fallo("No pudimos cargar tu plan. Vuelve a intentarlo en un momento.");
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.replace("/cuenta?modo=entrar&next=" + encodeURIComponent(location.pathname + location.search)); return; }
    const id = new URLSearchParams(location.search).get("f");
    let q = sb.from("fisico").select("id,created_at,plan_at,peso_kg,datos,plan,estado");
    q = id ? q.eq("id", id) : q.eq("estado", "listo").order("created_at", { ascending: false }).limit(1);
    const { data } = await q;
    const fila = (data || [])[0];
    if (!fila || !fila.plan) return fallo("Tu plan todavía no está listo. Vuelve a tu cuenta para verlo.");
    const P = fila.plan, N = P.numeros || {}, M = P.metas || {}, E = P.entreno || {}, K = P.cara || {};
    const rec = {}; lst(P.recetas).forEach(r => { rec[r.id] = r; });
    const nombre = ((user.user_metadata && user.user_metadata.full_name) || "").split(" ")[0];

    let h = `<header class="doc-cover">
      <div class="doc-brand"><img src="/assets/img/mark-ink.svg" alt=""><span>resalta</span></div>
      <p class="label">Seguimiento mensual · ${esc(fecha(fila.plan_at || fila.created_at))}</p>
      <h1>${nombre ? `Plan de nutrición y ejercicio de <span class="doc-muted">${esc(nombre)}</span>` : "Tu plan de nutrición y ejercicio"}</h1>
      <div class="pl-nums">${[[N.kcal, "calorías al día"], [`${N.prot} g`, "proteína"], [`${N.carbs} g`, "carbohidratos"], [`${N.grasa} g`, "grasa"], [`${N.agua} L`, "agua"]].map(([v, t]) => `<div><b>${esc(v)}</b><span>${t}</span></div>`).join("")}</div>
      <p class="doc-resumen">${esc(P.resumen)}</p>
      ${P.v === 2 ? `<div class="doc-cols pl-metas"><div><p class="label">Tu meta del mes</p><p><b>Peso:</b> ${esc(M.peso)}<br>${esc(M.cara)}<br>Ritmo esperado: ${esc(M.ritmo || N.ritmo)}.</p></div><div><p class="label">Cómo se va a notar en tu cara</p><p>${esc(P.en_tu_cara)}</p></div></div>` : `<p>${esc(P.en_tu_cara)}</p>`}
      <p class="doc-sub">Empezaste con ${esc(fila.peso_kg)} kg.</p>
    </header>`;

    if (P.v === 2) {
      lst(P.semanas).forEach((S, i) => {
        const dias = lst(S.dias).map(d => `<div class="pl-dia"><p class="pl-dia-t"><b>${esc(d.dia)}</b><span>${lst(d.comidas).reduce((t, c) => t + (Number((rec[c.receta] || {}).kcal) || 0), 0)} kcal</span></p>
          ${lst(d.comidas).map(c => { const r = rec[c.receta] || {}; return `<div class="pl-com"><span>${esc(c.momento)}</span><b>${esc(r.nombre)}</b><i>${esc(r.id)}</i></div>`; }).join("")}</div>`).join("");
        h += seccion(`Semana ${i + 1}: tu menú`, `<p>${esc(S.enfoque)}</p><div class="pl-dias">${dias}</div><p class="label">Lista del súper</p><ul class="pl-lista">${li(S.lista)}</ul>`, "Cada platillo tiene su receta al final, con el mismo código.", true);
      });
      h += seccion("Tus recetas", lst(P.recetas).map(r => `<div class="doc-zona"><div class="doc-zona-t"><b><span class="doc-n pl-n">${esc(r.id)}</span>${esc(r.nombre)}</b><span>${esc(r.kcal)} kcal · ${esc(r.prot)} g prot</span></div>
        <div class="doc-cols"><div><p class="label">Ingredientes</p><ul>${li(r.ingredientes)}</ul></div><div><p class="label">Preparación</p><ol>${li(r.pasos)}</ol></div></div></div>`).join(""), "", true);
      h += seccion("Si te falta algo", `<ul>${li(P.cambios)}</ul>`);
      const ej = lst(E.dias).map(d => `<div class="doc-zona"><div class="doc-zona-t"><b>${esc(d.dia)} · ${esc(d.enfoque)}</b></div>
        <table class="doc-t"><thead><tr><th>Ejercicio</th><th>Sem 1</th><th>Sem 2</th><th>Sem 3</th><th>Sem 4</th><th>Descanso</th></tr></thead><tbody>
        ${lst(d.ejercicios).map(e => `<tr><td><b>${esc(e.nombre)}</b><br><span class="pl-tec">${esc(e.tecnica)}${e.casa ? ` En casa: ${esc(e.casa)}` : ""}</span></td>${[0, 1, 2, 3].map(k => `<td>${esc(lst(e.semanas)[k] || "")}</td>`).join("")}<td>${esc(e.descanso)}</td></tr>`).join("")}</tbody></table></div>`).join("");
      h += seccion("Tu entrenamiento de 4 semanas", `<div class="doc-cols"><div><p class="label">Calentamiento</p><ul>${li(E.calentamiento)}</ul></div><div><p class="label">Estiramiento al final</p><ul>${li(E.estiramiento)}</ul></div></div>${ej}
        <p class="label">Pasos y cardio</p><ul>${lst(E.cardio).map((c, k) => `<li><b>Semana ${k + 1}:</b> ${esc(c)}</li>`).join("")}</ul><p class="label">Cómo ir subiendo</p><p>${esc(E.progresion)}</p>`, "Las series y repeticiones cambian cada semana. Usa un peso con el que la última repetición cueste trabajo pero salga bien.", true);
      h += seccion("Lo que más se nota en tu cara", `<div class="doc-cols"><div><p class="label">Para que tu cara no se hinche</p><ul>${li(K.hinchazon)}</ul></div><div><p class="label">Bajar grasa y tu cara</p><p>${esc(K.grasa)}</p></div></div><p class="label">Tus hábitos diarios</p><ul>${li(P.habitos)}</ul>`);
    } else {
      h += seccion("Tus comidas", lst(P.comidas).map(c => `<div class="doc-zona"><b>${esc(c.momento)}</b><ul>${li(c.opciones)}</ul></div>`).join(""), "Un día tipo. En cada comida elige cualquiera de las opciones.", true);
      h += seccion("Tu entrenamiento", lst(E.dias).map(d => `<div class="doc-zona"><b>${esc(d.dia)} · ${esc(d.enfoque)}</b><ul>${lst(d.ejercicios).map(e => `<li>${esc(e.nombre)}: ${esc(e.series)} × ${esc(e.reps)}</li>`).join("")}</ul></div>`).join("") + `<p>${esc(E.cardio)}</p><p>${esc(E.progresion)}</p>`);
      h += seccion("Hábitos", `<ul>${li(P.habitos)}</ul><p class="label">Lista del súper</p><ul>${li(P.lista_super)}</ul>`);
    }
    h += `<footer class="doc-foot"><p>Es una guía general de alimentación y ejercicio, no un tratamiento médico. Si tienes alguna condición de salud, platícalo con tu médico antes de empezar.</p><p>resalta.co</p></footer>`;

    const doc = $("#doc"); doc.innerHTML = h; doc.hidden = false; $("#docWait").hidden = true;
    document.title = (nombre ? `Plan de ${nombre}` : "Tu plan del mes") + " · Resalta";
    const b = $("#docPdf"); b.disabled = false; b.onclick = () => window.print();
    const ua = navigator.userAgent, tip = $("#docTip");
    if (tip && /iPhone|iPad|iPod/.test(ua)) tip.innerHTML = "Se abre la ventana de imprimir. Arriba toca el ícono de <b>compartir</b> y elige <b>Guardar en Archivos</b>. El PDF queda en alta calidad.";
    else if (tip && /Android/.test(ua)) tip.innerHTML = "Se abre la ventana de imprimir. En <b>Impresora</b> elige <b>Guardar como PDF</b> y toca el botón de descarga.";
  })().catch(() => fallo("No pudimos cargar tu plan. Vuelve a intentarlo en un momento."));
})();
