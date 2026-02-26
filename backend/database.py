# ============================================================
# YEPARSTOCK - Conexion a la base de datos
# Archivo: backend/database.py
# ============================================================

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Buscar .env desde la carpeta donde esta este archivo
# Analogia: el mapa siempre apunta al mismo lugar sin importar desde donde lo abras
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()