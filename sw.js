// VR MovieDB — Service Worker
// Caches the app shell so it loads instantly and works offline

const CACHE_NAME = 'vr-moviedb-v3';
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
  const url = event.request.url;
  const method = event.request.method;

  // NEVER intercept POST requests — let them go straight to network
  // This is critical for Apps Script saves (no-cors POST)
  if (method === 'POST') return;

  // Google Sheets READ — network first, cache as fallback for offline
  if (url.includes('sheets.googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          // Only cache valid non-opaque responses
          if (resp && resp.status === 200 && resp.type === 'basic') {
            caches.open(CACHE_NAME).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Apps Script — never cache, always pass through
  if (url.includes('script.google.com')) return;

  // App shell & static assets — cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(CACHE_NAME).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        })
      )
  );
});
