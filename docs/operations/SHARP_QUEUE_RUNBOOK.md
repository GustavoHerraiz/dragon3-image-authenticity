# Runbook: presión de recursos en células Sharp

## Objetivo

Evitar que varias operaciones de procesamiento de imagen con Sharp compitan al mismo tiempo por CPU, memoria y buffers nativos. La política vigente separa las células pesadas de las ligeras y ejecuta las pesadas mediante Bull con un worker serial.

Esta solución controla la presión de recursos y evita degradación, swap, reinicios PM2 y latencias erráticas bajo concurrencia. No promete reducir por sí sola el tiempo de una única operación; su beneficio principal aparece con varias peticiones simultáneas.

## Política vigente

Las siguientes células se consideran pesadas y deben pasar siempre por la cola global de células:

- `detectar-patrones-forenses`
- `detectar-artefactos-ia`
- `detectar-textura-ruido`
- `detectar-colores`
- `detectar-sombreado`
- `detectar-doble-compresion-sharp`

El orquestador no las incluye en el `Promise.all` de células ligeras. Primero ejecuta las ligeras en paralelo y después procesa las pesadas con la política acotada de la cola. La cola Bull registra los trabajos en Redis DB 2 y el worker de `procesar-celula` usa concurrencia `1`.

La cola de análisis completos asíncronos es independiente: usa Bull en Redis DB 3, publica referencias a archivos temporales y tiene su propia concurrencia configurable. No debe confundirse con la cola serial de Sharp.

## Configuración

Variables relevantes del entorno productivo:

```dotenv
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=<secreto-no-versionado>
QUEUE_CONCURRENCY=1
ASYNC_QUEUE_CONCURRENCY=2
```

`REDIS_DB=1` es la base por defecto del entorno. La cola de células fija Redis DB 2 y la cola de trabajos completos fija Redis DB 3. La contraseña se normaliza eliminando comillas exteriores para tolerar configuraciones antiguas, pero el `.env` debe conservar el valor sin comillas y nunca debe entrar en Git.

## Flujo operativo

```text
Petición
  -> Embassy / Orquestador
  -> células ligeras: paralelo directo
  -> células Sharp: Bull celula:cola / Redis DB 2 / worker serial
  -> células dependientes: secuencial
  -> veredicto y telemetría
```

La cola permanece viva después de vaciarse y acepta nuevos trabajos. Los estados útiles son `waiting`, `active`, `completed`, `failed` y `delayed`.

## Verificación después de un despliegue

1. Confirmar procesos:

   ```bash
   pm2 list
   ```

   Deben estar `online` `dragon3-embassy`, `dragon3-async-worker`, `dragon3-server` y `dataset-watcher`.

2. Confirmar Redis con la contraseña real, sin mostrarla en logs:

   ```bash
   redis-cli -h 127.0.0.1 -p 6379 -a "$REDIS_PASSWORD" ping
   ```

   Resultado esperado: `PONG`.

3. Ejecutar la regresión de política:

   ```bash
   cd /opt/dragon3/prod/Dragon3/engine
   node test-queue-policy.js
   ```

   Resultado esperado: `OK: pico de concurrencia observado = 1`.

4. Confirmar en logs que aparecen trabajos de las células Sharp con `Trabajo encolado`, `trabajo activo` y `trabajo completado`.

5. Confirmar que no hay acumulación sostenida en la cola y que `failed` no crece de forma inesperada. Los trabajos completados pueden eliminarse automáticamente según `removeOnComplete`.

## Diagnóstico

### Redis devuelve `NOAUTH` o `WRONGPASS`

- No cambiar la arquitectura de colas para ocultar el fallo.
- Revisar `REDIS_PASSWORD` del `.env` productivo y eliminar comillas exteriores.
- Confirmar que PM2 recibió el entorno actualizado con `pm2 restart dragon3-embassy --update-env` y, si corresponde, reiniciar el worker async.
- Repetir `redis-cli ... ping` y el smoke test Bull.
- No imprimir la contraseña ni incluirla en un commit.

### La cola crece o hay presión de memoria

- Revisar `waiting`, `active`, `failed` y antigüedad de trabajos.
- Mantener el worker Sharp en concurrencia `1` hasta disponer de una medición controlada.
- Revisar RSS, heap, CPU, swap y reinicios PM2.
- No aumentar `QUEUE_CONCURRENCY` como primera respuesta; hacerlo solo tras una prueba de carga y con rollback preparado.

### Una célula Sharp aparece como directa

- Revisar que su ID esté en `_esCelulaPesada()` del orquestador.
- Confirmar que el plan no esté ejecutando otra copia o una ruta antigua del código.
- Reiniciar Embassy tras desplegar cambios y repetir `test-queue-policy.js`.
- Considerar el incidente una regresión de rendimiento aunque el resultado funcional sea correcto.

## Rollback

Si la cola falla o Redis no está disponible, detener la promoción y volver a la revisión anterior conocida. No activar ejecución paralela directa de Sharp en producción como atajo: reintroduce la causa de la presión alta. Tras el rollback, validar PM2, Redis, Bull y una petición de análisis antes de reabrir tráfico.

## Evidencia de la implantación

- La prueba `prod/Dragon3/engine/test-queue-policy.js` observa concurrencia máxima `1`.
- La verificación productiva confirmó autenticación Redis con `PONG`.
- Un trabajo Bull de prueba fue encolado y completado correctamente.
- PM2 mostró `dragon3-embassy` y `dragon3-async-worker` en estado `online`.
