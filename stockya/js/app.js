/* ============================================================
   YEPARSTOCK — app.js completo con módulo de Salidas
   Backend: http://localhost:8000
   ============================================================ */

const API_URL = "http://localhost:8000";
let authToken     = localStorage.getItem("yeparstock_token")   || null;
let usuarioActual = JSON.parse(localStorage.getItem("yeparstock_usuario") || "null");

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
    // Limpiar sesión silenciosamente — el usuario verá el login sin toast de error
    authToken     = null;
    usuarioActual = null;
    localStorage.removeItem("yeparstock_token");
    localStorage.removeItem("yeparstock_usuario");
    document.getElementById("loginPage").style.display = "block";
    document.getElementById("appMain").style.display   = "none";
    throw new Error("Sesion expirada");
  }
  if (response.status === 204) return null;

  const data = await response.json();

  if (!response.ok) {
    const err    = new Error(typeof data.detail === "string" ? data.detail : (data.detail && data.detail.mensaje) || "Error en el servidor");
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

  // Llenar selector de rubros
  var selRubro = document.getElementById("onboardingRubro");
  if (selRubro) {
    selRubro.innerHTML = '<option value="">Selecciona el rubro de tu negocio...</option>'
      + RUBROS.map(function(r){ return '<option value="'+r.value+'">'+r.label+'</option>'; }).join("");
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
    if (preview) preview.innerHTML = '<img src="' + _onboardingLogo + '" style="width:100%;height:100%;object-fit:contain;border-radius:12px">';
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
    showToast("Bienvenido, " + nombreUsuario.split(" ")[0] + "! Tu negocio esta listo");
  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Entrar a mi negocio"; }
    showToast("Error: " + error.message);
  }
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
    localStorage.setItem("yeparstock_token",   authToken);
    localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));

    // ✅ Verificar si debe mostrar onboarding antes de entrar
    // Analogia: el portero verifica si el inquilino ya paso por recepcion
    const status = await api("/auth/onboarding-status");
    if (!status.onboarding_completo) {
      mostrarOnboarding();
      return;
    }

    document.getElementById("loginPage").style.display = "none";
    document.getElementById("appMain").style.display   = "flex";
    actualizarUIUsuario();

    // Verificar estado de suscripción
    try {
      var infoEmp = await api("/empresa/info");
      if (infoEmp.bloqueado) {
        // Acceso completamente bloqueado — mostrar pantalla de bloqueo
        mostrarPantallaBloqueo(infoEmp);
        return;
      }
      if (infoEmp.en_gracia) {
        // Solo lectura — mostrar aviso pero dejar entrar
        mostrarAvisoCancelacion(infoEmp);
      }
    } catch(e) {}

    await cargarDashboard();
    showToast("Bienvenido, " + usuarioActual.nombre.split(" ")[0]);
  } catch (error) {
    showToast("Error: " + error.message);
  }
}

// Email temporal guardado entre pantallas
var _emailPendiente = "";

async function registrarUsuario() {
  const nombre   = document.getElementById("regNombre").value.trim();
  const email    = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  if (!nombre || !email || !password) { showToast("Completa todos los campos"); return; }
  try {
    const data = await api("/auth/registro", "POST", { nombre, email, password });
    _emailPendiente = email;
    // El backend ya no retorna token — muestra pantalla de verificación
    _mostrarPanel("panelVerificacion");
    document.getElementById("verifiEmailMostrar").textContent = email;
    document.getElementById("codigoInputs").querySelectorAll("input")[0].focus();
  } catch (error) { showToast("Error: " + error.message); }
}

function _mostrarPanel(id) {
  // Oculta todos los paneles y muestra el solicitado
  ["panelLogin","panelRegistro","panelVerificacion","panelOlvideEmail","panelOlvideCodigo"]
    .forEach(function(p) {
      var el = document.getElementById(p);
      if (el) el.style.display = "none";
    });
  var target = document.getElementById(id);
  if (target) target.style.display = "block";
}

// ── Inputs de código: avanzar al siguiente automáticamente ─
function avanzarCodigo(input, idx) {
  input.value = input.value.replace(/\D/g,""); // solo números
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
    // Cuenta verificada — entrar
    authToken     = data.access_token;
    usuarioActual = data.usuario;
    localStorage.setItem("yeparstock_token",   authToken);
    localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));
    document.getElementById("loginPage").style.display = "none";
    mostrarOnboarding();
  } catch(e) {
    errEl.style.display = "block";
    errEl.textContent   = e.message || "Código incorrecto";
  }
}

async function reenviarCodigo() {
  try {
    await api("/auth/reenviar-codigo?email=" + encodeURIComponent(_emailPendiente), "POST");
    showToast("✅ Código reenviado a " + _emailPendiente);
  } catch(e) { showToast("Error: " + e.message); }
}

// ── Olvidé mi contraseña ─────────────────────────────────
function mostrarOlvidePass() {
  _mostrarPanel("panelOlvideEmail");
}

async function solicitarReset() {
  var email = document.getElementById("resetEmail")?.value.trim() || _emailPendiente;
  if (!email) { showToast("Ingresa tu email"); return; }
  _emailPendiente = email;
  try {
    await api("/auth/solicitar-reset?email=" + encodeURIComponent(email), "POST");
    _mostrarPanel("panelOlvideCodigo");
    showToast("📧 Código enviado a " + email);
    document.getElementById("resetCodigoInputs").querySelectorAll("input")[0].focus();
  } catch(e) { showToast("Error: " + e.message); }
}

async function confirmarReset() {
  var codigo  = _leerCodigo("resetCodigoInputs");
  var nuevaPass = document.getElementById("resetNuevaPass").value.trim();
  var errEl   = document.getElementById("resetError");
  errEl.style.display = "none";

  if (codigo.length < 6) { showToast("Ingresa los 6 dígitos"); return; }
  if (nuevaPass.length < 6) { showToast("La contraseña debe tener al menos 6 caracteres"); return; }

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
    errEl.textContent   = e.message || "Código incorrecto o expirado";
  }
}

function mostrarRegistro() { _mostrarPanel("panelRegistro"); }
function mostrarLogin()     { _mostrarPanel("panelLogin"); }
function toggleAuthMode()   { mostrarRegistro(); }

function mostrarPantallaBloqueo(info) {
  // Ocultar la app y mostrar pantalla de bloqueo
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
    showToast("✅ " + r.mensaje);
    await cargarEquipo(); // recargar para actualizar la UI del plan
  } catch(e) {
    showToast("Error: " + e.message);
  }
}

async function reactivarSuscripcion() {
  try {
    await api("/empresa/reactivar", "POST");
    showToast("✅ Suscripción reactivada correctamente");
    await cargarEquipo();
  } catch(e) {
    showToast("Error: " + e.message);
  }
}

