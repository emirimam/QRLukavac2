/* Lukavac Info — početna stranica: o projektu, mapa i spisak svih aktivnih lokacija. */
(() => {
  const LANGS = ["bs", "en", "de"];
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };

  const T = {
    bs: {
      eyebrow: "Lukavac Info · Digitalna info staza",
      title: "Otkrijte Lukavac uz QR kod na info tablama",
      lead: "Skenirajte QR kod na tabli kamerom telefona i odmah vidite gdje ste, šta je u blizini i kako doći do sljedeće tačke. Uz svaku lokaciju je kratka priča, fotografije i audio vodič na bosanskom, engleskom i njemačkom jeziku.",
      cta: "Pogledajte sve lokacije",
      mapTitle: "Mapa info staze",
      mapSub: "Kliknite na tačku za stranicu lokacije.",
      placesTitle: "Lokacije",
      open: "Otvori lokaciju",
      howTitle: "Kako radi",
      steps: [
        ["Pronađite info tablu", "Na svakoj lokaciji staze nalazi se tabla sa QR kodom."],
        ["Skenirajte QR kod", "Dovoljna je kamera telefona. Nije potrebna aplikacija, registracija ni lozinka."],
        ["Mapa vas dočeka na mjestu gdje stojite", "Stranica pokaže vašu tačku i putanje do ostalih lokacija, sa udaljenošću i vremenom hoda."],
        ["Pročitajte i poslušajte priču", "Tekst, fotografije, „nekad i sad” i audio priča o mjestu, na jeziku vašeg telefona."],
        ["Krenite dalje", "Izaberite sljedeću lokaciju na mapi ili u listi i pratite putanju do nje."]
      ],
      passTitle: "Lukavac pasoš",
      passText: "Svako skeniranje table na licu mjesta donosi pečat u digitalnom pasošu. Kada sakupite dovoljno pečata, na ekranu dobijete kod za nagradu koju preuzimate kod partnera staze. Pasoš se vodi automatski na vašem telefonu – ništa ne upisujete.",
      privTitle: "Privatnost",
      privacy: [
        "Bez korisničkog računa, imena, broja telefona ili e-maila.",
        "Telefon dobija nasumičnu anonimnu oznaku, samo da bi se pečat dodijelio jednom.",
        "Lokacija telefona traži se samo uz vašu dozvolu i služi isključivo za potvrdu pečata; vaše koordinate se ne čuvaju.",
        "Pečat dobijate i ako ne dozvolite pristup lokaciji.",
        "Bilježi se samo anonimna statistika posjeta (vrijeme i lokacija skeniranja), bez ličnih podataka."
      ],
      aboutTitle: "O projektu",
      aboutText: "Digitalnu info stazu Lukavca izradilo je Udruženje mladih StartITi, na poziv Turističke zajednice Lukavac.",
      aboutText2: "Cilj je da posjetioci i mještani na jednostavan način, uz pomoć modernih tehnologija, upoznaju historiju i znamenitosti grada.",
      noPlaces: "Lokacije trenutno nisu dostupne. Pokušajte ponovo malo kasnije."
    },
    en: {
      eyebrow: "Lukavac Info · Digital info trail",
      title: "Discover Lukavac with the QR codes on the info boards",
      lead: "Scan the QR code on a board with your phone camera to see where you are, what is nearby and how to reach the next stop. Each place has a short story, photos and an audio guide in Bosnian, English and German.",
      cta: "See all places",
      mapTitle: "Trail map",
      mapSub: "Tap a point to open its page.",
      placesTitle: "Places",
      open: "Open place",
      howTitle: "How it works",
      steps: [
        ["Find an info board", "Every stop on the trail has a board with a QR code."],
        ["Scan the QR code", "Your phone camera is enough. No app, sign-up or password."],
        ["The map starts where you stand", "The page shows your point and routes to the other places, with distance and walking time."],
        ["Read and listen", "Text, photos, “then and now” and an audio story, in your phone's language."],
        ["Move on", "Pick the next place on the map or in the list and follow the route."]
      ],
      passTitle: "Lukavac passport",
      passText: "Each board you scan on site adds a stamp to your digital passport. Collect enough stamps and you get a reward code on screen to redeem with a trail partner. The passport is kept automatically on your phone – nothing to fill in.",
      privTitle: "Privacy",
      privacy: [
        "No account, name, phone number or e-mail.",
        "Your phone gets a random anonymous ID, only so a stamp is given once.",
        "Your location is requested only with your permission and only to confirm a stamp; your coordinates are not stored.",
        "You still get the stamp if you decline location access.",
        "Only anonymous visit statistics are recorded (time and place of the scan), with no personal data."
      ],
      aboutTitle: "About the project",
      aboutText: "The Lukavac digital info trail was created by the StartITi youth association, at the invitation of the Lukavac Tourist Board.",
      aboutText2: "The aim is to help visitors and locals discover the town's history and sights in a simple way, with the help of modern technology.",
      noPlaces: "Places are not available right now. Please try again later."
    },
    de: {
      eyebrow: "Lukavac Info · Digitaler Info-Pfad",
      title: "Entdecken Sie Lukavac mit den QR-Codes auf den Infotafeln",
      lead: "Scannen Sie den QR-Code auf einer Tafel mit der Handykamera und sehen Sie sofort, wo Sie sind, was in der Nähe liegt und wie Sie zur nächsten Station kommen. Zu jedem Ort gibt es eine kurze Geschichte, Fotos und einen Audioguide auf Bosnisch, Englisch und Deutsch.",
      cta: "Alle Orte ansehen",
      mapTitle: "Karte des Pfads",
      mapSub: "Tippen Sie auf einen Punkt, um seine Seite zu öffnen.",
      placesTitle: "Orte",
      open: "Ort öffnen",
      howTitle: "So funktioniert es",
      steps: [
        ["Infotafel finden", "An jeder Station des Pfads steht eine Tafel mit QR-Code."],
        ["QR-Code scannen", "Die Handykamera genügt. Keine App, keine Anmeldung, kein Passwort."],
        ["Die Karte beginnt dort, wo Sie stehen", "Die Seite zeigt Ihren Standort und die Wege zu den anderen Orten, mit Entfernung und Gehzeit."],
        ["Lesen und zuhören", "Text, Fotos, „damals und heute“ und eine Audio-Geschichte in der Sprache Ihres Handys."],
        ["Weitergehen", "Wählen Sie den nächsten Ort auf der Karte oder in der Liste und folgen Sie dem Weg."]
      ],
      passTitle: "Lukavac-Pass",
      passText: "Jede vor Ort gescannte Tafel bringt einen Stempel in Ihren digitalen Pass. Mit genug Stempeln erhalten Sie auf dem Bildschirm einen Code für eine Belohnung bei einem Partner des Pfads. Der Pass wird automatisch auf Ihrem Handy geführt – Sie geben nichts ein.",
      privTitle: "Datenschutz",
      privacy: [
        "Kein Konto, kein Name, keine Telefonnummer, keine E-Mail.",
        "Ihr Handy erhält eine zufällige anonyme Kennung, nur damit ein Stempel einmal vergeben wird.",
        "Ihr Standort wird nur mit Ihrer Erlaubnis abgefragt und nur zur Bestätigung des Stempels genutzt; Ihre Koordinaten werden nicht gespeichert.",
        "Den Stempel erhalten Sie auch ohne Standortfreigabe.",
        "Erfasst wird nur eine anonyme Besuchsstatistik (Zeit und Ort des Scans), ohne personenbezogene Daten."
      ],
      aboutTitle: "Über das Projekt",
      aboutText: "Der digitale Info-Pfad Lukavac wurde vom Jugendverein StartITi auf Einladung des Tourismusverbands Lukavac erstellt.",
      aboutText2: "Ziel ist, dass Besucher und Einheimische die Geschichte und Sehenswürdigkeiten der Stadt mithilfe moderner Technologien einfach kennenlernen.",
      noPlaces: "Die Orte sind gerade nicht verfügbar. Bitte versuchen Sie es später erneut."
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
    return "en";
  }
  let lang = detectLang();
  const t = k => (T[lang] || T.bs)[k] ?? T.bs[k];
  const tr = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v[lang] ?? v.bs ?? Object.values(v)[0]) : (v ?? "");

  let locs = [], map = null, markers = [];

  async function loadJSON(url) {
    try { const r = await fetch(url, {cache: "no-cache"}); return r.ok ? r.json() : null; } catch { return null; }
  }

  function renderStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-h]").forEach(el => { el.textContent = t(el.dataset.h); });
    $("steps").innerHTML = t("steps").map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join("");
    $("privacy").innerHTML = t("privacy").map(p => `<li>${esc(p)}</li>`).join("");
    $("langs").innerHTML = LANGS.map(l => `<button type="button" class="${l === lang ? "on" : ""}" data-lang="${l}" aria-pressed="${l === lang}">${l.toUpperCase()}</button>`).join("");
  }

  function renderPlaces() {
    if (!locs.length) { $("places").innerHTML = `<p class="h-sub">${esc(t("noPlaces"))}</p>`; return; }
    $("places").innerHTML = locs.map((l, i) => `
      <a class="h-place" href="/${encodeURIComponent(l.id)}">
        ${l.image ? `<img src="${esc(/^(https?:|\/)/.test(l.image) ? l.image : "/" + l.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'h-ph',textContent:'${i + 1}'}))">` : `<span class="h-ph">${i + 1}</span>`}
        <span class="h-place-txt">
          <span class="h-place-name">${esc(tr(l.name))}</span>
          <span class="h-place-short">${esc(tr(l.short))}</span>
          <span class="h-place-go">${esc(t("open"))} ›</span>
        </span>
      </a>`).join("");
  }

  function renderMap() {
    if (typeof L === "undefined" || !locs.length) return;
    if (!map) {
      map = L.map("homeMap", {scrollWheelZoom: false});
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
    }
    markers.forEach(m => m.remove());
    markers = locs.map((l, i) => L.marker([l.lat, l.lng], {
      title: tr(l.name), keyboard: true,
      icon: L.divIcon({className: "", iconSize: [0, 0], iconAnchor: [0, 0],
        html: `<div class="pin"><div class="pin-dot" style="background:#2f7bff"></div><div class="pin-label">${esc(tr(l.name))}</div></div>`})
    }).addTo(map).on("click", () => { location.href = "/" + encodeURIComponent(l.id); }));
    map.fitBounds(L.featureGroup(markers).getBounds(), {padding: [40, 40], maxZoom: 16});
    const far = () => map.getContainer().classList.toggle("far", map.getZoom() < 15);
    map.on("zoomend", far); far();
  }

  function setLang(l) {
    if (l === lang) return;
    lang = l; store.set("lang", l);
    renderStatic(); renderPlaces(); renderMap();
  }

  async function init() {
    renderStatic();
    $("langs").addEventListener("click", e => { const b = e.target.closest("button[data-lang]"); if (b) setLang(b.dataset.lang); });
    // 1) baza preko /api/locations (samo aktivne lokacije); 2) rezerva: statični JSON
    const api = await loadJSON("/api/locations");
    const data = (api && Array.isArray(api.locations) && api.locations.length) ? api : await loadJSON("/data/locations.json");
    locs = (data?.locations || []).filter(l => l && l.id && isFinite(l.lat) && isFinite(l.lng));
    renderPlaces(); renderMap();
  }
  init();
})();
