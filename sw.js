const CACHE_NAME = 'ticker-pocket-v5.5.0';
const STATIC_ASSETS = [
  './',
  './mobile.html',
  './mobile.css?v=5.5.0',
  './mobile.js?v=5.5.0',
  './manifest.json',
  './apple-touch-icon.png'
];

// Install: Pre-cache static shell & force activation immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline shell v5.5.0');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Delete all old caches and take control of all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for HTML/JS/CSS so phones always get the latest code online,
// while falling back to cache when offline (computer is off / airplane mode).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Google APIs, Apps Script, or local server APIs
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Network-First strategy for application assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network offline (e.g. computer off, no signal) -> serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./mobile.html');
          }
        });
      })
  );
});
