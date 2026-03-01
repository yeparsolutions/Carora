# ============================================================
# YEPARSTOCK - Router de Salidas
# Archivo: backend/routers/salidas.py
# Descripción: Gestiona ventas, mermas, cuarentenas y
#              devoluciones a proveedor con escaneo de codigo
# ✅ CORREGIDO: todas las consultas filtran por usuario_actual.id
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/salidas", tags=["Salidas"])

TIPOS_VALIDOS      = ["venta", "merma", "cuarentena", "devolucion_proveedor"]
ESTADOS_RESOLUCION = ["reingresado", "descartado", "enviado_proveedor"]
ESTADO_INICIAL     = {
    "venta":                "activo",
    "merma":                "activo",
    "cuarentena":           "en_revision",
    "devolucion_proveedor": "activo",
}


def salida_a_dict(s) -> dict:
    return {
        "id":                        s.id,
        "producto_id":               s.producto_id,
        "usuario_id":                s.usuario_id,
        "cantidad":                  s.cantidad,
        "stock_anterior":            s.stock_anterior,
        "stock_nuevo":               s.stock_nuevo,
        "tipo_salida":               s.tipo_salida.value if hasattr(s.tipo_salida, 'value') else s.tipo_salida,
        "motivo":                    s.motivo,
        "numero_documento":          s.numero_documento,
        "codigo_barra_scan":         s.codigo_barra_scan,
        "precio_unitario":           s.precio_unitario or 0.0,
        "valor_total":               s.valor_total or 0.0,
        "metodo_pago":               s.metodo_pago or "efectivo",
        "estado":                    s.estado.value if hasattr(s.estado, 'value') else s.estado,
        "estado_anterior":           s.estado_anterior,
        "resolucion_nota":           s.resolucion_nota,
        "resolucion_at":             s.resolucion_at,
        "lote":                      s.lote,
        "fecha_vencimiento":         s.fecha_vencimiento,
        "created_at":                s.created_at,
        "updated_at":                s.updated_at,
        "producto_nombre":           s.producto.nombre if s.producto else None,
        "usuario_nombre":            s.usuario.nombre if s.usuario else None,
        "resolucion_usuario_nombre": s.resolucion_usuario.nombre if s.resolucion_usuario else None,
    }


