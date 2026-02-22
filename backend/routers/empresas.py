# ============================================================
# STOCKYA - Router de Empresas
# Archivo: backend/routers/empresas.py
# Descripcion: Gestiona la empresa, equipo de usuarios y plan
# Analogia: el panel de RRHH y administracion del negocio —
#           solo el admin puede contratar, despedir y ver el plan
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_usuario_actual, encriptar_password, crear_token
import models, schemas

router = APIRouter(prefix="/empresa", tags=["Empresa"])


# ============================================================
# HELPERS
# ============================================================

def get_empresa_o_error(usuario_actual: models.Usuario, db: Session) -> models.Empresa:
    """
    Obtiene la empresa del usuario o lanza error.
    Analogia: verificar que el empleado tiene una tienda asignada.
    """
    if not usuario_actual.empresa_id:
        raise HTTPException(status_code=400, detail="Tu cuenta no está asociada a una empresa.")
    empresa = db.query(models.Empresa).filter(models.Empresa.id == usuario_actual.empresa_id).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")
    return empresa

def solo_admin(usuario_actual: models.Usuario):
    """
    Verifica que el usuario sea admin.
    Analogia: la puerta de la sala de gerencia — solo entra el jefe.
    """
    rol = usuario_actual.rol.value if hasattr(usuario_actual.rol, 'value') else usuario_actual.rol
    if rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el administrador puede realizar esta acción."
        )

def contar_usuarios_activos(empresa_id: int, db: Session) -> int:
    """Cuenta los usuarios activos de la empresa."""
    return db.query(models.Usuario).filter(
        models.Usuario.empresa_id == empresa_id,
        models.Usuario.activo     == True
    ).count()


