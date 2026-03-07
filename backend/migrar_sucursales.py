# ============================================================
# YEPARSTOCK — Migración: Multi-sucursal
# Archivo: backend/migrar_sucursales.py
# ============================================================
# Ejecutar UNA SOLA VEZ para agregar las nuevas columnas
# y la tabla "sucursales" a la base de datos existente.
#
# Uso:
#   python migrar_sucursales.py
#
# Analogía: es como remodelar el hotel existente para
# agregar los nuevos pisos — sin demoler lo que ya hay.
# ============================================================

import os
from sqlalchemy import text
from database import engine, Base
import models  # importar todos los modelos para que Base los registre

def migrar():
    print("🔧 Iniciando migración multi-sucursal...")

    with engine.connect() as conn:

        # ── 1. Crear tabla sucursales si no existe ───────────
        print("  → Creando tabla 'sucursales'...")
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sucursales (
                id          SERIAL PRIMARY KEY,
                empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                nombre      VARCHAR(150) NOT NULL,
                direccion   VARCHAR(255),
                telefono    VARCHAR(50),
                activa      BOOLEAN DEFAULT TRUE,
                created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at  TIMESTAMP WITH TIME ZONE,
                UNIQUE (empresa_id, nombre)
            );
        """))

        # ── 2. Agregar sucursal_id a usuarios ────────────────
        print("  → Agregando 'sucursal_id' a tabla 'usuarios'...")
        conn.execute(text("""
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS sucursal_id INTEGER
            REFERENCES sucursales(id) ON DELETE SET NULL;
        """))

        # ── 3. Agregar rol "lider" al enum rol_usuario_enum ──
        # En PostgreSQL los ENUMs requieren ALTER TYPE
        print("  → Agregando valor 'lider' al enum 'rol_usuario_enum'...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum
                    WHERE enumlabel = 'lider'
                    AND enumtypid = (
                        SELECT oid FROM pg_type WHERE typname = 'rol_usuario_enum'
                    )
                ) THEN
                    ALTER TYPE rol_usuario_enum ADD VALUE 'lider';
                END IF;
            END$$;
        """))

        # ── 4. Agregar max_sucursales a empresas ─────────────
        print("  → Agregando 'max_sucursales' a tabla 'empresas'...")
        conn.execute(text("""
            ALTER TABLE empresas
            ADD COLUMN IF NOT EXISTS max_sucursales INTEGER DEFAULT 1;
        """))

        # ── 5. Actualizar max_sucursales para empresas Pro ───
        print("  → Actualizando max_sucursales = 3 para empresas con plan 'pro'...")
        conn.execute(text("""
            UPDATE empresas
            SET max_sucursales = 3
            WHERE plan = 'pro';
        """))

        # ── 6. Agregar sucursal_id a productos ───────────────
        print("  → Agregando 'sucursal_id' a tabla 'productos'...")
        conn.execute(text("""
            ALTER TABLE productos
            ADD COLUMN IF NOT EXISTS sucursal_id INTEGER
            REFERENCES sucursales(id) ON DELETE SET NULL;
        """))

        # ── 7. Agregar sucursal_id a movimientos ─────────────
        print("  → Agregando 'sucursal_id' a tabla 'movimientos'...")
        conn.execute(text("""
            ALTER TABLE movimientos
            ADD COLUMN IF NOT EXISTS sucursal_id INTEGER
            REFERENCES sucursales(id) ON DELETE SET NULL;
        """))

        # ── 8. Agregar sucursal_id a salidas ─────────────────
        print("  → Agregando 'sucursal_id' a tabla 'salidas'...")
        conn.execute(text("""
            ALTER TABLE salidas
            ADD COLUMN IF NOT EXISTS sucursal_id INTEGER
            REFERENCES sucursales(id) ON DELETE SET NULL;
        """))

        # ── 9. Índices para performance ───────────────────────
        print("  → Creando índices de sucursal_id...")
        for tabla in ("usuarios", "productos", "movimientos", "salidas"):
            conn.execute(text(f"""
                CREATE INDEX IF NOT EXISTS idx_{tabla}_sucursal_id
                ON {tabla}(sucursal_id);
            """))

        conn.commit()

    print("\n✅ Migración completada exitosamente.")
    print("   Recuerda registrar el router de sucursales en main.py:")
    print("   from routers import sucursales")
    print("   app.include_router(sucursales.router)")


if __name__ == "__main__":
    migrar()
