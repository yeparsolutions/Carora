# ============================================================
# YEPARSTOCK - Router de Reportes
# Archivo: backend/routers/reportes.py
#
# PLAN BASICO → ventas-resumen, ventas-por-dia, ventas-por-tipo
# PLAN PRO    → todo lo anterior + ganancia-real, top-productos,
#               comparacion-periodos, rotacion-inventario,
#               productos-sin-movimiento
#
# Analogia: Basico = velocimetro (sabes cuanto vendiste hoy)
#           Pro    = GPS completo (sabes como crecer y por que)
# ============================================================

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import get_db
from auth import get_usuario_actual, solo_plan_pro
import models

router = APIRouter(prefix="/reportes", tags=["Reportes"])


# ============================================================
# Helpers internos
# ============================================================

def get_empresa_id(usuario_actual: models.Usuario) -> int:
    """Obtiene empresa_id o lanza 400 si no tiene empresa asociada."""
    if not usuario_actual.empresa_id:
        raise HTTPException(
            status_code=400,
            detail="Tu cuenta no esta asociada a una empresa."
        )
    return usuario_actual.empresa_id


def get_rango_fechas(periodo: str, desde: str = None, hasta: str = None):
    """
    Convierte periodo o fechas custom en rango datetime.
    Analogia: el cajero que sabe si buscar 'ventas de hoy'
    o 'ventas entre dos fechas especificas'.
    """
    ahora = datetime.now(timezone.utc)
    if desde and hasta:
        try:
            fd = datetime.strptime(desde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            fh = datetime.strptime(hasta, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            return fd, fh
        except Exception:
            pass
    if periodo == "hoy":
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    elif periodo == "semana":
        inicio = ahora - timedelta(days=7)
        fin    = ahora
    elif periodo == "mes":
        inicio = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    elif periodo == "año":
        inicio = ahora.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        fin    = ahora
    else:
        inicio = ahora - timedelta(days=30)
        fin    = ahora
    return inicio, fin


# ============================================================
# ✅ PLAN BASICO — Resumen de ventas
# ============================================================

@router.get("/ventas-resumen")
def ventas_resumen(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)  # disponible en Basico
):
    """Resumen total de ventas por periodo. Disponible en Plan Basico."""
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)

    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    total_valor     = sum(v.valor_total or 0 for v in ventas)
    total_unidades  = sum(v.cantidad for v in ventas)
    total_registros = len(ventas)
    ticket_promedio = total_valor / total_registros if total_registros > 0 else 0

    mermas = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "merma",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).scalar() or 0.0

    return {
        "periodo":         periodo,
        "desde":           inicio.isoformat(),
        "hasta":           fin.isoformat(),
        "total_valor":     round(total_valor, 2),
        "total_unidades":  total_unidades,
        "total_registros": total_registros,
        "ticket_promedio": round(ticket_promedio, 2),
        "total_mermas":    round(mermas, 2),
    }


# ============================================================
# ✅ PLAN BASICO — Ventas por dia (grafico simple)
# ============================================================

@router.get("/ventas-por-dia")
def ventas_por_dia(
    periodo: str = Query("semana"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)  # disponible en Basico
):
    """Grafico de barras de ventas por dia. Disponible en Plan Basico."""
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)

    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    por_dia = {}
    for v in ventas:
        fecha = v.created_at.strftime("%Y-%m-%d")
        if fecha not in por_dia:
            por_dia[fecha] = {"fecha": fecha, "valor": 0, "cantidad": 0, "registros": 0}
        por_dia[fecha]["valor"]     += v.valor_total or 0
        por_dia[fecha]["cantidad"]  += v.cantidad
        por_dia[fecha]["registros"] += 1

    # Rellenar dias sin ventas con ceros para grafico continuo
    dias   = []
    actual = inicio
    while actual < fin:
        fecha = actual.strftime("%Y-%m-%d")
        dias.append(por_dia.get(fecha, {"fecha": fecha, "valor": 0, "cantidad": 0, "registros": 0}))
        actual += timedelta(days=1)
    return dias


# ============================================================
# ✅ PLAN BASICO — Ventas por tipo
# ============================================================

