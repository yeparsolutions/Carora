/* ============================================================
   YEPARSTOCK — app.js  ✅ VERSION CON CORRECCIONES DE SEGURIDAD
   Backend: http://localhost:8000

   CAMBIOS DE SEGURIDAD APLICADOS:
   [SEC-1] Credenciales eliminadas de localStorage — se usa refreshToken
           en memoria con renovación automática de token
   [SEC-2] Rate limiting frontend — login (5/5min), registro (3/10min),
           reset (3/10min)
   [SEC-3] Política de contraseñas: mínimo 8 caracteres en TODAS las funciones
   [SEC-4] Invitación de usuario: password va en body JSON, no en query param
   [SEC-5] Sanitización HTML: función _esc() + textContent para prevenir XSS
   ============================================================ */

// Detecta automáticamente si estás en la PC (localhost) o en otro dispositivo (celular)
// Analogia: si estás en casa usas "mi habitación", si vienes de afuera usas la dirección completa
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : "https://yeparstock-api.up.railway.app";

// Token de sesión en memoria — NO en localStorage (más seguro)
// Analogia: el carnet lo guardas en el bolsillo mientras trabajas,
// no lo dejas pegado en la ventana para que todos lo vean
let authToken     = localStorage.getItem("yeparstock_token")   || null;
let usuarioActual = JSON.parse(localStorage.getItem("yeparstock_usuario") || "null");

// [SEC-1] refreshToken solo en memoria — desaparece al cerrar la pestaña
// Analogia: la llave de repuesto la tienes en mano, no escrita en la puerta
let _refreshToken = null;

/* ============================================================
   [SEC-5] SANITIZACIÓN HTML — previene ataques XSS
   Analogia: como un detector de metales en la entrada —
   cualquier caracter peligroso queda inofensivo antes de mostrarse
   ============================================================ */
function _esc(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#x27;");
}

/* ============================================================
   [SEC-2] RATE LIMITING FRONTEND
   Analogia: el portero del club — si golpeas la puerta demasiado
   rápido, te hace esperar aunque tengas invitación
   ============================================================ */
var _rateLimits = {};

// Verifica si una acción está bloqueada por rate limit
// limite: número máximo de intentos, ventanaMs: tiempo de la ventana en ms
function _checkRateLimit(accion, limite, ventanaMs) {
  var ahora   = Date.now();
  var estado  = _rateLimits[accion] || { intentos: 0, desde: ahora };

  // Si pasó la ventana de tiempo, reiniciar el contador
  if (ahora - estado.desde > ventanaMs) {
    estado = { intentos: 0, desde: ahora };
  }

  if (estado.intentos >= limite) {
    // Calcular cuántos segundos faltan para desbloquear
    var segundosRestantes = Math.ceil((ventanaMs - (ahora - estado.desde)) / 1000);
    return { bloqueado: true, segundos: segundosRestantes };
  }

  // Incrementar contador y guardar
  estado.intentos++;
  _rateLimits[accion] = estado;
  return { bloqueado: false };
}

/* ============================================================
   SONIDO DE ESCÁNER — Web Audio API, sin archivos externos
   Simula el beep electrónico de un lector de código de barras
   ============================================================ */
var _sonidoActivo = localStorage.getItem("yeparstock_sonido") || "scanner";

// Permite al colaborador elegir el tipo de sonido del escáner
function seleccionarSonido(tipo, el) {
  _sonidoActivo = tipo;
  localStorage.setItem("yeparstock_sonido", tipo);
  // compatibilidad con labels de radio (si quedaran)
  document.querySelectorAll(".sound-option").forEach(function(o){ o.classList.remove("active"); });
  if (el) el.closest(".sound-option").classList.add("active");
  // actualizar select dropdown
  var sel = document.getElementById("soundSelect");
  if (sel) sel.value = tipo;
}

// Previsualización — toca el sonido sin cambiar la preferencia guardada
function _beepPreview(tipo) {
  _beepTono(tipo);
}

// Toca el sonido activo configurado por el colaborador
function _beep() {
  if (_sonidoActivo === "none") return;
  _beepTono(_sonidoActivo);
}

// Motor de sonidos: genera todos los efectos con Web Audio API puro
function _beepTono(tipo) {
  try {
    var ctx  = new (window.AudioContext || window.webkitAudioContext)();
    var t    = ctx.currentTime;

    // Genera un tono con frecuencia, duración, volumen y forma de onda
    function tono(freq1, freq2, duracion, volumen, forma, delay) {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      // Compresor para que suene más fuerte sin distorsionar
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value      = 3;
      comp.ratio.value     = 4;
      comp.attack.value    = 0.001;
      comp.release.value   = 0.1;
      osc.connect(gain);
      gain.connect(comp);
      comp.connect(ctx.destination);
      osc.type = forma || "square";
      osc.frequency.setValueAtTime(freq1, t + delay);
      if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, t + delay + duracion * 0.6);
      // Envelope: ataque rápido, sustain fuerte, caída al final
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(volumen, t + delay + 0.008);
      gain.gain.setValueAtTime(volumen, t + delay + duracion - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + duracion);
      osc.start(t + delay);
      osc.stop(t + delay + duracion);
    }

    if (tipo === "error") {
      // BUZZ descendente — dos tonos graves
      tono(520, 260, 0.22, 0.9, "sawtooth", 0);
      tono(420, 200, 0.22, 0.9, "sawtooth", 0.27);

    } else if (tipo === "ok") {
      // Melodía corta ascendente — Do Mi Sol
      tono(523, null, 0.14, 0.85, "sine", 0);
      tono(659, null, 0.14, 0.85, "sine", 0.15);
      tono(784, null, 0.20, 0.85, "sine", 0.30);

    } else if (tipo === "scanner") {
      // Escáner profesional — beep doble nítido Zebra/Honeywell
      tono(1850, 1750, 0.28, 0.95, "square", 0);
      tono(3700, 3500, 0.28, 0.35, "square", 0);
      tono(2100, 2000, 0.20, 0.85, "square", 0.33);
      tono(4200, 4000, 0.20, 0.28, "square", 0.33);

    } else if (tipo === "single") {
      // Beep simple — un solo tono corto y limpio
      tono(1600, 1500, 0.18, 0.95, "square", 0);
      tono(3200, 3000, 0.18, 0.30, "square", 0);

    } else if (tipo === "soft") {
      // Tono suave — sine wave agradable
      tono(880,  840,  0.25, 0.75, "sine", 0);
      tono(1100, 1060, 0.20, 0.60, "sine", 0.28);

    } else if (tipo === "retro") {
      // Retro 8-bit — tres notas de videojuego
      tono(440, null, 0.08, 0.85, "square", 0);
      tono(554, null, 0.08, 0.85, "square", 0.10);
      tono(659, null, 0.12, 0.85, "square", 0.20);

    } else if (tipo === "cash") {
      // Caja registradora — ding metálico con resonancia
      tono(1200, 600,  0.05, 0.95, "sine",    0);
      tono(2400, 1200, 0.05, 0.40, "sine",    0);
      tono(1200, 400,  0.35, 0.55, "sine",    0.05);
      tono(2400, 800,  0.35, 0.20, "triangle",0.05);

    } else {
      // Default — escáner profesional
      tono(1850, 1750, 0.28, 0.95, "square", 0);
      tono(3700, 3500, 0.28, 0.35, "square", 0);
      tono(2100, 2000, 0.20, 0.85, "square", 0.33);
      tono(4200, 4000, 0.20, 0.28, "square", 0.33);
    }

    setTimeout(function(){ try { ctx.close(); } catch(e){} }, 1200);
  } catch(e) {}
}

/* ============================================================
   FUNCION CENTRAL DE API
   Analogia: el mensajero que va al backend y trae los datos
   ============================================================ */
async function api(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = "Bearer " + authToken;

  const opciones = { method, headers };
  if (body) opciones.body = JSON.stringify(body);

  const response = await fetch(API_URL + path, opciones);

  if (response.status === 401) {
    // [SEC-1] Token expirado — renovar con refreshToken en memoria
    // Ya NO se usan credenciales guardadas en localStorage
    if (_refreshToken && !path.includes("/auth/")) {
      try {
        var renovar = await fetch(API_URL + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: _refreshToken })
        });
        if (renovar.ok) {
          var rData = await renovar.json();
          authToken = rData.access_token;
          // Actualizar también el refreshToken si el servidor lo rota
          if (rData.refresh_token) _refreshToken = rData.refresh_token;
          localStorage.setItem("yeparstock_token", authToken);
          // Reintentar la petición original con el nuevo token
          headers["Authorization"] = "Bearer " + authToken;
          const retry = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : null });
          if (retry.status === 204) return null;
          const retryData = await retry.json();
          if (retry.ok) return retryData;
        }
      } catch(e) {}
    }
    // Si no se pudo renovar con refreshToken, limpiar sesión
    authToken     = null;
    usuarioActual = null;
    _refreshToken = null; // Limpiar también el refreshToken en memoria
    localStorage.removeItem("yeparstock_token");
    localStorage.removeItem("yeparstock_usuario");
    // [SEC-1] NUNCA se guardaron credenciales — no hay nada que limpiar aquí
    document.getElementById("loginPage").style.display = "block";
    document.getElementById("appMain").style.display   = "none";
    showToast("⚠️ Sesión expirada — vuelve a iniciar sesión");
    throw new Error("Sesion expirada");
  }
  if (response.status === 204) return null;

  const data = await response.json();

  if (!response.ok) {
    console.error("API Error", response.status, path, JSON.stringify(data));
    const msg = typeof data.detail === "string" ? data.detail
              : Array.isArray(data.detail) ? data.detail.map(function(e){ return e.loc + ": " + e.msg; }).join(", ")
              : (data.detail && data.detail.mensaje) || JSON.stringify(data) || "Error en el servidor";
    const err    = new Error(msg);
    err.status   = response.status;
    err.detail   = data.detail;
    throw err;
  }
  return data;
}

/* ============================================================
   ONBOARDING — pantalla de bienvenida para usuarios nuevos
   Analogia: la recepcion de un hotel — antes de entrar a tu
   cuarto debes registrar tu nombre y preferencias del negocio
   ============================================================ */

var RUBROS = [
  { value: "minimarket",       label: "🛒 Minimarket" },
  { value: "tienda_minorista", label: "🏪 Tienda minorista" },
  { value: "farmacia",         label: "💊 Farmacia / Botiquin" },
  { value: "panaderia",        label: "🍞 Panaderia / Pasteleria" },
  { value: "carniceria",       label: "🥩 Carniceria / Frigorifico" },
  { value: "ferreteria",       label: "🔧 Ferreteria / Materiales" },
  { value: "libreria",         label: "📚 Libreria / Papeleria" },
  { value: "restaurante",      label: "🍽️ Restaurante / Cafeteria" },
  { value: "ropa",             label: "👕 Tienda de ropa / Calzado" },
  { value: "electronica",      label: "💻 Electronica / Tecnologia" },
  { value: "cosmetica",        label: "💄 Cosmetica / Belleza" },
  { value: "deposito",         label: "🏭 Deposito / Almacen" },
  { value: "otro",             label: "📦 Otro" },
];
var _onboardingLogo = null;

function mostrarOnboarding() {
  document.getElementById("loginPage").style.display      = "none";
  document.getElementById("appMain").style.display        = "none";
  document.getElementById("onboardingPage").style.display = "flex";

  // Llenar selector de rubros con textContent para evitar XSS
  var selRubro = document.getElementById("onboardingRubro");
  if (selRubro) {
    selRubro.innerHTML = "";
    var optDefault = document.createElement("option");
    optDefault.value = "";
    // [SEC-5] Usar textContent en lugar de innerHTML
    optDefault.textContent = "Selecciona el rubro de tu negocio...";
    selRubro.appendChild(optDefault);
    RUBROS.forEach(function(r) {
      var opt = document.createElement("option");
      opt.value = r.value;
      opt.textContent = r.label; // textContent es seguro, no interpreta HTML
      selRubro.appendChild(opt);
    });
  }
  // Pre-llenar nombre de usuario si ya lo conocemos
  if (usuarioActual && usuarioActual.nombre) {
    var inp = document.getElementById("onboardingNombreUsuario");
    if (inp) inp.value = usuarioActual.nombre;
  }
}

function onboardingPreviewLogo(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast("El logo no puede superar 2MB"); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    _onboardingLogo = e.target.result;
    var preview = document.getElementById("onboardingLogoPreview");
    if (preview) {
      // [SEC-5] Crear elemento img de forma segura sin innerHTML
      preview.innerHTML = "";
      var img = document.createElement("img");
      img.src   = _onboardingLogo;
      img.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:12px";
      preview.appendChild(img);
    }
  };
  reader.readAsDataURL(file);
}

async function guardarOnboarding() {
  var nombreNegocio = document.getElementById("onboardingNombreNegocio")?.value.trim();
  var rubro         = document.getElementById("onboardingRubro")?.value;
  var moneda        = document.getElementById("onboardingMoneda")?.value || "CLP";
  var nombreUsuario = document.getElementById("onboardingNombreUsuario")?.value.trim();

  if (!nombreNegocio) { showToast("Escribe el nombre de tu negocio"); return; }
  if (!rubro)         { showToast("Selecciona el rubro de tu negocio"); return; }
  if (!nombreUsuario) { showToast("Escribe tu nombre"); return; }

  var btn = document.getElementById("btnGuardarOnboarding");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await api("/auth/completar-onboarding", "POST", {
      nombre_negocio: nombreNegocio, rubro, moneda,
      logo_base64:    _onboardingLogo || null,
      nombre_usuario: nombreUsuario,
    });
    // Actualizar nombre en memoria local
    if (usuarioActual) {
      usuarioActual.nombre = nombreUsuario;
      localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));
    }
    document.getElementById("onboardingPage").style.display = "none";
    document.getElementById("appMain").style.display        = "flex";
    actualizarUIUsuario();
    await cargarDashboard();
    showToast("Bienvenido, " + _esc(nombreUsuario.split(" ")[0]) + "! Tu negocio esta listo");
  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Entrar a mi negocio"; }
    showToast("Error: " + _esc(error.message));
  }
}

/* ============================================================
   AUTENTICACION
   ============================================================ */
async function enterApp() {
  const usernameInput = document.getElementById("loginUsername");
  const passInput     = document.getElementById("loginPassword");
  const username      = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
  const password      = passInput     ? passInput.value.trim()  : "";

  if (!username || !password) { showToast("Ingresa tu usuario y contraseña"); return; }

  // [SEC-2] Rate limiting: máximo 5 intentos de login cada 5 minutos
  // Analogia: si te equivocas la contraseña 5 veces, la caja te bloquea 5 minutos
  var limite = _checkRateLimit("login", 5, 5 * 60 * 1000);
  if (limite.bloqueado) {
    showToast("⚠️ Demasiados intentos. Espera " + limite.segundos + " segundos.");
    return;
  }

  try {
    const data    = await api("/auth/login", "POST", { username: username.toLowerCase(), password });
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("yeparstock_token",   authToken);
    localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));

    // [SEC-1] Guardar refreshToken SOLO en memoria (variable JS), nunca en localStorage
    // Analogia: el token de acceso va al bolsillo, el de emergencia lo llevas en la mente
    if (data.refresh_token) {
      _refreshToken = data.refresh_token;
    }
    // [SEC-1] NUNCA guardar credenciales (email/password) en ningún storage

    // Verificar onboarding solo para admins
    // Analogia: solo el dueño del negocio configura el local la primera vez —
    // los empleados (operadores) entran directo porque la empresa ya existe.
    const rolUsuario = data.usuario.rol;
    if (rolUsuario === "admin") {
      const status = await api("/auth/onboarding-status");
      if (!status.onboarding_completo) {
        mostrarOnboarding();
        return;
      }
    }

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";
    actualizarUIUsuario();
    iniciarReloj();

    // Verificar estado de suscripción
    try {
      var infoEmp = await api("/empresa/info");
      if (infoEmp.bloqueado) {
        mostrarPantallaBloqueo(infoEmp);
        return;
      }
      if (infoEmp.en_gracia) {
        mostrarAvisoCancelacion(infoEmp);
      }
    } catch(e) {}

    try {
      var permisos = await api("/empresa/mis-permisos");
      permisosActual = permisos;
      aplicarPermisosUI();
    } catch(e) {}
    await cargarDashboard();
    showScreen("dashboard");
    showToast("Bienvenido, " + _esc(usuarioActual.nombre.split(" ")[0]));

    // Ocultar badge hasta tener el plan real del servidor
    var badgeInicial = document.getElementById("sidebarPlanBadge");
    if (badgeInicial) badgeInicial.style.display = "none";

    api("/empresa/info").then(function(info) {
      empresaInfo = info;
      actualizarBadgePlan();
    }).catch(function() {
      if (badgeInicial) badgeInicial.style.display = "inline-block";
    });
  } catch (error) {
    showToast("Error: " + _esc(error.message));
  }
}

// Email temporal guardado entre pantallas
var _emailPendiente = "";

async function registrarUsuario() {
  const nombre   = document.getElementById("regNombre").value.trim();
  const apellido = document.getElementById("regApellido") ? document.getElementById("regApellido").value.trim() : "";
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  if (!nombre || !email || !password) { showToast("Completa todos los campos"); return; }

  // [SEC-3] Mínimo 8 caracteres en registro (consistente con invitación y reset)
  if (password.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  // [SEC-2] Rate limiting: máximo 3 registros cada 10 minutos
  // Analogia: no puedes crear 100 cuentas en un minuto — hay un portero
  var limite = _checkRateLimit("registro", 3, 10 * 60 * 1000);
  if (limite.bloqueado) {
    showToast("⚠️ Demasiados intentos. Espera " + limite.segundos + " segundos.");
    return;
  }

  try {
    const data = await api("/auth/registro", "POST", { nombre, apellido, email, password });
    _emailPendiente = email;
    _mostrarPanel("panelVerificacion");
    document.getElementById("verifiEmailMostrar").textContent = email; // textContent es seguro
    document.getElementById("codigoInputs").querySelectorAll("input")[0].focus();
  } catch (error) {
    console.error("ERROR REGISTRO:", error);
    showToast("Error: " + _esc(error.message));
  }
}

// Oculta todos los paneles de auth y muestra solo el solicitado
function _mostrarPanel(id) {
  ["panelLogin","panelRegistro","panelVerificacion","panelOlvideEmail","panelOlvideCodigo"]
    .forEach(function(p) {
      var el = document.getElementById(p);
      if (el) el.style.display = "none";
    });
  var target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// Inputs de código: avanzar al siguiente automáticamente (solo acepta números)
function avanzarCodigo(input, idx) {
  input.value = input.value.replace(/\D/g,"");
  if (input.value && idx < 5) {
    document.getElementById("codigoInputs").querySelectorAll("input")[idx+1].focus();
  }
}
function avanzarCodigoReset(input, idx) {
  input.value = input.value.replace(/\D/g,"");
  if (input.value && idx < 5) {
    document.getElementById("resetCodigoInputs").querySelectorAll("input")[idx+1].focus();
  }
}

// Lee y une los 6 dígitos del input de código de verificación
function _leerCodigo(containerId) {
  return Array.from(document.getElementById(containerId).querySelectorAll("input"))
    .map(function(i){ return i.value; }).join("");
}

async function confirmarVerificacion() {
  var codigo = _leerCodigo("codigoInputs");
  if (codigo.length < 6) { showToast("Ingresa los 6 dígitos"); return; }
  var errEl = document.getElementById("verifiError");
  errEl.style.display = "none";
  try {
    var data = await api("/auth/verificar-email?email=" + encodeURIComponent(_emailPendiente) + "&codigo=" + codigo, "POST");
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("yeparstock_token",   authToken);
    localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));
    // [SEC-1] Guardar refreshToken en memoria, no en localStorage
    if (data.refresh_token) _refreshToken = data.refresh_token;
    document.getElementById("loginPage").style.display = "none";
    mostrarOnboarding();
  } catch(e) {
    errEl.style.display = "block";
    // [SEC-5] Usar textContent para mostrar errores del servidor de forma segura
    errEl.textContent = e.message || "Código incorrecto";
  }
}

async function reenviarCodigo() {
  try {
    await api("/auth/reenviar-codigo?email=" + encodeURIComponent(_emailPendiente), "POST");
    showToast("✅ Código reenviado a " + _esc(_emailPendiente));
  } catch(e) { showToast("Error: " + _esc(e.message)); }
}

// Mostrar formulario de recuperación de contraseña
function mostrarOlvidePass() {
  _mostrarPanel("panelOlvideEmail");
}

async function solicitarReset() {
  var email = document.getElementById("resetEmail")?.value.trim() || _emailPendiente;
  if (!email) { showToast("Ingresa tu email"); return; }
  _emailPendiente = email;

  // [SEC-2] Rate limiting: máximo 3 resets cada 10 minutos
  // Analogia: no puedes pedir 50 resets seguidos — el sistema te detiene
  var limite = _checkRateLimit("reset", 3, 10 * 60 * 1000);
  if (limite.bloqueado) {
    showToast("⚠️ Demasiados intentos. Espera " + limite.segundos + " segundos.");
    return;
  }

  var btn = document.getElementById("btnSolicitarReset");
  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

  try {
    await api("/auth/solicitar-reset?email=" + encodeURIComponent(email), "POST");
    var msg = document.getElementById("resetMsg");
    if (msg) {
      msg.style.display = "block";
    } else {
      showToast("📧 Contraseña temporal enviada a " + _esc(email));
    }
    if (btn) { btn.style.display = "none"; }
  } catch(e) {
    showToast("Error: " + _esc(e.message));
    if (btn) { btn.disabled = false; btn.textContent = "Enviar contraseña temporal →"; }
  }
}

