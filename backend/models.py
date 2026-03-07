# ============================================================
# YEPARSTOCK - Modelos de base de datos
# Archivo: backend/models.py
# ============================================================
# CAMBIOS v2 — Multi-sucursal Plan Pro:
#   ✅ Nuevo enum: RolUsuario agrega "lider"
#   ✅ Nueva tabla: Sucursal (máx 3 por empresa en plan Pro)
#   ✅ Usuario ahora tiene sucursal_id (FK opcional)
#   ✅ Empresa tiene max_sucursales según plan
# ============================================================

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ============================================================
# ENUMS
# ============================================================

class TipoSalida(str, enum.Enum):
    venta                = "venta"
    merma                = "merma"
    cuarentena           = "cuarentena"
    devolucion_proveedor = "devolucion_proveedor"

class EstadoSalida(str, enum.Enum):
    activo            = "activo"
    en_revision       = "en_revision"
    reingresado       = "reingresado"
    descartado        = "descartado"
    enviado_proveedor = "enviado_proveedor"

class PlanEmpresa(str, enum.Enum):
    gratis = "gratis"
    basico = "basico"
    pro    = "pro"

class RolUsuario(str, enum.Enum):
    admin    = "admin"
    lider    = "lider"      # ✅ NUEVO: gerente de sucursal
    operador = "operador"


# ============================================================
# TABLA: empresas
# ============================================================
class Empresa(Base):
    __tablename__ = "empresas"

    id                 = Column(Integer, primary_key=True, index=True)
    nombre             = Column(String(150), nullable=False)
    rubro              = Column(String(100), nullable=True)
    moneda             = Column(String(10), default="CLP")
    color_principal    = Column(String(10), default="#00C77B")
    logo_base64        = Column(Text, nullable=True)

    plan               = Column(Enum(PlanEmpresa, name="plan_empresa_enum"), default=PlanEmpresa.basico)
    plan_precio        = Column(Float, default=0.0)
    plan_es_fundador   = Column(Boolean, default=False)
    plan_activo        = Column(Boolean, default=True)
    plan_expira        = Column(DateTime(timezone=True), nullable=True)
    cancelado_en       = Column(DateTime(timezone=True), nullable=True)
    gracia_hasta       = Column(DateTime(timezone=True), nullable=True)
    stripe_customer_id = Column(String(100), nullable=True)

    max_usuarios       = Column(Integer, default=1)
    max_productos      = Column(Integer, default=500)
    # ✅ NUEVO: límite de sucursales según plan
    # Analogía: el contrato de franquicia dice cuántos locales puedes abrir
    #   gratis/basico = 1 sucursal | pro = hasta 3
    max_sucursales     = Column(Integer, default=1)

    onboarding_completo = Column(Boolean, default=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), onupdate=func.now())

    usuarios    = relationship("Usuario",    back_populates="empresa")
    productos   = relationship("Producto",   back_populates="empresa")
    movimientos = relationship("Movimiento", back_populates="empresa")
    salidas     = relationship("Salida",     back_populates="empresa", foreign_keys="Salida.empresa_id")
    # ✅ NUEVO: relación con sucursales
    sucursales  = relationship("Sucursal",   back_populates="empresa", cascade="all, delete-orphan")


# ============================================================
# TABLA: sucursales  ✅ NUEVA
# Cada empresa Pro puede tener hasta 3 sucursales activas.
# Analogía: cada "piso" del hotel con su propio gerente (lider)
# ============================================================
class Sucursal(Base):
    __tablename__ = "sucursales"

    id         = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)

    nombre     = Column(String(150), nullable=False)      # Ej: "Sucursal Centro", "Local Norte"
    direccion  = Column(String(255), nullable=True)       # Dirección física
    telefono   = Column(String(50),  nullable=True)       # Teléfono local
    activa     = Column(Boolean, default=True)            # Para desactivar sin borrar

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    empresa  = relationship("Empresa",  back_populates="sucursales")
    usuarios = relationship("Usuario",  back_populates="sucursal")     # colaboradores de esta sucursal

    __table_args__ = (
        # No puede haber dos sucursales con el mismo nombre dentro de la misma empresa
        UniqueConstraint("empresa_id", "nombre", name="uq_sucursal_empresa_nombre"),
    )


