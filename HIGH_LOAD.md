# Configuración para alta carga

## Perfil actual

- `dragon3-server`: 2 instancias cluster, configurable con `DRAGON3_SERVER_INSTANCES`.
- `dragon3-embassy`: 1 instancia; mantiene un único worker ML persistente y una caché coherente.
- Análisis síncrono: ejecución directa y paralela mediante `Promise.all`.
- Bull/Redis: disponible para trabajos asíncronos; no añade latencia a cada análisis HTTP.
- Concurrencia Bull: configurable con `QUEUE_CONCURRENCY`, limitada entre 1 y 20.

## Por qué Embassy no usa cluster

Duplicar Embassy duplicaría workers Python, conexiones Redis, cachés y consumidores Bull. Para el flujo actual eso aumenta la contención y puede empeorar la latencia. Se escala primero el proxy HTTP y se mantiene un coordinador único.

## Operación recomendada

```bash
cd /opt/dragon3/prod/Dragon3/backend
DRAGON3_SERVER_INSTANCES=2 QUEUE_CONCURRENCY=10 pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

Si la carga sostenida crece, aumentar gradualmente `DRAGON3_SERVER_INSTANCES` y observar CPU, memoria, latencia P95 y trabajos pendientes. No activar `USE_CELL_QUEUE` para el endpoint síncrono salvo que exista una ruta asíncrona que devuelva estado de trabajo.

## Señales de saturación

- latencia P95 creciente
- memoria de Embassy cercana al límite
- acumulación de trabajos Bull
- reinicios de PM2
- timeouts del worker ML

Ante saturación, reducir concurrencia Bull o derivar análisis pesados a una cola asíncrona antes de aumentar procesos Embassy.