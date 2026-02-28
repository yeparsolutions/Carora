# ============================================================
# YEPARSTOCK — Módulo de Autenticación
# Archivo: backend/auth.py  ← va en la RAIZ del backend
# Descripcion: Funciones core — hashing, tokens y guards
#
# Analogia: la caja fuerte del sistema — aqui viven las llaves
# maestras que todos los routers necesitan para funcionar.
# ============================================================

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db
import models

load_dotenv()

# ── Configuración JWT ────────────────────────────────────────
SECRET_KEY           = os.getenv("SECRET_KEY", "clave-secreta-cambiar-en-produccion")
ALGORITHM            = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))

# ── Hashing de contraseñas con bcrypt ───────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Extractor de Bearer token ────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


# ============================================================
# encriptar_password
# Analogia: meter la llave en una caja sellada — nadie puede
# sacar la llave original, solo verificar si coincide
# ============================================================
def encriptar_password(password: str) -> str:
    return pwd_context.hash(password)


# ============================================================
# verificar_password
# ============================================================
def verificar_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ============================================================
# crear_token — genera JWT firmado con expiración
# Analogia: el pase temporal del edificio — tiene tu nombre
# y una fecha de vencimiento impresa
# ============================================================
def crear_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_MINUTES)
    )
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ============================================================
# get_usuario_actual — extrae y valida el usuario del JWT
# Analogia: el portero que lee el pase y verifica que sea válido
# ============================================================
def get_usuario_actual(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.Usuario:

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionó token de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Token inválido — sin subject")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    if not usuario.activo:
        raise HTTPException(status_code=403, detail="Esta cuenta está desactivada")

    return usuario


# ============================================================
# solo_admin — permite solo usuarios con rol admin
# ============================================================
def solo_admin(usuario: models.Usuario) -> models.Usuario:
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )
    return usuario