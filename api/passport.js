// GET /api/passport?device=… — pečati, napredak i osvojene nagrade anonimnog uređaja.
import { proxy, send } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  const device = new URL(req.url, "http://x").searchParams.get("device") || "";
  return proxy(res, "passport", { query: { device } });
}
