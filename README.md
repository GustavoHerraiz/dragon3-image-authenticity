# Dragon3 Image Authenticity Engine

Dragon3 es un sistema de autenticidad visual orientado a detectar si una imagen ha sido generada por un humano o por inteligencia artificial, con análisis forense, validación de metadatos, evaluación de artefactos y sellado de autenticidad.

El punto de entrada operativo del sistema se encuentra en la infraestructura asociada a www.bladecorporation.net y el servicio principal es el analizador Dragon3.

## Objetivo

El proyecto está diseñado para:

- analizar imágenes y detectar trazas de generación o manipulación
- evaluar artefactos visuales, metadatos, compresión y firmantes digitales
- clasificar señales de autenticidad y posible origen IA
- generar veredictos y sellos para fotografía profesional
- servir como capa de validación para entornos de producción y laboratorio

## Alcance

Dragon3 combina varias capas:

- análisis de imagen y metadatos
- detección de artefactos y patrones sospechosos
- redes neuronales y modelos de comparación
- capa de decisión y sellado de autenticidad
- entorno de laboratorio para investigación y entrenamiento
- entorno productivo para despliegue operativo

## Arquitectura general

El repositorio está estructurado para separar:

- laboratorio experimental
- entorno productivo
- datos comunes y archivos pesados

### Estructura principal

```text
/opt/dragon3/
├── dev/                # Investigación, experimentación, prototipos y pruebas
│   ├── analizadorpython/
│   ├── ataque/
│   ├── celulas/
│   ├── dragon3-desktop/
│   └── selladocamara/
├── prod/               # Entorno operativo y servicios de producción
│   ├── Dragon3/
│   └── services/
├── shared/             # Datos comunes, imágenes y backups
│   ├── backups/
│   └── images/
├── .gitignore          # Exclusiones del repositorio para archivos pesados
├── README.md           # Documentación del proyecto
├── test_boss           # Control de validación / pruebas iniciales
└── salida/             # Artefactos generados, excluidos del repositorio
```

## Componentes clave

### 1. Laboratorio de investigación
La carpeta `dev` contiene prototipos, scripts de análisis, validaciones experimentales, pruebas forenses y módulos de investigación.

Incluye:

- analizadores de imagen
- módulos de comparación
- extracción de artefactos
- pruebas de validación
- experimentación con redes y clasificadores
- desarrollo de herramientas auxiliares

### 2. Entorno productivo
La carpeta `prod` representa la infraestructura que se despliega en producción para ejecutar el analizador principal, junto con servicios asociados a la autenticidad y al sellado.

### 3. Servicios y validación
El sistema incluye servicios de:

- análisis de imagen
- inspección de metadatos
- clasificación de señales de autenticidad
- validación de artefactos forenses
- generación de sellos y resultados

## Política de repositorio

Este repositorio es privado y está preparado para mantener el código fuente limpio y operable sin incluir artefactos pesados.

Se excluyen del repositorio:

- entornos virtuales
- datasets grandes
- librerías binarias pesadas
- ejecutables compilados
- salidas generadas
- backups
- modelos pesados o artefactos de entrenamiento
- archivos temporales y certificados

Esto evita errores de GitHub por archivos mayores de 100 MB y mantiene el repositorio sano y mantenible.

## Requisitos

- Linux o entorno compatible
- Git
- Python 3.10+ o la versión requerida por el proyecto
- Node.js si se ejecutan módulos del entorno de celulas o desktop
- acceso a la infraestructura de producción asociada a www.bladecorporation.net

## Instalación

1. Clonar el repositorio privado:

```bash
git clone https://github.com/GustavoHerraiz/dragon3-image-authenticity.git
cd dragon3-image-authenticity
```

2. Revisar dependencias del entorno correspondiente.

3. Ejecutar la capa de pruebas o servicio adecuado según el caso de uso:

```bash
# ejemplo: entorno de laboratorio
cd dev

# ejemplo: servicio productivo
cd prod
```

## Uso recomendado

El uso normal del sistema se basa en estas capas:

1. preparación y validación de la imagen
2. extracción de metadatos, artefactos y señales
3. análisis comparativo y forense
4. decisión de autenticidad o sospecha
5. sellado y registro del resultado

## Seguridad y responsabilidad

Este sistema está diseñado para validación fotográfica y análisis de autenticidad. Debe utilizarse con criterios técnicos, éticos y regulatorios adecuados.

No debe utilizarse como mecanismo para inferir verdades absolutas sin contexto. Sus salidas deben interpretarse como señales de análisis y evidencia técnica, no como una prueba jurídica o definitiva por sí misma.

## Mantenimiento

El repositorio está pensado para:

- mantener la base de código limpia
- separar pruebas y laboratorio del entorno productivo
- evitar el versionado de artefactos pesados y salidas temporales
- preservar la trazabilidad del sistema principal

## Nota de despliegue

El analizador Dragon3 se ejecuta dentro de la infraestructura operativa conectada a www.bladecorporation.net y debe gestionarse como servicio principal del sistema, manteniendo la lógica de análisis separada de los artefactos experimentales y los datos generados.

## Estado del proyecto

Este repositorio representa la versión del código fuente y la estructura base del analizador Dragon3 y sus módulos asociados.

Los artefactos de entrenamiento, entornos virtuales, ejecutables y archivos enormes quedan fuera del repositorio para mantenerlo viable en GitHub y seguro en producción.

## Contacto

Proyecto privado y operado dentro de la infraestructura de Blade Corporation.