function cerrarSesion() {
  authToken     = null;
  usuarioActual = null;
  localStorage.removeItem("yeparstock_token");
  localStorage.removeItem("yeparstock_usuario");
  document.getElementById("appMain").style.display        = "none";
  document.getElementById("onboardingPage").style.display = "none";
  document.getElementById("loginPage").style.display      = "block";
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

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
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

    const nombre = usuarioActual && usuarioActual.nombre ? usuarioActual.nombre.split(" ")[0] : "";
    const hoy    = new Date().toLocaleDateString("es-CL", { weekday:"long", day:"numeric", month:"long" });
    setEl("dashTitulo",    "Buen dia, " + nombre);
    setEl("dashSubtitulo", hoy.charAt(0).toUpperCase() + hoy.slice(1) + " · " + (config.nombre_negocio || "Mi Negocio"));

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

    // Filtro por código en frontend (busca en codigo_barra_scan del movimiento)
    if (codigo) {
      var codigoLower = codigo.toLowerCase();
      movimientos = movimientos.filter(function(m) {
        return (m.codigo_barra_scan && m.codigo_barra_scan.toLowerCase().includes(codigoLower))
            || (m.producto_codigo   && m.producto_codigo.toLowerCase().includes(codigoLower));
      });
    }
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

    tbody.innerHTML = movimientos.map(function(m){
      var es      = m.tipo === "entrada";
      var col     = es ? "var(--azul)" : "var(--rojo)";
      var fecha   = new Date(m.created_at);
      var fStr    = fecha.toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"});
      var hStr    = fecha.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"});
      var cant    = es ? "+" + m.cantidad : "-" + m.cantidad;
      // Serializar el objeto para pasarlo al modal de detalle
      var mJson   = JSON.stringify(m).split("'").join("&apos;");
      return "<tr style='cursor:pointer' onclick='verDetalleMovimiento(" + JSON.stringify(JSON.stringify(m)) + ")'"
        + " onmouseover=\"this.style.background='var(--bg3)'\" onmouseout=\"this.style.background=''\" title='Ver detalle'>"
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

/* Mostrar modal con detalle completo de un movimiento */
function verDetalleMovimiento(jsonStr) {
  var m   = JSON.parse(jsonStr);
  var es  = m.tipo === "entrada";
  var col = es ? "var(--azul)" : "var(--rojo)";
  var fecha = new Date(m.created_at).toLocaleString("es-CL", {
    day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });

  var html =
    "<div style='display:flex;flex-direction:column;gap:10px'>"
    + "<div style='display:grid;grid-template-columns:1fr 1fr;gap:10px'>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Producto</div>"
    + "<div style='font-weight:700;font-size:15px'>" + (m.producto_nombre || "<em style='color:var(--muted)'>Eliminado</em>") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Tipo</div>"
    + "<div style='font-weight:700;font-size:15px;color:" + col + "'>" + (es ? "↑ Entrada" : "↓ Salida") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Cantidad</div>"
    + "<div style='font-weight:800;font-size:20px;color:" + col + "'>" + (es ? "+" : "-") + m.cantidad + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Fecha y hora</div>"
    + "<div style='font-weight:600;font-size:13px'>" + fecha + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Stock anterior</div>"
    + "<div style='font-weight:700;font-size:16px;color:var(--muted)'>" + m.stock_anterior + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Stock resultante</div>"
    + "<div style='font-weight:800;font-size:16px'>" + m.stock_nuevo + " und.</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Lote</div>"
    + "<div style='font-weight:600;font-size:13px'>" + (m.lote || "—") + "</div>"
    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Registrado por</div>"
    + "<div style='font-weight:600;font-size:13px'>" + (m.usuario_nombre || "—") + "</div>"
    + "</div>"

    + "</div>"

    + "<div style='background:var(--bg3);border-radius:10px;padding:12px'>"
    + "<div style='font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px'>Nota / Observación</div>"
    + "<div style='font-size:13px;color:" + (m.nota ? "var(--text)" : "var(--muted)") + "'>" + (m.nota || "Sin nota") + "</div>"
    + "</div>"

    + "</div>";

  // Reutilizar el modal de eliminar como panel de detalle
  var modalEl = document.getElementById("modalEliminar");
  var titulo  = modalEl.querySelector(".modal-title");
  var msg     = document.getElementById("eliminarMsg");
  var acciones= modalEl.querySelector(".form-actions");

  titulo.style.color   = "var(--text)";
  titulo.innerHTML     = "📋 Detalle del movimiento";
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

    // Actualizar contadores y badge de navegacion
    var elCrit  = document.getElementById("alertasCriticosNum");
    var elAlert = document.getElementById("alertasAlertaNum");
    var sub     = document.getElementById("alertasSubtitulo");
    var badge   = document.getElementById("alertBadge");

    // Compatibilidad: si no hay IDs nuevos usar selectores anteriores
    if (!elCrit)  elCrit  = document.querySelector("#screen-alertas .stat-card.rojo .stat-value");
    if (!elAlert) elAlert = document.querySelector("#screen-alertas .stat-card.amarillo .stat-value");
    if (!sub)     sub     = document.querySelector("#screen-alertas .page-subtitle");

    if (elCrit)  elCrit.textContent  = alertas.total_criticos || 0;
    if (elAlert) elAlert.textContent = alertas.total_alertas  || 0;
    if (sub)     sub.textContent     = total + " productos requieren atención";
    if (badge)   { badge.textContent = total; badge.style.display = total > 0 ? "inline" : "none"; }

    // Construir cada ítem de alerta
    function buildItem(p, tipo) {
      var esCritico = (tipo === "critico" || tipo === "vencido");
      var color     = esCritico ? "var(--rojo)" : "var(--amarillo)";
      return "<div class='alert-big-item " + tipo + "'>"
        + "<div class='alert-icon-big " + tipo + "'>📦</div>"
        + "<div class='alert-big-info'>"
        +   "<div class='alert-big-name'>" + p.nombre + "</div>"
        +   "<div class='alert-big-detail'>Stock mínimo: " + p.stock_minimo + " und. · Actual: "
        +     p.stock_actual + " und." + (p.categoria ? " · " + p.categoria : "") + "</div>"
        + "</div>"
        + "<div class='alert-big-action'>"
        +   "<div style='font-family:var(--font-head);font-size:22px;font-weight:800;color:" + color + "'>"
        +     p.stock_actual + " und.</div>"
        +   "<button class='btn-primary' style='font-size:12px;padding:7px 14px' "
        +     "onclick='abrirMovimientoRapido(" + p.id + ",\"" + p.nombre.replace(/"/g,"'") + "\")'>+ Registrar entrada</button>"
        + "</div>"
        + "</div>";
    }

    // Sección críticos
    var listCrit = document.getElementById("alertasCriticosList");
    var secCrit  = document.getElementById("alertasCriticosSec");
    if (listCrit) {
      listCrit.innerHTML = (alertas.productos_criticos||[]).map(function(p){ return buildItem(p,"critico"); }).join("")
        || "<div style='text-align:center;color:var(--muted);padding:16px;font-size:13px'>Sin productos críticos</div>";
    }
    if (secCrit) secCrit.style.display = (alertas.total_criticos||0) > 0 ? "" : "none";

    // Sección alerta
    var listAlert = document.getElementById("alertasAlertaList");
    var secAlert  = document.getElementById("alertasAlertaSec");
    if (listAlert) {
      listAlert.innerHTML = (alertas.productos_alerta||[]).map(function(p){ return buildItem(p,"alerta"); }).join("")
        || "<div style='text-align:center;color:var(--muted);padding:16px;font-size:13px'>Sin productos en alerta</div>";
    }
    if (secAlert) secAlert.style.display = (alertas.total_alertas||0) > 0 ? "" : "none";

    // Sección vencidos
    var listVenc = document.getElementById("alertasVencidosList");
    var secVenc  = document.getElementById("alertasVencidosSec");
    if (listVenc) {
      listVenc.innerHTML = (alertas.productos_vencidos||[]).map(function(p){ return buildItem(p,"vencido"); }).join("");
    }
    if (secVenc) secVenc.style.display = (alertas.productos_vencidos||[]).length > 0 ? "" : "none";

    // Sección próximos a vencer
    var listProx = document.getElementById("alertasProximosList");
    var secProx  = document.getElementById("alertasProximosSec");
    if (listProx) {
      listProx.innerHTML = (alertas.productos_proximos||[]).map(function(p){ return buildItem(p,"proximo"); }).join("");
    }
    if (secProx) secProx.style.display = (alertas.productos_proximos||[]).length > 0 ? "" : "none";

    // Mensaje vacío total
    var vacio = document.getElementById("alertasVacioMsg");
    if (vacio) vacio.style.display = total === 0 ? "" : "none";

  } catch (error) { console.error("Error alertas:", error); }
}

/* ============================================================
   SALIDAS — ventas, mermas, cuarentenas, devoluciones
   Con soporte para escaneo por camara o pistola lectora
   ============================================================ */

var _streamSalida = null; // Variable global para el escaner de salidas

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

    const salidas   = await api(url);
    const resumen   = await api("/salidas/resumen");
    const tbody     = document.getElementById("salidaTableBody");
    const subtitulo = document.getElementById("salidaSubtitulo");

    // Actualizar contadores del resumen
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

    // Mapas de colores y etiquetas
    var colorTipo  = { venta:"var(--azul)", merma:"var(--rojo)", cuarentena:"var(--amarillo)", devolucion_proveedor:"var(--muted)" };
    var labelTipo  = { venta:"Venta", merma:"Merma", cuarentena:"Cuarentena", devolucion_proveedor:"Dev. Proveedor" };
    var colorEst   = { activo:"var(--verde)", en_revision:"var(--amarillo)", reingresado:"var(--azul)", descartado:"var(--rojo)", enviado_proveedor:"var(--muted)" };
    var labelEst   = { activo:"Confirmado", en_revision:"En Revision", reingresado:"Reingresado", descartado:"Descartado", enviado_proveedor:"Enviado" };
    var iconoTipo  = { venta:"🛒", merma:"🗑️", cuarentena:"⚠️", devolucion_proveedor:"↩️" };

    tbody.innerHTML = salidas.map(function(s) {
      var fecha  = new Date(s.created_at);
      var fStr   = fecha.toLocaleDateString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric" });
      var hStr   = fecha.toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit" });
      var colT   = colorTipo[s.tipo_salida] || "var(--muted)";
      var labT   = labelTipo[s.tipo_salida] || s.tipo_salida;
      var colE   = colorEst[s.estado]       || "var(--muted)";
      var labE   = labelEst[s.estado]       || s.estado;
      var icono  = iconoTipo[s.tipo_salida] || "📦";
      var valor  = s.valor_total > 0 ? "$" + s.valor_total.toLocaleString("es-CL") : "—";

      // Boton resolver solo para cuarentenas en_revision
      var btnResolver = s.estado === "en_revision"
        ? "<button onclick='abrirModalResolucion(" + s.id + ")'"
          + " style='background:var(--amarillo);color:#000;border:none;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600;margin-right:4px'>Resolver</button>"
        : "";

      return "<tr>"
        + "<td style='padding-left:16px;font-size:12px'><div style='font-weight:600'>" + fStr + "</div><div style='color:var(--muted)'>" + hStr + "</div></td>"
        + "<td><strong>" + (s.producto_nombre || "<span style='color:var(--muted);font-style:italic'>Eliminado</span>") + "</strong>"
        + (s.lote ? "<div style='font-size:11px;color:var(--muted)'>Lote: " + s.lote + "</div>" : "") + "</td>"
        + "<td><span style='color:" + colT + ";font-weight:600'>" + icono + " " + labT + "</span></td>"
        + "<td style='color:var(--rojo);font-weight:700'>-" + s.cantidad + "</td>"
        + "<td style='color:var(--muted);text-align:center'>" + s.stock_anterior + "</td>"
        + "<td style='font-weight:600;text-align:center'>" + s.stock_nuevo + "</td>"
        + "<td style='font-size:12px;color:var(--muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' title='" + (s.motivo||"") + "'>" + (s.motivo||"—") + "</td>"
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

var _carrito        = [];   // [{id, nombre, qty, precio, subtotal}]
var _metodoPagoActual = "efectivo";  // método de pago seleccionado en el modal de ventas
var _productoActual = null; // Producto encontrado, pendiente de agregar
var _streamSalida   = null; // Stream de camara activo

/* Recalcular totales y redibujar la lista del carrito */
function renderCarrito() {
  var lista   = document.getElementById("carritoLista");
  var wrap    = document.getElementById("carritoWrap");
  var btnConf = document.getElementById("btnConfirmarVenta");
  if (!lista) return;

  if (_carrito.length === 0) {
    if (wrap)    wrap.style.display    = "none";
    if (btnConf) { btnConf.disabled = true; btnConf.style.opacity = "0.5"; }
    setEl("totalValor",  "$0");
    setEl("totalDetalle", "0 productos");
    return;
  }

  if (wrap)    wrap.style.display    = "block";
  if (btnConf) { btnConf.disabled = false; btnConf.style.opacity = "1"; }

  var totalItems = _carrito.reduce(function(a,i){ return a + i.qty;      }, 0);
  var totalPesos = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);

  setEl("totalValor",  "$" + totalPesos.toLocaleString("es-CL"));
  setEl("totalDetalle", _carrito.length + " producto" + (_carrito.length !== 1 ? "s" : "") + " · " + totalItems + " unidades");

  // Renderizar cada fila del carrito
  lista.innerHTML = _carrito.map(function(item, idx) {
    return "<div style='display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px 12px'>"
      + "<div style='flex:1;min-width:0'>"
      +   "<div style='font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + item.nombre + "</div>"
      +   "<div style='font-size:11px;color:var(--muted);margin-top:2px'>" + item.qty + " und × $" + item.precio.toLocaleString("es-CL") + "</div>"
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

  // Si el mismo producto ya esta en el carrito, sumar la cantidad
  var existe = _carrito.find(function(i){ return i.id === _productoActual.id; });
  if (existe) {
    existe.qty     += qty;
    existe.precio   = precio;
    existe.subtotal = existe.qty * precio;
    showToast("+" + qty + " sumado a " + _productoActual.nombre);
  } else {
    _carrito.push({
      id:       _productoActual.id,
      nombre:   _productoActual.nombre,
      qty:      qty,
      precio:   precio,
      subtotal: qty * precio,
    });
    showToast(_productoActual.nombre + " agregado al carrito");
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
  // Focus de vuelta para escanear el siguiente producto
  setTimeout(function(){ document.getElementById("salidaCodigoBarra")?.focus(); }, 100);
}

/* Quitar un item del carrito por indice */
function quitarDelCarrito(idx) {
  var nombre = _carrito[idx]?.nombre || "Producto";
  _carrito.splice(idx, 1);
  renderCarrito();
  showToast(nombre + " quitado del carrito");
}

/* Abrir modal, resetear carrito y cargar lista de productos */
var _tipoSalidaActual = "venta"; // "venta" o "merma"

async function abrirModalSalida(tipo) {
  _tipoSalidaActual = tipo || "venta";
  _carrito          = [];
  _productoActual   = null;

  // Adaptar UI según modo
  var esMerma = _tipoSalidaActual === "merma";
  setEl("modalSalidaTitulo", esMerma ? "🗑️ Registrar merma" : "🛒 Nueva venta");
  var btnConf = document.getElementById("btnConfirmarVenta");
  if (btnConf) {
    btnConf.textContent   = esMerma ? "✔ Confirmar merma" : "✔ Confirmar venta";
    btnConf.style.background = esMerma ? "var(--rojo)" : "";
  }
  // Ocultar método de pago y cliente en mermas — no aplica
  var metodoPagoWrap = document.getElementById("metodoPagoGrid")?.closest(".form-group.form-full");
  var clienteWrap    = document.getElementById("salidaCliente")?.closest(".form-group.form-full");
  if (metodoPagoWrap) metodoPagoWrap.style.display = esMerma ? "none" : "";
  if (clienteWrap)    clienteWrap.style.display    = esMerma ? "none" : "";

  try {
    var productos = await api("/productos/");
    var sel       = document.getElementById("salidaProductoId");
    if (sel) {
      sel.innerHTML = "<option value=''>— O selecciona de la lista —</option>";
      productos.forEach(function(p) {
        var opt            = document.createElement("option");
        opt.value          = p.id;
        opt.dataset.precio = p.precio_venta || 0;
        opt.dataset.stock  = p.stock_actual || 0;
        opt.dataset.nombre = p.nombre;
        opt.dataset.cat    = p.categoria    || "";
        opt.textContent    = p.nombre + " (stock: " + p.stock_actual + ")" + (p.codigo_barra ? " — " + p.codigo_barra : "");
        sel.appendChild(opt);
      });
    }
  } catch(e) {}

  // Limpiar todos los campos del modal
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

  // Resetear totales
  setEl("totalValor",  "$0");
  setEl("totalDetalle", "0 productos");
  var btnConf = document.getElementById("btnConfirmarVenta");
  if (btnConf) { btnConf.disabled = true; btnConf.style.opacity = "0.5"; }

  document.getElementById("modalSalida").classList.add("open");
  setTimeout(function(){ document.getElementById("salidaCodigoBarra")?.focus(); }, 200);
}

function cerrarModalSalida() {
  document.getElementById("modalSalida").classList.remove("open");
  cerrarEscanerSalida();
  // Resetear método de pago a efectivo
  _metodoPagoActual = "efectivo";
  document.querySelectorAll(".metodo-pago-btn").forEach(function(b){ b.classList.remove("active"); });
  var btnEfectivo = document.querySelector("[data-metodo='efectivo']");
  if (btnEfectivo) btnEfectivo.classList.add("active");
  var aviso = document.getElementById("fiadoAviso");
  if (aviso) aviso.style.display = "none";
}

/* Cuando el usuario selecciona un producto del dropdown */
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
  document.getElementById("chipNombre").textContent     = nombre;
  document.getElementById("chipDetalle").textContent    = cat + " · $" + precio.toLocaleString("es-CL") + " c/u · Stock: " + stock;
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
      // Buscar por codigo de barras exacto
      var p = await api("/productos/buscar-codigo/" + encodeURIComponent(valor));

      _productoActual = { id: p.id, nombre: p.nombre, precio: p.precio_venta || 0 };

      // Sincronizar dropdown
      var sel = document.getElementById("salidaProductoId");
      if (sel) { for (var o of sel.options) { if (parseInt(o.value) === p.id) { o.selected = true; break; } } }

      // Prellenar precio y mostrar chip
      if (p.precio_venta) document.getElementById("salidaPrecioUnitario").value = p.precio_venta;
      document.getElementById("chipNombre").textContent  = p.nombre;
      document.getElementById("chipDetalle").textContent = (p.categoria||"Producto") + " · $" + (p.precio_venta||0).toLocaleString("es-CL") + " c/u · Stock: " + p.stock_actual;
      document.getElementById("productoChip").style.display = "flex";

      if (hint) { hint.textContent = "✓ " + p.nombre + " — Stock: " + p.stock_actual + " und. — presiona Enter para agregar"; hint.style.color = "var(--verde)"; }

    } catch(e) {
      // Si no hay codigo exacto, buscar por nombre en el dropdown
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

/* Calcular subtotal del chip actual (no del carrito — ese se calcula en renderCarrito) */
function calcularTotalVenta() {
  // Solo mantiene compatibilidad, el total real lo gestiona renderCarrito
}

/* Prellenar cliente generico con un clic */
function seleccionarMetodoPago(metodo) {
  // Analogia: elegir cómo se paga en la caja — solo una opción activa a la vez
  _metodoPagoActual = metodo;
  document.querySelectorAll(".metodo-pago-btn").forEach(function(b){
    b.classList.remove("active");
  });
  var btn = document.querySelector("[data-metodo='" + metodo + "']");
  if (btn) btn.classList.add("active");

  // Mostrar u ocultar aviso de fiado
  var aviso = document.getElementById("fiadoAviso");
  if (aviso) aviso.style.display = metodo === "fiado" ? "block" : "none";
}

function onClienteInput() {
  // Si es fiado y se escribe el cliente, quitar borde rojo si lo había
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

/* Escaner de camara */
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
            showToast("Codigo escaneado: " + codes[0].rawValue);
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
      });
    }
    var totalItems = _carrito.reduce(function(a,i){ return a + i.qty; }, 0);
    var totalPesos = _carrito.reduce(function(a,i){ return a + i.subtotal; }, 0);
    var msg = esMerma
      ? "🗑️ Merma registrada — " + totalItems + " unidades"
      : "✅ Venta confirmada — " + totalItems + " unidades · $" + totalPesos.toLocaleString("es-CL")
        + (metodoPago === "fiado" ? " · Fiado a " + cliente : "");

    cerrarModalSalida();
    showToast(msg);
    await cargarSalidas();
    await cargarStock();
    await cargarDashboard();

  } catch (error) {
    if (btn) { btn.disabled = false; btn.textContent = esMerma ? "✔ Confirmar merma" : "✔ Confirmar venta"; }
    showToast("Error: " + error.message);
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
    showToast("Error: " + error.message);
  }
}

/* ============================================================
   REPORTES — dinamico, calcula desde los datos reales
   ============================================================ */
async function cargarReportes() {
  try {
    const periodo = document.getElementById("reportePeriodo")?.value || "mes";

    const [productos, movimientos, resumenReportes, fiadosResumen, fiadosLista] = await Promise.all([
      api("/productos/"),
      api("/movimientos/?limit=500"),
      api("/reportes/ventas-resumen?periodo=" + periodo),
      api("/fiados/resumen"),
      api("/fiados/"),
    ]);

    // Ventas del periodo — datos reales del backend
    var totalVentas   = resumenReportes.total_valor    || 0;
    var totalUnidades = resumenReportes.total_unidades || 0;
    var totalMermasUnd = resumenReportes.total_mermas  || 0;
    var vStr = totalVentas >= 1000000 ? "$"+(totalVentas/1000000).toFixed(1)+"M"
             : totalVentas >= 1000    ? "$"+Math.round(totalVentas/1000)+"K"
             : "$"+Math.round(totalVentas).toLocaleString("es-CL");
    setEl("reporteValorVentas", totalVentas > 0 ? vStr : "—");
    setEl("reporteUnidades",    totalUnidades > 0 ? totalUnidades.toLocaleString("es-CL") : "—");
    setEl("reporteMermas",      totalMermasUnd > 0 ? "$"+Math.round(totalMermasUnd).toLocaleString("es-CL") : "0");

    // Valor bodega
    var valorBodega = productos.reduce(function(a,p){ return a + (p.stock_actual*(p.precio_venta||0)); }, 0);
    var vbStr = valorBodega >= 1000000 ? "$"+(valorBodega/1000000).toFixed(1)+"M"
              : valorBodega >= 1000    ? "$"+Math.round(valorBodega/1000)+"K"
              : "$"+Math.round(valorBodega);
    setEl("reporteValorBodega", productos.length > 0 ? vbStr : "—");

    // Margen bruto promedio
    var conPrecio = productos.filter(function(p){ return p.precio_compra>0 && p.precio_venta>0; });
    if (conPrecio.length > 0) {
      var margen = conPrecio.reduce(function(a,p){ return a + ((p.precio_venta-p.precio_compra)/p.precio_compra*100); }, 0) / conPrecio.length;
      setEl("reporteMargen", Math.round(margen) + "%");
    } else {
      setEl("reporteMargen", "—");
    }

    // Unidades rotadas (salidas)
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
            return "<div style='display:flex;align-items:center;gap:12px;margin-bottom:12px'>"
              + "<div style='font-size:18px'>" + (rankIcons[i]||"") + "</div>"
              + "<div style='flex:1'>"
              +   "<div style='font-size:13px;font-weight:500;margin-bottom:4px'>" + item[0] + "</div>"
              +   "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +     "<div style='background:var(--verde);height:8px;border-radius:6px;width:"+pct+"%'></div>"
              +   "</div>"
              + "</div>"
              + "<div style='font-size:13px;font-weight:700;color:var(--muted)'>" + item[1] + " und.</div>"
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
              +   "<span style='font-weight:500'>" + e[0] + "</span>"
              +   "<span style='color:var(--muted)'>" + e[1].t + " und · " + v + "</span>"
              + "</div>"
              + "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +   "<div style='background:var(--verde);height:8px;border-radius:6px;width:"+pct+"%'></div>"
              + "</div>"
              + "</div>";
          }).join("");
    }

    // ── Ventas por método de pago ─────────────────────────────
    var topProd = await api("/reportes/top-productos?periodo=" + periodo + "&limite=100");
    var salidasDetalle = await api("/salidas/?tipo_salida=venta&limit=1000");
    var metodosMap  = {};
    var iconMetodo  = { efectivo:"💵", debito:"💳", credito:"💳", transferencia:"📱", cheque:"📝", fiado:"📒" };
    var labelMetodo = { efectivo:"Efectivo", debito:"Débito", credito:"Crédito", transferencia:"Transferencia", cheque:"Cheque", fiado:"Fiado" };
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
            return "<div style='margin-bottom:10px'>"
              + "<div style='display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px'>"
              +   "<span style='font-weight:600'>" + (iconMetodo[e[0]]||"💰") + " " + (labelMetodo[e[0]]||e[0]) + "</span>"
              +   "<span style='color:var(--muted)'>" + e[1].cant + " vtas · <strong style='color:var(--text)'>" + monto + "</strong></span>"
              + "</div>"
              + "<div style='background:var(--bg3);border-radius:6px;height:8px'>"
              +   "<div style='background:"+color+";height:8px;border-radius:6px;width:"+pct+"%'></div>"
              + "</div>"
              + "</div>";
          }).join("");
    }

    // ── Resumen global de deudas ──────────────────────────────
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

          // Barra de cobro
          + "<div style='margin-bottom:4px'>"
          + "<div style='display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px'>"
          +   "<span style='color:var(--muted)'>Cobrado</span>"
          +   "<span style='font-weight:700'>"+pctCobrado+"%  ·  $"+montoCobrado.toLocaleString("es-CL")+" / $"+montoTotal.toLocaleString("es-CL")+"</span>"
          + "</div>"
          + "<div style='background:var(--bg3);border-radius:6px;height:10px'>"
          +   "<div style='background:var(--verde);height:10px;border-radius:6px;width:"+pctCobrado+"%'></div>"
          + "</div></div>"

          // Fila de stats
          + "<div style='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px'>"
          +   _dCard("⏳","Pendiente",pendientes,"#f59e0b")
          +   _dCard("🔄","Parcial",parciales,"var(--azul)")
          +   _dCard("✅","Pagado",pagados,"var(--verde)")
          + "</div>"

          // Total pendiente por cobrar
          + "<div style='background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px;margin-top:4px;display:flex;justify-content:space-between;align-items:center'>"
          +   "<span style='font-size:13px;color:#f59e0b;font-weight:600'>💰 Por cobrar</span>"
          +   "<span style='font-family:var(--font-head);font-size:20px;font-weight:800;color:#f59e0b'>$"+totalDeuda.toLocaleString("es-CL")+"</span>"
          + "</div>"

          + "<div style='font-size:12px;color:var(--muted);text-align:right;margin-top:2px'>"+totalClientes+" cliente(s) con deuda abierta · <a onclick=\"showScreen('fiados')\" style='color:var(--azul);cursor:pointer;text-decoration:underline'>Ver deudores →</a></div>"
          + "</div>";
    }

  } catch(error) { console.error("Error reportes:", error); }
}

