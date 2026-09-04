const CACHE_NAME = 'ticker-pocket-v5.4.3';
const STATIC_ASSETS = [
  './',
  './mobile.html',
  './mobile.css?v=5.4.3',
  './mobile.js?v=5.4.3',
  './manifest.json',
  './apple-touch-icon.png'
];

// Install: Pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline shell');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for static assets, Network-only/fallback for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API endpoints (Google Apps Script, /api/*)
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Network failed (e.g. computer is off) - fallback to cached response
        console.log('[SW] Network offline, serving cached shell asset:', event.request.url);
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
