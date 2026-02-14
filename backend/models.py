# ============================================================
# STOCKYA — Modelos de base de datos
# Archivo: backend/models.py
# Descripción: Define las tablas de PostgreSQL usando SQLAlchemy
# Analogía: cada clase es como el diseño de una hoja de Excel —
#           define qué columnas tiene cada tabla
# ============================================================

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ============================================================
# TABLA: usuarios
# Guarda los usuarios que pueden iniciar sesión en la app
# ============================================================
class Usuario(Base):
    __tablename__ = "usuarios"

    id              = Column(Integer, primary_key=True, index=True)
    nombre          = Column(String(100), nullable=False)           # Nombre completo
    email           = Column(String(150), unique=True, nullable=False, index=True)
    password_hash   = Column(String(255), nullable=False)           # Contraseña encriptada
    activo          = Column(Boolean, default=True)                 # Puede ingresar o no
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Relación: un usuario puede tener una configuración de negocio
    configuracion   = relationship("Configuracion", back_populates="usuario", uselist=False)
    # Relación: un usuario puede registrar muchos movimientos
    movimientos     = relationship("Movimiento", back_populates="usuario")


# ============================================================
# TABLA: configuracion
# Guarda los datos del negocio (nombre, color, moneda, logo)
# ============================================================
class Configuracion(Base):
    __tablename__ = "configuracion"

    id              = Column(Integer, primary_key=True, index=True)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), unique=True)
    nombre_negocio  = Column(String(150), default="Mi Negocio")
    moneda          = Column(String(10), default="CLP")             # CLP, USD, EUR, etc.
    color_principal = Column(String(10), default="#00C77B")         # Color hex
    logo_base64     = Column(Text, nullable=True)                   # Logo en base64
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())

    # Relación inversa con Usuario
    usuario         = relationship("Usuario", back_populates="configuracion")


# ============================================================
# TABLA: productos
# Guarda todos los productos del inventario
# ============================================================
class Producto(Base):
    __tablename__ = "productos"

    id                  = Column(Integer, primary_key=True, index=True)
    nombre              = Column(String(200), nullable=False)
    codigo_barra        = Column(String(100), unique=True, nullable=True, index=True)  # Código de barras EAN/UPC
    codigo              = Column(String(50), nullable=True)           # Código interno del negocio
    categoria           = Column(String(100), nullable=True)
    marca               = Column(String(100), nullable=True)          # Marca del producto
    proveedor           = Column(String(150), nullable=True)          # Nombre del proveedor
    stock_actual        = Column(Integer, default=0)                  # Cantidad en bodega
    stock_minimo        = Column(Integer, default=0)                  # Umbral de alerta stock bajo
    precio_compra       = Column(Float, default=0.0)
    precio_venta        = Column(Float, default=0.0)
    porcentaje_ganancia = Column(Float, default=0.0)                  # % de ganancia sobre precio compra
    fecha_vencimiento   = Column(DateTime(timezone=True), nullable=True)  # Aplica si el producto vence
    dias_alerta_venc    = Column(Integer, default=30)                 # Alertar X días antes del vencimiento
    activo              = Column(Boolean, default=True)               # False = eliminado (soft delete)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())

    # Relación: un producto puede tener muchos movimientos
    movimientos         = relationship("Movimiento", back_populates="producto")


# ============================================================
# TABLA: movimientos
# Registra cada entrada o salida de stock
# Analogía: es el libro contable de la bodega —
#           cada línea es una transacción
# ============================================================
class Movimiento(Base):
    __tablename__ = "movimientos"

    id              = Column(Integer, primary_key=True, index=True)
    producto_id     = Column(Integer, ForeignKey("productos.id"), nullable=False)
    usuario_id      = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo            = Column(String(10), nullable=False)             # 'entrada' o 'salida'
    cantidad        = Column(Integer, nullable=False)                # Siempre positivo
    stock_anterior  = Column(Integer, nullable=False)                # Stock antes del movimiento
    stock_nuevo     = Column(Integer, nullable=False)                # Stock después del movimiento
    nota            = Column(String(255), nullable=True)             # Observación opcional
    lote            = Column(String(100), nullable=True)             # Número de lote (cuando aplica)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones inversas
    producto        = relationship("Producto", back_populates="movimientos")
    usuario         = relationship("Usuario", back_populates="movimientos")