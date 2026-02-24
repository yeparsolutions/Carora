from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    # Ver valores actuales del enum
    r = conn.execute(text("""
        SELECT enumlabel FROM pg_enum 
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
        WHERE pg_type.typname = 'plan_empresa_enum'
        ORDER BY enumsortorder
    """))
    valores = [row[0] for row in r]
    print("Valores actuales del enum:", valores)

    # Ver qué valores tienen las empresas en la BD
    r2 = conn.execute(text("SELECT id, nombre, plan::text FROM empresas"))
    print("\nEmpresas y sus planes:")
    for row in r2:
        print(f"  id={row[0]}, nombre={row[1]}, plan={row[2]}")
