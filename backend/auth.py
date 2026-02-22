# ============================================================
# STOCKYA — Utilidades de autenticación
# Archivo: backend/auth.py
# Descripción: Maneja encriptación de contraseñas y tokens JWT
# Analogía: es el "guardia de seguridad" que verifica
#           que cada usuario sea quien dice ser
# ============================================================

import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models

# Cargar variables de entorno
load_dotenv()

# --- Configuración de seguridad ---
# SECRET_KEY viene del archivo .env — nunca hardcodeada en el código
# Analogía: la combinación de la caja fuerte está en un lugar seguro, no pegada en la puerta
SECRET_KEY   = os.getenv("SECRET_KEY", "clave-local-de-desarrollo-cambiar-en-produccion")
ALGORITHM    = "HS256"
TOKEN_EXPIRY = 60 * 24  # Token válido por 24 horas (en minutos)

# --- Contexto de encriptación de contraseñas ---
# Analogía: bcrypt es la "caja fuerte" que guarda contraseñas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Esquema OAuth2 para FastAPI ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# --- Funciones de contraseña ---

def encriptar_password(password: str) -> str:
    """Convierte una contraseña en texto plano a hash seguro."""
    return pwd_context.hash(password)

def verificar_password(password_plano: str, password_hash: str) -> bool:
    """Verifica si la contraseña ingresada coincide con el hash guardado."""
    return pwd_context.verify(password_plano, password_hash)


# --- Funciones de token JWT ---

def crear_token(data: dict, expiry_minutos: Optional[int] = None) -> str:
    """
    Crea un token JWT con los datos del usuario.
    Analogía: es como crear una tarjeta de acceso temporal con fecha de vencimiento.
    """
    payload = data.copy()
    expira  = datetime.utcnow() + timedelta(minutes=expiry_minutos or TOKEN_EXPIRY)
    payload.update({"exp": expira})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verificar_token(token: str) -> Optional[dict]:
    """
    Decodifica y verifica un token JWT.
    Retorna los datos si es válido, None si expiró o es inválido.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# --- Dependencia: obtener usuario actual ---

def get_usuario_actual(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.Usuario:
    """
    Dependencia de FastAPI que extrae el usuario del token JWT.
    Se usa en los endpoints protegidos con: Depends(get_usuario_actual)
    Analogía: es el torniquete que valida tu credencial antes de dejarte pasar.
    """
    credenciales_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verificar_token(token)
    if payload is None:
        raise credenciales_error

    email: str = payload.get("sub")
    if email is None:
        raise credenciales_error

    usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if usuario is None or not usuario.activo:
        raise credenciales_error

    return usuario