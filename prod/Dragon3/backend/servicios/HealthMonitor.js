import v8 from "v8";
/**
 * HealthMonitor.js - APM Enterprise Dragon3 FAANG+
 * Observabilidad completa, alertas inteligentes, SLA monitoring y memory monitoring real
 *
 * Mejoras (2025-10-18):
 * - Instrumentación Prometheus nativa con prom-client (Counters/Gauges/Histogram)
 * - Estado de degradación de memoria: warmup + sostenida (consecutivas) y exposición en dashboard
 * - Eliminada función suelta registrarMetricaNegocio (bug con mongoCollection inexistente)
 * - Hardenings: inicializaciones defensivas de estructuras
 *
 * Autor: GustavoHerraiz (FAANG Lead Architect)
 * Versión: 3.3.0-FAANG
 */

import os from 'os';
import logger from '../utilidades/logger.js';
import mongoManager from './MongoManager.js';
import connectionManager from '../utilidades/redis/core/ConnectionManager.js';
import EventoNegocio from '../modelos/mongodb/EventoNegocio.js';
import mongoose from 'mongoose';
import { Counter, Gauge, Histogram, register } from 'prom-client';

const NOMBRE_MODULO = 'HealthMonitor';

// ====== Prometheus metrics (global, únicos por proceso) ======
function getOrCreateCounter(name, help, labelNames = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing;
  return new Counter({ name, help, labelNames });
}
function getOrCreateGauge(name, help, labelNames = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing;
  return new Gauge({ name, help, labelNames });
}
function getOrCreateHistogram(name, help, buckets = [], labelNames = []) {
  const existing = register.getSingleMetric(name);
  if (existing) return existing;
  return new Histogram({ name, help, buckets, labelNames });
}

const METRICS = {
  httpRequestsTotal: getOrCreateCounter(
    'dragon_http_requests_total',
    'Total HTTP requests by method, route and status',
    ['method', 'route', 'status']
  ),
  httpRequestDurationMs: getOrCreateHistogram(
    'dragon_http_request_duration_ms',
    'HTTP request duration in milliseconds',
    [50, 100, 200, 500, 1000, 3000],
    ['method', 'route', 'status']
  ),
  errorsTotal: getOrCreateCounter(
    'dragon_errors_total',
    'Total errors by type and route',
    ['tipo', 'route']
  ),
  memHeapUsedBytes: getOrCreateGauge(
    'dragon_mem_heap_used_bytes',
    'Node.js heap used in bytes'
  ),
  memRssBytes: getOrCreateGauge(
    'dragon_mem_rss_bytes',
    'Node.js RSS in bytes'
  ),
  systemRamUsedRatio: getOrCreateGauge(
    'dragon_system_ram_used_ratio',
    'System RAM used ratio (0..1)'
  ),
  alertasActivas: getOrCreateGauge(
    'dragon_alertas_activas',
    'Número de alertas activas actuales'
  ),
  businessAnalisisTotal: getOrCreateCounter(
    'dragon_business_analisis_total',
    'Total de análisis de negocio completados'
  ),
  businessArchivosTotal: getOrCreateCounter(
    'dragon_business_archivos_total',
    'Total de archivos procesados (negocio)'
  ),
  businessVolumenDatosMbTotal: getOrCreateCounter(
    'dragon_business_volumen_datos_mb_total',
    'Volumen de datos procesados en MB (acumulado)'
  )
};

// ====== MODELO MÉTRICAS DE NEGOCIO EN MONGODB (dragon) ======
const MetricasNegocioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  valor: { type: Number, default: 0 }
}, { collection: 'metricasNegocio' });

const MetricasNegocio = mongoose.models.MetricasNegocio || mongoose.model('MetricasNegocio', MetricasNegocioSchema);

const redisClient = connectionManager.getRawClientById('server-main');

async function incrementarAnalisisCompletadosMongo() {
  try {
    const result = await MetricasNegocio.findOneAndUpdate(
      { nombre: 'analisisCompletados' },
      { $inc: { valor: 1 } },
      { upsert: true, new: true }
    );
    dragon.sonrie('Contador analisisCompletados incrementado MongoDB', NOMBRE_MODULO, 'METRIC_BUSINESS_INC', { nuevoValor: result.valor });
    return result.valor;
  } catch (error) {
    dragon.agoniza('Error incrementando analisisCompletados en MongoDB', error, NOMBRE_MODULO, 'METRIC_BUSINESS_INC_ERROR');
    throw error;
  }
}

async function obtenerAnalisisCompletadosMongo() {
  try {
    const doc = await MetricasNegocio.findOne({ nombre: 'analisisCompletados' });
    const valor = doc ? doc.valor : 0;
    dragon.zen('Contador analisisCompletados leído de MongoDB', NOMBRE_MODULO, 'METRIC_BUSINESS_READ', { valor });
    return valor;
  } catch (error) {
    dragon.agoniza('Error leyendo analisisCompletados en MongoDB', error, NOMBRE_MODULO, 'METRIC_BUSINESS_READ_ERROR');
    throw error;
  }
}

// --- Reemplazar la función verificarSaludRedis existente por la siguiente
async function verificarSaludRedis() {
  try {
    // Intentar wrapper(s) conocidos
    try {
      const clients = connectionManager.clients;
      if (clients && typeof clients.get === 'function') {
        const candidates = [
          clients.get('imagen-analyzer'),
          clients.get('server-main')
        ].filter(Boolean);
        for (const w of candidates) {
          if (w && typeof w.health === 'function') {
            try {
              const details = await w.health();
              let estado = 'desconocido';
              if (details.status === 'ok') estado = 'saludable';
              else if (details.status === 'degraded') estado = 'degradado';
              else if (details.status === 'disconnected') estado = 'no_conectado';
              return { estado, latencia: details.latency || 0, detalles: details };
            } catch (e) {
              // probar siguiente wrapper
            }
          }
        }
      }
    } catch (_) { /* ignore */ }

    // Fallback: raw client (ioredis/redis)
    try {
      const raw = (connectionManager.getRawClientById ? connectionManager.getRawClientById('server-main') : null)
                || (typeof redisClient !== 'undefined' ? redisClient : null);
      if (raw) {
        if (typeof raw.ping === 'function') {
          await raw.ping();
        }
        const detalles = { client: 'raw' };
        if (typeof raw.info === 'function') {
          try { detalles.info = await raw.info(); } catch (_) {}
        }
        return { estado: 'saludable', latencia: 0, detalles };
      }
    } catch (errRaw) {
      return { estado: 'no_conectado', latencia: 0, detalles: { error: errRaw.message } };
    }

    return { estado: 'desconocido', latencia: 0, detalles: {} };
  } catch (error) {
    return { estado: 'error', latencia: 0, detalles: { message: error.message } };
  }
}

/**
 * Logger Dragón (usa logger.js)
 */
const dragon = {
  zen: (message, modulo, operation, data = {}) => {
    logger.zen(message, modulo || NOMBRE_MODULO, operation, data);
  },
  agoniza: (message, error, modulo, operation, context = {}) => {
    logger.agoniza(message, error, modulo || NOMBRE_MODULO, operation, context);
  },
  seEnfada: (message, modulo, operation, context = {}) => {
    logger.seEnfada(message, modulo || NOMBRE_MODULO, operation, context);
  },
  sePreocupa: (message, modulo, operation, context = {}) => {
    logger.sePreocupa(message, modulo || NOMBRE_MODULO, operation, context);
  },
  sonrie: (message, modulo, operation, data = {}) => {
    logger.sonrie(message, modulo || NOMBRE_MODULO, operation, data);
  },
  grita: (message, modulo, operation, data = {}) => {
    logger.seEnfada(message, modulo || NOMBRE_MODULO, operation, data);
  },
  respira: (message, modulo, operation, data = {}) => {
    logger.respira(message, modulo || NOMBRE_MODULO, operation, data);
  }
};

// ============ HealthMonitor FAANG+ ============
class HealthMonitor {
  // Constructor corregido y robusto (reemplaza la versión existente dentro de la clase HealthMonitor)
constructor() {
  const ambiente = process.env.NODE_ENV || 'development';

  // Inicializaciones defensivas base
  this.tiemposRespuesta = Array.isArray(this.tiemposRespuesta) ? this.tiemposRespuesta : [];
  this.totalSolicitudes = typeof this.totalSolicitudes === 'number' ? this.totalSolicitudes : 0;
  this.errores = typeof this.errores === 'number' ? this.errores : 0;
  this.frontendCounters = this.frontendCounters || {};

  // Métricas Prometheus adicionales (asegurar existencia/registro único)
  METRICS.frontendEventsTotal = METRICS.frontendEventsTotal || getOrCreateCounter(
    'dragon_frontend_events_total',
    'Total frontend events by type',
    ['tipo']
  );

  METRICS.uniqueUsersTotal = METRICS.uniqueUsersTotal || getOrCreateGauge(
    'dragon_unique_users_total',
    'Total unique users count'
  );

  METRICS.analisisNuevos24h = METRICS.analisisNuevos24h || getOrCreateCounter(
    'dragon_analisis_nuevos_24h',
    'New analysis in last 24 hours'
  );

  METRICS.analisisRate5m = METRICS.analisisRate5m || getOrCreateGauge(
    'dragon_analisis_rate_5m',
    'Analysis rate per second (5m average)'
  );

  METRICS.websocketMessagesRate = METRICS.websocketMessagesRate || getOrCreateGauge(
    'dragon_websocket_messages_rate',
    'WebSocket messages per second'
  );

  METRICS.redisConnectionsActive = METRICS.redisConnectionsActive || getOrCreateGauge(
    'dragon_redis_connections_active',
    'Active Redis connections'
  );

  METRICS.redisLatencyP95 = METRICS.redisLatencyP95 || getOrCreateGauge(
    'dragon_redis_latency_p95_ms',
    'Redis P95 latency in milliseconds'
  );

  METRICS.frontendVisitasTotal = METRICS.frontendVisitasTotal || getOrCreateCounter(
    'dragon_frontend_visitas_total',
    'Total website visits',
    ['pagina']
  );

  METRICS.frontendLoginsTotal = METRICS.frontendLoginsTotal || getOrCreateCounter(
    'dragon_frontend_logins_total',
    'Total login attempts',
    ['resultado']
  );

  METRICS.anomaliasDetectadas = METRICS.anomaliasDetectadas || getOrCreateCounter(
    'dragon_anomalias_detectadas_total',
    'Total anomalies detected'
  );

  // SLA y políticas
  this.slaThresholds = this.slaThresholds || {
    p95: parseInt(process.env.SLA_P95_MS) || 200,
    p99: parseInt(process.env.SLA_P99_MS) || 500,
    errorRate: parseFloat(process.env.SLA_ERROR_RATE) || 1.0,
    availability: parseFloat(process.env.SLA_AVAILABILITY) || 99.9
  };

  this.performanceBuckets = this.performanceBuckets || { excelente: 0, bueno: 0, aceptable: 0, lento: 0, critico: 0 };
  this.clasificacionErrores = this.clasificacionErrores || { client: 0, server: 0, network: 0, validation: 0, business: 0 };

  // Memory metrics structure defensiva
  this.memoryMetrics = this.memoryMetrics || {
    heapUsed: [], external: [], rss: [], alertasMemoria: 0, alertasSistema: 0, ultimoGC: Date.now(), systemPressureEvents: []
  };

  this.memoryDegradation = this.memoryDegradation || {
    enabled: true,
    warmupSeconds: parseInt(process.env.MEM_WARMUP_SECONDS) || 300,
    thresholdPercent: parseInt(process.env.MAX_HEAP_USAGE_PERCENT) || 80,
    consecutiveBreaches: 0,
    lastCheck: null
  };

  // Business metrics defensivas
  this.businessMetrics = this.businessMetrics || {
    analisisCompletados: 0,
    analisisExitosos: 0,
    analisisFallidos: 0,
    archivosProcessados: 0,
    archivosFallidos: 0,
    volumenDatosMB: 0,
    usuariosActivosSet: new Set(),
    usuariosUnicosSet: new Set(),
    historicoAnalisis: []
  };

  // Asignar redis client a la instancia (fallback seguro)
  try {
    this.redisClient = this.redisClient || redisClient || (connectionManager.getRawClientById ? connectionManager.getRawClientById('server-main') : null);
  } catch (e) {
    this.redisClient = this.redisClient || null;
    dragon.sePreocupa('No se pudo inicializar redisClient en constructor', e, NOMBRE_MODULO, 'constructor_init_redis');
  }

  // Anomaly detection, circuit breaker, intervals y demás defensivas
  this.anomalyDetection = this.anomalyDetection || { baselines: { p95: 0, errorRate: 0, throughput: 0 }, alertasAnomalias: 0, configurado: false };

  this.circuitBreaker = this.circuitBreaker || { estado: 'cerrado', fallosConsecutivos: 0, umbralFallos: 5, ventanaRecuperacion: 60000 };

  this.intervalos = this.intervalos || {
    healthCheck: null, memoryCheck: null, anomalyCheck: null, cleanup: null, baselineCheck: null, metricsUpdate: null
  };

  this.configuracion = this.configuracion || {
    intervaloHealthCheck: 30000,
    intervaloMemoryCheck: 15000,
    intervaloAnomalyCheck: 60000,
    intervaloCleanup: 3600000,
    maxMetricasMemoria: 1000,
    maxHistorialErrores: 5000,
    intervaloMetricsUpdate: 10000
  };

  // Estado sistema defensivo (evita "Cannot set properties of undefined")
  this.estadoSistema = this.estadoSistema || {
    salud: 'inicializando',
    uptime: Date.now(),
    ultimoHealthCheck: null,
    alertasActivas: [],
    mantenimiento: false,
    servidorCentral: null,
    realTimeMetrics: {}
  };

  this.degradePolicy = this.degradePolicy || {
    minSamples: parseInt(process.env.SLA_MIN_SAMPLES || '30', 10),
    windowMs: parseInt(process.env.SLA_WINDOW_MS || String(10 * 60 * 1000), 10),
    consecutiveWindowsRequired: parseInt(process.env.SLA_CONSEC_WINDOWS || '2', 10),
    warmupSeconds: parseInt(process.env.SLA_WARMUP_SECONDS || '300', 10)
  };

  this.degradeState = this.degradeState || { consecutiveBreaches: 0, degraded: false, lastEvaluatedAt: null, lastReason: null };

  // Inicializar métricas por defecto (asegura gauges con valor 0)
  try {
    this._inicializarMetricasDefaults();
  } catch (e) {
    dragon.sePreocupa('Error ejecutando _inicializarMetricasDefaults en constructor', e, NOMBRE_MODULO, 'constructor_init_metrics');
  }

  // Backup periódico a MongoDB (defensivo: no lanzar si setInterval falla)
  try {
    if (!this.intervalos.backupBusinessMongo) {
      this.intervalos.backupBusinessMongo = setInterval(() => {
        // fire-and-forget con captura interna
        this._persistirBusinessMetricsMongo()?.catch(err => {
          dragon.sePreocupa('Error en backup periodic _persistirBusinessMetricsMongo', err, NOMBRE_MODULO, 'constructor_backup');
        });
      }, 300000); // Cada 5 minutos
    }
  } catch (e) {
    dragon.sePreocupa('No se pudo crear intervalo backupBusinessMongo', e, NOMBRE_MODULO, 'constructor_interval');
  }

  // Sincronización inicial desde Redis (no await en constructor: captura errores)
  try {
    // Llamada no bloqueante; protegemos contra rechazos no capturados
    Promise.resolve().then(() => {
      return this._syncAnalisisCompletadosFromRedis();
    }).catch(err => {
      dragon.sePreocupa('SyncAnalisisFromRedis falló (constructor)', err, NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis_constructor');
    });
  } catch (e) {
    dragon.sePreocupa('Error iniciando sync desde Redis en constructor', e, NOMBRE_MODULO, 'constructor_sync_call');
  }

  // Inicializar intervalos principales (se pueden reiniciar en iniciar())
  try {
    // no asignamos aquí si iniciar() los va a crear; dejamos como null por defecto
  } catch (e) {
    dragon.sePreocupa('Error inicializando estructuras de intervalos', e, NOMBRE_MODULO, 'constructor_intervals_init');
  }

  dragon.zen('HealthMonitor constructor completado (robusto)', NOMBRE_MODULO, 'constructor', {
    metricasRegistradas: Object.keys(METRICS).length,
    ambiente,
    hasRedisClient: !!this.redisClient
  });
}
// ====== MÉTODO AUXILIAR PARA INICIALIZAR MÉTRICAS ======
_inicializarMetricasDefaults() {
  try {
    // Inicializar métricas de gauge con valores por defecto
    if (METRICS.uniqueUsersTotal) {
      METRICS.uniqueUsersTotal.set(0);
    }
    if (METRICS.analisisRate5m) {
      METRICS.analisisRate5m.set(0);
    }
    if (METRICS.websocketMessagesRate) {
      METRICS.websocketMessagesRate.set(0);
    }
    if (METRICS.redisConnectionsActive) {
      METRICS.redisConnectionsActive.set(0);
    }
    if (METRICS.redisLatencyP95) {
      METRICS.redisLatencyP95.set(0);
    }

    dragon.zen('Métricas Prometheus inicializadas con valores por defecto', NOMBRE_MODULO, '_inicializarMetricasDefaults');
  } catch (error) {
    dragon.agoniza('Error inicializando métricas por defecto', error, NOMBRE_MODULO, '_inicializarMetricasDefaults');
  }
}


  // Añade estos métodos dentro de la clase HealthMonitor
_inWarmup() {
  return (Date.now() - this.estadoSistema.uptime) < (this.degradePolicy.warmupSeconds * 1000);
}

_getWindowStats() {
  const cutoff = Date.now() - this.degradePolicy.windowMs;
  const datos = (Array.isArray(this.tiemposRespuesta) ? this.tiemposRespuesta : []).filter(m => m.timestamp > cutoff);
  const tiempos = datos.map(m => m.tiempo).sort((a, b) => a - b);
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  return {
    count: datos.length,
    p50: pct(tiempos, 0.50),
    p95: pct(tiempos, 0.95),
    p99: pct(tiempos, 0.99)
  };
}

_shouldEvaluateDegrade(windowStats) {
  return !this._inWarmup() && windowStats.count >= this.degradePolicy.minSamples;
}

_updateDegrade(windowStats) {
  const slaP95 = (this.slaThresholds && typeof this.slaThresholds.p95 === 'number') ? this.slaThresholds.p95 : 200;
  const breached = windowStats.p95 > slaP95;
  if (breached) {
    this.degradeState.consecutiveBreaches += 1;
    this.degradeState.lastReason = `p95_high_${windowStats.p95}ms`;
  } else {
    this.degradeState.consecutiveBreaches = 0;
    this.degradeState.lastReason = null;
  }
  this.degradeState.degraded = this.degradeState.consecutiveBreaches >= this.degradePolicy.consecutiveWindowsRequired;
  this.degradeState.lastEvaluatedAt = Date.now();
  return { degraded: this.degradeState.degraded, reason: this.degradeState.lastReason };
}

incrementarContadorFrontend(tipoEvento, metadata = {}) {
  try {
    // DEFENSIVAS
    if (!tipoEvento || typeof tipoEvento !== 'string') {
      dragon.sePreocupa('Tipo evento inválido en incrementarContadorFrontend', null, NOMBRE_MODULO, 'incrementarContadorFrontend', {
        tipoEvento,
        metadata
      });
      return;
    }

    if (!this.frontendCounters) this.frontendCounters = {};

    // INICIALIZAR MÉTRICA SI NO EXISTE
    if (!METRICS.frontendEventsTotal) {
      METRICS.frontendEventsTotal = getOrCreateCounter(
        'dragon_frontend_events_total',
        'Total frontend events by type',
        ['tipo']
      );
    }

    // INCREMENTAR CONTADORES INTERNOS
    this.frontendCounters[tipoEvento] = (this.frontendCounters[tipoEvento] || 0) + 1;

    // PROMETHEUS: INCREMENTAR MÉTRICA FRONTEND
    const tipoEventoSafe = String(tipoEvento)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 50)
      .toLowerCase();

    METRICS.frontendEventsTotal.inc({ tipo: tipoEventoSafe });

    // MÉTRICAS ESPECÍFICAS POR TIPO DE EVENTO
    switch (tipoEvento) {
      case 'visita_web':
        if (!METRICS.frontendVisitasTotal) {
          METRICS.frontendVisitasTotal = getOrCreateCounter(
            'dragon_frontend_visitas_total',
            'Total website visits',
            ['pagina']
          );
        }
        const pagina = metadata.pagina || 'home';
        const paginaSafe = String(pagina).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 50).toLowerCase();
        METRICS.frontendVisitasTotal.inc({ pagina: paginaSafe });
        break;

      case 'login_intento':
      case 'login_exitoso':
      case 'login_fallido':
        if (!METRICS.frontendLoginsTotal) {
          METRICS.frontendLoginsTotal = getOrCreateCounter(
            'dragon_frontend_logins_total',
            'Total login attempts',
            ['resultado']
          );
        }
        const resultado = tipoEvento === 'login_exitoso' ? 'exitoso' :
                         tipoEvento === 'login_fallido' ? 'fallido' : 'intento';
        METRICS.frontendLoginsTotal.inc({ resultado });
        break;

      case 'android_v1_resultado':
        if (!METRICS.androidV1Results) {
          METRICS.androidV1Results = getOrCreateCounter(
            'dragon_android_v1_results_total',
            'Android v1 analysis results',
            ['tipo_resultado']
          );
        }
        const tipoResultado = metadata.tipoResultado || 'default';
        const tipoResultadoSafe = String(tipoResultado).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 50).toLowerCase();
        METRICS.androidV1Results.inc({ tipo_resultado: tipoResultadoSafe });
        break;

      default:
        // Para otros tipos de eventos, solo incrementar la métrica general
        break;
    }

