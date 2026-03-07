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
    if sub.isdigit():
        # Formato nuevo: ID numérico directo
        usuario = db.query(models.Usuario).filter(
            models.Usuario.id == int(sub)
        ).first()

    elif sub.startswith("username:"):
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


# ============================================================
# ALIASES y FUNCIONES COMPATIBLES
# El router usa nombres distintos — estos aliases los unifican
# ============================================================

# Alias: get_current_user → get_usuario_actual
get_current_user = get_usuario_actual

# Alias: hashear_password → encriptar_password
def hashear_password(password: str) -> str:
    return encriptar_password(password)

# Alias: crear_access_token / crear_refresh_token → crear_token
def crear_access_token(data: dict) -> str:
    return crear_token(data, timedelta(minutes=ACCESS_TOKEN_MINUTES))

def crear_refresh_token(data: dict) -> str:
    return crear_token(data, timedelta(days=7))

def verificar_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

# ── Generación de username ───────────────────────────────────
import unicodedata
import re

def generar_username(nombre: str, apellido: str) -> str:
    """nombre.apellido en minúsculas sin tildes ni espacios."""
    def limpiar(s: str) -> str:
        s = unicodedata.normalize("NFD", s)
        s = "".join(c for c in s if unicodedata.category(c) != "Mn")
        s = re.sub(r"[^a-z0-9]", "", s.lower().strip())
        return s
    n = limpiar(nombre.split()[0] if nombre else "usuario")
    a = limpiar(apellido.split()[0] if apellido else "")
    return f"{n}.{a}" if a else n

def username_unico(base: str, db) -> str:
    """Detecta colisiones y agrega número si ya existe."""
    from models import Usuario
    if not db.query(Usuario).filter(Usuario.username == base).first():
        return base
    i = 1
    while db.query(Usuario).filter(Usuario.username == f"{base}{i}").first():
        i += 1
    return f"{base}{i}"

# ── Códigos de verificación (en memoria) ────────────────────
import secrets
from datetime import datetime, timezone, timedelta

_codigos: dict = {}  # {usuario_id_tipo: (codigo, expira)}

def generar_codigo_verificacion() -> str:
    return str(secrets.randbelow(900000) + 100000)

def guardar_codigo(usuario_id: int, codigo: str, db, tipo: str = "verificacion") -> None:
    key = f"{usuario_id}_{tipo}"
    expira = datetime.now(timezone.utc) + timedelta(minutes=15)
    _codigos[key] = (codigo, expira)

def verificar_codigo(usuario_id: int, codigo: str, db, tipo: str = "verificacion") -> bool:
    key = f"{usuario_id}_{tipo}"
    entry = _codigos.get(key)
    if not entry:
        return False
    stored, expira = entry
    if datetime.now(timezone.utc) > expira:
        del _codigos[key]
        return False
    if stored != codigo:
        return False
    del _codigos[key]
    return True

# ── Envío de emails ──────────────────────────────────────────
import smtplib, os
from email.mime.text import MIMEText

def _enviar_email(destinatario: str, asunto: str, cuerpo: str) -> None:
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_host or not smtp_user:
        print(f"[AUTH] Email omitido (sin config SMTP). Código para {destinatario}: {cuerpo[:6]}")
        return
    try:
        msg = MIMEText(cuerpo, "html")
        msg["Subject"] = asunto
        msg["From"]    = smtp_user
        msg["To"]      = destinatario
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.sendmail(smtp_user, [destinatario], msg.as_string())
    except Exception as e:
        print(f"[AUTH] Error enviando email: {e}")

def enviar_codigo_email(email: str, codigo: str, nombre: str) -> None:
    _enviar_email(
        email,
        "Verifica tu cuenta YeparStock",
        f"<p>Hola <b>{nombre}</b>, tu código de verificación es: <b style='font-size:24px'>{codigo}</b></p>"
    )

def enviar_codigo_reset(email: str, codigo: str, nombre: str) -> None:
    _enviar_email(
        email,
        "Recupera tu contraseña YeparStock",
        f"<p>Hola <b>{nombre}</b>, tu código para restablecer tu contraseña es: <b style='font-size:24px'>{codigo}</b></p>"
    )
