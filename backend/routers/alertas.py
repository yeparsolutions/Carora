# ============================================================
# STOCKYA — Router de Alertas
# Archivo: backend/routers/alertas.py
# Descripción: Endpoints para consultar stock bajo
# ============================================================

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/alertas", tags=["Alertas"])


# ============================================================
# GET /alertas
# Retorna productos con stock crítico y en alerta
# ============================================================
@router.get("/", response_model=schemas.AlertaRespuesta)
def obtener_alertas(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna el resumen de alertas de stock.
    Analogía: es la alarma de la bodega — te dice qué necesita
    atención urgente y qué está por acabarse pronto.
    """
    # Obtener todos los productos activos con stock_minimo > 0
    productos = db.query(models.Producto).filter(
        models.Producto.activo == True,
        models.Producto.stock_minimo > 0
    ).all()

    criticos = []   # Stock por debajo del mínimo
    alertas  = []   # Stock entre mínimo y mínimo * 1.5

    for p in productos:
        p_dict = {
            "id": p.id, "nombre": p.nombre, "codigo": p.codigo,
            "categoria": p.categoria, "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo, "precio_compra": p.precio_compra,
            "precio_venta": p.precio_venta, "activo": p.activo,
            "created_at": p.created_at, "estado": ""
        }
        if p.stock_actual < p.stock_minimo:
            p_dict["estado"] = "critico"
            criticos.append(p_dict)
        elif p.stock_actual < p.stock_minimo * 1.5:
            p_dict["estado"] = "alerta"
            alertas.append(p_dict)

    return {
        "total_criticos": len(criticos),
        "total_alertas": len(alertas),
        "productos_criticos": criticos,
        "productos_alerta": alertas,
    }
