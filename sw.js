// VR MovieDB — Service Worker
// Caches the app shell so it loads instantly and works offline
const CACHE_NAME = 'vr-moviedb-v4';
const APP_SHELL  = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/google-sheets-loader.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// Install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url    = event.request.url;
  const method = event.request.method;

  // NEVER intercept POST requests
  if (method === 'POST') return;

  // NEVER cache API calls — always network first, no fallback
  // This covers /api/movies (Vercel proxy) and any future API routes
  if (url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Apps Script — never cache, always pass through
  if (url.includes('script.google.com')) return;

  // Legacy: sheets.googleapis.com direct calls — network first, cache as offline fallback
  if (url.includes('sheets.googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const respToCache = resp.clone(); // ← clone BEFORE returning
            caches.open(CACHE_NAME).then(c => c.put(event.request, respToCache));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell & static assets — cache first, fallback to network
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            const respToCache = resp.clone(); // ← clone BEFORE returning
            caches.open(CACHE_NAME).then(c => c.put(event.request, respToCache));
          }
          return resp;
        });
      })
  );
});
