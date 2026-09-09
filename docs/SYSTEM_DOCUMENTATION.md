# Dragon3 System Documentation

> Documento maestro de arquitectura, desarrollo, operacion y recuperacion.
> Version documental: 1.0 | Estado: propuesta operativa | Audiencia: ingenieria, SRE, seguridad, soporte y clientes tecnicos.

## 1. Proposito y alcance

Dragon3 es una plataforma de analisis de autenticidad de imagenes. Recibe una imagen, ejecuta un plan de analisis compuesto por celulas independientes, combina evidencias heterogeneas y devuelve un veredicto explicable con telemetria, trazabilidad y datos forenses.

Este documento es el mapa principal del sistema. Los documentos especializados siguen siendo normativos para su area:

- [README.md](../README.md): introduccion y alcance.
- [CLIENT_README.md](../CLIENT_README.md): integracion para consumidores.
- [SECURITY.md](../SECURITY.md): controles y politica de seguridad.
- [HIGH_LOAD.md](../HIGH_LOAD.md): perfil de carga y escalado.
- [PRODUCTION_LAYOUT.md](../PRODUCTION_LAYOUT.md): distribucion de produccion.
- [RESTORE_RUNBOOK.md](../RESTORE_RUNBOOK.md): restauracion ante perdida.
- [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md): lista de salida a produccion.
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md): reglas de desarrollo y repositorio.
- [dev/celulas/README.md](../dev/celulas/README.md): contexto del motor experimental.
- [docs/README.md](README.md): indice de la documentacion avanzada.
- [architecture/C4.md](architecture/C4.md): vistas C4 y flujos de secuencia.
- [architecture/ADRs.md](architecture/ADRs.md): decisiones arquitectonicas registradas.
- [operations/SLO.md](operations/SLO.md): SLIs, SLOs, alertas y error budget.
- [operations/SHARP_QUEUE_RUNBOOK.md](operations/SHARP_QUEUE_RUNBOOK.md): política y operación de la cola serial para células Sharp.
- [operations/LOAD_TEST_2026-09-09.md](operations/LOAD_TEST_2026-09-09.md): resultados y cuellos detectados en la prueba de carga escalonada.
- [api/openapi.yaml](api/openapi.yaml): contrato OpenAPI de los endpoints frontales.
- [HIGH_CONCURRENCY_PLAN.md](../HIGH_CONCURRENCY_PLAN.md): plan de implantacion de alta concurrencia.

Cuando exista una diferencia entre este documento y el codigo ejecutado, prevalecen, en este orden: codigo desplegado, configuracion efectiva del proceso, plan cargado, tests de contrato y documentacion.

## 2. Principios de diseno

1. **Evidencia antes que intuicion.** Cada conclusion debe poder rastrearse a una o mas celulas y a sus datos de salida.
2. **Independencia de señales.** El veredicto combina metadatos, forense, sellos, estadistica de imagen, consistencia multimodal y ML; una sola señal no debe dominar sin justificacion.
3. **Degradacion controlada.** Si una celula falla, el sistema conserva el resto de evidencias, marca la celula como fallida y evita fabricar una certeza.
4. **Explicabilidad por contrato.** La respuesta debe explicar veredicto, confianza, evidencias, limitaciones y necesidad de revision humana.
5. **Separacion de responsabilidades.** El backend atiende HTTP; Embassy ejecuta el motor; el worker Python atiende ML; MongoDB conserva resultados; Redis/Bull queda reservado para trabajo asincrono o pesado.
6. **Produccion reproducible.** Los modelos, secretos, datasets y logs operativos viven fuera del repositorio cuando son grandes o sensibles.
7. **Cambios pequenos y verificables.** Toda nueva celula debe incluir contrato, test aislado, plan actualizado, catalogo y evidencia de rendimiento.

## 3. Mapa del sistema

```text
Cliente
  |
  v
Backend HTTP :3000
  |  autenticacion, subida, limites, adapter de respuesta
  v
Embassy :3002
  |  seleccion de plan y defensa
  v
Orquestador
  |-- cargar-imagen (secuencial)
  |-- celulas ligeras independientes (Promise.all)
  |-- celulas Sharp pesadas --> Bull/Redis DB 2 (worker serial)
  |-- celulas dependientes (orden topologico)
  |-- generar-veredicto
  |
  |-- celula-ml --> worker Python persistente --> modelo XGBoost
  |-- Bull/Redis (trabajo asincrono/heavy, no hot path sincrono)
  |-- MongoDB (resultados y persistencia)
  |-- telemetria local (metricas y diagnostico)
  v
Adapter FAANG
  |
  v
Respuesta explicable al cliente
```

