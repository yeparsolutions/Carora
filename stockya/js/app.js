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
   Parámetro: name → 'dashboard' | 'productos' | 'movimientos' | 'alertas' | 'reportes'
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

  // Limpiar el formulario cada vez que se abre
  document.getElementById('formProducto').reset();
}

function closeModal() {
  document.getElementById('modalAgregar').classList.remove('open');
}

// Cerrar modal al hacer clic en el fondo oscuro (fuera del box)
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
  // Leer valores del formulario
  const nombre   = document.getElementById('inputNombre').value.trim();
  const stockVal = document.getElementById('inputStock').value;

  // Validación básica — campo nombre obligatorio
  if (!nombre) {
    showToast('⚠️ El nombre del producto es obligatorio');
    return;
  }

  // Validación básica — stock no puede ser negativo
  if (stockVal && parseInt(stockVal) < 0) {
    showToast('⚠️ El stock no puede ser negativo');
    return;
  }

  // TODO en producción:
  // fetch('/api/productos', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ nombre, stock: stockVal, ... })
  // })

  closeModal();
  showToast('✅ Producto guardado correctamente');
}


/* ----------------------------
   filterMov(btn, type)
   Filtra la tabla de movimientos por tipo
   Parámetro type: 'all' | 'entrada' | 'salida'
---------------------------- */
function filterMov(btn, type) {
  // Actualizar estilos visuales de los tabs
  document.querySelectorAll('.mov-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  // Mostrar u ocultar filas según el tipo
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

  // Mostrar
  toast.classList.add('show');

  // Ocultar automáticamente después de 2.5s
  setTimeout(() => toast.classList.remove('show'), 2500);
}


/* ----------------------------
   calcularEstadoStock(stock, minimo)
   Retorna 'critico' | 'alerta' | 'ok' según los niveles
   Regla:
     - crítico: stock < mínimo
     - alerta:  stock < mínimo * 1.5
     - ok:      el resto
---------------------------- */
function calcularEstadoStock(stock, minimo) {
  if (stock < minimo)          return 'critico';
  if (stock < minimo * 1.5)    return 'alerta';
  return 'ok';
}


/* ----------------------------
   calcularPorcentajeStock(stock, minimo)
   Retorna un porcentaje visual para la barra de stock
   Máximo visual = mínimo * 5 para no mostrar barras gigantes
---------------------------- */
function calcularPorcentajeStock(stock, minimo) {
  const maximo = minimo * 5; // Referencia de "stock ideal"
  return Math.min(Math.round((stock / maximo) * 100), 100);
}


/* ----------------------------
   ESTADO DE CONFIGURACIÓN
   Objeto que guarda temporalmente los cambios del usuario
   hasta que presiona "Guardar". 
   Analogía: es un borrador antes de enviar el correo.
---------------------------- */
let configTemporal = {
  negocio:  "",
  usuario:  "",
  email:    "",
  moneda:   "CLP",
  color:    "#00C77B",
  logoData: null  // Base64 de la imagen subida
};


/* ----------------------------
   previewLogo(event)
   Muestra una vista previa del logo seleccionado
   sin necesidad de guardar aún.
   El FileReader es como un "escáner" que convierte
   la imagen a un formato que entiende el navegador.
---------------------------- */
function previewLogo(event) {
  const archivo = event.target.files[0];

  // Validar que se seleccionó un archivo
  if (!archivo) return;

  // Validar tipo de archivo (solo imágenes)
  if (!archivo.type.startsWith('image/')) {
    showToast('Solo se permiten imágenes (PNG, JPG, SVG)');
    return;
  }

  // Validar tamaño máximo (2MB = 2 * 1024 * 1024 bytes)
  const maxSize = 2 * 1024 * 1024;
  if (archivo.size > maxSize) {
    showToast('El logo no puede superar 2MB');
    return;
  }

  // Leer el archivo como Base64 para mostrarlo en el navegador
  const reader = new FileReader();

  reader.onload = function(e) {
    const base64 = e.target.result;

    // Guardar en estado temporal
    configTemporal.logoData = base64;

    // Mostrar la imagen y ocultar las iniciales
    const img       = document.getElementById('logoImg');
    const initials  = document.getElementById('logoInitials');

    img.src             = base64;
    img.style.display   = 'block';
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

  // Ocultar imagen y mostrar iniciales
  const img      = document.getElementById('logoImg');
  const initials = document.getElementById('logoInitials');

  img.src              = '';
  img.style.display    = 'none';
  initials.style.display = 'flex';

  // Limpiar el input file para permitir subir la misma imagen después
  document.getElementById('inputLogo').value = '';

  showToast('Logo eliminado');
}


/* ----------------------------
   previsualizarColor(hex)
   Cambia el color principal de la app EN TIEMPO REAL
   al mover el selector de color.
   Analogía: como cambiar el color de la pintura mientras
   aún tienes el pincel en la mano — ves el resultado de inmediato.
---------------------------- */
function previsualizarColor(hex) {
  // Actualizar la variable CSS global que controla el color de toda la app
  document.documentElement.style.setProperty('--verde', hex);

  // Calcular un tono más oscuro para el hover (restar ~20 de luminosidad)
  document.documentElement.style.setProperty('--verde-dark', ajustarBrillo(hex, -20));

  // Actualizar el glow con opacidad
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  document.documentElement.style.setProperty('--verde-glow', `rgba(${r},${g},${b},0.18)`);

  // Sincronizar el input de texto hex
  document.getElementById('inputColorHex').value = hex;

  // Guardar en estado temporal
  configTemporal.color = hex;
}


/* ----------------------------
   sincronizarColor(hex)
   Cuando el usuario escribe un hex en el campo de texto,
   actualiza el color picker y aplica el cambio.
---------------------------- */
function sincronizarColor(hex) {
  // Solo procesar si es un hex válido (# + 6 caracteres)
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById('inputColor').value = hex;
    previsualizarColor(hex);
  }
}


/* ----------------------------
   ajustarBrillo(hex, cantidad)
   Función auxiliar para oscurecer o aclarar un color hex.
   Parámetro cantidad: negativo = oscurece, positivo = aclara
---------------------------- */
function ajustarBrillo(hex, cantidad) {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1,3), 16) + cantidad));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3,5), 16) + cantidad));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5,7), 16) + cantidad));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}


