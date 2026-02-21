# ============================================================
# STOCKYA - Fix: eliminar restriccion UNIQUE vieja en productos
# Archivo: backend/fix_productos.py
# Ejecucion: python fix_productos.py
# ============================================================

from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    # Eliminar restriccion UNIQUE global del campo codigo
    # Analogia: antes el codigo era como un DNI unico en todo el pais,
    # ahora solo debe ser unico por usuario (como el RUT por empresa)
    conn.execute(text("ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_codigo_key"))
    conn.commit()
    print("OK: restriccion productos_codigo_key eliminada")
