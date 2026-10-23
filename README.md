# Lukavac Info (v0.2)

Digitalna info staza Lukavca. Svaka info tačka ima QR kod sa svojom adresom (`/setaliste`, `/vila`, `/park`…; radi i stari oblik `?l=vila`). Skeniranjem se otvara stranica koja:

1. pokaže mapu na mjestu gdje je posjetilac,
2. odzumira da se vide sve ostale lokacije, sa zelenim i plavim putevima do njih,
3. spusti uvodnu poruku na dno stranice,
4. na samoj tački „Vi ste ovdje” otvori kratku info karticu sa dugmetom za audio priču; ispod mape je puni tekst, audio i „nekad i sad”,
5. na klik na drugu lokaciju (marker, put ili karticu) otvori detalje: udaljenost, vrijeme, tekst, audio i navigaciju.

Bez instalacije aplikacije, bez backenda. Čisti statični sajt (HTML, CSS, JS, Leaflet, OpenStreetMap).

## Novo u v0.2

- **Jezik prema telefonu:** bosanski (i hrvatski/srpski), engleski, njemački. Svi ostali jezici → engleski. Posjetilac može promijeniti jezik dugmadima BS/EN/DE gore desno.
- **Info na tački „Vi ste ovdje”** na mapi: naziv, kratki opis, „Poslušaj” i „Pročitaj više”.
- **Nekad i sad:** klizač između stare i nove fotografije (polje `compare`).
- **Lukavac pasoš:** svaka skenirana tačka dobija pečat (pamti se u pregledniku), nagrada se upisuje u `passport.reward`.
- **Šta se dešava u Lukavcu:** događaji iz `data/events.json`, prikazuju se samo budući.
- **Podijeli:** sistemski meni za dijeljenje na mobitelu.
- **Kratke adrese** (`domena.ba/vila`) i **statistika** preko Vercel Web Analytics: broj otvaranja po lokaciji, zemlje, uređaji, doba dana.
- **Vila Solvay:** fotografije i audio priča na bosanskom i engleskom.
- **Macan Marija:** nacrt teksta prema bastina.ba, za provjeru od TZ.

## Struktura

```
index.html, style.css, app.js
vercel.json           ← kratke adrese (/vila) i keširanje
data/locations.json   ← lokacije: ime, tekst, slike, audio, koordinate (po jezicima bs/en/de)
data/events.json      ← događaji
data/routes.json      ← prethodno izračunate rute (generiše se skriptom)
audio/                ← mp3 priče: <id>.mp3 (bs), <id>-en.mp3, <id>-de.mp3
images/               ← fotografije
scripts/              ← rute i QR kodovi
```

## Tekstovi po jezicima

Svako tekstualno polje može biti običan tekst ili objekat po jezicima:

```json
"name": { "bs": "Gradski park", "en": "City Park", "de": "Stadtpark" }
```

Ako prijevod nedostaje, prikazuje se bosanski. Polje `_status` kod svake lokacije kaže šta još treba od TZ.

Audio: `"audio": { "bs": "audio/vila.mp3", "en": "audio/vila-en.mp3" }`. Ko ima telefon na njemačkom, a njemački snimak ne postoji, dobije engleski.

## Prvi koraci

1. **Provjeri koordinate** u `data/locations.json`. Trenutne su PRIBLIŽNE. U Google Maps desni klik na tačno mjesto → klik na koordinate (kopira ih) → upiši `lat` i `lng` → `"coordsVerified": true`. Za Jezero Modrac ciljati plažu ili parking, ne sredinu jezera.
2. **Upiši tekstove** (sva polja sa `TODO`) i nagradu za pasoš.
3. **Izračunaj rute:** `npm run routes` (traje oko pola minute, treba internet).
4. **Lokalno testiranje:** `npm run dev`, pa otvori `http://localhost:3000/vila`.
5. **Deploy na Vercel** kao statični projekt (bez build komande). U projektu uključi **Analytics**.
6. **QR kodovi:** `npm install`, pa `npm run qr -- https://tvoja-domena.ba`. Dobiješ PNG za štampu i SVG za graviranje u folderu `qr/`, sa adresama oblika `https://tvoja-domena.ba/vila`.

## Dodavanje nove lokacije

Dodaj novi objekat u `locations` u `data/locations.json` (`id` samo mala slova, brojevi i crtica), ponovo pokreni `npm run routes` i `npm run qr`. Nova tačka se automatski pojavljuje na svim ostalim lokacijama i u pasošu.

## Napomene

- Polje `mode`: `"foot"` = pješačka ruta, `"car"` = ruta autom (Jezero Modrac).
- Ako ruta nije dostupna, aplikacija nacrta isprekidanu ravnu liniju i označi udaljenost kao približnu.
- Fotografija „nekad” za Vilu je privremena; zamijeniti arhivskom (Zavod za zaštitu naslijeđa TK).
- Mapa koristi OpenStreetMap pločice. Za veći promet prebaci na servis sa besplatnim kvotama (MapTiler, Stadia) promjenom jedne linije u `app.js`.
- Statistika jezika posjetilaca nije uključena u Vercel Analytics; ako bude potrebna, dodaje se kasnije.
