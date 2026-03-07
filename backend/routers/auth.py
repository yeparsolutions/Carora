# ============================================================
# YEPARSTOCK – Router de Autenticación
# Archivo: backend/routers/auth.py
# ============================================================
# CAMBIOS v2 — Multi-sucursal:
#   ✅ completar_onboarding: crea "Sucursal Principal" automáticamente
#      al momento en que el admin termina de configurar su negocio
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from auth import encriptar_password, verificar_password, crear_token, get_usuario_actual
import models, schemas
import random

router = APIRouter(prefix="/auth", tags=["Autenticación"])


# ============================================================
# POST /auth/registro — sin cambios
# ============================================================
@router.post("/registro", response_model=schemas.TokenRespuesta, status_code=201)
def registrar_usuario(datos: schemas.UsuarioCrear, db: Session = Depends(get_db)):
    existe = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()
    if existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este correo ya está registrado"
        )

    codigo = str(random.randint(100000, 999999))

    import unicodedata, re
    def _slug(t):
        t = unicodedata.normalize("NFD", t)
        t = t.encode("ascii", "ignore").decode()
        return re.sub(r"[^a-z0-9]", "", t.lower())

    base_username = _slug(datos.nombre)
    if datos.apellido:
        base_username = _slug(datos.nombre) + "." + _slug(datos.apellido)

    username_final = base_username
    contador = 1
    while db.query(models.Usuario).filter(models.Usuario.username == username_final).first():
        username_final = base_username + str(contador)
        contador += 1

    nuevo_usuario = models.Usuario(
        nombre              = datos.nombre,
        email               = datos.email,
        username            = username_final,
        password_hash       = encriptar_password(datos.password),
        email_verificado    = False,
        codigo_verificacion = codigo,
    )
    db.add(nuevo_usuario)
    db.commit()
    db.refresh(nuevo_usuario)

    config_inicial = models.Configuracion(
        usuario_id          = nuevo_usuario.id,
        nombre_negocio      = "Mi Negocio",
        moneda              = "CLP",
        color_principal     = "#00C77B",
        onboarding_completo = False
    )
    db.add(config_inicial)
    db.commit()

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
# POST /auth/login — sin cambios
# ============================================================
@router.post("/login", response_model=schemas.TokenRespuesta)
def login(datos: schemas.LoginRequest, db: Session = Depends(get_db)):
    login_valor = datos.username.strip().lower()

    usuario = db.query(models.Usuario).filter(
        models.Usuario.username == login_valor,
        models.Usuario.activo   == True,
    ).first()

    if not usuario or not verificar_password(datos.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta cuenta está desactivada. Contacta al administrador."
        )

    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol == "admin" and usuario.email:
        sub = usuario.email
    else:
        sub = f"username:{usuario.username}:{usuario.empresa_id}"
    token = crear_token({"sub": sub})

    return {
        "access_token": token,
        "token_type":   "bearer",
        "usuario":      usuario
    }


