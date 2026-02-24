from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    # Ver valores actuales
    r = conn.execute(text("""
        SELECT enumlabel FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'plan_empresa_enum'
    """))
    valores = [row[0] for row in r]
    print("Valores actuales del enum:", valores)

    # Agregar 'pro' si no existe
    if 'pro' not in valores:
        conn.execute(text("ALTER TYPE plan_empresa_enum ADD VALUE 'pro'"))
        conn.commit()
        print("✅ Valor 'pro' agregado al enum")
    else:
        print("✅ 'pro' ya existe en el enum")

    # Ver empresas y sus planes actuales
    r2 = conn.execute(text("SELECT id, nombre, plan::text FROM empresas"))
    print("\nEmpresas:")
    for row in r2:
        print(f"  id={row[0]}, {row[1]}, plan={row[2]}")
