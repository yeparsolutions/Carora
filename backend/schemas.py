# ============================================================
# YEPARSTOCK - Schemas de validación
# Archivo: backend/schemas.py
# Descripcion: Define la estructura de datos que entra y sale
# Analogia: el formulario que el cliente debe llenar —
#           define qué campos son obligatorios y qué tipo tienen
# ============================================================

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ============================================================
# AUTENTICACION
# ============================================================

class UsuarioCrear(BaseModel):
    nombre:   str
    email:    EmailStr
    password: str

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class UsuarioRespuesta(BaseModel):
    id:         int
    nombre:     str
    email:      str
    activo:     bool
    created_at: datetime

    class Config:
        from_attributes = True

class TokenRespuesta(BaseModel):
    access_token: str
    token_type:   str
    usuario:      UsuarioRespuesta

# ✅ NUEVO: para el endpoint PUT /auth/perfil
class PerfilActualizar(BaseModel):
    """
    Datos opcionales para actualizar el perfil del usuario.
    Analogia: el formulario de cambio de datos en el banco —
    solo llenas los campos que quieres modificar.
    """
    nombre:          Optional[str]      = None
    email:           Optional[EmailStr] = None
    password_actual: Optional[str]      = None
    password_nuevo:  Optional[str]      = None


# ============================================================
# ONBOARDING — datos de bienvenida del usuario nuevo
# ✅ NUEVO: se guarda en tabla configuracion
# ============================================================

class OnboardingDatos(BaseModel):
    """
    Datos que el usuario completa en el onboarding inicial.
    Analogia: el formulario de check-in del hotel —
    antes de entrar a tu cuarto debes registrar tus datos.
    """
    nombre_negocio: Optional[str] = None
    rubro:          Optional[str] = None
    moneda:         Optional[str] = "CLP"
    logo_base64:    Optional[str] = None
    nombre_usuario: Optional[str] = None


# ============================================================
# CONFIGURACION
# ============================================================

class ConfiguracionRespuesta(BaseModel):
    id:                  int
    usuario_id:          int
    nombre_negocio:      Optional[str] = "Mi Negocio"
    moneda:              Optional[str] = "CLP"
    color_principal:     Optional[str] = "#00C77B"
    logo_base64:         Optional[str] = None
    rubro:               Optional[str] = None
    nombre_usuario:      Optional[str] = None
    onboarding_completo: Optional[bool] = False
    updated_at:          Optional[datetime] = None

    class Config:
        from_attributes = True

class ConfiguracionActualizar(BaseModel):
    nombre_negocio:  Optional[str] = None
    moneda:          Optional[str] = None
    color_principal: Optional[str] = None
    logo_base64:     Optional[str] = None
    rubro:           Optional[str] = None
    nombre_usuario:  Optional[str] = None


# ============================================================
# PRODUCTOS
# ============================================================

class ProductoCrear(BaseModel):
    nombre:              str
    codigo_barra:        Optional[str]   = None
    codigo:              Optional[str]   = None
    categoria:           Optional[str]   = None
    marca:               Optional[str]   = None
    proveedor:           Optional[str]   = None
    stock_actual:        Optional[int]   = 0
    stock_minimo:        Optional[int]   = 0
    precio_compra:       Optional[float] = 0.0
    precio_venta:        Optional[float] = 0.0
    porcentaje_ganancia: Optional[float] = 0.0
    fecha_vencimiento:   Optional[datetime] = None
    dias_alerta_venc:    Optional[int]   = 30
    lote:                Optional[str]   = None

class ProductoActualizar(BaseModel):
    nombre:              Optional[str]   = None
    codigo_barra:        Optional[str]   = None
    codigo:              Optional[str]   = None
    categoria:           Optional[str]   = None
    marca:               Optional[str]   = None
    proveedor:           Optional[str]   = None
    stock_minimo:        Optional[int]   = None
    precio_compra:       Optional[float] = None
    precio_venta:        Optional[float] = None
    porcentaje_ganancia: Optional[float] = None
    fecha_vencimiento:   Optional[datetime] = None
    dias_alerta_venc:    Optional[int]   = None
    lote:                Optional[str]   = None

