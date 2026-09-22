import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/**
 * Passwortschutz (APP_ACCESS_PASSWORD ist Pflicht).
 * Sitzung = HMAC-signiertes Cookie (HttpOnly, SameSite=Strict, Secure hinter HTTPS).
 * Der Signaturschlüssel hängt auch vom Passwort ab: Passwort ändern = alle Sitzungen ungültig.
 */

const COOKIE_NAME = 'artarchive_session';
const DAY_MS = 24 * 60 * 60 * 1000;

const signingKey = crypto
  .createHash('sha256')
  .update(`${config.sessionSecret}|${config.accessPassword}`)
  .digest();

function sign(payload: string): string {
  return crypto.createHmac('sha256', signingKey).update(payload).digest('base64url');
}

function createToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, exp: Date.now() + config.sessionDays * DAY_MS, n: crypto.randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export function isAuthenticated(req: Request): boolean {
  if (!config.accessPassword) return false; // ohne Passwort kein Zugang (fail closed)
  return verifyToken(readCookie(req, COOKIE_NAME));
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthenticated(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Anmeldung erforderlich.', code: 'AUTH_REQUIRED' });
}

export function passwordMatches(input: string): boolean {
  if (!config.accessPassword) return false;
  const given = crypto.createHash('sha256').update(input, 'utf8').digest();
  const expected = crypto.createHash('sha256').update(config.accessPassword, 'utf8').digest();
  return crypto.timingSafeEqual(given, expected);
}

export function setSessionCookie(req: Request, res: Response): void {
  res.cookie(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: config.sessionDays * DAY_MS,
    path: '/',
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
}
