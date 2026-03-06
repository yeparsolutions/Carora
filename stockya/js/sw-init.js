/**
 * ============================================================
 * YEPARSTOCK — Archivo: js/sw-init.js
 * Descripcion: Inicialización del Service Worker (PWA) y
 *              función de fallback del logo de login.
 *
 * Este código fue separado del HTML inline para cumplir con
 * la política CSP script-src 'self' que bloquea scripts inline.
 *
 * Analogia: el portero (CSP) no acepta instrucciones verbales
 * (onclick/script inline). Solo admite documentos firmados
 * (archivos .js servidos desde el mismo servidor).
 * ============================================================
 */

// ── Service Worker (PWA) ──────────────────────────────────────
// [SEC-10] Verificar que no haya un SW activo antes de registrar.
// Evita registros duplicados que pueden causar caché inconsistente.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {

    // Buscar si ya existe un SW registrado para este scope
    navigator.serviceWorker.getRegistration('./').then(function (existingReg) {
      if (!existingReg) {
        // Solo registrar si no hay uno previo activo
        navigator.serviceWorker.register('sw.js')
          .then(function (reg) {
            console.log('[PWA] Service Worker registrado:', reg.scope);
          })
          .catch(function (err) {
            console.warn('[PWA] Error registrando Service Worker:', err);
          });
      } else {
        console.log('[PWA] Service Worker ya activo:', existingReg.scope);
      }
    });

  });
}

// ── Fallback del logo de login ────────────────────────────────
// [SEC-8] Función centralizada llamada por el atributo onerror
// del <img id="logoImg">. Si la imagen falla al cargar,
// muestra el div de fallback con las iniciales del negocio.
function logoFallbackHandler() {
  var img      = document.getElementById('logoImg');
  var fallback = document.getElementById('logoFallback');
  if (img)      img.style.display      = 'none';
  if (fallback) fallback.style.display = 'flex';
}