/* ----------------------------
   evaluarFuerzaPassword(pass)
   Muestra la barra de fuerza de contraseña mientras el usuario escribe.
   Criterios:
     - Débil:   menos de 8 caracteres o solo letras/números
     - Media:   8+ chars con mayúsculas o números
     - Fuerte:  8+ chars con mayúsculas, números Y símbolos
---------------------------- */
function evaluarFuerzaPassword(pass) {
  const wrap  = document.getElementById('passStrengthWrap');
  const fill  = document.getElementById('passStrengthFill');
  const label = document.getElementById('passStrengthLabel');

  // Ocultar si el campo está vacío
  if (!pass) {
    wrap.style.display = 'none';
    return;
  }

  wrap.style.display = 'flex';

  // Calcular puntuación de fuerza
  let puntos = 0;
  if (pass.length >= 8)                    puntos++; // Largo mínimo
  if (pass.length >= 12)                   puntos++; // Largo ideal
  if (/[A-Z]/.test(pass))                  puntos++; // Tiene mayúsculas
  if (/[0-9]/.test(pass))                  puntos++; // Tiene números
  if (/[^A-Za-z0-9]/.test(pass))           puntos++; // Tiene símbolos

  // Aplicar estilos según fuerza
  if (puntos <= 2) {
    fill.style.width      = '33%';
    fill.style.background = 'var(--rojo)';
    label.textContent     = 'Débil';
    label.style.color     = 'var(--rojo)';
  } else if (puntos <= 3) {
    fill.style.width      = '66%';
    fill.style.background = 'var(--amarillo)';
    label.textContent     = 'Media';
    label.style.color     = 'var(--amarillo)';
  } else {
    fill.style.width      = '100%';
    fill.style.background = 'var(--verde)';
    label.textContent     = 'Fuerte';
    label.style.color     = 'var(--verde)';
  }
}


