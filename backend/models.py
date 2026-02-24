# ============================================================
# STOCKYA - Modelos de base de datos
# Archivo: backend/models.py
# Descripcion: Define las tablas de PostgreSQL usando SQLAlchemy
# Analogia: cada clase es como el diseño de una hoja de Excel —
#           define qué columnas tiene cada tabla
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
    # Analogia: como los tipos de membresía de un gimnasio
    basico = "basico"  # 1 usuario, hasta 200 productos
    pro    = "pro"     # hasta 3 usuarios, hasta 1500 productos

class RolUsuario(str, enum.Enum):
    # Analogia: el admin es el dueño del negocio, el operador es el empleado
    admin    = "admin"     # puede configurar, agregar usuarios y ver todo
    operador = "operador"  # puede registrar ventas y movimientos


# ============================================================
# TABLA: empresas
# Nueva tabla central — todos los datos pertenecen a una empresa
# Analogia: es el "edificio de oficinas" que contiene todo
# ============================================================
class Empresa(Base):
    __tablename__ = "empresas"

    id                 = Column(Integer, primary_key=True, index=True)
    nombre             = Column(String(150), nullable=False)
    rubro              = Column(String(100), nullable=True)
    moneda             = Column(String(10), default="CLP")
    color_principal    = Column(String(10), default="#00C77B")
    logo_base64        = Column(Text, nullable=True)

    # Plan y suscripción
    plan               = Column(Enum(PlanEmpresa, name="plan_empresa_enum"), default=PlanEmpresa.basico)
    plan_precio        = Column(Float, default=0.0)          # precio que paga
    plan_es_fundador   = Column(Boolean, default=False)       # precio especial fundador
    plan_activo        = Column(Boolean, default=True)        # si está al día con el pago
    plan_expira        = Column(DateTime(timezone=True), nullable=True)  # fecha de vencimiento
    cancelado_en       = Column(DateTime(timezone=True), nullable=True)  # cuando se canceló
    gracia_hasta       = Column(DateTime(timezone=True), nullable=True)  # 1 semana solo lectura
    stripe_customer_id = Column(String(100), nullable=True)   # ID en Stripe

    # Límites según plan
    # Analogia: el plan básico es como un estacionamiento de 500 espacios
    max_usuarios       = Column(Integer, default=1)           # 1 básico, 3 premium
    max_productos      = Column(Integer, default=500)         # 500 básico, 0=ilimitado premium

    onboarding_completo = Column(Boolean, default=False)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    updated_at         = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    usuarios   = relationship("Usuario", back_populates="empresa")
    productos  = relationship("Producto", back_populates="empresa")
    movimientos = relationship("Movimiento", back_populates="empresa")
    salidas    = relationship("Salida", back_populates="empresa", foreign_keys="Salida.empresa_id")


# ============================================================
# TABLA: usuarios
# ============================================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True, index=True)
    empresa_id    = Column(Integer, ForeignKey("empresas.id"), nullable=True, index=True)
    nombre        = Column(String(100), nullable=False)
    email         = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    rol           = Column(Enum(RolUsuario, name="rol_usuario_enum"), default=RolUsuario.admin)
    activo        = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    empresa       = relationship("Empresa", back_populates="usuarios")
    movimientos   = relationship("Movimiento", back_populates="usuario")
    salidas       = relationship(
                        "Salida",
                        back_populates="usuario",
                        foreign_keys="Salida.usuario_id"
                    )


# ============================================================
# TABLA: productos
# Ahora pertenecen a la empresa, no al usuario individual
# Analogia: los productos son del negocio, no del empleado
# ============================================================
class Producto(Base):
    __tablename__ = "productos"

    id                  = Column(Integer, primary_key=True, index=True)

    # Pertenece a la empresa (antes era usuario_id)
    empresa_id          = Column(Integer, ForeignKey("empresas.id"), nullable=True, index=True)

    # Mantener usuario_id para compatibilidad (quien lo creó)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)

    nombre              = Column(String(200), nullable=False)
    codigo_barra        = Column(String(100), nullable=True, index=True)
    codigo              = Column(String(50), nullable=True)
    categoria           = Column(String(100), nullable=True)
    marca               = Column(String(100), nullable=True)
    proveedor           = Column(String(150), nullable=True)
    stock_actual        = Column(Integer, default=0)
    stock_minimo        = Column(Integer, default=0)
    precio_compra       = Column(Float, default=0.0)
    precio_venta        = Column(Float, default=0.0)
    porcentaje_ganancia = Column(Float, default=0.0)
    fecha_vencimiento   = Column(DateTime(timezone=True), nullable=True)
    dias_alerta_venc    = Column(Integer, default=30)
    lote                = Column(String(100), nullable=True)
    activo              = Column(Boolean, default=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    # Unicidad por empresa (no por usuario individual)
    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo_barra", name="uq_producto_empresa_codigo"),
    )

    # Relaciones
    empresa     = relationship("Empresa", back_populates="productos")
    usuario     = relationship("Usuario")
    movimientos = relationship("Movimiento", back_populates="producto")
    salidas     = relationship(
                    "Salida",
                    back_populates="producto",
                    foreign_keys="Salida.producto_id"
                  )


