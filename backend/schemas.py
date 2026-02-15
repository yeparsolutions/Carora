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
    password: str

class UsuarioRespuesta(UsuarioBase):
    id: int
    activo: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: LOGIN / AUTH
# ============================================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenRespuesta(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioRespuesta


# ============================================================
# SCHEMAS: PRODUCTO
# ============================================================

class ProductoBase(BaseModel):
    nombre: str
    codigo_barra: Optional[str] = None
    codigo: Optional[str] = None
    categoria: Optional[str] = None
    marca: Optional[str] = None
    proveedor: Optional[str] = None
    stock_actual: int = 0
    stock_minimo: int = 0
    precio_compra: float = 0.0
    precio_venta: float = 0.0
    porcentaje_ganancia: float = 0.0
    fecha_vencimiento: Optional[datetime] = None
    dias_alerta_venc: int = 30
    lote: Optional[str] = None

class ProductoCrear(ProductoBase):
    pass

class ProductoActualizar(BaseModel):
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
    id: int
    activo: bool
    created_at: datetime
    estado: Optional[str] = None
    estado_venc: Optional[str] = None

    class Config:
        from_attributes = True


# ============================================================
# SCHEMAS: MOVIMIENTO (entradas)
# ============================================================

class MovimientoBase(BaseModel):
    producto_id: int
    tipo: str
    cantidad: int
    nota: Optional[str] = None
    lote: Optional[str] = None

class MovimientoCrear(MovimientoBase):
    pass

class MovimientoRespuesta(BaseModel):
    id: int
    producto_id: Optional[int] = None
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
# SCHEMAS: SALIDAS
# Analogia: el "formulario de egreso" que explica por que
#           salio el producto y en que estado queda
# ============================================================

class SalidaCrear(BaseModel):
    # Campos obligatorios
    producto_id: int
    tipo_salida: str            # venta | merma | cuarentena | devolucion_proveedor
    cantidad: int

    # Campos opcionales segun el tipo
    motivo: Optional[str] = None
    numero_documento: Optional[str] = None
    codigo_barra_scan: Optional[str] = None
    precio_unitario: Optional[float] = None
    lote: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None

class SalidaPorScan(BaseModel):
    # Para registrar desde escaner de codigo de barras o celular
    # Analogia: el cajero que pasa el producto y solo elige tipo + cantidad
    codigo_barra: str
    tipo_salida: str
    cantidad: int
    motivo: Optional[str] = None
    numero_documento: Optional[str] = None
    precio_unitario: Optional[float] = None

class SalidaActualizarEstado(BaseModel):
    # Para cambiar el estado de una cuarentena
    # Analogia: el supervisor que decide el destino del producto en cuarentena
    nuevo_estado: str           # reingresado | descartado | enviado_proveedor
    resolucion_nota: Optional[str] = None

class SalidaRespuesta(BaseModel):
    id: int
    producto_id: Optional[int] = None
    usuario_id: int
    cantidad: int
    stock_anterior: int
    stock_nuevo: int
    tipo_salida: str
    motivo: Optional[str] = None
    numero_documento: Optional[str] = None
    codigo_barra_scan: Optional[str] = None
    precio_unitario: float
    valor_total: float
    estado: str
    estado_anterior: Optional[str] = None
    resolucion_nota: Optional[str] = None
    resolucion_at: Optional[datetime] = None
    lote: Optional[str] = None
    fecha_vencimiento: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    producto_nombre: Optional[str] = None
    usuario_nombre: Optional[str] = None
    resolucion_usuario_nombre: Optional[str] = None

    class Config:
        from_attributes = True

class ResumenSalidas(BaseModel):
    # Dashboard rapido de salidas
    total_ventas: int
    total_mermas: int
    total_cuarentenas: int
    total_devoluciones: int
    cuarentenas_pendientes: int
    valor_ventas: float
    valor_mermas: float
    valor_cuarentenas_pendientes: float


# ============================================================
# SCHEMAS: CONFIGURACION
# ============================================================

class ConfiguracionBase(BaseModel):
    nombre_negocio: Optional[str] = "Mi Negocio"
    moneda: Optional[str] = "CLP"
    color_principal: Optional[str] = "#00C77B"
    logo_base64: Optional[str] = None

class ConfiguracionActualizar(ConfiguracionBase):
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
    total_criticos: int
    total_alertas: int
    productos_criticos: list[ProductoRespuesta]
    productos_alerta: list[ProductoRespuesta]


# ============================================================
# SCHEMAS: RESPUESTAS GENERALES
# ============================================================

class MensajeRespuesta(BaseModel):
    mensaje: str
    ok: bool = True