# ============================================================
# TABLA: usuarios
# ✅ CAMBIOS:
#   - rol agrega "lider"
#   - sucursal_id: FK a sucursales (null = ve toda la empresa = admin)
# ============================================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id                  = Column(Integer, primary_key=True, index=True)
    empresa_id          = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ✅ NUEVO: a qué sucursal pertenece este usuario
    # Si es None → es admin y ve TODA la empresa
    # Si tiene valor → solo ve y opera en ESA sucursal
    # Analogía: el carnet del empleado dice en qué piso trabaja
    sucursal_id         = Column(Integer, ForeignKey("sucursales.id", ondelete="SET NULL"), nullable=True, index=True)

    nombre              = Column(String(100), nullable=False)
    apellido            = Column(String(100), nullable=True)
    email               = Column(String(150), unique=True, nullable=True, index=True)
    username            = Column(String(50),  nullable=True, index=True)
    password_hash       = Column(String(255), nullable=False)

    # ✅ CAMBIO: rol ahora incluye "lider"
    rol                 = Column(Enum(RolUsuario, name="rol_usuario_enum"), default=RolUsuario.operador)

    activo              = Column(Boolean, default=True)
    email_verificado    = Column(Boolean, default=False)
    codigo_verificacion = Column(String(10), nullable=True)
    color_interfaz      = Column(String(10), nullable=True)
    sonido_escaner      = Column(String(20), nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    empresa     = relationship("Empresa",       back_populates="usuarios")
    sucursal    = relationship("Sucursal",       back_populates="usuarios")   # ✅ NUEVO
    movimientos = relationship("Movimiento",     back_populates="usuario")
    salidas     = relationship("Salida",         back_populates="usuario", foreign_keys="Salida.usuario_id")
    permisos    = relationship("PermisoUsuario", back_populates="usuario", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("empresa_id", "username", name="uq_usuario_empresa_username"),
    )


# ============================================================
# TABLA: permisos_usuario
# Sin cambios — ya funciona bien por sección
# ============================================================
class PermisoUsuario(Base):
    __tablename__ = "permisos_usuario"

    id         = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    seccion    = Column(String(50), nullable=False)
    permitido  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("Usuario", back_populates="permisos")

    __table_args__ = (
        UniqueConstraint("usuario_id", "seccion", name="uq_permiso_usuario_seccion"),
    )


# ============================================================
# TABLA: productos
# ✅ CAMBIO: agrega sucursal_id para inventario por sucursal
# ============================================================
class Producto(Base):
    __tablename__ = "productos"

    id                  = Column(Integer, primary_key=True, index=True)
    empresa_id          = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=True,  index=True)

    # ✅ NUEVO: productos pueden ser de una sucursal específica
    # Si es None → producto compartido entre todas las sucursales
    # Si tiene valor → stock exclusivo de esa sucursal
    sucursal_id         = Column(Integer, ForeignKey("sucursales.id", ondelete="SET NULL"), nullable=True, index=True)

    nombre              = Column(String(200), nullable=False)
    codigo_barra        = Column(String(100), nullable=True, index=True)
    codigo              = Column(String(50),  nullable=True)
    categoria           = Column(String(100), nullable=True)
    marca               = Column(String(100), nullable=True)
    proveedor           = Column(String(150), nullable=True)
    stock_actual        = Column(Integer, default=0)
    stock_minimo        = Column(Integer, default=0)
    precio_compra       = Column(Float,   default=0.0)
    precio_venta        = Column(Float,   default=0.0)
    porcentaje_ganancia = Column(Float,   default=0.0)
    fecha_vencimiento   = Column(DateTime(timezone=True), nullable=True)
    dias_alerta_venc    = Column(Integer, default=30)
    lote                = Column(String(100), nullable=True)
    activo              = Column(Boolean, default=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo_barra", name="uq_producto_empresa_codigo"),
    )

    empresa     = relationship("Empresa",    back_populates="productos")
    usuario     = relationship("Usuario")
    sucursal    = relationship("Sucursal")                                # ✅ NUEVO
    movimientos = relationship("Movimiento", back_populates="producto")
    salidas     = relationship("Salida",     back_populates="producto", foreign_keys="Salida.producto_id")