@router.get("/ventas-por-tipo")
def ventas_por_tipo(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual)  # disponible en Basico
):
    """Distribucion de ventas, mermas y devoluciones. Disponible en Plan Basico."""
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)

    tipos     = ["venta", "merma", "cuarentena", "devolucion_proveedor"]
    resultado = []
    for tipo in tipos:
        total = db.query(sqlfunc.count(models.Salida.id)).filter(
            models.Salida.empresa_id  == empresa_id,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0
        valor = db.query(sqlfunc.sum(models.Salida.valor_total)).filter(
            models.Salida.empresa_id  == empresa_id,
            models.Salida.tipo_salida == tipo,
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).scalar() or 0.0
        resultado.append({"tipo": tipo, "cantidad": total, "valor": round(valor, 2)})
    return resultado


# ============================================================
# 🔵 PLAN PRO — Top productos por ganancia
# Analogia: el ranking de los jugadores estrella del equipo
# ============================================================

@router.get("/top-productos")
def top_productos(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    limite:  int = Query(10),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(solo_plan_pro)  # SOLO PRO
):
    """
    Top N productos por ganancia bruta.
    Requiere Plan Pro.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)

    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    por_producto = {}
    for v in ventas:
        pid           = v.producto_id
        nombre        = v.producto.nombre if v.producto else f"Producto #{pid}"
        precio_compra = v.producto.precio_compra if v.producto else 0
        if pid not in por_producto:
            por_producto[pid] = {
                "producto_id":   pid,
                "nombre":        nombre,
                "unidades":      0,
                "valor_vendido": 0,
                "costo_total":   0,
            }
        por_producto[pid]["unidades"]      += v.cantidad
        por_producto[pid]["valor_vendido"] += v.valor_total or 0
        por_producto[pid]["costo_total"]   += precio_compra * v.cantidad

    # Calcular ganancia bruta y margen por producto
    for p in por_producto.values():
        p["ganancia_bruta"] = round(p["valor_vendido"] - p["costo_total"], 2)
        p["margen_pct"]     = round(
            p["ganancia_bruta"] / p["valor_vendido"] * 100
            if p["valor_vendido"] > 0 else 0, 1
        )
        p["valor_vendido"]  = round(p["valor_vendido"], 2)

    return sorted(por_producto.values(), key=lambda x: x["ganancia_bruta"], reverse=True)[:limite]


# ============================================================
# 🔵 PLAN PRO — Ganancia real mensual
# Analogia: no cuanto entra por la caja, sino cuanto queda
#           en el bolsillo despues de pagar el costo del producto
# ============================================================

@router.get("/ganancia-real")
def ganancia_real(
    periodo: str = Query("mes"),
    desde:   Optional[str] = Query(None),
    hasta:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(solo_plan_pro)  # SOLO PRO
):
    """
    Calcula ganancia bruta real (ventas - costo de lo vendido).
    Requiere Plan Pro.
    """
    inicio, fin = get_rango_fechas(periodo, desde, hasta)
    empresa_id  = get_empresa_id(usuario_actual)

    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    total_ingresos = 0.0
    total_costo    = 0.0
    for v in ventas:
        precio_compra   = v.producto.precio_compra if v.producto else 0
        total_ingresos += v.valor_total or 0
        total_costo    += precio_compra * v.cantidad

    ganancia_bruta  = total_ingresos - total_costo
    margen_promedio = (ganancia_bruta / total_ingresos * 100) if total_ingresos > 0 else 0

    return {
        "periodo":         periodo,
        "desde":           inicio.isoformat(),
        "hasta":           fin.isoformat(),
        "total_ingresos":  round(total_ingresos, 2),
        "total_costo":     round(total_costo, 2),
        "ganancia_bruta":  round(ganancia_bruta, 2),
        "margen_promedio": round(margen_promedio, 2),   # % ganancia sobre ventas
    }


# ============================================================
# 🔵 PLAN PRO — Comparacion de periodos
# Analogia: comparar este mes vs el anterior como un chequeo
#           medico — mejoraste o empeoraste?
# ============================================================

@router.get("/comparacion-periodos")
def comparacion_periodos(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(solo_plan_pro)  # SOLO PRO
):
    """
    Compara ventas y ganancias del mes actual vs mes anterior.
    Requiere Plan Pro.
    """
    empresa_id = get_empresa_id(usuario_actual)
    ahora      = datetime.now(timezone.utc)

    # Periodo actual: mes en curso hasta hoy
    inicio_actual = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_actual    = ahora

    # Periodo anterior: mes pasado completo
    primer_dia_mes = ahora.replace(day=1)
    fin_anterior   = primer_dia_mes
    inicio_anterior = (primer_dia_mes - timedelta(days=1)).replace(day=1)

    def calcular_metricas(inicio, fin):
        ventas = db.query(models.Salida).filter(
            models.Salida.empresa_id  == empresa_id,
            models.Salida.tipo_salida == "venta",
            models.Salida.created_at  >= inicio,
            models.Salida.created_at  <  fin,
        ).all()
        ingresos = sum(v.valor_total or 0 for v in ventas)
        costo    = sum(
            (v.producto.precio_compra if v.producto else 0) * v.cantidad
            for v in ventas
        )
        return {
            "ventas":         len(ventas),
            "ingresos":       round(ingresos, 2),
            "ganancia_bruta": round(ingresos - costo, 2),
            "unidades":       sum(v.cantidad for v in ventas),
        }

    actual   = calcular_metricas(inicio_actual, fin_actual)
    anterior = calcular_metricas(inicio_anterior, fin_anterior)

    def variacion(val_actual, val_anterior):
        if val_anterior == 0:
            return None   # sin datos para comparar
        return round((val_actual - val_anterior) / val_anterior * 100, 1)

    return {
        "periodo_actual":   {"desde": inicio_actual.isoformat(),   "hasta": fin_actual.isoformat(),   **actual},
        "periodo_anterior": {"desde": inicio_anterior.isoformat(), "hasta": fin_anterior.isoformat(), **anterior},
        "variacion": {
            "ventas":         variacion(actual["ventas"],         anterior["ventas"]),
            "ingresos":       variacion(actual["ingresos"],       anterior["ingresos"]),
            "ganancia_bruta": variacion(actual["ganancia_bruta"], anterior["ganancia_bruta"]),
            "unidades":       variacion(actual["unidades"],       anterior["unidades"]),
        }
    }


# ============================================================
# 🔵 PLAN PRO — Rotacion de inventario
# Analogia: que tan rapido rota la mercancia — la leche rota
#           rapido, el televisor lento. Ambos necesitan estrategia.
# ============================================================

@router.get("/rotacion-inventario")
def rotacion_inventario(
    periodo: str = Query("mes"),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(solo_plan_pro)  # SOLO PRO
):
    """
    Calcula la rotacion de inventario por producto.
    Rotacion alta = producto estrella. Rotacion baja = capital dormido.
    Requiere Plan Pro.
    """
    empresa_id  = get_empresa_id(usuario_actual)
    inicio, fin = get_rango_fechas(periodo)

    ventas = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    vendido_por_producto = {}
    for v in ventas:
        pid = v.producto_id
        vendido_por_producto[pid] = vendido_por_producto.get(pid, 0) + v.cantidad

    productos = db.query(models.Producto).filter(
        models.Producto.empresa_id == empresa_id,
        models.Producto.activo     == True
    ).all()

    resultado = []
    for p in productos:
        unidades_vendidas = vendido_por_producto.get(p.id, 0)
        stock_promedio    = max(p.stock_actual, 1)   # evitar division por cero
        rotacion          = round(unidades_vendidas / stock_promedio, 2)
        resultado.append({
            "producto_id":       p.id,
            "nombre":            p.nombre,
            "categoria":         p.categoria,
            "stock_actual":      p.stock_actual,
            "unidades_vendidas": unidades_vendidas,
            "rotacion":          rotacion,
            "clasificacion": (
                "alta"           if rotacion >= 2   else
                "media"          if rotacion >= 0.5 else
                "baja"           if rotacion > 0    else
                "sin_movimiento"
            )
        })

    return sorted(resultado, key=lambda x: x["rotacion"], reverse=True)


# ============================================================
# 🔵 PLAN PRO — Productos sin movimiento
# Analogia: el inventario muerto — capital dormido que no
#           genera ganancia y ocupa espacio en la bodega
# ============================================================

@router.get("/productos-sin-movimiento")
def productos_sin_movimiento(
    dias: int = Query(30, description="Dias sin venta para considerar inactivo"),
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(solo_plan_pro)  # SOLO PRO
):
    """
    Lista productos sin ventas en los ultimos N dias.
    Requiere Plan Pro.
    """
    empresa_id = get_empresa_id(usuario_actual)
    ahora      = datetime.now(timezone.utc)
    limite     = ahora - timedelta(days=dias)

    # Subquery: productos con al menos una venta reciente
    con_venta = db.query(models.Salida.producto_id).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= limite,
    ).distinct().subquery()

    # Productos activos con stock que NO aparecen en esa lista
    sin_movimiento = db.query(models.Producto).filter(
        models.Producto.empresa_id  == empresa_id,
        models.Producto.activo      == True,
        models.Producto.stock_actual > 0,
        ~models.Producto.id.in_(con_venta)
    ).all()

    return [
        {
            "producto_id":     p.id,
            "nombre":          p.nombre,
            "categoria":       p.categoria,
            "stock_actual":    p.stock_actual,
            "precio_compra":   p.precio_compra,
            "capital_dormido": round(p.stock_actual * p.precio_compra, 2),
            "dias_sin_venta":  dias,
        }
        for p in sin_movimiento
    ]

# ============================================================
# POST /reportes/enviar-email
# Genera un resumen del reporte y lo envía por email al usuario
# Analogia: el contador que te manda el estado mensual a tu correo
# sin que tengas que pedirle el archivo — llega solo
# ============================================================
@router.post("/enviar-email")
def enviar_reporte_email(
    periodo:        str = "mes",
    desde:          str = None,
    hasta:          str = None,
    db:             Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(get_usuario_actual),
):
    from email_service import enviar_email

    empresa_id      = get_empresa_id(usuario_actual)
    inicio, fin     = get_rango_fechas(periodo, desde, hasta)

    # ── Obtener datos del resumen usando modelo Salida ──────
    # Analogia: leer el libro de caja en lugar del almacen
    ventas_lista = db.query(models.Salida).filter(
        models.Salida.empresa_id  == empresa_id,
        models.Salida.tipo_salida == "venta",
        models.Salida.created_at  >= inicio,
        models.Salida.created_at  <  fin,
    ).all()

    total_valor    = round(sum(v.valor_total or 0 for v in ventas_lista), 2)
    total_unidades = sum(v.cantidad for v in ventas_lista)

    # Top 5 productos agrupando por producto
    from sqlalchemy import desc
    por_producto = {}
    for v in ventas_lista:
        pid    = v.producto_id
        nombre = v.producto.nombre if v.producto else f"Producto #{pid}"
        if pid not in por_producto:
            por_producto[pid] = {"nombre": nombre, "unidades": 0, "valor": 0.0}
        por_producto[pid]["unidades"] += v.cantidad
        por_producto[pid]["valor"]    += v.valor_total or 0

    # Convertir a lista tipo namedtuple para compatibilidad con el template
    from collections import namedtuple
    TopRow = namedtuple("TopRow", ["nombre", "unidades", "valor"])
    top = sorted(
        [TopRow(d["nombre"], d["unidades"], round(d["valor"], 2))
         for d in por_producto.values()],
        key=lambda x: x.unidades, reverse=True
    )[:5]

    # Configuración del negocio
    config = db.query(models.Configuracion).filter(
        models.Configuracion.usuario_id == usuario_actual.id
    ).first()
    nombre_negocio = config.nombre_negocio if config else "Mi Negocio"
    moneda         = config.moneda         if config else "$"

    # ── Generar HTML del reporte ──────────────────────────────
    etiqueta_periodo = {
        "hoy":    "Hoy",
        "semana": "Últimos 7 días",
        "mes":    "Este mes",
        "año":    "Este año",
    }.get(periodo, periodo)

    filas_top = "".join([
        f"""<tr>
          <td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>{p.nombre}</td>
          <td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>{int(p.unidades)}</td>
          <td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>{moneda}{round(float(p.valor),2):,.0f}</td>
        </tr>"""
        for p in top
    ]) or "<tr><td colspan='3' style='padding:12px;text-align:center;color:#94a3b8'>Sin ventas en el periodo</td></tr>"

    html = f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:28px 40px;">
            <div style="font-size:22px;font-weight:900;color:#fff;">📦 YeparStock</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Reporte de {etiqueta_periodo} — {nombre_negocio}</div>
          </td>
        </tr>

        <!-- Métricas principales -->
        <tr>
          <td style="padding:28px 40px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding-right:8px;">
                  <div style="background:#f0f9ff;border-radius:12px;padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;">VENTAS</div>
                    <div style="font-size:28px;font-weight:900;color:#0ea5e9;margin-top:6px;">{moneda}{total_valor:,.0f}</div>
                  </div>
                </td>
                <td width="50%" style="padding-left:8px;">
                  <div style="background:#f0fdf4;border-radius:12px;padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;">UNIDADES</div>
                    <div style="font-size:28px;font-weight:900;color:#16a34a;margin-top:6px;">{total_unidades}</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Top productos -->
        <tr>
          <td style="padding:24px 40px;">
            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:12px;">🏆 Top 5 Productos</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">PRODUCTO</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">UNIDADES</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">VALOR</th>
              </tr>
              {filas_top}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:0 40px 28px;text-align:center;">
            <div style="background:#fef3c7;border-radius:10px;padding:14px;font-size:13px;color:#92400e;">
              Para ver el reporte completo con gráficas, descarga Excel o PDF desde la sección <strong>Reportes</strong> en YeparStock.
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">© 2025 YeparSolutions · Reporte generado automáticamente</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    # ── Enviar email ──────────────────────────────────────────
    ok = enviar_email(
        destinatario = usuario_actual.email,
        asunto       = f"📊 Reporte {etiqueta_periodo} — {nombre_negocio}",
        html         = html,
    )

    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo enviar el email")

    return {"ok": True, "mensaje": f"Reporte enviado a {usuario_actual.email}"}