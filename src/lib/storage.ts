import { createStore, del, get, getMany, set, setMany } from 'idb-keyval';
import type { Project } from '../types';
import { normalizeProjects } from './normalize';
import type { ArchiveCache } from './sync-engine';

/**
 * Lokale Speicherung in IndexedDB statt localStorage.
 * Grund: localStorage fasst nur ca. 5 MB – mit eingebetteten Bildern ist das nach wenigen Werken voll.
 * Jedes Projekt liegt unter einem eigenen Schlüssel; gespeichert werden nur geänderte Projekte.
 */

export const store = createStore('artarchive-db', 'kv');

const INDEX_KEY = 'projects:index';
const projectKey = (id: string) => `project:${id}`;
/** Schlüssel der Original-App (AI Studio) – wird beim ersten Start übernommen, falls vorhanden. */
export const LEGACY_LOCALSTORAGE_KEY = 'art_archive_projects';

/** A single IndexedDB transaction commits drafts together with their server baselines.
 * Keep the old local project keys untouched as a migration safety copy. */
const CLOUD_KEY = 'archive:cloud:v1';
export async function loadArchiveCache(): Promise<ArchiveCache> {
  const cache = await get<ArchiveCache>(CLOUD_KEY, store);
  if (cache !== undefined) {
    if (!cache || cache.version !== 1 || !Array.isArray(cache.projects) || !cache.bases || typeof cache.bases !== 'object') {
      throw new Error('Der lokale Archivspeicher konnte nicht gelesen werden. Er wird nicht überschrieben.');
    }
    return cache;
  }
  const { projects } = await loadProjects();
  return { version: 1, projects, bases: {} };
}

export async function saveArchiveCache(cache: ArchiveCache): Promise<void> {
  await set(CLOUD_KEY, cache, store);
}

export async function loadProjects(): Promise<{ projects: Project[]; migratedFromLegacy: boolean }> {
  const ids = await get<string[]>(INDEX_KEY, store);
  if (Array.isArray(ids)) {
    const stored = await getMany<Project | undefined>(ids.map(projectKey), store);
    return { projects: normalizeProjects(stored.filter(Boolean)).projects, migratedFromLegacy: false };
  }

  // Erststart: evtl. vorhandene Daten der Original-App übernehmen (gleiche Domain)
  let legacy: Project[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    if (raw) legacy = normalizeProjects(JSON.parse(raw)).projects;
  } catch {
    legacy = [];
  }
  if (legacy.length > 0) {
    await setMany(legacy.map((project) => [projectKey(project.id), project]), store);
    await set(INDEX_KEY, legacy.map((project) => project.id), store);
    return { projects: legacy, migratedFromLegacy: true };
  }
  return { projects: [], migratedFromLegacy: false };
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(`meta:${key}`, store);
  } catch {
    return undefined;
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  try {
    await set(`meta:${key}`, value, store);
  } catch {
    // Metadaten sind nicht kritisch
  }
}

export async function deleteMeta(key: string): Promise<void> {
  try {
    await del(`meta:${key}`, store);
  } catch {
    // ignorieren
  }
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (v. a. Safari/iOS). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