    // LOG DE DEBUG (solo para desarrollo)
    if (process.env.NODE_ENV === 'development') {
      dragon.zen('Métrica frontend incrementada', NOMBRE_MODULO, 'incrementarContadorFrontend', {
        tipoEvento: tipoEventoSafe,
        nuevoValor: this.frontendCounters[tipoEvento],
        contadoresTotales: Object.keys(this.frontendCounters).length,
        metadata
      });
    }

  } catch (error) {
    dragon.agoniza('Error incrementando contador frontend', error, NOMBRE_MODULO, 'incrementarContadorFrontend', {
      tipoEvento,
      metadata,
      frontendCountersSize: this.frontendCounters ? Object.keys(this.frontendCounters).length : 0
    });
  }
}

  async iniciar() {
  try {
    // ESTRATEGIA DE RECUPERACIÓN MEJORADA - MongoDB primero
    const fromMongo = await this._recuperarBusinessMetricsMongo();

    // CREAR ÍNDICE TTL PARA LIMPIEZA AUTOMÁTICA
    await this.crearIndiceMongoDB();

    // Solo como fallback, la sincronización actual de analisisCompletados
    this.businessMetrics.analisisCompletados = await obtenerAnalisisCompletadosMongo();

    dragon.zen('Iniciando HealthMonitor enterprise Dragon3', NOMBRE_MODULO, 'iniciar', {
      slaThresholds: this.slaThresholds,
      intervalos: this.configuracion,
      metricasIniciales: {
        analisisCompletados: this.businessMetrics.analisisCompletados,
        analisisExitosos: this.businessMetrics.analisisExitosos,
        analisisFallidos: this.businessMetrics.analisisFallidos,
        fuente: fromMongo ? 'MongoDB' : 'Recálculo'
      }
    });

    // INICIAR INTERVALOS (tu código existente)
    this.intervalos.healthCheck = setInterval(() => {
      this.verificarSaludSistema();
    }, this.configuracion.intervaloHealthCheck);

    this.intervalos.memoryCheck = setInterval(() => {
      this.monitorearMemoria();
    }, this.configuracion.intervaloMemoryCheck);

    this.intervalos.anomalyCheck = setInterval(() => {
      this.detectarAnomalias();
    }, this.configuracion.intervaloAnomalyCheck);

    this.intervalos.cleanup = setInterval(() => {
      this.limpiarMetricasAntiguas();
    }, this.configuracion.intervaloCleanup);

    this.intervalos.baselineCheck = setInterval(() => {
      if (!this.anomalyDetection.configurado) {
        this.configurarBaselinesAnomalias();
      }
    }, 60000);

    // NUEVO: Intervalo de backup MongoDB cada 5 minutos
    this.intervalos.backupBusinessMongo = setInterval(() => {
      this._persistirBusinessMetricsMongo();
    }, 300000);

    this.estadoSistema.salud = 'activo';
    this.estadoSistema.uptime = Date.now();

    dragon.sonrie('HealthMonitor enterprise activo Dragon3', NOMBRE_MODULO, 'iniciar', {
      intervalos: Object.keys(this.intervalos).length,
      features: ['Health Check', 'Memory Monitor FAANG', 'Anomaly Detection', 'Auto Cleanup', 'Business Metrics Persistence (MongoDB)']
    });
  } catch (error) {
    dragon.agoniza('Error iniciando HealthMonitor', error, NOMBRE_MODULO, 'iniciar');
    throw error;
  }
}

async crearIndiceMongoDB() {
  try {
    // SOLUCIÓN: Usar mongoose.connection
    const db = mongoose.connection;
    if (!db || db.readyState !== 1) return;

    const collection = db.collection('health_metrics_snapshots');
    await collection.createIndex(
      { "ultimaActualizacion": 1 },
      { expireAfterSeconds: 604800 }
    );
    dragon.zen('Índice TTL creado en MongoDB Atlas', NOMBRE_MODULO, 'crearIndiceMongoDB');
  } catch (error) {
    dragon.sePreocupa('Error creando índice (puede que ya exista)', error, NOMBRE_MODULO, 'crearIndiceMongoDB');
  }
}


  // ===== Memoria FAANG+ con warmup+sostenida + Prometheus =====
  monitorearMemoria() {
    try {
      const memoria = process.memoryUsage();
      const timestamp = Date.now();

      // Series 1h
      const horaAtras = timestamp - 3600000;
      this.memoryMetrics.heapUsed.push({ valor: memoria.heapUsed, timestamp });
      this.memoryMetrics.external.push({ valor: memoria.external, timestamp });
      this.memoryMetrics.rss.push({ valor: memoria.rss, timestamp });
      this.memoryMetrics.heapUsed = this.memoryMetrics.heapUsed.filter(m => m.timestamp > horaAtras);
      this.memoryMetrics.external = this.memoryMetrics.external.filter(m => m.timestamp > horaAtras);
      this.memoryMetrics.rss = this.memoryMetrics.rss.filter(m => m.timestamp > horaAtras);

      const heapMB = Math.round(memoria.heapUsed / 1024 / 1024);
      const rssMB = Math.round(memoria.rss / 1024 / 1024);
      const heapStats = v8.getHeapStatistics();
      const heapTotalMB = Math.round(heapStats.heap_size_limit / 1024 / 1024) || 1;
      const heapUsagePercent = (heapMB / heapTotalMB) * 100;
      const umbralHeapMB = parseInt(process.env.MEMORY_ALERT_MB) || 512;
      const umbralRSS = parseInt(process.env.RSS_ALERT_MB) || 1024;

      // Prometheus: proceso
      METRICS.memHeapUsedBytes.set(memoria.heapUsed);
      METRICS.memRssBytes.set(memoria.rss);

      // Alertas por MB
      if (heapMB > umbralHeapMB) {
        this.memoryMetrics.alertasMemoria++;
        dragon.seEnfada('Uso alto de heap Node.js detectado', NOMBRE_MODULO, 'monitorearMemoria', {
          heapUsedMB: heapMB, umbralMB: umbralHeapMB, rssMB, alertasTotal: this.memoryMetrics.alertasMemoria
        });
      }
      if (rssMB > umbralRSS) {
        this.memoryMetrics.alertasMemoria++;
        dragon.seEnfada('Uso alto de memoria física (RSS) en Node.js', NOMBRE_MODULO, 'monitorearMemoria', {
          rssMB, umbralRSS, heapUsedMB: heapMB, alertasTotal: this.memoryMetrics.alertasMemoria
        });
      }

      // Sistema
      const totalRamMB = Math.round(os.totalmem() / 1024 / 1024);
      const freeRamMB = Math.round(os.freemem() / 1024 / 1024);
      const usedRamMB = totalRamMB - freeRamMB;
      const systemRatio = totalRamMB > 0 ? usedRamMB / totalRamMB : 0;
      METRICS.systemRamUsedRatio.set(systemRatio);

      const systemPressureThreshold = parseFloat(process.env.SYSTEM_MEMORY_ALERT_PERCENT) || 90;
      const percentSystemUsed = (systemRatio * 100).toFixed(1);
      if (percentSystemUsed > systemPressureThreshold) {
        this.memoryMetrics.alertasSistema++;
        this.memoryMetrics.systemPressureEvents.push({ timestamp, percentSystemUsed });
        dragon.grita('Presión de memoria física del sistema detectada', NOMBRE_MODULO, 'monitorearMemoria', {
          usedRamMB, totalRamMB, percentSystemUsed, systemPressureThreshold, eventos: this.memoryMetrics.systemPressureEvents.length
        });
      }

      // Presión RSS vs RAM total
      const rssPressurePercent = ((rssMB / totalRamMB) * 100).toFixed(1);
      const rssSystemThreshold = parseFloat(process.env.RSS_SYSTEM_PRESSURE_PERCENT) || 80;
      if (rssPressurePercent > rssSystemThreshold) {
        this.memoryMetrics.alertasMemoria++;
        dragon.sePreocupa('Presión real de memoria proceso vs RAM total', NOMBRE_MODULO, 'monitorearMemoria', {
          rssMB, totalRamMB, rssPressurePercent, rssSystemThreshold, alertasTotal: this.memoryMetrics.alertasMemoria
        });
      }

      // Warmup + sostenida (umbral en % heap)
      const thresholdPercent = this.memoryDegradation.thresholdPercent;
      const warmupPassed = (Date.now() - this.estadoSistema.uptime) / 1000 > this.memoryDegradation.warmupSeconds;

      if (heapUsagePercent > thresholdPercent) {
        this.memoryDegradation.consecutiveBreaches += 1;
        dragon.sePreocupa('MEM warmup breach', NOMBRE_MODULO, 'MEM_WARMUP_BREACH', {
          heapUsagePercent: Number(heapUsagePercent.toFixed(2)),
          thresholdPercent,
          consecutiveBreaches: this.memoryDegradation.consecutiveBreaches,
          warmupPassed
        });
      } else {
        if (this.memoryDegradation.consecutiveBreaches > 0) {
          dragon.zen('MEM breach reset', NOMBRE_MODULO, 'MEM_WARMUP_RESET', { prev: this.memoryDegradation.consecutiveBreaches });
        }
        this.memoryDegradation.consecutiveBreaches = 0;
      }
      this.memoryDegradation.lastCheck = Date.now();

      // GC oportunista si expuesto y heap alto
      if (global.gc && heapMB > (umbralHeapMB * 0.8)) {
        global.gc();
        this.memoryMetrics.ultimoGC = timestamp;
        dragon.zen('Garbage collection ejecutado (FAANG)', NOMBRE_MODULO, 'monitorearMemoria', { memoriaAntes: heapMB, umbral: umbralHeapMB * 0.8 });
      }
    } catch (error) {
      dragon.agoniza('Error monitoreando memoria', error, NOMBRE_MODULO, 'monitorearMemoria');
    }
  }

