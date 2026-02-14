/* ============================================================
   STOCKYA — Lógica principal de la interfaz
   Archivo: js/app.js
   Descripción: Navegación, modales, filtros y conexión al backend
   ============================================================ */

/* ----------------------------
   CONFIGURACIÓN DE LA API
   Analogía: es la dirección del "empleado de mostrador"
   al que le pedimos los datos reales
---------------------------- */
const API_URL = "http://localhost:8000";  // URL del backend FastAPI

/* ----------------------------
   ESTADO GLOBAL DE LA APP
   Guarda el token y usuario en memoria mientras la sesión está activa
---------------------------- */
let authToken   = localStorage.getItem("stockya_token")   || null;
let usuarioActual = JSON.parse(localStorage.getItem("stockya_usuario") || "null");


/* ----------------------------
   api(path, method, body)
   Función central para hacer llamadas al backend.
   Analogía: es el "mensajero" que va al backend y trae los datos.
   Todos los fetch() pasan por aquí para no repetir código.
---------------------------- */
async function api(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };

  // Si hay token lo agrega en el header de autorización
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const opciones = { method, headers };
  if (body) opciones.body = JSON.stringify(body);

  const response = await fetch(API_URL + path, opciones);

  // Si el servidor responde 401 (no autorizado) → cerrar sesión
  if (response.status === 401) {
    cerrarSesion();
    throw new Error("Sesión expirada");
  }

  // Para respuestas sin cuerpo (204 No Content)
  if (response.status === 204) return null;

  const data = await response.json();

  // Si hay error del servidor lanzar excepción con el mensaje
  if (!response.ok) {
    throw new Error(data.detail || "Error en el servidor");
  }

  return data;
}


/* ============================================================
   AUTENTICACIÓN
   ============================================================ */

/* ----------------------------
   enterApp()
   Ahora hace login real contra el backend.
   Lee email y contraseña del formulario de login.
---------------------------- */
async function enterApp() {
  // Leer los campos del formulario de login
  const emailInput = document.querySelector('#loginPage input[type="email"]');
  const passInput  = document.querySelector('#loginPage input[type="password"]');

  const email    = emailInput ? emailInput.value.trim() : "";
  const password = passInput  ? passInput.value.trim()  : "";

  // Validación básica
  if (!email || !password) {
    showToast("Ingresa tu correo y contraseña");
    return;
  }

  try {
    // Llamada real al backend
    const data = await api("/auth/login", "POST", { email, password });

    // Guardar token y usuario en memoria y localStorage
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("stockya_token",   authToken);
    localStorage.setItem("stockya_usuario", JSON.stringify(usuarioActual));

    // Mostrar la app y cargar datos reales
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";

    // Actualizar nombre en la interfaz con el usuario real
    actualizarUIUsuario();

    // Cargar datos reales del dashboard
    await cargarDashboard();

    showToast(`Bienvenida, ${usuarioActual.nombre.split(" ")[0]} 👋`);

  } catch (error) {
    showToast("❌ " + error.message);
  }
}


/* ----------------------------
   cerrarSesion()
   Limpia el token y vuelve al login
---------------------------- */
function cerrarSesion() {
  authToken     = null;
  usuarioActual = null;
  localStorage.removeItem("stockya_token");
  localStorage.removeItem("stockya_usuario");
  document.getElementById("appMain").style.display   = "none";
  document.getElementById("loginPage").style.display = "block";
}


/* ----------------------------
   actualizarUIUsuario()
   Actualiza nombre, iniciales y negocio en la interfaz
   con los datos reales del usuario autenticado
---------------------------- */
function actualizarUIUsuario() {
  if (!usuarioActual) return;

  const nombre    = usuarioActual.nombre;
  const partes    = nombre.split(" ");
  const iniciales = partes.length >= 2
    ? (partes[0][0] + partes[1][0]).toUpperCase()
    : nombre.slice(0, 2).toUpperCase();

  // Actualizar nombre en sidebar
  const elNombre = document.querySelector(".user-name");
  if (elNombre) elNombre.textContent = nombre;

  // Actualizar iniciales del avatar
  const elAvatar = document.querySelector(".avatar");
  if (elAvatar) elAvatar.textContent = iniciales;

  // Actualizar saludo en dashboard
  const elSaludo = document.querySelector("#screen-dashboard .page-title");
  if (elSaludo) elSaludo.textContent = `Buen día, ${partes[0]} 👋`;
}


