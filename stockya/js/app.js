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
