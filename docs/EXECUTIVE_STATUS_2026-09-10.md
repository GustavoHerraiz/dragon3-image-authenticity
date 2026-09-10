# Estado ejecutivo de Dragon3

## Para qué sirve este documento

Este resumen permite revisar el estado real de Dragon3 sin conocer previamente el historial del proyecto. Describe el problema principal, las correcciones aplicadas, el límite operativo actual y lo que todavía no debe darse por resuelto.

## Problema principal

Dragon3 analiza imágenes mediante un backend HTTP, un Embassy de análisis, workers de ML, Redis, Bull y MongoDB. Bajo carga, el sistema presentaba tres efectos relacionados:

1. Algunos payloads grandes, especialmente imágenes codificadas en Base64, permanecían referenciados más tiempo del necesario. Eso hacía crecer la memoria de los procesos y reducía la memoria disponible del host.
2. El primer análisis después de un arranque era mucho más lento porque el modelo o sus dependencias se inicializaban bajo demanda. Es el cold start.
3. La ruta síncrona podía aceptar más trabajo del que el host podía procesar de forma estable. Con carga sostenida aumentaban la latencia y la presión de memoria.

El resultado era un sistema funcional en pruebas cortas, pero no suficientemente acotado para declarar capacidad de alta concurrencia.

## Qué se corrigió

- Se liberaron referencias a Base64, rutas temporales y objetos de request después de extraer la información necesaria.
- Se mantuvo la limpieza de archivos temporales en bloques `finally`.
- Las células que usan Sharp se ejecutan por la cola serial de Bull, con concurrencia efectiva 1. Las células ligeras siguen usando paralelismo.
- Se desactivó el stream Redis legado que retenía payloads binarios grandes.
- Se añadió warm-up silencioso en segundo plano después del arranque para reducir el coste del primer análisis.
- Se limitó la ruta síncrona a `2` análisis en vuelo por proceso.
- Cuando se alcanza el límite, el backend responde `429` con `Retry-After: 10` en lugar de seguir acumulando trabajo.
- El worker asíncrono permanece separado del Embassy HTTP y usa su cola Redis propia.

## Estado validado

El perfil seguro validado el 2026-09-10 fue:

| Ventana | Resultado | Latencia máxima |
|---|---:|---:|
| Concurrencia 1, 6 análisis | 6/6 correctos | 27,102 s |
| Concurrencia 2, 12 análisis | 12/12 correctos | 23,218 s |

No se observaron fallos en esas ventanas controladas. La configuración está diseñada para proteger el host actual, no para prometer throughput empresarial.

## Lo que todavía es una limitación

- La latencia de análisis sigue siendo alta para una experiencia interactiva exigente.
- No está certificada la operación sostenida con 4 o más análisis simultáneos.
- El warm-up reduce la penalización del primer cliente, pero no elimina la necesidad de medir el modelo y sus caches tras reinicios o cambios de versión.
- Aumentar workers, procesos PM2 o concurrencia sin una nueva prueba puede volver a producir presión de memoria.

## Recomendación operativa

Mantener el perfil `warm-up + máximo 2 in-flight` en el host actual. Cualquier aumento debe ir acompañado de una ventana reproducible con métricas de latencia, RSS, memoria libre, Redis, reinicios PM2 y errores HTTP.

## Cambios relevantes

- `4912f4c`: corrección de retención de Base64 en las peticiones del Embassy.
- `2b90e3d`: warm-up y backpressure seguro.
- `881128d`: metadata raíz del proyecto para setup reproducible.

## Archivos de referencia

- [Perfil operativo seguro](operations/PRODUCTION_SAFE_PROFILE_2026-09-10.md)
- [Revisión técnica de producción](operations/PRODUCTION_REVIEW_2026-09-10.md)
- [Plan de alta concurrencia](../HIGH_CONCURRENCY_PLAN.md)
- [Checklist de producción](../PRODUCTION_CHECKLIST.md)