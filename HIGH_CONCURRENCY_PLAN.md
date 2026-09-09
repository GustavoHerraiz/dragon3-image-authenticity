# Plan de implantacion de alta concurrencia

> Dragon3 | Version 1.0 | Estado: plan de ejecucion

## 1. Objetivo

Preparar Dragon3 para atender concurrencia alta de forma medible, controlada y recuperable, manteniendo baja latencia para analisis interactivos y derivando trabajos pesados a procesamiento asincrono.

Este plan no considera "alta concurrencia" como aumentar procesos sin mas. La capacidad debe demostrarse con una carga, un limite, un SLO y un procedimiento de rollback conocidos.

## 2. Estado de partida

- Backend HTTP: PM2 cluster, actualmente 2 instancias configurables.
- Embassy: una instancia fork en `3002`.
- Analisis sincrono: ejecucion directa y paralela con `Promise.all`.
- Bull/Redis: disponible, pero no debe utilizarse para cada celula del camino sincrono.
- ML: worker Python persistente asociado al Embassy.
- Persistencia: MongoDB.
- Dataset watcher: proceso separado.
- Riesgo principal: multiplicar Embassy o ML sin coordinar memoria, caches, locks, colas y ownership.

## 2.1 Estado de implantacion

- **Fase 0:** health checks y baseline manual ejecutados el 2026-09-09.
- **Fase 1:** backpressure inicial activo en el backend: cuatro analisis simultaneos por worker PM2, timeout configurable hacia Embassy y respuesta `429` con `Retry-After` cuando se agota la capacidad local.
- **Validacion inicial:** con dos workers PM2 se observaron siete analisis completados y rechazos `429` inmediatos al superar los slots disponibles; la carga concurrente produjo aproximadamente 50 segundos de latencia, por lo que no se considera capacidad Enterprise certificada.
- **Fase 2:** instrumentacion Prometheus activa en el backend: peticiones, latencia, estados HTTP, analisis activos y rechazos por capacidad; `/metrics` queda limitado a localhost salvo `METRICS_TOKEN` explicito.
- **Fase 3:** endpoint asincrono activo: `POST /api/v1/analysis-jobs`, `GET /api/v1/analysis-jobs/:jobId` y `DELETE /api/v1/analysis-jobs/:jobId`; Bull usa una cola separada en Redis DB 3, payload con referencia a archivo, ownership, TTL, reintentos e idempotencia. Validado E2E: `202`, progreso, resultado `completed` e idempotencia con el mismo `jobId`. Carga inicial: 5/5 jobs aceptados en aproximadamente 0,66 s, con `2` activos y `3` en espera.
- **Fase 4:** worker async dedicado activo en PM2 (`dragon3-async-worker`), separado del Embassy HTTP. Consume Redis DB 3 con concurrencia configurable, no abre puerto, no duplica MongoDB ni la cola de células DB 2. Validado con job real: `completed`, progreso 100%, `0 active / 0 waiting` y sin reinicios.
- **Fase 5:** observabilidad externa preparada y validada: configuración Prometheus, cuatro alertas Dragon3, dashboard Grafana y provisioning de datasource/dashboard versionados en `docs/observability/`. En este host Grafana está activo, pero Prometheus no tiene unidad `systemd`; la activación queda pendiente de instalarlo mediante el mecanismo oficial de la distribución.
- **Carga inicial:** 10/10 jobs async aceptados y completados con `1` worker y concurrencia `2`; cola final `0 waiting / 0 active`, sin reinicios observados. Durante la tanda, Embassy alcanzó aproximadamente 289 MB RSS y el worker 84 MB RSS.
- **Siguiente gate:** activar Prometheus con esos artefactos, completar la auditoria de dependencias documentada en `docs/SECURITY_DEPENDENCY_AUDIT.md` y ejecutar una ventana sostenida de 30 minutos antes de escalar gradualmente `DRAGON3_ASYNC_WORKERS`/`ASYNC_QUEUE_CONCURRENCY` o declarar capacidad Enterprise. La certificacion de seguridad queda pendiente mientras existan vulnerabilidades sin remediar o aceptar formalmente.