/* ============================================================
   DASHBOARD — Carga datos reales
   ============================================================ */

/* ----------------------------
   cargarDashboard()
   Carga alertas y movimientos reales desde el backend
---------------------------- */
async function cargarDashboard() {
  try {
    // Cargar alertas reales
    const alertas = await api("/alertas/");

    // Actualizar tarjetas de estadísticas
    const elCriticos = document.querySelector(".stat-card.rojo .stat-value");
    const elAlertas  = document.querySelector(".stat-card.amarillo .stat-value");
    if (elCriticos) elCriticos.textContent = alertas.total_criticos;
    if (elAlertas)  elAlertas.textContent  = alertas.total_alertas;

    // Actualizar badge del sidebar
    const badge = document.getElementById("alertBadge");
    if (badge) badge.textContent = alertas.total_criticos + alertas.total_alertas;

    // Cargar configuración del negocio
    const config = await api("/configuracion/");
    const elSubtitle = document.querySelector("#screen-dashboard .page-subtitle");
    if (elSubtitle) {
      const hoy = new Date().toLocaleDateString("es-CL", { weekday:"long", day:"numeric", month:"long" });
      elSubtitle.textContent = `${hoy.charAt(0).toUpperCase() + hoy.slice(1)} · ${config.nombre_negocio}`;
    }

    // Aplicar color del negocio
    if (config.color_principal) {
      previsualizarColor(config.color_principal);
    }

  } catch (error) {
    console.error("Error cargando dashboard:", error);
  }
}


/* ============================================================
   PRODUCTOS — Carga y guarda datos reales
   ============================================================ */