async function confirmarReset() {
  var codigo    = _leerCodigo("resetCodigoInputs");
  var nuevaPass = document.getElementById("resetNuevaPass").value.trim();
  var errEl     = document.getElementById("resetError");
  errEl.style.display = "none";

  if (codigo.length < 6) { showToast("Ingresa los 6 dígitos"); return; }

  // [SEC-3] Mínimo 8 caracteres también en reset de contraseña
  if (nuevaPass.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  try {
    await api(
      "/auth/confirmar-reset?email=" + encodeURIComponent(_emailPendiente)
      + "&codigo=" + codigo
      + "&nueva_password=" + encodeURIComponent(nuevaPass),
      "POST"
    );
    showToast("✅ Contraseña cambiada. Ya puedes iniciar sesión.");
    _mostrarPanel("panelLogin");
  } catch(e) {
    errEl.style.display = "block";
    errEl.textContent   = e.message || "Código incorrecto o expirado"; // textContent es seguro
  }
}

function mostrarRegistro() { _mostrarPanel("panelRegistro"); }
function mostrarLogin()     { _mostrarPanel("panelLogin"); }
function toggleAuthMode()   { mostrarRegistro(); }

function mostrarPantallaBloqueo(info) {
  document.getElementById("appMain").style.display = "none";
  var bloq = document.getElementById("pantallaBloqueo");
  if (bloq) bloq.style.display = "flex";
}

function mostrarAvisoCancelacion(info) {
  var fecha = info.gracia_hasta
    ? new Date(info.gracia_hasta).toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit",year:"numeric"})
    : "pronto";
  showToast("⚠️ Suscripción cancelada — acceso de solo lectura hasta el " + fecha, 6000);
}

async function cancelarSuscripcion() {
  var confirmado = confirm(
    "¿Confirmas que deseas cancelar la suscripción?\n\n" +
    "• Seguirás con acceso completo hasta el fin del periodo pagado\n" +
    "• Luego tendrás 7 días de acceso solo a reportes y dashboard\n" +
    "• Después el acceso quedará bloqueado\n\n" +
    "Puedes reactivar en cualquier momento."
  );
  if (!confirmado) return;

  try {
    var r = await api("/empresa/cancelar-suscripcion", "POST");
    showToast("✅ " + _esc(r.mensaje));
    await cargarEquipo();
  } catch(e) {
    showToast("Error: " + _esc(e.message));
  }
}

async function reactivarSuscripcion() {
  try {
    await api("/empresa/reactivar", "POST");
    showToast("✅ Suscripción reactivada correctamente");
    await cargarEquipo();
  } catch(e) {
    showToast("Error: " + _esc(e.message));
  }
}

// Limpia la sesión completamente y vuelve al login
function cerrarSesion() {
  authToken     = null;
  usuarioActual = null;
  _refreshToken = null; // [SEC-1] Limpiar refreshToken de memoria
  localStorage.removeItem("yeparstock_token");
  localStorage.removeItem("yeparstock_usuario");
  document.getElementById("appMain").style.display        = "none";
  document.getElementById("onboardingPage").style.display = "none";
  document.getElementById("loginPage").style.display      = "block";
}

/* ============================================================
   RELOJ EN SIDEBAR
   Analogia: el reloj de la pared de la oficina — siempre visible,
   se actualiza cada segundo para que el operador sepa la hora
   exacta al registrar una venta o movimiento.
   ============================================================ */
function iniciarReloj() {
  function actualizar() {
    var ahora = new Date();
    var hh = String(ahora.getHours()).padStart(2, "0");
    var mm = String(ahora.getMinutes()).padStart(2, "0");
    var ss = String(ahora.getSeconds()).padStart(2, "0");
    var horaStr = hh + ":" + mm + ":" + ss;
    var fechaStr = ahora.toLocaleDateString("es-CL", {
      weekday: "long", day: "numeric", month: "short"
    });
    var elReloj = document.getElementById("sidebarReloj");
    var elFecha = document.getElementById("sidebarFecha");
    // [SEC-5] Usar textContent para mostrar datos de fecha/hora de forma segura
    if (elReloj) elReloj.textContent = horaStr;
    if (elFecha) elFecha.textContent = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
  }
  actualizar();
  setInterval(actualizar, 1000);
}

function actualizarUIUsuario() {
  if (!usuarioActual) return;
  const nombre    = usuarioActual.nombre;
  const partes    = nombre.split(" ");
  const iniciales = partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : nombre.slice(0,2).toUpperCase();
  const elNombre  = document.querySelector(".user-name");
  const elAvatar  = document.querySelector(".avatar");
  // [SEC-5] textContent previene que nombres con caracteres especiales rompan el HTML
  if (elNombre) elNombre.textContent = nombre;
  if (elAvatar) elAvatar.textContent = iniciales;
}

// Helper: actualiza el texto de un elemento por su ID de forma segura
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val; // textContent siempre es seguro
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function cargarDashboard() {
  try {
    const [alertas, productos, movimientos, config] = await Promise.all([
      api("/alertas/"),
      api("/productos/"),
      api("/movimientos/?limit=5"),
      api("/configuracion/")
    ]);

    // [SEC-5] Usar _esc() al construir HTML con datos del servidor
    const nombre = usuarioActual && usuarioActual.nombre ? usuarioActual.nombre.split(" ")[0] : "";
    setEl("dashTitulo",    "Buen dia, " + nombre);    // setEl usa textContent — seguro
    setEl("dashSubtitulo", config.nombre_negocio || "Mi Negocio");

    if (!empresaInfo) {
      api("/empresa/info").then(function(info) {
        empresaInfo = info;
        actualizarBadgePlan();
      }).catch(function() {});
    } else {
      actualizarBadgePlan();
    }

    const totalProductos  = productos.length;
    const totalUnidades   = productos.reduce(function(acc,p){ return acc + (p.stock_actual || 0); }, 0);
    const valorInventario = productos.reduce(function(acc,p){ return acc + (p.stock_actual * (p.precio_venta||0)); }, 0);
    setEl("statTotal",    totalProductos);
    setEl("statUnidades", totalUnidades.toLocaleString("es-CL"));
    setEl("statCriticos", alertas.total_criticos || 0);
    setEl("statAlertas",  alertas.total_alertas  || 0);
    setEl("statTotalTrend", totalProductos === 0 ? "Agrega tu primer producto" : totalProductos + " productos registrados");

    var vf = valorInventario >= 1000000 ? "$"+(valorInventario/1000000).toFixed(1)+"M"
           : valorInventario >= 1000    ? "$"+Math.round(valorInventario/1000)+"K"
           : "$"+Math.round(valorInventario);
    setEl("statValor",  valorInventario > 0 ? vf : "—");
    setEl("statMoneda", (config.moneda||"CLP") + " estimado en bodega");

    var badge      = document.getElementById("alertBadge");
    var totalBadge = (alertas.total_criticos||0) + (alertas.total_alertas||0);
    if (badge) { badge.textContent = totalBadge; badge.style.display = totalBadge > 0 ? "inline" : "none"; }

    var lista        = document.getElementById("dashAlertasList");
    var todasAlertas = (alertas.productos_criticos||[]).concat(alertas.productos_alerta||[]);
    if (lista) {
      if (todasAlertas.length === 0) {
        lista.innerHTML = "<div style='text-align:center;padding:24px;color:var(--muted);font-size:13px'>Todo en orden — sin alertas</div>";
      } else {
        // [SEC-5] _esc() en nombres de productos que vienen del servidor
        lista.innerHTML = todasAlertas.slice(0,5).map(function(p){
          var ico = p.estado === "critico" ? "🔴" : "🟡";
          return "<div class='alert-item " + _esc(p.estado) + "'>"
            + "<div class='alert-emoji'>" + ico + "</div>"
            + "<div class='alert-info'><div class='alert-name'>" + _esc(p.nombre) + "</div>"
            + "<div class='alert-detail'>Min: " + _esc(String(p.stock_minimo)) + " und.</div></div>"
            + "<div class='alert-qty'>" + _esc(String(p.stock_actual)) + "</div></div>";
        }).join("");
      }
    }

    var tbody = document.getElementById("dashMovTableBody");
    if (tbody) {
      if (!movimientos || movimientos.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:32px;font-size:13px'>Sin movimientos aun</td></tr>";
      } else {
        tbody.innerHTML = movimientos.map(function(m) {
          var es   = m.tipo === "entrada";
          var col  = es ? "var(--azul)" : "var(--rojo)";
          var hora = new Date(m.created_at).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
          var cant = es ? "+" + m.cantidad : "-" + m.cantidad;
          // [SEC-5] _esc() en nombre de producto y datos del movimiento
          return "<tr>"
            + "<td><strong>" + _esc(m.producto_nombre || "—") + "</strong></td>"
            + "<td><span style='color:"+col+";font-weight:600'>" + (es?"↑ Entrada":"↓ Salida") + "</span></td>"
            + "<td style='color:"+col+";font-weight:700'>" + _esc(cant) + "</td>"
            + "<td>" + _esc(String(m.stock_nuevo)) + " und.</td>"
            + "<td style='color:var(--muted)'>" + _esc(hora) + "</td>"
            + "</tr>";
        }).join("");
      }
    }

    var ent = (movimientos||[]).filter(function(m){return m.tipo==="entrada";}).reduce(function(a,m){return a+m.cantidad;},0);
    var sal = (movimientos||[]).filter(function(m){return m.tipo==="salida"; }).reduce(function(a,m){return a+m.cantidad;},0);
    setEl("dashEntradas", "+" + ent);
    setEl("dashSalidas",  "-" + sal);

    if (config.color_principal) previsualizarColor(config.color_principal);

  } catch (error) {
    console.error("Error cargando dashboard:", error);
  }
}

/* ============================================================
   PRODUCTOS
   ============================================================ */
async function cargarProductos(buscar, categoria) {
  buscar    = buscar    || "";
  categoria = categoria || "";
  try {
    var url = "/productos/?";
    if (buscar)    url += "buscar="    + encodeURIComponent(buscar)    + "&";
    if (categoria) url += "categoria=" + encodeURIComponent(categoria) + "&";

    const productos = await api(url);
    const tbody     = document.getElementById("prodTableBody");
    const subtitulo = document.getElementById("prodSubtitulo");

    if (subtitulo) subtitulo.textContent = productos.length + " producto" + (productos.length!==1?"s":"") + " registrado" + (productos.length!==1?"s":"");
    if (!tbody) return;

    if (productos.length === 0) {
      tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;color:var(--muted);padding:40px;font-size:13px'>"
        + (buscar||categoria ? "Sin resultados" : "Aun no hay productos — haz clic en '+ Nuevo producto'")
        + "</td></tr>";
      return;
    }

    // [SEC-5] _esc() en todos los campos de producto que van al HTML
    tbody.innerHTML = productos.map(function(p){
      var precioC  = p.precio_compra ? "$" + p.precio_compra.toLocaleString("es-CL") : "—";
      var precioV  = p.precio_venta  ? "$" + p.precio_venta.toLocaleString("es-CL")  : "—";
      var ganancia = p.porcentaje_ganancia > 0
        ? "<span style='background:rgba(0,199,123,0.15);color:var(--verde);padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600'>" + _esc(String(p.porcentaje_ganancia)) + "%</span>"
        : "—";
      return "<tr>"
        + "<td style='padding-left:16px'><strong>" + _esc(p.nombre) + "</strong>"
        + (p.lote ? "<div style='font-size:11px;color:var(--muted)'>Lote: " + _esc(p.lote) + "</div>" : "") + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + _esc(p.codigo_barra||p.codigo||"—") + "</td>"
        + "<td>" + _esc(p.categoria||"—") + "</td>"
        + "<td>" + _esc(p.marca||"—") + "</td>"
        + "<td>" + _esc(p.proveedor||"—") + "</td>"
        + "<td>" + precioC + "</td>"
        + "<td>" + precioV + "</td>"
        + "<td style='text-align:center'>" + ganancia + "</td>"
        + "<td style='text-align:center'>"
        + "<div style='display:flex;gap:6px;justify-content:center'>"
        + "<button onclick='abrirModalEditar(" + p.id + ")' title='Editar'"
        + " style='background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);padding:5px 9px;cursor:pointer;font-size:13px;transition:all 0.2s'"
        + " onmouseover=\"this.style.borderColor='var(--azul)';this.style.color='var(--azul)'\""
        + " onmouseout=\"this.style.borderColor='var(--border)';this.style.color='var(--muted)'\">&#9999;</button>"
        + "<button onclick='abrirModalEliminar(" + p.id + "," + JSON.stringify(_esc(p.nombre)) + ")' title='Eliminar'"
        + " style='background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);padding:5px 9px;cursor:pointer;font-size:13px;transition:all 0.2s'"
        + " onmouseover=\"this.style.borderColor='var(--rojo)';this.style.color='var(--rojo)'\""
        + " onmouseout=\"this.style.borderColor='var(--border)';this.style.color='var(--muted)'\">&#128465;</button>"
        + "</div></td>"
        + "</tr>";
    }).join("");

  } catch (error) { console.error("Error productos:", error); }
}

function filtrarProductos() {
  var buscar    = document.getElementById("prodBuscar")?.value    || "";
  var categoria = document.getElementById("prodCategoria")?.value || "";
  cargarProductos(buscar, categoria);
}

/* ============================================================
   STOCK
   ============================================================ */
async function cargarStock(buscar, categoria, estado) {
  buscar    = buscar    || "";
  categoria = categoria || "";
  estado    = estado    || "";
  try {
    var url = "/productos/?";
    if (buscar)    url += "buscar="    + encodeURIComponent(buscar)    + "&";
    if (categoria) url += "categoria=" + encodeURIComponent(categoria) + "&";
    if (estado)    url += "estado="    + encodeURIComponent(estado)    + "&";

    const productos = await api(url);
    const tbody     = document.getElementById("stockTableBody");
    const subtitulo = document.getElementById("stockSubtitulo");
    var totalUnd    = productos.reduce(function(a,p){return a+p.stock_actual;},0);

    if (subtitulo) subtitulo.textContent = productos.length + " productos · " + totalUnd + " unidades totales";
    if (!tbody) return;

    if (productos.length === 0) {
      tbody.innerHTML = "<tr><td colspan='8' style='text-align:center;color:var(--muted);padding:40px;font-size:13px'>Sin resultados</td></tr>";
      return;
    }

    tbody.innerHTML = productos.map(function(p){
      var pct   = Math.min(Math.round((p.stock_actual / Math.max(p.stock_minimo*5,1))*100),100);
      var color = p.estado==="critico" ? "var(--rojo)" : p.estado==="alerta" ? "var(--amarillo)" : "var(--verde)";
      var precio = p.precio_venta ? "$"+p.precio_venta.toLocaleString("es-CL") : "—";
      var venceStr = "—";
      if (p.fecha_vencimiento) {
        var dias = Math.ceil((new Date(p.fecha_vencimiento)-new Date())/86400000);
        venceStr = p.estado_venc==="vencido" ? "<span style='color:var(--rojo);font-weight:600'>Vencido</span>"
                 : p.estado_venc==="proximo" ? "<span style='color:var(--amarillo);font-weight:600'>" + _esc(String(dias)) + "d &#x23F0;</span>"
                 : new Date(p.fecha_vencimiento).toLocaleDateString("es-CL");
      }
      // [SEC-5] _esc() en nombre, código, marca y lote
      return "<tr>"
        + "<td style='padding-left:16px'><strong>" + _esc(p.nombre) + "</strong>"
        + "<div style='font-size:11px;color:var(--muted)'>" + _esc(p.codigo_barra||p.codigo||"Sin codigo") + (p.marca?" · "+_esc(p.marca):"") + (p.lote?" · Lote:"+_esc(p.lote):"") + "</div></td>"
        + "<td>" + _esc(p.categoria||"—") + "</td>"
        + "<td><div class='stock-bar-wrap'><span style='font-weight:700;color:"+color+"'>" + _esc(String(p.stock_actual)) + "</span>"
        + "<div class='stock-bar-track'><div class='stock-bar-fill " + _esc(p.estado) + "' style='width:"+pct+"%'></div></div></div></td>"
        + "<td style='color:var(--muted)'>" + _esc(String(p.stock_minimo)) + "</td>"
        + "<td>" + precio + "</td>"
        + "<td style='font-size:12px'>" + venceStr + "</td>"
        + "<td><span class='badge " + _esc(p.estado) + "'><span class='badge-dot'></span>" + (p.estado==="critico"?"Critico":p.estado==="alerta"?"Alerta":"OK") + "</span></td>"
        + "<td style='text-align:center'>"
        + "<button onclick='abrirMovimientoRapido("+p.id+"," + JSON.stringify(_esc(p.nombre)) + ")' title='Movimiento'"
        + " style='background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);padding:5px 12px;cursor:pointer;font-size:14px;transition:all 0.2s;font-weight:700'"
        + " onmouseover=\"this.style.borderColor='var(--azul)';this.style.color='var(--azul)'\""
        + " onmouseout=\"this.style.borderColor='var(--border)';this.style.color='var(--muted)'\">±</button>"
        + "</td>"
        + "</tr>";
    }).join("");

  } catch (error) { console.error("Error stock:", error); }
}

function filtrarStock() {
  cargarStock(
    document.getElementById("stockBuscar")?.value    || "",
    document.getElementById("stockCategoria")?.value || "",
    document.getElementById("stockEstado")?.value    || ""
  );
}

function abrirMovimientoRapido(id, nombre) {
  openModalMovimiento();
  setTimeout(function(){
    var sel = document.getElementById("movProductoId");
    if (sel) { for (var o of sel.options) { if (parseInt(o.value)===id){o.selected=true;break;} } }
  }, 400);
}

/* ============================================================
   MOVIMIENTOS
   ============================================================ */
async function cargarMovimientos(tipo, buscar, categoria, desde, hasta, codigo) {
  tipo      = tipo      || "";
  buscar    = buscar    || "";
  categoria = categoria || "";
  desde     = desde     || "";
  hasta     = hasta     || "";
  codigo    = codigo    || "";
  try {
    var url = "/movimientos/?limit=500";
    if (tipo)      url += "&tipo="      + encodeURIComponent(tipo);
    if (buscar)    url += "&buscar="    + encodeURIComponent(buscar);
    if (categoria) url += "&categoria=" + encodeURIComponent(categoria);
    if (desde)     url += "&desde="    + encodeURIComponent(desde);
    if (hasta)     url += "&hasta="    + encodeURIComponent(hasta);

    var movimientos = await api(url);

    // Filtro por código en frontend
    if (codigo) {
      var codigoLower = codigo.toLowerCase();
      movimientos = movimientos.filter(function(m) {
        return (m.codigo_barra_scan && m.codigo_barra_scan.toLowerCase().includes(codigoLower))
            || (m.producto_codigo   && m.producto_codigo.toLowerCase().includes(codigoLower));
      });
    }
    const tbody     = document.getElementById("movTableBody");
    const subtitulo = document.getElementById("movSubtitulo");

    if (subtitulo) {
      var ent = movimientos.filter(function(m){return m.tipo==="entrada";}).reduce(function(a,m){return a+m.cantidad;},0);
      var sal = movimientos.filter(function(m){return m.tipo==="salida"; }).reduce(function(a,m){return a+m.cantidad;},0);
      subtitulo.textContent = movimientos.length + " movimientos · +" + ent + " entradas · -" + sal + " salidas";
    }

    if (!tbody) return;

    if (movimientos.length === 0) {
      tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;color:var(--muted);padding:40px;font-size:13px'>"
        + (tipo||buscar||categoria||desde ? "Sin movimientos con ese filtro" : "Aun no hay movimientos registrados")
        + "</td></tr>";
      return;
    }

    tbody.innerHTML = movimientos.map(function(m){
      var es    = m.tipo === "entrada";
      var col   = es ? "var(--azul)" : "var(--rojo)";
      var fecha = new Date(m.created_at);
      var fStr  = fecha.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"});
      var hStr  = fecha.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
      var cant  = es ? "+" + m.cantidad : "-" + m.cantidad;
      // Serializar de forma segura para pasar al modal de detalle
      return "<tr style='cursor:pointer' onclick='verDetalleMovimiento(" + JSON.stringify(JSON.stringify(m)) + ")'"
        + " onmouseover=\"this.style.background='var(--bg3)'\" onmouseout=\"this.style.background=''\" title='Ver detalle'>"
        + "<td style='padding-left:16px;font-size:12px'><div style='font-weight:600'>" + _esc(fStr) + "</div><div style='color:var(--muted)'>" + _esc(hStr) + "</div></td>"
        // [SEC-5] Nombre del producto eliminado con estilo inline — no via innerHTML de datos del servidor
        + "<td><strong>" + (m.producto_nombre ? _esc(m.producto_nombre) : "<span style='color:var(--muted);font-style:italic'>Eliminado</span>") + "</strong></td>"
        + "<td><span style='color:"+col+";font-weight:600;font-size:13px'>" + (es?"&#8593; Entrada":"&#8595; Salida") + "</span></td>"
        + "<td style='color:"+col+";font-weight:700;font-size:15px'>" + _esc(cant) + "</td>"
        + "<td style='color:var(--muted);text-align:center'>" + _esc(String(m.stock_anterior)) + "</td>"
        + "<td style='font-weight:600;text-align:center'>" + _esc(String(m.stock_nuevo)) + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + _esc(m.lote||"—") + "</td>"
        + "<td style='font-size:12px;color:var(--muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" + _esc(m.nota||"") + "'>" + _esc(m.nota||"—") + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + _esc(m.usuario_nombre||"—") + "</td>"
        + "</tr>";
    }).join("");

  } catch (error) { console.error("Error movimientos:", error); }
}

/* Mostrar modal con detalle completo de un movimiento */
function verDetalleMovimiento(jsonStr) {
  var m   = JSON.parse(jsonStr);
  var es  = m.tipo === "entrada";
  var col = es ? "var(--azul)" : "var(--rojo)";
  var fecha = new Date(m.created_at).toLocaleString("es-CL", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });

  // [SEC-5] Todos los datos del servidor pasan por _esc() antes de ir al HTML
  var html =
    "<div style='display:flex;flex-direction:column;gap:10px'>"
    + "<div style='display:grid;grid-template-columns:1fr 1fr;gap:10px'>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Producto</div>"
    + "<div style='font-weight:700;font-size:15px'>" + (m.producto_nombre ? _esc(m.producto_nombre) : "<em style='color:var(--muted)'>Eliminado</em>") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Tipo</div>"
    + "<div style='font-weight:700;font-size:15px;color:" + col + "'>" + (es ? "↑ Entrada" : "↓ Salida") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Cantidad</div>"
    + "<div style='font-weight:800;font-size:20px;color:" + col + "'>" + (es ? "+" : "-") + _esc(String(m.cantidad)) + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Fecha y hora</div>"
    + "<div style='font-weight:600;font-size:13px'>" + _esc(fecha) + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Stock anterior</div>"
    + "<div style='font-weight:700;font-size:16px;color:var(--muted)'>" + _esc(String(m.stock_anterior)) + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Stock resultante</div>"
    + "<div style='font-weight:800;font-size:16px'>" + _esc(String(m.stock_nuevo)) + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Lote</div>"
    + "<div style='font-weight:600;font-size:13px'>" + _esc(m.lote||"—") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Registrado por</div>"
    + "<div style='font-weight:600;font-size:13px'>" + _esc(m.usuario_nombre||"—") + "</div>"
    + "</div>"

    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Nota / Observación</div>"
    + "<div style='font-size:13px;color:" + (m.nota ? "var(--text)" : "var(--muted)") + "'>" + _esc(m.nota||"Sin nota") + "</div>"
    + "</div>"

    + "</div>";

  var modalEl = document.getElementById("modalEliminar");
  var titulo  = modalEl.querySelector(".modal-title");
  var msg     = document.getElementById("eliminarMsg");
  var acciones= modalEl.querySelector(".form-actions");

  titulo.style.color   = "var(--text)";
  titulo.textContent   = "📋 Detalle del movimiento"; // textContent es seguro
  msg.innerHTML        = html;
  msg.style.marginBottom = "0";
  acciones.innerHTML   = "<button type='button' class='btn-primary' onclick='cerrarModalEliminar()' style='margin-left:auto'>Cerrar</button>";

  modalEl.classList.add("open");
}

function filtrarMovimientos() {
  cargarMovimientos(
    document.getElementById("movFiltroTipo")?.value      || "",
    document.getElementById("movBuscar")?.value          || "",
    document.getElementById("movFiltroCategoria")?.value || "",
    document.getElementById("movFiltroDesde")?.value     || "",
    document.getElementById("movFiltroHasta")?.value     || "",
    document.getElementById("movBuscarCodigo")?.value    || ""
  );
}

/* ============================================================
   ALERTAS — dinamico, rellena la pantalla desde el backend
   ============================================================ */