### 3.1 Limites de despliegue

- `prod/Dragon3/backend`: servidor HTTP frontal y proxy.
- `prod/Dragon3/engine`: runtime de Embassy, orquestador, celulas, planes, servicios, telemetria y ML.
- `prod/Dragon3/frontend`: cliente web.
- `prod/Dragon3/data/dataset`: dataset operativo; no se versiona en Git.
- `dev/`: laboratorio, herramientas, desktop, camara, pruebas y experimentos.
- `shared/`: activos compartidos y backups, sujetos a la politica de retencion.

En produccion se ejecutan normalmente dos instancias cluster del backend, una instancia de Embassy y una del watcher de dataset. Embassy es una sola instancia porque mantiene un worker ML persistente, consumidores Redis y caches en memoria.

## 4. Modelo de ejecucion

### 4.1 Peticion sincrona

1. El cliente envia una imagen y un identificador de plan.
2. El backend autentica, valida el fichero y crea un `correlationId`.
3. Embassy selecciona el plan y crea el contexto de ejecucion.
4. El orquestador carga la imagen y calcula hash, formato y dimensiones.
5. Las celulas ligeras sin dependencias se ejecutan en paralelo.
6. Las celulas pesadas que usan Sharp se separan del lote paralelo y pasan por Bull en Redis DB 2 con worker serial.
7. Las celulas que consumen resultados anteriores se ejecutan despues de sus dependencias.
8. El veredicto agrega evidencias y calcula confianza.
9. El adapter elimina buffers y campos binarios de la respuesta publica, conserva `raw_data` forense seguro y genera `explicacionCliente`.
10. Se persiste el resultado y se devuelve una respuesta trazable.

### 4.2 Seleccion de plan

El orden esperado es: plan explicito valido, `planId`, lista de celulas autorizadas, tipo de archivo y plan por defecto. Un plan debe ser determinista, versionable y revisable. No se deben aceptar rutas arbitrarias del cliente.

### 4.3 Estado y errores

Estados publicos recomendados:

- `completado`: el plan finalizo y produjo veredicto.
- `completado_con_advertencias`: hubo celulas fallidas o datos incompletos.
- `rechazado`: entrada invalida, no autorizada o incompatible.
- `error`: fallo de infraestructura o contrato que impide un resultado confiable.

Una celula nunca debe convertir una excepcion silenciosa en una evidencia positiva. Debe devolver o propagar un fallo estructurado y el orquestador debe conservar la trazabilidad.

## 5. Contratos de datos

### 5.1 Contexto de entrada de una celula

```js
{
  payload: {},
  contexto: {
    correlationId: "uuid",
    archivo: {},
    planConfig: {},
    resultados: {}
  },
  metadatos: {
    tipoArchivo: "image/jpeg",
    nombreOriginal: "imagen.jpg",
    hash: "sha256"
  }
}
```

La forma exacta puede variar segun el plan. La celula debe leer unicamente las entradas declaradas por el plan y tolerar campos opcionales ausentes.

### 5.2 Salida minima obligatoria

```js
{
  exito: true,
  resultado: {
    decision: "HUMANO_CONSISTENTE",
    confianza: 0.91,
    explicacion: "...",
    evidencias: []
  },
  metricas: {
    tiempoMs: 12
  },
  raw_data: {}
}
```

Requisitos:

- La salida debe ser un objeto.
- Debe contener `resultado`.
- `exito`, si existe, debe ser booleano.
- `resultado` debe ser serializable a JSON.
- Nunca incluir `Buffer`, base64 completo, matrices gigantes o secretos en la respuesta publica.
- `raw_data` debe contener solo datos forenses utiles y acotados.
- Las probabilidades deben estar en `[0, 1]`; los porcentajes publicos deben documentar su conversion.
- Las decisiones desconocidas deben expresarse como `INDETERMINADO`, no como `false` por defecto.

### 5.3 Respuesta publica

La respuesta adaptada debe incluir, como minimo:

```json
{
  "correlationId": "uuid",
  "resultado": {
    "estado": "completado",
    "veredicto": {},
    "explicacionCliente": {
      "resumen": "...",
      "veredicto": "...",
      "nivelConfianza": "alto",
      "evidencias": [],
      "limitaciones": [],
      "requiereRevisionHumana": false
    },
    "detalles": {
      "analizadores": {}
    },
    "metadata": {
      "processingTime": 426,
      "planId": "analizar-imagen-completa"
    }
  }
}
```

No se debe prometer autenticidad absoluta. Dragon3 expresa una conclusion probabilistica basada en señales disponibles y debe mantener revision humana para casos conflictivos, baja confianza o impacto alto.

## 6. Anatomia de una celula

Una celula es una unidad pequena, determinista y observable de analisis. Debe hacer una sola cosa bien. No debe conocer Express, MongoDB, PM2 ni detalles de transporte HTTP.

### 6.1 Plantilla recomendada

```js
export default async function detectarMiSenal(entrada, contexto = {}) {
  const inicio = Date.now();

  try {
    const payload = entrada?.payload ?? entrada;
    if (!payload) {
      return {
        exito: false,
        resultado: {
          decision: "INDETERMINADO",
          confianza: 0,
          explicacion: "No se recibieron datos suficientes"
        },
        metricas: { tiempoMs: Date.now() - inicio },
        raw_data: { motivo: "payload_ausente" }
      };
    }

    const senal = calcularSenal(payload);
    return {
      exito: true,
      resultado: {
        decision: senal.decision,
        confianza: senal.confianza,
        explicacion: senal.explicacion,
        evidencias: senal.evidencias || []
      },
      metricas: { tiempoMs: Date.now() - inicio },
      raw_data: senal.rawData || {}
    };
  } catch (error) {
    return {
      exito: false,
      resultado: {
        decision: "INDETERMINADO",
        confianza: 0,
        explicacion: "La celula no pudo completar el analisis"
      },
      metricas: { tiempoMs: Date.now() - inicio },
      raw_data: { error: error.code || "CELL_EXECUTION_ERROR" }
    };
  }
}
```

La plantilla es orientativa. Los nombres de campos deben alinearse con el adapter y con celulas vecinas. El codigo real debe evitar registrar imagenes, secretos o payloads completos.

### 6.2 Reglas de calidad de una celula

- Nombre en kebab-case, estable y descriptivo.
- Funcion exportada con una unica responsabilidad.
- Entradas y salidas documentadas.
- Sin estado global mutable salvo caches acotadas y justificadas.
- Tiempo y memoria acotados.
- Timeout para IO o procesos externos.
- Manejo explicito de imagen corrupta, formato no soportado y datos ausentes.
- Resultado reproducible con la misma entrada y configuracion.
- Evidencias legibles para cliente y `raw_data` estructurado para ingenieria.
- Sin dependencias circulares.
- Sin rutas absolutas de laboratorio en produccion.
- Sin logs de base64, buffers, credenciales ni datos personales.

## 7. Como construir y anadir una celula

Este es el procedimiento normativo para una contribucion nueva.

### Paso 1: definir la senal

Especificar el problema que resuelve, que no resuelve, entradas, salida, falsos positivos esperados, coste, nivel de confianza y si la senal es independiente o depende de otra celula.

Crear una breve ficha:

```text
ID: detectar-mi-senal
Owner: equipo/persona
Entrada: $.cargar-imagen.resultado
Salida: decision, confianza, evidencias, raw_data
Dependencias: cargar-imagen
Coste esperado: < 50 ms warm
Datos sensibles: ninguno / descripcion
Fallback: INDETERMINADO
```

### Paso 2: implementar la celula

Crear el archivo en `dev/celulas/celulas/` siguiendo el contrato. Mantener la implementacion pequena. Extraer utilidades comunes solo si ya existe un patron compartido y el cambio no introduce acoplamiento innecesario.

### Paso 3: escribir pruebas aisladas

La prueba debe cubrir al menos:

- entrada valida positiva;
- entrada valida negativa;
- imagen o payload corrupto;
- campos ausentes;
- limites numericos;
- decision indeterminada;
- tiempo y forma del contrato;
- ausencia de binarios gigantes en la salida;
- determinismo en dos ejecuciones.

Usar `dev/celulas/test/celulas-verificacion.js` como referencia y anadir un caso especifico cuando la celula tenga logica no trivial. Las pruebas deben ser pequenas y no iniciar servidores ni consumir datasets completos.

### Paso 4: registrar el catalogo

