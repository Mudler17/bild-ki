import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { clearSessionCookie, isAuthenticated, passwordMatches, requireAuth, setSessionCookie } from './auth.js';
import { AiError, aiAvailable, analyzeArtwork, dailyUsage, writeWikiArticle } from './ai.js';
import { ValidationError, parseAnalyzeRequest, parseWikiRequest } from './validate.js';
import { ProjectError, ProjectStore } from './projects.js';

export const APP_VERSION = '2.1.0';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

// ---------- Start-Prüfung: ohne Passwort kein Start (fail closed) ----------

function checkStartup(): void {
  if (!config.accessPassword) {
    console.error('[start] APP_ACCESS_PASSWORD fehlt. Die App startet nur mit Passwortschutz – bitte setzen.');
    process.exit(1);
  }
  if (config.accessPassword.length < 12) {
    console.warn('[start] APP_ACCESS_PASSWORD ist kürzer als 12 Zeichen – bitte ein längeres Passwort wählen.');
  }
  if (config.sessionSecretIsEphemeral) {
    console.warn('[start] SESSION_SECRET fehlt – Anmeldungen verfallen bei jedem Neustart.');
  }
  if (config.aiMock) {
    console.warn('[start] AI_MOCK ist aktiv – es werden Demo-Antworten statt echter KI geliefert.');
  } else if (!config.openaiApiKey) {
    console.warn('[start] OPENAI_API_KEY fehlt – KI-Funktionen sind deaktiviert.');
  }
  if (!config.isDev && config.trustProxy === false) {
    console.warn('[start] TRUST_PROXY ist nicht gesetzt. Hinter Cloudflare + Traefik: TRUST_PROXY=2.');
  }
}

// ---------- Hilfsfunktionen ----------

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: message, code });
}

/** Schutz gegen fremde Seiten (CSRF): POSTs nur vom eigenen Ursprung. */
function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  let allowed = false;
  if (config.allowedOrigins.length > 0) {
    allowed = config.allowedOrigins.includes(origin.replace(/\/+$/, ''));
  } else {
    try {
      allowed = new URL(origin).host === req.get('host');
    } catch {
      allowed = false;
    }
  }
  if (allowed) {
    next();
    return;
  }
  sendError(res, 403, 'BAD_ORIGIN', 'Anfrage von fremdem Ursprung abgelehnt.');
}

/**
 * Lange KI-Anfragen als Event-Stream beantworten: Header sofort senden, alle 10 s ein Ping.
 * So greift das Zeitlimit von Proxys wie Cloudflare nicht (Fehler 524 nach 125 s ohne Antwort).
 * Bricht der Browser ab, wird auch die OpenAI-Anfrage abgebrochen (spart Kosten).
 */
async function streamJob(res: Response, job: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': start\n\n');

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 10_000);
  try {
    const data = await job(controller.signal);
    res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
  } catch (error) {
    const aiError =
      error instanceof AiError ? error : new AiError(500, 'INTERNAL', 'Unerwarteter Fehler bei der KI-Anfrage.');
    if (!(error instanceof AiError)) console.error('[api] Unerwarteter Fehler:', error);
    if (!controller.signal.aborted) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', status: aiError.status, code: aiError.code, error: aiError.message })}\n\n`,
      );
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- App ----------

