import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * API-Tests gegen den gebauten Server (vorher: npm run build).
 * Läuft im Demo-Modus (AI_MOCK=1) – es werden keine echten KI-Anfragen gestellt.
 * Start: npm test
 */
import { spawn } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
const projectTestDir = mkdtempSync(join(tmpdir(), 'bild-ki-api-'));
after(() => rmSync(projectTestDir, { recursive: true, force: true }));
import assert from 'node:assert/strict';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'test-passwort-123456';
// 1×1-Pixel-JPEG
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

let server;
let cookie = '';

function startServer(env) {
  return spawn(process.execPath, ['dist-server/index.js'], {
    env: { ...process.env, DATA_DIR: projectTestDir, NODE_ENV: 'production', HOST: '127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return;
    } catch {
      // noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server startet nicht');
}

async function readEvents(response) {
  const text = await response.text();
  return text
    .split('\n\n')
    .map((block) => block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join(''))
    .filter(Boolean)
    .map((data) => JSON.parse(data));
}

const post = (path, body, headers = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('Start ohne Passwort', () => {
  test('Server verweigert den Start ohne APP_ACCESS_PASSWORD', async () => {
    const child = startServer({ PORT: String(PORT + 100), APP_ACCESS_PASSWORD: '', AI_MOCK: '1' });
    const code = await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(code, 1);
  });
});

describe('API', () => {
  before(async () => {
    server = startServer({
      PORT: String(PORT),
      APP_ACCESS_PASSWORD: PASSWORD,
      SESSION_SECRET: 'test-secret-test-secret-test-secret',
      AI_MOCK: '1',
      AI_MOCK_DELAY_MS: '50',
      MAX_PROJECT_MB: '1',
      OPENAI_API_KEY: '',
    });
    await waitForServer();
  });

  after(() => server?.kill());

  test('Sicherheits-Header gesetzt', async () => {
    const response = await fetch(`${BASE}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  });

  test('SPA-Routen liefern index.html, fehlende Dateien 404', async () => {
    const page = await fetch(`${BASE}/irgendeine/route`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    const missing = await fetch(`${BASE}/gibt-es-nicht.png`);
    assert.equal(missing.status, 404);
  });

  test('Session ohne Anmeldung verrät keine Details', async () => {
    const data = await (await fetch(`${BASE}/api/session`)).json();
    assert.equal(data.authenticated, false);
    assert.equal(data.model, undefined);
    assert.equal(data.aiAvailable, undefined);
  });

  test('KI-Endpunkte ohne Anmeldung: 401', async () => {
    const response = await post('/api/analyze', { image: TINY_JPEG });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'AUTH_REQUIRED');
    assert.equal((await post('/api/wiki', { topic: 'Test' })).status, 401);
    assert.equal((await post('/api/compare', { images: [TINY_JPEG, TINY_JPEG] })).status, 401);
  });

  test('Große Anfragen: ohne Anmeldung 401, Login-Körper begrenzt', async () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(6 * 1024 * 1024)}`;
    assert.equal((await post('/api/analyze', { image: big })).status, 401);
    assert.equal((await post('/api/login', { password: 'x'.repeat(100 * 1024) })).status, 413);
  });

  test('Falsches Passwort: 401', async () => {
    const response = await post('/api/login', { password: 'falsch' });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
  });

  test('Richtiges Passwort: HttpOnly-/SameSite-Cookie', async () => {
    const response = await post('/api/login', { password: PASSWORD });
    assert.equal(response.status, 204);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /artarchive_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    cookie = setCookie.split(';')[0];
    const session = await (await fetch(`${BASE}/api/session`, { headers: { Cookie: cookie } })).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.mock, true);
    assert.equal(session.aiAvailable, true);
  });

  test('Manipuliertes Cookie wird abgelehnt', async () => {
    const forged = `${cookie.slice(0, -3)}abc`;
    const response = await post('/api/wiki', { topic: 'Test' }, { Cookie: forged });
    assert.equal(response.status, 401);
  });

  test('Projekt-API: Zugang, Versionsschutz, Herkunftsprüfung, Größenlimit und Löschung', async () => {
    const url = `${BASE}/api/projects/p`;
    const request = (method, body, headers = { Cookie: cookie }) => fetch(url, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    assert.equal((await fetch(`${BASE}/api/projects`)).status, 401);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await request('PUT', {}, {})).status, 401);
    assert.equal((await request('DELETE', {}, {})).status, 401);
    const project = { id: 'p', name: 'Test', description: '', historicalContext: '', createdAt: 1, artworks: [] };
    assert.equal((await request('PUT', { project, expectedRevision: null }, { Cookie: cookie, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('PUT', { project, expectedRevision: null })).status, 200);
    const manifest = await (await fetch(`${BASE}/api/projects`, { headers: { Cookie: cookie } })).json();
    assert.ok(manifest.archiveId);
    assert.equal(manifest.projects.length, 1);
    const response = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const stored = await response.json();
    assert.deepEqual(stored.project, project);
    const changed = { ...project, name: 'Neu' };
    assert.equal((await request('PUT', { project: changed, expectedRevision: null })).status, 409);
    assert.equal((await request('DELETE', { expectedRevision: 'veraltet' })).status, 409);
    assert.equal((await request('PUT', { project: changed, expectedRevision: stored.revision })).status, 200);
    assert.equal((await request('PUT', { project: { ...changed, notes: 'x'.repeat(2 * 1024 * 1024) }, expectedRevision: stored.revision })).status, 413);
    const current = await (await fetch(url, { headers: { Cookie: cookie } })).json();
    assert.equal((await request('DELETE', { expectedRevision: current.revision }, { Cookie: cookie, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('DELETE', { expectedRevision: current.revision })).status, 204);
    assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 404);
  });

  test('Fremder Ursprung (CSRF) wird abgelehnt', async () => {
    const response = await post('/api/wiki', { topic: 'Test' }, { Cookie: cookie, Origin: 'https://evil.example' });
    assert.equal(response.status, 403);
  });

  test('Ungültige Eingaben: 400', async () => {
    const noImage = await post('/api/analyze', { image: 'kein-bild' }, { Cookie: cookie });
    assert.equal(noImage.status, 400);
    const badType = await post('/api/analyze', { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, { Cookie: cookie });
    assert.equal(badType.status, 400);
    const badJson = await post('/api/analyze', '{kaputt', { Cookie: cookie });
    assert.equal(badJson.status, 400);
    const noTopic = await post('/api/wiki', { topic: '   ' }, { Cookie: cookie });
    assert.equal(noTopic.status, 400);
  });

  test('Analyse liefert Ergebnis als Event-Stream', async () => {
    const response = await post(
      '/api/analyze',
      { image: TINY_JPEG, focusAreas: ['artist', 'gibtsnicht'], hint: 'Test', known: { title: 'Mein Bild' } },
      { Cookie: cookie, Origin: BASE },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const events = await readEvents(response);
    const result = events.find((event) => event.type === 'result');
    assert.ok(result, 'Ergebnis-Ereignis fehlt');
    assert.equal(result.data.mock, true);
    assert.equal(result.data.result.title, 'Mein Bild');
    assert.ok(Array.isArray(result.data.result.styleTags));
    assert.equal(typeof result.data.result.elementClusters, 'object');
    assert.ok(result.data.result.colors.every((color) => /^#[0-9a-f]{6}$/.test(color)));
  });

  test('Wiki-Artikel als Event-Stream', async () => {
    const response = await post('/api/wiki', { topic: 'Barock', projectName: 'Test', artworkTitles: ['Mein Bild'] }, { Cookie: cookie });
    const events = await readEvents(response);
    const result = events.find((event) => event.type === 'result');
    assert.ok(result);
    assert.match(result.data.content, /\[\[Mein Bild\]\]/);
  });

  test('Abmelden löscht das Cookie', async () => {
    const response = await post('/api/logout', {}, { Cookie: cookie });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie') ?? '', /artarchive_session=;/);
  });

  test('Login-Bremse nach 10 Fehlversuchen', async () => {
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) last = (await post('/api/login', { password: `falsch-${attempt}` })).status;
    assert.equal(last, 429);
  });
});