/* ----------------------------
   cargarProductos()
   Obtiene productos reales del backend y los muestra en la tabla
---------------------------- */
async function cargarProductos(buscar = "", categoria = "", estado = "") {
  try {
    // Construir URL con filtros opcionales
    let url = "/productos/?";
    if (buscar)    url += `buscar=${encodeURIComponent(buscar)}&`;
    if (categoria) url += `categoria=${encodeURIComponent(categoria)}&`;
    if (estado)    url += `estado=${encodeURIComponent(estado)}&`;

    const productos = await api(url);

    const tbody = document.querySelector("#screen-productos .table-wrap tbody");
    if (!tbody) return;

    if (productos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:32px">
        No hay productos registrados aún
      </td></tr>`;
      return;
    }

    // Renderizar filas de la tabla con datos reales
    tbody.innerHTML = productos.map(p => {
      const pct    = Math.min(Math.round((p.stock_actual / Math.max(p.stock_minimo * 5, 1)) * 100), 100);
      const color  = p.estado === "critico" ? "var(--rojo)" : p.estado === "alerta" ? "var(--amarillo)" : "var(--verde)";
      const precio = p.precio_venta ? `$${p.precio_venta.toLocaleString("es-CL")}` : "—";

      return `<tr onclick="editarProducto(${p.id})">
        <td style="padding-left:20px">
          <strong>${p.nombre}</strong>
          <br><span style="font-size:11px; color:var(--muted)">${p.codigo || "Sin código"}</span>
        </td>
        <td>${p.categoria || "—"}</td>
        <td>
          <div class="stock-bar-wrap">
            <span style="font-weight:700; color:${color}">${p.stock_actual}</span>
            <div class="stock-bar-track">
              <div class="stock-bar-fill ${p.estado}" style="width:${pct}%"></div>
            </div>
          </div>
        </td>
        <td style="color:var(--muted)">${p.stock_minimo} und.</td>
        <td>${precio}</td>
        <td><span class="badge ${p.estado}"><span class="badge-dot"></span>${p.estado === "critico" ? "Crítico" : p.estado === "alerta" ? "Alerta" : "OK"}</span></td>
      </tr>`;
    }).join("");

    // Actualizar contador en el subtítulo
    const sub = document.querySelector("#screen-productos .page-subtitle");
    if (sub) sub.textContent = `${productos.length} productos registrados en bodega`;

  } catch (error) {
    showToast("❌ Error cargando productos: " + error.message);
  }
}


/* ----------------------------
   editarProducto(id)
   Placeholder para editar — lo desarrollamos luego
---------------------------- */
function editarProducto(id) {
  showToast(`✏️ Editando producto #${id}...`);
}


/* ============================================================
   MOVIMIENTOS — Carga datos reales
   ============================================================ */

/* ----------------------------
   cargarMovimientos()
   Obtiene movimientos reales del backend
---------------------------- */
async function cargarMovimientos(tipo = "") {
  try {
    let url = "/movimientos/?limit=50";
    if (tipo) url += `&tipo=${tipo}`;

    const movimientos = await api(url);
    const tbody = document.getElementById("movTableBody");
    if (!tbody) return;

    if (movimientos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:32px">
        No hay movimientos registrados aún
      </td></tr>`;
      return;
    }

    tbody.innerHTML = movimientos.map(m => {
      const esEntrada = m.tipo === "entrada";
      const color     = esEntrada ? "var(--azul)" : "var(--rojo)";
      const signo     = esEntrada ? "+" : "-";
      const flecha    = esEntrada ? "↑ Entrada" : "↓ Salida";
      const fecha     = new Date(m.created_at).toLocaleString("es-CL", {
        day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"
      });

      return `<tr data-type="${m.tipo}">
        <td style="padding-left:20px"><strong>${m.producto_nombre || "—"}</strong></td>
        <td><span style="color:${color}; font-weight:700">${flecha}</span></td>
        <td style="color:${color}; font-weight:700">${signo}${m.cantidad}</td>
        <td style="color:var(--muted)">${m.stock_anterior} und.</td>
        <td><strong>${m.stock_nuevo} und.</strong></td>
        <td style="color:var(--muted)">${fecha}</td>
        <td style="color:var(--muted)">${m.usuario_nombre || "—"}</td>
      </tr>`;
    }).join("");

  } catch (error) {
    showToast("❌ Error cargando movimientos: " + error.message);
  }
}


/* ============================================================
   NAVEGACIÓN
   ============================================================ */

/* ----------------------------
   showScreen(name)
   Cambia entre pantallas y carga datos reales según la pantalla
---------------------------- */
async function showScreen(name) {
  // Ocultar todas las pantallas
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");

  // Actualizar nav activo
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("nav-" + name).classList.add("active");

  // Cerrar sidebar en móvil
  if (window.innerWidth <= 768) closeSidebar();

  // Cargar datos reales según la pantalla que se abre
  if (name === "productos")    await cargarProductos();
  if (name === "movimientos")  await cargarMovimientos();
  if (name === "alertas")      await cargarAlertas();
  if (name === "dashboard")    await cargarDashboard();
}


/* ============================================================
   ALERTAS — Carga datos reales
   ============================================================ */
async function cargarAlertas() {
  try {
    const alertas = await api("/alertas/");

    // Actualizar tarjetas de resumen
    const elCrit = document.querySelector("#screen-alertas .stat-card.rojo .stat-value");
    const elAlert = document.querySelector("#screen-alertas .stat-card.amarillo .stat-value");
    if (elCrit)  elCrit.textContent  = alertas.total_criticos;
    if (elAlert) elAlert.textContent = alertas.total_alertas;

    // Actualizar subtitle
    const sub = document.querySelector("#screen-alertas .page-subtitle");
    const total = alertas.total_criticos + alertas.total_alertas;
    if (sub) sub.textContent = `${total} productos requieren tu atención`;

  } catch (error) {
    showToast("❌ Error cargando alertas: " + error.message);
  }
}


/* ============================================================
   MODAL DE PRODUCTOS
   ============================================================ */

function openModal() {
  document.getElementById("modalAgregar").classList.add("open");
  document.getElementById("formProducto").reset();
}

function closeModal() {
  document.getElementById("modalAgregar").classList.remove("open");
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("modalAgregar").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });

  // Si ya hay token guardado, entrar directo sin pasar por login
  if (authToken && usuarioActual) {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";
    actualizarUIUsuario();
    cargarDashboard();
  }
});


/* ----------------------------
   saveProduct()
   Guarda un producto nuevo en el backend
---------------------------- */
async function saveProduct() {
  const nombre     = document.getElementById("inputNombre").value.trim();
  const stockVal   = document.getElementById("inputStock").value;
  const categoria  = document.querySelector("#formProducto select").value;
  const stockMin   = document.querySelectorAll("#formProducto input[type='number']")[1]?.value || 0;
  const precioComp = document.querySelectorAll("#formProducto input[type='number']")[2]?.value || 0;
  const precioVent = document.querySelectorAll("#formProducto input[type='number']")[3]?.value || 0;

  if (!nombre) { showToast("El nombre del producto es obligatorio"); return; }
  if (stockVal && parseInt(stockVal) < 0) { showToast("El stock no puede ser negativo"); return; }

  try {
    await api("/productos/", "POST", {
      nombre,
      categoria:     categoria !== "Seleccionar..." ? categoria : null,
      stock_actual:  parseInt(stockVal) || 0,
      stock_minimo:  parseInt(stockMin) || 0,
      precio_compra: parseFloat(precioComp) || 0,
      precio_venta:  parseFloat(precioVent) || 0,
    });

    closeModal();
    showToast("✅ Producto guardado correctamente");

    // Recargar tabla si estamos en pantalla de productos
    if (document.getElementById("screen-productos").classList.contains("active")) {
      await cargarProductos();
    }
    await cargarDashboard();

  } catch (error) {
    showToast("❌ " + error.message);
  }
}


/* ============================================================
   UTILIDADES DE NAVEGACIÓN
   ============================================================ */

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("backdrop").classList.toggle("open");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("backdrop").classList.remove("open");
}


/* ----------------------------
   filterMov(btn, type)
   Filtra movimientos por tipo
---------------------------- */
async function filterMov(btn, type) {
  document.querySelectorAll(".mov-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  await cargarMovimientos(type === "all" ? "" : type);
}


/* ----------------------------
   showToast(msg)
   Muestra notificación temporal
---------------------------- */
function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}


/* ----------------------------
   calcularEstadoStock / calcularPorcentajeStock
   Funciones auxiliares de cálculo visual
---------------------------- */
function calcularEstadoStock(stock, minimo) {
  if (stock < minimo)        return "critico";
  if (stock < minimo * 1.5)  return "alerta";
  return "ok";
}

function calcularPorcentajeStock(stock, minimo) {
  const maximo = minimo * 5;
  return Math.min(Math.round((stock / maximo) * 100), 100);
}


/* ============================================================
   CONFIGURACIÓN — Settings
   ============================================================ */

let configTemporal = {
  negocio:  "",
  usuario:  "",
  email:    "",
  moneda:   "CLP",
  color:    "#00C77B",
  logoData: null
};

function previewLogo(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;
  if (!archivo.type.startsWith("image/")) { showToast("Solo se permiten imágenes"); return; }
  if (archivo.size > 2 * 1024 * 1024)    { showToast("El logo no puede superar 2MB"); return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    configTemporal.logoData = e.target.result;
    const img      = document.getElementById("logoImg");
    const initials = document.getElementById("logoInitials");
    img.src = e.target.result; img.style.display = "block";
    initials.style.display = "none";
    showToast("Logo cargado — recuerda guardar");
  };
  reader.readAsDataURL(archivo);
}

function quitarLogo() {
  configTemporal.logoData = null;
  const img      = document.getElementById("logoImg");
  const initials = document.getElementById("logoInitials");
  img.src = ""; img.style.display = "none";
  initials.style.display = "flex";
  document.getElementById("inputLogo").value = "";
  showToast("Logo eliminado");
}

function previsualizarColor(hex) {
  document.documentElement.style.setProperty("--verde", hex);
  document.documentElement.style.setProperty("--verde-dark", ajustarBrillo(hex, -20));
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  document.documentElement.style.setProperty("--verde-glow", `rgba(${r},${g},${b},0.18)`);
  const inputHex = document.getElementById("inputColorHex");
  if (inputHex) inputHex.value = hex;
  configTemporal.color = hex;
}

function sincronizarColor(hex) {
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById("inputColor").value = hex;
    previsualizarColor(hex);
  }
}

function ajustarBrillo(hex, cantidad) {
  const r = Math.max(0,Math.min(255,parseInt(hex.slice(1,3),16)+cantidad));
  const g = Math.max(0,Math.min(255,parseInt(hex.slice(3,5),16)+cantidad));
  const b = Math.max(0,Math.min(255,parseInt(hex.slice(5,7),16)+cantidad));
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

function evaluarFuerzaPassword(pass) {
  const wrap  = document.getElementById("passStrengthWrap");
  const fill  = document.getElementById("passStrengthFill");
  const label = document.getElementById("passStrengthLabel");
  if (!pass) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  let p = 0;
  if (pass.length >= 8)          p++;
  if (pass.length >= 12)         p++;
  if (/[A-Z]/.test(pass))        p++;
  if (/[0-9]/.test(pass))        p++;
  if (/[^A-Za-z0-9]/.test(pass)) p++;
  if (p <= 2) { fill.style.width="33%"; fill.style.background="var(--rojo)";    label.textContent="Débil";  label.style.color="var(--rojo)"; }
  else if (p <= 3) { fill.style.width="66%"; fill.style.background="var(--amarillo)"; label.textContent="Media";  label.style.color="var(--amarillo)"; }
  else { fill.style.width="100%"; fill.style.background="var(--verde)"; label.textContent="Fuerte"; label.style.color="var(--verde)"; }
}

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const oculto = input.type === "password";
  input.type = oculto ? "text" : "password";
  btn.textContent = oculto ? "🙈" : "👁️";
}

async function guardarConfiguracion() {
  const negocio     = document.getElementById("inputNegocio").value.trim();
  const usuario     = document.getElementById("inputNombreUsuario").value.trim();
  const email       = document.getElementById("inputEmail").value.trim();
  const moneda      = document.getElementById("inputMoneda").value;
  const passNueva   = document.getElementById("inputPassNueva").value;
  const passConfirm = document.getElementById("inputPassConfirm").value;

  if (!negocio) { showToast("El nombre del negocio es obligatorio"); return; }
  if (!usuario) { showToast("El nombre de usuario es obligatorio"); return; }
  if (passNueva && passNueva !== passConfirm) { showToast("Las contraseñas no coinciden"); return; }
  if (passNueva && passNueva.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  try {
    // Guardar configuración del negocio en el backend
    await api("/configuracion/", "PUT", {
      nombre_negocio:  negocio,
      moneda,
      color_principal: configTemporal.color,
      logo_base64:     configTemporal.logoData
    });

    // Actualizar UI con los nuevos datos
    const saludo = document.querySelector("#screen-dashboard .page-title");
    if (saludo) saludo.textContent = `Buen día, ${usuario.split(" ")[0]} 👋`;
    const sidebarNombre = document.querySelector(".user-name");
    if (sidebarNombre) sidebarNombre.textContent = usuario;
    const avatar = document.querySelector(".avatar");
    if (avatar) {
      const p = usuario.split(" ");
      avatar.textContent = (p.length >= 2 ? p[0][0]+p[1][0] : usuario.slice(0,2)).toUpperCase();
    }

    configTemporal = { negocio, usuario, email, moneda, color: configTemporal.color, logoData: configTemporal.logoData };

    document.getElementById("inputPassActual").value  = "";
    document.getElementById("inputPassNueva").value   = "";
    document.getElementById("inputPassConfirm").value = "";
    document.getElementById("passStrengthWrap").style.display = "none";

    showToast("✅ Configuración guardada correctamente");

  } catch (error) {
    showToast("❌ " + error.message);
  }
}

function descartarCambios() {
  previsualizarColor(configTemporal.color || "#00C77B");
  document.getElementById("inputPassActual").value  = "";
  document.getElementById("inputPassNueva").value   = "";
  document.getElementById("inputPassConfirm").value = "";
  document.getElementById("passStrengthWrap").style.display = "none";
  showToast("Cambios descartados");
}


/* ============================================================
   TEMA CLARO / OSCURO
   ============================================================ */
function toggleTema() {
  const body     = document.body;
  const label    = document.getElementById("themeLabel");
  const switchEl = document.getElementById("themeSwitch");
  const estaClaro = body.classList.contains("tema-claro");
  if (estaClaro) {
    body.classList.remove("tema-claro");
    label.textContent = "🌙 Tema oscuro";
    switchEl.classList.remove("activo");
  } else {
    body.classList.add("tema-claro");
    label.textContent = "☀️ Tema claro";
    switchEl.classList.add("activo");
  }
}
