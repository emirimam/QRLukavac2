/* Zajedničko za admin i print stranicu: Supabase klijent, QR, pomoćne funkcije. */
window.LK = (() => {
  const LANGS = ["bs", "en", "de"];
  const LANG_NAMES = {bs: "Bosanski", en: "Engleski", de: "Njemački"};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
  const tr = v => (v && typeof v === "object" && !Array.isArray(v)) ? (v.bs ?? v.en ?? v.de ?? Object.values(v)[0] ?? "") : (v ?? "");
  // relativne putanje (images/…) su sa javnog sajta
  const media = src => !src ? "" : /^(https?:|data:|blob:|\/)/.test(src) ? src : "/" + src;

  let client = null;
  async function sb() {
    if (client) return client;
    const r = await fetch("/api/config");
    if (!r.ok) throw new Error("Supabase nije podešen (nedostaju SUPABASE_URL / SUPABASE_ANON_KEY na Vercelu).");
    const cfg = await r.json();
    client = supabase.createClient(cfg.url, cfg.anonKey, {auth: {persistSession: true, autoRefreshToken: true}});
    return client;
  }

  // Javna adresa sa tajnim kodom, npr. https://info.lukavac.ba/vila?k=7Fq2Ab
  const qrUrl = (base, slug, code) => `${(base || location.origin).replace(/\/$/, "")}/${slug}?k=${encodeURIComponent(code)}`;

  function qrMatrix(text) {
    const qr = qrcode(0, "M"); // M: dovoljno za tablu, a manje gusto od H
    qr.addData(text, "Byte");
    qr.make();
    return qr;
  }
  function qrSvg(text, {margin = 4, dark = "#000", light = "#fff"} = {}) {
    const qr = qrMatrix(text);
    const n = qr.getModuleCount(), size = n + margin * 2;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }
  function qrPng(text, px = 1200, margin = 4) {
    const qr = qrMatrix(text);
    const n = qr.getModuleCount(), size = n + margin * 2;
    const scale = Math.max(1, Math.floor(px / size));
    const cv = document.createElement("canvas");
    cv.width = cv.height = size * scale;
    const g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    return cv.toDataURL("image/png");
  }
  function download(name, href) {
    const a = document.createElement("a");
    a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  return {LANGS, LANG_NAMES, esc, tr, media, sb, qrUrl, qrSvg, qrPng, download};
})();
