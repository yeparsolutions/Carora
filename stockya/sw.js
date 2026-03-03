// ============================================================
// YEPARSTOCK — Service Worker (sw.js)
// Analogia: portero inteligente — deja pasar directo al backend
// y solo cachea los archivos visuales (HTML, CSS, JS, iconos)
// ============================================================

const CACHE_STATIC = 'yeparstock-static-v2';

// Solo cacheamos los archivos visuales — nada del backend
const ARCHIVOS_ESTATICOS = [
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Instalación ─────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log('[SW] Cacheando archivos estáticos');
      // addAll individual para que un fallo no bloquee todo
      return Promise.allSettled(
        ARCHIVOS_ESTATICOS.map(function(url) {
          return cache.add(url).catch(function(e) {
            console.warn('[SW] No se pudo cachear:', url, e);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar caches viejos ───────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_STATIC;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// ── Intercepción de peticiones ──────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Dejar pasar SIN interceptar todo lo que no sea GET
  // Analogia: el portero no revisa los camiones de carga, solo los visitantes
  if (event.request.method !== 'GET') return;

  // Dejar pasar SIEMPRE las peticiones al backend (puerto 8000)
  // Sin importar si es localhost o IP local (celular)
  if (url.port === '8000') return;

  // Dejar pasar peticiones a otros dominios (Google Fonts, CDNs)
  if (url.hostname !== self.location.hostname &&
      url.hostname !== '127.0.0.1' &&
      !url.hostname.startsWith('192.168.')) {
    return;
  }

  // Para archivos estáticos: Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});