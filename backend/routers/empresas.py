# ============================================================
# STOCKYA — Router de Empresas
# Archivo: backend/routers/empresas.py
# ============================================================
# CAMBIOS v2 — Multi-sucursal:
#   ✅ cambiar-plan: al subir a Pro → max_sucursales = 3
#      y crea "Sucursal Principal" si la empresa no tiene ninguna
#   ✅ info: devuelve sucursales disponibles y usadas
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from datetime import datetime, timedelta, timezone
from database import get_db
from auth import get_usuario_actual, solo_admin
import models

router = APIRouter(prefix="/empresa", tags=["Empresa"])

# ── Schemas Pydantic ──────────────────────────────────────────
class InvitarSchema(BaseModel):
    nombre:   str
    username: str
    password: str
    rol:      str = "operador"

class MiConfigSchema(BaseModel):
    password_actual: Optional[str] = None
    password_nuevo:  Optional[str] = None
    color_interfaz:  Optional[str] = None
    sonido_escaner:  Optional[str] = None

SECCIONES_VALIDAS = {
    "dashboard", "productos", "stock", "movimientos",
    "salidas", "alertas", "reportes", "fiados"
}


# ============================================================
# GET /empresa/info
# ✅ CAMBIO: ahora incluye datos de sucursales en la respuesta
# El frontend puede saber cuántas sucursales tiene y cuántas
# le quedan disponibles según su plan
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

    # ✅ NUEVO: contar sucursales activas
    total_sucursales = db.query(sqlfunc.count(models.Sucursal.id)).filter(
        models.Sucursal.empresa_id == empresa.id,
        models.Sucursal.activa     == True
    ).scalar() or 0

    # ✅ NUEVO: max_sucursales según el plan (con fallback seguro)
    max_sucursales = getattr(empresa, "max_sucursales", 1) or 1

    ahora          = datetime.now(timezone.utc)
    esta_cancelado = empresa.cancelado_en is not None
    en_gracia      = esta_cancelado and empresa.gracia_hasta and ahora < empresa.gracia_hasta
    bloqueado      = esta_cancelado and (not empresa.gracia_hasta or ahora >= empresa.gracia_hasta)

    return {
        "id":                  empresa.id,
        "nombre":              empresa.nombre,
        "plan":                empresa.plan.value if hasattr(empresa.plan, "value") else empresa.plan,
        "plan_precio":         empresa.plan_precio,
        "plan_es_fundador":    empresa.plan_es_fundador,
        "plan_activo":         empresa.plan_activo,
        "plan_expira":         empresa.plan_expira,
        "max_usuarios":        empresa.max_usuarios,
        "max_productos":       empresa.max_productos,
        "total_usuarios":      total_usuarios,
        "total_productos":     total_productos,
        "cancelado_en":        empresa.cancelado_en,
        "gracia_hasta":        empresa.gracia_hasta,
        "esta_cancelado":      esta_cancelado,
        "en_gracia":           en_gracia,
        "bloqueado":           bloqueado,
        # ✅ NUEVO: datos de sucursales para el frontend
        "max_sucursales":      max_sucursales,
        "total_sucursales":    total_sucursales,
        "puede_crear_sucursal": total_sucursales < max_sucursales,
    }


