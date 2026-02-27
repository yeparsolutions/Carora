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
import random

router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ============================================================
# POST /auth/registro
# ============================================================
@router.post("/registro", response_model=schemas.TokenRespuesta, status_code=201)
def registrar_usuario(datos: schemas.UsuarioCrear, db: Session = Depends(get_db)):
    """
    Registra un usuario nuevo y envía código de verificación por email.
    Analogia: abrir una cuenta bancaria — el banco crea tu expediente
    y te envía un SMS con el código para confirmar que eres tú.
    """
    existe = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()
    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este correo ya está registrado"
        )

    # Generar código de 6 dígitos
    codigo = str(random.randint(100000, 999999))

    nuevo_usuario = models.Usuario(
        nombre              = datos.nombre,
        email               = datos.email,
        password_hash       = encriptar_password(datos.password),
        email_verificado    = False,
        codigo_verificacion = codigo,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    # Configuración inicial con onboarding pendiente
    config_inicial = models.Configuracion(
        usuario_id          = nuevo_usuario.id,
        nombre_negocio      = "Mi Negocio",
        moneda              = "CLP",
        color_principal     = "#00C77B",
        onboarding_completo = False
    )
    db.add(config_inicial)
    db.commit()

    # Enviar email con código de verificación
    try:
        from email_service import enviar_email
        html = _template_verificacion(datos.nombre, codigo)
        enviar_email(
            destinatario = datos.email,
            asunto       = "Tu código de verificación YeparStock 🔐",
            html         = html,
        )
    except Exception as e:
        print(f"[REGISTRO] Error enviando email: {e}")

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

# ============================================================
# POST /auth/verificar-email
# El usuario ingresa el código de 6 dígitos que recibió
# ============================================================
@router.post("/verificar-email")
def verificar_email(
    codigo: str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Verifica el código de 6 dígitos enviado por email.
    Analogia: ingresar el PIN que el banco te mandó por SMS —
    confirma que el correo es tuyo y activa la cuenta.
    """
    if usuario_actual.email_verificado:
        return {"ok": True, "mensaje": "El correo ya estaba verificado"}

    if not usuario_actual.codigo_verificacion:
        raise HTTPException(status_code=400, detail="No hay código pendiente de verificación")

    if usuario_actual.codigo_verificacion != codigo.strip():
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa tu correo e intenta de nuevo")

    # Marcar como verificado y limpiar el código
    usuario_actual.email_verificado    = True
    usuario_actual.codigo_verificacion = None
    db.commit()

    return {"ok": True, "mensaje": "Correo verificado correctamente"}


# ============================================================
# POST /auth/reenviar-codigo
# Por si el usuario no recibió el correo
# ============================================================
@router.post("/reenviar-codigo")
def reenviar_codigo(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Genera un nuevo código y lo reenvía por email.
    Analogia: pedir que el banco te mande otro SMS porque el
    primero no llegó.
    """
    if usuario_actual.email_verificado:
        raise HTTPException(status_code=400, detail="Tu correo ya está verificado")

    # Generar nuevo código
    nuevo_codigo = str(random.randint(100000, 999999))
    usuario_actual.codigo_verificacion = nuevo_codigo
    db.commit()

    try:
        from email_service import enviar_email
        html = _template_verificacion(usuario_actual.nombre, nuevo_codigo)
        enviado = enviar_email(
            destinatario = usuario_actual.email,
            asunto       = "Tu nuevo código de verificación YeparStock 🔐",
            html         = html,
        )
        if not enviado:
            raise HTTPException(status_code=500, detail="No se pudo enviar el correo. Intenta más tarde.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar correo: {str(e)}")

    return {"ok": True, "mensaje": "Código reenviado a tu correo"}


# ============================================================
# Template HTML para verificación de email
# ============================================================
def _template_verificacion(nombre: str, codigo: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">📦</div>
            <div style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;">YeparStock</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">by YeparSolutions</div>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Hola, {nombre} 👋</h2>
            <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6;">
              Gracias por registrarte en YeparStock. Ingresa el siguiente código para verificar tu correo y activar tu cuenta:
            </p>

            <!-- Código -->
            <div style="background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:14px;padding:28px;text-align:center;margin-bottom:28px;">
              <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Tu código de verificación</div>
              <div style="font-size:44px;font-weight:900;letter-spacing:12px;color:#1e40af;font-family:monospace;">{codigo}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:10px;">Este código expira en 24 horas</div>
            </div>

            <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
              <span style="font-size:13px;color:#92400e;">⚠️ Si no creaste esta cuenta, ignora este correo.</span>
            </div>

            <p style="margin:0;font-size:13px;color:#94a3b8;">
              ¿Necesitas ayuda? Escríbenos a
              <a href="mailto:soporte@yeparsolutions.com" style="color:#1e40af;">soporte@yeparsolutions.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:18px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">© 2025 YeparSolutions · Este correo fue enviado automáticamente.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""