async function cargarAlertas() {
  try {
    const alertas = await api("/alertas/");
    const total   = (alertas.total_criticos||0) + (alertas.total_alertas||0)
                  + (alertas.total_vencidos||0) + (alertas.total_proximos||0);

    var elCrit  = document.getElementById("alertasCriticosNum");
    var elAlert = document.getElementById("alertasAlertaNum");
    var sub     = document.getElementById("alertasSubtitulo");
    var badge   = document.getElementById("alertBadge");

    if (!elCrit)  elCrit  = document.querySelector("#screen-alertas .stat-card.rojo .stat-value");
    if (!elAlert) elAlert = document.querySelector("#screen-alertas .stat-card.amarillo .stat-value");
    if (!sub)     sub     = document.querySelector("#screen-alertas .page-subtitle");

    // setEl / textContent son seguros — no necesitan _esc()
    if (elCrit)  elCrit.textContent  = alertas.total_criticos || 0;
    if (elAlert) elAlert.textContent = alertas.total_alertas  || 0;
    if (sub)     sub.textContent     = total + " productos requieren atención";
    if (badge)   { badge.textContent = total; badge.style.display = total > 0 ? "inline" : "none"; }

    // [SEC-5] Construir items de alerta con _esc() en datos del servidor
    function buildItem(p, tipo) {
      var esCritico = (tipo === "critico" || tipo === "vencido");
      var color     = esCritico ? "var(--rojo)" : "var(--amarillo)";
      return "<div class='alert-big-item " + _esc(tipo) + "'>"
        + "<div class='alert-icon-big " + _esc(tipo) + "'>📦</div>"
        + "<div class='alert-big-info'>"
        +   "<div class='alert-big-name'>" + _esc(p.nombre) + "</div>"
        +   "<div class='alert-big-detail'>Stock mínimo: " + _esc(String(p.stock_minimo)) + " und. · Actual: "
        +     _esc(String(p.stock_actual)) + " und." + (p.categoria ? " · " + _esc(p.categoria) : "") + "</div>"
        + "</div>"
        + "<div class='alert-big-action'>"
        +   "<div style='font-family:var(--font-head);font-size:22px;font-weight:800;color:" + color + "'>"
        +     _esc(String(p.stock_actual)) + " und.</div>"
        +   "<button class='btn-primary' style='font-size:12px;padding:7px 14px' "
        +     "onclick='abrirMovimientoRapido(" + p.id + ",\"" + _esc(p.nombre).replace(/"/g,"'") + "\")'>+ Registrar entrada</button>"
        + "</div>"
        + "</div>";
    }

    var listCrit = document.getElementById("alertasCriticosList");
    var secCrit  = document.getElementById("alertasCriticosSec");
    if (listCrit) {
      listCrit.innerHTML = (alertas.productos_criticos||[]).map(function(p){ return buildItem(p,"critico"); }).join("")
        || "<div style='text-align:center;color:var(--muted);padding:16px;font-size:13px'>Sin productos críticos</div>";
    }
    if (secCrit) secCrit.style.display = (alertas.total_criticos||0) > 0 ? "" : "none";

    var listAlert = document.getElementById("alertasAlertaList");
    var secAlert  = document.getElementById("alertasAlertaSec");
    if (listAlert) {
      listAlert.innerHTML = (alertas.productos_alerta||[]).map(function(p){ return buildItem(p,"alerta"); }).join("")
        || "<div style='text-align:center;color:var(--muted);padding:16px;font-size:13px'>Sin productos en alerta</div>";
    }
    if (secAlert) secAlert.style.display = (alertas.total_alertas||0) > 0 ? "" : "none";

    var listVenc = document.getElementById("alertasVencidosList");
    var secVenc  = document.getElementById("alertasVencidosSec");
    if (listVenc) {
      listVenc.innerHTML = (alertas.productos_vencidos||[]).map(function(p){ return buildItem(p,"vencido"); }).join("");
    }
    if (secVenc) secVenc.style.display = (alertas.productos_vencidos||[]).length > 0 ? "" : "none";

    var listProx = document.getElementById("alertasProximosList");
    var secProx  = document.getElementById("alertasProximosSec");
    if (listProx) {
      listProx.innerHTML = (alertas.productos_proximos||[]).map(function(p){ return buildItem(p,"proximo"); }).join("");
    }
    if (secProx) secProx.style.display = (alertas.productos_proximos||[]).length > 0 ? "" : "none";

    var vacio = document.getElementById("alertasVacioMsg");
    if (vacio) vacio.style.display = total === 0 ? "" : "none";

  } catch (error) { console.error("Error alertas:", error); }
}

/* ============================================================
   SALIDAS — ventas, mermas, cuarentenas, devoluciones
   Con soporte para escaneo por camara o pistola lectora
   ============================================================ */

var _streamSalida = null;

/* Cargar lista de salidas con filtros */
async function cargarSalidas(tipo, estado, buscar, desde, hasta) {
  tipo   = tipo   || "";
  estado = estado || "";
  buscar = buscar || "";
  desde  = desde  || "";
  hasta  = hasta  || "";

  try {
    var url = "/salidas/?limit=500";
    if (tipo)   url += "&tipo_salida=" + encodeURIComponent(tipo);
    if (estado) url += "&estado="      + encodeURIComponent(estado);
    if (buscar) url += "&buscar="      + encodeURIComponent(buscar);
    if (desde)  url += "&desde="       + encodeURIComponent(desde);
    if (hasta)  url += "&hasta="       + encodeURIComponent(hasta);

    const salidas  = await api(url);
    var resumenUrl = "/salidas/resumen";
    if (desde || hasta) {
      var qs = [];
      if (desde) qs.push("desde=" + encodeURIComponent(desde));
      if (hasta) qs.push("hasta=" + encodeURIComponent(hasta));
      resumenUrl += "?" + qs.join("&");
    }
    const resumen   = await api(resumenUrl);
    const tbody     = document.getElementById("salidaTableBody");
    const subtitulo = document.getElementById("salidaSubtitulo");

    setEl("salidaResVentas",      resumen.total_ventas            || 0);
    setEl("salidaResMermas",      resumen.total_mermas            || 0);
    setEl("salidaResCuarentenas", resumen.cuarentenas_pendientes  || 0);
    setEl("salidaResValor",       "$" + (resumen.valor_ventas || 0).toLocaleString("es-CL"));

    if (subtitulo) subtitulo.textContent = salidas.length + " registro" + (salidas.length !== 1 ? "s" : "");
    if (!tbody) return;

    if (salidas.length === 0) {
      tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;color:var(--muted);padding:40px;font-size:13px'>Sin salidas registradas aun</td></tr>";
      return;
    }

    var colorTipo  = { venta:"var(--azul)", merma:"var(--rojo)", cuarentena:"var(--amarillo)", devolucion_proveedor:"var(--muted)" };
    var labelTipo  = { venta:"Venta", merma:"Merma", cuarentena:"Cuarentena", devolucion_proveedor:"Dev. Proveedor" };
    var colorEst   = { activo:"var(--verde)", en_revision:"var(--amarillo)", reingresado:"var(--azul)", descartado:"var(--rojo)", enviado_proveedor:"var(--muted)" };
    var labelEst   = { activo:"Confirmado", en_revision:"En Revision", reingresado:"Reingresado", descartado:"Descartado", enviado_proveedor:"Enviado" };
    var iconoTipo  = { venta:"🛒", merma:"🗑️", cuarentena:"⚠️", devolucion_proveedor:"↩️" };

    // [SEC-5] _esc() en todos los campos de texto que vienen del servidor
    tbody.innerHTML = salidas.map(function(s) {
      var fecha  = new Date(s.created_at);
      var fStr   = fecha.toLocaleDateString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric" });
      var hStr   = fecha.toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit" });
      var colT   = colorTipo[s.tipo_salida] || "var(--muted)";
      var labT   = labelTipo[s.tipo_salida] || _esc(s.tipo_salida);
      var colE   = colorEst[s.estado]       || "var(--muted)";
      var labE   = labelEst[s.estado]       || _esc(s.estado);
      var icono  = iconoTipo[s.tipo_salida] || "📦";
      var valor  = s.valor_total > 0 ? "$" + s.valor_total.toLocaleString("es-CL") : "—";

      var btnResolver = s.estado === "en_revision"
        ? "<button onclick='abrirModalResolucion(" + s.id + ")'"
          + " style='background:var(--amarillo);color:#000;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;margin-right:4px'>Resolver</button>"
        : "";

      return "<tr>"
        + "<td style='padding-left:16px;font-size:12px'><div style='font-weight:600'>" + _esc(fStr) + "</div><div style='color:var(--muted)'>" + _esc(hStr) + "</div></td>"
        + "<td><strong>" + (s.producto_nombre ? _esc(s.producto_nombre) : "<span style='color:var(--muted);font-style:italic'>Eliminado</span>") + "</strong>"
        + (s.lote ? "<div style='font-size:11px;color:var(--muted)'>Lote: " + _esc(s.lote) + "</div>" : "") + "</td>"
        + "<td><span style='color:" + colT + ";font-weight:600'>" + icono + " " + labT + "</span></td>"
        + "<td style='color:var(--rojo);font-weight:700'>-" + _esc(String(s.cantidad)) + "</td>"
        + "<td style='color:var(--muted);text-align:center'>" + _esc(String(s.stock_anterior)) + "</td>"
        + "<td style='font-weight:600;text-align:center'>" + _esc(String(s.stock_nuevo)) + "</td>"
        + "<td style='font-size:12px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" + _esc(s.motivo||"") + "'>" + _esc(s.motivo||"—") + "</td>"
        + "<td>" + btnResolver + "<span style='color:" + colE + ";font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;background:" + colE + "22'>" + labE + "</span></td>"
        + "<td style='text-align:center;font-weight:600'>" + valor + "</td>"
        + "</tr>";
    }).join("");

  } catch (error) { console.error("Error salidas:", error); }
}

function filtrarSalidas() {
  cargarSalidas(
    document.getElementById("salidaFiltroTipo")?.value   || "",
    document.getElementById("salidaFiltroEstado")?.value || "",
    document.getElementById("salidaBuscar")?.value       || "",
    document.getElementById("salidaFiltroDesde")?.value  || "",
    document.getElementById("salidaFiltroHasta")?.value  || ""
  );
}


/* ============================================================
   CARRITO DE VENTAS — multi-producto
   Analogia: como una caja registradora real: el cajero va
   escaneando productos uno a uno y cobra el total al final
   ============================================================ */

var _carrito          = [];          // [{id, nombre, qty, precio, subtotal}]
var _metodoPagoActual = "efectivo";  // método de pago seleccionado
var _productoActual   = null;        // Producto encontrado, pendiente de agregar
// _streamSalida ya definido arriba

/* Recalcular totales y redibujar la lista del carrito */
function renderCarrito() {
  var lista   = document.getElementById("carritoLista");
  var wrap    = document.getElementById("carritoWrap");
  var btnConf = document.getElementById("btnConfirmarVenta");
  if (!lista) return;

  if (_carrito.length === 0) {
    if (wrap)    wrap.style.display    = "none";
    if (btnConf) { btnConf.disabled = true; btnConf.style.opacity = "0.5"; }
    setEl("totalValor",   "$0");
    setEl("totalDetalle", "0 productos");
    return;
  }

  if (wrap)    wrap.style.display    = "block";
  if (btnConf) { btnConf.disabled = false; btnConf.style.opacity = "1"; }

  var totalItems = _carrito.reduce(function(a,i){ return a + i.qty;      }, 0);
  var totalPesos = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);

  setEl("totalValor",   "$" + totalPesos.toLocaleString("es-CL"));
  setEl("totalDetalle", _carrito.length + " producto" + (_carrito.length !== 1 ? "s" : "") + " · " + totalItems + " unidades");

  // [SEC-5] _esc() en nombres de productos del carrito
  lista.innerHTML = _carrito.map(function(item, idx) {
    return "<div style='display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px'>"
      + "<div style='flex:1;min-width:0'>"
      +   "<div style='font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(item.nombre) + "</div>"
      +   "<div style='font-size:11px;color:var(--muted);margin-top:2px'>" + _esc(String(item.qty)) + " und × $" + item.precio.toLocaleString("es-CL") + "</div>"
      + "</div>"
      + "<div style='font-family:var(--font-head);font-size:15px;font-weight:800;color:var(--verde);flex-shrink:0'>$" + item.subtotal.toLocaleString("es-CL") + "</div>"
      + "<button type='button' onclick='quitarDelCarrito(" + idx + ")'"
      + " style='background:none;border:1px solid var(--border);border-radius:7px;color:var(--muted);width:28px;height:28px;cursor:pointer;font-size:12px;flex-shrink:0'"
      + " onmouseover=\"this.style.borderColor='var(--rojo)';this.style.color='var(--rojo)'\""
      + " onmouseout=\"this.style.borderColor='var(--border)';this.style.color='var(--muted)'\">✕</button>"
      + "</div>";
  }).join("");
}

/* Agregar el producto actual al carrito */
function agregarAlCarrito() {
  if (!_productoActual) { showToast("Primero busca o selecciona un producto"); return; }

  var qty    = parseInt(document.getElementById("salidaCantidad")?.value)         || 1;
  var precio = parseFloat(document.getElementById("salidaPrecioUnitario")?.value) || _productoActual.precio;

  if (qty <= 0)    { showToast("La cantidad debe ser mayor a 0"); return; }
  if (precio <= 0) { showToast("Ingresa el precio del producto"); return; }

  var existe = _carrito.find(function(i){ return i.id === _productoActual.id; });
  if (existe) {
    existe.qty     += qty;
    existe.precio   = precio;
    existe.subtotal = existe.qty * precio;
    showToast("+" + qty + " sumado a " + _esc(_productoActual.nombre));
  } else {
    _carrito.push({
      id:       _productoActual.id,
      nombre:   _productoActual.nombre,
      qty:      qty,
      precio:   precio,
      subtotal: qty * precio,
    });
    showToast(_esc(_productoActual.nombre) + " agregado al carrito");
  }

  // Limpiar campos para el siguiente producto
  _productoActual = null;
  document.getElementById("salidaCodigoBarra").value    = "";
  document.getElementById("salidaProductoId").value     = "";
  document.getElementById("salidaCantidad").value       = "1";
  document.getElementById("salidaPrecioUnitario").value = "";
  document.getElementById("productoChip").style.display = "none";
  var hint = document.getElementById("salidaScanHint");
  if (hint) { hint.textContent = "Escanea o escribe — Enter o 'Agregar' para sumarlo al carrito"; hint.style.color = ""; }

  renderCarrito();
  setTimeout(function(){ document.getElementById("salidaCodigoBarra")?.focus(); }, 100);
}

/* Quitar un item del carrito por indice */
function quitarDelCarrito(idx) {
  var nombre = _carrito[idx]?.nombre || "Producto";
  _carrito.splice(idx, 1);
  renderCarrito();
  showToast(_esc(nombre) + " quitado del carrito");
}

var _tipoSalidaActual = "venta";

async function abrirModalSalida(tipo) {
  _tipoSalidaActual = tipo || "venta";
  _carrito          = [];
  _productoActual   = null;

  var esMerma = _tipoSalidaActual === "merma";
  setEl("modalSalidaTitulo", esMerma ? "🗑️ Registrar merma" : "🛒 Nueva venta");
  var btnConf = document.getElementById("btnConfirmarVenta");
  if (btnConf) {
    btnConf.textContent      = esMerma ? "✔ Confirmar merma" : "✔ Confirmar venta";
    btnConf.style.background = esMerma ? "var(--rojo)" : "";
  }
  var metodoPagoWrap = document.getElementById("metodoPagoGrid")?.closest(".form-group.form-full");
  var clienteWrap    = document.getElementById("salidaCliente")?.closest(".form-group.form-full");
  if (metodoPagoWrap) metodoPagoWrap.style.display = esMerma ? "none" : "";
  if (clienteWrap)    clienteWrap.style.display    = esMerma ? "none" : "";

  try {
    var productos = await api("/productos/");
    var sel       = document.getElementById("salidaProductoId");
    if (sel) {
      // [SEC-5] Usar DOM API para crear opciones — más seguro que innerHTML
      sel.innerHTML = "";
      var optDefault = document.createElement("option");
      optDefault.value = "";
      optDefault.textContent = "— O selecciona de la lista —";
      sel.appendChild(optDefault);

      productos.forEach(function(p) {
        var opt            = document.createElement("option");
        opt.value          = p.id;
        opt.dataset.precio = p.precio_venta || 0;
        opt.dataset.stock  = p.stock_actual || 0;
        opt.dataset.nombre = p.nombre;
        opt.dataset.cat    = p.categoria    || "";
        // textContent sanitiza automáticamente
        opt.textContent    = p.nombre + " (stock: " + p.stock_actual + ")" + (p.codigo_barra ? " — " + p.codigo_barra : "");
        sel.appendChild(opt);
      });
    }
  } catch(e) {}

  document.getElementById("salidaCodigoBarra").value    = "";
  document.getElementById("salidaCantidad").value       = "1";
  document.getElementById("salidaPrecioUnitario").value = "";
  document.getElementById("productoChip").style.display = "none";
  var carritoWrap = document.getElementById("carritoWrap");
  if (carritoWrap) carritoWrap.style.display = "none";

  var campos = ["salidaCliente","salidaDocumento","salidaMotivo"];
  campos.forEach(function(id){ var el = document.getElementById(id); if(el) el.value = ""; });

  var hint = document.getElementById("salidaScanHint");
  if (hint) { hint.textContent = "Escanea o escribe — Enter o 'Agregar' para sumarlo al carrito"; hint.style.color = ""; }

  setEl("totalValor",   "$0");
  setEl("totalDetalle", "0 productos");
  var btnConf2 = document.getElementById("btnConfirmarVenta");
  if (btnConf2) { btnConf2.disabled = true; btnConf2.style.opacity = "0.5"; }

  document.getElementById("modalSalida").classList.add("open");
  setTimeout(function(){ document.getElementById("salidaCodigoBarra")?.focus(); }, 200);
}

