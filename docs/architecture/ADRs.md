# Architecture Decision Records

## ADR-001: Separar backend HTTP y Embassy

- **Estado:** aceptado.
- **Contexto:** el servidor frontal necesita escalar peticiones HTTP sin duplicar el motor, el worker ML y sus consumidores.
- **Decision:** backend en cluster; Embassy en una instancia fork.
- **Consecuencias:** el backend escala horizontalmente; Embassy requiere cuidado especial ante failover y no debe duplicarse sin diseño de locks/caches.
- **Alternativas:** ejecutar todo en un proceso; descartada por acoplamiento y peor aislamiento.

## ADR-002: Paralelismo directo para análisis síncrono

- **Estado:** aceptado.
- **Contexto:** poner todas las células en Bull añadió decenas de segundos de latencia y serializó fases.
- **Decision:** `USE_CELL_QUEUE=false` en la ruta síncrona; `Promise.all` para señales independientes.
- **Consecuencias:** baja latencia warm; la presión de concurrencia debe controlarse con límites y un endpoint async separado.
- **Alternativas:** Bull para cada célula; descartada para hot path.

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