# ============================================================
# GET /empresa/info
# Retorna información de la empresa y plan actual
# ============================================================
@router.get("/info")
def info_empresa(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Retorna datos de la empresa, plan y límites.
    Analogia: la ficha del negocio con su membresía activa.
    """
    empresa = get_empresa_o_error(usuario_actual, db)

    total_usuarios  = contar_usuarios_activos(empresa.id, db)
    total_productos = db.query(models.Producto).filter(
        models.Producto.empresa_id == empresa.id,
        models.Producto.activo     == True
    ).count()

    return {
        "id":                   empresa.id,
        "nombre":               empresa.nombre,
        "rubro":                empresa.rubro,
        "moneda":               empresa.moneda,
        "color_principal":      empresa.color_principal,
        "plan":                 empresa.plan.value if hasattr(empresa.plan, 'value') else empresa.plan,
        "plan_precio":          empresa.plan_precio,
        "plan_es_fundador":     empresa.plan_es_fundador,
        "plan_activo":          empresa.plan_activo,
        "plan_expira":          empresa.plan_expira,
        "max_usuarios":         empresa.max_usuarios,
        "max_productos":        empresa.max_productos,
        "total_usuarios":       total_usuarios,
        "total_productos":      total_productos,
        "productos_disponibles": ((empresa.max_productos - total_productos) if (empresa.max_productos or 0) > 0 else None),
        "created_at":           empresa.created_at,
    }


# ============================================================
# GET /empresa/equipo
# Lista todos los usuarios de la empresa
# ============================================================
@router.get("/equipo")
def listar_equipo(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Lista todos los usuarios del equipo de la empresa.
    Analogia: el organigrama del negocio.
    """
    empresa = get_empresa_o_error(usuario_actual, db)

    usuarios = db.query(models.Usuario).filter(
        models.Usuario.empresa_id == empresa.id
    ).order_by(models.Usuario.created_at).all()

    return [
        {
            "id":         u.id,
            "nombre":     u.nombre,
            "email":      u.email,
            "rol":        u.rol.value if hasattr(u.rol, 'value') else u.rol,
            "activo":     u.activo,
            "created_at": u.created_at,
            "es_yo":      u.id == usuario_actual.id,
        }
        for u in usuarios
    ]


# ============================================================
# POST /empresa/invitar
# Agrega un nuevo usuario al equipo (solo admin)
# ============================================================
@router.post("/invitar", status_code=201)
def invitar_usuario(
    datos: schemas.UsuarioCrear,
    rol: Optional[str] = "operador",
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Agrega un nuevo usuario al equipo de la empresa.
    Analogia: contratar un nuevo empleado y darle su credencial.
    Solo el admin puede hacer esto.
    """
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    # Verificar límite de usuarios según el plan
    # Analogia: verificar si hay espacio en la planilla antes de contratar
    total_usuarios = contar_usuarios_activos(empresa.id, db)
    if total_usuarios >= empresa.max_usuarios:
        plan = empresa.plan.value if hasattr(empresa.plan, 'value') else empresa.plan
        raise HTTPException(
            status_code=403,
            detail={
                "tipo":         "limite_usuarios",
                "mensaje":      f"Tu plan {plan} permite máximo {empresa.max_usuarios} usuario(s). Actualiza a Premium para agregar más.",
                "limite":       empresa.max_usuarios,
                "total_actual": total_usuarios,
            }
        )

    # Verificar que el email no esté registrado
    existe = db.query(models.Usuario).filter(models.Usuario.email == datos.email).first()
    if existe:
        # Si ya existe pero está en otra empresa, no permitir
        if existe.empresa_id != empresa.id:
            raise HTTPException(
                status_code=400,
                detail="Este correo ya está registrado en otro negocio."
            )
        # Si ya está en esta empresa, informar
        raise HTTPException(
            status_code=400,
            detail="Este correo ya pertenece a tu equipo."
        )

    # Validar rol
    if rol not in ("admin", "operador"):
        rol = "operador"

    # Crear el nuevo usuario en la misma empresa
    nuevo = models.Usuario(
        empresa_id    = empresa.id,
        nombre        = datos.nombre,
        email         = datos.email,
        password_hash = encriptar_password(datos.password),
        rol           = rol,
        activo        = True,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return {
        "ok":      True,
        "mensaje": f"Usuario {datos.nombre} agregado al equipo correctamente.",
        "usuario": {
            "id":     nuevo.id,
            "nombre": nuevo.nombre,
            "email":  nuevo.email,
            "rol":    rol,
        }
    }


# ============================================================
# PATCH /empresa/equipo/{usuario_id}/rol
# Cambia el rol de un usuario (solo admin)
# ============================================================
@router.patch("/equipo/{usuario_id}/rol")
def cambiar_rol(
    usuario_id: int,
    nuevo_rol: str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Cambia el rol de un usuario del equipo.
    Analogia: ascender o reasignar funciones a un empleado.
    """
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    if nuevo_rol not in ("admin", "operador"):
        raise HTTPException(status_code=400, detail="Rol inválido. Debe ser 'admin' u 'operador'.")

    usuario = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == empresa.id
    ).first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en tu equipo.")

    if usuario.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol.")

    usuario.rol = nuevo_rol
    db.commit()

    return {"ok": True, "mensaje": f"Rol de {usuario.nombre} actualizado a {nuevo_rol}."}


# ============================================================
# PATCH /empresa/equipo/{usuario_id}/desactivar
# Desactiva un usuario del equipo (solo admin)
# ============================================================
@router.patch("/equipo/{usuario_id}/desactivar")
def desactivar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Desactiva un usuario del equipo — no lo elimina, solo bloquea el acceso.
    Analogia: revocar la credencial de un empleado que ya no trabaja aquí.
    """
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    usuario = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == empresa.id
    ).first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en tu equipo.")

    if usuario.id == usuario_actual.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo.")

    usuario.activo = False
    db.commit()

    return {"ok": True, "mensaje": f"Usuario {usuario.nombre} desactivado correctamente."}


# ============================================================
# PATCH /empresa/equipo/{usuario_id}/activar
# Reactiva un usuario desactivado (solo admin)
# ============================================================
@router.patch("/equipo/{usuario_id}/activar")
def activar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Reactiva un usuario que fue desactivado."""
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    usuario = db.query(models.Usuario).filter(
        models.Usuario.id         == usuario_id,
        models.Usuario.empresa_id == empresa.id
    ).first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en tu equipo.")

    # Verificar límite antes de reactivar
    total_activos = contar_usuarios_activos(empresa.id, db)
    if total_activos >= empresa.max_usuarios:
        raise HTTPException(
            status_code=403,
            detail=f"Límite de usuarios alcanzado. Tu plan permite {empresa.max_usuarios} usuario(s) activo(s)."
        )

    usuario.activo = True
    db.commit()

    return {"ok": True, "mensaje": f"Usuario {usuario.nombre} reactivado correctamente."}


# ============================================================
# PUT /empresa/info
# Actualiza datos de la empresa (solo admin)
# ============================================================
@router.put("/info")
def actualizar_empresa(
    nombre:          Optional[str] = None,
    rubro:           Optional[str] = None,
    moneda:          Optional[str] = None,
    color_principal: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Actualiza los datos generales de la empresa.
    Solo el admin puede hacerlo.
    """
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    if nombre:          empresa.nombre          = nombre
    if rubro:           empresa.rubro           = rubro
    if moneda:          empresa.moneda          = moneda
    if color_principal: empresa.color_principal = color_principal

    db.commit()
    db.refresh(empresa)

    return {"ok": True, "mensaje": "Empresa actualizada correctamente."}


# ============================================================
# PATCH /empresa/cambiar-plan
# Cambia el plan de la empresa (upgrade o downgrade)
# Analogia: como cambiar la membresía del gimnasio en el mismo
#           mostrador — sube a Pro o baja a Básico al instante
# ============================================================
@router.patch("/cambiar-plan")
def cambiar_plan(
    nuevo_plan: str,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """
    Cambia el plan de la empresa entre basico y pro.
    Solo el admin puede hacerlo.
    """
    solo_admin(usuario_actual)
    empresa = get_empresa_o_error(usuario_actual, db)

    # Validar que el plan pedido sea válido
    planes_validos = ["basico", "pro"]
    if nuevo_plan not in planes_validos:
        raise HTTPException(status_code=400, detail=f"Plan inválido. Opciones: {planes_validos}")

    plan_actual = empresa.plan.value if hasattr(empresa.plan, 'value') else empresa.plan

    if plan_actual == nuevo_plan:
        raise HTTPException(status_code=400, detail=f"Ya estás en el plan {nuevo_plan}.")

    # Downgrade: verificar que la empresa cumpla los límites del plan básico
    if nuevo_plan == "basico":
        total_usuarios  = contar_usuarios_activos(empresa.id, db)
        total_productos = db.query(models.Producto).filter(
            models.Producto.empresa_id == empresa.id,
            models.Producto.activo     == True
        ).count()

        if total_usuarios > 1:
            raise HTTPException(
                status_code=400,
                detail=f"Tienes {total_usuarios} usuarios activos. El plan Básico permite máximo 1. Desactiva los usuarios extra antes de bajar de plan."
            )
        if total_productos > 200:
            raise HTTPException(
                status_code=400,
                detail=f"Tienes {total_productos} productos activos. El plan Básico permite máximo 200. Elimina o desactiva productos antes de bajar de plan."
            )

    # Aplicar el cambio de plan con los nuevos límites
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

    db.commit()
    db.refresh(empresa)

    return {
        "ok":      True,
        "plan":    nuevo_plan,
        "mensaje": f"Plan actualizado a {nuevo_plan} correctamente."
    }