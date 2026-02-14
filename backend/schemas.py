# ============================================================
# STOCKYA — Schemas de validación
# Archivo: backend/schemas.py
# Descripción: Define qué datos se esperan en cada request/response
# Analogía: es el "formulario" que define qué campos son
#           obligatorios y de qué tipo deben ser
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
    # Lo que devuelve la API (sin la contraseña)
    id: int
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True   # Permite convertir objeto SQLAlchemy a dict


# ============================================================
# SCHEMAS: LOGIN / AUTH
# ============================================================

class LoginRequest(BaseModel):
    # Datos que envía el frontend al hacer login
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
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    stock_actual: int = 0
    stock_minimo: int = 0
    precio_compra: float = 0.0
    precio_venta: float = 0.0

class ProductoCrear(ProductoBase):
    # Datos para crear un producto nuevo
    pass

class ProductoActualizar(BaseModel):
    # Todos los campos son opcionales al actualizar
    nombre: Optional[str] = None
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    stock_minimo: Optional[int] = None
    precio_compra: Optional[float] = None
    precio_venta: Optional[float] = None

class ProductoRespuesta(ProductoBase):
    # Lo que devuelve la API
    id: int
    activo: bool
    created_at: datetime
    # Campo calculado: estado del stock
    estado: Optional[str] = None   # 'ok' | 'alerta' | 'critico'

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: MOVIMIENTO
# ============================================================

class MovimientoBase(BaseModel):
    producto_id: int
    tipo: str          # 'entrada' o 'salida'
    cantidad: int
    nota: Optional[str] = None

class MovimientoCrear(MovimientoBase):
    # Datos para registrar un movimiento nuevo
    pass

class MovimientoRespuesta(BaseModel):
    # Lo que devuelve la API
    id: int
    producto_id: int
    usuario_id: int
    tipo: str
    cantidad: int
    stock_anterior: int
    stock_nuevo: int
    nota: Optional[str]
    created_at: datetime
    # Datos del producto relacionado (nombre para mostrar en tabla)
    producto_nombre: Optional[str] = None
    usuario_nombre: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: CONFIGURACIÓN
# ============================================================

class ConfiguracionBase(BaseModel):
    nombre_negocio: Optional[str] = "Mi Negocio"
    moneda: Optional[str] = "CLP"
    color_principal: Optional[str] = "#00C77B"
    logo_base64: Optional[str] = None

class ConfiguracionActualizar(ConfiguracionBase):
    # Datos para actualizar la configuración del negocio
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
    total_criticos: int           # Stock por debajo del mínimo
    total_alertas: int            # Stock cerca del mínimo (< mínimo * 1.5)
    productos_criticos: list[ProductoRespuesta]
    productos_alerta: list[ProductoRespuesta]


# ============================================================
# SCHEMAS: RESPUESTAS GENERALES
# ============================================================

class MensajeRespuesta(BaseModel):
    # Respuesta simple con mensaje de éxito o error
    mensaje: str
    ok: bool = True
