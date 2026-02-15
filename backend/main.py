# ============================================================
# STOCKYA – Servidor principal FastAPI
# Archivo: backend/main.py
# Descripción: Punto de entrada del backend. Registra todos
#              los routers y configura CORS para el frontend.
# Ejecución:  uvicorn main:app --reload --port 8000
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models

# --- Importar todos los routers ---
from routers import auth, productos, movimientos, alertas, config

# --- Crear las tablas en PostgreSQL si no existen ---
# Analogía: es como crear las hojas de Excel vacías la primera vez
Base.metadata.create_all(bind=engine)

# --- Crear la aplicación FastAPI ---
app = FastAPI(
    title       = "Stockya API",
    description = "Backend para el sistema de control de inventario Stockya",
    version     = "1.0.0"
)

# --- Configurar CORS ---
# CORS permite que el frontend (archivo HTML abierto en el navegador)
# pueda hacer peticiones al backend.
# Analogía: es el permiso que le damos al frontend para
# "hablar" con el backend aunque estén en puertos distintos.
#
# ⚠️  REGLA IMPORTANTE:
# allow_origins=["*"]  +  allow_credentials=True  → NO se pueden combinar
# El navegador bloquea esta combinación por seguridad.
# Solución: usar allow_credentials=False para desarrollo local.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # Acepta cualquier origen, incluido null (archivo local)
    allow_credentials=False,     # ← CORREGIDO: era True, incompatible con origins=["*"]
    allow_methods=["*"],         # GET, POST, PUT, DELETE
    allow_headers=["*"],
)

# --- Registrar todos los routers ---
app.include_router(auth.router)
app.include_router(productos.router)
app.include_router(movimientos.router)
app.include_router(alertas.router)
app.include_router(config.router)


# --- Endpoint raíz para verificar que el servidor está funcionando ---
@app.get("/")
def raiz():
    return {
        "mensaje": "Stockya API funcionando",
        "version": "1.0.0",
        "docs": "http://localhost:8000/docs"
    }


# --- Endpoint de salud del servidor ---
@app.get("/health")
def health_check():
    return {"status": "ok"}