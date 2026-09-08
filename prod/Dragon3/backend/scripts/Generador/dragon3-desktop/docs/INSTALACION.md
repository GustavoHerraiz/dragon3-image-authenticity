# 🔧 Guía de Instalación de Dragon3

**Sistema de marca de agua forense para fotógrafos profesionales.**

---

## 📋 Índice

1. [Requisitos del sistema](#requisitos-del-sistema)
2. [Instalación desde el ejecutable (Windows)](#instalación-desde-el-ejecutable-windows)
3. [Instalación en macOS](#instalación-en-macos)
4. [Instalación en Linux](#instalación-en-linux)
5. [Instalación desde el código fuente](#instalación-desde-el-código-fuente)
6. [Configuración inicial](#configuración-inicial)
7. [Estructura de archivos](#estructura-de-archivos)
8. [Actualización](#actualización)
9. [Desinstalación](#desinstalación)
10. [Solución de problemas](#solución-de-problemas)

---

## 💻 Requisitos del sistema

### Requisitos mínimos

| Componente | Requisito |
|------------|-----------|
| **Sistema operativo** | Windows 10/11, macOS 11+, Linux (Ubuntu 20.04+) |
| **RAM** | 4 GB |
| **Almacenamiento** | 500 MB (más espacio para imágenes) |
| **Procesador** | Intel Core i3 o equivalente |

### Requisitos recomendados

| Componente | Requisito |
|------------|-----------|
| **Sistema operativo** | Windows 11, macOS 13+, Linux (Ubuntu 22.04+) |
| **RAM** | 8 GB o más |
| **Almacenamiento** | SSD con al menos 10 GB libres |
| **Procesador** | Intel Core i5 o superior |

---

## 🪟 Instalación desde el ejecutable (Windows)

### Paso 1: Descargar el instalador

1. Ve al portal de descargas: [www.dragon3.com/download](https://www.dragon3.com/download)
2. Descarga `Dragon3-Setup.exe` (versión más reciente).

### Paso 2: Ejecutar el instalador

1. Haz doble clic en `Dragon3-Setup.exe`.
2. Si Windows te pregunta *"¿Quieres permitir que esta aplicación realice cambios en tu dispositivo?"*, haz clic en **"Sí"**.

### Paso 3: Seguir el asistente de instalación

1. **Bienvenida**: Haz clic en "Siguiente".
2. **Acuerdo de licencia**: Lee y acepta los términos.
3. **Carpeta de instalación**: Elige la ubicación (por defecto: `C:\Program Files\Dragon3`).
4. **Accesos directos**: Marca "Crear acceso directo en el escritorio".
5. **Instalar**: Haz clic en "Instalar".
6. **Finalizar**: Haz clic en "Finalizar".

### Paso 4: Ejecutar Dragon3

1. Haz doble clic en el acceso directo del escritorio.
2. La primera vez, se abrirá la ventana de configuración inicial.

---

## 🍎 Instalación en macOS

### Paso 1: Descargar el archivo DMG

1. Ve al portal de descargas: [www.dragon3.com/download](https://www.dragon3.com/download)
2. Descarga `Dragon3.dmg`.

### Paso 2: Montar el DMG

1. Haz doble clic en el archivo `.dmg` descargado.
2. Se abrirá una ventana con el icono de Dragon3.

### Paso 3: Instalar en Applications

1. Arrastra el icono de Dragon3 a la carpeta `Applications`.
2. Si macOS te pide confirmación, haz clic en "Autorizar".

### Paso 4: Ejecutar Dragon3

1. Abre la carpeta `Applications`.
2. Haz doble clic en Dragon3.
3. Si macOS te advierte que *"no se puede verificar el desarrollador"*, sigue estos pasos:
   - Ve a `Configuración del Sistema` > `Privacidad y Seguridad`.
   - Busca el mensaje sobre Dragon3 y haz clic en **"Abrir de todos modos"**.

---

## 🐧 Instalación en Linux

### Paso 1: Descargar el AppImage

1. Ve al portal de descargas: [www.dragon3.com/download](https://www.dragon3.com/download)
2. Descarga `Dragon3.AppImage`.

### Paso 2: Hacer ejecutable el archivo

```bash
chmod +x Dragon3.AppImage
Paso 3: Ejecutar
bash
./Dragon3.AppImage
(Opcional) Integrar en el sistema
bash
# Crear un enlace simbólico en /usr/local/bin
sudo ln -s ~/Dragon3.AppImage /usr/local/bin/dragon3

# Ahora puedes ejecutar desde cualquier ubicación
dragon3
🛠️ Instalación desde el código fuente (desarrolladores)
Paso 1: Clonar el repositorio
bash
git clone https://github.com/tuusuario/dragon3.git
cd dragon3
Paso 2: Instalar Node.js
Asegúrate de tener Node.js (versión 18 o superior) instalado:

bash
node --version
Si no lo tienes, descárgalo desde nodejs.org.

Paso 3: Instalar dependencias
bash
npm install
Paso 4: Configurar ExifTool
El proyecto ya incluye ExifTool en resources/exiftool/.

Windows: Asegúrate de que la ruta sea correcta en generadorMBH.js.

macOS/Linux: El sistema usará el ExifTool del sistema si está instalado.

bash
# En macOS/Linux, puedes instalar ExifTool con:
brew install exiftool      # macOS
sudo apt install exiftool  # Ubuntu/Debian
Paso 5: Ejecutar en modo desarrollo
bash
npm start
Paso 6: Empaquetar para producción
bash
# Para Windows
npm run dist:win

# Para macOS
npm run dist:mac

# Para Linux
npm run dist:linux

# Para todos los sistemas
npm run dist
El archivo empaquetado se generará en la carpeta dist/.

⚙️ Configuración inicial
Al abrir Dragon3 por primera vez, se te pedirá:

1. Seleccionar la carpeta raíz de proyectos
Esta carpeta será vigilada automáticamente. Cada subcarpeta dentro de ella representará un proyecto.

Recomendación: Crea una carpeta dedicada, como Dragon3_Projects en tu escritorio o en el disco.

2. Completar tu perfil
Nombre del fotógrafo o estudio (aparecerá en metadatos e informes).

Email de contacto (para activación de licencias y contacto).

Web, teléfono, dirección, redes sociales (opcional, para informes).

Logo (imagen para informes PDF).

3. Elegir un prefijo
El prefijo es un código de 3-4 letras que identifica tus sellos.

Ejemplos: GHL, BLD, STU

📁 Estructura de archivos
text
~/.dragon3/
├── dragon3.db          # Base de datos (proyectos, sellos, configuración)
└── Dragon3_Projects/   # Carpeta raíz de proyectos (configurable)
    ├── Proyecto1/
    │   ├── imagen_GHL_000001F.png
    │   └── Originales/
    │       └── imagen.jpg
    └── Proyecto2/
        └── ...
Ubicación por sistema operativo:

Sistema	Ruta
Windows	C:\Users\TuUsuario\.dragon3\
macOS	/Users/TuUsuario/.dragon3/
Linux	/home/TuUsuario/.dragon3/
🔄 Actualización
Desde el ejecutable
Descarga la nueva versión desde la web.

Ejecuta el instalador (sobrescribirá la versión anterior).

Los datos de configuración y la base de datos se conservan.

Desde el código fuente
bash
git pull origin main
npm install
npm run dist
🗑️ Desinstalación
Windows
Ve a Panel de Control > Programas y características.

Selecciona Dragon3 y haz clic en "Desinstalar".

Elimina la carpeta %USERPROFILE%\.dragon3\ si quieres eliminar los datos.

macOS
Arrastra Dragon3 de la carpeta Applications a la Papelera.

Elimina la carpeta ~/.dragon3/ si quieres eliminar los datos.

Linux
Elimina el archivo AppImage.

Si usaste el enlace simbólico: sudo rm /usr/local/bin/dragon3.

Elimina la carpeta ~/.dragon3/ si quieres eliminar los datos.

🔧 Solución de problemas
❌ "ExifTool no encontrado"
Windows:

Verifica que resources/exiftool/exiftool_win.exe existe.

Si no, descárgalo desde exiftool.org y colócalo en la ruta.

macOS/Linux:

bash
# Instalar ExifTool
brew install exiftool      # macOS
sudo apt install exiftool  # Ubuntu/Debian
❌ "La base de datos no se abre"
Verifica que la carpeta ~/.dragon3/ existe y tiene permisos de escritura.

En Windows, asegúrate de que el antivirus no bloquea el archivo .db.

❌ "Error al cargar la imagen"
Asegúrate de que la imagen no está corrupta.

Verifica que el formato es compatible (JPG, PNG, TIFF, BMP).

❌ "El watcher no detecta imágenes"
Verifica que la carpeta raíz está configurada en Configuración.

Asegúrate de que el modo automático está activado.

Comprueba los logs para ver mensajes de error.

📞 Soporte
Si necesitas ayuda:

Email: soporte@dragon3.com

Web: www.dragon3.com

GitHub: https://github.com/tuusuario/dragon3

🐉 Dragon3 - Protege tu obra, protege tu legado.