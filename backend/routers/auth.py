# ============================================================
# STOCKYA — Router de Autenticación
# Archivo: backend/routers/auth.py
# Descripción: Endpoints para login y registro de usuarios
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from auth import encriptar_password, verificar_password, crear_token, get_usuario_actual
import models, schemas

# Crear el router con prefijo /auth
router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ============================================================
# POST /auth/registro
# Crea un usuario nuevo en la base de datos
# ============================================================
@router.post("/registro", response_model=schemas.TokenRespuesta, status_code=201)
def registrar_usuario(datos: schemas.UsuarioCrear, db: Session = Depends(get_db)):
    """Registra un usuario nuevo. Si el email ya existe retorna error 400."""

    # Verificar si el email ya está registrado
    existe = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()
    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este correo ya está registrado"
        )

    # Crear el usuario con contraseña encriptada
    nuevo_usuario = models.Usuario(
        nombre        = datos.nombre,
        email         = datos.email,
        password_hash = encriptar_password(datos.password)
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # Crear configuración inicial del negocio para el usuario
    config_inicial = models.Configuracion(
        usuario_id      = nuevo_usuario.id,
        nombre_negocio  = "Mi Negocio",
        moneda          = "CLP",
        color_principal = "#00C77B"
    )
    db.add(config_inicial)
    db.commit()

    # Generar token JWT — el usuario queda logueado de inmediato
    token = crear_token({"sub": nuevo_usuario.email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": nuevo_usuario
    }


# ============================================================
# POST /auth/login
# Verifica credenciales y retorna token JWT
# ============================================================
@router.post("/login", response_model=schemas.TokenRespuesta)
def login(datos: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Inicia sesión con email y contraseña.
    Analogía: la recepcionista que verifica tu carnet y te da el pase.
    """
    # Buscar usuario por email
    usuario = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()

    # Verificar que existe y que la contraseña es correcta
    if not usuario or not verificar_password(datos.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos"
        )

    # Verificar que la cuenta está activa
    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está desactivada"
        )

    # Generar y retornar el token JWT
    token = crear_token({"sub": usuario.email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": usuario
    }


# ============================================================
# GET /auth/yo
# Retorna los datos del usuario autenticado actual
# ============================================================
@router.get("/yo", response_model=schemas.UsuarioRespuesta)
def obtener_yo(
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Retorna los datos del usuario autenticado a partir del token JWT."""
    return usuario_actual
