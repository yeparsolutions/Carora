# ============================================================
# YEPARSTOCK — Router de Empresas
# Archivo: backend/routers/empresas.py
# Descripcion: Gestiona plan, usuarios y suscripción de la empresa
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from datetime import datetime, timedelta, timezone
from database import get_db
from auth import get_usuario_actual, solo_admin
import models

router = APIRouter(prefix="/empresa", tags=["Empresa"])


# ============================================================
# GET /empresa/info — Info del plan y límites actuales
# ============================================================
@router.get("/info")
def obtener_info_empresa(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    total_usuarios  = db.query(sqlfunc.count(models.Usuario.id)).filter(
        models.Usuario.empresa_id == empresa.id,
        models.Usuario.activo     == True
    ).scalar() or 0

    total_productos = db.query(sqlfunc.count(models.Producto.id)).filter(
        models.Producto.empresa_id == empresa.id,
        models.Producto.activo     == True
    ).scalar() or 0

    # Estado de cancelación
    ahora         = datetime.now(timezone.utc)
    esta_cancelado = empresa.cancelado_en is not None
    en_gracia      = esta_cancelado and empresa.gracia_hasta and ahora < empresa.gracia_hasta
    bloqueado      = esta_cancelado and (not empresa.gracia_hasta or ahora >= empresa.gracia_hasta)

    return {
        "id":                empresa.id,
        "nombre":            empresa.nombre,
        "plan":              empresa.plan.value if hasattr(empresa.plan, "value") else empresa.plan,
        "plan_precio":       empresa.plan_precio,
        "plan_es_fundador":  empresa.plan_es_fundador,
        "plan_activo":       empresa.plan_activo,
        "plan_expira":       empresa.plan_expira,
        "max_usuarios":      empresa.max_usuarios,
        "max_productos":     empresa.max_productos,
        "total_usuarios":    total_usuarios,
        "total_productos":   total_productos,
        # Cancelación
        "cancelado_en":      empresa.cancelado_en,
        "gracia_hasta":      empresa.gracia_hasta,
        "esta_cancelado":    esta_cancelado,
        "en_gracia":         en_gracia,
        "bloqueado":         bloqueado,
    }


# ============================================================
# PATCH /empresa/cambiar-plan — Cambia entre básico y pro
# ============================================================
@router.patch("/cambiar-plan")
def cambiar_plan(
    nuevo_plan: str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)

    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    plan_actual = empresa.plan.value if hasattr(empresa.plan, "value") else empresa.plan

    if nuevo_plan not in ("basico", "pro"):
        raise HTTPException(status_code=400, detail="Plan inválido. Debe ser 'basico' o 'pro'")

    if nuevo_plan == plan_actual:
        raise HTTPException(status_code=400, detail="Ya estás en ese plan")

    # Validar downgrade: no puede tener más usuarios o productos de los permitidos
    if nuevo_plan == "basico":
        total_usuarios = db.query(sqlfunc.count(models.Usuario.id)).filter(
            models.Usuario.empresa_id == empresa.id,
            models.Usuario.activo     == True
        ).scalar() or 0

        total_productos = db.query(sqlfunc.count(models.Producto.id)).filter(
            models.Producto.empresa_id == empresa.id,
            models.Producto.activo     == True
        ).scalar() or 0

        if total_usuarios > 1:
            raise HTTPException(
                status_code=400,
                detail=f"Tienes {total_usuarios} usuarios activos. Desactiva {total_usuarios - 1} antes de bajar a Básico (máximo 1 usuario)."
            )
        if total_productos > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tienes {total_productos} productos. Elimina {total_productos - 200} antes de bajar a Básico (máximo 200 productos)."
            )

    # Aplicar cambio
    if nuevo_plan == "pro":
        empresa.plan        = "pro"
        empresa.plan_precio = 29990
        empresa.max_usuarios  = 3
        empresa.max_productos = 1500
    else:
        empresa.plan        = "basico"
        empresa.plan_precio = 14990
        empresa.max_usuarios  = 1
        empresa.max_productos = 200

    # Si estaba cancelado y vuelve a suscribirse, limpiar cancelación
    empresa.cancelado_en = None
    empresa.gracia_hasta = None
    empresa.plan_activo  = True

    db.commit()
    db.refresh(empresa)

    return {"ok": True, "plan": nuevo_plan}


