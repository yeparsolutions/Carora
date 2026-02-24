# ============================================================
# YEPARSTOCK – Router de Alertas
# Archivo: backend/routers/alertas.py
# Descripcion: Stock bajo + vencimientos proximos
# ✅ ACTUALIZADO: filtra por empresa_id para soporte multiusuario
#    Todos los usuarios de la empresa ven las mismas alertas
# Analogia: el panel de alarmas de LA TIENDA, no del empleado
# ============================================================

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database import get_db
from auth import get_usuario_actual
import models

router = APIRouter(prefix="/alertas", tags=["Alertas"])


@router.get("/")
def obtener_alertas(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna alertas de stock bajo Y vencimientos proximos.
    Todos los usuarios de la empresa ven las mismas alertas.
    """
    if not usuario_actual.empresa_id:
        return {
            "total_criticos": 0, "total_alertas": 0,
            "total_vencidos": 0, "total_proximos": 0,
            "productos_criticos": [], "productos_alerta": [],
            "productos_vencidos": [], "productos_proximos": [],
        }

    ahora      = datetime.now(timezone.utc)
    empresa_id = usuario_actual.empresa_id

    # ✅ Filtrar por empresa_id — todos los usuarios ven las mismas alertas
    productos = db.query(models.Producto).filter(
        models.Producto.activo     == True,
        models.Producto.empresa_id == empresa_id
    ).all()

    criticos = []
    alertas  = []
    vencidos = []
    proximos = []

    for p in productos:
        d = {
            "id": p.id, "nombre": p.nombre, "codigo_barra": p.codigo_barra,
            "codigo": p.codigo, "categoria": p.categoria, "marca": p.marca,
            "proveedor": p.proveedor, "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo, "precio_compra": p.precio_compra,
            "precio_venta": p.precio_venta, "porcentaje_ganancia": p.porcentaje_ganancia,
            "fecha_vencimiento": p.fecha_vencimiento, "dias_alerta_venc": p.dias_alerta_venc,
            "activo": p.activo, "created_at": p.created_at,
            "estado": "", "estado_venc": None
        }

        # --- Alertas de stock ---
        if p.stock_minimo > 0:
            if p.stock_actual < p.stock_minimo:
                d["estado"] = "critico"
                criticos.append(d.copy())
            elif p.stock_actual < p.stock_minimo * 1.5:
                d["estado"] = "alerta"
                alertas.append(d.copy())

        # --- Alertas de vencimiento ---
        if p.fecha_vencimiento:
            diff = (p.fecha_vencimiento - ahora).days
            if diff < 0:
                d["estado_venc"] = "vencido"
                vencidos.append(d.copy())
            elif diff <= (p.dias_alerta_venc or 30):
                d["estado_venc"] = "proximo"
                proximos.append(d.copy())

    return {
        "total_criticos":     len(criticos),
        "total_alertas":      len(alertas),
        "total_vencidos":     len(vencidos),
        "total_proximos":     len(proximos),
        "productos_criticos": criticos,
        "productos_alerta":   alertas,
        "productos_vencidos": vencidos,
        "productos_proximos": proximos,
    }