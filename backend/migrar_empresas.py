# ============================================================
# STOCKYA - Migración: Sistema de Empresas y Planes
# Archivo: backend/migrar_empresas.py
# Descripcion: Agrega la tabla empresas y migra los datos
#              existentes de forma segura sin perder nada
# Analogia: reorganizar el archivo de papeles del negocio
#           para que cada carpeta tenga el nombre de la empresa
# Ejecucion: python migrar_empresas.py
# ============================================================

from sqlalchemy import text
from database import engine

print("=" * 60)
print("STOCKYA - Migración: Sistema de Empresas")
print("=" * 60)

with engine.connect() as conn:

    # --------------------------------------------------------
    # PASO 1: Crear ENUM de plan si no existe
    # --------------------------------------------------------
    print("\n[1/8] Creando ENUMs de plan y rol...")
    conn.execute(text("""
        DO $$ BEGIN
            CREATE TYPE plan_empresa_enum AS ENUM ('basico', 'premium');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """))
    conn.execute(text("""
        DO $$ BEGIN
            CREATE TYPE rol_usuario_enum AS ENUM ('admin', 'operador');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """))
    conn.commit()
    print("    ✅ ENUMs creados")

    # --------------------------------------------------------
    # PASO 2: Crear tabla empresas
    # --------------------------------------------------------
    print("\n[2/8] Creando tabla empresas...")
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS empresas (
            id                  SERIAL PRIMARY KEY,
            nombre              VARCHAR(150) NOT NULL DEFAULT 'Mi Negocio',
            rubro               VARCHAR(100),
            moneda              VARCHAR(10) DEFAULT 'CLP',
            color_principal     VARCHAR(10) DEFAULT '#00C77B',
            logo_base64         TEXT,
            plan                plan_empresa_enum DEFAULT 'basico',
            plan_precio         FLOAT DEFAULT 0.0,
            plan_es_fundador    BOOLEAN DEFAULT FALSE,
            plan_activo         BOOLEAN DEFAULT TRUE,
            plan_expira         TIMESTAMP WITH TIME ZONE,
            stripe_customer_id  VARCHAR(100),
            max_usuarios        INTEGER DEFAULT 1,
            max_productos       INTEGER DEFAULT 500,
            onboarding_completo BOOLEAN DEFAULT FALSE,
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at          TIMESTAMP WITH TIME ZONE
        )
    """))
    conn.commit()
    print("    ✅ Tabla empresas creada")

    # --------------------------------------------------------
    # PASO 3: Agregar columnas empresa_id y rol a usuarios
    # PRIMERO las columnas, DESPUES llenarlas
    # --------------------------------------------------------
    print("\n[3/8] Agregando columnas empresa_id y rol a usuarios...")
    conn.execute(text("""
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)
    """))
    conn.execute(text("""
        ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS rol rol_usuario_enum DEFAULT 'admin'
    """))
    conn.commit()
    print("    ✅ Columnas agregadas a usuarios")

    # --------------------------------------------------------
    # PASO 4: Crear una empresa por cada usuario existente
    # --------------------------------------------------------
    print("\n[4/8] Creando empresas para usuarios existentes...")
    usuarios = conn.execute(text("SELECT id, nombre, email FROM usuarios")).fetchall()
    print(f"    Usuarios encontrados: {len(usuarios)}")

    for usuario in usuarios:
        # Si ya tiene empresa asignada, saltar
        ya_tiene = conn.execute(text(
            "SELECT empresa_id FROM usuarios WHERE id = :uid"
        ), {"uid": usuario.id}).fetchone()

        if ya_tiene and ya_tiene.empresa_id:
            print(f"    ⏭️  {usuario.email} ya tiene empresa")
            continue

        # Obtener datos de configuración existente
        config = conn.execute(text("""
            SELECT nombre_negocio, moneda, color_principal, logo_base64, rubro, onboarding_completo
            FROM configuracion WHERE usuario_id = :uid
        """), {"uid": usuario.id}).fetchone()

        nombre_negocio      = config.nombre_negocio      if config else "Mi Negocio"
        moneda              = config.moneda              if config else "CLP"
        color_principal     = config.color_principal     if config else "#00C77B"
        logo_base64         = config.logo_base64         if config else None
        rubro               = config.rubro               if config else None
        onboarding_completo = config.onboarding_completo if config else False

        # Crear empresa
        result = conn.execute(text("""
            INSERT INTO empresas (nombre, rubro, moneda, color_principal, logo_base64, onboarding_completo)
            VALUES (:nombre, :rubro, :moneda, :color, :logo, :onboarding)
            RETURNING id
        """), {
            "nombre":     nombre_negocio,
            "rubro":      rubro,
            "moneda":     moneda,
            "color":      color_principal,
            "logo":       logo_base64,
            "onboarding": onboarding_completo,
        })
        empresa_id = result.fetchone().id
        conn.commit()

        # Asignar empresa al usuario
        conn.execute(text("""
            UPDATE usuarios SET empresa_id = :eid WHERE id = :uid
        """), {"eid": empresa_id, "uid": usuario.id})
        conn.commit()
        print(f"    ✅ Empresa #{empresa_id} creada y asignada a {usuario.email}")

    # --------------------------------------------------------
    # PASO 5: Agregar empresa_id a productos
    # --------------------------------------------------------
    print("\n[5/8] Agregando empresa_id a productos...")
    conn.execute(text("""
        ALTER TABLE productos
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)
    """))
    conn.commit()

    # Migrar: asignar empresa_id según el usuario_id actual
    conn.execute(text("""
        UPDATE productos p
        SET empresa_id = u.empresa_id
        FROM usuarios u
        WHERE p.usuario_id = u.id
        AND p.empresa_id IS NULL
    """))
    conn.commit()
    print("    ✅ empresa_id asignado a todos los productos")

    # --------------------------------------------------------
    # PASO 6: Agregar empresa_id a movimientos
    # --------------------------------------------------------
    print("\n[6/8] Agregando empresa_id a movimientos...")
    conn.execute(text("""
        ALTER TABLE movimientos
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)
    """))
    conn.commit()

    conn.execute(text("""
        UPDATE movimientos m
        SET empresa_id = u.empresa_id
        FROM usuarios u
        WHERE m.usuario_id = u.id
        AND m.empresa_id IS NULL
    """))
    conn.commit()
    print("    ✅ empresa_id asignado a todos los movimientos")

    # --------------------------------------------------------
    # PASO 7: Agregar empresa_id a salidas
    # --------------------------------------------------------
    print("\n[7/8] Agregando empresa_id a salidas...")
    conn.execute(text("""
        ALTER TABLE salidas
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)
    """))
    conn.commit()

    conn.execute(text("""
        UPDATE salidas s
        SET empresa_id = u.empresa_id
        FROM usuarios u
        WHERE s.usuario_id = u.id
        AND s.empresa_id IS NULL
    """))
    conn.commit()
    print("    ✅ empresa_id asignado a todas las salidas")

    # --------------------------------------------------------
    # PASO 8: Eliminar restricción de unicidad vieja si existe
    # y crear la nueva por empresa
    # --------------------------------------------------------
    print("\n[8/8] Actualizando restricciones de unicidad...")
    conn.execute(text("""
        ALTER TABLE productos
        DROP CONSTRAINT IF EXISTS uq_producto_usuario_codigo
    """))
    conn.execute(text("""
        ALTER TABLE productos
        DROP CONSTRAINT IF EXISTS uq_producto_empresa_codigo
    """))
    conn.commit()

    # Crear nueva restricción de unicidad por empresa
    conn.execute(text("""
        DO $$ BEGIN
            ALTER TABLE productos
            ADD CONSTRAINT uq_producto_empresa_codigo
            UNIQUE (empresa_id, codigo_barra);
        EXCEPTION WHEN duplicate_table THEN NULL;
        END $$;
    """))
    conn.commit()
    print("    ✅ Restricciones actualizadas")

print("\n" + "=" * 60)
print("✅ Migración completada exitosamente")
print("   Todos los datos existentes fueron preservados")
print("=" * 60)