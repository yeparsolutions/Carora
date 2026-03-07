# ============================================================
# YEPARSTOCK — Módulo de Autenticación
# Archivo: backend/auth.py
# ============================================================
# CAMBIOS v2 — Multi-sucursal Plan Pro:
#   ✅ solo_lider()         → permite solo rol "lider"
#   ✅ admin_o_lider()      → permite admin O lider
#   ✅ verificar_acceso_sucursal() → valida que el lider
#      solo toque su propia sucursal
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

# Límites de sucursales por plan
# Analogía: el contrato de franquicia que firma cada dueño
LIMITE_SUCURSALES = {
    "gratis": 1,
    "basico": 1,
    "pro":    3,
}


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
#   2. Username: "username:juan:5"          → operador/lider sin email
#      donde 5 es el empresa_id
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
        partes = sub.split(":")
        if len(partes) != 3:
            raise HTTPException(status_code=401, detail="Token inválido — formato de username incorrecto")

        _, username, empresa_id_str = partes

        try:
            empresa_id = int(empresa_id_str)
        except ValueError:
            raise HTTPException(status_code=401, detail="Token inválido — empresa_id no es numérico")

        if empresa_id == 0:
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
# Sin cambios respecto a v1
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
# solo_lider — ✅ NUEVO
# Permite solo usuarios con rol "lider" (gerente de sucursal)
# Analogía: puerta que solo abre con el carnet de gerente de piso
# ============================================================
def solo_lider(usuario: models.Usuario) -> models.Usuario:
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol != "lider":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los líderes de sucursal pueden realizar esta acción",
        )
    return usuario


# ============================================================
# admin_o_lider — ✅ NUEVO
# Permite admin O lider — cada uno con su alcance de datos.
# El filtro de sucursal se aplica en los routers según el rol.
#
# Analogía: la sala de reuniones acepta tanto al dueño del hotel
# como al gerente de piso, pero cada uno solo habla de su área.
# ============================================================
def admin_o_lider(usuario: models.Usuario) -> models.Usuario:
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol not in ("admin", "lider"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador o líder de sucursal",
        )
    return usuario


# ============================================================
# verificar_acceso_sucursal — ✅ NUEVO
# Valida que un líder solo acceda a SU sucursal.
# Si es admin, pasa siempre.
#
# Uso en routers:
#   verificar_acceso_sucursal(usuario, sucursal_id_del_recurso)
#
# Analogía: la llave del gerente abre su piso, no los demás.
# ============================================================
def verificar_acceso_sucursal(usuario: models.Usuario, sucursal_id: int) -> None:
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol

    # El admin siempre puede — tiene el llavero maestro
    if rol == "admin":
        return

    # El lider solo puede si esa sucursal es la suya
    if rol == "lider":
        if usuario.sucursal_id != sucursal_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes acceso a esta sucursal",
            )
        return

    # Cualquier otro rol (operador) no tiene acceso a gestión de sucursales
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para esta acción",
    )


# ============================================================
# verificar_limite_sucursales — ✅ NUEVO
# Valida que la empresa no supere su límite según el plan.
# Llamar ANTES de crear una nueva sucursal.
#
# Analogía: el portero cuenta cuántos locales ya tienes antes
# de firmarte el contrato del nuevo local.
# ============================================================
def verificar_limite_sucursales(empresa: models.Empresa, db: Session) -> None:
    plan = empresa.plan.value if hasattr(empresa.plan, "value") else empresa.plan

    # Cuántas sucursales activas tiene esta empresa
    total_activas = db.query(models.Sucursal).filter(
        models.Sucursal.empresa_id == empresa.id,
        models.Sucursal.activa     == True
    ).count()

    limite = LIMITE_SUCURSALES.get(plan, 1)

    if total_activas >= limite:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "tipo":            "limite_sucursales",
                "mensaje":         f"Tu plan '{plan}' permite máximo {limite} sucursal(es) activa(s).",
                "sucursales_usadas": total_activas,
                "limite":          limite,
                "plan_actual":     plan,
                "upgrade_url":     "/planes",
            }
        )


# ============================================================
# solo_plan_pro — sin cambios respecto a v1
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
