# ============================================================
# YEPARSTOCK - Servidor principal FastAPI
# Archivo: backend/main.py
# ============================================================
# CAMBIOS v2 — Multi-sucursal Plan Pro:
#   ✅ Línea 1: importar router de sucursales
#   ✅ Línea 2: agregar migraciones de sucursales
#   ✅ Línea 3: registrar app.include_router(sucursales.router)
# ============================================================

import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar .env PRIMERO antes de cualquier otro import
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models

# ✅ CAMBIO 1 — agregar "sucursales" al import del router
# Solo se agrega una palabra aquí, nada más cambia en esta línea
from routers import auth, productos, movimientos, alertas, config, salidas, empresas, reportes, fiados, sucursales

Base.metadata.create_all(bind=engine)

# ── Migraciones automáticas ──────────────────────────────────
from sqlalchemy import text

def ejecutar_migraciones():
    migraciones = [
        # num_documento en movimientos
        "ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS num_documento VARCHAR(100)",
        # empresa_id en movimientos
        "ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS empresa_id INTEGER",
        # sonido_escaner en configuracion
        "ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS sonido_escaner VARCHAR(20) DEFAULT 'scanner'",
        # plan gratis — agregar al enum si no existe
        "ALTER TYPE plan_empresa_enum ADD VALUE IF NOT EXISTS 'gratis'",
        # ── Sistema de colaboradores con username ──────────────
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(50)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS color_interfaz VARCHAR(10)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sonido_escaner VARCHAR(20)",
        "ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL",
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_empresa_username ON usuarios (empresa_id, username) WHERE username IS NOT NULL""",
        """CREATE TABLE IF NOT EXISTS permisos_usuario (id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, seccion VARCHAR(50) NOT NULL, permitido BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now(), CONSTRAINT uq_permiso_usuario_seccion UNIQUE (usuario_id, seccion))""",

        # ✅ CAMBIO 2 — Migraciones multi-sucursal Plan Pro
        # Analogía: remodelar el hotel para agregar los nuevos pisos

        # 2a. Tabla sucursales
        """CREATE TABLE IF NOT EXISTS sucursales (
            id          SERIAL PRIMARY KEY,
            empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
            nombre      VARCHAR(150) NOT NULL,
            direccion   VARCHAR(255),
            telefono    VARCHAR(50),
            activa      BOOLEAN DEFAULT TRUE,
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_at  TIMESTAMPTZ,
            UNIQUE (empresa_id, nombre)
        )""",

        # 2b. Índice de sucursales por empresa
        "CREATE INDEX IF NOT EXISTS idx_sucursales_empresa_id ON sucursales(empresa_id)",

        # 2c. Rol "lider" en el enum — el gerente de sucursal
        """DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'lider'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'rol_usuario_enum')
            ) THEN
                ALTER TYPE rol_usuario_enum ADD VALUE 'lider';
            END IF;
        END$$""",

        # 2d. Columna sucursal_id en usuarios (null = admin, ve todo)
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_usuarios_sucursal_id ON usuarios(sucursal_id)",

        # 2e. max_sucursales en empresas (1 por defecto, 3 para Pro)
        "ALTER TABLE empresas ADD COLUMN IF NOT EXISTS max_sucursales INTEGER DEFAULT 1",
        "ALTER TABLE empresas ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE",
        "ALTER TABLE empresas ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT FALSE",
        "ALTER TABLE empresas ADD COLUMN IF NOT EXISTS en_gracia BOOLEAN DEFAULT FALSE",

        # 2f. sucursal_id en productos, movimientos y salidas para trazabilidad
        "ALTER TABLE productos    ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL",
        "ALTER TABLE movimientos  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL",
        "ALTER TABLE salidas      ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL",

        # 2g. Índices de sucursal_id para performance en consultas filtradas
        "CREATE INDEX IF NOT EXISTS idx_productos_sucursal_id   ON productos(sucursal_id)",
        "CREATE INDEX IF NOT EXISTS idx_movimientos_sucursal_id ON movimientos(sucursal_id)",
        "CREATE INDEX IF NOT EXISTS idx_salidas_sucursal_id     ON salidas(sucursal_id)",
    ]

    with engine.connect() as conn:
        for sql in migraciones:
            try:
                conn.execute(text(sql))
            except Exception:
                pass
        conn.commit()

    # Actualizar limites a ilimitado (0) para basico y pro
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE empresas SET max_usuarios = 0, max_productos = 0 "
                "WHERE plan IN ('basico', 'pro') AND max_usuarios <= 3"
            ))
            conn.commit()
    except Exception:
        pass

    # ✅ CAMBIO 3 — Actualizar max_sucursales = 3 para empresas Pro existentes
    # Las empresas que ya eran Pro antes de este update deben tener su límite correcto
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE empresas SET max_sucursales = 3 WHERE plan = 'pro'"
            ))
            conn.commit()
    except Exception:
        pass

ejecutar_migraciones()

app = FastAPI(title="YeparStock API", version="1.3.0")  # ← versión bump por multi-sucursal

_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _origins_env.strip() == "*":
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
else:
    _ORIGINS_BASE = [
        "https://yeparstock.yeparsolutions.com",
        "https://www.yeparstock.yeparsolutions.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    _extras = [o.strip() for o in _origins_env.split(",") if o.strip()]
    ALLOWED_ORIGINS = list(set(_ORIGINS_BASE + _extras))
    app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Routers existentes — sin cambios
app.include_router(auth.router)
app.include_router(productos.router)
app.include_router(movimientos.router)
app.include_router(alertas.router)
app.include_router(config.router)
app.include_router(salidas.router)
app.include_router(empresas.router)
app.include_router(reportes.router)
app.include_router(fiados.router)

# ✅ CAMBIO 4 — Registrar el nuevo router de sucursales
app.include_router(sucursales.router)

@app.get("/")
def raiz():
    return {"mensaje": "YeparStock API funcionando", "version": "1.3.0"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
