# Analyse der Original-App „Bild-KI #“ (ArtLens)

Stand: 22.09.2026 · Grundlage: AI-Studio-Export (ZIP) der App, die unter `https://bild-ki-644373179840.us-west1.run.app/` auf Google Cloud Run läuft.

## 1. Steckbrief

| Merkmal | Original |
|---|---|
| Namen | `metadata.json`: „Bild-KI #“ · Seitentitel: „ArtLens“ · Oberfläche: „ArtArchive AI“ |
| Version | `APP_VERSION = "v1.9.5"` |
| Code | eine Datei `index.tsx` mit 1.266 Zeilen (React 19), dazu `index.html`, `vite.config.ts`, `package.json` |
| Styling | Tailwind über `cdn.tailwindcss.com` (Laufzeit-Compiler, laut Tailwind nicht für Produktion gedacht) |
| Bibliotheken | Importmap auf `aistudiocdn.com`: React 19.2, lucide-react, `@google/genai` 1.31 |
| KI | Gemini `gemini-3-flash-preview` – (a) Bildanalyse mit JSON-Schema, (b) Wiki-Artikel in Markdown |
| Speicher | `localStorage["art_archive_projects"]` – alle Projekte **inklusive Bilder als Base64** |
| Hosting | Cloud Run über AI Studio; API-Key per Vite-`define` als `process.env.API_KEY` ins Frontend |

## 2. Funktionsumfang (Ist-Stand)

1. **Projektübersicht** („ArtArchive AI – Digitales Kuratieren & Kunstgeschichtliche Analyse“): Projekte anlegen (per `prompt()`), öffnen. Umbenennen oder Löschen ist nicht möglich.
2. **Galerie**: Mehrfach-Upload, Verkleinerung auf max. 2000 px (JPEG 80 %), Karten im Format 3:4, Sternsymbol bei analysierten Werken.
3. **Detailansicht** (50/50 geteilt):
   - *Bild-Werkbank*: Zoom, Verschieben, Einpassen, Löschen, „Zuschneiden“ des sichtbaren Ausschnitts → als neues Werk oder als Detailbild.
   - *Reiter*: Basisdaten (Datierung, Technik, Maße, Inventar-Nr., Stil-Tags, Element-Cluster, Farben), Beschreibung (+ Provenienz), Formale Analyse (6 Felder), Katalogtext, Details (Detailbilder).
   - *KI-Analyse* mit „Forschungs-Setup“: Fokus-Bereiche (Künstler-Identifikation, Epochen-Einordnung, Komposition, Ikonographie, Technik-Analyse) und freier Hinweis.
4. **Wiki** je Projekt: Ordnerbaum mit Unterordnern, Artikel, Bearbeiten, „Werk verlinken“ (`[[Titel]]`), farbige Links (Werk / Artikel / fehlend), Verknüpfungsvorschläge, **KI-Recherche** (Artikel zu einem Thema).
5. **„Speichern & Synchronisieren“**: Dialog mit Ordner-Sync und JSON-Export/-Import.

### KI-Aufrufe im Original

| Zweck | Prompt (gekürzt) | Ausgabe |
|---|---|---|
| Bildanalyse | „Analysiere dieses Kunstwerk detailliert. Nutze deine Expertise in Kunstgeschichte. … LEG BESONDEREN FOKUS AUF: artist, style, composition …“ + Beispiel-JSON | JSON: Titel, Künstler, Jahr, Beschreibung, Stil-Tags, Element-Cluster, Farben, Technik, Maße, formale Analyse (6 Felder), Kontext |
| Wiki-Recherche | „Erstelle einen Wiki-Artikel für ein Kunstprojekt über: {Thema}. Nutze Markdown. Schreibe auf Deutsch. Gehe tief in kunstgeschichtliche Details ein.“ | Markdown-Text |

## 3. Befunde

