import type { Project } from '../types';

export interface ArchiveCache {
  version: 1;
  archiveId?: string;
  projects: Project[];
  bases: Record<string, string>;
}
export interface SyncStatus { kind: 'loading' | 'syncing' | 'saved' | 'local' | 'error'; message: string }
export interface SyncDependencies {
  read: () => Promise<ArchiveCache>;
  write: (cache: ArchiveCache) => Promise<void>;
  remote: {
    projects: (signal?: AbortSignal) => Promise<{ archiveId: string; projects: { id: string; revision: string }[] }>;
    project: (id: string, signal?: AbortSignal) => Promise<{ revision: string; project: Project }>;
    saveProject: (project: Project, expected: string | null, signal?: AbortSignal) => Promise<{ revision: string }>;
    deleteProject: (id: string, expected: string, signal?: AbortSignal) => Promise<void>;
  };
  onChange: (projects: Project[]) => void;
  onStatus: (status: SyncStatus) => void;
  onNotice: (message: string) => void;
  onSaved?: (projects: Project[]) => void;
}

const fingerprints = new WeakMap<Project, Promise<string>>();
export function fingerprint(project: Project): Promise<string> {
  let hash = fingerprints.get(project);
  if (!hash) {
    hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(project)))
      .then((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''));
    fingerprints.set(project, hash);
  }
  return hash;
}

/** Local drafts and their acknowledged server revisions are committed together.
 * Remote results never replace edits made while a request was in flight. */
