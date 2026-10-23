// Pravi QR kod (PNG za štampu i SVG za graviranje) za svaku lokaciju.
// Pokreni:  npm run qr -- https://tvoja-domena.ba
import QRCode from "qrcode";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base.startsWith("https://")) {
  console.error("Navedi adresu sajta, npr:  npm run qr -- https://info.lukavac.ba");
  process.exit(1);
}

const data = JSON.parse(await readFile(new URL("../data/locations.json", import.meta.url), "utf8"));
const dir = new URL("../qr/", import.meta.url);
await mkdir(dir, { recursive: true });

for (const l of data.locations) {
  const url = `${base}/${l.id}`;
  const opts = { errorCorrectionLevel: "H", margin: 2 };
  await QRCode.toFile(fileURLToPath(new URL(`${l.id}.png`, dir)), url, { ...opts, width: 1200 });
  await writeFile(new URL(`${l.id}.svg`, dir), await QRCode.toString(url, { ...opts, type: "svg" }));
  console.log(`✓ ${l.name}: ${url}`);
}
console.log("\nQR kodovi su u folderu qr/");
