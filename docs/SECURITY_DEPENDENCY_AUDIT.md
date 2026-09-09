# Auditoria de dependencias npm

**Fecha del informe:** 2026-09-09
**Alcance:** dependencias de produccion de `backend` y `engine`
**Metodo:** `npm audit --omit=dev --json`

## Resumen ejecutivo

La auditoria identifico vulnerabilidades conocidas en las dependencias de produccion:

| Componente | Total | Criticas | Altas | Moderadas | Bajas |
|---|---:|---:|---:|---:|---:|
| Backend | 30 | 1 | 24 | 4 | 1 |
| Engine | 4 | 0 | 1 | 3 | 0 |

La certificacion de seguridad queda pendiente hasta remediar o aceptar formalmente los
riesgos, especialmente la vulnerabilidad critica del backend y la vulnerabilidad alta
del engine. Esta auditoria no cambia por si sola el estado funcional del sistema ni
certifica la ausencia de explotabilidad en el entorno desplegado.

## Paquetes afectados

### Backend

El informe senalo los siguientes paquetes o modulos afectados:

- `brain.js`
- `gpu-mock.js`
- `gpu.js`
- `gl`
- `nodemailer`
- `onnxruntime-node`
- `puppeteer`
- `puppeteer-core`
- `qs`
- `sharp`
- `tar`
- `uuid`
- `ws`

### Engine

- `bull`
- `qs`
- `sharp`
- `uuid`

Los paquetes se enumeran como aparecen asociados a los hallazgos del informe. La
version afectada, la version corregida y la ruta de dependencia deben confirmarse en
el JSON completo de cada proyecto antes de actualizar.

## Decision sobre `npm audit fix`

No se aplico `npm audit fix` automaticamente. No se modificaron `package.json` ni
los lockfiles.

La razon es que una correccion automatica puede cambiar rangos, lockfiles y versiones
transitivas sin validar los contratos de procesamiento de imagen, GPU, ML, navegador,
correo, colas y websocket. Un `npm audit fix --force` puede introducir cambios
mayores, incompatibilidades de API, cambios de comportamiento o una regresion dificil
de aislar en produccion. La remediacion debe hacerse de forma controlada y por lotes.

## Riesgos principales

- **Backend:** la vulnerabilidad critica y las 24 altas requieren prioridad maxima;
  el impacto potencial incluye ejecucion de codigo, inyeccion, denegacion de servicio,
  acceso no autorizado o corrupcion de datos, segun el aviso concreto y la ruta de
  exposicion.
- **Engine:** `bull`, `qs`, `sharp` y `uuid` participan en colas, parseo y
  procesamiento. Una actualizacion incompatible puede afectar jobs, resultados o
  consumo de recursos.
- **Cadena de dependencias:** `puppeteer`, `puppeteer-core`, `gl`, `gpu.js`,
  `brain.js`, `onnxruntime-node` y `sharp` pueden depender de binarios nativos,
  modelos, ABI del sistema o versiones concretas de Node.js.
- **Operacion:** cambios simultaneos en backend y engine dificultan atribuir fallos,
  comparar metricas y ejecutar rollback selectivo.

## Mitigaciones actuales

Mientras la remediacion esta pendiente, se mantienen estas medidas operativas ya
disponibles en el sistema:

- limites de concurrencia y backpressure en la ruta sincrona;
- timeouts hacia los servicios de analisis y respuesta `429` con `Retry-After` al
  agotar la capacidad local;
- endpoint asincrono con cola separada, idempotencia, TTL, reintentos acotados y
  ownership de jobs;
- worker asincrono separado del Embassy HTTP y concurrencia configurable;
- metricas de peticiones, latencia, estados HTTP, analisis activos y rechazos por
  capacidad;
- despliegue gradual con feature flags, health checks, smoke tests y rollback
  operativo documentado;
- no incorporar cambios de dependencias durante esta auditoria: el estado instalado
  permanece reproducible con los artefactos actuales.

Estas medidas reducen superficie y limitan impacto operativo, pero no sustituyen la
actualizacion de una dependencia vulnerable ni constituyen una aceptacion formal del
riesgo.

