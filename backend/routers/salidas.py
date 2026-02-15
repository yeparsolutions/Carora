# ============================================================
# STOCKYA - Router de Salidas
# Archivo: backend/routers/salidas.py
# Descripcion: Gestiona ventas, mermas, cuarentenas y
#              devoluciones a proveedor con escaneo de codigo
# Analogia: el "libro de egresos" dinamico de la bodega
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/salidas", tags=["Salidas"])


# ============================================================
# TIPOS Y ESTADOS VALIDOS
# ============================================================

TIPOS_VALIDOS = ["venta", "merma", "cuarentena", "devolucion_proveedor"]

# Estados validos para transicion desde cuarentena
ESTADOS_RESOLUCION = ["reingresado", "descartado", "enviado_proveedor"]

# Mapa de estado inicial segun tipo de salida
# Analogia: cuando un producto sale, ya sabe a que "sala" va
ESTADO_INICIAL = {
    "venta":                "activo",
    "merma":                "activo",
    "cuarentena":           "en_revision",   # <- el unico que queda pendiente
    "devolucion_proveedor": "activo",
}


# ============================================================
# FUNCION AUXILIAR: convertir salida a dict seguro
# ============================================================

def salida_a_dict(s) -> dict:
    """Convierte objeto Salida a dict incluyendo nombres de relaciones."""
    return {
        "id":                       s.id,
        "producto_id":              s.producto_id,
        "usuario_id":               s.usuario_id,
        "cantidad":                 s.cantidad,
        "stock_anterior":           s.stock_anterior,
        "stock_nuevo":              s.stock_nuevo,
        "tipo_salida":              s.tipo_salida.value if hasattr(s.tipo_salida, 'value') else s.tipo_salida,
        "motivo":                   s.motivo,
        "numero_documento":         s.numero_documento,
        "codigo_barra_scan":        s.codigo_barra_scan,
        "precio_unitario":          s.precio_unitario or 0.0,
        "valor_total":              s.valor_total or 0.0,
        "estado":                   s.estado.value if hasattr(s.estado, 'value') else s.estado,
        "estado_anterior":          s.estado_anterior,
        "resolucion_nota":          s.resolucion_nota,
        "resolucion_at":            s.resolucion_at,
        "lote":                     s.lote,
        "fecha_vencimiento":        s.fecha_vencimiento,
        "created_at":               s.created_at,
        "updated_at":               s.updated_at,
        "producto_nombre":          s.producto.nombre if s.producto else None,
        "usuario_nombre":           s.usuario.nombre if s.usuario else None,
        "resolucion_usuario_nombre": s.resolucion_usuario.nombre if s.resolucion_usuario else None,
    }


# ============================================================
# POST /salidas/scan
# Registrar salida escaneando codigo de barras
# Para uso con pistola lectora o camara del celular
# ============================================================

