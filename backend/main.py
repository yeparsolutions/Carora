# ============================================================
# YEPARSTOCK - Servidor principal FastAPI
# Archivo: backend/main.py
# Descripcion: Punto de entrada del backend. Registra todos
#              los routers y configura CORS para el frontend.
# Ejecucion:  uvicorn main:app --reload --port 8000
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models

# --- Importar todos los routers ---
# ✅ auth ahora incluye los endpoints de onboarding:
#    GET  /auth/onboarding-status
#    POST /auth/completar-onboarding
from routers import auth, productos, movimientos, alertas, config, salidas, empresas, reportes, fiados

# --- Crear las tablas en PostgreSQL si no existen ---
# Analogia: es como crear las hojas de Excel vacias la primera vez
Base.metadata.create_all(bind=engine)

# --- Crear la aplicacion FastAPI ---
app = FastAPI(
    title       = "YeparStock API",
    description = "Backend para el sistema de control de inventario YeparStock",
    version     = "1.2.0"
)

# --- Configurar CORS ---
# REGLA: allow_origins=["*"] + allow_credentials=True NO se pueden combinar.
# ⚠️  IMPORTANTE PARA PRODUCCIÓN:
#     1. Reemplazar estas URLs por el dominio real del frontend (ej: "https://tuapp.com")
#     2. Nunca dejar "null" — permite requests desde archivos locales (file://) lo que
#        es un vector de ataque. Solo sirve en desarrollo con Live Server.
#     3. Cambiar SECRET_KEY en las variables de entorno — es el punto más crítico.
#        Analogia: es el molde para fabricar llaves (tokens). Si alguien lo roba,
#        puede entrar como cualquier usuario, incluso admin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        # "null",  # 🔧 ELIMINADO — peligroso en producción, solo activar en dev local
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# --- Registrar todos los routers ---
app.include_router(auth.router)        # login, registro, onboarding
app.include_router(productos.router)
app.include_router(movimientos.router)
app.include_router(alertas.router)
app.include_router(config.router)
app.include_router(salidas.router)
app.include_router(empresas.router)    # plan, usuarios, suscripción
app.include_router(reportes.router)    # reportes y estadísticas
app.include_router(fiados.router)      # deudores / cuentas por cobrar


# --- Endpoint raiz ---
@app.get("/")
def raiz():
    return {
        "mensaje": "YeparStock API funcionando",
        "version": "1.2.0",
        "docs":    "http://localhost:8000/docs"
    }


# --- Endpoint de salud ---
@app.get("/health")
def health_check():
    return {"status": "ok"}