// Método mejorado para obtener métricas reales de Redis
_actualizarMetricasPrometheus(percentiles, tasaError, throughput, availability, businessMetrics) {
  try {
    // MÉTRICAS BÁSICAS
    if (METRICS.analisisRate5m) METRICS.analisisRate5m.set(throughput);
    if (METRICS.uniqueUsersTotal && businessMetrics?.usuariosUnicosSet) {
      METRICS.uniqueUsersTotal.set(businessMetrics.usuariosUnicosSet.size);
    }

    // REDIS - LLAMADAS REALES
    if (METRICS.redisLatencyP95 || METRICS.redisConnectionsActive) {
      const metricasRedis = this._obtenerMetricasRedisReales();
      if (METRICS.redisLatencyP95) METRICS.redisLatencyP95.set(metricasRedis.latency);
      if (METRICS.redisConnectionsActive) METRICS.redisConnectionsActive.set(metricasRedis.connectedClients);
    }

    // WEBSOCKET - DATOS REALES O CÁLCULO
    if (METRICS.websocketMessagesRate) {
      const rate = this.estadoSistema?.servidorCentral?.throughput ?? this._calcularRateWebSocket();
      METRICS.websocketMessagesRate.set(rate);
    }

    // ALERTAS
    if (METRICS.alertasActivas) {
      METRICS.alertasActivas.set(this.estadoSistema?.alertasActivas?.length || 0);
    }

  } catch (error) {
    dragon.sePreocupa('Error actualizando métricas Prometheus', error, NOMBRE_MODULO, '_actualizarMetricasPrometheus');
  }
}

// MÉTODO AUXILIAR NECESARIO
async _obtenerMetricasRedisReales() {
  try {
    const client = this.redisClient;
    if (!client) return { latency: 0, connectedClients: 0 };

    // Latencia real con PING
    const start = Date.now();
    await client.ping();
    const latency = Date.now() - start;

    // Conexiones activas
    let connectedClients = 0;
    try {
      const info = await client.info();
      const clientsLine = info.split('\n').find(line => line.startsWith('connected_clients:'));
      connectedClients = parseInt(clientsLine?.split(':')[1]) || 1;
    } catch {
      connectedClients = 1; // Fallback
    }

    return { latency, connectedClients };
  } catch {
    return { latency: 0, connectedClients: 0 };
  }
}

// MÉTODO AUXILIAR NECESARIO
_calcularRateWebSocket() {
  const hace5Min = Date.now() - 300000;
  const mensajes = (this.tiemposRespuesta || []).filter(m =>
    m.timestamp > hace5Min && m.ruta?.includes('websocket')
  ).length;
  return mensajes / 300; // Mensajes/segundo en 5 minutos
}

// Reemplazar los métodos existentes
_obtenerLatenciaRedisP95() {
  try {
    const metricas = this._obtenerMetricasRedisReales();
    return metricas.latency;
  } catch (e) {
    return 0;
  }
}

_obtenerConexionesRedis() {
  try {
    const metricas = this._obtenerMetricasRedisReales();
    return metricas.connectedClients;
  } catch (e) {
    return 0;
  }
}

_obtenerOperacionesRedis() {
  try {
    const metricas = this._obtenerMetricasRedisReales();
    return metricas.totalOperations;
  } catch (e) {
    return 0;
  }
}

// Agregar este método para actualizar métricas de WebSocket
_actualizarMetricasWebSocket() {
  try {
    if (!METRICS.websocketMessagesRate) return;

    // Obtener métricas reales del servidor WebSocket
    const servidor = this.estadoSistema.servidorCentral;
    if (servidor && typeof servidor.throughput === 'number') {
      METRICS.websocketMessagesRate.set(servidor.throughput);
    } else {
      // Fallback: calcular basado en actividad reciente
      const ahora = Date.now();
      const hace5Min = ahora - (5 * 60 * 1000);

      // Contar mensajes WebSocket en los últimos 5 minutos
      const mensajesRecientes = this.tiemposRespuesta.filter(m =>
        m.timestamp > hace5Min && m.ruta && m.ruta.includes('websocket')
      ).length;

      const rate = mensajesRecientes / 300; // Mensajes por segundo en 5 minutos
      METRICS.websocketMessagesRate.set(rate);
    }
  } catch (error) {
    dragon.sePreocupa('Error actualizando métricas WebSocket', error, NOMBRE_MODULO, '_actualizarMetricasWebSocket');
  }
}

  // ===== Health completo + Prometheus alertasActivas =====
  // Sustituye el cuerpo de verificarSaludSistema() por este (misma firma)
