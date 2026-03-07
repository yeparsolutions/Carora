# ============================================================
# YEPARSTOCK — Router de Sucursales
# Archivo: backend/routers/sucursales.py  ← ARCHIVO NUEVO
# ============================================================
# Endpoints para gestión de sucursales multi-local (Plan Pro)
#
# Reglas de acceso:
#   ADMIN → ve y gestiona TODAS las sucursales de su empresa
#   LIDER → ve y gestiona SOLO su sucursal (no las demás)
#   OPERADOR → sin acceso a este router
#
# Analogía de permisos:
#   Admin = dueño del hotel con llave maestra
#   Líder = gerente de piso, solo su planta
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from database import get_db
import models
import auth

router = APIRouter(prefix="/sucursales", tags=["Sucursales"])


# ============================================================
# SCHEMAS — contratos de entrada y salida de datos
# ============================================================

class SucursalCrear(BaseModel):
    """Datos necesarios para crear una nueva sucursal"""
    nombre:    str
    direccion: Optional[str] = None
    telefono:  Optional[str] = None


class SucursalActualizar(BaseModel):
    """Datos editables de una sucursal (todos opcionales)"""
    nombre:    Optional[str] = None
    direccion: Optional[str] = None
    telefono:  Optional[str] = None
    activa:    Optional[bool] = None


class SucursalRespuesta(BaseModel):
    """Lo que devuelve la API al consultar una sucursal"""
    id:          int
    empresa_id:  int
    nombre:      str
    direccion:   Optional[str]
    telefono:    Optional[str]
    activa:      bool
    created_at:  datetime
    total_colaboradores: int = 0   # cuántos usuarios tiene asignados

    class Config:
        from_attributes = True


class ColaboradorAsignar(BaseModel):
    """Para asignar un colaborador existente a esta sucursal"""
    usuario_id: int
    rol:        Optional[str] = "operador"   # "lider" u "operador"


# ============================================================
# HELPER — construir respuesta con conteo de colaboradores
# ============================================================
def _build_respuesta(sucursal: models.Sucursal, db: Session) -> dict:
    """Construye el dict de respuesta enriquecido con datos calculados"""
    total = db.query(models.Usuario).filter(
        models.Usuario.sucursal_id == sucursal.id,
        models.Usuario.activo      == True
    ).count()

    return {
        "id":                   sucursal.id,
        "empresa_id":           sucursal.empresa_id,
        "nombre":               sucursal.nombre,
        "direccion":            sucursal.direccion,
        "telefono":             sucursal.telefono,
        "activa":               sucursal.activa,
        "created_at":           sucursal.created_at,
        "total_colaboradores":  total,
    }


# ============================================================
# GET /sucursales/
# Lista de sucursales según el rol del usuario:
#   - Admin: ve todas las sucursales de su empresa
#   - Líder: ve SOLO su sucursal
# ============================================================
@router.get("/", response_model=List[SucursalRespuesta])
def listar_sucursales(
    usuario: models.Usuario = Depends(auth.get_usuario_actual),
    db:      Session        = Depends(get_db),
):
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol

    # Verificar que tenga permiso (admin o lider)
    auth.admin_o_lider(usuario)

    if rol == "admin":
        # Admin ve todas las sucursales de su empresa
        sucursales = db.query(models.Sucursal).filter(
            models.Sucursal.empresa_id == usuario.empresa_id
        ).all()
    else:
        # Líder: solo ve la suya
        if not usuario.sucursal_id:
            return []   # lider sin sucursal asignada — caso borde
        sucursales = db.query(models.Sucursal).filter(
            models.Sucursal.id == usuario.sucursal_id
        ).all()

    return [_build_respuesta(s, db) for s in sucursales]


