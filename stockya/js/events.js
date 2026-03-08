/**
 * ============================================================
 * YEPARSTOCK — Archivo: js/events.js
 * Descripcion: Todos los event listeners de la app.
 *              Separados del HTML para cumplir con CSP strict
 *              (sin 'unsafe-inline' en script-src).
 *
 * Analogia: antes los botones tenían instrucciones pegadas
 * con cinta (onclick="..."). Ahora hay un recepcionista central
 * (este archivo) que sabe qué hacer cuando cada botón es presionado.
 *
 * Se ejecuta despues de que el DOM está listo (DOMContentLoaded).
 * Todos los getElementById deben existir en index.html.
 * ============================================================
 */

document.addEventListener('DOMContentLoaded', function () {

  // ── HELPER: obtener elemento por ID (con advertencia si no existe) ──
  // Analogia: es como un asistente que busca al empleado por nombre
  // y te avisa si no lo encuentra, en vez de crashear en silencio.
  function el(id) {
    var e = document.getElementById(id);
    if (!e) console.warn('[events.js] Elemento no encontrado: #' + id);
    return e;
  }

  // ── HELPER: obtener todos los elementos por selector ──
  function els(selector) {
    return document.querySelectorAll(selector);
  }

  // ============================================================
  // LOGIN — Panel principal
  // ============================================================

  // Botón "Entrar al negocio"
  var btnEntrar = document.querySelector('#panelLogin .btn-primary');
  if (btnEntrar) btnEntrar.addEventListener('click', function () { enterApp(); });

  // Link "¿Olvidaste tu contraseña?"
  var linkOlvide = document.querySelector('#panelLogin span[style*="azul"]');
  if (linkOlvide) linkOlvide.addEventListener('click', function () { mostrarOlvidePass(); });

  // Botón "Crear cuenta gratis"
  var btnCrearCuenta = document.querySelector('#panelLogin .btn-secondary');
  if (btnCrearCuenta) btnCrearCuenta.addEventListener('click', function () { mostrarRegistro(); });

  // ── Login con Enter en campos de email/password ──
  var loginUsername = el('loginUsername');
  var loginPassword = el('loginPassword');
  if (loginUsername) loginUsername.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') enterApp();
  });
  if (loginPassword) loginPassword.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') enterApp();
  });

  // ============================================================
  // REGISTRO — Panel de registro
  // ============================================================

  // Campo contraseña — evaluar fortaleza
  var regPassword = el('regPassword');
  if (regPassword) regPassword.addEventListener('input', function () {
    evaluarFuerzaPassword(this.value);
  });

  // Botón "Crear cuenta →"
  var btnRegistrar = document.querySelector('#panelRegistro .btn-primary');
  if (btnRegistrar) btnRegistrar.addEventListener('click', function () { registrarUsuario(); });

  // Botón "← Volver al login"
  var btnVolverLogin = document.querySelector('#panelRegistro .btn-secondary');
  if (btnVolverLogin) btnVolverLogin.addEventListener('click', function () { mostrarLogin(); });

  // ============================================================
  // VERIFICACIÓN DE EMAIL — Código de 6 dígitos
  // ============================================================

  // Inputs del código de verificación (6 cajas)
  var codigoInputs = el('codigoInputs');
  if (codigoInputs) {
    var inputsVerifi = codigoInputs.querySelectorAll('input');
    inputsVerifi.forEach(function (input, i) {
      input.addEventListener('input', function () { avanzarCodigo(this, i); });
    });
  }

  // Botón "Verificar cuenta"
  var btnVerificar = document.querySelector('#panelVerificacion .btn-primary');
  if (btnVerificar) btnVerificar.addEventListener('click', function () { confirmarVerificacion(); });

  // Link "Reenviar código"
  var linkReenviar = document.querySelector('#panelVerificacion span[style*="azul"]');
  if (linkReenviar) linkReenviar.addEventListener('click', function () { reenviarCodigo(); });

  // ============================================================
  // RECUPERAR CONTRASEÑA — Paso 1 (email)
  // ============================================================

  // Botón "Enviar código →"
  var btnEnviarCodigo = document.querySelector('#panelOlvideEmail .btn-primary');
  if (btnEnviarCodigo) btnEnviarCodigo.addEventListener('click', function () { solicitarReset(); });

  // Botón "← Volver al login" (en panel olvidé)
  var btnVolverLoginOlvide = document.querySelector('#panelOlvideEmail .btn-secondary');
  if (btnVolverLoginOlvide) btnVolverLoginOlvide.addEventListener('click', function () { mostrarLogin(); });

  // ============================================================
  // RECUPERAR CONTRASEÑA — Paso 2 (código + nueva pass)
  // ============================================================

  // Inputs del código reset (6 cajas)
  var resetCodigoInputs = el('resetCodigoInputs');
  if (resetCodigoInputs) {
    var inputsReset = resetCodigoInputs.querySelectorAll('input');
    inputsReset.forEach(function (input, i) {
      input.addEventListener('input', function () { avanzarCodigoReset(this, i); });
    });
  }

  // Botón "🔐 Cambiar contraseña"
  var btnCambiarPass = document.querySelector('#panelOlvideCodigo .btn-primary');
  if (btnCambiarPass) btnCambiarPass.addEventListener('click', function () { confirmarReset(); });

  // Link "Reenviar código" (en paso 2)
  var linkReenviarReset = document.querySelector('#panelOlvideCodigo span[style*="azul"]');
  if (linkReenviarReset) linkReenviarReset.addEventListener('click', function () { solicitarReset(); });

  // ============================================================
  // ONBOARDING
  // ============================================================

  // Preview logo (clic en el div preview)
  var onboardingLogoPreview = el('onboardingLogoPreview');
  var onboardingLogoFile    = el('onboardingLogoFile');
  if (onboardingLogoPreview && onboardingLogoFile) {
    onboardingLogoPreview.addEventListener('click', function () { onboardingLogoFile.click(); });
  }

  // Input file onboarding
  if (onboardingLogoFile) {
    onboardingLogoFile.addEventListener('change', function (e) { onboardingPreviewLogo(e); });
  }

  // Botón "Subir logo" (en onboarding)
  var btnSubirLogoOnboarding = document.querySelector('#onboardingPage button[type="button"]');
  if (btnSubirLogoOnboarding && onboardingLogoFile) {
    btnSubirLogoOnboarding.addEventListener('click', function () { onboardingLogoFile.click(); });
  }

  // Botón "✓ Entrar a mi negocio"
  var btnGuardarOnboarding = el('btnGuardarOnboarding');
  if (btnGuardarOnboarding) btnGuardarOnboarding.addEventListener('click', function () { guardarOnboarding(); });

  // ============================================================
  // PANTALLA DE BLOQUEO
  // ============================================================

  var pantallaBloqueo = el('pantallaBloqueo');
  if (pantallaBloqueo) {
    var btnsBloqueo = pantallaBloqueo.querySelectorAll('button');
    if (btnsBloqueo[0]) btnsBloqueo[0].addEventListener('click', function () { reactivarSuscripcion(); });
    if (btnsBloqueo[1]) btnsBloqueo[1].addEventListener('click', function () { cerrarSesion(); });
  }

  // ============================================================
  // APP PRINCIPAL — Botón hamburguesa y backdrop
  // ============================================================

  var mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', function () { toggleSidebar(); });

  var backdrop = el('backdrop');
  if (backdrop) backdrop.addEventListener('click', function () { toggleSidebar(); });

  // ── Logo del sidebar — onerror ──
  var sidebarLogo = document.querySelector('.logo-block img');
  if (sidebarLogo) sidebarLogo.addEventListener('error', function () { this.style.display = 'none'; });

  // ============================================================
  // SIDEBAR — Navegación
  // ============================================================

  // Botones de nav (ya tienen IDs: nav-dashboard, nav-productos, etc.)
  var navItems = [
    { id: 'nav-dashboard',   screen: 'dashboard' },
    { id: 'nav-productos',   screen: 'productos' },
    { id: 'nav-stock',       screen: 'stock' },
    { id: 'nav-movimientos', screen: 'movimientos' },
    { id: 'nav-salidas',     screen: 'salidas' },
    { id: 'nav-alertas',     screen: 'alertas' },
    { id: 'nav-reportes',    screen: 'reportes' },
    { id: 'nav-fiados',      screen: 'fiados' },
    { id: 'nav-sucursales',  screen: 'sucursales' },
    { id: 'nav-equipo',      screen: 'equipo' },
    { id: 'nav-settings',    screen: 'settings' },
  ];
  navItems.forEach(function (item) {
    var btn = el(item.id);
    if (btn) btn.addEventListener('click', function () { showScreen(item.screen); });
  });

  // Toggle tema (oscuro/claro)
  var themeToggleRow = document.querySelector('.theme-toggle-row');
  if (themeToggleRow) themeToggleRow.addEventListener('click', function () { toggleTema(); });

  // Botón cerrar sesión (sidebar)
  var logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { cerrarSesion(); });

  // ============================================================
  // DASHBOARD
  // ============================================================

  var dashNuevaVenta  = document.querySelector('#screen-dashboard .btn-primary[style*="azul"]');
  var dashNuevoIngreso = document.querySelector('#screen-dashboard .btn-primary:not([style*="azul"])');
  if (dashNuevaVenta)   dashNuevaVenta.addEventListener('click',   function () { abrirModalSalida('venta'); });
  if (dashNuevoIngreso) dashNuevoIngreso.addEventListener('click', function () { openModalMovimiento(); });

  // Link "ver todas →" en alertas del dashboard
  var dashVerTodas = document.querySelector('#screen-dashboard .card-title span[style*="cursor:pointer"]');
  if (dashVerTodas) dashVerTodas.addEventListener('click', function () { showScreen('alertas'); });

  // ============================================================
  // PRODUCTOS
  // ============================================================

  var prodNuevoIngreso = document.querySelector('#screen-productos .btn-primary');
  if (prodNuevoIngreso) prodNuevoIngreso.addEventListener('click', function () { openModalMovimiento(); });

  var prodBuscar = el('prodBuscar');
  if (prodBuscar) prodBuscar.addEventListener('input', function () { filtrarProductos(); });

  var prodCategoria = el('prodCategoria');
  if (prodCategoria) prodCategoria.addEventListener('change', function () { filtrarProductos(); });

  var prodEstado = el('prodEstado');
  if (prodEstado) prodEstado.addEventListener('change', function () { filtrarProductos(); });

  // ============================================================
  // STOCK
  // ============================================================

  var stockNuevoIngreso = document.querySelector('#screen-stock .btn-primary');
  if (stockNuevoIngreso) stockNuevoIngreso.addEventListener('click', function () { openModalMovimiento(); });

  var stockBuscar = el('stockBuscar');
  if (stockBuscar) stockBuscar.addEventListener('input', function () { filtrarStock(); });

  var stockCategoria = el('stockCategoria');
  if (stockCategoria) stockCategoria.addEventListener('change', function () { filtrarStock(); });

  var stockEstado = el('stockEstado');
  if (stockEstado) stockEstado.addEventListener('change', function () { filtrarStock(); });

  // ============================================================
  // MOVIMIENTOS
  // ============================================================

  var movBuscar = el('movBuscar');
  if (movBuscar) movBuscar.addEventListener('input', function () { filtrarMovimientos(); });

  var movBuscarCodigo = el('movBuscarCodigo');
  if (movBuscarCodigo) movBuscarCodigo.addEventListener('input', function () { filtrarMovimientos(); });

  var movFiltroTipo = el('movFiltroTipo');
  if (movFiltroTipo) movFiltroTipo.addEventListener('change', function () { filtrarMovimientos(); });

  var movFiltroCategoria = el('movFiltroCategoria');
  if (movFiltroCategoria) movFiltroCategoria.addEventListener('change', function () { filtrarMovimientos(); });

  var movFiltroDesde = el('movFiltroDesde');
  if (movFiltroDesde) movFiltroDesde.addEventListener('change', function () { filtrarMovimientos(); });

  var movFiltroHasta = el('movFiltroHasta');
  if (movFiltroHasta) movFiltroHasta.addEventListener('change', function () { filtrarMovimientos(); });

  // ============================================================
  // SALIDAS
  // ============================================================

  var salidaBtns = document.querySelectorAll('#screen-salidas .page-header button');
  salidaBtns.forEach(function (btn) {
    if (btn.textContent.includes('venta')) {
      btn.addEventListener('click', function () { abrirModalSalida('venta'); });
    } else if (btn.textContent.includes('merma')) {
      btn.addEventListener('click', function () { abrirModalSalida('merma'); });
    }
  });

  var salidaBuscar = el('salidaBuscar');
  if (salidaBuscar) salidaBuscar.addEventListener('input', function () { filtrarSalidas(); });

  var salidaFiltroTipo = el('salidaFiltroTipo');
  if (salidaFiltroTipo) salidaFiltroTipo.addEventListener('change', function () { filtrarSalidas(); });

  var salidaFiltroEstado = el('salidaFiltroEstado');
  if (salidaFiltroEstado) salidaFiltroEstado.addEventListener('change', function () { filtrarSalidas(); });

  var salidaFiltroDesde = el('salidaFiltroDesde');
  if (salidaFiltroDesde) salidaFiltroDesde.addEventListener('change', function () { filtrarSalidas(); });

  var salidaFiltroHasta = el('salidaFiltroHasta');
  if (salidaFiltroHasta) salidaFiltroHasta.addEventListener('change', function () { filtrarSalidas(); });

  // ============================================================
  // ALERTAS
  // ============================================================

  var btnMarcarVistas = document.querySelector('#screen-alertas .btn-secondary');
  if (btnMarcarVistas) btnMarcarVistas.addEventListener('click', function () {
    showToast('✓ Marcadas como revisadas');
  });

  // ============================================================
  // REPORTES
  // ============================================================

  var reportePeriodo = el('reportePeriodo');
  if (reportePeriodo) reportePeriodo.addEventListener('change', function () { cargarReportes(); });

  var reporteDesde = el('reporteDesde');
  if (reporteDesde) reporteDesde.addEventListener('change', function () { cargarReportes(); });

  var reporteHasta = el('reporteHasta');
  if (reporteHasta) reporteHasta.addEventListener('change', function () { cargarReportes(); });

  // Botón "Filtrar →" rango custom
  var btnFiltrarReporte = document.querySelector('#reporteRangoCustom button');
  if (btnFiltrarReporte) btnFiltrarReporte.addEventListener('click', function () { cargarReportes(); });

  // Botones exportación Pro
  var btnExcelBtn = document.querySelector('#botonesExportPro button:nth-child(1)');
  var btnPdfBtn   = document.querySelector('#botonesExportPro button:nth-child(2)');
  var btnEmailBtn = document.querySelector('#botonesExportPro button:nth-child(3)');
  if (btnExcelBtn) btnExcelBtn.addEventListener('click', function () { exportarExcel(); });
  if (btnPdfBtn)   btnPdfBtn.addEventListener('click',   function () { exportarPDF(); });
  if (btnEmailBtn) btnEmailBtn.addEventListener('click', function () { enviarReportePorEmail(); });

  // Botón "Ver planes →" en banner upgrade
  var btnVerPlanes = document.querySelector('#bannerUpgradePro button');
  if (btnVerPlanes) btnVerPlanes.addEventListener('click', function () { showScreen('equipo'); });

  // ============================================================
  // FIADOS / DEUDORES
  // ============================================================

  var fiadosBuscar = el('fiadosBuscar');
  if (fiadosBuscar) fiadosBuscar.addEventListener('input', function () { filtrarFiados(); });

  // Botones de filtro fiados (usan data-estado)
  var fiadoFiltros = document.querySelectorAll('.fiado-filtro');
  fiadoFiltros.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setFiltroFiado(this, this.getAttribute('data-estado'));
    });
  });

  // ============================================================
  // EQUIPO
  // ============================================================

  var btnInvitarColaborador = el('btnInvitarColaborador');
  if (btnInvitarColaborador) btnInvitarColaborador.addEventListener('click', function () { abrirModalInvitar(); });

  var btnUpgradePlan = el('btnUpgradePlan');
  if (btnUpgradePlan) btnUpgradePlan.addEventListener('click', function () { abrirModalUpgrade(); });

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================

  // Botones guardar/descartar (header y footer)
  var settingsBtns = document.querySelectorAll('#screen-settings .btn-primary');
  settingsBtns.forEach(function (btn) {
    btn.addEventListener('click', function () { guardarConfiguracion(); });
  });
  var btnDescartar = document.querySelector('#screen-settings .btn-secondary');
  if (btnDescartar) btnDescartar.addEventListener('click', function () { descartarCambios(); });

  // Logo — subir, pegar URL, quitar
  var inputLogo    = el('inputLogo');
  var btnSubirLogo = document.querySelector('#screen-settings .settings-logo-info .btn-secondary:nth-child(1)');
  var btnPegarUrl  = document.querySelector('#screen-settings .settings-logo-info .btn-secondary:nth-child(2)');
  var btnQuitarLogo = document.querySelector('#screen-settings .settings-logo-info .btn-secondary:nth-child(3)');

  if (inputLogo) inputLogo.addEventListener('change', function (e) { previewLogo(e); });
  if (btnSubirLogo) btnSubirLogo.addEventListener('click', function () {
    if (inputLogo) inputLogo.click();
  });
  if (btnPegarUrl)   btnPegarUrl.addEventListener('click',   function () { toggleInputUrlLogo(); });
  if (btnQuitarLogo) btnQuitarLogo.addEventListener('click', function () { quitarLogo(); });

  // Input URL logo
  var inputLogoUrl = el('inputLogoUrl');
  if (inputLogoUrl) inputLogoUrl.addEventListener('input', function () { previewLogoUrl(this.value); });

  // Botón "✓ Aplicar" URL logo
  var btnAplicarLogoUrl = document.querySelector('#logoUrlWrap .btn-secondary');
  if (btnAplicarLogoUrl) btnAplicarLogoUrl.addEventListener('click', function () { aplicarLogoUrl(); });

  // Color principal
  var inputColor = el('inputColor');
  if (inputColor) inputColor.addEventListener('input', function () { previsualizarColor(this.value); });

  var inputColorHex = el('inputColorHex');
  if (inputColorHex) inputColorHex.addEventListener('input', function () { sincronizarColor(this.value); });

  // Color colaborador
  var colabColor = el('colabColor');
  if (colabColor) colabColor.addEventListener('input', function () { previsualizarColor(this.value); });

  // Botón guardar colaborador — usa el footer único #btnGuardarSettingsFooter

  // Contraseñas — botones "ojo"
  var eyeBtns = document.querySelectorAll('.settings-eye-btn');
  eyeBtns.forEach(function (btn) {
    // Determinar a qué input corresponde por posición en el DOM
    var passInput = btn.previousElementSibling;
    if (passInput) {
      btn.addEventListener('click', function () { togglePass(passInput.id, btn); });
    }
  });

  // Nueva contraseña — fortaleza
  var inputPassNueva = el('inputPassNueva');
  if (inputPassNueva) inputPassNueva.addEventListener('input', function () {
    evaluarFuerzaPassword(this.value);
  });

  // Sonidos del escáner — labels con data-sound
  var soundOptions = document.querySelectorAll('.sound-option');
  soundOptions.forEach(function (label) {
    var sound = label.getAttribute('data-sound');
    // Clic en el label → seleccionar sonido
    label.addEventListener('click', function () {
      seleccionarSonido(sound, this);
    });
    // Botón "▶ Probar" dentro del label
    var previewBtn = label.querySelector('.sound-preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // no disparar el click del label
        _beepPreview(sound);
      });
    }
  });

  // ============================================================
  // MODAL: Agregar producto rápido
  // ============================================================

  var modalAgregarClose = document.querySelector('#modalAgregar .modal-close');
  if (modalAgregarClose) modalAgregarClose.addEventListener('click', function () { closeModal(); });

  var btnCancelarAgregar = document.querySelector('#modalAgregar .btn-secondary');
  if (btnCancelarAgregar) btnCancelarAgregar.addEventListener('click', function () { closeModal(); });

  var btnSaveProductoRapido = el('btnSaveProductoRapido');
  if (btnSaveProductoRapido) btnSaveProductoRapido.addEventListener('click', function () { saveProductRapido(); });

  // ============================================================
  // MODAL: Nuevo Ingreso
  // ============================================================

  var modalMovClose = document.querySelector('#modalMovimiento .modal-close');
  if (modalMovClose) modalMovClose.addEventListener('click', function () { closeModalMovimiento(); });

  // Botón cerrar cámara ingreso
  var btnCerrarEscanerIngreso = document.querySelector('#escanerIngresoVisor button');
  if (btnCerrarEscanerIngreso) btnCerrarEscanerIngreso.addEventListener('click', function () { cerrarEscanerIngreso(); });

  // Input búsqueda ingreso
  var movCodigoBuscar = el('movCodigoBuscar');
  if (movCodigoBuscar) {
    movCodigoBuscar.addEventListener('input', function () { buscarProductoIngreso(this.value, false); });
    movCodigoBuscar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); agregarAlIngresoCarrito(); }
    });
  }

  // Botón cámara ingreso
  var btnAbrirEscanerIngreso = document.querySelector('#ingresoScrollArea > div:nth-child(2) button');
  if (btnAbrirEscanerIngreso) btnAbrirEscanerIngreso.addEventListener('click', function () { abrirEscanerIngreso(); });

  // Botones qty ingreso (− y +)
  var btnQtyIngresoMenos = document.querySelector('#ingresoChip button:nth-of-type(1)');
  var btnQtyIngresoMas   = document.querySelector('#ingresoChip button:nth-of-type(2)');
  if (btnQtyIngresoMenos) btnQtyIngresoMenos.addEventListener('click', function () { cambiarQtyIngreso(-1); });
  if (btnQtyIngresoMas)   btnQtyIngresoMas.addEventListener('click',   function () { cambiarQtyIngreso(1); });

  // Precio compra y porcentaje en chip ingreso
  var movPrecioCompra = el('movPrecioCompra');
  if (movPrecioCompra) movPrecioCompra.addEventListener('input', function () { calcularPrecioVentaChip(); });

  var movPorcentajeChip = el('movPorcentajeChip');
  if (movPorcentajeChip) movPorcentajeChip.addEventListener('input', function () { calcularPrecioVentaChip(); });

  // Botón "+ Agregar" en chip ingreso
  var btnAgregarAlIngreso = document.querySelector('#ingresoChip button[type="button"]:last-of-type');
  if (btnAgregarAlIngreso) btnAgregarAlIngreso.addEventListener('click', function () { agregarAlIngresoCarrito(); });

  // Select producto ingreso
  var movProductoId = el('movProductoId');
  if (movProductoId) movProductoId.addEventListener('change', function () { onProductoIngresoSeleccionado(); });

  // Botones confirmar / cancelar ingreso
  var btnCancelarIngreso  = document.querySelector('#modalMovimiento .form-actions .btn-secondary');
  var btnConfirmarIngreso = el('btnConfirmarIngreso');
  if (btnCancelarIngreso)  btnCancelarIngreso.addEventListener('click',  function () { closeModalMovimiento(); });
  if (btnConfirmarIngreso) btnConfirmarIngreso.addEventListener('click', function () { guardarMovimiento(); });

  // ============================================================
  // MODAL: Editar producto
  // ============================================================

  var modalEditarClose = document.querySelector('#modalEditar .modal-close');
  if (modalEditarClose) modalEditarClose.addEventListener('click', function () { cerrarModalEditar(); });

  var editPrecioCompra = el('editPrecioCompra');
  if (editPrecioCompra) editPrecioCompra.addEventListener('input', function () { calcularPrecioVentaEditar(); });

  var editPorcentaje = el('editPorcentaje');
  if (editPorcentaje) editPorcentaje.addEventListener('input', function () { calcularPrecioVentaEditar(); });

  var btnCancelarEditar  = document.querySelector('#modalEditar .btn-secondary');
  var btnGuardarEdicion  = document.querySelector('#modalEditar .btn-primary');
  if (btnCancelarEditar) btnCancelarEditar.addEventListener('click', function () { cerrarModalEditar(); });
  if (btnGuardarEdicion) btnGuardarEdicion.addEventListener('click', function () { guardarEdicion(); });

  // ============================================================
  // MODAL: Eliminar producto
  // ============================================================

  var btnCancelarEliminar  = document.querySelector('#modalEliminar .btn-secondary');
  var btnConfirmarEliminar = document.querySelector('#modalEliminar .btn-primary');
  if (btnCancelarEliminar)  btnCancelarEliminar.addEventListener('click',  function () { cerrarModalEliminar(); });
  if (btnConfirmarEliminar) btnConfirmarEliminar.addEventListener('click', function () { confirmarEliminar(); });

  // ============================================================
  // MODAL: Carrito de ventas (modalSalida)
  // ============================================================

  var modalSalidaClose = document.querySelector('#modalSalida .modal-close');
  if (modalSalidaClose) modalSalidaClose.addEventListener('click', function () { cerrarModalSalida(); });

  // Input búsqueda salida
  var salidaCodigoBarra = el('salidaCodigoBarra');
  if (salidaCodigoBarra) {
    salidaCodigoBarra.addEventListener('input', function () { buscarProductoSalida(this.value); });
    salidaCodigoBarra.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); agregarAlCarrito(); }
    });
  }

  // Botón cámara salida
  var btnAbrirEscanerSalida = document.querySelector('#scanBox button[type="button"]');
  if (btnAbrirEscanerSalida) btnAbrirEscanerSalida.addEventListener('click', function () { abrirEscanerSalida(); });

  // Qty venta (− y +)
  var btnQtyVentaMenos = document.querySelector('#productoChip button:nth-of-type(1)');
  var btnQtyVentaMas   = document.querySelector('#productoChip button:nth-of-type(2)');
  if (btnQtyVentaMenos) btnQtyVentaMenos.addEventListener('click', function () { cambiarQtyVenta(-1); });
  if (btnQtyVentaMas)   btnQtyVentaMas.addEventListener('click',   function () { cambiarQtyVenta(1); });

  var salidaCantidad = el('salidaCantidad');
  if (salidaCantidad) salidaCantidad.addEventListener('input', function () { calcularTotalVenta(); });

  var salidaPrecioUnitario = el('salidaPrecioUnitario');
  if (salidaPrecioUnitario) salidaPrecioUnitario.addEventListener('input', function () { calcularTotalVenta(); });

  // Botón "+ Agregar" en chip venta
  var btnAgregarAlCarrito = document.getElementById('btnAgregarCarrito');
  if (btnAgregarAlCarrito) btnAgregarAlCarrito.addEventListener('click', function () { agregarAlCarrito(); });

  // Select producto salida
  var salidaProductoId = el('salidaProductoId');
  if (salidaProductoId) salidaProductoId.addEventListener('change', function () { onProductoSeleccionado(); });

  // Campo cliente
  var salidaCliente = el('salidaCliente');
  if (salidaCliente) salidaCliente.addEventListener('input', function () { onClienteInput(); });

  // Div "👤 Cliente Genérico"
  var btnClienteGenerico = document.querySelector('#modalSalida [style*="Cliente Genérico"], #modalSalida div[onclick]');
  // Buscar por texto
  var todosLosDivs = document.querySelectorAll('#modalSalida div');
  todosLosDivs.forEach(function (div) {
    if (div.textContent.trim().includes('Cliente Genérico') && div.style.cursor === 'pointer') {
      div.addEventListener('click', function () { usarClienteGenerico(); });
    }
  });

  // Botones método de pago principales
  var metodoPagoBtns = document.querySelectorAll('#metodoPagoGrid .metodo-pago-btn');
  metodoPagoBtns.forEach(function (btn) {
    var metodo = btn.getAttribute('data-metodo');
    btn.addEventListener('click', function () { seleccionarMetodoPago(metodo); });
  });

  // Sub-botones de tarjeta (débito / crédito)
  var tarjetaBtns = document.querySelectorAll('#tarjetaSubModal .metodo-pago-btn');
  tarjetaBtns.forEach(function (btn) {
    var subtipo = btn.getAttribute('data-subtipo');
    btn.addEventListener('click', function () { seleccionarMetodoPago('tarjeta', subtipo); });
  });

  // Inputs pago mixto
  var mixtoInputIds = ['mixtoEfectivo', 'mixtoDebito', 'mixtoCredito', 'mixtoTransferencia'];
  mixtoInputIds.forEach(function (id) {
    var input = el(id);
    if (input) input.addEventListener('input', function () { calcularMixtoRestante(); });
  });

  // Botones confirmar / cancelar venta
  var btnCancelarVenta  = document.querySelector('#modalSalida .form-actions .btn-secondary');
  var btnConfirmarVenta = el('btnConfirmarVenta');
  if (btnCancelarVenta)  btnCancelarVenta.addEventListener('click',  function () { cerrarModalSalida(); });
  if (btnConfirmarVenta) btnConfirmarVenta.addEventListener('click', function () { guardarSalida(); });

  // ============================================================
  // MODAL: Resolver cuarentena
  // ============================================================

  var modalResolucionClose = document.querySelector('#modalResolucion .modal-close');
  if (modalResolucionClose) modalResolucionClose.addEventListener('click', function () { cerrarModalResolucion(); });

  var btnCancelarResolucion  = document.querySelector('#modalResolucion .btn-secondary');
  var btnConfirmarResolucion = document.querySelector('#modalResolucion .btn-primary');
  if (btnCancelarResolucion)  btnCancelarResolucion.addEventListener('click',  function () { cerrarModalResolucion(); });
  if (btnConfirmarResolucion) btnConfirmarResolucion.addEventListener('click', function () { guardarResolucion(); });

  // ============================================================
  // MODAL: Cambio de plan (modalUpgrade)
  // ============================================================

  var modalUpgradeClose = document.querySelector('#modalUpgrade .modal-close');
  if (modalUpgradeClose) modalUpgradeClose.addEventListener('click', function () { cerrarModalUpgrade(); });

  // Cards de planes (usan id: cardPlanGratis, cardPlanBasico, cardPlanPro)
  var planCards = [
    { id: 'cardPlanGratis', plan: 'gratis' },
    { id: 'cardPlanBasico', plan: 'basico' },
    { id: 'cardPlanPro',    plan: 'pro' },
  ];
  planCards.forEach(function (item) {
    var card = el(item.id);
    if (card) card.addEventListener('click', function () { seleccionarPlan(item.plan); });
  });

  var btnConfirmarPlan = el('btnConfirmarPlan');
  if (btnConfirmarPlan) btnConfirmarPlan.addEventListener('click', function () { confirmarCambioPlan(); });

  var btnCancelarSuscripcionModal = el('btnCancelarSuscripcionModal');
  if (btnCancelarSuscripcionModal) btnCancelarSuscripcionModal.addEventListener('click', function () {
    cerrarModalUpgrade();
    cancelarSuscripcion();
  });

  // ============================================================
  // MODAL: Invitar usuario al equipo
  // ============================================================

  var modalInvitarClose = document.querySelector('#modalInvitar .modal-close');
  if (modalInvitarClose) modalInvitarClose.addEventListener('click', function () { cerrarModalInvitar(); });

  var btnCancelarInvitar  = document.querySelector('#modalInvitar .btn-secondary');
  var btnGuardarInvitacion = document.querySelector('#modalInvitar .btn-primary');
  if (btnCancelarInvitar)   btnCancelarInvitar.addEventListener('click',   function () { cerrarModalInvitar(); });
  if (btnGuardarInvitacion) btnGuardarInvitacion.addEventListener('click', function () { guardarInvitacion(); });

  // ============================================================
  // FIN — Todos los listeners registrados
  // ============================================================
  console.log('[events.js] ✅ Todos los event listeners registrados correctamente.');

}); // fin DOMContentLoaded
