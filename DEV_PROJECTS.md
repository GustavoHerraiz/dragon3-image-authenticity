# Proyectos conservados en desarrollo

`dev/` contiene varios proyectos y laboratorios relacionados, pero no todos forman parte del runtime Dragon3 que está activo en producción.

## Dragon3 Engine

El motor productivo está separado en:

- `prod/Dragon3/engine/`: runtime operativo, células, planes, servicios y ML.
- `prod/Dragon3/backend/`: servidor HTTP y configuración PM2.
- `prod/Dragon3/data/dataset/`: dataset usado por el watcher.

Las copias históricas y experimentales de este motor permanecen en `dev/celulas/` para investigación y respaldo local.

## Analizador Python

`dev/analizadorpython/` contiene analizadores forenses, conversiones y el proyecto experimental Dopler.

Clasificación:

- investigación forense
- prototipos Python
- comparativas y pruebas ciegas
- herramientas Dopler
- visualización y telemetría experimental

No se ejecuta directamente desde el arranque productivo actual.

## Dragon3 Desktop

`dev/dragon3-desktop/` es una aplicación de escritorio independiente con:

- código fuente de Electron
- renderer
- recursos
- herramientas de generación
- builds y salidas de pruebas

Sus directorios `dist`, `dist_obf`, `test_output` y `test_output_full` son artefactos de build o validación, no runtime del servidor.

## Sellado de cámara

`dev/selladocamara/` contiene prototipos y herramientas de integración con cámara y sellado:

- conector de cámara
- sala de control
- matemáticas
- base de datos de sellos
- capturas y pruebas

Debe mantenerse separado hasta definir un despliegue productivo específico para hardware.

## Seguridad

`dev/ataque/` contiene scripts de auditoría y pruebas de seguridad ofensiva autorizada.

No deben ejecutarse desde PM2 ni mezclarse con el runtime productivo. Su uso debe limitarse a entornos controlados.

## Laboratorio Dragon3

Las siguientes áreas son experimentales y deben permanecer fuera del runtime:

- `dev/celulas/laboratorio/`
- `dev/celulas/meta-analizador/`
- `dev/celulas/propuestas/`
- `dev/celulas/evolucion/`
- `dev/celulas/test/`
- `dev/celulas/test_10/`
- `dev/celulas/test_seguro/`

El código puede conservarse localmente para investigación y regeneración de modelos, pero no debe formar parte del proceso productivo.

## Política de conservación

- No se borra ningún proyecto de `dev` durante la reorganización.
- No se mezclan aplicaciones independientes con `prod/Dragon3/engine`.
- Los datasets, backups, capturas, builds y salidas permanecen en el servidor, fuera de GitHub.
- Los cambios de producción se realizan en `prod/Dragon3/engine` y se validan con PM2 y health checks.
- Cualquier futura migración de un proyecto independiente tendrá su propio plan y pruebas.
