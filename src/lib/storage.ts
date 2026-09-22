import { createStore, del, delMany, get, getMany, set, setMany } from 'idb-keyval';
import type { Project } from '../types';
import { normalizeProjects } from './normalize';

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

/** Speichert entprellt und nur Änderungen (Objektidentität, da der Zustand unveränderlich aktualisiert wird). */
export class ProjectPersister {
  private lastSaved = new Map<string, Project>();
  private lastIds: string[] = [];
  private pending: Project[] | null = null;
  private timer: number | undefined;
  private chain: Promise<void> = Promise.resolve();
  private writing = false;

  constructor(
    private readonly onError: (error: unknown) => void,
    private readonly onSaved?: (projects: Project[]) => void,
  ) {}

  prime(projects: Project[]): void {
    this.lastSaved = new Map(projects.map((project) => [project.id, project]));
    this.lastIds = projects.map((project) => project.id);
  }

  /** Strukturänderungen (Import, Upload, Löschen …) sofort, Texteingaben kurz entprellt speichern. */
  schedule(projects: Project[], delay = 300): void {
    this.pending = projects;
    window.clearTimeout(this.timer);
    if (delay <= 0) {
      void this.flush();
      return;
    }
    this.timer = window.setTimeout(() => void this.flush(), delay);
  }

  /** true, solange Änderungen noch nicht in IndexedDB geschrieben sind. */
  isBusy(): boolean {
    return this.pending !== null || this.writing;
  }

  flush(): Promise<void> {
    window.clearTimeout(this.timer);
    this.chain = this.chain.then(() => this.write());
    return this.chain;
  }

  private async write(): Promise<void> {
    const projects = this.pending;
    if (!projects) return;
    this.pending = null;
    const ids = projects.map((project) => project.id);
    const changed = projects.filter((project) => this.lastSaved.get(project.id) !== project);
    const removed = this.lastIds.filter((id) => !ids.includes(id));
    const orderChanged = ids.join('|') !== this.lastIds.join('|');
    if (changed.length === 0 && removed.length === 0 && !orderChanged) return;
    this.writing = true;
    try {
      if (changed.length > 0) await setMany(changed.map((project) => [projectKey(project.id), project]), store);
      if (removed.length > 0) await delMany(removed.map(projectKey), store);
      await set(INDEX_KEY, ids, store);
      for (const project of changed) this.lastSaved.set(project.id, project);
      for (const id of removed) this.lastSaved.delete(id);
      this.lastIds = ids;
      this.onSaved?.(projects);
    } catch (error) {
      if (!this.pending) this.pending = projects; // beim nächsten Mal erneut versuchen
      this.onError(error);
    } finally {
      this.writing = false;
    }
  }
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
