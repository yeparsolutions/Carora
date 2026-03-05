# ============================================================
# YEPARSTOCK - Servidor principal FastAPI
# Archivo: backend/main.py
# ============================================================

import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar .env PRIMERO antes de cualquier otro import
# Analogia: encender las luces antes de entrar a la habitacion
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models

from routers import auth, productos, movimientos, alertas, config, salidas, empresas, reportes, fiados

Base.metadata.create_all(bind=engine)

app = FastAPI(title="YeparStock API", version="1.2.0")

# Orígenes siempre permitidos — producción + desarrollo local
_ORIGINS_BASE = [
    "https://yeparstock.yeparsolutions.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
_origins_extra = [o.strip() for o in _origins_env.split(",") if o.strip()]
ALLOWED_ORIGINS = list(set(_ORIGINS_BASE + _origins_extra))

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
