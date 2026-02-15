/* ============================================================
   STOCKYA — app.js completo
   Backend: http://localhost:8000
   ============================================================ */

const API_URL = "http://localhost:8000";
let authToken     = localStorage.getItem("stockya_token")   || null;
let usuarioActual = JSON.parse(localStorage.getItem("stockya_usuario") || "null");

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

  if (response.status === 401) { cerrarSesion(); throw new Error("Sesion expirada"); }
  if (response.status === 204) return null;

  const data = await response.json();

  if (!response.ok) {
    // Preservar status y detail completo para manejar 409 correctamente
    const err    = new Error(typeof data.detail === "string" ? data.detail : (data.detail && data.detail.mensaje) || "Error en el servidor");
    err.status   = response.status;
    err.detail   = data.detail;
    throw err;
  }
  return data;
}

/* ============================================================
   AUTENTICACION
   ============================================================ */
async function enterApp() {
  const emailInput = document.getElementById("loginEmail");
  const passInput  = document.getElementById("loginPassword");
  const email      = emailInput ? emailInput.value.trim() : "";
  const password   = passInput  ? passInput.value.trim()  : "";

  if (!email || !password) { showToast("Ingresa tu correo y contrasena"); return; }

  try {
    const data    = await api("/auth/login", "POST", { email, password });
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("stockya_token",   authToken);
    localStorage.setItem("stockya_usuario", JSON.stringify(usuarioActual));

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";

    actualizarUIUsuario();
    await cargarDashboard();
    showToast("Bienvenido, " + usuarioActual.nombre.split(" ")[0]);
  } catch (error) {
    showToast("Error: " + error.message);
  }
}

async function registrarUsuario() {
  const nombre   = document.getElementById("regNombre").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  if (!nombre || !email || !password) { showToast("Completa todos los campos"); return; }
  try {
    await api("/auth/registro", "POST", { nombre, email, password });
    showToast("Cuenta creada — inicia sesion");
    toggleAuthMode();
  } catch (error) { showToast("Error: " + error.message); }
}

function toggleAuthMode() {
  const loginForm = document.getElementById("loginForm");
  const regForm   = document.getElementById("regForm");
  if (loginForm) loginForm.style.display = loginForm.style.display === "none" ? "block" : "none";
  if (regForm)   regForm.style.display   = regForm.style.display   === "none" ? "block" : "none";
}

function cerrarSesion() {
  authToken     = null;
  usuarioActual = null;
  localStorage.removeItem("stockya_token");
  localStorage.removeItem("stockya_usuario");
  document.getElementById("appMain").style.display   = "none";
  document.getElementById("loginPage").style.display = "block";
}

function actualizarUIUsuario() {
  if (!usuarioActual) return;
  const nombre    = usuarioActual.nombre;
  const partes    = nombre.split(" ");
  const iniciales = partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : nombre.slice(0,2).toUpperCase();
  const elNombre  = document.querySelector(".user-name");
  const elAvatar  = document.querySelector(".avatar");
  if (elNombre) elNombre.textContent = nombre;
  if (elAvatar) elAvatar.textContent = iniciales;
}

/* Auxiliar setEl */
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ============================================================
   DASHBOARD — actualiza en tiempo real
   ============================================================ */
