# ============================================================
# STOCKYA - Router de Reportes
# Archivo: backend/routers/reportes.py
# Descripcion: Endpoints para graficos y valorado de ventas
# Analogia: el contador del negocio que prepara los informes
#           financieros por dia, semana, mes y año
# ============================================================

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc, and_
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import get_db
from auth import get_usuario_actual
import models

router = APIRouter(prefix="/reportes", tags=["Reportes"])


def get_rango_fechas(periodo: str, desde: str = None, hasta: str = None):
    """
    Calcula el rango de fechas segun el periodo solicitado.
    Analogia: el contador decide si mirar el libro del dia, la semana o el mes.
    """
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
    else:  # 30dias por defecto
        inicio = ahora - timedelta(days=30)
        fin    = ahora

    return inicio, fin


# ============================================================
# GET /reportes/ventas-resumen
# Retorna totales de ventas para el periodo seleccionado
# ============================================================
@router.get("/ventas-resumen")
def ventas_resumen(
    periodo: str = Query("mes", description="hoy | semana | mes | año | custom"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna resumen de ventas: total, cantidad, ticket promedio.
    Analogia: el resumen de caja al cierre del dia.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    uid = usuario_actual.id

    # Ventas en el periodo
    ventas = db.query(models.Salida).filter(
        models.Salida.usuario_id  == uid,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    total_valor     = sum(v.valor_total or 0 for v in ventas)
    total_unidades  = sum(v.cantidad for v in ventas)
    total_registros = len(ventas)
    ticket_promedio = total_valor / total_registros if total_registros > 0 else 0

    # Mermas en el periodo
    mermas = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
        models.Salida.usuario_id  == uid,
        models.Salida.tipo_salida == "merma",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).scalar() or 0.0

    return {
        "periodo":          periodo,
        "desde":            inicio.isoformat(),
        "hasta":            fin.isoformat(),
        "total_valor":      round(total_valor, 2),
        "total_unidades":   total_unidades,
        "total_registros":  total_registros,
        "ticket_promedio":  round(ticket_promedio, 2),
        "total_mermas":     round(mermas, 2),
    }


# ============================================================
# GET /reportes/ventas-por-dia
# Retorna ventas agrupadas por dia para grafico de barras
# ============================================================
@router.get("/ventas-por-dia")
def ventas_por_dia(
    periodo: str = Query("semana"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna ventas agrupadas por dia para mostrar en grafico.
    Analogia: la curva de ventas en el grafico de la pared del negocio.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    uid = usuario_actual.id

    ventas = db.query(models.Salida).filter(
        models.Salida.usuario_id  == uid,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    # Agrupar por dia
    por_dia = {}
    for v in ventas:
        fecha = v.created_at.strftime("%Y-%m-%d")
        if fecha not in por_dia:
            por_dia[fecha] = {"fecha": fecha, "valor": 0, "cantidad": 0, "registros": 0}
        por_dia[fecha]["valor"]     += v.valor_total or 0
        por_dia[fecha]["cantidad"]  += v.cantidad
        por_dia[fecha]["registros"] += 1

    # Generar todos los dias del rango (para que no falten dias sin ventas)
    dias = []
    actual = inicio
    while actual < fin:
        fecha = actual.strftime("%Y-%m-%d")
        dias.append(por_dia.get(fecha, {
            "fecha":     fecha,
            "valor":     0,
            "cantidad":  0,
            "registros": 0
        }))
        actual += timedelta(days=1)

    return dias


# ============================================================
# GET /reportes/top-productos
# Retorna los productos mas vendidos en el periodo
# ============================================================
@router.get("/top-productos")
def top_productos(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    limite:  int = Query(10),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna los productos mas vendidos por unidades y valor.
    Analogia: el ranking de los productos estrella del negocio.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    uid = usuario_actual.id

    ventas = db.query(models.Salida).filter(
        models.Salida.usuario_id  == uid,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    # Agrupar por producto
    por_producto = {}
    for v in ventas:
        pid   = v.producto_id
        nombre = v.producto.nombre if v.producto else f"Producto #{pid}"
        if pid not in por_producto:
            por_producto[pid] = {"producto_id": pid, "nombre": nombre, "unidades": 0, "valor": 0}
        por_producto[pid]["unidades"] += v.cantidad
        por_producto[pid]["valor"]    += v.valor_total or 0

    # Ordenar por valor y retornar top N
    ranking = sorted(por_producto.values(), key=lambda x: x["valor"], reverse=True)
    return ranking[:limite]


# ============================================================
# GET /reportes/ventas-por-tipo
# Retorna distribucion de salidas por tipo (venta/merma/etc)
# ============================================================
@router.get("/ventas-por-tipo")
def ventas_por_tipo(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna cuantas salidas hubo por tipo en el periodo.
    Analogia: la torta del pastel que muestra que porcentaje fue venta vs merma.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    uid = usuario_actual.id

    tipos = ["venta", "merma", "cuarentena", "devolucion_proveedor"]
    resultado = []

    for tipo in tipos:
        total = db.query(sqlfunc.count(models.Salida.id)).filter(
            models.Salida.usuario_id  == uid,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0

        valor = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
            models.Salida.usuario_id  == uid,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0.0

        resultado.append({"tipo": tipo, "cantidad": total, "valor": round(valor, 2)})

    return resultado
