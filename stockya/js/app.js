/* ============================================================
   STOCKYA — Lógica principal de la interfaz
   Archivo: js/app.js
   Descripción: Navegación, modales, filtros y notificaciones
   ============================================================ */


/* ----------------------------
   DATOS DE EJEMPLO (simulando base de datos)
   En producción esto vendrá del backend Python + API
---------------------------- */
const productosData = [
  { id: 1, nombre: "Leche entera 1L",        codigo: "LAC-001", categoria: "Lácteos",     stock: 2,  minimo: 20, precioVenta: 1190 },
  { id: 2, nombre: "Coca-Cola 1.5L",         codigo: "BEB-003", categoria: "Bebestibles", stock: 34, minimo: 10, precioVenta: 1490 },
  { id: 3, nombre: "Pan de molde grande",    codigo: "PAN-002", categoria: "Panadería",   stock: 1,  minimo: 10, precioVenta: 2290 },
  { id: 4, nombre: "Jugo Natural One 1L",    codigo: "BEB-011", categoria: "Bebestibles", stock: 8,  minimo: 15, precioVenta: 1990 },
  { id: 5, nombre: "Arroz largo 1kg",        codigo: "GRA-005", categoria: "Granos",      stock: 62, minimo: 15, precioVenta: 1350 },
  { id: 6, nombre: "Agua mineral 500ml",     codigo: "BEB-001", categoria: "Bebestibles", stock: 86, minimo: 20, precioVenta: 450  },
];

const movimientosData = [
  { producto: "Agua mineral 500ml",  tipo: "entrada", cantidad: 24, stockAnterior: 62, stockNuevo: 86, fecha: "Hoy 09:42",  usuario: "Juan R." },
  { producto: "Leche entera 1L",     tipo: "salida",  cantidad: 6,  stockAnterior: 8,  stockNuevo: 2,  fecha: "Hoy 08:15",  usuario: "Juan R." },
  { producto: "Coca-Cola 1.5L",      tipo: "salida",  cantidad: 12, stockAnterior: 46, stockNuevo: 34, fecha: "Ayer 18:30", usuario: "María G." },
  { producto: "Arroz largo 1kg",     tipo: "entrada", cantidad: 30, stockAnterior: 32, stockNuevo: 62, fecha: "Ayer 14:00", usuario: "Juan R." },
  { producto: "Pan de molde grande", tipo: "salida",  cantidad: 8,  stockAnterior: 9,  stockNuevo: 1,  fecha: "Ayer 11:20", usuario: "Juan R." },
  { producto: "Aceite vegetal 1L",   tipo: "entrada", cantidad: 12, stockAnterior: 4,  stockNuevo: 16, fecha: "Lun 10:05",  usuario: "María G." },
];


/* ----------------------------
   enterApp()
   Oculta la pantalla de login y muestra la app
---------------------------- */
function enterApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appMain').style.display   = 'flex';
}


/* ----------------------------
   showScreen(name)
   Cambia entre pantallas y actualiza el nav activo
   Parámetro: name → 'dashboard' | 'productos' | 'movimientos' | 'alertas' | 'reportes' | 'settings'
---------------------------- */
function showScreen(name) {
  // 1. Ocultar todas las pantallas
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // 2. Mostrar solo la pantalla solicitada
  document.getElementById('screen-' + name).classList.add('active');

  // 3. Actualizar ítem activo en la navegación
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + name).classList.add('active');

  // 4. Cerrar sidebar en pantallas pequeñas (móvil)
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}


/* ----------------------------
   toggleSidebar() / closeSidebar()
   Controla el menú en versión móvil
---------------------------- */
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('backdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('backdrop').classList.remove('open');
}


/* ----------------------------
   openModal() / closeModal()
   Controla el modal de agregar producto
---------------------------- */
function openModal() {
  document.getElementById('modalAgregar').classList.add('open');
  document.getElementById('formProducto').reset();
}

function closeModal() {
  document.getElementById('modalAgregar').classList.remove('open');
}

// Cerrar modal al hacer clic en el fondo oscuro
document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('modalAgregar').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
});


/* ----------------------------
   saveProduct()
   Simula guardar un producto nuevo
   En producción: hará POST /api/productos con fetch()
---------------------------- */
function saveProduct() {
  const nombre   = document.getElementById('inputNombre').value.trim();
  const stockVal = document.getElementById('inputStock').value;

  // Validación básica — nombre obligatorio
  if (!nombre) {
    showToast('El nombre del producto es obligatorio');
    return;
  }

  // Validación básica — stock no negativo
  if (stockVal && parseInt(stockVal) < 0) {
    showToast('El stock no puede ser negativo');
    return;
  }

  // TODO en producción:
  // fetch('/api/productos', { method: 'POST', ... })

  closeModal();
  showToast('Producto guardado correctamente');
}


