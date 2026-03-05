# ============================================================
# YEPARSTOCK - Router de Movimientos
# Archivo: backend/routers/movimientos.py
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/movimientos", tags=["Movimientos"])


def movimiento_a_dict(m):
    return {
        "id":              m.id,
        "producto_id":     m.producto_id,
        "usuario_id":      m.usuario_id,
        "tipo":            m.tipo,
        "cantidad":        m.cantidad,
        "stock_anterior":  m.stock_anterior,
        "stock_nuevo":     m.stock_nuevo,
        "nota":            m.nota,
        "lote":            m.lote,
        "created_at":      m.created_at,
        "producto_nombre": m.producto.nombre if m.producto else None,
        "usuario_nombre":  m.usuario.nombre  if m.usuario  else None,
    }


# ============================================================
# GET /movimientos
# ============================================================
@router.get("/", response_model=List[schemas.MovimientoRespuesta])
def listar_movimientos(
    tipo:      Optional[str] = None,
    buscar:    Optional[str] = None,
    categoria: Optional[str] = None,
    desde:     Optional[str] = None,
    hasta:     Optional[str] = None,
    limit:     int = 500,
    db:        Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    query = db.query(models.Movimiento).options(
        joinedload(models.Movimiento.producto),
        joinedload(models.Movimiento.usuario)
    ).filter(
        models.Movimiento.usuario_id.in_(
            db.query(models.Usuario.id).filter(
                models.Usuario.empresa_id == usuario_actual.empresa_id
            )
        )
    )

    if tipo:
        query = query.filter(models.Movimiento.tipo == tipo)

    if buscar or categoria:
        query = query.outerjoin(
            models.Producto,
            models.Movimiento.producto_id == models.Producto.id
        )
        if buscar:
            query = query.filter(models.Producto.nombre.ilike(f"%{buscar}%"))
        if categoria:
            query = query.filter(models.Producto.categoria == categoria)

    if desde:
        try:
            fd = datetime.strptime(desde, "%Y-%m-%d").date()
            query = query.filter(sqlfunc.date(models.Movimiento.created_at) >= fd)
        except Exception:
            pass

    if hasta:
        try:
            fh = datetime.strptime(hasta, "%Y-%m-%d").date()
            query = query.filter(sqlfunc.date(models.Movimiento.created_at) <= fh)
        except Exception:
            pass

    movimientos = query.order_by(models.Movimiento.created_at.desc()).limit(limit).all()
    return [movimiento_a_dict(m) for m in movimientos]


# ============================================================
# POST /movimientos
# ============================================================
@router.post("/", response_model=schemas.MovimientoRespuesta, status_code=201)
def registrar_movimiento(
    datos: schemas.MovimientoCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    if datos.tipo not in ("entrada", "salida"):
        raise HTTPException(status_code=400, detail="El tipo debe ser 'entrada' o 'salida'")
    if datos.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    # ✅ CORREGIDO: filtrar por empresa_id, NO por usuario_id
    # Cualquier usuario de la empresa puede operar productos de la empresa
    # Antes filtraba por usuario_id → fallaba si el producto lo creó otro usuario
    if not usuario_actual.empresa_id:
        raise HTTPException(status_code=400, detail="Tu cuenta no está asociada a una empresa.")

    producto = db.query(models.Producto).filter(
        models.Producto.id         == datos.producto_id,
        models.Producto.empresa_id == usuario_actual.empresa_id,  # ← corrección clave
        models.Producto.activo     == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado o no pertenece a tu empresa")

    stock_anterior = producto.stock_actual

    if datos.tipo == "entrada":
        stock_nuevo = stock_anterior + datos.cantidad
    else:
        if datos.cantidad > stock_anterior:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente. Disponible: {stock_anterior} unidades"
            )
        stock_nuevo = stock_anterior - datos.cantidad

    producto.stock_actual = stock_nuevo

    movimiento = models.Movimiento(
        producto_id    = datos.producto_id,
        empresa_id     = usuario_actual.empresa_id,
        usuario_id     = usuario_actual.id,
        tipo           = datos.tipo,
        cantidad       = datos.cantidad,
        stock_anterior = stock_anterior,
        stock_nuevo    = stock_nuevo,
        nota           = datos.nota,
        lote           = datos.lote,
        num_documento  = getattr(datos, 'num_documento', None),
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)
    db.refresh(producto)

    return {
        "id":              movimiento.id,
        "producto_id":     movimiento.producto_id,
        "usuario_id":      movimiento.usuario_id,
        "tipo":            movimiento.tipo,
        "cantidad":        movimiento.cantidad,
        "stock_anterior":  movimiento.stock_anterior,
        "stock_nuevo":     movimiento.stock_nuevo,
        "nota":            movimiento.nota,
        "lote":            movimiento.lote,
        "num_documento":   movimiento.num_documento if hasattr(movimiento, 'num_documento') else None,
        "created_at":      movimiento.created_at,
        "producto_nombre": producto.nombre,
        "usuario_nombre":  usuario_actual.nombre,
    }
