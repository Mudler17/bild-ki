import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * Vertragstest: Stellt der Server die OpenAI-Anfragen korrekt (Responses API, Structured Outputs,
 * Bild als Data-URL, store=false) und verarbeitet er Antworten/Fehler richtig?
 * Statt api.openai.com wird ein lokaler Mock-Server verwendet (OPENAI_BASE_URL).
 * Start: npm test (vorher npm run build)
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
const projectTestDir = mkdtempSync(join(tmpdir(), 'bild-ki-api-'));
after(() => rmSync(projectTestDir, { recursive: true, force: true }));
import assert from 'node:assert/strict';

const MOCK_PORT = 4100 + Math.floor(Math.random() * 90);
const APP_PORT = MOCK_PORT + 200;
const APP_PORT_FALLBACK = MOCK_PORT + 300;
const PASSWORD = 'vertrags-test-passwort';
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const requests = [];
let abortedUpstream = 0;

const ANALYSIS_JSON = {
  title: 'Die Milchmagd',
  artist: 'Johannes Vermeer (gesichert)',
  year: 'um 1658 (plausibel)',
  medium: 'Öl auf Leinwand',
  dimensions: '',
  styleTags: ['Barock', 'Delfter Schule', 'barock'],
  description: 'Eine Magd gießt Milch …',
  elementClusters: [
    { category: 'Inhalt/Motivik', items: ['Magd', 'Milchkrug', 'Brot'] },
    { category: 'Leer', items: [] },
  ],
  colors: ['#1F3A93', 'fc0', 'kein-hex'],
  formalAnalysis: {
    composition: 'Pyramidal.',
    lightAndShadow: 'Licht von links.',
    perspective: 'Tiefer Fluchtpunkt.',
    technique: 'Pointillé.',
    visualRhythm: 'Ruhig.',
    iconography: 'Häuslichkeit (plausibel).',
  },
  contextAnalysis: 'Delft, 1650er.',
};

function responseBody(model, content, extra = {}) {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model,
    error: null,
    incomplete_details: null,
    output: [{ type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content }],
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    ...extra,
  };
}

function scenarioOf(body) {
  const text = JSON.stringify(body.input);
  return /SZENARIO:([a-z-]+)/.exec(text)?.[1] ?? 'ok';
}

const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    requests.push({ path: req.url, headers: req.headers, body });
    const send = (status, payload, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'x-should-retry': 'false', ...headers });
      res.end(JSON.stringify(payload));
    };
    if (body.model === 'gpt-nicht-da') {
      return send(404, { error: { message: 'The model `gpt-nicht-da` does not exist', type: 'invalid_request_error', code: 'model_not_found' } });
    }
    const scenario = scenarioOf(body);
    if (scenario === 'refusal') return send(200, responseBody(body.model, [{ type: 'refusal', refusal: 'Dazu kann ich nichts sagen.' }]));
    if (scenario === 'truncated') {
      return send(200, responseBody(body.model, [{ type: 'output_text', text: '{"title":', annotations: [] }], { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }));
    }
    if (scenario === 'badkey') return send(401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } });
    if (scenario === 'quota') return send(429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } });
    if (scenario === 'slow') {
      const timer = setTimeout(() => send(200, responseBody(body.model, [{ type: 'output_text', text: 'spät', annotations: [] }])), 5000);
      res.on('close', () => {
        if (!res.writableEnded) {
          clearTimeout(timer);
          abortedUpstream += 1;
        }
      });
      return undefined;
    }
    const isAnalysis = body.text?.format?.type === 'json_schema';
    const text = isAnalysis ? JSON.stringify(ANALYSIS_JSON) : '# Titel doppelt\n\n## Überblick\nSiehe [[Die Milchmagd]].';
    return send(200, responseBody(body.model, [{ type: 'output_text', text, annotations: [] }]));
  });
});

function startApp(port, env) {
  return spawn(process.execPath, ['dist-server/index.js'], {
    env: {
      ...process.env, DATA_DIR: join(projectTestDir, String(port)),
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ACCESS_PASSWORD: PASSWORD,
      SESSION_SECRET: 'vertrag-secret-vertrag-secret',
      OPENAI_API_KEY: 'sk-test-nur-lokal',
      OPENAI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
      AI_MOCK: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitFor(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {
      // noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`App auf Port ${port} startet nicht`);
}

async function login(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  return (response.headers.get('set-cookie') ?? '').split(';')[0];
}

async function callStream(port, cookie, path, payload, signal) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await response.text();
  const events = text
    .split('\n\n')
    .map((block) => block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join(''))
    .filter(Boolean)
    .map((data) => JSON.parse(data));
  return { status: response.status, events };
}

function assertStrictSchema(schema, path = 'schema') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path}: additionalProperties muss false sein`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path}: alle Felder müssen required sein`);
    for (const [key, value] of Object.entries(schema.properties)) assertStrictSchema(value, `${path}.${key}`);
  }
  if (schema.type === 'array') assertStrictSchema(schema.items, `${path}[]`);
}

