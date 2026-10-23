// POST /api/scan — bilježi skeniranje, provjerava tajni kod i dodjeljuje pečat (samo na serveru).
// Tijelo: { slug, k, device, gps: { status: "granted"|"denied"|"unavailable"|"timeout"|"not_requested", lat, lng } }
import { configured, rpc, send, readJson, deviceHash } from "./_lib.js";

const GPS = new Set(["granted", "denied", "unavailable", "timeout", "not_requested"]);
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "not_configured" });
  const b = await readJson(req);
  if (!b || typeof b.slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(b.slug)) return send(res, 400, { error: "bad_slug" });
  const dev = deviceHash(b.device);
  if (!dev) return send(res, 400, { error: "bad_device" });
  const code = typeof b.k === "string" ? b.k.slice(0, 32) : null;
  const status = GPS.has(b.gps?.status) ? b.gps.status : "not_requested";
  const lat = status === "granted" ? num(b.gps?.lat) : null;
  const lng = status === "granted" ? num(b.gps?.lng) : null;
  try {
    const r = await rpc("record_scan", {
      p_slug: b.slug, p_code: code, p_device: dev, p_gps_status: status, p_lat: lat, p_lng: lng
    });
    send(res, r?.ok ? 200 : 404, r);
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "db" });
  }
}