async verificarSaludSistema() {
  try {
    const inicio = Date.now();

    // Evaluación ventana deslizante + warmup
    const windowStats = this._getWindowStats();
    const canEvaluate = this._shouldEvaluateDegrade(windowStats);
    const warmup = this._inWarmup();
    const degradeEval = canEvaluate ? this._updateDegrade(windowStats) : { degraded: false, reason: warmup ? 'warmup' : 'insufficient_samples' };

    const saludRedis = await this.verificarComponente({ verificarSalud: verificarSaludRedis }, 'redis');
    const saludMongo = await this.verificarComponente(mongoManager, 'mongodb');

    const metricas = this.calcularMetricasAvanzadas();
    const memoria = process.memoryUsage();

    const totalRamMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeRamMB = Math.round(os.freemem() / 1024 / 1024);
    const usedRamMB = totalRamMB - freeRamMB;
    const percentSystemUsed = parseFloat(((usedRamMB / totalRamMB) * 100).toFixed(1));

    const alertasActivas = [];

    // SLA P95: solo evaluar fuera de warmup y con muestras suficientes (en ventana)
    if (canEvaluate) {
      const slaP95 = (this.slaThresholds && typeof this.slaThresholds.p95 === 'number') ? this.slaThresholds.p95 : 200;
      if (windowStats.p95 > slaP95) {
        alertasActivas.push({
          codigo: 'SLA_P95_BREACH',
          mensaje: `P95 ventana (${windowStats.p95} ms) supera SLA (${slaP95} ms)`,
          nivel: 'critica',
          timestamp: new Date().toISOString(),
          valorActual: windowStats.p95,
          umbral: slaP95,
          componente: 'core',
          accionesSugeridas: ['Escalar a SRE', 'Revisar latencia de dependencias'],
          resuelto: false
        });
      }
    }

    // Error rate / availability: mantienen lógica original (no dependen de warmup típicamente)
    if (!metricas.slaCompliance.errorRate) {
      alertasActivas.push({
        codigo: 'ERROR_RATE_BREACH',
        mensaje: `Tasa de error (${metricas.tasaError.toFixed(2)}%) supera SLA (${this.slaThresholds.errorRate}%)`,
        nivel: 'critica',
        timestamp: new Date().toISOString(),
        valorActual: metricas.tasaError,
        umbral: this.slaThresholds.errorRate,
        componente: 'core',
        accionesSugeridas: ['Revisar últimos errores', 'Auditar logs'],
        resuelto: false
      });
    }
    if (!metricas.slaCompliance.availability) {
      alertasActivas.push({
        codigo: 'SLA_AVAILABILITY_BREACH',
        mensaje: `Availability (${metricas.availability.toFixed(3)}%) inferior a SLA (${this.slaThresholds.availability}%)`,
        nivel: 'critica',
        timestamp: new Date().toISOString(),
        valorActual: metricas.availability,
        umbral: this.slaThresholds.availability,
        componente: 'core',
        accionesSugeridas: ['Revisar caídas de red', 'Verificar errores 5xx/4xx'],
        resuelto: false
      });
    }

    if (percentSystemUsed > 95) {
      alertasActivas.push({
        codigo: 'MEMORY_PRESSURE_CRITICA',
        mensaje: `Uso de RAM física (${percentSystemUsed}%) superior al 95%`,
        nivel: 'critica',
        timestamp: new Date().toISOString(),
        valorActual: percentSystemUsed,
        umbral: 95,
        componente: 'sistema',
        accionesSugeridas: ['Liberar recursos', 'Revisar procesos residentes'],
        resuelto: false
      });
    } else if (percentSystemUsed > 80) {
      alertasActivas.push({
        codigo: 'MEMORY_PRESSURE_WARNING',
        mensaje: `Uso de RAM física (${percentSystemUsed}%) superior al 80%`,
        nivel: 'warning',
        timestamp: new Date().toISOString(),
        valorActual: percentSystemUsed,
        umbral: 80,
        componente: 'sistema',
        accionesSugeridas: ['Monitorizar uso de memoria'],
        resuelto: false
      });
    }

    if (metricas.throughput < 0.05) {
      alertasActivas.push({
        codigo: 'THROUGHPUT_LOW',
        mensaje: `Throughput bajo: ${metricas.throughput} req/s`,
        nivel: 'warning',
        timestamp: new Date().toISOString(),
        valorActual: metricas.throughput,
        umbral: 0.05,
        componente: 'core',
        accionesSugeridas: ['Verificar demanda', 'Analizar cuellos de botella'],
        resuelto: false
      });
    }

    if (saludRedis.estado !== 'saludable') {
      alertasActivas.push({
        codigo: 'REDIS_UNHEALTHY',
        mensaje: `Redis no saludable: ${saludRedis.estado}`,
        nivel: 'critica',
        timestamp: new Date().toISOString(),
        valorActual: saludRedis.estado,
        umbral: 'saludable',
        componente: 'redis',
        accionesSugeridas: ['Revisar conexión Redis', 'Escalar a DevOps'],
        resuelto: false
      });
    }
    if (saludMongo.estado !== 'saludable') {
      alertasActivas.push({
        codigo: 'MONGODB_UNHEALTHY',
        mensaje: `MongoDB no saludable: ${saludMongo.estado}`,
        nivel: 'critica',
        timestamp: new Date().toISOString(),
        valorActual: saludMongo.estado,
        umbral: 'saludable',
        componente: 'mongodb',
        accionesSugeridas: ['Revisar conexión MongoDB', 'Escalar a DevOps'],
        resuelto: false
      });
    }

    const estadoSistema = {
      ...metricas,
      // Exposición explícita de degradación
      degradacion: {
        active: degradeEval.degraded,
        reason: degradeEval.reason,
        consecutive: this.degradeState.consecutiveBreaches,
        window: { ms: this.degradePolicy.windowMs, count: windowStats.count, p95: windowStats.p95, p99: windowStats.p99 },
        minSamples: this.degradePolicy.minSamples,
        warmupSkipped: warmup
      },
      componentes: { redis: saludRedis, mongodb: saludMongo },
      sistema: {
        uptime: Math.round((Date.now() - this.estadoSistema.uptime) / 1000),
        memoria: {
          heapUsedMB: Math.round(memoria.heapUsed / 1024 / 1024),
          rssMB: Math.round(memoria.rss / 1024 / 1024),
          externalMB: Math.round(memoria.external / 1024 / 1024),
          usedRamMB,
          totalRamMB,
          percentSystemUsed
        },
        tiempoVerificacion: Date.now() - inicio
      },
      alertas: alertasActivas,
      timestamp: new Date().toISOString()
    };

    METRICS.alertasActivas.set(alertasActivas.length);
    this.estadoSistema.ultimoHealthCheck = estadoSistema;

    dragon.zen('🧘 Health check enterprise Dragon3', NOMBRE_MODULO, 'verificarSaludSistema', {
      slaCompliance: { ...metricas.slaCompliance, windowP95: windowStats.p95, windowCount: windowStats.count },
      throughput: metricas.throughput,
      availability: metricas.availability.toFixed(2) + '%',
      mem: estadoSistema.sistema.memoria,
      alertas: alertasActivas.map(a => a.codigo),
      degradacion: estadoSistema.degradacion,
      componentes: Object.keys(estadoSistema.componentes).map(c => `${c}:${estadoSistema.componentes[c].estado}`).join(',')
    });

    return estadoSistema;
  } catch (error) {
    dragon.agoniza('Error verificando salud sistema', { message: error.message, stack: error.stack }, NOMBRE_MODULO, 'verificarSaludSistema');
    return {
      estado: 'error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      alertas: []
    };
  }
}

  async verificarComponente(componente, nombre) {
    try {
      if (!componente || typeof componente.verificarSalud !== 'function') {
        return { estado: 'no_disponible', error: 'Componente no implementa verificarSalud' };
      }
      const salud = await componente.verificarSalud();
      return { estado: salud.estado || 'desconocido', latencia: salud.latencia || 0, detalles: salud };
    } catch (error) {
      return { estado: 'error', error: error.message, latencia: 0 };
    }
  }

  detectarAnomalias() {
    try {
      if (!this.anomalyDetection.configurado) return;
      const metricas = this.calcularMetricasAvanzadas();
      const baselines = this.anomalyDetection.baselines;

      if (metricas.p95 > baselines.p95 * 2) {
        this.anomalyDetection.alertasAnomalias++;
        dragon.grita('ANOMALÍA: P95 anómalamente alto', NOMBRE_MODULO, 'detectarAnomalias', {
          p95Actual: metricas.p95, baselineP95: baselines.p95, factorDesviacion: (metricas.p95 / baselines.p95).toFixed(2)
        });
      }
      if (metricas.tasaError > baselines.errorRate * 3) {
        this.anomalyDetection.alertasAnomalias++;
        dragon.grita('ANOMALÍA: Tasa error anómalamente alta', NOMBRE_MODULO, 'detectarAnomalias', {
          tasaErrorActual: metricas.tasaError, baselineErrorRate: baselines.errorRate, factorDesviacion: (metricas.tasaError / baselines.errorRate).toFixed(2)
        });
      }
      if (metricas.throughput < baselines.throughput * 0.3) {
        this.anomalyDetection.alertasAnomalias++;
        dragon.grita('ANOMALÍA: Throughput anómalamente bajo', NOMBRE_MODULO, 'detectarAnomalias', {
          throughputActual: metricas.throughput, baselineThroughput: baselines.throughput, factorDesviacion: (metricas.throughput / baselines.throughput).toFixed(2)
        });
      }
    } catch (error) {
      dragon.agoniza('Error detectando anomalías', error, NOMBRE_MODULO, 'detectarAnomalias');
    }
  }

  configurarBaselinesAnomalias() {
    try {
      const minDatos = parseInt(process.env.BASELINE_MIN_DATOS) || 20;
      const len = Array.isArray(this.tiemposRespuesta) ? this.tiemposRespuesta.length : 0;

      if (len < minDatos) {
        dragon.zen('Insuficientes datos para baselines', NOMBRE_MODULO, 'configurarBaselinesAnomalias', { datosActuales: len, requeridos: minDatos });
        return;
      }

      const metricas = this.calcularMetricasAvanzadas();
      this.anomalyDetection.baselines = {
        p95: metricas.p95,
        errorRate: metricas.tasaError,
        throughput: metricas.throughput
      };
      this.anomalyDetection.configurado = true;

      dragon.sonrie('Baselines anomalías configurados Dragon3', NOMBRE_MODULO, 'configurarBaselinesAnomalias', {
        baselines: this.anomalyDetection.baselines, datosUsados: len
      });
    } catch (error) {
      dragon.agoniza('Error configurando baselines', error, NOMBRE_MODULO, 'configurarBaselinesAnomalias');
    }
  }

  limpiarMetricasAntiguas() {
    try {
      const antes = { tiemposRespuesta: this.tiemposRespuesta.length, memoryMetrics: this.memoryMetrics.heapUsed.length };
      const horaAtras = Date.now() - 3600000;

      this.tiemposRespuesta = this.tiemposRespuesta.filter(m => m.timestamp > horaAtras);
      this.businessMetrics.usuariosActivosSet?.clear?.();

      Object.keys(this.performanceBuckets).forEach(bucket => { this.performanceBuckets[bucket] = 0; });

      const despues = { tiemposRespuesta: this.tiemposRespuesta.length, memoryMetrics: this.memoryMetrics.heapUsed.length };

      dragon.zen('Métricas antiguas limpiadas Dragon3', NOMBRE_MODULO, 'limpiarMetricasAntiguas', {
        eliminadas: {
          tiemposRespuesta: antes.tiemposRespuesta - despues.tiemposRespuesta,
          memoryMetrics: antes.memoryMetrics - despues.memoryMetrics
        },
        restantes: despues
      });
    } catch (error) {
      dragon.agoniza('Error limpiando métricas', error, NOMBRE_MODULO, 'limpiarMetricasAntiguas');
    }
  }

  obtenerMetricasDashboard() {
  try {
    const metricas = this.calcularMetricasAvanzadas();
    const memoria = process.memoryUsage();
    const totalRamMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeRamMB = Math.round(os.freemem() / 1024 / 1024);
    const usedRamMB = totalRamMB - freeRamMB;
    const percentSystemUsed = ((usedRamMB / totalRamMB) * 100).toFixed(1);

    // BUSINESS DATA CON DEFENSIVAS ROBUSTAS
    const analisisCompletados = this.businessMetrics?.analisisCompletados || 0;
    const analisisExitosos = this.businessMetrics?.analisisExitosos || 0;
    const analisisFallidos = this.businessMetrics?.analisisFallidos || 0;
    const archivosProcessados = this.businessMetrics?.archivosProcessados || 0;
    const volumenDatosMB = Number((this.businessMetrics?.volumenDatosMB || 0).toFixed(2));
    const usuariosActivos = this.businessMetrics?.usuariosActivosSet?.size || 0;
    const usuariosUnicos = this.businessMetrics?.usuariosUnicosSet?.size || 0;

    // CÁLCULOS SEGUROS PARA MÉTRICAS AVANZADAS
    const analisisNuevos24h = this._calcularAnalisisNuevos24h ? this._calcularAnalisisNuevos24h() : 0;
    const volumenDatosProcesadosHoy = this._calcularVolumenDatosHoy ? this._calcularVolumenDatosHoy() : 0;
    const tasaCrecimientoUsuarios = this._calcularTasaCrecimientoUsuarios ? this._calcularTasaCrecimientoUsuarios() : 0;

    const businessData = {
      // MÉTRICAS BÁSICAS
      totalAnalisis: analisisCompletados,
      analisisExitosos: analisisExitosos,
      analisisFallidos: analisisFallidos,
      archivosProcesados: archivosProcessados,
      volumenDatosMB: volumenDatosMB,
      usuariosActivos: usuariosActivos,
      usuariosUnicos: usuariosUnicos,

      // MÉTRICAS DERIVADAS
      tasaExito: analisisCompletados > 0 ? Number(((analisisExitosos / analisisCompletados) * 100).toFixed(2)) : 0,
      tasaFallo: analisisCompletados > 0 ? Number(((analisisFallidos / analisisCompletados) * 100).toFixed(2)) : 0,
      porcentajeProcesados: archivosProcessados > 0 ?
        Number(((analisisCompletados / archivosProcessados) * 100).toFixed(2)) : 0,

      // MÉTRICAS AVANZADAS
      analisisNuevos24h: analisisNuevos24h,
      analisisRate5m: metricas.throughput || 0,
      volumenDatosProcesadosHoy: volumenDatosProcesadosHoy,
      tasaCrecimientoUsuarios: Number(tasaCrecimientoUsuarios.toFixed(2)),
      mediaAnalisisPorUsuario: usuariosUnicos > 0 ?
        Number((analisisCompletados / usuariosUnicos).toFixed(2)) : 0,
      mediaDatosPorAnalisis: analisisCompletados > 0 ?
        Number((volumenDatosMB / analisisCompletados).toFixed(2)) : 0
    };

    // MÉTRICAS FRONTEND - CORREGIDAS
    const loginsExitosos = this.frontendCounters?.['login_exitoso'] || 0;
    const loginsFallidos = this.frontendCounters?.['login_fallido'] || 0;
    const loginsIntentos = this.frontendCounters?.['login_intento'] || 0;
    const loginsTotales = loginsIntentos + loginsExitosos + loginsFallidos;
    const conversionLogin = loginsTotales > 0 ? (loginsExitosos / loginsTotales) * 100 : 0;

    // Calcular eventos totales de frontend
    const eventosTotales = Object.values(this.frontendCounters || {}).reduce((sum, val) => sum + val, 0);

    // Top eventos (máximo 5)
    const topEventos = Object.entries(this.frontendCounters || {})
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {});

    const frontendData = {
      eventosTotales: eventosTotales,
      visitasWeb: this.frontendCounters?.['visita_web'] || 0,
      loginsExitosos: loginsExitosos,
      loginsFallidos: loginsFallidos,
      loginsTotales: loginsTotales,
      conversionLogin: Number(conversionLogin.toFixed(2)),
      androidV1Resultados: this.frontendCounters?.['android_v1_resultado'] || 0,
      topEventos: topEventos
    };

    // MÉTRICAS REDIS - CORREGIDAS (LLAMADAS SÍNCRONAS)
    const redisLatenciaP95 = this._obtenerLatenciaRedisP95 ? this._obtenerLatenciaRedisP95() : 0;
    const redisClientesConectados = this._obtenerConexionesRedis ? this._obtenerConexionesRedis() : 0;
    const redisOperacionesTotales = this._obtenerOperacionesRedis ? this._obtenerOperacionesRedis() : 0;

    const redisData = {
      latenciaP95: redisLatenciaP95,
      circuitBreaker: this.circuitBreaker?.estado === 'abierto' ? 1 : 0,
      clientesConectados: redisClientesConectados,
      operacionesTotales: redisOperacionesTotales
    };

    // MÉTRICAS WEBSOCKET - CORREGIDAS
    const websocketData = {
      conexionesActivas: this.estadoSistema?.servidorCentral?.connectionsActive || 0,
      mensajesRate: this.estadoSistema?.servidorCentral?.throughput || 0,
      errorRate: this.estadoSistema?.servidorCentral?.errorRate || 0,
      totalMensajes: this.estadoSistema?.servidorCentral?.totalMessages || 0
    };

    // MÉTRICAS ANOMALÍAS - CORREGIDAS
    const anomaliasData = {
      configurado: this.anomalyDetection?.configurado || false,
      alertas: this.anomalyDetection?.alertasAnomalias || 0,
      baselines: this.anomalyDetection?.baselines || {},
      detectadasRecientemente: this._obtenerAnomaliasRecientes ? this._obtenerAnomaliasRecientes() : false
    };

    return {
      // MÉTRICAS SLA Y PERFORMANCE
      totalSolicitudesHTTP: metricas.totalSolicitudes || 0,
      totalAnalisisCompletados: analisisCompletados,
      resumen: {
        salud: this.estadoSistema?.salud || 'desconocido',
        slaCompliance: metricas.slaCompliance || {},
        alertasActivas: this.estadoSistema?.alertasActivas?.length || 0,
        degradacion: this.degradeState?.degraded ? 'activa' : 'inactiva'
      },
      performance: {
        percentiles: {
          p50: metricas.p50 || 0,
          p95: metricas.p95 || 0,
          p99: metricas.p99 || 0
        },
        thresholds: this.slaThresholds || {},
        buckets: metricas.performanceBuckets || {},
        throughput: metricas.throughput || 0,
        availability: metricas.availability || 100,
        errorRate: metricas.tasaError || 0
      },
      errores: {
        total: metricas.totalErrores || 0,
        tasaError: metricas.tasaError || 0,
        clasificacion: metricas.clasificacionErrores || {},
        circuitBreaker: metricas.circuitBreaker || {}
      },

      // BUSINESS METRICS COMPLETAS
      business: businessData,

      // MÉTRICAS FRONTEND COMPLETAS
      frontend: frontendData,

      // WEBSOCKET
      websocket: websocketData,

      // REDIS
      redis: redisData,

      // ANOMALÍAS
      anomalias: anomaliasData,

      // MEMORY DEGRADATION
      memoryDegradation: this.getMemoryDegradationState(),

      // SISTEMA
      sistema: {
        memoria: {
          heapUsedMB: Math.round(memoria.heapUsed / 1024 / 1024),
          rssMB: Math.round(memoria.rss / 1024 / 1024),
          usedRamMB,
          totalRamMB,
          percentSystemUsed: Number(percentSystemUsed)
        },
        uptime: Math.round((Date.now() - (this.estadoSistema?.uptime || Date.now())) / 1000),
        gc: this.memoryMetrics?.ultimoGC || 0
      },

      timestamp: new Date().toISOString()
    };

  } catch (error) {
    dragon.agoniza('Error en obtenerMetricasDashboard', error, NOMBRE_MODULO, 'obtenerMetricasDashboard', {
      errorDetails: {
        message: error.message,
        stack: error.stack?.split('\n')[0]
      }
    });

    // FALLBACK MÍNIMO PERO FUNCIONAL
    return {
      status: 'error_fallback',
      timestamp: new Date().toISOString(),
      totalSolicitudesHTTP: 0,
      totalAnalisisCompletados: 0,
      business: {
        totalAnalisis: this.businessMetrics?.analisisCompletados || 0,
        analisisExitosos: this.businessMetrics?.analisisExitosos || 0,
        analisisFallidos: this.businessMetrics?.analisisFallidos || 0,
        archivosProcesados: this.businessMetrics?.archivosProcessados || 0,
        volumenDatosMB: this.businessMetrics?.volumenDatosMB || 0,
        usuariosActivos: this.businessMetrics?.usuariosActivosSet?.size || 0,
        usuariosUnicos: this.businessMetrics?.usuariosUnicosSet?.size || 0
      },
      frontend: {
        eventosTotales: Object.values(this.frontendCounters || {}).reduce((sum, val) => sum + val, 0),
        visitasWeb: this.frontendCounters?.['visita_web'] || 0,
        loginsExitosos: this.frontendCounters?.['login_exitoso'] || 0,
        loginsFallidos: this.frontendCounters?.['login_fallido'] || 0,
        loginsTotales: (this.frontendCounters?.['login_intento'] || 0) + (this.frontendCounters?.['login_exitoso'] || 0),
        conversionLogin: 0,
        androidV1Resultados: this.frontendCounters?.['android_v1_resultado'] || 0,
        topEventos: {}
      },
      redis: {
        latenciaP95: 0,
        circuitBreaker: 0,
        clientesConectados: 0,
        operacionesTotales: 0
      },
      websocket: {
        conexionesActivas: 0,
        mensajesRate: 0,
        errorRate: 0,
        totalMensajes: 0
      },
      performance: {
        percentiles: { p50: 0, p95: 0, p99: 0 },
        throughput: 0,
        availability: 100,
        errorRate: 0
      },
      sistema: {
        memoria: {
          heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
          percentSystemUsed: 0
        },
        uptime: Math.round((Date.now() - (this.estadoSistema?.uptime || Date.now())) / 1000)
      }
    };
  }
}


_calcularAnalisisNuevos24h() {
  try {
    const hace24h = Date.now() - (24 * 60 * 60 * 1000);
    if (!Array.isArray(this.businessMetrics.historicoAnalisis)) return 0;

    return this.businessMetrics.historicoAnalisis
      .filter(analisis => analisis.timestamp > hace24h)
      .length;
  } catch (error) {
    return 0;
  }
}

_calcularVolumenDatosHoy() {
  try {
    const hace24h = Date.now() - (24 * 60 * 60 * 1000);
    if (!Array.isArray(this.businessMetrics.historicoAnalisis)) return 0;

    return Number(this.businessMetrics.historicoAnalisis
      .filter(analisis => analisis.timestamp > hace24h)
      .reduce((sum, analisis) => sum + (analisis.tamanoArchivo || 0) / (1024 * 1024), 0)
      .toFixed(2));
  } catch (error) {
    return 0;
  }
}

_obtenerLatenciaRedisP95() {
  try {
    const val = this.estadoSistema?.ultimoHealthCheck?.componentes?.redis?.latencia;
    if (typeof val === 'number' && val >= 0) return val;
    const detalles = this.estadoSistema?.ultimoHealthCheck?.componentes?.redis?.detalles;
    if (detalles && typeof detalles.latency === 'number') return detalles.latency;
    // No hay P95 directo desde raw client -> fallback 0
    return 0;
  } catch (e) { return 0; }
}