# ============================================================
# POST /sucursales/
# Crear nueva sucursal — SOLO ADMIN, SOLO PLAN PRO
# Verifica el límite del plan antes de crear
# ============================================================
@router.post("/", response_model=SucursalRespuesta, status_code=201)
def crear_sucursal(
    datos:   SucursalCrear,
    usuario: models.Usuario = Depends(auth.solo_plan_pro),   # Plan Pro requerido
    db:      Session        = Depends(get_db),
):
    # Solo el admin puede crear sucursales
    auth.solo_admin(usuario)

    # Traer la empresa para verificar límites
    empresa = db.query(models.Empresa).filter(
        models.Empresa.id == usuario.empresa_id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Verificar que no supere el límite del plan (máx 3 en Pro)
    # Analogía: el contrato dice cuántos locales puedes abrir
    auth.verificar_limite_sucursales(empresa, db)

    # Verificar que no exista otra sucursal con el mismo nombre en esta empresa
    existe = db.query(models.Sucursal).filter(
        models.Sucursal.empresa_id == usuario.empresa_id,
        models.Sucursal.nombre     == datos.nombre
    ).first()

    if existe:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe una sucursal con el nombre '{datos.nombre}'"
        )

    # Crear la sucursal nueva
    nueva = models.Sucursal(
        empresa_id = usuario.empresa_id,
        nombre     = datos.nombre,
        direccion  = datos.direccion,
        telefono   = datos.telefono,
        activa     = True,
    )

    db.add(nueva)
    db.commit()
    db.refresh(nueva)

    return _build_respuesta(nueva, db)


# ============================================================
# GET /sucursales/{sucursal_id}
# Detalle de una sucursal específica
# Admin: puede ver cualquiera | Líder: solo la suya
# ============================================================
@router.get("/{sucursal_id}", response_model=SucursalRespuesta)
def ver_sucursal(
    sucursal_id: int,
    usuario:     models.Usuario = Depends(auth.get_usuario_actual),
    db:          Session        = Depends(get_db),
):
    auth.admin_o_lider(usuario)

    # Verificar que el usuario tenga acceso a esta sucursal
    # (el admin siempre puede, el líder solo a la suya)
    auth.verificar_acceso_sucursal(usuario, sucursal_id)

    sucursal = db.query(models.Sucursal).filter(
        models.Sucursal.id         == sucursal_id,
        models.Sucursal.empresa_id == usuario.empresa_id,   # seguridad: solo su empresa
    ).first()

    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    return _build_respuesta(sucursal, db)


# ============================================================
# PUT /sucursales/{sucursal_id}
# Editar datos de una sucursal
# Admin: puede editar cualquiera | Líder: solo la suya
# ============================================================
@router.put("/{sucursal_id}", response_model=SucursalRespuesta)
def actualizar_sucursal(
    sucursal_id: int,
    datos:       SucursalActualizar,
    usuario:     models.Usuario = Depends(auth.get_usuario_actual),
    db:          Session        = Depends(get_db),
):
    auth.admin_o_lider(usuario)
    auth.verificar_acceso_sucursal(usuario, sucursal_id)

    sucursal = db.query(models.Sucursal).filter(
        models.Sucursal.id         == sucursal_id,
        models.Sucursal.empresa_id == usuario.empresa_id,
    ).first()

    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # El líder no puede desactivar su propia sucursal (solo el admin)
    rol = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol == "lider" and datos.activa is not None:
        raise HTTPException(
            status_code=403,
            detail="Solo el administrador puede activar o desactivar sucursales"
        )

    # Aplicar cambios solo en los campos enviados
    if datos.nombre    is not None: sucursal.nombre    = datos.nombre
    if datos.direccion is not None: sucursal.direccion = datos.direccion
    if datos.telefono  is not None: sucursal.telefono  = datos.telefono
    if datos.activa    is not None: sucursal.activa    = datos.activa

    db.commit()
    db.refresh(sucursal)

    return _build_respuesta(sucursal, db)


# ============================================================
# GET /sucursales/{sucursal_id}/colaboradores
# Lista los usuarios asignados a una sucursal
# Admin: puede ver cualquier sucursal | Líder: solo la suya
# ============================================================
@router.get("/{sucursal_id}/colaboradores")
def listar_colaboradores(
    sucursal_id: int,
    usuario:     models.Usuario = Depends(auth.get_usuario_actual),
    db:          Session        = Depends(get_db),
):
    auth.admin_o_lider(usuario)
    auth.verificar_acceso_sucursal(usuario, sucursal_id)

    # Verificar que la sucursal pertenece a la empresa del usuario
    sucursal = db.query(models.Sucursal).filter(
        models.Sucursal.id         == sucursal_id,
        models.Sucursal.empresa_id == usuario.empresa_id,
    ).first()

    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # Traer todos los colaboradores de esta sucursal
    colaboradores = db.query(models.Usuario).filter(
        models.Usuario.sucursal_id == sucursal_id,
        models.Usuario.activo      == True
    ).all()

    return [
        {
            "id":          c.id,
            "nombre":      c.nombre,
            "apellido":    c.apellido,
            "username":    c.username,
            "email":       c.email,
            "rol":         c.rol.value if hasattr(c.rol, "value") else c.rol,
            "activo":      c.activo,
        }
        for c in colaboradores
    ]


