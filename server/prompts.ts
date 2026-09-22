/**
 * Prompts, Antwort-Schema und Nachbearbeitung der KI-Antworten.
 * Inhaltlich folgen die Prompts dem Original (AI-Studio-App „Bild-KI“), sind aber präzisiert:
 * Sicherheitsmarker (gesichert/plausibel/unsicher), keine erfundenen Maße, Einbezug der Nutzerangaben.
 */

export const FOCUS_AREAS = {
  artist: 'Künstler-Identifikation',
  style: 'Epochen-Einordnung',
  composition: 'Komposition',
  iconography: 'Ikonographie',
  technique: 'Technik-Analyse',
} as const;

export type FocusArea = keyof typeof FOCUS_AREAS;

export interface KnownFacts {
  title?: string;
  artist?: string;
  year?: string;
  medium?: string;
  dimensions?: string;
}

const KNOWN_LABELS: Record<keyof KnownFacts, string> = {
  title: 'Titel',
  artist: 'Künstler/Schule',
  year: 'Datierung',
  medium: 'Technik',
  dimensions: 'Maße',
};

export interface FormalAnalysis {
  composition: string;
  lightAndShadow: string;
  perspective: string;
  technique: string;
  visualRhythm: string;
  iconography: string;
}

export interface AnalysisResult {
  title: string;
  artist: string;
  year: string;
  description: string;
  styleTags: string[];
  elementClusters: Record<string, string[]>;
  colors: string[];
  medium: string;
  dimensions: string;
  formalAnalysis: FormalAnalysis;
  contextAnalysis: string;
}

export const ANALYSIS_INSTRUCTIONS =
  'Du bist eine erfahrene Kunsthistorikerin mit Schwerpunkt Bildanalyse und Provenienzforschung. ' +
  'Du arbeitest methodisch (Beschreibung, formale Analyse, ikonographische Deutung, Kontext), ' +
  'trennst Beobachtung von Deutung und gibst Unsicherheiten offen an.';

export const WIKI_INSTRUCTIONS =
  'Du schreibst fundierte, gut gegliederte Wiki-Artikel für ein kunstgeschichtliches Forschungsprojekt. ' +
  'Du erfindest keine Quellen und kennzeichnest unsichere Angaben.';

