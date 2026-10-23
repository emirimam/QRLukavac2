# Lukavac Info (v0.2)

Digitalna info staza Lukavca. Svaka info tačka ima QR kod sa svojom adresom (`/setaliste`, `/trg-slobode`, `/vila`…; radi i stari oblik `?l=vila`). Skeniranjem se otvara stranica koja:

1. pokaže mapu na mjestu gdje je posjetilac,
2. odzumira da se vide sve ostale lokacije, sa zelenim i plavim putevima do njih,
3. spusti uvodnu poruku na dno stranice,
4. na samoj tački „Vi ste ovdje” otvori kratku info karticu sa dugmetom za audio priču; ispod mape je puni tekst, audio i „nekad i sad”,
5. na klik na drugu lokaciju (marker, put ili karticu) otvori detalje: udaljenost, vrijeme, tekst, audio i navigaciju.

Bez instalacije aplikacije. Statični sajt (HTML, CSS, JS, Leaflet, OpenStreetMap) + Vercel funkcije (`/api`) + Supabase (besplatni plan) za admin, statistiku, pečate i nagrade. Dok Supabase nije podešen, sajt radi kao prije iz `data/*.json`.

## Admin dashboard (v0.3)

Adresa: **`/admin`** (prijava emailom i lozinkom, Supabase Auth; pristup imaju samo korisnici iz tabele `admins`).

- **Statistika** (početni ekran): skeniranja danas / jučer / 7 / 30 dana, unikatni uređaji, trend po danima, raspodjela po satima, dodijeljeni pečati, udio GPS potvrđenih pečata, odbijeni pokušaji, izdate i iskorištene nagrade — ukupno i po lokaciji (klik na red mijenja graf). Vrijeme je po Sarajevu.
- **Lokacije**: sve lokacije su u bazi; dodavanje i uređivanje bez izmjene koda (naziv, slug, koordinate na mapi, GPS radijus, tekstovi BS/EN/DE, „Saznaj više”, izvori, glavna fotografija, galerija, „nekad i sad”, audio po jezicima — sa uploadom, pregledom i reprodukcijom). Lokacija se ne briše (da se sačuva statistika), nego se isključi „Objavljena”. Dugme **Preračunaj rute** računa rute preko besplatnog OSRM/FOSSGIS servera i sprema ih u bazu.
- **QR kod** po lokaciji: pregled, print table (A4, A5, mala naljepnica), preuzimanje PNG/SVG, print sadržaja lokacije, **regeneracija tajnog koda**.
- **Nagrade**: naziv, opis, broj pečata i/ili konkretne lokacije, sponzor (naziv, logo, link), aktivno, rok važenja.
- **Provjera koda**: sponzor/admin upiše kod koji turist pokaže (npr. `K7MQ-4XPA`) i označi ga kao iskorišten.
- **Postavke**: pečati globalno uključeni/isključeni, javna adresa sajta za QR (npr. `https://info.lukavac.ba`), početna lokacija, tekstovi pasoša i podnožja.

### Kako rade kod, pečat i GPS

- QR na tabli vodi na `/<slug>?k=<tajni kod>`. Kod je nasumičan (6 znakova), jedinstven po lokaciji, čuva se samo u tabeli `location_secrets` (čita je samo admin). Javni `/api/locations` ga ne vraća, a aplikacija ga odmah uklanja iz adrese.
- Pri otvaranju stranica šalje `/api/scan` (Vercel funkcija sa service_role ključem) → SQL funkcija `record_scan` provjerava kod, bilježi skeniranje i dodjeljuje pečat **najviše jednom po uređaju i lokaciji**. Bez koda ili s pogrešnim kodom lokacija se normalno otvara, ali pečata nema. Više od 10 pogrešnih kodova po uređaju u sat vremena se odbija.
- Uređaj je anonimni nasumični ID iz preglednika; u bazu ide samo njegov HMAC hash (`DEVICE_SALT`). Ne spremaju se IP, user-agent ni koordinate (samo udaljenost u metrima).
- GPS je dodatak: ako turist dozvoli lokaciju i u krugu je radijusa (zadano 150 m), pečat je „GPS potvrđen”. Ako odbije, pečat se svejedno daje uz ispravan kod.
- Kad uređaj ispuni uslov nagrade, server mu izda kod za preuzimanje koji turist vidi u pasošu.

### Postavljanje (jednom)