_obtenerConexionesRedis() {
  try {
    const detalles = this.estadoSistema?.ultimoHealthCheck?.componentes?.redis?.detalles;
    if (detalles && typeof detalles.connectedClients === 'number') return detalles.connectedClients;
    // fallback: devolver 0 (healthcheck actualiza cuando pueda)
    return 0;
  } catch (e) { return 0; }
}

_obtenerOperacionesRedis() {
  try {
    const detalles = this.estadoSistema?.ultimoHealthCheck?.componentes?.redis?.detalles;
    if (detalles && typeof detalles.totalOperations === 'number') return detalles.totalOperations;
    return 0;
  } catch (e) { return 0; }
}

_obtenerAnomaliasRecientes() {
  return this.anomalyDetection.alertasAnomalias > 0;
}

  configurarSLA(nuevosThresholds) {
    this.slaThresholds = { ...this.slaThresholds, ...nuevosThresholds };
    dragon.zen('SLA thresholds configurados Dragon3', NOMBRE_MODULO, 'configurarSLA', { slaThresholds: this.slaThresholds });
  }

  parar() {
  try {
    dragon.zen('Parando HealthMonitor enterprise Dragon3', NOMBRE_MODULO, 'parar');
    Object.keys(this.intervalos).forEach(key => {
      if (this.intervalos[key]) { clearInterval(this.intervalos[key]); this.intervalos[key] = null; }
    });
    this.tiemposRespuesta = [];
    this.businessMetrics.usuariosActivosSet?.clear?.();

    // SIN await - llamada fire-and-forget
    this._persistirBusinessMetricsMongo().catch(error => {
      dragon.sePreocupa('Error en backup final MongoDB', error, NOMBRE_MODULO, 'parar');
    });

    this.estadoSistema.salud = 'detenido';

    dragon.sonrie('HealthMonitor enterprise detenido Dragon3', NOMBRE_MODULO, 'parar', {
      estadoFinal: this.estadoSistema.salud,
      metricas: { totalSolicitudes: this.totalSolicitudes, totalErrores: this.errores }
    });
  } catch (error) {
    dragon.agoniza('Error parando HealthMonitor', error, NOMBRE_MODULO, 'parar');
  }
}

  obtenerEstado() {
    return {
      estado: this.estadoSistema.salud,
      configuracion: this.configuracion,
      metricas: this.calcularMetricasAvanzadas(),
      sla: this.slaThresholds,
      intervalosActivos: Object.keys(this.intervalos).filter(k => this.intervalos[k] !== null),
      timestamp: new Date().toISOString()
    };
  }

  calcularPercentiles() {
    const tiemposRespuesta = Array.isArray(this.tiemposRespuesta) ? this.tiemposRespuesta : [];
    if (tiemposRespuesta.length === 0) return { p50: 0, p95: 0, p99: 0 };
    const tiempos = tiemposRespuesta.map(m => m.tiempo).sort((a, b) => a - b);
    const p50 = tiempos[Math.floor(tiempos.length * 0.50)] || 0;
    const p95 = tiempos[Math.floor(tiempos.length * 0.95)] || 0;
    const p99 = tiempos[Math.floor(tiempos.length * 0.99)] || 0;
    return { p50, p95, p99 };
  }

  calcularTasaError() {
    return this.totalSolicitudes > 0 ? (this.errores / this.totalSolicitudes) * 100 : 0;
  }

  calcularThroughput() {
    const ahora = Date.now();
    const hace1Minuto = ahora - 60000;
    const tiemposRespuesta = Array.isArray(this.tiemposRespuesta) ? this.tiemposRespuesta : [];
    const requestsUltimoMinuto = tiemposRespuesta.filter(m => m.timestamp > hace1Minuto).length;
    const rps = requestsUltimoMinuto / 60;
    return rps > 0 && Number.isFinite(rps) ? Number(rps.toFixed(2)) : 0;
  }

  calcularMetricasAvanzadas() {
  try {
    const percentiles = this.calcularPercentiles();
    const tasaErrorVal = this.calcularTasaError();
    const throughput = this.calcularThroughput();

    const businessMetrics = this.businessMetrics || {};
const analisisCompletados = this.businessMetrics?.analisisCompletados || 0;  // ✅ DIRECTAMENTE
const analisisExitosos = this.businessMetrics?.analisisExitosos || 0;        // ✅ DIRECTAMENTE

    const totalRequests = typeof this.totalSolicitudes === "number" ? this.totalSolicitudes : 0;
    const totalErrores = typeof this.errores === "number" ? this.errores : 0;
    const successfulRequests = totalRequests - totalErrores;
    const availability = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100;

    const performanceBuckets = this.performanceBuckets || {};
    const clasificacionErrores = this.clasificacionErrores || {};

    const bucketNames = ['excelente', 'bueno', 'aceptable', 'lento', 'critico'];
    const safeBuckets = {};
    bucketNames.forEach(bucket => {
      safeBuckets[bucket] = typeof performanceBuckets[bucket] === "number" ? performanceBuckets[bucket] : 0;
    });
    const totalBuckets = bucketNames.reduce((sum, b) => sum + safeBuckets[b], 0);
    const porcentajesBuckets = {};
    bucketNames.forEach(bucket => {
      porcentajesBuckets[bucket] = totalBuckets > 0 ? Number(((safeBuckets[bucket] / totalBuckets) * 100).toFixed(2)) : 0;
    });

    const circuitBreaker = this.circuitBreaker || {};
    const slaThresholds = this.slaThresholds || {};
    const slaP95 = typeof slaThresholds.p95 === "number" ? slaThresholds.p95 : 200;
    const slaP99 = typeof slaThresholds.p99 === "number" ? slaThresholds.p99 : 500;
    const slaErrorRate = typeof slaThresholds.errorRate === "number" ? slaThresholds.errorRate : 1;
    const slaAvailability = typeof slaThresholds.availability === "number" ? slaThresholds.availability : 99.9;

    // ACTUALIZAR MÉTRICAS PROMETHEUS EN TIEMPO REAL
    this._actualizarMetricasPrometheus(percentiles, tasaErrorVal, throughput, availability, businessMetrics);

    return {
      ...percentiles,
      tasaError: typeof tasaErrorVal === "number" && !isNaN(tasaErrorVal) ? tasaErrorVal : 0,
      throughput: typeof throughput === "number" && !isNaN(throughput) ? throughput : 0,
      availability: typeof availability === "number" && !isNaN(availability) ? availability : 100,
      totalSolicitudes: totalRequests,
      totalErrores: totalErrores,
      usuariosActivos: (businessMetrics.usuariosActivos?.size || businessMetrics.usuariosActivos || 0),
      performanceBuckets: { ...safeBuckets, total: totalBuckets, porcentajes: porcentajesBuckets },
      clasificacionErrores: { ...clasificacionErrores },

      // BUSINESS METRICS ACTUALIZADAS CON NUEVAS MÉTRICAS

businessMetrics: {
  // MÉTRICAS DIRECTAS DESDE this.businessMetrics (CORREGIDO)
  analisisCompletados: this.businessMetrics?.analisisCompletados || 0,
  analisisExitosos: this.businessMetrics?.analisisExitosos || 0,
  analisisFallidos: this.businessMetrics?.analisisFallidos || 0,

  // MÉTRICAS CALCULADAS USANDO DATOS REALES (CORREGIDO)
  tasaExito: Number((this.businessMetrics?.analisisCompletados > 0 ?
    (this.businessMetrics.analisisExitosos / this.businessMetrics.analisisCompletados) * 100 : 0).toFixed(2)),

  tasaFallo: this.businessMetrics?.analisisCompletados > 0 ?
    Number(((this.businessMetrics.analisisFallidos || 0) / this.businessMetrics.analisisCompletados * 100).toFixed(2)) : 0,

  archivosProcessados: this.businessMetrics?.archivosProcessados || 0,
  archivosFallidos: this.businessMetrics?.archivosFallidos || 0,

  porcentajeProcesados: this.businessMetrics?.archivosProcessados > 0 ?
    Number(((this.businessMetrics.analisisCompletados || 0) / this.businessMetrics.archivosProcessados * 100).toFixed(2)) : 0,

  volumenDatosMB: Number((this.businessMetrics?.volumenDatosMB || 0).toFixed(2)),

  usuariosActivos: this.businessMetrics?.usuariosActivosSet?.size || 0,
  usuariosUnicos: this.businessMetrics?.usuariosUnicosSet?.size || 0,

  // NUEVAS MÉTRICAS AÑADIDAS
  analisisNuevos24h: this._calcularAnalisisNuevos24h(),
  analisisRate5m: throughput,
  volumenDatosProcesadosHoy: this._calcularVolumenDatosHoy(),
  tasaCrecimientoUsuarios: this._calcularTasaCrecimientoUsuarios(),

  // MÉTRICAS EXISTENTES (optimizadas y corregidas)
  usuariosActivosHoy: (() => {
    const ahora = Date.now();
    const hace24h = ahora - 24 * 60 * 60 * 1000;
    if (Array.isArray(this.businessMetrics?.historicoAnalisis)) {
      return new Set(
        this.businessMetrics.historicoAnalisis
          .filter(a => a.timestamp > hace24h && a.usuarioId)
          .map(a => a.usuarioId)
      ).size;
    }
    return 0;
  })(),

  volumenDatosProcesadosHoy: (() => {
    const ahora = Date.now();
    const hace24h = ahora - 24 * 60 * 60 * 1000;
    if (Array.isArray(this.businessMetrics?.historicoAnalisis)) {
      return Number(
        this.businessMetrics.historicoAnalisis
          .filter(a => a.timestamp > hace24h)
          .reduce((sum, a) => sum + (a.tamanoArchivo || 0) / (1024 * 1024), 0)
          .toFixed(2)
      );
    }
    return 0;
  })(),

  mediaAnalisisPorUsuario: (this.businessMetrics?.usuariosUnicosSet?.size > 0) ?
    Number(((this.businessMetrics.analisisCompletados || 0) / this.businessMetrics.usuariosUnicosSet.size).toFixed(2)) : 0,

  mediaDatosPorAnalisis: (this.businessMetrics?.analisisCompletados > 0) ?
    Number(((this.businessMetrics.volumenDatosMB || 0) / this.businessMetrics.analisisCompletados).toFixed(2)) : 0
},

      circuitBreaker: { ...circuitBreaker },
      slaCompliance: {
        p95: percentiles.p95 <= slaP95,
        p99: percentiles.p99 <= slaP99,
        errorRate: (typeof tasaErrorVal === "number" && !isNaN(tasaErrorVal) ? tasaErrorVal : 0) <= slaErrorRate,
        availability: (typeof availability === "number" && !isNaN(availability) ? availability : 100) >= slaAvailability
      },

      // NUEVA SECCIÓN: MÉTRICAS FRONTEND
      frontendMetrics: {
        totalEventos: Object.values(this.frontendCounters || {}).reduce((sum, val) => sum + val, 0),
        visitasWeb: this.frontendCounters?.['visita_web'] || 0,
        loginsExitosos: this.frontendCounters?.['login_exitoso'] || 0,
        loginsFallidos: this.frontendCounters?.['login_fallido'] || 0,
        loginsTotales: (this.frontendCounters?.['login_intento'] || 0) + (this.frontendCounters?.['login_exitoso'] || 0),
        androidV1Resultados: this.frontendCounters?.['android_v1_resultado'] || 0,
        tiposEventoUnicos: Object.keys(this.frontendCounters || {}).length
      }
    };

  } catch (error) {
    dragon.agoniza('Error calculando métricas avanzadas', error, NOMBRE_MODULO, 'calcularMetricasAvanzadas');

    // FALLBACK: Métricas básicas en caso de error
    return {
      p50: 0, p95: 0, p99: 0,
      tasaError: 0, throughput: 0, availability: 100,
      totalSolicitudes: 0, totalErrores: 0,
      usuariosActivos: 0,
      performanceBuckets: { excelente: 0, bueno: 0, aceptable: 0, lento: 0, critico: 0, total: 0, porcentajes: {} },
      clasificacionErrores: {},
      businessMetrics: {
        analisisCompletados: 0, analisisExitosos: 0, analisisFallidos: 0,
        tasaExito: 0, tasaFallo: 0, archivosProcessados: 0, archivosFallidos: 0,
        porcentajeProcesados: 0, volumenDatosMB: 0, usuariosActivos: 0,
        usuariosUnicos: 0, usuariosActivosHoy: 0, volumenDatosProcesadosHoy: 0,
        mediaAnalisisPorUsuario: 0, mediaDatosPorAnalisis: 0,
        analisisNuevos24h: 0, analisisRate5m: 0, tasaCrecimientoUsuarios: 0
      },
      circuitBreaker: {},
      slaCompliance: { p95: false, p99: false, errorRate: false, availability: false },
      frontendMetrics: { totalEventos: 0, visitasWeb: 0, loginsExitosos: 0, loginsFallidos: 0, loginsTotales: 0, androidV1Resultados: 0, tiposEventoUnicos: 0 },
      error: error.message
    };
  }
}

_actualizarMetricasPrometheus(percentiles, tasaError, throughput, availability, businessMetrics) {
  try {
    // Mantener las actualizaciones previas (si existen)
    try {
      if (METRICS.analisisRate5m) METRICS.analisisRate5m.set(throughput);
      if (METRICS.uniqueUsersTotal && businessMetrics?.usuariosUnicosSet) {
        METRICS.uniqueUsersTotal.set(businessMetrics.usuariosUnicosSet.size);
      }
    } catch (_) {}

    // Redis: p95
    try {
      if (METRICS.redisLatencyP95) {
        const lat = this._obtenerLatenciaRedisP95 ? this._obtenerLatenciaRedisP95() : 0;
        METRICS.redisLatencyP95.set(Number(lat || 0));
      }
    } catch (e) { this.dragon?.sePreocupa?.('Error set redisLatency', e, NOMBRE_MODULO, '_actualizarMetricasPrometheus'); }

    // Redis: conexiones activas
    try {
      if (METRICS.redisConnectionsActive) {
        const conns = this._obtenerConexionesRedis ? this._obtenerConexionesRedis() : 0;
        METRICS.redisConnectionsActive.set(Number(conns || 0));
      }
    } catch (e) { this.dragon?.sePreocupa?.('Error set redisConnectionsActive', e, NOMBRE_MODULO, '_actualizarMetricasPrometheus'); }

    // WebSocket: messages rate
    try {
      if (METRICS.websocketMessagesRate) {
        const rate = this.estadoSistema?.servidorCentral?.throughput ?? 0;
        METRICS.websocketMessagesRate.set(Number(rate || 0));
      }
    } catch (e) { this.dragon?.sePreocupa?.('Error set websocketMessagesRate', e, NOMBRE_MODULO, '_actualizarMetricasPrometheus'); }

  } catch (error) {
    this.dragon?.sePreocupa?.('Error actualizando métricas Prometheus (redis/websocket)', error, NOMBRE_MODULO, '_actualizarMetricasPrometheus');
  }
}

