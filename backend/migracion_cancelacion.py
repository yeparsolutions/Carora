# ============================================================
# STOCKYA — Migración: campos de cancelación de suscripción
# Archivo: backend/migracion_cancelacion.py
# Ejecutar: python migracion_cancelacion.py
# ============================================================

from sqlalchemy import text
from database import engine

print("🔄 Agregando campos de cancelación a tabla empresas...")

with engine.connect() as conn:
    campos = [
        ("cancelado_en",  "TIMESTAMP WITH TIME ZONE"),
        ("gracia_hasta",  "TIMESTAMP WITH TIME ZONE"),
    ]
    for campo, tipo in campos:
        try:
            conn.execute(text(f"ALTER TABLE empresas ADD COLUMN {campo} {tipo}"))
            conn.commit()
            print(f"  ✅ Columna '{campo}' agregada")
        except Exception as e:
            conn.rollback()
            print(f"  ⚠️  '{campo}' ya existe: {e}")

print("\n✅ Migración completada")
