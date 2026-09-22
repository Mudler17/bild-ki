# ArtArchive AI („Bild-KI“)

Digitales Kuratieren und kunstgeschichtliche Bildanalyse – ein Nachbau der Google-AI-Studio-App **„Bild-KI #“** (Seitentitel „ArtLens“, v1.9.5), neu aufgebaut als sichere, selbst gehostete Web-App:

- **Passwortgeschützt** – ohne `APP_ACCESS_PASSWORD` startet der Server gar nicht.
- **OpenAI-Schlüssel nur auf dem Server** – der Browser spricht ausschließlich mit dem eigenen Express-Server.
- **Sammlung bleibt lokal** – Projekte, Bilder und Texte liegen in der IndexedDB des Geräts; Sicherung per JSON-Export oder Ordner-Sync.

Die ausführliche Analyse des Originals mit allen Befunden steht in [`docs/ANALYSE.md`](docs/ANALYSE.md).

---

## Funktionen

| Bereich | Was die App kann |
|---|---|
| Projekte | Anlegen, umbenennen, löschen; Übersicht mit Anzahl der Werke und Wiki-Artikel |
| Galerie | Mehrfach-Upload und Drag & Drop, Bilder werden im Browser auf max. 2000 px verkleinert |
| Bild-Werkbank | Zoom (Knöpfe, Mausrad, Zwei-Finger-Geste), Verschieben, Einpassen, **Ausschnitt** als neues Werk oder als Detailansicht |
| Werkdaten | Titel, Künstler, Datierung, Technik, Maße, Inventar-Nr., Standort, Stil-Tags, Element-Cluster, dominante Farben, Beschreibung, Kontext, Provenienz, Notizen, Formale Analyse (7 Felder), Katalogtext, Detailbilder |
| KI-Analyse | „Forschungs-Setup“ mit Fokus-Bereichen und eigenen Hinweisen → strukturierte Analyse (Structured Outputs) mit Sicherheitsmarkern *(gesichert / plausibel / unsicher)* |
| Wiki | Ordnerbaum, Markdown, `[[Verlinkungen]]` zu Werken und Artikeln, Verknüpfungsvorschläge, **KI-Recherche** für neue Artikel |
| Sichern | JSON-Export/-Import (kompatibel zum Original), Ordner-Sync (Chrome/Edge am Desktop), Markdown-Export pro Werk (Obsidian, mit YAML-Frontmatter) |
| Mobil & offline | Für iPad/iPhone optimiert, als App auf den Home-Bildschirm legbar; die Sammlung funktioniert auch offline (KI nicht) |

## Sicherheit auf einen Blick

| Schutz | Umsetzung |
|---|---|
| Zugang | Pflicht-Passwort, Sitzung als HMAC-signiertes Cookie (`HttpOnly`, `SameSite=Strict`, `Secure` hinter HTTPS); Passwort ändern = alle Sitzungen ungültig |
| Brute Force | max. 10 Fehlversuche pro IP in 15 Minuten, jede Fehleingabe verzögert |
| API-Schlüssel | nur als Umgebungsvariable auf dem Server, nie im Browser-Bundle (per Test geprüft) |
| Kosten | Rate-Limit pro IP (`AI_RATE_LIMIT`), Tageslimit gesamt (`AI_DAILY_LIMIT`), Abbruch im Browser bricht auch die OpenAI-Anfrage ab |
| Browser | strenge Content-Security-Policy (nur eigene Skripte), kein Roh-HTML im Wiki (XSS-Schutz), Import akzeptiert nur eingebettete Bilder |
| Anfragen | Herkunftsprüfung gegen fremde Seiten (CSRF), Größen- und Formatprüfung für Bilder, Eingabelängen begrenzt |
| Datenschutz | `store: false` bei OpenAI (keine Speicherung der Antworten dort), keine Tracker, `noindex` für Suchmaschinen |

## Architektur

```
Browser (React)                        Server (Express, Node 22)                 OpenAI
┌──────────────────────────┐  HTTPS   ┌───────────────────────────────┐  HTTPS  ┌──────────────┐
│ Galerie, Werkbank, Wiki  │ ───────▶ │ Passwort · Rate-/Tageslimit   │ ──────▶ │ Responses API│
│ Daten: IndexedDB (lokal) │ ◀─────── │ Prompts · Schema · Bereinigung│ ◀────── │ gpt-5.6-terra│
└──────────────────────────┘  Stream  │ OPENAI_API_KEY (nur hier)     │         └──────────────┘
                                      └───────────────────────────────┘
```