_calcularTasaCrecimientoUsuarios() {
  try {
    const hace7Dias = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (!Array.isArray(this.businessMetrics.historicoAnalisis)) return 0;

    const usuariosUltimaSemana = new Set(
      this.businessMetrics.historicoAnalisis
        .filter(a => a.timestamp > hace7Dias && a.usuarioId)
        .map(a => a.usuarioId)
    ).size;

    const usuariosTotales = this.businessMetrics.usuariosUnicosSet?.size || 0;

    if (usuariosTotales === 0 || usuariosUltimaSemana === 0) return 0;

    return Number((((usuariosTotales - usuariosUltimaSemana) / usuariosUltimaSemana) * 100).toFixed(2));
  } catch (error) {
    return 0;
  }
}

  registrarTiempoRespuesta(
  tiempoMs,
  ruta = 'unknown',
  metodo = 'GET',
  statusCode = 200,
  usuarioId = null,
  contexto = {}
) {
  try {
    // DEFENSIVAS MEJORADAS
    if (typeof tiempoMs !== 'number' || tiempoMs < 0 || !isFinite(tiempoMs)) tiempoMs = 0;
    if (!Array.isArray(this.tiemposRespuesta)) this.tiemposRespuesta = [];
    if (!this.performanceBuckets) this.performanceBuckets = {};
    if (!this.businessMetrics) this.businessMetrics = {};
    if (!this.businessMetrics.usuariosActivosSet) this.businessMetrics.usuariosActivosSet = new Set();
    if (!this.businessMetrics.usuariosUnicosSet) this.businessMetrics.usuariosUnicosSet = new Set(); // NUEVO
    if (!this.configuracion) this.configuracion = {};
    if (!this.slaThresholds) this.slaThresholds = {};
    if (!this.degradePolicy) {
      this.degradePolicy = {
        minSamples: 30,
        windowMs: 10 * 60 * 1000,
        consecutiveWindowsRequired: 2,
        warmupSeconds: 300
      };
    }
    if (typeof this.totalSolicitudes !== 'number') this.totalSolicitudes = 0;

    const ahora = Date.now();
    const enWarmup = (ahora - this.estadoSistema.uptime) < (this.degradePolicy.warmupSeconds * 1000);
    const muestrasActuales = this.tiemposRespuesta.length;

    // Rutas a excluir de alertas (instrumentar pero sin ruido en warmup / pre-minSamples)
    const rutasSilenciadas = new Set(['/health', '/metrics', '/favicon.ico']);
    const silenciarAlertas = rutasSilenciadas.has(ruta) && (enWarmup || muestrasActuales < this.degradePolicy.minSamples);

    const bucket = this.clasificarPerformance(tiempoMs);
    if (!this.performanceBuckets[bucket]) this.performanceBuckets[bucket] = 0;

    const metrica = {
      tiempo: tiempoMs,
      ruta,
      metodo: String(metodo || 'GET').toUpperCase(),
      statusCode,
      usuarioId,
      timestamp: ahora,
      bucket: silenciarAlertas ? 'warmup' : bucket,
      esError: statusCode >= 400,
      ...contexto
    };

    this.tiemposRespuesta.push(metrica);
    this.totalSolicitudes++;
    this.performanceBuckets[bucket]++;

    // ACTUALIZAR USUARIOS - MEJORADO
    if (usuarioId) {
      this.businessMetrics.usuariosActivosSet.add(usuarioId);
      this.businessMetrics.usuariosUnicosSet.add(usuarioId);

      // ACTUALIZAR MÉTRICA PROMETHEUS EN TIEMPO REAL
      if (METRICS.uniqueUsersTotal) {
        METRICS.uniqueUsersTotal.set(this.businessMetrics.usuariosUnicosSet.size);
      }
    }

    const maxMetricas = typeof this.configuracion.maxMetricasMemoria === 'number'
      ? this.configuracion.maxMetricasMemoria
      : 1000;
    if (this.tiemposRespuesta.length > maxMetricas) {
      this.tiemposRespuesta = this.tiemposRespuesta.slice(-maxMetricas);
    }

    // PROMETHEUS (siempre)
    const safeRoute = typeof ruta === 'string'
      ? ruta.replace(/[^a-zA-Z0-9_/:.-]/g, '_').slice(0, 100)
      : 'unknown';
    const methodLabel = metrica.metodo;
    const statusLabel = String(statusCode || 200);

    METRICS.httpRequestsTotal.inc({ method: methodLabel, route: safeRoute, status: statusLabel });
    METRICS.httpRequestDurationMs.observe({ method: methodLabel, route: safeRoute, status: statusLabel }, tiempoMs);

    // Alertas solo si NO silenciado
    if (!silenciarAlertas) {
      const p99Umbral = typeof this.slaThresholds.p99 === 'number' ? this.slaThresholds.p99 : 500;
      if (tiempoMs > p99Umbral) {
        dragon.seEnfada('Tiempo respuesta crítico Dragon3', NOMBRE_MODULO, 'registrarTiempoRespuesta', {
          tiempo: tiempoMs, ruta, metodo: methodLabel, umbralP99: p99Umbral, bucket, ...contexto
        });
      } else {
        const p95Umbral = typeof this.slaThresholds.p95 === 'number' ? this.slaThresholds.p95 : 200;
        if (tiempoMs > p95Umbral) {
          dragon.seEnfada('Tiempo respuesta alto Dragon3', NOMBRE_MODULO, 'registrarTiempoRespuesta', {
            tiempo: tiempoMs, ruta, metodo: methodLabel, umbralP95: p95Umbral, bucket, ...contexto
          });
        }
      }
    }

    // ACTUALIZAR MÉTRICA DE THROUGHPUT EN TIEMPO REAL
    if (METRICS.analisisRate5m) {
      const throughputActual = this.calcularThroughput();
      METRICS.analisisRate5m.set(throughputActual);
    }

  } catch (error) {
    dragon.agoniza('Error registrando tiempo respuesta', { message: error.message, stack: error.stack }, NOMBRE_MODULO, 'registrarTiempoRespuesta');
  }
}

  clasificarPerformance(tiempoMs) {
    if (typeof tiempoMs !== "number" || isNaN(tiempoMs)) return 'desconocido';
    if (tiempoMs < 100) return 'excelente';
    if (tiempoMs < 200) return 'bueno';
    if (tiempoMs < 500) return 'aceptable';
    if (tiempoMs < 1000) return 'lento';
    return 'critico';
  }

  registrarError(error, ruta = 'unknown', tipo = 'server', contexto = {}) {
  try {
    // DEFENSIVAS MEJORADAS
    if (typeof this.errores !== "number") this.errores = 0;
    if (!this.clasificacionErrores) this.clasificacionErrores = {};
    if (!this.clasificacionErrores[tipo]) this.clasificacionErrores[tipo] = 0;
    if (!this.circuitBreaker) this.circuitBreaker = { fallosConsecutivos: 0, umbralFallos: 5, estado: 'cerrado' };
    if (typeof this.circuitBreaker.fallosConsecutivos !== "number") this.circuitBreaker.fallosConsecutivos = 0;
    if (typeof this.circuitBreaker.umbralFallos !== "number") this.circuitBreaker.umbralFallos = 5;
    if (!this.circuitBreaker.estado) this.circuitBreaker.estado = 'cerrado';
    if (typeof this.totalSolicitudes !== "number") this.totalSolicitudes = 0;
    if (!this.slaThresholds) this.slaThresholds = { errorRate: 1 };

    this.errores++;
    this.clasificacionErrores[tipo]++;
    this.circuitBreaker.fallosConsecutivos++;

    if (this.circuitBreaker.fallosConsecutivos >= this.circuitBreaker.umbralFallos) {
      if (this.circuitBreaker.estado === 'cerrado') {
        this.circuitBreaker.estado = 'abierto';
        dragon.grita('Circuit breaker abierto - Errores consecutivos', NOMBRE_MODULO, 'registrarError', {
          fallosConsecutivos: this.circuitBreaker.fallosConsecutivos,
          umbral: this.circuitBreaker.umbralFallos
        });

        // ACTUALIZAR MÉTRICA PROMETHEUS CIRCUIT BREAKER
        if (METRICS.redisConnectionsActive) {
          METRICS.redisConnectionsActive.set(1); // 1 = abierto
        }
      }
    }

    dragon.agoniza('Error registrado Dragon3', error, NOMBRE_MODULO, 'registrarError', {
      ruta, tipo, totalErrores: this.errores, totalSolicitudes: this.totalSolicitudes,
      tasaError: this.calcularTasaError(), circuitBreaker: this.circuitBreaker.estado, ...contexto
    });

    const tasaError = this.calcularTasaError();
    if (tasaError > this.slaThresholds.errorRate) {
      dragon.grita('ALERTA: Tasa error SLA superada Dragon3', NOMBRE_MODULO, 'registrarError', {
        tasaErrorActual: tasaError.toFixed(2) + '%',
        slaThreshold: this.slaThresholds.errorRate + '%',
        totalErrores: this.errores,
        clasificacion: { ...this.clasificacionErrores }
      });
    }

    // PROMETHEUS ERRORS
    const safeRoute = typeof ruta === 'string' ?
      ruta.replace(/[^a-zA-Z0-9_/:.-]/g, '_').slice(0, 100) : 'unknown';
    METRICS.errorsTotal.inc({ tipo: String(tipo || 'server'), route: safeRoute });

    // INCREMENTAR MÉTRICA DE ANOMALÍAS SI ES APLICABLE
    if (tipo === 'server' || tipo === 'business') {
      if (!METRICS.anomaliasDetectadas) {
        METRICS.anomaliasDetectadas = getOrCreateCounter(
          'dragon_anomalias_detectadas_total',
          'Total anomalies detected'
        );
      }
      METRICS.anomaliasDetectadas.inc(1);
    }

  } catch (registroError) {
    dragon.agoniza('Error registrando error', { message: registroError.message, stack: registroError.stack }, NOMBRE_MODULO, 'registrarError');
  }
}

  registrarExito() {
  // DEFENSIVAS
  if (!this.circuitBreaker) this.circuitBreaker = { fallosConsecutivos: 0, estado: 'cerrado', umbralFallos: 5 };
  if (typeof this.circuitBreaker.fallosConsecutivos !== "number") this.circuitBreaker.fallosConsecutivos = 0;
  if (!this.circuitBreaker.estado) this.circuitBreaker.estado = 'cerrado';

  if (this.circuitBreaker.fallosConsecutivos > 0) {
    this.circuitBreaker.fallosConsecutivos--;

    if (this.circuitBreaker.estado === 'abierto' && this.circuitBreaker.fallosConsecutivos === 0) {
      this.circuitBreaker.estado = 'cerrado';

      // ACTUALIZAR MÉTRICA PROMETHEUS CIRCUIT BREAKER
      if (METRICS.redisConnectionsActive) {
        METRICS.redisConnectionsActive.set(0); // 0 = cerrado
      }

      dragon.sonrie('Circuit breaker cerrado - Sistema recuperado', NOMBRE_MODULO, 'registrarExito');
    }
  }
}

  async _syncAnalisisCompletadosFromRedis() {
  try {
    const key = 'dragon3:analisisCompletados';

    // KISS: Obtener el cliente y asegurar el motor nativo (DB 1)
    const baseClient = this.redisClient || (connectionManager.getRawClientById ? connectionManager.getRawClientById('server-main') : null);
    const client = baseClient ? (baseClient.client || baseClient) : null;

    if (!client) {
      dragon.sePreocupa('Redis client no disponible en _syncAnalisisCompletadosFromRedis', null, NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis');
      return false;
    }

    let val = null;
    try {
      // Intentar GET directo (estándar ioredis) o fallback a .call nativo
      if (typeof client.get === 'function') {
        val = await client.get(key);
      } else if (typeof client.call === 'function') {
        val = await client.call('GET', key);
      }
    } catch (readErr) {
      dragon.sePreocupa('Error leyendo key desde Redis', readErr, NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis_read');
      val = null;
    }

    if (val === null || typeof val === 'undefined') {
      dragon.zen('No hay valor en Redis para analisisCompletados (key ausente)', NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis', { key });
      return false;
    }

    const parsed = parseInt(String(val).trim(), 10);
    if (Number.isNaN(parsed)) {
      dragon.sePreocupa('Valor Redis no es numérico', null, NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis', { key, rawValue: val });
      return false;
    }

    // Inicialización y asignación segura
    if (!this.businessMetrics) {
      this.businessMetrics = {
        analisisCompletados: 0,
        analisisExitosos: 0,
        analisisFallidos: 0,
        archivosProcessados: 0,
        archivosFallidos: 0,
        volumenDatosMB: 0,
        usuariosActivosSet: new Set(),
        usuariosUnicosSet: new Set(),
        historicoAnalisis: []
      };
    }

    const prev = this.businessMetrics.analisisCompletados || 0;
    this.businessMetrics.analisisCompletados = parsed;

    dragon.sonrie('Sincronizado analisisCompletados desde Redis', NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis', {
      key, valor: parsed, previo: prev
    });

    return true;

  } catch (error) {
    dragon.agoniza('Error crítico en _syncAnalisisCompletadosFromRedis', error, NOMBRE_MODULO, '_syncAnalisisCompletadosFromRedis');
    return false;
  }
}

  // ===== Métricas de negocio con Prometheus =====
async registrarMetricaNegocio(tipo, datos = {}) {
  try {
    // DEFENSIVAS MEJORADAS
    if (!this.businessMetrics) this.businessMetrics = {};
    const bm = this.businessMetrics;

    // INICIALIZACIONES ROBUSTAS
    bm.analisisCompletados = typeof bm.analisisCompletados === "number" ? bm.analisisCompletados : 0;
    bm.analisisExitosos = typeof bm.analisisExitosos === "number" ? bm.analisisExitosos : 0;
    bm.analisisFallidos = typeof bm.analisisFallidos === "number" ? bm.analisisFallidos : 0;
    bm.archivosProcessados = typeof bm.archivosProcessados === "number" ? bm.archivosProcessados : 0;
    bm.archivosFallidos = typeof bm.archivosFallidos === "number" ? bm.archivosFallidos : 0;
    bm.volumenDatosMB = typeof bm.volumenDatosMB === "number" ? bm.volumenDatosMB : 0;

    if (!bm.usuariosActivosSet) bm.usuariosActivosSet = new Set();
    if (!bm.usuariosUnicosSet) bm.usuariosUnicosSet = new Set();
    if (!bm.historicoAnalisis) bm.historicoAnalisis = [];

    switch (tipo) {
      case 'analisisCompletados':
        // DEBUG: Verificar datos de entrada
        dragon.zen('DATOS RECIBIDOS en analisisCompletados', NOMBRE_MODULO, 'registrarMetricaNegocio', {
          exito: datos.exito,
          tamanoArchivo: datos.tamanoArchivo,
          usuarioId: datos.usuarioId,
          tieneExito: !!datos.exito,
          tieneTamanoArchivo: typeof datos.tamanoArchivo === 'number'
        });

        // INCREMENTAR TODAS LAS MÉTRICAS PRIMERO
        bm.analisisCompletados++;
        bm.archivosProcessados++;

        // INCREMENTAR ÉXITO/FALLO CON VALOR POR DEFECTO
        if (datos.exito === true) {
          bm.analisisExitosos++;
          dragon.zen('✅ Análisis EXITOSO incrementado', NOMBRE_MODULO, 'registrarMetricaNegocio');
        } else {
          bm.analisisFallidos++;
          dragon.zen('❌ Análisis FALLIDO incrementado', NOMBRE_MODULO, 'registrarMetricaNegocio');
        }

        // USUARIOS
        if (datos.usuarioId) {
          bm.usuariosActivosSet.add(datos.usuarioId);
          bm.usuariosUnicosSet.add(datos.usuarioId);

          // ACTUALIZAR MÉTRICA PROMETHEUS USUARIOS ÚNICOS
          if (METRICS.uniqueUsersTotal) {
            METRICS.uniqueUsersTotal.set(bm.usuariosUnicosSet.size);
          }
        }

        // VOLUMEN DATOS - CON VALOR POR DEFECTO
        const tamanoMB = typeof datos.tamanoArchivo === "number" && datos.tamanoArchivo >= 0
          ? datos.tamanoArchivo / (1024 * 1024)
          : 1.0; // Valor por defecto: 1MB

        bm.volumenDatosMB += tamanoMB;

        // DEBUG: Verificar después de incrementar
        dragon.zen('MÉTRICAS ACTUALIZADAS', NOMBRE_MODULO, 'registrarMetricaNegocio', {
          analisisCompletados: bm.analisisCompletados,
          analisisExitosos: bm.analisisExitosos,
          analisisFallidos: bm.analisisFallidos,
          archivosProcessados: bm.archivosProcessados,
          volumenDatosMB: bm.volumenDatosMB,
          tamanoMBUsado: tamanoMB,
          usuariosUnicos: bm.usuariosUnicosSet.size
        });

        // PROMETHEUS - MÉTRICAS NUEVAS
        METRICS.businessAnalisisTotal.inc(1);
        METRICS.businessArchivosTotal.inc(1);

        // INCREMENTAR MÉTRICA ANÁLISIS NUEVOS 24H
        if (!METRICS.analisisNuevos24h) {
          METRICS.analisisNuevos24h = getOrCreateCounter(
            'dragon_analisis_nuevos_24h',
            'New analysis in last 24 hours'
          );
        }
        METRICS.analisisNuevos24h.inc(1);

        // ACTUALIZAR MÉTRICA DE RATE EN TIEMPO REAL
        if (METRICS.analisisRate5m) {
          const throughputActual = this.calcularThroughput();
          METRICS.analisisRate5m.set(throughputActual);
        }

        // PERSISTIR EN MONGODB (DESPUÉS de actualizar métricas)
        dragon.zen('📊 Persistiendo en MongoDB...', NOMBRE_MODULO, 'registrarMetricaNegocio');
        await incrementarAnalisisCompletadosMongo();

        try {
          await this._persistirBusinessMetricsMongo();
          dragon.zen('✅ Persistencia MongoDB EXITOSA', NOMBRE_MODULO, 'registrarMetricaNegocio');
        } catch (persistError) {
          dragon.sePreocupa('❌ Persistencia MongoDB FALLÓ', persistError, NOMBRE_MODULO, 'registrarMetricaNegocio');
        }

        // REDIS
        if (this.redisClient) {
          try {
            await this.redisClient.incr('dragon3:analisisCompletados');
            dragon.zen('✅ Redis incrementado', NOMBRE_MODULO, 'registrarMetricaNegocio');
          } catch (redisError) {
            dragon.sePreocupa('❌ Redis falló', redisError, NOMBRE_MODULO, 'HealthMonitor');
          }
        }

        // HISTORIAL
        bm.historicoAnalisis.push({
          timestamp: Date.now(),
          usuarioId: datos.usuarioId,
          exito: !!datos.exito,
          tamanoArchivo: datos.tamanoArchivo || 0
        });

        // EVENTO NEGOCIO
        try {
          await EventoNegocio.create({
            tipo,
            usuarioId: datos.usuarioId || null,
            correlationId: datos.correlationId,
            imagenId: datos.imagenId,
            exito: datos.exito,
            tiempoProcesoMs: datos.tiempoProcesoMs,
            fileType: datos.fileType,
            endpoint: datos.endpoint,
            tamanoArchivo: datos.tamanoArchivo,
            etiqueta: datos.etiqueta,
            timestamp: datos.timestamp || new Date()
          });
          dragon.zen('✅ Evento negocio creado', NOMBRE_MODULO, 'registrarMetricaNegocio');
        } catch (eventError) {
          dragon.sePreocupa('❌ Evento negocio falló', eventError, NOMBRE_MODULO, 'METRIC_EVENT_PERSIST_ERROR');
        }
        break;

      case 'archivosProcessados':
        bm.archivosProcessados++;
        METRICS.businessArchivosTotal.inc(1);
        break;

      case 'archivoFallido':
        bm.archivosFallidos++;
        // INCREMENTAR MÉTRICA DE ERRORES SI ES APLICABLE
        if (!METRICS.anomaliasDetectadas) {
          METRICS.anomaliasDetectadas = getOrCreateCounter(
            'dragon_anomalias_detectadas_total',
            'Total anomalies detected'
          );
        }
        METRICS.anomaliasDetectadas.inc(1);
        break;

      case 'volumenDatosMB':
        if (typeof datos.cantidadMB === "number" && datos.cantidadMB >= 0) {
          bm.volumenDatosMB += datos.cantidadMB;
          METRICS.businessVolumenDatosMbTotal.inc(datos.cantidadMB);
        }
        break;

      case 'usuariosActivos':
        if (datos.usuarioId) {
          bm.usuariosActivosSet.add(datos.usuarioId);
          bm.usuariosUnicosSet.add(datos.usuarioId);

          // ACTUALIZAR MÉTRICA PROMETHEUS EN TIEMPO REAL
          if (METRICS.uniqueUsersTotal) {
            METRICS.uniqueUsersTotal.set(bm.usuariosUnicosSet.size);
          }
        }
        break;

      case 'frontendEvent':
        // NUEVO: Manejar eventos frontend desde métricas de negocio
        if (datos.tipoEvento) {
          this.incrementarContadorFrontend(datos.tipoEvento, datos.metadata || {});
        }
        break;

      default:
        // Otros tipos se registran solo en logs/BI
        dragon.zen('Métrica negocio tipo no específico registrada', NOMBRE_MODULO, 'registrarMetricaNegocio', {
          tipo,
          datos,
          metricasDisponibles: Object.keys(bm).filter(k => typeof bm[k] !== 'object' || k === 'usuariosActivosSet' || k === 'usuariosUnicosSet')
        });
        break;
    }

    // ACTUALIZAR MÉTRICAS CALCULADAS
    bm.usuariosActivos = bm.usuariosActivosSet.size;
    bm.usuariosUnicos = bm.usuariosUnicosSet.size;

    const analisisCompletados = bm.analisisCompletados;
    const analisisExitosos = bm.analisisExitosos;
    const analisisFallidos = bm.analisisFallidos;
    const archivosProcessados = bm.archivosProcessados;
    const archivosFallidos = bm.archivosFallidos;
    const volumenDatosMB = bm.volumenDatosMB;
    const usuariosActivos = bm.usuariosActivos;
    const usuariosUnicos = bm.usuariosUnicos;
    const tasaExito = analisisCompletados > 0 ? (analisisExitosos / analisisCompletados) * 100 : 0;
    const tasaFallo = analisisCompletados > 0 ? (analisisFallidos / analisisCompletados) * 100 : 0;
    const porcentajeProcesados = archivosProcessados > 0 ? (analisisCompletados / archivosProcessados) * 100 : 0;

    const ahora = Date.now();
    const hace24h = ahora - 24 * 60 * 60 * 1000;
    const historicoAnalisis = Array.isArray(bm.historicoAnalisis) ? bm.historicoAnalisis : [];
    const usuariosActivosHoySet = new Set(
      historicoAnalisis.filter(a => a.timestamp > hace24h && a.usuarioId).map(a => a.usuarioId)
    );
    const usuariosActivosHoy = usuariosActivosHoySet.size;
    const volumenDatosProcesadosHoy = historicoAnalisis
      .filter(a => a.timestamp > hace24h)
      .reduce((sum, a) => sum + (a.tamanoArchivo || 0) / (1024 * 1024), 0);
    const mediaAnalisisPorUsuario = usuariosUnicos > 0 ? (analisisCompletados / usuariosUnicos) : 0;
    const mediaDatosPorAnalisis = analisisCompletados > 0 ? (volumenDatosMB / analisisCompletados) : 0;

    // NUEVAS MÉTRICAS CALCULADAS
    const analisisNuevos24h = this._calcularAnalisisNuevos24h();
    const tasaCrecimientoUsuarios = this._calcularTasaCrecimientoUsuarios();

    dragon.sonrie('Métrica negocio registrada', NOMBRE_MODULO, 'registrarMetricaNegocio', {
      tipo,
      ...datos,
      businessMetrics: {
        analisisCompletados: analisisCompletados || 0,
        analisisExitosos: analisisExitosos || 0,
        analisisFallidos: analisisFallidos || 0,
        tasaExito: Number(tasaExito.toFixed(2)),
        tasaFallo: Number(tasaFallo.toFixed(2)),
        archivosProcessados: archivosProcessados || 0,
        archivosFallidos: archivosFallidos || 0,
        porcentajeProcesados: Number(porcentajeProcesados.toFixed(2)),
        volumenDatosMB: Number(volumenDatosMB.toFixed(2)),
        usuariosActivos: usuariosActivos || 0,
        usuariosUnicos: usuariosUnicos || 0,
        usuariosActivosHoy: usuariosActivosHoy || 0,
        volumenDatosProcesadosHoy: Number(volumenDatosProcesadosHoy.toFixed(2)),
        mediaAnalisisPorUsuario: Number(mediaAnalisisPorUsuario.toFixed(2)),
        mediaDatosPorAnalisis: Number(mediaDatosPorAnalisis.toFixed(2)),
        // NUEVAS MÉTRICAS
        analisisNuevos24h: analisisNuevos24h,
        tasaCrecimientoUsuarios: Number(tasaCrecimientoUsuarios.toFixed(2))
      }
    });

  } catch (error) {
    const errorMsg = [
      '💀 Error registrando métrica negocio',
      `TYPE: ${typeof error}`,
      `NAME: ${(error && error.name) || 'n/a'}`,
      `MESSAGE: ${(error && error.message) || String(error)}`,
      `TIPO_METRICA: ${tipo}`,
      `DATOS: ${JSON.stringify(datos).slice(0, 200)}`
    ].join(' | ');

    dragon.agoniza(errorMsg, error, NOMBRE_MODULO, 'registrarMetricaNegocio', {
      tipoMetrica: tipo,
      datosSize: datos ? Object.keys(datos).length : 0,
      businessMetricsState: {
        tieneBusinessMetrics: !!this.businessMetrics,
        analisisCompletados: this.businessMetrics?.analisisCompletados,
        usuariosUnicos: this.businessMetrics?.usuariosUnicosSet?.size
      }
    });
  }
}

  getMemoryDegradationState() {
  try {
    // DEFENSIVAS ROBUSTAS
    if (!this.memoryDegradation) {
      this.memoryDegradation = {
        enabled: true,
        warmupSeconds: 300,
        thresholdPercent: 80,
        consecutiveBreaches: 0,
        lastCheck: null
      };
    }

    if (!this.estadoSistema || !this.estadoSistema.uptime) {
      return {
        enabled: false,
        warmupPassed: false,
        consecutiveBreaches: 0,
        thresholdPercent: 80,
        lastCheck: null,
        error: 'estadoSistema no inicializado'
      };
    }

    const warmupPassed = (Date.now() - this.estadoSistema.uptime) / 1000 > this.memoryDegradation.warmupSeconds;

    // OBTENER MÉTRICAS DE MEMORIA ACTUALES PARA CONTEXTO
    const memoria = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const heapMB = Math.round(memoria.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(heapStats.heap_size_limit / 1024 / 1024) || 1;
    const heapUsagePercent = (heapMB / heapTotalMB) * 100;

    return {
      enabled: !!this.memoryDegradation.enabled,
      warmupPassed,
      consecutiveBreaches: this.memoryDegradation.consecutiveBreaches || 0,
      thresholdPercent: this.memoryDegradation.thresholdPercent || 80,
      lastCheck: this.memoryDegradation.lastCheck || null,
      // NUEVO: INFORMACIÓN DE MEMORIA ACTUAL PARA CONTEXTO
      currentMemory: {
        heapUsedMB: heapMB,
        heapTotalMB: heapTotalMB,
        heapUsagePercent: Number(heapUsagePercent.toFixed(2)),
        rssMB: Math.round(memoria.rss / 1024 / 1024),
        isAboveThreshold: heapUsagePercent > (this.memoryDegradation.thresholdPercent || 80)
      },
      // NUEVO: ESTADO DEL SISTEMA
      systemInfo: {
        uptimeSeconds: Math.round((Date.now() - this.estadoSistema.uptime) / 1000),
        warmupSeconds: this.memoryDegradation.warmupSeconds || 300
      }
    };
  } catch (error) {
    dragon.agoniza('Error obteniendo estado degradación memoria', error, NOMBRE_MODULO, 'getMemoryDegradationState');

    // FALLBACK SEGURO
    return {
      enabled: false,
      warmupPassed: false,
      consecutiveBreaches: 0,
      thresholdPercent: 80,
      lastCheck: null,
      error: error.message
    };
  }
}

  async _persistirBusinessMetricsMongo() {
  try {
    // SOLUCIÓN: Usar mongoose.connection en lugar de db
    const db = mongoose.connection;

    // DEBUG 1: Verificar que mongoose está conectado
    if (!db || db.readyState !== 1) {
      dragon.sePreocupa('MongoDB no conectado en _persistirBusinessMetricsMongo', null, NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        readyState: db ? db.readyState : 'no_db_reference',
        businessMetrics: !!this.businessMetrics
      });
      return false;
    }

    // DEBUG 2: Verificar conexión MongoDB
    try {
      await db.db.admin().ping();
      dragon.zen('Conexión MongoDB verificada', NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        dbName: db.db.databaseName,
        readyState: db.readyState
      });
    } catch (pingError) {
      dragon.sePreocupa('MongoDB no responde al ping', pingError, NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        dbName: db.db?.databaseName,
        readyState: db.readyState
      });
      return false;
    }

    const collection = db.collection('health_metrics_snapshots');

    // DEBUG 3: Verificar que la colección es accesible
    let countBefore = 0;
    try {
      countBefore = await collection.countDocuments();
      dragon.zen('Colección health_metrics_snapshots accesible', NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        documentos: countBefore,
        dbName: db.db.databaseName
      });
    } catch (countError) {
      dragon.sePreocupa('Error accediendo a la colección', countError, NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        dbName: db.db.databaseName
      });
      return false;
    }

    // PREPARAR DATOS CON DEFENSIVAS MEJORADAS
    const datosAPersistir = {
      // MÉTRICAS BÁSICAS
      analisisExitosos: this.businessMetrics?.analisisExitosos || 0,
      analisisFallidos: this.businessMetrics?.analisisFallidos || 0,
      archivosProcessados: this.businessMetrics?.archivosProcessados || 0,
      archivosFallidos: this.businessMetrics?.archivosFallidos || 0,
      volumenDatosMB: this.businessMetrics?.volumenDatosMB || 0,

      // USUARIOS CON MANEJO SEGURO DE SETS
      usuariosActivos: Array.from(this.businessMetrics?.usuariosActivosSet || []),
      usuariosUnicos: Array.from(this.businessMetrics?.usuariosUnicosSet || []),

      // NUEVAS MÉTRICAS AÑADIDAS
      analisisCompletados: this.businessMetrics?.analisisCompletados || 0,
      analisisNuevos24h: this._calcularAnalisisNuevos24h(),
      usuariosActivosHoy: this._calcularUsuariosActivosHoy(),
      volumenDatosProcesadosHoy: this._calcularVolumenDatosHoy(),

      // METADATOS
      ultimaActualizacion: new Date(),
      version: '3.3.0-FAANG',
      timestamp: Date.now(),

      // MÉTRICAS DE SISTEMA (CONTEXTO ADICIONAL)
      sistema: {
        uptime: this.estadoSistema?.uptime ? Math.round((Date.now() - this.estadoSistema.uptime) / 1000) : 0,
        salud: this.estadoSistema?.salud || 'desconocido',
        alertasActivas: this.estadoSistema?.alertasActivas?.length || 0
      }
    };

    dragon.zen('Intentando persistir métricas business', NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
      datos: {
        analisisExitosos: datosAPersistir.analisisExitosos,
        analisisFallidos: datosAPersistir.analisisFallidos,
        archivosProcessados: datosAPersistir.archivosProcessados,
        usuariosActivos: datosAPersistir.usuariosActivos.length,
        usuariosUnicos: datosAPersistir.usuariosUnicos.length,
        analisisNuevos24h: datosAPersistir.analisisNuevos24h
      },
      businessMetrics: {
        analisisExitosos: this.businessMetrics?.analisisExitosos,
        analisisFallidos: this.businessMetrics?.analisisFallidos,
        archivosProcessados: this.businessMetrics?.archivosProcessados,
        usuariosActivosSize: this.businessMetrics?.usuariosActivosSet?.size || 0,
        usuariosUnicosSize: this.businessMetrics?.usuariosUnicosSet?.size || 0
      }
    });

    // OPERACIÓN PRINCIPAL CON MANEJO MEJORADO DE ERRORES
    const result = await collection.updateOne(
      { _id: 'current_business_metrics' },
      {
        $set: datosAPersistir,
        $inc: { actualizaciones: 1 }, // NUEVO: Contador de actualizaciones
        $setOnInsert: {
          primeraActualizacion: new Date(),
          entorno: process.env.NODE_ENV || 'development'
        }
      },
      {
        upsert: true,
        maxTimeMS: 10000, // Aumentado a 10 segundos
        writeConcern: { w: 'majority', wtimeout: 5000 }
      }
    );

    // DEBUG 5: Verificar resultado de la operación
    const success = result.acknowledged && (result.modifiedCount > 0 || result.upsertedCount > 0);

    if (success) {
      dragon.zen('Métricas business persistidas en MongoDB', NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        resultado: {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          upsertedCount: result.upsertedCount,
          upsertedId: result.upsertedId
        },
        datosPersistidos: {
          analisisExitosos: datosAPersistir.analisisExitosos,
          analisisFallidos: datosAPersistir.analisisFallidos,
          archivosProcessados: datosAPersistir.archivosProcessados,
          usuariosActivosCount: datosAPersistir.usuariosActivos.length,
          usuariosUnicosCount: datosAPersistir.usuariosUnicos.length,
          analisisNuevos24h: datosAPersistir.analisisNuevos24h
        },
        collection: 'health_metrics_snapshots',
        db: db.db.databaseName
      });
    } else {
      dragon.sePreocupa('Operación MongoDB no acknowledged', null, NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
        resultado: result,
        datosIntentados: datosAPersistir
      });
    }

    return success;

  } catch (error) {
    dragon.sePreocupa('Error persistiendo métricas business en MongoDB', error, NOMBRE_MODULO, '_persistirBusinessMetricsMongo', {
      errorDetails: {
        name: error.name,
        message: error.message,
        code: error.code,
        codeName: error.codeName,
        stack: error.stack?.split('\n').slice(0, 3).join(' | ')
      },
      businessMetricsState: {
        analisisExitosos: this.businessMetrics?.analisisExitosos,
        analisisFallidos: this.businessMetrics?.analisisFallidos,
        tieneUsuariosActivosSet: !!this.businessMetrics?.usuariosActivosSet,
        usuariosActivosSize: this.businessMetrics?.usuariosActivosSet?.size || 0,
        usuariosUnicosSize: this.businessMetrics?.usuariosUnicosSet?.size || 0,
        mongooseState: mongoose.connection ? {
          readyState: mongoose.connection.readyState,
          dbName: mongoose.connection.db?.databaseName
        } : 'mongoose_not_available'
      }
    });
    return false;
  }
}
_calcularUsuariosActivosHoy() {
  try {
    const hace24h = Date.now() - (24 * 60 * 60 * 1000);
    if (!Array.isArray(this.businessMetrics?.historicoAnalisis)) return 0;

    return new Set(
      this.businessMetrics.historicoAnalisis
        .filter(a => a.timestamp > hace24h && a.usuarioId)
        .map(a => a.usuarioId)
    ).size;
  } catch (error) {
    return 0;
  }
}

