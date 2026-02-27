# ============================================================
# YEPARSTOCK — Servicio de Email
# Archivo: backend/email_service.py
# Descripcion: Envio de correos transaccionales via Zoho SMTP
#
# Analogia: el mensajero del negocio — recibe el sobre (datos),
#           lo lleva por la ruta correcta (SMTP) y confirma
#           que fue entregado o reporta si falló.
# ============================================================

import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from dotenv import load_dotenv

load_dotenv()

# Configuración SMTP — desde variables de entorno
SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.zoho.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER     = os.getenv("SMTP_USER",     "soporte@yeparsolutions.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM    = os.getenv("EMAIL_FROM",    "soporte@yeparsolutions.com")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "YeparStock")


def enviar_email(destinatario: str, asunto: str, html: str) -> bool:
    """
    Envía un email HTML al destinatario.
    Retorna True si fue enviado, False si falló.
    Analogia: el mensajero — entrega el sobre o reporta 'no pude'.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = asunto
        msg["From"]    = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg["To"]      = destinatario

        # Adjuntar versión HTML del correo
        msg.attach(MIMEText(html, "html", "utf-8"))

        # Conexión SSL con Zoho (puerto 465)
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, destinatario, msg.as_string())

        return True

    except Exception as e:
        # No lanzar excepción — el sistema sigue funcionando aunque el email falle
        print(f"[EMAIL ERROR] No se pudo enviar a {destinatario}: {e}")
        return False


# ============================================================
# Templates de email
# ============================================================

def template_bienvenida_usuario(
    nombre_usuario:  str,
    email:           str,
    password_temp:   str,
    nombre_negocio:  str,
    nombre_invitador: str,
) -> str:
    """
    Template HTML para invitación de nuevo usuario al equipo.
    Incluye credenciales de acceso y link a la app.
    """
    return f"""
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a YeparStock</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">📦</div>
            <div style="font-family:Georgia,serif;font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;">YeparStock</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">by YeparSolutions</div>
          </td>
        </tr>

        <!-- Cuerpo -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">¡Hola, {nombre_usuario}! 👋</h2>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              <strong>{nombre_invitador}</strong> te ha invitado a unirte al equipo de
              <strong>{nombre_negocio}</strong> en YeparStock.
            </p>

            <!-- Credenciales -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:28px;">
              <div style="font-size:12px;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;">
                Tus credenciales de acceso
              </div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:13px;color:#64748b;">Correo</span>
                  </td>
                  <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">
                    <strong style="font-size:14px;color:#0f172a;">{email}</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#64748b;">Contraseña temporal</span>
                  </td>
                  <td style="padding:8px 0;text-align:right;">
                    <strong style="font-size:16px;color:#1e40af;font-family:monospace;letter-spacing:2px;">{password_temp}</strong>
                  </td>
                </tr>
              </table>
            </div>

            <!-- Aviso cambio de contraseña -->
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:28px;">
              <span style="font-size:13px;color:#92400e;">
                ⚠️ Por seguridad, te recomendamos cambiar tu contraseña después de tu primer inicio de sesión.
              </span>
            </div>

            <p style="margin:0 0 8px;font-size:14px;color:#475569;">
              Si tienes alguna duda, responde este correo o escríbenos a
              <a href="mailto:soporte@yeparsolutions.com" style="color:#1e40af;">soporte@yeparsolutions.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              © 2025 YeparSolutions · Este correo fue enviado automáticamente, por favor no respondas directamente.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>
"""