# ============================================================
# GET /auth/onboarding-status — sin cambios
# ============================================================
@router.get("/onboarding-status")
def onboarding_status(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    completo = config.onboarding_completo if config else False
    return {"onboarding_completo": completo}


# ============================================================
# POST /auth/completar-onboarding
# ✅ CAMBIO: después de crear la empresa, se crea automáticamente
#    la "Sucursal Principal" y se asigna el admin a ella.
#
# Analogía: cuando firmas el contrato del local, el banco
# te abre automáticamente la cuenta principal — no tienes
# que pedirla por separado.
# ============================================================
@router.post("/completar-onboarding")
def completar_onboarding(
    datos: schemas.OnboardingDatos,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    if datos.nombre_usuario:
        usuario_actual.nombre = datos.nombre_usuario

    if not usuario_actual.empresa_id:
        nombre_empresa = datos.nombre_negocio or "Mi Negocio"
        nueva_empresa  = models.Empresa(
            nombre         = nombre_empresa,
            plan           = "basico",
            plan_activo    = True,
            max_usuarios   = 1,
            max_productos  = 200,
            max_sucursales = 1,   # basico comienza con 1
        )
        db.add(nueva_empresa)
        db.flush()  # obtener el ID sin hacer commit todavía

        usuario_actual.empresa_id = nueva_empresa.id
        usuario_actual.rol        = "admin"

        # ✅ NUEVO: crear "Sucursal Principal" automáticamente
        # Analogía: el primer local siempre se llama "Casa Matriz"
        sucursal_principal = models.Sucursal(
            empresa_id = nueva_empresa.id,
            nombre     = "Sucursal Principal",
            activa     = True,
        )
        db.add(sucursal_principal)
        db.flush()  # obtener el ID de la sucursal

        # ✅ NUEVO: asignar el admin a la sucursal principal
        # El admin puede ver todas, pero queda "anclado" a la principal
        usuario_actual.sucursal_id = sucursal_principal.id

    db.add(usuario_actual)

    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    if not config:
        config = models.Configuracion(usuario_id=usuario_actual.id)
        db.add(config)

    if datos.nombre_negocio: config.nombre_negocio = datos.nombre_negocio
    if datos.rubro:          config.rubro          = datos.rubro
    if datos.moneda:         config.moneda         = datos.moneda
    if datos.logo_base64:    config.logo_base64    = datos.logo_base64
    if datos.nombre_usuario: config.nombre_usuario = datos.nombre_usuario

    config.onboarding_completo = True

    db.commit()
    db.refresh(config)
    return {"ok": True, "mensaje": "Onboarding completado"}


# ============================================================
# PUT /auth/perfil — sin cambios
# ============================================================
@router.put("/perfil", response_model=schemas.UsuarioRespuesta)
def actualizar_perfil(
    datos: schemas.PerfilActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    if datos.nombre:
        usuario_actual.nombre = datos.nombre

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
# GET /auth/yo — sin cambios
# ============================================================
@router.get("/yo", response_model=schemas.UsuarioRespuesta)
def obtener_yo(usuario_actual: models.Usuario = Depends(get_usuario_actual)):
    return usuario_actual


# ============================================================
# POST /auth/verificar-email — sin cambios
# ============================================================
@router.post("/verificar-email")
def verificar_email(
    email:  str,
    codigo: str,
    db: Session = Depends(get_db),
):
    usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario.email_verificado:
        token = crear_token({"sub": usuario.email})
        return {"ok": True, "access_token": token, "token_type": "bearer", "usuario": usuario}

    if not usuario.codigo_verificacion:
        raise HTTPException(status_code=400, detail="No hay código pendiente de verificación")

    if usuario.codigo_verificacion.strip() != codigo.strip():
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa tu correo e intenta de nuevo")

    usuario.email_verificado    = True
    usuario.codigo_verificacion = None
    db.commit()

    token = crear_token({"sub": usuario.email})
    return {"ok": True, "access_token": token, "token_type": "bearer", "usuario": usuario}


# ============================================================
# POST /auth/reenviar-codigo — sin cambios
# ============================================================
@router.post("/reenviar-codigo")
def reenviar_codigo(
    email: str,
    db: Session = Depends(get_db),
):
    usuario_actual = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if not usuario_actual:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if usuario_actual.email_verificado:
        raise HTTPException(status_code=400, detail="Tu correo ya está verificado")

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
# POST /auth/solicitar-reset — sin cambios
# ============================================================
@router.post("/solicitar-reset")
def solicitar_reset(
    email: str,
    db: Session = Depends(get_db),
):
    import string

    usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if not usuario:
        return {"ok": True, "mensaje": "Si el correo está registrado, recibirás las instrucciones"}

    chars         = string.ascii_letters + string.digits
    chars         = chars.replace("l","").replace("I","").replace("O","").replace("0","")
    password_temp = "".join(random.choices(chars, k=10))

    usuario.password_hash       = encriptar_password(password_temp)
    usuario.codigo_verificacion = None
    db.commit()

    try:
        from email_service import enviar_email
        html = _template_password_temporal(usuario.nombre, email, password_temp)
        enviar_email(
            destinatario = email,
            asunto       = "Tu contraseña temporal YeparStock 🔑",
            html         = html,
        )
    except Exception as e:
        print(f"[RESET] Error enviando email: {e}")

    return {"ok": True, "mensaje": "Contraseña temporal enviada a tu correo"}


# ============================================================
# Templates HTML — sin cambios
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
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">📦</div>
            <div style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;">YeparStock</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">by YeparSolutions</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Hola, {nombre} 👋</h2>
            <p style="margin:0 0 28px;font-size:14px;color:#475569;line-height:1.6;">
              Gracias por registrarte en YeparStock. Ingresa el siguiente código para verificar tu correo y activar tu cuenta:
            </p>
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


def _template_password_temporal(nombre: str, email: str, password_temp: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;margin-bottom:6px;">📦</div>
            <div style="font-family:Georgia,serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-1px;">YeparStock</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">by YeparSolutions</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Hola, {nombre} 👋</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
              Recibimos una solicitud para restablecer tu contraseña. Usa las siguientes credenciales temporales para ingresar:
            </p>
            <div style="background:#f0f9ff;border:2px dashed #0ea5e9;border-radius:14px;padding:24px;margin-bottom:24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;padding-bottom:6px">CORREO</td>
                  <td style="font-size:14px;color:#0f172a;font-weight:600;text-align:right">{email}</td>
                </tr>
                <tr><td colspan="2" style="padding:6px 0"><hr style="border:none;border-top:1px solid #e2e8f0"></td></tr>
                <tr>
                  <td style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;padding-top:6px">CONTRASEÑA TEMPORAL</td>
                  <td style="text-align:right;padding-top:6px">
                    <span style="font-size:22px;font-weight:900;letter-spacing:4px;color:#1e40af;font-family:monospace;">{password_temp}</span>
                  </td>
                </tr>
              </table>
            </div>
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
              <span style="font-size:13px;color:#92400e;">
                ⏰ <strong>Esta contraseña expira en 24 horas.</strong><br>
                Una vez que ingreses, ve a <strong>Configuración → Perfil</strong> y cámbiala por una contraseña segura.
              </span>
            </div>
            <div style="background:#fee2e2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
              <span style="font-size:13px;color:#991b1b;">⚠️ Si no solicitaste este cambio, ignora este correo.</span>
            </div>
            <p style="margin:0;font-size:13px;color:#94a3b8;">
              ¿Necesitas ayuda? Escríbenos a
              <a href="mailto:soporte@yeparsolutions.com" style="color:#1e40af;">soporte@yeparsolutions.com</a>
            </p>
          </td>
        </tr>
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