# ============================================================
# TABLA: movimientos
# ✅ CAMBIO: agrega sucursal_id para trazabilidad por local
# ============================================================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id             = Column(Integer, primary_key=True, index=True)
    empresa_id     = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    producto_id    = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    # ✅ NUEVO: en qué sucursal ocurrió este movimiento
    sucursal_id    = Column(Integer, ForeignKey("sucursales.id", ondelete="SET NULL"), nullable=True, index=True)
    tipo           = Column(String(10),  nullable=False)
    cantidad       = Column(Integer,     nullable=False)
    stock_anterior = Column(Integer,     nullable=False)
    stock_nuevo    = Column(Integer,     nullable=False)
    nota           = Column(String(255), nullable=True)
    lote           = Column(String(100), nullable=True)
    num_documento  = Column(String(100), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    empresa  = relationship("Empresa",  back_populates="movimientos")
    producto = relationship("Producto", back_populates="movimientos")
    usuario  = relationship("Usuario",  back_populates="movimientos")
    sucursal = relationship("Sucursal")                                   # ✅ NUEVO


# ============================================================
# TABLA: salidas
# ✅ CAMBIO: agrega sucursal_id para ventas por local
# ============================================================
class Salida(Base):
    __tablename__ = "salidas"

    id                    = Column(Integer, primary_key=True, index=True)
    empresa_id            = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    producto_id           = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id            = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    resolucion_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    # ✅ NUEVO: en qué sucursal se realizó esta salida/venta
    sucursal_id           = Column(Integer, ForeignKey("sucursales.id", ondelete="SET NULL"), nullable=True, index=True)
    cantidad              = Column(Integer, nullable=False)
    stock_anterior        = Column(Integer, nullable=False)
    stock_nuevo           = Column(Integer, nullable=False)
    tipo_salida           = Column(Enum(TipoSalida,   name="tipo_salida_enum"),  nullable=False)
    motivo                = Column(String(255), nullable=True)
    numero_documento      = Column(String(100), nullable=True)
    codigo_barra_scan     = Column(String(100), nullable=True)
    precio_unitario       = Column(Float, default=0.0)
    valor_total           = Column(Float, default=0.0)
    metodo_pago           = Column(String(50),  default="efectivo")
    cliente_nombre        = Column(String(150), nullable=True)
    estado                = Column(Enum(EstadoSalida, name="estado_salida_enum"), default=EstadoSalida.activo, nullable=False)
    estado_anterior       = Column(String(50),  nullable=True)
    resolucion_nota       = Column(String(255), nullable=True)
    resolucion_at         = Column(DateTime(timezone=True), nullable=True)
    lote                  = Column(String(100), nullable=True)
    fecha_vencimiento     = Column(DateTime(timezone=True), nullable=True)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    updated_at            = Column(DateTime(timezone=True), onupdate=func.now())

    empresa            = relationship("Empresa",  back_populates="salidas",  foreign_keys=[empresa_id])
    producto           = relationship("Producto", back_populates="salidas",  foreign_keys=[producto_id])
    usuario            = relationship("Usuario",  back_populates="salidas",  foreign_keys=[usuario_id])
    resolucion_usuario = relationship("Usuario",  foreign_keys=[resolucion_usuario_id])
    sucursal           = relationship("Sucursal")                             # ✅ NUEVO


# ============================================================
# TABLA: configuracion — sin cambios
# ============================================================
class Configuracion(Base):
    __tablename__ = "configuracion"

    id                  = Column(Integer, primary_key=True, index=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), unique=True, nullable=True)
    nombre_negocio      = Column(String(150), default="Mi Negocio")
    moneda              = Column(String(10),  default="CLP")
    color_principal     = Column(String(10),  default="#00C77B")
    logo_base64         = Column(Text, nullable=True)
    rubro               = Column(String(100), nullable=True)
    nombre_usuario      = Column(String(150), nullable=True)
    onboarding_completo = Column(Boolean, default=False)
    sonido_escaner      = Column(String(20), default="scanner")
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    usuario = relationship("Usuario")


# ============================================================
# TABLA: fiados — sin cambios en estructura
# ============================================================
class Fiado(Base):
    __tablename__ = "fiados"

    id             = Column(Integer, primary_key=True, index=True)
    empresa_id     = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    salida_id      = Column(Integer, ForeignKey("salidas.id", ondelete="SET NULL"), nullable=True)
    cliente_nombre = Column(String(150), nullable=False)
    monto_total    = Column(Float, default=0.0)
    monto_pagado   = Column(Float, default=0.0)
    estado         = Column(String(20), default="pendiente")
    nota           = Column(String(255), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa")
    salida  = relationship("Salida", foreign_keys=[salida_id])
