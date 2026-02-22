from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    conn.execute(text("""
        UPDATE empresas 
        SET plan='basico', max_usuarios=1, max_productos=500 
        WHERE plan IS NULL OR max_productos IS NULL
    """))
    conn.commit()
    print("Listo - todas las empresas tienen plan basico")
