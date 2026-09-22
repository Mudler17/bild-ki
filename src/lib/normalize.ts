import type { Artwork, DetailView, FormalAnalysis, Project, WikiEntry, WikiFolder } from '../types';
import { generateId, isRecord } from './util';

/**
 * Macht importierte oder alte Daten robust: fehlende Felder werden ergänzt, falsche Typen verworfen.
 * Bilder werden nur als eingebettete Data-URLs akzeptiert (keine externen Adressen).
 */

const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp|gif);base64,/;

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const timestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function clusters(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const result: Record<string, string[]> = {};
  for (const [category, items] of Object.entries(value)) result[category] = textList(items);
  return result;
}

function formalAnalysis(value: unknown): FormalAnalysis | undefined {
  if (!isRecord(value)) return undefined;
  const keys: (keyof FormalAnalysis)[] = [
    'composition',
    'lightAndShadow',
    'perspective',
    'technique',
    'visualRhythm',
    'iconography',
    'miscellaneous',
  ];
  const result: FormalAnalysis = {};
  for (const key of keys) if (typeof value[key] === 'string') result[key] = value[key] as string;
  return result;
}

function detailView(value: unknown): DetailView | null {
  if (!isRecord(value) || typeof value.imageUrl !== 'string' || !IMAGE_DATA_URL.test(value.imageUrl)) return null;
  return {
    id: text(value.id) || generateId(),
    imageUrl: value.imageUrl,
    title: text(value.title, 'Detail'),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
  };
}

export function normalizeArtwork(value: unknown): Artwork | null {
  if (!isRecord(value) || typeof value.imageUrl !== 'string' || !IMAGE_DATA_URL.test(value.imageUrl)) return null;
  const elementClusters = clusters(value.elementClusters);
  return {
    id: text(value.id) || generateId(),
    imageUrl: value.imageUrl,
    title: text(value.title, 'Ohne Titel'),
    artist: text(value.artist, 'Unbekannt'),
    year: text(value.year),
    description: text(value.description),
    styleTags: textList(value.styleTags),
    elementTags: textList(value.elementTags),
    elementClusters,
    colors: textList(value.colors),
    analyzed: value.analyzed === true,
    inventoryNumber: text(value.inventoryNumber),
    medium: text(value.medium),
    dimensions: text(value.dimensions),
    location: text(value.location),
    provenance: text(value.provenance),
    catalogText: text(value.catalogText),
    contextAnalysis: text(value.contextAnalysis),
    formalAnalysis: formalAnalysis(value.formalAnalysis),
    notes: text(value.notes),
    detailViews: Array.isArray(value.detailViews)
      ? value.detailViews.map(detailView).filter((item): item is DetailView => item !== null)
      : [],
    ...(typeof value.deletedAt === 'number' ? { deletedAt: value.deletedAt } : {}),
    ...(typeof value.createdAt === 'number' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.analyzedAt === 'number' ? { analyzedAt: value.analyzedAt } : {}),
    ...(typeof value.analysisModel === 'string' ? { analysisModel: value.analysisModel } : {}),
  };
}

function wikiEntry(value: unknown): WikiEntry | null {
  if (!isRecord(value)) return null;
  const now = Date.now();
  return {
    id: text(value.id) || generateId(),
    ...(typeof value.folderId === 'string' && value.folderId ? { folderId: value.folderId } : {}),
    title: text(value.title, 'Ohne Titel'),
    content: text(value.content),
    createdAt: timestamp(value.createdAt, now),
    updatedAt: timestamp(value.updatedAt, now),
    source: value.source === 'ai' ? 'ai' : 'user',
  };
}

function wikiFolder(value: unknown): WikiFolder | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  return {
    id: text(value.id) || generateId(),
    name: value.name,
    ...(typeof value.parentId === 'string' && value.parentId ? { parentId: value.parentId } : {}),
  };
}

export interface NormalizeReport {
  projects: Project[];
  skippedArtworks: number;
}

export function normalizeProject(value: unknown, report?: { skippedArtworks: number }): Project | null {
  if (!isRecord(value)) return null;
  const rawArtworks = Array.isArray(value.artworks) ? value.artworks : [];
  const artworks = rawArtworks.map(normalizeArtwork).filter((item): item is Artwork => item !== null);
  if (report) report.skippedArtworks += rawArtworks.length - artworks.length;
  const folders = Array.isArray(value.wikiFolders)
    ? value.wikiFolders.map(wikiFolder).filter((item): item is WikiFolder => item !== null)
    : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const entries = Array.isArray(value.wikiEntries)
    ? value.wikiEntries
        .map(wikiEntry)
        .filter((item): item is WikiEntry => item !== null)
        .map((entry) => (entry.folderId && !folderIds.has(entry.folderId) ? { ...entry, folderId: undefined } : entry))
    : [];
  return {
    id: text(value.id) || generateId(),
    name: text(value.name, 'Unbenanntes Projekt'),
    description: text(value.description),
    createdAt: timestamp(value.createdAt, Date.now()),
    artworks,
    historicalContext: text(value.historicalContext),
    wikiEntries: entries,
    wikiFolders: folders.map((folder) =>
      folder.parentId && !folderIds.has(folder.parentId) ? { ...folder, parentId: undefined } : folder,
    ),
    notes: text(value.notes),
    ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
  };
}

/**
 * Akzeptiert: Array von Projekten (Original-localStorage), eigenes Backup-Format {projects: [...]}
 * oder ein einzelnes Projekt.
 */
export function normalizeProjects(value: unknown): NormalizeReport {
  const report = { skippedArtworks: 0 };
  let list: unknown[] = [];
  if (Array.isArray(value)) list = value;
  else if (isRecord(value) && Array.isArray(value.projects)) list = value.projects;
  else if (isRecord(value) && Array.isArray(value.artworks)) list = [value];
  else throw new Error('Unbekanntes Dateiformat – erwartet wird ein ArtArchive-Backup.');

  const seen = new Set<string>();
  const projects: Project[] = [];
  for (const item of list) {
    const project = normalizeProject(item, report);
    if (!project) continue;
    if (seen.has(project.id)) project.id = generateId();
    seen.add(project.id);
    projects.push(project);
  }
  return { projects, skippedArtworks: report.skippedArtworks };
}