export class ArchiveSync {
  private state: ArchiveCache | null = null;
  private saved: ArchiveCache | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  private controller = new AbortController();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly deps: SyncDependencies) {}

  async load(): Promise<void> {
    const cache = await this.deps.read();
    if (this.stopped) return;
    this.state = cache;
    this.deps.onChange(cache.projects);
    try { await this.flush(); } catch (error) { this.report(error); }
    if (!this.stopped) void this.sync();
  }

  edit(updater: Project[] | ((previous: Project[] | null) => Project[] | null)): void {
    if (!this.state || this.stopped) return;
    const projects = typeof updater === 'function' ? updater(this.state.projects) : updater;
    if (!projects || projects === this.state.projects) return;
    this.state = { ...this.state, projects };
    this.deps.onChange(projects);
    this.status('local', 'Änderungen werden auf diesem Gerät gesichert …');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.flush().then(() => {
        if (!this.stopped) this.status('local', 'Auf diesem Gerät gesichert – Serverabgleich ausstehend.');
      }).catch((error: unknown) => this.report(error));
    }, 100);
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.syncTimer);
    if (!this.stopped) this.syncTimer = setTimeout(() => void this.sync(), 800);
  }

  flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    const write = async () => {
      const snapshot = this.state;
      if (!snapshot || snapshot === this.saved) return;
      await this.deps.write(snapshot);
      this.saved = snapshot;
      if (!this.stopped) this.deps.onSaved?.(snapshot.projects);
    };
    const next = this.writeChain.then(write, write);
    this.writeChain = next;
    return next;
  }

  isBusy(): boolean { return this.state !== this.saved || this.inFlight !== null; }

  async close(): Promise<void> {
    this.stopped = true;
    this.controller.abort();
    clearTimeout(this.syncTimer);
    await this.flush();
  }

  private status(kind: SyncStatus['kind'], message: string): void {
    if (!this.stopped) this.deps.onStatus({ kind, message });
  }

  private report(error: unknown): void {
    this.status('error', `Abgleich nicht abgeschlossen: ${error instanceof Error ? error.message : 'Unbekannter Fehler.'} Änderungen bleiben auf diesem Gerät; bei Speicherfehlern bitte JSON exportieren.`);
  }

  sync(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.stopped || !this.state) return Promise.resolve();
    clearTimeout(this.syncTimer);
    this.status('syncing', 'Projekte werden abgeglichen …');
    this.inFlight = this.reconcile().catch((error: unknown) => this.report(error)).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private base(id: string): string | null {
    return this.state && Object.hasOwn(this.state.bases, id) ? this.state.bases[id] : null;
  }

  private local(id: string): Project | undefined { return this.state?.projects.find((project) => project.id === id); }

  private acknowledge(id: string, revision: string | null): void {
    if (!this.state) return;
    const bases = { ...this.state.bases };
    if (revision) bases[id] = revision;
    else delete bases[id];
    this.state = { ...this.state, bases };
  }

  private accept(id: string, project?: Project): void {
    if (!this.state) return;
    const exists = this.state.projects.some((item) => item.id === id);
    const projects = project
      ? exists ? this.state.projects.map((item) => item.id === id ? project : item) : [...this.state.projects, project]
      : this.state.projects.filter((item) => item.id !== id);
    this.state = { ...this.state, projects };
    this.deps.onChange(projects);
  }

  private async reconcile(): Promise<void> {
    const signal = this.controller.signal;
    // A busy second device may repeatedly win a compare-and-swap. Retry later instead of spinning.
    for (let pass = 0; pass < 3 && !this.stopped && this.state; pass += 1) {
      await this.flush();
      const manifest = await this.deps.remote.projects(signal);
      if (this.stopped) return;
      if (this.state.archiveId && this.state.archiveId !== manifest.archiveId) {
        throw new Error('Der Server verwendet einen anderen Datenspeicher. Bitte das bisherige Daten-Volume wieder einbinden. Lokale Projekte werden nicht überschrieben.');
      }
      if (!this.state.archiveId) {
        this.state = { ...this.state, archiveId: manifest.archiveId };
        await this.flush();
      }
      const remote = new Map(manifest.projects.map((item) => [item.id, item.revision]));
      const ids = new Set([...this.state.projects.map((item) => item.id), ...Object.keys(this.state.bases), ...remote.keys()]);
      let retry = false;
      for (const id of ids) {
        if (this.stopped) return;
        const local = this.local(id);
        const expected = this.base(id);
        const hash = local ? await fingerprint(local) : null;
        if (this.stopped) return;
        if (this.local(id) !== local) { retry = true; continue; }
        const remoteRevision = remote.get(id) ?? null;
        if (hash === remoteRevision) {
          this.acknowledge(id, remoteRevision); // also recovers a save whose HTTP response was lost
          continue;
        }
        try {
          if (remoteRevision === expected) {
            // Locally modified only. Persist draft before sending, and retain any newer local edit.
            await this.flush();
            if (local) {
              const result = await this.deps.remote.saveProject(local, expected, signal);
              if (this.stopped) return;
              this.acknowledge(id, result.revision);
            } else if (expected) {
              await this.deps.remote.deleteProject(id, expected, signal);
              if (this.stopped) return;
              this.acknowledge(id, null);
            }
            if (this.local(id) !== local) retry = true;
          } else {
            const incoming = remoteRevision ? await this.deps.remote.project(id, signal) : null;
            if (this.stopped) return;
            // Check again after the network request: typing during a download must survive.
            const latest = this.local(id);
            const latestHash = latest ? await fingerprint(latest) : null;
            if (this.stopped) return;
            if (this.local(id) !== latest) { retry = true; continue; }
            const receivedRevision = incoming?.revision ?? null;
            if (latestHash !== expected && latestHash !== receivedRevision) {
              if (latest) {
                const copy = { ...latest, id: crypto.randomUUID(), name: `${latest.name} (Konfliktkopie)`, updatedAt: Date.now() };
                this.accept(copy.id, copy);
                this.deps.onNotice(`„${latest.name}“ lag in verschiedenen Fassungen vor. Deine lokale Fassung bleibt als Konfliktkopie erhalten.`);
              } else {
                this.deps.onNotice('Ein inzwischen auf einem anderen Gerät geändertes Projekt wurde wiederhergestellt. Bitte die Löschung prüfen.');
              }
              retry = true;
            }
            this.accept(id, incoming?.project);
            this.acknowledge(id, receivedRevision);
          }
          await this.flush();
        } catch (error) {
          const status = (error as { status?: number })?.status;
          if (status === 409 || status === 404) { retry = true; continue; }
          throw error;
        }
      }
      await this.flush();
      if (this.stopped) return;
      const snapshot = this.state;
      const hashes = await Promise.all(snapshot.projects.map(async (project) => [project.id, await fingerprint(project)] as const));
      if (this.stopped) return;
      const clean = snapshot === this.state && hashes.every(([id, hash]) => this.base(id) === hash) &&
        Object.keys(snapshot.bases).length === snapshot.projects.length;
      if (clean && !retry) { this.status('saved', 'Auf dem Server gespeichert.'); return; }
    }
    if (!this.stopped) { this.status('local', 'Auf diesem Gerät gesichert – weitere Änderungen werden abgeglichen.'); this.schedule(); }
  }
}
