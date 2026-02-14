# ============================================================
# STOCKYA — Router de Movimientos
# Archivo: backend/routers/movimientos.py
# Descripción: Registra entradas y salidas de stock
# Analogía: es el libro contable de la bodega —
#           cada movimiento queda registrado para siempre
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/movimientos", tags=["Movimientos"])


# ============================================================
# GET /movimientos
# Lista los movimientos con filtros opcionales
# ============================================================
@router.get("/", response_model=List[schemas.MovimientoRespuesta])
def listar_movimientos(
    tipo: Optional[str] = None,           # 'entrada' o 'salida'
    producto_id: Optional[int] = None,    # Filtrar por producto específico
    limit: int = 50,                       # Máximo de registros a retornar
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Lista los últimos movimientos registrados."""
    query = db.query(models.Movimiento)

    # Aplicar filtros
    if tipo:
        query = query.filter(models.Movimiento.tipo == tipo)
    if producto_id:
        query = query.filter(models.Movimiento.producto_id == producto_id)

    # Ordenar del más reciente al más antiguo
    movimientos = query.order_by(models.Movimiento.created_at.desc()).limit(limit).all()

    # Construir respuesta con nombres de producto y usuario
    resultado = []
    for m in movimientos:
        resultado.append({
            "id": m.id,
            "producto_id": m.producto_id,
            "usuario_id": m.usuario_id,
            "tipo": m.tipo,
            "cantidad": m.cantidad,
            "stock_anterior": m.stock_anterior,
            "stock_nuevo": m.stock_nuevo,
            "nota": m.nota,
            "lote": m.lote,
            "created_at": m.created_at,
            "producto_nombre": m.producto.nombre if m.producto else None,
            "usuario_nombre": m.usuario.nombre if m.usuario else None,
        })

    return resultado


# ============================================================
# POST /movimientos
# Registra una entrada o salida de stock
# ============================================================
@router.post("/", response_model=schemas.MovimientoRespuesta, status_code=201)
def registrar_movimiento(
    datos: schemas.MovimientoCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Registra un movimiento y actualiza el stock del producto automáticamente.
    Analogía: es como anotar en el cuaderno de bodega Y actualizar
    el contador al mismo tiempo.
    """
    # Validar tipo de movimiento
    if datos.tipo not in ("entrada", "salida"):
        raise HTTPException(status_code=400, detail="El tipo debe ser 'entrada' o 'salida'")

    # Validar cantidad positiva
    if datos.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    # Obtener el producto
    producto = db.query(models.Producto).filter(
        models.Producto.id == datos.producto_id,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Guardar stock anterior para el registro
    stock_anterior = producto.stock_actual

    # Calcular nuevo stock según el tipo
    if datos.tipo == "entrada":
        stock_nuevo = stock_anterior + datos.cantidad
    else:  # salida
        # No permitir stock negativo
        if datos.cantidad > stock_anterior:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente. Stock actual: {stock_anterior}"
            )
        stock_nuevo = stock_anterior - datos.cantidad

    # Actualizar stock del producto
    producto.stock_actual = stock_nuevo
    db.add(producto)

    # Crear registro del movimiento
    movimiento = models.Movimiento(
        producto_id    = datos.producto_id,
        usuario_id     = usuario_actual.id,
        tipo           = datos.tipo,
        cantidad       = datos.cantidad,
        stock_anterior = stock_anterior,
        stock_nuevo    = stock_nuevo,
        nota           = datos.nota,
        lote           = datos.lote
    )
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)

    return {
        "id": movimiento.id,
        "producto_id": movimiento.producto_id,
        "usuario_id": movimiento.usuario_id,
        "tipo": movimiento.tipo,
        "cantidad": movimiento.cantidad,
        "stock_anterior": movimiento.stock_anterior,
        "stock_nuevo": movimiento.stock_nuevo,
        "nota": movimiento.nota,
        "lote": movimiento.lote,
        "created_at": movimiento.created_at,
        "producto_nombre": producto.nombre,
        "usuario_nombre": usuario_actual.nombre,
    }