// GET /api/config — javna Supabase konfiguracija za admin stranicu (URL + anon ključ; anon ključ je javan po dizajnu).
import { env, send } from "./_lib.js";

export default function handler(req, res) {
  const e = env();
  if (!e.url || !e.anon) return send(res, 503, { error: "not_configured" });
  send(res, 200, { url: e.url, anonKey: e.anon }, "public, max-age=300");
}