export function buildAnalysisPrompt(input: { focusAreas: FocusArea[]; hint: string; known: KnownFacts }): string {
  const lines: string[] = [
    'Analysiere dieses Kunstwerk detailliert. Nutze deine Expertise in Kunstgeschichte.',
    'Schreibe alle Texte auf Deutsch, in präziser kunsthistorischer Fachsprache.',
  ];

  const knownLines = (Object.keys(KNOWN_LABELS) as (keyof KnownFacts)[])
    .map((key) => [key, input.known[key]?.trim()] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${KNOWN_LABELS[key]}: ${value}`);
  if (knownLines.length > 0) {
    lines.push(
      '',
      'BEREITS ERFASSTE ANGABEN (können auch Dateinamen oder Platzhalter sein – kritisch prüfen, nicht blind übernehmen):',
      ...knownLines,
    );
  }

  if (input.hint.trim()) {
    lines.push('', `SPEZIFISCHE HINWEISE/WÜNSCHE DES NUTZERS: ${input.hint.trim()}`);
  }

  if (input.focusAreas.length > 0) {
    lines.push('', `LEG BESONDEREN FOKUS AUF: ${input.focusAreas.map((area) => FOCUS_AREAS[area]).join(', ')}.`);
  }

  lines.push(
    '',
    'REGELN:',
    '- Kennzeichne Zuschreibungen, Datierungen und ikonographische Deutungen mit ihrer Sicherheit: (gesichert), (plausibel) oder (unsicher).',
    '- Erfinde keine Fakten. Maße und exakte Jahreszahlen nur angeben, wenn das Werk sicher identifiziert ist – sonst leerer String.',
    '- styleTags: Epoche(n), Stilrichtung(en), ggf. Schule – je 1 bis 4 Wörter.',
    '- elementClusters: 2 bis 5 Kategorien (z. B. „Inhalt/Motivik“, „Technik/Detail“, „Figuren“, „Landschaft“) mit je 2 bis 8 knappen Elementen.',
    '- colors: 3 bis 6 dominante Farben als Hex-Codes im Format #RRGGBB.',
    '- formalAnalysis: jeder Punkt als zusammenhängender Absatz mit 3 bis 6 Sätzen.',
    '- contextAnalysis: historischer und biografischer Kontext, soweit bestimmbar.',
  );

  return lines.join('\n');
}

export function buildWikiPrompt(input: {
  topic: string;
  projectName: string;
  artworkTitles: string[];
  entryTitles: string[];
}): string {
  const lines: string[] = [
    `Erstelle einen Wiki-Artikel für ein Kunstprojekt über: ${input.topic}.`,
    'Nutze Markdown. Schreibe auf Deutsch. Gehe tief in kunstgeschichtliche Details ein.',
    'Gliedere mit Zwischenüberschriften (##, ###). Beginne ohne Überschrift erster Ebene – der Titel wird separat angezeigt.',
  ];
  if (input.projectName) lines.push(`Das Projekt heißt „${input.projectName}“.`);
  if (input.artworkTitles.length > 0) {
    lines.push(
      '',
      'Werke im Projekt – verlinke sie mit [[Titel]] (exakt so geschrieben), wenn sie inhaltlich passen:',
      ...input.artworkTitles.map((title) => `- ${title}`),
    );
  }
  if (input.entryTitles.length > 0) {
    lines.push(
      '',
      'Vorhandene Wiki-Artikel – ebenfalls mit [[Titel]] verlinkbar:',
      ...input.entryTitles.map((title) => `- ${title}`),
    );
  }
  return lines.join('\n');
}

// ---------- JSON-Schema (OpenAI Structured Outputs, strict) ----------

const text = (description: string) => ({ type: 'string', description }) as const;
const stringList = (description: string) => ({ type: 'array', description, items: { type: 'string' } }) as const;

const FORMAL_KEYS: (keyof FormalAnalysis)[] = [
  'composition',
  'lightAndShadow',
  'perspective',
  'technique',
  'visualRhythm',
  'iconography',
];

/**
 * Strict-Modus verlangt: additionalProperties=false und alle Felder in `required`.
 * `elementClusters` ist deshalb eine Liste von {category, items} statt eines freien Objekts
 * (im Original ein leeres OBJECT – das lehnen strikte Schemas ab).
 */
export const analysisJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: text('Vermuteter oder bekannter Titel des Werks'),
    artist: text('Vermuteter Künstler, Werkstatt oder Schule, mit Sicherheitsmarker'),
    year: text('Entstehungsjahr oder Datierung, z. B. „um 1650 (plausibel)“'),
    medium: text('Technik und Material, z. B. „Öl auf Leinwand“'),
    dimensions: text('Maße – nur wenn gesichert, sonst leerer String'),
    styleTags: stringList('Epoche, Stilrichtung, Schule'),
    description: text('Präzise kunstgeschichtliche Beschreibung'),
    elementClusters: {
      type: 'array',
      description: 'Bildelemente, nach Kategorien gruppiert',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: text('Kategorie, z. B. „Inhalt/Motivik“'),
          items: stringList('Elemente dieser Kategorie'),
        },
        required: ['category', 'items'],
      },
    },
    colors: stringList('Dominante Farben als Hex-Codes #RRGGBB'),
    formalAnalysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        composition: text('Detaillierte Analyse des Bildaufbaus'),
        lightAndShadow: text('Lichtführung und Modellierung'),
        perspective: text('Raumkonstruktion und Perspektive'),
        technique: text('Farbauftrag und Duktus'),
        visualRhythm: text('Visuelle Dynamik und Taktung'),
        iconography: text('Ikonographische Deutung mit Sicherheitsmarkern'),
      },
      required: FORMAL_KEYS,
    },
    contextAnalysis: text('Historischer und biografischer Kontext'),
  },
  required: [
    'title',
    'artist',
    'year',
    'medium',
    'dimensions',
    'styleTags',
    'description',
    'elementClusters',
    'colors',
    'formalAnalysis',
    'contextAnalysis',
  ],
};

// ---------- Nachbearbeitung ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max = 20_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanList(value: unknown, maxItems = 20, maxLength = 80): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().slice(0, maxLength);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeHexColor(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('');
  return `#${hex}`;
}

function cleanClusters(value: unknown): Record<string, string[]> {
  const clusters: Record<string, string[]> = {};
  const add = (category: unknown, items: unknown) => {
    const name = cleanText(category, 60);
    const list = cleanList(items, 12, 80);
    if (!name || list.length === 0) return;
    clusters[name] = cleanList([...(clusters[name] ?? []), ...list], 12, 80);
  };
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 8)) {
      if (isRecord(entry)) add(entry.category, entry.items);
    }
  } else if (isRecord(value)) {
    for (const [category, items] of Object.entries(value).slice(0, 8)) add(category, items);
  }
  return clusters;
}

export function sanitizeAnalysis(raw: unknown): AnalysisResult {
  const data = isRecord(raw) ? raw : {};
  const formal = isRecord(data.formalAnalysis) ? data.formalAnalysis : {};
  const colors = cleanList(data.colors, 8, 16)
    .map(normalizeHexColor)
    .filter((color): color is string => color !== null);

  return {
    title: cleanText(data.title, 300),
    artist: cleanText(data.artist, 300),
    year: cleanText(data.year, 120),
    description: cleanText(data.description),
    styleTags: cleanList(data.styleTags, 12, 60),
    elementClusters: cleanClusters(data.elementClusters),
    colors: Array.from(new Set(colors)),
    medium: cleanText(data.medium, 300),
    dimensions: cleanText(data.dimensions, 200),
    formalAnalysis: {
      composition: cleanText(formal.composition),
      lightAndShadow: cleanText(formal.lightAndShadow),
      perspective: cleanText(formal.perspective),
      technique: cleanText(formal.technique),
      visualRhythm: cleanText(formal.visualRhythm),
      iconography: cleanText(formal.iconography),
    },
    contextAnalysis: cleanText(data.contextAnalysis),
  };
}

/** Parst JSON aus der Modellantwort – toleriert Code-Fences und Vor-/Nachtext. */
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('Antwort ist kein gültiges JSON.');
  }
}

/** Entfernt eine führende H1-Überschrift (der Artikeltitel wird separat angezeigt). */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]*\n+/, '').trim();
}
