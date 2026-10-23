// Generiše SQL migraciju koja upisuje postojeće lokacije iz data/locations.json u bazu.
// Pokreni:  node scripts/seed-sql.mjs > supabase/migrations/20261023120200_seed_locations.sql
// Upis je "on conflict do nothing": postojeći redovi u bazi se NE prepisuju.
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../data/locations.json", import.meta.url), "utf8"));
const q = v => v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'";
const j = v => v == null ? "null" : q(JSON.stringify(v)) + "::jsonb";

const out = [
  "-- Postojeće lokacije (generisano iz data/locations.json skriptom scripts/seed-sql.mjs).",
  "-- Ne prepisuje ništa što već postoji u bazi (on conflict do nothing).",
  ""
];
data.locations.forEach((l, i) => {
  const cols = {
    slug: q(l.id), name: j(l.name || {}), short: j(l.short || {}), body: j(l.text || {}), more: j(l.more ?? null),
    sources: j(l.sources || []), image: q(l.image || null), image_credit: q(l.imageCredit || null),
    gallery: j(l.gallery || []), compare: j(l.compare ?? null), audio: j(l.audio || {}),
    lat: l.lat, lng: l.lng, mode: q(l.mode || "foot"), coords_verified: !!l.coordsVerified,
    status_note: q(l._status || null), sort_order: (i + 1) * 10
  };
  out.push(`insert into public.locations (${Object.keys(cols).join(", ")})\nvalues (${Object.values(cols).join(", ")})\non conflict (slug) do nothing;\n`);
});
out.push(`update public.settings set
  default_slug = coalesce(default_slug, ${q(data.defaultId)}),
  about = case when about = '{}'::jsonb then ${j(data.about || {})} else about end
where id = 1;`);
console.log(out.join("\n"));