/* ----------------------------
   togglePass(inputId, btn)
   Muestra u oculta la contraseña en un campo.
   Alterna entre type="password" y type="text"
---------------------------- */
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const esOculto = input.type === 'password';

  input.type  = esOculto ? 'text' : 'password';
  btn.textContent = esOculto ? '🙈' : '👁️';
}


/* ----------------------------
   guardarConfiguracion()
   Recopila todos los valores del formulario,
   los valida y los aplica a la app.
   En producción: aquí irá el fetch() al backend.
---------------------------- */
function guardarConfiguracion() {
  // Leer valores del formulario
  const negocio  = document.getElementById('inputNegocio').value.trim();
  const usuario  = document.getElementById('inputNombreUsuario').value.trim();
  const email    = document.getElementById('inputEmail').value.trim();
  const moneda   = document.getElementById('inputMoneda').value;
  const passActual  = document.getElementById('inputPassActual').value;
  const passNueva   = document.getElementById('inputPassNueva').value;
  const passConfirm = document.getElementById('inputPassConfirm').value;

  // --- Validaciones ---

  if (!negocio) {
    showToast('El nombre del negocio es obligatorio');
    return;
  }

  if (!usuario) {
    showToast('El nombre de usuario es obligatorio');
    return;
  }

  // Validar contraseña solo si el usuario escribió algo
  if (passNueva || passConfirm) {
    if (!passActual) {
      showToast('Debes ingresar tu contraseña actual');
      return;
    }
    if (passNueva.length < 8) {
      showToast('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (passNueva !== passConfirm) {
      showToast('Las contraseñas nuevas no coinciden');
      return;
    }
  }

  // --- Aplicar cambios a la interfaz en tiempo real ---

  // Actualizar nombre del negocio en el dashboard
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

  // Actualizar nombre en el sidebar footer
  const sidebarNombre = document.querySelector('.user-name');
  if (sidebarNombre) sidebarNombre.textContent = usuario;

  // Actualizar iniciales del avatar
  const avatar = document.querySelector('.avatar');
  if (avatar) {
    const partes   = usuario.split(' ');
    const iniciales = partes.length >= 2
      ? partes[0][0] + partes[1][0]
      : partes[0].slice(0, 2);
    avatar.textContent = iniciales.toUpperCase();
  }

  // Actualizar iniciales del logo preview en settings
  const logoInitials = document.getElementById('logoInitials');
  if (logoInitials) {
    const partes = negocio.split(' ');
    logoInitials.textContent = partes.length >= 2
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : negocio.slice(0, 2).toUpperCase();
  }

  // Guardar en estado
  configTemporal = { negocio, usuario, email, moneda, color: configTemporal.color, logoData: configTemporal.logoData };

  // TODO en producción:
  // fetch('/api/configuracion', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(configTemporal)
  // }).then(r => r.json()).then(data => console.log('Guardado:', data));

  showToast('Configuración guardada correctamente');

  // Limpiar campos de contraseña por seguridad
  document.getElementById('inputPassActual').value  = '';
  document.getElementById('inputPassNueva').value   = '';
  document.getElementById('inputPassConfirm').value = '';
  document.getElementById('passStrengthWrap').style.display = 'none';
}


/* ----------------------------
   descartarCambios()
   Restaura los campos al último valor guardado.
   En producción: recargaría los datos del servidor.
---------------------------- */
function descartarCambios() {
  // Restaurar color original si fue cambiado
  previsualizarColor(configTemporal.color || '#00C77B');

  // Limpiar campos de contraseña
  document.getElementById('inputPassActual').value  = '';
  document.getElementById('inputPassNueva').value   = '';
  document.getElementById('inputPassConfirm').value = '';
  document.getElementById('passStrengthWrap').style.display = 'none';

  showToast('Cambios descartados');
}