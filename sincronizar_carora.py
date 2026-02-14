"""
=============================================================
  SCRIPT DE SINCRONIZACIÓN - PROYECTO CARORA
  Autor: YeparSolutions
  Descripción: Sincroniza automáticamente el proyecto Carora
               hacia GitHub (yeparsolutions/carora)
               El disco duro E:\Proyecto Carora actúa como
               repositorio git local que empuja a GitHub.
=============================================================
"""

import subprocess  # Para ejecutar comandos de git como si fuera la terminal
import os          # Para manejar rutas y verificar que existan carpetas
import sys         # Para salir del script si hay un error crítico
from datetime import datetime  # Para registrar la hora exacta de cada sincronización


# =============================================================
# CONFIGURACIÓN PRINCIPAL
# Aquí defines las rutas y datos del proyecto.
# Analogía: es como la "ficha de contacto" del mensajero —
# sabe adónde ir y qué llevar antes de salir.
# =============================================================

RUTA_PROYECTO = r"E:\Proyecto Carora"          # Carpeta local del proyecto en disco duro
REPO_GITHUB   = "https://github.com/yeparsolutions/carora"  # Destino remoto en GitHub
ARCHIVO_LOG   = os.path.join(RUTA_PROYECTO, "log_sincronizacion.txt")  # Registro de actividad


# =============================================================
# FUNCIÓN: registrar_log
# Escribe un mensaje con fecha y hora en el archivo de log.
# Analogía: como el sello de fecha que le pone el mensajero
# a cada entrega que hace.
# =============================================================

