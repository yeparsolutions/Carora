from database import engine
from sqlalchemy.orm import Session
import models

db = Session(engine)
usuarios = db.query(models.Usuario).all()
print("=" * 65)
print("  ID  | VERIF | ROL       | EMAIL")
print("=" * 65)
for u in usuarios:
    v = "SI" if u.email_verificado else "NO"
    rol = u.rol.value if hasattr(u.rol, "value") else u.rol
    print(f"  {u.id:<4} | {v:<5} | {rol:<9} | {u.email}")
print("=" * 65)
print(f"  Total: {len(usuarios)} usuarios")
db.close()