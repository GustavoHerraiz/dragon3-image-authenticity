# Inventario de desarrollo

Este inventario describe el contenido conservado en `dev`. No se ha movido ni eliminado ningún archivo durante esta fase.

## Resumen

| Área | Tamaño aproximado | Clasificación | Riesgo de mover |
|---|---:|---|---|
| `dev/celulas` | 14 GB | núcleo histórico, laboratorio, datasets, tests y backups | alto |
| `dev/dragon3-desktop` | 1,9 GB | aplicación desktop, builds y pruebas | alto |
| `dev/analizadorpython` | 321 MB | analizadores Python y laboratorio Dopler | medio |
| `dev/selladocamara` | 70 MB | prototipos y herramientas de cámara/sellado | medio |
| `dev/ataque` | 32 KB | scripts de auditoría y seguridad | bajo, pero sensible |

## Clasificación propuesta

### 1. Laboratorio y modelos

- `dev/celulas/laboratorio/`
- `dev/celulas/meta-analizador/`
- `dev/celulas/modelos/`
- `dev/analizadorpython/`
- `dev/analizadorpython/dopler/`

Contiene entrenamiento, extracción de features, modelos, validaciones y análisis experimentales. No debe entrar en el runtime productivo.

### 2. Pruebas y validación

- `dev/celulas/test/`
- `dev/celulas/test_10/`
- `dev/celulas/test_mover/`
- `dev/celulas/test_seguro/`
- tests de `dev/dragon3-desktop/`
- scripts `test_*` del resto de áreas

Debe conservarse separado para que las pruebas no se confundan con servicios de producción.

### 3. Datos, resultados y backups

- `dev/celulas/backup_datos/`
- `dev/celulas/backup_mongo/`
- `dev/celulas/dataset/` ahora enlaza con `prod/Dragon3/data/dataset/`
- `dev/celulas/salida/`
- `dev/celulas/telemetria/`
- `dev/celulas/logs/`
- `dev/celulas/temp/`
- `dev/dragon3-desktop/test_output/`
- `dev/dragon3-desktop/test_output_full/`
- `dev/selladocamara/capturas/`

Son datos operativos o generados. Deben permanecer fuera del control de versiones y tener políticas de retención independientes.

### 4. Aplicaciones experimentales

- `dev/dragon3-desktop/`
- `dev/selladocamara/`

Son productos o prototipos independientes. No deben mezclarse con el motor productivo de análisis.

### 5. Seguridad y herramientas auxiliares

- `dev/ataque/`
- `dev/celulas/scripts/`
- `dev/celulas/para servidor/`
- `dev/celulas/evolucion/`
- `dev/celulas/propuestas/`

Deben conservarse, pero con permisos y documentación claros. Los scripts de ataque no deben ejecutarse desde producción.

## Siguiente migración recomendada

La siguiente fase debe ser documental y reversible:

1. crear subcarpetas `dev/lab`, `dev/tests`, `dev/tools`, `dev/backups` y `dev/apps`
2. mover únicamente archivos claramente clasificados
3. dejar enlaces de compatibilidad solo cuando sea necesario
4. ejecutar pruebas y comprobar PM2 después de cada bloque
5. no mover todavía modelos, datasets, backups ni builds sin una política de almacenamiento definida

## Estado actual

- runtime productivo: `prod/Dragon3/engine/`
- servidor HTTP: `prod/Dragon3/backend/`
- dataset operativo: `prod/Dragon3/data/dataset/`
- laboratorio y experimentos: `dev/`
- respaldo remoto: rama `main` en GitHub
