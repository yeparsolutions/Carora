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

  // Si hay error, lanzar con status y detail (detail puede ser string u objeto)
  if (!response.ok) {
    const err       = new Error(
      typeof data.detail === "string" ? data.detail : (data.detail?.mensaje || "Error en el servidor")
    );
    err.status      = response.status;
    err.detail      = data.detail;   // preservar objeto completo para casos como 409
    throw err;
  }

  return data;
}


/* ============================================================
   AUTENTICACIÓN
   ============================================================ */

/* ----------------------------
   mostrarRegistro() / mostrarLogin()
   Alterna entre el panel de login y el de registro
   Analogía: como girar el cartel de "abierto/cerrado"
---------------------------- */
function mostrarRegistro() {
  document.getElementById("panelLogin").style.display    = "none";
  document.getElementById("panelRegistro").style.display = "block";
}

function mostrarLogin() {
  document.getElementById("panelRegistro").style.display = "none";
  document.getElementById("panelLogin").style.display    = "block";
}


/* ----------------------------
   registrarUsuario()
   Crea una cuenta nueva desde el frontend
---------------------------- */
async function registrarUsuario() {
  const nombre   = document.getElementById("regNombre").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();

  // Validaciones
  if (!nombre)              { showToast("El nombre es obligatorio"); return; }
  if (!email)               { showToast("El correo es obligatorio"); return; }
  if (password.length < 8)  { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  try {
    const data = await api("/auth/registro", "POST", { nombre, email, password });

    // Guardar token y entrar directo a la app
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("stockya_token",   authToken);
    localStorage.setItem("stockya_usuario", JSON.stringify(usuarioActual));

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";

    actualizarUIUsuario();
    await cargarDashboard();

    showToast(`¡Bienvenido/a, ${usuarioActual.nombre.split(" ")[0]}! 🎉`);

  } catch (error) {
    showToast("❌ " + error.message);
  }
}


/* ----------------------------
   enterApp()
   Login real contra el backend.
---------------------------- */
async function enterApp() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) {
    showToast("Ingresa tu correo y contraseña");
    return;
  }

  try {
    const data = await api("/auth/login", "POST", { email, password });

    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("stockya_token",   authToken);
    localStorage.setItem("stockya_usuario", JSON.stringify(usuarioActual));

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";

    actualizarUIUsuario();
    await cargarDashboard();

    showToast(`Bienvenida/o, ${usuarioActual.nombre.split(" ")[0]} 👋`);

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
   Carga todos los datos reales del dashboard desde el backend.
   Analogia: es el "reporte matutino" que llena todos los indicadores.
---------------------------- */
async function cargarDashboard() {
  try {
    // Cargar todo en paralelo para mayor velocidad
    const [alertas, productos, movimientos, config] = await Promise.all([
      api("/alertas/"),
      api("/productos/"),
      api("/movimientos/?limit=5"),
      api("/configuracion/")
    ]);

    // --- Saludo y subtitulo ---
    const nombre = usuarioActual?.nombre?.split(" ")[0] || "";
    const hoy    = new Date().toLocaleDateString("es-CL", { weekday:"long", day:"numeric", month:"long" });
    setEl("dashTitulo",   `Buen dia, ${nombre} \u{1F44B}`);
    setEl("dashSubtitulo", `${hoy.charAt(0).toUpperCase() + hoy.slice(1)} \u00B7 ${config.nombre_negocio}`);

    // --- Tarjetas de estadisticas ---
    const totalProductos  = productos.length;
    const valorInventario = productos.reduce((acc, p) => acc + (p.stock_actual * p.precio_venta), 0);
    const moneda          = config.moneda || "CLP";
    setEl("statTotal",     totalProductos);
    setEl("statCriticos",  alertas.total_criticos);
    setEl("statAlertas",   alertas.total_alertas);
    setEl("statTotalTrend", totalProductos === 0 ? "Agrega tu primer producto" : `${totalProductos} productos registrados`);
    const vf = valorInventario >= 1000000 ? `$${(valorInventario/1000000).toFixed(1)}M`
             : valorInventario >= 1000    ? `$${Math.round(valorInventario/1000)}K`
             : `$${Math.round(valorInventario)}`;
    setEl("statValor",  valorInventario > 0 ? vf : "\u2014");
    setEl("statMoneda", `${moneda} estimado en bodega`);

    // --- Badge sidebar ---
    const badge = document.getElementById("alertBadge");
    const totalAlertas = alertas.total_criticos + alertas.total_alertas;
    if (badge) { badge.textContent = totalAlertas; badge.style.display = totalAlertas > 0 ? "inline" : "none"; }

    // --- Lista de alertas urgentes ---
    const lista = document.getElementById("dashAlertasList");
    const todasAlertas = [...alertas.productos_criticos, ...alertas.productos_alerta];
    if (lista) {
      if (todasAlertas.length === 0) {
        lista.innerHTML = `<div style="text-align:center; padding:24px; color:var(--muted); font-size:13px">\u2705 Todo en orden \u2014 sin alertas por ahora</div>`;
      } else {
        lista.innerHTML = todasAlertas.slice(0, 3).map(p => `
          <div class="alert-item ${p.estado}">
            <div class="alert-emoji">${p.estado === "critico" ? "\uD83D\uDD34" : "\uD83D\uDFE1"}</div>
            <div class="alert-info">
              <div class="alert-name">${p.nombre}</div>
              <div class="alert-detail">Min: ${p.stock_minimo} unidades</div>
            </div>
            <div class="alert-qty">${p.stock_actual}</div>
          </div>`).join("");
      }
    }

    // --- Movimientos recientes ---
    const tbody = document.getElementById("dashMovTableBody");
    if (tbody) {
      if (movimientos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:32px; font-size:13px">Aun no hay movimientos \u2014 agrega productos y registra entradas o salidas</td></tr>`;
      } else {
        tbody.innerHTML = movimientos.map(m => {
          const es  = m.tipo === "entrada";
          const col = es ? "var(--azul)" : "var(--rojo)";
          const hora = new Date(m.created_at).toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit" });
          return `<tr>
            <td><strong>${m.producto_nombre || "\u2014"}</strong></td>
            <td><span style="color:${col}; font-weight:600">${es ? "\u2191 Entrada" : "\u2193 Salida"}</span></td>
            <td style="color:${col}; font-weight:600">${es ? "+" : "-"}${m.cantidad}</td>
            <td>${m.stock_nuevo} und.</td>
            <td style="color:var(--muted)">${hora}</td>
          </tr>`;
        }).join("");
      }
    }

    // --- Contadores movimientos semanales ---
    const entradas = movimientos.filter(m => m.tipo === "entrada").reduce((a, m) => a + m.cantidad, 0);
    const salidas  = movimientos.filter(m => m.tipo === "salida").reduce((a, m)  => a + m.cantidad, 0);
    setEl("dashEntradas", `+${entradas}`);
    setEl("dashSalidas",  `-${salidas}`);

    // --- Color del negocio ---
    if (config.color_principal) previsualizarColor(config.color_principal);

  } catch (error) {
    console.error("Error cargando dashboard:", error);
  }
}

/* Funcion auxiliar: setear texto por ID sin romper si no existe */
function setEl(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}


/* ============================================================
   PRODUCTOS — Carga y guarda datos reales
   ============================================================ */

/* ----------------------------
   cargarProductos()
   Obtiene productos reales del backend y los muestra en la tabla
---------------------------- */
async function cargarProductos(buscar = "", categoria = "") {
  try {
    let url = "/productos/?";
    if (buscar)    url += `buscar=${encodeURIComponent(buscar)}&`;
    if (categoria) url += `categoria=${encodeURIComponent(categoria)}&`;

    const productos = await api(url);
    const tbody     = document.getElementById("prodTableBody");
    const subtitulo = document.getElementById("prodSubtitulo");

    if (subtitulo) subtitulo.textContent = `${productos.length} producto${productos.length !== 1 ? "s" : ""} registrado${productos.length !== 1 ? "s" : ""}`;
    if (!tbody) return;

    if (productos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--muted); padding:40px; font-size:13px">
        ${buscar || categoria ? "No se encontraron productos con ese filtro" : "Aún no hay productos — haz clic en '+ Nuevo producto' para comenzar"}
      </td></tr>`;
      return;
    }

    // Mostrar solo las características del producto (sin stock)
    tbody.innerHTML = productos.map(p => {
      const nombreSafe  = p.nombre.split("'").join("&apos;");
      const precioComp  = p.precio_compra ? `$${p.precio_compra.toLocaleString("es-CL")}` : "—";
      const precioVent  = p.precio_venta  ? `$${p.precio_venta.toLocaleString("es-CL")}`  : "—";
      const ganancia    = p.porcentaje_ganancia ? `${p.porcentaje_ganancia}%` : "—";

      return `<tr>
        <td style="padding-left:16px">
          <strong>${p.nombre}</strong>
          ${p.lote ? `<div style="font-size:11px; color:var(--muted)">Lote: ${p.lote}</div>` : ""}
        </td>
        <td style="font-size:12px; color:var(--muted)">${p.codigo_barra || p.codigo || "—"}</td>
        <td>${p.categoria || "—"}</td>
        <td>${p.marca || "—"}</td>
        <td>${p.proveedor || "—"}</td>
        <td>${precioComp}</td>
        <td>${precioVent}</td>
        <td style="text-align:center">
          ${p.porcentaje_ganancia > 0
            ? `<span style="background:rgba(0,245,155,0.15); color:var(--verde); padding:3px 8px; border-radius:6px; font-size:12px; font-weight:600">${ganancia}</span>`
            : "—"}
        </td>
        <td style="text-align:center">
          <div style="display:flex; gap:6px; justify-content:center">
            <button onclick="abrirModalEditar(${p.id})" title="Editar"
                    style="background:none; border:1px solid var(--border); border-radius:8px; color:var(--muted);
                           padding:5px 9px; cursor:pointer; font-size:13px; transition:all 0.2s"
                    onmouseover="this.style.borderColor='var(--azul)';this.style.color='var(--azul)'"
                    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">✏️</button>
            <button onclick="abrirModalEliminar(${p.id}, '${nombreSafe}')" title="Eliminar"
                    style="background:none; border:1px solid var(--border); border-radius:8px; color:var(--muted);
                           padding:5px 9px; cursor:pointer; font-size:13px; transition:all 0.2s"
                    onmouseover="this.style.borderColor='var(--rojo)';this.style.color='var(--rojo)'"
                    onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join("");

  } catch (error) {
    console.error("Error cargando productos:", error);
  }
}

function filtrarProductos() {
  const buscar    = document.getElementById("prodBuscar")?.value    || "";
  const categoria = document.getElementById("prodCategoria")?.value || "";
  cargarProductos(buscar, categoria);
}


/* ============================================================
   PANTALLA STOCK — misma data que productos pero con stock
   ============================================================ */
async function cargarStock(buscar = "", categoria = "", estado = "") {
  try {
    let url = "/productos/?";
    if (buscar)    url += `buscar=${encodeURIComponent(buscar)}&`;
    if (categoria) url += `categoria=${encodeURIComponent(categoria)}&`;
    if (estado)    url += `estado=${encodeURIComponent(estado)}&`;

    const productos = await api(url);
    const tbody     = document.getElementById("stockTableBody");
    const subtitulo = document.getElementById("stockSubtitulo");

    if (subtitulo) subtitulo.textContent = `${productos.length} producto${productos.length !== 1 ? "s" : ""} · Total unidades: ${productos.reduce((a,p) => a + p.stock_actual, 0)}`;
    if (!tbody) return;

    if (productos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--muted); padding:40px; font-size:13px">
        ${buscar || categoria || estado ? "Sin resultados para ese filtro" : "Aún no hay productos registrados"}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = productos.map(p => {
      const pct    = Math.min(Math.round((p.stock_actual / Math.max(p.stock_minimo * 5, 1)) * 100), 100);
      const color  = p.estado === "critico" ? "var(--rojo)" : p.estado === "alerta" ? "var(--amarillo)" : "var(--verde)";
      const precio = p.precio_venta ? `$${p.precio_venta.toLocaleString("es-CL")}` : "—";

      let venceStr = "—";
      if (p.fecha_vencimiento) {
        const dias = Math.ceil((new Date(p.fecha_vencimiento) - new Date()) / 86400000);
        venceStr = p.estado_venc === "vencido" ? `<span style="color:var(--rojo); font-weight:600">Vencido</span>`
                 : p.estado_venc === "proximo" ? `<span style="color:var(--amarillo); font-weight:600">${dias}d ⏰</span>`
                 : new Date(p.fecha_vencimiento).toLocaleDateString("es-CL");
      }

      return `<tr>
        <td style="padding-left:16px">
          <strong>${p.nombre}</strong>
          <div style="font-size:11px; color:var(--muted)">${p.codigo_barra || p.codigo || "Sin código"}${p.marca ? " · " + p.marca : ""}${p.lote ? " · Lote: " + p.lote : ""}</div>
        </td>
        <td>${p.categoria || "—"}</td>
        <td>
          <div class="stock-bar-wrap">
            <span style="font-weight:700; color:${color}">${p.stock_actual}</span>
            <div class="stock-bar-track"><div class="stock-bar-fill ${p.estado}" style="width:${pct}%"></div></div>
          </div>
        </td>
        <td style="color:var(--muted)">${p.stock_minimo}</td>
        <td>${precio}</td>
        <td style="font-size:12px">${venceStr}</td>
        <td><span class="badge ${p.estado}"><span class="badge-dot"></span>${p.estado === "critico" ? "Crítico" : p.estado === "alerta" ? "Alerta" : "OK"}</span></td>
        <td style="text-align:center">
          <button onclick="abrirMovimientoRapido(${p.id}, '${p.nombre.split("'").join("&apos;")}')"
                  title="Registrar movimiento"
                  style="background:none; border:1px solid var(--border); border-radius:8px; color:var(--muted);
                         padding:5px 9px; cursor:pointer; font-size:13px; transition:all 0.2s"
                  onmouseover="this.style.borderColor='var(--azul)';this.style.color='var(--azul)'"
                  onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
            ±
          </button>
        </td>
      </tr>`;
    }).join("");

  } catch (error) {
    console.error("Error cargando stock:", error);
  }
}

function filtrarStock() {
  const buscar    = document.getElementById("stockBuscar")?.value    || "";
  const categoria = document.getElementById("stockCategoria")?.value || "";
  const estado    = document.getElementById("stockEstado")?.value    || "";
  cargarStock(buscar, categoria, estado);
}

/* Movimiento rápido desde pantalla stock — abre modal prellenado con el producto */
function abrirMovimientoRapido(id, nombre) {
  openModalMovimiento();
  setTimeout(() => {
    const sel = document.getElementById("movProductoId");
    if (sel) {
      for (let opt of sel.options) {
        if (parseInt(opt.value) === id) { opt.selected = true; break; }
      }
    }
  }, 400);
}


function filtrarProductos() {
  const buscar    = document.getElementById("prodBuscar")?.value    || "";
  const categoria = document.getElementById("prodCategoria")?.value || "";
  const estado    = document.getElementById("prodEstado")?.value    || "";
  cargarProductos(buscar, categoria, estado);
}


async function cargarMovimientos(tipo = "", buscar = "", categoria = "", desde = "", hasta = "") {
  try {
    // Construir URL con todos los filtros disponibles
    let url = "/movimientos/?limit=200";
    if (tipo)      url += `&tipo=${encodeURIComponent(tipo)}`;
    if (buscar)    url += `&buscar=${encodeURIComponent(buscar)}`;
    if (categoria) url += `&categoria=${encodeURIComponent(categoria)}`;
    if (desde)     url += `&desde=${encodeURIComponent(desde)}`;
    if (hasta)     url += `&hasta=${encodeURIComponent(hasta)}`;

    const movimientos = await api(url);
    const tbody       = document.getElementById("movTableBody");
    const subtitulo   = document.getElementById("movSubtitulo");

    if (subtitulo) {
      const entradas = movimientos.filter(m => m.tipo === "entrada").reduce((a,m) => a + m.cantidad, 0);
      const salidas  = movimientos.filter(m => m.tipo === "salida").reduce((a,m)  => a + m.cantidad, 0);
      subtitulo.textContent = `${movimientos.length} movimientos · +${entradas} entradas · -${salidas} salidas`;
    }

    if (!tbody) return;

    if (movimientos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--muted); padding:40px; font-size:13px">
        ${tipo || buscar || categoria || desde ? "Sin movimientos para ese filtro" : "Aún no hay movimientos registrados"}
      </td></tr>`;
      return;
    }

    // Una fila por movimiento con todos sus datos
    tbody.innerHTML = movimientos.map(m => {
      const es    = m.tipo === "entrada";
      const col   = es ? "var(--azul)" : "var(--rojo)";
      const fecha = new Date(m.created_at);
      const fechaStr = fecha.toLocaleDateString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric" });
      const horaStr  = fecha.toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit" });

      return `<tr>
        <td style="padding-left:16px; font-size:12px">
          <div style="font-weight:600">${fechaStr}</div>
          <div style="color:var(--muted)">${horaStr}</div>
        </td>
        <td>
          <strong>${m.producto_nombre || "<span style='color:var(--muted); font-style:italic'>Eliminado</span>"}</strong>
        </td>
        <td>
          <span style="color:${col}; font-weight:600; font-size:13px">
            ${es ? "↑ Entrada" : "↓ Salida"}
          </span>
        </td>
        <td style="color:${col}; font-weight:700; font-size:15px">
          ${es ? "+" : "-"}${m.cantidad}
        </td>
        <td style="color:var(--muted); text-align:center">${m.stock_anterior}</td>
        <td style="font-weight:600; text-align:center">${m.stock_nuevo}</td>
        <td style="font-size:12px; color:var(--muted)">${m.lote || "—"}</td>
        <td style="font-size:12px; color:var(--muted); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${m.nota || ""}">
          ${m.nota || "—"}
        </td>
        <td style="font-size:12px; color:var(--muted)">${m.usuario_nombre || "—"}</td>
      </tr>`;
    }).join("");

  } catch (error) {
    console.error("Error cargando movimientos:", error);
  }
}

/* Filtrar movimientos desde los controles de la pantalla */
function filtrarMovimientos() {
  const buscar    = document.getElementById("movBuscar")?.value          || "";
  const tipo      = document.getElementById("movFiltroTipo")?.value      || "";
  const categoria = document.getElementById("movFiltroCategoria")?.value || "";
  const desde     = document.getElementById("movFiltroDesde")?.value     || "";
  const hasta     = document.getElementById("movFiltroHasta")?.value     || "";
  cargarMovimientos(tipo, buscar, categoria, desde, hasta);
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
  const pantalla = document.getElementById("screen-" + name);
  if (pantalla) pantalla.classList.add("active");

  // Actualizar nav activo
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const navBtn = document.getElementById("nav-" + name);
  if (navBtn) navBtn.classList.add("active");

  // Cerrar sidebar en móvil
  if (window.innerWidth <= 768) closeSidebar();

  // Cargar datos reales según la pantalla
  if (name === "dashboard")   await cargarDashboard();
  if (name === "productos")   await cargarProductos();
  if (name === "stock")       await cargarStock();
  if (name === "movimientos") await cargarMovimientos();
  if (name === "alertas")     await cargarAlertas();
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
  // Restaurar botón guardar
  const btnGuardar = document.querySelector("#modalAgregar .btn-primary");
  if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = "✓ Guardar producto"; }
  // Limpiar campos del escaner y hints
  cerrarEscaner();
  const hint = document.getElementById("codigoHint");
  if (hint) { hint.textContent = "Si el codigo ya existe, los campos se llenan automaticamente"; hint.style.color = "var(--muted)"; }
  const precioHint = document.getElementById("precioVentaHint");
  if (precioHint) precioHint.textContent = "";
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
/* ============================================================
   ESCANER DE CODIGO DE BARRAS
   ============================================================ */

/* ----------------------------
   buscarPorCodigo(codigo)
   Cuando el usuario termina de escribir/escanear el codigo,
   busca en el backend si ya existe.
   Analogia: el cajero que pasa el producto por el laser
   y aparece solo en pantalla.
---------------------------- */
let buscarTimeout = null;
async function buscarPorCodigo(codigo) {
  clearTimeout(buscarTimeout);
  const hint = document.getElementById("codigoHint");

  if (!codigo || codigo.length < 4) {
    if (hint) hint.textContent = "Si el codigo ya existe, los campos se llenan automaticamente";
    if (hint) hint.style.color = "var(--muted)";
    return;
  }

  // Esperar 600ms despues de que el usuario deje de escribir
  buscarTimeout = setTimeout(async () => {
    try {
      const producto = await api(`/productos/buscar-codigo/${encodeURIComponent(codigo)}`);

      // Producto encontrado — llenar campos automaticamente
      document.getElementById("inputNombre").value       = producto.nombre       || "";
      document.getElementById("inputMarca").value        = producto.marca        || "";
      document.getElementById("inputProveedor").value    = producto.proveedor    || "";
      document.getElementById("inputCodigo").value       = producto.codigo       || "";
      document.getElementById("inputStockMin").value     = producto.stock_minimo || 0;
      document.getElementById("inputPrecioCompra").value = producto.precio_compra || 0;
      document.getElementById("inputPrecioVenta").value  = producto.precio_venta  || 0;
      document.getElementById("inputPorcentaje").value   = producto.porcentaje_ganancia || 0;

      // Seleccionar categoria si existe
      const catSelect = document.getElementById("inputCategoria");
      if (catSelect && producto.categoria) {
        for (let opt of catSelect.options) {
          if (opt.value === producto.categoria) { opt.selected = true; break; }
        }
      }

      if (hint) { hint.textContent = "Producto encontrado — campos llenados automaticamente"; hint.style.color = "var(--verde)"; }
      showToast("Producto encontrado: " + producto.nombre);

    } catch (error) {
      // Producto no encontrado — formulario vacio listo para registrar nuevo
      if (hint) { hint.textContent = "Codigo nuevo — completa los campos para registrarlo"; hint.style.color = "var(--amarillo)"; }
    }
  }, 600);
}


/* ----------------------------
   Funciones de sumar stock — se llaman directamente desde saveProduct
   sin popup adicional: usa la cantidad y lote ya ingresados en el formulario
---------------------------- */
async function sumarStockDirecto(productoId, cantidad, lote) {
  // Analogia: es como sumar una nueva caja al inventario existente
  // sin preguntar de nuevo — la cantidad ya fue ingresada en el formulario
  const params = `cantidad=${cantidad}${lote ? "&lote=" + encodeURIComponent(lote) : ""}`;
  return await api(`/productos/${productoId}/sumar-stock?${params}`, "POST");
}


/* ============================================================
   EDITAR PRODUCTO
   Analogía: abrir la ficha del producto y corregir los datos
   ============================================================ */

async function abrirModalEditar(id) {
  try {
    // Cargar datos actuales del producto desde el backend
    const p = await api(`/productos/${id}`);

    // Rellenar todos los campos del modal
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

    // Fecha de vencimiento — convertir a formato date del input
    if (p.fecha_vencimiento) {
      document.getElementById("editFechaVenc").value =
        new Date(p.fecha_vencimiento).toISOString().split("T")[0];
    } else {
      document.getElementById("editFechaVenc").value = "";
    }

    // Seleccionar categoría correcta
    const catSelect = document.getElementById("editCategoria");
    for (let opt of catSelect.options) {
      opt.selected = opt.value === (p.categoria || "");
    }

    document.getElementById("modalEditar").classList.add("open");

  } catch (error) {
    showToast("❌ No se pudo cargar el producto: " + error.message);
  }
}

function cerrarModalEditar() {
  document.getElementById("modalEditar").classList.remove("open");
  document.getElementById("editPrecioHint").textContent = "";
}

/* Calcular precio venta en el modal de edición */
function calcularPrecioVentaEditar() {
  const compra     = parseFloat(document.getElementById("editPrecioCompra").value) || 0;
  const porcentaje = parseFloat(document.getElementById("editPorcentaje").value)   || 0;
  const hint       = document.getElementById("editPrecioHint");
  if (compra > 0 && porcentaje > 0) {
    const venta = Math.round(compra * (1 + porcentaje / 100));
    document.getElementById("editPrecioVenta").value = venta;
    if (hint) hint.textContent = `Ganancia: $${(venta - compra).toLocaleString("es-CL")} por unidad`;
  } else {
    if (hint) hint.textContent = "";
  }
}

async function guardarEdicion() {
  const id          = document.getElementById("editId").value;
  const nombre      = document.getElementById("editNombre").value.trim().toUpperCase();
  const codigoBarra = document.getElementById("editCodigoBarra").value.trim().toUpperCase();
  const codigo      = document.getElementById("editCodigo").value.trim().toUpperCase();
  const marca       = document.getElementById("editMarca").value.trim().toUpperCase();
  const proveedor   = document.getElementById("editProveedor").value.trim().toUpperCase();
  const categoria   = document.getElementById("editCategoria").value;
  const stockMin    = document.getElementById("editStockMin").value;
  const precioComp  = document.getElementById("editPrecioCompra").value;
  const precioVent  = document.getElementById("editPrecioVenta").value;
  const porcentaje  = document.getElementById("editPorcentaje").value;
  const lote        = document.getElementById("editLote").value.trim();
  const fechaVenc   = document.getElementById("editFechaVenc").value;
  const diasAlerta  = document.getElementById("editDiasAlerta").value;

  if (!nombre) { showToast("⚠️ El nombre es obligatorio"); return; }

  try {
    await api(`/productos/${id}`, "PUT", {
      nombre,
      codigo_barra:        codigoBarra  || null,
      codigo:              codigo        || null,
      marca:               marca         || null,
      proveedor:           proveedor     || null,
      categoria:           categoria     || null,
      stock_minimo:        parseInt(stockMin)      || 0,
      precio_compra:       parseFloat(precioComp)  || 0,
      precio_venta:        parseFloat(precioVent)  || 0,
      porcentaje_ganancia: parseFloat(porcentaje)  || 0,
      lote:                lote          || null,
      fecha_vencimiento:   fechaVenc ? new Date(fechaVenc).toISOString() : null,
      dias_alerta_venc:    parseInt(diasAlerta) || 30,
    });

    cerrarModalEditar();
    showToast("✅ Producto actualizado correctamente");
    await cargarProductos();
    await cargarDashboard();

  } catch (error) {
    showToast("❌ " + error.message);
  }
}

/* ----------------------------
   Modal eliminar producto — confirmación antes de borrar
---------------------------- */
let productoEliminarId = null;

function abrirModalEliminar(id, nombre) {
  productoEliminarId = id;
  const msg = document.getElementById("eliminarMsg");
  if (msg) msg.innerHTML = `¿Estás seguro de eliminar <strong>"${nombre}"</strong>?<br><br>
    <span style="color:var(--rojo)">Esta acción no se puede deshacer. El producto y todo su historial serán eliminados permanentemente.</span>`;
  document.getElementById("modalEliminar").classList.add("open");
}

function cerrarModalEliminar() {
  document.getElementById("modalEliminar").classList.remove("open");
  productoEliminarId = null;
}

async function confirmarEliminar() {
  if (!productoEliminarId) return;
  try {
    await api(`/productos/${productoEliminarId}`, "DELETE");
    cerrarModalEliminar();
    showToast("🗑️ Producto eliminado permanentemente");
    await cargarProductos();
    await cargarDashboard();
  } catch (error) {
    showToast("❌ " + error.message);
  }
}


/* ----------------------------
   calcularPrecioVenta()
   Calcula automaticamente el precio de venta
   cuando cambia el precio de compra o el % de ganancia.
   Analogia: la calculadora que hace el trabajo sucio.
---------------------------- */
function calcularPrecioVenta() {
  const compra     = parseFloat(document.getElementById("inputPrecioCompra").value) || 0;
  const porcentaje = parseFloat(document.getElementById("inputPorcentaje").value)   || 0;
  const hint       = document.getElementById("precioVentaHint");

  if (compra > 0 && porcentaje > 0) {
    const venta = Math.round(compra * (1 + porcentaje / 100));
    document.getElementById("inputPrecioVenta").value = venta;
    const ganancia = venta - compra;
    if (hint) hint.textContent = `Ganancia por unidad: $${ganancia.toLocaleString("es-CL")}`;
  } else {
    if (hint) hint.textContent = "";
  }
}


/* ----------------------------
   abrirEscaner() / cerrarEscaner()
   Activa la camara del dispositivo para leer codigos de barras.
   Usa la API BarcodeDetector si esta disponible (Chrome/Android),
   o la libreria ZXing como fallback.
   Analogia: abrir el ojo de la camara para leer etiquetas.
---------------------------- */
let streamEscaner = null;

async function abrirEscaner() {
  const box   = document.getElementById("escanerBox");
  const video = document.getElementById("escanerVideo");
  box.style.display = "block";

  try {
    // Pedir acceso a la camara trasera (ideal para movil)
    streamEscaner = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = streamEscaner;
    video.play();

    // Usar BarcodeDetector si el navegador lo soporta
    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
      const intervalo = setInterval(async () => {
        try {
          const codigos = await detector.detect(video);
          if (codigos.length > 0) {
            const codigo = codigos[0].rawValue;
            document.getElementById("inputCodigoBarra").value = codigo;
            await buscarPorCodigo(codigo);
            clearInterval(intervalo);
            cerrarEscaner();
            showToast("Codigo escaneado: " + codigo);
          }
        } catch (e) {}
      }, 500);
    } else {
      showToast("Escaner activo — ingresa el codigo manualmente si no detecta automatico");
    }

  } catch (error) {
    box.style.display = "none";
    showToast("No se pudo acceder a la camara: " + error.message);
  }
}

function cerrarEscaner() {
  const box = document.getElementById("escanerBox");
  box.style.display = "none";
  if (streamEscaner) {
    streamEscaner.getTracks().forEach(t => t.stop());
    streamEscaner = null;
  }
}


async function saveProduct() {
  // Leer todos los campos del modal
  // Convertir campos de texto a mayúsculas — se guardan así en la BD
  const nombre       = document.getElementById("inputNombre").value.trim().toUpperCase();
  const codigoBarra  = document.getElementById("inputCodigoBarra").value.trim().toUpperCase();
  const codigo       = document.getElementById("inputCodigo").value.trim().toUpperCase();
  const marca        = document.getElementById("inputMarca").value.trim().toUpperCase();
  const proveedor    = document.getElementById("inputProveedor").value.trim().toUpperCase();
  const categoria    = document.getElementById("inputCategoria").value;
  const stockActual  = document.getElementById("inputStock").value;
  const stockMin     = document.getElementById("inputStockMin").value;
  const precioComp   = document.getElementById("inputPrecioCompra").value;
  const precioVent   = document.getElementById("inputPrecioVenta").value;
  const porcentaje   = document.getElementById("inputPorcentaje").value;
  const lote         = document.getElementById("inputLote").value.trim();
  const fechaVenc    = document.getElementById("inputFechaVenc").value;
  const diasAlerta   = document.getElementById("inputDiasAlerta").value;

  // Validaciones
  if (!nombre) { showToast("⚠️ El nombre del producto es obligatorio"); return; }
  if (parseInt(stockActual) < 0) { showToast("⚠️ El stock no puede ser negativo"); return; }

  // Deshabilitar botón para evitar doble clic
  const btnGuardar = document.querySelector("#modalAgregar .btn-primary");
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = "Guardando..."; }

  // Cerrar escaner si estaba abierto
  cerrarEscaner();

  try {
    await api("/productos/", "POST", {
      nombre,
      codigo_barra:        codigoBarra  || null,
      codigo:              codigo        || null,
      marca:               marca         || null,
      proveedor:           proveedor     || null,
      categoria:           categoria     || null,
      stock_actual:        parseInt(stockActual)   || 0,
      stock_minimo:        parseInt(stockMin)      || 0,
      precio_compra:       parseFloat(precioComp)  || 0,
      precio_venta:        parseFloat(precioVent)  || 0,
      porcentaje_ganancia: parseFloat(porcentaje)  || 0,
      fecha_vencimiento:   fechaVenc ? new Date(fechaVenc).toISOString() : null,
      dias_alerta_venc:    parseInt(diasAlerta) || 30,
      lote:                lote || null,
    });

    closeModal();
    showToast("✅ Producto guardado correctamente");

    if (document.getElementById("screen-productos").classList.contains("active")) {
      await cargarProductos();
    }
    await cargarDashboard();

  } catch (error) {
    // 409 = producto con ese codigo de barras ya existe
    // Buscamos el producto por codigo de barra y sumamos directo
    if (error.status === 409) {
      try {
        // Buscar el producto existente por codigo de barra
        const prod        = await api(`/productos/buscar-codigo/${encodeURIComponent(codigoBarra)}`);
        const cantidadNum = parseInt(stockActual) || 1;
        await sumarStockDirecto(prod.id, cantidadNum, lote);
        closeModal();
        showToast(`✅ Se sumaron ${cantidadNum} unidades a "${prod.nombre}"`);
        await cargarProductos();
        await cargarStock();
        await cargarDashboard();
      } catch(e2) {
        showToast("❌ Error al sumar stock: " + e2.message);
      }
    } else {
      showToast("❌ " + error.message);
    }
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


/* ============================================================
   MODAL DE MOVIMIENTOS
   ============================================================ */

async function openModalMovimiento() {
  // Cargar lista de productos en el select
  try {
    const productos = await api("/productos/");
    const select    = document.getElementById("movProductoId");
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    productos.forEach(p => {
      const opt   = document.createElement("option");
      opt.value   = p.id;
      opt.textContent = `${p.nombre}${p.codigo_barra ? " (" + p.codigo_barra + ")" : ""}`;
      select.appendChild(opt);
    });
  } catch(e) {}

  document.getElementById("formMovimiento").reset();
  document.getElementById("modalMovimiento").classList.add("open");
}

function closeModalMovimiento() {
  document.getElementById("modalMovimiento").classList.remove("open");
}

async function guardarMovimiento() {
  const productoId = document.getElementById("movProductoId").value;
  const tipo       = document.getElementById("movTipo").value;
  const cantidad   = parseInt(document.getElementById("movCantidad").value) || 0;
  const lote       = document.getElementById("movLote").value.trim();
  const nota       = document.getElementById("movNota").value.trim();

  if (!productoId) { showToast("⚠️ Selecciona un producto"); return; }
  if (cantidad <= 0) { showToast("⚠️ La cantidad debe ser mayor a 0"); return; }

  try {
    await api("/movimientos/", "POST", {
      producto_id: parseInt(productoId),
      tipo,
      cantidad,
      lote:  lote || null,
      nota:  nota || null,
    });

    closeModalMovimiento();
    showToast(`✅ ${tipo === "entrada" ? "Entrada" : "Salida"} registrada correctamente`);
    // Recargar movimientos siempre para que la tabla se actualice
    await cargarMovimientos();
    // Recargar stock si estamos ahí
    const screenStock = document.getElementById("screen-stock");
    const screenMov   = document.getElementById("screen-movimientos");
    if (screenStock && screenStock.classList.contains("active")) await cargarStock();
    await cargarDashboard();

  } catch (error) {
    showToast("❌ " + error.message);
  }
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
  // Funciona tanto en Settings como en el panel de Registro
  const wrap  = document.getElementById("passStrengthWrap")  || document.getElementById("regStrengthWrap");
  const fill  = document.getElementById("passStrengthFill")  || document.getElementById("regStrengthFill");
  const label = document.getElementById("passStrengthLabel") || document.getElementById("regStrengthLabel");
  if (!wrap) return;
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