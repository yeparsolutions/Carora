# =============================================================
#   CREAR_TAREA.ps1 - Proyecto Carora
#   Ejecutar como Administrador en PowerShell
#   Crea tarea programada que sincroniza cada 15 minutos
# =============================================================

# Ruta al script de Python
$scriptPath = "E:\Proyecto Carora\sincronizar_carora.py"

# Buscar pythonw.exe automaticamente en el sistema
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source

# Si no encuentra pythonw, usar python normal
if (-not $pythonw) {
    $pythonw = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
}

# Si tampoco encuentra python, detener
if (-not $pythonw) {
    Write-Host "[ERROR] No se encontro Python en el sistema." -ForegroundColor Red
    Write-Host "Instala Python desde https://www.python.org/" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[INFO] Python encontrado en: $pythonw" -ForegroundColor Cyan

# Definir la accion: ejecutar pythonw con el script
$accion = New-ScheduledTaskAction `
    -Execute $pythonw `
    -Argument "`"$scriptPath`""

# Definir el disparador: cada 15 minutos, indefinidamente
$disparador = New-ScheduledTaskTrigger `
    -RepetitionInterval (New-TimeSpan -Minutes 15) `
    -Once `
    -At (Get-Date)

# Configuracion de la tarea: maxima prioridad, corre aunque no haya sesion
$configuracion = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Registrar la tarea en el sistema
$nombre = "SincronizarCarora"

# Eliminar si ya existe
Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue

# Crear la tarea nueva
Register-ScheduledTask `
    -TaskName $nombre `
    -Action $accion `
    -Trigger $disparador `
    -Settings $configuracion `
    -RunLevel Highest `
    -Force

# Verificar que se creo correctamente
$tarea = Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue

if ($tarea) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  [OK] Tarea creada exitosamente." -ForegroundColor Green
    Write-Host "  Carora se sincronizara cada 15 minutos." -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Log de sincronizaciones en:" -ForegroundColor Cyan
    Write-Host "E:\Proyecto Carora\log_sincronizacion.txt" -ForegroundColor White
} else {
    Write-Host "[ERROR] No se pudo crear la tarea." -ForegroundColor Red
}