# ============================================================
# POST /salidas/scan
# ============================================================
@router.post("/scan", response_model=schemas.SalidaRespuesta, status_code=201)
def registrar_salida_por_scan(
    datos: schemas.SalidaPorScan,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    # ✅ Busca productos de la empresa — cualquier operador puede escanear
    # productos de la empresa, no solo los que él mismo creó
    producto = db.query(models.Producto).filter(
        models.Producto.codigo_barra == datos.codigo_barra,
        models.Producto.activo       == True,
        models.Producto.empresa_id   == usuario_actual.empresa_id  # 🔧 CORREGIDO
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail=f"Producto con código '{datos.codigo_barra}' no encontrado")

    if datos.tipo_salida not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Debe ser: {', '.join(TIPOS_VALIDOS)}")

    if datos.cantidad > producto.stock_actual:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Disponible: {producto.stock_actual} unidades")

    stock_anterior = producto.stock_actual
    stock_nuevo    = stock_anterior - datos.cantidad
    precio_unit    = datos.precio_unitario or producto.precio_venta or 0.0
    valor_total    = precio_unit * datos.cantidad
    estado_inicial = ESTADO_INICIAL[datos.tipo_salida]

    producto.stock_actual = stock_nuevo

    salida = models.Salida(
        empresa_id        = usuario_actual.empresa_id,  # 🔧 CORREGIDO — asocia la salida a la empresa
        producto_id       = producto.id,
        usuario_id        = usuario_actual.id,
        cantidad          = datos.cantidad,
        stock_anterior    = stock_anterior,
        stock_nuevo       = stock_nuevo,
        tipo_salida       = datos.tipo_salida,
        motivo            = datos.motivo,
        numero_documento  = datos.numero_documento,
        codigo_barra_scan = datos.codigo_barra,
        precio_unitario   = precio_unit,
        valor_total       = valor_total,
        estado            = estado_inicial,
        lote              = producto.lote,
        fecha_vencimiento = producto.fecha_vencimiento,
    )
    db.add(salida)

    movimiento = models.Movimiento(
        empresa_id     = usuario_actual.empresa_id,  # 🔧 CORREGIDO — movimiento ligado a la empresa
        producto_id    = producto.id,
        usuario_id     = usuario_actual.id,
        tipo           = "salida",
        cantidad       = datos.cantidad,
        stock_anterior = stock_anterior,
        stock_nuevo    = stock_nuevo,
        nota           = f"{datos.tipo_salida.upper()}: {datos.motivo or 'sin nota'} (scan)",
        lote           = producto.lote,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(salida)
    return salida_a_dict(salida)


# ============================================================
# POST /salidas
# ============================================================
@router.post("/", response_model=schemas.SalidaRespuesta, status_code=201)
def registrar_salida(
    datos: schemas.SalidaCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    if datos.tipo_salida not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Debe ser: {', '.join(TIPOS_VALIDOS)}")

    # ✅ Busca productos de la empresa (cualquier usuario de la empresa puede vender)
    producto = db.query(models.Producto).filter(
        models.Producto.id         == datos.producto_id,
        models.Producto.activo     == True,
        models.Producto.empresa_id == usuario_actual.empresa_id
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if datos.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    if datos.cantidad > producto.stock_actual:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente. Disponible: {producto.stock_actual} unidades")

    stock_anterior = producto.stock_actual
    stock_nuevo    = stock_anterior - datos.cantidad
    precio_unit    = datos.precio_unitario or producto.precio_venta or 0.0
    valor_total    = precio_unit * datos.cantidad
    estado_inicial = ESTADO_INICIAL[datos.tipo_salida]

    producto.stock_actual = stock_nuevo

    salida = models.Salida(
        empresa_id        = usuario_actual.empresa_id,
        producto_id       = producto.id,
        usuario_id        = usuario_actual.id,
        cantidad          = datos.cantidad,
        stock_anterior    = stock_anterior,
        stock_nuevo       = stock_nuevo,
        tipo_salida       = datos.tipo_salida,
        motivo            = datos.motivo,
        numero_documento  = datos.numero_documento,
        codigo_barra_scan = datos.codigo_barra_scan,
        precio_unitario   = precio_unit,
        valor_total       = valor_total,
        estado            = estado_inicial,
        lote              = datos.lote or producto.lote,
        fecha_vencimiento = datos.fecha_vencimiento or producto.fecha_vencimiento,
        metodo_pago       = datos.metodo_pago or "efectivo",
    )
    db.add(salida)
    db.flush()  # para obtener salida.id antes del commit

    # Si el método de pago es fiado, registrar la deuda
    # Analogia: anotar en el cuaderno de fiados del almacén
    if datos.metodo_pago == "fiado":
        if not datos.cliente_nombre:
            raise HTTPException(status_code=400, detail="Para fiado se requiere el nombre del cliente")
        fiado = models.Fiado(
            empresa_id     = usuario_actual.empresa_id,
            salida_id      = salida.id,
            cliente_nombre = datos.cliente_nombre,
            monto_total    = valor_total,
            monto_pagado   = 0.0,
            estado         = "pendiente",
            nota           = datos.motivo,
        )
        db.add(fiado)

    movimiento = models.Movimiento(
        producto_id    = producto.id,
        usuario_id     = usuario_actual.id,
        tipo           = "salida",
        cantidad       = datos.cantidad,
        stock_anterior = stock_anterior,
        stock_nuevo    = stock_nuevo,
        nota           = f"{datos.tipo_salida.upper()}: {datos.motivo or 'sin nota'}",
        lote           = datos.lote or producto.lote,
    )
    db.add(movimiento)
    db.commit()
    db.refresh(salida)
    return salida_a_dict(salida)


# ============================================================
# GET /salidas
# ============================================================
@router.get("/", response_model=List[schemas.SalidaRespuesta])
def listar_salidas(
    tipo_salida: Optional[str] = None,
    estado:      Optional[str] = None,
    buscar:      Optional[str] = None,
    desde:       Optional[str] = None,
    hasta:       Optional[str] = None,
    limit:       int = 500,
    db:          Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    query = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
        joinedload(models.Salida.resolucion_usuario),
    ).filter(
        # ✅ Solo salidas del usuario actual
        models.Salida.empresa_id == usuario_actual.empresa_id
    )

    if tipo_salida:
        query = query.filter(models.Salida.tipo_salida == tipo_salida)
    if estado:
        query = query.filter(models.Salida.estado == estado)
    if buscar:
        query = query.join(
            models.Producto, models.Salida.producto_id == models.Producto.id
        ).filter(models.Producto.nombre.ilike(f"%{buscar}%"))
    if desde:
        try:
            # Comparar solo la parte de fecha (sin timezone) para evitar desfase horario
            # Analogia: buscar ventas del dia sin importar a qué hora se hicieron
            fd = datetime.strptime(desde, "%Y-%m-%d").date()
            query = query.filter(sqlfunc.date(models.Salida.created_at) >= fd)
        except Exception:
            pass
    if hasta:
        try:
            fh = datetime.strptime(hasta, "%Y-%m-%d").date()
            query = query.filter(sqlfunc.date(models.Salida.created_at) <= fh)
        except Exception:
            pass

    salidas = query.order_by(models.Salida.created_at.desc()).limit(limit).all()
    return [salida_a_dict(s) for s in salidas]


# ============================================================
# GET /salidas/cuarentenas
# ============================================================
@router.get("/cuarentenas", response_model=List[schemas.SalidaRespuesta])
def listar_cuarentenas_pendientes(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    salidas = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
    ).filter(
        models.Salida.estado     == "en_revision",
        models.Salida.empresa_id == usuario_actual.empresa_id
    ).order_by(models.Salida.created_at.asc()).all()

    return [salida_a_dict(s) for s in salidas]


# ============================================================
# GET /salidas/resumen
# ============================================================
@router.get("/resumen", response_model=schemas.ResumenSalidas)
def resumen_salidas(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    db:    Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    # Analogia: el cajero cierra caja — puede ver el total del dia o del periodo
    empresa_id = usuario_actual.empresa_id

    def base_query():
        q = db.query(models.Salida).filter(models.Salida.empresa_id == empresa_id)
        if desde:
            try:
                fd = datetime.strptime(desde, "%Y-%m-%d").date()
                q  = q.filter(sqlfunc.date(models.Salida.created_at) >= fd)
            except Exception:
                pass
        if hasta:
            try:
                fh = datetime.strptime(hasta, "%Y-%m-%d").date()
                q  = q.filter(sqlfunc.date(models.Salida.created_at) <= fh)
            except Exception:
                pass
        return q

    total_ventas       = base_query().filter(models.Salida.tipo_salida == "venta").count()
    total_mermas       = base_query().filter(models.Salida.tipo_salida == "merma").count()
    total_cuarentenas  = base_query().filter(models.Salida.tipo_salida == "cuarentena").count()
    total_devoluciones = base_query().filter(models.Salida.tipo_salida == "devolucion_proveedor").count()
    cuarentenas_pend   = db.query(models.Salida).filter(
        models.Salida.estado     == "en_revision",
        models.Salida.empresa_id == empresa_id
    ).count()

    def suma_valor(tipo):
        r = base_query().with_entities(sqlfunc.sum(models.Salida.valor_total)).filter(
            models.Salida.tipo_salida == tipo
        ).scalar()
        return r or 0.0

    val_cuarentenas_pend = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
        models.Salida.estado     == "en_revision",
        models.Salida.empresa_id == empresa_id
    ).scalar() or 0.0

    return {
        "total_ventas":                 total_ventas,
        "total_mermas":                 total_mermas,
        "total_cuarentenas":            total_cuarentenas,
        "total_devoluciones":           total_devoluciones,
        "cuarentenas_pendientes":       cuarentenas_pend,
        "valor_ventas":                 suma_valor("venta"),
        "valor_mermas":                 suma_valor("merma"),
        "valor_cuarentenas_pendientes": val_cuarentenas_pend,
    }


# ============================================================
# PATCH /salidas/{id}/estado
# ============================================================
@router.patch("/{salida_id}/estado", response_model=schemas.SalidaRespuesta)
def actualizar_estado_salida(
    salida_id: int,
    datos: schemas.SalidaActualizarEstado,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    if datos.nuevo_estado not in ESTADOS_RESOLUCION:
        raise HTTPException(status_code=400, detail=f"Estado inválido. Opciones: {', '.join(ESTADOS_RESOLUCION)}")

    # ✅ Solo puede resolver sus propias cuarentenas
    salida = db.query(models.Salida).filter(
        models.Salida.id         == salida_id,
        models.Salida.empresa_id == usuario_actual.empresa_id
    ).first()
    if not salida:
        raise HTTPException(status_code=404, detail="Registro de salida no encontrado")

    estado_actual = salida.estado.value if hasattr(salida.estado, 'value') else salida.estado
    if estado_actual != "en_revision":
        raise HTTPException(status_code=400, detail=f"Solo se pueden resolver cuarentenas 'en_revision'. Estado actual: {estado_actual}")

    salida.estado_anterior       = estado_actual
    salida.estado                = datos.nuevo_estado
    salida.resolucion_nota       = datos.resolucion_nota
    salida.resolucion_at         = datetime.now(timezone.utc)
    salida.resolucion_usuario_id = usuario_actual.id

    if datos.nuevo_estado == "reingresado" and salida.producto_id:
        # ✅ Busca el producto dentro de la empresa — cualquier admin/operador
        # puede reingresar cuarentenas aunque no las haya creado él
        producto = db.query(models.Producto).filter(
            models.Producto.id         == salida.producto_id,
            models.Producto.empresa_id == usuario_actual.empresa_id  # 🔧 CORREGIDO
        ).first()
        if producto:
            stock_antes            = producto.stock_actual
            producto.stock_actual += salida.cantidad
            db.add(models.Movimiento(
                empresa_id     = usuario_actual.empresa_id,  # 🔧 CORREGIDO
                producto_id    = producto.id,
                usuario_id     = usuario_actual.id,
                tipo           = "entrada",
                cantidad       = salida.cantidad,
                stock_anterior = stock_antes,
                stock_nuevo    = producto.stock_actual,
                nota           = f"REINGRESO desde cuarentena #{salida_id}. {datos.resolucion_nota or ''}",
                lote           = salida.lote,
            ))

    db.commit()
    db.refresh(salida)
    return salida_a_dict(salida)


# ============================================================
# GET /salidas/{id}
# ============================================================
@router.get("/{salida_id}", response_model=schemas.SalidaRespuesta)
def obtener_salida(
    salida_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    # ✅ Solo puede ver sus propias salidas
    salida = db.query(models.Salida).options(
        joinedload(models.Salida.producto),
        joinedload(models.Salida.usuario),
        joinedload(models.Salida.resolucion_usuario),
    ).filter(
        models.Salida.id         == salida_id,
        models.Salida.empresa_id == usuario_actual.empresa_id
    ).first()

    if not salida:
        raise HTTPException(status_code=404, detail="Salida no encontrada")
    return salida_a_dict(salida)