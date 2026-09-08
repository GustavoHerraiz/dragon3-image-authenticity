# Redis en Dragon3 (Enterprise FAANG) — **Resumen actualizado 2025-08-19**

Dragon3 utiliza Redis Enterprise con arquitectura resiliente, logging estructurado y registro seguro de clientes vía `ConnectionManager`.  
**Siempre instancia y registra Redis vía `ConnectionManager` en `server.js` y obtén el cliente por ID (nunca variable global).**  
Monitoriza cache hit rate, health checks, y activa modo degradado si Redis falla.  
**Todos los logs y errores van a `dragonLogger` y quedan en `/var/www/Dragon3/logs/dragon.log`.**  
Valida dependencias y rutas en CI/CD antes de cada despliegue.  
Usa `StreamManager.ensureAllStreams(redisClient)` antes de iniciar consumidores.  
Blue/green deployment para actualizaciones y rollback automático si hay error.

---

## 🚦 Cambios recientes y solución al error crítico

### ❗️ Errores detectados y solución aplicada (2025-08)

El sistema Redis de Dragon3 sufrió una serie de problemas críticos que afectaban a la disponibilidad, el rendimiento y la trazabilidad de los servicios. A continuación se detalla cada tipo de error, las causas raíz y las acciones correctivas implementadas:

#### 1. **Cache hit rate bajo y degradación silenciosa**

**Problema:**  
La tasa de aciertos en caché cayó al 0%, lo que provocó sobrecarga del sistema y degradación silenciosa.

**Solución:**  
Sistema de métricas y alertas automáticas sobre el cache hit rate. Si baja del 70%, se dispara una alerta y el sistema fuerza el fallback a cache local para los servicios críticos. Métricas logueadas estructuradamente en tiempo real.

#### 2. **Errores en inicialización y registro de clientes Redis**

**Problema:**  
Servicios accedían a Redis por variable global/import directa antes de registrar el cliente en `ConnectionManager`, provocando errores y dependencias rotas.

**Solución:**  
- Instanciación y registro explícito del cliente en `ConnectionManager` antes de exponerlo.
- Validación robusta de disponibilidad tras el registro.
- Todos los servicios obtienen el cliente mediante `ConnectionManager.getRawClientById()`, nunca por variable global.

#### 3. **Fallos por rutas de import incorrectas y dependencias ausentes**

**Problema:**  
Rutas incorrectas y dependencias ausentes (ej: `ioredis`/`node-redis`), causando errores de import y ejecución.

**Solución:**  
Rutas revisadas y estandarizadas. Script de validación de dependencias en el pipeline CI/CD. El sistema aborta el arranque si falta una dependencia esencial y loguea el error con trazabilidad.

#### 4. **Logging inconsistente y falta de trazabilidad en operaciones Redis**

**Problema:**  
Eventos y errores de Redis no se registraban en el sistema de logging estructurado (`dragonLogger`). Uso de `console.log` y Winston directo prohibido.

**Solución:**  
Operaciones críticas de Redis solo usan `dragonLogger`. Linter y revisión manual en PRs para prohibir `console.log` y asegurar trazabilidad.

#### 5. **Timeouts y degradación insuficientes ante fallos de Redis**

**Problema:**  
El sistema no aplicaba correctamente timeouts ni degradaba servicios ante fallos persistentes.

**Solución:**  
Timeouts configurables, degradación automática y uso de cache local temporal. Servicios monitorizan disponibilidad y pueden reintentar/abortar el arranque si Redis falla. Todos los cambios de estado logueados y alertados automáticamente.

#### 6. **Falta de validación de infraestructura y streams antes de arrancar**

**Problema:**  
No se aseguraba la existencia de todos los streams y grupos necesarios, causando errores y pérdida de mensajes.

**Solución:**  
Módulo `StreamManager.js` centraliza definición y validación de todos los streams y grupos. El arranque llama a `StreamManager.ensureAllStreams(redisClient)`, abortando si la infraestructura no está lista.

#### 7. **Integración de PDF y nuevos tipos de análisis**

