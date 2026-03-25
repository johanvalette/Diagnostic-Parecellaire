// PyroRésilience Service Worker v2.0
const CACHE_NAME = 'pyro-v2';
const STATIC_ASSETS = [
  './PyroResilience.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.offline@2.2.0/dist/leaflet.offline.src.js',
  'https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js',
  'https://unpkg.com/leaflet-image@0.4.0/leaflet-image.js'
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => 
          cache.add(url).catch(err => console.warn('Cache miss:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for tiles (stored in localStorage by app), network-first for rest
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // For tile requests: try cache, then network
  if (url.hostname.includes('tile.openstreetmap') || 
      url.hostname.includes('mt0.google') ||
      url.hostname.includes('mt1.google') ||
      url.hostname.includes('mt2.google') ||
      url.hostname.includes('mt3.google')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // For app shell: cache-first
  if (STATIC_ASSETS.some(a => event.request.url.includes(a.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // For API calls (Open-Meteo): network-only, no cache
  if (url.hostname.includes('open-meteo') || url.hostname.includes('nominatim')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', {status: 503})));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
