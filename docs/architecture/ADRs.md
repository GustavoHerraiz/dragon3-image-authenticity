# Architecture Decision Records

## ADR-001: Separar backend HTTP y Embassy

- **Estado:** aceptado.
- **Contexto:** el servidor frontal necesita escalar peticiones HTTP sin duplicar el motor, el worker ML y sus consumidores.
- **Decision:** backend en cluster; Embassy en una instancia fork.
- **Consecuencias:** el backend escala horizontalmente; Embassy requiere cuidado especial ante failover y no debe duplicarse sin diseño de locks/caches.
- **Alternativas:** ejecutar todo en un proceso; descartada por acoplamiento y peor aislamiento.

## ADR-002: Paralelismo controlado para análisis síncrono

- **Estado:** aceptado.
- **Contexto:** poner todas las células en Bull añadió decenas de segundos de latencia y serializó fases.
- **Decision:** las células ligeras independientes usan `Promise.all`; las células Sharp pesadas se excluyen de ese lote y pasan siempre por `celula:cola` en Bull/Redis DB 2 con worker serial de concurrencia efectiva `1`. Los trabajos completos asíncronos usan una cola independiente en Redis DB 3.
- **Consecuencias:** se conserva baja latencia warm para señales ligeras y se limita la presión de CPU/memoria de Sharp bajo carga; la ruta síncrona debe monitorizar profundidad de cola, RSS y latencia.
- **Alternativas:** Bull para cada célula, descartada por latencia innecesaria; `Promise.all` también para Sharp, descartada por presión de recursos y riesgo de degradación.

## ADR-003: Worker ML persistente

- **Estado:** aceptado.
- **Contexto:** cargar Python/modelo en cada imagen es costoso e inestable bajo carga.
- **Decision:** proceso Python persistente, protocolo una línea de entrada por una línea JSON de salida.
- **Consecuencias:** menor latencia warm; hay que monitorizar timeout, stderr, memoria y shutdown.
- **Alternativas:** spawn por petición; descartada por cold start y coste.

## ADR-004: Preservar `raw_data` forense acotado

- **Estado:** aceptado.
- **Contexto:** purgar todo el resultado dejó la explicación del cliente sin evidencia, pero conservar buffers provocó riesgo OOM.
- **Decision:** eliminar binarios y matrices pesadas, conservar `raw_data` estructurado y limitado.
- **Consecuencias:** mejor explicabilidad; cada nueva célula debe respetar límites de tamaño y privacidad.

## ADR-005: Modelos y datasets fuera de Git

- **Estado:** aceptado.
- **Contexto:** modelos, datasets, logs y secretos son grandes o sensibles.
- **Decision:** versionar código, contratos y metadatos; restaurar artefactos mediante runbook y rutas externas.
- **Consecuencias:** el backup debe cubrir artefactos externos y la restauración debe probar una inferencia real.

## ADR-006: Planes declarativos JSON

- **Estado:** aceptado.
- **Contexto:** las señales deben componerse y ordenarse sin reescribir el orquestador.
- **Decision:** planes con IDs, rutas internas y referencias `$.` para dependencias.
- **Consecuencias:** se requiere validación de ciclos, rutas, IDs y contratos antes de activar un plan.

## Plantilla para nuevas decisiones

```text
## ADR-NNN: Titulo
- Estado: propuesta | aceptado | reemplazado | rechazado
- Contexto:
- Decision:
- Alternativas:
- Consecuencias:
- Plan de migracion:
- Rollback:
- Evidencia/tests:
```
