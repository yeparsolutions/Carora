# ============================================================
# STOCKYA – Migración de base de datos
# Archivo: backend/migrar.py
# Descripción: Agrega columnas nuevas a PostgreSQL de forma segura
# Uso: python migrar.py
# ============================================================

import psycopg2

# Conexión a PostgreSQL
conn   = psycopg2.connect(
    host     = "localhost",
    port     = 5433,
    dbname   = "carora",
    user     = "postgres",
    password = "Yepar2026"
)
cursor = conn.cursor()

print("Iniciando migracion...\n")


# ============================================================
# PASO 1: Agregar columnas nuevas si no existen
# Formato: (columna, tipo_sql, default, tabla)
# ============================================================
columnas_nuevas = [
    ("codigo_barra",        "VARCHAR(100)",  None,   "productos"),
    ("marca",               "VARCHAR(100)",  None,   "productos"),
    ("proveedor",           "VARCHAR(150)",  None,   "productos"),
    ("porcentaje_ganancia", "FLOAT",         "0.0",  "productos"),
    ("fecha_vencimiento",   "TIMESTAMPTZ",   None,   "productos"),
    ("dias_alerta_venc",    "INTEGER",       "30",   "productos"),
    ("lote",                "VARCHAR(100)",  None,   "productos"),
    ("lote",                "VARCHAR(100)",  None,   "movimientos"),

    # ✅ NUEVO: cada producto pertenece a un usuario
    # Analogia: ponerle el nombre del dueño a cada caja de la bodega
    ("usuario_id",          "INTEGER",       None,   "productos"),
]

for columna, tipo, default, tabla in columnas_nuevas:
    try:
        # Verificar si la columna ya existe
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
        """, (tabla, columna))
        existe = cursor.fetchone()[0]

        if existe:
            print(f"  [OK] Columna '{columna}' en '{tabla}' ya existe — omitida")
        else:
            if default is not None:
                sql = f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo} DEFAULT {default}"
            else:
                sql = f"ALTER TABLE {tabla} ADD COLUMN {columna} {tipo}"
            cursor.execute(sql)
            conn.commit()
            print(f"  [+] Columna '{columna}' agregada en '{tabla}'")

    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] Columna '{columna}' en '{tabla}': {e}")


# ============================================================
# PASO 2: Hacer producto_id nullable en movimientos
# (para conservar historial cuando se elimina un producto)
# ============================================================
try:
    cursor.execute("""
        ALTER TABLE movimientos ALTER COLUMN producto_id DROP NOT NULL
    """)
    conn.commit()
    print("\n  [+] producto_id en movimientos ahora es nullable")
except Exception as e:
    conn.rollback()
    print(f"\n  [OK] producto_id ya era nullable — omitido")


# ============================================================
# PASO 3: Eliminar índice único global de codigo_barra
# ✅ NUEVO: el codigo_barra ya no debe ser único globalmente
#    porque dos usuarios pueden tener el mismo producto.
#    La unicidad ahora es por (usuario_id + codigo_barra)
# ============================================================
try:
    cursor.execute("""
        SELECT COUNT(*) FROM pg_indexes
        WHERE tablename = 'productos'
        AND indexname = 'ix_productos_codigo_barra'
    """)
    if cursor.fetchone()[0] > 0:
        cursor.execute("DROP INDEX ix_productos_codigo_barra")
        conn.commit()
        print("  [+] Índice único global de codigo_barra eliminado")
    else:
        print("  [OK] Índice único global no existía — omitido")
except Exception as e:
    conn.rollback()
    print(f"  [ERROR] Al eliminar índice: {e}")


# ============================================================
# PASO 4: Crear índice compuesto (usuario_id + codigo_barra)
# Garantiza unicidad POR usuario, no global
# ============================================================
try:
    cursor.execute("""
        SELECT COUNT(*) FROM pg_indexes
        WHERE tablename = 'productos'
        AND indexname = 'uq_producto_usuario_codigo'
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            CREATE UNIQUE INDEX uq_producto_usuario_codigo
            ON productos(usuario_id, codigo_barra)
            WHERE codigo_barra IS NOT NULL
        """)
        conn.commit()
        print("  [+] Índice único (usuario_id + codigo_barra) creado")
    else:
        print("  [OK] Índice compuesto ya existe — omitido")
except Exception as e:
    conn.rollback()
    print(f"  [ERROR] Al crear índice compuesto: {e}")


# ============================================================
# PASO 5: Asignar usuario_id a productos existentes
# Si ya hay productos en la BD sin usuario_id, los asignamos
# al primer usuario (el admin / usuario demo)
# ============================================================
try:
    cursor.execute("""
        SELECT COUNT(*) FROM productos WHERE usuario_id IS NULL
    """)
    sin_dueno = cursor.fetchone()[0]

    if sin_dueno > 0:
        # Obtener el primer usuario registrado
        cursor.execute("SELECT id FROM usuarios ORDER BY id LIMIT 1")
        row = cursor.fetchone()
        if row:
            primer_usuario_id = row[0]
            cursor.execute("""
                UPDATE productos SET usuario_id = %s WHERE usuario_id IS NULL
            """, (primer_usuario_id,))
            conn.commit()
            print(f"\n  [+] {sin_dueno} producto(s) asignados al usuario ID {primer_usuario_id}")
        else:
            print("\n  [!] No hay usuarios en la BD — productos sin usuario_id")
    else:
        print("\n  [OK] Todos los productos ya tienen usuario_id")
except Exception as e:
    conn.rollback()
    print(f"\n  [ERROR] Al asignar usuario_id: {e}")


# ============================================================
# Cerrar conexión al final — siempre al último
# Analogia: cerrar la tienda DESPUÉS de atender a todos
# ============================================================
cursor.close()
conn.close()

print("\n✅ Migración completada exitosamente.")