| # | Befund | Auswirkung | Schwere |
|---|---|---|---|
| 1 | Der Sicherungsdialog wird ohne `onExport`, `onImport` und `onLinkFolder` aufgerufen – **alle Knöpfe sind Attrappen** | keine Datensicherung, kein Gerätewechsel möglich | hoch |
| 2 | Alles inkl. Bilder im `localStorage` (max. ca. 5 MiB je Herkunft) | nach wenigen Bildern schlägt das Speichern fehl (`QuotaExceededError` im `useEffect`, ohne Meldung) – Änderungen gehen verloren | hoch |
| 3 | Safari löscht per Skript gespeicherte Daten einer Website nach sieben Tagen ohne Nutzung (Tracking-Schutz) | Datenverlust auf iPad/iPhone | hoch |
| 4 | Modell `gemini-3-flash-preview` ist eine Vorschauversion, die Google als abgekündigt führt (empfohlener Nachfolger: `gemini-3.6-flash`) | KI-Funktionen fallen bei Abschaltung aus | hoch |
| 5 | Antwort-Schema: `elementClusters` als `OBJECT` **ohne** `properties` | Gemini lehnt solche Schemas mit „should be non-empty for OBJECT type“ ab – die Analyse kann komplett scheitern | mittel |
| 6 | Wiki-Text wird per `dangerouslySetInnerHTML` eingesetzt | **XSS**: KI-Antworten oder importierte Daten können Skripte ausführen | hoch |
| 7 | Markdown wird nicht gerendert (nur Zeilenumbrüche) | KI-Artikel erscheinen mit `#`, `**` usw. | mittel |
| 8 | `vite.config.ts` schreibt `GEMINI_API_KEY` beim Build ins Frontend | bei Selbst-Hosting ist der Schlüssel für jeden auslesbar | kritisch |
| 9 | Öffentliche Cloud-Run-Adresse ohne Anmeldung | jede Person mit dem Link nutzt die KI auf deine Kosten | hoch |
| 10 | Bild-Werkzeuge erscheinen nur bei Maus-Hover, Detailansicht fest 50/50, keine Zwei-Finger-Geste | auf iPad/iPhone kaum bedienbar | hoch |
| 11 | KI-Ergebnis überschreibt alle Felder, auch mit leeren Werten; asynchrone Updates arbeiten mit veraltetem Stand | Eingaben (z. B. Maße) gehen verloren, parallele Änderungen werden überschrieben | mittel |
| 12 | `contextAnalysis` wird erzeugt, aber nie angezeigt; `location`, `notes`, `miscellaneous` ohne Eingabefeld | bezahlte KI-Ergebnisse unsichtbar | niedrig |
| 13 | Werk löschen ohne Rückfrage; Projekte nicht umbenenn- oder löschbar | versehentlicher Verlust, Datenmüll | mittel |
| 14 | Verknüpfungsvorschläge: Titel ungeprüft als RegExp (Klammern → Absturz), ersetzt auch innerhalb bestehender Links; `sort()` verändert den React-Zustand direkt | Abstürze, doppelte Klammern | mittel |
| 15 | Rote Links auf fehlende Artikel ohne Funktion; Bearbeitungen gehen beim Artikelwechsel verloren | Wiki-Arbeit mühsam | niedrig |
| 16 | `index.html` lädt `/index.css` und `index.js`, die es nicht gibt | 404-Fehler bei jedem Aufruf | niedrig |
| 17 | `prompt()`/`alert()` für Eingaben und Fehler | wirkt provisorisch, auf Mobilgeräten sperrig | niedrig |
| 18 | Drei verschiedene Namen (Bild-KI / ArtLens / ArtArchive AI) | uneinheitlicher Auftritt | niedrig |

## 4. Was der Nachbau ändert

| Befund | Lösung im Nachbau |
|---|---|
| 1 | Export/Import funktionieren (auch mit Original-Daten), Ordner-Sync in Chrome/Edge, Lesezeichen-Skript zum Retten der Altdaten |
| 2, 3 | IndexedDB, nur geänderte Projekte werden geschrieben, Fehlermeldung bei Speicherproblemen, `navigator.storage.persist()`, Sicherungs-Erinnerung, installierbar (PWA) |
| 4 | Umstieg auf **OpenAI** (`gpt-5.6-terra`, per Variable änderbar) mit optionalem Ausweichmodell |
| 5 | striktes JSON-Schema (Structured Outputs), Cluster als Liste `{category, items}`, serverseitige Bereinigung (Hex-Farben, Dubletten, Längen) |
| 6, 7 | `react-markdown` ohne Roh-HTML, GFM-Tabellen, `[[Links]]` als sichere Schaltflächen |
| 8, 9 | Schlüssel nur auf dem Server, Pflicht-Passwort, signierte Cookies, Rate- und Tageslimit, CSP, Herkunftsprüfung |
| 10 | responsives Layout, Werkzeuge immer sichtbar, Zwei-Finger-Zoom, Mausrad-Zoom |
| 11 | Merge-Logik (leere KI-Felder überschreiben nichts), alle Updates funktional; Analyse läuft weiter, auch wenn die Detailansicht geschlossen wird |
| 12 | Kontext, Standort, Notizen, „Weitere Beobachtungen“ sichtbar und exportierbar |
| 13–15 | Bestätigungsdialoge, Projekte umbenennen/löschen, sichere Verlinkung (erstes Vorkommen, Wortgrenzen), rote Links legen Artikel an, Bearbeitungen werden übernommen |
| 16–18 | Build mit Vite und Tailwind 4 (keine CDNs), Dialoge und Hinweise statt `prompt()`/`alert()`, Namen zentral in `src/config.ts` |

Zusätzlich: Prompts mit Sicherheitsmarkern *(gesichert / plausibel / unsicher)* und der Regel „Maße nur bei gesicherter Identifikation“, Einbezug bereits erfasster Angaben, Markdown-Export für Obsidian, Event-Stream gegen Proxy-Timeouts.

## 5. Quellen

- MDN, Storage quotas and eviction criteria (5 MiB `localStorage` je Herkunft; Safari löscht Skript-Daten nach 7 Tagen ohne Interaktion): <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- Google, Gemini API – Deprecations (`gemini-3-flash-preview`, Nachfolger `gemini-3.6-flash`): <https://ai.google.dev/gemini-api/docs/deprecations>
- Fehlerbild „should be non-empty for OBJECT type“ bei leeren OBJECT-Schemas: <https://github.com/browser-use/browser-use/issues/3786>
- OpenAI – Modelle und Preise: <https://developers.openai.com/api/docs/models>
- OpenAI – Structured Outputs: <https://developers.openai.com/api/docs/guides/structured-outputs>
- OpenAI – Bilder als Eingabe: <https://developers.openai.com/api/docs/guides/images-vision>
- Cloudflare – Fehler 524 (Zeitlimit 125 Sekunden ohne Antwort des Servers): <https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524>