/* ----------------------------
   filterMov(btn, type)
   Filtra la tabla de movimientos por tipo
   Parámetro type: 'all' | 'entrada' | 'salida'
---------------------------- */
function filterMov(btn, type) {
  document.querySelectorAll('.mov-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('#movTableBody tr').forEach(row => {
    const mostrar = (type === 'all') || (row.dataset.type === type);
    row.style.display = mostrar ? '' : 'none';
  });
}


/* ----------------------------
   showToast(msg)
   Muestra una notificación temporal en la esquina inferior derecha
   Desaparece automáticamente a los 2.5 segundos
---------------------------- */
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}


/* ----------------------------
   calcularEstadoStock(stock, minimo)
   Retorna 'critico' | 'alerta' | 'ok' según los niveles
---------------------------- */
function calcularEstadoStock(stock, minimo) {
  if (stock < minimo)        return 'critico';
  if (stock < minimo * 1.5)  return 'alerta';
  return 'ok';
}


/* ----------------------------
   calcularPorcentajeStock(stock, minimo)
   Retorna un porcentaje visual para la barra de stock
---------------------------- */
function calcularPorcentajeStock(stock, minimo) {
  const maximo = minimo * 5;
  return Math.min(Math.round((stock / maximo) * 100), 100);
}


/* ============================================================
   CONFIGURACIÓN — Settings
   ============================================================ */

/* ----------------------------
   ESTADO DE CONFIGURACIÓN
   Objeto que guarda temporalmente los cambios del usuario
   Analogía: es un borrador antes de enviar el correo.
---------------------------- */
let configTemporal = {
  negocio:  "",
  usuario:  "",
  email:    "",
  moneda:   "CLP",
  color:    "#00C77B",
  logoData: null
};


/* ----------------------------
   previewLogo(event)
   Muestra vista previa del logo usando FileReader
   FileReader = escáner que convierte imagen a Base64
---------------------------- */
function previewLogo(event) {
  const archivo = event.target.files[0];
  if (!archivo) return;

  if (!archivo.type.startsWith('image/')) {
    showToast('Solo se permiten imágenes (PNG, JPG, SVG)');
    return;
  }

  const maxSize = 2 * 1024 * 1024;
  if (archivo.size > maxSize) {
    showToast('El logo no puede superar 2MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    configTemporal.logoData = base64;

    const img      = document.getElementById('logoImg');
    const initials = document.getElementById('logoInitials');
    img.src                = base64;
    img.style.display      = 'block';
    initials.style.display = 'none';

    showToast('Logo cargado — recuerda guardar los cambios');
  };
  reader.readAsDataURL(archivo);
}


/* ----------------------------
   quitarLogo()
   Restaura el estado sin logo (muestra las iniciales)
---------------------------- */
function quitarLogo() {
  configTemporal.logoData = null;

  const img      = document.getElementById('logoImg');
  const initials = document.getElementById('logoInitials');
  img.src                = '';
  img.style.display      = 'none';
  initials.style.display = 'flex';

  document.getElementById('inputLogo').value = '';
  showToast('Logo eliminado');
}


/* ----------------------------
   previsualizarColor(hex)
   Cambia el color principal EN TIEMPO REAL
   Analogía: pincel en mano — ves el resultado de inmediato
---------------------------- */
function previsualizarColor(hex) {
  document.documentElement.style.setProperty('--verde', hex);
  document.documentElement.style.setProperty('--verde-dark', ajustarBrillo(hex, -20));

  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  document.documentElement.style.setProperty('--verde-glow', `rgba(${r},${g},${b},0.18)`);

  document.getElementById('inputColorHex').value = hex;
  configTemporal.color = hex;
}


/* ----------------------------
   sincronizarColor(hex)
   Sincroniza el input de texto con el color picker
---------------------------- */
function sincronizarColor(hex) {
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById('inputColor').value = hex;
    previsualizarColor(hex);
  }
}


/* ----------------------------
   ajustarBrillo(hex, cantidad)
   Oscurece o aclara un color hex
   Negativo = oscurece, positivo = aclara
---------------------------- */
function ajustarBrillo(hex, cantidad) {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1,3), 16) + cantidad));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3,5), 16) + cantidad));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5,7), 16) + cantidad));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}


/* ----------------------------
   evaluarFuerzaPassword(pass)
   Barra de fuerza: débil / media / fuerte
   Analogía: medidor de combustible del auto
---------------------------- */
function evaluarFuerzaPassword(pass) {
  const wrap  = document.getElementById('passStrengthWrap');
  const fill  = document.getElementById('passStrengthFill');
  const label = document.getElementById('passStrengthLabel');

  if (!pass) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';

  let puntos = 0;
  if (pass.length >= 8)           puntos++;
  if (pass.length >= 12)          puntos++;
  if (/[A-Z]/.test(pass))         puntos++;
  if (/[0-9]/.test(pass))         puntos++;
  if (/[^A-Za-z0-9]/.test(pass))  puntos++;

  if (puntos <= 2) {
    fill.style.width = '33%'; fill.style.background = 'var(--rojo)';
    label.textContent = 'Débil'; label.style.color = 'var(--rojo)';
  } else if (puntos <= 3) {
    fill.style.width = '66%'; fill.style.background = 'var(--amarillo)';
    label.textContent = 'Media'; label.style.color = 'var(--amarillo)';
  } else {
    fill.style.width = '100%'; fill.style.background = 'var(--verde)';
    label.textContent = 'Fuerte'; label.style.color = 'var(--verde)';
  }
}