Lange KI-Antworten kommen als Event-Stream mit Ping alle 10 Sekunden. So greift das Zeitlimit von Cloudflare nicht (Fehler 524, wenn der Server 125 Sekunden lang nichts sendet), auch wenn das Modell länger „nachdenkt“.

## Schnellstart (lokal)

Voraussetzung: Node.js ab 22.12.

```bash
cp .env.example .env      # Passwort, SESSION_SECRET und OPENAI_API_KEY eintragen
npm install
npm run dev               # http://localhost:3000
```

Ohne API-Key ausprobieren: in `.env` `AI_MOCK=1` setzen – dann liefert der Server Demo-Antworten.

Produktions-Build lokal:

```bash
npm run build
NODE_ENV=production npm start
```

## Deployment mit Coolify (Hetzner · Traefik · Cloudflare)

1. **Repository** in Coolify als neue Ressource hinzufügen (GitHub App → `Mudler17/bild-ki`, Branch `main`).
2. **Build Pack: `Dockerfile`** – wichtig, Coolify steht sonst auf Nixpacks.
3. **Ports Exposes:** `3000`.
4. **Domain:** z. B. `https://bild-ki.ki-kernel.de`.
5. **Environment Variables** (Haken bei „Build Variable“ *nicht* setzen):

   ```
   APP_ACCESS_PASSWORD=<langes Passwort>
   SESSION_SECRET=<openssl rand -hex 32>
   OPENAI_API_KEY=sk-...
   TRUST_PROXY=2
   APP_ALLOWED_ORIGINS=https://bild-ki.ki-kernel.de
   ```

6. **Health Check:** Pfad `/healthz` (das Image hat zusätzlich einen eigenen Docker-Healthcheck).
7. **Cloudflare-DNS:** A-Record `bild-ki` auf die Server-IP zuerst **grau (DNS only)**, bis Traefik das Let's-Encrypt-Zertifikat hat – dann auf **orange (Proxied)** umstellen. SSL-Modus **Full (strict)**. Sonst drohen Fehler 526 bzw. Weiterleitungsschleifen.

`TRUST_PROXY=2` sorgt dafür, dass hinter Cloudflare + Traefik die echte Besucher-IP für Rate-Limits und das `Secure`-Cookie erkannt wird.

**Tipp für die Kosten:** Im OpenAI-Dashboard ein eigenes Projekt mit eigenem Schlüssel für diese App anlegen und dort Budget-Benachrichtigungen bzw. Limits setzen – zusätzlich zum `AI_DAILY_LIMIT` des Servers.

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `APP_ACCESS_PASSWORD` | – (Pflicht) | Passwort für den Zugang; ohne Wert startet der Server nicht |
| `SESSION_SECRET` | zufällig | Schlüssel für die Sitzungs-Cookies; ohne festen Wert verfallen Anmeldungen bei jedem Neustart |
| `OPENAI_API_KEY` | – | OpenAI-Schlüssel; ohne Wert sind KI-Funktionen aus |
| `OPENAI_MODEL` | `gpt-5.6-terra` | Modell für Analyse und Wiki |
| `OPENAI_WIKI_MODEL` | = `OPENAI_MODEL` | eigenes Modell nur für Wiki-Artikel, z. B. `gpt-5.6-luna` |
| `OPENAI_FALLBACK_MODEL` | – | Ausweichmodell, falls das Hauptmodell nicht (mehr) existiert |
| `OPENAI_REASONING_EFFORT` | Modell-Standard | `none` … `max` (modellabhängig) |
| `OPENAI_IMAGE_DETAIL` | `high` | `low`, `high`, `auto`, `original` |
| `OPENAI_MAX_OUTPUT_TOKENS` | `25000` | Obergrenze inkl. Denk-Token (OpenAI empfiehlt ≥ 25 000) |
| `AI_TIMEOUT_MS` | `180000` | Zeitlimit je KI-Anfrage |
| `AI_RATE_LIMIT` | `30` | KI-Anfragen je IP in 15 Minuten |
| `AI_DAILY_LIMIT` | `200` | KI-Anfragen pro Tag gesamt (`0` = unbegrenzt) |
| `MAX_IMAGE_MB` | `8` | maximale Bildgröße für die Analyse |
| `SESSION_DAYS` | `30` | Gültigkeit einer Anmeldung |
| `APP_ALLOWED_ORIGINS` | eigene Domain | erlaubte Herkunft für POST-Anfragen, kommagetrennt |
| `TRUST_PROXY` | – | Anzahl vertrauenswürdiger Proxys (Cloudflare + Traefik = `2`) |
| `AI_MOCK` | – | `1` = Demo-Antworten ohne echte KI |
| `OPENAI_BASE_URL` | OpenAI | abweichender API-Endpunkt (z. B. Proxy; wird von den Tests für den Mock genutzt) |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Server-Adresse |

