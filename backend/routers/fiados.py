# ============================================================
# STOCKYA — Router de Fiados
# Archivo: backend/routers/fiados.py
# Descripcion: Gestiona las deudas de clientes (ventas fiadas)
# Analogia: el cuaderno de fiados del almacén hecho digital —
#           registra quien debe, cuanto debe y cuando paga.
#           Los fiados se consolidan por nombre de cliente,
#           igual que en el cuaderno real: una página por cliente.
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
# GET /fiados — Lista deudores CONSOLIDADOS por nombre
# ============================================================
@router.get("/")
def listar_fiados(
    estado: Optional[str] = None,
    buscar: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Lista deudores consolidados por nombre de cliente.
    Analogia: una página por cliente en el cuaderno de fiados,
    no una línea por cada compra.
    """
    query = db.query(models.Fiado).filter(
        models.Fiado.empresa_id == usuario_actual.empresa_id
    )

    if buscar:
        query = query.filter(models.Fiado.cliente_nombre.ilike(f"%{buscar}%"))

    fiados = query.order_by(models.Fiado.created_at.desc()).all()

    # Consolidar por nombre de cliente (normalizado a mayúsculas para agrupar)
    consolidado = {}
    for f in fiados:
        key = f.cliente_nombre.strip().upper()
        if key not in consolidado:
            consolidado[key] = {
                "cliente_nombre":  f.cliente_nombre,
                "monto_total":     0.0,
                "monto_pagado":    0.0,
                "monto_pendiente": 0.0,
                "estado":          "pagado",
                "ids":             [],
                "ultima_compra":   f.created_at,
                "cantidad_fiados": 0,
            }
        c = consolidado[key]
        c["monto_total"]     += f.monto_total
        c["monto_pagado"]    += f.monto_pagado
        c["monto_pendiente"] += (f.monto_total - f.monto_pagado)
        c["ids"].append(f.id)
        c["cantidad_fiados"] += 1
        if f.created_at and c["ultima_compra"] and f.created_at > c["ultima_compra"]:
            c["ultima_compra"] = f.created_at

        # Estado consolidado: el peor estado gana
        if f.estado == "pendiente":
            c["estado"] = "pendiente"
        elif f.estado == "pagado_parcial" and c["estado"] == "pagado":
            c["estado"] = "pagado_parcial"

    resultado = list(consolidado.values())

    # Aplicar filtro de estado DESPUÉS de consolidar
    if estado:
        resultado = [r for r in resultado if r["estado"] == estado]

    return resultado


# ============================================================
# GET /fiados/resumen — Totales de deuda pendiente
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

    # Contar clientes únicos con deuda (por nombre normalizado)
    fiados_pendientes = db.query(models.Fiado.cliente_nombre).filter(
        models.Fiado.empresa_id == empresa_id,
        models.Fiado.estado != "pagado"
    ).all()
    clientes_unicos = len(set(f[0].strip().upper() for f in fiados_pendientes))

    return {
        "total_deuda_pendiente":    round(total_deuda, 2),
        "total_clientes_con_deuda": clientes_unicos,
    }


# ============================================================
# PATCH /fiados/abonar-cliente — Abona a TODOS los fiados de un cliente
# ============================================================
@router.patch("/abonar-cliente")
def abonar_cliente(
    cliente_nombre: str,
    monto:          float,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Registra un abono distribuyendo el monto entre los fiados
    pendientes del cliente, del más antiguo al más nuevo.
    Analogia: el cliente paga $5.000 y se va saldando deuda por deuda.
    """
    if monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

    fiados = db.query(models.Fiado).filter(
        models.Fiado.empresa_id    == usuario_actual.empresa_id,
        models.Fiado.cliente_nombre.ilike(f"%{cliente_nombre}%"),
        models.Fiado.estado        != "pagado"
    ).order_by(models.Fiado.created_at.asc()).all()

    if not fiados:
        raise HTTPException(status_code=404, detail="Cliente sin deudas pendientes")

    restante = monto
    for f in fiados:
        if restante <= 0:
            break
        pendiente = f.monto_total - f.monto_pagado
        if restante >= pendiente:
            f.monto_pagado = f.monto_total
            f.estado       = "pagado"
            restante      -= pendiente
        else:
            f.monto_pagado += restante
            f.estado        = "pagado_parcial"
            restante        = 0

    db.commit()
    return {"ok": True, "monto_aplicado": monto - restante}


# ============================================================
# Helper interno
# ============================================================
def _fiado_a_dict(f) -> dict:
    return {
        "id":              f.id,
        "cliente_nombre":  f.cliente_nombre,
        "monto_total":     f.monto_total,
        "monto_pagado":    f.monto_pagado,
        "monto_pendiente": f.monto_total - f.monto_pagado,
        "estado":          f.estado,
        "nota":            f.nota,
        "salida_id":       f.salida_id,
        "created_at":      f.created_at,
        "updated_at":      f.updated_at,
    }