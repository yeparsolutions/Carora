# ============================================================
# STOCKYA – Router de Productos
# Archivo: backend/routers/productos.py
# Descripción: CRUD completo + búsqueda por código de barras
# ✅ ACTUALIZADO: filtra por empresa_id para soporte multiusuario
#    Todos los usuarios de la misma empresa ven el mismo inventario
#    Analogia: los productos son de la tienda, no del empleado
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/productos", tags=["Productos"])


def calcular_estado(stock_actual: int, stock_minimo: int) -> str:
    if stock_minimo == 0:
        return "ok"
    if stock_actual < stock_minimo:
        return "critico"
    if stock_actual < stock_minimo * 1.5:
        return "alerta"
    return "ok"


def calcular_estado_venc(fecha_venc, dias_alerta: int = 30) -> str:
    if not fecha_venc:
        return None
    ahora = datetime.now(timezone.utc)
    diff  = (fecha_venc - ahora).days
    if diff < 0:
        return "vencido"
    if diff <= dias_alerta:
        return "proximo"
    return "ok"


def producto_a_dict(p) -> dict:
    return {
        "id": p.id, "nombre": p.nombre,
        "codigo_barra": p.codigo_barra, "codigo": p.codigo,
        "categoria": p.categoria, "marca": p.marca, "proveedor": p.proveedor,
        "stock_actual": p.stock_actual, "stock_minimo": p.stock_minimo,
        "precio_compra": p.precio_compra, "precio_venta": p.precio_venta,
        "porcentaje_ganancia": p.porcentaje_ganancia,
        "fecha_vencimiento": p.fecha_vencimiento,
        "dias_alerta_venc": p.dias_alerta_venc,
        "lote": p.lote,
        "activo": p.activo, "created_at": p.created_at,
        "estado":      calcular_estado(p.stock_actual, p.stock_minimo),
        "estado_venc": calcular_estado_venc(p.fecha_vencimiento, p.dias_alerta_venc or 30),
    }


def get_empresa_id(usuario_actual: models.Usuario) -> int:
    """
    Obtiene el empresa_id del usuario actual.
    Analogia: saber a qué tienda pertenece el empleado antes de tocar el inventario.
    """
    if not usuario_actual.empresa_id:
        raise HTTPException(
            status_code=400,
            detail="Tu cuenta no está asociada a una empresa. Contacta al administrador."
        )
    return usuario_actual.empresa_id


