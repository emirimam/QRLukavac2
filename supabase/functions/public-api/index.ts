// Supabase Edge funkcija "public-api": jedini javni ulaz za podatke o lokacijama, skeniranja i pasoš.
// Radi sa service_role ključem (automatski dostupan u Edge okruženju); tajni kodovi se nikad ne vraćaju.
//   GET  ?action=locations
//   POST ?action=scan      body: { slug, k, device, gps: { status, lat, lng }, admin? }
//   GET  ?action=passport&device=…
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, data: unknown, cache = "no-store") =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache } });

const COLS = "id,slug,name,short,body,more,sources,image,image_credit,gallery,compare,audio,lat,lng,mode,coords_verified,stamp_enabled,gps_radius_m,sort_order";
const GPS = new Set(["granted", "denied", "unavailable", "timeout", "not_requested"]);
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function locations() {
  const [l, s, r] = await Promise.all([
    db.from("locations").select(COLS).eq("published", true).order("sort_order").order("slug"),
    db.from("settings").select("stamps_enabled,default_slug,about,passport").eq("id", 1).maybeSingle(),
    db.from("routes").select("from_id,to_id,mode,distance,duration,coords,from_lat,from_lng,to_lat,to_lng"),
  ]);
  if (l.error || s.error || r.error) throw l.error || s.error || r.error;
  const locs = l.data as any[];
  const st = (s.data || {}) as any;
  const byId = new Map(locs.map((x) => [x.id, x]));
  const routes: Record<string, unknown> = {};
  for (const x of (r.data || []) as any[]) {
    const a = byId.get(x.from_id), b = byId.get(x.to_id);
    // ruta važi samo ako koordinate nisu mijenjane nakon računanja
    if (!a || !b || x.from_lat !== a.lat || x.from_lng !== a.lng || x.to_lat !== b.lat || x.to_lng !== b.lng) continue;
    routes[`${a.slug}>${b.slug}`] = { mode: x.mode, distance: x.distance, duration: x.duration, coords: x.coords };
  }
  return {
    source: "db",
    defaultId: st.default_slug || locs[0]?.slug,
    stampsEnabled: st.stamps_enabled !== false,
    about: st.about || {},
    passport: st.passport || {},
    locations: locs.map((x) => ({
      id: x.slug, name: x.name, short: x.short, text: x.body, more: x.more, sources: x.sources,
      image: x.image, imageCredit: x.image_credit, gallery: x.gallery, compare: x.compare, audio: x.audio,
      lat: x.lat, lng: x.lng, mode: x.mode, coordsVerified: x.coords_verified,
      stampEnabled: x.stamp_enabled, gpsRadius: x.gps_radius_m,
    })),
    routes,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "locations" && req.method === "GET") {
      return json(200, await locations(), "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
    }
    if (action === "scan" && req.method === "POST") {
      const raw = await req.text();
      if (raw.length > 10_000) return json(413, { error: "too_large" });
      let b: any;
      try { b = JSON.parse(raw); } catch { return json(400, { error: "bad_json" }); }
      if (typeof b?.slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(b.slug)) return json(400, { error: "bad_slug" });
      if (typeof b.device !== "string" || !DEVICE_RE.test(b.device)) return json(400, { error: "bad_device" });
      const status = GPS.has(b.gps?.status) ? b.gps.status : "not_requested";
      const { data, error } = await db.rpc("record_scan", {
        p_slug: b.slug,
        p_code: typeof b.k === "string" ? b.k.slice(0, 32) : null,
        p_device_id: b.device,
        p_gps_status: status,
        p_lat: status === "granted" ? num(b.gps?.lat) : null,
        p_lng: status === "granted" ? num(b.gps?.lng) : null,
        // pregled iz preglednika u kojem je admin prijavljen ne ulazi u statistiku
        p_count: b.admin !== true,
      });
      if (error) throw error;
      return json((data as any)?.ok ? 200 : 404, data);
    }
    if (action === "passport" && req.method === "GET") {
      const dev = url.searchParams.get("device") || "";
      if (!DEVICE_RE.test(dev)) return json(400, { error: "bad_device" });
      const { data, error } = await db.rpc("get_passport", { p_device_id: dev });
      if (error) throw error;
      return json(200, data);
    }
    return json(404, { error: "unknown_action" });
  } catch (e) {
    console.error(e);
    return json(502, { error: "db" });
  }
});
