import type { AnalysisResult, FocusArea, SessionInfo, Project } from '../types';

/** Zugriff auf den eigenen Server. Der OpenAI-Schlüssel ist nie im Browser. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const AUTH_REQUIRED_EVENT = 'artarchive:auth-required';

function notifyAuthRequired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Serverfehler (${response.status}).`;
  let code: string | undefined;
  try {
    const data = (await response.json()) as { error?: string; code?: string };
    if (data.error) message = data.error;
    code = data.code;
  } catch {
    // keine JSON-Antwort (z. B. Proxy-Fehlerseite)
    if (response.status === 413) message = 'Die Daten sind zu groß für den Server.';
    if (response.status === 502 || response.status === 504 || response.status === 524) {
      message = 'Der Server hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.';
    }
  }
  if (response.status === 401 && code === 'AUTH_REQUIRED') notifyAuthRequired();
  return new ApiError(response.status, code, message);
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Keine Verbindung zum Server.');
  }
  if (!response.ok) throw await readError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * KI-Endpunkte antworten als Event-Stream (Ping alle 10 s), damit Proxy-Timeouts
 * (z. B. Cloudflare nach 125 s) lange Analysen nicht abbrechen.
 */
async function requestStream<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError(499, 'ABORTED', 'Abgebrochen.');
    throw new ApiError(0, 'NETWORK', error instanceof Error && error.name === 'AbortError' ? 'Abgebrochen.' : 'Keine Verbindung zum Server.');
  }
  if (!response.ok) throw await readError(response);
  if (!response.body) throw new ApiError(502, 'NO_BODY', 'Leere Antwort vom Server.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          const event = JSON.parse(data) as
            | { type: 'result'; data: T }
            | { type: 'error'; status: number; code?: string; error: string };
          if (event.type === 'result') return event.data;
          if (event.type === 'error') throw new ApiError(event.status, event.code, event.error);
        }
        boundary = buffer.indexOf('\n\n');
      }
      if (done) break;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw new ApiError(499, 'ABORTED', 'Abgebrochen.');
    throw new ApiError(502, 'STREAM', 'Die Verbindung wurde unterbrochen. Bitte erneut versuchen.');
  } finally {
    reader.releaseLock();
  }
  throw new ApiError(502, 'STREAM', 'Die Verbindung wurde vorzeitig beendet.');
}

export interface AnalyzePayload {
  image: string;
  focusAreas: FocusArea[];
  hint: string;
  known: { title?: string; artist?: string; year?: string; medium?: string; dimensions?: string };
}

export interface WikiPayload {
  topic: string;
  projectName: string;
  artworkTitles: string[];
  entryTitles: string[];
}

export const api = {
  projects: (signal?: AbortSignal) => requestJson<{ archiveId: string; projects: { id: string; revision: string }[] }>('/api/projects', { signal }),
  project: (id: string, signal?: AbortSignal) => requestJson<{ revision: string; project: Project }>(`/api/projects/${encodeURIComponent(id)}`, { signal }),
  saveProject: (project: Project, expectedRevision: string | null, signal?: AbortSignal) =>
    requestJson<{ revision: string }>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT', body: JSON.stringify({ project, expectedRevision }), signal,
    }),
  deleteProject: (id: string, expectedRevision: string, signal?: AbortSignal) =>
    requestJson<void>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: JSON.stringify({ expectedRevision }), signal,
    }),
  session: () => requestJson<SessionInfo>('/api/session'),
  login: (password: string) => requestJson<void>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => requestJson<void>('/api/logout', { method: 'POST', body: '{}' }),
  analyze: (payload: AnalyzePayload, signal?: AbortSignal) =>
    requestStream<{ result: AnalysisResult; model: string; mock: boolean }>('/api/analyze', payload, signal),
  wiki: (payload: WikiPayload, signal?: AbortSignal) =>
    requestStream<{ content: string; model: string; mock: boolean }>('/api/wiki', payload, signal),
};
