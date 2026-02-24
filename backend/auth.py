# ============================================================
# YEPARSTOCK – Router de Autenticación
# Archivo: backend/routers/auth.py
# Descripción: Endpoints para login, registro, onboarding y perfil
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
    existe = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()
    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este correo ya está registrado"
        )

    nuevo_usuario = models.Usuario(
        nombre        = datos.nombre,
        email         = datos.email,
        password_hash = encriptar_password(datos.password)
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # ✅ Configuración inicial con onboarding pendiente
    # Analogia: el apartamento está listo pero sin muebles —
    # el inquilino debe pasar por bienvenida antes de instalarse
    config_inicial = models.Configuracion(
        usuario_id          = nuevo_usuario.id,
        nombre_negocio      = "Mi Negocio",
        moneda              = "CLP",
        color_principal     = "#00C77B",
        onboarding_completo = False
    )
    db.add(config_inicial)
    db.commit()

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
# ============================================================
@router.get("/onboarding-status")
def onboarding_status(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna si el usuario ya completó el onboarding.
    El frontend llama esto al iniciar sesión para decidir
    si muestra la app o la pantalla de bienvenida.
    """
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    completo = config.onboarding_completo if config else False

    return {"onboarding_completo": completo}


# ============================================================
# POST /auth/completar-onboarding
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
    # Actualizar nombre del usuario en la tabla usuarios
    if datos.nombre_usuario:
        usuario_actual.nombre = datos.nombre_usuario
        db.add(usuario_actual)

    # Buscar o crear configuración
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    if not config:
        config = models.Configuracion(usuario_id=usuario_actual.id)
        db.add(config)

    # Guardar los datos del onboarding
    if datos.nombre_negocio: config.nombre_negocio = datos.nombre_negocio
    if datos.rubro:          config.rubro          = datos.rubro
    if datos.moneda:         config.moneda         = datos.moneda
    if datos.logo_base64:    config.logo_base64    = datos.logo_base64
    if datos.nombre_usuario: config.nombre_usuario = datos.nombre_usuario

    # ✅ Marcar como completo — no volverá a aparecer
    config.onboarding_completo = True

    db.commit()
    db.refresh(config)

    return {"ok": True, "mensaje": "Onboarding completado"}


# ============================================================
# PUT /auth/perfil
# ✅ NUEVO: actualiza nombre, email y contraseña del usuario
#    Lo llama guardarConfiguracion() en el frontend
# ============================================================
@router.put("/perfil", response_model=schemas.UsuarioRespuesta)
def actualizar_perfil(
    datos: schemas.PerfilActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Actualiza los datos personales del usuario autenticado.
    Analogia: ir a la ventanilla del banco a cambiar tus datos.
    """
    # Actualizar nombre si fue enviado
    if datos.nombre:
        usuario_actual.nombre = datos.nombre

    # Actualizar email si fue enviado y no está en uso
    if datos.email and datos.email != usuario_actual.email:
        en_uso = db.query(models.Usuario).filter(
            models.Usuario.email == datos.email,
            models.Usuario.id    != usuario_actual.id
        ).first()
        if en_uso:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ese correo ya está registrado por otro usuario"
            )
        usuario_actual.email = datos.email

    # Cambiar contraseña si fue enviada
    if datos.password_nuevo and datos.password_actual:
        if not verificar_password(datos.password_actual, usuario_actual.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña actual es incorrecta"
            )
        usuario_actual.password_hash = encriptar_password(datos.password_nuevo)

    db.add(usuario_actual)
    db.commit()
    db.refresh(usuario_actual)

    return usuario_actual


# ============================================================
# GET /auth/yo
# ============================================================
@router.get("/yo", response_model=schemas.UsuarioRespuesta)
def obtener_yo(usuario_actual: models.Usuario = Depends(get_usuario_actual)):
    """Retorna los datos del usuario autenticado a partir del token JWT."""
    return usuario_actual