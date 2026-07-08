// Service worker — precache the app shell for full offline use (NFR-3).
// Cache-first for our own assets; the app makes no other network calls (NFR-6).

const CACHE = 'kitchen-timer-v1';

const ASSETS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/util.js',
  'js/store.js',
  'js/engine.js',
  'js/sounds.js',
  'js/share.js',
  'js/dial.js',
  'js/dashboard.js',
  'js/newtimer.js',
  'js/sharepreview.js',
  'js/settings.js',
  'js/theme.js',
  'js/notify.js',
  'js/wakelock.js',
  'js/toast.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // Navigation requests (incl. share links) -> serve the app shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true })
        .then((r) => r || caches.match('.'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Runtime-cache same-origin GETs so subsequent loads are offline-ready.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    }),
  );
});
