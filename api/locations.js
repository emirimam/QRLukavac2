// GET /api/locations — javni podaci o lokacijama iz baze (bez tajnih kodova).
import { proxy, send } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  return proxy(res, "locations", {}, "public, s-maxage=60, stale-while-revalidate=300");
}
