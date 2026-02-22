# ============================================================
# STOCKYA — Actualizar planes de empresa
# Archivo: backend/actualizar_planes.py
# Ejecutar: python actualizar_planes.py
# ============================================================

from sqlalchemy import text
from database import engine

with engine.connect() as conn:

    # 1. Actualizar el enum en PostgreSQL para tener basico y pro
    # Analogia: cambiar el menú del restaurante — renombrar "premium" a "pro"
    try:
        conn.execute(text("ALTER TYPE plan_empresa_enum RENAME VALUE 'premium' TO 'pro'"))
        conn.commit()
        print("✅ Enum actualizado: premium → pro")
    except Exception as e:
        conn.rollback()
        print(f"⚠️  Enum ya estaba actualizado o no existe: {e}")

    # 2. Actualizar todas las empresas con plan NULL a basico
    conn.execute(text("""
        UPDATE empresas 
        SET plan = 'basico',
            plan_precio = 14990,
            max_usuarios = 1,
            max_productos = 200
        WHERE plan IS NULL
    """))
    conn.commit()
    print("✅ Empresas sin plan → plan básico asignado")

    # 3. Actualizar empresas que ya tenían basico con nuevos límites
    conn.execute(text("""
        UPDATE empresas 
        SET plan_precio = 14990,
            max_usuarios = 1,
            max_productos = 200
        WHERE plan = 'basico'
    """))
    conn.commit()
    print("✅ Plan básico: $14.990 · 1 usuario · 200 productos")

    # 4. Actualizar empresas pro con nuevos límites
    conn.execute(text("""
        UPDATE empresas 
        SET plan_precio = 29990,
            max_usuarios = 3,
            max_productos = 1500
        WHERE plan = 'pro'
    """))
    conn.commit()
    print("✅ Plan pro: $29.990 · 3 usuarios · 1.500 productos")

    # 5. Verificar resultado
    r = conn.execute(text("SELECT id, nombre, plan, plan_precio, max_usuarios, max_productos FROM empresas"))
    print("\n📋 Estado actual de empresas:")
    print(f"{'ID':<4} {'Nombre':<25} {'Plan':<10} {'Precio':<12} {'Usuarios':<10} {'Productos'}")
    print("-" * 75)
    for row in r:
        print(f"{row[0]:<4} {row[1]:<25} {str(row[2]):<10} ${row[3]:<11,.0f} {row[4]:<10} {row[5]}")

print("\n✅ Planes actualizados correctamente")
