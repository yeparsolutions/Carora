# ============================================================
# STOCKYA — Router de Configuración
# Archivo: backend/routers/config.py
# Descripción: Endpoints para leer y actualizar datos del negocio
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/configuracion", tags=["Configuración"])


# ============================================================
# GET /configuracion
# Retorna la configuración del negocio del usuario autenticado
# ============================================================
@router.get("/", response_model=schemas.ConfiguracionRespuesta)
def obtener_configuracion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Retorna la configuración del negocio del usuario."""
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    # Si no existe configuración, crear una por defecto
    if not config:
        config = models.Configuracion(
            usuario_id      = usuario_actual.id,
            nombre_negocio  = "Mi Negocio",
            moneda          = "CLP",
            color_principal = "#00C77B"
        )
        db.add(config)
        db.commit()
        db.refresh(config)

    return config


# ============================================================
# PUT /configuracion
# Actualiza la configuración del negocio
# ============================================================
@router.put("/", response_model=schemas.ConfiguracionRespuesta)
def actualizar_configuracion(
    datos: schemas.ConfiguracionActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    """Actualiza los datos del negocio del usuario autenticado."""
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()

    # Si no existe, crear nueva configuración
    if not config:
        config = models.Configuracion(usuario_id=usuario_actual.id)
        db.add(config)

    # Actualizar solo los campos enviados
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(config, campo, valor)

    db.commit()
    db.refresh(config)

    return config