class ProductoRespuesta(BaseModel):
    id:                  int
    nombre:              str
    codigo_barra:        Optional[str]   = None
    codigo:              Optional[str]   = None
    categoria:           Optional[str]   = None
    marca:               Optional[str]   = None
    proveedor:           Optional[str]   = None
    stock_actual:        int
    stock_minimo:        int
    precio_compra:       float
    precio_venta:        float
    porcentaje_ganancia: float
    fecha_vencimiento:   Optional[datetime] = None
    dias_alerta_venc:    Optional[int]   = 30
    lote:                Optional[str]   = None
    activo:              bool
    created_at:          Optional[datetime] = None
    estado:              Optional[str]   = None
    estado_venc:         Optional[str]   = None

    class Config:
        from_attributes = True


# ============================================================
# MOVIMIENTOS
# ============================================================

class MovimientoCrear(BaseModel):
    producto_id: int
    tipo:        str
    cantidad:    int
    nota:        Optional[str] = None
    lote:        Optional[str] = None

class MovimientoRespuesta(BaseModel):
    id:              int
    producto_id:     Optional[int]      = None
    usuario_id:      int
    tipo:            str
    cantidad:        int
    stock_anterior:  int
    stock_nuevo:     int
    nota:            Optional[str]      = None
    lote:            Optional[str]      = None
    created_at:      Optional[datetime] = None
    producto_nombre: Optional[str]      = None
    usuario_nombre:  Optional[str]      = None

    class Config:
        from_attributes = True


# ============================================================
# SALIDAS
# ============================================================

class SalidaCrear(BaseModel):
    producto_id:      int
    tipo_salida:      str
    cantidad:         int
    precio_unitario:  Optional[float]    = None
    motivo:           Optional[str]      = None
    numero_documento: Optional[str]      = None
    codigo_barra_scan:Optional[str]      = None
    lote:             Optional[str]      = None
    fecha_vencimiento:Optional[datetime] = None

class SalidaPorScan(BaseModel):
    codigo_barra:     str
    tipo_salida:      str
    cantidad:         int
    precio_unitario:  Optional[float] = None
    motivo:           Optional[str]   = None
    numero_documento: Optional[str]   = None

class SalidaActualizarEstado(BaseModel):
    nuevo_estado:    str
    resolucion_nota: Optional[str] = None

class SalidaRespuesta(BaseModel):
    id:                          int
    producto_id:                 Optional[int]      = None
    usuario_id:                  int
    cantidad:                    int
    stock_anterior:              int
    stock_nuevo:                 int
    tipo_salida:                 str
    motivo:                      Optional[str]      = None
    numero_documento:            Optional[str]      = None
    codigo_barra_scan:           Optional[str]      = None
    precio_unitario:             float
    valor_total:                 float
    estado:                      str
    estado_anterior:             Optional[str]      = None
    resolucion_nota:             Optional[str]      = None
    resolucion_at:               Optional[datetime] = None
    lote:                        Optional[str]      = None
    fecha_vencimiento:           Optional[datetime] = None
    created_at:                  Optional[datetime] = None
    updated_at:                  Optional[datetime] = None
    producto_nombre:             Optional[str]      = None
    usuario_nombre:              Optional[str]      = None
    resolucion_usuario_nombre:   Optional[str]      = None

    class Config:
        from_attributes = True

class ResumenSalidas(BaseModel):
    total_ventas:                 int
    total_mermas:                 int
    total_cuarentenas:            int
    total_devoluciones:           int
    cuarentenas_pendientes:       int
    valor_ventas:                 float
    valor_mermas:                 float
    valor_cuarentenas_pendientes: float


# ============================================================
# UTILIDADES
# ============================================================

class MensajeRespuesta(BaseModel):
    mensaje: str
    ok:      bool