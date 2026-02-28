# ============================================================
# YEPARSTOCK — Script para borrar usuarios de prueba
# Archivo: backend/borrar_usuarios.py
#
# USO:
#   cd "E:\Proyecto Carora\backend"
#   venv\Scripts\python borrar_usuarios.py
#
# Analogia: el libro de registros del negocio — puedes borrar
# una entrada equivocada antes de que quede permanente
# ============================================================

from database import get_db, engine
from sqlalchemy.orm import Session
import models

# ============================================================
# CONFIGURA AQUI los emails que quieres borrar
# ============================================================
EMAILS_A_BORRAR = [
    "max@ejemplo.com",
    "prueba@test.com",
    # agrega más aquí...
]

def borrar_usuarios():
    db = Session(engine)
    try:
        for email in EMAILS_A_BORRAR:
            usuario = db.query(models.Usuario).filter(
                models.Usuario.email == email
            ).first()

            if not usuario:
                print(f"❌ No encontrado: {email}")
                continue

            # Borrar configuración asociada si existe
            config = db.query(models.Configuracion).filter(
                models.Configuracion.usuario_id == usuario.id
            ).first()
            if config:
                db.delete(config)

            db.delete(usuario)
            print(f"✅ Borrado: {email} (ID: {usuario.id})")

        db.commit()
        print("\n✅ Listo — cambios guardados en la base de datos")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Mostrar usuarios actuales antes de borrar
    db = Session(engine)
    usuarios = db.query(models.Usuario).all()
    print("=" * 50)
    print("USUARIOS REGISTRADOS ACTUALMENTE:")
    print("=" * 50)
    for u in usuarios:
        verificado = "✅" if u.email_verificado else "⏳"
        print(f"  {verificado} [{u.id}] {u.email} — {u.nombre}")
    db.close()

    print("\n" + "=" * 50)
    print("EMAILS A BORRAR:")
    for e in EMAILS_A_BORRAR:
        print(f"  🗑️  {e}")
    print("=" * 50)

    confirmar = input("\n¿Confirmas el borrado? (escribe 'si' para continuar): ")
    if confirmar.strip().lower() == "si":
        borrar_usuarios()
    else:
        print("Cancelado — no se borró nada")