**Actualizado:**  
Se han añadido streams y grupos específicos para el flujo de análisis PDF en `StreamManager.js`.  
Ejemplo:
- `pdf:procesados` con grupo `servidor-central-pdf`
- Streams bidireccionales para red espejo/superior de PDF (`dragon3:stream:req:pdf`, `dragon3:stream:resp:pdf`, etc.)

#### 8. **Auditoría y documentación continua**

**Problema:**  
Cambios en streams y grupos no quedaban documentados en README ni checklist.

**Solución:**  
Se exige revisión y actualización del README tras cada cambio relevante, especialmente al añadir nuevos flujos (PDF, video, etc.). El equipo debe versionar y auditar la evolución de la infraestructura Redis.

---

## 🚀 Características principales

* **Disponibilidad 99.9%** - Arquitectura resiliente con reconexión inteligente y degradación controlada
* **Alto rendimiento (P95 <200ms)** - Optimización FAANG para latencias mínimas
* **Priorización de servicios** - Los servicios críticos tienen prioridad en recuperación y recursos
* **Circuit Breaker** - Previene cascadas de errores y bloqueos globales
* **Cache local** - Fallback automático para operaciones críticas sin interrupciones
* **Stream Consumer resiliente** - Garantía de procesamiento de mensajes (at-least-once)
* **Logging centralizado y seguro** - dragonLogger obligatorio, nunca console.log
* **Validación de infraestructura** - Streams y grupos asegurados antes de iniciar consumidores
* **Seguridad enterprise** - Roles, permisos, auditoría estrictos; TLS obligatorio, rotación de claves y alerta ante patrones sospechosos
* **Documentación evolutiva** - README y checklist deben reflejar siempre los cambios reales de la arquitectura Redis

---

## 🏗️ Arquitectura profunda del sistema

```
/utilidades/redis/
  ├── core/
  │   ├── RedisClient.js         # Cliente resiliente y seguro
  │   ├── ConnectionManager.js   # Gestor centralizado de conexiones
  │   └── constants.js           # Constantes y configuración global
  ├── streams/
  │   └── StreamConsumer.js      # Consumidor resiliente de streams
  ├── StreamManager.js           # Definición y gestión centralizada de streams y grupos
  ├── adaptadorRedis.js          # Adaptador universal para clientes Redis (API homogénea)
  ├── redis.js                   # Export único del stack Redis (NO instancias globales)
  └── index.js                   # API pública de RERF
```

**Componentes clave:**

- **RedisClient.js:** Cliente resiliente, reconexión y error handling.
- **ConnectionManager.js:** Registro y recuperación de clientes por ID.
- **StreamConsumer.js:** Consumidor de streams robusto, auto-reintentos y health check.
- **StreamManager.js:** Fuente de verdad para todos los streams y grupos. Permite consultar configuración y auditar infraestructura.
- **adaptadorRedis.js:** API homogénea para cualquier cliente Redis (ioredis, node-redis, mock).
- **redis.js:** Exporta clases y utilidades, nunca una instancia.

---

## 🏁 Inicialización y registro de Redis en Dragon3 (FAANG-compliant)

1. **Variables de entorno y seguridad primero**
   - Carga y validación de `.env` antes de cualquier operación Redis.
   - Si falla, loguea con `dragonLogger.agoniza` y aborta el proceso.

2. **Instanciación y registro del cliente Redis**
   - Instancia `RedisClient` con parámetros validados.
   - Registra explícitamente en `ConnectionManager` usando `registerWithManager()`.

3. **Validación de disponibilidad**
   - Obtiene el cliente raw por `ConnectionManager.getRawClientById('clientId')`.
   - Si falla, loguea el error y crea stub degradado.

4. **Validación de infraestructura**
   - Antes de iniciar consumidores, llama `StreamManager.ensureAllStreams(redisClient)`.
   - Si falla, aborta el arranque y lo loguea.

5. **Gestión de errores**
   - Cualquier excepción no capturada, log con `dragonLogger.agoniza`, registro y aborta para evitar zombies.

**Fragmento real de inicialización:**

