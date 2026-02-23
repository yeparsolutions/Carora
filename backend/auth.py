# ============================================================
# STOCKYA — Utilidades de autenticación
# Archivo: backend/auth.py  ← OJO: este va en la RAÍZ del backend
#                              NO en la carpeta routers/
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

load_dotenv()

SECRET_KEY   = os.getenv("SECRET_KEY", "clave-local-de-desarrollo-cambiar-en-produccion")
ALGORITHM    = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRY = int(os.getenv("TOKEN_EXPIRY", "1440"))

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def encriptar_password(password: str) -> str:
    return pwd_context.hash(password)


def verificar_password(password_plano: str, password_hash: str) -> bool:
    return pwd_context.verify(password_plano, password_hash)


def crear_token(data: dict, expiry_minutos: Optional[int] = None) -> str:
    payload = data.copy()
    expira  = datetime.utcnow() + timedelta(minutes=expiry_minutos or TOKEN_EXPIRY)
    payload.update({"exp": expira})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_usuario_actual(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.Usuario:
    """
    Dependencia de FastAPI que extrae el usuario del token JWT.
    Analogía: el torniquete que valida tu credencial antes de dejarte pasar.
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


def solo_admin(usuario: models.Usuario) -> models.Usuario:
    """
    Verifica que el usuario tenga rol de admin.
    Analogía: el guardia que solo deja pasar al gerente a ciertas áreas.
    Lanza 403 si no es admin.
    """
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción"
        )
    return usuario