# ============================================================
# GET /productos/buscar-codigo/{codigo_barra}
# ============================================================
@router.get("/buscar-codigo/{codigo_barra}", response_model=schemas.ProductoRespuesta)
def buscar_por_codigo_barra(
    codigo_barra: str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    # ✅ Busca por empresa — cualquier empleado de la empresa puede ver el producto
    empresa_id = get_empresa_id(usuario_actual)
    producto = db.query(models.Producto).filter(
        models.Producto.codigo_barra == codigo_barra,
        models.Producto.activo       == True,
        models.Producto.empresa_id   == empresa_id
    ).first()

    if not producto:
        raise HTTPException(
            status_code=404,
            detail=f"Producto con código {codigo_barra} no encontrado — puedes registrarlo como nuevo"
        )
    return producto_a_dict(producto)


# ============================================================
# GET /productos
# ============================================================
@router.get("/", response_model=List[schemas.ProductoRespuesta])
def listar_productos(
    categoria:   Optional[str] = None,
    estado:      Optional[str] = None,
    buscar:      Optional[str] = None,
    vencimiento: Optional[str] = None,
    db:          Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    # ✅ Lista todos los productos de la empresa
    empresa_id = get_empresa_id(usuario_actual)
    query = db.query(models.Producto).filter(
        models.Producto.activo     == True,
        models.Producto.empresa_id == empresa_id
    )

    if buscar:
        query = query.filter(
            models.Producto.nombre.ilike(f"%{buscar}%") |
            models.Producto.codigo_barra.ilike(f"%{buscar}%") |
            models.Producto.codigo.ilike(f"%{buscar}%")
        )
    if categoria:
        query = query.filter(models.Producto.categoria == categoria)

    productos = query.order_by(models.Producto.nombre).all()

    resultado = []
    for p in productos:
        d = producto_a_dict(p)
        if estado and d["estado"] != estado:
            continue
        if vencimiento and d["estado_venc"] != vencimiento:
            continue
        resultado.append(d)

    return resultado


# ============================================================
# GET /productos/{id}
# ============================================================
@router.get("/{producto_id}", response_model=schemas.ProductoRespuesta)
def obtener_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa_id = get_empresa_id(usuario_actual)
    p = db.query(models.Producto).filter(
        models.Producto.id         == producto_id,
        models.Producto.activo     == True,
        models.Producto.empresa_id == empresa_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return producto_a_dict(p)


# ============================================================
# POST /productos
# ============================================================
@router.post("/", response_model=schemas.ProductoRespuesta, status_code=201)
def crear_producto(
    datos: schemas.ProductoCrear,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa_id = get_empresa_id(usuario_actual)

    # ✅ Verificar límite de productos según el plan
    # Analogia: el plan basico es como un estacionamiento de 500 espacios
    empresa = db.query(models.Empresa).filter(models.Empresa.id == empresa_id).first()
    if empresa and empresa.max_productos > 0:
        total_productos = db.query(models.Producto).filter(
            models.Producto.empresa_id == empresa_id,
            models.Producto.activo     == True
        ).count()
        if total_productos >= empresa.max_productos:
            raise HTTPException(
                status_code=403,
                detail={
                    "tipo": "limite_plan",
                    "mensaje": f"Tu plan {empresa.plan} permite máximo {empresa.max_productos} productos. Actualiza a Premium para agregar más.",
                    "limite": empresa.max_productos,
                    "total_actual": total_productos
                }
            )

    # ✅ Verificar codigo de barras duplicado SOLO para esta empresa
    if datos.codigo_barra:
        existe = db.query(models.Producto).filter(
            models.Producto.codigo_barra == datos.codigo_barra,
            models.Producto.empresa_id   == empresa_id
        ).first()
        if existe:
            raise HTTPException(
                status_code=409,
                detail={
                    "tipo": "producto_existente",
                    "mensaje": f"El producto '{existe.nombre}' ya está registrado",
                    "producto_id": existe.id,
                    "nombre": existe.nombre,
                    "stock_actual": existe.stock_actual
                }
            )

    datos_dict = datos.model_dump()
    if datos_dict["porcentaje_ganancia"] > 0 and datos_dict["precio_compra"] > 0:
        datos_dict["precio_venta"] = round(
            datos_dict["precio_compra"] * (1 + datos_dict["porcentaje_ganancia"] / 100), 2
        )

    # ✅ Asignar empresa_id y usuario_id al crear
    nuevo = models.Producto(
        **datos_dict,
        empresa_id = empresa_id,
        usuario_id = usuario_actual.id   # quien lo creó
    )
    db.add(nuevo)
    db.flush()

    if nuevo.stock_actual > 0:
        mov_inicial = models.Movimiento(
            producto_id    = nuevo.id,
            empresa_id     = empresa_id,
            usuario_id     = usuario_actual.id,
            tipo           = "entrada",
            cantidad       = nuevo.stock_actual,
            stock_anterior = 0,
            stock_nuevo    = nuevo.stock_actual,
            nota           = "Stock inicial al crear el producto",
            lote           = nuevo.lote
        )
        db.add(mov_inicial)

    db.commit()
    db.refresh(nuevo)
    return producto_a_dict(nuevo)


# ============================================================
# PUT /productos/{id}
# ============================================================
@router.put("/{producto_id}", response_model=schemas.ProductoRespuesta)
def actualizar_producto(
    producto_id: int,
    datos: schemas.ProductoActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa_id = get_empresa_id(usuario_actual)
    p = db.query(models.Producto).filter(
        models.Producto.id         == producto_id,
        models.Producto.activo     == True,
        models.Producto.empresa_id == empresa_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    cambios = datos.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(p, campo, valor)

    if ("precio_compra" in cambios or "porcentaje_ganancia" in cambios):
        if p.porcentaje_ganancia > 0 and p.precio_compra > 0:
            p.precio_venta = round(p.precio_compra * (1 + p.porcentaje_ganancia / 100), 2)

    db.commit()
    db.refresh(p)
    return producto_a_dict(p)


# ============================================================
# DELETE /productos/{id}
# ============================================================
@router.delete("/{producto_id}", response_model=schemas.MensajeRespuesta)
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa_id = get_empresa_id(usuario_actual)
    p = db.query(models.Producto).filter(
        models.Producto.id         == producto_id,
        models.Producto.empresa_id == empresa_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    nombre = p.nombre

    if p.stock_actual > 0:
        mov_baja = models.Movimiento(
            producto_id    = producto_id,
            empresa_id     = empresa_id,
            usuario_id     = usuario_actual.id,
            tipo           = "salida",
            cantidad       = p.stock_actual,
            stock_anterior = p.stock_actual,
            stock_nuevo    = 0,
            nota           = f"Baja por eliminación del producto '{nombre}'",
            lote           = p.lote
        )
        db.add(mov_baja)
        db.flush()

    db.query(models.Movimiento).filter(
        models.Movimiento.producto_id == producto_id
    ).update({"producto_id": None}, synchronize_session=False)

    db.delete(p)
    db.commit()
    return {"mensaje": f"Producto '{nombre}' eliminado permanentemente", "ok": True}


# ============================================================
# POST /productos/{id}/sumar-stock
# ============================================================
@router.post("/{producto_id}/sumar-stock", response_model=schemas.ProductoRespuesta)
def sumar_stock_existente(
    producto_id: int,
    cantidad: int,
    lote: str = "",
    nota: str = "",
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa_id = get_empresa_id(usuario_actual)
    p = db.query(models.Producto).filter(
        models.Producto.id         == producto_id,
        models.Producto.empresa_id == empresa_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")

    stock_anterior = p.stock_actual
    p.stock_actual += cantidad

    if lote:
        p.lote = lote

    mov = models.Movimiento(
        producto_id    = producto_id,
        empresa_id     = empresa_id,
        usuario_id     = usuario_actual.id,
        tipo           = "entrada",
        cantidad       = cantidad,
        stock_anterior = stock_anterior,
        stock_nuevo    = p.stock_actual,
        nota           = nota or "Entrada por código de barras",
        lote           = lote or None
    )
    db.add(mov)
    db.commit()
    db.refresh(p)
    return producto_a_dict(p)