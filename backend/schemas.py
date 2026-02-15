# ============================================================
# STOCKYA - Schemas de validacion
# Archivo: backend/schemas.py
# Descripcion: Define que datos se esperan en cada request/response
# Analogia: es el "formulario" que define que campos son
#           obligatorios y de que tipo deben ser
# ============================================================

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ============================================================
# SCHEMAS: USUARIO
# ============================================================

class UsuarioBase(BaseModel):
    nombre: str
    email: EmailStr

class UsuarioCrear(UsuarioBase):
    # Se usa al registrar un usuario nuevo
    password: str

class UsuarioRespuesta(UsuarioBase):
    # Lo que devuelve la API (sin la contrasena)
    id: int
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True   # Permite convertir objeto SQLAlchemy a dict


# ============================================================
# SCHEMAS: LOGIN / AUTH
# ============================================================

class LoginRequest(BaseModel):
    # Datos que envia el frontend al hacer login
    email: EmailStr
    password: str

class TokenRespuesta(BaseModel):
    # Lo que devuelve la API al hacer login exitoso
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioRespuesta


# ============================================================
# SCHEMAS: PRODUCTO
# ============================================================

class ProductoBase(BaseModel):
    nombre: str
    codigo_barra: Optional[str] = None          # Codigo de barras EAN/UPC
    codigo: Optional[str] = None                # Codigo interno
    categoria: Optional[str] = None
    marca: Optional[str] = None
    proveedor: Optional[str] = None
    stock_actual: int = 0
    stock_minimo: int = 0
    precio_compra: float = 0.0
    precio_venta: float = 0.0
    porcentaje_ganancia: float = 0.0            # % ganancia sobre precio compra
    fecha_vencimiento: Optional[datetime] = None
    dias_alerta_venc: int = 30                  # Dias de anticipacion para alerta
    lote: Optional[str] = None                  # Numero de lote

class ProductoCrear(ProductoBase):
    # Datos para crear un producto nuevo
    pass

class ProductoActualizar(BaseModel):
    # Todos los campos son opcionales al actualizar
    nombre: Optional[str] = None
    codigo_barra: Optional[str] = None
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    marca: Optional[str] = None
    proveedor: Optional[str] = None
    stock_minimo: Optional[int] = None
    precio_compra: Optional[float] = None
    precio_venta: Optional[float] = None
    porcentaje_ganancia: Optional[float] = None
    fecha_vencimiento: Optional[datetime] = None
    dias_alerta_venc: Optional[int] = None
    lote: Optional[str] = None

class ProductoRespuesta(ProductoBase):
    # Lo que devuelve la API
    id: int
    activo: bool
    created_at: datetime
    estado: Optional[str] = None        # 'ok' | 'alerta' | 'critico'
    estado_venc: Optional[str] = None   # 'ok' | 'proximo' | 'vencido'

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: MOVIMIENTO
# ============================================================

class MovimientoBase(BaseModel):
    producto_id: int
    tipo: str                           # 'entrada' o 'salida'
    cantidad: int
    nota: Optional[str] = None
    lote: Optional[str] = None          # Numero de lote cuando aplica

class MovimientoCrear(MovimientoBase):
    # Datos para registrar un movimiento nuevo
    pass

class MovimientoRespuesta(BaseModel):
    # Lo que devuelve la API
    # producto_id es Optional porque el producto pudo haber sido eliminado
    # Analogia: es como una factura que menciona un producto que ya no esta en catalogo
    id: int
    producto_id: Optional[int] = None   # CORREGIDO: era int, fallaba con NULL en BD
    usuario_id: int
    tipo: str
    cantidad: int
    stock_anterior: int
    stock_nuevo: int
    nota: Optional[str] = None
    lote: Optional[str] = None
    created_at: datetime
    producto_nombre: Optional[str] = None
    usuario_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: CONFIGURACION
# ============================================================

class ConfiguracionBase(BaseModel):
    nombre_negocio: Optional[str] = "Mi Negocio"
    moneda: Optional[str] = "CLP"
    color_principal: Optional[str] = "#00C77B"
    logo_base64: Optional[str] = None

class ConfiguracionActualizar(ConfiguracionBase):
    # Datos para actualizar la configuracion del negocio
    pass

class ConfiguracionRespuesta(ConfiguracionBase):
    id: int
    usuario_id: int

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: ALERTAS
# ============================================================

class AlertaRespuesta(BaseModel):
    # Resumen de alertas del sistema
    total_criticos: int           # Stock por debajo del minimo
    total_alertas: int            # Stock cerca del minimo (< minimo * 1.5)
    productos_criticos: list[ProductoRespuesta]
    productos_alerta: list[ProductoRespuesta]


# ============================================================
# SCHEMAS: RESPUESTAS GENERALES
# ============================================================

class MensajeRespuesta(BaseModel):
    # Respuesta simple con mensaje de exito o error
    mensaje: str
    ok: bool = True