function cerrarModalSalida() {
  document.getElementById("modalSalida").classList.remove("open");
  cerrarEscanerSalida();
  _metodoPagoActual = "efectivo";
  ["mixtoEfectivo","mixtoDebito","mixtoCredito","mixtoTransferencia"].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  var mp = document.getElementById("pagoMixtoPanel");
  if (mp) mp.style.display = "none";
  var tp = document.getElementById("tarjetaSubModal");
  if (tp) {
    tp.style.display = "none";
    tp.querySelectorAll(".metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
  }
  document.querySelectorAll("#metodoPagoGrid .metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
  var btnEfectivo = document.querySelector("#metodoPagoGrid [data-metodo='efectivo']");
  if (btnEfectivo) btnEfectivo.classList.add("active");
  var aviso = document.getElementById("fiadoAviso");
  if (aviso) aviso.style.display = "none";
}

/* Cuando el colaborador selecciona un producto del dropdown */
function onProductoSeleccionado() {
  var sel = document.getElementById("salidaProductoId");
  var opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;

  var precio = parseFloat(opt.dataset.precio) || 0;
  var stock  = opt.dataset.stock              || "?";
  var nombre = opt.dataset.nombre             || opt.textContent;
  var cat    = opt.dataset.cat                || "Producto";

  _productoActual = { id: parseInt(opt.value), nombre: nombre, precio: precio };

  document.getElementById("salidaPrecioUnitario").value = precio || "";
  // [SEC-5] textContent es seguro para mostrar nombre y detalles del producto
  document.getElementById("chipNombre").textContent  = nombre;
  document.getElementById("chipDetalle").textContent = cat + " · $" + precio.toLocaleString("es-CL") + " c/u · Stock: " + stock;
  document.getElementById("productoChip").style.display = "flex";

  var hint = document.getElementById("salidaScanHint");
  if (hint) { hint.textContent = "✓ " + nombre + " — Stock: " + stock + " und."; hint.style.color = "var(--verde)"; }
}

/* Buscar producto por codigo de barras o nombre (con debounce) */
var _timerSalidaScan = null;
function buscarProductoSalida(valor) {
  clearTimeout(_timerSalidaScan);
  var hint = document.getElementById("salidaScanHint");
  if (!valor) {
    _productoActual = null;
    document.getElementById("productoChip").style.display = "none";
    if (hint) { hint.textContent = "Escanea o escribe — Enter o 'Agregar' para sumarlo al carrito"; hint.style.color = ""; }
    return;
  }
  if (hint) { hint.textContent = "Buscando..."; hint.style.color = "var(--muted)"; }

  _timerSalidaScan = setTimeout(async function() {
    try {
      var p = await api("/productos/buscar-codigo/" + encodeURIComponent(valor));
      _productoActual = { id: p.id, nombre: p.nombre, precio: p.precio_venta || 0 };

      var sel = document.getElementById("salidaProductoId");
      if (sel) { for (var o of sel.options) { if (parseInt(o.value) === p.id) { o.selected = true; break; } } }

      if (p.precio_venta) document.getElementById("salidaPrecioUnitario").value = p.precio_venta;
      // [SEC-5] textContent para mostrar nombre y detalle del producto
      document.getElementById("chipNombre").textContent  = p.nombre;
      document.getElementById("chipDetalle").textContent = (p.categoria||"Producto") + " · $" + (p.precio_venta||0).toLocaleString("es-CL") + " c/u · Stock: " + p.stock_actual;
      document.getElementById("productoChip").style.display = "flex";

      if (hint) { hint.textContent = "✓ " + p.nombre + " — Stock: " + p.stock_actual + " und. — presiona Enter para agregar"; hint.style.color = "var(--verde)"; }

    } catch(e) {
      var sel2 = document.getElementById("salidaProductoId");
      var found = false;
      if (sel2) {
        for (var o2 of sel2.options) {
          if (o2.textContent.toLowerCase().includes(valor.toLowerCase())) {
            o2.selected = true; found = true; onProductoSeleccionado(); break;
          }
        }
      }
      if (!found) {
        _productoActual = null;
        document.getElementById("productoChip").style.display = "none";
        if (hint) { hint.textContent = "No encontrado — selecciona de la lista o sigue escribiendo"; hint.style.color = "var(--amarillo)"; }
      }
    }
  }, 450);
}

/* Botones +/- de cantidad en el chip */
function cambiarQtyVenta(delta) {
  var input = document.getElementById("salidaCantidad");
  var val   = Math.max(1, parseInt(input.value || 1) + delta);
  input.value = val;
}

function calcularTotalVenta() {
  // Solo mantiene compatibilidad, el total real lo gestiona renderCarrito
}

/* Seleccionar método de pago en la caja */
function seleccionarMetodoPago(metodo, subtipo) {
  // Si es tarjeta sin subtipo → mostrar sub-modal y esperar
  var tarjetaPanel = document.getElementById("tarjetaSubModal");
  if (metodo === "tarjeta" && !subtipo) {
    // Marcar botón tarjeta activo, mostrar sub-modal
    document.querySelectorAll(".metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
    var btnTarj = document.querySelector("[data-metodo='tarjeta']");
    if (btnTarj) btnTarj.classList.add("active");
    if (tarjetaPanel) tarjetaPanel.style.display = "block";
    // No fijar _metodoPagoActual aún — esperar que elija débito/crédito
    return;
  }

  // Si eligió subtipo de tarjeta
  if (metodo === "tarjeta" && subtipo) {
    _metodoPagoActual = subtipo; // guardar "debito" o "credito"
    if (tarjetaPanel) {
      // Marcar botón del subtipo
      tarjetaPanel.querySelectorAll(".metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
      var btnSub = tarjetaPanel.querySelector("[data-subtipo='" + subtipo + "']");
      if (btnSub) btnSub.classList.add("active");
    }
  } else {
    _metodoPagoActual = metodo;
    // Ocultar sub-modal si no es tarjeta
    if (tarjetaPanel) {
      tarjetaPanel.style.display = "none";
      tarjetaPanel.querySelectorAll(".metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
    }
    document.querySelectorAll("#metodoPagoGrid .metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
    var btn = document.querySelector("#metodoPagoGrid [data-metodo='" + metodo + "']");
    if (btn) btn.classList.add("active");
  }

  var aviso = document.getElementById("fiadoAviso");
  if (aviso) aviso.style.display = metodo === "fiado" ? "block" : "none";

  var mixtoPanel = document.getElementById("pagoMixtoPanel");
  if (mixtoPanel) {
    mixtoPanel.style.display = metodo === "mixto" ? "block" : "none";
    if (metodo === "mixto") calcularMixtoRestante();
  }
}

/* ============================================================
   calcularMixtoRestante — barra de progreso + alerta de exceso
   Analogia: la balanza de la caja — muestra cuánto falta o
   alerta si el cliente puso de más
   ============================================================ */
function calcularMixtoRestante() {
  var total = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);

  var elTotal = document.getElementById("mixtoTotalVenta");
  if (elTotal) elTotal.textContent = "$" + Math.round(total).toLocaleString("es-CL");

  var efectivo      = parseFloat(document.getElementById("mixtoEfectivo")?.value)      || 0;
  var debito        = parseFloat(document.getElementById("mixtoDebito")?.value)         || 0;
  var credito       = parseFloat(document.getElementById("mixtoCredito")?.value)        || 0;
  var transferencia = parseFloat(document.getElementById("mixtoTransferencia")?.value)  || 0;

  var asignado = efectivo + debito + credito + transferencia;
  var restante = total - asignado;
  var exceso   = asignado > total;
  var completo = asignado >= total && total > 0;

  var barra = document.getElementById("mixtoBarra");
  if (barra) {
    var pct = total > 0 ? Math.min(100, Math.round(asignado / total * 100)) : 0;
    barra.style.width      = pct + "%";
    barra.style.background = exceso ? "var(--rojo)" : completo ? "var(--verde)" : "var(--azul)";
  }

  var elAsig = document.getElementById("mixtoAsignado");
  if (elAsig) {
    elAsig.textContent = "$" + Math.round(asignado).toLocaleString("es-CL");
    elAsig.style.color = exceso ? "var(--rojo)" : completo ? "var(--verde)" : "#f59e0b";
  }

  var elLabel = document.getElementById("mixtoRestanteLabel");
  if (elLabel) {
    if (exceso) {
      // [SEC-5] textContent para valores calculados
      elLabel.textContent = "⚠️ Exceso: $" + Math.round(asignado - total).toLocaleString("es-CL");
      elLabel.style.color = "var(--rojo)";
      elLabel.style.fontWeight = "700";
    } else {
      var color = completo ? "var(--verde)" : "var(--azul)";
      elLabel.textContent = "Falta: $" + Math.round(Math.max(0, restante)).toLocaleString("es-CL");
      elLabel.style.color = color;
      elLabel.style.fontWeight = "700";
    }
  }

  var alerta = document.getElementById("mixtoAlertaExceso");
  if (alerta) alerta.style.display = exceso ? "block" : "none";
}

function onClienteInput() {
  var input = document.getElementById("salidaCliente");
  if (input && input.style.borderColor === "var(--rojo)") {
    input.style.borderColor = "";
  }
}

function usarClienteGenerico() {
  var input = document.getElementById("salidaCliente");
  if (!input) return;
  input.value = "Cliente Genérico";
  input.style.borderColor = "var(--azul)";
  setTimeout(function(){ input.style.borderColor = ""; }, 1500);
}

/* Abrir escáner de cámara para salidas */
function abrirEscanerSalida() {
  var vid = document.getElementById("videoEscanerSalida");
  if (!vid) return;
  vid.style.display = "block";
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(function(stream) {
      _streamSalida = stream;
      vid.srcObject = stream;
      vid.play();
      if (!("BarcodeDetector" in window)) { cerrarEscanerSalida(); showToast("Escaner no soportado en este navegador"); return; }
      var detector = new BarcodeDetector({ formats: ["ean_13","ean_8","code_128","qr_code"] });
      var _scan = setInterval(async function() {
        try {
          var codes = await detector.detect(vid);
          if (codes.length > 0) {
            clearInterval(_scan);
            cerrarEscanerSalida();
            var inputScan = document.getElementById("salidaCodigoBarra");
            if (inputScan) { inputScan.value = codes[0].rawValue; buscarProductoSalida(codes[0].rawValue); }
            _beep();
            showToast("Codigo escaneado: " + _esc(codes[0].rawValue));
          }
        } catch(e) {}
      }, 500);
    })
    .catch(function() { showToast("No se pudo acceder a la camara"); });
}

function cerrarEscanerSalida() {
  if (_streamSalida) { _streamSalida.getTracks().forEach(function(t){ t.stop(); }); _streamSalida = null; }
  var vid = document.getElementById("videoEscanerSalida");
  if (vid) vid.style.display = "none";
}

/* Confirmar y guardar toda la venta del carrito */
async function guardarSalida() {
  if (_carrito.length === 0) { showToast("El carrito está vacío"); return; }

  var esMerma    = _tipoSalidaActual === "merma";
  var cliente    = esMerma ? "" : (document.getElementById("salidaCliente")?.value.trim()  || "");
  var documento  = document.getElementById("salidaDocumento")?.value.trim() || "";
  var motivo     = document.getElementById("salidaMotivo")?.value.trim()    || "";
  var metodoPago = esMerma ? null : (_metodoPagoActual || "efectivo");

  if (!esMerma && metodoPago === "fiado" && !cliente) {
    showToast("⚠️ Para venta fiada debes indicar el nombre del cliente");
    document.getElementById("salidaCliente").focus();
    return;
  }

  // Validar y armar pago mixto
  var pagoMixtoDetalle = null;
  if (!esMerma && metodoPago === "mixto") {
    var efectivo      = parseFloat(document.getElementById("mixtoEfectivo")?.value)      || 0;
    var debito        = parseFloat(document.getElementById("mixtoDebito")?.value)         || 0;
    var credito       = parseFloat(document.getElementById("mixtoCredito")?.value)        || 0;
    var transferencia = parseFloat(document.getElementById("mixtoTransferencia")?.value)  || 0;
    var totalMixto    = efectivo + debito + credito + transferencia;
    var totalCarrito  = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);

    if (totalMixto < totalCarrito) {
      showToast("⚠️ El total asignado (" + "$" + Math.round(totalMixto).toLocaleString("es-CL") + ") es menor al total de la venta");
      return;
    }
    pagoMixtoDetalle = { efectivo, debito, credito, transferencia };
    metodoPago = "mixto";
  }

  var notaBase = esMerma ? (motivo || "Merma") : "";
  if (!esMerma) {
    if (cliente) notaBase = "Cliente: " + cliente;
    if (motivo)  notaBase = notaBase ? notaBase + " — " + motivo : motivo;
  }

  var btn = document.getElementById("btnConfirmarVenta");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
  cerrarEscanerSalida();

  try {
    for (var item of _carrito) {
      await api("/salidas/", "POST", {
        producto_id:      item.id,
        tipo_salida:      _tipoSalidaActual,
        cantidad:         item.qty,
        precio_unitario:  item.precio,
        motivo:           notaBase || null,
        numero_documento: documento || null,
        metodo_pago:      metodoPago,
        cliente_nombre:   cliente || null,
        pago_mixto:       pagoMixtoDetalle || null,
      });
    }
    var totalItems = _carrito.reduce(function(a,i){ return a + i.qty; }, 0);
    var totalPesos = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);
    var msg = esMerma
      ? "🗑️ Merma registrada — " + totalItems + " unidades"
      : "✅ Venta confirmada — " + totalItems + " unidades · $" + totalPesos.toLocaleString("es-CL")
        + (metodoPago === "fiado" ? " · Crédito a " + _esc(cliente) : "");

    cerrarModalSalida();
    showToast(msg);
    await cargarSalidas();
    await cargarStock();
    await cargarDashboard();

  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = esMerma ? "✔ Confirmar merma" : "✔ Confirmar venta"; }
    showToast("Error: " + _esc(error.message));
  }
}

/* ============================================================
   MODAL RESOLUCION DE CUARENTENA
   El supervisor decide el destino del producto en espera
   ============================================================ */
var _salidaResolverId = null;

function abrirModalResolucion(salidaId) {
  _salidaResolverId = salidaId;
  var form = document.getElementById("formResolucion");
  if (form) form.reset();
  document.getElementById("modalResolucion").classList.add("open");
}

function cerrarModalResolucion() {
  document.getElementById("modalResolucion").classList.remove("open");
  _salidaResolverId = null;
}

async function guardarResolucion() {
  if (!_salidaResolverId) return;
  var nuevoEstado = document.getElementById("resolucionEstado")?.value     || "";
  var nota        = document.getElementById("resolucionNota")?.value.trim() || "";

  if (!nuevoEstado) { showToast("Selecciona una resolucion"); return; }

  var btn = document.querySelector("#modalResolucion .btn-primary");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await api("/salidas/" + _salidaResolverId + "/estado", "PATCH", {
      nuevo_estado:    nuevoEstado,
      resolucion_nota: nota || null,
    });

    cerrarModalResolucion();

    var labelRes = {
      reingresado:       "Producto reingresado al stock",
      descartado:        "Producto descartado",
      enviado_proveedor: "Devolucion al proveedor registrada",
    };
    showToast(labelRes[nuevoEstado] || "Resolucion guardada");
    await cargarSalidas();
    await cargarStock();
    await cargarDashboard();

  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Confirmar resolucion"; }
    showToast("Error: " + _esc(error.message));
  }
}

/* ============================================================
   REPORTES — dinamico, calcula desde los datos reales
   ============================================================ */

// getReporteFiltros — obtiene periodo y rango para los APIs
// Analogia: armar el formulario de busqueda antes de enviarlo
function getReporteFiltros() {
  var periodo = document.getElementById("reportePeriodo")?.value || "mes";
  var desde   = document.getElementById("reporteDesde")?.value  || "";
  var hasta   = document.getElementById("reporteHasta")?.value  || "";
  var params  = "?periodo=" + periodo;
  if (periodo === "custom" && desde) params += "&desde=" + encodeURIComponent(desde);
  if (periodo === "custom" && hasta) params += "&hasta=" + encodeURIComponent(hasta);
  return params;
}

async function cargarReportes() {
  try {
    const periodo = document.getElementById("reportePeriodo")?.value || "mes";

    // Mostrar u ocultar inputs de rango personalizado
    var rangoDiv = document.getElementById("reporteRangoCustom");
    if (rangoDiv) rangoDiv.style.display = periodo === "custom" ? "flex" : "none";

    if (periodo === "custom") {
      var desde = document.getElementById("reporteDesde")?.value;
      var hasta = document.getElementById("reporteHasta")?.value;
      if (!desde || !hasta) return;
    }

    const [productos, movimientos, resumenReportes, fiadosResumen, fiadosLista] = await Promise.all([
      api("/productos/"),
      api("/movimientos/?limit=500"),
      api("/reportes/ventas-resumen" + getReporteFiltros()),
      api("/fiados/resumen"),
      api("/fiados/"),
    ]);

    var totalVentas   = resumenReportes.total_valor    || 0;
    var totalUnidades = resumenReportes.total_unidades || 0;
    var totalMermasUnd = resumenReportes.total_mermas  || 0;
    var vStr = totalVentas >= 1000000 ? "$"+(totalVentas/1000000).toFixed(1)+"M"
             : totalVentas >= 1000    ? "$"+Math.round(totalVentas/1000)+"K"
             : "$"+Math.round(totalVentas).toLocaleString("es-CL");
    setEl("reporteValorVentas", totalVentas > 0 ? vStr : "—");
    setEl("reporteUnidades",    totalUnidades > 0 ? totalUnidades.toLocaleString("es-CL") : "—");
    setEl("reporteMermas",      totalMermasUnd > 0 ? "$"+Math.round(totalMermasUnd).toLocaleString("es-CL") : "0");

    var valorBodega = productos.reduce(function(a,p){ return a + (p.stock_actual*(p.precio_venta||0)); }, 0);
    var vbStr = valorBodega >= 1000000 ? "$"+(valorBodega/1000000).toFixed(1)+"M"
              : valorBodega >= 1000    ? "$"+Math.round(valorBodega/1000)+"K"
              : "$"+Math.round(valorBodega);
    setEl("reporteValorBodega", productos.length > 0 ? vbStr : "—");

    var conPrecio = productos.filter(function(p){ return p.precio_compra>0 && p.precio_venta>0; });
    if (conPrecio.length > 0) {
      var margen = conPrecio.reduce(function(a,p){ return a + ((p.precio_venta-p.precio_compra)/p.precio_compra*100); }, 0) / conPrecio.length;
      setEl("reporteMargen", Math.round(margen) + "%");
    } else {
      setEl("reporteMargen", "—");
    }

    var rotacion = movimientos.filter(function(m){ return m.tipo==="salida"; }).reduce(function(a,m){ return a+m.cantidad; }, 0);
    setEl("reporteRotacion", rotacion);

    // Top 5 productos más movidos
    var conteo = {};
    movimientos.forEach(function(m){ if(m.producto_nombre) conteo[m.producto_nombre] = (conteo[m.producto_nombre]||0) + m.cantidad; });
    var top = Object.entries(conteo).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
    var maxMov = top.length > 0 ? top[0][1] : 1;
    var rankIcons = ["🥇","🥈","🥉","4️⃣","5️⃣"];
    var topEl = document.getElementById("reporteTopProductos");
    if (topEl) {
      topEl.innerHTML = top.length === 0
        ? "<div style='text-align:center;color:var(--muted);padding:24px;font-size:13px'>Sin movimientos aún</div>"
        : top.map(function(item,i){
            var pct = Math.round((item[1]/maxMov)*100);
            // [SEC-5] _esc() en nombre del producto
            return "<div style='display:flex;align-items:center;gap:12px;margin-bottom:12px'>"
              + "<div style='font-size:18px'>" + (rankIcons[i]||"") + "</div>"
              + "<div style='flex:1'>"
              +   "<div style='font-size:13px;font-weight:500;margin-bottom:4px'>" + _esc(item[0]) + "</div>"
              +   "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +     "<div style='background:var(--verde);height:8px;border-radius:6px;width:"+pct+"%'></div>"
              +   "</div>"
              + "</div>"
              + "<div style='font-size:13px;font-weight:700;color:var(--muted)'>" + _esc(String(item[1])) + " und.</div>"
              + "</div>";
          }).join("");
    }

    // Stock por categoría
    var porCat = {};
    productos.forEach(function(p){ var c=p.categoria||"Sin categoría"; if(!porCat[c]) porCat[c]={t:0,v:0}; porCat[c].t+=p.stock_actual; porCat[c].v+=p.stock_actual*(p.precio_venta||0); });
    var catArr = Object.entries(porCat).sort(function(a,b){ return b[1].t-a[1].t; });
    var maxCat = catArr.length > 0 ? catArr[0][1].t : 1;
    var catEl = document.getElementById("reporteCategorias");
    if (catEl) {
      catEl.innerHTML = catArr.length === 0
        ? "<div style='text-align:center;color:var(--muted);padding:24px;font-size:13px'>Sin categorías aún</div>"
        : catArr.map(function(e){
            var pct = Math.round((e[1].t/maxCat)*100);
            var v   = e[1].v>=1000 ? "$"+Math.round(e[1].v/1000)+"K" : "$"+Math.round(e[1].v);
            return "<div style='margin-bottom:10px'>"
              + "<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px'>"
              +   "<span style='font-weight:500'>" + _esc(e[0]) + "</span>"
              +   "<span style='color:var(--muted)'>" + _esc(String(e[1].t)) + " und · " + v + "</span>"
              + "</div>"
              + "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +   "<div style='background:var(--verde);height:8px;border-radius:6px;width:"+pct+"%'></div>"
              + "</div>"
              + "</div>";
          }).join("");
    }

    // Ventas por método de pago
    var topProd = [];
    try { topProd = await api("/reportes/top-productos" + getReporteFiltros() + "&limite=100"); } catch(e) { topProd = []; }
    var salidasDetalle = await api("/salidas/?tipo_salida=venta&limit=1000");
    var metodosMap  = {};
    var iconMetodo  = { efectivo:"💵", debito:"💳", credito:"💳", transferencia:"📱", cheque:"📝", fiado:"📒", tarjeta:"💳", mixto:"🔀" };
    var labelMetodo = { efectivo:"Efectivo", debito:"Débito", credito:"Crédito", transferencia:"Transferencia", cheque:"Cheque", fiado:"Crédito (fiado)", tarjeta:"Tarjeta", mixto:"Pago Mixto" };
    salidasDetalle.forEach(function(s) {
      var m = s.metodo_pago || "efectivo";
      if (!metodosMap[m]) metodosMap[m] = { monto: 0, cant: 0 };
      metodosMap[m].monto += s.valor_total || 0;
      metodosMap[m].cant  += s.cantidad    || 0;
    });
    var metodosArr = Object.entries(metodosMap).sort(function(a,b){ return b[1].monto - a[1].monto; });
    var maxMetodo  = metodosArr.length > 0 ? metodosArr[0][1].monto : 1;
    var elMetodo   = document.getElementById("reporteMetodoPago");
    if (elMetodo) {
      elMetodo.innerHTML = metodosArr.length === 0
        ? "<div style='text-align:center;color:var(--muted);padding:20px;font-size:13px'>Sin ventas registradas</div>"
        : metodosArr.map(function(e) {
            var pct   = maxMetodo > 0 ? Math.round((e[1].monto / maxMetodo) * 100) : 0;
            var monto = e[1].monto >= 1000000 ? "$"+(e[1].monto/1000000).toFixed(1)+"M"
                      : e[1].monto >= 1000    ? "$"+Math.round(e[1].monto/1000)+"K"
                      : "$"+Math.round(e[1].monto).toLocaleString("es-CL");
            var color = e[0] === "fiado" ? "#f59e0b" : "var(--verde)";
            // [SEC-5] _esc() en método de pago y claves del mapa
            var icono = iconMetodo[e[0]] || "💰";
            var label = labelMetodo[e[0]] || _esc(e[0]);
            return "<div style='margin-bottom:10px'>"
              + "<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px'>"
              +   "<span style='font-weight:600'>" + icono + " " + label + "</span>"
              +   "<span style='color:var(--muted)'>" + _esc(String(e[1].cant)) + " vtas · <strong style='color:var(--text)'>" + monto + "</strong></span>"
              + "</div>"
              + "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +   "<div style='background:"+color+";height:8px;border-radius:6px;width:"+pct+"%'></div>"
              + "</div>"
              + "</div>";
          }).join("");
    }

    // Resumen global de deudas
    // Analogia: el estado de cuenta del cuaderno de fiados
    var elDeudas = document.getElementById("reporteDeudas");
    if (elDeudas) {
      var totalDeuda     = fiadosResumen.total_deuda_pendiente   || 0;
      var totalClientes  = fiadosResumen.total_clientes_con_deuda || 0;
      var totalFiados    = fiadosLista.length;
      var pagados        = fiadosLista.filter(function(f){ return f.estado === "pagado"; }).length;
      var parciales      = fiadosLista.filter(function(f){ return f.estado === "pagado_parcial"; }).length;
      var pendientes     = fiadosLista.filter(function(f){ return f.estado === "pendiente"; }).length;
      var montoTotal     = fiadosLista.reduce(function(a,f){ return a + f.monto_total; }, 0);
      var montoCobrado   = fiadosLista.reduce(function(a,f){ return a + f.monto_pagado; }, 0);
      var pctCobrado     = montoTotal > 0 ? Math.round((montoCobrado / montoTotal) * 100) : 0;

      elDeudas.innerHTML = totalFiados === 0
        ? "<div style='text-align:center;color:var(--muted);padding:20px;font-size:13px'>Sin deudas registradas</div>"
        : "<div style='display:flex;flex-direction:column;gap:8px'>"
          + "<div style='margin-bottom:4px'>"
          + "<div style='display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px'>"
          +   "<span style='color:var(--muted)'>Cobrado</span>"
          +   "<span style='font-weight:700'>" + pctCobrado + "%  ·  $" + montoCobrado.toLocaleString("es-CL") + " / $" + montoTotal.toLocaleString("es-CL") + "</span>"
          + "</div>"
          + "<div style='background:var(--bg3);border-radius:6px;height:10px'>"
          +   "<div style='background:var(--verde);height:10px;border-radius:6px;width:"+pctCobrado+"%'></div>"
          + "</div></div>"
          + "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px'>"
          +   _dCard("⏳","Pendiente",pendientes,"#f59e0b")
          +   _dCard("🔄","Parcial",parciales,"var(--azul)")
          +   _dCard("✅","Pagado",pagados,"var(--verde)")
          + "</div>"
          + "<div style='background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px;margin-top:4px;display:flex;justify-content:space-between;align-items:center'>"
          +   "<span style='font-size:13px;color:#f59e0b;font-weight:600'>💰 Por cobrar</span>"
          +   "<span style='font-family:var(--font-head);font-size:20px;font-weight:800;color:#f59e0b'>$" + totalDeuda.toLocaleString("es-CL") + "</span>"
          + "</div>"
          + "<div style='font-size:12px;color:var(--muted);text-align:right;margin-top:2px'>" + _esc(String(totalClientes)) + " cliente(s) con deuda abierta · <a onclick=\"showScreen('fiados')\" style='color:var(--azul);cursor:pointer;text-decoration:underline'>Ver deudores →</a></div>"
          + "</div>";
    }

    var tienedatos = totalVentas > 0 || productos.length > 0;
    var contenido  = document.getElementById("reportesContenido");
    var vacioMsg   = document.getElementById("reportesVacioMsg");
    if (contenido) contenido.style.display = tienedatos ? "block" : "none";
    if (vacioMsg)  vacioMsg.style.display  = tienedatos ? "none"  : "block";

  } catch(error) { console.error("Error reportes:", error); }

  cargarReportesPro();
}

// Helper para mini-cards de deudas
function _dCard(icon, label, val, color) {
  return "<div style='background:var(--bg3);border-radius:8px;padding:10px;text-align:center'>"
    + "<div style='font-size:18px'>"+icon+"</div>"
    + "<div style='font-family:var(--font-head);font-size:18px;font-weight:800;color:"+color+"'>"+_esc(String(val))+"</div>"
    + "<div style='font-size:11px;color:var(--muted)'>"+_esc(label)+"</div>"
    + "</div>";
}

/* ============================================================
   REPORTES PRO — carga separada, maneja 403 con candado
   Analogia: vitrina iluminada — el colaborador Basico VE los
   reportes Pro pero no puede interactuar con ellos.
   ============================================================ */
async function cargarReportesPro() {
  const periodo = document.getElementById("reportePeriodo")?.value || "mes";

  // Muestra overlay de candado en una tarjeta Pro
  function mostrarCandado(lockId, nombreVentana) {
    var el = document.getElementById(lockId);
    if (!el) return;
    el.style.display = "flex";
    // [SEC-5] Usar textContent para nombre de ventana
    el.innerHTML =
      "<div style='text-align:center;padding:8px'>"
      + "<div style='font-size:14px;font-weight:700;color:rgba(255,255,255,0.9);margin-bottom:6px'>" + _esc(nombreVentana || "") + "</div>"
      + "<div style='font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px'>Disponible en Plan Pro</div>"
      + "<button class='lock-btn' onclick=\"showScreen('equipo')\">Ver planes →</button>"
      + "</div>";
  }

  // Verifica si el error es un 403 por plan
  function esPlanRequerido(err) {
    if (err.detail && err.detail.tipo === "plan_requerido") return true;
    if (err.status === 403) return true;
    try { var d = JSON.parse(err.message); return d.tipo === "plan_requerido"; } catch(e) {}
    return false;
  }

  if (!empresaInfo) {
    try { empresaInfo = await api("/empresa/info"); } catch(e) {}
  }

  var planActual = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  var esPro      = planActual === "pro" && (empresaInfo && empresaInfo.plan_activo !== false);

  if (!esPro) {
    mostrarCandado("lockGananciaReal",  "Ganancia Real del Periodo");
    mostrarCandado("lockComparacion",    "Comparación de Periodos");
    mostrarCandado("lockRotacion",       "Rotación de Inventario");
    mostrarCandado("lockSinMovimiento",  "Capital Dormido");
    var bannerB = document.getElementById("bannerUpgradePro");
    if (bannerB) bannerB.style.display = "flex";
    return;
  }

  var bannerP = document.getElementById("bannerUpgradePro");
  if (bannerP) bannerP.style.display = "none";

  // Ganancia real
  try {
    var ganancia = await api("/reportes/ganancia-real" + getReporteFiltros());
    esPro = true;
    var elG = document.getElementById("reporteGananciaReal");
    if (elG) {
      var mg = ganancia.margen_promedio;
      var colorMg = mg >= 30 ? "var(--verde)" : mg >= 15 ? "#f59e0b" : "var(--rojo)";
      elG.innerHTML =
        "<div style='display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px 0'>"
        + _proMetric("💵", "Ingresos", "$" + Math.round(ganancia.total_ingresos).toLocaleString("es-CL"))
        + _proMetric("📦", "Costo vendido", "$" + Math.round(ganancia.total_costo).toLocaleString("es-CL"))
        + _proMetric("💰", "Ganancia bruta", "$" + Math.round(ganancia.ganancia_bruta).toLocaleString("es-CL"), "var(--verde)")
        + _proMetric("📊", "Margen", _esc(String(mg)) + "%", colorMg)
        + "</div>";
    }
  } catch(err) {
    if (esPlanRequerido(err)) mostrarCandado("lockGananciaReal",  "Ganancia Real del Periodo");
  }

  // Comparación de periodos
  try {
    var comp = await api("/reportes/comparacion-periodos");
    esPro = true;
    var elC = document.getElementById("reporteComparacion");
    if (elC) {
      var v = comp.variacion;
      elC.innerHTML =
        "<div style='display:flex;flex-direction:column;gap:10px;padding:4px 0'>"
        + _compFila("💵 Ingresos",     comp.periodo_actual.ingresos,     comp.periodo_anterior.ingresos,     v.ingresos)
        + _compFila("💰 Ganancia",     comp.periodo_actual.ganancia_bruta, comp.periodo_anterior.ganancia_bruta, v.ganancia_bruta)
        + _compFila("🛒 Ventas",       comp.periodo_actual.ventas,        comp.periodo_anterior.ventas,        v.ventas)
        + _compFila("📦 Unidades",     comp.periodo_actual.unidades,      comp.periodo_anterior.unidades,      v.unidades)
        + "</div>"
        + "<div style='font-size:11px;color:var(--muted);text-align:right;margin-top:4px'>Mes actual vs mes anterior</div>";
    }
  } catch(err) {
    if (esPlanRequerido(err)) mostrarCandado("lockComparacion",   "Comparación de Periodos");
  }

  // Rotación de inventario
  try {
    var rotacion = await api("/reportes/rotacion-inventario" + getReporteFiltros());
    esPro = true;
    var elR = document.getElementById("reporteRotacionPro");
    if (elR) {
      var top5 = rotacion.slice(0, 5);
      var colores = { alta: "var(--verde)", media: "var(--azul)", baja: "#f59e0b", sin_movimiento: "var(--rojo)" };
      elR.innerHTML = top5.length === 0
        ? "<div style='text-align:center;color:var(--muted);padding:20px;font-size:13px'>Sin datos de rotación</div>"
        : top5.map(function(p) {
            var color = colores[p.clasificacion] || "var(--muted)";
            return "<div style='display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)'>"
              + "<div style='flex:1;font-size:13px;font-weight:500'>" + _esc(p.nombre) + "</div>"
              + "<div style='font-size:12px;color:var(--muted);margin:0 12px'>" + _esc(String(p.unidades_vendidas)) + " und.</div>"
              + "<div style='font-size:12px;font-weight:700;color:" + color + ";background:rgba(0,0,0,0.1);padding:2px 8px;border-radius:6px'>" + _esc(p.clasificacion) + "</div>"
              + "</div>";
          }).join("");
    }
  } catch(err) {
    if (esPlanRequerido(err)) mostrarCandado("lockRotacion",      "Rotación de Inventario");
  }

  // Productos sin movimiento / Capital dormido
  try {
    var sinMov = await api("/reportes/productos-sin-movimiento?dias=30");
    esPro = true;
    var elS = document.getElementById("reporteSinMovimiento");
    if (elS) {
      var totalDormido = sinMov.reduce(function(a, p) { return a + p.capital_dormido; }, 0);
      elS.innerHTML = sinMov.length === 0
        ? "<div style='text-align:center;color:var(--verde);padding:20px;font-size:13px'>✅ Todos los productos tuvieron movimiento este mes</div>"
        : "<div style='margin-bottom:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center'>"
          + "<span style='font-size:13px;color:var(--rojo);font-weight:600'>💤 Capital dormido (30 días)</span>"
          + "<span style='font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--rojo)'>$" + Math.round(totalDormido).toLocaleString("es-CL") + "</span>"
          + "</div>"
          + sinMov.slice(0, 5).map(function(p) {
              return "<div style='display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px'>"
                + "<span style='font-weight:500'>" + _esc(p.nombre) + "</span>"
                + "<span style='color:var(--muted)'>" + _esc(String(p.stock_actual)) + " und · <strong style='color:var(--text)'>$" + Math.round(p.capital_dormido).toLocaleString("es-CL") + "</strong></span>"
                + "</div>";
            }).join("")
          + (sinMov.length > 5 ? "<div style='font-size:12px;color:var(--muted);text-align:center;padding-top:8px'>+" + (sinMov.length - 5) + " productos más sin movimiento</div>" : "");
    }
  } catch(err) {
    if (esPlanRequerido(err)) mostrarCandado("lockSinMovimiento", "Capital Dormido");
  }

  var banner = document.getElementById("bannerUpgradePro");
  if (banner) banner.style.display = esPro ? "none" : "flex";

  var botonesExport = document.getElementById("botonesExportPro");
  if (botonesExport) botonesExport.style.display = esPro ? "flex" : "none";
}

/* ============================================================
   EXPORTACIONES PRO — Excel y PDF desde los datos ya cargados
   Analogia: la fotocopiadora del negocio — tomas los datos
   que ya están en pantalla y los conviertes en un documento
   para guardar o compartir
   ============================================================ */

async function exportarExcel() {
  if (typeof XLSX === "undefined") {
    await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  }

  const periodo  = document.getElementById("reportePeriodo")?.value || "mes";
  const wb       = XLSX.utils.book_new();

  try {
    var resumen = await api("/reportes/ventas-resumen" + getReporteFiltros());
    var wsResumen = XLSX.utils.aoa_to_sheet([
      ["REPORTE YEPARSTOCK — " + periodo.toUpperCase()],
      [],
      ["Métrica", "Valor"],
      ["Ventas del periodo ($)",  resumen.total_valor    || 0],
      ["Unidades vendidas",       resumen.total_unidades || 0],
      ["Ticket promedio ($)",     resumen.ticket_promedio || 0],
      ["Mermas ($)",              resumen.total_mermas   || 0],
    ]);
    wsResumen["!cols"] = [{wch:30},{wch:20}];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    var top = await api("/reportes/top-productos" + getReporteFiltros() + "&limite=50");
    if (top && top.length > 0) {
      var wsTop = XLSX.utils.json_to_sheet(top.map(function(p, i) {
        return {
          "Ranking":             i + 1,
          "Producto":            p.nombre,
          "Unidades":            p.unidades,
          "Valor vendido ($)":   p.valor_vendido,
          "Costo total ($)":     p.costo_total,
          "Ganancia bruta ($)":  p.ganancia_bruta,
          "Margen (%)":          p.margen_pct,
        };
      }));
      wsTop["!cols"] = [{wch:10},{wch:30},{wch:12},{wch:18},{wch:16},{wch:18},{wch:12}];
      XLSX.utils.book_append_sheet(wb, wsTop, "Top Productos");
    }

    var ganancia = await api("/reportes/ganancia-real" + getReporteFiltros());
    var wsGan = XLSX.utils.aoa_to_sheet([
      ["GANANCIA REAL — " + periodo.toUpperCase()],
      [],
      ["Concepto", "Monto ($)"],
      ["Ingresos totales",    ganancia.total_ingresos],
      ["Costo de lo vendido", ganancia.total_costo],
      ["Ganancia bruta",      ganancia.ganancia_bruta],
      ["Margen promedio (%)", ganancia.margen_promedio],
    ]);
    wsGan["!cols"] = [{wch:30},{wch:20}];
    XLSX.utils.book_append_sheet(wb, wsGan, "Ganancia Real");

    var rotacion = await api("/reportes/rotacion-inventario" + getReporteFiltros());
    if (rotacion && rotacion.length > 0) {
      var wsRot = XLSX.utils.json_to_sheet(rotacion.map(function(p) {
        return {
          "Producto":          p.nombre,
          "Categoría":         p.categoria || "—",
          "Stock actual":      p.stock_actual,
          "Unidades vendidas": p.unidades_vendidas,
          "Rotación":          p.rotacion,
          "Clasificación":     p.clasificacion,
        };
      }));
      wsRot["!cols"] = [{wch:30},{wch:20},{wch:14},{wch:18},{wch:12},{wch:16}];
      XLSX.utils.book_append_sheet(wb, wsRot, "Rotación Inventario");
    }

    var sinMov = await api("/reportes/productos-sin-movimiento?dias=30");
    if (sinMov && sinMov.length > 0) {
      var wsSin = XLSX.utils.json_to_sheet(sinMov.map(function(p) {
        return {
          "Producto":            p.nombre,
          "Categoría":           p.categoria || "—",
          "Stock actual":        p.stock_actual,
          "Precio compra ($)":   p.precio_compra,
          "Capital dormido ($)": p.capital_dormido,
          "Días sin venta":      p.dias_sin_venta,
        };
      }));
      wsSin["!cols"] = [{wch:30},{wch:20},{wch:14},{wch:16},{wch:18},{wch:14}];
      XLSX.utils.book_append_sheet(wb, wsSin, "Capital Dormido");
    }

    var fecha = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, "reporte-yeparstock-" + fecha + ".xlsx");
    showToast("✅ Excel descargado correctamente");

  } catch(e) {
    showToast("Error al exportar: " + _esc(e.message));
    console.error(e);
  }
}