// Helper para mini-cards de deudas
function _dCard(icon, label, val, color) {
  return "<div style='background:var(--bg3);border-radius:8px;padding:10px;text-align:center'>"
    + "<div style='font-size:18px'>"+icon+"</div>"
    + "<div style='font-family:var(--font-head);font-size:18px;font-weight:800;color:"+color+"'>"+val+"</div>"
    + "<div style='font-size:11px;color:var(--muted)'>"+label+"</div>"
    + "</div>";
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
   ELIMINAR PRODUCTO
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
  var negocio     = document.getElementById("inputNegocio").value.trim();
  var moneda      = document.getElementById("inputMoneda").value;
  var nombreUser  = document.getElementById("inputNombreUsuario")?.value.trim() || "";
  var emailUser   = document.getElementById("inputEmail")?.value.trim()         || "";
  var passActual  = document.getElementById("inputPassActual")?.value           || "";
  var passN       = document.getElementById("inputPassNueva")?.value            || "";
  var passC       = document.getElementById("inputPassConfirm")?.value          || "";

  if (!negocio) { showToast("El nombre del negocio es obligatorio"); return; }
  if (passN && passN !== passC) { showToast("Las contraseñas no coinciden"); return; }

  try {
    // 1) Guardar configuracion del negocio
    await api("/configuracion/", "PUT", {
      nombre_negocio:  negocio,
      moneda:          moneda,
      color_principal: configTemporal.color,
      logo_base64:     configTemporal.logoData || null,
    });

    // 2) Guardar datos del usuario si cambio algo
    if (nombreUser || emailUser) {
      var bodyUser = {};
      if (nombreUser) bodyUser.nombre = nombreUser;
      if (emailUser)  bodyUser.email  = emailUser;
      if (passN && passActual) { bodyUser.password_actual = passActual; bodyUser.password_nuevo = passN; }
      await api("/auth/perfil", "PUT", bodyUser);

      // Actualizar datos en memoria y localStorage
      if (usuarioActual) {
        if (nombreUser) usuarioActual.nombre = nombreUser;
        if (emailUser)  usuarioActual.email  = emailUser;
        localStorage.setItem("yeparstock_usuario", JSON.stringify(usuarioActual));
        actualizarUIUsuario();
      }
    }

    // Limpiar campos de contraseña
    document.getElementById("inputPassActual").value  = "";
    document.getElementById("inputPassNueva").value   = "";
    document.getElementById("inputPassConfirm").value = "";
    document.getElementById("passStrengthWrap").style.display = "none";

    showToast("Configuración guardada correctamente");
  } catch (error) { showToast("Error: " + error.message); }
}