/* ----------------------------
   togglePass(inputId, btn)
   Muestra u oculta contraseña
   Alterna entre type="password" y type="text"
---------------------------- */
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const esOculto = input.type === 'password';
  input.type = esOculto ? 'text' : 'password';
  btn.textContent = esOculto ? '🙈' : '👁️';
}


/* ----------------------------
   guardarConfiguracion()
   Valida y aplica todos los cambios a la interfaz
   En producción: aquí irá el fetch() al backend
---------------------------- */
function guardarConfiguracion() {
  const negocio     = document.getElementById('inputNegocio').value.trim();
  const usuario     = document.getElementById('inputNombreUsuario').value.trim();
  const email       = document.getElementById('inputEmail').value.trim();
  const moneda      = document.getElementById('inputMoneda').value;
  const passActual  = document.getElementById('inputPassActual').value;
  const passNueva   = document.getElementById('inputPassNueva').value;
  const passConfirm = document.getElementById('inputPassConfirm').value;

  if (!negocio) { showToast('El nombre del negocio es obligatorio'); return; }
  if (!usuario) { showToast('El nombre de usuario es obligatorio'); return; }

  if (passNueva || passConfirm) {
    if (!passActual) { showToast('Debes ingresar tu contraseña actual'); return; }
    if (passNueva.length < 8) { showToast('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (passNueva !== passConfirm) { showToast('Las contraseñas nuevas no coinciden'); return; }
  }

  // Actualizar nombre negocio en el dashboard
  const subtitleDashboard = document.querySelector('#screen-dashboard .page-subtitle');
  if (subtitleDashboard) {
    const fechaActual = subtitleDashboard.textContent.split('·')[0].trim();
    subtitleDashboard.textContent = `${fechaActual} · ${negocio}`;
  }

  // Actualizar saludo del dashboard
  const saludo = document.querySelector('#screen-dashboard .page-title');
  if (saludo) {
    const primerNombre = usuario.split(' ')[0];
    saludo.textContent = `Buen día, ${primerNombre} 👋`;
  }

  // Actualizar nombre en sidebar
  const sidebarNombre = document.querySelector('.user-name');
  if (sidebarNombre) sidebarNombre.textContent = usuario;

  // Actualizar iniciales del avatar
  const avatar = document.querySelector('.avatar');
  if (avatar) {
    const partes    = usuario.split(' ');
    const iniciales = partes.length >= 2 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2);
    avatar.textContent = iniciales.toUpperCase();
  }

  // Actualizar iniciales del logo preview
  const logoInitials = document.getElementById('logoInitials');
  if (logoInitials) {
    const partes = negocio.split(' ');
    logoInitials.textContent = partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : negocio.slice(0, 2).toUpperCase();
  }

  configTemporal = { negocio, usuario, email, moneda, color: configTemporal.color, logoData: configTemporal.logoData };

  // TODO en producción:
  // fetch('/api/configuracion', { method: 'POST', body: JSON.stringify(configTemporal) })

  showToast('Configuración guardada correctamente');

  // Limpiar campos contraseña por seguridad
  document.getElementById('inputPassActual').value  = '';
  document.getElementById('inputPassNueva').value   = '';
  document.getElementById('inputPassConfirm').value = '';
  document.getElementById('passStrengthWrap').style.display = 'none';
}


/* ----------------------------
   descartarCambios()
   Restaura los campos al último valor guardado
---------------------------- */
function descartarCambios() {
  previsualizarColor(configTemporal.color || '#00C77B');
  document.getElementById('inputPassActual').value  = '';
  document.getElementById('inputPassNueva').value   = '';
  document.getElementById('inputPassConfirm').value = '';
  document.getElementById('passStrengthWrap').style.display = 'none';
  showToast('Cambios descartados');
}


/* ============================================================
   TEMA CLARO / OSCURO
   ============================================================ */

/* ----------------------------
   toggleTema()
   Alterna entre tema oscuro y tema claro.
   Analogía: interruptor de luz de la habitación —
   un clic y todo el ambiente cambia.
   Agrega/quita la clase .tema-claro al <body>
   y el CSS se encarga del resto automáticamente.
---------------------------- */
function toggleTema() {
  const body     = document.body;
  const label    = document.getElementById('themeLabel');
  const switchEl = document.getElementById('themeSwitch');

  const estaClaro = body.classList.contains('tema-claro');

  if (estaClaro) {
    // Cambiar a oscuro
    body.classList.remove('tema-claro');
    label.textContent = '🌙 Tema oscuro';
    switchEl.classList.remove('activo');
  } else {
    // Cambiar a claro
    body.classList.add('tema-claro');
    label.textContent = '☀️ Tema claro';
    switchEl.classList.add('activo');
  }
}