# ============================================================
# POST /empresa/cancelar-suscripcion
# Cualquier usuario puede cancelar (confirmación requerida)
# Flujo:
#   1. Se registra cancelado_en = ahora
#   2. gracia_hasta = plan_expira (fin del periodo pagado)
#   3. Pasado gracia_hasta + 7 días → acceso bloqueado
# ============================================================
@router.post("/cancelar-suscripcion")
def cancelar_suscripcion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Cancela la suscripción de la empresa.
    Analogia: cancelar el arriendo — puedes seguir viviendo
    hasta que termine el mes pagado, luego hay una semana para
    sacar tus cosas (ver reportes), después se cierra la puerta.
    """
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    if empresa.cancelado_en:
        raise HTTPException(status_code=400, detail="La suscripción ya está cancelada")

    ahora = datetime.now(timezone.utc)

    # Periodo de gracia: fin del periodo pagado + 7 días de solo lectura
    # Si no hay fecha de expiración, usar fin del mes actual + 7 días
    if empresa.plan_expira and empresa.plan_expira > ahora:
        gracia = empresa.plan_expira + timedelta(days=7)
    else:
        # Sin fecha de pago registrada — 7 días desde hoy
        gracia = ahora + timedelta(days=7)

    empresa.cancelado_en = ahora
    empresa.gracia_hasta = gracia
    empresa.plan_activo  = False

    db.commit()

    return {
        "ok":           True,
        "cancelado_en": empresa.cancelado_en,
        "gracia_hasta": empresa.gracia_hasta,
        "mensaje":      f"Suscripción cancelada. Podrás ver reportes y dashboard hasta el {gracia.strftime('%d/%m/%Y')}. Después de esa fecha el acceso quedará bloqueado."
    }


# ============================================================
# POST /empresa/reactivar — Reactiva suscripción cancelada
# ============================================================
@router.post("/reactivar")
def reactivar_suscripcion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Reactiva una suscripción cancelada. Útil si el cliente se arrepiente."""
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.cancelado_en = None
    empresa.gracia_hasta = None
    empresa.plan_activo  = True
    db.commit()

    return {"ok": True, "mensaje": "Suscripción reactivada correctamente"}


# ============================================================
# GET /empresa/usuarios — Lista usuarios de la empresa
# ============================================================
@router.get("/usuarios")
def listar_usuarios_empresa(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    usuarios = db.query(models.Usuario).filter(
        models.Usuario.empresa_id == usuario_actual.empresa_id
    ).all()

    return [_usuario_dict(u) for u in usuarios]


# ============================================================
# POST /empresa/invitar — Invita un nuevo usuario al equipo
# ============================================================
@router.post("/invitar", status_code=201)
def invitar_usuario(
    nombre:   str,
    email:    str,
    rol:      str = "operador",
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)

    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    total_usuarios = db.query(sqlfunc.count(models.Usuario.id)).filter(
        models.Usuario.empresa_id == empresa.id,
        models.Usuario.activo     == True
    ).scalar() or 0

    if total_usuarios >= empresa.max_usuarios:
        raise HTTPException(
            status_code=403,
            detail=f"Tu plan {empresa.plan} permite máximo {empresa.max_usuarios} usuario(s). Mejora el plan para agregar más."
        )

    existe = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if existe:
        raise HTTPException(status_code=400, detail="Ese email ya está registrado")

    from auth import encriptar_password
    import secrets
    password_temporal = secrets.token_urlsafe(8)

    nuevo = models.Usuario(
        empresa_id    = empresa.id,
        nombre        = nombre,
        email         = email,
        password_hash = encriptar_password(password_temporal),
        rol           = rol,
        activo        = True,
        email_verificado = True,  # invitados se consideran verificados
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return {**_usuario_dict(nuevo), "password_temporal": password_temporal}


# ============================================================
# PATCH /empresa/usuarios/{id}/rol
# ============================================================
@router.patch("/usuarios/{usuario_id}/rol")
def cambiar_rol(
    usuario_id: int,
    rol:        str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    u = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == usuario_actual.empresa_id
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u.rol = rol
    db.commit()
    return _usuario_dict(u)


# ============================================================
# PATCH /empresa/usuarios/{id}/estado
# ============================================================
@router.patch("/usuarios/{usuario_id}/estado")
def cambiar_estado_usuario(
    usuario_id: int,
    activo:     bool,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    u = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == usuario_actual.empresa_id
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if u.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")
    u.activo = activo
    db.commit()
    return _usuario_dict(u)


# ============================================================
# Helper
# ============================================================
def _usuario_dict(u) -> dict:
    return {
        "id":     u.id,
        "nombre": u.nombre,
        "email":  u.email,
        "rol":    u.rol.value if hasattr(u.rol, "value") else u.rol,
        "activo": u.activo,
    }