async function cargarDashboard() {
  try {
    const [alertas, productos, movimientos, config] = await Promise.all([
      api("/alertas/"),
      api("/productos/"),
      api("/movimientos/?limit=5"),
      api("/configuracion/")
    ]);

    // Saludo
    const nombre = usuarioActual && usuarioActual.nombre ? usuarioActual.nombre.split(" ")[0] : "";
    const hoy    = new Date().toLocaleDateString("es-CL", { weekday:"long", day:"numeric", month:"long" });
    setEl("dashTitulo",    "Buen dia, " + nombre);
    setEl("dashSubtitulo", hoy.charAt(0).toUpperCase() + hoy.slice(1) + " · " + (config.nombre_negocio || "Mi Negocio"));

    // Estadisticas
    const totalProductos  = productos.length;
    const valorInventario = productos.reduce(function(acc,p){ return acc + (p.stock_actual * (p.precio_venta||0)); }, 0);
    setEl("statTotal",    totalProductos);
    setEl("statCriticos", alertas.total_criticos || 0);
    setEl("statAlertas",  alertas.total_alertas  || 0);
    setEl("statTotalTrend", totalProductos === 0 ? "Agrega tu primer producto" : totalProductos + " productos registrados");

    var vf = valorInventario >= 1000000 ? "$"+(valorInventario/1000000).toFixed(1)+"M"
           : valorInventario >= 1000    ? "$"+Math.round(valorInventario/1000)+"K"
           : "$"+Math.round(valorInventario);
    setEl("statValor",  valorInventario > 0 ? vf : "—");
    setEl("statMoneda", (config.moneda||"CLP") + " estimado en bodega");

    // Badge alertas
    var badge       = document.getElementById("alertBadge");
    var totalBadge  = (alertas.total_criticos||0) + (alertas.total_alertas||0);
    if (badge) { badge.textContent = totalBadge; badge.style.display = totalBadge > 0 ? "inline" : "none"; }

    // Lista alertas urgentes
    var lista        = document.getElementById("dashAlertasList");
    var todasAlertas = (alertas.productos_criticos||[]).concat(alertas.productos_alerta||[]);
    if (lista) {
      if (todasAlertas.length === 0) {
        lista.innerHTML = "<div style='text-align:center;padding:24px;color:var(--muted);font-size:13px'>Todo en orden — sin alertas</div>";
      } else {
        lista.innerHTML = todasAlertas.slice(0,5).map(function(p){
          var ico = p.estado === "critico" ? "🔴" : "🟡";
          return "<div class='alert-item " + p.estado + "'>"
            + "<div class='alert-emoji'>" + ico + "</div>"
            + "<div class='alert-info'><div class='alert-name'>" + p.nombre + "</div>"
            + "<div class='alert-detail'>Min: " + p.stock_minimo + " und.</div></div>"
            + "<div class='alert-qty'>" + p.stock_actual + "</div></div>";
        }).join("");
      }
    }

    // Movimientos recientes — salidas con signo negativo
    var tbody = document.getElementById("dashMovTableBody");
    if (tbody) {
      if (!movimientos || movimientos.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--muted);padding:32px;font-size:13px'>Sin movimientos aun</td></tr>";
      } else {
        tbody.innerHTML = movimientos.map(function(m) {
          var es   = m.tipo === "entrada";
          var col  = es ? "var(--azul)" : "var(--rojo)";
          var hora = new Date(m.created_at).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
          var cant = es ? "+" + m.cantidad : "-" + m.cantidad;  // NEGATIVO EN SALIDAS
          return "<tr>"
            + "<td><strong>" + (m.producto_nombre||"—") + "</strong></td>"
            + "<td><span style='color:"+col+";font-weight:600'>" + (es?"↑ Entrada":"↓ Salida") + "</span></td>"
            + "<td style='color:"+col+";font-weight:700'>" + cant + "</td>"
            + "<td>" + m.stock_nuevo + " und.</td>"
            + "<td style='color:var(--muted)'>" + hora + "</td>"
            + "</tr>";
        }).join("");
      }
    }

    // Contadores entradas/salidas
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
   PRODUCTOS — solo caracteristicas, sin stock
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

    // Solo caracteristicas — sin columna de stock
    tbody.innerHTML = productos.map(function(p){
      var nombreSafe = p.nombre.split("'").join("&apos;");
      var precioC    = p.precio_compra ? "$" + p.precio_compra.toLocaleString("es-CL") : "—";
      var precioV    = p.precio_venta  ? "$" + p.precio_venta.toLocaleString("es-CL")  : "—";
      var ganancia   = p.porcentaje_ganancia > 0
        ? "<span style='background:rgba(0,199,123,0.15);color:var(--verde);padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600'>" + p.porcentaje_ganancia + "%</span>"
        : "—";
      return "<tr>"
        + "<td style='padding-left:16px'><strong>" + p.nombre + "</strong>"
        + (p.lote ? "<div style='font-size:11px;color:var(--muted)'>Lote: "+p.lote+"</div>" : "") + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + (p.codigo_barra||p.codigo||"—") + "</td>"
        + "<td>" + (p.categoria||"—") + "</td>"
        + "<td>" + (p.marca||"—") + "</td>"
        + "<td>" + (p.proveedor||"—") + "</td>"
        + "<td>" + precioC + "</td>"
        + "<td>" + precioV + "</td>"
        + "<td style='text-align:center'>" + ganancia + "</td>"
        + "<td style='text-align:center'>"
        + "<div style='display:flex;gap:6px;justify-content:center'>"
        + "<button onclick='abrirModalEditar(" + p.id + ")' title='Editar'"
        + " style='background:none;border:1px solid var(--border);border-radius:8px;color:var(--muted);padding:5px 9px;cursor:pointer;font-size:13px;transition:all 0.2s'"
        + " onmouseover=\"this.style.borderColor='var(--azul)';this.style.color='var(--azul)'\""
        + " onmouseout=\"this.style.borderColor='var(--border)';this.style.color='var(--muted)'\">&#9999;</button>"
        + "<button onclick='abrirModalEliminar(" + p.id + "," + JSON.stringify(nombreSafe) + ")' title='Eliminar'"
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
   STOCK — igual a productos pero con columnas de stock
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
                 : p.estado_venc==="proximo" ? "<span style='color:var(--amarillo);font-weight:600'>"+dias+"d &#x23F0;</span>"
                 : new Date(p.fecha_vencimiento).toLocaleDateString("es-CL");
      }
      return "<tr>"
        + "<td style='padding-left:16px'><strong>" + p.nombre + "</strong>"
        + "<div style='font-size:11px;color:var(--muted)'>" + (p.codigo_barra||p.codigo||"Sin codigo") + (p.marca?" · "+p.marca:"") + (p.lote?" · Lote:"+p.lote:"") + "</div></td>"
        + "<td>" + (p.categoria||"—") + "</td>"
        + "<td><div class='stock-bar-wrap'><span style='font-weight:700;color:"+color+"'>" + p.stock_actual + "</span>"
        + "<div class='stock-bar-track'><div class='stock-bar-fill " + p.estado + "' style='width:"+pct+"%'></div></div></div></td>"
        + "<td style='color:var(--muted)'>" + p.stock_minimo + "</td>"
        + "<td>" + precio + "</td>"
        + "<td style='font-size:12px'>" + venceStr + "</td>"
        + "<td><span class='badge " + p.estado + "'><span class='badge-dot'></span>" + (p.estado==="critico"?"Critico":p.estado==="alerta"?"Alerta":"OK") + "</span></td>"
        + "<td style='text-align:center'>"
        + "<button onclick='abrirMovimientoRapido("+p.id+"," + JSON.stringify(p.nombre) + ")' title='Movimiento'"
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
   MOVIMIENTOS — una fila por movimiento, signo negativo en salidas
   ============================================================ */
async function cargarMovimientos(tipo, buscar, categoria, desde, hasta) {
  tipo      = tipo      || "";
  buscar    = buscar    || "";
  categoria = categoria || "";
  desde     = desde     || "";
  hasta     = hasta     || "";
  try {
    var url = "/movimientos/?limit=500";
    if (tipo)      url += "&tipo="      + encodeURIComponent(tipo);
    if (buscar)    url += "&buscar="    + encodeURIComponent(buscar);
    if (categoria) url += "&categoria=" + encodeURIComponent(categoria);
    if (desde)     url += "&desde="    + encodeURIComponent(desde);
    if (hasta)     url += "&hasta="    + encodeURIComponent(hasta);

    const movimientos = await api(url);
    const tbody       = document.getElementById("movTableBody");
    const subtitulo   = document.getElementById("movSubtitulo");

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

    // Una fila por movimiento — salidas con SIGNO NEGATIVO
    tbody.innerHTML = movimientos.map(function(m){
      var es      = m.tipo === "entrada";
      var col     = es ? "var(--azul)" : "var(--rojo)";
      var fecha   = new Date(m.created_at);
      var fStr    = fecha.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"});
      var hStr    = fecha.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
      var cant    = es ? "+" + m.cantidad : "-" + m.cantidad;   // NEGATIVO EN SALIDAS
      return "<tr>"
        + "<td style='padding-left:16px;font-size:12px'><div style='font-weight:600'>" + fStr + "</div><div style='color:var(--muted)'>" + hStr + "</div></td>"
        + "<td><strong>" + (m.producto_nombre||"<span style='color:var(--muted);font-style:italic'>Eliminado</span>") + "</strong></td>"
        + "<td><span style='color:"+col+";font-weight:600;font-size:13px'>" + (es?"&#8593; Entrada":"&#8595; Salida") + "</span></td>"
        + "<td style='color:"+col+";font-weight:700;font-size:15px'>" + cant + "</td>"
        + "<td style='color:var(--muted);text-align:center'>" + m.stock_anterior + "</td>"
        + "<td style='font-weight:600;text-align:center'>" + m.stock_nuevo + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + (m.lote||"—") + "</td>"
        + "<td style='font-size:12px;color:var(--muted);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" + (m.nota||"") + "'>" + (m.nota||"—") + "</td>"
        + "<td style='font-size:12px;color:var(--muted)'>" + (m.usuario_nombre||"—") + "</td>"
        + "</tr>";
    }).join("");

  } catch (error) { console.error("Error movimientos:", error); }
}

function filtrarMovimientos() {
  cargarMovimientos(
    document.getElementById("movFiltroTipo")?.value      || "",
    document.getElementById("movBuscar")?.value          || "",
    document.getElementById("movFiltroCategoria")?.value || "",
    document.getElementById("movFiltroDesde")?.value     || "",
    document.getElementById("movFiltroHasta")?.value     || ""
  );
}

/* ============================================================
   ALERTAS
   ============================================================ */
async function cargarAlertas() {
  try {
    const alertas = await api("/alertas/");
    var elCrit  = document.querySelector("#screen-alertas .stat-card.rojo .stat-value");
    var elAlert = document.querySelector("#screen-alertas .stat-card.amarillo .stat-value");
    if (elCrit)  elCrit.textContent  = alertas.total_criticos;
    if (elAlert) elAlert.textContent = alertas.total_alertas;
    var sub   = document.querySelector("#screen-alertas .page-subtitle");
    var total = (alertas.total_criticos||0) + (alertas.total_alertas||0);
    if (sub) sub.textContent = total + " productos requieren atencion";
  } catch (error) { console.error("Error alertas:", error); }
}

/* ============================================================
   NAVEGACION
   ============================================================ */
async function showScreen(name) {
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
  document.getElementById("modalAgregar").classList.add("open");
  document.getElementById("formProducto").reset();
  var hint = document.getElementById("codigoHint");
  if (hint) { hint.textContent = ""; hint.style.color = ""; }
  var hintP = document.getElementById("precioHint");
  if (hintP) hintP.textContent = "";
}

function closeModal() {
  document.getElementById("modalAgregar").classList.remove("open");
  var btn = document.querySelector("#modalAgregar .btn-primary");
  if (btn) { btn.disabled = false; btn.textContent = "Guardar producto"; }
  cerrarEscaner();
}

/* Calcular precio de venta automaticamente segun % ganancia */
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

/* Buscar por codigo de barras con debounce */
var _timerBusq = null;
function buscarPorCodigo(codigo) {
  clearTimeout(_timerBusq);
  var hint = document.getElementById("codigoHint");
  if (!codigo) { if (hint) { hint.textContent=""; hint.style.color=""; } return; }
  if (hint) { hint.textContent = "Buscando..."; hint.style.color = "var(--muted)"; }
  _timerBusq = setTimeout(async function(){
    try {
      var p = await api("/productos/buscar-codigo/" + encodeURIComponent(codigo));
      // Producto encontrado — llenar campos
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

/* Escaner de camara */
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

/* Guardar producto */
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

  // Deshabilitar boton para evitar doble clic
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
    // 409 = codigo de barras ya existe → sumar stock directamente
    if (error.status === 409 && codigoBarra) {
      try {
        var prod      = await api("/productos/buscar-codigo/" + encodeURIComponent(codigoBarra));
        var cantNum   = parseInt(stockActual) || 1;
        var params    = "cantidad=" + cantNum + (lote ? "&lote=" + encodeURIComponent(lote) : "");
        await api("/productos/" + prod.id + "/sumar-stock?" + params, "POST");
        closeModal();
        showToast("Se sumaron " + cantNum + " unidades a " + prod.nombre);
        await cargarProductos();
        await cargarStock();
        await cargarDashboard();
      } catch(e2) { showToast("Error: " + e2.message); }
    } else {
      showToast("Error: " + error.message);
    }
  }
}

/* Sumar stock directo */
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
  } catch (error) { showToast("Error al cargar el producto: " + error.message); }
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
  } catch (error) { showToast("Error: " + error.message); }
}

/* ============================================================
   ELIMINAR PRODUCTO — registra movimiento de baja antes de borrar
   ============================================================ */
var _eliminarId   = null;
var _eliminarNomb = "";

function abrirModalEliminar(id, nombre) {
  _eliminarId   = id;
  _eliminarNomb = nombre;
  var msg = document.getElementById("eliminarMsg");
  if (msg) msg.innerHTML = "Eliminar <strong>" + nombre + "</strong>?<br><br>"
    + "<span style='color:var(--rojo)'>Esta accion no se puede deshacer. El producto sera eliminado permanentemente.</span>";
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
    showToast(_eliminarNomb + " eliminado permanentemente");
    await cargarProductos();
    await cargarStock();
    await cargarDashboard();
  } catch (error) { showToast("Error: " + error.message); }
}

