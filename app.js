/* Lukavac Info — svaka info tačka ima QR sa svojom adresom, npr. https://domena.ba/vila
   (radi i stari oblik ?l=vila). */
(() => {
  const COLORS = ["#2f7bff"]; // sve rute plave, sa sjajem (vidi style.css: .route-*)
  const LANGS = ["bs", "en", "de"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  /* ---------- prijevodi interfejsa ---------- */
  const UI = {
    bs: {
      welcome: "Dobrodošli u Lukavac", youAreAt: "Nalazite se ovdje:", introHint: "Pogledajte gdje su ostale lokacije i kako do njih doći.",
      youAreHere: "Vi ste ovdje", audioStory: "Audio priča", audioSoon: "Audio priča uskoro.", thenNow: "Nekad i sad", then: "Nekad", now: "Danas",
      share: "Podijeli", whereNext: "Kuda dalje?", events: "Šta se dešava u Lukavcu", navigate: "Navigacija do ovdje", showRoute: "Prikaži put na mapi",
      passport: "Lukavac pasoš", stamps: (n, t) => `Pečat ${n} od ${t}`, allStamps: "Svi pečati su vaši!", visited: "posjećeno",
      listen: "Poslušaj", pause: "Pauza", readMore: "Pročitaj više", moreAbout: "Saznaj više o ovom mjestu", sources: "Izvori", foot: "pješice", car: "autom", approx: "približno",
      shareText: n => `${n} – digitalna info staza Lukavca`, close: "Zatvori",
      stampNew: "Novi pečat!", stampHave: "Pečat za ovu lokaciju već imate.", stampNoCode: "Pečat se dobija skeniranjem QR koda na info tabli.",
      stampBad: "Ovaj QR kod nije važeći. Skenirajte kod sa info table.", gpsOk: "GPS potvrđen", stampWait: "Provjeravamo pečat…",
      rewards: "Nagrade", rewardShow: "Pokažite ovaj kod kod sponzora:", rewardUsed: "Iskorišteno", rewardUntil: d => `Važi do ${d}`,
      rewardNeed: (h, n) => `${Math.min(h, n)} / ${n} pečata`, rewardPlaces: "Potrebne lokacije:", sponsor: "Sponzor", home: "Sve lokacije"
    },
    en: {
      welcome: "Welcome to Lukavac", youAreAt: "You are at:", introHint: "See where the other sights are and how to get there.",
      youAreHere: "You are here", audioStory: "Audio story", audioSoon: "Audio story coming soon.", thenNow: "Then and now", then: "Then", now: "Now",
      share: "Share", whereNext: "Where next?", events: "What's on in Lukavac", navigate: "Directions", showRoute: "Show route on map",
      passport: "Lukavac passport", stamps: (n, t) => `Stamp ${n} of ${t}`, allStamps: "You've collected every stamp!", visited: "visited",
      listen: "Listen", pause: "Pause", readMore: "Read more", moreAbout: "Learn more about this place", sources: "Sources", foot: "on foot", car: "by car", approx: "approx.",
      shareText: n => `${n} – Lukavac digital info trail`, close: "Close",
      stampNew: "New stamp!", stampHave: "You already have the stamp for this place.", stampNoCode: "Scan the QR code on the info board to get a stamp.",
      stampBad: "This QR code is not valid. Scan the code on the info board.", gpsOk: "GPS confirmed", stampWait: "Checking your stamp…",
      rewards: "Rewards", rewardShow: "Show this code to the sponsor:", rewardUsed: "Redeemed", rewardUntil: d => `Valid until ${d}`,
      rewardNeed: (h, n) => `${Math.min(h, n)} / ${n} stamps`, rewardPlaces: "Required places:", sponsor: "Sponsor", home: "All places"
    },
    de: {
      welcome: "Willkommen in Lukavac", youAreAt: "Sie sind hier:", introHint: "Sehen Sie, wo die anderen Orte liegen und wie Sie hinkommen.",
      youAreHere: "Sie sind hier", audioStory: "Audio-Geschichte", audioSoon: "Audio-Geschichte folgt in Kürze.", thenNow: "Damals und heute", then: "Damals", now: "Heute",
      share: "Teilen", whereNext: "Wohin als Nächstes?", events: "Veranstaltungen in Lukavac", navigate: "Route starten", showRoute: "Weg auf der Karte zeigen",
      passport: "Lukavac-Pass", stamps: (n, t) => `Stempel ${n} von ${t}`, allStamps: "Sie haben alle Stempel!", visited: "besucht",
      listen: "Anhören", pause: "Pause", readMore: "Mehr lesen", moreAbout: "Mehr über diesen Ort", sources: "Quellen", foot: "zu Fuß", car: "mit dem Auto", approx: "ca.",
      shareText: n => `${n} – Digitaler Info-Pfad Lukavac`, close: "Schließen",
      stampNew: "Neuer Stempel!", stampHave: "Diesen Stempel haben Sie bereits.", stampNoCode: "Scannen Sie den QR-Code auf der Infotafel, um einen Stempel zu erhalten.",
      stampBad: "Dieser QR-Code ist ungültig. Scannen Sie den Code auf der Infotafel.", gpsOk: "GPS bestätigt", stampWait: "Stempel wird geprüft…",
      rewards: "Belohnungen", rewardShow: "Zeigen Sie diesen Code beim Sponsor:", rewardUsed: "Eingelöst", rewardUntil: d => `Gültig bis ${d}`,
      rewardNeed: (h, n) => `${Math.min(h, n)} / ${n} Stempel`, rewardPlaces: "Benötigte Orte:", sponsor: "Sponsor", home: "Alle Orte"
    }
  };

  function detectLang() {
    const saved = store.get("lang");
    if (LANGS.includes(saved)) return saved;
    for (const raw of navigator.languages || [navigator.language || ""]) {
      const l = String(raw).toLowerCase().split("-")[0];
      if (["bs", "hr", "sr", "sh", "cnr"].includes(l)) return "bs";
      if (l === "de") return "de";
      if (l === "en") return "en";
    }
    return "en"; // svi ostali jezici → engleski
  }
  let lang = detectLang();
  const t = (k, ...a) => { const v = (UI[lang] || UI.bs)[k] ?? UI.bs[k]; return typeof v === "function" ? v(...a) : v; };
  // tekst iz podataka: string ili {bs, en, de}; ako prijevod fali → bs
  const tr = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[lang] ?? v.bs ?? Object.values(v)[0]) : v;
  // audio: za bs → bs; za ostale → svoj jezik, pa engleski, pa bs
  const audioFor = loc => {
    const a = loc.audio;
    if (!a || typeof a === "string") return a || "";
    return a[lang] || (lang !== "bs" && a.en) || a.bs || "";
  };

  /* ---------- pomoćne ---------- */
  let data, here, others, map, routes = {}, lines = {}, markers = {}, herePopup, events = [];

  const fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", lang === "en" ? "." : ",") + " km";
  const fmtTime = (s, mode) => {
    const min = Math.max(1, Math.round(s / 60));
    const tm = min < 60 ? min + " min" : Math.floor(min / 60) + " h " + (min % 60) + " min";
    return tm + " " + t(mode === "car" ? "car" : "foot");
  };
  const haversine = (a, b) => {
    const R = 6371000, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  async function loadJSON(url) {
    try { const r = await fetch(url, {cache: "no-cache"}); return r.ok ? r.json() : null; } catch { return null; }
  }

  // Ruta: 1) routes.json, 2) keš preglednika, 3) uživo sa OSRM, 4) ravna isprekidana linija
  async function getRoute(a, b, pre) {
    const key = a.id + ">" + b.id;
    const mode = "foot"; // sve rute su pješačke, kroz grad
    if (pre && pre[key]) return pre[key];
    const ck = "route:" + key + ":" + a.lat + a.lng + b.lat + b.lng;
    try { const c = JSON.parse(store.get(ck)); if (c) return c; } catch {}
    try {
      const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
      const j = await (await fetch(url, {signal: ctl.signal})).json();
      clearTimeout(to);
      if (j.code === "Ok" && j.routes?.[0]) {
        const rt = j.routes[0];
        const out = {mode, distance: rt.distance, duration: rt.duration, coords: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng])};
        store.set(ck, JSON.stringify(out));
        return out;
      }
    } catch {}
    const d = haversine(a, b) * 1.3;
    return {mode, distance: d, duration: d / (mode === "car" ? 8.3 : 1.25), coords: [[a.lat, a.lng], [b.lat, b.lng]], approx: true};
  }

  function pinIcon(loc, isHere, color) {
    return L.divIcon({
      className: "",
      html: `<div class="pin ${isHere ? "is-here" : ""}"><div class="pin-dot" style="${isHere ? "" : "background:" + color}"></div><div class="pin-label">${esc(isHere ? t("youAreHere") : tr(loc.name))}</div></div>`,
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
  }

  function setAudio(audioEl, missingEl, src) {
    missingEl.hidden = true; audioEl.hidden = false;
    if (!src) { audioEl.hidden = true; missingEl.hidden = false; return; }
    if (audioEl.getAttribute("src") !== src) audioEl.src = src;
    audioEl.onerror = () => { audioEl.hidden = true; missingEl.hidden = false; if (audioEl.id === "hereAudio" && herePopup && map.hasLayer(herePopup)) herePopup.setContent(herePopupHtml()); };
    fetch(src, {method: "HEAD"}).then(r => { if (!r.ok) audioEl.onerror(); }).catch(() => {});
  }
  function setImage(img, src, alt) {
    if (!src) { img.hidden = true; return; }
    img.src = src; img.alt = alt; img.hidden = false;
    img.onerror = () => img.hidden = true;
  }
  const paras = arr => (tr(arr) || []).map(p => `<p>${esc(p)}</p>`).join("");
  // Galerija: gallery = [{src, credit}] – traka fotografija; klik otvara punu sliku
  function setGallery(el, loc) {
    const g = (loc.gallery || []).filter(x => x && x.src);
    if (!g.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.innerHTML = g.map(x => `<a href="${esc(x.src)}" target="_blank" rel="noopener" class="g-item">
      <img src="${esc(x.src)}" alt="${esc(tr(loc.name))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('a').remove()">
      ${x.credit ? `<span class="g-credit">${esc(x.credit)}</span>` : ""}</a>`).join("");
    el.hidden = false;
  }
  // „Saznaj više”: dodatni dio koji se otvara na klik. Polje more = {bs: {sections: [{h, p: []}], sources: [{t, u}]}, en: …}
  function setMore(el, loc) {
    const m = tr(loc.more);
    if (!m || !m.sections || !m.sections.length) { el.hidden = true; el.open = false; return; }
    const secs = m.sections.map(s => `<h4>${esc(s.h)}</h4>${(s.p || []).map(p => `<p>${esc(p)}</p>`).join("")}`).join("");
    const src = (loc.sources || []).length ? `<div class="more-src"><b>${esc(t("sources"))}:</b> ${loc.sources.map(s => `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(" · ")}</div>` : "";
    el.querySelector(".more-body").innerHTML = secs + src;
    el.hidden = false;
  }

  /* ---------- nekad i sad ---------- */
  function setupCompare(box, cmp, name) {
    if (!cmp || !cmp.then || !cmp.now) { box.hidden = true; return; }
    box.querySelector(".cmp-now").src = cmp.now;
    box.querySelector(".cmp-now").alt = name + " – " + t("now");
    box.querySelector(".cmp-then").src = cmp.then;
    box.querySelector(".cmp-then").alt = name + " – " + t("then");
    const range = box.querySelector("input");
    const apply = () => box.style.setProperty("--pos", range.value + "%");
    range.oninput = apply; apply();
    box.hidden = false;
  }

  /* ---------- pasoš ---------- */
  // Dva načina rada:
  //  - "db": podaci dolaze iz /api; pečat dodjeljuje SERVER samo uz ispravan kod iz QR-a (?k=…)
  //  - "static" (rezerva dok baza nije podešena): stari način, pečat se pamti u pregledniku
  let apiMode = false, passportData = null, scanResult = null;
  function deviceId() {
    let id = store.get("deviceId");
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""));
      store.set("deviceId", id);
    }
    return id;
  }
  function localStamps() { try { return JSON.parse(store.get("stamps")) || []; } catch { return []; } }
  function stamps() { return apiMode ? (passportData?.stamps || []).map(x => x.slug) : localStamps(); }
  function addStamp(id) { const s = localStamps(); if (!s.includes(id)) { s.push(id); store.set("stamps", JSON.stringify(s)); } }
  const stampLocs = () => data.locations.filter(l => !apiMode || l.stampEnabled !== false);
  function renderPassport() {
    if (apiMode && data.stampsEnabled === false) { $("passport").hidden = true; return; }
    const pool = stampLocs();
    const s = stamps().filter(id => pool.some(l => l.id === id));
    const total = pool.length;
    $("passportCount").textContent = s.length >= total ? t("allStamps") : t("stamps", s.length, total);
    $("passportStamp").textContent = tr(here.name);
    const gpsSet = new Set((passportData?.stamps || []).filter(x => x.gpsVerified).map(x => x.slug));
    $("passportDots").innerHTML = pool.map(l =>
      `<span class="pdot ${s.includes(l.id) ? "on" : ""}" title="${esc(tr(l.name))}">${esc(tr(l.name))}${gpsSet.has(l.id) ? ' <span class="gps-tick" title="' + esc(t("gpsOk")) + '">⌖</span>' : ""}</span>`).join("");
    // status pečata za trenutno skeniranje
    const st = $("passportStatus");
    let msg = "", cls = "";
    if (apiMode && here.stampEnabled !== false) {
      if (!scanResult) msg = scanPending ? t("stampWait") : "";
      else if (scanResult.stamp === "awarded") { msg = t("stampNew"); cls = "ok"; }
      else if (scanResult.stamp === "duplicate") { msg = t("stampHave"); cls = "ok"; }
      else if (scanResult.stamp === "no_code") msg = t("stampNoCode");
      else if (scanResult.stamp === "invalid_code" || scanResult.stamp === "rate_limited") { msg = t("stampBad"); cls = "bad"; }
      if (scanResult?.gpsVerified && cls === "ok") msg += ` · ⌖ ${t("gpsOk")}`;
    }
    st.textContent = msg; st.className = "passport-status " + cls; st.hidden = !msg;
    $("passportStamp").classList.toggle("dim", apiMode && !s.includes(here.id));
    const reward = apiMode ? tr(data.passport?.intro) : tr(data.passport?.reward);
    $("passportReward").textContent = reward || "";
    $("passportReward").hidden = !reward;
    renderRewards();
    $("passport").hidden = false;
  }
  function renderRewards() {
    const box = $("rewards");
    const list = apiMode ? (passportData?.rewards || []) : [];
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    const loc = lang === "bs" ? "bs-BA" : lang === "de" ? "de-DE" : "en-GB";
    const nameOf = slug => tr(data.locations.find(l => l.id === slug)?.name) || slug;
    const have = new Set(stamps());
    box.innerHTML = `<h3>${esc(t("rewards"))}</h3>` + list.map(r => {
      const sp = r.sponsor || {};
      const logo = sp.logo ? `<img class="rw-logo" src="${esc(sp.logo)}" alt="${esc(sp.name || "")}" loading="lazy">` : "";
      const spName = sp.name ? (sp.url ? `<a href="${esc(sp.url)}" target="_blank" rel="noopener">${esc(sp.name)}</a>` : esc(sp.name)) : "";
      const need = [];
      if (r.requiredStamps) {
        const pct = Math.min(100, Math.round(100 * Math.min(r.have, r.requiredStamps) / r.requiredStamps));
        need.push(`<div class="rw-prog"><span style="width:${pct}%"></span></div><div class="rw-need">${esc(t("rewardNeed", r.have, r.requiredStamps))}</div>`);
      }
      if ((r.requiredLocations || []).length) {
        need.push(`<div class="rw-need">${esc(t("rewardPlaces"))} ${r.requiredLocations.map(sl => `<span class="rw-pl ${have.has(sl) ? "on" : ""}">${have.has(sl) ? "✓ " : ""}${esc(nameOf(sl))}</span>`).join(" ")}</div>`);
      }
      const until = r.validUntil ? `<div class="rw-until">${esc(t("rewardUntil", new Date(r.validUntil + "T12:00:00").toLocaleDateString(loc)))}</div>` : "";
      const won = r.claimCode ? `<div class="rw-code ${r.redeemed ? "used" : ""}"><div>${esc(r.redeemed ? t("rewardUsed") : t("rewardShow"))}</div><b>${esc(r.claimCode)}</b></div>` : "";
      return `<div class="reward ${r.claimCode ? "won" : ""}">
        <div class="rw-head">${logo}<div><div class="rw-title">${esc(tr(r.title) || "")}</div>${spName ? `<div class="rw-sponsor">${esc(t("sponsor"))}: ${spName}</div>` : ""}</div></div>
        ${tr(r.description) ? `<p class="rw-desc">${esc(tr(r.description))}</p>` : ""}
        ${r.claimCode ? won : need.join("")}${until}</div>`;
    }).join("");
    box.hidden = false;
  }

  // Lokacija preko GPS-a: dodatak, ne uslov. Odbijanje ili greška ne sprečava pečat.
  function getGps(timeoutMs = 8000) {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({status: "unavailable"});
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => finish({status: "timeout"}), timeoutMs + 500);
      navigator.geolocation.getCurrentPosition(
        p => finish({status: "granted", lat: p.coords.latitude, lng: p.coords.longitude}),
        e => finish({status: e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable"}),
        {enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000}
      );
    });
  }
  let scanPending = false;
  // u ovom pregledniku je prijavljen admin (Supabase sesija iz /admin) -> pregled se ne broji u statistici
  function isAdminBrowser() {
    try { for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i))) return true; } catch {}
    return false;
  }
  async function recordScan(code) {
    const wantStamp = !!code && data.stampsEnabled !== false && here.stampEnabled !== false;
    scanPending = wantStamp;
    const gps = wantStamp ? await getGps() : {status: "not_requested"};
    try {
      const r = await fetch("/api/scan", {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({slug: here.id, k: code || null, device: deviceId(), gps, admin: isAdminBrowser()})
      });
      scanResult = await r.json().catch(() => null);
    } catch { scanResult = null; }
    scanPending = false;
    await loadPassport();
  }
  async function loadPassport() {
    try {
      const r = await fetch("/api/passport?device=" + encodeURIComponent(deviceId()), {cache: "no-store"});
      if (r.ok) passportData = await r.json();
    } catch {}
    if (!$("passport").hidden || $("here").hidden === false) { renderPassport(); renderCards(); }
  }

  /* ---------- događaji ---------- */
  function renderEvents() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = (events || []).filter(e => e.date && new Date(e.date + "T23:59:59") >= today)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    if (!list.length) { $("eventsBox").hidden = true; return; }
    const loc = lang === "bs" ? "bs-BA" : lang === "de" ? "de-DE" : "en-GB";
    $("events").innerHTML = list.map(e => {
      const d = new Date(e.date + "T12:00:00");
      const day = d.toLocaleDateString(loc, {day: "numeric"});
      const mon = d.toLocaleDateString(loc, {month: "short"});
      const meta = [e.time, tr(e.place)].filter(Boolean).map(esc).join(" · ");
      const title = esc(tr(e.title));
      const inner = `<span class="ev-date"><b>${esc(day)}</b>${esc(mon)}</span><span><span class="ev-title">${title}</span><span class="ev-meta">${meta}</span></span>`;
      return e.link ? `<a class="event" href="${esc(e.link)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="event">${inner}</div>`;
    }).join("");
    $("eventsBox").hidden = false;
  }

  /* ---------- mapa: linije, detalji ---------- */
  // Svaka ruta ima 3 sloja: široki sjaj (glow), jezgru i svjetlosni tok koji putuje linijom.
  const glows = {}, flows = {};
  function highlight(id) {
    Object.keys(lines).forEach(k => {
      const on = k === id, dim = id && !on;
      lines[k].setStyle({weight: on ? 7 : 5, opacity: dim ? 0.3 : 1});
      glows[k]?.setStyle({weight: on ? 22 : 16, opacity: dim ? 0.08 : (on ? 0.55 : 0.35)});
      flows[k]?.setStyle({opacity: dim ? 0 : 0.95});
    });
    if (id && lines[id]) { glows[id].bringToFront(); lines[id].bringToFront(); flows[id].bringToFront(); }
  }

  let sheetLoc = null;
  function openSheet(loc) {
    sheetLoc = loc;
    const r = routes[loc.id];
    $("sheetName").textContent = tr(loc.name);
    $("sheetShort").textContent = tr(loc.short) || "";
    $("sheetMeta").textContent = r ? `${fmtDist(r.distance)} · ${fmtTime(r.duration, r.mode)}${r.approx ? " (" + t("approx") + ")" : ""}` : "";
    $("sheetText").innerHTML = paras(loc.text);
    setMore($("sheetMore"), loc);
    setImage($("sheetImg"), loc.image, tr(loc.name));
    setGallery($("sheetGallery"), loc);
    setAudio($("sheetAudio"), $("sheetAudioMissing"), audioFor(loc));
    const travel = "walking";
    $("sheetNav").href = `https://www.google.com/maps/dir/?api=1&origin=${here.lat},${here.lng}&destination=${loc.lat},${loc.lng}&travelmode=${travel}`;
    $("sheetFocus").onclick = () => focusRoute(loc.id);
    $("sheetClose").setAttribute("aria-label", t("close"));
    $("sheet").hidden = false;
    herePopup && map.closePopup(herePopup);
    highlight(loc.id);
  }
  function closeSheet() {
    $("sheet").hidden = true; sheetLoc = null;
    $("sheetAudio").pause();
    highlight(null);
  }
  function focusRoute(id) {
    const l = lines[id];
    if (!l) return;
    window.scrollTo({top: 0, behavior: "smooth"});
    map.flyToBounds(l.getBounds(), {padding: [50, 50], duration: 1});
    highlight(id);
  }

  /* ---------- info o trenutnoj lokaciji na samoj mapi ---------- */
  function herePopupHtml() {
    const hasAudio = !!audioFor(here) && !$("hereAudio").hidden;
    return `<div class="hp">
      <div class="hp-eyebrow">${esc(t("youAreHere"))}</div>
      <div class="hp-name">${esc(tr(here.name))}</div>
      <div class="hp-short">${esc(tr(here.short) || "")}</div>
      <div class="hp-actions">
        ${hasAudio ? `<button type="button" class="hp-btn play" data-act="play">▶ ${esc(t("listen"))}</button>` : ""}
        <button type="button" class="hp-btn" data-act="more">${esc(t("readMore"))} ↓</button>
      </div></div>`;
  }
  function openHerePopup() {
    if (!herePopup) {
      herePopup = L.popup({closeButton: true, autoPan: true, autoPanPadding: [20, 70], offset: [0, -14], className: "here-popup", maxWidth: 260});
    }
    herePopup.setLatLng([here.lat, here.lng]).setContent(herePopupHtml()).openOn(map);
    syncPlayLabel();
  }
  function syncPlayLabel() {
    const b = document.querySelector(".hp-btn.play");
    if (b) b.textContent = ($("hereAudio").paused ? "▶ " + t("listen") : "❚❚ " + t("pause"));
  }

  /* ---------- glavni sadržaj ---------- */
  function renderHere() {
    $("hereName").textContent = tr(here.name);
    $("hereText").innerHTML = paras(here.text);
    setMore($("hereMore"), here);
    setImage($("hereImg"), here.image, tr(here.name));
    $("hereImgCredit").textContent = here.image && here.imageCredit ? here.imageCredit : ""; $("hereImgCredit").hidden = !(here.image && here.imageCredit);
    setGallery($("hereGallery"), here);
    setAudio($("hereAudio"), $("hereAudioMissing"), audioFor(here));
    setupCompare($("hereCompare"), here.compare, tr(here.name));
    $("aboutTitle").textContent = tr(data.about?.title) || "";
    $("aboutText").textContent = tr(data.about?.text) || "";
    $("shareBtn").hidden = false;
  }
  function renderCards() {
    const s = stamps();
    $("others").innerHTML = others.map((o, i) => {
      const r = routes[o.id];
      const color = COLORS[i % COLORS.length];
      const seen = s.includes(o.id) ? `<span class="seen">✓ ${esc(t("visited"))}</span>` : "";
      return `<button class="card" type="button" data-id="${esc(o.id)}">
        <span class="bar" style="background:${color}"></span>
        <span><div class="card-name">${esc(tr(o.name))} ${seen}</div><div class="card-short">${esc(tr(o.short) || "")}</div></span>
        <span class="card-dist">${r ? fmtDist(r.distance) + "<br>" + fmtTime(r.duration, r.mode) : "…"}</span>
      </button>`;
    }).join("");
  }
  function renderLegend() {
    return; // sve rute su iste (plave) boje, pa legenda nije potrebna; nazivi su na mapi i u listi „Kuda dalje?”
    const lg = $("legend");
    lg.innerHTML = others.map((o, i) => `<div><span style="background:${COLORS[i % COLORS.length]}"></span>${esc(tr(o.name))}</div>`).join("");
    lg.hidden = false;
  }
  function renderLangs() {
    $("langs").innerHTML = LANGS.map(l => `<button type="button" class="${l === lang ? "on" : ""}" data-lang="${l}" aria-pressed="${l === lang}">${l.toUpperCase()}</button>`).join("");
  }
  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
    document.title = tr(here.name) + " · Lukavac Info";
    $("introHere") && ($("introHere").textContent = tr(here.name));
  }
  function setLang(l) {
    if (l === lang) return;
    lang = l; store.set("lang", l);
    applyStatic(); renderLangs();
    if (!$("here").hidden) { renderHere(); renderCards(); renderLegend(); renderPassport(); renderEvents(); }
    markers[here.id]?.setIcon(pinIcon(here, true));
    others.forEach((o, i) => markers[o.id]?.setIcon(pinIcon(o, false, COLORS[i % COLORS.length])));
    if (herePopup && map.hasLayer(herePopup)) herePopup.setContent(herePopupHtml());
    if (sheetLoc) openSheet(sheetLoc);
  }

  async function share() {
    const url = location.origin + "/" + here.id;
    const title = tr(here.name);
    try {
      if (navigator.share) await navigator.share({title, text: t("shareText", title), url});
      else { await navigator.clipboard.writeText(url); $("shareBtn").querySelector("span").textContent = "✓ " + url; }
    } catch {}
  }

  /* ---------- start ---------- */
  function currentId() {
    const q = new URLSearchParams(location.search).get("l");
    if (q) return q;
    const seg = location.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
    return seg && !["index.html", "lokacija", "lokacija.html"].includes(seg) ? decodeURIComponent(seg) : null;
  }

  async function init() {
    // tajni kod iz QR-a (?k=…): pročitaj ga i odmah ukloni iz adrese da se ne dijeli dalje
    const params = new URLSearchParams(location.search);
    const code = params.get("k");
    if (code) { params.delete("k"); history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash); }

    // 1) baza preko /api/locations; 2) rezerva: statični JSON fajlovi
    const [apiData, ev] = await Promise.all([loadJSON("/api/locations"), loadJSON("/data/events.json").then(e => e?.events || [])]);
    events = ev;
    let pre;
    if (apiData && Array.isArray(apiData.locations) && apiData.locations.length) {
      data = apiData; apiMode = true; pre = apiData.routes || {};
    } else {
      data = await loadJSON("/data/locations.json");
      if (!data) { document.body.innerHTML = "<p style='padding:20px'>Podaci o lokacijama nisu dostupni. Pokušajte ponovo.</p>"; return; }
      pre = await loadJSON("/data/routes.json");
    }
    const id = currentId();
    // bez lokacije u adresi, ili lokacija ne postoji / isključena je -> početna stranica sa svim lokacijama
    here = id && data.locations.find(l => l.id === id);
    if (!here) { location.replace("/"); return; }
    others = data.locations.filter(l => l !== here);
    if (apiMode) recordScan(code); else addStamp(here.id);
    applyStatic(); renderLangs();

    map = L.map("map", {zoomControl: false, attributionControl: true}).setView([here.lat, here.lng], 17);
    L.control.zoom({position: "bottomleft"}).addTo(map);
    // kad je mapa daleko (zbog Modraca), sakrij nazive ostalih tačaka da se ne preklapaju; vide se na zum ≥ 15 ili na klik
    const farLabels = () => map.getContainer().classList.toggle("far", map.getZoom() < 15);
    map.on("zoomend", farLabels);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    markers[here.id] = L.marker([here.lat, here.lng], {icon: pinIcon(here, true), zIndexOffset: 1000, title: tr(here.name)})
      .addTo(map).on("click", openHerePopup);
    others.forEach((o, i) => {
      markers[o.id] = L.marker([o.lat, o.lng], {icon: pinIcon(o, false, COLORS[i % COLORS.length]), keyboard: true, title: tr(o.name)})
        .addTo(map).on("click", () => openSheet(o));
    });

    const routePromise = Promise.all(others.map(async (o, i) => {
      const r = await getRoute(here, o, pre);
      routes[o.id] = r;
      glows[o.id] = L.polyline(r.coords, {
        color: "#3d8bff", weight: 16, opacity: .35, lineCap: "round", lineJoin: "round", className: "route-glow"
      }).addTo(map).on("click", () => openSheet(o));
      lines[o.id] = L.polyline(r.coords, {
        color: "#4f9bff", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round", className: "route-core",
        dashArray: r.approx ? "8 10" : null
      }).addTo(map).on("click", () => openSheet(o));
      flows[o.id] = L.polyline(r.coords, {
        color: "#e8f3ff", weight: 2.5, opacity: .95, lineCap: "round", lineJoin: "round", className: "route-flow",
        dashArray: "1 22", interactive: false
      }).addTo(map);
    }));

    renderHere();

    // 1) kratko na trenutnoj lokaciji, 2) zoom-out na sve lokacije sa rutama,
    // 3) uvodna poruka se spušta na dno, 4) ponovni zoom na trenutnu lokaciju, 5) na tački „Vi ste ovdje” otvara se info sa audio pričom
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(async () => {
      await routePromise;
      const all = L.featureGroup([...Object.values(markers), ...Object.values(lines)]);
      map.flyToBounds(all.getBounds(), {paddingTopLeft: [40, 70], paddingBottomRight: [40, 130], duration: reduce ? 0 : 2.2});
      renderLegend(); renderCards(); renderPassport(); renderEvents();
      setTimeout(() => {
        $("intro").classList.add("drop");
        $("here").hidden = false;
        $("othersBox").hidden = false;
        $("about").hidden = false;
        setTimeout(() => $("intro").remove(), reduce ? 0 : 950);
        // 4) nakon pregleda svih lokacija, ponovo zumiraj na mjesto gdje se posjetilac nalazi
        setTimeout(() => {
          map.flyTo([here.lat, here.lng], 16, {duration: reduce ? 0 : 2.4});
          map.once("moveend", openHerePopup);
        }, reduce ? 0 : 2200);
      }, reduce ? 0 : 2300);
    }, reduce ? 0 : 1400);

    // događaji
    $("others").addEventListener("click", e => {
      const c = e.target.closest(".card");
      if (c) openSheet(others.find(o => o.id === c.dataset.id));
    });
    $("langs").addEventListener("click", e => { const b = e.target.closest("button[data-lang]"); if (b) setLang(b.dataset.lang); });
    $("sheetClose").addEventListener("click", closeSheet);
    $("shareBtn").addEventListener("click", share);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
    map.getContainer().addEventListener("click", e => {
      const b = e.target.closest(".hp-btn");
      if (!b) return;
      if (b.dataset.act === "play") { const a = $("hereAudio"); a.paused ? a.play().catch(() => {}) : a.pause(); }
      if (b.dataset.act === "more") $("here").scrollIntoView({behavior: "smooth", block: "start"});
    });
    ["play", "pause", "ended"].forEach(ev => $("hereAudio").addEventListener(ev, syncPlayLabel));
    $("sheetAudio").addEventListener("play", () => $("hereAudio").pause());
    $("hereAudio").addEventListener("play", () => $("sheetAudio").pause());
  }

  init();
})();