# ============================================================
# TABLA: movimientos
# ============================================================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id             = Column(Integer, primary_key=True, index=True)
    empresa_id     = Column(Integer, ForeignKey("empresas.id"), nullable=True, index=True)
    producto_id    = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo           = Column(String(10), nullable=False)
    cantidad       = Column(Integer, nullable=False)
    stock_anterior = Column(Integer, nullable=False)
    stock_nuevo    = Column(Integer, nullable=False)
    nota           = Column(String(255), nullable=True)
    lote           = Column(String(100), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    empresa  = relationship("Empresa", back_populates="movimientos")
    producto = relationship("Producto", back_populates="movimientos")
    usuario  = relationship("Usuario", back_populates="movimientos")


# ============================================================
# TABLA: salidas
# ============================================================
class Salida(Base):
    __tablename__ = "salidas"

    id                    = Column(Integer, primary_key=True, index=True)
    empresa_id            = Column(Integer, ForeignKey("empresas.id"), nullable=True, index=True)
    producto_id           = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id            = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    resolucion_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    cantidad              = Column(Integer, nullable=False)
    stock_anterior        = Column(Integer, nullable=False)
    stock_nuevo           = Column(Integer, nullable=False)

    tipo_salida           = Column(Enum(TipoSalida,  name="tipo_salida_enum"),  nullable=False)
    motivo                = Column(String(255), nullable=True)
    numero_documento      = Column(String(100), nullable=True)
    codigo_barra_scan     = Column(String(100), nullable=True)

    precio_unitario       = Column(Float, default=0.0)
    valor_total           = Column(Float, default=0.0)
    metodo_pago           = Column(String(50), default="efectivo")   # efectivo, debito, credito, transferencia, cheque, fiado
    cliente_nombre        = Column(String(150), nullable=True)        # nombre del cliente (opcional)

    estado                = Column(
                                Enum(EstadoSalida, name="estado_salida_enum"),
                                default=EstadoSalida.activo,
                                nullable=False
                            )
    estado_anterior       = Column(String(50), nullable=True)
    resolucion_nota       = Column(String(255), nullable=True)
    resolucion_at         = Column(DateTime(timezone=True), nullable=True)
    lote                  = Column(String(100), nullable=True)
    fecha_vencimiento     = Column(DateTime(timezone=True), nullable=True)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    updated_at            = Column(DateTime(timezone=True), onupdate=func.now())

    empresa            = relationship("Empresa", back_populates="salidas", foreign_keys=[empresa_id])
    producto           = relationship("Producto", back_populates="salidas", foreign_keys=[producto_id])
    usuario            = relationship("Usuario", back_populates="salidas", foreign_keys=[usuario_id])
    resolucion_usuario = relationship("Usuario", foreign_keys=[resolucion_usuario_id])


# ============================================================
# TABLA: configuracion
# Ahora apunta a empresa, no a usuario
# ============================================================
class Configuracion(Base):
    __tablename__ = "configuracion"

    id                  = Column(Integer, primary_key=True, index=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), unique=True, nullable=True)
    nombre_negocio      = Column(String(150), default="Mi Negocio")
    moneda              = Column(String(10), default="CLP")
    color_principal     = Column(String(10), default="#00C77B")
    logo_base64         = Column(Text, nullable=True)
    rubro               = Column(String(100), nullable=True)
    nombre_usuario      = Column(String(150), nullable=True)
    onboarding_completo = Column(Boolean, default=False)
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    usuario = relationship("Usuario")


# ============================================================
# TABLA: fiados
# Analogia: el cuaderno de deudas del almacén hecho digital —
# cada fila es una venta que quedó pendiente de cobro
# ============================================================
class Fiado(Base):
    __tablename__ = "fiados"

    id              = Column(Integer, primary_key=True, index=True)
    empresa_id      = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    salida_id       = Column(Integer, ForeignKey("salidas.id", ondelete="SET NULL"), nullable=True)
    cliente_nombre  = Column(String(150), nullable=False)
    monto_total     = Column(Float, default=0.0)
    monto_pagado    = Column(Float, default=0.0)
    estado          = Column(String(20), default="pendiente")  # pendiente, pagado_parcial, pagado
    nota            = Column(String(255), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    empresa = relationship("Empresa")
    salida  = relationship("Salida", foreign_keys=[salida_id])