# ============================================================
# STOCKYA - Migración: agregar columna nombre_usuario
# Archivo: backend/migrar_columna.py
# Descripción: Agrega la columna faltante en la tabla configuracion
# Ejecución:  python migrar_columna.py
# ============================================================

from sqlalchemy import text
from database import engine  # Usa tu conexión existente

def migrar():
    """
    Verifica si la columna existe y la agrega si no está.
    Analogia: es como revisar si el apartamento tiene balcón
    antes de intentar construirlo — evita errores si ya existe.
    """
    with engine.connect() as conn:

        # Verificar si la columna ya existe
        resultado = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'configuracion' 
            AND column_name = 'nombre_usuario'
        """))

        if resultado.fetchone():
            print("✅ La columna 'nombre_usuario' ya existe — nada que hacer.")
        else:
            # Agregar la columna faltante
            conn.execute(text("""
                ALTER TABLE configuracion 
                ADD COLUMN nombre_usuario VARCHAR(150)
            """))
            conn.commit()
            print("✅ Columna 'nombre_usuario' agregada exitosamente.")

if __name__ == "__main__":
    migrar()