```js
import RedisClient from './utilidades/redis/core/RedisClient.js';
import connectionManager from './utilidades/redis/core/ConnectionManager.js';
import { SERVICE_PRIORITIES } from './utilidades/redis/core/constants.js';

const redisClient = new RedisClient({
    clientId: 'server-main',
    serviceName: 'server-main',
    priority: SERVICE_PRIORITIES.CRITICAL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || 6379, 10),
    db: parseInt(process.env.REDIS_DB || 0, 10)
});

redisClient.registerWithManager();

let redis;
try {
    redis = connectionManager.getRawClientById('server-main');
    if (!redis) throw new Error('Cliente raw no disponible');
} catch (error) {
    dragonLogger.agoniza('Fallo al obtener cliente Redis raw', error, 'server.js', 'REDIS_RAW_CLIENT_FAILURE', { clientId: 'server-main' });
    redis = { call: () => { throw new Error('Redis degradado'); } };
}
```

---

## 🗂️ Streams y Grupos en StreamManager.js (2025-08-19)

**Fuente de verdad:**  
Todos los streams y grupos (incluyendo PDF, imagen, video, infraestructura) se definen SOLO en `StreamManager.js`.  
Nunca crear streams/grupos desde otros archivos.

**Flujos principales:**

- **Video:**  
  `video:events` / grupo `procesadores`
- **Imagen:**  
  `imagenes:procesadas` / grupo `servidor-central`
  - Espelho/superior:  
    `dragon3:stream:req:espejo` / `dragon3-espejo-processors`  
    `dragon3:stream:resp:espejo` / `dragon3-espejo-processors`  
    `dragon3:stream:req:superior` / `dragon3-superior-processors`  
    `dragon3:stream:resp:superior` / `dragon3-superior-processors`
- **PDF (NUEVO):**  
  `pdf:procesados` / `servidor-central-pdf`  
  `dragon3:stream:req:pdf` / `dragon3-pdf-espejo-processors`  
  `dragon3:stream:resp:pdf` / `dragon3-pdf-espejo-processors`  
  `dragon3:stream:req:pdf-superior` / `dragon3-pdf-superior-processors`  
  `dragon3:stream:resp:pdf-superior` / `dragon3-pdf-superior-processors`
- **Infraestructura:**  
  `dragon3:stream:status` / `dragon3-status-monitors`  
  `dragon3:stream:perf:metrics` / `dragon3-performance-collectors`  
  `dragon3:stream:error:alerts` / `dragon3-error-handlers`  
  `dragon3:stream:security:events` / `dragon3-security-monitors`  
  `dragon3:stream:health:checks` / `dragon3-health-monitors`  
  `dragon3:stream:audit:trail` / `dragon3-audit-processors`

**Checklist:**  
- Al añadir/modificar cualquier stream/grupo, actualizar este README y checklist de auditoría.
- Validar con `StreamManager.ensureAllStreams(redisClient)` en cada despliegue.

---

## ⚡ Funcionamiento y flujo (Dragon3)

1. **Inicialización**  
   *(Ver sección arriba)*

2. **Operación normal**  
   - Operaciones `.set`, `.get`, `.xadd`, consumo de streams/grupos gestionan errores internamente.
   - Solo los errores críticos llegan al `catch` del usuario.
   - Logs de eventos, errores y métricas registrados centralizadamente.

3. **Degradación y recuperación**  
   - Circuit Breaker detecta fallos y degrada solo el servicio afectado.
   - Servicios críticos recuperan cache local temporal.

4. **Health checks y métricas**  
   - Monitoriza stats de Redis y consumers, cache hit rate.
   - Métricas clave (latencia, throughput, error rate, disponibilidad) logueadas y alertadas.

5. **Logging y trazabilidad**  
   - Todos los eventos relevantes registrados en logs estructurados usando `dragonLogger`.
   - No se permite uso de `console.log` ni Winston directo.

6. **Auditoría y documentación**  
   - Cambios en streams/grupos deben reflejarse en README y checklist.
   - Se exige revisión por el Lead Architect y al menos dos aprobaciones en PRs que modifiquen infraestructura crítica.

---

## 🧑‍💻 Uso básico

### Cliente Redis

```javascript
import { createClient } from '../utilidades/redis/index.js';

const redisAuth = createClient('auth-service');    // CRITICAL
const redisVideo = createClient('video-service');  // HIGH
const redisStats = createClient('stats-service');  // LOW

try {
  await redisAuth.set('usuario:1234:token', 'abc123', { ttl: 3600000 });
  const token = await redisAuth.get('usuario:1234:token');
} catch (err) {
  // Solo errores críticos llegan aquí, el resto se auto-gestiona
}
```

