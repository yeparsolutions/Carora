# ============================================================
# STOCKYA – Migración de onboarding
# Archivo: backend/migrar_onboarding.py
# Descripción: Agrega columnas rubro y onboarding_completo
#              a la tabla configuracion
# Uso: python migrar_onboarding.py
# ============================================================

import psycopg2

conn   = psycopg2.connect(
    host     = "localhost",
    port     = 5433,
    dbname   = "carora",
    user     = "postgres",
    password = "Yepar2026"
)
cursor = conn.cursor()

print("Iniciando migración de onboarding...\n")

columnas = [
    # (columna, tipo, default)
    ("rubro",               "VARCHAR(100)", None),
    ("onboarding_completo", "BOOLEAN",      "FALSE"),
    ("nombre_usuario",      "VARCHAR(150)", None),
]

for columna, tipo, default in columnas:
    try:
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'configuracion' AND column_name = %s
        """, (columna,))
        existe = cursor.fetchone()[0]

        if existe:
            print(f"  [OK] Columna '{columna}' ya existe — omitida")
        else:
            if default:
                cursor.execute(f"ALTER TABLE configuracion ADD COLUMN {columna} {tipo} DEFAULT {default}")
            else:
                cursor.execute(f"ALTER TABLE configuracion ADD COLUMN {columna} {tipo}")
            conn.commit()
            print(f"  [+] Columna '{columna}' agregada")
    except Exception as e:
        conn.rollback()
        print(f"  [ERROR] '{columna}': {e}")

# Marcar usuarios existentes como onboarding ya completado
# Analogia: los inquilinos que ya vivían en el edificio no
# necesitan pasar por la recepción de bienvenida de nuevo
try:
    cursor.execute("""
        UPDATE configuracion SET onboarding_completo = TRUE
        WHERE onboarding_completo = FALSE OR onboarding_completo IS NULL
    """)
    conn.commit()
    print(f"\n  [+] Usuarios existentes marcados con onboarding completo")
except Exception as e:
    conn.rollback()
    print(f"  [ERROR] Al marcar onboarding: {e}")

cursor.close()
conn.close()

print("\n✅ Migración de onboarding completada.")
