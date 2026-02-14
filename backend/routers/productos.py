# ============================================================
# STOCKYA — Router de Productos
# Archivo: backend/routers/productos.py
# Descripción: CRUD completo de productos del inventario
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/productos", tags=["Productos"])


# --- Función auxiliar: calcular estado del stock ---
def calcular_estado(stock_actual: int, stock_minimo: int) -> str:
    """
    Retorna el estado visual del stock.
    Analogía: el semáforo de la bodega — rojo, amarillo o verde.
    """
    if stock_minimo == 0:
        return "ok"
    if stock_actual < stock_minimo:
        return "critico"
    if stock_actual < stock_minimo * 1.5:
        return "alerta"
    return "ok"


# ============================================================
# GET /productos
# Lista todos los productos activos
# ============================================================
@router.get("/", response_model=List[schemas.ProductoRespuesta])
def listar_productos(
    categoria: Optional[str] = None,    # Filtro opcional por categoría
    estado: Optional[str] = None,       # Filtro: 'ok' | 'alerta' | 'critico'
    buscar: Optional[str] = None,       # Búsqueda por nombre o código
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Lista todos los productos con filtros opcionales."""
    query = db.query(models.Producto).filter(models.Producto.activo == True)

    # Aplicar filtro de búsqueda por nombre o código
    if buscar:
        query = query.filter(
            models.Producto.nombre.ilike(f"%{buscar}%") |
            models.Producto.codigo.ilike(f"%{buscar}%")
        )

    # Aplicar filtro por categoría
    if categoria:
        query = query.filter(models.Producto.categoria == categoria)

    productos = query.order_by(models.Producto.nombre).all()

    # Agregar estado calculado a cada producto
    resultado = []
    for p in productos:
        p_dict = {
            "id": p.id, "nombre": p.nombre, "codigo": p.codigo,
            "categoria": p.categoria, "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo, "precio_compra": p.precio_compra,
            "precio_venta": p.precio_venta, "activo": p.activo,
            "created_at": p.created_at,
            "estado": calcular_estado(p.stock_actual, p.stock_minimo)
        }
        # Filtrar por estado si se solicitó
        if estado is None or p_dict["estado"] == estado:
            resultado.append(p_dict)

    return resultado


# ============================================================
# GET /productos/{id}
# Obtiene un producto por su ID
# ============================================================
@router.get("/{producto_id}", response_model=schemas.ProductoRespuesta)
def obtener_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Obtiene un producto específico por ID."""
    producto = db.query(models.Producto).filter(
        models.Producto.id == producto_id,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    return {**producto.__dict__, "estado": calcular_estado(producto.stock_actual, producto.stock_minimo)}


# ============================================================
# POST /productos
# Crea un producto nuevo
# ============================================================
@router.post("/", response_model=schemas.ProductoRespuesta, status_code=201)
def crear_producto(
    datos: schemas.ProductoCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Crea un producto nuevo en el inventario.
    Si el código ya existe retorna error 400.
    """
    # Verificar código duplicado
    if datos.codigo:
        existe = db.query(models.Producto).filter(
            models.Producto.codigo == datos.codigo
        ).first()
        if existe:
            raise HTTPException(status_code=400, detail="El código ya está en uso")

    nuevo = models.Producto(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return {**nuevo.__dict__, "estado": calcular_estado(nuevo.stock_actual, nuevo.stock_minimo)}


# ============================================================
# PUT /productos/{id}
# Actualiza los datos de un producto
# ============================================================
@router.put("/{producto_id}", response_model=schemas.ProductoRespuesta)
def actualizar_producto(
    producto_id: int,
    datos: schemas.ProductoActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Actualiza los campos de un producto existente."""
    producto = db.query(models.Producto).filter(
        models.Producto.id == producto_id,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Actualizar solo los campos que vienen en el request
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(producto, campo, valor)

    db.commit()
    db.refresh(producto)

    return {**producto.__dict__, "estado": calcular_estado(producto.stock_actual, producto.stock_minimo)}


# ============================================================
# DELETE /productos/{id}
# Elimina lógicamente un producto (soft delete)
# Analogía: no se borra de la BD, solo se marca como inactivo
# ============================================================
@router.delete("/{producto_id}", response_model=schemas.MensajeRespuesta)
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Desactiva un producto (no lo borra físicamente de la BD)."""
    producto = db.query(models.Producto).filter(
        models.Producto.id == producto_id,
        models.Producto.activo == True
    ).first()

    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    producto.activo = False
    db.commit()

    return {"mensaje": f"Producto '{producto.nombre}' eliminado correctamente", "ok": True}
