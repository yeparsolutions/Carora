# ============================================================
# STOCKYA — Migración: agregar método de pago y tabla de fiados
# Archivo: backend/migracion_pagos.py
# Ejecutar: python migracion_pagos.py
# ============================================================

from sqlalchemy import text
from database import engine

with engine.connect() as conn:

    # 1. Agregar columna metodo_pago a salidas
    try:
        conn.execute(text("ALTER TABLE salidas ADD COLUMN metodo_pago VARCHAR(30) DEFAULT 'efectivo'"))
        conn.commit()
        print("✅ Columna metodo_pago agregada a salidas")
    except Exception as e:
        conn.rollback()
        print(f"⚠️  metodo_pago ya existe: {e}")

    # 2. Crear tabla de fiados (deudas de clientes)
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS fiados (
                id              SERIAL PRIMARY KEY,
                empresa_id      INTEGER REFERENCES empresas(id),
                salida_id       INTEGER REFERENCES salidas(id),
                cliente_nombre  VARCHAR(150) NOT NULL,
                monto_total     FLOAT NOT NULL DEFAULT 0,
                monto_pagado    FLOAT NOT NULL DEFAULT 0,
                estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
                nota            VARCHAR(255),
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at      TIMESTAMP WITH TIME ZONE
            )
        """))
        conn.commit()
        print("✅ Tabla fiados creada")
    except Exception as e:
        conn.rollback()
        print(f"⚠️  Error creando tabla fiados: {e}")

    # 3. Verificar
    r = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='salidas' AND column_name='metodo_pago'"))
    if r.fetchone():
        print("✅ Verificado: metodo_pago existe en salidas")

    r2 = conn.execute(text("SELECT COUNT(*) FROM fiados"))
    print(f"✅ Verificado: tabla fiados tiene {r2.fetchone()[0]} registros")

print("\n✅ Migración completada")
