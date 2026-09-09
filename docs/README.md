# Dragon3 Documentation

## Normativa

- [System Documentation](SYSTEM_DOCUMENTATION.md): manual maestro de arquitectura, desarrollo, seguridad y operación.
- [C4 Architecture](architecture/C4.md): contexto, contenedores, componentes y flujos.
- [Architecture Decision Records](architecture/ADRs.md): decisiones con contexto, alternativas y consecuencias.
- [Service SLOs](operations/SLO.md): SLIs, objetivos, alertas y error budget.
- [OpenAPI](api/openapi.yaml): contrato HTTP versionable para integradores.
- [High Concurrency Plan](../HIGH_CONCURRENCY_PLAN.md): fases, gates, workers, carga y certificacion.

## Como leerla

1. Empieza por `SYSTEM_DOCUMENTATION.md` para el modelo completo.
2. Usa `C4.md` para orientarte en los limites del sistema.
3. Consulta `openapi.yaml` antes de integrar un cliente.
4. Consulta `SLO.md` y los runbooks antes de operar produccion.
5. Registra cambios arquitectonicos en `ADRs.md`.