describe('OpenAI-Vertrag', () => {
  let app;
  let appFallback;
  let cookie;
  let cookieFallback;

  before(async () => {
    await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));
    app = startApp(APP_PORT, {});
    appFallback = startApp(APP_PORT_FALLBACK, { OPENAI_MODEL: 'gpt-nicht-da', OPENAI_FALLBACK_MODEL: 'gpt-5.6-luna', AI_DAILY_LIMIT: '2' });
    await Promise.all([waitFor(APP_PORT), waitFor(APP_PORT_FALLBACK)]);
    cookie = await login(APP_PORT);
    cookieFallback = await login(APP_PORT_FALLBACK);
  });

  after(() => {
    app?.kill();
    appFallback?.kill();
    mock.close();
  });

  test('Analyse: Anfrage-Format und bereinigte Antwort', async () => {
    requests.length = 0;
    const { status, events } = await callStream(APP_PORT, cookie, '/api/analyze', {
      image: TINY_JPEG,
      focusAreas: ['artist', 'iconography'],
      hint: 'Bitte auf Licht achten',
      known: { title: 'IMG_1234', artist: 'Unbekannt' },
    });
    assert.equal(status, 200);
    const result = events.find((event) => event.type === 'result');
    assert.ok(result, JSON.stringify(events));

    const sent = requests.at(-1);
    assert.equal(sent.path, '/v1/responses');
    assert.equal(sent.headers.authorization, 'Bearer sk-test-nur-lokal');
    assert.equal(sent.body.model, 'gpt-5.6-terra');
    assert.equal(sent.body.store, false);
    assert.equal(sent.body.max_output_tokens, 25000);
    assert.equal(sent.body.reasoning, undefined, 'ohne OPENAI_REASONING_EFFORT kein reasoning-Feld');
    assert.equal(sent.body.text.format.type, 'json_schema');
    assert.equal(sent.body.text.format.strict, true);
    assertStrictSchema(sent.body.text.format.schema);
    const content = sent.body.input[0].content;
    assert.equal(content[0].type, 'input_image');
    assert.equal(content[0].detail, 'high');
    assert.ok(content[0].image_url.startsWith('data:image/jpeg;base64,'));
    assert.equal(content[1].type, 'input_text');
    assert.match(content[1].text, /LEG BESONDEREN FOKUS AUF: Künstler-Identifikation, Ikonographie/);
    assert.match(content[1].text, /Bitte auf Licht achten/);
    assert.match(content[1].text, /Titel: IMG_1234/);
    assert.doesNotMatch(content[1].text, /Künstler\/Schule: Unbekannt/);

    const data = result.data.result;
    assert.equal(result.data.model, 'gpt-5.6-terra');
    assert.equal(data.title, 'Die Milchmagd');
    assert.deepEqual(data.styleTags, ['Barock', 'Delfter Schule']);
    assert.deepEqual(data.elementClusters, { 'Inhalt/Motivik': ['Magd', 'Milchkrug', 'Brot'] });
    assert.deepEqual(data.colors, ['#1f3a93', '#ffcc00']);
    assert.equal(data.formalAnalysis.iconography, 'Häuslichkeit (plausibel).');
  });

  test('Wiki: Text-Anfrage ohne Schema, doppelte H1 wird entfernt', async () => {
    requests.length = 0;
    const { events } = await callStream(APP_PORT, cookie, '/api/wiki', { topic: 'Delfter Malerei', projectName: 'Vermeer', artworkTitles: ['Die Milchmagd'] });
    const result = events.find((event) => event.type === 'result');
    assert.ok(result);
    assert.ok(result.data.content.startsWith('## Überblick'));
    const sent = requests.at(-1).body;
    assert.equal(sent.text, undefined);
    assert.equal(sent.store, false);
    assert.match(sent.input, /Delfter Malerei/);
    assert.match(sent.input, /- Die Milchmagd/);
  });

  test('Ablehnung durch das Modell wird verständlich gemeldet', async () => {
    const { events } = await callStream(APP_PORT, cookie, '/api/analyze', { image: TINY_JPEG, hint: 'SZENARIO:refusal' });
    const error = events.find((event) => event.type === 'error');
    assert.equal(error?.code, 'REFUSED');
    assert.match(error.error, /abgelehnt/);
  });

  test('Abgeschnittene Antwort (Token-Limit)', async () => {
    const { events } = await callStream(APP_PORT, cookie, '/api/analyze', { image: TINY_JPEG, hint: 'SZENARIO:truncated' });
    assert.equal(events.find((event) => event.type === 'error')?.code, 'TRUNCATED');
  });

  test('Ungültiger API-Key und leeres Guthaben', async () => {
    const badKey = await callStream(APP_PORT, cookie, '/api/analyze', { image: TINY_JPEG, hint: 'SZENARIO:badkey' });
    assert.equal(badKey.events.find((event) => event.type === 'error')?.code, 'UPSTREAM_AUTH');
    const quota = await callStream(APP_PORT, cookie, '/api/analyze', { image: TINY_JPEG, hint: 'SZENARIO:quota' });
    assert.equal(quota.events.find((event) => event.type === 'error')?.code, 'QUOTA');
  });

  test('Abbruch im Browser bricht auch die OpenAI-Anfrage ab', async () => {
    const before = abortedUpstream;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    await assert.rejects(callStream(APP_PORT, cookie, '/api/analyze', { image: TINY_JPEG, hint: 'SZENARIO:slow' }, controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(abortedUpstream, before + 1);
  });

  test('Ausweichmodell, wenn das Hauptmodell nicht existiert', async () => {
    requests.length = 0;
    const { events } = await callStream(APP_PORT_FALLBACK, cookieFallback, '/api/analyze', { image: TINY_JPEG });
    const result = events.find((event) => event.type === 'result');
    assert.ok(result, JSON.stringify(events));
    assert.equal(result.data.model, 'gpt-5.6-luna');
    assert.deepEqual(
      requests.map((request) => request.body.model),
      ['gpt-nicht-da', 'gpt-5.6-luna'],
    );
  });

  test('Tageslimit greift', async () => {
    await callStream(APP_PORT_FALLBACK, cookieFallback, '/api/wiki', { topic: 'Zwei' });
    const { events } = await callStream(APP_PORT_FALLBACK, cookieFallback, '/api/wiki', { topic: 'Drei' });
    assert.equal(events.find((event) => event.type === 'error')?.code, 'DAILY_LIMIT');
  });
});
