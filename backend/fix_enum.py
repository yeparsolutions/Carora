from sqlalchemy import text
from database import engine

with engine.connect() as conn:
    conn.execute(text("ALTER TYPE plan_empresa_enum RENAME VALUE 'premium' TO 'pro'"))
    conn.commit()
    print("OK — enum renombrado de 'premium' a 'pro'")
