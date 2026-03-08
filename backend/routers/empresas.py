# ============================================================
# YEPARSTOCK — backend/routers/empresas.py
# Gestión de empresa: info, plan, usuarios, permisos
#
# CAMBIO v1.3.1:
#   puede_crear_sucursal ahora depende de:
#     - plan == "pro"  Y
#     - total_sucursales < max_sucursales (max = 3)
#
#   En gratis y basico, puede_crear_sucursal = False siempre.
#   El frontend usa este campo para mostrar/ocultar el botón
#   "Nueva Sucursal".
# ============================================================

from fastapi        import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models         import Usuario, Empresa, Sucursal, Producto
from database       import get_db
import auth as auth_utils

router = APIRouter(prefix="/empresa", tags=["empresa"])


# ── INFO EMPRESA ─────────────────────────────────────────────
@router.get("/info")
async def info_empresa(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """
    Devuelve estado completo de la empresa: plan, sucursales,
    productos, límites y si puede crear más sucursales.

    puede_crear_sucursal:
      True  → solo si plan Pro Y total < max (3)
      False → gratis, basico, o Pro que ya llegó al límite
    """
    empresa = db.query(Empresa).filter(
        Empresa.id == usuario_actual.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Contar sucursales y productos actuales
    total_sucursales = db.query(Sucursal).filter(
        Sucursal.empresa_id == empresa.id,
        Sucursal.activa     == True
    ).count()

    total_productos = db.query(Producto).filter(
        Producto.empresa_id == empresa.id
    ).count()

    total_usuarios = db.query(Usuario).filter(
        Usuario.empresa_id == empresa.id,
        Usuario.activo     == True
    ).count()

    # ─── REGLA CENTRAL ───────────────────────────────────────
    # Solo el plan Pro puede crear sucursales adicionales,
    # y solo si no llegó al límite de 3.
    # Gratis y Basico tienen max_sucursales = 1 (solo la principal).
    puede_crear_sucursal = (
        empresa.plan == "pro" and
        total_sucursales < empresa.max_sucursales
    )
    # ─────────────────────────────────────────────────────────

    return {
        "id":                  empresa.id,
        "nombre":              empresa.nombre,
        "rubro":               empresa.rubro,
        "moneda":              empresa.moneda,
        "logo_base64":         empresa.logo_base64,
        "plan":                empresa.plan,
        "activa":              empresa.activa,

        # Suscripción
        "bloqueado":           getattr(empresa, "bloqueado",    False),
        "en_gracia":           getattr(empresa, "en_gracia",    False),
        "gracia_hasta":        getattr(empresa, "gracia_hasta", None),

        # Sucursales
        "max_sucursales":      empresa.max_sucursales,
        "total_sucursales":    total_sucursales,
        "puede_crear_sucursal": puede_crear_sucursal,

        # Otros límites
        "max_productos":       getattr(empresa, "max_productos",  None),
        "total_productos":     total_productos,
        "total_usuarios":      total_usuarios,
    }


# ── MIS PERMISOS ─────────────────────────────────────────────
@router.get("/mis-permisos")
async def mis_permisos(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """
    Devuelve los permisos del usuario actual.
    Admin y Líder tienen acceso total a su ámbito.
    """
    rol = usuario_actual.rol

    # Admin y líder tienen acceso completo (en su sucursal)
    acceso_total = rol in ("admin", "lider")

    return {
        "rol":          rol,
        "acceso_total": acceso_total,
        "puede_ver_reportes":    acceso_total,
        "puede_editar_config":   rol == "admin",
        "puede_invitar_usuarios": acceso_total,
        "puede_ver_equipo":      acceso_total,
        "puede_crear_sucursales": rol == "admin",  # solo admin gestiona sucursales
    }


# ── USUARIOS DE LA EMPRESA ───────────────────────────────────
@router.get("/usuarios")
async def listar_usuarios(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """Lista todos los usuarios activos de la empresa."""
    usuarios = db.query(Usuario).filter(
        Usuario.empresa_id == usuario_actual.empresa_id,
        Usuario.activo     == True
    ).all()

    return [_usuario_dict(u) for u in usuarios]


# ── CAMBIAR PLAN ─────────────────────────────────────────────
@router.post("/cambiar-plan")
async def cambiar_plan(
    datos:          dict,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """
    Cambia el plan de la empresa.

    Al subir a Pro:
      - max_sucursales = 3
      - crea Sucursal Principal si por alguna razón no existe

    Al bajar a basico/gratis:
      - max_sucursales = 1
      - puede_crear_sucursal = False automáticamente (lo calcula /info)
    """
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede cambiar el plan")

    nuevo_plan = datos.get("plan", "").lower()
    if nuevo_plan not in ("gratis", "basico", "pro"):
        raise HTTPException(status_code=400, detail="Plan inválido")

    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.plan = nuevo_plan

    if nuevo_plan == "pro":
        # Pro puede tener hasta 3 sucursales
        empresa.max_sucursales = 3

        # Seguridad: si por algún motivo no tiene Sucursal Principal, crearla
        tiene_sucursal = db.query(Sucursal).filter(
            Sucursal.empresa_id == empresa.id
        ).first()

        if not tiene_sucursal:
            suc = Sucursal(
                empresa_id = empresa.id,
                nombre     = "Sucursal Principal",
                activa     = True,
            )
            db.add(suc)
            # Asignar al admin si no tiene sucursal
            if not usuario_actual.sucursal_id:
                db.flush()
                usuario_actual.sucursal_id = suc.id

    else:
        # Gratis y básico solo pueden tener 1 sucursal
        empresa.max_sucursales = 1

    db.commit()

    return {
        "mensaje":         f"Plan cambiado a {nuevo_plan}",
        "plan":            nuevo_plan,
        "max_sucursales":  empresa.max_sucursales,
    }


# ── CANCELAR SUSCRIPCIÓN ─────────────────────────────────────
@router.post("/cancelar-suscripcion")
async def cancelar_suscripcion(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede cancelar")

    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Marcar en gracia (7 días de acceso solo lectura)
    from datetime import datetime, timedelta
    empresa.en_gracia    = True
    empresa.gracia_hasta = datetime.utcnow() + timedelta(days=7)
    db.commit()

    return {"mensaje": "Suscripción cancelada. Tienes 7 días de acceso de solo lectura."}


# ── REACTIVAR SUSCRIPCIÓN ────────────────────────────────────
@router.post("/reactivar")
async def reactivar_suscripcion(
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede reactivar")

    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.en_gracia    = False
    empresa.gracia_hasta = None
    empresa.bloqueado    = False
    db.commit()

    return {"mensaje": "Suscripción reactivada correctamente"}


# ── ACTUALIZAR EMPRESA ───────────────────────────────────────
@router.put("/actualizar")
async def actualizar_empresa(
    datos:          dict,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """Actualiza nombre, rubro, moneda y logo de la empresa."""
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede editar la empresa")

    empresa = db.query(Empresa).filter(Empresa.id == usuario_actual.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    if "nombre"   in datos: empresa.nombre      = datos["nombre"]
    if "rubro"    in datos: empresa.rubro        = datos["rubro"]
    if "moneda"   in datos: empresa.moneda       = datos["moneda"]
    if "logo_base64" in datos: empresa.logo_base64 = datos["logo_base64"]

    db.commit()
    return {"mensaje": "Empresa actualizada correctamente"}


# ── INVITAR COLABORADOR ──────────────────────────────────────
@router.post("/invitar")
async def invitar_colaborador(
    datos:          dict,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    """
    Crea un nuevo usuario colaborador en la empresa.
    Solo admin puede invitar. Devuelve el usuario creado con su id
    para que el frontend pueda asignarlo a una sucursal si es líder.
    """
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede agregar colaboradores")

    nombre   = (datos.get("nombre")   or "").strip()
    username = (datos.get("username") or "").strip().lower()
    password = (datos.get("password") or "").strip()
    rol      = (datos.get("rol")      or "operador").strip()

    if not nombre or not username or not password:
        raise HTTPException(status_code=400, detail="nombre, username y password son obligatorios")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")
    if rol not in ("operador", "lider", "admin"):
        raise HTTPException(status_code=400, detail="Rol inválido")

    # Username único dentro de la empresa
    existe = db.query(Usuario).filter(Usuario.username == username).first()
    if existe:
        raise HTTPException(status_code=409, detail=f"El usuario '@{username}' ya está en uso")

    from auth import hashear_password
    nuevo = Usuario(
        nombre     = nombre,
        username   = username,
        password   = hashear_password(password),
        rol        = rol,
        empresa_id = usuario_actual.empresa_id,
        activo     = True,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return _usuario_dict(nuevo)


# ── CAMBIAR ROL ───────────────────────────────────────────────
@router.patch("/usuarios/{usuario_id}/rol")
async def cambiar_rol(
    usuario_id:     int,
    rol:            str,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede cambiar roles")
    if rol not in ("operador", "lider", "admin"):
        raise HTTPException(status_code=400, detail="Rol inválido")

    usuario = db.query(Usuario).filter(
        Usuario.id         == usuario_id,
        Usuario.empresa_id == usuario_actual.empresa_id
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")

    usuario.rol = rol
    db.commit()
    return {"mensaje": f"Rol actualizado a {rol}", "usuario_id": usuario_id}


# ── ACTIVAR / DESACTIVAR USUARIO ─────────────────────────────
@router.patch("/usuarios/{usuario_id}/estado")
async def cambiar_estado_usuario(
    usuario_id:     int,
    datos:          dict,
    usuario_actual: Usuario = Depends(auth_utils.get_current_user),
    db:             Session = Depends(get_db)
):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo el admin puede activar/desactivar usuarios")

    usuario = db.query(Usuario).filter(
        Usuario.id         == usuario_id,
        Usuario.empresa_id == usuario_actual.empresa_id
    ).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    usuario.activo = datos.get("activo", True)
    db.commit()
    estado = "activado" if usuario.activo else "desactivado"
    return {"mensaje": f"Usuario {estado}", "usuario_id": usuario_id}


# ── HELPER INTERNO ───────────────────────────────────────────
def _usuario_dict(u: Usuario) -> dict:
    """Convierte un objeto Usuario en dict para la API."""
    return {
        "id":          u.id,
        "nombre":      u.nombre,
        "apellido":    u.apellido or "",
        "username":    u.username,
        "email":       u.email or "",
        "rol":         u.rol,
        "activo":      u.activo,
        "sucursal_id": u.sucursal_id,  # incluido para el frontend
    }
