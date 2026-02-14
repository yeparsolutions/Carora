# ============================================================
# STOCKYA — Migración de base de datos
# Archivo: backend/migrar.py
# Descripción: Agrega las nuevas columnas a la tabla productos
# Uso: python migrar.py
# ============================================================

import psycopg2

# Conexión a PostgreSQL
conn = psycopg2.connect(
    host     = "localhost",
    port     = 5433,
    dbname   = "carora",
    user     = "postgres",
    password = "Yepar2026"
)
cursor = conn.cursor()

# Lista de columnas nuevas a agregar
# Formato: (nombre_columna, tipo_sql, valor_por_defecto)
columnas_nuevas = [
    ("codigo_barra",        "VARCHAR(100)",   None,    "productos"),
    ("marca",               "VARCHAR(100)",   None,    "productos"),
    ("proveedor",           "VARCHAR(150)",   None,    "productos"),
    ("porcentaje_ganancia", "FLOAT",          "0.0",   "productos"),
    ("fecha_vencimiento",   "TIMESTAMPTZ",    None,    "productos"),
    ("dias_alerta_venc",    "INTEGER",        "30",    "productos"),
    ("lote",                "VARCHAR(100)",   None,    "movimientos"),
]

print("Iniciando migracion...")

for columna, tipo, default, tabla in columnas_nuevas:
    try:
        # Verificar si la columna ya existe antes de agregarla
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        """, (tabla, columna,))

        existe = cursor.fetchone()[0]

        if existe:
            print(f"  [OK] Columna '{columna}' ya existe — omitida")
        else:
            # Agregar la columna nueva
            if default is not None:
                sql = f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo} DEFAULT {default}"
            else:
                sql = f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}"

            cursor.execute(sql)
            conn.commit()
            print(f"  [+] Columna '{columna}' agregada correctamente")

    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] '{columna}': {e}")

# Agregar indice unico en codigo_barra si no existe
try:
    cursor.execute("""
        SELECT COUNT(*) FROM pg_indexes
        WHERE tablename = 'productos' AND indexname = 'ix_productos_codigo_barra'
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("CREATE UNIQUE INDEX ix_productos_codigo_barra ON productos(codigo_barra) WHERE codigo_barra IS NOT NULL")
        conn.commit()
        print("  [+] Indice unico en codigo_barra creado")
    else:
        print("  [OK] Indice codigo_barra ya existe")
except Exception as e:
    conn.rollback()
    print(f"  [ERROR] Indice: {e}")

cursor.close()
conn.close()
print("\nMigracion completada.")