/*
 * ArtArchive AI – Service Worker
 * Macht die App-Hülle offline verfügbar (Sammlung ansehen/bearbeiten ohne Netz).
 * API-Aufrufe (/api/…) laufen immer direkt zum Server und werden nie zwischengespeichert.
 */
const CACHE = 'artarchive-v3';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];
const MAX_ASSETS = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('artarchive-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function trimAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) => new URL(request.url).pathname.startsWith('/assets/'));
  if (assets.length > MAX_ASSETS) {
    await Promise.all(assets.slice(0, assets.length - MAX_ASSETS).map((request) => cache.delete(request)));
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  // Seitenaufrufe: Netz zuerst (immer aktuelle Version), offline die zwischengespeicherte Hülle
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        } catch {
          return (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Gebaute Dateien mit Hash im Namen: Cache zuerst (ändern sich nie)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(async (cache) => {
            await cache.put(request, copy);
            await trimAssets(cache);
          });
        }
        return response;
      })(),
    );
    return;
  }

  // Übrige Dateien (Icons, Manifest): Netz zuerst, Cache als Rückfall
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })(),
  );
});