export async function createApp(): Promise<express.Express> {
  if (!config.dataDir) throw new Error('DATA_DIR fehlt. Bitte einen dauerhaften Datenspeicher einrichten (Coolify: /app/data).');
  const projects = new ProjectStore(path.resolve(config.dataDir, 'projects'));
  await projects.open();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: config.isDev
        ? false
        : {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              workerSrc: ["'self'"],
              manifestSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
            },
          },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.isDev ? false : { maxAge: 15_552_000, includeSubDomains: false },
    }),
  );
  // Private App: nicht in Suchmaschinen aufnehmen
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, version: APP_VERSION });
  });

  // ---------- API ----------
  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(originGuard);
  // Kleine Anfragen: kleines Limit. Nur die Bildanalyse darf groß sein – und erst nach der Anmeldeprüfung.
  const smallJson = express.json({ limit: '64kb' });
  const imageJson = express.json({ limit: Math.ceil(config.maxImageBytes * 1.37) + 256 * 1024 });
  const projectJson = express.json({ limit: config.maxProjectBytes });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.', code: 'RATE_LIMIT' },
  });

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.aiRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Zu viele KI-Anfragen in kurzer Zeit. Bitte etwas warten.', code: 'RATE_LIMIT' },
  });

  api.get('/session', (req, res) => {
    const authenticated = isAuthenticated(req);
    res.json({
      authenticated,
      version: APP_VERSION,
      ...(authenticated
        ? {
            aiAvailable: aiAvailable(),
            mock: config.aiMock,
            model: config.aiMock ? 'demo' : config.model,
            usage: dailyUsage(),
          }
        : {}),
    });
  });

  api.post('/login', loginLimiter, smallJson, async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 512 || !passwordMatches(password)) {
      await wait(400);
      sendError(res, 401, 'INVALID_PASSWORD', 'Das Passwort ist falsch.');
      return;
    }
    setSessionCookie(req, res);
    res.status(204).end();
  });

  api.post('/logout', smallJson, (req, res) => {
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  // Personal archive: the existing password grants access to this one collection.
  api.get('/projects', requireAuth, (_req, res) => res.json({ archiveId: projects.archiveId, projects: projects.list() }));
  api.get('/projects/:id', requireAuth, async (req, res) => {
    res.json(await projects.get(String(req.params.id)));
  });
  api.put('/projects/:id', requireAuth, projectJson, async (req, res) => {
    res.json(await projects.put(String(req.params.id), req.body?.expectedRevision, req.body?.project));
  });
  api.delete('/projects/:id', requireAuth, smallJson, async (req, res) => {
    await projects.remove(String(req.params.id), req.body?.expectedRevision);
    res.status(204).end();
  });

  api.post('/analyze', requireAuth, aiLimiter, imageJson, async (req, res) => {
    const input = parseAnalyzeRequest(req.body, config.maxImageBytes);
    if (!aiAvailable()) {
      sendError(res, 503, 'NOT_CONFIGURED', 'Auf dem Server ist kein OPENAI_API_KEY hinterlegt.');
      return;
    }
    await streamJob(res, (signal) => analyzeArtwork(input, signal));
  });

  api.post('/wiki', requireAuth, aiLimiter, smallJson, async (req, res) => {
    const input = parseWikiRequest(req.body);
    if (!aiAvailable()) {
      sendError(res, 503, 'NOT_CONFIGURED', 'Auf dem Server ist kein OPENAI_API_KEY hinterlegt.');
      return;
    }
    await streamJob(res, (signal) => writeWikiArticle(input, signal));
  });

  api.use((_req, res) => {
    sendError(res, 404, 'NOT_FOUND', 'Unbekannter API-Endpunkt.');
  });

  api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof ValidationError || error instanceof ProjectError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    if (error instanceof AiError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }
    const type = (error as { type?: string } | null)?.type;
    if (type === 'entity.too.large') {
      sendError(res, 413, 'TOO_LARGE', 'Die Anfrage ist zu groß.');
      return;
    }
    if (type === 'entity.parse.failed') {
      sendError(res, 400, 'INVALID_JSON', 'Ungültige Anfrage (JSON).');
      return;
    }
    console.error('[api] Fehler:', error);
    sendError(res, 500, 'INTERNAL', 'Interner Serverfehler.');
  });

  app.use('/api', api);

  // ---------- Frontend ----------
  if (config.isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: rootDir, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const indexHtml = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      console.error('[start] dist/index.html fehlt – bitte zuerst "npm run build" ausführen.');
      process.exit(1);
    }
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '365d', index: false, fallthrough: false }),
    );
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || path.extname(req.path)) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  return app;
}

// ---------- Start ----------

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  checkStartup();
  const app = await createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(
      `[start] ArtArchive AI v${APP_VERSION} läuft auf http://${config.host}:${config.port} ` +
        `(${config.isDev ? 'Entwicklung' : 'Produktion'}, Modell: ${config.aiMock ? 'Demo' : config.model})`,
    );
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
