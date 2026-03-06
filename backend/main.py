# ============================================================
# YEPARSTOCK - Servidor principal FastAPI
# Archivo: backend/main.py
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

from routers import auth, productos, movimientos, alertas, config, salidas, empresas, reportes, fiados

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
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(50)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS color_interfaz VARCHAR(10)",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sonido_escaner VARCHAR(20)",
        "ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL",
        """CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_empresa_username ON usuarios (empresa_id, username) WHERE username IS NOT NULL""",
        """CREATE TABLE IF NOT EXISTS permisos_usuario (id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, seccion VARCHAR(50) NOT NULL, permitido BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now(), CONSTRAINT uq_permiso_usuario_seccion UNIQUE (usuario_id, seccion))""",
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

ejecutar_migraciones()

app = FastAPI(title="YeparStock API", version="1.2.0")

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

app.include_router(auth.router)
app.include_router(productos.router)
app.include_router(movimientos.router)
app.include_router(alertas.router)
app.include_router(config.router)
app.include_router(salidas.router)
app.include_router(empresas.router)
app.include_router(reportes.router)
app.include_router(fiados.router)

@app.get("/")
def raiz():
    return {"mensaje": "YeparStock API funcionando", "version": "1.2.0"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
