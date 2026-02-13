# 📦 Stockya — Frontend MVP

Control de stock simple para mini markets y bodeguitas.

---

## 📁 Estructura del proyecto

```
stockya/
├── index.html          ← Archivo principal (abrir en el navegador)
├── css/
│   └── styles.css      ← TODOS los estilos visuales
├── js/
│   └── app.js          ← Lógica de navegación e interacción
└── README.md           ← Este archivo
```

---

## 🚀 Cómo abrir el proyecto

1. Descarga la carpeta completa
2. Abre `index.html` directamente en tu navegador
3. No necesitas instalar nada

---

## ✏️ Qué puedes editar fácilmente

### Cambiar colores (en css/styles.css, línea 10)
```css
:root {
  --verde:    #00C77B;   /* Color principal */
  --rojo:     #FF4C4C;   /* Alertas críticas */
  --amarillo: #FFB800;   /* Alertas medias */
  --bg:       #0D0F14;   /* Fondo oscuro */
}
```

### Cambiar el nombre del negocio (en index.html)
Busca `Minimarket El Rincón` y reemplázalo.

### Cambiar el nombre del usuario (en index.html)
Busca `Juan Rodríguez` y reemplázalo.

### Agregar productos a la tabla (en index.html, pantalla Productos)
Copia un bloque `<tr>...</tr>` dentro del `<tbody>` y edita los valores.

---

## 🗂️ Pantallas disponibles

| Pantalla       | Descripción                              |
|----------------|------------------------------------------|
| Login          | Entrada a la app                         |
| Dashboard      | Resumen general con alertas rápidas      |
| Productos      | Lista completa con estado de stock       |
| Movimientos    | Historial de entradas y salidas          |
| Alertas        | Centro de alertas críticas y medias      |
| Reportes       | Gráficos y top productos                 |

---

## 🔮 Próximos pasos (backend real)

Este es el frontend estático (solo visual).
Para que los datos se guarden de verdad necesitarás:

- **Backend:** Python + FastAPI
- **Base de datos:** PostgreSQL (nube: Supabase o Railway)
- **Hosting frontend:** Vercel o Netlify (gratis)

---

## 📞 Preguntas

Producto desarrollado en el ecosistema **Yepar Solutions**.
