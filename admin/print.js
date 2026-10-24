/* Print-friendly tabla sa QR kodom (A4 / A5 / mali format) i pregled sadržaja lokacije. */
(async () => {
  const {esc, media, qrUrl, qrSvg} = LK;
  const $ = id => document.getElementById(id);
  const p = new URLSearchParams(location.search);
  const type = p.get("type") === "content" ? "content" : "board";
  let size = ["a4", "a5", "small"].includes(p.get("size")) ? p.get("size") : "a4";
  let lang = ["bs", "en", "de"].includes(p.get("lang")) ? p.get("lang") : "bs";
  const tl = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[lang] ?? v.bs ?? "") : (v ?? "");

  let db, loc, settings;
  try {
    db = await LK.sb();
    const {data: {session}} = await db.auth.getSession();
    if (!session) { $("msg").innerHTML = 'Niste prijavljeni. <a href="/admin/">Prijava</a>'; return; }
    const [{data: l, error}, {data: s}] = await Promise.all([
      db.from("locations").select("*, location_secrets(code)").eq("id", p.get("id")).single(),
      db.from("settings").select("public_base_url").eq("id", 1).maybeSingle()
    ]);
    if (error) throw error;
    loc = l; settings = s || {};
  } catch (e) { $("msg").textContent = "Greška: " + e.message; return; }
  const secret = Array.isArray(loc.location_secrets) ? loc.location_secrets[0] : loc.location_secrets;
  const base = (settings.public_base_url || location.origin).replace(/\/$/, "");

  function board() {
    $("pageSize").textContent = `@page{size:${size === "a5" ? "A5" : "A4"} portrait;margin:${size === "small" ? "10mm" : "0"}}`;
    const url = qrUrl(base, loc.slug, secret.code);
    const short = base.replace(/^https?:\/\//, "") + "/" + loc.slug;
    document.title = `Tabla · ${loc.name?.bs || loc.slug}`;
    $("out").innerHTML = `<section class="board ${size}">
      <div class="b-eyebrow">Lukavac Info · Digitalna info staza</div>
      <h1>${esc(loc.name?.bs || loc.slug)}</h1>
      <div class="b-sub">${[loc.name?.en, loc.name?.de].filter(x => x && x !== loc.name?.bs).map(esc).join(" · ")}</div>
      <div class="b-qr">${qrSvg(url, {margin: 2})}</div>
      <div class="b-cta">
        <p><b>Skenirajte QR kod</b> – mapa, priča i audio vodič. Sakupite pečat u Lukavac pasošu.</p>
        <p lang="en"><b>Scan the QR code</b> – map, story and audio guide. Collect a stamp in the Lukavac passport.</p>
        <p lang="de"><b>QR-Code scannen</b> – Karte, Geschichte und Audioguide. Stempel im Lukavac-Pass sammeln.</p>
      </div>
      <div class="b-url">${esc(short)}</div>
      <div class="b-foot">Turistička zajednica Lukavac</div>
    </section>`;
  }

  function content() {
    $("lang").hidden = false; $("size").hidden = true;
    $("pageSize").textContent = "@page{size:A4 portrait;margin:16mm}";
    document.title = `Sadržaj · ${loc.name?.bs || loc.slug}`;
    const paras = arr => (Array.isArray(arr) ? arr : arr ? [arr] : []).map(x => `<p>${esc(x)}</p>`).join("");
    const more = tl(loc.more);
    const audio = Object.entries(loc.audio || {}).map(([k, v]) => `<li>${k.toUpperCase()}: ${esc(v)}</li>`).join("");
    $("out").innerHTML = `<article class="content">
      <div class="c-meta">/${esc(loc.slug)} · ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} · ${loc.mode === "car" ? "autom" : "pješice"} · ${loc.published ? "objavljena" : "skrivena"} · pečat ${loc.stamp_enabled ? "aktivan" : "isključen"} · GPS radijus ${loc.gps_radius_m} m</div>
      <h1>${esc(tl(loc.name))}</h1>
      <p class="c-short">${esc(tl(loc.short))}</p>
      ${loc.image ? `<img class="c-hero" src="${esc(media(loc.image))}" alt="">${loc.image_credit ? `<div class="c-credit">${esc(loc.image_credit)}</div>` : ""}` : ""}
      <div class="c-text">${paras(tl(loc.body))}</div>
      ${more?.sections?.length ? `<h2>Saznaj više</h2>${more.sections.map(s => `<h3>${esc(s.h)}</h3>${paras(s.p)}`).join("")}` : ""}
      ${(loc.gallery || []).length ? `<h2>Galerija</h2><div class="c-gal">${loc.gallery.map(g => `<figure><img src="${esc(media(g.src))}" alt=""><figcaption>${esc(g.credit || "")}</figcaption></figure>`).join("")}</div>` : ""}
      ${loc.compare ? `<h2>Nekad i sad</h2><div class="c-gal"><figure><img src="${esc(media(loc.compare.then))}" alt=""><figcaption>Nekad</figcaption></figure><figure><img src="${esc(media(loc.compare.now))}" alt=""><figcaption>Danas</figcaption></figure></div>` : ""}
      ${audio ? `<h2>Audio</h2><ul class="c-small">${audio}</ul>` : ""}
      ${(loc.sources || []).length ? `<h2>Izvori</h2><ul class="c-small">${loc.sources.map(s => `<li>${esc(s.t)} – ${esc(s.u)}</li>`).join("")}</ul>` : ""}
      ${loc.status_note ? `<h2>Interna napomena</h2><p class="c-small">${esc(loc.status_note)}</p>` : ""}
    </article>`;
  }

  const render = () => {
    if (type === "board") { if (!secret?.code) { $("msg").textContent = "Lokacija nema kod. Regenerišite ga u dashboardu."; return; } board(); }
    else content();
  };
  $("size").value = size; $("lang").value = lang;
  $("size").onchange = e => { size = e.target.value; render(); };
  $("lang").onchange = e => { lang = e.target.value; render(); };
  render();
})();
