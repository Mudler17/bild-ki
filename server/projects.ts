import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type Project = Record<string, unknown> & { id: string; name: string; artworks: unknown[] };
type RecordFile = { revision: string; project: Project };

export class ProjectError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateProject(value: unknown, id: string): Project {
  if (!record(value) || value.id !== id || typeof value.name !== 'string' || !Array.isArray(value.artworks) ||
      typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) ||
      typeof value.description !== 'string' || typeof value.historicalContext !== 'string') {
    throw new ProjectError(400, 'INVALID_PROJECT', 'Ungültige Projektdaten.');
  }
  if (value.workNotes !== undefined && (!Array.isArray(value.workNotes) || !value.workNotes.every(n =>
      record(n) && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.content === 'string' &&
      ['draft', 'note', 'task'].includes(String(n.kind)) && typeof n.done === 'boolean' && typeof n.due === 'string' &&
      Array.isArray(n.artworkIds) && n.artworkIds.every(id => typeof id === 'string') &&
      ['user', 'ai'].includes(String(n.source)) && typeof n.createdAt === 'number' && typeof n.updatedAt === 'number' &&
      (n.comparison === undefined || (Array.isArray(n.comparison) && n.comparison.length <= 2 && n.comparison.every(r => record(r) && typeof r.projectId === 'string' && typeof r.artworkId === 'string' && typeof r.title === 'string')))))) {
    throw new ProjectError(400, 'INVALID_PROJECT', 'Ungültige Notizen.');
  }
  // No external URLs or SVG/HTML payloads, including nested detail images.
  const checkImages = (item: unknown, depth = 0): void => {
    if (depth > 30) throw new ProjectError(400, 'INVALID_PROJECT', 'Projektdaten sind zu tief verschachtelt.');
    if (Array.isArray(item)) { for (const entry of item) checkImages(entry, depth + 1); }
    else if (record(item)) {
      for (const [key, entry] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new ProjectError(400, 'INVALID_PROJECT', 'Ungültiges Datenfeld.');
        if (key === 'imageUrl' && (typeof entry !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(entry))) {
          throw new ProjectError(400, 'INVALID_PROJECT', 'Bilder müssen als eingebettete Bilddaten vorliegen.');
        }
        checkImages(entry, depth + 1);
      }
    }
  };
  checkImages(value);
  for (const artwork of value.artworks) {
    if (!record(artwork) || typeof artwork.id !== 'string' || typeof artwork.imageUrl !== 'string') {
      throw new ProjectError(400, 'INVALID_PROJECT', 'Ungültige Werkdaten.');
    }
  }
  for (const key of ['wikiEntries', 'wikiFolders']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(record))) {
      throw new ProjectError(400, 'INVALID_PROJECT', 'Ungültige Wiki-Daten.');
    }
  }
  return value as Project;
}

/** One application instance, one durable directory. Revisions are content hashes;
 * retries after a lost response are idempotent. Never publish a partially written file. */
export class ProjectStore {
  archiveId = '';
  private revisions = new Map<string, string>();
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly directory: string) {}

  private filename(id: string): string {
    if (!id || id.length > 200) throw new ProjectError(400, 'INVALID_ID', 'Ungültige Projekt-ID.');
    return path.join(this.directory, `${crypto.createHash('sha256').update(id).digest('hex')}.json`);
  }

  async open(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const identity = path.join(this.directory, '.archive-id');
    try { this.archiveId = (await fs.readFile(identity, 'utf8')).trim(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.archiveId = crypto.randomUUID();
      const handle = await fs.open(identity, 'wx', 0o600);
      try { await handle.writeFile(this.archiveId); await handle.sync(); }
      finally { await handle.close(); }
      await this.syncDirectory();
    }
    if (!/^[a-f0-9-]{36}$/.test(this.archiveId)) throw new Error('Ungültige Archivkennung.');
    // Fail readiness early for a read-only/misowned mount rather than accept unsavable work.
    const probe = path.join(this.directory, `${crypto.randomUUID()}.tmp`);
    try { await fs.writeFile(probe, '', { flag: 'wx', mode: 0o600 }); }
    finally { await fs.rm(probe, { force: true }); }
    for (const file of await fs.readdir(this.directory)) {
      if (!file.endsWith('.json')) continue;
      const saved = JSON.parse(await fs.readFile(path.join(this.directory, file), 'utf8')) as RecordFile;
      const project = validateProject(saved.project, saved.project.id);
      const revision = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
      if (saved.revision !== revision || this.filename(project.id) !== path.join(this.directory, file)) {
        throw new Error(`Beschädigte Projektdatei: ${file}. Bitte Sicherung wiederherstellen.`);
      }
      this.revisions.set(project.id, revision);
    }
  }

  list(): { id: string; revision: string }[] {
    return Array.from(this.revisions, ([id, revision]) => ({ id, revision }));
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.then(operation);
    this.chain = next.catch(() => undefined);
    return next;
  }

  get(id: string): Promise<RecordFile> {
    return this.serial(async () => {
      const file = this.filename(id);
      if (!this.revisions.has(id)) throw new ProjectError(404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return JSON.parse(await fs.readFile(file, 'utf8')) as RecordFile;
    });
  }

  put(id: string, expected: unknown, value: unknown): Promise<{ revision: string }> {
    return this.serial(async () => {
      const file = this.filename(id);
      const project = validateProject(value, id);
      if (expected !== null && typeof expected !== 'string') throw new ProjectError(400, 'INVALID_REVISION', 'Versionsstand fehlt.');
      const revision = crypto.createHash('sha256').update(JSON.stringify(project)).digest('hex');
      const current = this.revisions.get(id) ?? null;
      if (current === revision) return { revision }; // retry of a completed save
      if (current !== expected) throw new ProjectError(409, 'PROJECT_CONFLICT', 'Das Projekt wurde auf einem anderen Gerät geändert.');
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify({ revision, project })); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temporary, file);
        this.revisions.set(id, revision);
        await this.syncDirectory();
      } finally { await fs.rm(temporary, { force: true }); }
      this.revisions.set(id, revision);
      return { revision };
    });
  }

  remove(id: string, expected: unknown): Promise<void> {
    return this.serial(async () => {
      const file = this.filename(id);
      if (typeof expected !== 'string') throw new ProjectError(400, 'INVALID_REVISION', 'Versionsstand fehlt.');
      const current = this.revisions.get(id);
      if (!current) return; // retry after a lost response
      if (current !== expected) throw new ProjectError(409, 'PROJECT_CONFLICT', 'Das Projekt wurde auf einem anderen Gerät geändert.');
      await fs.unlink(file);
      this.revisions.delete(id);
      await this.syncDirectory();
      this.revisions.delete(id);
    });
  }

  private async syncDirectory(): Promise<void> {
    const handle = await fs.open(this.directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}
