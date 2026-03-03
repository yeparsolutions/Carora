// ============================================================
// YEPARSTOCK — Service Worker (sw.js)
// Analogia: es el empleado de guardia que trabaja 24/7 —
// intercepta las peticiones y decide qué mostrar.
// Estrategia: Network First para la API (siempre datos frescos)
//             Cache First para assets estáticos (carga rápida)
// ============================================================

const CACHE_NAME    = 'yeparstock-v1';
const CACHE_STATIC  = 'yeparstock-static-v1';

// Archivos que se cachean al instalar la PWA
// Analogia: el empleado memoriza lo esencial antes de abrir el negocio
const ARCHIVOS_ESTATICOS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Instalación: pre-cachear archivos estáticos ─────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function(cache) {
      console.log('[SW] Pre-cacheando archivos estáticos');
      return cache.addAll(ARCHIVOS_ESTATICOS);
    }).catch(function(err) {
      console.warn('[SW] Error pre-cacheando:', err);
    })
  );
  // Activar inmediatamente sin esperar recarga
  self.skipWaiting();
});

// ── Activación: limpiar caches viejos ───────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          // Eliminar caches que no sean la versión actual
          return key !== CACHE_STATIC && key !== CACHE_NAME;
        }).map(function(key) {
          console.log('[SW] Eliminando cache viejo:', key);
          return caches.delete(key);
        })
      );
    })
  );
  // Tomar control de todas las pestañas abiertas
  self.clients.claim();
});

// ── Intercepción de peticiones ──────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Las peticiones a la API siempre van a la red (datos en tiempo real)
  // Analogia: para saber el precio actual, siempre preguntamos al sistema central
  if (url.hostname === 'localhost' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para archivos estáticos: Cache First (si está en cache, usarlo)
  // Si no está, buscar en red y guardarlo para la próxima
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(function(response) {
        // Solo cachear respuestas válidas de nuestro dominio
        if (response && response.status === 200 && response.type === 'basic') {
          var responseClone = response.clone();
          caches.open(CACHE_STATIC).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        // Sin internet y sin cache — mostrar página offline
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