# ============================================================
# POST /sucursales/{sucursal_id}/colaboradores
# Asignar un usuario existente de la empresa a esta sucursal
#
# REGLAS:
#   Admin → puede asignar a cualquier sucursal
#   Líder → solo puede asignar colaboradores a SU sucursal
#           y solo puede asignar rol "operador" (no otro lider)
# ============================================================
@router.post("/{sucursal_id}/colaboradores", status_code=201)
def asignar_colaborador(
    sucursal_id: int,
    datos:       ColaboradorAsignar,
    usuario:     models.Usuario = Depends(auth.get_usuario_actual),
    db:          Session        = Depends(get_db),
):
    auth.admin_o_lider(usuario)
    auth.verificar_acceso_sucursal(usuario, sucursal_id)

    # Verificar que la sucursal existe y pertenece a esta empresa
    sucursal = db.query(models.Sucursal).filter(
        models.Sucursal.id         == sucursal_id,
        models.Sucursal.empresa_id == usuario.empresa_id,
    ).first()

    if not sucursal:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # El líder NO puede asignar otro líder — solo el admin puede hacer eso
    rol_actual = usuario.rol.value if hasattr(usuario.rol, "value") else usuario.rol
    if rol_actual == "lider" and datos.rol == "lider":
        raise HTTPException(
            status_code=403,
            detail="Un líder no puede asignar otro líder. Solo el administrador puede hacerlo."
        )

    # Verificar que el colaborador a asignar es de la misma empresa
    colaborador = db.query(models.Usuario).filter(
        models.Usuario.id         == datos.usuario_id,
        models.Usuario.empresa_id == usuario.empresa_id,
    ).first()

    if not colaborador:
        raise HTTPException(status_code=404, detail="Usuario no encontrado en esta empresa")

    # Asignar a la sucursal y actualizar su rol si se indicó
    colaborador.sucursal_id = sucursal_id

    if datos.rol in ("lider", "operador"):
        colaborador.rol = datos.rol

    db.commit()
    db.refresh(colaborador)

    return {
        "mensaje":       f"Colaborador '{colaborador.nombre}' asignado a '{sucursal.nombre}'",
        "usuario_id":    colaborador.id,
        "sucursal_id":   sucursal_id,
        "rol":           colaborador.rol.value if hasattr(colaborador.rol, "value") else colaborador.rol,
    }


# ============================================================
# DELETE /sucursales/{sucursal_id}/colaboradores/{usuario_id}
# Desasignar un colaborador de una sucursal
# Admin: cualquier sucursal | Líder: solo la suya
# ============================================================
@router.delete("/{sucursal_id}/colaboradores/{colaborador_id}", status_code=200)
def desasignar_colaborador(
    sucursal_id:    int,
    colaborador_id: int,
    usuario:        models.Usuario = Depends(auth.get_usuario_actual),
    db:             Session        = Depends(get_db),
):
    auth.admin_o_lider(usuario)
    auth.verificar_acceso_sucursal(usuario, sucursal_id)

    # Verificar que el colaborador pertenece a esta empresa y sucursal
    colaborador = db.query(models.Usuario).filter(
        models.Usuario.id          == colaborador_id,
        models.Usuario.empresa_id  == usuario.empresa_id,
        models.Usuario.sucursal_id == sucursal_id,
    ).first()

    if not colaborador:
        raise HTTPException(
            status_code=404,
            detail="Colaborador no encontrado en esta sucursal"
        )

    # El líder no puede desasignar a otro líder
    rol_colaborador = colaborador.rol.value if hasattr(colaborador.rol, "value") else colaborador.rol
    rol_actual      = usuario.rol.value     if hasattr(usuario.rol, "value")     else usuario.rol

    if rol_actual == "lider" and rol_colaborador == "lider":
        raise HTTPException(
            status_code=403,
            detail="Un líder no puede desasignar a otro líder"
        )

    # Quitar la sucursal (el usuario queda "sin sucursal", el admin lo reasigna)
    colaborador.sucursal_id = None

    db.commit()

    return {
        "mensaje":     f"Colaborador '{colaborador.nombre}' desasignado de la sucursal",
        "usuario_id":  colaborador_id,
    }