/* ============================================================
   MODAL MOVIMIENTO MANUAL
   ============================================================ */
async function openModalMovimiento() {
  try {
    var productos = await api("/productos/");
    var sel       = document.getElementById("movProductoId");
    sel.innerHTML = "<option value=''>Seleccionar producto...</option>";
    productos.forEach(function(p){
      var opt       = document.createElement("option");
      opt.value     = p.id;
      opt.textContent = p.nombre + (p.codigo_barra ? " (" + p.codigo_barra + ")" : "");
      sel.appendChild(opt);
    });
  } catch(e) {}
  document.getElementById("formMovimiento").reset();
  document.getElementById("modalMovimiento").classList.add("open");
}

function closeModalMovimiento() {
  document.getElementById("modalMovimiento").classList.remove("open");
}

async function guardarMovimiento() {
  var productoId = document.getElementById("movProductoId").value;
  var tipo       = document.getElementById("movTipo").value;
  var cantidad   = parseInt(document.getElementById("movCantidad").value) || 0;
  var lote       = document.getElementById("movLote").value.trim();
  var nota       = document.getElementById("movNota").value.trim();

  if (!productoId) { showToast("Selecciona un producto"); return; }
  if (cantidad <= 0) { showToast("La cantidad debe ser mayor a 0"); return; }

  try {
    await api("/movimientos/", "POST", {
      producto_id: parseInt(productoId), tipo, cantidad,
      lote: lote||null, nota: nota||null
    });
    closeModalMovimiento();
    showToast((tipo==="entrada"?"Entrada":"Salida") + " registrada correctamente");
    await cargarMovimientos();
    await cargarStock();
    await cargarDashboard();
  } catch (error) { showToast("Error: " + error.message); }
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
    img.src = e.target.result; img.style.display = "block"; ini.style.display = "none";
    showToast("Logo cargado — recuerda guardar");
  };
  reader.readAsDataURL(archivo);
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
  var negocio = document.getElementById("inputNegocio").value.trim();
  var usuario = document.getElementById("inputNombreUsuario").value.trim();
  var moneda  = document.getElementById("inputMoneda").value;
  var passN   = document.getElementById("inputPassNueva").value;
  var passC   = document.getElementById("inputPassConfirm").value;
  if (!negocio) { showToast("El nombre del negocio es obligatorio"); return; }
  if (passN && passN !== passC) { showToast("Las contrasenas no coinciden"); return; }
  try {
    await api("/configuracion/", "PUT", { nombre_negocio:negocio, moneda, color_principal:configTemporal.color, logo_base64:configTemporal.logoData });
    var sidebarNombre = document.querySelector(".user-name");
    if (sidebarNombre) sidebarNombre.textContent = usuario;
    document.getElementById("inputPassActual").value  = "";
    document.getElementById("inputPassNueva").value   = "";
    document.getElementById("inputPassConfirm").value = "";
    document.getElementById("passStrengthWrap").style.display = "none";
    showToast("Configuracion guardada correctamente");
  } catch (error) { showToast("Error: " + error.message); }
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
  var toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.add("show");
  setTimeout(function(){ toast.classList.remove("show"); }, 2800);
}

async function filterMov(btn, type) {
  document.querySelectorAll(".mov-tab").forEach(function(t){ t.classList.remove("active"); });
  btn.classList.add("active");
  await cargarMovimientos(type === "all" ? "" : type);
}

/* Inicializacion al cargar la pagina */
document.addEventListener("DOMContentLoaded", function(){
  // Cerrar modales al hacer clic fuera
  ["modalAgregar","modalEditar","modalEliminar","modalMovimiento"].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function(e){ if(e.target===this) e.target.classList.remove("open"); });
  });

  // Si ya hay sesion activa entrar directamente
  if (authToken && usuarioActual) {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";
    actualizarUIUsuario();
    cargarDashboard();
  }
});