## 3. Arquitectura objetivo

```text
                   +----------------------+
                   | Load balancer / TLS  |
                   +----------+-----------+
                              |
                 +------------v-------------+
                 | Backend stateless x N    |
                 | auth, limits, routing   |
                 +------+-------------+-----+
                        |             |
             sync       |             | async
                        |             v
                 +------v-----+  +----+----------------+
                 | Analysis   |  | Job API + Bull      |
                 | gateway    |  | estado/reintentos  |
                 +------+-----+  +----+----------------+
                        |             |
                        v             v
                 +------+-------------+-----+
                 | Embassy workers / pools |
                 | limites y backpressure  |
                 +------+-------------+-----+
                        |             |
                 +------v-----+  +----v-----+
                 | ML worker  |  | MongoDB  |
                 | pool       |  | Redis    |
                 +------------+  +----------+
```

Principios:

1. El backend permanece stateless y puede escalar horizontalmente.
2. La ruta sincrona tiene presupuesto estricto de tiempo y tamano.
3. La ruta asincrona devuelve `202 Accepted` y un `jobId`, nunca bloquea el request hasta terminar un trabajo largo.
4. La concurrencia se limita en cada frontera: HTTP, Embassy, ML, Redis y MongoDB.
5. Cada trabajo tiene idempotencia, timeout, reintentos acotados y estado observable.
6. Los datos grandes no viajan repetidamente por Redis; se guarda una referencia a almacenamiento controlado.

## 4. Fases de implantacion

### Fase 0: linea base y contrato de capacidad

**Objetivo:** saber cuanto soporta hoy el sistema.

Acciones:

- Fijar version de codigo, configuracion PM2, hardware, tamanos de imagen y modelo.
- Medir concurrencia 1, 2, 5, 10, 20 y 50.
- Separar cold start y warm path.
- Medir p50, p95, p99, throughput, errores, timeouts, RSS, heap, CPU, Redis, MongoDB y ML.
- Registrar tiempos por celula y tamano de respuesta.
- Confirmar que los datos de prueba no contienen informacion sensible.

Entregable: informe de capacidad actual con numero de peticiones sostenidas, punto de saturacion y causa dominante.

**Gate:** no avanzar sin una carga reproducible y un dashboard o informe equivalente.

### Fase 1: limites y backpressure en la ruta sincrona

**Objetivo:** que la saturacion degrade de forma controlada.

Acciones:

- Limitar peticiones concurrentes por instancia y por identidad.
- Rechazar temprano archivos demasiado grandes o formatos no soportados.
- Aplicar timeout total de analisis y timeout por celula.
- Usar semaforos para ML, Sharp, EXIF y operaciones costosas.
- Responder `429` cuando se alcance capacidad, con `Retry-After`.
- Evitar acumular promesas ilimitadas en memoria.
- Asegurar que cada request libera buffers y recursos en `finally`.
- Añadir graceful shutdown: dejar terminar trabajos cortos y rechazar nuevos.

**Gate:** bajo sobrecarga, la memoria permanece acotada, el proceso no entra en reinicios repetidos y el porcentaje de errores es predecible.

### Fase 2: observabilidad operativa

**Objetivo:** poder explicar cada perdida de capacidad.

Acciones:

- Correlation ID y request ID en todos los servicios.
- Metricas por endpoint, plan, celula, modelo, tamano y resultado.
- Histogramas de latencia p50/p95/p99.
- Metricas de inflight requests, rechazos, timeouts, retries y circuit breakers.
- Metricas ML: cola interna, tiempo de inferencia, cold start, RSS y reinicios.
- Metricas Redis: profundidad, antiguedad, jobs activos, fallos y retries.
- Metricas MongoDB: latencia, pool, errores y operaciones lentas.
- Alertas de SLO y runbook enlazado a cada alerta.
- Logs estructurados sin imagenes, base64, JWT ni secretos.

**Gate:** una prueba de carga debe producir un informe utilizable sin inspeccion manual de logs dispersos.

### Fase 3: endpoint asincrono

**Objetivo:** separar analisis interactivo de trabajos largos.

Contrato recomendado:

