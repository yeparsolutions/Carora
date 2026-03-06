# ============================================================
# STOCKYA — Router de Empresas
# Archivo: backend/routers/empresas.py
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from datetime import datetime, timedelta, timezone
from database import get_db
from auth import get_usuario_actual, solo_admin
import models

router = APIRouter(prefix="/empresa", tags=["Empresa"])

# Secciones válidas para permisos
SECCIONES_VALIDAS = {
    "dashboard", "productos", "stock", "movimientos",
    "salidas", "alertas", "reportes", "fiados"
}


# ============================================================
# GET /empresa/info
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

    ahora          = datetime.now(timezone.utc)
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
        "cancelado_en":      empresa.cancelado_en,
        "gracia_hasta":      empresa.gracia_hasta,
        "esta_cancelado":    esta_cancelado,
        "en_gracia":         en_gracia,
        "bloqueado":         bloqueado,
    }


# ============================================================
# PATCH /empresa/cambiar-plan
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
        empresa.plan          = "pro"
        empresa.plan_precio   = 29990
        empresa.max_usuarios  = 3
        empresa.max_productos = 1500
    else:
        empresa.plan          = "basico"
        empresa.plan_precio   = 14990
        empresa.max_usuarios  = 1
        empresa.max_productos = 200

    empresa.cancelado_en = None
    empresa.gracia_hasta = None
    empresa.plan_activo  = True

    db.commit()
    db.refresh(empresa)
    return {"ok": True, "plan": nuevo_plan}


# ============================================================
# POST /empresa/cancelar-suscripcion
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
# POST /empresa/reactivar
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
# GET /empresa/usuarios
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
# POST /empresa/invitar
# ✅ ACTUALIZADO: opera con username en lugar de email
#    El operador no necesita correo — solo nombre visible,
#    username para login y password.
# ============================================================
@router.post("/invitar", status_code=201)
def invitar_usuario(
    nombre:   str,
    username: str,
    password: str,
    rol:      str = "operador",
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Crea un colaborador con username en lugar de email.
    Analogia: dar de alta a un empleado con su apodo de trabajo
    y una clave — sin necesidad de su correo personal.
    """
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

    # Username único dentro de la empresa
    existe = db.query(models.Usuario).filter(
        models.Usuario.empresa_id == empresa.id,
        models.Usuario.username   == username.lower().strip()
    ).first()
    if existe:
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe en tu empresa")

    from auth import encriptar_password

    nuevo = models.Usuario(
        empresa_id       = empresa.id,
        nombre           = nombre,
        email            = None,                         # operadores sin email
        username         = username.lower().strip(),
        password_hash    = encriptar_password(password),
        rol              = rol,
        activo           = True,
        email_verificado = True,
    )
    db.add(nuevo)
    db.flush()  # obtener el id antes de crear permisos

    # Crear permisos con todas las secciones habilitadas por defecto
    # El admin podrá ajustarlos luego. Analogia: dar todas las llaves
    # al empleado nuevo — el admin decide cuáles retirar.
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
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)
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
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)

    if u.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    u.activo = activo
    db.commit()
    return _usuario_dict(u)


# ============================================================
# GET /empresa/usuarios/{id}/permisos  ✅ NUEVO
# Devuelve los permisos actuales de un colaborador
# ============================================================
@router.get("/usuarios/{usuario_id}/permisos")
def obtener_permisos(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    solo_admin(usuario_actual)
    _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)  # validar pertenencia

    permisos = db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_id
    ).all()

    # Si no tiene registros (usuario antiguo), devolver todas habilitadas
    if not permisos:
        return {s: True for s in SECCIONES_VALIDAS}

    return {p.seccion: p.permitido for p in permisos}


# ============================================================
# PUT /empresa/usuarios/{id}/permisos  ✅ NUEVO
# Reemplaza todos los permisos de un colaborador de una sola vez
# Body: {"dashboard": true, "productos": false, ...}
# ============================================================
@router.put("/usuarios/{usuario_id}/permisos")
def actualizar_permisos(
    usuario_id: int,
    permisos:   dict,           # {"dashboard": true, "salidas": false, ...}
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Guarda el mapa completo de permisos del colaborador.
    Analogia: cambiar el llavero del empleado de una sola vez
    en lugar de agregar/quitar llaves una por una.
    """
    solo_admin(usuario_actual)
    u = _get_usuario_empresa(usuario_id, usuario_actual.empresa_id, db)

    if u.rol == "admin":
        raise HTTPException(status_code=400, detail="Los administradores tienen acceso total y no requieren permisos granulares")

    # Validar secciones recibidas
    secciones_invalidas = set(permisos.keys()) - SECCIONES_VALIDAS
    if secciones_invalidas:
        raise HTTPException(
            status_code=400,
            detail=f"Secciones inválidas: {', '.join(secciones_invalidas)}. Válidas: {', '.join(SECCIONES_VALIDAS)}"
        )

    # Borrar permisos actuales y recrear — upsert manual
    db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_id
    ).delete()

    for seccion, permitido in permisos.items():
        db.add(models.PermisoUsuario(
            usuario_id = usuario_id,
            seccion    = seccion,
            permitido  = bool(permitido),
        ))

    # Asegurar que todas las secciones existan (rellenar faltantes con False)
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
# GET /empresa/mis-permisos  ✅ NUEVO
# Lo llama el operador al iniciar sesión para saber a qué accede
# ============================================================
@router.get("/mis-permisos")
def mis_permisos(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Devuelve los permisos del usuario autenticado.
    Los admins tienen acceso total a todo.
    """
    rol = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else usuario_actual.rol

    if rol == "admin":
        # El admin siempre tiene todo habilitado
        return {s: True for s in SECCIONES_VALIDAS}

    permisos = db.query(models.PermisoUsuario).filter(
        models.PermisoUsuario.usuario_id == usuario_actual.id
    ).all()

    if not permisos:
        # Usuario operador sin permisos registrados → acceso total por compatibilidad
        return {s: True for s in SECCIONES_VALIDAS}

    return {p.seccion: p.permitido for p in permisos}


# ============================================================
# PUT /empresa/mi-config  ✅ NUEVO
# El operador puede cambiar su password, color de interfaz y sonido de escáner
# ============================================================
@router.put("/mi-config")
def actualizar_config_colaborador(
    password_actual:  str  = None,
    password_nuevo:   str  = None,
    color_interfaz:   str  = None,
    sonido_escaner:   str  = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Config personal del colaborador: password, color e interfaz y sonido.
    Analogia: el empleado puede cambiar su uniforme de color y
    el tono de su timbre — sin tocar la caja registradora.
    """
    from auth import encriptar_password, verificar_password

    if password_nuevo:
        if not password_actual:
            raise HTTPException(status_code=400, detail="Debes ingresar tu contraseña actual para cambiarla")
        if not verificar_password(password_actual, usuario_actual.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
        usuario_actual.password_hash = encriptar_password(password_nuevo)

    if color_interfaz is not None:
        usuario_actual.color_interfaz = color_interfaz

    if sonido_escaner is not None:
        usuario_actual.sonido_escaner = sonido_escaner

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
        "color_interfaz": u.color_interfaz,
        "sonido_escaner": u.sonido_escaner,
    }
