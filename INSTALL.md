# Guía de instalación

## 1. Propósito

Este documento describe la instalación y puesta en marcha del proyecto Dragon3 en un entorno de desarrollo o producción interno. La intención principal es mantener una base limpia y reproducible sin incluir artefactos pesados ni entornos virtuales dentro del repositorio.

## 2. Requisitos previos

### Sistema operativo

- Linux recomendado
- macOS para desarrollo local
- Windows solo si se utiliza un entorno compatible con Node.js y Python

### Software mínimo

- Git
- Python 3.10 o superior
- Node.js 18+ (si se ejecutan módulos JavaScript del proyecto)
- acceso a la infraestructura del servicio principal de Dragon3
- permisos de red y almacenamiento según el entorno de despliegue

### Dependencias externas

Dependerá del módulo que se quiera ejecutar:

- módulos de análisis de imagen
- actualizaciones de metadatos
- procesamiento de señales forenses
- servicios de autenticidad y sellado
- herramientas de laboratorio o validación

## 3. Clonación del repositorio

```bash
git clone https://github.com/GustavoHerraiz/dragon3-image-authenticity.git
cd dragon3-image-authenticity
```

## 4. Configuración del entorno local

### 4.1 Python

Se recomienda crear un entorno virtual para el desarrollo local y no incluirlo en Git.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

### 4.2 Node.js

Si se requiere ejecutar componentes del ecosistema JavaScript del proyecto:

```bash
node --version
npm --version
```

## 5. Variables de entorno

Copia la plantilla del entorno:

```bash
cp .env.example .env
```

Luego revisa y completa los valores relevantes para tu despliegue:

- `APP_URL`
- `DRAGON3_HOST`
- `DRAGON3_PORT`
- `SECRET_KEY`
- `API_TOKEN`
- `DB_*`
- `UPLOAD_PATH`
- `BACKUP_PATH`
- `TEMP_PATH`
- `LOG_LEVEL`

## 6. Estructura relevante para arranque

El repositorio está dividido en capas:

- `dev/`: investigación y pruebas
- `prod/`: entorno productivo
- `shared/`: almacenamiento común
- `salida/`: artefactos generados y excluidos del control de versiones

## 7. Puesta en marcha

La ejecución exacta depende del módulo o servicio que se quiera lanzar. En general, sigue este flujo:

1. preparar el entorno
2. cargar variables de entorno
3. activación del entorno virtual si aplica
4. ejecutar el módulo principal
5. validar la salida del analizador

Ejemplo general:

```bash
source .venv/bin/activate
python3 path/to/entrypoint.py
```

o para servicios Node.js:

```bash
npm install
node app.js
```

## 8. Verificación del funcionamiento

Antes de considerar que el sistema está listo:

- revisar que el entorno se carga correctamente
- validar que no hay errores de dependencias
- comprobar que la infraestructura de salida reacciona correctamente
- verificar que el analizador principal responde al flujo esperado
- revisar logs y archivos temporales

## 9. Reglas de despliegue

- no subir entornos virtuales ni `node_modules`
- no compilar ejecutables finales dentro del repositorio
- no dejar artefactos pesados en el historial de Git
- mantener la capa operativa separada de la capa experimental
- usar Git LFS solo cuando sea estrictamente necesario

## 10. Solución de problemas comunes

### Error de dependencias

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Si no existe `requirements.txt`, revisa el módulo concreto y sus dependencias internas.

### Error de entorno

```bash
source .venv/bin/activate
python3 -V
node -v
```

### Error de permisos

Revisa si la cuenta de sistema tiene acceso a:

- carpetas de entrada
- directorios de salida
- servicio principal del analizador
- almacenamiento compartido

### Archivos grandes rechazados por GitHub

Si ocurre esto, normalmente significa que alguno de estos elementos sigue en el historial:

- entornos virtuales
- ejecutables
- librerías nativas
- datasets
- backups
- salidas pesadas

En ese caso, seguir la política del repositorio y limpiar el historial si es necesario.

## 11. Buenas prácticas

- mantener un entorno limpio y reproducible
- separar producción de laboratorio
- documentar cambios de entorno
- revisar `git status` antes de cada commit
- evitar subir datos o artefactos generados

## 12. Nota final

Este proyecto debe operar como una infraestructura de análisis y autenticidad visual con un repositorio limpio y mantenible. La instalación debe centrarse en el código fuente, la lógica del servicio principal y la configuración del entorno, no en artefactos pesados ni salidas generadas.
