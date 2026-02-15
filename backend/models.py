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
# Analogia: son como listas desplegables que solo permiten
#           valores validos, evitando errores de escritura
# ============================================================

class TipoSalida(str, enum.Enum):
    venta               = "venta"               # Sale por venta al cliente
    merma               = "merma"               # Danio, vencimiento, perdida
    cuarentena          = "cuarentena"          # Sale del stock pero queda en espera
    devolucion_proveedor = "devolucion_proveedor"  # Se devuelve al proveedor

class EstadoSalida(str, enum.Enum):
    activo              = "activo"              # Salida normal confirmada
    en_revision         = "en_revision"         # Cuarentena: esperando decision
    reingresado         = "reingresado"         # Cuarentena: volvio al stock
    descartado          = "descartado"          # Cuarentena: dado de baja definitiva
    enviado_proveedor   = "enviado_proveedor"   # Cuarentena: devuelto al proveedor


# ============================================================
# TABLA: usuarios
# Guarda los usuarios que pueden iniciar sesion en la app
# ============================================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id              = Column(Integer, primary_key=True, index=True)
    nombre          = Column(String(100), nullable=False)
    email           = Column(String(150), unique=True, nullable=False, index=True)
    password_hash   = Column(String(255), nullable=False)
    activo          = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    configuracion   = relationship("Configuracion", back_populates="usuario", uselist=False)
    movimientos     = relationship("Movimiento", back_populates="usuario")
    salidas         = relationship("Salida", back_populates="usuario")


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
    salidas             = relationship("Salida", back_populates="producto")


# ============================================================
# TABLA: movimientos
# Registra entradas de stock (compras, stock inicial)
# ============================================================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id              = Column(Integer, primary_key=True, index=True)
    producto_id     = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo            = Column(String(10), nullable=False)    # 'entrada' o 'salida'
    cantidad        = Column(Integer, nullable=False)
    stock_anterior  = Column(Integer, nullable=False)
    stock_nuevo     = Column(Integer, nullable=False)
    nota            = Column(String(255), nullable=True)
    lote            = Column(String(100), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    producto        = relationship("Producto", back_populates="movimientos")
    usuario         = relationship("Usuario", back_populates="movimientos")


# ============================================================
# TABLA: salidas
# Registra todas las salidas de stock con tipo y estado
# Analogia: es el "libro de egresos" de la bodega -
#           cada linea explica POR QUE salio el producto
#           y en que estado queda ese registro
# ============================================================
class Salida(Base):
    __tablename__ = "salidas"

    id                  = Column(Integer, primary_key=True, index=True)

    # --- Que salio ---
    producto_id         = Column(Integer, ForeignKey("productos.id", ondelete="SET NULL"), nullable=True)
    usuario_id          = Column(Integer, ForeignKey("usuarios.id"), nullable=False)

    # --- Cuanto salio ---
    cantidad            = Column(Integer, nullable=False)           # Siempre positivo
    stock_anterior      = Column(Integer, nullable=False)           # Stock antes de la salida
    stock_nuevo         = Column(Integer, nullable=False)           # Stock despues de la salida

    # --- Por que salio ---
    tipo_salida         = Column(
                            Enum(TipoSalida, name="tipo_salida_enum"),
                            nullable=False
                          )
    motivo              = Column(String(255), nullable=True)        # Descripcion libre del motivo
    numero_documento    = Column(String(100), nullable=True)        # Boleta, factura, guia, OC
    codigo_barra_scan   = Column(String(100), nullable=True)        # Guardado para trazabilidad

    # --- Valor economico ---
    precio_unitario     = Column(Float, default=0.0)                # Precio al momento de la salida
    valor_total         = Column(Float, default=0.0)                # cantidad * precio_unitario

    # --- Estado del registro (clave para cuarentena) ---
    # Analogia: es como el semaforo del producto -
    #   activo        = verde (salida confirmada)
    #   en_revision   = amarillo (esperando decision)
    #   reingresado   = azul (volvio al inventario)
    #   descartado    = rojo (dado de baja definitiva)
    #   enviado_proveedor = gris (devuelto al origen)
    estado              = Column(
                            Enum(EstadoSalida, name="estado_salida_enum"),
                            default=EstadoSalida.activo,
                            nullable=False
                          )
    estado_anterior     = Column(String(50), nullable=True)         # Guarda el estado previo al cambio

    # --- Trazabilidad de cuarentena ---
    resolucion_nota     = Column(String(255), nullable=True)        # Nota al resolver la cuarentena
    resolucion_at       = Column(DateTime(timezone=True), nullable=True)  # Cuando se resolvio
    resolucion_usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # --- Lote y vencimiento (para mermas por vencimiento) ---
    lote                = Column(String(100), nullable=True)
    fecha_vencimiento   = Column(DateTime(timezone=True), nullable=True)

    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    # Relaciones
    producto            = relationship("Producto", back_populates="salidas",
                                       foreign_keys=[producto_id])
    usuario             = relationship("Usuario", back_populates="salidas",
                                       foreign_keys=[usuario_id])
    resolucion_usuario  = relationship("Usuario",
                                       foreign_keys=[resolucion_usuario_id])