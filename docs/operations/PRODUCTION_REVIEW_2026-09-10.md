# Revisión técnica de producción Dragon3

## Objetivo de la revisión

Este documento está pensado para una revisión externa. Permite comprobar qué problema se investigó, qué evidencia lo demostró, qué cambios se hicieron y qué afirmaciones todavía no están justificadas.

## Arquitectura afectada

La petición entra por el backend en el puerto `3000`, se deriva al Embassy en el puerto `3002` y puede activar células ligeras, células Sharp y ML. Bull usa colas Redis separadas para las células y para los trabajos asíncronos. MongoDB almacena el estado y los resultados.

La frontera crítica es el flujo de imágenes: un archivo grande puede existir como archivo temporal, Buffer, Base64 y parte de un objeto de trabajo. Si alguna referencia queda viva, el recolector de basura no puede recuperar esa memoria.

## Diagnóstico por capas

### 1. Retención de memoria

Se observó crecimiento de RSS durante ejecuciones repetidas. La investigación aisló referencias a payloads de imagen que sobrevivían más allá del punto de uso, además de un stream Redis legado con payloads binarios sin una retención suficientemente acotada.

Corrección aplicada:

- purga explícita de campos pesados tras extraerlos;
- limpieza de archivos temporales en `finally`;
- stream legado fuera del runtime de producción;
- colas nuevas con metadata y referencias controladas, no con imágenes completas repetidas.

Riesgo residual: cualquier nueva célula o ruta que copie la imagen completa puede reintroducir el problema. Debe medirse RSS bajo repetición, no solo verificar que una petición aislada termina.

### 2. Células Sharp

La ejecución concurrente de varias células Sharp multiplicaba el consumo de CPU y memoria. La decisión actual es separar las células pesadas y enviarlas a la cola serial global con concurrencia efectiva `1`. Las células ligeras y ML conservan el paralelismo donde es razonable.

Esto reduce el pico de recursos, pero también limita el throughput. Es una decisión de estabilidad, no una optimización de latencia.

### 3. Cold start

El primer análisis después del arranque era más lento porque el modelo o sus dependencias se cargaban bajo demanda. El backend ahora inicia el warm-up en segundo plano después del arranque, con un retraso de `3000 ms`, sin bloquear `/health` ni convertir una petición real en mecanismo de inicialización.

El warm-up debe considerarse una mitigación operativa. Hay que repetir la prueba después de reinicios, actualizaciones de modelo y rotaciones de workers.

### 4. Backpressure

La capacidad síncrona quedó fijada en `MAX_SYNC_ANALYSES = 2` por proceso. Cuando se ocupan los slots, el backend responde `429` y `Retry-After: 10`.

Este comportamiento es intencionado: rechazar temprano es preferible a aceptar trabajo que se acumule en memoria, aumente la latencia de todos los clientes o provoque reinicios. No debe interpretarse como un fallo del endpoint.

## Evidencia disponible

### Ventanas estables

- Concurrencia 1: `6/6` correctas; p50 `15,700 s`; máximo `27,102 s`.
- Concurrencia 2: `12/12` correctas; p50 `14,070 s`; p95 `23,218 s`; máximo `23,218 s`.
- Procesos PM2 esperados en estado `online`.
- `/health` respondió correctamente tras el reinicio.
- `node --check` pasó para los módulos modificados.

### Interpretación

La evidencia respalda un perfil acotado de concurrencia 1-2. No respalda una declaración de alta concurrencia, baja latencia garantizada ni capacidad sostenida a 4+ análisis.

## Cómo revisar o reproducir

Desde `/opt/dragon3`:

```bash
git log --oneline -5
git status --short --branch
node --check prod/Dragon3/backend/server.js
node --check prod/Dragon3/engine/agent-embassy.js
curl --fail http://127.0.0.1:3000/health
pm2 list
```

Para una validación de carga, registrar como mínimo:

- número de peticiones y respuestas `200`, `429`, `4xx` y `5xx`;
- p50, p95, p99 y máximo;
- RSS de backend, Embassy y async-worker;
- memoria libre del host;
- profundidad de Redis DB 2 y DB 3;
- reinicios y uptime de PM2;
- diferencia entre la primera petición tras reinicio y las peticiones warm.

## Criterios de aceptación actuales

Se considera estable el perfil actual si:

- no hay reinicios PM2 durante la ventana;
- no crece indefinidamente el RSS con una carga repetida;
- los errores son explicables por backpressure y aparecen como `429`;
- Redis no acumula imágenes completas ni streams sin retención;
- los trabajos terminan, fallan de forma trazable o expiran con limpieza;
- el host conserva memoria suficiente para operar y recuperarse.

## Preguntas abiertas para la revisión externa

1. ¿El límite de dos análisis es suficiente para el tráfico esperado o hace falta separar la ruta interactiva de una ruta asíncrona?
2. ¿El tiempo máximo de aproximadamente 23-27 segundos es aceptable para el cliente?
3. ¿Debe mantenerse Sharp serial o conviene reservar un host con más memoria para probar concurrencia mayor?
4. ¿Qué retención deben tener resultados, archivos temporales, jobs Bull y métricas?
5. ¿Qué SLO y presupuesto de memoria deben convertirse en criterio formal de producción?

## Conclusión

El problema original era de estabilidad bajo carga, no únicamente de velocidad: había retención de datos grandes, inicialización fría y falta de un límite operativo suficientemente estricto. La retención demostrada y la política de colas/backpressure ya fueron corregidas. El sistema está preparado para operar de forma conservadora en el host actual, pero la capacidad de alta concurrencia sigue pendiente de una nueva validación con más recursos y criterios explícitos.