```text
POST /api/v1/analysis-jobs
  -> 202 { jobId, statusUrl, correlationId }

GET /api/v1/analysis-jobs/:jobId
  -> 200 { jobId, estado, progreso, resultado?, error? }

DELETE /api/v1/analysis-jobs/:jobId
  -> 202 cancelacion solicitada
```

Acciones:

- Validar archivo antes de crear el job.
- Guardar el input en almacenamiento temporal controlado y cifrado, o en un volumen de trabajo con TTL.
- Publicar en Bull solo metadata y una referencia al input.
- Definir estados: `queued`, `running`, `succeeded`, `failed`, `expired`, `cancelled`.
- Usar una clave de idempotencia para evitar duplicados.
- Configurar timeout, backoff exponencial y numero maximo de reintentos.
- Separar colas por prioridad: interactiva, pesada y dataset.
- Limitar concurrencia por cola y por tipo de recurso.
- Borrar input y resultado temporal tras la retencion definida.
- No exponer datos de otros tenants al consultar un `jobId`.

**Gate:** jobs duplicados no producen doble cobro ni doble procesamiento; los jobs fallidos son recuperables y trazables.

### Fase 4: pool de workers de analisis

**Objetivo:** aumentar capacidad sin convertir Embassy en un proceso monolitico unico.

Acciones:

- Extraer el procesamiento de jobs a workers identificables.
- Definir ownership de worker, leases y heartbeat.
- Hacer que los workers sean stateless salvo caches locales acotadas.
- Separar workers CPU, ML y trabajos de dataset.
- Aplicar limites de concurrencia por recurso, no solo por proceso.
- Diseñar shutdown y reanudacion de jobs en vuelo.
- Evitar que dos workers escriban el mismo job sin fencing o versionado.
- Mantener el Embassy actual como coordinador o migrar progresivamente a un servicio de jobs.

**Gate:** matar un worker durante un job no deja jobs eternamente bloqueados ni resultados inconsistentes.

### Fase 5: escalado ML

**Objetivo:** que ML no sea el cuello de botella oculto.

Opciones, en orden conservador:

1. Semaforo y metricas sobre el worker actual.
2. Multiples workers Python por Embassy, solo si CPU y memoria lo permiten.
3. Pool dedicado de workers ML consumiendo una cola especifica.
4. Servicio ML separado con health, readiness, version de modelo y autoscaling.

Cada opcion debe medir memoria por modelo, throughput, latencia, precision y coste. Nunca se debe duplicar el modelo sin reservar memoria y sin definir como se actualiza la version.

**Gate:** el p95 de inferencia y el RSS permanecen dentro del presupuesto bajo la carga objetivo.

### Fase 6: datos y dependencias

**Objetivo:** evitar que MongoDB o Redis se conviertan en el nuevo limite.

Acciones:

- Revisar indices, pool de conexiones y consultas lentas de MongoDB.
- Separar resultados calientes de historicos y definir TTL/retencion.
- Configurar Redis con limites de memoria, politica de eviction y persistencia apropiada.
- No guardar imagenes completas en Redis.
- Probar perdida temporal de Redis y reconexion.
- Probar MongoDB lento, timeout y reconexion.
- Definir backup, restore y prueba periodica de restauracion.

**Gate:** la carga objetivo no degrada las dependencias por encima de sus limites y existe un comportamiento definido ante su indisponibilidad.

### Fase 7: seguridad y aislamiento Enterprise

**Objetivo:** escalar sin multiplicar el riesgo.

Acciones:

- Rotar todas las credenciales historicamente expuestas.
- Secret manager o permisos estrictos para `.env`.
- Rate limit por tenant, usuario e IP.
- Cuotas de almacenamiento y peticiones.
- Validacion real de contenido, no solo extension/MIME.
- Aislamiento de inputs temporales y limpieza garantizada.
- Auditoria de dependencias y eliminacion de paquetes innecesarios.
- Pruebas de abuso: archivos enormes, jobs masivos, reintentos, IDs ajenos y payloads malformados.
- Revisar CORS, JWT, logs, retencion y borrado de datos.