## Daten aus der alten AI-Studio-App übernehmen

Das Original speicherte alles im `localStorage` seiner Cloud-Run-Adresse und hatte keinen funktionierenden Export. So kommen die Daten trotzdem heraus – auch am iPad:

1. Ein beliebiges Lesezeichen anlegen und als Adresse diesen Code einsetzen (in der App unter *Einstellungen → „Daten aus der alten AI-Studio-Version übernehmen“* gibt es dafür einen Kopier-Knopf):

   ```text
   javascript:(()=>{const d=localStorage.getItem('art_archive_projects');if(!d){alert('Keine ArtArchive-Daten auf dieser Seite gefunden.');return;}const b=new Blob([d],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ArtArchive-Altdaten.json';document.body.appendChild(a);a.click();a.remove();})();
   ```

2. Die alte App (`https://bild-ki-…run.app`) im **selben Browser auf demselben Gerät** öffnen, auf dem gearbeitet wurde, und das Lesezeichen antippen – die Datei `ArtArchive-Altdaten.json` wird geladen.
3. In der neuen App *Einstellungen → Import (JSON)* wählen.

Werke mit externen Bildadressen werden beim Import aus Sicherheitsgründen übersprungen (die App zeigt die Anzahl an).

## Sichern – bitte regelmäßig

Browser dürfen lokale Daten löschen; Safari tut das z. B. nach sieben Tagen ohne Nutzung, wenn der Tracking-Schutz aktiv ist. Deshalb:

- Regelmäßig **Export (JSON)** und die Datei in iCloud/„Dateien“ ablegen (die App erinnert nach 14 Tagen).
- Am iPad die App über *Teilen → Zum Home-Bildschirm* installieren.
- Am Desktop (Chrome/Edge) **Ordner verknüpfen** – dann schreibt die App nach jeder Änderung automatisch `ArtArchive-Backup.json`.

## Tests

```bash
npm run build
npm test
```

- `tests/api.test.mjs` – Start ohne Passwort, Login, Cookies, CSRF, Eingabeprüfung, Rate-Limit, Stream-Antworten (Demo-Modus)
- `tests/openai-contract.test.mjs` – prüft gegen einen lokalen OpenAI-Mock das Anfrageformat (Responses API, striktes JSON-Schema, Bild als Data-URL, `store: false`), Ablehnungen, abgeschnittene Antworten, falschen Key, leeres Guthaben, Abbruch, Ausweichmodell und Tageslimit

## Kosten und Datenschutz

- Standardmodell `gpt-5.6-terra`: laut OpenAI 2 $ je 1 Mio. Eingabe-Token und 12 $ je 1 Mio. Ausgabe-Token (Stand 09/2026). Eine Bildanalyse liegt grob im Bereich weniger Cent; Wiki-Artikel sind günstiger. Günstiger geht es mit `gpt-5.6-luna`, gründlicher mit `gpt-5.6-sol`.
- Bilder und Texte werden zur Analyse an OpenAI (USA) übertragen. Für private Kunstfotos unkritisch – sobald personenbezogene Daten oder dienstliche Inhalte im Spiel sind, vorher Auftragsverarbeitung/Datenschutz klären.

## Projektstruktur

```
server/            Express-Server (TypeScript)
  index.ts         App, Sicherheits-Header, Routen, Event-Stream, Auslieferung
  auth.ts          Passwort, signierte Sitzungs-Cookies
  ai.ts            OpenAI-Aufrufe, Fehlerübersetzung, Tageslimit, Demo-Modus
  prompts.ts       Prompts, JSON-Schema, Bereinigung der Antworten
  validate.ts      Eingabeprüfung
  config.ts        Umgebungsvariablen
src/               React-Frontend
  App.tsx          Sitzung, Projekte, Speichern, Analyse, Import/Export
  components/      Galerie, Detailansicht, Werkbank, Wiki, Dialoge …
  lib/             IndexedDB, Backup, Bildverarbeitung, Wiki-Links, API
public/            Icons, Manifest, Service Worker
tests/             API- und OpenAI-Vertragstests
docs/ANALYSE.md    Analyse des Originals und Änderungsliste
Dockerfile         Produktions-Image für Coolify
```
