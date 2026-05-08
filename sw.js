// VR MovieDB — Service Worker
// Caches the app shell so it loads instantly and works offline

const CACHE_NAME = 'vr-moviedb-v2';
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

// Fetch strategy:
// - App shell (HTML/CSS/JS) → Cache first, network fallback
// - Google Sheets API       → Network first (always fresh data), cache fallback
// - Images / fonts          → Cache first
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Google Sheets API — always try network first for fresh data
  if (url.includes('sheets.googleapis.com') || url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else — cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return resp;
        })
      )
  );
});
