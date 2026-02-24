# ============================================================
# STOCKYA — Migración: metodo_pago, cliente_nombre y tabla fiados
# Archivo: backend/migracion_fiados_metodo.py
# Ejecutar: python migracion_fiados_metodo.py
# ============================================================

from sqlalchemy import text
from database import engine

print("🔄 Ejecutando migración...")

with engine.connect() as conn:

    # 1. Columna metodo_pago en salidas
    try:
        conn.execute(text("ALTER TABLE salidas ADD COLUMN metodo_pago VARCHAR(50) DEFAULT 'efectivo'"))
        conn.commit()
        print("  ✅ salidas.metodo_pago agregada")
    except Exception as e:
        conn.rollback()
        print(f"  ⚠️  salidas.metodo_pago ya existe: {e}")

    # 2. Columna cliente_nombre en salidas
    try:
        conn.execute(text("ALTER TABLE salidas ADD COLUMN cliente_nombre VARCHAR(150)"))
        conn.commit()
        print("  ✅ salidas.cliente_nombre agregada")
    except Exception as e:
        conn.rollback()
        print(f"  ⚠️  salidas.cliente_nombre ya existe: {e}")

    # 3. Tabla fiados completa
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS fiados (
                id             SERIAL PRIMARY KEY,
                empresa_id     INTEGER NOT NULL REFERENCES empresas(id),
                salida_id      INTEGER REFERENCES salidas(id) ON DELETE SET NULL,
                cliente_nombre VARCHAR(150) NOT NULL,
                monto_total    FLOAT DEFAULT 0.0,
                monto_pagado   FLOAT DEFAULT 0.0,
                estado         VARCHAR(20) DEFAULT 'pendiente',
                nota           VARCHAR(255),
                created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at     TIMESTAMP WITH TIME ZONE
            )
        """))
        conn.commit()
        print("  ✅ Tabla fiados creada")
    except Exception as e:
        conn.rollback()
        print(f"  ⚠️  tabla fiados: {e}")

    # 4. Columnas de cancelación en empresas (por si no se ejecutó antes)
    for campo, tipo in [("cancelado_en", "TIMESTAMP WITH TIME ZONE"), ("gracia_hasta", "TIMESTAMP WITH TIME ZONE")]:
        try:
            conn.execute(text(f"ALTER TABLE empresas ADD COLUMN {campo} {tipo}"))
            conn.commit()
            print(f"  ✅ empresas.{campo} agregada")
        except Exception as e:
            conn.rollback()
            print(f"  ⚠️  empresas.{campo} ya existe")

print("\n✅ Migración completada — reinicia uvicorn")