**Gate:** auditoria de seguridad completada, sin vulnerabilidades criticas o altas sin remediar o aceptar formalmente, y pruebas de autorizacion entre tenants satisfactorias. Con la auditoria del 2026-09-09, este gate queda pendiente.

### Fase 8: prueba de carga y certificacion

**Objetivo:** declarar una capacidad soportada, no una intuicion.

Escenarios:

- carga constante durante 30 minutos;
- picos de 5 minutos;
- mezcla 80/20 entre analisis sincrono y asincrono;
- imagenes pequenas, medianas y grandes;
- ML caliente y reinicio controlado;
- Redis lento o temporalmente caido;
- MongoDB con latencia inducida;
- worker terminado durante jobs.

Registrar:

- throughput sostenido;
- p50/p95/p99;
- tasa de 2xx, 4xx, 5xx, 429 y timeout;
- memoria y CPU por proceso;
- profundidad y edad de colas;
- latencia de MongoDB y Redis;
- errores por celula;
- perdida o duplicacion de jobs;
- tiempo de recuperacion.

La certificacion debe declarar: capacidad sostenida, pico tolerado, tamano maximo de imagen, SLO, hardware, version de codigo y limitaciones.

## 5. Orden recomendado de ejecucion

1. Medir linea base.
2. Añadir limites, semaforos y timeouts.
3. Instrumentar metricas y alertas.
4. Construir endpoint asincrono con jobs pequenos y reintentables.
5. Separar colas por prioridad.
6. Extraer y escalar workers.
7. Optimizar ML, MongoDB y Redis.
8. Ejecutar pruebas de fallo y carga.
9. Auditar seguridad y dependencias.
10. Publicar capacidad soportada y actualizar SLOs.

## 6. Criterios de salida Enterprise

No declarar alta concurrencia certificada hasta cumplir todos:

- SLO medido durante una ventana representativa.
- p95 y p99 dentro del objetivo en la carga declarada.
- Sin crecimiento ilimitado de memoria.
- Backpressure y `429` funcionando.
- Jobs asincronos idempotentes y recuperables.
- ML escalable o con capacidad maxima conocida.
- Redis y MongoDB monitorizados y probados.
- Rollback probado.
- Restauracion probada desde backup.
- Auditoria de seguridad completada y certificacion de seguridad aprobada.
- Dependencias auditadas.
- Runbooks actualizados.

## 7. Rollout y rollback

### Rollout

- activar primero limites y metricas;
- desplegar endpoint async oculto o para un tenant de prueba;
- usar feature flag para colas y workers;
- probar con 1%, 5%, 25% y 100% del trafico elegible;
- comparar SLO, coste y calidad del veredicto en cada etapa;
- detener la expansion ante errores, p99 o memoria fuera de presupuesto.

### Rollback

- desactivar feature flag async o devolver trabajos a `queued`;
- mantener la ruta sincrona directa como fallback limitado;
- drenar o pausar colas antes de reiniciar workers;
- conservar resultados ya completados;
- revertir codigo sin borrar modelo, dataset ni datos de auditoria;
- ejecutar health, smoke test y una prueba E2E posterior.

## 8. Responsables y entregables

| Area | Entregable | Criterio |
|---|---|---|
| Backend | limites, cuotas y endpoint async | contratos y tests |
| Engine | workers, idempotencia y timeouts | jobs recuperables |
| ML | pool y versionado de modelo | p95/RSS conocidos |
| Plataforma | Redis, MongoDB, PM2 y backups | fallo probado |
| Seguridad | secretos, auth y abuso | auditoria sin criticos |
| QA/SRE | carga, dashboards y runbooks | capacidad publicada |
| Producto | politicas de retencion y UX de jobs | cliente informado |

## 9. Resultado esperado

Al finalizar, Dragon3 tendra dos productos operativos distintos:

- **Analisis sincrono:** rapido, limitado, interactivo y protegido por backpressure.
- **Analisis asincrono:** escalable, observable, reintentable y apropiado para cargas pesadas o masivas.

La capacidad final debe expresarse como una cifra validada, por ejemplo: "N analisis/minuto con imagenes de hasta X MB, p95 <= Y s, error rate <= Z%, durante W minutos", junto con sus condiciones y limites.
