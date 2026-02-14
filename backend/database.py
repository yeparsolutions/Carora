# ============================================================
# STOCKYA — Conexión a la base de datos
# Archivo: backend/database.py
# Descripción: Configura la conexión a PostgreSQL usando SQLAlchemy
# Analogía: es el "cable" que conecta FastAPI con PostgreSQL
# ============================================================

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# --- URL de conexión a PostgreSQL ---
# Formato: postgresql://usuario:contraseña@host:puerto/nombre_db
DATABASE_URL = "postgresql://postgres:Yepar2026@localhost:5433/carora"

# --- Motor de base de datos ---
# Analogía: el motor es el "chofer" que sabe cómo hablar con PostgreSQL
engine = create_engine(DATABASE_URL)

# --- Fábrica de sesiones ---
# Cada sesión es como abrir y cerrar una conversación con la BD
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- Clase base para los modelos ---
# Todos los modelos (tablas) heredan de esta clase
Base = declarative_base()


# --- Dependencia de sesión para FastAPI ---
# Se usa en cada endpoint para obtener una sesión y cerrarla al terminar
# Analogía: es como pedir una mesa en el restaurante y devolverla al salir
def get_db():
    db = SessionLocal()
    try:
        yield db          # entrega la sesión al endpoint
    finally:
        db.close()        # siempre cierra la sesión al terminar