Anadir la celula a `dev/celulas/celulas/index.json` o usar el helper de catalogo existente. Documentar:

- `id`;
- ruta;
- descripcion;
- entrada esperada;
- salida producida;
- peso inicial y razon;
- si es publica;
- coste esperado;
- version del contrato.

Verificar que `GET /agent/catalogo` la devuelve y que no se filtran rutas sensibles.

### Paso 5: anadirla a un plan

Editar un plan JSON solo con una razon funcional clara. Declarar `id`, `ruta`, `entrada` y dependencias mediante referencias `$.`. No insertar una celula en el plan completo si necesita resultados que aun no existen.

Ejemplo:

```json
{
  "id": "detectar-mi-senal",
  "ruta": "./celulas/detectar-mi-senal.js",
  "entrada": {
    "payload": "$.cargar-imagen.resultado"
  }
}
```

La ruta en produccion debe resolverse dentro de `prod/Dragon3/engine`. Nunca aceptar una ruta controlada por el cliente.

### Paso 6: actualizar el runtime de produccion

El flujo soportado es regenerar o copiar el runtime mediante `prod/Dragon3/scripts/prepare-production-engine.sh`, revisar cuidadosamente el diff y confirmar que se conserva cualquier ajuste manual de produccion. No ejecutar el script a ciegas: puede sobrescribir diferencias entre `dev` y `prod`.

Comprobar:

```bash
cd /opt/dragon3
node --check prod/Dragon3/engine/celulas/detectar-mi-senal.js
node --check prod/Dragon3/engine/orquestador.js
```

### Paso 7: validar contratos y endpoints

```bash
cd /opt/dragon3/dev/celulas
npm test /ruta/a/imagen-de-prueba.jpg

curl -fsS http://127.0.0.1:3012/agent/catalogo
curl -fsS http://127.0.0.1:3012/agent/planes
```

Ejecutar tambien una peticion E2E al backend y confirmar que la nueva celula aparece en `resultado.detalles.analizadores` con `exitoso`, tiempo, decision y datos forenses esperados.

### Paso 8: medir rendimiento y memoria

Medir en frio y en caliente. Registrar p50, p95, p99, RSS del proceso, heap, tamaño de respuesta y errores. Una celula lenta no debe entrar en el camino sincrono sin una justificacion. Si requiere un proceso externo, cache o modelo, evaluar Bull/Redis y un endpoint asincrono.

### Paso 9: revisar seguridad

Confirmar que la celula no ejecuta comandos derivados de entrada, no escribe fuera de directorios permitidos, no expone secretos, no conserva archivos temporales indefinidamente y no devuelve datos personales sin necesidad.

### Paso 10: documentar y desplegar

Actualizar el catalogo, el plan, el changelog y cualquier documento de API. Hacer commit atomico con pruebas. Desplegar primero en una instancia o entorno de staging, observar metricas, ejecutar smoke test y despues reiniciar PM2 con rollback preparado.

## 8. Planes y dependencias

Un plan es un grafo dirigido aciclico. Cada referencia `$.celula.resultado` crea una dependencia. El orquestador debe ejecutar en orden topologico y paralelizar solo nodos independientes.

Reglas:

- no ciclos;
- no IDs duplicados;
- cada referencia apunta a un nodo existente;
- el plan declara version;
- las salidas finales apuntan a campos reales;
- cualquier cambio de contrato requiere version o migracion;
- el plan completo no debe incluir celulas experimentales sin flag explicito;
- un plan limitado debe producir una respuesta honesta, con sus limitaciones.

Planes conocidos: completo, limitado, sin ML y especializados. La lista efectiva debe verificarse mediante `GET /agent/planes` en el entorno desplegado.

## 9. API y seguridad de acceso

### 9.1 Endpoints operativos

- `GET /health`: salud basica del servicio.
- `GET /agent/catalogo`: catalogo publico filtrado.
- `GET /agent/planes`: planes disponibles.
- `POST /agent/execute`: ejecucion del motor; requiere autenticacion segun configuracion.
- `POST /analizar-imagen-publico` o endpoint frontal equivalente: subida y analisis para cliente.

Los nombres exactos del endpoint frontal deben comprobarse en el backend desplegado; no se deben inventar rutas en integraciones.

### 9.2 Controles obligatorios