# ============================================================
# PATCH /empresa/cambiar-plan
# ✅ CAMBIOS:
#   1. Al subir a Pro → max_sucursales = 3
#   2. Si la empresa no tiene ninguna sucursal → crea "Sucursal Principal"
#      (caso de empresas que existían antes de la migración)
#   3. Al bajar a Básico → max_sucursales = 1 (no borra las sucursales,
#      solo las congela — el admin decide cuál conservar)
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
                detail=f"Tienes {total_usuarios} usuarios activos. Desactiva {total_usuarios - 1} antes de bajar a Básico."
            )
        if total_productos > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tienes {total_productos} productos. Elimina {total_productos - 200} antes de bajar a Básico."
            )

    if nuevo_plan == "pro":
        empresa.plan           = "pro"
        empresa.plan_precio    = 29990
        empresa.max_usuarios   = 3
        empresa.max_productos  = 1500
        empresa.max_sucursales = 3   # ✅ NUEVO: Pro permite hasta 3 sucursales

        # ✅ NUEVO: si la empresa no tiene ninguna sucursal, crear la Principal
        # Analogía: al abrir la cuenta Pro, el banco te entrega la tarjeta
        # de la cuenta principal automáticamente
        total_sucursales = db.query(sqlfunc.count(models.Sucursal.id)).filter(
            models.Sucursal.empresa_id == empresa.id
        ).scalar() or 0

        if total_sucursales == 0:
            sucursal_principal = models.Sucursal(
                empresa_id = empresa.id,
                nombre     = "Sucursal Principal",
                activa     = True,
            )
            db.add(sucursal_principal)
            db.flush()

            # Asignar el admin a la sucursal principal si aún no tiene una
            if not usuario_actual.sucursal_id:
                usuario_actual.sucursal_id = sucursal_principal.id
                db.add(usuario_actual)

    else:
        # Bajando a básico
        empresa.plan           = "basico"
        empresa.plan_precio    = 14990
        empresa.max_usuarios   = 1
        empresa.max_productos  = 200
        empresa.max_sucursales = 1   # ✅ NUEVO: básico vuelve a 1 sucursal

    empresa.cancelado_en = None
    empresa.gracia_hasta = None
    empresa.plan_activo  = True

    db.commit()
    db.refresh(empresa)
    return {"ok": True, "plan": nuevo_plan}


# ============================================================
# POST /empresa/cancelar-suscripcion — sin cambios
# ============================================================
@router.post("/cancelar-suscripcion")
def cancelar_suscripcion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    if empresa.cancelado_en:
        raise HTTPException(status_code=400, detail="La suscripción ya está cancelada")

    ahora = datetime.now(timezone.utc)

    if empresa.plan_expira and empresa.plan_expira > ahora:
        gracia = empresa.plan_expira + timedelta(days=7)
    else:
        gracia = ahora + timedelta(days=7)

    empresa.cancelado_en = ahora
    empresa.gracia_hasta = gracia
    empresa.plan_activo  = False
    db.commit()

    return {
        "ok":           True,
        "cancelado_en": empresa.cancelado_en,
        "gracia_hasta": empresa.gracia_hasta,
        "mensaje":      f"Suscripción cancelada. Podrás ver reportes y dashboard hasta el {gracia.strftime('%d/%m/%Y')}."
    }


# ============================================================
# POST /empresa/reactivar — sin cambios
# ============================================================
@router.post("/reactivar")
def reactivar_suscripcion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
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
# GET /empresa/usuarios — sin cambios
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
# POST /empresa/invitar — sin cambios
# ============================================================
@router.post("/invitar")
def invitar_colaborador(
    datos: InvitarSchema,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    from auth import encriptar_password

    solo_admin(usuario_actual)

    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    total_activos = db.query(sqlfunc.count(models.Usuario.id)).filter(
        models.Usuario.empresa_id == empresa.id,
        models.Usuario.activo     == True
    ).scalar() or 0

    if empresa.max_usuarios > 0 and total_activos >= empresa.max_usuarios:
        raise HTTPException(
            status_code=400,
            detail=f"Límite de {empresa.max_usuarios} usuarios alcanzado. Sube tu plan para agregar más."
        )

    username_lower = datos.username.strip().lower()
    existe = db.query(models.Usuario).filter(
        models.Usuario.empresa_id == usuario_actual.empresa_id,
        models.Usuario.username   == username_lower,
    ).first()

    if existe:
        raise HTTPException(status_code=400, detail=f"El username '{username_lower}' ya está en uso en tu empresa")

    rol_valido = datos.rol if datos.rol in ("operador", "lider") else "operador"

    nuevo = models.Usuario(
        empresa_id    = usuario_actual.empresa_id,
        nombre        = datos.nombre,
        username      = username_lower,
        password_hash = encriptar_password(datos.password),
        rol           = rol_valido,
        activo        = True,
        email_verificado = True,
    )
    db.add(nuevo)
    db.flush()

    for seccion in SECCIONES_VALIDAS:
        permiso = models.PermisoUsuario(
            usuario_id = nuevo.id,
            seccion    = seccion,
            permitido  = True,
        )
        db.add(permiso)

    db.commit()
    db.refresh(nuevo)

    return _usuario_dict(nuevo)


# ============================================================
# PATCH /empresa/usuarios/{id}/rol — sin cambios
# ============================================================
@router.patch("/usuarios/{usuario_id}/rol")
def cambiar_rol(
    usuario_id: int,
    rol:        str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)
    u.rol = rol
    db.commit()
    return _usuario_dict(u)


# ============================================================
# PATCH /empresa/usuarios/{id}/estado — sin cambios
# ============================================================
@router.patch("/usuarios/{usuario_id}/estado")
def cambiar_estado_usuario(
    usuario_id: int,
    activo:     bool,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)

    if u.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    u.activo = activo
    db.commit()
    return _usuario_dict(u)


# ============================================================
# GET /empresa/usuarios/{id}/permisos — sin cambios
# ============================================================
@router.get("/usuarios/{usuario_id}/permisos")
def obtener_permisos(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)

    permisos = db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_id
    ).all()

    if not permisos:
        return {s: True for s in SECCIONES_VALIDAS}

    return {p.seccion: p.permitido for p in permisos}


