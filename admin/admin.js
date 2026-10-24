/* Lukavac Info — admin dashboard (Supabase Auth + RLS; javni klijent nema pristup ovim tabelama). */
(() => {
  const {LANGS, LANG_NAMES, esc, tr, media, qrUrl, qrSvg, qrPng, download} = LK;
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n || 0).toLocaleString("bs-BA");
  const pct = (a, b) => b ? Math.round(100 * a / b) + " %" : "–";
  let db, user, settings = {}, locs = [], stats = null, rewards = [];
  let currentTab = "stats";

  /* ---------------- start / prijava ---------------- */
  async function boot() {
    try { db = await LK.sb(); }
    catch (e) { $("boot").textContent = e.message; return; }
    const {data: {session}} = await db.auth.getSession();
    if (session) await enter(session.user); else showLogin();
    $("boot").hidden = true;
  }
  function showLogin(msg = "") {
    $("app").hidden = true; $("login").hidden = false; $("loginMsg").textContent = msg;
  }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    $("loginMsg").textContent = "Prijava…";
    const {data, error} = await db.auth.signInWithPassword({email: f.get("email"), password: f.get("password")});
    if (error) { $("loginMsg").textContent = "Prijava nije uspjela: " + error.message; return; }
    await enter(data.user);
  });
  $("logout").addEventListener("click", async () => { await db.auth.signOut(); showLogin("Odjavljeni ste."); });
  $("changePw").addEventListener("click", async () => {
    const p1 = prompt("Nova lozinka (najmanje 10 znakova):");
    if (!p1) return;
    if (p1.length < 10) { alert("Lozinka je prekratka."); return; }
    if (prompt("Ponovite novu lozinku:") !== p1) { alert("Lozinke se ne podudaraju."); return; }
    const {error} = await db.auth.updateUser({password: p1});
    alert(error ? "Greška: " + error.message : "Lozinka je promijenjena.");
  });

  async function enter(u) {
    user = u;
    const {data, error} = await db.from("admins").select("user_id").eq("user_id", u.id).maybeSingle();
    if (error || !data) { await db.auth.signOut(); showLogin("Ovaj korisnik nema admin prava. Dodajte ga u tabelu admins (vidi README)."); return; }
    $("who").textContent = u.email;
    $("login").hidden = true; $("app").hidden = false;
    await Promise.all([loadSettings(), loadLocations()]);
    showTab("stats");
  }

  /* ---------------- navigacija ---------------- */
  function showView(v) {
    document.querySelectorAll("[data-view]").forEach(s => s.hidden = s.dataset.view !== v);
    window.scrollTo(0, 0);
  }
  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    showView(tab);
    ({stats: loadStats, locations: renderLocList, rewards: loadRewards, claims: loadClaims, settings: renderSettings})[tab]?.();
  }
  $("tabs").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });
  document.querySelectorAll("[data-back]").forEach(b => b.addEventListener("click", () => showTab(currentTab)));

  /* ---------------- podaci ---------------- */
  async function loadSettings() {
    const {data} = await db.from("settings").select("*").eq("id", 1).maybeSingle();
    settings = data || {};
  }
  async function loadLocations() {
    const {data, error} = await db.from("locations").select("*, location_secrets(code, rotated_at)").order("sort_order").order("slug");
    if (error) { alert("Greška pri učitavanju lokacija: " + error.message); return; }
    locs = data.map(l => ({...l, secret: Array.isArray(l.location_secrets) ? l.location_secrets[0] : l.location_secrets}));
  }
  const baseUrl = () => settings.public_base_url || location.origin;

  /* ================= STATISTIKA ================= */
  async function loadStats() {
    $("statsWhen").textContent = "Učitavanje…";
    const {data, error} = await db.rpc("admin_stats", {p_days: 30});
    if (error) { $("statsWhen").textContent = "Greška: " + error.message; return; }
    stats = data;
    renderStats();
  }
  $("statsRefresh").addEventListener("click", loadStats);
  $("trendLoc").addEventListener("change", renderCharts);

  function kpi(label, value, sub = "", cls = "") {
    return `<div class="kpi ${cls}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
  }
  function renderStats() {
    const T = stats.total;
    $("statsWhen").textContent = "Stanje: " + new Date(stats.generatedAt).toLocaleString("bs-BA", {dateStyle: "short", timeStyle: "short"});
    const diff = T.today - T.yesterday;
    $("statsWarn").hidden = stats.stampsEnabled !== false;
    $("statsWarn").textContent = "Pečati su trenutno globalno isključeni (Postavke).";
    $("kpis").innerHTML = [
      kpi("Danas", fmt(T.today), `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} u odnosu na jučer`, "hero"),
      kpi("Jučer", fmt(T.yesterday)),
      kpi("Zadnjih 7 dana", fmt(T.d7)),
      kpi("Zadnjih 30 dana", fmt(T.d30), `ukupno ${fmt(T.total)}`),
      kpi("Unikatni uređaji", fmt(T.uniq30), `30 dana · danas ${fmt(T.uniq_today)} · 7 dana ${fmt(T.uniq7)}`),
      kpi("Dodijeljeni pečati", fmt(T.stamps), `danas ${fmt(T.stamps_today)}`),
      kpi("GPS potvrđeni pečati", pct(T.stamps_gps, T.stamps), `${fmt(T.stamps_gps)} od ${fmt(T.stamps)}`),
      kpi("Odbijeni pokušaji", fmt(T.rejected30), `30 dana · danas ${fmt(T.rejected_today)} · ukupno ${fmt(T.rejected)}`, T.rejected_today ? "warn" : ""),
      kpi("Nagrade", fmt(T.claims), `izdano · iskorišteno ${fmt(T.redeemed)}`)
    ].join("");

    const sel = $("trendLoc"), prev = sel.value;
    sel.innerHTML = `<option value="">Sve lokacije</option>` + stats.locations.map(l => `<option value="${esc(l.id)}">${esc(tr(l.name))}</option>`).join("");
    sel.value = prev && stats.locations.some(l => l.id === prev) ? prev : "";

    const rows = stats.locations.map(l => `<tr data-id="${esc(l.id)}" class="${l.published ? "" : "off"}">
      <th scope="row">${esc(tr(l.name))}${l.published ? "" : ' <span class="badge warn">isključena</span>'}${l.stamp_enabled ? "" : ' <span class="badge">bez pečata</span>'}</th>
      <td>${fmt(l.today)}</td><td>${fmt(l.yesterday)}</td><td>${fmt(l.d7)}</td><td>${fmt(l.d30)}</td><td>${fmt(l.uniq30)}</td>
      <td>${fmt(l.stamps)}</td><td>${pct(l.stamps_gps, l.stamps)}</td><td class="${l.rejected30 ? "warn" : ""}">${fmt(l.rejected30)}</td><td>${fmt(l.no_code30)}</td>
      <td class="spark-cell">${spark(l.daily.slice(-14))}</td></tr>`).join("");
    $("statsTable").innerHTML = `<thead><tr><th>Lokacija</th><th>Danas</th><th>Jučer</th><th>7 dana</th><th>30 dana</th><th>Unikatni<br><small>30 dana</small></th>
      <th>Pečati</th><th>GPS</th><th>Odbijeni<br><small>30 dana</small></th><th>Bez koda<br><small>30 dana</small></th><th>14 dana</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>Ukupno</th><td>${fmt(T.today)}</td><td>${fmt(T.yesterday)}</td><td>${fmt(T.d7)}</td><td>${fmt(T.d30)}</td><td>${fmt(T.uniq30)}</td>
      <td>${fmt(T.stamps)}</td><td>${pct(T.stamps_gps, T.stamps)}</td><td>${fmt(T.rejected30)}</td><td></td><td class="spark-cell">${spark(T.daily.slice(-14))}</td></tr></tfoot>`;
    renderCharts();
  }
  $("statsTable").addEventListener("click", e => {
    const tr_ = e.target.closest("tbody tr[data-id]");
    if (!tr_) return;
    $("trendLoc").value = tr_.dataset.id; renderCharts();
    $("trendChart").scrollIntoView({behavior: "smooth", block: "center"});
  });

  function spark(arr) {
    const max = Math.max(1, ...arr), w = 3, gap = 1;
    return `<svg class="spark" viewBox="0 0 ${arr.length * (w + gap)} 20" preserveAspectRatio="none" aria-hidden="true">${
      arr.map((v, i) => `<rect x="${i * (w + gap)}" y="${20 - Math.max(v ? 1.5 : 0.5, 20 * v / max)}" width="${w}" height="${Math.max(v ? 1.5 : 0.5, 20 * v / max)}" rx="0.8"/>`).join("")}</svg>`;
  }
  function niceMax(m) { if (m <= 4) return 4; const p = 10 ** Math.floor(Math.log10(m)); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= m) return k * p; return 10 * p; }
  // Stupčasti graf (jedna serija) sa mrežom, osama i tooltipom na prelaz miša
  function barChart(el, values, labels, {labelEvery = 1, tip = (v, l) => `${l}: ${v}`} = {}) {
    const W = 640, H = 220, L = 34, R = 8, Tp = 10, B = 26;
    const max = niceMax(Math.max(0, ...values));
    const iw = W - L - R, ih = H - Tp - B, step = iw / values.length, bw = Math.max(2, step - 2);
    const y = v => Tp + ih - ih * v / max;
    const ticks = [0, max / 4, max / 2, 3 * max / 4, max].filter(v => Number.isInteger(v));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf">`;
    s += ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
    values.forEach((v, i) => {
      const x = L + i * step + (step - bw) / 2, h = Math.max(0, ih * v / max);
      const r = Math.min(4, bw / 2, h);
      const path = h > 0 ? `M${x},${Tp + ih} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z` : "";
      s += `<g class="bar"><rect class="hit" x="${L + i * step}" y="${Tp}" width="${step}" height="${ih}"/>${path ? `<path d="${path}"/>` : ""}<title>${esc(tip(v, labels[i]))}</title></g>`;
      if (i % labelEvery === 0 || i === values.length - 1) s += `<text class="ax" x="${L + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    s += `<line class="base" x1="${L}" x2="${W - R}" y1="${Tp + ih}" y2="${Tp + ih}"/></svg>`;
    el.innerHTML = s;
  }
  function renderCharts() {
    if (!stats) return;
    const id = $("trendLoc").value;
    const src = id ? stats.locations.find(l => l.id === id) : stats.total;
    const days = stats.days.map(d => { const [, m, dd] = d.split("-"); return `${+dd}.${+m}.`; });
    barChart($("trendChart"), src.daily, days, {labelEvery: 5, tip: (v, l) => `${l} — ${v} skeniranja`});
    barChart($("hourChart"), src.hourly, [...Array(24).keys()].map(h => String(h)), {labelEvery: 3, tip: (v, l) => `${l}:00–${l}:59 — ${v} skeniranja`});
  }

  /* ================= LOKACIJE ================= */
  function renderLocList() {
    const sm = new Map((stats?.locations || []).map(l => [l.id, l]));
    $("locList").innerHTML = locs.map(l => {
      const s = sm.get(l.id);
      const img = l.image ? `<img src="${esc(media(l.image))}" alt="" loading="lazy">` : `<div class="ph"></div>`;
      return `<div class="loc-item card">
        ${img}
        <div class="loc-main">
          <div class="loc-name">${esc(tr(l.name))} ${l.published ? '<span class="badge on">aktivna</span>' : '<span class="badge warn">isključena</span>'} ${l.stamp_enabled ? "" : '<span class="badge">bez pečata</span>'}</div>
          <div class="muted small">/${esc(l.slug)} · ${l.lat.toFixed(5)}, ${l.lng.toFixed(5)} ${l.coords_verified ? "✓" : "(koordinate neprovjerene)"} · ${l.mode === "car" ? "autom" : "pješice"}</div>
          ${s ? `<div class="muted small">Danas ${fmt(s.today)} · 7 dana ${fmt(s.d7)} · pečati ${fmt(s.stamps)}</div>` : ""}
        </div>
        <div class="loc-btns">
          <button class="btn small ${l.published ? "danger" : ""}" data-toggle="${esc(l.id)}">${l.published ? "Isključi" : "Uključi"}</button>
          <button class="btn small" data-qr="${esc(l.id)}">QR kod</button>
          <a class="btn small" href="/${esc(l.slug)}" target="_blank" rel="noopener">Otvori</a>
          <button class="btn small primary" data-edit="${esc(l.id)}">Uredi</button>
        </div>
      </div>`;
    }).join("") || `<p class="muted">Nema lokacija.</p>`;
  }
  $("locList").addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]"); if (ed) return editLocation(locs.find(l => l.id === ed.dataset.edit));
    const q = e.target.closest("[data-qr]"); if (q) return openQr(locs.find(l => l.id === q.dataset.qr));
    const tg = e.target.closest("[data-toggle]"); if (tg) return toggleLocation(locs.find(l => l.id === tg.dataset.toggle), tg);
  });
  // Uključi / isključi lokaciju: isključena se ne prikazuje na sajtu, mapama, rutama ni u pasošu
  async function toggleLocation(l, btn) {
    const on = !l.published;
    const msg = on
      ? `Uključiti „${tr(l.name)}”? Lokacija će se ponovo prikazivati na sajtu i na mapama.`
      : `Isključiti „${tr(l.name)}”? Lokacija se više neće prikazivati na sajtu ni na mapama (statistika i podaci ostaju sačuvani). Skeniranje njene table vodi na početnu stranicu.`;
    if (!confirm(msg)) return;
    btn.disabled = true;
    const {error} = await db.from("locations").update({published: on}).eq("id", l.id);
    if (error) { alert("Greška: " + error.message); btn.disabled = false; return; }
    await loadLocations();
    renderLocList();
    $("routesMsg").textContent = `${on ? "Uključeno" : "Isključeno"}: ${tr(l.name)}. Promjena je na sajtu za najviše 1 minutu.`;
  }
  $("newLoc").addEventListener("click", () => editLocation(null));

  /* ---------- polja forme ---------- */
  const paraToText = arr => (Array.isArray(arr) ? arr : arr ? [arr] : []).join("\n\n");
  const textToPara = s => String(s || "").split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const moreToText = m => (m?.sections || []).map(s => `## ${s.h || ""}\n${(s.p || []).join("\n\n")}`).join("\n\n");
  function textToMore(s) {
    const sections = [];
    let cur = null;
    for (const block of String(s || "").split(/\n\s*\n/)) {
      const lines = block.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (/^##\s*/.test(ln)) { cur = {h: ln.replace(/^##\s*/, "").trim(), p: []}; sections.push(cur); continue; }
        const rest = lines.slice(i).join("\n").trim();
        if (rest) { if (!cur) { cur = {h: "", p: []}; sections.push(cur); } cur.p.push(rest); }
        break;
      }
    }
    return sections.length ? {sections} : null;
  }

  function langInputs(key, val, {area = false, rows = 3, label}) {
    return `<fieldset class="ml"><legend>${esc(label)}</legend>${LANGS.map(lg => {
      const v = val?.[lg] ?? "";
      return `<label><span class="lg">${lg.toUpperCase()}</span>${area
        ? `<textarea name="${key}.${lg}" rows="${rows}">${esc(v)}</textarea>`
        : `<input name="${key}.${lg}" value="${esc(v)}">`}</label>`;
    }).join("")}</fieldset>`;
  }
  // polje za medij: URL + upload + pregled/reprodukcija
  function mediaInput(name, value, kind, label) {
    return `<div class="media-field" data-kind="${kind}">
      <label>${esc(label)}<input name="${name}" value="${esc(value || "")}" placeholder="${kind === "audio" ? "audio/… ili upload" : "images/… ili upload"}"></label>
      <div class="media-tools">
        <label class="btn small upload">Upload<input type="file" accept="${kind === "audio" ? "audio/*" : "image/*"}" hidden></label>
        <button type="button" class="btn small" data-clear>Ukloni</button>
        <span class="muted small up-status"></span>
      </div>
      <div class="media-preview"></div>
    </div>`;
  }
  function refreshPreview(field) {
    const inp = field.querySelector("input[name]"), box = field.querySelector(".media-preview");
    const v = inp.value.trim();
    if (!v) { box.innerHTML = ""; return; }
    box.innerHTML = field.dataset.kind === "audio"
      ? `<audio controls preload="none" src="${esc(media(v))}"></audio>`
      : `<img src="${esc(media(v))}" alt="" loading="lazy">`;
  }
  async function upload(file, folder) {
    const clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
    const path = `${folder}/${Date.now()}-${clean}`;
    const {error} = await db.storage.from("media").upload(path, file, {cacheControl: "31536000", upsert: false, contentType: file.type || undefined});
    if (error) throw error;
    return db.storage.from("media").getPublicUrl(path).data.publicUrl;
  }
  function wireMedia(form, folderFn) {
    form.addEventListener("change", async e => {
      const fileInp = e.target.closest(".media-field input[type=file]");
      if (fileInp && fileInp.files[0]) {
        const field = fileInp.closest(".media-field"), st = field.querySelector(".up-status");
        const f = fileInp.files[0];
        const limit = field.dataset.kind === "audio" ? 30 : 10;
        if (f.size > limit * 1024 * 1024) { st.textContent = `Fajl je veći od ${limit} MB.`; return; }
        st.textContent = "Upload…";
        try {
          field.querySelector("input[name]").value = await upload(f, folderFn());
          st.textContent = "✓ učitano (spremi lokaciju)";
          refreshPreview(field);
        } catch (err) { st.textContent = "Greška: " + err.message; }
        fileInp.value = "";
      }
    });
    form.addEventListener("input", e => { const f = e.target.closest(".media-field"); if (f && e.target.name) refreshPreview(f); });
    form.addEventListener("click", e => {
      const c = e.target.closest("[data-clear]");
      if (c) { const f = c.closest(".media-field"); f.querySelector("input[name]").value = ""; refreshPreview(f); }
    });
    form.querySelectorAll(".media-field").forEach(refreshPreview);
  }

  /* ---------- uređivanje lokacije ---------- */
  let editing = null, editMap = null, editMarker = null;
  function galleryRow(g = {}, i = 0) {
    return `<div class="gal-row">${mediaInput(`gallery.${i}.src`, g.src, "image", "Fotografija")}
      <label>Autor / izvor<input name="gallery.${i}.credit" value="${esc(g.credit || "")}"></label>
      <div class="gal-btns"><button type="button" class="btn small" data-up>↑</button><button type="button" class="btn small" data-down>↓</button><button type="button" class="btn small danger" data-remove>Ukloni</button></div></div>`;
  }
  function editLocation(l) {
    editing = l;
    const isNew = !l;
    l = l || {name: {}, short: {}, body: {}, audio: {}, gallery: [], sources: [], lat: 44.5335, lng: 18.5341, mode: "foot", published: true, stamp_enabled: true, gps_radius_m: 150, sort_order: (locs.at(-1)?.sort_order || 0) + 10};
    $("editTitle").textContent = isNew ? "Nova lokacija" : tr(l.name);
    $("editMsg").textContent = "";
    const moreByLang = Object.fromEntries(LANGS.map(lg => [lg, moreToText(l.more?.[lg])]));
    const bodyByLang = Object.fromEntries(LANGS.map(lg => [lg, paraToText(l.body?.[lg])]));
    const f = $("locForm");
    f.innerHTML = `
      <div class="card span2">
        <h2>Osnovno</h2>
        <div class="cols3">
          <label>Slug (adresa) <input name="slug" value="${esc(l.slug || "")}" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="npr. vila"></label>
          <label>Redoslijed <input name="sort_order" type="number" value="${esc(l.sort_order)}"></label>
          <label>Način dolaska <select name="mode"><option value="foot" ${l.mode !== "car" ? "selected" : ""}>Pješice</option><option value="car" ${l.mode === "car" ? "selected" : ""}>Autom</option></select></label>
        </div>
        ${isNew ? "" : `<p class="note small">Pažnja: promjena slug-a mijenja adresu (/${esc(l.slug)}). Već odštampani QR kodovi tada više ne vode na ovu lokaciju.</p>`}
        <div class="checks">
          <label><input type="checkbox" name="published" ${l.published ? "checked" : ""}> Aktivna (prikazuje se na sajtu i mapama)</label>
          <label><input type="checkbox" name="stamp_enabled" ${l.stamp_enabled ? "checked" : ""}> Pečat aktivan za ovu lokaciju</label>
          <label><input type="checkbox" name="coords_verified" ${l.coords_verified ? "checked" : ""}> Koordinate provjerene</label>
        </div>
        ${langInputs("name", l.name, {label: "Naziv"})}
        ${langInputs("short", l.short, {label: "Kratki opis (kartica i mapa)", area: true, rows: 2})}
      </div>

      <div class="card span2">
        <h2>Lokacija na mapi</h2>
        <div class="cols3">
          <label>Geografska širina (lat)<input name="lat" type="number" step="any" value="${esc(l.lat)}" required></label>
          <label>Geografska dužina (lng)<input name="lng" type="number" step="any" value="${esc(l.lng)}" required></label>
          <label>GPS radijus za potvrdu pečata (m)<input name="gps_radius_m" type="number" min="10" max="5000" value="${esc(l.gps_radius_m)}"></label>
        </div>
        <p class="muted small">Kliknite na mapu ili povucite marker. Krug pokazuje GPS radijus. Mapa: OpenStreetMap.</p>
        <div id="editMap" class="edit-map"></div>
      </div>

      <div class="card span2">
        <h2>Tekstovi</h2>
        <p class="muted small">Pasuse odvojite praznim redom.</p>
        ${langInputs("body", bodyByLang, {label: "Glavni tekst", area: true, rows: 9})}
        <p class="muted small">„Saznaj više”: naslov odjeljka počnite sa <code>## </code>, a pasuse odvojite praznim redom.</p>
        ${langInputs("more", moreByLang, {label: "Saznaj više (proširenje)", area: true, rows: 9})}
        <label>Izvori (jedan po redu: <code>Naziv | https://adresa</code>)<textarea name="sources" rows="4">${esc((l.sources || []).map(s => `${s.t} | ${s.u}`).join("\n"))}</textarea></label>
        <label>Interna napomena (šta još treba; ne prikazuje se turistima)<textarea name="status_note" rows="2">${esc(l.status_note || "")}</textarea></label>
      </div>

      <div class="card">
        <h2>Fotografije</h2>
        ${mediaInput("image", l.image, "image", "Glavna fotografija")}
        <label>Autor glavne fotografije<input name="image_credit" value="${esc(l.image_credit || "")}"></label>
        <h3>Galerija</h3>
        <div id="galRows">${(l.gallery || []).map(galleryRow).join("")}</div>
        <button type="button" class="btn small" id="galAdd">+ Dodaj fotografiju</button>
        <h3>Nekad i sad</h3>
        ${mediaInput("compare.then", l.compare?.then, "image", "Nekad (stara fotografija)")}
        ${mediaInput("compare.now", l.compare?.now, "image", "Danas")}
      </div>

      <div class="card">
        <h2>Audio priče</h2>
        <p class="muted small">Preporuka: MP3, mono, 64–96 kbps, 60–90 sekundi. Ako nema njemačkog, turist dobije engleski.</p>
        ${LANGS.map(lg => mediaInput(`audio.${lg}`, l.audio?.[lg], "audio", `Audio – ${LANG_NAMES[lg]}`)).join("")}
      </div>`;
    const renumber = () => [...$("galRows").children].forEach((row, i) => row.querySelectorAll("[name^='gallery.']").forEach(inp => inp.name = inp.name.replace(/^gallery\.\d+\./, `gallery.${i}.`)));
    $("galAdd").onclick = () => { $("galRows").insertAdjacentHTML("beforeend", galleryRow({}, $("galRows").children.length)); };
    $("galRows").onclick = e => {
      const row = e.target.closest(".gal-row"); if (!row) return;
      if (e.target.closest("[data-remove]")) row.remove();
      else if (e.target.closest("[data-up]") && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      else if (e.target.closest("[data-down]") && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      else return;
      renumber();
    };
    if (!f.dataset.wired) { wireMedia(f, () => `locations/${(f.slug?.value || "nova").trim() || "nova"}`); f.dataset.wired = "1"; }
    else f.querySelectorAll(".media-field").forEach(refreshPreview);
    showView("edit");
    setupEditMap(l);
  }
  function setupEditMap(l) {
    if (editMap) { editMap.remove(); editMap = null; }
    if (typeof L === "undefined") { $("editMap").textContent = "Mapa nije učitana."; return; }
    const f = $("locForm");
    editMap = L.map("editMap").setView([l.lat, l.lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19, attribution: "© OpenStreetMap"}).addTo(editMap);
    locs.filter(o => o !== editing).forEach(o => L.circleMarker([o.lat, o.lng], {radius: 5, color: "#123b34", weight: 2, fillOpacity: .6}).bindTooltip(tr(o.name)).addTo(editMap));
    editMarker = L.marker([l.lat, l.lng], {draggable: true}).addTo(editMap);
    const circle = L.circle([l.lat, l.lng], {radius: +l.gps_radius_m || 150, color: "#e4572e", weight: 1, fillOpacity: .08}).addTo(editMap);
    const set = ll => { f.lat.value = ll.lat.toFixed(7); f.lng.value = ll.lng.toFixed(7); editMarker.setLatLng(ll); circle.setLatLng(ll); };
    editMap.on("click", e => set(e.latlng));
    editMarker.on("dragend", () => set(editMarker.getLatLng()));
    const fromInputs = () => { const la = +f.lat.value, ln = +f.lng.value; if (isFinite(la) && isFinite(ln) && la && ln) { editMarker.setLatLng([la, ln]); circle.setLatLng([la, ln]); } };
    f.lat.oninput = f.lng.oninput = fromInputs;
    f.gps_radius_m.oninput = () => circle.setRadius(+f.gps_radius_m.value || 150);
    setTimeout(() => editMap.invalidateSize(), 50);
  }
  function collectLocation() {
    const f = $("locForm"), fd = new FormData(f);
    const ml = key => Object.fromEntries(LANGS.map(lg => [lg, (fd.get(`${key}.${lg}`) || "").trim()]).filter(([, v]) => v));
    const body = Object.fromEntries(LANGS.map(lg => [lg, textToPara(fd.get(`body.${lg}`))]).filter(([, v]) => v.length));
    const moreEntries = LANGS.map(lg => [lg, textToMore(fd.get(`more.${lg}`))]).filter(([, v]) => v);
    const gallery = [...$("galRows").children].map((row, i) => ({src: (fd.get(`gallery.${i}.src`) || "").trim(), credit: (fd.get(`gallery.${i}.credit`) || "").trim()})).filter(g => g.src);
    const then = (fd.get("compare.then") || "").trim(), now = (fd.get("compare.now") || "").trim();
    const sources = String(fd.get("sources") || "").split("\n").map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.lastIndexOf("|"); return i > 0 ? {t: s.slice(0, i).trim(), u: s.slice(i + 1).trim()} : {t: s, u: s};
    });
    return {
      slug: String(fd.get("slug") || "").trim().toLowerCase(),
      sort_order: parseInt(fd.get("sort_order"), 10) || 0,
      mode: fd.get("mode") === "car" ? "car" : "foot",
      published: f.published.checked, stamp_enabled: f.stamp_enabled.checked, coords_verified: f.coords_verified.checked,
      name: ml("name"), short: ml("short"), body,
      more: moreEntries.length ? Object.fromEntries(moreEntries) : null,
      sources, status_note: (fd.get("status_note") || "").trim() || null,
      lat: parseFloat(fd.get("lat")), lng: parseFloat(fd.get("lng")),
      gps_radius_m: parseInt(fd.get("gps_radius_m"), 10) || 150,
      image: (fd.get("image") || "").trim() || null, image_credit: (fd.get("image_credit") || "").trim() || null,
      gallery, compare: then && now ? {then, now} : null,
      audio: Object.fromEntries(LANGS.map(lg => [lg, (fd.get(`audio.${lg}`) || "").trim()]).filter(([, v]) => v))
    };
  }
  $("saveLoc").addEventListener("click", async () => {
    const row = collectLocation();
    const msg = $("editMsg");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug)) { msg.textContent = "Slug smije imati samo mala slova, brojeve i crticu (npr. vila-solvay)."; return; }
    if (!row.name.bs) { msg.textContent = "Upišite naziv na bosanskom."; return; }
    if (!isFinite(row.lat) || !isFinite(row.lng)) { msg.textContent = "Koordinate nisu ispravne."; return; }
    if (editing && editing.slug !== row.slug && !confirm(`Promijeniti adresu iz /${editing.slug} u /${row.slug}? Odštampani QR kodovi sa starom adresom prestaju raditi.`)) return;
    msg.textContent = "Spremanje…";
    const q = editing ? db.from("locations").update(row).eq("id", editing.id).select().single() : db.from("locations").insert(row).select().single();
    const {data, error} = await q;
    if (error) { msg.textContent = "Greška: " + (error.code === "23505" ? "taj slug već postoji." : error.message); return; }
    await loadLocations();
    editing = locs.find(l => l.id === data.id);
    $("editTitle").textContent = tr(editing.name);
    msg.textContent = "✓ Spremljeno " + new Date().toLocaleTimeString("bs-BA") + ". Promjene su na sajtu za najviše 1 minutu.";
  });

  /* ---------- rute (OSRM / FOSSGIS, besplatno) ---------- */
  $("routesBtn").addEventListener("click", async () => {
    const btn = $("routesBtn"), msg = $("routesMsg");
    btn.disabled = true;
    const pub = locs.filter(l => l.published);
    const {data: existing} = await db.from("routes").select("from_id,to_id,from_lat,from_lng,to_lat,to_lng,mode");
    const ok = new Set((existing || []).filter(r => {
      const a = pub.find(l => l.id === r.from_id), b = pub.find(l => l.id === r.to_id);
      return a && b && r.from_lat === a.lat && r.from_lng === a.lng && r.to_lat === b.lat && r.to_lng === b.lng && r.mode === (b.mode === "car" ? "car" : "foot");
    }).map(r => r.from_id + ">" + r.to_id));
    const todo = [];
    for (const a of pub) for (const b of pub) if (a !== b && !ok.has(a.id + ">" + b.id)) todo.push([a, b]);
    if (!todo.length) { msg.textContent = "Sve rute su ažurne."; btn.disabled = false; return; }
    let done = 0, fail = 0;
    for (const [a, b] of todo) {
      msg.textContent = `Računam rute: ${done + fail + 1} / ${todo.length} (${tr(a.name)} → ${tr(b.name)})…`;
      const mode = b.mode === "car" ? "car" : "foot";
      try {
        const j = await (await fetch(`https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`)).json();
        if (j.code !== "Ok") throw new Error(j.code);
        const r = j.routes[0];
        const {error} = await db.from("routes").upsert({
          from_id: a.id, to_id: b.id, mode, distance: Math.round(r.distance), duration: Math.round(r.duration),
          coords: r.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)]),
          from_lat: a.lat, from_lng: a.lng, to_lat: b.lat, to_lng: b.lng, updated_at: new Date().toISOString()
        });
        if (error) throw error;
        done++;
      } catch { fail++; }
      await new Promise(r => setTimeout(r, 1100)); // javni server: 1 zahtjev u sekundi
    }
    msg.textContent = `Gotovo: ${done} ruta spremljeno${fail ? `, ${fail} neuspjelo (aplikacija tada računa rutu uživo ili crta ravnu liniju)` : ""}.`;
    btn.disabled = false;
  });

  /* ---------- QR ---------- */
  let qrLoc = null;
  function openQr(l) {
    qrLoc = l;
    const code = l.secret?.code;
    $("qrName").textContent = tr(l.name);
    if (!code) { $("qrBox").innerHTML = "<p>Kod nije pronađen. Kliknite „Regeneriši kod”.</p>"; }
    else {
      const url = qrUrl(baseUrl(), l.slug, code);
      $("qrBox").innerHTML = qrSvg(url);
      $("qrUrl").textContent = url;
      $("qrCode").textContent = code;
    }
    const p = (type, size) => `/admin/print?id=${encodeURIComponent(l.id)}&type=${type}&size=${size}`;
    $("qrPrintA4").href = p("board", "a4"); $("qrPrintA5").href = p("board", "a5"); $("qrPrintSmall").href = p("board", "small");
    $("qrContent").href = p("content", "a4");
    $("qrDlg").showModal();
  }
  $("qrPng").addEventListener("click", () => qrLoc?.secret && download(`qr-${qrLoc.slug}.png`, qrPng(qrUrl(baseUrl(), qrLoc.slug, qrLoc.secret.code), 2000)));
  $("qrSvg").addEventListener("click", () => {
    if (!qrLoc?.secret) return;
    const blob = new Blob([qrSvg(qrUrl(baseUrl(), qrLoc.slug, qrLoc.secret.code))], {type: "image/svg+xml"});
    const u = URL.createObjectURL(blob); download(`qr-${qrLoc.slug}.svg`, u); setTimeout(() => URL.revokeObjectURL(u), 2000);
  });
  $("qrRegen").addEventListener("click", async () => {
    if (!qrLoc || !confirm(`Regenerisati kod za „${tr(qrLoc.name)}”? Stari QR na tabli odmah prestaje davati pečat i treba odštampati novi.`)) return;
    const {data, error} = await db.rpc("regenerate_location_code", {p_location: qrLoc.id});
    if (error) { alert("Greška: " + error.message); return; }
    await loadLocations();
    const fresh = locs.find(l => l.id === qrLoc.id);
    fresh.secret = fresh.secret || {code: data};
    openQr(fresh);
  });

  /* ================= NAGRADE ================= */
  let claimCounts = new Map();
  async function loadRewards() {
    const [{data, error}, {data: claims}] = await Promise.all([
      db.from("rewards").select("*").order("sort_order").order("created_at"),
      db.from("reward_claims").select("reward_id, redeemed_at")
    ]);
    if (error) { $("rewardList").textContent = "Greška: " + error.message; return; }
    rewards = data;
    claimCounts = new Map();
    (claims || []).forEach(c => { const x = claimCounts.get(c.reward_id) || {n: 0, r: 0}; x.n++; if (c.redeemed_at) x.r++; claimCounts.set(c.reward_id, x); });
    renderRewardList();
  }
  function rewardReq(r) {
    const parts = [];
    if (r.required_stamps) parts.push(`${r.required_stamps} pečata`);
    if (r.required_location_ids?.length) parts.push("lokacije: " + r.required_location_ids.map(id => tr(locs.find(l => l.id === id)?.name) || "?").join(", "));
    return parts.join(" + ") || "uslov nije postavljen";
  }
  function renderRewardList() {
    const today = new Date().toISOString().slice(0, 10);
    $("rewardList").innerHTML = rewards.map(r => {
      const c = claimCounts.get(r.id) || {n: 0, r: 0};
      const expired = r.valid_until && r.valid_until < today;
      return `<div class="loc-item card">
        ${r.sponsor_logo ? `<img src="${esc(media(r.sponsor_logo))}" alt="" class="logo">` : `<div class="ph"></div>`}
        <div class="loc-main">
          <div class="loc-name">${esc(tr(r.title))} ${r.active ? '<span class="badge on">aktivna</span>' : '<span class="badge">neaktivna</span>'} ${expired ? '<span class="badge warn">istekla</span>' : ""}</div>
          <div class="muted small">${esc(rewardReq(r))}${r.sponsor_name ? " · sponzor: " + esc(r.sponsor_name) : ""}${r.valid_until ? " · važi do " + esc(r.valid_until) : ""}</div>
          <div class="muted small">Izdano ${fmt(c.n)} · iskorišteno ${fmt(c.r)}</div>
        </div>
        <div class="loc-btns"><button class="btn small primary" data-redit="${esc(r.id)}">Uredi</button></div>
      </div>`;
    }).join("") || `<p class="muted">Još nema nagrada. Dodajte prvu, npr. „Kafa gratis za 3 pečata”.</p>`;
  }
  $("rewardList").addEventListener("click", e => { const b = e.target.closest("[data-redit]"); if (b) editReward(rewards.find(r => r.id === b.dataset.redit)); });
  $("newReward").addEventListener("click", () => editReward(null));

  let editingReward = null;
  function editReward(r) {
    editingReward = r;
    r = r || {title: {}, description: {}, required_stamps: 3, required_location_ids: [], active: true, sort_order: 0};
    $("rewardTitle").textContent = editingReward ? tr(r.title) : "Nova nagrada";
    $("rewardMsg").textContent = "";
    const f = $("rewardForm");
    f.innerHTML = `
      <div class="card span2">
        ${langInputs("title", r.title, {label: "Naziv nagrade"})}
        ${langInputs("description", r.description, {label: "Opis (šta turist dobija i kako)", area: true, rows: 3})}
        <div class="checks"><label><input type="checkbox" name="active" ${r.active ? "checked" : ""}> Aktivna</label></div>
        <div class="cols3">
          <label>Potreban broj pečata<input name="required_stamps" type="number" min="1" value="${esc(r.required_stamps ?? "")}" placeholder="prazno = bez uslova broja"></label>
          <label>Važi do (uključivo)<input name="valid_until" type="date" value="${esc(r.valid_until || "")}"></label>
          <label>Redoslijed<input name="sort_order" type="number" value="${esc(r.sort_order)}"></label>
        </div>
        <fieldset class="ml"><legend>… i/ili pečati sa ovih lokacija</legend>
          <div class="checks">${locs.map(l => `<label><input type="checkbox" name="loc" value="${esc(l.id)}" ${r.required_location_ids?.includes(l.id) ? "checked" : ""}> ${esc(tr(l.name))}</label>`).join("")}</div>
        </fieldset>
        <p class="muted small">Ako su postavljena oba uslova, turist mora ispuniti oba. Kod za preuzimanje dobija automatski čim ispuni uslov.</p>
      </div>
      <div class="card span2">
        <h2>Sponzor</h2>
        <div class="cols3">
          <label>Naziv sponzora<input name="sponsor_name" value="${esc(r.sponsor_name || "")}"></label>
          <label>Link<input name="sponsor_url" type="url" value="${esc(r.sponsor_url || "")}" placeholder="https://"></label>
        </div>
        ${mediaInput("sponsor_logo", r.sponsor_logo, "image", "Logo")}
      </div>`;
    if (!f.dataset.wired) { wireMedia(f, () => "sponsors"); f.dataset.wired = "1"; } else f.querySelectorAll(".media-field").forEach(refreshPreview);
    showView("rewardEdit");
  }
  $("saveReward").addEventListener("click", async () => {
    const f = $("rewardForm"), fd = new FormData(f), msg = $("rewardMsg");
    const ml = key => Object.fromEntries(LANGS.map(lg => [lg, (fd.get(`${key}.${lg}`) || "").trim()]).filter(([, v]) => v));
    const row = {
      title: ml("title"), description: ml("description"), active: f.active.checked,
      required_stamps: parseInt(fd.get("required_stamps"), 10) || null,
      required_location_ids: fd.getAll("loc"),
      valid_until: fd.get("valid_until") || null, sort_order: parseInt(fd.get("sort_order"), 10) || 0,
      sponsor_name: (fd.get("sponsor_name") || "").trim() || null, sponsor_url: (fd.get("sponsor_url") || "").trim() || null,
      sponsor_logo: (fd.get("sponsor_logo") || "").trim() || null
    };
    if (!row.title.bs) { msg.textContent = "Upišite naziv na bosanskom."; return; }
    if (!row.required_stamps && !row.required_location_ids.length) { msg.textContent = "Postavite broj pečata ili odaberite lokacije."; return; }
    msg.textContent = "Spremanje…";
    const q = editingReward ? db.from("rewards").update(row).eq("id", editingReward.id).select().single() : db.from("rewards").insert(row).select().single();
    const {data, error} = await q;
    if (error) { msg.textContent = "Greška: " + error.message; return; }
    editingReward = data;
    $("rewardTitle").textContent = tr(data.title);
    msg.textContent = "✓ Spremljeno.";
  });

  /* ================= PROVJERA KODA ================= */
  $("claimForm").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("claimInput").value.trim().toUpperCase().replace(/\s+/g, "");
    const norm = /^[A-Z0-9]{8}$/.test(code) ? code.slice(0, 4) + "-" + code.slice(4) : code;
    const {data, error} = await db.rpc("lookup_claim", {p_code: norm});
    showClaim(error ? {error: error.message} : data, norm);
  });
  function showClaim(c, code) {
    const box = $("claimResult");
    if (!c) { box.innerHTML = `<div class="card claim bad"><b>Kod ${esc(code)} ne postoji.</b></div>`; return; }
    if (c.error) { box.innerHTML = `<div class="card claim bad">Greška: ${esc(c.error)}</div>`; return; }
    const used = !!c.redeemedAt;
    box.innerHTML = `<div class="card claim ${used ? "bad" : "ok"}">
      <div class="claim-code">${esc(c.code)}</div>
      <div><b>${esc(tr(c.reward.title))}</b>${c.reward.sponsor ? " · " + esc(c.reward.sponsor) : ""}</div>
      <div class="muted small">Osvojeno ${new Date(c.createdAt).toLocaleString("bs-BA")}${c.reward.validUntil ? " · nagrada važi do " + esc(c.reward.validUntil) : ""}${c.reward.active ? "" : " · nagrada je neaktivna"}</div>
      ${used ? `<p><b>Već iskorišteno</b> ${new Date(c.redeemedAt).toLocaleString("bs-BA")}.</p>` : `<p><b>Važeći kod, još nije iskorišten.</b></p><button class="btn primary" type="button" id="redeemBtn">Označi kao iskorišten</button>`}
    </div>`;
    const b = $("redeemBtn");
    if (b) b.onclick = async () => {
      b.disabled = true;
      const {data, error} = await db.rpc("redeem_claim", {p_code: c.code});
      if (error) { alert(error.message); b.disabled = false; return; }
      showClaim(data.claim, c.code); loadClaims();
    };
  }
  async function loadClaims() {
    const {data, error} = await db.from("reward_claims").select("claim_code, created_at, redeemed_at, rewards(title, sponsor_name)").order("created_at", {ascending: false}).limit(50);
    if (error) { $("claimsTable").innerHTML = `<tr><td>Greška: ${esc(error.message)}</td></tr>`; return; }
    $("claimsTable").innerHTML = `<thead><tr><th>Kod</th><th>Nagrada</th><th>Osvojeno</th><th>Iskorišteno</th></tr></thead><tbody>${
      data.map(c => `<tr><td><code>${esc(c.claim_code)}</code></td><td>${esc(tr(c.rewards?.title))}${c.rewards?.sponsor_name ? " · " + esc(c.rewards.sponsor_name) : ""}</td>
        <td>${new Date(c.created_at).toLocaleString("bs-BA", {dateStyle: "short", timeStyle: "short"})}</td>
        <td>${c.redeemed_at ? new Date(c.redeemed_at).toLocaleString("bs-BA", {dateStyle: "short", timeStyle: "short"}) : "–"}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Još nema izdatih nagrada.</td></tr>'
    }</tbody>`;
  }

  /* ================= POSTAVKE ================= */
  function renderSettings() {
    const s = settings;
    $("settingsMsg").textContent = "";
    $("settingsForm").innerHTML = `
      <div class="card span2">
        <h2>Pečati (Lukavac pasoš)</h2>
        <div class="checks"><label><input type="checkbox" name="stamps_enabled" ${s.stamps_enabled !== false ? "checked" : ""}> Pečati aktivni (globalno)</label></div>
        <p class="muted small">Pečat se dodjeljuje samo uz ispravan kod iz QR-a, jednom po uređaju i lokaciji. Za pojedinačnu lokaciju pečat se isključuje u njenim postavkama.</p>
        ${langInputs("passport", s.passport?.intro, {label: "Tekst ispod pasoša (npr. kako do nagrade)", area: true, rows: 2})}
      </div>
      <div class="card span2">
        <h2>Sajt</h2>
        <div class="cols3">
          <label>Javna adresa sajta (za QR kodove)<input name="public_base_url" type="url" value="${esc(s.public_base_url || "")}" placeholder="${esc(location.origin)}"></label>
          <label>Početna lokacija (kad se otvori bez adrese)<select name="default_slug">${locs.map(l => `<option value="${esc(l.slug)}" ${l.slug === s.default_slug ? "selected" : ""}>${esc(tr(l.name))}</option>`).join("")}</select></label>
        </div>
        ${langInputs("about_title", s.about?.title, {label: "Naslov u podnožju"})}
        ${langInputs("about_text", s.about?.text, {label: "Tekst u podnožju", area: true, rows: 3})}
      </div>`;
  }
  $("saveSettings").addEventListener("click", async () => {
    const f = $("settingsForm"), fd = new FormData(f);
    const ml = key => Object.fromEntries(LANGS.map(lg => [lg, (fd.get(`${key}.${lg}`) || "").trim()]).filter(([, v]) => v));
    const base = (fd.get("public_base_url") || "").trim().replace(/\/$/, "");
    if (base && !/^https:\/\//.test(base)) { $("settingsMsg").textContent = "Javna adresa mora počinjati sa https://"; return; }
    const row = {
      stamps_enabled: f.stamps_enabled.checked, public_base_url: base || null, default_slug: fd.get("default_slug") || null,
      passport: {...(settings.passport || {}), intro: ml("passport")},
      about: {title: ml("about_title"), text: ml("about_text")}
    };
    const {data, error} = await db.from("settings").update(row).eq("id", 1).select().single();
    if (error) { $("settingsMsg").textContent = "Greška: " + error.message; return; }
    settings = data;
    $("settingsMsg").textContent = "✓ Spremljeno.";
  });

  boot();
})();
