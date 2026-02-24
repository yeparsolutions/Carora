# ============================================================
# YEPARSTOCK - Router de Reportes
# Archivo: backend/routers/reportes.py
# Descripcion: Endpoints para graficos y valorado de ventas
# ✅ ACTUALIZADO: filtra por empresa_id para soporte multiusuario
# ============================================================

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import get_db
from auth import get_usuario_actual
import models

router = APIRouter(prefix="/reportes", tags=["Reportes"])


def get_empresa_id(usuario_actual: models.Usuario) -> int:
    if not usuario_actual.empresa_id:
        raise HTTPException(status_code=400, detail="Tu cuenta no está asociada a una empresa.")
    return usuario_actual.empresa_id


def get_rango_fechas(periodo: str, desde: str = None, hasta: str = None):
    ahora = datetime.now(timezone.utc)
    if desde and hasta:
        try:
            fd = datetime.strptime(desde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            fh = datetime.strptime(hasta, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            return fd, fh
        except Exception:
            pass
    if periodo == "hoy":
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    elif periodo == "semana":
        inicio = ahora - timedelta(days=7)
        fin    = ahora
    elif periodo == "mes":
        inicio = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    elif periodo == "año":
        inicio = ahora.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    else:
        inicio = ahora - timedelta(days=30)
        fin    = ahora
    return inicio, fin


@router.get("/ventas-resumen")
def ventas_resumen(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)
    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()
    total_valor     = sum(v.valor_total or 0 for v in ventas)
    total_unidades  = sum(v.cantidad for v in ventas)
    total_registros = len(ventas)
    ticket_promedio = total_valor / total_registros if total_registros > 0 else 0
    mermas = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "merma",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).scalar() or 0.0
    return {
        "periodo": periodo, "desde": inicio.isoformat(), "hasta": fin.isoformat(),
        "total_valor": round(total_valor, 2), "total_unidades": total_unidades,
        "total_registros": total_registros, "ticket_promedio": round(ticket_promedio, 2),
        "total_mermas": round(mermas, 2),
    }


@router.get("/ventas-por-dia")
def ventas_por_dia(
    periodo: str = Query("semana"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)
    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()
    por_dia = {}
    for v in ventas:
        fecha = v.created_at.strftime("%Y-%m-%d")
        if fecha not in por_dia:
            por_dia[fecha] = {"fecha": fecha, "valor": 0, "cantidad": 0, "registros": 0}
        por_dia[fecha]["valor"]     += v.valor_total or 0
        por_dia[fecha]["cantidad"]  += v.cantidad
        por_dia[fecha]["registros"] += 1
    dias = []
    actual = inicio
    while actual < fin:
        fecha = actual.strftime("%Y-%m-%d")
        dias.append(por_dia.get(fecha, {"fecha": fecha, "valor": 0, "cantidad": 0, "registros": 0}))
        actual += timedelta(days=1)
    return dias


@router.get("/top-productos")
def top_productos(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    limite:  int = Query(10),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)
    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()
    por_producto = {}
    for v in ventas:
        pid    = v.producto_id
        nombre = v.producto.nombre if v.producto else f"Producto #{pid}"
        if pid not in por_producto:
            por_producto[pid] = {"producto_id": pid, "nombre": nombre, "unidades": 0, "valor": 0}
        por_producto[pid]["unidades"] += v.cantidad
        por_producto[pid]["valor"]    += v.valor_total or 0
    return sorted(por_producto.values(), key=lambda x: x["valor"], reverse=True)[:limite]


@router.get("/ventas-por-tipo")
def ventas_por_tipo(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)
    tipos     = ["venta", "merma", "cuarentena", "devolucion_proveedor"]
    resultado = []
    for tipo in tipos:
        total = db.query(sqlfunc.count(models.Salida.id)).filter(
            models.Salida.empresa_id  == empresa_id,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0
        valor = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
            models.Salida.empresa_id  == empresa_id,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0.0
        resultado.append({"tipo": tipo, "cantidad": total, "valor": round(valor, 2)})
    return resultado