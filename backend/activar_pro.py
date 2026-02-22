from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    conn.execute(text("""
        UPDATE empresas SET 
            plan='pro', 
            plan_precio=29990,
            max_usuarios=3,
            max_productos=1500
        WHERE id=2
    """))
    conn.commit()
    print("Listo - empresa 2 ahora es Plan Pro")

    # Verificar
    r = conn.execute(text("SELECT id, nombre, plan, max_usuarios, max_productos FROM empresas WHERE id=2"))
    for row in r:
        print(row)
