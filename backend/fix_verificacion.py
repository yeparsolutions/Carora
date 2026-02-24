# ============================================================
# STOCKYA — Fix: marcar usuarios existentes como verificados
# Archivo: backend/fix_verificacion.py
# Ejecutar UNA sola vez: python fix_verificacion.py
# ============================================================

from sqlalchemy import text
from database import engine

print("🔄 Verificando usuarios existentes...")

with engine.connect() as conn:
    # Marcar todos como verificados
    result = conn.execute(text(
        "UPDATE usuarios SET email_verificado = TRUE WHERE email_verificado IS NULL OR email_verificado = FALSE"
    ))
    conn.commit()
    print(f"  ✅ {result.rowcount} usuario(s) marcados como verificados")

print("\n✅ Listo — ya puedes iniciar sesión con todas las cuentas")