1. **Supabase projekat** (besplatni plan) → SQL Editor → pokrenuti redom fajlove iz `supabase/migrations/` (ili `supabase db push` uz Supabase CLI). Migracije samo dodaju tabele/funkcije; treća upisuje postojećih 6 lokacija iz `data/locations.json` i ne prepisuje ništa što već postoji.
2. **Vercel → Settings → Environment Variables** (Production i Preview):
   - `SUPABASE_URL` — npr. `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` — anon/publishable ključ (javan, koristi ga admin stranica)
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role (legacy JWT) ili novi `sb_secret_…` ključ (**samo na serveru**, nikad u kodu)
   - `DEVICE_SALT` — dug nasumičan tekst (npr. `openssl rand -hex 32`); ne mijenjati kasnije, inače se brojanje uređaja i pečata „resetuje”
3. **Prvi admin**: Supabase → Authentication → Users → *Add user* (email + lozinka, „Auto confirm”). Zatim u SQL Editoru:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'emirimamovice@gmail.com';
   ```
   U Authentication → Sign In / Providers isključiti javnu registraciju (*Allow new users to sign up*), da niko drugi ne pravi račune.
4. Redeploy na Vercelu, otvoriti `/admin`, u **Postavke** upisati javnu adresu sajta, u **Lokacije** kliknuti *Preračunaj rute*, pa odštampati nove QR table (stari QR bez koda ne daje pečat).

### Struktura (novo)

```
api/                  ← Vercel funkcije: locations, scan, passport, config (+ _lib.js)
admin/                ← dashboard (index.html, admin.js, print.html …), biblioteke u admin/vendor/
supabase/migrations/  ← šema, RLS, SQL funkcije, početni podaci
scripts/seed-sql.mjs  ← ponovo generiše migraciju s lokacijama iz data/locations.json
```

Lokalno sa API-jem: `npx vercel dev` (uz env varijable u `.env.local`). `npm run dev` i dalje radi, ali bez API-ja (rezervni statični način).

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
"name": { "bs": "Trg slobode", "en": "Freedom Square", "de": "Platz der Freiheit" }
```

Ako prijevod nedostaje, prikazuje se bosanski. Polje `_status` kod svake lokacije kaže šta još treba od TZ.

Audio: `"audio": { "bs": "audio/vila.mp3", "en": "audio/vila-en.mp3" }`. Ko ima telefon na njemačkom, a njemački snimak ne postoji, dobije engleski.

## Prvi koraci

1. **Provjeri koordinate** u `data/locations.json`. Sve lokacije su sada provjerene. Za novu lokaciju: u Google Maps desni klik na tačno mjesto → klik na koordinate (kopira ih) → upiši `lat` i `lng` → `"coordsVerified": true`. Za Jezero Modrac ciljati plažu ili parking, ne sredinu jezera.
2. **Upiši tekstove** (sva polja sa `TODO`) i nagradu za pasoš.
3. **Izračunaj rute:** `npm run routes` (traje oko pola minute, treba internet).
4. **Lokalno testiranje:** `npm run dev`, pa otvori `http://localhost:3000/vila`.
5. **Deploy na Vercel** kao statični projekt (bez build komande). U projektu uključi **Analytics**.
6. **QR kodovi:** iz admin dashboarda (sa tajnim kodom za pečat). Stari način `npm run qr -- https://tvoja-domena.ba` pravi QR bez koda (bez pečata). Dobiješ PNG za štampu i SVG za graviranje u folderu `qr/`, sa adresama oblika `https://tvoja-domena.ba/vila`.

## Dodavanje nove lokacije

Od v0.3: u admin dashboardu (`/admin` → Lokacije → + Nova lokacija). Stari način (bez baze): dodaj novi objekat u `locations` u `data/locations.json` (`id` samo mala slova, brojevi i crtica), ponovo pokreni `npm run routes` i `npm run qr`. Nova tačka se automatski pojavljuje na svim ostalim lokacijama i u pasošu.

## Napomene

- Polje `mode`: `"foot"` = pješačka ruta, `"car"` = ruta autom (Jezero Modrac).
- Ako ruta nije dostupna, aplikacija nacrta isprekidanu ravnu liniju i označi udaljenost kao približnu.
- Fotografija „nekad” za Vilu je privremena; zamijeniti arhivskom (Zavod za zaštitu naslijeđa TK).
- Mapa koristi OpenStreetMap pločice. Za veći promet prebaci na servis sa besplatnim kvotama (MapTiler, Stadia) promjenom jedne linije u `app.js`.
- Statistika jezika posjetilaca nije uključena u Vercel Analytics; ako bude potrebna, dodaje se kasnije.