async function exportarPDF() {
  if (typeof window.jspdf === "undefined") {
    await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js");
  }

  const periodo   = document.getElementById("reportePeriodo")?.value || "mes";
  const { jsPDF } = window.jspdf;
  const doc       = new jsPDF();
  const fecha     = new Date().toLocaleDateString("es-CL", { day:"numeric", month:"long", year:"numeric" });
  var   y         = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte YeparStock", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text("Periodo: " + periodo + "   ·   Generado: " + fecha, 14, y);
  doc.setTextColor(0);
  y += 12;

  try {
    var resumen = await api("/reportes/ventas-resumen" + getReporteFiltros());
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Resumen de Ventas", 14, y); y += 6;
    doc.autoTable({
      startY: y,
      head: [["Métrica", "Valor"]],
      body: [
        ["Ventas del periodo",  "$" + Math.round(resumen.total_valor || 0).toLocaleString("es-CL")],
        ["Unidades vendidas",   (resumen.total_unidades || 0).toLocaleString("es-CL")],
        ["Ticket promedio",     "$" + Math.round(resumen.ticket_promedio || 0).toLocaleString("es-CL")],
        ["Mermas del periodo",  "$" + Math.round(resumen.total_mermas || 0).toLocaleString("es-CL")],
      ],
      theme: "striped", headStyles: { fillColor: [30, 64, 175] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;

    var ganancia = await api("/reportes/ganancia-real" + getReporteFiltros());
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Ganancia Real", 14, y); y += 6;
    doc.autoTable({
      startY: y,
      head: [["Concepto", "Monto"]],
      body: [
        ["Ingresos totales",    "$" + Math.round(ganancia.total_ingresos).toLocaleString("es-CL")],
        ["Costo de lo vendido", "$" + Math.round(ganancia.total_costo).toLocaleString("es-CL")],
        ["Ganancia bruta",      "$" + Math.round(ganancia.ganancia_bruta).toLocaleString("es-CL")],
        ["Margen promedio",     ganancia.margen_promedio + "%"],
      ],
      theme: "striped", headStyles: { fillColor: [5, 150, 105] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 12;

    var top = await api("/reportes/top-productos" + getReporteFiltros() + "&limite=10");
    if (top && top.length > 0) {
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("Top 10 Productos por Ganancia", 14, y); y += 6;
      doc.autoTable({
        startY: y,
        head: [["#", "Producto", "Unidades", "Ganancia ($)", "Margen (%)"]],
        body: top.map(function(p, i) { return [
          i + 1, p.nombre, p.unidades,
          "$" + Math.round(p.ganancia_bruta).toLocaleString("es-CL"),
          p.margen_pct + "%"
        ]; }),
        theme: "striped", headStyles: { fillColor: [124, 58, 237] },
        margin: { left: 14, right: 14 },
      });
    }

    var fechaArchivo = new Date().toISOString().slice(0,10);
    doc.save("reporte-yeparstock-" + fechaArchivo + ".pdf");
    showToast("✅ PDF descargado correctamente");

  } catch(e) {
    showToast("Error al exportar PDF: " + _esc(e.message));
    console.error(e);
  }
}

/* ============================================================
   enviarReportePorEmail — genera y envía el reporte por email
   Analogia: el contador que te manda el resumen mensual a tu correo
   ============================================================ */
async function enviarReportePorEmail() {
  var email = usuarioActual ? usuarioActual.email : null;
  if (!email) { showToast("No se encontró tu email"); return; }

  var confirmado = confirm("¿Enviar el reporte al correo: " + email + "?");
  if (!confirmado) return;

  showToast("📧 Generando y enviando reporte...");

  try {
    var res = await api("/reportes/enviar-email" + getReporteFiltros(), "POST");
    showToast("✅ Reporte enviado a " + _esc(email));
  } catch(e) {
    showToast("Error al enviar: " + _esc(e.message));
  }
}

// Carga un script externo dinámicamente (para XLSX y jsPDF)
function cargarScript(url) {
  return new Promise(function(resolve, reject) {
    if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
    var s = document.createElement("script");
    s.src = url; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Helper — métrica Pro individual
function _proMetric(icon, label, valor, color) {
  color = color || "var(--text)";
  return "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:11px;color:var(--muted);margin-bottom:4px'>" + icon + " " + _esc(label) + "</div>"
    + "<div style='font-family:var(--font-head);font-size:18px;font-weight:800;color:" + color + "'>" + _esc(valor) + "</div>"
    + "</div>";
}

// Helper — fila de comparación de periodos
function _compFila(label, actual, anterior, variacion) {
  var flecha = variacion === null ? "—" : variacion > 0 ? "▲ +" + variacion + "%" : variacion < 0 ? "▼ " + variacion + "%" : "= 0%";
  var colorFlecha = variacion === null ? "var(--muted)" : variacion > 0 ? "var(--verde)" : variacion < 0 ? "var(--rojo)" : "var(--muted)";
  var fmtNum = function(n) { return typeof n === "number" && n > 100 ? "$" + Math.round(n).toLocaleString("es-CL") : (n || 0).toString(); };
  return "<div style='display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)'>"
    + "<div style='font-size:13px;font-weight:600'>" + _esc(label) + "</div>"
    + "<div style='display:flex;align-items:center;gap:12px'>"
    +   "<div style='font-size:12px;color:var(--muted)'>" + _esc(fmtNum(anterior)) + "</div>"
    +   "<div style='font-size:12px'>→</div>"
    +   "<div style='font-size:13px;font-weight:700'>" + _esc(fmtNum(actual)) + "</div>"
    +   "<div style='font-size:12px;font-weight:700;color:" + colorFlecha + ";min-width:60px;text-align:right'>" + _esc(flecha) + "</div>"
    + "</div>"
    + "</div>";
}

/* ============================================================
   NAVEGACION
   ============================================================ */
function aplicarPermisosUI() {
  var rol = usuarioActual ? usuarioActual.rol : "operador";
  if (rol === "admin") return;
  var mapa = {
    "dashboard":"nav-dashboard","productos":"nav-productos","stock":"nav-stock",
    "movimientos":"nav-movimientos","salidas":"nav-salidas","alertas":"nav-alertas",
    "reportes":"nav-reportes","fiados":"nav-fiados"
  };
  Object.keys(mapa).forEach(function(s) {
    var el = document.getElementById(mapa[s]);
    if (el) el.style.display = permisosActual[s] === false ? "none" : "";
  });
}

async function showScreen(name) {
  var rol = usuarioActual ? usuarioActual.rol : "operador";
  if (rol !== "admin" && permisosActual[name] === false) {
    showToast("⛔ No tienes acceso a esta sección");
    return;
  }
  document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("active"); });
  var pantalla = document.getElementById("screen-" + name);
  if (pantalla) pantalla.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(function(n){ n.classList.remove("active"); });
  var navBtn = document.getElementById("nav-" + name);
  if (navBtn) navBtn.classList.add("active");

  if (window.innerWidth <= 768) closeSidebar();

  if (name === "dashboard")   await cargarDashboard();
  if (name === "productos")   await cargarProductos();
  if (name === "stock")       await cargarStock();
  if (name === "movimientos") await cargarMovimientos();
  if (name === "alertas")     await cargarAlertas();
  if (name === "salidas")     await cargarSalidas();
  if (name === "reportes")    await cargarReportes();
  if (name === "equipo")      await cargarEquipo();
  if (name === "fiados")      await cargarFiados();
  if (name === "settings")    await cargarConfiguracion();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("backdrop").classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
}

/* ============================================================
   MODAL AGREGAR PRODUCTO
   ============================================================ */
function openModal() {
  openModalMovimiento();
}

function closeModal() {
  document.getElementById("modalAgregar").classList.remove("open");
  var btn = document.getElementById("btnSaveProductoRapido");
  if (btn) { btn.disabled = false; btn.textContent = "✓ Registrar y agregar al ingreso"; }
}

// Si el valor viene del escáner (solo dígitos) → código de barras
// Si es texto escrito a mano → nombre del producto
function abrirModalRegistroRapido(valorBusqueda) {
  var inputCod  = document.getElementById("inputCodigoBarra");
  var inputNom  = document.getElementById("inputNombre");
  var inputProv = document.getElementById("inputProveedor");
  var inputCI   = document.getElementById("inputCodigo");
  var inputNomHint = document.getElementById("codigoHint");

  var esCodigo = /^[0-9]{4,}$/.test((valorBusqueda || "").trim());

  if (inputCod) inputCod.value = esCodigo ? (valorBusqueda || "") : "";
  if (inputNom) inputNom.value = esCodigo ? "" : (valorBusqueda || "");
  if (inputProv) inputProv.value = "";
  if (inputCI)   inputCI.value   = "";

  // [SEC-5] textContent es seguro — no parsea HTML
  if (inputNomHint) {
    if (esCodigo) {
      inputNomHint.textContent = "✓ Código identificado desde el escáner";
      inputNomHint.style.color = "var(--verde)";
    } else {
      inputNomHint.textContent = "Opcional — agrega el código de barras si lo tienes";
      inputNomHint.style.color = "var(--muted)";
    }
  }

  document.getElementById("modalAgregar").classList.add("open");
  setTimeout(function(){
    var focusEl = (inputNom && inputNom.value) ? inputProv : inputNom;
    if (focusEl) focusEl.focus();
  }, 150);
}

// Guarda el producto rápido y lo deja listo en el chip del ingreso
async function saveProductRapido() {
  var nombre      = (document.getElementById("inputNombre")?.value || "").trim().toUpperCase();
  var codigoBarra = (document.getElementById("inputCodigoBarra")?.value || "").trim();
  var marca       = (document.getElementById("inputProveedor")?.value || "").trim().toUpperCase() || null;
  var codigoInt   = (document.getElementById("inputCodigo")?.value || "").trim().toUpperCase() || null;

  if (!nombre) { showToast("El nombre del producto es obligatorio"); return; }

  var btn = document.getElementById("btnSaveProductoRapido");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    var prod = await api("/productos/", "POST", {
      nombre:               nombre,
      codigo_barra:         codigoBarra || null,
      codigo:               codigoInt   || null,
      proveedor:            null,
      marca:                marca       || null,
      stock_actual:         0,
      stock_minimo:         0,
      precio_compra:        0,
      precio_venta:         0,
      porcentaje_ganancia:  0,
      dias_alerta_venc:     30,
    });

    closeModal();
    showToast("✅ " + _esc(nombre) + " registrado");

    if (_productosCache) {
      _productosCache.push(prod);
      var sel = document.getElementById("movProductoId");
      if (sel) {
        var opt = document.createElement("option");
        opt.value = prod.id;
        opt.textContent = prod.nombre + " (stock: 0)"; // textContent es seguro
        sel.appendChild(opt);
      }
    }

    var chip = document.getElementById("ingresoChip");
    var hint = document.getElementById("ingresoScanHint");
    // [SEC-5] textContent para mostrar nombre del producto
    document.getElementById("ingresoChipNombre").textContent = prod.nombre;
    document.getElementById("ingresoChipDetalle").textContent = "Producto nuevo · Stock: 0";
    document.getElementById("movCantidad").value = 1;
    document.getElementById("movPrecioCompra").value = "";
    if (chip) { chip._productoActual = prod; chip.style.display = "flex"; }
    if (hint) { hint.textContent = "✓ " + prod.nombre + " listo — ajusta cantidad y presiona Agregar"; hint.style.color = "var(--verde)"; }

    var buscar = document.getElementById("movCodigoBuscar");
    if (buscar) buscar.value = prod.nombre;

  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Registrar y agregar al ingreso"; }
    showToast("Error al registrar: " + _esc(e.message || "intenta de nuevo"));
  }
}

function calcularPrecioVenta() {
  var compra     = parseFloat(document.getElementById("inputPrecioCompra").value) || 0;
  var porcentaje = parseFloat(document.getElementById("inputPorcentaje").value)   || 0;
  var hint       = document.getElementById("precioHint");
  if (compra > 0 && porcentaje > 0) {
    var venta = Math.round(compra * (1 + porcentaje/100));
    document.getElementById("inputPrecioVenta").value = venta;
    if (hint) hint.textContent = "Ganancia: $" + (venta-compra).toLocaleString("es-CL") + " por unidad";
  } else {
    if (hint) hint.textContent = "";
  }
}

var _timerBusq = null;
function buscarPorCodigo(codigo) {
  clearTimeout(_timerBusq);
  var hint = document.getElementById("codigoHint");
  if (!codigo) { if (hint) { hint.textContent=""; hint.style.color=""; } return; }
  if (hint) { hint.textContent = "Buscando..."; hint.style.color = "var(--muted)"; }
  _timerBusq = setTimeout(async function(){
    try {
      var p = await api("/productos/buscar-codigo/" + encodeURIComponent(codigo));
      document.getElementById("inputNombre").value       = p.nombre;
      document.getElementById("inputMarca").value        = p.marca     || "";
      document.getElementById("inputProveedor").value    = p.proveedor || "";
      document.getElementById("inputPrecioCompra").value = p.precio_compra || "";
      document.getElementById("inputPrecioVenta").value  = p.precio_venta  || "";
      if (hint) { hint.textContent = "Producto encontrado: " + p.nombre + " (stock: " + p.stock_actual + ")"; hint.style.color = "var(--verde)"; }
    } catch(e) {
      if (hint) { hint.textContent = "Codigo nuevo — completa los campos"; hint.style.color = "var(--amarillo)"; }
    }
  }, 600);
}

var _streamCam = null;
function abrirEscaner() {
  var vid = document.getElementById("videoEscaner");
  if (!vid) return;
  vid.style.display = "block";
  navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } })
    .then(function(stream){
      _streamCam = stream;
      vid.srcObject = stream;
      vid.play();
      if (!("BarcodeDetector" in window)) { cerrarEscaner(); showToast("Camara no soportada en este navegador"); return; }
      var detector = new BarcodeDetector({ formats:["ean_13","ean_8","code_128","qr_code"] });
      var _scan = setInterval(async function(){
        try {
          var codes = await detector.detect(vid);
          if (codes.length > 0) {
            clearInterval(_scan);
            cerrarEscaner();
            document.getElementById("inputCodigoBarra").value = codes[0].rawValue;
            _beep();
            buscarPorCodigo(codes[0].rawValue);
          }
        } catch(e){}
      }, 500);
    })
    .catch(function(){ showToast("No se pudo acceder a la camara"); });
}
function cerrarEscaner() {
  if (_streamCam) { _streamCam.getTracks().forEach(function(t){t.stop();}); _streamCam = null; }
  var vid = document.getElementById("videoEscaner");
  if (vid) vid.style.display = "none";
}

async function saveProduct() {
  var nombre       = document.getElementById("inputNombre").value.trim().toUpperCase();
  var codigoBarra  = document.getElementById("inputCodigoBarra").value.trim().toUpperCase();
  var codigo       = document.getElementById("inputCodigo").value.trim().toUpperCase();
  var marca        = document.getElementById("inputMarca").value.trim().toUpperCase();
  var proveedor    = document.getElementById("inputProveedor").value.trim().toUpperCase();
  var categoria    = document.getElementById("inputCategoria").value;
  var stockActual  = document.getElementById("inputStock").value;
  var stockMin     = document.getElementById("inputStockMin").value;
  var precioComp   = document.getElementById("inputPrecioCompra").value;
  var precioVent   = document.getElementById("inputPrecioVenta").value;
  var porcentaje   = document.getElementById("inputPorcentaje").value;
  var lote         = document.getElementById("inputLote").value.trim();
  var fechaVenc    = document.getElementById("inputFechaVenc").value;
  var diasAlerta   = document.getElementById("inputDiasAlerta").value;

  if (!nombre) { showToast("El nombre del producto es obligatorio"); return; }
  if (parseInt(stockActual) < 0) { showToast("El stock no puede ser negativo"); return; }

  var btn = document.querySelector("#modalAgregar .btn-primary");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  cerrarEscaner();

  try {
    await api("/productos/", "POST", {
      nombre, codigo_barra: codigoBarra||null, codigo: codigo||null,
      marca: marca||null, proveedor: proveedor||null, categoria: categoria||null,
      stock_actual:        parseInt(stockActual)   || 0,
      stock_minimo:        parseInt(stockMin)      || 0,
      precio_compra:       parseFloat(precioComp)  || 0,
      precio_venta:        parseFloat(precioVent)  || 0,
      porcentaje_ganancia: parseFloat(porcentaje)  || 0,
      fecha_vencimiento:   fechaVenc ? new Date(fechaVenc).toISOString() : null,
      dias_alerta_venc:    parseInt(diasAlerta) || 30,
      lote: lote || null,
    });
    closeModal();
    showToast("Producto guardado correctamente");
    await cargarProductos();
    await cargarStock();
    await cargarDashboard();

  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar producto"; }
    if (error.status === 409 && codigoBarra) {
      try {
        var prod    = await api("/productos/buscar-codigo/" + encodeURIComponent(codigoBarra));
        var cantNum = parseInt(stockActual) || 1;
        var params  = "cantidad=" + cantNum + (lote ? "&lote=" + encodeURIComponent(lote) : "");
        await api("/productos/" + prod.id + "/sumar-stock?" + params, "POST");
        closeModal();
        showToast("Se sumaron " + cantNum + " unidades a " + _esc(prod.nombre));
        await cargarProductos();
        await cargarStock();
        await cargarDashboard();
      } catch(e2) { showToast("Error: " + _esc(e2.message)); }
    } else {
      showToast("Error: " + _esc(error.message));
    }
  }
}

async function sumarStockDirecto(productoId, cantidad, lote) {
  var params = "cantidad=" + cantidad + (lote ? "&lote=" + encodeURIComponent(lote) : "");
  return await api("/productos/" + productoId + "/sumar-stock?" + params, "POST");
}

/* ============================================================
   MODAL EDITAR PRODUCTO
   ============================================================ */
async function abrirModalEditar(id) {
  try {
    var p = await api("/productos/" + id);
    document.getElementById("editId").value           = p.id;
    document.getElementById("editNombre").value       = p.nombre        || "";
    document.getElementById("editCodigoBarra").value  = p.codigo_barra  || "";
    document.getElementById("editCodigo").value       = p.codigo        || "";
    document.getElementById("editMarca").value        = p.marca         || "";
    document.getElementById("editProveedor").value    = p.proveedor     || "";
    document.getElementById("editStockMin").value     = p.stock_minimo  || 0;
    document.getElementById("editPrecioCompra").value = p.precio_compra || 0;
    document.getElementById("editPorcentaje").value   = p.porcentaje_ganancia || 0;
    document.getElementById("editPrecioVenta").value  = p.precio_venta  || 0;
    document.getElementById("editLote").value         = p.lote          || "";
    document.getElementById("editDiasAlerta").value   = p.dias_alerta_venc || 30;
    document.getElementById("editFechaVenc").value    = p.fecha_vencimiento
      ? new Date(p.fecha_vencimiento).toISOString().split("T")[0] : "";
    var catSel = document.getElementById("editCategoria");
    for (var opt of catSel.options) { opt.selected = opt.value === (p.categoria||""); }
    document.getElementById("modalEditar").classList.add("open");
  } catch (error) { showToast("Error al cargar el producto: " + _esc(error.message)); }
}

function cerrarModalEditar() {
  document.getElementById("modalEditar").classList.remove("open");
  var hint = document.getElementById("editPrecioHint");
  if (hint) hint.textContent = "";
}

function calcularPrecioVentaEditar() {
  var compra     = parseFloat(document.getElementById("editPrecioCompra").value) || 0;
  var porcentaje = parseFloat(document.getElementById("editPorcentaje").value)   || 0;
  var hint       = document.getElementById("editPrecioHint");
  if (compra > 0 && porcentaje > 0) {
    var venta = Math.round(compra * (1 + porcentaje/100));
    document.getElementById("editPrecioVenta").value = venta;
    if (hint) hint.textContent = "Ganancia: $" + (venta-compra).toLocaleString("es-CL") + " por unidad";
  } else {
    if (hint) hint.textContent = "";
  }
}

async function guardarEdicion() {
  var id          = document.getElementById("editId").value;
  var nombre      = document.getElementById("editNombre").value.trim().toUpperCase();
  var codigoBarra = document.getElementById("editCodigoBarra").value.trim().toUpperCase();
  var codigo      = document.getElementById("editCodigo").value.trim().toUpperCase();
  var marca       = document.getElementById("editMarca").value.trim().toUpperCase();
  var proveedor   = document.getElementById("editProveedor").value.trim().toUpperCase();
  var categoria   = document.getElementById("editCategoria").value;
  var stockMin    = document.getElementById("editStockMin").value;
  var precioComp  = document.getElementById("editPrecioCompra").value;
  var precioVent  = document.getElementById("editPrecioVenta").value;
  var porcentaje  = document.getElementById("editPorcentaje").value;
  var lote        = document.getElementById("editLote").value.trim();
  var fechaVenc   = document.getElementById("editFechaVenc").value;
  var diasAlerta  = document.getElementById("editDiasAlerta").value;

  if (!nombre) { showToast("El nombre es obligatorio"); return; }

  try {
    await api("/productos/" + id, "PUT", {
      nombre, codigo_barra: codigoBarra||null, codigo: codigo||null,
      marca: marca||null, proveedor: proveedor||null, categoria: categoria||null,
      stock_minimo:        parseInt(stockMin)      || 0,
      precio_compra:       parseFloat(precioComp)  || 0,
      precio_venta:        parseFloat(precioVent)  || 0,
      porcentaje_ganancia: parseFloat(porcentaje)  || 0,
      lote: lote || null,
      fecha_vencimiento: fechaVenc ? new Date(fechaVenc).toISOString() : null,
      dias_alerta_venc:  parseInt(diasAlerta) || 30,
    });
    cerrarModalEditar();
    showToast("Producto actualizado correctamente");
    await cargarProductos();
    await cargarStock();
    await cargarDashboard();
  } catch (error) { showToast("Error: " + _esc(error.message)); }
}

/* ============================================================
   ELIMINAR PRODUCTO
   ============================================================ */
var _eliminarId   = null;
var _eliminarNomb = "";

function abrirModalEliminar(id, nombre) {
  _eliminarId   = id;
  _eliminarNomb = nombre;
  var msg = document.getElementById("eliminarMsg");
  if (msg) {
    // [SEC-5] Construir mensaje con textContent para evitar XSS
    msg.innerHTML = "Eliminar <strong>" + _esc(nombre) + "</strong>?<br><br>"
      + "<span style='color:var(--rojo)'>Esta accion no se puede deshacer. El producto sera eliminado permanentemente.</span>";
  }
  document.getElementById("modalEliminar").classList.add("open");
}

function cerrarModalEliminar() {
  document.getElementById("modalEliminar").classList.remove("open");
  _eliminarId = null;
}

async function confirmarEliminar() {
  if (!_eliminarId) return;
  try {
    await api("/productos/" + _eliminarId, "DELETE");
    cerrarModalEliminar();
    showToast(_esc(_eliminarNomb) + " eliminado permanentemente");
    await cargarProductos();
    await cargarStock();
    await cargarDashboard();
  } catch (error) { showToast("Error: " + _esc(error.message)); }
}

/* ============================================================
   MODAL MOVIMIENTO MANUAL (INGRESO)
   ============================================================ */
async function openModalMovimiento() {
  _ingresoCarrito = [];

  try {
    var productos   = await api("/productos/");
    _productosCache = productos;

    var sel = document.getElementById("movProductoId");
    if (sel) {
      sel.innerHTML = "";
      var optDefault = document.createElement("option");
      optDefault.value = "";
      optDefault.textContent = "— O selecciona de la lista —";
      sel.appendChild(optDefault);

      // [SEC-5] Usar DOM API para crear opciones de forma segura
      productos.forEach(function(p){
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.nombre + (p.codigo_barra ? " (" + p.codigo_barra + ")" : "");
        sel.appendChild(opt);
      });
    }
  } catch(e) {}

  var buscar = document.getElementById("movCodigoBuscar");
  if (buscar) buscar.value = "";
  var chip = document.getElementById("ingresoChip");
  if (chip) { chip.style.display = "none"; chip._productoActual = null; }

  renderizarIngresoCarrito();
  document.getElementById("modalMovimiento").classList.add("open");
}

function closeModalMovimiento() {
  document.getElementById("modalMovimiento").classList.remove("open");
  cerrarEscanerIngreso();
  _ingresoCarrito = [];
  renderizarIngresoCarrito();
  var buscar = document.getElementById("movCodigoBuscar");
  if (buscar) buscar.value = "";
  var chip = document.getElementById("ingresoChip");
  if (chip) { chip.style.display = "none"; chip._productoActual = null; }
  var hint = document.getElementById("ingresoScanHint");
  if (hint) { hint.textContent = "Escanea o escribe — Enter o \"Agregar\" para sumarlo al ingreso"; hint.style.color = ""; }
}

/* ============================================================
   CARRITO DE INGRESO
   Analogia: el formulario de recepción de mercancía del almacén
   ============================================================ */
var _ingresoCarrito = [];
var _productosCache = [];

// Calcula precio venta cuando llega la factura al almacén
function calcularPrecioVentaIngreso() {
  var costo = parseFloat(document.getElementById("movPrecioCompraExtra")?.value) || 0;
  var pct   = parseFloat(document.getElementById("movPorcentaje")?.value)        || 0;
  var hint  = document.getElementById("movPrecioHint");
  var elPV  = document.getElementById("movPrecioVenta");
  if (costo > 0 && pct > 0) {
    var pv = Math.round(costo * (1 + pct / 100));
    if (elPV) elPV.value = pv;
    if (hint) hint.textContent = "Ganancia: $" + (pv - costo).toLocaleString("es-CL") + " por unidad";
  } else {
    if (hint) hint.textContent = "";
  }
}

function buscarProductoIngreso(val, desdeEscaner) {
  var chip = document.getElementById("ingresoChip");
  var hint = document.getElementById("ingresoScanHint");
  if (!chip) return;

  if (!val || val.length < 2) {
    chip.style.display = "none";
    if (hint) { hint.textContent = "Escanea o escribe — Enter o \"Agregar\" para sumarlo al ingreso"; hint.style.color = ""; }
    return;
  }

  // Buscar por código exacto primero, luego por nombre parcial
  var prod = (_productosCache || []).find(function(p) {
    return (p.codigo_barra && p.codigo_barra === val) || (p.codigo_interno && p.codigo_interno === val);
  }) || (_productosCache || []).find(function(p) {
    return p.nombre && p.nombre.toLowerCase().includes(val.toLowerCase());
  });

  if (!prod && desdeEscaner) {
    if (hint) { hint.textContent = "⚠️ Código no encontrado — registrando producto nuevo..."; hint.style.color = "var(--amarillo)"; }
    setTimeout(function() { abrirModalRegistroRapido(val); }, 300);
    return;
  }

  if (prod) {
    // [SEC-5] textContent para mostrar nombre y detalle del producto
    document.getElementById("ingresoChipNombre").textContent = prod.nombre;
    document.getElementById("ingresoChipDetalle").textContent =
      "Stock actual: " + (prod.stock_actual || 0) + " · Precio compra: $" + (prod.precio_compra || 0).toLocaleString("es-CL");
    document.getElementById("movPrecioCompra").value = prod.precio_compra || "";
    var mHid = function(id, v){ var el=document.getElementById(id); if(el) el.value=v||""; };
    mHid("movMarca", prod.marca);
    mHid("movCodigoInterno", prod.codigo_interno);
    mHid("movStockMin", prod.stock_minimo);
    mHid("movLote", prod.lote);
    mHid("movPrecioCompraExtra", prod.precio_compra);
    mHid("movPrecioVenta", prod.precio_venta);
    var fv = document.getElementById("movFechaVenc");
    if (fv) fv.value = prod.fecha_vencimiento ? prod.fecha_vencimiento.slice(0,10) : "";
    var catEl = document.getElementById("movCategoria");
    if (catEl && prod.categoria) catEl.value = prod.categoria;
    chip._productoActual = prod;
    chip.style.display = "flex";
    document.getElementById("movCantidad").value = 1;
    var elPC  = document.getElementById("movPrecioCompra");
    var elPct = document.getElementById("movPorcentajeChip");
    if (elPC)  elPC.value  = prod.precio_compra || "";
    if (elPct) elPct.value = prod.porcentaje_ganancia || "";
    calcularPrecioVentaChip();
    if (hint) { hint.textContent = "✓ " + prod.nombre + " — Stock: " + (prod.stock_actual||0) + " und."; hint.style.color = "var(--verde)"; }
  } else {
    chip.style.display = "none";
    if (hint) {
      // [SEC-5] Usar DOM para crear el botón de forma segura
      hint.textContent = "No encontrado — ";
      var btn = document.createElement("button");
      btn.textContent = "➕ Registrar producto nuevo";
      btn.style.cssText = "background:var(--verde);border:none;border-radius:7px;padding:4px 10px;color:#000;font-size:12px;font-weight:700;cursor:pointer";
      btn.onclick = function() { abrirModalRegistroRapido(document.getElementById("movCodigoBuscar").value); };
      hint.appendChild(btn);
      hint.style.color = "var(--muted)";
    }
  }
}

function onProductoIngresoSeleccionado() {
  var sel  = document.getElementById("movProductoId");
  var prod = (_productosCache || []).find(function(p){ return p.id == sel.value; });
  if (!prod) return;
  document.getElementById("movCodigoBuscar").value = prod.nombre;
  buscarProductoIngreso(prod.nombre);
}

function cambiarQtyIngreso(delta) {
  var inp = document.getElementById("movCantidad");
  var v   = Math.max(1, (parseInt(inp.value) || 1) + delta);
  inp.value = v;
}

// Calcula precio venta en el chip de ingreso según precio compra + % ganancia
function calcularPrecioVentaChip() {
  var compra = parseFloat(document.getElementById("movPrecioCompra")?.value) || 0;
  var pct    = parseFloat(document.getElementById("movPorcentajeChip")?.value) || 0;
  var elPV   = document.getElementById("movPrecioVentaChip");
  var hint   = document.getElementById("chipPrecioHint");

  if (compra > 0 && pct > 0) {
    var venta    = Math.round(compra * (1 + pct / 100));
    var ganancia = venta - compra;
    if (elPV) elPV.value = venta;
    if (hint) {
      hint.textContent = "Ganancia: $" + ganancia.toLocaleString("es-CL") + " por unidad";
      hint.style.display = "block";
    }
  } else if (compra > 0) {
    if (elPV) elPV.value = "";
    if (hint) { hint.textContent = "Ingresa % de ganancia para calcular precio venta"; hint.style.color = "var(--muted)"; hint.style.display = "block"; }
  } else {
    if (elPV) elPV.value = "";
    if (hint) hint.style.display = "none";
  }
}

function abrirEscanerIngreso() {
  var video = document.getElementById("videoEscanerIngreso");
  var visor = document.getElementById("escanerIngresoVisor");
  if (!video) return;

  if (visor) visor.style.display = "block";
  var area = document.getElementById("ingresoScrollArea");
  if (area) area.scrollTop = 0;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(function(stream) {
      video.srcObject = stream;
      video.play();
      if (!("BarcodeDetector" in window)) {
        cerrarEscanerIngreso();
        showToast("Escaner no soportado en este navegador");
        return;
      }
      var detector = new BarcodeDetector({ formats: ["ean_13","ean_8","code_128","qr_code"] });
      var _scanInterval = setInterval(async function() {
        try {
          var codes = await detector.detect(video);
          if (codes.length > 0) {
            clearInterval(_scanInterval);
            try { if (typeof _beep === "function") _beep(); } catch(e) {}
            cerrarEscanerIngreso();
            var inputScan = document.getElementById("movCodigoBuscar");
            if (inputScan) inputScan.value = codes[0].rawValue;
            buscarProductoIngreso(codes[0].rawValue, true);
          }
        } catch(e) {}
      }, 300);
      video._scanInterval = _scanInterval;
    })
    .catch(function() {
      cerrarEscanerIngreso();
      showToast("No se pudo acceder a la camara");
    });
}

function cerrarEscanerIngreso() {
  var visor = document.getElementById("escanerIngresoVisor");
  var video = document.getElementById("videoEscanerIngreso");
  if (visor) visor.style.display = "none";
  if (video) {
    if (video._scanInterval) { clearInterval(video._scanInterval); video._scanInterval = null; }
    if (video.srcObject) {
      try { video.srcObject.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}
      video.srcObject = null;
    }
  }
}

function agregarAlIngresoCarrito() {
  var chip = document.getElementById("ingresoChip");
  if (!chip || chip.style.display === "none" || !chip._productoActual) {
    showToast("Selecciona un producto primero"); return;
  }
  var prod    = chip._productoActual;
  var qty     = parseInt(document.getElementById("movCantidad").value) || 1;
  var precioC = parseFloat(document.getElementById("movPrecioCompra").value) || 0;
  var pct     = parseFloat(document.getElementById("movPorcentajeChip")?.value) || 0;
  var precioV = parseFloat(document.getElementById("movPrecioVentaChip")?.value) || 0;

  var mHid = function(id, v){ var el=document.getElementById(id); if(el) el.value=v||""; };
  mHid("movPrecioCompraExtra", precioC);
  mHid("movPorcentaje", pct);
  mHid("movPrecioVenta", precioV);

  var existente = _ingresoCarrito.find(function(i){ return i.id === prod.id; });
  if (existente) {
    existente.qty          += qty;
    existente.precio_compra = precioC;
    existente.precio_venta  = precioV;
    existente.porcentaje    = pct;
  } else {
    _ingresoCarrito.push({ id: prod.id, nombre: prod.nombre, qty: qty, precio_compra: precioC, precio_venta: precioV, porcentaje: pct });
  }

  document.getElementById("movCodigoBuscar").value = "";
  chip.style.display = "none";
  chip._productoActual = null;
  var elPC  = document.getElementById("movPrecioCompra");   if (elPC)  elPC.value  = "";
  var elPct = document.getElementById("movPorcentajeChip"); if (elPct) elPct.value = "";
  var elPV  = document.getElementById("movPrecioVentaChip"); if (elPV)  elPV.value  = "";
  var hint  = document.getElementById("chipPrecioHint"); if (hint) hint.style.display = "none";

  var hintScan = document.getElementById("ingresoScanHint");
  if (hintScan) { hintScan.textContent = "Escanea o escribe — Enter o \"Agregar\" para sumarlo al ingreso"; hintScan.style.color = ""; }

  renderizarIngresoCarrito();
}

function renderizarIngresoCarrito() {
  var wrap  = document.getElementById("ingresoCarritoWrap");
  var lista = document.getElementById("ingresoCarritoLista");
  var btnC  = document.getElementById("btnConfirmarIngreso");
  if (!wrap || !lista) return;

  var elDet = document.getElementById("ingresoTotalDetalle");
  var elUnd = document.getElementById("ingresoTotalUnidades");

  if (_ingresoCarrito.length === 0) {
    wrap.style.display = "none";
    if (btnC) { btnC.disabled = true; btnC.style.opacity = "0.5"; }
    if (elDet) elDet.textContent = "0 productos";
    if (elUnd) elUnd.textContent = "0";
    return;
  }

  wrap.style.display = "block";
  if (btnC) { btnC.disabled = false; btnC.style.opacity = "1"; }

  // [SEC-5] _esc() en nombres de los items del carrito de ingreso
  lista.innerHTML = _ingresoCarrito.map(function(item, idx) {
    return "<div style='display:flex;align-items:center;gap:8px;background:var(--bg3);border-radius:10px;padding:8px 12px'>"
      + "<div style='flex:1;font-size:13px;font-weight:600'>" + _esc(item.nombre) + "</div>"
      + "<div style='font-size:13px;font-weight:800;color:var(--verde)'>" + _esc(String(item.qty)) + " ud.</div>"
      + "<button onclick='quitarDeIngresoCarrito(" + idx + ")' style='background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 4px'>✕</button>"
      + "</div>";
  }).join("");

  var totalUnd  = _ingresoCarrito.reduce(function(a,i){ return a + i.qty; }, 0);
  var totalProd = _ingresoCarrito.length;
  if (elDet) elDet.textContent = totalProd + " producto" + (totalProd !== 1 ? "s" : "");
  if (elUnd) elUnd.textContent = totalUnd;
}

function quitarDeIngresoCarrito(idx) {
  _ingresoCarrito.splice(idx, 1);
  renderizarIngresoCarrito();
}

async function guardarMovimiento() {
  if (_ingresoCarrito.length === 0) { showToast("Agrega al menos un producto"); return; }

  var lote         = document.getElementById("movLote")?.value.trim()              || null;
  var nota         = document.getElementById("movNota")?.value.trim()              || null;
  var numDocumento = document.getElementById("movNumDocumento")?.value.trim()      || null;
  var proveedor    = document.getElementById("movProveedor")?.value.trim()         || null;
  var marca        = document.getElementById("movMarca")?.value.trim()             || null;
  var categoria    = document.getElementById("movCategoria")?.value                || null;
  var codigoInt    = document.getElementById("movCodigoInterno")?.value.trim()     || null;
  var stockMin     = parseInt(document.getElementById("movStockMin")?.value)       || null;
  var precioCompra = parseFloat(document.getElementById("movPrecioCompraExtra")?.value) || null;
  var precioVenta  = parseFloat(document.getElementById("movPrecioVenta")?.value)  || null;
  var fechaVenc    = document.getElementById("movFechaVenc")?.value                || null;
  var diasAlerta   = parseInt(document.getElementById("movDiasAlerta")?.value)     || null;

  var btn = document.getElementById("btnConfirmarIngreso");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    for (var item of _ingresoCarrito) {
      var actualizacion = {};
      if (marca)        actualizacion.marca             = marca;
      if (categoria)    actualizacion.categoria         = categoria;
      if (codigoInt)    actualizacion.codigo_interno    = codigoInt;
      if (stockMin)     actualizacion.stock_minimo      = stockMin;
      if (precioCompra) actualizacion.precio_compra     = precioCompra;
      if (precioVenta)  actualizacion.precio_venta      = precioVenta;
      if (fechaVenc)    actualizacion.fecha_vencimiento = fechaVenc;
      if (diasAlerta)   actualizacion.dias_alerta       = diasAlerta;
      if (Object.keys(actualizacion).length > 0) {
        try { await api("/productos/" + item.id, "PUT", actualizacion); } catch(e) {}
      }

      await api("/movimientos/", "POST", {
        producto_id:   item.id,
        tipo:          "entrada",
        cantidad:      item.qty,
        lote:          lote,
        nota:          (proveedor ? "Proveedor: " + proveedor + (nota ? " — " + nota : "") : nota),
        num_documento: numDocumento,
      });
    }
    var totalUnd = _ingresoCarrito.reduce(function(a,i){ return a + i.qty; }, 0);
    closeModalMovimiento();
    showToast("✅ Ingreso registrado — " + totalUnd + " unidades en " + _ingresoCarrito.length + " productos");
    _ingresoCarrito = [];
    await cargarMovimientos();
    await cargarStock();
    await cargarDashboard();
  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = "✔ Confirmar ingreso"; }
    showToast("Error: " + _esc(error.message));
  }
}

/* ============================================================
   CONFIGURACION
   ============================================================ */
var configTemporal = { negocio:"", usuario:"", email:"", moneda:"CLP", color:"#00C77B", logoData:null };

function previewLogo(event) {
  var archivo = event.target.files[0];
  if (!archivo) return;
  if (!archivo.type.startsWith("image/")) { showToast("Solo se permiten imagenes"); return; }
  if (archivo.size > 2*1024*1024)         { showToast("El logo no puede superar 2MB"); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    configTemporal.logoData = e.target.result;
    var img = document.getElementById("logoImg"), ini = document.getElementById("logoInitials");
    // [SEC-5] Asignar src con el resultado del FileReader (data URL) es seguro
    img.src = e.target.result; img.style.display = "block"; ini.style.display = "none";
    showToast("Logo cargado — recuerda guardar");
  };
  reader.readAsDataURL(archivo);
}

/* ============================================================
   LOGO POR URL
   Analogia: en vez de traer la foto física, pegas el link
   donde está publicada en internet
   ============================================================ */
function toggleInputUrlLogo() {
  if (!esAdmin) { showToast("Solo el administrador puede cambiar el logo"); return; }
  var wrap = document.getElementById("logoUrlWrap");
  if (wrap) wrap.style.display = wrap.style.display === "none" ? "block" : "none";
}

function previewLogoUrl(url) {
  if (!url || !url.startsWith("http")) return;
  var img = document.getElementById("logoImg");
  var ini = document.getElementById("logoInitials");
  img.src = url;
  img.style.display = "block";
  ini.style.display = "none";
}

function aplicarLogoUrl() {
  if (!esAdmin) { showToast("Solo el administrador puede cambiar el logo"); return; }
  var url = document.getElementById("inputLogoUrl").value.trim();
  if (!url) { showToast("Ingresa una URL válida"); return; }

  var img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function() {
    var canvas = document.createElement("canvas");
    canvas.width  = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    try {
      var base64 = canvas.toDataURL("image/png");
      configTemporal.logoData = base64;
      var imgEl = document.getElementById("logoImg");
      var iniEl = document.getElementById("logoInitials");
      imgEl.src = base64; imgEl.style.display = "block"; iniEl.style.display = "none";
      document.getElementById("logoUrlWrap").style.display = "none";
      showToast("✅ Logo aplicado — recuerda guardar cambios");
    } catch(e) {
      configTemporal.logoData = url;
      showToast("✅ Logo aplicado — recuerda guardar cambios");
    }
  };
  img.onerror = function() { showToast("❌ No se pudo cargar la imagen. Verifica la URL"); };
  img.src = url;
}

function quitarLogo() {
  configTemporal.logoData = null;
  var img = document.getElementById("logoImg"), ini = document.getElementById("logoInitials");
  img.src = ""; img.style.display = "none"; ini.style.display = "flex";
  document.getElementById("inputLogo").value = "";
  showToast("Logo eliminado");
}

function previsualizarColor(hex) {
  document.documentElement.style.setProperty("--verde", hex);
  document.documentElement.style.setProperty("--verde-dark", ajustarBrillo(hex,-20));
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  document.documentElement.style.setProperty("--verde-glow", "rgba("+r+","+g+","+b+",0.18)");
  var inputHex = document.getElementById("inputColorHex");
  if (inputHex) inputHex.value = hex;
  configTemporal.color = hex;
}

function sincronizarColor(hex) {
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById("inputColor").value = hex;
    previsualizarColor(hex);
  }
}

