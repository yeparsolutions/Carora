# ============================================================
# STOCKYA – Router de Autenticación
# Archivo: backend/routers/auth.py
# Descripción: Endpoints para login y registro de usuarios
# ✅ ACTUALIZADO: registro retorna onboarding_completo
#    para que el frontend sepa si mostrar el onboarding
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from auth import encriptar_password, verificar_password, crear_token, get_usuario_actual
import models, schemas

router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ============================================================
# POST /auth/registro
# ============================================================
@router.post("/registro", response_model=schemas.TokenRespuesta, status_code=201)
def registrar_usuario(datos: schemas.UsuarioCrear, db: Session = Depends(get_db)):
    """
    Registra un usuario nuevo.
    Analogia: abrir una cuenta bancaria — el banco crea tu
    expediente vacío y te da la tarjeta para entrar.
    """
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

    # ✅ Crear configuración inicial con onboarding_completo = False
    # Analogia: el apartamento nuevo está listo pero sin muebles —
    # el inquilino debe pasar por bienvenida antes de instalarse
    config_inicial = models.Configuracion(
        usuario_id           = nuevo_usuario.id,
        nombre_negocio       = "Mi Negocio",
        moneda               = "CLP",
        color_principal      = "#00C77B",
        onboarding_completo  = False   # ← clave: fuerza el onboarding
    )
    db.add(config_inicial)
    db.commit()

    # Generar token JWT — el usuario queda logueado de inmediato
    token = crear_token({"sub": nuevo_usuario.email})

    return {
        "access_token": token,
        "token_type":   "bearer",
        "usuario":      nuevo_usuario
    }


# ============================================================
# POST /auth/login
# ============================================================
@router.post("/login", response_model=schemas.TokenRespuesta)
def login(datos: schemas.LoginRequest, db: Session = Depends(get_db)):
    """
    Inicia sesión con email y contraseña.
    Analogia: la recepcionista que verifica tu carnet y te da el pase.
    """
    usuario = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()

    if not usuario or not verificar_password(datos.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos"
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está desactivada"
        )

    token = crear_token({"sub": usuario.email})

    return {
        "access_token": token,
        "token_type":   "bearer",
        "usuario":      usuario
    }


# ============================================================
# GET /auth/onboarding-status
# ✅ NUEVO: verifica si el usuario completó el onboarding
# ============================================================
@router.get("/onboarding-status")
def onboarding_status(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna si el usuario ya completó el onboarding.
    El frontend llama esto al iniciar para decidir
    si muestra la app o la pantalla de bienvenida.
    """
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    completo = config.onboarding_completo if config else False

    return {"onboarding_completo": completo}


# ============================================================
# POST /auth/completar-onboarding
# ✅ NUEVO: guarda los datos del onboarding y desbloquea la app
# ============================================================
@router.post("/completar-onboarding")
def completar_onboarding(
    datos: schemas.OnboardingDatos,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Guarda nombre de empresa, rubro, moneda, logo y nombre de usuario.
    Marca onboarding_completo = True para no volver a mostrarlo.
    Analogia: el inquilino amobló su apartamento — ya puede vivir en él.
    """
    # Actualizar nombre del usuario si fue enviado
    if datos.nombre_usuario:
        usuario_actual.nombre = datos.nombre_usuario
        db.add(usuario_actual)

    # Actualizar o crear configuración
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    if not config:
        config = models.Configuracion(usuario_id=usuario_actual.id)
        db.add(config)

    # Guardar todos los datos del onboarding
    if datos.nombre_negocio:
        config.nombre_negocio = datos.nombre_negocio
    if datos.rubro:
        config.rubro = datos.rubro
    if datos.moneda:
        config.moneda = datos.moneda
    if datos.logo_base64:
        config.logo_base64 = datos.logo_base64
    if datos.nombre_usuario:
        config.nombre_usuario = datos.nombre_usuario

    # ✅ Marcar onboarding como completo — no volverá a aparecer
    config.onboarding_completo = True

    db.commit()
    db.refresh(config)

    return {"ok": True, "mensaje": "Onboarding completado"}


# ============================================================
# GET /auth/yo
# ============================================================
@router.get("/yo", response_model=schemas.UsuarioRespuesta)
def obtener_yo(usuario_actual: models.Usuario = Depends(get_usuario_actual)):
    """Retorna los datos del usuario autenticado a partir del token JWT."""
    return usuario_actual