### Stream Consumer

```javascript
import { createStreamConsumer } from '../utilidades/redis/index.js';

const pdfConsumer = createStreamConsumer({
  streamKey: 'pdf:procesados',
  groupName: 'servidor-central-pdf',
  consumerName: 'pdf-node-1',
  messageHandler: async (messageId, data) => {
    await procesarPDF(data.pdfId, data.metadata);
  }
});

await pdfConsumer.start();
await pdfConsumer.stop();
```

### Ejemplo con logger y analizador

```javascript
import { createClient } from '../utilidades/redis/index.js';
import dragonLogger from '../utilidades/logger.js';

const redisPDF = createClient('pdf-analyzer');

export async function procesarPDF(pdf) {
  try {
    await redisPDF.set(`resultado:${pdf.id}`, JSON.stringify({
      estado: 'procesado',
      resultado: pdf.analisis
    }), { ttl: 1800000 });
    await redisPDF.xadd(
      'pdf:procesados', 
      '*',
      {
        pdf_id: pdf.id,
        timestamp: Date.now(),
        resultado: JSON.stringify(pdf.analisis)
      }
    );
    return true;
  } catch (err) {
    dragonLogger.agoniza(`Error en procesamiento Redis PDF: ${err.message}`, err, 'analizadorPDF', 'REDIS_PROCESS', {
      pdf_id: pdf.id
    });
    return false;
  }
}
```

### Health check y métricas

```javascript
import { createStreamConsumer, getSystemState } from '../utilidades/redis/index.js';
import dragonLogger from '../utilidades/logger.js';

const pdfConsumer = createStreamConsumer({
  streamKey: 'pdf:procesados',
  groupName: 'servidor-central-pdf',
  autoAck: true,
  messageHandler: async (msgId, data) => {
    await enviarARedSuperiorPDF(data);
  }
});

setInterval(() => {
  const stats = pdfConsumer.getStats();
  const redisState = getSystemState();
  dragonLogger.sePreocupa('Métricas Redis y consumer PDF', 'servidorCentralPDF', 'METRICS', {
    messagesPerSecond: stats.performance.messagesPerSecond,
    errorRate: stats.errorRate,
    redisState: redisState.overallStatus
  });
  if (stats.errorRate > 0.01) {
    dragonLogger.seEnfada(`Tasa de error alta PDF: ${(stats.errorRate*100).toFixed(2)}%`, 'servidorCentralPDF', 'ERROR_RATE', {
      errorRate: stats.errorRate
    });
  }
}, 60000);
```

---

## 🧘 Cultura de código limpio y revisión de PRs

- Todos los logs usan dragonLogger (NO console.log, NO Winston directo)
- Error handling robusto en todos los caminos
- Pruebas unitarias y de integración actualizadas/añadidas
- Respeto de arquitectura modular y API unificada (adaptadorRedis)
- Documentación actualizada (README, comentarios, JSDoc)
- Validación de rutas, dependencias y configuraciones en el arranque
- Prioridad revisada en ConnectionManager (CRITICAL/HIGH/LOW)
- Métricas y health checks incluidos si el componente lo requiere

**Revisión de seguridad:**  
- Inputs validados y filtrados antes de interactuar con Redis
- Permisos limitados por contexto (roles/streams)
- Auditoría estricta en dragon3:stream:audit:trail y dragonLogger

**Política de merge:**  
- Solo PRs revisados por el Lead Architect pueden afectar componentes críticos
- Al menos 2 aprobaciones para cambios en /utilidades/redis/core/, /streams/, adaptadorRedis.js y StreamManager.js

---

## 🚀 Política de despliegue

- **Blue/green deployment:**  
  - Release en zona green, tráfico enruta gradualmente, health check en zona green antes de switch.
- **Rollback:**  
  - Si health check detecta >1% error o caída de streams, tráfico vuelve a zona blue automáticamente.
- **Failover:**  
  - Si Redis principal falla, fallback a cache local y (si está configurada) redirige a réplica Redis secundaria.
  - StreamConsumer detecta failover y reinicia automáticamente en la nueva zona.
