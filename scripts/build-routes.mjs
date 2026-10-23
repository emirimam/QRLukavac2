// Izračunava rute između SVIH parova lokacija i sprema ih u data/routes.json.
// Pokreni nakon svake promjene koordinata:  npm run routes
// Tako aplikacija ne zavisi od javnog servera za rute kad je posjetilac na terenu.
import { readFile, writeFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../data/locations.json", import.meta.url), "utf8"));
const locs = data.locations;
const out = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const a of locs) {
  for (const b of locs) {
    if (a === b) continue;
    const mode = b.mode === "car" ? "car" : "foot";
    const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    try {
      const j = await (await fetch(url)).json();
      if (j.code !== "Ok") throw new Error(j.code);
      const r = j.routes[0];
      out[`${a.id}>${b.id}`] = {
        mode,
        distance: Math.round(r.distance),
        duration: Math.round(r.duration),
        coords: r.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(6), +lng.toFixed(6)])
      };
      console.log(`✓ ${a.name} → ${b.name}: ${Math.round(r.distance)} m`);
    } catch (e) {
      console.warn(`✗ ${a.name} → ${b.name}: ${e.message}`);
    }
    await sleep(1100); // poštuj ograničenje javnog servera (1 zahtjev u sekundi)
  }
}

if (locs.some(l => !l.coordsVerified)) console.warn("\nPažnja: neke koordinate nisu provjerene (coordsVerified: false).");
await writeFile(new URL("../data/routes.json", import.meta.url), JSON.stringify(out));
console.log(`\nSpremljeno ${Object.keys(out).length} ruta u data/routes.json`);