def registrar_log(mensaje: str, tipo: str = "INFO") -> None:
    """
    Guarda un mensaje en el archivo de log con timestamp.
    
    Args:
        mensaje (str): Texto a registrar.
        tipo (str): Tipo de mensaje — INFO, OK, ERROR, ADVERTENCIA.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linea = f"[{timestamp}] [{tipo}] {mensaje}\n"

    # Mostrar en consola también (útil si se ejecuta manualmente)
    print(linea.strip())

    # Guardar en archivo de log
    try:
        with open(ARCHIVO_LOG, "a", encoding="utf-8") as log:
            log.write(linea)
    except Exception as e:
        print(f"[ADVERTENCIA] No se pudo escribir en el log: {e}")


# =============================================================
# FUNCIÓN: ejecutar_comando_git
# Ejecuta un comando de git dentro de la carpeta del proyecto.
# Analogía: es el "paso individual" que da el mensajero —
# primero empaca, luego sella, luego entrega.
# =============================================================

def ejecutar_comando_git(comando: list) -> tuple:
    """
    Ejecuta un comando git en la carpeta del proyecto.

    Args:
        comando (list): Lista de partes del comando, e.g. ['git', 'add', '.']

    Returns:
        tuple: (éxito: bool, salida: str)
    """
    try:
        resultado = subprocess.run(
            comando,
            cwd=RUTA_PROYECTO,        # Se ejecuta dentro de la carpeta del proyecto
            capture_output=True,      # Captura lo que imprime el comando
            text=True,                # Devuelve texto en lugar de bytes
            encoding="utf-8"
        )

        # Si el comando tuvo código de salida 0 → todo bien
        if resultado.returncode == 0:
            return True, resultado.stdout.strip()
        else:
            return False, resultado.stderr.strip()

    except FileNotFoundError:
        # Git no está instalado o no está en el PATH del sistema
        return False, "ERROR: Git no está instalado o no se encontró en el sistema."
    except Exception as e:
        return False, f"ERROR inesperado: {str(e)}"


# =============================================================
# FUNCIÓN: verificar_entorno
# Comprueba que todo esté listo antes de sincronizar.
# Analogía: es la "revisión previa al vuelo" del piloto —
# antes de despegar, confirma que los motores estén bien.
# =============================================================

def verificar_entorno() -> bool:
    """
    Verifica que la carpeta del proyecto exista y sea un repo git.

    Returns:
        bool: True si todo está correcto, False si hay un problema.
    """
    # Verificar que la carpeta del proyecto existe
    if not os.path.isdir(RUTA_PROYECTO):
        registrar_log(f"La carpeta del proyecto no existe: {RUTA_PROYECTO}", "ERROR")
        return False

    # Verificar que sea un repositorio git (debe existir la carpeta .git)
    carpeta_git = os.path.join(RUTA_PROYECTO, ".git")
    if not os.path.isdir(carpeta_git):
        registrar_log("La carpeta no es un repositorio git. Falta la carpeta .git", "ERROR")
        registrar_log("Solución: ejecuta 'git init' y configura el remote.", "INFO")
        return False

    return True


# =============================================================
# FUNCIÓN: hay_cambios_pendientes
# Verifica si hay archivos modificados que necesiten sincronizarse.
# Analogía: es revisar si tienes cartas nuevas para enviar —
# si el buzón está vacío, no vale la pena ir al correo.
# =============================================================

def hay_cambios_pendientes() -> bool:
    """
    Usa 'git status' para detectar si hay cambios sin commitear.

    Returns:
        bool: True si hay cambios, False si todo está al día.
    """
    exito, salida = ejecutar_comando_git(["git", "status", "--porcelain"])

    if not exito:
        registrar_log(f"No se pudo verificar el estado del repositorio: {salida}", "ERROR")
        return False

    # --porcelain devuelve líneas solo si hay cambios; vacío = sin cambios
    return len(salida) > 0


# =============================================================
# FUNCIÓN: sincronizar
# Orquesta todo el proceso: add → commit → push
# Analogía: es el viaje completo del mensajero —
# empacar (add), sellar con fecha (commit), entregar (push).
# =============================================================

def sincronizar() -> None:
    """
    Ejecuta el ciclo completo de sincronización:
    git add → git commit → git push
    """
    registrar_log("=" * 50, "INFO")
    registrar_log("Iniciando sincronización de Proyecto Carora...", "INFO")

    # --- PASO 0: Verificar entorno ---
    if not verificar_entorno():
        registrar_log("Sincronización abortada. Revisa los errores anteriores.", "ERROR")
        sys.exit(1)

    # --- PASO 1: Verificar si hay cambios ---
    if not hay_cambios_pendientes():
        registrar_log("Sin cambios nuevos. El proyecto ya está sincronizado.", "INFO")
        registrar_log("=" * 50, "INFO")
        return  # No hay nada que hacer, salir limpiamente

    # --- PASO 2: git add . (agregar todos los cambios) ---
    registrar_log("Paso 1/3 → git add: agregando todos los cambios...", "INFO")
    exito, salida = ejecutar_comando_git(["git", "add", "."])

    if not exito:
        registrar_log(f"Error en git add: {salida}", "ERROR")
        sys.exit(1)

    registrar_log("git add completado correctamente.", "OK")

    # --- PASO 3: git commit (registrar los cambios con mensaje automático) ---
    timestamp_commit = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    mensaje_commit = f"Sincronización automática Carora — {timestamp_commit}"

    registrar_log(f"Paso 2/3 → git commit: '{mensaje_commit}'", "INFO")
    exito, salida = ejecutar_comando_git(["git", "commit", "-m", mensaje_commit])

    if not exito:
        # Si el error es "nothing to commit" no es realmente un error
        if "nothing to commit" in salida.lower():
            registrar_log("Nada que commitear (archivos sin cambios reales).", "INFO")
        else:
            registrar_log(f"Error en git commit: {salida}", "ERROR")
            sys.exit(1)
    else:
        registrar_log("git commit completado correctamente.", "OK")

    # --- PASO 4: git push (enviar a GitHub) ---
    registrar_log("Paso 3/3 → git push: enviando cambios a GitHub...", "INFO")
    exito, salida = ejecutar_comando_git(["git", "push", "origin", "main"])

    # Si falla con 'main', intentar con 'master' (por compatibilidad)
    if not exito and "main" in salida:
        registrar_log("Reintentando push con rama 'master'...", "ADVERTENCIA")
        exito, salida = ejecutar_comando_git(["git", "push", "origin", "master"])

    if not exito:
        registrar_log(f"Error en git push: {salida}", "ERROR")
        registrar_log("Verifica tu conexión a internet y credenciales de GitHub.", "INFO")
        sys.exit(1)

    registrar_log("git push completado. Cambios en GitHub ✓", "OK")
    registrar_log("✅ Sincronización completa — GitHub y Disco E actualizados.", "OK")
    registrar_log("=" * 50, "INFO")


# =============================================================
# PUNTO DE ENTRADA
# Cuando Windows ejecute este script automáticamente,
# empezará aquí — como la puerta principal de la oficina.
# =============================================================

if __name__ == "__main__":
    sincronizar()