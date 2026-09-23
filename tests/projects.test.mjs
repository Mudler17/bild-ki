import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ProjectStore } from '../dist-server/projects.js';

// Compile the dependency-free state machine with the same compiler as the application.
const compiledDir = await mkdtemp(join(tmpdir(), 'bild-ki-sync-test-'));
let ArchiveSync;
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', '--outDir', compiledDir, 'src/lib/sync-engine.ts']);
  const compiled = await readFile(join(compiledDir, 'lib/sync-engine.js'), 'utf8');
  ({ ArchiveSync } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`));
} finally { await rm(compiledDir, { recursive: true, force: true }); }
const picture = 'data:image/png;base64,iVBORw0KGgo=';
const project = (id = 'p', name = 'Sammlung') => ({ id, name, description: '', historicalContext: '', createdAt: 1,
  artworks: [{ id: 'a', title: 'Werk', imageUrl: picture, detailViews: [{ id: 'detail', title: 'Ausschnitt', imageUrl: picture }] }],
  wikiEntries: [{ id: 'w', title: 'Kontext', content: 'Notiz', createdAt: 1, updatedAt: 1, source: 'user' }], wikiFolders: [] });

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'bild-ki-projects-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ProjectStore(directory);
  await store.open();
  const remote = {
    projects: async () => ({ archiveId: store.archiveId, projects: store.list() }),
    project: (id) => store.get(id),
    saveProject: (p, revision) => store.put(p.id, revision, p),
    deleteProject: (id, revision) => store.remove(id, revision),
  };
  async function device(initial = [], options = {}) {
    let cache = options.cache ?? { version: 1, projects: initial, bases: {} };
    let projects = [];
    let status;
    const notices = [];
    const engine = new ArchiveSync({
      read: async () => structuredClone(cache),
      write: options.write ?? (async (value) => { cache = structuredClone(value); }),
      remote: options.remote ?? remote,
      onChange: (value) => { projects = value; },
      onStatus: (value) => { status = value; },
      onNotice: (value) => notices.push(value),
    });
    t.after(() => engine.close().catch(() => undefined));
    await engine.load();
    await engine.sync();
    return { engine, get projects() { return projects; }, get cache() { return cache; }, get status() { return status; }, notices,
      rename: (id, name) => engine.edit((list) => list.map((p) => p.id === id ? { ...p, name } : p)),
      remove: (id) => engine.edit((list) => list.filter((p) => p.id !== id)),
    };
  }
  return { store, remote, device, directory };
}

test('Migration and second device preserve images, details and Wiki; server restart preserves revisions and identity', async (t) => {
  const { store, device, directory } = await setup(t);
  const a = await device([project()]);
  const b = await device();
  assert.deepEqual(b.projects, a.projects);
  assert.equal(a.status.kind, 'saved');
  const restarted = new ProjectStore(directory);
  await restarted.open();
  assert.equal(restarted.archiveId, store.archiveId);
  assert.deepEqual(await restarted.get('p'), await store.get('p'));
  b.rename('p', 'Vom iPad');
  await b.engine.sync();
  await a.engine.sync();
  assert.equal(a.projects[0].name, 'Vom iPad');
});

test('Edits to different projects on two devices do not conflict', async (t) => {
  const { device } = await setup(t);
  const a = await device([project('a'), project('b')]);
  const b = await device();
  a.rename('a', 'A'); b.rename('b', 'B');
  await Promise.all([a.engine.sync(), b.engine.sync()]);
  await Promise.all([a.engine.sync(), b.engine.sync()]);
  assert.deepEqual(a.projects.map((p) => p.name).sort(), ['A', 'B']);
  assert.deepEqual(b.projects.map((p) => p.name).sort(), ['A', 'B']);
});

test('Same-project conflict retains both versions and reports conflict copy', async (t) => {
  const { device } = await setup(t);
  const a = await device([project()]); const b = await device();
  a.rename('p', 'Version A'); b.rename('p', 'Version B');
  await a.engine.sync(); await b.engine.sync(); await a.engine.sync();
  assert.deepEqual(b.projects.map((p) => p.name).sort(), ['Version A', 'Version B (Konfliktkopie)']);
  assert.equal(b.notices.length, 1);
  assert.deepEqual(a.projects, b.projects);
});

test('Different legacy project with same ID is migrated as copy, never replaces server project', async (t) => {
  const { device } = await setup(t);
  await device([project('p', 'Server')]);
  const b = await device([project('p', 'Altbestand')]);
  assert.deepEqual(b.projects.map((p) => p.name).sort(), ['Altbestand (Konfliktkopie)', 'Server']);
});

test('Deletion propagates; stale offline edit survives separately without resurrecting deleted ID', async (t) => {
  const { device, store } = await setup(t);
  const a = await device([project()]); const b = await device(); const c = await device();
  b.rename('p', 'Offline geändert'); a.remove('p');
  await a.engine.sync(); await c.engine.sync();
  assert.equal(c.projects.length, 0);
  await b.engine.sync();
  assert.equal(b.projects.length, 1);
  assert.notEqual(b.projects[0].id, 'p');
  assert.equal(b.projects[0].name, 'Offline geändert (Konfliktkopie)');
  await assert.rejects(store.get('p'), { status: 404 });
});

test('Local deletion cannot erase a newer remote edit', async (t) => {
  const { device } = await setup(t);
  const a = await device([project()]); const b = await device();
  a.rename('p', 'Neu'); b.remove('p');
  await a.engine.sync(); await b.engine.sync();
  assert.equal(b.projects[0].name, 'Neu');
  assert.match(b.notices[0], /Löschung/);
});

test('Offline edits survive local restart and upload after reconnection', async (t) => {
  const { device, remote } = await setup(t);
  let offline = false;
  const a = await device([project()], { remote: { ...remote, projects: (...args) => {
    if (offline) throw new Error('Offline');
    return remote.projects(...args);
  } } });
  offline = true;
  a.rename('p', 'Offline-Entwurf'); await a.engine.sync();
  assert.equal(a.status.kind, 'error');
  await a.engine.close();
  const restored = await device([], { cache: a.cache });
  assert.equal(restored.projects[0].name, 'Offline-Entwurf');
  assert.equal(restored.status.kind, 'saved');
});

test('Lost save response is retried without creating duplicate projects', async (t) => {
  const { device, remote, store } = await setup(t);
  let lose = true;
  const a = await device([project()], { remote: { ...remote, saveProject: async (...args) => {
    const saved = await remote.saveProject(...args);
    if (lose) { lose = false; throw new Error('Antwort verloren'); }
    return saved;
  } } });
  await a.engine.sync();
  assert.equal(store.list().length, 1);
  assert.equal(a.projects.length, 1);
  assert.equal(a.status.kind, 'saved');
});

test('Typing during an upload is preserved and subsequently uploaded', async (t) => {
  const { device, remote, store } = await setup(t);
  let duringSave;
  const a = await device([project()], { remote: { ...remote, saveProject: async (...args) => {
    duringSave?.(); duringSave = undefined;
    return remote.saveProject(...args);
  } } });
  duringSave = () => a.rename('p', 'Noch neuer');
  a.rename('p', 'Zwischenstand'); await a.engine.sync();
  assert.equal(a.projects[0].name, 'Noch neuer');
  assert.equal((await store.get('p')).project.name, 'Noch neuer');
});

test('Typing during download creates a conflict copy instead of discarding input', async (t) => {
  const { device, remote } = await setup(t);
  const a = await device([project()]);
  let duringGet;
  const b = await device([], { remote: { ...remote, project: async (...args) => {
    duringGet?.(); duringGet = undefined;
    return remote.project(...args);
  } } });
  a.rename('p', 'Serveränderung'); await a.engine.sync();
  duringGet = () => b.rename('p', 'Gerade getippt');
  await b.engine.sync();
  assert.deepEqual(b.projects.map((p) => p.name).sort(), ['Gerade getippt (Konfliktkopie)', 'Serveränderung']);
});

test('Changed archive identity cannot delete or overwrite local data', async (t) => {
  const { device, remote } = await setup(t);
  const a = await device([project()]); await a.engine.close();
  const b = await device([], { cache: a.cache, remote: { ...remote, projects: async () => ({ archiveId: 'different', projects: [] }) } });
  assert.equal(b.projects.length, 1);
  assert.equal(b.status.kind, 'error');
  assert.match(b.status.message, /anderen Datenspeicher/);
});

test('Local storage failure blocks upload and retains in-memory draft for export', async (t) => {
  const { device, remote, store } = await setup(t);
  let full = false;
  const a = await device([project()], { remote, write: async () => { if (full) throw new Error('Speicher voll'); } });
  full = true; a.rename('p', 'Ungesichert'); await a.engine.sync();
  assert.equal(a.status.kind, 'error');
  assert.equal(a.projects[0].name, 'Ungesichert');
  assert.equal((await store.get('p')).project.name, 'Sammlung');
});

test('Server CAS accepts only one conflicting writer, validates images and survives a corrupt-file check', async (t) => {
  const { store, directory } = await setup(t);
  const first = await store.put('p', null, project());
  const results = await Promise.allSettled([store.put('p', first.revision, project('p', 'A')), store.put('p', first.revision, project('p', 'B'))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  const invalid = { ...project('unsafe'), artworks: [{ id: 'x', imageUrl: 'https://example.org/image.jpg' }] };
  await assert.rejects(store.put('unsafe', null, invalid), { status: 400 });
  await writeFile(join(directory, 'broken.json'), '{broken');
  await assert.rejects(new ProjectStore(directory).open());
});


test('App notes and comparison tasks synchronize to second device and keep conflicting edits', async t => {
  const { device } = await setup(t);
  const notebook = { ...project('notes', 'App-Notizen'), kind: 'notebook', artworks: [], workNotes: [{ id: 'n', title: 'Licht prüfen', content: 'Entwurf', kind: 'task', done: false, due: '2026-10-01', source: 'user', artworkIds: [], createdAt: 1, updatedAt: 1, comparison: [{ projectId: 'p', artworkId: 'a', title: 'Werk' }] }] };
  const a = await device([notebook]); const b = await device();
  assert.deepEqual(b.projects[0].workNotes, notebook.workNotes);
  a.engine.edit(ps => ps.map(p => ({ ...p, workNotes: p.workNotes.map(n => ({ ...n, content: 'Gerät A' })) })));
  b.engine.edit(ps => ps.map(p => ({ ...p, workNotes: p.workNotes.map(n => ({ ...n, content: 'Gerät B' })) })));
  await a.engine.sync(); await b.engine.sync(); await a.engine.sync();
  assert.ok(a.projects.some(p => p.workNotes?.[0].content === 'Gerät A'));
  assert.ok(a.projects.some(p => p.workNotes?.[0].content === 'Gerät B'));
  assert.ok(a.projects.every(p => p.kind === 'notebook'));
});