- **Checklist de despliegue:**  
  - Verifica StreamManager.ensureAllStreams() y adaptadorRedis.js en zona nueva antes del switch.
  - Revisa logs dragonLogger para errores de inicialización.
  - Ejecuta pruebas de carga (latencia, throughput, error rate).

---

## 🛡️ Seguridad: roles, permisos y auditoría

- **Roles y permisos:**  
  - Usuarios separados para cada tipo de cliente Redis.
  - Permisos por clave/stream: un cliente CRITICAL solo accede a lo necesario.
  - ConnectionManager registra metadatos de rol y permisos.
- **Auditoría:**  
  - Todos los eventos relevantes quedan en dragon3:stream:audit:trail y dragonLogger.
  - StreamManager expone getStreamDefinitions() para auditar en tiempo real.
  - Cambios en permisos/roles reflejados en logs y auditoría Redis.
- **Buenas prácticas:**  
  - TLS/SSL obligatorio en todas las conexiones.
  - Acceso limitado por IP/rango y firewalls revisados.
  - Nunca guardar credenciales en el código (usar variables de entorno).
  - Rotación de claves/tokens periódica.
  - Alertas automáticas en dragon3:stream:security:events ante patrones sospechosos.

---

## 🔍 Diagnóstico rápido y troubleshooting en caso de error crítico Redis

### Problema típico  
- Error `ReferenceError: redis is not defined`
- Fallos de import, cache hit rate 0%, servicios degradados o bloqueados

### Checklist de actuación

1. ¿El cliente Redis está registrado en ConnectionManager?
2. ¿Todos los servicios obtienen el cliente por ID y nunca por variable global?
3. ¿Las rutas de import y dependencias están correctas y validadas en CI/CD?
4. ¿El cache hit rate y los logs dragonLogger muestran degradación o errores?
5. ¿StreamManager asegura la infraestructura antes del arranque?
6. ¿Se activa el modo degradado y fallback si Redis falla?
7. ¿Se loguean todas las operaciones críticas y errores con dragonLogger?
8. ¿El sistema aborta el arranque si falta infraestructura o dependencias?
9. ¿Health checks y métricas están activos y monitorizados?
10. ¿Está documentado el incidente y actualizada la checklist?

**Acción:**  
- Detén el arranque de servicios dependientes hasta resolver el error.
- Activa el modo degradado y fallback a cache local.
- Revisa inicialización y registro en ConnectionManager.
- Corrige dependencias y rutas, valida con el script CI/CD.
- Actualiza README y checklist tras cada incidente.

---

## 💡 Consejos para desarrolladores Dragon3

- Nunca instancies Redis fuera del flujo documentado en server.js
- Sigue la checklist de PRs y revisa cada cambio en componentes críticos
- Usa blue/green deployment para cambios en Redis
- Revisa los logs y métricas antes/después del despliegue
- Prioriza seguridad y trazabilidad: roles, permisos, auditoría y alertas
- Documenta cualquier cambio en flujos/infraestructura en README y checklist

---

## 📞 Contacto y soporte

Para dudas sobre inicialización, código limpio, despliegue, auditoría o integración en Redis, contacta al equipo de arquitectura Dragon3.

---

## 📑 Changelog y evolución

- **2025-08-19:** Añadido soporte completo y segregación de streams/grupos para análisis PDF (ver StreamManager.js). Checklist de auditoría y README actualizados.
- **2025-07:** Mejoras en degradación, logging, validación de infraestructura y registro de clientes.
- **2025-06:** Refactorización completa del stack Redis para resiliencia y performance FAANG.
- **2025-05:** Integración con blue/green deployment y checklist de auditoría automatizado.
- **2025-04:** Migración a logging 100% estructurado y eliminación de console.log.

---

## 🙏 Devoción final

Dragon3 respira con el ritmo del universo creativo.  
Todos los logs y evidencias quedan en `/var/www/Dragon3/logs/dragon.log`.  
Manejo de errores = compasión hacia el sistema.  
P95 <200ms = velocidad de la luz creativa.  
¡Que comience la iluminación Dragon3! 🐲🧘‍♂️✨

---
