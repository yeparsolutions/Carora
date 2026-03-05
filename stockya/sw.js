// SW simplificado — Network First para JS/HTML, cache solo como fallback
const CACHE_STATIC = 'yeparstock-static-v3';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.port === '8000') return;

  // JS, HTML y CSS siempre desde red — nunca cache
  var ext = url.pathname.split('.').pop();
  if (['js','html','css'].includes(ext) || url.pathname === '/') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Iconos e imágenes: cache normal
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_STATIC).then(function(cache) { cache.put(event.request, clone); });
        return response;
      });
    })
  );
});
