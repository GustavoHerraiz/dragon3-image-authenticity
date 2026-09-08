# 📝 Historial de cambios - Dragon3

Todas las versiones notables del proyecto.

---

## [1.0.0] - 2026-06-25

### 🎉 Primera versión estable

#### ✅ Añadido

**Núcleo del sistema**
- Sistema de sellado forense con doble capa (Stardust + Vogel)
- Motor de inyección DCT en canal azul (Stardust)
- Motor geométrico de espiral en canal alfa (Vogel)
- Checksum Mentalista de 4 bits para validación de integridad

**Analizadores**
- **V6 (Rápido)**: Detección en < 2 segundos con filtro de score/pairs
- **V5 (Forense)**: Análisis exhaustivo con Deep Scan y multi-escala

**Generador de sellos**
- Inyección en píxeles (PNG con alfa)
- Inyección de metadatos con ExifTool (técnica del sándwich)
- Preservación de metadatos originales (EXIF, IPTC, XMP)

**Base de datos (SQLite)**
- Tablas: `proyectos`, `sellos`, `licencia`, `configuracion`
- Unificada en `~/.dragon3/dragon3.db`
- Métodos CRUD completos

**Interfaz de usuario (Electron)**
- Explorador de carpetas con árbol de sellados
- Gestión de proyectos (crear, seleccionar, eliminar)
- Sellado individual y por lotes
- Análisis rápido (V6) y forense (V5)
- Edición de metadatos sin re-sellar
- Generación de informes PDF
- Configuración de perfil y preferencias

**Automatización (Watcher)**
- Vigilancia recursiva de carpetas con `chokidar`
- Sellado automático en modo silencioso
- Modo manual con notificaciones nativas

**Licencias**
- Modo Demo (100 sellos gratuitos)
- Activación Premium con email + clave
- Control de límite de sellos

**Documentación**
- Manual de usuario completo
- Guía de instalación (Windows, macOS, Linux)
- Manual técnico para desarrolladores
- API de comunicación IPC
- Guía forense (fundamentos técnicos)

**Pruebas y diagnósticos**
- Script de diagnóstico completo (`diagnostic_v6.js`)
- Verificación de metadatos (`ver_metadatos.js`)
- Comparación generador vs analizador

---

#### 🔧 Corregido

**Base de datos**
- `buscarPorHash()` ahora busca en `proyectos` Y `sellos`
- Solución: El V6 ahora valida contra la DB correcta

**Metadatos**
- ExifTool ahora usa la ruta correcta en desarrollo y producción
- Preservación de metadatos originales al convertir JPG → PNG
- Lectura de metadatos con ExifTool en lugar de Sharp (para PNG)

**Analizadores**
- V6 ahora extrae hash del canal azul antes de buscar Vogel
- V6 usa `match.id` (sin prefijo) para Vogel, igual que el generador
- V5 ahora usa `db.buscarPorHash()` en lugar de `BASE_DE_DATOS_SELLOS`

**Generador**
- `inyectarGeometria()` ahora usa `hashLimpio` (sin prefijo) para Vogel
- ExifTool: filtrado de campos no escribibles (FileSize, FileType, etc.)

**Interfaz**
- Edición de metadatos implementada con modal dinámico
- Botón 📝 visible para imágenes selladas
- Recarga del explorador después de actualizar metadatos

**Estilos**
- Ajuste de márgenes y anchos (sin scroll horizontal)
- Responsive para pantallas pequeñas
- Mejora de legibilidad en paneles y formularios

---

#### 🗑️ Eliminado

- Dependencia de `BASE_DE_DATOS_SELLOS.js` (array en memoria)
  - Reemplazado por SQLite en `~/.dragon3/dragon3.db`
  - Eliminado `base_datos_sellos.js` del proyecto

---

#### 📝 Cambios técnicos

- `database.js` ahora usa ruta fija `~/.dragon3/dragon3.db`
- `main.js` ya no crea DB en AppData
- `actualizarMetadatos.js` (nuevo) para edición sin re-sellar
- `modalMetadatos.html` (nuevo) para formulario de edición
- `renderer.js` añade funciones `abrirEditorMetadatos()` y `window.electronEditarMetadatos()`

---

## [0.9.0] - 2026-06-20 (Pre-release)

### 🔬 Beta

- Primeras pruebas del sistema de sellado
- Analizador V5 funcional
- Base de datos con SQLite (local)
- Interfaz básica con Electron
- Watcher automático (versión inicial)

### Problemas conocidos
- Metadatos no se preservaban al convertir JPG → PNG
- V6 no detectaba sellos (problema de DB y prefijo)
- ExifTool no encontraba la ruta correcta en desarrollo

---

## [0.5.0] - 2026-06-10 (Alpha)

### 🧪 Desarrollo inicial

- Motor DCT (Stardust) funcional
- Motor Vogel (espiral) funcional
- Generador de sellos básico
- Base de datos con `base_datos_sellos.js` (array en memoria)
- Analizador V5 con `BASE_DE_DATOS_SELLOS`

### Problemas conocidos
- No persistencia de sellos entre reinicios
- Metadatos no inyectados
- Interfaz sin explorador de carpetas

---

## [0.1.0] - 2026-06-01 (Prototipo)

### 🧠 Concepto inicial

- Pruebas de concepto de DCT en canal azul
- Pruebas de concepto de espiral de Vogel
- Primer prototipo de inyección en PNG

---

## 📊 Resumen de versiones

| Versión | Fecha | Estado | Descripción |
|---------|-------|--------|-------------|
| **1.0.0** | 2026-06-25 | ✅ Estable | Primera versión completa |
| 0.9.0 | 2026-06-20 | ⚠️ Beta | Pre-release con problemas menores |
| 0.5.0 | 2026-06-10 | 🧪 Alpha | Desarrollo inicial |
| 0.1.0 | 2026-06-01 | 🔬 Prototipo | Pruebas de concepto |

---

**🐉 Dragon3 - Protege tu obra, protege tu legado.**