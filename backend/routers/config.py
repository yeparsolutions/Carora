# ============================================================
# STOCKYA — Router de Configuración
# Archivo: backend/routers/config.py
# ============================================================
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from auth import get_usuario_actual
import models, schemas

router = APIRouter(prefix="/configuracion", tags=["Configuración"])

# ============================================================
# GET /configuracion
# ============================================================
@router.get("/", response_model=schemas.ConfiguracionRespuesta)
def obtener_configuracion(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()
    if not config:
        config = models.Configuracion(
            usuario_id      = usuario_actual.id,
            nombre_negocio  = "Mi Negocio",
            moneda          = "CLP",
            color_principal = "#00C77B",
            sonido_escaner  = "scanner"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

# ============================================================
# PUT /configuracion
# ============================================================
@router.put("/", response_model=schemas.ConfiguracionRespuesta)
def actualizar_configuracion(
    datos: schemas.ConfiguracionActualizar,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)
):
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()
    if not config:
        config = models.Configuracion(usuario_id=usuario_actual.id)
        db.add(config)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(config, campo, valor)
    db.commit()
    db.refresh(config)
    return config
