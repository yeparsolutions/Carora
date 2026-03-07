# ============================================================
# YEPARSTOCK — backend/routers/auth.py
# Autenticación, registro, verificación de email, reset de pass
#
# CAMBIO v1.3.1 — completar_onboarding():
#   Crea Sucursal Principal para TODOS los planes (gratis,
#   basico, pro). Sin importar el plan, toda cuenta arranca
#   con al menos 1 sucursal.
#   Analogía: toda tienda necesita al menos un local físico
#   el primer día — sin importar si es pequeña o grande.
# ============================================================

from fastapi        import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models         import Usuario, Empresa, Sucursal
from database       import get_db
import auth as auth_utils
import schemas

router = APIRouter(prefix="/auth", tags=["auth"])


# ── LOGIN ────────────────────────────────────────────────────
@router.post("/login")
async def login(datos: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Autentica usuario y devuelve access_token + refresh_token."""
    usuario = db.query(Usuario).filter(
        Usuario.username == datos.username.lower()
    ).first()

    if not usuario or not auth_utils.verificar_password(datos.password, usuario.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    if not usuario.activo:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    if not usuario.email_verificado:
        raise HTTPException(status_code=403, detail="Debes verificar tu email primero")

    access_token  = auth_utils.crear_access_token({"sub": str(usuario.id)})
    refresh_token = auth_utils.crear_refresh_token({"sub": str(usuario.id)})

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "usuario": {
            "id":          usuario.id,
            "nombre":      usuario.nombre,
            "apellido":    usuario.apellido or "",
            "username":    usuario.username,
            "email":       usuario.email,
            "rol":         usuario.rol,
            "empresa_id":  usuario.empresa_id,
            "sucursal_id": usuario.sucursal_id,  # <-- siempre incluido
        }
    }


# ── REFRESH TOKEN ────────────────────────────────────────────
@router.post("/refresh")
async def refresh_token(datos: schemas.RefreshRequest, db: Session = Depends(get_db)):
    """
    Renueva el access_token con el refresh_token guardado en memoria.
    Analogía: cambiar el carnet sin volver a la ventanilla principal.
    """
    payload = auth_utils.verificar_token(datos.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")

    usuario = db.query(Usuario).filter(
        Usuario.id == int(payload.get("sub"))
    ).first()

    if not usuario or not usuario.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return {
        "access_token":  auth_utils.crear_access_token({"sub": str(usuario.id)}),
        "refresh_token": auth_utils.crear_refresh_token({"sub": str(usuario.id)}),
        "token_type":    "bearer",
    }


# ── REGISTRO ─────────────────────────────────────────────────
@router.post("/registro")
async def registro(datos: schemas.RegistroRequest, db: Session = Depends(get_db)):
    """Crea cuenta y envía código de verificación al email."""
    if db.query(Usuario).filter(Usuario.email == datos.email.lower()).first():
        raise HTTPException(status_code=400, detail="Este email ya está registrado")

    username_base = auth_utils.generar_username(datos.nombre, datos.apellido or "")
    username      = auth_utils.username_unico(username_base, db)

    # El usuario queda sin empresa hasta completar el onboarding
    usuario = Usuario(
        nombre           = datos.nombre,
        apellido         = datos.apellido or "",
        email            = datos.email.lower(),
        username         = username,
        password_hash    = auth_utils.hashear_password(datos.password),
        rol              = "admin",
        activo           = True,
        email_verificado = False,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    codigo = auth_utils.generar_codigo_verificacion()
    auth_utils.guardar_codigo(usuario.id, codigo, db)
    auth_utils.enviar_codigo_email(usuario.email, codigo, usuario.nombre)

    return {"mensaje": "Código enviado — revisa tu email"}


# ── VERIFICAR EMAIL ──────────────────────────────────────────
@router.post("/verificar-email")
async def verificar_email(email: str, codigo: str, db: Session = Depends(get_db)):
    """Valida el código de 6 dígitos y activa la cuenta."""
    usuario = db.query(Usuario).filter(Usuario.email == email.lower()).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Email no encontrado")

    if not auth_utils.verificar_codigo(usuario.id, codigo, db):
        raise HTTPException(status_code=400, detail="Código incorrecto o expirado")

    usuario.email_verificado = True
    db.commit()

    access_token  = auth_utils.crear_access_token({"sub": str(usuario.id)})
    refresh_token = auth_utils.crear_refresh_token({"sub": str(usuario.id)})

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "usuario": {
            "id":          usuario.id,
            "nombre":      usuario.nombre,
            "apellido":    usuario.apellido or "",
            "username":    usuario.username,
            "email":       usuario.email,
            "rol":         usuario.rol,
            "empresa_id":  usuario.empresa_id,
            "sucursal_id": usuario.sucursal_id,
        }
    }


# ── REENVIAR CÓDIGO ──────────────────────────────────────────
@router.post("/reenviar-codigo")
async def reenviar_codigo(email: str, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == email.lower()).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Email no encontrado")

    codigo = auth_utils.generar_codigo_verificacion()
    auth_utils.guardar_codigo(usuario.id, codigo, db)
    auth_utils.enviar_codigo_email(usuario.email, codigo, usuario.nombre)

    return {"mensaje": "Código reenviado"}


# ── ONBOARDING STATUS ────────────────────────────────────────
@router.get("/onboarding-status")
async def onboarding_status(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """El frontend consulta esto para saber si mostrar la pantalla de configuración inicial."""
    return {"onboarding_completo": usuario_actual.empresa_id is not None}


# ── COMPLETAR ONBOARDING ─────────────────────────────────────
@router.post("/completar-onboarding")
async def completar_onboarding(
    datos:          schemas.OnboardingRequest,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """
    Crea la empresa en el primer acceso del admin.

    REGLA v1.3.1 — Sucursal Principal para TODOS los planes:
    ──────────────────────────────────────────────────────────
    Se crea automáticamente una 'Sucursal Principal' para toda cuenta
    nueva, sin importar si es gratis, basico o pro.

    Planes y límites:
      - gratis / basico → max_sucursales = 1  (solo la principal)
      - pro             → max_sucursales = 3  (principal + 2 más)

    La Sucursal Principal NO puede ser eliminada.

    Analogía: abrir una tienda siempre crea 1 local físico.
    Las cadenas Pro pueden abrir hasta 2 locales adicionales.
    """
    if usuario_actual.empresa_id:
        raise HTTPException(status_code=400, detail="El onboarding ya fue completado")

    # 1. Crear empresa — plan inicial siempre gratis
    empresa = Empresa(
        nombre         = datos.nombre_negocio,
        rubro          = datos.rubro,
        moneda         = datos.moneda or "CLP",
        logo_base64    = datos.logo_base64,
        plan           = "gratis",
        max_sucursales = 1,   # se actualiza a 3 cuando suben a Pro
        activa         = True,
    )
    db.add(empresa)
    db.flush()  # obtener empresa.id antes de crear la sucursal

    # 2. Crear Sucursal Principal — SIEMPRE, para todos los planes
    #    Nota: si el admin sube a Pro, podrá crear hasta 2 sucursales más
    sucursal_principal = Sucursal(
        empresa_id = empresa.id,
        nombre     = "Sucursal Principal",
        activa     = True,
    )
    db.add(sucursal_principal)
    db.flush()  # obtener sucursal.id antes de asignar al usuario

    # 3. Vincular admin a la empresa y a la sucursal principal
    usuario_actual.empresa_id  = empresa.id
    usuario_actual.sucursal_id = sucursal_principal.id
    if datos.nombre_usuario:
        usuario_actual.nombre = datos.nombre_usuario

    db.commit()

    return {
        "mensaje":    "Negocio configurado correctamente",
        "empresa_id": empresa.id,
    }


# ── RESET DE CONTRASEÑA ──────────────────────────────────────
@router.post("/solicitar-reset")
async def solicitar_reset(email: str, db: Session = Depends(get_db)):
    """Envía código de 6 dígitos para resetear la contraseña."""
    usuario = db.query(Usuario).filter(Usuario.email == email.lower()).first()
    # No revelamos si el email existe (seguridad)
    if usuario:
        codigo = auth_utils.generar_codigo_verificacion()
        auth_utils.guardar_codigo(usuario.id, codigo, db, tipo="reset")
        auth_utils.enviar_codigo_reset(usuario.email, codigo, usuario.nombre)
    return {"mensaje": "Si el email existe, recibirás un código"}


@router.post("/confirmar-reset")
async def confirmar_reset(
    email: str, codigo: str, nueva_password: str,
    db: Session = Depends(get_db)
):
    """Valida el código y cambia la contraseña."""
    if len(nueva_password) < 8:
        raise HTTPException(status_code=400, detail="Mínimo 8 caracteres")

    usuario = db.query(Usuario).filter(Usuario.email == email.lower()).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Email no encontrado")

    if not auth_utils.verificar_codigo(usuario.id, codigo, db, tipo="reset"):
        raise HTTPException(status_code=400, detail="Código incorrecto o expirado")

    usuario.password_hash = auth_utils.hashear_password(nueva_password)
    db.commit()

    return {"mensaje": "Contraseña cambiada correctamente"}
