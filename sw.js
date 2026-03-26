// PyroRésilience Service Worker v2.3
const CACHE_NAME = 'pyro-v3';
const STATIC_ASSETS = [
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
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

// Activate: clean ALL old caches, claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME)
          .map(k => { console.log('Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tuiles satellite ESRI
  if (url.hostname.includes('arcgisonline.com')) {
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

  // Tuiles OSM (fallback carte)
  if (url.hostname.includes('tile.openstreetmap')) {
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

  // API météo : network-only, jamais en cache
  if (url.hostname.includes('open-meteo') || url.hostname.includes('nominatim') ||
      url.hostname.includes('archive-api')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { status: 503 })));
    return;
  }

  // App shell (index.html + libs) : network-first pour toujours avoir la dernière version
  if (STATIC_ASSETS.some(a => event.request.url.includes(a.replace('./', '')))) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Default: network avec fallback cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