# ============================================================
# PUT /empresa/usuarios/{id}/permisos — sin cambios
# ============================================================
@router.put("/usuarios/{usuario_id}/permisos")
def actualizar_permisos(
    usuario_id: int,
    permisos:   dict = Body(...),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)

    if u.rol == "admin":
        raise HTTPException(status_code=400, detail="Los administradores tienen acceso total y no requieren permisos granulares")

    secciones_invalidas = set(permisos.keys()) - SECCIONES_VALIDAS
    if secciones_invalidas:
        raise HTTPException(
            status_code=400,
            detail=f"Secciones inválidas: {', '.join(secciones_invalidas)}. Válidas: {', '.join(SECCIONES_VALIDAS)}"
        )

    db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_id
    ).delete()

    for seccion, permitido in permisos.items():
        db.add(models.PermisoUsuario(
            usuario_id = usuario_id,
            seccion    = seccion,
            permitido  = bool(permitido),
        ))

    secciones_recibidas = set(permisos.keys())
    for seccion in SECCIONES_VALIDAS - secciones_recibidas:
        db.add(models.PermisoUsuario(
            usuario_id = usuario_id,
            seccion    = seccion,
            permitido  = False,
        ))

    db.commit()
    return {"ok": True, "permisos": permisos}


# ============================================================
# GET /empresa/mis-permisos — sin cambios
# ============================================================
@router.get("/mis-permisos")
def mis_permisos(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    rol = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else usuario_actual.rol

    if rol in ("admin", "lider"):
        return {s: True for s in SECCIONES_VALIDAS}

    permisos = db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_actual.id
    ).all()

    if not permisos:
        return {s: True for s in SECCIONES_VALIDAS}

    return {p.seccion: p.permitido for p in permisos}


# ============================================================
# PUT /empresa/mi-config — sin cambios
# ============================================================
@router.put("/mi-config")
def actualizar_config_colaborador(
    datos: MiConfigSchema,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    from auth import encriptar_password, verificar_password

    if datos.password_nuevo:
        if not datos.password_actual:
            raise HTTPException(status_code=400, detail="Debes ingresar tu contraseña actual para cambiarla")
        if not verificar_password(datos.password_actual, usuario_actual.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
        usuario_actual.password_hash = encriptar_password(datos.password_nuevo)

    if datos.color_interfaz is not None:
        usuario_actual.color_interfaz = datos.color_interfaz

    if datos.sonido_escaner is not None:
        usuario_actual.sonido_escaner = datos.sonido_escaner

    db.add(usuario_actual)
    db.commit()
    db.refresh(usuario_actual)

    return {
        "ok":             True,
        "color_interfaz": usuario_actual.color_interfaz,
        "sonido_escaner": usuario_actual.sonido_escaner,
    }


# ============================================================
# Helpers privados
# ============================================================
def _get_usuario_empresa(usuario_id: int, empresa_id: int, db: Session) -> models.Usuario:
    u = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == empresa_id
    ).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return u


def _usuario_dict(u) -> dict:
    return {
        "id":             u.id,
        "nombre":         u.nombre,
        "email":          u.email,
        "username":       u.username,
        "rol":            u.rol.value if hasattr(u.rol, "value") else u.rol,
        "activo":         u.activo,
        "sucursal_id":    u.sucursal_id,   # ✅ NUEVO: incluir sucursal en respuesta
        "color_interfaz": u.color_interfaz,
        "sonido_escaner": u.sonido_escaner,
    }
