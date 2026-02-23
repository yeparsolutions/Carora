# ============================================================
# STOCKYA — Router de Fiados
# Archivo: backend/routers/fiados.py
# Descripcion: Gestiona las deudas de clientes (ventas fiadas)
# Analogia: el cuaderno de fiados del almacén hecho digital —
#           registra quien debe, cuanto debe y cuando paga
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database import get_db
from auth import get_usuario_actual
import models

router = APIRouter(prefix="/fiados", tags=["Fiados"])


# ============================================================
# GET /fiados — Lista todos los fiados de la empresa
# ============================================================
@router.get("/")
def listar_fiados(
    estado: Optional[str] = None,     # pendiente, pagado_parcial, pagado
    buscar: Optional[str] = None,     # buscar por nombre del cliente
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Lista todas las deudas de clientes de la empresa.
    Analogia: ver todas las páginas del cuaderno de fiados.
    """
    query = db.query(models.Fiado).filter(
        models.Fiado.empresa_id == usuario_actual.empresa_id
    )

    if estado:
        query = query.filter(models.Fiado.estado == estado)
    if buscar:
        query = query.filter(models.Fiado.cliente_nombre.ilike(f"%{buscar}%"))

    fiados = query.order_by(models.Fiado.created_at.desc()).all()

    return [_fiado_a_dict(f) for f in fiados]


# ============================================================
# GET /fiados/resumen — Totales de fiados
# ============================================================
@router.get("/resumen")
def resumen_fiados(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Retorna totales de deuda pendiente por cobrar."""
    empresa_id = usuario_actual.empresa_id

    total_deuda = db.query(func.sum(
        models.Fiado.monto_total - models.Fiado.monto_pagado
    )).filter(
        models.Fiado.empresa_id == empresa_id,
        models.Fiado.estado != "pagado"
    ).scalar() or 0.0

    total_clientes = db.query(func.count(models.Fiado.id.distinct())).filter(
        models.Fiado.empresa_id == empresa_id,
        models.Fiado.estado != "pagado"
    ).scalar() or 0

    return {
        "total_deuda_pendiente": total_deuda,
        "total_clientes_con_deuda": total_clientes,
    }


# ============================================================
# PATCH /fiados/{id}/abonar — Registrar un pago parcial o total
# ============================================================
@router.patch("/{fiado_id}/abonar")
def abonar_fiado(
    fiado_id: int,
    monto:    float,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Registra un pago (abono) a un fiado.
    Analogia: tachar la deuda del cuaderno cuando el cliente paga.
    """
    fiado = db.query(models.Fiado).filter(
        models.Fiado.id         == fiado_id,
        models.Fiado.empresa_id == usuario_actual.empresa_id
    ).first()

    if not fiado:
        raise HTTPException(status_code=404, detail="Fiado no encontrado")

    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    fiado.monto_pagado += monto

    # Actualizar estado según cuánto se ha pagado
    if fiado.monto_pagado >= fiado.monto_total:
        fiado.monto_pagado = fiado.monto_total
        fiado.estado = "pagado"
    else:
        fiado.estado = "pagado_parcial"

    from sqlalchemy.sql import func as sqlfunc
    fiado.updated_at = sqlfunc.now()

    db.commit()
    db.refresh(fiado)

    return _fiado_a_dict(fiado)


# ============================================================
# Helper
# ============================================================
def _fiado_a_dict(f) -> dict:
    return {
        "id":             f.id,
        "cliente_nombre": f.cliente_nombre,
        "monto_total":    f.monto_total,
        "monto_pagado":   f.monto_pagado,
        "monto_pendiente": f.monto_total - f.monto_pagado,
        "estado":         f.estado,
        "nota":           f.nota,
        "salida_id":      f.salida_id,
        "created_at":     f.created_at,
        "updated_at":     f.updated_at,
    }
