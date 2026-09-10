# Perfil operativo seguro de producción Dragon3

## Alcance

Este perfil describe el punto de operación que ha quedado verificado como estable para el host actual, sin declarar capacidad empresarial de alto volumen. La intención es evitar caídas por memoria y cold start sin bloquear el sistema ni forzar más concurrencia de la que el hardware soporta.

## Configuración operativa

Se ha ajustado el backend en [prod/Dragon3/backend/server.js](../../prod/Dragon3/backend/server.js) para aplicar estas restricciones:

- `MAX_SYNC_ANALYSES = 2` en-flight por proceso backend
- `Retry-After = 10` para rechazados por capacidad
- `WARMUP_DELAY_MS = 3000`
- `WARMUP_IMAGE_PATH = /opt/dragon3/prod/Dragon3/test.jpg`
- warm-up silencioso en segundo plano tras el arranque
- backpressure estricto antes de ampliar carga

## Motivo del warm-up

El primer análisis sufre un cold start porque el modelo o sus dependencias se inicializan bajo demanda. La precarga silenciosa evita que el primer cliente pague esa penalización, sin bloquear el arranque del servicio ni forzar la ejecución de una petición real para arrancar el sistema.

## Perfil validado

Se validó con la ruta pública de análisis y una ventana de 90 segundos para cada perfil:

### Concurrencia 1

- 6/6 peticiones correctas
- p50: 15.700 s
- p90: 27.102 s
- p95: 27.102 s
- p99: 27.102 s
- máximo: 27.102 s

### Concurrencia 2

- 12/12 peticiones correctas
- p50: 14.070 s
- p90: 19.598 s
- p95: 23.218 s
- p99: 23.218 s
- máximo: 23.218 s

## Diferencia clave respecto a la certificación

Este perfil es estable y seguro para el host actual, pero no es una certificación de capacidad empresarial ni una garantía para 4+ peticiones concurrentes. La latencia sigue siendo alta y el servidor sigue teniendo un cold start real en el modelo bajo ciertas condiciones, aunque ya no se pierde el servicio ni se descarta la carga por saturación.

## Procedimiento operativo

1. Reiniciar el backend con PM2.
2. Esperar 3 segundos tras el arranque para que empiece el warm-up silencioso.
3. Confirmar salud con `/health`.
4. Mantener el backend con capacidad síncrona máxima de 2 en-flight.
5. Si se quiere ampliar capacidad, hacerlo solo después de una prueba medible y documentada.
6. Rechazar por capacidad con `429` y `Retry-After: 10` en lugar de intentar saturar el host.

## Recomendación final

Para este entorno, la política operativa recomendada es:

- precarga silenciosa al arrancar
- bloqueo de backpressure a 2 in-flight
- latencia aceptada solo en windows controladas
- no promocionar a mayor concurrencia sin prueba adicional

## Revisión

Este perfil corresponde a la validación del 2026-09-10.
