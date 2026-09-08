# 📖 Manual de Usuario - Dragon3 V1.0

**Sistema de marca de agua forense para fotógrafos profesionales.**

---

## 📋 Índice

1. [Introducción](#introducción)
2. [Primer arranque](#primer-arranque)
3. [Interfaz principal](#interfaz-principal)
4. [Gestión de proyectos](#gestión-de-proyectos)
5. [Sellar imágenes](#sellar-imágenes)
6. [Analizar imágenes](#analizar-imágenes)
7. [Editar metadatos](#editar-metadatos)
8. [Watcher automático](#watcher-automático)
9. [Licencias y Premium](#licencias-y-premium)
10. [Informes PDF](#informes-pdf)
11. [Solución de problemas](#solución-de-problemas)

---

## 📌 Introducción

Dragon3 es un sistema de **sellado forense** diseñado para proteger tu trabajo fotográfico. 
El sello es **invisible** y se integra en los píxeles de la imagen, resistiendo a:

- ✅ Redimensionados
- ✅ Recortes
- ✅ Compresión
- ✅ Conversiones de formato
- ✅ Rotaciones

Además, Dragon3 preserva los **metadatos originales** (EXIF, IPTC, XMP) y añade metadatos forenses que permiten identificar al autor y la obra.

---

## 🚀 Primer arranque

Al abrir Dragon3 por primera vez, se te pedirá:

### 1. Seleccionar la carpeta raíz de proyectos

Esta carpeta será vigilada automáticamente. Cada subcarpeta dentro de ella representará un **proyecto**.

**Ejemplo:**

📁 MisProyectos/ ← Carpeta raíz (configurada aquí)
📁 Boda_Ana/ ← Proyecto 1
📄 imagen1.jpg
📄 imagen2.jpg
📁 Retrato_Pedro/ ← Proyecto 2
📄 retrato1.jpg


### 2. Completar tu perfil

- **Nombre del fotógrafo o estudio**: Aparecerá en los metadatos y en los informes.
- **Email de contacto**: Para asociarlo a las licencias.
- **Web, teléfono, dirección, redes sociales**: Información que aparecerá en los informes PDF.
- **Logo**: Imagen que se incluirá en los informes.

### 3. Elegir un prefijo

El prefijo es un código de **3-4 letras** que identifica tus sellos.

**Ejemplos:** `GHL` (Gustavo Herraiz), `BLD` (Blade), `STU` (Estudio).

Los sellos tendrán este formato: `GHL_000001F.png`

---

## 🖥️ Interfaz principal

La interfaz se divide en tres áreas principales:

### 1. Explorador de carpetas (izquierda)

Muestra un **árbol de carpetas** con todas las imágenes selladas.
- Haz clic en una carpeta para ver su contenido.
- Haz clic en una imagen sellada para cargarla en el panel de sellado.

### 2. Contenido principal (derecha)

- **Proyecto Activo**: Selecciona o crea un proyecto.
- **Sellar imagen**: Sube y sella una imagen.
- **Analizar imagen**: Verifica la autenticidad de una imagen sellada.

### 3. Logs (abajo)

Muestra el historial de acciones y errores.

---

## 📁 Gestión de proyectos

### Crear un proyecto

1. En el panel **"Proyecto Activo"**, haz clic en **"➕ Nuevo"**.
2. Escribe el nombre del proyecto (se creará una carpeta con ese nombre).
3. Opcionalmente, añade una descripción.
4. Haz clic en **"Crear proyecto"**.

### Seleccionar un proyecto

1. Despliega el selector de proyectos.
2. Selecciona el proyecto deseado.
3. Se mostrarán las imágenes selladas en la carpeta del proyecto.

### Eliminar un proyecto

1. Selecciona el proyecto.
2. Haz clic en **"🗑️ Eliminar carpeta del proyecto"**.
3. Confirma la eliminación.

**⚠️ Atención:** Se eliminarán **todos** los archivos de la carpeta del proyecto.

---

## 🖼️ Sellar imágenes

### Sellado individual

1. En el panel **"Sellar imagen"**, haz clic en **"Seleccionar imagen"**.
2. Elige un archivo de imagen (JPG, PNG, TIFF, BMP).
3. Rellena los campos obligatorios:
   - **Cliente** (obligatorio)
   - **Obra** (obligatorio)
4. Opcionalmente, rellena:
   - **Colección**
   - **Derechos**
   - **Email de contacto**
   - **Compartir con Blade Network**
5. Selecciona la **carpeta dentro del proyecto** (opcional).
6. Haz clic en **"🔒 Ejecutar sellado"**.

**El archivo sellado se guardará en la carpeta del proyecto con el formato:** `nombre_GHL_000001F.png`

---

### Sellado por lotes

1. Haz clic en **"📦 Sellar por lotes"**.
2. Selecciona **múltiples imágenes** manteniendo presionada la tecla `Ctrl`.
3. Rellena los metadatos comunes (cliente, obra, etc.).
4. Haz clic en **"📦 Ejecutar lote"**.

**Todas las imágenes se sellarán con los mismos metadatos.**

---

## 🔍 Analizar imágenes

1. En el panel **"Analizar imagen"**, haz clic en **"Seleccionar imagen"**.
2. Elige una imagen sellada.
3. Selecciona el modo de análisis:
   - **Rápido (V6)**: Detección en < 2 segundos.
   - **Forense (V5)**: Análisis exhaustivo (más lento pero más preciso).
4. Haz clic en **"🔬 Analizar"**.

### Resultado del análisis

Si la imagen es auténtica, verás:

✅ Identificado
ID: 000001F
Cliente: Ayuntamiento Mataro
Obra: Casa Coll i Regas
Veredicto: Original de Ayuntamiento Mataro - "Casa Coll i Regas" 🏆
Integridad legal: ✅ Metadatos íntegros


Si la imagen no está sellada o ha sido manipulada:

❌ No identificado
Veredicto: Archivo sin sello / No identificado


---

## ✏️ Editar metadatos

Puedes modificar los metadatos de una imagen ya sellada **sin necesidad de volver a sellarla**.

1. En la lista de archivos, busca el botón **📝** junto a la imagen.
2. Haz clic en él para abrir el editor.
3. Modifica los campos que desees (cliente, obra, derechos, etc.).
4. Haz clic en **"💾 Guardar cambios"**.

**El análisis posterior mostrará los nuevos metadatos.**

---

## 🤖 Watcher automático

Dragon3 puede vigilar tu carpeta de proyectos y sellar automáticamente las imágenes que añadas.

### Configuración

1. Ve a **Configuración** (⚙️).
2. En la sección **"Automatización"**:
   - Marca **"Activar vigilancia automática"**.
   - Selecciona el **modo de sellado automático**:
     - **Automático**: Sella sin intervención.
     - **Preguntar**: Abre la interfaz para confirmar.

### Cómo funciona

1. Coloca una imagen en cualquier subcarpeta de tu carpeta raíz.
2. Dragon3 detectará la imagen y la sellará automáticamente.
3. La versión sellada se guardará junto al original.

**El watcher es recursivo** - vigila todas las subcarpetas.

---

## 🔐 Licencias y Premium

Dragon3 incluye un modo **Demo** con 100 sellos gratuitos.

### Activar Premium

1. Haz clic en **"🔓 Activar Premium"**.
2. Introduce tu **email** y **clave de activación**.
3. Haz clic en **"✅ Activar"**.

### Beneficios Premium

- ✅ Sellos ilimitados.
- ✅ Soporte prioritario.
- ✅ Actualizaciones automáticas.
- ✅ Acceso a nuevas funcionalidades.

---

## 📄 Informes PDF

Puedes generar un informe en PDF de cada proyecto.

1. Selecciona un proyecto.
2. Haz clic en **"📄 Generar informe PDF"**.
3. Elige la ubicación y nombre del archivo.
4. El informe incluirá:
   - Datos del fotógrafo (nombre, email, web, logo).
   - Listado de imágenes selladas.
   - Resumen de sellos (total, fechas, etc.).

---

## 🔧 Solución de problemas

### ❌ El sello no se detecta

- Asegúrate de que la imagen fue sellada con Dragon3.
- Prueba con el modo **Forense (V5)**.
- Verifica que la imagen no está excesivamente comprimida.

### ❌ ExifTool no funciona

- En el menú de configuración, verifica que ExifTool está instalado.
- En desarrollo, comprueba la ruta en `generadorMBH.js`.

### ❌ El watcher no detecta imágenes

- Verifica que la carpeta raíz está configurada.
- Asegúrate de que el modo automático está activado.
- Comprueba los logs para ver mensajes de error.

### ❌ La base de datos no se abre

- Verifica que la carpeta `~/.dragon3/` existe.
- En Windows, asegúrate de que el antivirus no bloquea el archivo `.db`.

---

## 📞 Soporte

Si necesitas ayuda:

- **Email**: soporte@dragon3.com
- **Web**: www.dragon3.com
- **GitHub**: https://github.com/tuusuario/dragon3

---

**🐉 Dragon3 - Protege tu obra, protege tu legado.**

