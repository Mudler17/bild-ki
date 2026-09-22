import type { AnalyzeInput, WikiInput } from './ai.js';
import { FOCUS_AREAS, type FocusArea, type KnownFacts } from './prompts.js';

/** Eingabeprüfung für die API – alles, was vom Browser kommt, gilt als unsicher. */

export class ValidationError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, max: number, label: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label} muss Text sein.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label} ist zu lang (max. ${max} Zeichen).`);
  return trimmed;
}

function titleList(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label} muss eine Liste sein.`);
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 200))
        .filter(Boolean),
    ),
  ).slice(0, 100);
}

export function parseImageDataUrl(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    throw new ValidationError('Es wurde kein Bild übermittelt.');
  }
  const comma = value.indexOf(',');
  const header = value.slice(5, comma); // z. B. "image/jpeg;base64"
  const [mimeType, encoding] = header.split(';');
  if (comma < 0 || encoding !== 'base64' || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new ValidationError('Bildformat nicht unterstützt (erlaubt: JPEG, PNG, WebP, GIF).');
  }
  const payload = value.slice(comma + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes <= 0 || !BASE64_RE.test(payload)) throw new ValidationError('Die Bilddaten sind beschädigt.');
  if (bytes > maxBytes) {
    throw new ValidationError(`Das Bild ist zu groß (max. ${Math.round(maxBytes / 1024 / 1024)} MB).`, 413);
  }
  return `data:${mimeType};base64,${payload}`;
}

export function parseAnalyzeRequest(body: unknown, maxImageBytes: number): AnalyzeInput {
  if (!isRecord(body)) throw new ValidationError('Ungültige Anfrage.');

  const focusAreas: FocusArea[] = Array.isArray(body.focusAreas)
    ? Array.from(
        new Set(
          body.focusAreas.filter(
            (area): area is FocusArea => typeof area === 'string' && Object.hasOwn(FOCUS_AREAS, area),
          ),
        ),
      )
    : [];

  const knownRaw = isRecord(body.known) ? body.known : {};
  const known: KnownFacts = {
    title: optionalText(knownRaw.title, 300, 'Titel'),
    artist: optionalText(knownRaw.artist, 300, 'Künstler'),
    year: optionalText(knownRaw.year, 120, 'Datierung'),
    medium: optionalText(knownRaw.medium, 300, 'Technik'),
    dimensions: optionalText(knownRaw.dimensions, 200, 'Maße'),
  };
  if (known.artist?.toLowerCase() === 'unbekannt') known.artist = '';

  return {
    imageDataUrl: parseImageDataUrl(body.image, maxImageBytes),
    focusAreas,
    hint: optionalText(body.hint, 2000, 'Hinweis'),
    known,
  };
}

export function parseWikiRequest(body: unknown): WikiInput {
  if (!isRecord(body)) throw new ValidationError('Ungültige Anfrage.');
  const topic = optionalText(body.topic, 200, 'Thema');
  if (!topic) throw new ValidationError('Bitte ein Thema angeben.');
  return {
    topic,
    projectName: optionalText(body.projectName, 200, 'Projektname'),
    artworkTitles: titleList(body.artworkTitles, 'Werktitel'),
    entryTitles: titleList(body.entryTitles, 'Artikeltitel'),
  };
}
