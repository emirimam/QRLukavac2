// GET /api/locations — javni podaci o lokacijama iz baze (bez tajnih kodova).
import { configured, sb, send } from "./_lib.js";

const COLS = "id,slug,name,short,body,more,sources,image,image_credit,gallery,compare,audio,lat,lng,mode,coords_verified,stamp_enabled,gps_radius_m,sort_order";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "not_configured" });
  try {
    const [locs, settings, routes] = await Promise.all([
      sb(`locations?select=${COLS}&published=eq.true&order=sort_order.asc,slug.asc`),
      sb("settings?select=stamps_enabled,default_slug,about,passport&id=eq.1"),
      sb("routes?select=from_id,to_id,mode,distance,duration,coords,from_lat,from_lng,to_lat,to_lng")
    ]);
    const st = settings?.[0] || {};
    const byId = new Map(locs.map(l => [l.id, l]));
    const outRoutes = {};
    for (const r of routes || []) {
      const a = byId.get(r.from_id), b = byId.get(r.to_id);
      // ruta važi samo ako koordinate nisu mijenjane nakon računanja
      if (!a || !b || r.from_lat !== a.lat || r.from_lng !== a.lng || r.to_lat !== b.lat || r.to_lng !== b.lng) continue;
      outRoutes[`${a.slug}>${b.slug}`] = { mode: r.mode, distance: r.distance, duration: r.duration, coords: r.coords };
    }
    send(res, 200, {
      source: "db",
      defaultId: st.default_slug || locs[0]?.slug,
      stampsEnabled: st.stamps_enabled !== false,
      about: st.about || {},
      passport: st.passport || {},
      locations: locs.map(l => ({
        id: l.slug, name: l.name, short: l.short, text: l.body, more: l.more, sources: l.sources,
        image: l.image, imageCredit: l.image_credit, gallery: l.gallery, compare: l.compare, audio: l.audio,
        lat: l.lat, lng: l.lng, mode: l.mode, coordsVerified: l.coords_verified,
        stampEnabled: l.stamp_enabled, gpsRadius: l.gps_radius_m
      })),
      routes: outRoutes
    }, "public, s-maxage=60, stale-while-revalidate=300");
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "db" });
  }
}
