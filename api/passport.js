// GET /api/passport?device=… — pečati, napredak i osvojene nagrade anonimnog uređaja.
import { configured, rpc, send, deviceHash } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "not_configured" });
  const url = new URL(req.url, "http://x");
  const dev = deviceHash(url.searchParams.get("device"));
  if (!dev) return send(res, 400, { error: "bad_device" });
  try {
    send(res, 200, await rpc("get_passport", { p_device: dev }));
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "db" });
  }
}
