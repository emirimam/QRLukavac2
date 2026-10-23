// Zajednički kod za Vercel funkcije. Fajlovi sa "_" na početku Vercel ne objavljuje kao rute.
// Vercel funkcije su tanak proxy (ista domena + keš) prema Supabase Edge funkciji "public-api",
// koja jedina ima service_role pristup bazi. Na Vercelu trebaju samo SUPABASE_URL i SUPABASE_ANON_KEY.

export const env = () => ({
  url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  anon: process.env.SUPABASE_ANON_KEY || ""
});
export const configured = () => { const e = env(); return !!(e.url && e.anon); };

export function send(res, status, data, cache = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

export async function readBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 10_000) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

// Poziv Edge funkcije; vraća {status, text}
export async function edge(action, { method = "GET", query = {}, body } = {}) {
  const e = env();
  const qs = new URLSearchParams({ action, ...query });
  const headers = { apikey: e.anon };
  if (e.anon.startsWith("eyJ")) headers.Authorization = `Bearer ${e.anon}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${e.url}/functions/v1/public-api?${qs}`, { method, headers, body });
  return { status: r.status, text: await r.text() };
}

export async function proxy(res, action, opts, cache) {
  if (!configured()) return send(res, 503, { error: "not_configured" });
  try {
    const r = await edge(action, opts);
    send(res, r.status, r.text, r.status === 200 && cache ? cache : "no-store");
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "upstream" });
  }
}
