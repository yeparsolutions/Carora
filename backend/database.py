# ============================================================
# YEPARSTOCK — Diagnóstico y reparación de BD
# Archivo: backend/diagnostico.py
# Uso: python diagnostico.py
# ============================================================
import os
import psycopg2
from dotenv import load_dotenv
from urllib.parse import urlparse

# Cargar variables de entorno desde .env
# Analogía: leer el manual antes de conectar los cables
load_dotenv()

# Parsear DATABASE_URL para extraer los parámetros de conexión
# Analogía: descomponer la dirección completa en calle, ciudad y código postal
_url = urlparse(os.environ["DATABASE_URL"])

conn = psycopg2.connect(
    host     = _url.hostname,
    port     = _url.port or 5432,
    dbname   = _url.path.lstrip("/"),
    user     = _url.username,
    password = _url.password   # ✅ viene del .env, no hardcodeada
)
cursor = conn.cursor()

print("\n=== COLUMNAS EN TABLA MOVIMIENTOS ===")
cursor.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'movimientos'
    ORDER BY ordinal_position
""")
for col in cursor.fetchall():
    print(f"  {col[0]:25} {col[1]}")

print("\n=== COLUMNAS EN TABLA PRODUCTOS ===")
cursor.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'productos'
    ORDER BY ordinal_position
""")
for col in cursor.fetchall():
    print(f"  {col[0]:25} {col[1]}")

print("\n=== TOTAL MOVIMIENTOS EN BD ===")
cursor.execute("SELECT COUNT(*) FROM movimientos")
print(f"  {cursor.fetchone()[0]} movimientos")

print("\n=== COLUMNAS FALTANTES — APLICANDO CORRECCIONES ===")

# Columnas que deben existir en movimientos
mov_cols = [
    ("lote", "VARCHAR(100)")
]
for col, tipo in mov_cols:
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'movimientos' AND column_name = %s
    """, (col,))
    if cursor.fetchone()[0] == 0:
        cursor.execute(f"ALTER TABLE movimientos ADD COLUMN {col} {tipo}")
        conn.commit()
        print(f"  [+] Columna '{col}' agregada a movimientos")
    else:
        print(f"  [OK] '{col}' ya existe en movimientos")

# Columnas que deben existir en productos
prod_cols = [
    ("codigo_barra", "VARCHAR(100)"),
    ("marca", "VARCHAR(100)"),
    ("proveedor", "VARCHAR(150)"),
    ("porcentaje_ganancia", "FLOAT"),
    ("fecha_vencimiento", "TIMESTAMPTZ"),
    ("dias_alerta_venc", "INTEGER"),
    ("lote", "VARCHAR(100)"),
]
for col, tipo in prod_cols:
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'productos' AND column_name = %s
    """, (col,))
    if cursor.fetchone()[0] == 0:
        cursor.execute(f"ALTER TABLE productos ADD COLUMN {col} {tipo}")
        conn.commit()
        print(f"  [+] Columna '{col}' agregada a productos")
    else:
        print(f"  [OK] '{col}' ya existe en productos")

# Hacer producto_id nullable en movimientos
try:
    cursor.execute("ALTER TABLE movimientos ALTER COLUMN producto_id DROP NOT NULL")
    conn.commit()
    print("  [+] producto_id ahora es nullable")
except:
    conn.rollback()
    print("  [OK] producto_id ya era nullable")

cursor.close()
conn.close()
print("\n=== DIAGNOSTICO COMPLETADO ===")
print("\n=== DIAGNOSTICO COMPLETADO ===")