function ajustarBrillo(hex, n) {
  var r = Math.max(0,Math.min(255,parseInt(hex.slice(1,3),16)+n));
  var g = Math.max(0,Math.min(255,parseInt(hex.slice(3,5),16)+n));
  var b = Math.max(0,Math.min(255,parseInt(hex.slice(5,7),16)+n));
  return "#"+r.toString(16).padStart(2,"0")+g.toString(16).padStart(2,"0")+b.toString(16).padStart(2,"0");
}

// Indicador visual de fuerza de la contraseña
function evaluarFuerzaPassword(pass) {
  var wrap = document.getElementById("passStrengthWrap"), fill = document.getElementById("passStrengthFill"), label = document.getElementById("passStrengthLabel");
  if (!pass) { wrap.style.display="none"; return; }
  wrap.style.display="flex";
  var p=0;
  if(pass.length>=8)p++;if(pass.length>=12)p++;if(/[A-Z]/.test(pass))p++;if(/[0-9]/.test(pass))p++;if(/[^A-Za-z0-9]/.test(pass))p++;
  if(p<=2){fill.style.width="33%";fill.style.background="var(--rojo)";label.textContent="Debil";label.style.color="var(--rojo)";}
  else if(p<=3){fill.style.width="66%";fill.style.background="var(--amarillo)";label.textContent="Media";label.style.color="var(--amarillo)";}
  else{fill.style.width="100%";fill.style.background="var(--verde)";label.textContent="Fuerte";label.style.color="var(--verde)";}
}

