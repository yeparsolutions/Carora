# ============================================================
# YEPARSTOCK — Módulo de Autenticación
# Archivo: backend/auth.py
# Descripción: Funciones de seguridad: hash, JWT y dependencia
#              de usuario autenticado. NO es un router.
# Analogia: es el portero del edificio — verifica identidades
#           y emite los pases de acceso (tokens JWT).
# ============================================================

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
from database import get_db
import models
import os
from dotenv import load_dotenv

# Carga las variables del archivo .env (debe estar en la raíz del backend)
# Analogia: abrir el manual de configuración antes de arrancar la máquina
load_dotenv()

# ============================================================
# Configuración de seguridad
# ============================================================

SECRET_KEY        = os.getenv("SECRET_KEY", "yeparstock_secret_key_cambiar_en_produccion")
ALGORITHM         = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRY_DAYS = int(os.getenv("TOKEN_EXPIRY_DAYS", "30"))  # días que dura el token

# Contexto bcrypt para hashear contraseñas
# Analogia: la máquina que convierte contraseñas en texto ilegible
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# ============================================================
# Funciones de contraseña
# ============================================================

def encriptar_password(password: str) -> str:
    """Convierte una contraseña en su hash bcrypt."""
    return pwd_context.hash(password)


def verificar_password(password_plano: str, password_hash: str) -> bool:
    """Compara una contraseña con su hash guardado en BD."""
    return pwd_context.verify(password_plano, password_hash)


# ============================================================
# Funciones JWT
# ============================================================

def crear_token(datos: dict) -> str:
    """
    Genera un token JWT firmado.
    Analogia: el portero emite un pase con fecha de vencimiento.
    """
    payload = datos.copy()
    expira  = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS)
    payload.update({"exp": expira})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decodificar_token(token: str) -> dict:
    """Decodifica y valida un token JWT. Lanza 401 si es inválido."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============================================================
# Dependencia: get_usuario_actual
# Usada en todos los endpoints protegidos con Depends()
# ============================================================

def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> models.Usuario:
    """
    Extrae el token del header y retorna el usuario autenticado.
    Analogia: el portero revisa el pase y busca el registro del visitante.
    """
    if not credenciales:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionó token de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decodificar_token(credenciales.credentials)
    email: str = payload.get("sub")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: sin email",
        )

    usuario = db.query(models.Usuario).filter(
        models.Usuario.email == email
    ).first()

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está desactivada",
        )

    return usuario


# ============================================================
# Helper: solo_admin
# ============================================================

def solo_admin(usuario: models.Usuario):
    """
    Lanza 403 si el usuario no es admin.
    Analogia: la puerta que solo abre con llave de gerente.
    """
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador para esta acción",
        )