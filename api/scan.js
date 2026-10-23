// POST /api/scan — bilježi skeniranje; kod i pečat provjerava server (Edge funkcija + SQL record_scan).
import { proxy, send, readBody } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  const body = await readBody(req);
  if (!body) return send(res, 400, { error: "bad_body" });
  return proxy(res, "scan", { method: "POST", body });
}
