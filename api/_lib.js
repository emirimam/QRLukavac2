// Zajednički kod za Vercel funkcije. Fajlovi sa "_" na početku Vercel ne objavljuje kao rute.
import { createHmac } from "node:crypto";

export const env = () => ({
  url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  anon: process.env.SUPABASE_ANON_KEY || "",
  service: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  salt: process.env.DEVICE_SALT || ""
});

export const configured = () => { const e = env(); return !!(e.url && e.service && e.salt); };

// PostgREST poziv sa service_role ključem (samo na serveru; ključ nikad ne ide klijentu)
export async function sb(path, { method = "GET", body, headers = {} } = {}) {
  const e = env();
  const r = await fetch(`${e.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: e.service,
      // stari (JWT) ključevi idu i u Authorization; novi sb_secret_… ključevi samo u apikey
      ...(e.service.startsWith("eyJ") ? { Authorization: `Bearer ${e.service}` } : {}),
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const rpc = (fn, args) => sb(`rpc/${fn}`, { method: "POST", body: args });

// Anonimni ID uređaja (nasumičan UUID iz preglednika) -> HMAC hash. U bazi se čuva samo hash.
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;
export function deviceHash(id) {
  if (typeof id !== "string" || !DEVICE_RE.test(id)) return null;
  return createHmac("sha256", env().salt).update(id).digest("hex");
}

export function send(res, status, data, cache = "no-store") {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(data));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 10_000) return null; chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { return null; }
}