## Prioridades de remediacion

1. **P0:** identificar el aviso, la ruta de exposicion y la version corregida de la
   vulnerabilidad critica del backend. Aplicar primero una version compatible o aislar
   temporalmente la funcionalidad afectada.
2. **P1:** resolver las 24 vulnerabilidades altas del backend y la alta del engine,
   empezando por dependencias expuestas a entradas no confiables, red, archivos,
   navegador o ejecucion de codigo.
3. **P2:** corregir las cuatro moderadas del backend y las tres moderadas del engine.
4. **P3:** corregir la baja restante y retirar dependencias que no tengan uso real,
   tras confirmar que no son necesarias en produccion.

La prioridad final de cada aviso debe considerar CVSS, explotacion conocida,
exposicion real, disponibilidad de parche y compatibilidad con Dragon3.

## Plan de actualizacion por lotes

Cada lote debe ejecutarse en una rama o despliegue versionado, conservar los artefactos
anteriores y registrar versiones, avisos resueltos, avisos aceptados y resultados de
pruebas.

### Lote 0: preparacion

- guardar el JSON de auditoria y el inventario de versiones actual;
- confirmar Node.js, plataforma, ABI y requisitos de binarios nativos;
- reproducir smoke tests de backend, engine, colas, ML, imagenes, navegador y
  websocket;
- preparar un rollback a los artefactos y lockfiles previos.

### Lote 1: parches de bajo riesgo

Actualizar primero dependencias con cambios compatibles y avisos corregidos sin salto
mayor, priorizando `qs`, `uuid`, `tar` y `ws` cuando el informe confirme una version
segura compatible. Ejecutar tests unitarios, integracion de API, autorizacion,
serializacion, websocket, smoke E2E y `npm audit --omit=dev --json`.

### Lote 2: imagen y procesamiento nativo

Tratar `sharp`, `gl`, `gpu.js` y `gpu-mock.js` en un lote controlado. Validar lectura,
transformacion y limites de imagen, memoria, concurrencia, resultados de GPU/CPU y
arranque en el mismo entorno de produccion. Comparar latencia, RSS y errores con la
linea base.

### Lote 3: ML, navegador y correo

Actualizar `brain.js`, `onnxruntime-node`, `puppeteer`, `puppeteer-core` y
`nodemailer` segun sus rutas y versiones corregidas. Validar carga de modelos,
inferencia, captura o renderizado, sandbox, envio de correo, timeouts, limpieza de
recursos y compatibilidad del runtime.

### Lote 4: engine y colas

Actualizar `bull`, junto con las versiones compartidas de `qs`, `sharp` y `uuid` que
correspondan al engine. Validar enqueue/dequeue, reintentos, idempotencia, progreso,
cancelacion, jobs en vuelo, Redis, worker asincrono y recuperacion tras reinicio.

### Lote 5: certificacion

Repetir la auditoria en backend y engine, revisar avisos residuales y documentar toda
aceptacion temporal. Ejecutar tests completos, prueba de carga representativa,
pruebas de fallo y una ventana de observacion antes de retirar el bloqueo de
certificacion.

## Criterio de rollback

Detener el lote y volver al artefacto anterior si aparece una regresion funcional,
un aumento no explicado de errores o latencia, crecimiento de memoria, jobs perdidos
o duplicados, fallos de arranque, incompatibilidad de ABI, degradacion de precision
ML o una nueva exposicion de seguridad. El rollback debe restaurar conjuntamente el
codigo, `node_modules` reproducible y lockfile del lote anterior, sin borrar datos ni
resultados ya completados. Despues se ejecutan health checks, smoke tests y una prueba
E2E antes de reabrir trafico.

## Estado y restricciones

- Auditoria realizada: 2026-09-09.
- Vulnerabilidades pendientes de remediacion o aceptacion formal.
- Certificacion de seguridad pendiente.
- No se modificaron `package.json` ni lockfiles como parte de este documento.
- No se hizo commit ni push.