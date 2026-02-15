# ============================================================
# STOCKYA - Modelos de base de datos
# Archivo: backend/models.py
# Descripcion: Define las tablas de PostgreSQL usando SQLAlchemy
# Analogia: cada clase es como el diseno de una hoja de Excel -
#           define que columnas tiene cada tabla
# ============================================================

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ============================================================
# ENUMS - Tipos controlados para salidas y estados
# ============================================================

class TipoSalida(str, enum.Enum):
    venta                = "venta"
    merma                = "merma"
    cuarentena           = "cuarentena"
    devolucion_proveedor = "devolucion_proveedor"

class EstadoSalida(str, enum.Enum):
    activo             = "activo"
    en_revision        = "en_revision"
    reingresado        = "reingresado"
    descartado         = "descartado"
    enviado_proveedor  = "enviado_proveedor"


# ============================================================
# TABLA: usuarios
# ============================================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id            = Column(Integer, primary_key=True, index=True)
    nombre        = Column(String(100), nullable=False)
    email         = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    activo        = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    configuracion = relationship("Configuracion", back_populates="usuario", uselist=False)
    movimientos   = relationship("Movimiento", back_populates="usuario")

    # CORREGIDO: foreign_keys explicito porque Salida tiene 3 FK hacia usuarios
    salidas       = relationship(
                        "Salida",
                        back_populates="usuario",
                        foreign_keys="Salida.usuario_id"
                    )


# ============================================================
# TABLA: configuracion
# ============================================================
class Configuracion(Base):
    __tablename__ = "configuracion"

    id              = Column(Integer, primary_key=True, index=True)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), unique=True)
    nombre_negocio  = Column(String(150), default="Mi Negocio")
    moneda          = Column(String(10), default="CLP")
    color_principal = Column(String(10), default="#00C77B")
    logo_base64     = Column(Text, nullable=True)
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    usuario         = relationship("Usuario", back_populates="configuracion")


# ============================================================
# TABLA: productos
# ============================================================
class Producto(Base):
    __tablename__ = "productos"

    id                  = Column(Integer, primary_key=True, index=True)
    nombre              = Column(String(200), nullable=False)
    codigo_barra        = Column(String(100), unique=True, nullable=True, index=True)
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

    # Relaciones
    movimientos         = relationship("Movimiento", back_populates="producto")
    salidas             = relationship(
                            "Salida",
                            back_populates="producto",
                            foreign_keys="Salida.producto_id"
                          )


# ============================================================
# TABLA: movimientos (entradas de stock)
# ============================================================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id             = Column(Integer, primary_key=True, index=True)
    producto_id    = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo           = Column(String(10), nullable=False)
    cantidad       = Column(Integer, nullable=False)
    stock_anterior = Column(Integer, nullable=False)
    stock_nuevo    = Column(Integer, nullable=False)
    nota           = Column(String(255), nullable=True)
    lote           = Column(String(100), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    producto       = relationship("Producto", back_populates="movimientos")
    usuario        = relationship("Usuario", back_populates="movimientos")


# ============================================================
# TABLA: salidas
# Registra ventas, mermas, cuarentenas y devoluciones
# Analogia: el "libro de egresos" con motivo y estado
# ============================================================
class Salida(Base):
    __tablename__ = "salidas"

    id                   = Column(Integer, primary_key=True, index=True)

    # FKs - hay 3 hacia usuarios, por eso SQLAlchemy necesita foreign_keys explicito
    producto_id          = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id           = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    resolucion_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # Cantidad y stock
    cantidad             = Column(Integer, nullable=False)
    stock_anterior       = Column(Integer, nullable=False)
    stock_nuevo          = Column(Integer, nullable=False)

    # Tipo y motivo
    tipo_salida          = Column(Enum(TipoSalida,  name="tipo_salida_enum"),  nullable=False)
    motivo               = Column(String(255), nullable=True)
    numero_documento     = Column(String(100), nullable=True)
    codigo_barra_scan    = Column(String(100), nullable=True)

    # Valor economico
    precio_unitario      = Column(Float, default=0.0)
    valor_total          = Column(Float, default=0.0)

    # Estado (clave para cuarentena)
    estado               = Column(
                               Enum(EstadoSalida, name="estado_salida_enum"),
                               default=EstadoSalida.activo,
                               nullable=False
                           )
    estado_anterior      = Column(String(50), nullable=True)

    # Resolucion de cuarentena
    resolucion_nota      = Column(String(255), nullable=True)
    resolucion_at        = Column(DateTime(timezone=True), nullable=True)

    # Trazabilidad
    lote                 = Column(String(100), nullable=True)
    fecha_vencimiento    = Column(DateTime(timezone=True), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())

    # RELACIONES con foreign_keys explicitos para evitar AmbiguousForeignKeysError
    # Analogia: le decimos a SQLAlchemy exactamente por cual "puerta" entrar
    producto             = relationship(
                               "Producto",
                               back_populates="salidas",
                               foreign_keys=[producto_id]
                           )
    usuario              = relationship(
                               "Usuario",
                               back_populates="salidas",
                               foreign_keys=[usuario_id]
                           )
    resolucion_usuario   = relationship(
                               "Usuario",
                               foreign_keys=[resolucion_usuario_id]
                           )