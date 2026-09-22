import { del, get, set } from 'idb-keyval';
import { APP_NAME, APP_VERSION } from '../config';
import type { Project } from '../types';
import { normalizeProjects } from './normalize';
import { setMeta, store } from './storage';
import { downloadBlob, todayIso } from './util';

/**
 * Sicherung: JSON-Export/-Import (überall) und Ordner-Synchronisation
 * (File System Access API – nur Chrome/Edge am Desktop).
 * Im Original waren diese Knöpfe vorhanden, aber ohne Funktion.
 */

export const BACKUP_FORMAT = 'artarchive-backup';
const FOLDER_KEY = 'backup:folder';
const FOLDER_FILENAME = 'ArtArchive-Backup.json';

export function buildBackupJson(projects: Project[]): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    app: APP_NAME,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
  });
}

export async function exportBackup(projects: Project[]): Promise<void> {
  downloadBlob(new Blob([buildBackupJson(projects)], { type: 'application/json' }), `ArtArchive-Backup-${todayIso()}.json`);
  await setMeta('lastExport', Date.now());
}

export async function readBackupFile(file: File): Promise<{ projects: Project[]; skippedArtworks: number }> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  const report = normalizeProjects(data);
  if (report.projects.length === 0) throw new Error('In der Datei wurden keine Projekte gefunden.');
  return report;
}

/** Gleiche IDs werden ersetzt, neue angehängt. */
export function mergeProjects(existing: Project[], incoming: Project[]): { merged: Project[]; added: number; replaced: number } {
  const incomingById = new Map(incoming.map((project) => [project.id, project]));
  let replaced = 0;
  const merged = existing.map((project) => {
    const replacement = incomingById.get(project.id);
    if (!replacement) return project;
    replaced += 1;
    incomingById.delete(project.id);
    return replacement;
  });
  const added = Array.from(incomingById.values());
  return { merged: [...merged, ...added], added: added.length, replaced };
}

// ---------- Ordner-Synchronisation ----------

type PermissionDescriptor = { mode: 'read' | 'readwrite' };
type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: PermissionDescriptor) => Promise<PermissionState>;
};
type WritableFileHandle = FileSystemFileHandle & {
  createWritable?: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};

export function folderSyncSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function pickBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('Ordner-Synchronisation wird von diesem Browser nicht unterstützt.');
  const handle = await picker({ id: 'artarchive', mode: 'readwrite' });
  await set(FOLDER_KEY, handle, store);
  return handle;
}

export async function getBackupFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await get<FileSystemDirectoryHandle>(FOLDER_KEY, store);
  } catch {
    return undefined;
  }
}

export async function unlinkBackupFolder(): Promise<void> {
  await del(FOLDER_KEY, store);
}

export async function folderPermission(handle: FileSystemDirectoryHandle, request = false): Promise<PermissionState> {
  const directory = handle as DirectoryHandle;
  const descriptor: PermissionDescriptor = { mode: 'readwrite' };
  if (!directory.queryPermission) return 'granted';
  let state = await directory.queryPermission(descriptor);
  if (state !== 'granted' && request && directory.requestPermission) state = await directory.requestPermission(descriptor);
  return state;
}

export async function writeBackupToFolder(handle: FileSystemDirectoryHandle, projects: Project[]): Promise<void> {
  const file = (await handle.getFileHandle(FOLDER_FILENAME, { create: true })) as WritableFileHandle;
  if (!file.createWritable) throw new Error('Schreiben in Ordner wird nicht unterstützt.');
  const writable = await file.createWritable();
  await writable.write(buildBackupJson(projects));
  await writable.close();
  await setMeta('lastFolderSync', Date.now());
}
