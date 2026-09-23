# ArtArchive AI („Bild-KI“)

Digitales Kuratieren und kunstgeschichtliche Bildanalyse – ein Nachbau der Google-AI-Studio-App **„Bild-KI #“** (Seitentitel „ArtLens“, v1.9.5), neu aufgebaut als sichere, selbst gehostete Web-App:

- **Passwortgeschützt** – ohne `APP_ACCESS_PASSWORD` startet der Server gar nicht.
- **OpenAI-Schlüssel nur auf dem Server** – der Browser spricht ausschließlich mit dem eigenen Express-Server.
- **Persönliches Archiv auf deinen Geräten** – Projekte, Bilder und Wiki-Texte liegen geschützt auf dem eigenen Server. IndexedDB hält eine lokale Kopie und noch nicht übertragene Änderungen. Dasselbe Passwort öffnet auf allen Geräten dieselbe Sammlung.

Die ausführliche Analyse des Originals mit allen Befunden steht in [`docs/ANALYSE.md`](docs/ANALYSE.md).

---

## Funktionen

| Bereich | Was die App kann |
|---|---|
| Geräteabgleich | Automatischer Abgleich pro Projekt; Versionsprüfung, Konfliktkopien und sichtbarer Speicherstatus |
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

Der Browser hält Projekte und die zuletzt bestätigten Serverversionen gemeinsam in IndexedDB. Der passwortgeschützte Express-Server speichert jedes Projekt mit Bildern und Wiki als atomar ersetzte JSON-Datei unter `DATA_DIR/projects`. Eine kleine Projektliste liefert die Versionsstände; nur neue oder geänderte Projekte werden heruntergeladen. Änderungen übertragen jeweils das betroffene vollständige Projekt, nicht das ganze Archiv. KI-Anfragen laufen weiterhin über den Express-Server zu OpenAI.

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
   DATA_DIR=/app/data
   ```

6. **Vor dem ersten Deployment: Configuration → Persistent Storage → Add → Volume Mount.** Name `bild-ki-data`, Source Path leer lassen, Destination Path `/app/data`. Ohne dieses Volume liegen Daten nur im austauschbaren Container. Ein eigenes vorhandenes Daten-Volume nicht löschen oder ersetzen. Das Image läuft als `node` (UID/GID 1000); bei einem Bind Mount muss das Ziel für diesen Benutzer schreibbar sein.
7. **Configuration → Advanced: Consistent Container Names aktivieren.** Dadurch stoppt Coolify die bisherige Instanz vor dem Start der neuen. Dieser persönliche Dateispeicher unterstützt keine gleichzeitig schreibenden Serverinstanzen.
8. **Health Check:** Pfad `/healthz` (das Image hat zusätzlich einen eigenen Docker-Healthcheck).
9. **Cloudflare-DNS:** A-Record `bild-ki` auf die Server-IP zuerst **grau (DNS only)**, bis Traefik das Let's-Encrypt-Zertifikat hat – dann auf **orange (Proxied)** umstellen. SSL-Modus **Full (strict)**. Sonst drohen Fehler 526 bzw. Weiterleitungsschleifen.

`TRUST_PROXY=2` sorgt dafür, dass hinter Cloudflare + Traefik die echte Besucher-IP für Rate-Limits und das `Secure`-Cookie erkannt wird.

**Tipp für die Kosten:** Im OpenAI-Dashboard ein eigenes Projekt mit eigenem Schlüssel für diese App anlegen und dort Budget-Benachrichtigungen bzw. Limits setzen – zusätzlich zum `AI_DAILY_LIMIT` des Servers.

## Vorhandene Installation auf Gerätezugriff umstellen

1. Auf jedem bisher verwendeten Gerät vor dem Update **Export (JSON)** ausführen und die Datei aufbewahren. Alte Tabs anschließend schließen; keine alte App-Version parallel weiterbearbeiten.
2. In Coolify das oben beschriebene Volume, `DATA_DIR=/app/data` und **Consistent Container Names** einrichten, **bevor** die neue Version erstmals bereitgestellt wird. Passwort, Session-Schlüssel und OpenAI-Schlüssel bleiben unverändert.
3. Neue Version deployen. Auf dem Gerät mit dem bisherigen Bestand dieselbe App-Adresse öffnen und anmelden. Bestehende lokale Projekte werden automatisch übernommen. Bereits identische Projekte werden nicht dupliziert; abweichende Fassungen mit gleicher ID bleiben als Konfliktkopien erhalten.
4. Warten, bis oben **„Auf dem Server gespeichert“** erscheint. Auf dem zweiten Gerät dieselbe Adresse öffnen und dasselbe Passwort verwenden. Dort erscheinen auch Bilder, Detailbilder, Analysen und Wiki.
5. Ein Testprojekt anlegen, erneut deployen und prüfen, dass es noch vorhanden ist. Erst dann produktiv weiterarbeiten. Persistentes Volume separat sichern; Synchronisation ersetzt keine Sicherung.

Offizielle Coolify-Anleitungen: https://coolify.io/docs/core/persistent-storage/storage-mounts/volume-mounts und https://coolify.io/docs/applications/deployments/rolling-updates

## Verhalten und Grenzen des Geräteabgleichs

- Ein persönliches Archiv, keine Benutzerverwaltung. Wer das Passwort kennt, hat Zugriff auf alle Projekte.
- Änderungen werden zunächst lokal gesichert und nach kurzer Pause hochgeladen. Der Abgleich prüft außerdem alle 20 Sekunden bei sichtbarer App und beim Zurückkehren zum Fenster. **Jetzt abgleichen** aktualisiert sofort.
- Offline weiterarbeiten ist möglich, wenn auf diesem Gerät schon eine Anmeldung und lokale Daten vorhanden sind. Vor dem Gerätewechsel auf die Serverbestätigung warten. Nach der nächsten Verbindung werden lokale Änderungen übertragen.
- Ändern zwei Geräte dasselbe Projekt, bleibt die Serverfassung bestehen und die lokale Fassung erhält eine eigene ID mit dem Namenszusatz **(Konfliktkopie)**. Es findet keine automatische Zusammenführung einzelner Textfelder statt. Danach die Fassungen vergleichen und die überflüssige Kopie gezielt löschen.
- Eine zwischenzeitliche Änderung schützt vor einer veralteten Löschung. Ein auf dem Server gelöschtes, lokal bearbeitetes Projekt bleibt als neue Konfliktkopie erhalten.
- Ein anderes/leeres Daten-Volume hat eine andere Archivkennung: bekannte Geräte stoppen den Abgleich, statt lokale Projekte zu löschen. Das bisherige Volume wieder einbinden. Bei einer vollständigen Wiederherstellung auch die Datei `projects/.archive-id` übernehmen.
- Pro Browserprofil ist bei verfügbarer Web Locks API nur ein Archiv-Tab gleichzeitig aktiv. Weitere Tabs warten auf das Schließen des ersten. Verschiedene Geräte können gleichzeitig arbeiten.
- **Genau eine laufende Serverinstanz/Replica pro Daten-Volume.** Keine parallelen Deployments mit gemeinsamem schreibbarem Volume; vorhandene Instanz vor dem Start der neuen stoppen. Der Dateispeicher ist für das persönliche Archiv vorgesehen, nicht für einen Cluster.
- Eine Projektanfrage darf standardmäßig bis zu 64 MiB groß sein (inklusive eingebetteter Bilder). Bei sehr großen Sammlungen mehrere Projekte verwenden; übergroße Änderungen bleiben lokal und werden als Fehler angezeigt. Proxy-Limits müssen ebenfalls passen.
- Der Speicherstatus bestätigt den Serverstand des letzten erfolgreichen Abgleichs; Änderungen anderer Geräte werden beim nächsten Abgleich sichtbar.

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `DATA_DIR` | lokal `./data`; im Docker-Image `/app/data` | Persistenter Projektordner; außerhalb des Images in Produktion ausdrücklich setzen |
| `MAX_PROJECT_MB` | `64` | Maximale Größe einer Projektanfrage inklusive Bilder (MiB) |
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

Der Serverbestand benötigt ein Backup des vollständigen Daten-Volumes. Für einen konsistenten dateibasierten Snapshot die App kurz stoppen; alternativ über die App einen JSON-Export erstellen.

- Regelmäßig **Export (JSON)** verwenden und die Datei außerhalb des Servers aufbewahren. Der Export enthält den aktuellen lokalen Bestand; vor einem vollständigen Serverbackup zuerst erfolgreich abgleichen.
- Am Desktop kann **Ordner verknüpfen** zusätzlich automatisch `ArtArchive-Backup.json` schreiben. Das ist eine einseitige Sicherung, kein zweiter Synchronisationsweg. Pro Gerät einen eigenen Sicherungsordner verwenden.
- Browserdaten bleiben für noch nicht hochgeladene Offline-Änderungen wichtig. Bei Speicherfehlern direkt JSON exportieren; Browserdaten erst nach erfolgreichem Abgleich/Sicherung löschen.
- **Import (JSON)** ersetzt nach Bestätigung Projekte mit gleicher ID vollständig; diese bewusste Ersetzung wird anschließend ebenfalls auf den Server übertragen.

## Tests

```bash
npm run build
npm test
```

- `tests/projects.test.mjs` – Übernahme alter Daten, Gerätewechsel, Offline-Neustart, Konflikte, Löschungen, verlorene Antworten, parallele Bearbeitung, Speicherfehler, Server-Neustart und Archivkennung
- `tests/api.test.mjs` – Start ohne Passwort, Login, Cookies, CSRF, Eingabeprüfung, Rate-Limit, Stream-Antworten (Demo-Modus)
- `tests/openai-contract.test.mjs` – prüft gegen einen lokalen OpenAI-Mock das Anfrageformat (Responses API, striktes JSON-Schema, Bild als Data-URL, `store: false`), Ablehnungen, abgeschnittene Antworten, falschen Key, leeres Guthaben, Abbruch, Ausweichmodell und Tageslimit

## Kosten und Datenschutz

- Standardmodell `gpt-5.6-terra`: laut OpenAI 2 $ je 1 Mio. Eingabe-Token und 12 $ je 1 Mio. Ausgabe-Token (Stand 09/2026). Eine Bildanalyse liegt grob im Bereich weniger Cent; Wiki-Artikel sind günstiger. Günstiger geht es mit `gpt-5.6-luna`, gründlicher mit `gpt-5.6-sol`.
- Bilder und Texte werden zur Analyse an OpenAI (USA) übertragen. Für private Kunstfotos unkritisch – sobald personenbezogene Daten oder dienstliche Inhalte im Spiel sind, vorher Auftragsverarbeitung/Datenschutz klären.

## Projektstruktur

```
server/            Express-Server (TypeScript)
  index.ts         App, Sicherheits-Header, Routen, Event-Stream, Auslieferung
  projects.ts      Persistenter persönlicher Projektspeicher mit Versionsprüfung
  auth.ts          Passwort, signierte Sitzungs-Cookies
  ai.ts            OpenAI-Aufrufe, Fehlerübersetzung, Tageslimit, Demo-Modus
  prompts.ts       Prompts, JSON-Schema, Bereinigung der Antworten
  validate.ts      Eingabeprüfung
  config.ts        Umgebungsvariablen