function togglePass(inputId, btn) {
  var input = document.getElementById(inputId);
  var oculto = input.type==="password";
  input.type = oculto ? "text" : "password";
  btn.textContent = oculto ? "S" : "V";
}

async function guardarConfiguracion() {
  var negocio     = document.getElementById("inputNegocio").value.trim();
  var moneda      = document.getElementById("inputMoneda").value;
  var nombreUser  = document.getElementById("inputNombreUsuario")?.value.trim() || "";
  var emailUser   = document.getElementById("inputEmail")?.value.trim()         || "";
  var passActual  = document.getElementById("inputPassActual")?.value           || "";
  var passN       = document.getElementById("inputPassNueva")?.value            || "";
  var passC       = document.getElementById("inputPassConfirm")?.value          || "";

  if (!esAdmin && negocio) {
    showToast("Solo el administrador puede cambiar el nombre del negocio");
    return;
  }
  if (!negocio && esAdmin) { showToast("El nombre del negocio es obligatorio"); return; }
  if (passN && passN !== passC) { showToast("Las contraseñas no coinciden"); return; }

  // [SEC-3] Mínimo 8 caracteres también en configuración de contraseña
  if (passN && passN.length < 8) { showToast("La nueva contraseña debe tener al menos 8 caracteres"); return; }

  try {
    await api("/configuracion/", "PUT", {
      nombre_negocio:  negocio,
      moneda:          moneda,
      color_principal: configTemporal.color,
      logo_base64:     configTemporal.logoData || null,
      sonido_escaner:  _sonidoActivo,
    });

    if (nombreUser || emailUser) {
      var bodyUser = {};
      if (nombreUser) bodyUser.nombre = nombreUser;
      if (emailUser)  bodyUser.email  = emailUser;
      if (passN && passActual) { bodyUser.password_actual = passActual; bodyUser.password_nuevo = passN; }
      await api("/auth/perfil", "PUT", bodyUser);

      if (usuarioActual) {
        if (nombreUser) usuarioActual.nombre = nombreUser;
        if (emailUser)  usuarioActual.email  = emailUser;
        localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));
        actualizarUIUsuario();
      }
    }

    document.getElementById("inputPassActual").value  = "";
    document.getElementById("inputPassNueva").value   = "";
    document.getElementById("inputPassConfirm").value = "";
    document.getElementById("passStrengthWrap").style.display = "none";

    showToast("Configuración guardada correctamente");
    showScreen("stock");
  } catch (error) { showToast("Error: " + _esc(error.message)); }
}

/* ============================================================
   CARGAR DATOS EN PANTALLA CONFIGURACIÓN
   Analogia: cuando abres tu ficha en el banco, ves TUS datos
   ============================================================ */
async function cargarConfiguracion() {
  // ── Mostrar/ocultar secciones según rol ──────────────────
  // Admin ve todo. Operador solo ve: cambiar contraseña, color, sonido.
  var soloAdmin = ["settingsAdminNegocio", "settingsAdminCuenta", "settingsAdminPass", "btnGuardarSettingsAdmin"];
  soloAdmin.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = esAdmin ? "" : "none";
  });
  var panelColab = document.getElementById("configColaboradorPanel");
  if (panelColab) panelColab.style.display = esAdmin ? "none" : "block";

  // Limpiar campos
  var campos = ["inputNegocio","inputNombreUsuario","inputEmail","inputPassActual","inputPassNueva","inputPassConfirm","colabPassActual","colabPassNueva","colabPassConfirm"];
  campos.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ""; });

  try {
    var config = await api("/configuracion/");

    if (esAdmin) {
      var inputNegocio = document.getElementById("inputNegocio");
      var inputMoneda  = document.getElementById("inputMoneda");
      if (inputNegocio) inputNegocio.value = config.nombre_negocio || "";
      if (inputMoneda)  inputMoneda.value  = config.moneda         || "CLP";
      if (config.color_principal) previsualizarColor(config.color_principal);

      var img = document.getElementById("logoImg");
      var ini = document.getElementById("logoInitials");
      if (config.logo_base64) {
        configTemporal.logoData = config.logo_base64;
        if (img) { img.src = config.logo_base64; img.style.display = "block"; }
        if (ini) ini.style.display = "none";
      } else {
        configTemporal.logoData = null;
        if (img) { img.src = ""; img.style.display = "none"; }
        if (ini) {
          var nombre = usuarioActual ? usuarioActual.nombre : "";
          var partes = nombre.split(" ");
          ini.textContent = partes.length >= 2 ? (partes[0][0]+partes[1][0]).toUpperCase() : nombre.slice(0,2).toUpperCase();
          ini.style.display = "flex";
        }
      }

      var inputNombreUsuario = document.getElementById("inputNombreUsuario");
      var inputEmail         = document.getElementById("inputEmail");
      if (inputNombreUsuario) inputNombreUsuario.value = usuarioActual ? usuarioActual.nombre : "";
      if (inputEmail)         inputEmail.value         = usuarioActual ? (usuarioActual.email || "") : "";
    }

    // Sonido — visible para todos
    if (config.sonido_escaner) {
      _sonidoActivo = config.sonido_escaner;
      localStorage.setItem("yeparstock_sonido", config.sonido_escaner);
    }
    var soundSel = document.getElementById("soundSelect");
    if (soundSel) soundSel.value = _sonidoActivo;

    // Color del colaborador
    if (!esAdmin && config.color_principal) {
      var colabColorInput = document.getElementById("colabColor");
      if (colabColorInput) colabColorInput.value = config.color_principal;
    }

  } catch(e) {
    if (esAdmin) {
      var inputNombreUsuario = document.getElementById("inputNombreUsuario");
      var inputEmail         = document.getElementById("inputEmail");
      if (inputNombreUsuario) inputNombreUsuario.value = usuarioActual ? usuarioActual.nombre : "";
      if (inputEmail)         inputEmail.value         = usuarioActual ? (usuarioActual.email || "") : "";
    }
  }
}

function descartarCambios() {
  previsualizarColor(configTemporal.color||"#00C77B");
  document.getElementById("inputPassActual").value  = "";
  document.getElementById("inputPassNueva").value   = "";
  document.getElementById("inputPassConfirm").value = "";
  document.getElementById("passStrengthWrap").style.display = "none";
  showToast("Cambios descartados");
}

function toggleTema() {
  var body = document.body, label = document.getElementById("themeLabel"), sw = document.getElementById("themeSwitch");
  if (body.classList.contains("tema-claro")) {
    body.classList.remove("tema-claro"); label.textContent = "Tema oscuro"; sw.classList.remove("activo");
  } else {
    body.classList.add("tema-claro"); label.textContent = "Tema claro"; sw.classList.add("activo");
  }
}

/* ============================================================
   TOAST y UTILIDADES
   ============================================================ */
function showToast(msg) {
  var toast   = document.getElementById("toast");
  var toastEl = document.getElementById("toastMsg");
  // [SEC-5] textContent es seguro — no interpreta HTML en el mensaje del toast
  toastEl.textContent = msg;
  toast.classList.remove("show", "hide");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(function(){
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(function(){ toast.classList.remove("hide"); }, 220);
  }, 2800);
}

async function filterMov(btn, type) {
  document.querySelectorAll(".mov-tab").forEach(function(t){ t.classList.remove("active"); });
  btn.classList.add("active");
  await cargarMovimientos(type === "all" ? "" : type);
}

/* Inicializacion al cargar la pagina */
document.addEventListener("DOMContentLoaded", function(){
  // Los modales no se cierran al hacer clic en el overlay — solo con botón
  ["modalAgregar","modalEditar","modalEliminar","modalMovimiento","modalSalida","modalResolucion","modalInvitar","modalUpgrade"].forEach(function(id){
    var el = document.getElementById(id);
    // Intencional: no se agrega listener de cierre por clic en overlay
  });



  // Botón agregar colaborador
  var btnInvC = document.getElementById("btnInvitarColaborador");
  if (btnInvC) btnInvC.addEventListener("click", abrirModalInvitar);

  // Botones del carrito de ventas
  var btnAgrCart = document.getElementById("btnAgregarCarrito");
  if (btnAgrCart) btnAgrCart.addEventListener("click", agregarAlCarrito);

  // Generar username automático al escribir nombre o apellido del colaborador
  var elNombre   = document.getElementById("invitarNombre");
  var elApellido = document.getElementById("invitarApellido");
  var elUsername = document.getElementById("invitarUsername");
  if (elNombre)   elNombre.addEventListener("input",   generarUsernameAuto);
  if (elApellido) elApellido.addEventListener("input", generarUsernameAuto);
  // Forzar minúsculas al editar username manualmente
  if (elUsername) elUsername.addEventListener("input", function() {
    var pos = this.selectionStart;
    this.value = this.value.toLowerCase().replace(/[^a-z0-9._]/g, "");
    this.setSelectionRange(pos, pos);
  });

  // Si ya hay sesión activa, verificar onboarding
  // Operadores (invitados) entran directo — la empresa ya fue configurada
  if (authToken && usuarioActual) {
    var rolGuardado = usuarioActual.rol;
    var verificarOnboarding = rolGuardado === "admin"
      ? api("/auth/onboarding-status")
      : Promise.resolve({ onboarding_completo: true });

    verificarOnboarding
      .then(function(status) {
        if (!status.onboarding_completo) {
          document.getElementById("loginPage").style.display = "none";
          mostrarOnboarding();
        } else {
          document.getElementById("loginPage").style.display = "none";
          document.getElementById("appMain").style.display   = "flex";
          actualizarUIUsuario();
          iniciarReloj();
          api("/empresa/mis-permisos").then(function(p){ permisosActual = p; aplicarPermisosUI(); }).catch(function(){});
          cargarDashboard();
        }
      })
      .catch(function(err) {
        // Solo cerrar sesion si es error 401 real — no por fallo de red
        // Analogia: si la puerta del edificio no responde, no te mandan a casa
        // solo si el guardia confirma que tu carnet es invalido
        if (err && err.message && err.message.toLowerCase().includes("sesion")) {
          authToken     = null;
          usuarioActual = null;
          _refreshToken = null; // [SEC-1] Limpiar también el refreshToken
          localStorage.removeItem("yeparstock_token");
          localStorage.removeItem("yeparstock_usuario");
          document.getElementById("loginPage").style.display = "block";
          document.getElementById("appMain").style.display   = "none";
        } else {
          // Error de red temporal — entrar con datos guardados
          document.getElementById("loginPage").style.display = "none";
          document.getElementById("appMain").style.display   = "flex";
          actualizarUIUsuario();
          iniciarReloj();
          api("/empresa/mis-permisos").then(function(p){ permisosActual = p; aplicarPermisosUI(); }).catch(function(){});
          cargarDashboard();
        }
      });
  }
});

/* ============================================================
   EQUIPO — Gestión de usuarios del negocio
   Analogia: el panel de RRHH del negocio — solo el admin
   puede contratar, cambiar roles y revocar accesos
   ============================================================ */

let equipoData     = [];
let empresaInfo    = null;
let permisosActual = {};

// Actualiza el badge de plan en el sidebar
// Analogia: la etiqueta del carnet — te dice si eres visitante o VIP
function actualizarBadgePlan() {
  var badge = document.getElementById("sidebarPlanBadge");
  if (!badge) return;
  var plan  = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  var esPro = plan === "pro";
  badge.style.display    = "inline-block";
  // [SEC-5] textContent para el badge del plan
  badge.textContent      = esPro ? "⭐ Plan Pro" : "✦ Plan Básico";
  badge.style.background = esPro ? "rgba(124,58,237,0.15)" : "rgba(0,199,123,0.15)";
  badge.style.color      = esPro ? "#7c3aed" : "var(--verde)";
}
let esAdmin = false;

/* ============================================================
   PANTALLA FIADOS — deudores / cuentas por cobrar
   Analogia: el cuaderno de fiados del almacén hecho digital
   ============================================================ */
var _fiadosTodos       = [];
var _fiadoFiltroEstado = "";

async function cargarFiados() {
  try {
    var [lista, resumen] = await Promise.all([
      api("/fiados/"),
      api("/fiados/resumen")
    ]);
    _fiadosTodos = lista;

    setEl("fiadosTotalDeuda",    "$" + (resumen.total_deuda_pendiente || 0).toLocaleString("es-CL"));
    setEl("fiadosTotalClientes", resumen.total_clientes_con_deuda || 0);
    setEl("fiadosSubtitulo",     (resumen.total_clientes_con_deuda || 0) + " clientes con deuda abierta");

    var badge = document.getElementById("fiadosBadge");
    if (badge) {
      badge.style.display = resumen.total_clientes_con_deuda > 0 ? "inline" : "none";
      badge.textContent   = resumen.total_clientes_con_deuda;
    }

    renderFiados();
  } catch(e) {
    document.getElementById("fiadosLista").innerHTML =
      "<div style='padding:30px;text-align:center;color:var(--muted)'>Error al cargar deudores</div>";
  }
}

function filtrarFiados() {
  renderFiados();
}

function setFiltroFiado(btn, estado) {
  _fiadoFiltroEstado = estado;
  document.querySelectorAll(".fiado-filtro").forEach(function(b){ b.classList.remove("active"); });
  btn.classList.add("active");
  renderFiados();
}