async _recuperarBusinessMetricsMongo() {
  try {
    // SOLUCIÓN: Usar mongoose.connection en lugar de db
    const db = mongoose.connection;

    // VERIFICACIÓN ROBUSTA DE CONEXIÓN
    if (!db || db.readyState !== 1) {
      dragon.sePreocupa('MongoDB no conectado para recuperar métricas', null, NOMBRE_MODULO, '_recuperarBusinessMetricsMongo', {
        readyState: db ? db.readyState : 'no_db_reference',
        businessMetricsExiste: !!this.businessMetrics
      });
      return false;
    }

    const collection = db.collection('health_metrics_snapshots');

    // RECUPERAR SNAPSHOT CON TIMEOUT
    const snapshot = await collection.findOne(
      { _id: 'current_business_metrics' },
      {
        maxTimeMS: 10000, // 10 segundos timeout
        projection: {
          // INCLUIR TODOS LOS CAMPOS RELEVANTES
          analisisExitosos: 1,
          analisisFallidos: 1,
          archivosProcessados: 1,
          archivosFallidos: 1,
          volumenDatosMB: 1,
          usuariosActivos: 1,
          usuariosUnicos: 1,
          analisisCompletados: 1,
          analisisNuevos24h: 1,
          usuariosActivosHoy: 1,
          volumenDatosProcesadosHoy: 1,
          ultimaActualizacion: 1,
          version: 1,
          timestamp: 1
        }
      }
    );

    if (snapshot) {
      // INICIALIZAR BUSINESSMETRICS CON ESTRUCTURA COMPLETA
      if (!this.businessMetrics) {
        this.businessMetrics = {
          analisisCompletados: 0,
          analisisExitosos: 0,
          analisisFallidos: 0,
          archivosProcessados: 0,
          archivosFallidos: 0,
          volumenDatosMB: 0,
          usuariosActivosSet: new Set(),
          usuariosUnicosSet: new Set(),
          historicoAnalisis: []
        };
      }

      // RESTAURAR MÉTRICAS NUMÉRICAS CON VALORES POR DEFECTO
      this.businessMetrics.analisisCompletados = Number(snapshot.analisisCompletados) || 0;
      this.businessMetrics.analisisExitosos = Number(snapshot.analisisExitosos) || 0;
      this.businessMetrics.analisisFallidos = Number(snapshot.analisisFallidos) || 0;
      this.businessMetrics.archivosProcessados = Number(snapshot.archivosProcessados) || 0;
      this.businessMetrics.archivosFallidos = Number(snapshot.archivosFallidos) || 0;
      this.businessMetrics.volumenDatosMB = Number(snapshot.volumenDatosMB) || 0;

      // RESTAURAR SETS DE USUARIOS CON VALIDACIÓN ROBUSTA
      if (snapshot.usuariosActivos && Array.isArray(snapshot.usuariosActivos)) {
        this.businessMetrics.usuariosActivosSet = new Set(
          snapshot.usuariosActivos.filter(id => id && typeof id === 'string')
        );
      } else {
        this.businessMetrics.usuariosActivosSet = new Set();
      }

      if (snapshot.usuariosUnicos && Array.isArray(snapshot.usuariosUnicos)) {
        this.businessMetrics.usuariosUnicosSet = new Set(
          snapshot.usuariosUnicos.filter(id => id && typeof id === 'string')
        );
      } else {
        this.businessMetrics.usuariosUnicosSet = new Set();
      }

      // ACTUALIZAR MÉTRICAS PROMETHEUS CON LOS VALORES RECUPERADOS
      this._actualizarPrometheusDesdeSnapshot(snapshot);

      // CALCULAR MÉTRICAS DERIVADAS
      const usuariosActivos = this.businessMetrics.usuariosActivosSet.size;
      const usuariosUnicos = this.businessMetrics.usuariosUnicosSet.size;
      // VERSIÓN SIMPLE Y SEGURA:
const analisisCompletados = this.businessMetrics?.analisisCompletados !== undefined ?
                           this.businessMetrics.analisisCompletados :
                           ((this.businessMetrics?.analisisExitosos || 0) + (this.businessMetrics?.analisisFallidos || 0));


      const tasaExito = analisisCompletados > 0 ?
        (this.businessMetrics.analisisExitosos / analisisCompletados) * 100 : 0;

      const tasaFallo = analisisCompletados > 0 ?
        (this.businessMetrics.analisisFallidos / analisisCompletados) * 100 : 0;

      dragon.sonrie('Métricas business recuperadas desde MongoDB', NOMBRE_MODULO, '_recuperarBusinessMetricsMongo', {
        metricasRecuperadas: {
          analisisCompletados: this.businessMetrics.analisisCompletados,
          analisisExitosos: this.businessMetrics.analisisExitosos,
          analisisFallidos: this.businessMetrics.analisisFallidos,
          archivosProcessados: this.businessMetrics.archivosProcessados,
          volumenDatosMB: Number(this.businessMetrics.volumenDatosMB.toFixed(2)),
          usuariosActivos: usuariosActivos,
          usuariosUnicos: usuariosUnicos,
          tasaExito: Number(tasaExito.toFixed(2)),
          tasaFallo: Number(tasaFallo.toFixed(2))
        },
        metadata: {
          ultimaActualizacion: snapshot.ultimaActualizacion,
          version: snapshot.version,
          timestamp: snapshot.timestamp,
          edadSnapshot: snapshot.ultimaActualizacion ?
            Math.round((Date.now() - new Date(snapshot.ultimaActualizacion).getTime()) / (1000 * 60)) + ' minutos' : 'desconocida'
        },
        prometheusActualizado: 'si'
      });

      return true;
    }

    dragon.zen('No se encontraron métricas business previas en MongoDB', NOMBRE_MODULO, '_recuperarBusinessMetricsMongo', {
      collection: 'health_metrics_snapshots',
      db: db.db.databaseName,
      suggestion: 'Se crearán nuevas métricas al primer análisis'
    });

    return false;

  } catch (error) {
    dragon.sePreocupa('Error recuperando métricas business desde MongoDB', error, NOMBRE_MODULO, '_recuperarBusinessMetricsMongo', {
      errorDetails: {
        name: error.name,
        message: error.message,
        code: error.code,
        codeName: error.codeName,
        stack: error.stack?.split('\n').slice(0, 3).join(' | ')
      },
      businessMetricsState: {
        tieneBusinessMetrics: !!this.businessMetrics,
        analisisCompletados: this.businessMetrics?.analisisCompletados,
        usuariosUnicos: this.businessMetrics?.usuariosUnicosSet?.size
      },
      mongooseState: mongoose.connection ? {
        readyState: mongoose.connection.readyState,
        dbName: mongoose.connection.db?.databaseName,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      } : 'mongoose_not_available',
      recoverySuggestion: 'Las métricas se inicializarán desde cero'
    });

    // INICIALIZAR BUSINESSMETRICS EN CASO DE ERROR
    if (!this.businessMetrics) {
      this.businessMetrics = {
        analisisCompletados: 0,
        analisisExitosos: 0,
        analisisFallidos: 0,
        archivosProcessados: 0,
        archivosFallidos: 0,
        volumenDatosMB: 0,
        usuariosActivosSet: new Set(),
        usuariosUnicosSet: new Set(),
        historicoAnalisis: []
      };
    }

    return false;
  }
}
_actualizarPrometheusDesdeSnapshot(snapshot) {
  try {
    // ACTUALIZAR MÉTRICAS DE GAUGE CON VALORES RECUPERADOS
    if (METRICS.uniqueUsersTotal && snapshot.usuariosUnicos) {
      METRICS.uniqueUsersTotal.set(snapshot.usuariosUnicos.length || 0);
    }

    if (METRICS.analisisRate5m) {
      // Calcular rate aproximado basado en datos históricos
      const rate = snapshot.analisisCompletados ?
        Math.min(snapshot.analisisCompletados / (24 * 60 * 60), 10) : 0; // Máximo 10 ops/s
      METRICS.analisisRate5m.set(rate);
    }

    // ACTUALIZAR BUSINESS METRICS COUNTERS (no se pueden setear, pero se preparan)
    dragon.zen('Métricas Prometheus preparadas desde snapshot', NOMBRE_MODULO, '_actualizarPrometheusDesdeSnapshot', {
      uniqueUsers: snapshot.usuariosUnicos?.length || 0,
      analisisRate: 'preparado para incrementos'
    });

  } catch (error) {
    dragon.sePreocupa('Error actualizando Prometheus desde snapshot', error, NOMBRE_MODULO, '_actualizarPrometheusDesdeSnapshot');
  }
}
}

const healthMonitor = new HealthMonitor();
export default healthMonitor;
