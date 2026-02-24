# ============================================================
# STOCKYA — Resetear contraseñas de usuarios
# Archivo: backend/reset_passwords.py
# Ejecutar: python reset_passwords.py
# ============================================================

from sqlalchemy import text
from database import engine
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ⚙️  CONFIGURA AQUÍ las contraseñas nuevas
NUEVAS_PASSWORDS = {
    "alberto_yepez@yepargroup.com":  "1234",
    "adriana_yepez@yepargroup.com":  "1234",
    "adriana_yepez@gmail.com":       "1234",
    "Adriana@yepar.com":             "1234",
    "mariangel@yeparsolutions.com":  "1234",
    "Yalberto60@gmail.com":          "1234",
}

print("🔄 Reseteando contraseñas...\n")

with engine.connect() as conn:
    for email, nueva_pass in NUEVAS_PASSWORDS.items():
        nuevo_hash = pwd_context.hash(nueva_pass)
        result = conn.execute(
            text("UPDATE usuarios SET password_hash = :hash WHERE email = :email"),
            {"hash": nuevo_hash, "email": email}
        )
        conn.commit()
        if result.rowcount:
            print(f"  ✅ {email} → contraseña: {nueva_pass}")
        else:
            print(f"  ⚠️  {email} no encontrado")

print("\n✅ Listo — todos los usuarios tienen contraseña: 1234")
print("   Recuerda decirles que la cambien desde su perfil.")