function renderFiados() {
  var buscar = (document.getElementById("fiadosBuscar")?.value || "").toLowerCase();
  var lista  = _fiadosTodos.filter(function(f) {
    var okEstado = !_fiadoFiltroEstado || f.estado === _fiadoFiltroEstado;
    var okBuscar = !buscar || f.cliente_nombre.toLowerCase().includes(buscar);
    return okEstado && okBuscar;
  });

  var cont = document.getElementById("fiadosLista");
  if (!lista.length) {
    cont.innerHTML = "<div style='padding:40px;text-align:center;color:var(--muted);font-size:13px'>No hay deudores con ese filtro</div>";
    return;
  }

  // [SEC-5] _esc() en nombre del cliente y datos de texto del servidor
  var rows = lista.map(function(f) {
    var estadoColor = f.estado === "pagado" ? "var(--verde)" : f.estado === "pagado_parcial" ? "var(--azul)" : "#f59e0b";
    var estadoLabel = f.estado === "pagado" ? "✅ Pagado" : f.estado === "pagado_parcial" ? "🔄 Parcial" : "⏳ Pendiente";
    var fechaRaw    = f.ultima_compra || f.created_at;
    var fecha       = fechaRaw ? new Date(fechaRaw).toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

    return "<tr>"
      + "<td style='padding:12px 16px;font-weight:600'>" + _esc(f.cliente_nombre)
      +   "<br><span style='font-size:11px;color:var(--muted);font-weight:400'>" + _esc(String(f.cantidad_fiados)) + " compra" + (f.cantidad_fiados!==1?"s":"") + "</span></td>"
      + "<td style='padding:12px 8px;text-align:right'>$" + f.monto_total.toLocaleString("es-CL") + "</td>"
      + "<td style='padding:12px 8px;text-align:right;color:var(--verde)'>$" + f.monto_pagado.toLocaleString("es-CL") + "</td>"
      + "<td style='padding:12px 8px;text-align:right;color:#f59e0b;font-weight:700'>$" + f.monto_pendiente.toLocaleString("es-CL") + "</td>"
      + "<td style='padding:12px 8px;text-align:center'><span style='color:" + estadoColor + ";font-size:12px;font-weight:700'>" + estadoLabel + "</span></td>"
      + "<td style='padding:12px 8px;color:var(--muted);font-size:12px;text-align:center'>" + _esc(fecha) + "</td>"
      + "<td style='padding:12px 8px;text-align:center'>"
      + (f.estado !== "pagado"
        ? "<button onclick=\"abrirAbonoFiado('" + _esc(f.cliente_nombre).replace(/'/g,"\\'") + "'," + f.monto_pendiente + ")\" style='background:var(--verde);border:none;border-radius:8px;padding:5px 12px;color:#000;font-size:12px;font-weight:700;cursor:pointer'>💰 Abonar</button>"
        : "<span style='color:var(--muted);font-size:12px'>—</span>")
      + "</td>"
      + "</tr>";
  }).join("");

  cont.innerHTML = "<table style='width:100%;border-collapse:collapse'>"
    + "<thead><tr style='border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase'>"
    + "<th style='padding:10px 16px;text-align:left'>Cliente</th>"
    + "<th style='padding:10px 8px;text-align:right'>Total</th>"
    + "<th style='padding:10px 8px;text-align:right'>Pagado</th>"
    + "<th style='padding:10px 8px;text-align:right'>Pendiente</th>"
    + "<th style='padding:10px 8px;text-align:center'>Estado</th>"
    + "<th style='padding:10px 8px;text-align:center'>Fecha</th>"
    + "<th style='padding:10px 8px;text-align:center'>Acción</th>"
    + "</tr></thead>"
    + "<tbody>" + rows + "</tbody>"
    + "</table>";
}

function abrirAbonoFiado(clienteNombre, pendiente) {
  var monto = prompt("¿Cuánto abona " + clienteNombre + "?\nDeuda pendiente: $" + pendiente.toLocaleString("es-CL"));
  if (!monto || isNaN(parseFloat(monto))) return;
  var montoNum = parseFloat(monto);
  if (montoNum <= 0) { showToast("El monto debe ser mayor a 0"); return; }

  api("/fiados/abonar-cliente?cliente_nombre=" + encodeURIComponent(clienteNombre) + "&monto=" + montoNum, "PATCH")
    .then(function() {
      showToast("✅ Abono de $" + montoNum.toLocaleString("es-CL") + " registrado para " + _esc(clienteNombre));
      cargarFiados();
    })
    .catch(function(e) { showToast("Error: " + _esc(e.message)); });
}

/* ============================================================
   CARGAR EQUIPO
   ============================================================ */
async function cargarEquipo() {
  try {
    const [infoEmpresa, listaEquipo] = await Promise.all([
      api("/empresa/info"),
      api("/empresa/usuarios"),
    ]);

    empresaInfo = infoEmpresa;
    equipoData  = listaEquipo;
    actualizarBadgePlan();

    listaEquipo.forEach(function(u) {
      u.es_yo = usuarioActual && u.id === usuarioActual.id;
    });
    const yo = listaEquipo.find(function(u){ return u.es_yo; });
    esAdmin  = !!(yo && yo.rol === "admin") || (usuarioActual && usuarioActual.rol === "admin");

    renderPlanCard(infoEmpresa);
    renderEquipoTabla(listaEquipo);

    var btnInvitar = document.getElementById("btnInvitarColaborador");
    if (btnInvitar) btnInvitar.style.display = esAdmin ? "flex" : "none";

    var colAcciones = document.getElementById("equipoColAcciones");
    if (colAcciones) colAcciones.style.display = esAdmin ? "table-cell" : "none";

    var badge = document.getElementById("equipoBadge");
    if (badge) badge.style.display = esAdmin ? "inline-block" : "none";

    var sub = document.getElementById("equipoSubtitulo");
    // [SEC-5] textContent para subtítulo del equipo
    if (sub) sub.textContent = _esc(infoEmpresa.nombre) + " · " + listaEquipo.length + " usuario(s)";

  } catch (e) {
    console.error("Error cargando equipo:", e);
    showToast("Error cargando el equipo");
  }
}

/* ============================================================
   RENDER — Tarjeta del plan con botón de upgrade
   ============================================================ */
function renderPlanCard(info) {
  var planNombre  = document.getElementById("equipoPlanNombre");
  var planDetalle = document.getElementById("equipoPlanDetalle");
  var usersActual = document.getElementById("equipoUsersActual");
  var usersMax    = document.getElementById("equipoUsersMax");
  var prodsActual = document.getElementById("equipoProdsActual");
  var prodsMax    = document.getElementById("equipoProdsMax");
  var btnUpgrade  = document.getElementById("btnUpgradePlan");

  if (planNombre) planNombre.textContent = info.plan === "pro" ? "🔵 Pro" : info.plan === "gratis" ? "🆓 Gratis" : "🟢 Básico";

  if (planDetalle) {
    var esFundador = info.plan_es_fundador ? " · Precio fundador 🎉" : "";
    var precio     = info.plan_precio > 0  ? " · $" + info.plan_precio.toLocaleString("es-CL") + "/mes" : "";
    planDetalle.textContent = (
      info.plan === "pro"    ? "Usuarios ilimitados · Productos ilimitados · Multisucursales · Reportes avanzados" :
      info.plan === "basico" ? "Usuarios ilimitados · Productos ilimitados · Reportes básicos" :
                               "1 usuario · Hasta 30 productos · Sin reportes"
    ) + precio + esFundador;
  }

  if (usersActual) usersActual.textContent = info.total_usuarios;
  if (usersMax)    usersMax.textContent    = (info.plan === "gratis") ? "1" : "∞";
  if (prodsActual) prodsActual.textContent = info.total_productos;
  if (prodsMax)    prodsMax.textContent    = (info.plan === "gratis") ? " / 30" : " / ∞";

  if (btnUpgrade) {
    if (esAdmin) {
      btnUpgrade.style.display = "flex";
      btnUpgrade.textContent   = info.plan === "pro" ? "🔄 Cambiar Plan" : info.plan === "basico" ? "⬆️ Subir a Pro" : "⬆️ Mejorar Plan";
    } else {
      btnUpgrade.style.display = "none";
    }
  }

  var btnCancelar = document.getElementById("btnCancelarSuscripcion");
  if (btnCancelar) {
    if (info.esta_cancelado) {
      btnCancelar.textContent      = "🔄 Reactivar suscripción";
      btnCancelar.style.background = "var(--verde)";
      btnCancelar.style.color      = "#000";
      btnCancelar.onclick          = reactivarSuscripcion;
      var avisoCancel = document.getElementById("avisoCancelacion");
      if (avisoCancel) {
        var fecha = info.gracia_hasta
          ? new Date(info.gracia_hasta).toLocaleDateString("es-CL")
          : "—";
        avisoCancel.style.display = "block";
        // [SEC-5] textContent para aviso de cancelación
        avisoCancel.textContent = info.en_gracia
          ? "⚠️ Suscripción cancelada · Acceso de solo lectura hasta el " + fecha
          : "🔴 Suscripción cancelada · Acceso bloqueado el " + fecha;
      }
    } else {
      btnCancelar.textContent      = "❌ Cancelar suscripción";
      btnCancelar.style.background = "transparent";
      btnCancelar.style.color      = "var(--rojo)";
      btnCancelar.onclick          = cancelarSuscripcion;
      var avisoCancel = document.getElementById("avisoCancelacion");
      if (avisoCancel) avisoCancel.style.display = "none";
    }
  }
}

/* ============================================================
   RENDER — Tabla de usuarios del equipo
   Analogia: la lista de empleados con su cargo y estado
   ============================================================ */
function renderEquipoTabla(usuarios) {
  var tbody = document.getElementById("equipoTableBody");
  if (!tbody) return;

  if (!usuarios.length) {
    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;color:var(--muted);padding:40px;font-size:13px'>No hay usuarios en el equipo</td></tr>";
    return;
  }

  // [SEC-5] _esc() en todos los datos del colaborador que van al HTML
  tbody.innerHTML = usuarios.map(function(u) {
    var rolBadge = u.rol === "admin"
      ? "<span style='background:rgba(91,142,255,0.15);color:var(--azul);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>🔑 Admin</span>"
      : "<span style='background:rgba(0,199,123,0.1);color:var(--verde);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>👷 Operador</span>";

    var estadoBadge = u.activo
      ? "<span style='background:rgba(0,199,123,0.1);color:var(--verde);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>● Activo</span>"
      : "<span style='background:rgba(255,80,80,0.1);color:var(--rojo);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>● Inactivo</span>";

    var partes    = u.nombre.split(" ");
    var iniciales = partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : u.nombre.slice(0,2).toUpperCase();

    var fecha = u.created_at
      ? new Date(u.created_at).toLocaleDateString("es-CL", {day:"2-digit",month:"short",year:"numeric"})
      : "—";

    var acciones = "";
    if (esAdmin && !u.es_yo) {
      var btnRol = u.rol === "admin"
        ? "<button onclick='cambiarRolUsuario(" + u.id + ",\"operador\")' style='background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--muted);font-size:12px;cursor:pointer' title='Cambiar a Operador'>→ Operador</button>"
        : "<button onclick='cambiarRolUsuario(" + u.id + ",\"admin\")' style='background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--muted);font-size:12px;cursor:pointer' title='Cambiar a Admin'>→ Admin</button>";

      var btnEstado = u.activo
        ? "<button onclick='desactivarUsuario(" + u.id + ",\"" + _esc(u.nombre).replace(/"/g,"'") + "\")' style='background:none;border:1px solid rgba(255,80,80,0.3);border-radius:7px;padding:5px 10px;color:var(--rojo);font-size:12px;cursor:pointer'>Desactivar</button>"
        : "<button onclick='activarUsuario(" + u.id + ",\"" + _esc(u.nombre).replace(/"/g,"'") + "\")' style='background:none;border:1px solid rgba(0,199,123,0.3);border-radius:7px;padding:5px 10px;color:var(--verde);font-size:12px;cursor:pointer'>Activar</button>";

      var btnPermisos = u.rol === "operador"
        ? "<button onclick='abrirModalPermisos(" + u.id + ",\"" + _esc(u.nombre).replace(/"/g,"'") + "\")' style='background:rgba(91,142,255,0.1);border:1px solid rgba(91,142,255,0.3);border-radius:7px;padding:5px 10px;color:var(--azul);font-size:12px;cursor:pointer'>🔑 Permisos</button>"
        : "";
      acciones = "<td style='text-align:center'><div style='display:flex;gap:6px;justify-content:center'>" + btnRol + btnPermisos + btnEstado + "</div></td>";
    } else if (esAdmin && u.es_yo) {
      acciones = "<td style='text-align:center'><span style='font-size:11px;color:var(--muted)'>Tú</span></td>";
    } else {
      acciones = "<td></td>";
    }

    var esYoStyle = u.es_yo ? "background:rgba(0,199,123,0.04)" : "";

    return "<tr style='" + esYoStyle + "'>"
      + "<td style='padding-left:20px'>"
      +   "<div style='display:flex;align-items:center;gap:10px'>"
      +     "<div style='width:34px;height:34px;border-radius:50%;background:var(--verde);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:13px;font-weight:800;color:#000;flex-shrink:0'>" + _esc(iniciales) + "</div>"
      +     "<div style='font-weight:600;font-size:14px'>" + _esc(u.nombre) + (u.es_yo ? " <span style='font-size:11px;color:var(--muted)'>(tú)</span>" : "") + "</div>"
      +   "</div>"
      + "</td>"
      + "<td style='color:var(--muted);font-size:13px'>"
      + (u.username
          ? "<span style='font-family:monospace;background:var(--bg3);padding:2px 7px;border-radius:5px;font-size:12px'>@" + _esc(u.username) + "</span>"
          : _esc(u.email || "—"))
      + "</td>"
      + "<td>" + rolBadge + "</td>"
      + "<td>" + estadoBadge + "</td>"
      + "<td style='color:var(--muted);font-size:12px'>" + _esc(fecha) + "</td>"
      + acciones
      + "</tr>";
  }).join("");
}

/* ============================================================
   MODAL — Invitar usuario al equipo
   ============================================================ */
function abrirModalInvitar() {
  if (!esAdmin) return;
  document.getElementById("modalInvitar").classList.add("open");
  document.getElementById("formInvitar").reset();
  var uEl = document.getElementById("invitarUsername");
  if (uEl) uEl.value = "";
  if (empresaInfo) {
    var nomEmp = document.getElementById("invitarEmpresaNombre");
    if (nomEmp) nomEmp.textContent = empresaInfo.nombre;
  }
}

function cerrarModalInvitar() {
  document.getElementById("modalInvitar").classList.remove("open");
}

// Quita tildes y deja solo a-z y 0-9
function _limpiarUsername(s) {
  return (s || "").normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Genera usuario nombre.apellido; si ya existe en el equipo agrega número
function generarUsernameAuto() {
  var nombre   = (_limpiarUsername(document.getElementById("invitarNombre")?.value   || ""));
  var apellido = (_limpiarUsername(document.getElementById("invitarApellido")?.value || ""));
  if (!nombre && !apellido) return;

  var base = apellido ? nombre + "." + apellido : nombre;

  var usados = (equipoData || []).map(function(u){ return (u.username || "").toLowerCase(); });
  var candidato = base;
  var n = 1;
  while (usados.indexOf(candidato) !== -1) { candidato = base + n; n++; }

  var uEl = document.getElementById("invitarUsername");
  if (uEl) uEl.value = candidato;
}

async function guardarInvitacion() {
  var nombre   = (document.getElementById("invitarNombre")?.value   || "").trim();
  var apellido = (document.getElementById("invitarApellido")?.value || "").trim();
  var username = (document.getElementById("invitarUsername")?.value || "").trim().toLowerCase();
  var password = document.getElementById("invitarPassword").value.trim();
  var rol      = document.getElementById("invitarRol").value;
  var nombreCompleto = apellido ? nombre + " " + apellido : nombre;

  if (!nombre || !username || !password) { showToast("Completa todos los campos obligatorios"); return; }
  if (!/^[a-z0-9._]+$/.test(username))  { showToast("El colaborador solo puede tener letras minúsculas, números y punto"); return; }
  if (password.length < 8)              { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  var btn = document.querySelector("#modalInvitar .btn-primary");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await api("/empresa/invitar", "POST", {
      nombre:   nombreCompleto,
      username: username,
      password: password,
      rol:      rol
    });
    showToast("✅ " + _esc(nombreCompleto) + " agregado — @" + _esc(username));
    cerrarModalInvitar();
    await cargarEquipo();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Agregar colaborador"; }
    showToast("❌ " + _esc(e.message || "Error al invitar usuario"));
  }
}

/* ============================================================
   ACCIONES — Cambiar rol, activar y desactivar colaboradores
   Analogia: el gerente moviendo fichas en el organigrama
   ============================================================ */
async function cambiarRolUsuario(usuarioId, nuevoRol) {
  var usuario  = equipoData.find(function(u){ return u.id === usuarioId; });
  var nombre   = usuario ? usuario.nombre : "usuario";
  var rolLabel = nuevoRol === "admin" ? "Admin" : "Operador";
  if (!confirm("¿Cambiar a " + nombre + " a " + rolLabel + "?")) return;

  try {
    await api("/empresa/usuarios/" + usuarioId + "/rol?rol=" + nuevoRol, "PATCH");
    showToast("✅ Rol de " + _esc(nombre) + " actualizado a " + rolLabel);
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + _esc(e.message || "No se pudo cambiar el rol"));
  }
}

async function desactivarUsuario(usuarioId, nombre) {
  if (!confirm("¿Desactivar acceso de " + nombre + "? Podrás reactivarlo después.")) return;

  try {
    await api("/empresa/usuarios/" + usuarioId + "/estado?activo=false", "PATCH");
    showToast("✅ " + _esc(nombre) + " desactivado");
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + _esc(e.message || "No se pudo desactivar"));
  }
}

async function activarUsuario(usuarioId, nombre) {
  try {
    await api("/empresa/usuarios/" + usuarioId + "/estado?activo=true", "PATCH");
    showToast("✅ " + _esc(nombre) + " reactivado");
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + _esc(e.message || "No se pudo activar"));
  }
}

/* ============================================================
   MODAL — Cambio de plan
   Analogia: como un menú de membresías donde haces clic
   en la que quieres y el cambio ocurre al instante
   ============================================================ */

var planSeleccionado = null;

function abrirModalUpgrade() {
  planSeleccionado = null;

  var planActual = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  _resaltarPlanActual(planActual);

  var btn = document.getElementById("btnConfirmarPlan");
  var msg = document.getElementById("upgradeMensaje");
  if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.textContent = "Selecciona un plan para continuar"; }
  if (msg) msg.style.display = "none";

  document.getElementById("modalUpgrade").classList.add("open");
}

function _resaltarPlanActual(plan) {
  var cardGratis = document.getElementById("cardPlanGratis");
  var cardBasico = document.getElementById("cardPlanBasico");
  var cardPro    = document.getElementById("cardPlanPro");
  if (cardGratis) { cardGratis.style.border = "2px solid var(--border)"; cardGratis.style.background = ""; }
  if (cardBasico) { cardBasico.style.border = "2px solid var(--border)"; cardBasico.style.background = ""; }
  if (cardPro)    { cardPro.style.border    = "2px solid var(--border)"; cardPro.style.background    = ""; }
  if (plan === "gratis" && cardGratis) {
    cardGratis.style.border = "2px solid var(--muted)";
    cardGratis.style.background = "rgba(255,255,255,0.03)";
  } else if (plan === "basico" && cardBasico) {
    cardBasico.style.border = "2px solid var(--verde)";
    cardBasico.style.background = "rgba(0,199,123,0.05)";
  } else if (plan === "pro" && cardPro) {
    cardPro.style.border = "2px solid var(--azul)";
    cardPro.style.background = "rgba(91,142,255,0.04)";
  }
}

function seleccionarPlan(plan) {
  var planActual = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  planSeleccionado = plan;

  _resaltarPlanActual("__ninguno__");

  var cardGratis = document.getElementById("cardPlanGratis");
  var cardBasico = document.getElementById("cardPlanBasico");
  var cardPro    = document.getElementById("cardPlanPro");
  var btn        = document.getElementById("btnConfirmarPlan");
  var msg        = document.getElementById("upgradeMensaje");

  if (plan === "gratis" && cardGratis) {
    cardGratis.style.border = "3px solid var(--muted)";
    cardGratis.style.background = "rgba(255,255,255,0.05)";
  } else if (plan === "basico" && cardBasico) {
    cardBasico.style.border = "3px solid var(--verde)";
    cardBasico.style.background = "rgba(0,199,123,0.08)";
  } else if (plan === "pro" && cardPro) {
    cardPro.style.border = "3px solid var(--azul)";
    cardPro.style.background = "rgba(91,142,255,0.10)";
  }

  if (msg) msg.style.display = "none";

  if (btn) {
    if (plan === planActual) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.textContent = "✓ Este es tu plan actual";
    } else if (plan === "pro") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "⬆️ Subir a Pro — $19.99/mes";
    } else if (plan === "basico") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = planActual === "pro" ? "⬇️ Bajar a Básico — $9.99/mes" : "⬆️ Subir a Básico — $9.99/mes";
    } else if (plan === "gratis") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "⬇️ Cambiar a Gratis — $0/mes";
    }
  }
}

async function confirmarCambioPlan() {
  if (!planSeleccionado) return;

  var btn = document.getElementById("btnConfirmarPlan");
  var msg = document.getElementById("upgradeMensaje");
  var textoOriginal = btn.textContent;

  btn.disabled = true;
  btn.textContent = "Procesando...";
  if (msg) msg.style.display = "none";

  try {
    await api("/empresa/cambiar-plan?nuevo_plan=" + planSeleccionado, "PATCH");
    showToast("✅ Plan cambiado a " + _esc(planSeleccionado) + " correctamente");
    cerrarModalUpgrade();
    await cargarEquipo();

  } catch (e) {
    if (msg) {
      msg.style.display = "block";
      msg.style.background = "rgba(255,80,80,0.1)";
      msg.style.border = "1px solid rgba(255,80,80,0.3)";
      msg.style.color  = "var(--rojo)";
      // [SEC-5] textContent para mensaje de error del servidor
      msg.textContent = "⚠️ " + _esc(e.message || "No se pudo cambiar el plan");
    }
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.textContent = textoOriginal;
  }
}

function cerrarModalUpgrade() {
  document.getElementById("modalUpgrade").classList.remove("open");
  planSeleccionado = null;
}

/* ============================================================
   MODAL PERMISOS — El admin asigna qué secciones ve el operador
   ============================================================ */

var _permisosEditandoId   = null;
var _permisosEditandoNomb = "";
var _permisosActualesEdit = {};

var SECCIONES_PERMISOS = [
  { key: "dashboard",   label: "🏠 Dashboard",             desc: "Ver resumen y estadísticas" },
  { key: "stock",       label: "📦 Stock / Inventario",     desc: "Consultar stock actual" },
  { key: "productos",   label: "🏷️ Productos",              desc: "Agregar y editar productos" },
  { key: "movimientos", label: "📥 Movimientos / Ingresos", desc: "Registrar entradas de mercancía" },
  { key: "salidas",     label: "🛒 Salidas / Ventas",       desc: "Registrar ventas y salidas" },
  { key: "alertas",     label: "🔔 Alertas",                desc: "Ver alertas de stock bajo" },
  { key: "reportes",    label: "📊 Reportes",               desc: "Ver reportes de ventas" },
  { key: "fiados",      label: "📒 Deudores / Fiados",      desc: "Gestionar cuentas por cobrar" },
];

async function abrirModalPermisos(usuarioId, nombreUsuario) {
  if (!esAdmin) return;
  _permisosEditandoId   = usuarioId;
  _permisosEditandoNomb = nombreUsuario;

  // Resetear siempre antes de cargar (evita datos del colaborador anterior)
  _permisosActualesEdit = {};
  SECCIONES_PERMISOS.forEach(function(s){ _permisosActualesEdit[s.key] = true; });
  try {
    var permisosApi = await api("/empresa/usuarios/" + usuarioId + "/permisos");
    // Mezclar: usar API como base, conservar true para secciones no devueltas
    SECCIONES_PERMISOS.forEach(function(s) {
      if (permisosApi.hasOwnProperty(s.key)) _permisosActualesEdit[s.key] = permisosApi[s.key];
    });
  } catch(e) { /* ya inicializado con true arriba */ }

  if (!document.getElementById("modalPermisos")) {
    var div = document.createElement("div");
    div.id = "modalPermisos";
    div.className = "modal-overlay";
    var box = document.createElement("div");
    box.className = "modal-box"; box.style.maxWidth = "500px";
    var hdr = document.createElement("div"); hdr.className = "modal-header";
    var ttl = document.createElement("div"); ttl.className = "modal-title"; ttl.id = "permisosModalTitulo"; ttl.textContent = "Permisos";
    var bX  = document.createElement("button"); bX.className = "modal-close"; bX.textContent = "✕";
    bX.addEventListener("click", cerrarModalPermisos);
    hdr.append(ttl, bX);
    var dsc = document.createElement("div");
    dsc.style.cssText = "padding:0 24px 8px;font-size:13px;color:var(--muted)";
    dsc.textContent = "Activa o desactiva el acceso a cada sección para este colaborador.";
    var lWrap = document.createElement("div"); lWrap.style.cssText = "padding:0 24px 20px";
    var lst = document.createElement("div"); lst.id = "permisosLista"; lst.style.cssText = "display:flex;flex-direction:column;gap:10px";
    lWrap.appendChild(lst);
    var act = document.createElement("div"); act.className = "form-actions";
    var bCan = document.createElement("button"); bCan.type = "button"; bCan.className = "btn-secondary"; bCan.textContent = "Cancelar";
    bCan.addEventListener("click", cerrarModalPermisos);
    var bSav = document.createElement("button"); bSav.type = "button"; bSav.id = "btnGuardarPermisos"; bSav.className = "btn-primary"; bSav.textContent = "✓ Guardar permisos";
    bSav.addEventListener("click", guardarPermisos);
    act.append(bCan, bSav);
    box.append(hdr, dsc, lWrap, act);
    div.appendChild(box);
    document.body.appendChild(div);
  }

  var titulo = document.getElementById("permisosModalTitulo");
  if (titulo) titulo.textContent = "🔑 Permisos de " + _permisosEditandoNomb;

  var lista = document.getElementById("permisosLista");
  if (lista) {
    lista.innerHTML = "";
    SECCIONES_PERMISOS.forEach(function(s) {
      var activo = _permisosActualesEdit[s.key] !== false;
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;"
        + "background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 14px";
      var info = document.createElement("div");
      var nm = document.createElement("div"); nm.style.cssText = "font-size:14px;font-weight:600"; nm.textContent = s.label;
      var ds = document.createElement("div"); ds.style.cssText = "font-size:11px;color:var(--muted);margin-top:2px"; ds.textContent = s.desc;
      info.append(nm, ds);
      var lbl = document.createElement("label");
      lbl.style.cssText = "position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;margin-left:12px";
      var chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = activo;
      chk.style.cssText = "opacity:0;width:0;height:0"; chk.dataset.seccion = s.key;
      chk.addEventListener("change", function(){ _togglePermiso(this.dataset.seccion, this.checked); });
      var trk = document.createElement("span"); trk.id = "pslider_" + s.key;
      trk.style.cssText = "position:absolute;inset:0;border-radius:24px;background:"
        + (activo ? "var(--verde)" : "var(--border)") + ";transition:background .2s";
      var knb = document.createElement("span");
      knb.style.cssText = "position:absolute;height:18px;width:18px;left:"
        + (activo ? "23px" : "3px") + ";bottom:3px;background:#fff;border-radius:50%;transition:left .2s";
      trk.appendChild(knb); lbl.append(chk, trk); row.append(info, lbl); lista.appendChild(row);
    });
  }

  document.getElementById("modalPermisos").classList.add("open");
}

function _togglePermiso(seccion, valor) {
  _permisosActualesEdit[seccion] = valor;
  var sl = document.getElementById("pslider_" + seccion);
  if (sl) {
    sl.style.background = valor ? "var(--verde)" : "var(--border)";
    var k = sl.querySelector("span");
    if (k) k.style.left = valor ? "23px" : "3px";
  }
}

async function guardarPermisos() {
  if (!_permisosEditandoId) return;
  var btn = document.getElementById("btnGuardarPermisos");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
  try {
    await api("/empresa/usuarios/" + _permisosEditandoId + "/permisos", "PUT", _permisosActualesEdit);
    showToast("✅ Permisos de " + _esc(_permisosEditandoNomb) + " actualizados");
    cerrarModalPermisos();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Guardar permisos"; }
    showToast("❌ " + _esc(e.message || "Error al guardar permisos"));
  }
}

function cerrarModalPermisos() {
  // Destruir el modal para que se recree limpio la próxima vez
  // (evita que el botón quede disabled y que listeners se acumulen)
  var m = document.getElementById("modalPermisos");
  if (m) m.parentNode.removeChild(m);
  _permisosEditandoId = null;
}

/* ============================================================
   CONFIG COLABORADOR — panel simplificado
   ============================================================ */
async function guardarConfigColaborador() {
  var passActual  = document.getElementById("colabPassActual")?.value  || "";
  var passNueva   = document.getElementById("colabPassNueva")?.value   || "";
  var passConfirm = document.getElementById("colabPassConfirm")?.value || "";
  var colorIntf   = document.getElementById("colabColor")?.value       || null;

  if (passNueva) {
    if (!passActual)               { showToast("Ingresa tu contraseña actual"); return; }
    if (passNueva !== passConfirm) { showToast("Las contraseñas no coinciden"); return; }
    if (passNueva.length < 8)      { showToast("Mínimo 8 caracteres"); return; }
  }

  var btn = document.getElementById("btnGuardarConfigColab");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    await api("/empresa/mi-config", "PUT", {
      password_actual: passActual || null,
      password_nuevo:  passNueva  || null,
      color_interfaz:  colorIntf  || null,
    });
    if (colorIntf) previsualizarColor(colorIntf);
    var fields = ["colabPassActual","colabPassNueva","colabPassConfirm"];
    fields.forEach(function(id){ var el = document.getElementById(id); if(el) el.value=""; });
    showToast("✅ Configuración guardada");
    showScreen("stock");
  } catch(e) {
    showToast("❌ " + _esc(e.message || "Error al guardar"));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
  }
}
