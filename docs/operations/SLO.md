# SLOs, SLIs y error budget

> Estos son objetivos operativos iniciales. Deben calibrarse con una prueba de carga representativa y datos de 7-14 días.

## Alcance

Aplica al análisis síncrono HTTP del backend y Embassy. No mezcla dataset watcher ni trabajos Bull asincrónicos.

## SLIs

- **Disponibilidad:** respuestas HTTP no 5xx / total de peticiones válidas.
- **Latencia:** tiempo desde recepción del upload hasta respuesta final; reportar p50, p95 y p99.
- **Completitud:** análisis con estado `completado` o `completado_con_advertencias` / análisis aceptados.
- **Integridad:** respuestas con `correlationId`, veredicto, tiempos y estructura esperada.
- **Estabilidad:** reinicios inesperados de PM2 por ventana.
- **Worker ML:** predicciones completadas dentro del timeout / predicciones solicitadas.

## Objetivos iniciales

| SLO | Objetivo | Ventana | Presupuesto |
|---|---:|---:|---:|
| Disponibilidad | 99.5% | 30 días | 3 h 36 min |
| Completitud | 99.0% | 30 días | 7 h 12 min |
| Integridad de respuesta | 99.9% | 30 días | 43 min |
| p95 warm | <= 2 s | 7 días | calibrar |
| p99 warm | <= 5 s | 7 días | calibrar |
| ML dentro de timeout | 99.0% | 7 días | 1% |

`warm` significa que Embassy y el worker ML ya están iniciados. Cold start se reporta por separado.

## Alertas recomendadas

- disponibilidad < 99.5% en ventana móvil de 30 minutos;
- p95 por encima del objetivo durante 10 minutos;
- dos reinicios del mismo proceso en 15 minutos;
- RSS > 80% del límite PM2 durante 10 minutos;
- errores ML > 1% durante 10 minutos;
- cola Bull creciendo durante 15 minutos;
- MongoDB o Redis sin conexión.

## Política de error budget

Mientras exista presupuesto, se pueden priorizar funcionalidades. Cuando se consume más del 50%, congelar cambios no esenciales y priorizar fiabilidad. Con presupuesto agotado, solo desplegar correcciones, seguridad y mitigaciones hasta recuperar el SLO.

## Instrumentación mínima

Cada evento debe incluir `timestamp`, `correlationId`, endpoint, `planId`, estado, latencia total, tiempos por célula, instancia/PID y error clasificado. Nunca incluir imagen completa, base64, JWT, URI de MongoDB o contraseñas.

## Revisión

Los objetivos no son una certificación de rendimiento. Tras la prueba de carga pendiente, actualizar esta tabla con capacidad sostenida, tamaño de imagen probado, concurrencia, hardware y percentiles observados.
