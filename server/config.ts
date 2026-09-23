import crypto from 'node:crypto';

/**
 * Zentrale Konfiguration aus Umgebungsvariablen (siehe .env.example).
 * Lokal wird eine vorhandene .env-Datei automatisch geladen; in Coolify kommen die Werte aus der Oberfläche.
 * Bereits gesetzte Umgebungsvariablen haben Vorrang vor der .env-Datei.
 */
try {
  process.loadEnvFile();
} catch {
  // keine .env-Datei – normal im Container
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    console.warn(`[config] ${name}=${raw} ist ungültig – verwende ${fallback}.`);
    return fallback;
  }
  return value;
}

function readTrustProxy(raw: string | undefined): boolean | number | string {
  if (!raw || raw.trim() === '') return false;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value; // z. B. "loopback, 10.0.0.0/8"
}

const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffortSetting = (typeof REASONING_EFFORTS)[number];

function readReasoningEffort(raw: string | undefined): ReasoningEffortSetting | undefined {
  if (!raw || raw.trim() === '') return undefined;
  const value = raw.trim().toLowerCase();
  if ((REASONING_EFFORTS as readonly string[]).includes(value)) return value as ReasoningEffortSetting;
  console.warn(`[config] OPENAI_REASONING_EFFORT=${raw} ist ungültig – verwende den Modell-Standard.`);
  return undefined;
}

const IMAGE_DETAILS = ['low', 'high', 'auto', 'original'] as const;
export type ImageDetailSetting = (typeof IMAGE_DETAILS)[number];

function readImageDetail(raw: string | undefined): ImageDetailSetting {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'high';
  if ((IMAGE_DETAILS as readonly string[]).includes(value)) return value as ImageDetailSetting;
  console.warn(`[config] OPENAI_IMAGE_DETAIL=${raw} ist ungültig – verwende "high".`);
  return 'high';
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-terra';

export const config = {
  nodeEnv,
  isDev: nodeEnv !== 'production',
  port: readInt('PORT', 3000, 1, 65535),
  host: process.env.HOST?.trim() || '0.0.0.0',
  dataDir: process.env.DATA_DIR?.trim() || (nodeEnv === 'production' ? '' : './data'),
  maxProjectBytes: readInt('MAX_PROJECT_MB', 64, 1, 256) * 1024 * 1024,

  /** OpenAI – der Schlüssel verlässt den Server nie. */
  openaiApiKey: (process.env.OPENAI_API_KEY ?? '').trim(),
  model,
  wikiModel: process.env.OPENAI_WIKI_MODEL?.trim() || model,
  /** Optionales Ausweichmodell, falls das Hauptmodell nicht (mehr) verfügbar ist. */
  fallbackModel: process.env.OPENAI_FALLBACK_MODEL?.trim() || '',
  reasoningEffort: readReasoningEffort(process.env.OPENAI_REASONING_EFFORT),
  imageDetail: readImageDetail(process.env.OPENAI_IMAGE_DETAIL),
  maxOutputTokens: readInt('OPENAI_MAX_OUTPUT_TOKENS', 25_000, 1_000, 128_000),
  aiTimeoutMs: readInt('AI_TIMEOUT_MS', 180_000, 10_000, 900_000),
  /** Demo-Modus ohne echte KI (für Tests und Vorführungen ohne API-Key). */
  aiMock: ['1', 'true', 'yes'].includes((process.env.AI_MOCK ?? '').trim().toLowerCase()),

  /** Zugang – Passwort ist Pflicht. */
  accessPassword: process.env.APP_ACCESS_PASSWORD ?? '',
  sessionSecret: process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex'),
  sessionSecretIsEphemeral: !process.env.SESSION_SECRET?.trim(),
  sessionDays: readInt('SESSION_DAYS', 30, 1, 365),
  allowedOrigins: (process.env.APP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
  trustProxy: readTrustProxy(process.env.TRUST_PROXY),

  /** Kosten- und Missbrauchsschutz */
  aiRateLimit: readInt('AI_RATE_LIMIT', 30, 1, 10_000), // KI-Anfragen je IP und 15 Minuten
  aiDailyLimit: readInt('AI_DAILY_LIMIT', 200, 0, 1_000_000), // KI-Anfragen je Tag (Server gesamt), 0 = unbegrenzt
  maxImageBytes: readInt('MAX_IMAGE_MB', 8, 1, 30) * 1024 * 1024,
} as const;

export type AppConfig = typeof config;
