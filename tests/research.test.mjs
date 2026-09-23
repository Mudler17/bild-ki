import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseCompareRequest } from '../dist-server/validate.js';
import { validateProject } from '../dist-server/projects.js';
const dir = await mkdtemp(join(tmpdir(), 'research-test-'));
let searchArchive, putWorkNote, newWorkNote, normalizeProjects;
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', '--outDir', dir, 'src/lib/research.ts', 'src/lib/normalize.ts']);
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const file = join(dir, 'lib/normalize.js');
  await writeFile(file, (await readFile(file, 'utf8')).replace("'./util'", "'./util.js'"));
  ({ searchArchive, putWorkNote, newWorkNote } = await import(pathToFileURL(join(dir, 'lib/research.js'))));
  ({ normalizeProjects } = await import(pathToFileURL(file)));
} finally { await rm(dir, { recursive: true, force: true }); }
const image = 'data:image/png;base64,aGVsbG8=';
const projects = normalizeProjects([{ id: 'p', name: 'Malerei', artworks: [{ id: 'a', imageUrl: image, title: 'Blauer Garten', artist: 'Franz Marc', styleTags: ['Expressionismus'], elementTags: ['Pferd'], formalAnalysis: { composition: 'Diagonale' } }], wikiEntries: [{ id: 'w', title: 'Farbenlehre', content: 'Kontrast' }] }]).projects;
const filters = { query: '', project: '', artist: '', style: '', tag: '', type: '' };
test('Search combines query words and artwork filters and includes analyses', () => {
  assert.equal(searchArchive(projects, { ...filters, query: 'Garten Diagonale', artist: 'marc', style: 'expression', tag: 'pferd' })[0].artwork.id, 'a');
  assert.equal(searchArchive(projects, { ...filters, query: 'Garten fehlt' }).length, 0);
  assert.equal(searchArchive(projects, { ...filters, query: 'Kontrast' })[0].wikiId, 'w');
  assert.equal(searchArchive(projects, { ...filters, project: 'other' }).length, 0);
});
test('App notes, task state, comparison sources survive backup normalization', () => {
  const note = newWorkNote({ title: 'Prüfen', content: 'Licht', kind: 'task', due: '2026-10-01', done: true, source: 'ai', model: 'demo', comparison: [{ projectId: 'p', artworkId: 'a', title: 'Blauer Garten' }] });
  const saved = putWorkNote(projects, null, note);
  const backup = normalizeProjects(JSON.parse(JSON.stringify({ projects: saved }))).projects;
  assert.equal(backup[1].kind, 'notebook');
  assert.deepEqual(backup[1].workNotes[0], note);
  assert.equal(searchArchive(backup, { ...filters, query: 'prüfen Licht', type: 'note' })[0].note.id, note.id);
  assert.doesNotThrow(() => validateProject(backup[1], backup[1].id));
  const changed = putWorkNote(backup, backup[1].id, { ...note, done: false });
  assert.equal(changed[1].workNotes.length, 1);
  assert.equal(changed[1].workNotes[0].done, false);
  assert.throws(() => putWorkNote(backup, 'deleted-project', note), /gelöscht/);
});
test('Comparison accepts exactly two embedded images and rejects external or oversized inputs', () => {
  assert.equal(parseCompareRequest({ images: [image,image], question: 'Licht' }, 100).images.length, 2);
  for (const images of [[], [image], [image,image,image], [image, 'https://example.com/a.png']]) assert.throws(() => parseCompareRequest({ images }, 100));
  assert.throws(() => parseCompareRequest({ images: [image,image], question: 'x'.repeat(2001) }, 100));
  assert.throws(() => parseCompareRequest({ images: [image,image] }, 1));
});
test('Malformed notes are rejected and old projects remain valid', () => {
  assert.doesNotThrow(() => validateProject(projects[0], 'p'));
  assert.throws(() => validateProject({ ...projects[0], workNotes: [{ content: 3 }] }, 'p'));
  assert.throws(() => validateProject({ ...projects[0], workNotes: [newWorkNote({ comparison: [null] })] }, 'p'));
});