// ============================================================
// CARGAR DATOS EN PANTALLA CONFIGURACIÓN
// Analogia: cuando abres tu ficha en el banco, ves TUS datos —
// esta función garantiza que siempre se carguen datos frescos
// ============================================================
async function cargarConfiguracion() {
  // Limpiar campos primero para evitar datos del usuario anterior
  var campos = ["inputNegocio","inputNombreUsuario","inputEmail","inputPassActual","inputPassNueva","inputPassConfirm"];
  campos.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ""; });

  try {
    var config = await api("/configuracion/");

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
    if (inputEmail)         inputEmail.value         = usuarioActual ? usuarioActual.email  : "";

  } catch(e) {
    var inputNombreUsuario = document.getElementById("inputNombreUsuario");
    var inputEmail         = document.getElementById("inputEmail");
    if (inputNombreUsuario) inputNombreUsuario.value = usuarioActual ? usuarioActual.nombre : "";
    if (inputEmail)         inputEmail.value         = usuarioActual ? usuarioActual.email  : "";
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
  ["modalAgregar","modalEditar","modalEliminar","modalMovimiento","modalSalida","modalResolucion","modalInvitar","modalUpgrade"].forEach(function(id){
    var el = document.getElementById(id);
    // Modal solo cierra con botón ✕ o Cancelar — nunca al hacer clic en el overlay
  });

  // Si ya hay sesión activa, verificar onboarding antes de entrar
  if (authToken && usuarioActual) {
    api("/auth/onboarding-status")
      .then(function(status) {
        if (!status.onboarding_completo) {
          document.getElementById("loginPage").style.display = "none";
          mostrarOnboarding();
        } else {
          document.getElementById("loginPage").style.display = "none";
          document.getElementById("appMain").style.display   = "flex";
          actualizarUIUsuario();
          cargarDashboard();
        }
      })
      .catch(function(err) {
        // Token expirado o inválido — limpiar y mostrar login sin toast de error
        authToken     = null;
        usuarioActual = null;
        localStorage.removeItem("yeparstock_token");
        localStorage.removeItem("yeparstock_usuario");
        document.getElementById("loginPage").style.display = "block";
        document.getElementById("appMain").style.display   = "none";
      });
  }
});
/* ============================================================
   EQUIPO — Gestión de usuarios del negocio
   Analogia: el panel de RRHH del negocio — solo el admin
   puede contratar, cambiar roles y revocar accesos
   ============================================================ */