- JWT con secreto solo por variable de entorno.
- `JWT_SECRET` fuerte y rotado.
- `MONGO_URI` y Redis fuera de Git.
- validacion de MIME, extension, tamano y contenido real;
- rate limit por identidad/IP;
- Helmet y cabeceras seguras;
- timeouts de peticion;
- limites de memoria y purga de binarios;
- logs con correlation ID, sin secretos;
- CORS minimo necesario;
- control de planes y celulas permitidas;
- retencion y borrado de imagenes segun politica de datos.

## 10. Rendimiento y escalabilidad

La ruta sincrona de produccion mantiene las celulas ligeras en ejecucion directa para reducir latencia, pero las celulas Sharp pesadas se separan del `Promise.all` y pasan siempre por `celula:cola` en Bull/Redis DB 2 con concurrencia serial. La cola de trabajos completos asincronos usa Bull/Redis DB 3 y es independiente. Esta política reduce presión de CPU y memoria bajo carga; no garantiza menor latencia para una única imagen.

Variables relevantes:

- `USE_CELL_QUEUE`: compatibilidad de configuración; la clasificación de células pesadas del orquestador determina su ruta.
- `QUEUE_CONCURRENCY`: límite configurado del sistema de cola; el worker de células Sharp mantiene concurrencia efectiva `1` para proteger memoria y CPU.
- `ASYNC_QUEUE_CONCURRENCY`: concurrencia independiente de la cola de análisis completos en Redis DB 3.
- `REDIS_DB`: base de entorno; la cola Sharp usa DB 2 y la cola asíncrona usa DB 3.
- `DRAGON3_SERVER_INSTANCES`: numero de instancias del backend.
- rutas del modelo ML y del dataset.

La escalabilidad horizontal del backend no implica multiplicar Embassy sin diseno adicional: el worker Python persistente, caches y consumidores deben tener ownership claro. Toda decision de escalado debe medirse con cargas 1, 2, 5 y 10 concurrentes y con p50/p95/p99, error rate, RSS, heap, profundidad de cola y latencia ML.

## 11. ML y worker Python

El modelo XGBoost se carga una vez en un proceso Python persistente. Node envia una imagen codificada por linea y recibe un JSON por linea. El worker debe:

- iniciar con rutas configurables;
- fallar de forma observable si falta el modelo;
- aplicar timeout;
- no acumular peticiones infinitamente;
- limpiar el proceso al apagar Embassy;
- cachear solo resultados acotados;
- separar cold start de warm latency en las metricas.

El resultado ML es una evidencia, no una garantia. La explicacion publica debe incluir modelo, version y probabilidades cuando esten disponibles, junto con limitaciones.

## 12. Observabilidad y respuesta a incidentes

Cada peticion debe ser trazable por `correlationId`. El conjunto minimo de metricas es:

- peticiones recibidas, completadas y rechazadas;
- latencia total y por celula;
- errores por celula y por tipo;
- ratio de `INDETERMINADO`;
- uso de memoria y reinicios PM2;
- estado y latencia del worker ML;
- profundidad, antiguedad y fallos de Bull;
- MongoDB y Redis connectivity;
- tamaño medio y percentiles de respuesta.

Un incidente debe registrar: impacto, ventana temporal, correlation IDs, proceso/PID, hipotesis, mitigacion, causa raiz, accion permanente y prueba de no regresion. No usar logs historicos rotados como evidencia del estado actual sin filtrar por timestamp y PID.

## 13. Despliegue y operacion

### Despliegue controlado

1. Revisar `git status`, diff y branch.
2. Ejecutar `git diff --check`.
3. Ejecutar tests de celulas y validacion de sintaxis.
4. Auditar dependencias y secretos.
5. Confirmar variables de entorno y modelo externo.
6. Preparar runtime de produccion y revisar diff.
7. Reiniciar PM2 de forma controlada.
8. Verificar `pm2 status`, `/health`, catalogo, planes y un E2E real.
9. Observar logs, memoria y latencia.
10. Registrar commit, configuracion efectiva y resultado de smoke test.

### Rollback

- Mantener el commit anterior conocido.
- No borrar dataset ni modelo durante rollback.
- Restaurar codigo y reiniciar procesos.
- Confirmar salud y ejecutar una imagen de prueba.
- Comparar correlation IDs y metricas anteriores.

## 14. Recuperacion ante desastre

Elementos necesarios para recuperar el servicio:

- repositorio Git privado y commit de despliegue;
- secretos regenerados, nunca restaurados desde logs;
- modelo ML externo;
- dependencias Node y Python;
- MongoDB y Redis accesibles;
- dataset operativo si aplica;
- configuracion PM2 y rutas del host.

Seguir [RESTORE_RUNBOOK.md](../RESTORE_RUNBOOK.md) y usar el bootstrap de produccion. Una restauracion no se considera terminada hasta que pasan health, catalogo, planes, prueba ML, analisis E2E y comprobacion de persistencia.

## 15. Pruebas y criterios de aceptacion

### Puertas minimas por cambio

- sintaxis JS valida;
- test aislado de la celula;
- contrato de salida valido;
- plan valido y sin ciclos;
- catalogo accesible;
- E2E completado;
- no hay secretos ni binarios en Git;
- diff limpio;
- rendimiento dentro del presupuesto;
- rollback identificado.

### Pruebas periodicas

- regresion atomica de celulas;
- integracion del orquestador;
- E2E del backend;
- prueba de cold y warm ML;
- carga concurrente;
- reinicio limpio y shutdown;
- restauracion en entorno limpio;
- auditoria de dependencias;
- comprobacion visual de campos forenses en frontend.

## 16. Troubleshooting

### El endpoint responde lento

Comprobar si `USE_CELL_QUEUE` esta activo, separar cold start ML de warm latency, ordenar tiempos por celula y revisar RSS. No activar Bull en el camino sincrono como primera respuesta.

### ML falla al arrancar

Comprobar ruta del Python, existencia del modelo, dependencias del venv, permisos y stderr del worker. Ejecutar una prediccion aislada y revisar el timeout.

### Falta el analisis forense en frontend

Comprobar que Embassy conserva `raw_data` seguro, que el adapter recibe la estructura directa correcta y que el proceso PM2 se reinicio despues del cambio. Inspeccionar la respuesta HTTP real antes de culpar al frontend.

### Hay dos Embassies

Inspeccionar PM2 del usuario actual y `PM2_HOME=/root/.pm2`, systemd y procesos. Eliminar el proceso legacy solo despues de identificar su configuracion y confirmar que la instancia de produccion continua online.

### El catalogo devuelve error

Validar JSON, aceptar el formato de array o envoltorio configurado, revisar rutas y ejecutar `GET /agent/catalogo` con el mismo entorno del proceso.

### OOM o reinicios

Buscar buffers/base64 serializados, telemetria sin rotacion, respuestas gigantes y acumulacion de jobs. Confirmar que la purga elimina binarios pero conserva la evidencia forense acotada.

## 17. Gobernanza y cambios

Cada cambio debe indicar: problema, decision, alternativas descartadas, impacto, riesgos, plan de despliegue, rollback, metricas y tests. Las decisiones arquitectonicas importantes deben quedar en un ADR o en el changelog.

Revisar trimestralmente:

- contratos de API y versionado;
- dependencia dev/prod;
- secretos y rotacion;
- permisos y retencion de datos;
- SLO y presupuestos de latencia;
- calidad de modelos y drift;
- cobertura de pruebas;
- coste de infraestructura.

## 18. Definicion de terminado

Dragon3 esta listo para una entrega cuando un operador nuevo puede clonar el repositorio, provisionar dependencias y secretos, restaurar el modelo, iniciar servicios, verificar salud, ejecutar un analisis y entender un incidente sin depender de conocimiento oral. Una nueva celula esta terminada cuando tiene contrato, test, catalogo, plan, evidencia de rendimiento, revision de seguridad, documentacion y rollback.

## 19. Indice de referencia rapida

- Arquitectura: secciones 2-4.
- Contratos: seccion 5.
- Nueva celula: seccion 7.
- Planes: seccion 8.
- API y seguridad: seccion 9.
- Rendimiento y colas: seccion 10.
- ML: seccion 11.
- Operacion: secciones 12-14.
- Pruebas: seccion 15.
- Incidentes: seccion 16.
- Arquitectura C4 y flujos: [architecture/C4.md](architecture/C4.md).
- Decisiones arquitectonicas: [architecture/ADRs.md](architecture/ADRs.md).
- SLOs y error budget: [operations/SLO.md](operations/SLO.md).
- Contrato OpenAPI: [api/openapi.yaml](api/openapi.yaml).
- Alta concurrencia: [HIGH_CONCURRENCY_PLAN.md](../HIGH_CONCURRENCY_PLAN.md).
