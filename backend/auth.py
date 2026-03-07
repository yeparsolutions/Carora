# ============================================================
# YEPARSTOCK — Módulo de Autenticación
# Archivo: backend/auth.py  ← va en la RAIZ del backend
# Descripcion: Funciones core — hashing, tokens y guards
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
#
# Soporta dos formatos de token (campo "sub"):
#   1. Email:    "juan@empresa.com"         → admin/dueño
#   2. Username: "username:juan:5"          → operador sin email
#      donde 5 es el empresa_id
#
# Analogia: el portero ahora acepta dos tipos de pase —
# el carnet corporativo (email) y el carnet interno (username)
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
        sub: str = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=401, detail="Token inválido — sin subject")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Determinar tipo de token y buscar usuario ────────────
    if sub.startswith("username:"):
        # Formato: "username:<username>:<empresa_id>"
        # Analogia: el carnet interno tiene el apodo y el número de sucursal
        partes = sub.split(":")
        if len(partes) != 3:
            raise HTTPException(status_code=401, detail="Token inválido — formato de username incorrecto")

        _, username, empresa_id_str = partes

        try:
            empresa_id = int(empresa_id_str)
        except ValueError:
            raise HTTPException(status_code=401, detail="Token inválido — empresa_id no es numérico")

        if empresa_id == 0:
            # Admin recién registrado — aún no tiene empresa_id asignado
            usuario = db.query(models.Usuario).filter(
                models.Usuario.username == username,
            ).first()
        else:
            usuario = db.query(models.Usuario).filter(
                models.Usuario.username   == username,
                models.Usuario.empresa_id == empresa_id,
            ).first()

    else:
        # Formato clásico: email
        usuario = db.query(models.Usuario).filter(
            models.Usuario.email == sub
        ).first()

    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    if not usuario.activo:
        raise HTTPException(status_code=403, detail="Esta cuenta está desactivada. Contacta al administrador.")

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


# ============================================================
# solo_plan_pro — permite solo empresas con plan Pro
# ============================================================
def solo_plan_pro(
    usuario: models.Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
) -> models.Usuario:
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    plan = empresa.plan.value if hasattr(empresa.plan, "value") else empresa.plan

    if plan != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "tipo":           "plan_requerido",
                "mensaje":        "Esta función es exclusiva del Plan Pro.",
                "plan_actual":    plan,
                "plan_requerido": "pro",
            }
        )

    return usuario
