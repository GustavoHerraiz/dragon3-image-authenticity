
markdown
# 🛠️ Manual Técnico de Dragon3 V1.0

**Documentación para desarrolladores y técnicos.**

---

## 📋 Índice

1. [Arquitectura general](#arquitectura-general)
2. [Estructura de directorios](#estructura-de-directorios)
3. [Base de datos](#base-de-datos)
4. [Módulo Generador](#módulo-generador)
5. [Módulo Analizador V5](#módulo-analizador-v5)
6. [Módulo Analizador V6](#módulo-analizador-v6)
7. [MotorEspacial (Vogel)](#motorespacial-vogel)
8. [ExifTool y metadatos](#exiftool-y-metadatos)
9. [Watcher y automatización](#watcher-y-automatización)
10. [IPC y comunicación](#ipc-y-comunicación)
11. [Licencias](#licencias)
12. [Flujo de datos completo](#flujo-de-datos-completo)
13. [Variables de entorno](#variables-de-entorno)

---

## 🏗️ Arquitectura general

Dragon3 es una aplicación de escritorio construida con **Electron** que combina:

- **Backend**: Node.js con módulos nativos (Sharp, SQLite, ExifTool).
- **Frontend**: HTML/CSS/JavaScript con comunicación IPC.
- **Base de datos**: SQLite (local, sin servidor).

### Diagrama de capas
┌─────────────────────────────────────────────────────────────┐
│ INTERFAZ DE USUARIO │
│ (Electron + HTML/CSS/JS) │
├─────────────────────────────────────────────────────────────┤
│ IPC (Comunicación) │
├─────────────────────────────────────────────────────────────┤
│ MAIN.JS │
│ (Gestión de ventanas, watcher, handlers IPC) │
├─────────────────────────────────────────────────────────────┤
│ MÓDULOS BACKEND │
├───────────────┬───────────────┬─────────────────────────────┤
│ Generador │ Analizador │ Base de Datos │
│ MBH │ V5 / V6 │ (SQLite) │
├───────────────┼───────────────┼─────────────────────────────┤
│ MotorEspacial│ ExifTool │ LicenseManager │
└───────────────┴───────────────┴─────────────────────────────┘

text

---

## 📁 Estructura de directorios
dragon3-desktop/
├── src/
│ └── backend/
│ ├── analizador_v5.js
│ ├── analizador_v6.js
│ ├── database.js
│ ├── generadorMBH.js
│ ├── license.js
│ ├── MotorEspacial.js
│ ├── reportePDF.js
│ ├── telemetry.js
│ ├── actualizarMetadatos.js
│ └── matematicas/
│ └── MotorEspacial.js
├── renderer/
│ ├── index.html
│ ├── renderer.js
│ ├── styles.css
│ ├── modalMetadatos.html
│ └── configWindow.html
├── resources/
│ └── exiftool/
│ └── exiftool-13.59_64/
│ └── exiftool_win.exe
├── docs/
│ ├── README.md
│ ├── INSTALACION.md
│ ├── MANUAL_USUARIO.md
│ ├── MANUAL_TECNICO.md
│ ├── API.md
│ ├── CHANGELOG.md
│ ├── LICENCIA.md
│ └── guias/
│ ├── guia_venta.md
│ ├── guia_forense.md
│ └── guia_solucion_problemas.md
├── main.js
├── menu.js
├── package.json
├── prueba.jpg
└── dragon3.db

text

---

## 🗄️ Base de datos

**Ubicación:** `~/.dragon3/dragon3.db`  
**Motor:** SQLite 3  
**ORM:** sqlite3 + sqlite (wrapper)

### Tablas

#### `proyectos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK, autoincrement |
| `id_numerico` | INTEGER | UNIQUE |
| `hash_suffix` | TEXT | UNIQUE, 7 dígitos hex |
| `cliente` | TEXT | Nombre del cliente |
| `obra` | TEXT | Título de la obra |
| `fecha_creacion` | DATETIME | ISO timestamp |
| `proyecto_nombre` | TEXT | Nombre de la carpeta |
| `coleccion` | TEXT | Opcional |
| `derechos` | TEXT | Derechos de autor |
| `email_contacto` | TEXT | Email |
| `compartir_blade` | INTEGER | 0/1 |
| `descripcion` | TEXT | Descripción del proyecto |

#### `sellos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK, autoincrement |
| `id_numerico` | INTEGER | UNIQUE |
| `hash_suffix` | TEXT | UNIQUE, 7 dígitos hex |
| `proyecto_id` | INTEGER | FK → proyectos.id |
| `cliente` | TEXT | Nombre del cliente |
| `obra` | TEXT | Título de la obra |
| `coleccion` | TEXT | Opcional |
| `derechos` | TEXT | Derechos de autor |
| `email_contacto` | TEXT | Email |
| `compartir_blade` | INTEGER | 0/1 |
| `fecha_creacion` | DATETIME | ISO timestamp |

#### `licencia`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `rowid` | INTEGER | PK, debe ser 1 |
| `activa` | INTEGER | 0/1 |
| `tipo` | TEXT | 'gratuita' / 'premium' |
| `email` | TEXT | Email de la licencia |
| `clave` | TEXT | Clave de activación |
| `fecha_activacion` | DATETIME | ISO timestamp |
| `prefijo_usuario` | TEXT | 3-4 letras |
| `contador_global` | INTEGER | Próximo ID numérico |
| `sellos_usados` | INTEGER | Sellos consumidos |
| `fecha_expiracion` | DATETIME | ISO timestamp |
| `servidor_verificado` | INTEGER | 0/1 |

#### `configuracion`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK, debe ser 1 |
| `prefijo_usuario` | TEXT | 3-4 letras |
| `email_usuario` | TEXT | Email del fotógrafo |
| `nombre_autor` | TEXT | Nombre del estudio |
| `web_autor` | TEXT | URL |
| `telefono_autor` | TEXT | Teléfono |
| `logo_path` | TEXT | Ruta del logo |
| `ruta_proyectos` | TEXT | Carpeta raíz |
| `derechos_por_defecto` | TEXT | Texto por defecto |
| `modo_automatico` | INTEGER | 0/1 |
| `activar_watcher` | INTEGER | 0/1 |
| ... | ... | (otros campos) |

---

## 🧬 Módulo Generador

**Archivo:** `generadorMBH.js`  
**Clase:** `GeneradorMBH`

### Flujo de sellado

1. **Comprobar límite de licencia** (`licenseManager.comprobarLimite()`)
2. **Obtener prefijo y siguiente ID** (desde DB)
3. **Construir ID completo:** `{prefijo}_{idHex}`
4. **Extraer metadatos originales** (con Sharp y ExifTool)
5. **Preparar píxeles** (conversión a RGBA)
6. **Calcular checksum** (`calcularChecksumMentalista()`)
7. **Inyectar Stardust** (`inyectarStardust32()`)
8. **Limpiar canal alfa** (LSB = 0)
9. **Inyectar Vogel** (`inyectarGeometria()`)
10. **Guardar en DB** (`registrarSello()`)
11. **Escribir imagen PNG** (Sharp)
12. **Inyectar metadatos** (ExifTool, técnica del sándwich)

### Métodos clave

| Método | Descripción |
|--------|-------------|
| `sellarImagen(rutaEntrada, rutaSalida, metadatosCliente)` | Principal |
| `inyectarStardust32(buffer, width, height, payload32)` | Inyección DCT |
| `inyectarGeometria(buffer, width, height, idCompleto)` | Inyección Vogel |
| `calcularChecksumMentalista(id28)` | Cálculo de 4 bits |
| `dct8x8(block)` | DCT de 8x8 |
| `idct8x8(dct)` | DCT inversa |

---

## 🔍 Módulo Analizador V5

**Archivo:** `analizador_v5.js`  
**Clase:** `MotorForense`  
**Función principal:** `analizarImagenMBH(ruta, db, timeoutMs)`

### Flujo de análisis (V5)

1. **Leer metadatos** (para validación)
2. **Convertir a buffer RGBA** (Sharp)
3. **Búsqueda principal:** escalas y rotaciones
4. **Deep Scan:** offsets (0-7)
5. **Validar hash** (`validar(bits, db)`)
6. **Verificar Vogel** (`verificarVogel()`)
7. **Devolver veredicto**

### Métodos clave

| Método | Descripción |
|--------|-------------|
| `extraer(data, info, offX, offY)` | Extrae 32 bits |
| `validar(bits, db)` | Valida checksum y DB |
| `dct8x8(block)` | DCT de 8x8 |

---

## ⚡ Módulo Analizador V6

**Archivo:** `analizador_v6.js`  
**Clase:** `MotorForenseV6`  
**Función principal:** `analizarImagenRapido(ruta, db, timeoutMs, fallbackAV5)`

### Flujo de análisis (V6)

1. **Fase 1: Escala original (1.0)** - sin filtros
2. **Fase 2: Deep scan en escala original**
3. **Fase 3: Otras escalas y rotaciones**
4. **Fase 4: Deep scan en otras escalas**
5. **Verificar Vogel** con `match.id` (sin prefijo)

### Diferencias V5 vs V6

| Característica | V5 (Forense) | V6 (Rápido) |
|----------------|--------------|-------------|
| Velocidad | ~30-60s | < 2s |
| Escalas | 8 | 8 |
| Rotaciones | 0,90,180,270 | 0,90,180,270 |
| Filtro score/pairs | ❌ | ✅ (fase rápida) |
| Deep scan | ✅ (8x8) | ✅ (8x8) |
| Fallback a V5 | ❌ | ✅ |

---

## 🌀 MotorEspacial (Vogel)

**Archivo:** `MotorEspacial.js`  
**Clase:** `MotorEspacial`

### Métodos clave

| Método | Descripción |
|--------|-------------|
| `calcularCentroUnico(width, height, idCompleto, privateKey)` | Calcula el centro de la espiral |
| `obtenerPuntosEspiral(width, height, centro)` | Genera los puntos de Vogel |

### Algoritmo de Vogel

1. **Derivar semilla** del `idCompleto` + `privateKey` (hash SHA-256)
2. **Calcular centro** (x, y) a partir de la semilla
3. **Generar espiral** con 68-74 puntos
4. **Mapear puntos** a coordenadas de la imagen

### Uso en generador

```javascript
const centro = MotorEspacial.calcularCentroUnico(
    width, 
    height, 
    hashLimpio,  // SIN prefijo
    CONFIG.PRIVATE_KEY
);
const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);
Uso en analizador
javascript
const centro = MotorEspacial.calcularCentroUnico(
    info.width, 
    info.height, 
    idHex,  // SIN prefijo (match.id)
    CONFIG.PRIVATE_KEY
);
📝 ExifTool y metadatos
Inyección (técnica del sándwich)
Leer metadatos originales con ExifTool (JSON)

Filtrar campos escribibles (Make, Model, ISO, etc.)

Añadir metadatos del sello (ImageDescription, Artist, Copyright, etc.)

Reinyectar todos con ExifTool

Campos inyectados
Campo	Valor
ImageDescription	DRAGON3_ID:{idCompleto} | {obra} - {cliente}
Copyright	Protected by Dragon3 - {derechos}
Artist	{cliente}
XMP:Rights	Protected by Dragon3
XMP:Creator	{cliente}
XMP:Description	DRAGON3_ID:{idCompleto} | {obra}
XMP:Title	{obra}
XMP:Source	Dragon3 Verificado
Software	Dragon3 V22 Mentalist Core
Lectura en analizador
Antes (Sharp): No leía XMP en PNG.
Ahora (ExifTool): Lee todos los metadatos en cualquier formato.

🤖 Watcher y automatización
Archivo: main.js (función iniciarWatcher())

Configuración
Librería: chokidar

Modo: Recursivo

Filtro: Imágenes (jpg, jpeg, png, tiff, bmp)

Ignora: Archivos ya sellados, carpeta Originales

Comportamiento
Detección de archivo → evento add

Verificar si es imagen → extensión

Obtener prefijo → desde DB

Ignorar si ya tiene el formato _{prefijo}_[0-9A-F]{7}.png

Obtener configuración → modo_automatico

Modo automático: sellar sin preguntar

Modo manual: mostrar notificación y esperar

Código clave
javascript
watcher.on('add', async (filePath) => {
    const config = await db.obtenerConfiguracion();
    const modoAutomatico = Number(config.modo_automatico) || 1;
    
    if (modoAutomatico === 1) {
        await generador.sellarImagen(filePath, null, metadatos);
    } else {
        // Mostrar notificación
    }
});
📡 IPC y comunicación
Handlers principales
Handler	Descripción
get-proyectos	Obtener todos los proyectos
crear-proyecto	Crear nuevo proyecto
sellar-imagen	Sellado individual
sellar-lote	Sellado por lotes
analizar-imagen	Análisis (V5 o V6)
actualizar-metadatos	Editar metadatos sin re-sellar
leer-metadatos-imagen	Leer metadatos con ExifTool
obtener-sello-por-hash	Obtener sello desde DB
actualizar-perfil	Guardar configuración
Eventos (frontend → backend)
Evento	Descripción
imagen-detectada	Watcher detecta imagen
progreso-sellado	Progreso de lote
recargar-arbol	Recargar explorador
actualizar-licencia	Actualizar estado de licencia
notificacion-nativa	Notificación del sistema
🔐 Licencias
Archivo: license.js
Clase: LicenseManager

Modos
Modo	Límite	Características
Demo	100 sellos	Gratuito
Premium	Ilimitado	Activación por email + clave
Métodos clave
Método	Descripción
comprobarLimite()	Verifica si se puede sellar
incrementarSellosUsados()	Incrementa contador
activarPremium(clave, email)	Activa licencia Premium
obtenerEstado()	Estado actual de la licencia
Validación de clave
Calcular hash de email + salt + fecha

Comparar con la clave introducida

Actualizar la tabla licencia

🔄 Flujo de datos completo
Sellado
text
Usuario selecciona imagen
    ↓
renderer.js → ipcRenderer.invoke('sellar-imagen')
    ↓
main.js → generador.sellarImagen()
    ↓
1. Inyecta Stardust (DCT en azul)
2. Inyecta Vogel (espiral en alfa)
3. Registra en DB (sellos)
4. Escribe PNG
5. Inyecta metadatos (ExifTool)
    ↓
Devuelve resultado a frontend
    ↓
Se muestra en interfaz
Análisis
text
Usuario selecciona imagen
    ↓
renderer.js → ipcRenderer.invoke('analizar-imagen')
    ↓
main.js → analizarImagenRapido() o analizarImagenMBH()
    ↓
1. Lee metadatos (ExifTool)
2. Extrae bits del canal azul (DCT)
3. Valida checksum
4. Busca en DB
5. Verifica Vogel (si es PNG)
    ↓
Devuelve veredicto a frontend
    ↓
Se muestra en interfaz
Edición de metadatos
text
Usuario hace clic en 📝
    ↓
renderer.js → abrirEditorMetadatos()
    ↓
→ ipcRenderer.invoke('obtener-sello-por-hash')
→ ipcRenderer.invoke('leer-metadatos-imagen')
    ↓
Modal con datos actuales
    ↓
Usuario modifica y guarda
    ↓
→ ipcRenderer.invoke('actualizar-metadatos')
    ↓
main.js → actualizarMetadatos()
    ↓
1. ExifTool reescribe metadatos
2. DB actualiza sellos
    ↓
Refrescar explorador
🌐 Variables de entorno
Variable	Descripción	Valor por defecto
DRAGON3_DB_PATH	Ruta de la base de datos	~/.dragon3/dragon3.db
DRAGON3_PROJECTS_PATH	Carpeta raíz de proyectos	~/.dragon3/Dragon3_Projects
DRAGON3_PRIVATE_KEY	Clave privada para Vogel	DRAGON3_SECRET_KEY
DRAGON3_DEBUG	Modo depuración	false
🐉 Dragon3 - Protege tu obra, protege tu legado.