@router.post("/scan", response_model=schemas.SalidaRespuesta, status_code=201)
def registrar_salida_por_scan(
    datos: schemas.SalidaPorScan,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Registra una salida escaneando el codigo de barras.
    Analogia: el cajero pasa el producto por el laser,
    elige 'venta', pone cantidad 1, y listo.
    Ideal para pistola lectora o camara del celular.
    """
    # Buscar el producto por codigo de barras
    producto = db.query(models.Producto).filter(
        models.Producto.codigo_barra == datos.codigo_barra,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(
            status_code=404,
            detail=f"Producto con codigo '{datos.codigo_barra}' no encontrado"
        )

    # Validar tipo de salida
    if datos.tipo_salida not in TIPOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo invalido. Debe ser: {', '.join(TIPOS_VALIDOS)}"
        )

    # Validar stock disponible
    if datos.cantidad > producto.stock_actual:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Disponible: {producto.stock_actual} unidades"
        )

    # Calcular valores
    stock_anterior  = producto.stock_actual
    stock_nuevo     = stock_anterior - datos.cantidad
    precio_unit     = datos.precio_unitario or producto.precio_venta or 0.0
    valor_total     = precio_unit * datos.cantidad
    estado_inicial  = ESTADO_INICIAL[datos.tipo_salida]

    # Descontar del stock
    producto.stock_actual = stock_nuevo

    # Registrar la salida
    salida = models.Salida(
        producto_id         = producto.id,
        usuario_id          = usuario_actual.id,
        cantidad            = datos.cantidad,
        stock_anterior      = stock_anterior,
        stock_nuevo         = stock_nuevo,
        tipo_salida         = datos.tipo_salida,
        motivo              = datos.motivo,
        numero_documento    = datos.numero_documento,
        codigo_barra_scan   = datos.codigo_barra,
        precio_unitario     = precio_unit,
        valor_total         = valor_total,
        estado              = estado_inicial,
        lote                = producto.lote,
        fecha_vencimiento   = producto.fecha_vencimiento,
    )
    db.add(salida)

    # Registrar tambien en movimientos para mantener historial unificado
    movimiento = models.Movimiento(
        producto_id     = producto.id,
        usuario_id      = usuario_actual.id,
        tipo            = "salida",
        cantidad        = datos.cantidad,
        stock_anterior  = stock_anterior,
        stock_nuevo     = stock_nuevo,
        nota            = f"{datos.tipo_salida.upper()}: {datos.motivo or 'sin nota'} (scan)",
        lote            = producto.lote,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(salida)

    return salida_a_dict(salida)


# ============================================================
# POST /salidas
# Registrar salida manualmente (por ID de producto)
# ============================================================

@router.post("/", response_model=schemas.SalidaRespuesta, status_code=201)
def registrar_salida(
    datos: schemas.SalidaCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Registra una salida manualmente indicando el producto_id.
    Analogia: el bodeguero que anota en el libro de egresos
    por que salio el producto y cuanto.
    """
    # Validar tipo
    if datos.tipo_salida not in TIPOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo invalido. Debe ser: {', '.join(TIPOS_VALIDOS)}"
        )

    # Buscar producto
    producto = db.query(models.Producto).filter(
        models.Producto.id == datos.producto_id,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if datos.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    # Validar stock
    if datos.cantidad > producto.stock_actual:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Disponible: {producto.stock_actual} unidades"
        )

    # Calcular
    stock_anterior  = producto.stock_actual
    stock_nuevo     = stock_anterior - datos.cantidad
    precio_unit     = datos.precio_unitario or producto.precio_venta or 0.0
    valor_total     = precio_unit * datos.cantidad
    estado_inicial  = ESTADO_INICIAL[datos.tipo_salida]

    # Descontar stock
    producto.stock_actual = stock_nuevo

    # Crear salida
    salida = models.Salida(
        producto_id         = producto.id,
        usuario_id          = usuario_actual.id,
        cantidad            = datos.cantidad,
        stock_anterior      = stock_anterior,
        stock_nuevo         = stock_nuevo,
        tipo_salida         = datos.tipo_salida,
        motivo              = datos.motivo,
        numero_documento    = datos.numero_documento,
        codigo_barra_scan   = datos.codigo_barra_scan,
        precio_unitario     = precio_unit,
        valor_total         = valor_total,
        estado              = estado_inicial,
        lote                = datos.lote or producto.lote,
        fecha_vencimiento   = datos.fecha_vencimiento or producto.fecha_vencimiento,
    )
    db.add(salida)

    # Registrar en movimientos (historial unificado)
    movimiento = models.Movimiento(
        producto_id     = producto.id,
        usuario_id      = usuario_actual.id,
        tipo            = "salida",
        cantidad        = datos.cantidad,
        stock_anterior  = stock_anterior,
        stock_nuevo     = stock_nuevo,
        nota            = f"{datos.tipo_salida.upper()}: {datos.motivo or 'sin nota'}",
        lote            = datos.lote or producto.lote,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(salida)

    return salida_a_dict(salida)


# ============================================================
# GET /salidas
# Listar salidas con filtros
# ============================================================

@router.get("/", response_model=List[schemas.SalidaRespuesta])
def listar_salidas(
    tipo_salida:    Optional[str] = None,   # venta | merma | cuarentena | devolucion_proveedor
    estado:         Optional[str] = None,   # activo | en_revision | reingresado | descartado | enviado_proveedor
    buscar:         Optional[str] = None,   # busca por nombre de producto
    desde:          Optional[str] = None,   # fecha inicio YYYY-MM-DD
    hasta:          Optional[str] = None,   # fecha fin YYYY-MM-DD
    limit:          int = 500,
    db:             Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Lista salidas con filtros combinables. Ideal para reportes y auditorias."""
    from sqlalchemy.orm import joinedload
    from datetime import timedelta

    query = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
        joinedload(models.Salida.resolucion_usuario),
    )

    # Filtrar por tipo
    if tipo_salida:
        query = query.filter(models.Salida.tipo_salida == tipo_salida)

    # Filtrar por estado
    if estado:
        query = query.filter(models.Salida.estado == estado)

    # Buscar por nombre de producto
    if buscar:
        query = query.join(
            models.Producto,
            models.Salida.producto_id == models.Producto.id
        ).filter(models.Producto.nombre.ilike(f"%{buscar}%"))

    # Filtrar por rango de fechas
    if desde:
        try:
            fd = datetime.strptime(desde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(models.Salida.created_at >= fd)
        except Exception:
            pass

    if hasta:
        try:
            fh = datetime.strptime(hasta, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            query = query.filter(models.Salida.created_at < fh)
        except Exception:
            pass

    salidas = query.order_by(models.Salida.created_at.desc()).limit(limit).all()
    return [salida_a_dict(s) for s in salidas]


# ============================================================
# GET /salidas/cuarentenas
# Lista solo las cuarentenas pendientes de resolucion
# ============================================================

@router.get("/cuarentenas", response_model=List[schemas.SalidaRespuesta])
def listar_cuarentenas_pendientes(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Lista todas las cuarentenas en estado 'en_revision'.
    Analogia: la sala de espera del hospital -
    productos que estan esperando que el supervisor decida su destino.
    """
    from sqlalchemy.orm import joinedload

    salidas = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
    ).filter(
        models.Salida.estado == "en_revision"
    ).order_by(models.Salida.created_at.asc()).all()  # Las mas antiguas primero

    return [salida_a_dict(s) for s in salidas]


# ============================================================
# GET /salidas/resumen
# Dashboard con totales y valores
# ============================================================

@router.get("/resumen", response_model=schemas.ResumenSalidas)
def resumen_salidas(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Totales rapidos para el dashboard principal."""
    from sqlalchemy import func as sqlfunc

    # Contar por tipo
    total_ventas        = db.query(models.Salida).filter(models.Salida.tipo_salida == "venta").count()
    total_mermas        = db.query(models.Salida).filter(models.Salida.tipo_salida == "merma").count()
    total_cuarentenas   = db.query(models.Salida).filter(models.Salida.tipo_salida == "cuarentena").count()
    total_devoluciones  = db.query(models.Salida).filter(models.Salida.tipo_salida == "devolucion_proveedor").count()
    cuarentenas_pending = db.query(models.Salida).filter(models.Salida.estado == "en_revision").count()

    # Calcular valores totales
    def suma_valor(tipo):
        r = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
            models.Salida.tipo_salida == tipo
        ).scalar()
        return r or 0.0

    val_cuarentenas_pend = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
        models.Salida.estado == "en_revision"
    ).scalar() or 0.0

    return {
        "total_ventas":                 total_ventas,
        "total_mermas":                 total_mermas,
        "total_cuarentenas":            total_cuarentenas,
        "total_devoluciones":           total_devoluciones,
        "cuarentenas_pendientes":       cuarentenas_pending,
        "valor_ventas":                 suma_valor("venta"),
        "valor_mermas":                 suma_valor("merma"),
        "valor_cuarentenas_pendientes": val_cuarentenas_pend,
    }


# ============================================================
# PATCH /salidas/{id}/estado
# Resolver una cuarentena: reingresar, descartar o devolver
# ============================================================

@router.patch("/{salida_id}/estado", response_model=schemas.SalidaRespuesta)
def actualizar_estado_salida(
    salida_id: int,
    datos: schemas.SalidaActualizarEstado,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Cambia el estado de una cuarentena.
    Analogia: el supervisor que decide el destino del producto -
    lo libera (reingresa), lo descarta o lo devuelve al proveedor.

    Si se reingresa: el stock se recupera automaticamente.
    """
    # Validar nuevo estado
    if datos.nuevo_estado not in ESTADOS_RESOLUCION:
        raise HTTPException(
            status_code=400,
            detail=f"Estado invalido. Opciones: {', '.join(ESTADOS_RESOLUCION)}"
        )

    # Buscar la salida
    salida = db.query(models.Salida).filter(models.Salida.id == salida_id).first()
    if not salida:
        raise HTTPException(status_code=404, detail="Registro de salida no encontrado")

    # Solo se pueden resolver cuarentenas en_revision
    estado_actual = salida.estado.value if hasattr(salida.estado, 'value') else salida.estado
    if estado_actual != "en_revision":
        raise HTTPException(
            status_code=400,
            detail=f"Solo se pueden resolver cuarentenas 'en_revision'. Estado actual: {estado_actual}"
        )

    # Guardar estado anterior para trazabilidad
    salida.estado_anterior      = estado_actual
    salida.estado               = datos.nuevo_estado
    salida.resolucion_nota      = datos.resolucion_nota
    salida.resolucion_at        = datetime.now(timezone.utc)
    salida.resolucion_usuario_id = usuario_actual.id

    # Si se reingresa: devolver el stock al producto
    if datos.nuevo_estado == "reingresado" and salida.producto_id:
        producto = db.query(models.Producto).filter(
            models.Producto.id == salida.producto_id
        ).first()

        if producto:
            stock_antes         = producto.stock_actual
            producto.stock_actual += salida.cantidad

            # Registrar el reingreso como movimiento de entrada
            # Analogia: el producto volvio de cuarentena a la estanteria
            movimiento_reingreso = models.Movimiento(
                producto_id     = producto.id,
                usuario_id      = usuario_actual.id,
                tipo            = "entrada",
                cantidad        = salida.cantidad,
                stock_anterior  = stock_antes,
                stock_nuevo     = producto.stock_actual,
                nota            = f"REINGRESO desde cuarentena #{salida_id}. {datos.resolucion_nota or ''}",
                lote            = salida.lote,
            )
            db.add(movimiento_reingreso)

    db.commit()
    db.refresh(salida)

    return salida_a_dict(salida)


# ============================================================
# GET /salidas/{id}
# Detalle de una salida especifica
# ============================================================

@router.get("/{salida_id}", response_model=schemas.SalidaRespuesta)
def obtener_salida(
    salida_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Obtiene el detalle completo de una salida por su ID."""
    from sqlalchemy.orm import joinedload

    salida = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
        joinedload(models.Salida.resolucion_usuario),
    ).filter(models.Salida.id == salida_id).first()

    if not salida:
        raise HTTPException(status_code=404, detail="Salida no encontrada")

    return salida_a_dict(salida)