src/               React-Frontend
  App.tsx          Sitzung, Projekte, Speichern, Analyse, Import/Export
  components/      Galerie, Detailansicht, Werkbank, Wiki, Dialoge …
  lib/             IndexedDB, Geräteabgleich, Backup, Bildverarbeitung, Wiki-Links, API
public/            Icons, Manifest, Service Worker
tests/             API- und OpenAI-Vertragstests
docs/ANALYSE.md    Analyse des Originals und Änderungsliste
Dockerfile         Produktions-Image für Coolify
```


## Recherche, Bildvergleich und Arbeitsnotizen (2.2.0)

Die Navigation enthält **Sammlung**, **Suche**, **Bildvergleich** und **Notizen & Aufgaben**.

- Die Suche berücksichtigt mehrere Suchwörter gemeinsam und durchsucht Werkdaten, Beschreibungen, Analysen, Projekte, Wiki und neue Notizen. Projekt und Trefferart sind filterbar; Künstler, Epoche/Stil und Schlagwörter filtern die vorhandenen Bildangaben. Keine automatische Ergänzung fehlender Metadaten. Maximal 150 Treffer werden angezeigt; mit Filtern eingrenzen. Wiki-Treffer öffnen den Artikel, Bildtreffer nach Möglichkeit den passenden Reiter.
- Zwei Bilder lassen sich projektübergreifend gegenüberstellen, auch auf dem Smartphone nebeneinander. Die Vergleichstabelle zeigt vorhandene Angaben zu Motiv, Komposition, Farbe, Licht und Technik. Eigene Vergleichsnotizen lassen sich unmittelbar anlegen und in Aufgaben umwandeln.
- **KI-Vergleich starten** sendet ausdrücklich beide Bilder an das bereits konfigurierte Bildmodell. Der Endpunkt `/api/compare` nutzt dieselbe Anmeldung, Herkunftsprüfung, KI-Raten-/Tageslimits, Abbruchbehandlung und `store: false` wie die Bildanalyse. Das Ergebnis wird als gekennzeichnete KI-Notiz mit Modellangabe und Bildverweisen gespeichert. Die technische Eingabe folgt der [offiziellen Dokumentation zu mehreren Bildeingaben](https://developers.openai.com/api/docs/guides/images-vision). Tests verwenden lokale Mocks, keine kostenpflichtigen KI-Aufrufe.
- Notizen haben die Form **Vorläufige Notiz**, **Notiz** oder **Aufgabe**. Aufgaben können eine Fälligkeit und einen Erledigt-Status erhalten; es gibt keine Benachrichtigungen. Änderungen werden automatisch gespeichert. Die Zuordnung zu App, Projekt und Bild kann geändert werden; beim Wechsel des Projekts wird der bisherige einzelne Bildbezug entfernt. Bildverweise in Vergleichen bleiben erhalten und kennzeichnen gelöschte Quellen.
- Appweite Notizen und Vergleiche liegen intern in einem separaten Projekt-Datensatz (`kind: notebook`), der nicht als Bildprojekt angezeigt wird. Auch dessen Konfliktkopien sind im Notizbereich zugänglich. Projektbezogene Notizen liegen im jeweiligen Projekt. Alle Einträge nutzen den bestehenden Geräteabgleich und sind im vollständigen JSON-Backup enthalten. Beim Löschen eines Projekts werden auch seine Notizen gelöscht; vorher exportieren.

Für das Update sind keine neuen Umgebungsvariablen oder Volumes nötig. Vor dem Update eine vollständige Sicherung erstellen; anschließend alte App-Tabs auf allen Geräten schließen und die App neu öffnen. Backups mit den neuen Notizfeldern nur in Version 2.2.0 oder neuer importieren (ältere Importer kennen diese Felder nicht). KI-Auswertungen bleiben prüfbedürftig; manuelle Notizen werden nicht automatisch an den KI-Dienst gesendet.
