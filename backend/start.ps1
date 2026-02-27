# ============================================================
# YEPARSTOCK — Script de arranque del backend
# Archivo: backend/start.ps1
# Uso: .\start.ps1
# Analogia: el boton de encendido del auto — un solo clic
#           y todo arranca con la configuracion correcta
# ============================================================

# Variables de entorno — nunca hardcodeadas en el codigo
$env:DATABASE_URL        = "postgresql://postgres:Yepar2026@localhost:5433/carora"
$env:SECRET_KEY          = "1373624a3c3229c308c5a1fcdcd31f6f154351aa75d65e4cf9ed91c2a3320fd2"
$env:ALGORITHM           = "HS256"
$env:ACCESS_TOKEN_MINUTES = "60"
$env:ALLOWED_ORIGINS     = ""
$env:ENVIRONMENT         = "development"

Write-Host ""
Write-Host "  YEPARSTOCK Backend" -ForegroundColor Green
Write-Host "  ==================" -ForegroundColor Green
Write-Host "  DB:   $env:DATABASE_URL" -ForegroundColor Cyan
Write-Host "  ENV:  $env:ENVIRONMENT" -ForegroundColor Cyan
Write-Host "  JWT:  $env:ACCESS_TOKEN_MINUTES minutos" -ForegroundColor Cyan
Write-Host ""

uvicorn main:app --reload