// Variables del módulo equipo
let equipoData  = [];    // Lista de usuarios cargados
let empresaInfo = null;  // Datos del plan y empresa
let esAdmin     = false; // Si el usuario actual es admin

/* ============================================================
   CARGAR EQUIPO — se llama cuando se abre la pantalla
   ============================================================ */
// ============================================================
// PANTALLA FIADOS — deudores / cuentas por cobrar
// Analogia: el cuaderno de fiados del almacén hecho digital
// ============================================================
var _fiadosTodos    = [];   // todos los fiados cargados
var _fiadoFiltroEstado = ""; // filtro activo

async function cargarFiados() {
  try {
    var [lista, resumen] = await Promise.all([
      api("/fiados/"),
      api("/fiados/resumen")
    ]);
    _fiadosTodos = lista;

    // Actualizar resumen
    document.getElementById("fiadosTotalDeuda").textContent =
      "$" + (resumen.total_deuda_pendiente || 0).toLocaleString("es-CL");
    document.getElementById("fiadosTotalClientes").textContent =
      resumen.total_clientes_con_deuda || 0;
    document.getElementById("fiadosSubtitulo").textContent =
      resumen.total_clientes_con_deuda + " clientes con deuda abierta";

    // Badge en sidebar
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

  var rows = lista.map(function(f) {
    var estadoColor = f.estado === "pagado" ? "var(--verde)" : f.estado === "pagado_parcial" ? "var(--azul)" : "#f59e0b";
    var estadoLabel = f.estado === "pagado" ? "✅ Pagado" : f.estado === "pagado_parcial" ? "🔄 Parcial" : "⏳ Pendiente";
    var pendiente   = f.monto_total - f.monto_pagado;
    var fechaRaw    = f.ultima_compra || f.created_at;
    var fecha       = fechaRaw ? new Date(fechaRaw).toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit",year:"numeric"}) : "—";

    return `<tr>
      <td style="padding:12px 16px;font-weight:600">${f.cliente_nombre}<br><span style="font-size:11px;color:var(--muted);font-weight:400">${f.cantidad_fiados} compra${f.cantidad_fiados!==1?'s':''}</span></td>
      <td style="padding:12px 8px;text-align:right">$${f.monto_total.toLocaleString("es-CL")}</td>
      <td style="padding:12px 8px;text-align:right;color:var(--verde)">$${f.monto_pagado.toLocaleString("es-CL")}</td>
      <td style="padding:12px 8px;text-align:right;color:#f59e0b;font-weight:700">$${f.monto_pendiente.toLocaleString("es-CL")}</td>
      <td style="padding:12px 8px;text-align:center"><span style="color:${estadoColor};font-size:12px;font-weight:700">${estadoLabel}</span></td>
      <td style="padding:12px 8px;color:var(--muted);font-size:12px;text-align:center">${fecha}</td>
      <td style="padding:12px 8px;text-align:center">
        ${f.estado !== "pagado" ? `<button onclick="abrirAbonoFiado('${f.cliente_nombre.replace(/'/g,"\\'")}',${f.monto_pendiente})" style="background:var(--verde);border:none;border-radius:8px;padding:5px 12px;color:#000;font-size:12px;font-weight:700;cursor:pointer">💰 Abonar</button>` : "<span style='color:var(--muted);font-size:12px'>—</span>"}
      </td>
    </tr>`;
  }).join("");

  cont.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase">
      <th style="padding:10px 16px;text-align:left">Cliente</th>
      <th style="padding:10px 8px;text-align:right">Total</th>
      <th style="padding:10px 8px;text-align:right">Pagado</th>
      <th style="padding:10px 8px;text-align:right">Pendiente</th>
      <th style="padding:10px 8px;text-align:center">Estado</th>
      <th style="padding:10px 8px;text-align:center">Fecha</th>
      <th style="padding:10px 8px;text-align:center">Acción</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function abrirAbonoFiado(clienteNombre, pendiente) {
  var monto = prompt("¿Cuánto abona " + clienteNombre + "?\nDeuda pendiente: $" + pendiente.toLocaleString("es-CL"));
  if (!monto || isNaN(parseFloat(monto))) return;
  var montoNum = parseFloat(monto);
  if (montoNum <= 0) { showToast("El monto debe ser mayor a 0"); return; }

  api("/fiados/abonar-cliente?cliente_nombre=" + encodeURIComponent(clienteNombre) + "&monto=" + montoNum, "PATCH")
    .then(function() {
      showToast("✅ Abono de $" + montoNum.toLocaleString("es-CL") + " registrado para " + clienteNombre);
      cargarFiados();
    })
    .catch(function(e) { showToast("Error: " + e.message); });
}

async function cargarEquipo() {
  try {
    const [infoEmpresa, listaEquipo] = await Promise.all([
      api("/empresa/info"),
      api("/empresa/usuarios"),
    ]);

    empresaInfo = infoEmpresa;
    equipoData  = listaEquipo;

    // Determinar si el usuario actual es admin ANTES de renderizar
    // Analogia: verificar el carnet antes de abrir la puerta, no después
    // Marcar cuál es el usuario actual y detectar si es admin
    listaEquipo.forEach(function(u) {
      u.es_yo = usuarioActual && u.id === usuarioActual.id;
    });
    const yo = listaEquipo.find(function(u){ return u.es_yo; });
    esAdmin  = !!(yo && yo.rol === "admin") || (usuarioActual && usuarioActual.rol === "admin");

    renderPlanCard(infoEmpresa);   // usa esAdmin ya seteado
    renderEquipoTabla(listaEquipo);

    // Mostrar botón de invitar solo al admin
    var btnInvitar = document.getElementById("btnInvitarUsuario");
    if (btnInvitar) btnInvitar.style.display = esAdmin ? "flex" : "none";

    // Mostrar columna de acciones solo al admin
    var colAcciones = document.getElementById("equipoColAcciones");
    if (colAcciones) colAcciones.style.display = esAdmin ? "table-cell" : "none";

    // Mostrar badge "Admin" en sidebar si es admin
    var badge = document.getElementById("equipoBadge");
    if (badge) badge.style.display = esAdmin ? "inline-block" : "none";

    // Subtítulo con nombre del negocio y cantidad de usuarios
    var sub = document.getElementById("equipoSubtitulo");
    if (sub) sub.textContent = infoEmpresa.nombre + " · " + listaEquipo.length + " usuario(s)";

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

  if (planNombre) planNombre.textContent = info.plan === "pro" ? "🔵 Pro" : "🟢 Básico";

  if (planDetalle) {
    var esFundador = info.plan_es_fundador ? " · Precio fundador 🎉" : "";
    var precio     = info.plan_precio > 0  ? " · $" + info.plan_precio.toLocaleString("es-CL") + "/mes" : "";
    planDetalle.textContent = (info.plan === "pro"
      ? "Hasta 3 usuarios · 1.500 productos · Reportes avanzados"
      : "1 usuario · Hasta 200 productos · Reportes básicos")
      + precio + esFundador;
  }

  if (usersActual) usersActual.textContent = info.total_usuarios;
  if (usersMax)    usersMax.textContent    = info.max_usuarios;
  if (prodsActual) prodsActual.textContent = info.total_productos;
  if (prodsMax)    prodsMax.textContent    = info.max_productos > 0
    ? " / " + info.max_productos
    : " (ilimitados)";

  // Mostrar botón cambiar plan siempre para admins — tanto para subir como para bajar
  if (btnUpgrade) {
    if (esAdmin) {
      btnUpgrade.style.display = "flex";
      btnUpgrade.textContent   = info.plan === "pro" ? "🔄 Cambiar Plan" : "⬆️ Mejorar a Pro";
    } else {
      btnUpgrade.style.display = "none";
    }
  }

  // Botón cancelar / reactivar suscripción
  var btnCancelar = document.getElementById("btnCancelarSuscripcion");
  if (btnCancelar) {
    if (info.esta_cancelado) {
      btnCancelar.textContent         = "🔄 Reactivar suscripción";
      btnCancelar.style.background    = "var(--verde)";
      btnCancelar.style.color         = "#000";
      btnCancelar.onclick             = reactivarSuscripcion;
      // Mostrar aviso de estado cancelado
      var avisoCancel = document.getElementById("avisoCancelacion");
      if (avisoCancel) {
        var fecha = info.gracia_hasta
          ? new Date(info.gracia_hasta).toLocaleDateString("es-CL")
          : "—";
        avisoCancel.style.display = "block";
        avisoCancel.innerHTML = info.en_gracia
          ? "⚠️ Suscripción cancelada · Acceso de solo lectura hasta el <strong>" + fecha + "</strong>"
          : "🔴 Suscripción cancelada · Acceso bloqueado el <strong>" + fecha + "</strong>";
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

  tbody.innerHTML = usuarios.map(function(u) {
    // Badge de rol
    var rolBadge = u.rol === "admin"
      ? "<span style='background:rgba(91,142,255,0.15);color:var(--azul);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>🔑 Admin</span>"
      : "<span style='background:rgba(0,199,123,0.1);color:var(--verde);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>👷 Operador</span>";

    // Badge de estado
    var estadoBadge = u.activo
      ? "<span style='background:rgba(0,199,123,0.1);color:var(--verde);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>● Activo</span>"
      : "<span style='background:rgba(255,80,80,0.1);color:var(--rojo);font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px'>● Inactivo</span>";

    // Iniciales del avatar
    var partes   = u.nombre.split(" ");
    var iniciales = partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : u.nombre.slice(0,2).toUpperCase();

    // Fecha de ingreso
    var fecha = u.created_at
      ? new Date(u.created_at).toLocaleDateString("es-CL", {day:"2-digit",month:"short",year:"numeric"})
      : "—";

    // Botones de acciones — solo si es admin y no es el mismo usuario
    var acciones = "";
    if (esAdmin && !u.es_yo) {
      var btnRol = u.rol === "admin"
        ? "<button onclick='cambiarRolUsuario(" + u.id + ",\"operador\")' style='background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--muted);font-size:12px;cursor:pointer' title='Cambiar a Operador'>→ Operador</button>"
        : "<button onclick='cambiarRolUsuario(" + u.id + ",\"admin\")' style='background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--muted);font-size:12px;cursor:pointer' title='Cambiar a Admin'>→ Admin</button>";

      var btnEstado = u.activo
        ? "<button onclick='desactivarUsuario(" + u.id + ",\"" + u.nombre.replace(/"/g,"'") + "\")' style='background:none;border:1px solid rgba(255,80,80,0.3);border-radius:7px;padding:5px 10px;color:var(--rojo);font-size:12px;cursor:pointer'>Desactivar</button>"
        : "<button onclick='activarUsuario(" + u.id + ",\"" + u.nombre.replace(/"/g,"'") + "\")' style='background:none;border:1px solid rgba(0,199,123,0.3);border-radius:7px;padding:5px 10px;color:var(--verde);font-size:12px;cursor:pointer'>Activar</button>";

      acciones = "<td style='text-align:center'><div style='display:flex;gap:6px;justify-content:center'>" + btnRol + btnEstado + "</div></td>";
    } else if (esAdmin && u.es_yo) {
      acciones = "<td style='text-align:center'><span style='font-size:11px;color:var(--muted)'>Tú</span></td>";
    } else {
      acciones = "<td></td>";
    }

    // Resaltar fila del usuario actual
    var esYoStyle = u.es_yo ? "background:rgba(0,199,123,0.04)" : "";

    return "<tr style='" + esYoStyle + "'>"
      + "<td style='padding-left:20px'>"
      +   "<div style='display:flex;align-items:center;gap:10px'>"
      +     "<div style='width:34px;height:34px;border-radius:50%;background:var(--verde);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:13px;font-weight:800;color:#000;flex-shrink:0'>" + iniciales + "</div>"
      +     "<div style='font-weight:600;font-size:14px'>" + u.nombre + (u.es_yo ? " <span style='font-size:11px;color:var(--muted)'>(tú)</span>" : "") + "</div>"
      +   "</div>"
      + "</td>"
      + "<td style='color:var(--muted);font-size:13px'>" + u.email + "</td>"
      + "<td>" + rolBadge + "</td>"
      + "<td>" + estadoBadge + "</td>"
      + "<td style='color:var(--muted);font-size:12px'>" + fecha + "</td>"
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
  if (empresaInfo) {
    var nomEmp = document.getElementById("invitarEmpresaNombre");
    if (nomEmp) nomEmp.textContent = empresaInfo.nombre;
  }
}

function cerrarModalInvitar() {
  document.getElementById("modalInvitar").classList.remove("open");
}

async function guardarInvitacion() {
  var nombre   = document.getElementById("invitarNombre").value.trim();
  var email    = document.getElementById("invitarEmail").value.trim();
  var password = document.getElementById("invitarPassword").value.trim();
  var rol      = document.getElementById("invitarRol").value;

  if (!nombre || !email || !password) { showToast("Completa todos los campos obligatorios"); return; }
  if (password.length < 8) { showToast("La contraseña debe tener al menos 8 caracteres"); return; }

  var btn = document.querySelector("#modalInvitar .btn-primary");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  try {
    // Analogia: llenar el formulario de contratación y enviarlo a RRHH
    await api("/empresa/invitar?nombre=" + encodeURIComponent(nombre) + "&email=" + encodeURIComponent(email) + "&password=" + encodeURIComponent(password) + "&rol=" + rol, "POST");
    showToast("✅ " + nombre + " agregado al equipo");
    cerrarModalInvitar();
    await cargarEquipo();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "✓ Agregar al equipo"; }
    showToast("❌ " + (e.message || "Error al invitar usuario"));
  }
}

/* ============================================================
   ACCIONES — Cambiar rol, activar y desactivar usuarios
   Analogia: el gerente moviendo fichas en el organigrama
   ============================================================ */
async function cambiarRolUsuario(usuarioId, nuevoRol) {
  var usuario  = equipoData.find(function(u){ return u.id === usuarioId; });
  var nombre   = usuario ? usuario.nombre : "usuario";
  var rolLabel = nuevoRol === "admin" ? "Admin" : "Operador";
  if (!confirm("¿Cambiar a " + nombre + " a " + rolLabel + "?")) return;

  try {
    await api("/empresa/usuarios/" + usuarioId + "/rol?rol=" + nuevoRol, "PATCH");
    showToast("✅ Rol de " + nombre + " actualizado a " + rolLabel);
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + (e.message || "No se pudo cambiar el rol"));
  }
}

async function desactivarUsuario(usuarioId, nombre) {
  if (!confirm("¿Desactivar acceso de " + nombre + "? Podrás reactivarlo después.")) return;

  try {
    await api("/empresa/usuarios/" + usuarioId + "/estado?activo=false", "PATCH");
    showToast("✅ " + nombre + " desactivado");
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + (e.message || "No se pudo desactivar"));
  }
}

async function activarUsuario(usuarioId, nombre) {
  try {
    await api("/empresa/usuarios/" + usuarioId + "/estado?activo=true", "PATCH");
    showToast("✅ " + nombre + " reactivado");
    await cargarEquipo();
  } catch (e) {
    showToast("❌ " + (e.message || "No se pudo activar"));
  }
}

/* ============================================================
   MODAL — Cambio de plan automático
   Analogia: como un menú de membresías donde haces clic
   en la que quieres y el cambio ocurre al instante,
   sin llamar a nadie ni enviar correos
   ============================================================ */

var planSeleccionado = null;   // "basico" o "pro"

function abrirModalUpgrade() {
  planSeleccionado = null;

  // Marcar el plan actual como activo visualmente
  var planActual = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  _resaltarPlanActual(planActual);

  // Resetear botón y mensaje
  var btn = document.getElementById("btnConfirmarPlan");
  var msg = document.getElementById("upgradeMensaje");
  if (btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.textContent = "Selecciona un plan para continuar"; }
  if (msg) msg.style.display = "none";

  document.getElementById("modalUpgrade").classList.add("open");
}

function _resaltarPlanActual(plan) {
  // Resaltar visualmente el plan actual con borde verde
  var cardBasico = document.getElementById("cardPlanBasico");
  var cardPro    = document.getElementById("cardPlanPro");
  if (!cardBasico || !cardPro) return;

  if (plan === "basico") {
    cardBasico.style.border = "2px solid var(--verde)";
    cardBasico.style.background = "rgba(0,199,123,0.05)";
    cardPro.style.border = "2px solid var(--border)";
    cardPro.style.background = "";
  } else {
    cardPro.style.border = "2px solid var(--azul)";
    cardPro.style.background = "rgba(91,142,255,0.04)";
    cardBasico.style.border = "2px solid var(--border)";
    cardBasico.style.background = "";
  }
}

function seleccionarPlan(plan) {
  // Analogia: elegir una opción del menú — resalta la seleccionada
  var planActual = empresaInfo ? (empresaInfo.plan || "basico") : "basico";
  planSeleccionado = plan;

  var cardBasico = document.getElementById("cardPlanBasico");
  var cardPro    = document.getElementById("cardPlanPro");
  var btn        = document.getElementById("btnConfirmarPlan");
  var msg        = document.getElementById("upgradeMensaje");

  // Resaltar la tarjeta seleccionada
  if (plan === "basico") {
    cardBasico.style.border = "3px solid var(--verde)";
    cardBasico.style.background = "rgba(0,199,123,0.08)";
    cardPro.style.border = "2px solid var(--border)";
    cardPro.style.background = "";
  } else {
    cardPro.style.border = "3px solid var(--azul)";
    cardPro.style.background = "rgba(91,142,255,0.08)";
    cardBasico.style.border = "2px solid var(--border)";
    cardBasico.style.background = "";
  }

  // Ocultar mensaje de error anterior
  if (msg) msg.style.display = "none";

  // Actualizar botón
  if (btn) {
    if (plan === planActual) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.textContent = "✓ Este es tu plan actual";
    } else if (plan === "pro") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "⬆️ Subir a Plan Pro — $29.990/mes";
    } else {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "⬇️ Bajar a Plan Básico — $14.990/mes";
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
    var resultado = await api("/empresa/cambiar-plan?nuevo_plan=" + planSeleccionado, "PATCH");

    showToast("✅ Plan cambiado a " + planSeleccionado + " correctamente");
    cerrarModalUpgrade();

    // Recargar pantalla de equipo para reflejar el nuevo plan
    await cargarEquipo();

  } catch (e) {
    // Mostrar error inline sin cerrar el modal
    if (msg) {
      msg.style.display = "block";
      msg.style.background = "rgba(255,80,80,0.1)";
      msg.style.border = "1px solid rgba(255,80,80,0.3)";
      msg.style.color = "var(--rojo)";
      msg.textContent = "⚠️ " + (e.message || "No se pudo cambiar el plan");
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