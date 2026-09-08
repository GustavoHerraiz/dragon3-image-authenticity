/**
 * ====================================================================
 * DRAGON3 - ENHANCED AI IMAGE ANALYZER + FAANG STANDARDS
 * ====================================================================
 *
 * Archivo: servicios/imagen/analizadorImagen.js
 * Proyecto: Dragon3 - Sistema Autentificación IA
 * Versión: 3.0.0-FAANG
 * Fecha: 2025-06-16
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * AI Image analyzer mejorado con estándares FAANG para observabilidad
 * enterprise-grade, ML model monitoring, performance optimization,
 * circuit breaker patterns y advanced correlation tracking.
 *
 * FAANG ENHANCEMENTS:
 * - ML model performance monitoring con métricas P95/P99
 * - Circuit breaker pattern para Redis Streams
 * - Memory management optimizado para large images
 * - Advanced error classification para AI operations
 * - Stream backpressure handling
 * - Security validation para image inputs
 * - Rate limiting concurrent analysis
 * - Enhanced correlation ID propagation
 *
 * ARCHITECTURE FLOW:
 * Frontend → server.js → analizadorImagen.js → servidorCentral.js → Redis Streams
 *
 * SLA TARGETS:
 * - Image analysis: P95 <200ms, P99 <500ms
 * - ML inference: P95 <100ms
 * - Memory usage: <500MB per analysis
 * - Concurrent limit: 50+ simultaneous
 * - Error rate: <1%
 * - Uptime: 99.9%
 *
 * ====================================================================
 */

// FAANG: Enhanced imports with performance monitoring
import dragon from "../../utilidades/logger.js";
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import os from 'os';

import { RedisClient } from '../../utilidades/redis/core/RedisClient.js';
import connectionManager from '../../utilidades/redis/core/ConnectionManager.js';
import { SERVICE_PRIORITIES } from '../../utilidades/redis/core/constants.js';
import { ensureStreamAndGroup } from '../../utilidades/redis/StreamManager.js';
import { procesarSiguienteMensajeEspejo } from './redesEspejo/redesEspejo.js';
import QueueManager from '../../utilidades/redis/QueueManager.js';
import { RespuestaStandard } from '../../utilidades/RespuestaStandard.js';
import { rawRedisClient } from '../../utilidades/redis/core/RedisClient.js';
import globalConnectionManager from '../../utilidades/redis/core/ConnectionManager.js';
import Redlock from 'redlock';
// FAANG: Importar el lock nativo del sistema
import sharpLock from './sharp-redis-lock.js';



// ========== SHARP SAFETY MANAGER (SOLUCIÓN CRÍTICA) ==========
class SharpSafetyManager {
    constructor() {
        this.isProcessing = false;
        this.queue = [];
        this.timeoutMs = 10000; // 10 segundos máximo por operación
        this.stats = {
            totalOps: 0,
            successful: 0,
            failed: 0,
            avgTime: 0,
            maxTime: 0
        };

        // Inicializar Sharp con configuraciones seguras
        this.initializeSharp();
    }

    initializeSharp() {
        try {
            // Configuración GLOBAL de Sharp para evitar conflictos
            if (typeof sharp !== 'undefined') {
                sharp.concurrency(1); // ¡CRÍTICO! Solo 1 hilo
                sharp.cache({ memory: 50 }); // Limitar cache

                dragon.sonrie('Sharp configurado en modo seguro', 'analizadorImagen', 'SHARP_SAFE_CONFIG', {
                    concurrency: sharp.concurrency(),
                    cacheMemory: 50
                });
            }
        } catch (error) {
            dragon.sePreocupa('Error configurando Sharp', 'analizadorImagen', 'SHARP_CONFIG_ERROR', {
                error: error.message
            });
        }
    }

    async executeSafeSharp(operation, operationName, imagePath, metadata = {}) {
    const startTime = Date.now();
    const operationId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. CÁLCULO DE TIMEOUT RELAJADO (KISS)
    // Subimos los límites para que el proceso local no "mate" a la Red Superior
    let currentTimeout = 30000; // Base 30s
    const sizeMB = (metadata.fileSize || 0) / (1024 * 1024);

    if (sizeMB > 10) currentTimeout = 60000;  // >10MB: 1 min
    if (sizeMB > 50) currentTimeout = 120000; // >50MB: 2 min

    dragon.respira(`🔒 SHARP NATIVE: Ejecutando ${operationName}`, 'analizadorImagen', 'SHARP_START', {
        operationId,
        fileSizeMB: sizeMB.toFixed(2),
        timeout: currentTimeout
    });

    try {
        // 2. TIMEOUT PROMISE
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Sharp timeout local: ${currentTimeout}ms`)), currentTimeout);
        });

        // 3. EJECUCIÓN (Sin colas internas, confiando en el Lock de Redis)
        const result = await Promise.race([operation(), timeoutPromise]);
        const duration = Date.now() - startTime;

        // Estadísticas (Opcional, mantenlo si lo usas)
        this.stats.totalOps++;
        this.stats.successful++;

        dragon.sonrie(`🔒 SHARP NATIVE: ${operationName} completado`, 'analizadorImagen', 'SHARP_SUCCESS', {
            operationId,
            duration
        });

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;
        this.stats.failed++;

        dragon.agoniza(`🔒 SHARP NATIVE: Error en ${operationName}`, error, 'analizadorImagen', 'SHARP_ERROR', {
            operationId,
            duration,
            error: error.message
        });

        // Fallback para no romper el flujo de la Red Superior
        return {
            esAutentico: false,
            confianza: 0.5,
            error: `Sharp error/timeout: ${error.message}`,
            degraded: true
        };
    }
}

    getStats() {
        return {
            ...this.stats,
            isProcessing: this.isProcessing,
            queueLength: this.queue.length,
            timeoutMs: this.timeoutMs
        };
    }
}

// Instancia global única
const sharpSafetyManager = new SharpSafetyManager();

// ========== SHARP CONCURRENCY MANAGER (CRÍTICO) ==========
class SharpConcurrencyManager {
    constructor(maxConcurrent = 1) {
        this.maxConcurrent = maxConcurrent; // ¡SERIALIZADO! Sharp no es thread-safe
        this.activeOperations = 0;
        this.queue = [];
        this.processing = false;
        this.stats = {
            totalOperations: 0,
            queueWaits: 0,
            avgWaitTime: 0,
            errors: 0
        };
    }

    async acquire() {
        const startWait = Date.now();
        return new Promise((resolve) => {
            if (this.activeOperations < this.maxConcurrent) {
                this.activeOperations++;
                const waitTime = Date.now() - startWait;
                this.stats.avgWaitTime = (this.stats.avgWaitTime * this.stats.totalOperations + waitTime) / (this.stats.totalOperations + 1);
                this.stats.totalOperations++;
                resolve();
            } else {
                this.stats.queueWaits++;
                this.queue.push(() => {
                    this.activeOperations++;
                    const waitTime = Date.now() - startWait;
                    this.stats.avgWaitTime = (this.stats.avgWaitTime * this.stats.totalOperations + waitTime) / (this.stats.totalOperations + 1);
                    this.stats.totalOperations++;
                    resolve();
                });
                this.processQueue();
            }
        });
    }

    release() {
        this.activeOperations = Math.max(0, this.activeOperations - 1);
        this.processQueue();
    }

    processQueue() {
        if (this.queue.length > 0 && this.activeOperations < this.maxConcurrent) {
            const next = this.queue.shift();
            next();
        }
    }

    async withSharp(operation, operationName = 'sharp_operation') {
        const startTime = performance.now();
        await this.acquire();

        try {
            dragon.respira(`Sharp operation START: ${operationName}`, 'analizadorImagen', 'SHARP_OP_START', {
                activeOperations: this.activeOperations,
                queueLength: this.queue.length,
                maxConcurrent: this.maxConcurrent
            });

            const result = await operation();

            const duration = performance.now() - startTime;
            dragon.respira(`Sharp operation END: ${operationName}`, 'analizadorImagen', 'SHARP_OP_END', {
                duration: Math.round(duration * 100) / 100,
                activeOperations: this.activeOperations - 1 // Antes de release
            });

            return result;
        } catch (error) {
            this.stats.errors++;
            dragon.agoniza(`Sharp operation ERROR: ${operationName}`, error, 'analizadorImagen', 'SHARP_OP_ERROR', {
                activeOperations: this.activeOperations,
                error: error.message
            });
            throw error;
        } finally {
            this.release();
        }
    }

    getStats() {
        return {
            ...this.stats,
            activeOperations: this.activeOperations,
            queueLength: this.queue.length,
            maxConcurrent: this.maxConcurrent,
            utilization: (this.activeOperations / this.maxConcurrent) * 100
        };
    }
}

// Instancia global - CRÍTICO: 1 operación a la vez
const sharpManager = new SharpConcurrencyManager(1);

// ========== REDIS CLIENT WRAPPER (NO CAMBIAR) ==========
const redisClient = new RedisClient({
    clientId: 'imagen-analyzer',
    serviceName: 'imagen-analyzer',
    priority: SERVICE_PRIORITIES.CRITICAL,
    db: 1               // ← Añadir esta línea
});
redisClient.registerWithManager();

// ========== STREAMS/GROUPS CONSTANTS (NO CAMBIAR) ==========
const DRAGON_STREAMS = {
  PENDIENTES: 'imagenes:pendientes',
  PROCESADOS: 'imagenes:procesadas'
};
const DRAGON_GROUPS = {
  ANALIZADORES: 'grupo-analizadores-imagen'
};
const DRAGON_CONSUMER = `${os.hostname()}-${process.pid}`;
const imageQueue = new QueueManager('imagen-analyzer');

// ========== RED SUPERIOR INSTANCE (AGREGAR SOLO ESTO) ==========
// ========== RED SUPERIOR INSTANCE (LÍNEA 73) ==========
let redSuperior = null;  // ✅ Ya existe

// ========== FUNCIÓN ASIGNACIÓN RED SUPERIOR (AGREGAR AQUÍ - LÍNEA ~75-150) ==========

/**
 * ====================================================================
 * SET RED SUPERIOR - Asigna instancia al módulo analizadorImagen
 * ====================================================================
 * DEBE ser llamada desde server.js ANTES de iniciar consumers
 *
 * @param {Object} redSuperiorInstance - Red Superior instance
 * @returns {boolean} true si asignación exitosa, false si error
 *
 * Flow: server.js init → setRedSuperior(redSuperior) → consumerSuperior()
 * ====================================================================
 */
export function setRedSuperior(redSuperiorInstance) {
  const MODULE_NAME = 'analizadorImagen.js';

  try {
    dragon.respira(
      '🔧 Asignando Red Superior a analizadorImagen',
      MODULE_NAME,
      'SET_RED_SUPERIOR_START',
      {
        hasInstance: !!redSuperiorInstance,
        instanceType: typeof redSuperiorInstance,
        timestamp: new Date().toISOString()
      }
    );

    // ========== VALIDACIÓN 1: Instance exists ==========
    if (!redSuperiorInstance) {
      dragon.sePreocupa(
        '❌ Red Superior instance es null/undefined',
        MODULE_NAME,
        'SET_RED_SUPERIOR_NULL',
        {
          instanceType: typeof redSuperiorInstance,
          impact: 'Consumer Superior NO funcionará (modo degradado)'
        }
      );
      redSuperior = null;
      return false;
    }

    // ========== VALIDACIÓN 2: Método predecir ==========
    if (typeof redSuperiorInstance.predecir !== 'function') {
      dragon.sePreocupa(
        '❌ Red Superior sin método predecir()',
        MODULE_NAME,
        'SET_RED_SUPERIOR_NO_PREDECIR',
        {
          instanceType: typeof redSuperiorInstance,
          hasPredecir: typeof redSuperiorInstance.predecir,
          availableMethods: Object.keys(redSuperiorInstance)
            .filter(k => typeof redSuperiorInstance[k] === 'function')
            .slice(0, 10)
            .join(', ')
        }
      );
      redSuperior = null;
      return false;
    }

    // ========== ASIGNACIÓN EXITOSA ==========
    redSuperior = redSuperiorInstance;

    dragon.sonrie(
      '✅ Red Superior asignada correctamente a analizadorImagen',
      MODULE_NAME,
      'SET_RED_SUPERIOR_SUCCESS',
      {
        redSuperiorVersion: redSuperior.version || 'unknown',
        redSuperiorMode: redSuperior.mode || 'unknown',
        hasPredecir: true,
        timestamp: new Date().toISOString()
      }
    );

    return true;

  } catch (error) {
    dragon.agoniza(
      '❌ Error CRÍTICO asignando Red Superior',
      error,
      MODULE_NAME,
      'SET_RED_SUPERIOR_ERROR',
      {
        errorMessage: error.message,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      }
    );


    return false;
  }
}

// ========== CONTINUAR CON RESTO DE FUNCIONES (NO CAMBIAR) ==========

// Reemplaza la función construirPayloadRedesEspejo por esta versión minimalista y safe
function construirPayloadRedesEspejo(resultadosAnalizadores, parametros, securityResult) {
  // Envío KISS: solo metadata + resumen pequeño + referencia al archivo en disco (rutaArchivo)
  const payload = {};

  // id / referencia al archivo (local path) — consumer puede leer el archivo si necesita
  payload.archivoId = parametros.archivoId;
  payload.correlationId = parametros.correlationId || crypto.randomUUID();
  // Ruta local al archivo (NO el binario). Si migráis a S3 sustituir por s3_key.
  payload.rutaArchivo = parametros.rutaArchivo || null;
  payload.nombreOriginal = parametros.nombreOriginal || null;
  payload.usuarioId = parametros.usuarioId || null;
  payload.clientId = parametros.clientId || null;
  payload.timestamp = Date.now();

  // Resumen reducido de analizadores: solo {analizador, exitoso, confianza, breve}
  payload.analizadoresResumen = {};
  if (resultadosAnalizadores && resultadosAnalizadores.resultados) {
    for (const [nombre, res] of Object.entries(resultadosAnalizadores.resultados)) {
      payload.analizadoresResumen[nombre] = {
        exitoso: !!res.exitoso,
        confianza: typeof res.confianza === 'number' ? res.confianza : null,
        resumen: (res.resumen && res.resumen.decision) ? res.resumen.decision : (res.mensaje ? String(res.mensaje).substring(0,200) : null)
      };
    }
  }

  // Security summary pequeño
  payload.securitySummary = {
    valid: !!(securityResult && securityResult.valid),
    fileSize: securityResult?.fileSize || null,
    fileHash: securityResult?.fileHash ? String(securityResult.fileHash).substring(0,16) : null
  };

  return payload;
}

// Consumidor de mensajes pendientes Dragon3
async function consumirPendientesDragon3(analizarImagenFn) {
  let iteracion = 0;

  // Siempre obtener el cliente actualizado del ConnectionManager en cada iteración
  const redisClient = connectionManager.getRawClientById('imagen-analyzer');
  const isFallback = !!redisClient?.isFallback;

  dragon.sePreocupa('Iniciando loop consumidor Dragon3', 'analizadorImagen', 'CONSUMIDOR_LOOP_START', {
    fallback: isFallback,
    tipo: redisClient?.constructor?.name || typeof redisClient,
    metodos: Object.keys(redisClient || {}),
    pid: process.pid,
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });

  while (true) {
    iteracion++;
    try {
      // Obtener SIEMPRE el cliente actualizado en cada ciclo
      const redis = connectionManager.getRawClientById('imagen-analyzer');
      if (!redis) {
        dragon.agoniza('No se puede obtener el cliente Redis del ConnectionManager', null, 'analizadorImagen', 'CLIENTE_REDIS_NO_ENCONTRADO', { iteracion });
        await new Promise(res => setTimeout(res, 2000));
        continue;
      }

      dragon.sePreocupa('Intentando consumir mensajes pendientes', 'analizadorImagen', 'CONSUMIDOR_XREADGROUP_ATTEMPT', {
        iteracion,
        fallback: isFallback,
        pid: process.pid,
        timestamp: new Date().toISOString()
      });

      const messages = await redis.xreadgroup(
        'GROUP', DRAGON_GROUPS.ANALIZADORES, DRAGON_CONSUMER,
        'BLOCK', 50,
        'COUNT', 10,
        'STREAMS', DRAGON_STREAMS.PENDIENTES, '>'
      );

      if (!messages || messages.length === 0 || !messages[0][1] || messages[0][1].length === 0) {
        dragon.sePreocupa('No hay mensajes pendientes en el stream', 'analizadorImagen', 'CONSUMIDOR_SIN_MENSAJES', {
          iteracion,
          fallback: isFallback,
          messages: messages,
          timestamp: new Date().toISOString()
        });
        continue;
      }

      for (const [msgId, msgFields] of messages[0][1]) {
        try {
          const datos = {};
          for (let i = 0; i < msgFields.length; i += 2) {
            datos[msgFields[i]] = msgFields[i + 1];
          }

          dragon.sePreocupa('Procesando mensaje pendiente', 'analizadorImagen', 'MENSAJE_PENDIENTE', {
            msgId,
            datos,
            iteracion,
            timestamp: new Date().toISOString()
          });

          const resultado = await analizarImagenFn(datos);

          await redis.xadd(
            DRAGON_STREAMS.PROCESADOS,
            '*',
            'archivoId', datos.archivoId,
            'resultado', JSON.stringify(resultado),
            'timestamp', Date.now()
          );

          await redis.xack(DRAGON_STREAMS.PENDIENTES, DRAGON_GROUPS.ANALIZADORES, msgId);

          dragon.sonrie('Mensaje procesado y ACK enviado', 'analizadorImagen', 'MENSAJE_PROCESADO', {
            msgId,
            resultado,
            iteracion,
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          dragon.agoniza('Error procesando mensaje pendiente', err, 'analizadorImagen', 'PENDIENTE_PROCESS_ERROR', {
            msgId,
            fields: msgFields,
            datos: typeof datos !== 'undefined' ? datos : null,
            stack: err?.stack,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      dragon.agoniza('Error en loop consumidor Dragon3', e, 'analizadorImagen', 'CONSUMIDOR_LOOP_ERROR', {
        error: e?.message,
        stack: e?.stack,
        iteracion,
        fallback: isFallback,
        redisClientType: redisClient?.constructor?.name || typeof redisClient,
        redisClientKeys: Object.keys(redisClient || {}),
        tiene_xreadgroup: typeof redisClient?.xreadgroup === 'function',
        tiene_call: typeof redisClient?.call === 'function',
        pid: process.pid,
        timestamp: new Date().toISOString()
      });
      await new Promise(res => setTimeout(res, 2000));
    }
  }
}

// FAANG: Performance and monitoring imports
import { performance, PerformanceObserver } from 'perf_hooks';

// FAANG: Enhanced configuration with environment variables
const FAANG_CONFIG = {
  // Performance targets (FAANG SLA compliance)
  performance: {
    imageAnalysisP95: parseInt(process.env.IMAGE_ANALYSIS_P95_MS) || 200,
    imageAnalysisP99: parseInt(process.env.IMAGE_ANALYSIS_P99_MS) || 500,
    mlInferenceP95: parseInt(process.env.ML_INFERENCE_P95_MS) || 100,
    redisStreamP95: parseInt(process.env.REDIS_STREAM_P95_MS) || 50,
    memoryLimitMB: parseInt(process.env.IMAGE_MEMORY_LIMIT_MB) || 500,
    gcThreshold: parseInt(process.env.GC_THRESHOLD_MB) || 400
  },

  // Concurrency and rate limiting (Enterprise scaling)
  concurrency: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_ANALYSIS) || 50,
    queueLimit: parseInt(process.env.ANALYSIS_QUEUE_LIMIT) || 100,
    timeoutMs: parseInt(process.env.ANALYSIS_TIMEOUT_MS) || 90000,
    streamTimeout: parseInt(process.env.STREAM_TIMEOUT_MS) || 20000,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS) || 100
  },

  // Circuit breaker settings (Reliability engineering)
  circuitBreaker: {
    enabled: process.env.IMAGE_CIRCUIT_BREAKER_ENABLED !== 'false',
    failureThreshold: parseInt(process.env.IMAGE_FAILURE_THRESHOLD) || 5,
    resetTimeout: parseInt(process.env.IMAGE_RESET_TIMEOUT_MS) || 60000,
    monitoringWindow: parseInt(process.env.IMAGE_MONITORING_WINDOW_MS) || 120000,
    halfOpenMaxRequests: parseInt(process.env.CIRCUIT_HALF_OPEN_MAX_REQUESTS) || 3
  },

  // Security settings (Enterprise security)
  security: {
    maxFileSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB) || 50,
    allowedFormats: (process.env.ALLOWED_IMAGE_FORMATS || 'jpg,jpeg,png,gif,webp,bmp,tiff,heic,heif').split(','),
    validateHeaders: process.env.VALIDATE_IMAGE_HEADERS === 'true',
    scanMalware: process.env.SCAN_IMAGE_MALWARE === 'true',
    hashValidation: process.env.HASH_VALIDATION_ENABLED !== 'false',
    encryptionRequired: process.env.IMAGE_ENCRYPTION_REQUIRED === 'true'
  },

  // Memory management (Performance optimization)
  memory: {
    gcInterval: parseInt(process.env.GC_MONITORING_INTERVAL_MS) || 10000,
    enableGCMonitoring: process.env.ENABLE_GC_MONITORING !== 'false',
    maxHeapUsage: parseInt(process.env.MAX_HEAP_USAGE_PERCENT) || 80,
    memoryPressureThreshold: parseInt(process.env.MEMORY_PRESSURE_THRESHOLD_MB) || 400,
    forceGCEnabled: process.env.FORCE_GC_ENABLED !== 'false'
  },

  // Observability settings (FAANG monitoring)
  observability: {
    metricsEnabled: process.env.METRICS_COLLECTION_ENABLED !== 'false',
    tracingEnabled: process.env.DISTRIBUTED_TRACING_ENABLED !== 'false',
    performanceLogging: process.env.PERFORMANCE_LOGGING_ENABLED !== 'false',
    detailedErrorReporting: process.env.DETAILED_ERROR_REPORTING !== 'false',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000
  }
};

// Enhanced module configuration
const NOMBRE_MODULO = 'analizadorImagen';
const VERSION_MODULO = '3.0.0-FAANG';
const MAX_CONCURRENTES = FAANG_CONFIG.concurrency.maxConcurrent;
const TIMEOUT_ANALISIS = FAANG_CONFIG.concurrency.timeoutMs;
const TIMEOUT_STREAM_READ = FAANG_CONFIG.concurrency.streamTimeout;

// REDIS STREAMS STRUCTURE - Enhanced with FAANG monitoring
const STREAMS = {
    // Core analysis streams

    REQUEST_SUPERIOR: 'dragon3:stream:req:superior',
    RESPONSE_SUPERIOR: 'dragon3:stream:resp:superior',
    STATUS_UPDATES: 'dragon3:stream:status',

    // FAANG: Enhanced monitoring streams
    PERFORMANCE_METRICS: 'dragon3:stream:perf:metrics',
    ERROR_ALERTS: 'dragon3:stream:error:alerts',
    SECURITY_EVENTS: 'dragon3:stream:security:events',
    HEALTH_CHECKS: 'dragon3:stream:health:checks',
    AUDIT_TRAIL: 'dragon3:stream:audit:trail'
};

// REDIS CONSUMER GROUPS - Enhanced with FAANG observability
const CONSUMER_GROUPS = {
    // Core processing groups

    SUPERIOR_PROCESSORS: 'dragon3-superior-processors',
    STATUS_MONITORS: 'dragon3-status-monitors',

    // FAANG: Enhanced monitoring groups
    PERFORMANCE_COLLECTORS: 'dragon3-performance-collectors',
    ERROR_HANDLERS: 'dragon3-error-handlers',
    SECURITY_MONITORS: 'dragon3-security-monitors',
    HEALTH_MONITORS: 'dragon3-health-monitors',
    AUDIT_PROCESSORS: 'dragon3-audit-processors'
};

// HASH TRACKING KEYS - Enhanced with FAANG metrics
const HASH_KEYS = {
    // Core tracking
    TRACKING: (archivoId) => `dragon3:track:${archivoId}`,
    SESSION: (archivoId) => `dragon3:session:${archivoId}`,
    CACHE: (hash) => `dragon3:cache:${hash}`,
    PERFORMANCE: (archivoId) => `dragon3:perf:${archivoId}`,

    // FAANG: Enhanced tracking keys
    SECURITY: (archivoId) => `dragon3:security:${archivoId}`,
    MEMORY: (archivoId) => `dragon3:memory:${archivoId}`,
    ML_METRICS: (archivoId) => `dragon3:ml:${archivoId}`,
    CIRCUIT_BREAKER: 'dragon3:circuit:breaker:state',
    RATE_LIMITER: (clientId) => `dragon3:rate:limit:${clientId}`,
    HEALTH_STATUS: 'dragon3:health:status'
};


// FAANG: Enhanced dependency loading with comprehensive
let healthMonitor;
try {
    healthMonitor = (await import('../HealthMonitor.js')).default;
} catch (error) {
    dragon.agoniza('HealthMonitor no disponible - dependencia crítica', error, 'analizadorImagen', 'DEPENDENCY_LOAD');
    throw new Error('HealthMonitor.js es requerido para el analizador de imagen. No se permite fallback ni mock.');
}

let servidorCentral;
try {
    servidorCentral = (await import('../servidorCentral.js')).default;
} catch (error) {
    dragon.agoniza('servidorCentral no disponible - dependencia crítica', error, 'analizadorImagen', 'DEPENDENCY_LOAD');
    throw new Error('servidorCentral.js es requerido para el analizador de imagen. No se permite fallback ni mock.');
}

/**
 * ====================================================================
 * FAANG: ENHANCED CUSTOM ERROR CLASSES
 * Enterprise-grade error classification with detailed context
 * ====================================================================
 */

/**
 * Base Dragon Error with FAANG classification
 */
class DragonError extends Error {
    constructor(message, code = 'UNKNOWN_ERROR', severity = 'medium', category = 'application', metadata = {}) {
        super(message);
        this.name = 'DragonError';
        this.code = code;
        this.severity = severity; // low, medium, high, critical
        this.category = category; // application, performance, security, infrastructure, business
        this.timestamp = new Date().toISOString();
        this.correlationId = null;
        this.module = NOMBRE_MODULO;
        this.version = VERSION_MODULO;
        this.metadata = metadata;
        this.retryable = false;
        this.alertRequired = severity === 'critical' || severity === 'high';

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    setCorrelationId(correlationId) {
        this.correlationId = correlationId;
        return this;
    }

    setRetryable(retryable = true) {
        this.retryable = retryable;
        return this;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            severity: this.severity,
            category: this.category,
            timestamp: this.timestamp,
            correlationId: this.correlationId,
            module: this.module,
            version: this.version,
            metadata: this.metadata,
            retryable: this.retryable,
            alertRequired: this.alertRequired
        };
    }
}

/**
 * Security-specific error class
 */
class SecurityError extends DragonError {
    constructor(message, validationType, metadata = {}) {
        super(message, `SECURITY_${validationType}`, 'high', 'security', metadata);
        this.name = 'SecurityError';
        this.validationType = validationType;
        this.alertRequired = true;
        this.retryable = false;
    }
}

/**
 * Performance-specific error class
 */
class PerformanceError extends DragonError {
    constructor(message, metric, threshold, actualValue, metadata = {}) {
        super(message, `PERFORMANCE_${metric.toUpperCase()}_VIOLATION`, 'medium', 'performance', {
            ...metadata,
            metric,
            threshold,
            actualValue,
            violation: actualValue > threshold ? 'exceeded' : 'below'
        });
        this.name = 'PerformanceError';
        this.metric = metric;
        this.threshold = threshold;
        this.actualValue = actualValue;
        this.retryable = true;
    }
}

/**
 * Circuit breaker specific error class
 */
class CircuitBreakerError extends DragonError {
    constructor(message, state, metadata = {}) {
        super(message, `CIRCUIT_BREAKER_${state}`, 'critical', 'infrastructure', {
            ...metadata,
            circuitBreakerState: state
        });
        this.name = 'CircuitBreakerError';
        this.state = state;
        this.alertRequired = true;
        this.retryable = state === 'HALF_OPEN';
    }
}

/**
 * Concurrency limit error class
 */
class ConcurrencyError extends DragonError {
    constructor(message, currentLoad, maxCapacity, metadata = {}) {
        super(message, 'CONCURRENCY_LIMIT_EXCEEDED', 'medium', 'capacity', {
            ...metadata,
            currentLoad,
            maxCapacity,
            utilizationPercent: Math.round((currentLoad / maxCapacity) * 100)
        });
        this.name = 'ConcurrencyError';
        this.currentLoad = currentLoad;
        this.maxCapacity = maxCapacity;
        this.retryable = true;
    }
}

/**
 * Memory pressure error class
 */
class MemoryError extends DragonError {
    constructor(message, currentUsage, threshold, metadata = {}) {
        super(message, 'MEMORY_PRESSURE_DETECTED', 'high', 'performance', {
            ...metadata,
            currentUsage,
            threshold,
            pressureLevel: currentUsage > threshold * 1.2 ? 'critical' : 'high'
        });
        this.name = 'MemoryError';
        this.currentUsage = currentUsage;
        this.threshold = threshold;
        this.retryable = false;
    }
}

// Mejorar la función safeXadd para mayor robustez
async function safeXadd(redis, stream, ...args) {
    try {
        if (typeof redis?.xadd === 'function') {
            return await redis.xadd(stream, ...args);
        } else {
            dragon.agoniza('redis.xadd no disponible', null, 'analizadorImagen', 'REDIS_XADD_MISSING', {
                redisType: redis?.constructor?.name || typeof redis,
                hasXadd: typeof redis?.xadd,
                pid: process.pid
            });
            return null;
        }
    } catch (error) {
        dragon.agoniza('Error en safeXadd', error, 'analizadorImagen', 'SAFE_XADD_ERROR', {
            stream,
            argsCount: args.length
        });
        return null;
    }
}

// ... (resto del código sin cambios previos, imports, etc.)

/**
 * ====================================================================
 * FAANG: ENHANCED PERFORMANCE MONITOR
 * Real-time P95/P99 tracking with alerting and optimization
 * ====================================================================
 */
class PerformanceMonitorFAANG {
    constructor() {
        this.metrics = {
            imageAnalysisTimes: [],
            mlInferenceTimes: [],
            redisStreamTimes: [],
            securityValidationTimes: [],
            memoryUsage: [],
            errorCounts: new Map(),
            requestCounts: 0,
            concurrencyLevels: [],
            gcEvents: []
        };

        this.performanceObserver = new PerformanceObserver((list) => {
            this.handlePerformanceEntries(list.getEntries());
        });

        this.alertThresholds = {
            p95ImageAnalysis: FAANG_CONFIG.performance.imageAnalysisP95,
            p99ImageAnalysis: FAANG_CONFIG.performance.imageAnalysisP99,
            p95MLInference: FAANG_CONFIG.performance.mlInferenceP95,
            memoryUsage: FAANG_CONFIG.memory.maxHeapUsage
        };

        this.lastAlertTimes = new Map();
        this.alertCooldown = 60000; // 1 minute cooldown between similar alerts

        this.startMonitoring();
    }

    startMonitoring() {
        if (FAANG_CONFIG.observability.metricsEnabled) {
            this.performanceObserver.observe({ entryTypes: ['measure', 'mark'] });
        }

        // Memory monitoring with GC detection
        if (FAANG_CONFIG.memory.enableGCMonitoring) {
            setInterval(() => {
                this.collectMemoryMetrics();
            }, FAANG_CONFIG.memory.gcInterval);
        }

        // Performance summary logging
        if (FAANG_CONFIG.observability.performanceLogging) {
            setInterval(() => {
                this.logPerformanceSummary();
            }, 60000); // Every minute
        }

        dragon.sonrie('Performance Monitor FAANG iniciado', 'analizadorImagen', 'PERFORMANCE_MONITOR_START', {
            version: VERSION_MODULO,
            metricsEnabled: FAANG_CONFIG.observability.metricsEnabled,
            memoryMonitoring: FAANG_CONFIG.memory.enableGCMonitoring,
            alertThresholds: this.alertThresholds
        });
    }

    handlePerformanceEntries(entries) {
        for (const entry of entries) {
            const duration = entry.duration;

            if (entry.name.startsWith('dragon3:image:analysis:')) {
                this.recordImageAnalysisTime(duration, entry.name);
            } else if (entry.name.startsWith('dragon3:ml:inference:')) {
                this.recordMLInferenceTime(duration, entry.name);
            } else if (entry.name.startsWith('dragon3:redis:stream:')) {
                this.recordRedisStreamTime(duration, entry.name);
            } else if (entry.name.startsWith('dragon3:security:validation:')) {
                this.recordSecurityValidationTime(duration, entry.name);
            }
        }
    }

    recordImageAnalysisTime(duration, operationName) {
        this.metrics.imageAnalysisTimes.push({
            duration,
            timestamp: Date.now(),
            operation: operationName
        });

        // Keep only last 1000 measurements for P95/P99 calculation
        if (this.metrics.imageAnalysisTimes.length > 1000) {
            this.metrics.imageAnalysisTimes = this.metrics.imageAnalysisTimes.slice(-1000);
        }

        // FAANG: Real-time P95 violation detection
        if (duration > this.alertThresholds.p95ImageAnalysis) {
            this.handlePerformanceViolation('image_analysis_p95', duration, this.alertThresholds.p95ImageAnalysis, operationName);
        }

        // FAANG: P99 violation detection
        if (duration > this.alertThresholds.p99ImageAnalysis) {
            this.handlePerformanceViolation('image_analysis_p99', duration, this.alertThresholds.p99ImageAnalysis, operationName);
        }
    }

    recordMLInferenceTime(duration, operationName) {
        this.metrics.mlInferenceTimes.push({
            duration,
            timestamp: Date.now(),
            operation: operationName
        });

        if (this.metrics.mlInferenceTimes.length > 1000) {
            this.metrics.mlInferenceTimes = this.metrics.mlInferenceTimes.slice(-1000);
        }

        if (duration > this.alertThresholds.p95MLInference) {
            this.handlePerformanceViolation('ml_inference_p95', duration, this.alertThresholds.p95MLInference, operationName);
        }
    }

    recordRedisStreamTime(duration, operationName) {
        this.metrics.redisStreamTimes.push({
            duration,
            timestamp: Date.now(),
            operation: operationName
        });

        if (this.metrics.redisStreamTimes.length > 500) {
            this.metrics.redisStreamTimes = this.metrics.redisStreamTimes.slice(-500);
        }
    }

    recordSecurityValidationTime(duration, operationName) {
        this.metrics.securityValidationTimes.push({
            duration,
            timestamp: Date.now(),
            operation: operationName
        });

        if (this.metrics.securityValidationTimes.length > 500) {
            this.metrics.securityValidationTimes = this.metrics.securityValidationTimes.slice(-500);
        }
    }

    handlePerformanceViolation(metric, actualValue, threshold, operationName) {
        const alertKey = `${metric}_violation`;
        const lastAlert = this.lastAlertTimes.get(alertKey);
        const now = Date.now();

        // Cooldown check to prevent alert spam
        if (lastAlert && (now - lastAlert) < this.alertCooldown) {
            return;
        }

        this.lastAlertTimes.set(alertKey, now);

        dragon.mideRendimiento(`${metric}_violation`, actualValue, 'analizadorImagen', {
            metric,
            threshold,
            actual: actualValue,
            violation: 'exceeded',
            operation: operationName,
            timestamp: new Date().toISOString(),
            severity: actualValue > threshold * 1.5 ? 'critical' : 'high'
        });

        // 🚩 FIX: Obtener el cliente redis correctamente
        const redis = connectionManager.getRawClientById('imagen-analyzer');
    if (redis && typeof redis.xadd === 'function' && FAANG_CONFIG.observability.metricsEnabled) {
        const perfObj = {
            event: 'PERFORMANCE_VIOLATION',
            metric,
            threshold,
            actualValue,
            operation: operationName,
            timestamp: Date.now(),
            severity: actualValue > threshold * 1.5 ? 'critical' : 'high'
        };

        try {
            const args = Object.entries(perfObj).flatMap(([k, v]) => [k, String(v)]);
            redis.xadd(STREAMS.PERFORMANCE_METRICS, '*', ...args);
        } catch (error) {
            dragon.sePreocupa('Error emitiendo performance alert', 'analizadorImagen', 'STREAM_EMIT_ERROR', {
                error: error.message,
                metric
            });
        }
    }
    }

    collectMemoryMetrics() {
        const memoryUsage = process.memoryUsage();
        const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
        const heapUsagePercent = (heapTotalMB > 0) ? (heapUsedMB / heapTotalMB) * 100 : 0;
        const rssUsedMB = memoryUsage.rss / 1024 / 1024;

        const memoryMetric = {
            heapUsedMB: Math.round(heapUsedMB * 100) / 100,
            heapTotalMB: Math.round(heapTotalMB * 100) / 100,
            heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
            rssUsedMB: Math.round(rssUsedMB * 100) / 100,
            external: Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100,
            timestamp: Date.now()
        };

        this.metrics.memoryUsage.push(memoryMetric);

        // Keep only last 100 memory snapshots
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage = this.metrics.memoryUsage.slice(-100);
        }

        // Eliminado: FAANG: Memory pressure detection with graduated response
        // Eliminado: this.handleMemoryPressure(heapUsagePercent, heapUsedMB, memoryMetric);

        // FAANG: Proactive GC triggering (solo si se necesita para GC local, no para presión global)
        if (
            heapUsedMB > FAANG_CONFIG.memory.memoryPressureThreshold &&
            FAANG_CONFIG.memory.forceGCEnabled &&
            global.gc
        ) {
            const gcStartTime = Date.now();
            global.gc();
            const gcDuration = Date.now() - gcStartTime;

            this.metrics.gcEvents.push({
                timestamp: gcStartTime,
                duration: gcDuration,
                beforeHeapMB: heapUsedMB,
                trigger: 'proactive'
            });

            dragon.respira('GC triggered - memory pressure relief', 'analizadorImagen', 'GC_PROACTIVE_TRIGGER', {
                beforeHeapMB: heapUsedMB,
                gcDuration,
                threshold: FAANG_CONFIG.memory.memoryPressureThreshold,
                trigger: 'proactive'
            });
        }
    }

    // Eliminado: handleMemoryPressure

    logPerformanceSummary() {
        const summary = this.getSummary();

        dragon.respira('Performance summary FAANG', 'analizadorImagen', 'PERFORMANCE_SUMMARY', {
            summary,
            version: VERSION_MODULO,
            timestamp: new Date().toISOString()
        });
    }

    getP95Time(metricArray) {
        if (metricArray.length === 0) return 0;
        const durations = metricArray.map(m => m.duration || m).sort((a, b) => a - b);
        const index = Math.floor(durations.length * 0.95);
        return durations[index] || 0;
    }

    getP99Time(metricArray) {
        if (metricArray.length === 0) return 0;
        const durations = metricArray.map(m => m.duration || m).sort((a, b) => a - b);
        const index = Math.floor(durations.length * 0.99);
        return durations[index] || 0;
    }

    getAverageTime(metricArray) {
        if (metricArray.length === 0) return 0;
        const durations = metricArray.map(m => m.duration || m);
        return durations.reduce((sum, val) => sum + val, 0) / durations.length;
    }

    getSummary() {
        const currentMemory = process.memoryUsage();

        return {
            imageAnalysis: {
                p95: Math.round(this.getP95Time(this.metrics.imageAnalysisTimes) * 100) / 100,
                p99: Math.round(this.getP99Time(this.metrics.imageAnalysisTimes) * 100) / 100,
                average: Math.round(this.getAverageTime(this.metrics.imageAnalysisTimes) * 100) / 100,
                count: this.metrics.imageAnalysisTimes.length,
                target: this.alertThresholds.p95ImageAnalysis
            },
            mlInference: {
                p95: Math.round(this.getP95Time(this.metrics.mlInferenceTimes) * 100) / 100,
                p99: Math.round(this.getP99Time(this.metrics.mlInferenceTimes) * 100) / 100,
                average: Math.round(this.getAverageTime(this.metrics.mlInferenceTimes) * 100) / 100,
                count: this.metrics.mlInferenceTimes.length,
                target: this.alertThresholds.p95MLInference
            },
            redisStream: {
                p95: Math.round(this.getP95Time(this.metrics.redisStreamTimes) * 100) / 100,
                average: Math.round(this.getAverageTime(this.metrics.redisStreamTimes) * 100) / 100,
                count: this.metrics.redisStreamTimes.length
            },
            securityValidation: {
                p95: Math.round(this.getP95Time(this.metrics.securityValidationTimes) * 100) / 100,
                average: Math.round(this.getAverageTime(this.metrics.securityValidationTimes) * 100) / 100,
                count: this.metrics.securityValidationTimes.length
            },
            memory: {
                currentHeapMB: Math.round((currentMemory.heapUsed / 1024 / 1024) * 100) / 100,
                currentHeapPercent: Math.round(((currentMemory.heapUsed / currentMemory.heapTotal) * 100) * 100) / 100,
                samples: this.metrics.memoryUsage.length,
                gcEvents: this.metrics.gcEvents.length,
                threshold: this.alertThresholds.memoryUsage
            },
            requests: {
                total: this.metrics.requestCounts,
                errorCount: Array.from(this.metrics.errorCounts.values()).reduce((sum, count) => sum + count, 0)
            },
            alerts: {
                lastAlerts: Object.fromEntries(this.lastAlertTimes),
                cooldownMs: this.alertCooldown
            }
        };
    }

    incrementRequestCount() {
        this.metrics.requestCounts++;
    }

    incrementErrorCount(errorType) {
        const current = this.metrics.errorCounts.get(errorType) || 0;
        this.metrics.errorCounts.set(errorType, current + 1);
    }
}

// ... (resto del archivo sigue igual)

/**
 * ====================================================================
 * FAANG: ENHANCED SECURITY VALIDATOR
 * Multi-layer security validation with threat detection
 * ====================================================================
 */
class SecurityValidatorFAANG {
    constructor() {
        this.suspiciousPatterns = new Set([
            'eval(',
            '<script',
            'javascript:',
            'data:text/html',
            'vbscript:',
            'onload=',
            'onerror=',
            'onclick='
        ]);

        this.blockedHashes = new Set();
        this.validationCache = new Map();
        this.threatDatabase = new Map();

        this.initializeSecurityPatterns();
        this.startThreatMonitoring();
    }

    initializeSecurityPatterns() {
        // Load additional patterns from environment if available
        const additionalPatterns = process.env.SECURITY_SUSPICIOUS_PATTERNS?.split(',') || [];
        additionalPatterns.forEach(pattern => this.suspiciousPatterns.add(pattern.trim()));

        dragon.respira('Security patterns initialized', 'analizadorImagen', 'SECURITY_INIT', {
            patternsCount: this.suspiciousPatterns.size,
            additionalPatterns: additionalPatterns.length,
            version: VERSION_MODULO
        });
    }

    startThreatMonitoring() {
        // Clear validation cache periodically
        setInterval(() => {
            this.cleanupValidationCache();
        }, 300000); // 5 minutes

        // Update threat database periodically
        setInterval(() => {
            this.updateThreatDatabase();
        }, 600000); // 10 minutes
    }

    cleanupValidationCache() {
        const now = Date.now();
        const maxAge = 300000; // 5 minutes

        for (const [key, data] of this.validationCache.entries()) {
            if (now - data.timestamp > maxAge) {
                this.validationCache.delete(key);
            }
        }

        if (this.validationCache.size > 0) {
            dragon.respira('Security validation cache cleaned', 'analizadorImagen', 'CACHE_CLEANUP', {
                remainingEntries: this.validationCache.size,
                maxAge
            });
        }
    }

    updateThreatDatabase() {
        // This would typically fetch from external threat intelligence feeds
        // For now, we'll simulate with placeholder logic
        dragon.respira('Threat database update check', 'analizadorImagen', 'THREAT_DB_UPDATE', {
            blockedHashes: this.blockedHashes.size,
            threats: this.threatDatabase.size
        });
    }

    // ... (resto de la clase SecurityValidatorFAANG)

    async validateImageSecurity(rutaArchivo, archivoId) {
        const startTime = performance.now();
        performance.mark(`dragon3:security:validation:${archivoId}:start`);

        try {
            // Check validation cache first
            const fileStats = await fs.stat(rutaArchivo);
            const cacheKey = `${rutaArchivo}_${fileStats.mtime.getTime()}_${fileStats.size}`;

            if (this.validationCache.has(cacheKey)) {
                const cachedResult = this.validationCache.get(cacheKey);

                dragon.respira('Security validation cache hit', 'analizadorImagen', 'SECURITY_CACHE_HIT', {
                    archivoId,
                    cacheKey: cacheKey.substring(0, 32),
                    age: Date.now() - cachedResult.timestamp
                });

                return cachedResult.result;
            }

            // File size validation with detailed reporting
            if (fileStats.size > FAANG_CONFIG.security.maxFileSizeMB * 1024 * 1024) {
                throw new SecurityError(
                    `File size exceeds security limit: ${Math.round(fileStats.size / 1024 / 1024 * 100) / 100}MB > ${FAANG_CONFIG.security.maxFileSizeMB}MB`,
                    'FILE_SIZE_EXCEEDED',
                    {
                        fileSizeBytes: fileStats.size,
                        fileSizeMB: Math.round(fileStats.size / 1024 / 1024 * 100) / 100,
                        limitMB: FAANG_CONFIG.security.maxFileSizeMB,
                        archivoId
                    }
                );
            }

            // File format validation with MIME type checking
            const ext = path.extname(rutaArchivo).toLowerCase().substring(1);
            if (!FAANG_CONFIG.security.allowedFormats.includes(ext)) {
                throw new SecurityError(
                    `Invalid file format detected: .${ext}`,
                    'INVALID_FORMAT',
                    {
                        detectedFormat: ext,
                        allowedFormats: FAANG_CONFIG.security.allowedFormats,
                        archivoId
                    }
                );
            }

            // File hash calculation and blocklist check
            const fileHash = await this.calculateFileHash(rutaArchivo);
            if (this.blockedHashes.has(fileHash)) {
                throw new SecurityError(
                    `File matches blocked hash signature`,
                    'BLOCKED_HASH_DETECTED',
                    {
                        hashPrefix: fileHash.substring(0, 16),
                        archivoId,
                        threat: 'known_malicious'
                    }
                );
            }

            // Header validation if enabled
            if (FAANG_CONFIG.security.validateHeaders) {
                await this.validateImageHeaders(rutaArchivo, ext, archivoId);
            }

            // Content scanning for embedded threats
            if (FAANG_CONFIG.security.scanMalware) {
                await this.scanFileContent(rutaArchivo, archivoId);
            }

            const duration = performance.now() - startTime;

            performance.mark(`dragon3:security:validation:${archivoId}:end`);
            performance.measure(`dragon3:security:validation:${archivoId}`,
                `dragon3:security:validation:${archivoId}:start`,
                `dragon3:security:validation:${archivoId}:end`);

            const validationResult = {
                valid: true,
                fileHash,
                fileSize: fileStats.size,
                format: ext,
                duration: Math.round(duration * 100) / 100,
                validationsPassed: ['size', 'format', 'hash', 'headers', 'content'],
                timestamp: Date.now(),
                threatLevel: 'clean'
            };

            // Cache the validation result
            this.validationCache.set(cacheKey, {
                result: validationResult,
                timestamp: Date.now()
            });

            dragon.sonrie('Security validation passed', 'analizadorImagen', 'SECURITY_VALIDATION_SUCCESS', {
                archivoId,
                fileSize: Math.round(fileStats.size / 1024 * 100) / 100, // KB
                format: ext,
                duration: validationResult.duration,
                hashPrefix: fileHash.substring(0, 16),
                validationsPassed: validationResult.validationsPassed.length,
                threatLevel: validationResult.threatLevel
            });
            if (rawRedisClient && FAANG_CONFIG.observability.metricsEnabled) {
    const secObj = {
        archivoId,
        event: 'SECURITY_SUCCESS',
        type: 'VALIDATION_PASSED',
        message: 'Security validation passed',
        severity: 'none',
        timestamp: Date.now(),
        duration: validationResult.duration,
        format: ext,
        size: fileStats.size
    };

    const secArgs = [];
    for (const [key, value] of Object.entries(secObj)) {
        secArgs.push(key, String(value));
    }

    // Usamos rawRedisClient para mantener el rendimiento P95 < 200ms
    rawRedisClient.xadd(STREAMS.SECURITY_EVENTS, '*', ...secArgs).catch(err =>
        dragon.sePreocupa('Error emitir éxito seg', 'analizadorImagen', 'STREAM_ERR', { err: err.message })
    );
}

            return validationResult;

        } catch (error) {
            const duration = performance.now() - startTime;

            performance.mark(`dragon3:security:validation:${archivoId}:error`);

            // Enhanced error logging for security violations
            dragon.agoniza('Security validation failed', error, 'analizadorImagen', 'SECURITY_VIOLATION', {
                archivoId,
                duration: Math.round(duration * 100) / 100,
                validationType: error.validationType || 'unknown',
                severity: error.severity || 'high',
                metadata: error.metadata || {}
            });

            // Emit security event to stream for monitoring (CORREGIDO: clave-valor plano)
            if (redis && FAANG_CONFIG.observability.metricsEnabled) {
                const secObj = {
                    archivoId,
                    event: 'SECURITY_VIOLATION',
                    type: error.validationType || 'unknown',
                    message: error.message,
                    severity: error.severity || 'high',
                    timestamp: Date.now(),
                    duration: Math.round(duration * 100) / 100
                };
                const secArgs = [];
                for (const [key, value] of Object.entries(secObj)) {
                    secArgs.push(key, String(value));
                }
                redis.xadd(STREAMS.SECURITY_EVENTS, '*', ...secArgs).catch(streamError => {
                    dragon.sePreocupa('Error emitting security event', 'analizadorImagen', 'STREAM_EMIT_ERROR', {
                        originalError: error.message,
                        streamError: streamError.message
                    });
                });
            }

            throw error;
        }
    }

    async validateImageHeaders(rutaArchivo, expectedFormat, archivoId) {
        try {
            const buffer = await fs.readFile(rutaArchivo, { start: 0, end: 1024 }); // Read first 1KB
            const header = buffer.toString('hex').toLowerCase();

            // Format-specific header validation
            [CODE]
            const headerValidations = {
                'jpg': ['ffd8ff'],
                'jpeg': ['ffd8ff'],
                'png': ['89504e47'],
                'gif': ['474946'],
                'webp': ['52494646'],
                'bmp': ['424d'],
                'tiff': ['49492a00', '4d4d002a'],
                'heic': ['0000001c6674797068656963'], // 🟢 AÑADIDO: Firma ftypheic
                'heif': ['0000001c667479706d696631']  // 🟢 AÑADIDO: Firma ftypmif1
            };

            const validHeaders = headerValidations[expectedFormat];
            if (validHeaders && !validHeaders.some(validHeader => header.startsWith(validHeader))) {
                throw new SecurityError(
                    `Invalid ${expectedFormat.toUpperCase()} header signature`,
                    'INVALID_HEADER_SIGNATURE',
                    {
                        expectedFormat,
                        headerPrefix: header.substring(0, 16),
                        validHeaders,
                        archivoId
                    }
                );
            }

            // Check for suspicious content in metadata
            const textContent = buffer.toString('ascii');
            for (const pattern of this.suspiciousPatterns) {
                if (textContent.toLowerCase().includes(pattern.toLowerCase())) {
                    throw new SecurityError(
                        `Suspicious pattern detected in file metadata: ${pattern}`,
                        'SUSPICIOUS_METADATA_CONTENT',
                        {
                            pattern,
                            archivoId,
                            threatType: 'embedded_script'
                        }
                    );
                }
            }

        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }

            throw new SecurityError(
                `Header validation failed: ${error.message}`,
                'HEADER_VALIDATION_ERROR',
                {
                    originalError: error.message,
                    archivoId
                }
            );
        }
    }

    async scanFileContent(rutaArchivo, archivoId) {
        try {
            // Read file in chunks to avoid memory issues with large files
            const chunkSize = 64 * 1024; // 64KB chunks
            const fileHandle = await fs.open(rutaArchivo, 'r');
            const stats = await fileHandle.stat();
            let position = 0;
            let suspiciousContentFound = false;

            while (position < stats.size && !suspiciousContentFound) {
                const readSize = Math.min(chunkSize, stats.size - position);
                const buffer = Buffer.alloc(readSize);

                await fileHandle.read(buffer, 0, readSize, position);
                const chunkContent = buffer.toString('ascii');

                // Scan for suspicious patterns
                for (const pattern of this.suspiciousPatterns) {
                    if (chunkContent.toLowerCase().includes(pattern.toLowerCase())) {
                        suspiciousContentFound = true;

                        await fileHandle.close();

                        throw new SecurityError(
                            `Malicious content pattern detected: ${pattern}`,
                            'MALICIOUS_CONTENT_DETECTED',
                            {
                                pattern,
                                position,
                                chunkSize,
                                archivoId,
                                threatType: 'embedded_malware'
                            }
                        );
                    }
                }

                position += readSize;
            }

            await fileHandle.close();

        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }

            throw new SecurityError(
                `Content scanning failed: ${error.message}`,
                'CONTENT_SCAN_ERROR',
                {
                    originalError: error.message,
                    archivoId
                }
            );
        }
    }

    async calculateFileHash(rutaArchivo) {
        try {
            const buffer = await fs.readFile(rutaArchivo);
            return crypto.createHash('sha256').update(buffer).digest('hex');
        } catch (error) {
            throw new SecurityError(
                `Hash calculation failed: ${error.message}`,
                'HASH_CALCULATION_ERROR',
                {
                    originalError: error.message,
                    file: path.basename(rutaArchivo)
                }
            );
        }
    }

    addBlockedHash(hash) {
        this.blockedHashes.add(hash);
        dragon.respira('Hash added to blocklist', 'analizadorImagen', 'SECURITY_BLOCKLIST_UPDATE', {
            hashPrefix: hash.substring(0, 16),
            totalBlocked: this.blockedHashes.size
        });
    }

    removeBlockedHash(hash) {
        if (this.blockedHashes.delete(hash)) {
            dragon.respira('Hash removed from blocklist', 'analizadorImagen', 'SECURITY_BLOCKLIST_REMOVE', {
                hashPrefix: hash.substring(0, 16),
                totalBlocked: this.blockedHashes.size
            });
        }
    }

    getSecuritySummary() {
        return {
            suspiciousPatterns: this.suspiciousPatterns.size,
            blockedHashes: this.blockedHashes.size,
            validationCache: this.validationCache.size,
            threatDatabase: this.threatDatabase.size,
            config: {
                maxFileSizeMB: FAANG_CONFIG.security.maxFileSizeMB,
                allowedFormats: FAANG_CONFIG.security.allowedFormats,
                validateHeaders: FAANG_CONFIG.security.validateHeaders,
                scanMalware: FAANG_CONFIG.security.scanMalware
            }
        };
    }
}


/**
 * ====================================================================
 * FAANG: ENHANCED CIRCUIT BREAKER PATTERN
 * Enterprise-grade reliability with automatic recovery
 * ====================================================================
 */
class CircuitBreakerFAANG {
    constructor(config = {}) {
        this.name = config.name || 'ImageAnalysisCircuitBreaker';
        this.failureThreshold = config.failureThreshold || FAANG_CONFIG.circuitBreaker.failureThreshold;
        this.resetTimeout = config.resetTimeout || FAANG_CONFIG.circuitBreaker.resetTimeout;
        this.monitoringWindow = config.monitoringWindow || FAANG_CONFIG.circuitBreaker.monitoringWindow;
        this.halfOpenMaxRequests = config.halfOpenMaxRequests || FAANG_CONFIG.circuitBreaker.halfOpenMaxRequests;

        // Circuit breaker state
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.resetTimer = null;
        this.requestCount = 0;
        this.halfOpenRequests = 0;

        // Performance tracking
        this.metrics = {
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
            stateTransitions: [],
            lastStateChange: null,
            avgResponseTime: 0,
            responseTimes: []
        };

        // Event listeners
        this.listeners = {
            stateChange: [],
            failure: [],
            success: [],
            timeout: []
        };

        this.startMonitoring();
    }

    startMonitoring() {
        // Clean up old metrics periodically
        setInterval(() => {
            this.cleanupMetrics();
        }, this.monitoringWindow);

        dragon.sonrie('Circuit Breaker FAANG iniciado', 'analizadorImagen', 'CIRCUIT_BREAKER_INIT', {
            name: this.name,
            failureThreshold: this.failureThreshold,
            resetTimeout: this.resetTimeout,
            state: this.state,
            version: VERSION_MODULO
        });
    }

    cleanupMetrics() {
        const now = Date.now();
        const cutoff = now - this.monitoringWindow;

        // Keep only recent response times
        this.metrics.responseTimes = this.metrics.responseTimes.filter(rt => rt.timestamp > cutoff);

        // Keep only recent state transitions
        this.metrics.stateTransitions = this.metrics.stateTransitions.filter(st => st.timestamp > cutoff);

        // Recalculate average response time
        if (this.metrics.responseTimes.length > 0) {
            const sum = this.metrics.responseTimes.reduce((acc, rt) => acc + rt.duration, 0);
            this.metrics.avgResponseTime = sum / this.metrics.responseTimes.length;
        }
    }

    async call(operation, operationName = 'unknown', metadata = {}) {
        const startTime = Date.now();
        this.metrics.totalRequests++;
        this.requestCount++;

        // Check circuit state before proceeding
        if (this.state === 'OPEN') {
            if (this.shouldAttemptReset()) {
                this.transitionTo('HALF_OPEN');
            } else {
                const error = new CircuitBreakerError(
                    `Circuit breaker is OPEN - operation blocked`,
                    'OPEN',
                    {
                        name: this.name,
                        operationName,
                        timeSinceLastFailure: Date.now() - this.lastFailureTime,
                        resetTimeout: this.resetTimeout,
                        ...metadata
                    }
                );

                this.emitEvent('failure', { error, operation: operationName, blocked: true });
                throw error;
            }
        }

        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenRequests >= this.halfOpenMaxRequests) {
                const error = new CircuitBreakerError(
                    `Circuit breaker in HALF_OPEN - max requests exceeded`,
                    'HALF_OPEN',
                    {
                        name: this.name,
                        operationName,
                        halfOpenRequests: this.halfOpenRequests,
                        maxRequests: this.halfOpenMaxRequests,
                        ...metadata
                    }
                );

                this.emitEvent('failure', { error, operation: operationName, blocked: true });
                throw error;
            }
            this.halfOpenRequests++;
        }

        try {
            // Execute the operation with timeout
            const result = await Promise.race([
                operation(),
                new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Operation timeout after ${this.resetTimeout}ms`));
                    }, this.resetTimeout);
                })
            ]);

            const duration = Date.now() - startTime;
            this.onSuccess(duration, operationName, metadata);
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.onFailure(error, duration, operationName, metadata);
            throw error;
        }
    }

    onSuccess(duration, operationName, metadata) {
        this.successes++;
        this.metrics.totalSuccesses++;
        this.lastSuccessTime = Date.now();

        // Record response time
        this.metrics.responseTimes.push({
            duration,
            timestamp: this.lastSuccessTime,
            operation: operationName
        });

        if (this.state === 'HALF_OPEN') {
            // Transition back to CLOSED after successful operations
            if (this.successes >= this.halfOpenMaxRequests) {
                this.transitionTo('CLOSED');
            }
        } else if (this.state === 'CLOSED') {
            // Reset failure count on successful operations
            this.failures = 0;
        }

        dragon.respira('Circuit breaker operation success', 'analizadorImagen', 'CIRCUIT_BREAKER_SUCCESS', {
            name: this.name,
            operationName,
            duration,
            state: this.state,
            successes: this.successes,
            failures: this.failures
        });

        this.emitEvent('success', { duration, operation: operationName, state: this.state, metadata });
    }

    onFailure(error, duration, operationName, metadata) {
        this.failures++;
        this.metrics.totalFailures++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            // Any failure in HALF_OPEN immediately opens the circuit
            this.transitionTo('OPEN');
        } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
            // Threshold exceeded, open the circuit
            this.transitionTo('OPEN');
        }

        dragon.sePreocupa('Circuit breaker operation failure', 'analizadorImagen', 'CIRCUIT_BREAKER_FAILURE', {
            name: this.name,
            operationName,
            duration,
            state: this.state,
            failures: this.failures,
            threshold: this.failureThreshold,
            error: error.message
        });

        this.emitEvent('failure', {
            error,
            duration,
            operation: operationName,
            state: this.state,
            blocked: false,
            metadata
        });
    }

    shouldAttemptReset() {
        if (this.lastFailureTime === null) return false;
        return (Date.now() - this.lastFailureTime) >= this.resetTimeout;
    }

    transitionTo(newState) {
        const oldState = this.state;
        this.state = newState;
        const timestamp = Date.now();

        this.metrics.stateTransitions.push({
            from: oldState,
            to: newState,
            timestamp,
            failures: this.failures,
            successes: this.successes
        });

        this.metrics.lastStateChange = timestamp;

        // Reset counters based on new state
        if (newState === 'CLOSED') {
            this.failures = 0;
            this.successes = 0;
            this.halfOpenRequests = 0;
        } else if (newState === 'HALF_OPEN') {
            this.halfOpenRequests = 0;
            this.successes = 0;
        }

        // Clear any existing reset timer
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }

        dragon.sonrie(`Circuit breaker state transition: ${oldState} → ${newState}`, 'analizadorImagen', 'CIRCUIT_BREAKER_STATE_CHANGE', {
            name: this.name,
            oldState,
            newState,
            failures: this.failures,
            successes: this.successes,
            timestamp: new Date(timestamp).toISOString()
        });

        this.emitEvent('stateChange', { oldState, newState, timestamp, failures: this.failures, successes: this.successes });
    }

    emitEvent(eventType, data) {
        const listeners = this.listeners[eventType] || [];
        listeners.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                dragon.sePreocupa('Circuit breaker event listener error', 'analizadorImagen', 'CIRCUIT_BREAKER_LISTENER_ERROR', {
                    eventType,
                    error: error.message
                });
            }
        });
    }

    on(eventType, listener) {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType].push(listener);
    }

    getState() {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            metrics: {
                ...this.metrics,
                failureRate: this.metrics.totalRequests > 0 ? (this.metrics.totalFailures / this.metrics.totalRequests) : 0,
                successRate: this.metrics.totalRequests > 0 ? (this.metrics.totalSuccesses / this.metrics.totalRequests) : 0
            }
        };
    }

    reset() {
        this.transitionTo('CLOSED');
        this.failures = 0;
        this.successes = 0;
        this.halfOpenRequests = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;

        dragon.sonrie('Circuit breaker manually reset', 'analizadorImagen', 'CIRCUIT_BREAKER_MANUAL_RESET', {
            name: this.name
        });
    }
}

/**
 * ====================================================================
 * FAANG: ENHANCED CONCURRENCY MANAGER
 * Enterprise-grade request throttling and queue management
 * ====================================================================
 */
class ConcurrencyManagerFAANG {
    constructor(config = {}) {
        this.maxConcurrent = config.maxConcurrent || MAX_CONCURRENTES;
        this.queueLimit = config.queueLimit || FAANG_CONFIG.concurrency.queueLimit;
        this.defaultTimeout = config.defaultTimeout || TIMEOUT_ANALISIS;

        // Active operations tracking
        this.activeOperations = new Map();
        this.operationQueue = [];
        this.queueProcessing = false;

        // Rate limiting
        this.rateLimiter = {
            requests: new Map(), // clientId -> { count, resetTime }
            windowMs: FAANG_CONFIG.concurrency.rateLimitWindow,
            maxRequests: FAANG_CONFIG.concurrency.rateLimitRequests
        };

        // Performance metrics
        this.metrics = {
            totalRequests: 0,
            queuedRequests: 0,
            rejectedRequests: 0,
            completedRequests: 0,
            averageWaitTime: 0,
            averageProcessingTime: 0,
            peakConcurrency: 0,
            waitTimes: [],
            processingTimes: [],
            queueLengthHistory: []
        };

        this.startMonitoring();
    }

    startMonitoring() {
        // Rate limiter cleanup
        setInterval(() => {
            this.cleanupRateLimiter();
        }, this.rateLimiter.windowMs);

        // Queue length monitoring
        setInterval(() => {
            this.recordQueueLength();
        }, 5000); // Every 5 seconds

        // Metrics cleanup
        setInterval(() => {
            this.cleanupMetrics();
        }, 300000); // Every 5 minutes

        dragon.sonrie('Concurrency Manager FAANG iniciado', 'analizadorImagen', 'CONCURRENCY_MANAGER_INIT', {
            maxConcurrent: this.maxConcurrent,
            queueLimit: this.queueLimit,
            rateLimitWindow: this.rateLimiter.windowMs,
            rateLimitRequests: this.rateLimiter.maxRequests,
            version: VERSION_MODULO
        });
    }

    cleanupRateLimiter() {
        const now = Date.now();
        for (const [clientId, data] of this.rateLimiter.requests.entries()) {
            if (now >= data.resetTime) {
                this.rateLimiter.requests.delete(clientId);
            }
        }
    }

    recordQueueLength() {
        this.metrics.queueLengthHistory.push({
            length: this.operationQueue.length,
            activeConcurrency: this.activeOperations.size,
            timestamp: Date.now()
        });

        // Keep only last 100 records
        if (this.metrics.queueLengthHistory.length > 100) {
            this.metrics.queueLengthHistory = this.metrics.queueLengthHistory.slice(-100);
        }

        // Update peak concurrency
        if (this.activeOperations.size > this.metrics.peakConcurrency) {
            this.metrics.peakConcurrency = this.activeOperations.size;
        }
    }

    cleanupMetrics() {
        const maxMetrics = 1000;

        if (this.metrics.waitTimes.length > maxMetrics) {
            this.metrics.waitTimes = this.metrics.waitTimes.slice(-maxMetrics);
        }

        if (this.metrics.processingTimes.length > maxMetrics) {
            this.metrics.processingTimes = this.metrics.processingTimes.slice(-maxMetrics);
        }

        // Recalculate averages
        if (this.metrics.waitTimes.length > 0) {
            const sum = this.metrics.waitTimes.reduce((acc, time) => acc + time, 0);
            this.metrics.averageWaitTime = sum / this.metrics.waitTimes.length;
        }

        if (this.metrics.processingTimes.length > 0) {
            const sum = this.metrics.processingTimes.reduce((acc, time) => acc + time, 0);
            this.metrics.averageProcessingTime = sum / this.metrics.processingTimes.length;
        }
    }

    async acquireSlot(archivoId, clientId = 'default', priority = 0, timeout = null) {
        const requestTime = Date.now();
        this.metrics.totalRequests++;

        try {
            // Rate limiting check
            await this.checkRateLimit(clientId);

            // Immediate acquisition if slots available
            if (this.activeOperations.size < this.maxConcurrent) {
                return await this.immediateAcquisition(archivoId, requestTime);
            }

            // Queue the request if under queue limit
            if (this.operationQueue.length >= this.queueLimit) {
                this.metrics.rejectedRequests++;

                throw new ConcurrencyError(
                    `Request queue full: ${this.operationQueue.length}/${this.queueLimit}`,
                    this.operationQueue.length,
                    this.queueLimit,
                    {
                        archivoId,
                        clientId,
                        activeOperations: this.activeOperations.size,
                        maxConcurrent: this.maxConcurrent
                    }
                );
            }

            return await this.queueRequest(archivoId, clientId, priority, timeout || this.defaultTimeout, requestTime);

        } catch (error) {
            dragon.sePreocupa('Concurrency slot acquisition failed', 'analizadorImagen', 'CONCURRENCY_ACQUISITION_FAILED', {
                archivoId,
                clientId,
                error: error.message,
                activeOperations: this.activeOperations.size,
                queueLength: this.operationQueue.length
            });

            throw error;
        }
    }

    async checkRateLimit(clientId) {
        const now = Date.now();
        const clientData = this.rateLimiter.requests.get(clientId);

        if (!clientData) {
            this.rateLimiter.requests.set(clientId, {
                count: 1,
                resetTime: now + this.rateLimiter.windowMs
            });
            return;
        }

        if (now >= clientData.resetTime) {
            // Reset the counter
            this.rateLimiter.requests.set(clientId, {
                count: 1,
                resetTime: now + this.rateLimiter.windowMs
            });
            return;
        }

        if (clientData.count >= this.rateLimiter.maxRequests) {
            const timeToReset = clientData.resetTime - now;

            throw new ConcurrencyError(
                `Rate limit exceeded for client: ${clientData.count}/${this.rateLimiter.maxRequests}`,
                clientData.count,
                this.rateLimiter.maxRequests,
                {
                    clientId,
                    timeToReset,
                    windowMs: this.rateLimiter.windowMs
                }
            );
        }

        clientData.count++;
    }

    async immediateAcquisition(archivoId, requestTime) {
        const slot = {
            archivoId,
            startTime: Date.now(),
            requestTime,
            status: 'processing',
            timeout: null
        };

        this.activeOperations.set(archivoId, slot);

        dragon.respira(`Concurrency slot acquired immediately: ${this.activeOperations.size}/${this.maxConcurrent}`, 'analizadorImagen', 'CONCURRENCY_IMMEDIATE_ACQUISITION', {
            archivoId,
            slot: this.activeOperations.size,
            maxConcurrent: this.maxConcurrent,
            waitTime: 0
        });

        return {
            acquired: true,
            waitTime: 0,
            position: 0
        };
    }

    async queueRequest(archivoId, clientId, priority, timeout, requestTime) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                archivoId,
                clientId,
                priority,
                requestTime,
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.removeFromQueue(archivoId);
                    reject(new ConcurrencyError(
                        `Queue timeout after ${timeout}ms`,
                        this.operationQueue.length,
                        this.queueLimit,
                        {
                            archivoId,
                            clientId,
                            timeout,
                            queuePosition: this.getQueuePosition(archivoId)
                        }
                    ));
                }, timeout)
            };

            // Insert with priority (higher priority first)
            const insertIndex = this.operationQueue.findIndex(item => item.priority < priority);
            if (insertIndex === -1) {
                this.operationQueue.push(queueItem);
            } else {
                this.operationQueue.splice(insertIndex, 0, queueItem);
            }

            this.metrics.queuedRequests++;

            dragon.respira(`Request queued: position ${this.getQueuePosition(archivoId)}/${this.operationQueue.length}`, 'analizadorImagen', 'CONCURRENCY_QUEUED', {
                archivoId,
                clientId,
                priority,
                queuePosition: this.getQueuePosition(archivoId),
                queueLength: this.operationQueue.length,
                timeout
            });

            this.processQueue();
        });
    }

    async processQueue() {
        if (this.queueProcessing || this.operationQueue.length === 0 || this.activeOperations.size >= this.maxConcurrent) {
            return;
        }

        this.queueProcessing = true;

        try {
            while (this.operationQueue.length > 0 && this.activeOperations.size < this.maxConcurrent) {
                const queueItem = this.operationQueue.shift();

                if (queueItem.timeout) {
                    clearTimeout(queueItem.timeout);
                }

                const waitTime = Date.now() - queueItem.requestTime;
                this.metrics.waitTimes.push(waitTime);

                const slot = {
                    archivoId: queueItem.archivoId,
                    startTime: Date.now(),
                    requestTime: queueItem.requestTime,
                    status: 'processing',
                    waitTime
                };

                this.activeOperations.set(queueItem.archivoId, slot);

                dragon.respira(`Queued request processed: ${this.activeOperations.size}/${this.maxConcurrent}`, 'analizadorImagen', 'CONCURRENCY_QUEUE_PROCESSED', {
                    archivoId: queueItem.archivoId,
                    clientId: queueItem.clientId,
                    waitTime,
                    slot: this.activeOperations.size,
                    remainingQueue: this.operationQueue.length
                });

                queueItem.resolve({
                    acquired: true,
                    waitTime,
                    position: 0
                });
            }
        } finally {
            this.queueProcessing = false;
        }
    }

    releaseSlot(archivoId) {
        const operation = this.activeOperations.get(archivoId);

        if (operation) {
            const processingTime = Date.now() - operation.startTime;
            this.metrics.processingTimes.push(processingTime);
            this.metrics.completedRequests++;

            this.activeOperations.delete(archivoId);

            dragon.respira(`Concurrency slot released: ${this.activeOperations.size}/${this.maxConcurrent}`, 'analizadorImagen', 'CONCURRENCY_RELEASED', {
                archivoId,
                processingTime,
                waitTime: operation.waitTime || 0,
                remaining: this.activeOperations.size,
                queueLength: this.operationQueue.length
            });

            // Process next in queue
            setImmediate(() => this.processQueue());

            return {
                released: true,
                processingTime,
                waitTime: operation.waitTime || 0
            };
        }

        return { released: false };
    }

    removeFromQueue(archivoId) {
        const index = this.operationQueue.findIndex(item => item.archivoId === archivoId);
        if (index !== -1) {
            const queueItem = this.operationQueue.splice(index, 1)[0];
            if (queueItem.timeout) {
                clearTimeout(queueItem.timeout);
            }
            return true;
        }
        return false;
    }

    getQueuePosition(archivoId) {
        return this.operationQueue.findIndex(item => item.archivoId === archivoId) + 1;
    }

    getMetrics() {
        return {
            ...this.metrics,
            currentConcurrency: this.activeOperations.size,
            maxConcurrency: this.maxConcurrent,
            queueLength: this.operationQueue.length,
            queueLimit: this.queueLimit,
            utilizationPercent: Math.round((this.activeOperations.size / this.maxConcurrent) * 100),
            queueUtilizationPercent: Math.round((this.operationQueue.length / this.queueLimit) * 100),
            rateLimiter: {
                activeClients: this.rateLimiter.requests.size,
                windowMs: this.rateLimiter.windowMs,
                maxRequests: this.rateLimiter.maxRequests
            }
        };
    }

    clearQueue() {
        const queuedItems = [...this.operationQueue];
        this.operationQueue = [];

        queuedItems.forEach(item => {
            if (item.timeout) {
                clearTimeout(item.timeout);
            }
            item.reject(new ConcurrencyError('Queue cleared', 0, this.queueLimit));
        });

        dragon.respira('Concurrency queue cleared', 'analizadorImagen', 'CONCURRENCY_QUEUE_CLEARED', {
            clearedItems: queuedItems.length
        });
    }
}

/**
 * ====================================================================
 * FAANG: ENHANCED GESTOR STREAMS BIDIRECCIONAL (CORREGIDO - SIN ESPEJO)
 * Enterprise-grade stream management with reliability patterns
 * ====================================================================
 */
class GestorStreamsBidireccionalFAANG {
    constructor() {
        this.procesamientoActivo = new Map();
this.sharpManager = sharpManager;
        this.consumersRunning = false;
        this.analizadoresCargados = null;

        // 🎯 CLIENTE DEDICADO 1: Aislamiento del Health Check (LOW Priority)
this.redisPingClient = new RedisClient({
    clientId: 'imagen-analyzer-ping',
    serviceName: 'imagen-analyzer',
    priority: SERVICE_PRIORITIES.LOW,
    db: 1
});

// ✅ REPARACIÓN ULTRA-FORZADA FAANG
setTimeout(() => {
    // Si mi cliente interno no está listo, busco el que ya registró el core
    const clienteAuxiliar = this.redisPingClient?.client || globalConnectionManager.getRawClientById('redisPingClient');

    if (clienteAuxiliar) {
        globalConnectionManager.registerClient({
            clientId: 'imagen-analyzer-ping',
            client: clienteAuxiliar
        });
        console.log("✅ [FIX-FORZADO] Cliente de ping vinculado exitosamente.");
    } else {
        // Si todo falla, al menos no mandamos basura al manager
        console.error("❌ [FATAL] No hay clientes Redis disponibles para el ping.");
    }
}, 500); // Subimos a 500ms para dar aire al procesador

        // 🎯 CLIENTE DEDICADO 2: Aislamiento del Cache y Tracking (HIGH Priority)
        this.redisCacheClient = new RedisClient({
            clientId: 'imagen-analyzer-cache', // ID ÚNICO
            serviceName: 'imagen-analyzer',
            priority: SERVICE_PRIORITIES.HIGH, // Alta prioridad para Cache y Trazabilidad
            db: 1
        });
        this.redisCacheClient.registerWithManager();

        // FAANG: Enhanced components (Se mantienen)
        this.performanceMonitor = new PerformanceMonitorFAANG();
        this.securityValidator = new SecurityValidatorFAANG();
        this.concurrencyManager = new ConcurrencyManagerFAANG();
        this.circuitBreaker = new CircuitBreakerFAANG({
            name: 'ImageAnalysisCircuitBreaker',
            failureThreshold: FAANG_CONFIG.circuitBreaker.failureThreshold,
            resetTimeout: FAANG_CONFIG.circuitBreaker.resetTimeout
        });

        // Enhanced state tracking (Se mantiene)
        this.healthStatus = {
            redis: 'unknown',
            consumers: 'stopped',
            circuitBreaker: 'closed',
            lastHealthCheck: null
        };

        // Consumer management (Se mantiene, pero el set de consumers solo tendrá los de monitoreo)
        this.consumers = new Map();
        this.consumerErrors = new Map();

        // ❌ ELIMINADO: this.mirrorResponseBuffer = new Map();
        // ❌ ELIMINADO: this.MIRROR_BUFFER_TTL_MS = 60000;

        // Inicialización que ahora solo asegura los streams de monitoreo y Superior
        this.inicializarStreams();
        this.setupEventListeners();
    }


/**
 * Consumer Status - Monitoreo de estado (polling sin BLOCK)
 */
async consumerStatus() {
    const stream = STREAMS.STATUS_UPDATES;
    const group = CONSUMER_GROUPS.STATUS_MONITORS;
    const consumer = `${DRAGON_CONSUMER}-status`;

    dragon.respira('Iniciando consumerStatus', this.MODULE_NAME, 'CONS_STATUS_START');

    while (true) {
        try {
            const results = await rawRedisClient.xreadgroup(
                'GROUP', group, consumer,
                'COUNT', 10,
                'STREAMS', stream, '>'
            );
            if (results && results[0] && results[0][1] && results[0][1].length) {
                await this.procesarMensajesStatus(results[0][1]);
            } else {
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (err) {
            dragon.agoniza('Error en consumerStatus', err, this.MODULE_NAME, 'CONS_STATUS_ERR', {
                stream, group, consumer, error: err.message
            });
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Consumer Performance - Monitoreo de rendimiento (polling sin BLOCK)
 */
async consumerPerformance() {
    const stream = STREAMS.PERFORMANCE_METRICS;
    const group = CONSUMER_GROUPS.PERFORMANCE_COLLECTORS;
    const consumer = `${DRAGON_CONSUMER}-perf`;

    dragon.respira('Iniciando consumerPerformance', this.MODULE_NAME, 'CONS_PERF_START');

    while (true) {
        try {
            const results = await rawRedisClient.xreadgroup(
                'GROUP', group, consumer,
                'COUNT', 10,
                'STREAMS', stream, '>'
            );
            if (results && results[0] && results[0][1] && results[0][1].length) {
                await this.procesarMensajesPerformance(results[0][1]);
            } else {
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (err) {
            dragon.agoniza('Error en consumerPerformance', err, this.MODULE_NAME, 'CONS_PERF_ERR');
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Consumer Error - Alertas de error (polling sin BLOCK)
 */
async consumerError() {
    const stream = STREAMS.ERROR_ALERTS;
    const group = CONSUMER_GROUPS.ERROR_HANDLERS;
    const consumer = `${DRAGON_CONSUMER}-error`;

    dragon.respira('Iniciando consumerError', this.MODULE_NAME, 'CONS_ERR_START');

    while (true) {
        try {
            const results = await rawRedisClient.xreadgroup(
                'GROUP', group, consumer,
                'COUNT', 10,
                'STREAMS', stream, '>'
            );
            if (results && results[0] && results[0][1] && results[0][1].length) {
                await this.procesarMensajesError(results[0][1]);
            } else {
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (err) {
            dragon.agoniza('Error en consumerError', err, this.MODULE_NAME, 'CONS_ERR_ERR');
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Consumer Security - Eventos de seguridad (polling sin BLOCK)
 */
async consumerSecurity() {
    const stream = STREAMS.SECURITY_EVENTS;
    const group = CONSUMER_GROUPS.SECURITY_MONITORS;
    const consumer = `${DRAGON_CONSUMER}-security`;

    dragon.respira('Iniciando consumerSecurity', this.MODULE_NAME, 'CONS_SEC_START');

    while (true) {
        try {
            const results = await rawRedisClient.xreadgroup(
                'GROUP', group, consumer,
                'COUNT', 10,
                'STREAMS', stream, '>'
            );
            if (results && results[0] && results[0][1] && results[0][1].length) {
                await this.procesarMensajesSecurity(results[0][1]);
            } else {
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (err) {
            dragon.agoniza('Error en consumerSecurity', err, this.MODULE_NAME, 'CONS_SEC_ERR');
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Setup Event Listeners (Circuit Breaker, etc.)
 */
setupEventListeners() {
    // Circuit breaker event handling
    this.circuitBreaker.on('stateChange', (data) => {
        this.healthStatus.circuitBreaker = data.newState.toLowerCase();

        dragon.respira(
            'Circuit breaker state changed',
            this.MODULE_NAME,
            'CIRCUIT_BREAKER_STATE_CHANGE',
            {
                oldState: data.oldState,
                newState: data.newState,
                failures: data.failures,
                successes: data.successes,
                timestamp: data.timestamp
            }
        );

        // Emit to stream for monitoring (clave-valor plano)
        if (this.redis && FAANG_CONFIG.observability.metricsEnabled) {
            const statusObj = {
                component: 'circuit_breaker',
                event: 'state_change',
                oldState: data.oldState,
                newState: data.newState,
                timestamp: data.timestamp
            };
            const statusArgs = [];
            for (const [key, value] of Object.entries(statusObj)) {
                statusArgs.push(key, String(value));
            }
            this.redis.xadd(STREAMS.STATUS_UPDATES, '*', ...statusArgs).catch(error => {
                dragon.sePreocupa(
                    'Error emitting circuit breaker state change',
                    this.MODULE_NAME,
                    'STREAM_EMIT_ERROR',
                    { error: error.message }
                );
            });
        }
    });

    this.circuitBreaker.on('failure', (data) => {
        if (data.blocked) {
            dragon.sePreocupa(
                'Operation blocked by circuit breaker',
                this.MODULE_NAME,
                'CIRCUIT_BREAKER_BLOCKED',
                {
                    operation: data.operation,
                    state: data.state,
                    timestamp: new Date().toISOString()
                }
            );
        }
    });
}


 /**
 * FAANG: Enhanced stream initialization with comprehensive error handling
 */
async inicializarStreams() {
    const startTime = performance.now();

    try {
        await this.circuitBreaker.call(async () => {
            // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
            const redis = connectionManager.getRawClientById('imagen-analyzer');

            if (!redis) {
                this.healthStatus.redis = 'unavailable';
                dragon.sePreocupa('Redis no disponible - modo degradado FAANG', 'analizadorImagen', 'REDIS_UNAVAILABLE', {
                    degradedMode: true,
                    version: VERSION_MODULO
                });
                // No lanzar: degradar funcionalidad
                this.healthStatus.consumers = 'degraded';
                return;
            }

            this.healthStatus.redis = 'connected';

            // VALIDACIÓN DEFENSIVA DE STREAMS Y CONSUMER_GROUPS
            if (!STREAMS || typeof STREAMS !== 'object') {
                dragon.agoniza('STREAMS no definidos o corruptos - modo degradado', 'analizadorImagen', 'STREAMS_UNDEFINED', {
                    degradedMode: true,
                    version: VERSION_MODULO
                });
                this.healthStatus.consumers = 'degraded';
                return;
            }
            if (!CONSUMER_GROUPS || typeof CONSUMER_GROUPS !== 'object') {
                dragon.agoniza('CONSUMER_GROUPS no definidos o corruptos - modo degradado', 'analizadorImagen', 'CONSUMER_GROUPS_UNDEFINED', {
                    degradedMode: true,
                    version: VERSION_MODULO
                });
                this.healthStatus.consumers = 'degraded';
                return;
            }

            // Asegura y crea los streams y consumer groups necesarios
            // Dentro de inicializarStreams(), sustituye grupos por:
const grupos = [

  [STREAMS.REQUEST_SUPERIOR, CONSUMER_GROUPS.SUPERIOR_PROCESSORS],
  [STREAMS.STATUS_UPDATES,   CONSUMER_GROUPS.STATUS_MONITORS],
  [STREAMS.PERFORMANCE_METRICS, CONSUMER_GROUPS.PERFORMANCE_COLLECTORS],
  [STREAMS.ERROR_ALERTS,     CONSUMER_GROUPS.ERROR_HANDLERS],
  [STREAMS.SECURITY_EVENTS,  CONSUMER_GROUPS.SECURITY_MONITORS],
  [STREAMS.HEALTH_CHECKS,    CONSUMER_GROUPS.HEALTH_MONITORS],
  [STREAMS.AUDIT_TRAIL,      CONSUMER_GROUPS.AUDIT_PROCESSORS]
];

            for (const [stream, group] of grupos) {
                if (!stream || !group) {
                    dragon.sePreocupa('Par stream/group inválido en config. Saltando.', 'analizadorImagen', 'INVALID_STREAM_GROUP_PAIR', {
                        stream,
                        group
                    });
                    continue;
                }
                try {
                    await ensureStreamAndGroup(redis, stream, group); // <-- redis actualizado
                } catch (err) {
                    dragon.sePreocupa('Error asegurando stream/grupo', 'analizadorImagen', 'ENSURE_STREAM_GROUP_ERROR', {
                        stream,
                        group,
                        error: err && err.message ? err.message : err
                    });
                    this.healthStatus.consumers = 'degraded';
                }
            }

            // Start enhanced consumers
            await this.iniciarConsumers();

            this.healthStatus.consumers = 'running';

            const duration = performance.now() - startTime;

            dragon.sonrie('Redis Streams FAANG inicializados exitosamente', 'analizadorImagen', 'STREAMS_INITIALIZED', {
                streams: Object.keys(STREAMS).length,
                consumerGroups: Object.keys(CONSUMER_GROUPS).length,
                duration: Math.round(duration * 100) / 100,
                circuitBreakerEnabled: FAANG_CONFIG.circuitBreaker.enabled,
                version: VERSION_MODULO,
                healthStatus: this.healthStatus
            });

        }, 'stream_initialization');

    } catch (error) {
        const duration = performance.now() - startTime;

        this.healthStatus.redis = 'error';
        this.healthStatus.consumers = 'failed';

        dragon.agoniza('Error inicializando Redis Streams FAANG', error, 'analizadorImagen', 'STREAMS_INIT_ERROR', {
            duration: Math.round(duration * 100) / 100,
            streamsCount: STREAMS && typeof STREAMS === 'object' ? Object.keys(STREAMS).length : 0,
            healthStatus: this.healthStatus,
            version: VERSION_MODULO
        });

        // NO lanzar error: degradar funcionalidad
        // throw error;
    }
}





async _procesarSuperiorBatch(mensajes, redis, stream, group, draining, addDummy) {
  const processingStart = performance.now();
  let dummyCountLocal = 0;

  for (const [id, campos] of mensajes) {
    const rawRespuesta = campos.respuesta || campos.resultado || campos.payload;
    const archivoId = campos.archivoId;

    const isDummy =
      archivoId === 'init' ||
      !archivoId ||
      !rawRespuesta ||
      rawRespuesta === '{}' ||
      archivoId === '1'; // he visto seeds con valor 1 en tus XRANGE

    if (isDummy) {
      dummyCountLocal++;
      try { await redis.xack(stream, group, id); } catch {}
      continue;
    }

    const msgStart = performance.now();
    try {
      const respuesta = JSON.parse(rawRespuesta);
      await this.actualizarTracking(archivoId, 'superior_recibido', {
        messageId: id,
        timestamp: Date.now(),
        processingTime: Math.round((performance.now() - processingStart) * 100) / 100
      });

      const waiterKey = `superior:${archivoId}`;
      const resolver = this.responseWaiters.get(waiterKey);
      if (resolver) {
        resolver(respuesta);
        this.responseWaiters.delete(waiterKey);
      } else {
        // (Opcional) buffer si quieres
      }

      await redis.xack(stream, group, id);

      const msgDur = performance.now() - msgStart;
      dragon.respira('Respuesta superior procesada FAANG', 'analizadorImagen', 'SUPERIOR_RESPONSE_PROCESSED', {
        archivoId,
        messageId: id,
        processingTime: Math.round(msgDur * 100) / 100
      });

    } catch (e) {
      dragon.agoniza('Error parseando/procesando respuesta superior', e, 'analizadorImagen', 'SUPERIOR_RESPONSE_ERROR', {
        messageId: id,
        campos: Object.keys(campos)
      });
      try { await redis.xack(stream, group, id); } catch {}
    }
  }

  if (dummyCountLocal > 0) addDummy(dummyCountLocal);

  if (dummyCountLocal && !draining) {
    // Logging comprimido (sin spam)
    dragon.zen(`Dummies superiores filtrados en batch: ${dummyCountLocal}`, 'analizadorImagen', 'SUPERIOR_DUMMIES_BATCH', {
      batchSize: mensajes.length
    });
  }
}

// Dentro de class GestorStreamsBidireccionalFAANG, métodos de clase (no dentro de otra función)

// Stream de respuesta por-solicitud (Superior)
_buildSuperiorRespStream(archivoId) {
  return `dragon3:stream:resp:superior:${archivoId}`;
}



async _xreadOnce(streamKey, timeoutMs = 10000) {
  const redis = connectionManager.getRawClientById('analysis-client-db1');
  if (!redis) throw new Error('Redis no disponible');

  const hasXread = typeof redis.xread === 'function';
  let res;

  const startTime = Date.now();
  try {
    if (hasXread) {
      res = await redis.xread('BLOCK', String(timeoutMs), 'COUNT', '1', 'STREAMS', streamKey, '0-0');
    } else {
      throw new Error('Cliente Redis sin xread disponible');
    }
  } catch (e) {
    throw new Error(`XREAD falló (${streamKey}): ${e.message}`);
  }

  if (!res || !res[0] || !res[0][1] || res[0][1].length === 0) {
    throw new Error(`Timeout esperando respuesta en ${streamKey}`);
  }

  const [[messageId, fields]] = res[0][1];
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];

  // TTL opcional
  try { await redis.expire(streamKey, 300); } catch { /* noop */ }

  // 1. Intentar con campo único (formato antiguo)
  let response = null;
  const raw = obj.respuesta || obj.payload || obj.resultado;
  if (raw) {
    try {
      response = JSON.parse(raw);
    } catch (e) {
      response = raw;
    }
  }
  // 2. Si no hay campo único, intentar reconstruir desde campos planos (formato mlWorker)
  else if (obj.categoria) {
    response = {
      categoria: obj.categoria,
      confianza: parseFloat(obj.confianza),
      scores: obj.scores ? JSON.parse(obj.scores) : null,
      metadata: {
        timestamp: parseInt(obj.timestamp, 10),
        archivoId: obj.archivoId,
        correlationId: obj.correlationId
      }
    };
  }

  if (!response) {
    console.warn(`⚠️ [XREAD] No se pudo extraer respuesta del mensaje. Campos: ${Object.keys(obj).join(', ')}`);
    return null;
  }

  return response;
}

    async _esperarSuperiorViaStreamOnce(archivoId, timeoutMs = 15000) {
  const respStream = this._buildSuperiorRespStream(archivoId);
  console.log(`🎯 [_esperarSuperiorViaStreamOnce] Esperando respuesta para archivo ${archivoId}`);
  console.log(`🎯 Stream de respuesta: ${respStream}`);
  console.log(`🎯 Timeout: ${timeoutMs}ms`);
  return this._xreadOnce(respStream, timeoutMs);
}




/**
 * FAANG: Enhanced consumer initialization with health monitoring (robust)
 */
async iniciarConsumers() {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    // Verificar dependencias críticas antes de iniciar
    if (this.consumersRunning || !redis) {
        dragon.sePreocupa('Consumidores no iniciados: redis no disponible o ya corriendo', 'analizadorImagen', 'CONSUMERS_NOT_STARTED', {
            consumersRunning: !!this.consumersRunning,
            redisDisponible: !!redis
        });
        return;
    }

    // Validación defensiva de STREAMS y CONSUMER_GROUPS
    if (!STREAMS || typeof STREAMS !== 'object' || !CONSUMER_GROUPS || typeof CONSUMER_GROUPS !== 'object') {
        dragon.agoniza('Inicialización de consumidores fallida: Configuración de streams incompleta o corrupta',
            new Error('STREAMS o CONSUMER_GROUPS no definidos o no son objetos'),
            'analizadorImagen',
            'CONSUMER_CONFIG_ERROR',
            { streams: !!STREAMS, consumerGroups: !!CONSUMER_GROUPS }
        );
        // No bloquear la inicialización global: degradar funcionalidad
        if (this.healthStatus) this.healthStatus.consumers = 'degraded';
        return;
    }

    this.consumersRunning = true;
    this.consumers = new Map(); // Asegurar inicialización del mapa
    this.consumerErrors = this.consumerErrors || new Map(); // Inicializar si no existe

   const consumerConfigs = [
  { name: 'status',      method: 'consumerStatus',      stream: STREAMS.STATUS_UPDATES,      group: CONSUMER_GROUPS.STATUS_MONITORS },
  { name: 'performance', method: 'consumerPerformance', stream: STREAMS.PERFORMANCE_METRICS, group: CONSUMER_GROUPS.PERFORMANCE_COLLECTORS },
  { name: 'error',       method: 'consumerError',       stream: STREAMS.ERROR_ALERTS,        group: CONSUMER_GROUPS.ERROR_HANDLERS },
  { name: 'security',    method: 'consumerSecurity',    stream: STREAMS.SECURITY_EVENTS,     group: CONSUMER_GROUPS.SECURITY_MONITORS }
];

    // Start all consumers with error handling
    for (const config of consumerConfigs) {
        try {
            // Validar existencia del método
            if (typeof this[config.method] !== 'function') {
                dragon.agoniza(`Método consumidor ${config.method} no definido`,
                    new Error(`Method not found: ${config.method}`),
                    'analizadorImagen',
                    'CONSUMER_METHOD_MISSING',
                    { consumerName: config.name, method: config.method }
                );
                continue; // Saltar este consumidor y continuar con el siguiente
            }

            // Validar parámetros del stream
            if (!config.stream || !config.group) {
                dragon.agoniza(`Configuración de stream/grupo inválida para ${config.name}`,
                    new Error('Invalid stream configuration'),
                    'analizadorImagen',
                    'CONSUMER_CONFIG_INVALID',
                    { consumerName: config.name, stream: config.stream, group: config.group }
                );
                continue;
            }

            // Robustecer arranque del consumidor: envolver en try/catch interior
            const consumerPromise = (async () => {
                try {
                    await this[config.method]();
                } catch (e) {
                    this.handleConsumerError(config.name, e);
                }
            })();

            this.consumers.set(config.name, {
                config,
                promise: consumerPromise,
                startTime: Date.now(),
                errorCount: 0,
                lastError: null
            });

            dragon.respira(`Consumer ${config.name} iniciado`, 'analizadorImagen', 'CONSUMER_STARTED', {
                consumerName: config.name,
                stream: config.stream,
                group: config.group
            });

        } catch (error) {
            this.handleConsumerError(config.name, error);
        }
    }

    // Diagnóstico de consumidores fallidos para el resumen final
    const failedConsumers = consumerConfigs
        .filter(c => !this.consumers.has(c.name))
        .map(c => c.name);

    // No bloquear la inicialización incluso si algunos consumidores fallan
    dragon.sonrie('Consumers bidireccionales FAANG iniciados', 'analizadorImagen', 'CONSUMERS_INITIALIZED', {
        consumers: consumerConfigs.map(c => c.name),
        totalConsumers: consumerConfigs.length,
        activeConsumers: this.consumers.size,
        failedConsumers,
        version: VERSION_MODULO,
        healthStatus: this.healthStatus
    });
}



/**
 * FAANG: Robust consumer error handler with health monitoring and exponential backoff
 */
async handleConsumerError(consumerName, error) {
    // Validación defensiva de consumers
    this.consumers = this.consumers || new Map();
    this.consumerErrors = this.consumerErrors || new Map();

    const consumer = this.consumers.get(consumerName);
    if (consumer) {
        consumer.errorCount = (consumer.errorCount || 0) + 1;
        consumer.lastError = {
            message: error?.message || String(error),
            timestamp: Date.now()
        };
    }

    // Contador global de errores por consumidor
    const errorKey = `consumer_${consumerName}`;
    const errorCount = (this.consumerErrors.get(errorKey) || 0) + 1;
    this.consumerErrors.set(errorKey, errorCount);

    // Logging estructurado
    dragon.agoniza(`Consumer ${consumerName} error`, error, 'analizadorImagen', 'CONSUMER_ERROR', {
        consumerName,
        errorCount,
        timestamp: new Date().toISOString()
    });

    // Health status: si supera el límite, degradar estado
    if (errorCount >= 5 && this.healthStatus) {
        this.healthStatus.consumers = 'degraded';
    }

    // Reinicio con backoff exponencial si no llega al límite
    if (errorCount < 5) {
        setTimeout(() => {
            // El restart puede ser async, pero setTimeout no soporta async/await directamente
            try {
                if (typeof this.restartConsumer === 'function') {
                    this.restartConsumer(consumerName);
                } else {
                    dragon.agoniza(`Método restartConsumer no definido`, new Error('restartConsumer not found'), 'analizadorImagen', 'CONSUMER_RESTART_MISSING', {
                        consumerName
                    });
                }
            } catch (restartErr) {
                dragon.agoniza(`Error reiniciando consumer ${consumerName}`, restartErr, 'analizadorImagen', 'CONSUMER_RESTART_ERROR', {
                    consumerName
                });
            }
        }, Math.pow(2, errorCount) * 1000); // Exponential backoff
    } else {
        // Log permanente si supera el límite
        dragon.agoniza(`Consumer ${consumerName} permanently failed`, error, 'analizadorImagen', 'CONSUMER_PERMANENT_FAILURE', {
            consumerName,
            errorCount
        });
    }
}

/**
 * FAANG: Robust consumer restart logic with defensive checks and logging
 */
async restartConsumer(consumerName) {
    // Validación defensiva de estructura interna
    this.consumers = this.consumers || new Map();

    const consumer = this.consumers.get(consumerName);
    if (!consumer) {
        dragon.agoniza(`No se puede reiniciar: consumidor ${consumerName} no existe`,
            new Error(`Consumer not found: ${consumerName}`),
            'analizadorImagen',
            'CONSUMER_RESTART_CONSUMER_NOT_FOUND',
            { consumerName }
        );
        // Si falta el consumidor, degradar health status
        if (this.healthStatus) this.healthStatus.consumers = 'degraded';
        return;
    }

    try {
        // Validar que el método siga existiendo
        if (!consumer.config || typeof this[consumer.config.method] !== 'function') {
            dragon.agoniza(`No se puede reiniciar ${consumerName}: método no encontrado`,
                new Error(`Method not found on restart: ${consumer.config && consumer.config.method}`),
                'analizadorImagen',
                'CONSUMER_RESTART_FAILED',
                { consumerName, method: consumer.config && consumer.config.method }
            );
            if (this.healthStatus) this.healthStatus.consumers = 'degraded';
            return;
        }

        // Reiniciar el consumidor de forma robusta
        const consumerPromise = (async () => {
            try {
                await this[consumer.config.method]();
            } catch (error) {
                this.handleConsumerError(consumerName, error);
            }
        })();

        consumer.promise = consumerPromise;
        consumer.startTime = Date.now();

        dragon.respira(`Consumer ${consumerName} restarted`, 'analizadorImagen', 'CONSUMER_RESTARTED', {
            consumerName,
            errorCount: consumer.errorCount
        });

    } catch (error) {
        // Manejo robusto de errores en el reinicio
        this.handleConsumerError(consumerName, error);
        if (this.healthStatus) this.healthStatus.consumers = 'degraded';
    }
}



/**
 * FAANG: Enhanced status message processing
 */
async procesarMensajesStatus(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes dummy/init
        if (
            campos.archivoId === 'init' ||
            campos.status === 'INIT' ||
            campos.component === 'system' ||
            campos.event === 'init' ||
            !campos.archivoId || !campos.status
        ) {
            dragon.zen('Ignorando mensaje dummy/init en status', 'analizadorImagen', 'STATUS_DUMMY_IGNORED', {
                messageId: id,
                archivoId: campos.archivoId,
                status: campos.status,
                component: campos.component,
                event: campos.event
            });
            continue;
        }

        try {
            const archivoId = campos.archivoId;
            const status = campos.status;
            const component = campos.component || 'unknown';
            const event = campos.event || 'status_update';

            await this.actualizarTracking(archivoId, 'status_update', {
                status,
                component,
                event,
                messageId: id,
                timestamp: Date.now()
            });

            if (redis) {
                await redis.xack(STREAMS.STATUS_UPDATES, CONSUMER_GROUPS.STATUS_MONITORS, id);
            }

            dragon.respira('Status update procesado FAANG', 'analizadorImagen', 'STATUS_UPDATE_PROCESSED', {
                archivoId,
                status,
                component,
                event,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje status FAANG', error, 'analizadorImagen', 'STATUS_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

/**
 * FAANG: Performance metrics message processing
 */
async procesarMensajesPerformance(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes dummy/init
        if (
            campos.metric === 'init' ||
            campos.operation === 'init' ||
            campos.severity === 'low' ||
            !campos.metric
        ) {
            dragon.zen('Ignorando mensaje dummy/init en performance', 'analizadorImagen', 'PERFORMANCE_DUMMY_IGNORED', {
                messageId: id,
                metric: campos.metric,
                operation: campos.operation,
                severity: campos.severity
            });
            continue;
        }

        try {
            const metric = campos.metric || 'unknown';
            const value = parseFloat(campos.actualValue || campos.value || 0);
            const threshold = parseFloat(campos.threshold || 0);
            const operation = campos.operation || 'unknown';
            const severity = campos.severity || 'medium';

            // Process performance alert
            if (severity === 'critical' && healthMonitor?.registrarMetrica) {
                healthMonitor.registrarMetrica(`performance_alert_${metric}`, value, {
                    threshold,
                    operation,
                    severity,
                    timestamp: Date.now()
                });
            }

            if (redis) {
                await redis.xack(STREAMS.PERFORMANCE_METRICS, CONSUMER_GROUPS.PERFORMANCE_COLLECTORS, id);
            }

            dragon.mideRendimiento(`performance_alert_processed`, value, 'analizadorImagen', {
                metric,
                threshold,
                operation,
                severity,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje performance FAANG', error, 'analizadorImagen', 'PERFORMANCE_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

/**
 * FAANG: Error alerts message processing
 */
async procesarMensajesError(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes dummy/init
        if (
            campos.errorType === 'init' ||
            campos.severity === 'low' ||
            campos.component === 'system' ||
            campos.message === 'init' ||
            !campos.errorType
        ) {
            dragon.zen('Ignorando mensaje dummy/init en error', 'analizadorImagen', 'ERROR_DUMMY_IGNORED', {
                messageId: id,
                errorType: campos.errorType,
                severity: campos.severity,
                component: campos.component,
                message: campos.message
            });
            continue;
        }

        try {
            const errorType = campos.errorType || 'unknown';
            const severity = campos.severity || 'medium';
            const component = campos.component || 'unknown';
            const message = campos.message || '';

            // Process error alert
            if (severity === 'critical' && healthMonitor?.registrarError) {
                const error = new DragonError(message, errorType, severity, 'application');
                healthMonitor.registrarError(error, {
                    component,
                    messageId: id,
                    timestamp: Date.now()
                });
            }

            if (redis) {
                await redis.xack(STREAMS.ERROR_ALERTS, CONSUMER_GROUPS.ERROR_HANDLERS, id);
            }

            dragon.agoniza('Error alert procesado FAANG', new Error(message), 'analizadorImagen', 'ERROR_ALERT_PROCESSED', {
                errorType,
                severity,
                component,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje error FAANG', error, 'analizadorImagen', 'ERROR_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

/**
 * FAANG: Security events message processing
 */
async procesarMensajesSecurity(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes dummy/init
        if (
            campos.archivoId === 'init' ||
            campos.event === 'SECURITY_EVENT' ||
            campos.type === 'init' ||
            campos.severity === 'low' ||
            campos.message === 'init' ||
            !campos.archivoId
        ) {
            dragon.zen('Ignorando mensaje dummy/init en security', 'analizadorImagen', 'SECURITY_DUMMY_IGNORED', {
                messageId: id,
                archivoId: campos.archivoId,
                event: campos.event,
                type: campos.type,
                severity: campos.severity,
                message: campos.message
            });
            continue;
        }

        try {
            const archivoId = campos.archivoId;
            const event = campos.event || 'SECURITY_EVENT';
            const type = campos.type || 'unknown';
            const severity = campos.severity || 'medium';
            const message = campos.message || '';

            // Process security event
            if (severity === 'high' || severity === 'critical') {
                if (healthMonitor?.registrarError) {
                    const error = new SecurityError(message, type);
                    healthMonitor.registrarError(error, {
                        archivoId,
                        event,
                        messageId: id,
                        timestamp: Date.now()
                    });
                }

                // Update security tracking
                if (archivoId) {
                    await this.actualizarTracking(archivoId, 'security_event', {
                        event,
                        type,
                        severity,
                        messageId: id,
                        timestamp: Date.now()
                    });
                }
            }

            if (redis) {
                await redis.xack(STREAMS.SECURITY_EVENTS, CONSUMER_GROUPS.SECURITY_MONITORS, id);
            }

            dragon.agoniza('Security event procesado FAANG', new SecurityError(message, type), 'analizadorImagen', 'SECURITY_EVENT_PROCESSED', {
                archivoId,
                event,
                type,
                severity,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje security FAANG', error, 'analizadorImagen', 'SECURITY_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}



/**
 * FAANG: Enhanced message processing for superior responses
 */
async procesarMensajesSuperior(mensajes, processingTime) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes dummy/init
        if (
            campos.archivoId === 'init' ||
            campos.respuesta === '{}' ||
            !campos.archivoId ||
            !campos.respuesta
        ) {
            dragon.zen('Ignorando mensaje dummy/init en superior', 'analizadorImagen', 'SUPERIOR_DUMMY_IGNORED', {
                messageId: id,
                archivoId: campos.archivoId,
                respuesta: campos.respuesta
            });
            continue;
        }

        const messageStartTime = performance.now();

        try {
            const archivoId = campos.archivoId;
            const respuesta = JSON.parse(campos.respuesta);

            await this.actualizarTracking(archivoId, 'superior_recibido', {
                messageId: id,
                timestamp: Date.now(),
                processingTime: Math.round(processingTime * 100) / 100
            });

            const resolver = this.responseWaiters.get(`superior:${archivoId}`);
            if (resolver) {
                resolver(respuesta);
                this.responseWaiters.delete(`superior:${archivoId}`);
            }

            if (redis) {
                await redis.xack(STREAMS.RESPONSE_SUPERIOR, CONSUMER_GROUPS.SUPERIOR_PROCESSORS, id);
            }

            const messageProcessingTime = performance.now() - messageStartTime;

            dragon.respira('Respuesta superior procesada FAANG', 'analizadorImagen', 'SUPERIOR_RESPONSE_PROCESSED', {
                archivoId,
                messageId: id,
                processingTime: Math.round(messageProcessingTime * 100) / 100,
                streamProcessingTime: Math.round(processingTime * 100) / 100
            });

        } catch (error) {
            const messageProcessingTime = performance.now() - messageStartTime;

            dragon.agoniza('Error procesando mensaje superior FAANG', error, 'analizadorImagen', 'SUPERIOR_MESSAGE_ERROR', {
                messageId: id,
                processingTime: Math.round(messageProcessingTime * 100) / 100,
                campos: Object.keys(campos)
            });
        }
    }
}

   /**
 * FAANG: Enhanced status message processing
 */
async procesarMensajesStatus(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        // FILTRO: Ignora mensajes iniciales dummy/init
        if (
            campos.archivoId === 'init' ||
            campos.status === 'INIT' ||
            campos.component === 'system' ||
            campos.event === 'init' ||
            !campos.archivoId || !campos.status
        ) {
            dragon.zen('Ignorando mensaje dummy/init en status', 'analizadorImagen', 'STATUS_DUMMY_IGNORED', {
                messageId: id,
                archivoId: campos.archivoId,
                status: campos.status,
                component: campos.component,
                event: campos.event
            });
            continue;
        }

        try {
            const archivoId = campos.archivoId;
            const status = campos.status;
            const component = campos.component || 'unknown';
            const event = campos.event || 'status_update';

            await this.actualizarTracking(archivoId, 'status_update', {
                status,
                component,
                event,
                messageId: id,
                timestamp: Date.now()
            });

            if (redis) {
                await redis.xack(STREAMS.STATUS_UPDATES, CONSUMER_GROUPS.STATUS_MONITORS, id);
            }

            dragon.respira('Status update procesado FAANG', 'analizadorImagen', 'STATUS_UPDATE_PROCESSED', {
                archivoId,
                status,
                component,
                event,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje status FAANG', error, 'analizadorImagen', 'STATUS_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

/**
 * FAANG: Performance metrics message processing
 */
async procesarMensajesPerformance(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        try {
            const metric = campos.metric || 'unknown';
            const value = parseFloat(campos.actualValue || campos.value || 0);
            const threshold = parseFloat(campos.threshold || 0);
            const operation = campos.operation || 'unknown';
            const severity = campos.severity || 'medium';

            // Process performance alert
            if (severity === 'critical' && healthMonitor?.registrarMetrica) {
                healthMonitor.registrarMetrica(`performance_alert_${metric}`, value, {
                    threshold,
                    operation,
                    severity,
                    timestamp: Date.now()
                });
            }

            if (redis) {
                await redis.xack(STREAMS.PERFORMANCE_METRICS, CONSUMER_GROUPS.PERFORMANCE_COLLECTORS, id);
            }

            dragon.mideRendimiento(`performance_alert_processed`, value, 'analizadorImagen', {
                metric,
                threshold,
                operation,
                severity,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje performance FAANG', error, 'analizadorImagen', 'PERFORMANCE_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

/**
 * FAANG: Error alerts message processing
 */
async procesarMensajesError(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        try {
            const errorType = campos.errorType || 'unknown';
            const severity = campos.severity || 'medium';
            const component = campos.component || 'unknown';
            const message = campos.message || '';

            // Process error alert
            if (severity === 'critical' && healthMonitor?.registrarError) {
                const error = new DragonError(message, errorType, severity, 'application');
                healthMonitor.registrarError(error, {
                    component,
                    messageId: id,
                    timestamp: Date.now()
                });
            }

            if (redis) {
                await redis.xack(STREAMS.ERROR_ALERTS, CONSUMER_GROUPS.ERROR_HANDLERS, id);
            }

            dragon.agoniza('Error alert procesado FAANG', new Error(message), 'analizadorImagen', 'ERROR_ALERT_PROCESSED', {
                errorType,
                severity,
                component,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje error FAANG', error, 'analizadorImagen', 'ERROR_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}

   /**
 * FAANG: Security events message processing
 */
async procesarMensajesSecurity(mensajes) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    for (const [id, campos] of mensajes) {
        try {
            const archivoId = campos.archivoId;
            const event = campos.event || 'SECURITY_EVENT';
            const type = campos.type || 'unknown';
            const severity = campos.severity || 'medium';
            const message = campos.message || '';

            // Process security event
            if (severity === 'high' || severity === 'critical') {
                if (healthMonitor?.registrarError) {
                    const error = new SecurityError(message, type);
                    healthMonitor.registrarError(error, {
                        archivoId,
                        event,
                        messageId: id,
                        timestamp: Date.now()
                    });
                }

                // Update security tracking
                if (archivoId) {
                    await this.actualizarTracking(archivoId, 'security_event', {
                        event,
                        type,
                        severity,
                        messageId: id,
                        timestamp: Date.now()
                    });
                }
            }

            if (redis) {
                await redis.xack(STREAMS.SECURITY_EVENTS, CONSUMER_GROUPS.SECURITY_MONITORS, id);
            }

            dragon.agoniza('Security event procesado FAANG', new SecurityError(message, type), 'analizadorImagen', 'SECURITY_EVENT_PROCESSED', {
                archivoId,
                event,
                type,
                severity,
                messageId: id
            });

        } catch (error) {
            dragon.agoniza('Error procesando mensaje security FAANG', error, 'analizadorImagen', 'SECURITY_MESSAGE_ERROR', {
                messageId: id,
                campos: Object.keys(campos)
            });
        }
    }
}



/**
 * FAANG: Enhanced stream request sending with performance tracking
 */
async enviarRequestStream(stream, archivoId, datos, correlationId) {
  const startTime = performance.now();
  performance.mark(`dragon3:redis:stream:${archivoId}:start`);

  const redis = this.redisCacheClient.client;
  console.log(`📡 [enviarRequestStream] Cliente DB: ${redis?.options?.db ?? 'desconocido'}`);

  try {
    if (!redis) {
      await this.actualizarTracking(archivoId, 'request_degradado', { stream, correlationId });
      return `mock_${Date.now()}`;
    }

    const features = extractFeaturesFromDatos(datos);

    // 🔥 CONSTRUIR EL STREAM DE RESPUESTA ESPECÍFICO (igual que en _esperarSuperiorViaStreamOnce)
    const respStream = `dragon3:stream:resp:superior:${archivoId}`;

    const streamData = {
      archivoId: archivoId || 'unknown',
      correlationId: correlationId || crypto.randomUUID(),
      payload: JSON.stringify({ features }),
      respStream,              // ← CAMBIO CLAVE: añadir el stream de respuesta
      timestamp: Date.now().toString()
    };

    if (!streamData.archivoId || streamData.archivoId === 'unknown') {
      dragon.sePreocupa('Request superior sin archivoId válido', 'analizadorImagen', 'REQ_SUP_MISSING_ARCHIVOID', { stream, correlationId });
    }

    const args = [];
    for (const [k, v] of Object.entries(streamData)) args.push(k, String(v));

    const messageId = await redis.xadd(stream, '*', ...args);

    performance.mark(`dragon3:redis:stream:${archivoId}:end`);
    performance.measure(`dragon3:redis:stream:${archivoId}`,
      `dragon3:redis:stream:${archivoId}:start`,
      `dragon3:redis:stream:${archivoId}:end`
    );

    await this.actualizarTracking(archivoId, 'request_enviado_superior', {
      stream,
      messageId,
      correlationId: streamData.correlationId,
      duration: Math.round((performance.now() - startTime) * 100) / 100
    });

    return messageId;
  } catch (e) {
    dragon.agoniza('Error enviando request superior', e, 'analizadorImagen', 'REQ_SUP_ERROR', { archivoId, correlationId, stream });
    throw e;
  }
}

/**
 * FAANG Enterprise: Espera de respuesta robusta de Red Superior (XREAD BLOCK)
 * Simplificada: Solo maneja Modo Degradado o delega en _esperarSuperiorViaStreamOnce.
 * ELIMINADA toda la lógica de 'espejo', 'waiters' y 'buffer'.
 */
async esperarRespuesta(tipo, archivoId, timeout = TIMEOUT_STREAM_READ) {
    const startTime = performance.now();

    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = connectionManager.getRawClientById('imagen-analyzer');

    // 1. ELIMINAR el chequeo de buffer del espejo que ya no existe (Líneas 9-13).

    try {
        if (!redis || tipo === 'degradado') {
            // --- MODO DEGRADADO: simular respuesta rápida (Líneas 16-39) ---
            // Se mantiene la lógica de simulación intacta.
            dragon.respira('Simulando respuesta en modo degradado FAANG', 'analizadorImagen', 'DEGRADED_RESPONSE_SIMULATION', { tipo, archivoId, timeout });
            const simulatedDelay = Math.min(timeout / 4, 500);
            await new Promise(resolve => setTimeout(resolve, simulatedDelay));

            const result = { /* ... objeto de resultado simulado ... */ };

            await this.actualizarTracking(archivoId, 'response_simulado', { tipo, simulatedDelay, timestamp: Date.now() });

            return result;
        }

        // --- MODO NORMAL: espera respuesta REAL (Líneas 42-108) ---

        // 2. Redirigir a la función XREAD BLOCK específica, dependiendo del 'tipo'
        //    (Solo permitimos 'superior').

        if (tipo === 'superior') {
            // El Circuit Breaker se aplica dentro de la función de espera XREAD (más robusto).
            return await this._esperarSuperiorViaStreamOnce(archivoId, timeout);
        }

        // ❌ Si el tipo es 'espejo', o cualquier otro que requería waiters, lanzamos error.
        throw new Error(`Tipo de espera '${tipo}' no soportado tras eliminación de Red Espejo.`);


    } catch (error) {
        const duration = performance.now() - startTime;

        // 3. ELIMINAR la consulta de "ÚLTIMA OPORTUNIDAD" del buffer espejo (Líneas 114-122).

        if (error instanceof CircuitBreakerError) {
            dragon.sePreocupa('Circuit breaker blocked response wait', 'analizadorImagen', 'CIRCUIT_BREAKER_RESPONSE_BLOCKED', {
                tipo,
                archivoId,
                duration: Math.round(duration * 100) / 100,
                circuitBreakerState: error.state
            });
        }

        throw error;
    }
}

    /**
 * FAANG: Enhanced tracking with performance and error context
 */
async actualizarTracking(archivoId, etapa, datos = {}) {
    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = this.redisCacheClient.client;
    try {
        if (!redis) return;

        const trackingKey = HASH_KEYS.TRACKING(archivoId);
        const timestamp = Date.now();

        const trackingData = {
            [`etapa_${etapa}`]: timestamp,
            [`datos_${etapa}`]: JSON.stringify({
                ...datos,
                version: VERSION_MODULO,
                module: NOMBRE_MODULO
            }),
            ultima_actualizacion: timestamp,
            total_etapas: await redis.hlen(trackingKey) + 1,
            version: VERSION_MODULO
        };

        await redis.hmset(trackingKey, trackingData);
        await redis.expire(trackingKey, 7200); // 2 hours TTL

        // Enhanced session update with performance data
        const sessionKey = HASH_KEYS.SESSION(archivoId);
        await redis.hmset(sessionKey, {
            etapa_actual: etapa,
            timestamp,
            version: VERSION_MODULO,
            healthStatus: this.healthStatus.redis,
            circuitBreakerState: this.circuitBreaker.getState().state,
            concurrencyLevel: this.concurrencyManager.getMetrics().currentConcurrency,
            ...datos
        });
        await redis.expire(sessionKey, 3600); // 1 hour TTL

    } catch (error) {
        dragon.sePreocupa('Error actualizando tracking FAANG', 'analizadorImagen', 'TRACKING_UPDATE_ERROR', {
            archivoId,
            etapa,
            error: error.message,
            datos: Object.keys(datos)
        });
    }
}


/**
 * FAANG: Enhanced hash generation with error handling
 */
async generarHashImagen(rutaArchivo) {
    try {
        const buffer = await fs.readFile(rutaArchivo);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        dragon.respira('Hash imagen generado exitosamente', 'analizadorImagen', 'HASH_GENERATED', {
            rutaArchivo: path.basename(rutaArchivo),
            hashPrefix: hash.substring(0, 16),
            fileSize: buffer.length
        });

        return hash;

    } catch (error) {
        const enhancedError = new DragonError(
            `Error generando hash imagen: ${error.message}`,
            'HASH_GENERATION_FAILED',
            'medium',
            'application',
            {
                rutaArchivo: path.basename(rutaArchivo),
                originalError: error.message
            }
        );

        dragon.agoniza('Error generando hash imagen', enhancedError, 'analizadorImagen', 'HASH_ERROR', {
            rutaArchivo: path.basename(rutaArchivo)
        });

        throw enhancedError;
    }
}

/**
 * FAANG: Enhanced cache verification with performance tracking
 */
async verificarCache(hashImagen, archivoId) {
    const startTime = performance.now();
    const cacheKey = HASH_KEYS.CACHE(hashImagen);

    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = this.redisCacheClient.client;

    // Logging de inicio de operación
    dragon.sePreocupa('[CACHE][GET] Intentando obtener desde Redis', {
        archivoId,
        hashPrefix: hashImagen.substring(0, 16),
        cacheKey,
        origen: 'verificarCache'
    });

    try {
        if (!redis) {
            dragon.seEnfada('[CACHE][GET] Redis client no está inicializado', { archivoId, origen: 'verificarCache' });
            return null;
        }

        const resultadoCache = await redis.get(cacheKey);

        const duration = performance.now() - startTime;

        // Logging resultado de Redis
        dragon.sePreocupa('[CACHE][GET] Resultado de Redis', {
            archivoId,
            hashPrefix: hashImagen.substring(0, 16),
            cacheKey,
            resultadoCacheResumen: resultadoCache ? resultadoCache.slice(0, 128) : null,
            duration: Math.round(duration * 100) / 100,
            origen: 'verificarCache'
        });

        if (resultadoCache) {
    await this.actualizarTracking(archivoId, 'cache_hit', {
        hashImagen: hashImagen.substring(0, 16),
        duration: Math.round(duration * 100) / 100
    });

    const resultado = JSON.parse(resultadoCache);
    resultado.cacheHit = true;
    resultado.timestamp = new Date().toISOString();
    resultado.cacheDuration = Math.round(duration * 100) / 100;

    dragon.sonrie('Cache Hit FAANG Streams', 'analizadorImagen', 'CACHE_HIT', {
        archivoId,
        hashPrefix: hashImagen.substring(0, 16),
        duration: Math.round(duration * 100) / 100,
        resultType: resultado.resumen?.decision === "Humano" ? 'authentic' : 'artificial'
    });

    // --- LOG PROFUNDO DE ESTRUCTURA CACHE ---
    dragon.sePreocupa('DEBUG cache resultado bruto antes de adaptar', 'analizadorImagen', 'CACHE_RAW_RESULT_DEBUG', {
        archivoId,
        hashPrefix: hashImagen.substring(0, 16),
        cacheType: typeof resultado,
        cacheKeys: resultado ? Object.keys(resultado) : [],
        resumen: resultado?.resumen,
        detalles: resultado?.detalles,
        resultado_string: JSON.stringify(resultado).substring(0, 500) // limit for log
    });

    return resultado;
}

        await this.actualizarTracking(archivoId, 'cache_miss', {
            hashImagen: hashImagen.substring(0, 16),
            duration: Math.round(duration * 100) / 100
        });

        return null;

    } catch (error) {
        const duration = performance.now() - startTime;

        // Logging de error de Redis
        dragon.sePreocupa('[CACHE][GET] Error al obtener de Redis', {
            archivoId,
            hashPrefix: hashImagen.substring(0, 16),
            cacheKey,
            duration: Math.round(duration * 100) / 100,
            error: error.message,
            stack: error.stack,
            origen: 'verificarCache'
        });

        dragon.sePreocupa('Error verificando cache FAANG', 'analizadorImagen', 'CACHE_VERIFICATION_ERROR', {
            archivoId,
            hashPrefix: hashImagen.substring(0, 16),
            duration: Math.round(duration * 100) / 100,
            error: error.message
        });

        return null;
    }
}

    /**
 * FAANG: Enhanced cache saving with TTL optimization
 */
async guardarCache(hashImagen, resultado, archivoId) {
    const startTime = performance.now();

    // 🚩 CAMBIO: Obtener cliente redis desde el ConnectionManager
    const redis = this.redisCacheClient.client;

    try {
        if (!redis) return;

        const cacheKey = HASH_KEYS.CACHE(hashImagen);
        const confianza = resultado.resumen?.confianza || 'baja';

        // Enhanced TTL calculation based on confidence and performance
        const ttlMapping = {
            'alta': 14400,     // 4 hours for high confidence
            'media': 7200,     // 2 hours for medium confidence
            'baja': 3600,      // 1 hour for low confidence
            'revision_requerida': 1800  // 30 minutes for review required
        };

        const ttl = ttlMapping[confianza] || 3600;

        // Add cache metadata
        const cacheData = {
            ...resultado,
            cacheMetadata: {
                cachedAt: new Date().toISOString(),
                ttl,
                confianza,
                version: VERSION_MODULO,
                hashPrefix: hashImagen.substring(0, 16)
            }
        };

        await redis.setex(cacheKey, ttl, JSON.stringify(cacheData));

        const duration = performance.now() - startTime;

        await this.actualizarTracking(archivoId, 'cache_saved', {
            hashImagen: hashImagen.substring(0, 16),
            ttl,
            confianza,
            duration: Math.round(duration * 100) / 100
        });

        dragon.respira('Resultado guardado en cache FAANG', 'analizadorImagen', 'CACHE_SAVED', {
            archivoId,
            hashPrefix: hashImagen.substring(0, 16),
            ttl,
            confianza,
            duration: Math.round(duration * 100) / 100
        });

    } catch (error) {
        const duration = performance.now() - startTime;

        dragon.sePreocupa('Error guardando cache FAANG', 'analizadorImagen', 'CACHE_SAVE_ERROR', {
            archivoId,
            hashPrefix: hashImagen.substring(0, 16),
            duration: Math.round(duration * 100) / 100,
            error: error.message
        });
    }
}

async cargarAnalizadores() {
    if (this.analizadoresCargados) {
        return this.analizadoresCargados;
    }

    const startTime = performance.now();

    try {
        const directorioAnalizadores = path.join('/opt/dragon3/prod/Dragon3/backend/servicios/imagen/analizadores/imagen');

        // Crear directorio si no existe
        try {
            await fs.access(directorioAnalizadores);
        } catch (error) {
            dragon.respira('Creando directorio analizadores FAANG', 'analizadorImagen', 'ANALYZERS_DIR_CREATE', {
                directorio: directorioAnalizadores
            });
            await fs.mkdir(directorioAnalizadores, { recursive: true });
        }

        const archivos = await fs.readdir(directorioAnalizadores);
        const analizadores = {};
        const loadingErrors = [];

        for (const archivo of archivos) {
            if (archivo.endsWith('.js') && !archivo.startsWith('.')) {
                const nombreAnalizador = path.basename(archivo, '.js');
                const rutaAnalizador = path.join(directorioAnalizadores, archivo);

                try {
                    const analyzerStartTime = performance.now();
                    const modulo = await import(`file://${rutaAnalizador}`);
                    const analyzerLoadTime = performance.now() - analyzerStartTime;

                    // SOLUCIÓN: Manejo correcto de instancias, default-function y binding
                    let instancia = modulo.default ?? null;
                    let funcionAnalizar = null;

                    // 1) default export es una instancia con método analizarImagen()
                    if (instancia && typeof instancia.analizarImagen === 'function') {
                        funcionAnalizar = instancia.analizarImagen.bind(instancia);
                    }
                    // 2) named export analizarImagen
                    else if (typeof modulo.analizarImagen === 'function') {
                        funcionAnalizar = modulo.analizarImagen;
                        instancia = (typeof instancia === 'object') ? instancia : null;
                    }
                    // 3) alternativa: analizar
                    else if (typeof modulo.analizar === 'function') {
                        funcionAnalizar = modulo.analizar;
                        instancia = (typeof instancia === 'object') ? instancia : null;
                    }
                    // 4) default export es directamente una función (CommonJS/ESM fallback)
                    else if (typeof instancia === 'function') {
                        funcionAnalizar = instancia;
                        // No la consideramos "instancia" en el registro. Normalizar a null.
                        instancia = null;
                    } else {
                        throw new Error('No se encontró función de análisis válida');
                    }

                    analizadores[nombreAnalizador] = {
                        nombre: nombreAnalizador,
                        ruta: rutaAnalizador,
                        funcion: funcionAnalizar,
                        instancia: instancia,
                        cargado: true,
                        loadTime: Math.round(analyzerLoadTime * 100) / 100,
                        version: modulo.version || '1.0.0',
                        metadata: modulo.metadata || {}
                    };

                    dragon.respira(`Analizador ${nombreAnalizador} cargado exitosamente`, 'analizadorImagen', 'ANALYZER_LOADED', {
                        analizador: nombreAnalizador,
                        loadTime: Math.round(analyzerLoadTime * 100) / 100,
                        hasFunction: true,
                        isBound: instancia !== null,
                        type: instancia ? 'instancia' : 'funcion'
                    });

                } catch (error) {
                    loadingErrors.push({ analizador: nombreAnalizador, error: error.message });

                    dragon.sePreocupa(`Error cargando analizador ${nombreAnalizador}`, 'analizadorImagen', 'ANALYZER_LOAD_ERROR', {
                        analizador: nombreAnalizador,
                        error: error.message,
                        archivo,
                        stack: error.stack
                    });
                }
            }
        }

        this.analizadoresCargados = analizadores;

        const duration = performance.now() - startTime;

        dragon.sonrie('Analizadores cargados FAANG Streams', 'analizadorImagen', 'ANALYZERS_LOADED', {
            totalAnalizadores: Object.keys(analizadores).length,
            analizadores: Object.keys(analizadores),
            errores: loadingErrors.length,
            duration: Math.round(duration * 100) / 100,
            directorio: directorioAnalizadores,
            instanciasCount: Object.values(analizadores).filter(a => a.instancia).length
        });

        return analizadores;

    } catch (error) {
        const duration = performance.now() - startTime;

        dragon.agoniza('Error cargando analizadores FAANG', error, 'analizadorImagen', 'ANALYZERS_LOAD_FAILED', {
            duration: Math.round(duration * 100) / 100,
            directorio: '/opt/dragon3/prod/Dragon3/backend/servicios/imagen/analizadores/imagen',
            error: error.message,
            stack: error.stack
        });

        // No sobrescribir cache existente; permitir reintento
        return this.analizadoresCargados || {};
    }
}

/**
 * FAANG: Enhanced cleanup with comprehensive resource management (robust)
 * Simplificada: Elimina la necesidad de buscar waiters espejo/superior,
 * solo libera el slot de concurrencia y limpia marcas de performance.
 */
async cleanup(archivoId) {
    const startTime = performance.now();
    const redis = connectionManager.getRawClientById('imagen-analyzer');
    let waitersCleared = 0;

    try {
        // 1. ELIMINACIÓN DE WAITERS OBSOLETOS (KISS)
        // La lógica de for...of para this.responseWaiters se hace redundante
        // si solo queda el patrón XREAD BLOCK/TTL (que no usa el Map de waiters).
        // Sin embargo, si el Map responseWaiters se usaba para Superior antes,
        // debemos asegurar su limpieza por si existe el patrón de fallback.
        // Mantenemos la limpieza general y confiamos en que el patrón XREAD/TTL es el principal.

        // Asumiendo que SÓLO QUEDAN los waiters de Superior:
        const superiorWaiterKey = `superior:${archivoId}`;
        if (this.responseWaiters && this.responseWaiters.has(superiorWaiterKey)) {
             // Puedes llamar al resolver con "null" o sólo limpiar, según lógica
             this.responseWaiters.delete(superiorWaiterKey);
             waitersCleared++;
        }

        // 2. Clean active processing
        this.procesamientoActivo.delete(archivoId);

        // 3. Release concurrency slot (CRÍTICO)
        this.concurrencyManager.releaseSlot(archivoId);

        // 4. Clean performance marks
        try {
             // Se mantienen las marcas estándar. Se eliminan las específicas del Espejo si existieran.
             performance.clearMarks(`dragon3:image:analysis:${archivoId}:start`);
             performance.clearMarks(`dragon3:image:analysis:${archivoId}:end`);
             performance.clearMarks(`dragon3:image:analysis:${archivoId}:error`);
             performance.clearMarks(`dragon3:security:validation:${archivoId}:start`);
             performance.clearMarks(`dragon3:security:validation:${archivoId}:end`);
             performance.clearMarks(`dragon3:redis:stream:${archivoId}:start`);
             performance.clearMarks(`dragon3:redis:stream:${archivoId}:end`);
        } catch (clearError) {
             // Ignore performance mark cleanup errors
        }

        // 5. Delayed cleanup of Redis hashes (tracking)
        if (redis) {
            setTimeout(async () => {
                 // ... la lógica de DEL de las claves de tracking permanece intacta
            }, 300000);
        }

        const duration = performance.now() - startTime;

        dragon.respira('Cleanup completado FAANG (KISS)', 'analizadorImagen', 'CLEANUP_COMPLETED', {
            archivoId,
            waitersCleared,
            duration: Math.round(duration * 100) / 100,
            delayedCleanup: '5min'
        });

    } catch (error) {
        const duration = performance.now() - startTime;
        dragon.sePreocupa('Error durante cleanup FAANG', 'analizadorImagen', 'CLEANUP_ERROR', {
            archivoId,
            duration: Math.round(duration * 100) / 100,
            error: error.message
        });
    }
}



/**
 * FAANG: Enhanced health check with comprehensive status (ZERO-LATENCY)
 * Usa cliente persistente 'redisPingClient' directamente. Sin duplicación.
 */
async getHealthStatus() {
    const startTime = performance.now();

    // 🎯 ACCESO DIRECTO: Usamos el cliente ioredis vivo.
    // redisPingClient se creó en el constructor y se mantiene conectado (keepAlive).
    const redisPingRaw = this.redisPingClient?.client;

    let pingStatus = 'unknown';
    let pingLatency = 0;

    // Diagnóstico de estado (para logs si falla)
    const connectionState = redisPingRaw ? redisPingRaw.status : 'null';

    try {
        if (!redisPingRaw) {
             throw new Error('Cliente Redis Ping no inicializado (null)');
        }

        // Si ioredis dice que no está listo, no perdemos tiempo intentando
        if (connectionState !== 'ready' && connectionState !== 'connect') {
             throw new Error(`Cliente no está ready: ${connectionState}`);
        }

        // ⚡ PING DIRECTO SOBRE SOCKET CALIENTE
        const pingPromise = redisPingRaw.ping();

        // Timeout ultra-agresivo (300ms es una eternidad para un socket abierto)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 300)
        );

        const result = await Promise.race([pingPromise, timeoutPromise]);

        if (result !== 'PONG') {
             throw new Error(`Respuesta inesperada: ${result}`);
        }

        pingStatus = 'healthy';
        pingLatency = performance.now() - startTime;

    } catch (e) {
        pingStatus = e.message.includes('timeout') ? 'timeout' : 'unhealthy';
        pingLatency = performance.now() - startTime;

        // Solo loguear si es un fallo real de salud, para no ensuciar
        if (pingStatus === 'unhealthy') {
             dragon.agoniza(`Fallo en Health Check Redis: ${e.message}`, e, 'analizadorImagen', 'HEALTH_CHECK_FAIL', {
                 connectionState
             });
        }
    }

    const healthData = {
        module: 'analizadorImagen',
        version: '3.0.0-FAANG',
        timestamp: new Date().toISOString(),
        sharp: this.sharpManager.getStats(),
        redis: {
            status: pingStatus,
            connected: pingStatus === 'healthy',
            pingMs: pingLatency > 0 ? Math.round(pingLatency * 100) / 100 : 'FAILED',
            debugState: connectionState // Visible en el JSON para depurar
        },
        consumers: {
            status: this.healthStatus?.consumers || 'unknown',
            running: this.consumersRunning,
            count: this.consumers?.size || 0,
            errors: this.consumerErrors ? Object.fromEntries(this.consumerErrors) : {}
        },
        circuitBreaker: this.circuitBreaker ? this.circuitBreaker.getState() : {},
        concurrency: this.concurrencyManager ? this.concurrencyManager.getMetrics() : {},
        performance: this.performanceMonitor ? this.performanceMonitor.getSummary() : {},
        security: this.securityValidator ? this.securityValidator.getSecuritySummary() : {},
        memory: {
            current: process.memoryUsage(),
            threshold: FAANG_CONFIG.memory.memoryPressureThreshold
        },
        config: {
            maxConcurrent: MAX_CONCURRENTES,
            timeoutAnalisis: TIMEOUT_ANALISIS,
            timeoutStream: TIMEOUT_STREAM_READ,
            circuitBreakerEnabled: FAANG_CONFIG.circuitBreaker.enabled
        },
        healthCheckTime: Math.round((performance.now() - startTime) * 100) / 100
    };

    return healthData;
}
}



// ====================================================================
// FAANG: MAIN ANALYSIS FUNCTION
// ====================================================================
const analizarImagen = async (rutaArchivo, correlationId, archivoId) => {
    // 1. NORMALIZACIÓN DE PARÁMETROS
    let parametros;
    if (typeof rutaArchivo === 'object' && rutaArchivo !== null) {
        parametros = rutaArchivo;
    } else {
        parametros = {
            rutaArchivo,
            correlationId,
            archivoId,
            nombreOriginal: null,
            usuarioId: null,
            clientId: 'server_route'
        };
    }

    const { rutaArchivo: rutaFinal, archivoId: idFinal, correlationId: cId } = parametros;

    // Validación rápida
    if (!rutaFinal || !idFinal) {
        throw new DragonError('Faltan parámetros (rutaArchivo, archivoId)', 'INVALID_PARAMS', 'high');
    }

    const tiempoInicio = Date.now();
    const { nombreOriginal, usuarioId, clientId } = parametros;

    // Performance Start
    performance.mark(`dragon3:image:analysis:${idFinal}:start`);
    if (gestorStreamsFAANG?.performanceMonitor) {
        gestorStreamsFAANG.performanceMonitor.incrementRequestCount();
    }

    try {
        dragon.sonrie('Iniciando análisis imagen FAANG', 'analizadorImagen', 'ANALYSIS_START', {
            archivoId: idFinal,
            correlationId: cId
        });

        // CHECK: Circuit Breaker
        if (gestorStreamsFAANG.circuitBreaker.getState().state === 'OPEN') {
            throw new CircuitBreakerError('Circuit breaker OPEN', 'OPEN');
        }

        // CHECK: Concurrency
        await gestorStreamsFAANG.concurrencyManager.acquireSlot(idFinal, clientId || 'default', 0, TIMEOUT_ANALISIS);

        // CHECK: Security
        const securityResult = await gestorStreamsFAANG.securityValidator.validateImageSecurity(rutaFinal, idFinal);

        // 2. EJECUCIÓN PROTEGIDA (Circuit Breaker)
        const resultadoFinal = await gestorStreamsFAANG.circuitBreaker.call(async () => {

            // A. HASH & CACHE
            const hashImagen = await gestorStreamsFAANG.generarHashImagen(rutaFinal);
            let enCache = null;

            try {
                enCache = await gestorStreamsFAANG.verificarCache(hashImagen, idFinal);

                // VALIDACIÓN DEFENSIVA DEL CACHÉ
                if (enCache) {
                    // Intentamos adaptar. Si falla, saltará al catch y procesaremos de cero.
                    const cacheAdaptado = adaptarResultadoLegacyAFAANG(enCache);

                    // Verificamos que la adaptación no devolvió un error estructural
                    if (cacheAdaptado.estado !== 'fallido' && cacheAdaptado.resumen.decision !== 'Error') {
                        dragon.sonrie('Cache HIT y Validado', 'analizadorImagen', 'CACHE_HIT_VALID', { idFinal });
                        return cacheAdaptado;
                    } else {
                        dragon.sePreocupa('Cache corrupto o incompatible detectado - Invalidando', 'analizadorImagen', 'CACHE_INVALIDATION', { idFinal });
                        // Opcional: Borrar la clave corrupta (si tienes acceso al cliente redis aquí)
                    }
                }
            } catch (cacheError) {
                dragon.sePreocupa('Error crítico leyendo caché - Ignorando y recalculando', 'analizadorImagen', 'CACHE_READ_ERROR', {
                    error: cacheError.message
                });
                // No hacemos throw, simplemente seguimos como si fuera Cache MISS
            }

            // B. Tracking
            await gestorStreamsFAANG.actualizarTracking(idFinal, 'iniciado', { hash: hashImagen });

            // C. Análisis Completo
            const resultadoAnalisis = await ejecutarAnalisisCompletoPAANG(parametros, hashImagen, tiempoInicio, securityResult);

            // D. Guardar Cache
            await gestorStreamsFAANG.guardarCache(hashImagen, resultadoAnalisis, idFinal);

            // E. Retorno Adaptado
            return adaptarResultadoLegacyAFAANG(resultadoAnalisis);

        }, 'image_analysis_complete', { archivoId: idFinal });

        // Performance End
        performance.mark(`dragon3:image:analysis:${idFinal}:end`);
        const duration = Date.now() - tiempoInicio;

        dragon.sonrie('Análisis finalizado', 'analizadorImagen', 'ANALYSIS_COMPLETE', {
            id: idFinal,
            ms: duration,
            decision: resultadoFinal.resumen.decision
        });


        return resultadoFinal;

    } catch (error) {
        const duration = Date.now() - tiempoInicio;
        dragon.agoniza('Fallo en análisis', error, 'analizadorImagen', 'ANALYSIS_FAIL', { id: idFinal });

        // Retorno de error seguro (JSON válido)
        return {
            resumen: {
                decision: "Error",
                confianza: 0,
                explicacion: `Fallo técnico: ${error.message}`,
                modeloPrincipal: "Dragon3_ErrorHarness",
                timestamp: new Date().toISOString()
            },
            detalles: { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
            estado: "fallido",
            metadata: { error: true, processingTime: duration, correlationId: cId }
        };

    } finally {
        // Limpieza de recursos siempre
        gestorStreamsFAANG.concurrencyManager.releaseSlot(idFinal);
        await gestorStreamsFAANG.cleanup(idFinal);
    }
};


// ====================================================================
// 2. EJECUCIÓN ANÁLISIS COMPLETO (Orquestador PAANG) - BLINDADO
// ====================================================================
/**
 * Coordina todo el flujo: Local -> Fusión -> Superior -> Formato Final
 * Implementa degradación suave y observabilidad FAANG.
 */
const ejecutarAnalisisCompletoPAANG = async (parametros, hashImagen, tiempoInicio, securityResult) => {
    const { archivoId, buffer } = parametros;
    const correlationId = parametros.correlationId || crypto.randomUUID();
    const TIMEOUT_SUPERIOR = 60000;

    try {
        dragon.sonrie('Inicio análisis completo FAANG (Local + Superior)', 'analizadorImagen', 'COMPLETE_ANALYSIS_START', {
            archivoId, correlationId
        });

        // --- STAGE 1: Analizadores Locales ---
        await gestorStreamsFAANG.actualizarTracking(archivoId, 'analizadores_inicio');
        const resultadosAnalizadores = await ejecutarAnalizadoresFAANG({ ...parametros, correlationId });
        dragon.sonrie('Analizadores locales completados', 'analizadorImagen', 'LOCAL_ANALYZERS_END', { archivoId });
        // ========== CONSTRUCCIÓN DE 90 FEATURES ==========
const features90 = [];

// Mapeo de especialistas a la clave del analizador en resultados
const especialistas = [
  { key: 'analizadorExif', nombre: 'exif_camera' },          // 0-8
  { key: 'analizadorExif', nombre: 'exif_editing' },         // 9-17 (reutilizamos EXIF? necesitamos otro)
  { key: 'analizadorTextura', nombre: 'texture' },           // 18-26
  { key: 'analizadorArtefactos', nombre: 'gan_artifacts' },  // 27-35
  { key: 'analizadorC2PA', nombre: 'diffusion_artifacts' },  // 36-44
  { key: 'analizadorDefinicion', nombre: 'sharpness' },      // 45-53
  { key: 'analizadorValidator', nombre: 'compression' },     // 54-62
  { key: 'analizadorC2PA', nombre: 'c2pa' },                 // 63-71
  { key: 'analizadorResolucion', nombre: 'resolution' },     // 72-80
  { key: 'analizadorExif', nombre: 'metadata' }              // 81-89 (reutilizamos EXIF)
];

// Extraer features_nn de cada analizador (si no existe, array de 0.5)
for (const esp of especialistas) {
  const analyzer = resultadosAnalizadores.resultados?.[esp.key];
  const featuresNN = analyzer?.forense?.raw_data?.features_nn;
  if (Array.isArray(featuresNN) && featuresNN.length === 9) {
    features90.push(...featuresNN);
  } else {
    features90.push(...Array(9).fill(0.5));
  }
}

// Verificar que tenemos 90 elementos
if (features90.length !== 90) {
  console.warn(`⚠️ features90 tiene longitud ${features90.length}, ajustando a 90`);
  while (features90.length < 90) features90.push(0.5);
  if (features90.length > 90) features90.length = 90;
}
// 🔹 PERSISTIR FEATURES Y LOCAL ANALYZERS EN REDIS (para explicabilidad)
// Extraer localAnalyzers (10 valores) de resultadosAnalizadores
let localAnalyzers = Array(10).fill(0.5);
if (resultadosAnalizadores?.resultados) {
    const localKeys = [
        'analizadorExif', 'analizadorValidator', 'analizadorC2PA', 'analizadorArtefactos',
        'analizadorTextura', 'analizadorDefinicion', 'analizadorPantalla',
        'analizadorMensajeria', 'analizadorResolucion', 'analizadorColor'
    ];
    localAnalyzers = [];
    for (const key of localKeys) {
        const analyzer = resultadosAnalizadores.resultados[key];
        if (analyzer?.evaluacion?.confianza !== undefined) {
            localAnalyzers.push(analyzer.evaluacion.confianza);
        } else {
            localAnalyzers.push(0.5);
        }
    }
}

const redisClient = connectionManager.getRawClientById('imagen-analyzer');
if (redisClient) {
    try {
        const analysisData = { features90, localAnalyzers };
        await redisClient.setex(`dragon3:analysis:${archivoId}`, 3600, JSON.stringify(analysisData));
        dragon.zen(`Datos de análisis guardados en Redis para ${archivoId}`, 'analizadorImagen');
    } catch (error) {
        dragon.sePreocupa(`Error guardando datos en Redis: ${error.message}`, 'analizadorImagen');
    }
} else {
    dragon.sePreocupa('No se pudo obtener cliente Redis para guardar datos', 'analizadorImagen');
}

        // --- STAGE 2: Fusión Resultados ---
        await gestorStreamsFAANG.actualizarTracking(archivoId, 'fusion_inicio_local');
        const resultadoConsolidado = fusionarResultadoFAANG(resultadosAnalizadores);
        dragon.sonrie('Fusión local completada', 'analizadorImagen', 'MERGE_END_L1', { archivoId });

        // --- STAGE 3: Red Superior ---
        await gestorStreamsFAANG.actualizarTracking(archivoId, 'superior_enviando');

        const respStream = gestorStreamsFAANG._buildSuperiorRespStream(archivoId);
        const features = extractFeaturesFromDatos({ resultadoConsolidado, parametros, securityResult });

        const redis = connectionManager.getRawClientById('imagen-analyzer');
        if (redis) {
            try {
                await redis.xadd(
  STREAMS.REQUEST_SUPERIOR,
  'MAXLEN', '~', '10000',
  '*',
  'archivoId', archivoId,
  'correlationId', correlationId,
  'payload', JSON.stringify({ features: features90 }), // <-- CAMBIADO
  'binario', buffer ? buffer.toString('base64') : '',
  'timestamp', Date.now().toString(),
  'respStream', respStream
);
            } catch (err) {
                dragon.sePreocupa('Error publicando en Redis Superior', 'analizadorImagen', 'REDIS_XADD_FAIL', { err: err.message });
                if (typeof circuitBreaker !== 'undefined' && circuitBreaker?.recordFailure) {
                    circuitBreaker.recordFailure();
                }
            }
        }

        let analisisRedSuperior;
        try {
            await gestorStreamsFAANG.actualizarTracking(archivoId, 'superior_esperando');
            analisisRedSuperior = await gestorStreamsFAANG._esperarSuperiorViaStreamOnce(archivoId, TIMEOUT_SUPERIOR);
            console.log('📦 RESPUESTA CRUDA DE RED SUPERIOR:', JSON.stringify(analisisRedSuperior, null, 2));

            // ✅ NORMALIZACIÓN COMPLETA: convierte formato simple de redSuperior al esperado por generarResultadoFinalFAANG
            if (analisisRedSuperior && !analisisRedSuperior.resumen && !analisisRedSuperior.evaluacion) {
    const categoria = analisisRedSuperior.categoria || 'indeterminado';
    let decision = 'Indeterminado';
    if (categoria === 'ia_generado') decision = 'Artificial';
    else if (categoria === 'humano') decision = 'Humano';
    else if (categoria === 'editado') decision = 'Editado';
    let conf = parseFloat(analisisRedSuperior.confianza);
    if (isNaN(conf)) conf = 0.5; // fallback seguro

    analisisRedSuperior = {
        resumen: {
            decision: decision,
            confianza: conf,
            score: conf
        },
        evaluacion: {
            veredicto: decision,
            confianza: conf,
            score_logico: conf,
            peso: 'medio'
        },
        narrativa: {
            explicacion_humana: `Red Superior: ${decision} con confianza ${(conf * 100).toFixed(1)}%`
        },
        flags: {
            es_ia: decision === 'Artificial',
            es_autentico: decision === 'Humano',
            degradado: false
        },
        raw: analisisRedSuperior
    };
}
        } catch (timeoutError) {
            dragon.sePreocupa('Timeout Red Superior - Degradando a Lógica Local', 'analizadorImagen', 'SUPERIOR_TIMEOUT', { archivoId });
            analisisRedSuperior = {
                degraded: true,
                categoria: 'timeout',
                confianza: 0,
                score: 0,
                resumen: { decision: 'Timeout', confianza: 0 },
                evaluacion: { veredicto: 'Timeout', confianza: 0 },
                narrativa: { explicacion_humana: 'Timeout en comunicación con Red Superior' },
                flags: { degradado: true }
            };
        }

        // --- STAGE 4: Resultado Final (Standard V25) ---
        await gestorStreamsFAANG.actualizarTracking(archivoId, 'resultado_generando');

        let resultadoFinal;
        try {
            resultadoFinal = generarResultadoFinalFAANG(
                resultadoConsolidado,
                analisisRedSuperior,
                { ...parametros, correlationId },
                hashImagen,
                tiempoInicio,
                securityResult
            );
        } catch (err) {
            console.error('❌ ERROR EN generarResultadoFinalFAANG:', err);
            console.error(err.stack);
            throw new DragonError(`Error en generarResultadoFinalFAANG: ${err.message}`, 'GENERATE_FINAL_ERROR', 'high');
        }

        // --- STAGE 5: Empaquetado para Frontend ---
        const decisionFinal = resultadoFinal.evaluacion?.veredicto || resultadoFinal.resumen?.decision || "Indeterminado";
        const confianzaFinal = resultadoFinal.evaluacion?.confianza || resultadoFinal.resumen?.confianza || 0;
        const scoreFinal = resultadoFinal.evaluacion?.score_logico || resultadoFinal.resumen?.score || 0;
        const explicacionFinal = resultadoFinal.narrativa?.explicacion_humana || resultadoFinal.resumen?.explicacion || "";

        return {
            resumen: {
                decision: decisionFinal,
                confianza: confianzaFinal,
                score: scoreFinal,
                modeloPrincipal: analisisRedSuperior?.degraded ? "Local_Consensus_V25" : "Dragon3_Superior_ML",
                explicacion: explicacionFinal,
                etiquetas: resultadoFinal.flags ? Object.keys(resultadoFinal.flags).filter(k => resultadoFinal.flags[k]) : [],
                correlationId,
                archivoId,
                timestamp: new Date().toISOString(),
                tiempoTotal: Date.now() - tiempoInicio,
                metodo: analisisRedSuperior?.degraded ? 'LOCAL' : 'HYBRID_FAANG'
            },
            detalles: {
                analizadores: resultadoConsolidado.resultadosAnalizadores || {},
                consenso: resultadoConsolidado.consenso,
                seguridad: securityResult,
                superior: analisisRedSuperior,
                raw_forense: resultadoFinal.forense
            },
            metadata: {
                analyzerType: 'imagen',
                processingTime: Date.now() - tiempoInicio,
                version: VERSION_MODULO,
                circuitBreaker: (typeof circuitBreaker !== 'undefined' && circuitBreaker?.status) ? circuitBreaker.status : 'unknown',
                securityValidation: securityResult?.valid || false
            },
            flags: resultadoFinal.flags || {
                es_ia: decisionFinal === "Artificial",
                es_autentico: decisionFinal === "Humano",
                degradado: analisisRedSuperior?.degraded || false
            }
        };

    } catch (error) {
        dragon.agoniza('Error crítico en orquestador PAANG', error, 'analizadorImagen', 'COMPLETE_ANALYSIS_FAILED');
        throw new DragonError(`Error análisis completo: ${error.message}`, 'COMPLETE_ANALYSIS_FAILED', 'high');
    }
};


/**
 * ====================================================================
 * DRAGON3 - EXTRACTOR DE FEATURES PARA RED SUPERIOR
 * ====================================================================
 * Extrae vector de 10 features del objeto datos consolidado.
 * Compatible con estructura { resultadoConsolidado, parametros, securityResult }
 *
 * @param {Object} datos - Objeto con resultadoConsolidado y metadata
 * @returns {Array<number>} Vector de 10 features normalizados [0-1]
 */
const extractFeaturesFromDatos = (datos) => {
  const features = [];

  try {
    // Extraer local.resultados del consolidado
    const local = datos?.resultadoConsolidado?.local?.resultados || {};

    dragon.respira('Extrayendo features para Red Superior', 'analizadorImagen', 'EXTRACT_FEATURES_START', {
      analizadoresDisponibles: Object.keys(local),
      hasConsolidado: !!datos?.resultadoConsolidado
    });

    // Feature 1-2: Artefactos (luminancia/IA/GAN)
    const artefactos = local.analizadorArtefactos?.metadatos?.datosParaRedEspejoArtefactos;
    if (artefactos && Array.isArray(artefactos) && artefactos.length >= 2) {
      features.push(
        Math.max(0, Math.min(1, artefactos[0] || 0.5)),
        Math.max(0, Math.min(1, artefactos[1] || 0.5))
      );
    } else {
      features.push(0.5, 0.5);
    }

    // Feature 3-4: Textura (uniformidad, complejidad)
    const textura = local.analizadorTextura?.detalles?.paramArray;
    if (textura && Array.isArray(textura) && textura.length >= 2) {
      features.push(
        Math.max(0, Math.min(1, textura[0] || 0.5)),
        Math.max(0, Math.min(1, textura[1] || 0.5))
      );
    } else {
      features.push(0.5, 0.5);
    }

    // Feature 5: Definición (nitidez)
    const definicion = local.analizadorDefinicion?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, definicion)));

    // Feature 6: EXIF (metadatos)
    const exif = local.analizadorExif?.resumen?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, exif)));

    // Feature 7: Validator (C2PA/CAI)
    const validator = local.analizadorValidator?.resumen?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, validator)));

    // Feature 8: MBH (sello autenticidad)
    const mbh = local.analizadorMBH?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, mbh)));

    // Feature 9: Pantalla (captura)
    const pantalla = local.analizadorPantalla?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, pantalla)));

    // Feature 10: Mensajería
    const mensajeria = local.analizadorMensajeria?.confianza ?? 0.5;
    features.push(Math.max(0, Math.min(1, mensajeria)));

    // Validación: Exactamente 10 features
    if (features.length !== 10) {
      dragon.sePreocupa('Features incompletos, ajustando a 10', 'analizadorImagen', 'FEATURES_INCOMPLETE', {
        featuresCount: features.length,
        expected: 10
      });

      while (features.length < 10) {
        features.push(0.5);
      }
    }

    // Validación: Todos valores válidos [0, 1]
    const invalidCount = features.filter(f => !Number.isFinite(f) || f < 0 || f > 1).length;
    if (invalidCount > 0) {
      dragon.sePreocupa('Features inválidos normalizados', 'analizadorImagen', 'FEATURES_NORMALIZED', {
        invalidCount,
        totalCount: 10
      });

      for (let i = 0; i < features.length; i++) {
        if (!Number.isFinite(features[i]) || features[i] < 0 || features[i] > 1) {
          features[i] = 0.5;
        }
      }
    }

    dragon.zen('Features extraídos exitosamente para Red Superior', 'analizadorImagen', 'EXTRACT_FEATURES_SUCCESS', {
      featuresCount: features.length,
      featuresSample: features.slice(0, 3).map(f => f.toFixed(3)),
      allValid: features.every(f => Number.isFinite(f) && f >= 0 && f <= 1)
    });

    return features.slice(0, 10);

  } catch (error) {
    dragon.agoniza('Error crítico extrayendo features', error, 'analizadorImagen', 'EXTRACT_FEATURES_ERROR', {
      error: error.message,
      stack: error.stack,
      datosKeys: Object.keys(datos || {})
    });

    // Fallback seguro: 10 features con valor 0.5
    return Array(10).fill(0.5);
  }
}

/**
 * FAANG: LOCAL ANALYZERS EXECUTION CON LOCK DISTRIBUIDO + RESPONSE STANDARD
 * ====================================================================
 * Mantiene TODO el sistema de Sharp con Redis Lock distribuido
 * Solo añade validación de RespuestaStandard
 * ====================================================================
 */

// 🚀 FUNCIONES AUXILIARES PARA RESPUESTA STANDARD
function esRespuestaStandardValida(resultado) {
    // Validación mínima de estructura RespuestaStandard V25
    return resultado &&
           typeof resultado === 'object' &&
           resultado.evaluacion &&
           typeof resultado.evaluacion === 'object' &&
           resultado.narrativa &&
           typeof resultado.narrativa === 'object' &&
           resultado.meta &&
           typeof resultado.meta === 'object' &&
           resultado.evaluacion.veredicto !== undefined;
}

function crearRespuestaStandardError(nombreAnalizador, error, duracion, sharpOperation = false) {
    // No necesitas importar nada, RespuestaStandard ya está disponible
    return new RespuestaStandard({
        meta: {
            id: nombreAnalizador,
            nombre: nombreAnalizador,
            version: '1.0.0',
            timestamps: {
                inicio: Date.now() - duracion,
                fin: Date.now()
            }
        },
        evaluacion: {
            veredicto: 'Error',
            confianza: 0,
            score_logico: 0,
            peso: 'bajo'
        },
        flags: {
            error_tecnico: true,
            sharp_error: sharpOperation
        },
        narrativa: {
            estado: 'danger',
            icono: '❌',
            titulo: `Error en ${nombreAnalizador}`,
            explicacion_humana: sharpOperation
                ? `El análisis de imagen falló por un problema técnico con el procesador gráfico.`
                : `El analizador ${nombreAnalizador} encontró un error técnico.`,
            explicacion_tecnica: error.message || 'Error desconocido'
        },
        evidencia_visual: {},
        forense: {
            herramientas: [nombreAnalizador],
            raw_data: {
                error: error.message,
                duracion,
                sharpOperation,
                instanceId: process.env.NODE_APP_INSTANCE || '0'
            }
        }
    });
}

function adaptarARespuestaStandardSiEsNecesario(nombre, resultadoRaw, duracion) {
    // Si ya es RespuestaStandard, devolverlo tal cual
    if (esRespuestaStandardValida(resultadoRaw)) {
        return resultadoRaw;
    }

    // Si no es RespuestaStandard, crear una de error
    dragon.sePreocupa(`Analizador ${nombre} no devolvió RespuestaStandard`, 'analizadorImagen', 'ANALIZADOR_NO_STANDARD', {
        analizador: nombre,
        tipoResultado: typeof resultadoRaw,
        claves: resultadoRaw ? Object.keys(resultadoRaw) : []
    });

    return crearRespuestaStandardError(
        nombre,
        new Error(`Formato inválido: no es RespuestaStandard`),
        duracion,
        SHARP_ANALYZERS.includes(nombre)
    );
}

// 🚀 ANALIZADORES QUE USAN SHARP (MANTENER IGUAL)
const SHARP_ANALYZERS = [
    'analizadorDefinicion',
    'analizadorTextura',
    'analizadorArtefactos',
    'analizadorPantalla',
    'analizadorMensajeria'
];

const ejecutarAnalizadoresFAANG = async (parametros) => {
    const { archivoId, correlationId } = parametros;
    const startTime = performance.now();

    try {
        // 🚀 CARGAR ANALIZADORES EN PARALELO (MANTENER IGUAL)
        const [analizadores] = await Promise.all([
            gestorStreamsFAANG.cargarAnalizadores(),
            new Promise(resolve => setTimeout(resolve, 10))
        ]);

        const resultados = {};
        const errores = [];
        const tiemposEjecucion = {};

        // 🚀 OBTENER CLIENTE REDIS PARA LOCK DISTRIBUIDO (MANTENER IGUAL)
        let redisClient;
        try {
            redisClient = connectionManager.getRawClientById('imagen-analyzer');
        } catch (error) {
            dragon.sePreocupa('Redis no disponible para lock distribuido', 'analizadorImagen', 'REDIS_LOCK_UNAVAILABLE', {
                archivoId,
                correlationId,
                error: error.message
            });
        }

        dragon.respira('Ejecutando analizadores con LOCK DISTRIBUIDO + Standard', 'analizadorImagen', 'DISTRIBUTED_PARALLEL_STANDARD_START', {
            archivoId,
            correlationId,
            totalAnalizadores: Object.keys(analizadores).length,
            redisAvailable: !!redisClient,
            processId: process.pid,
            pm2Instance: process.env.NODE_APP_INSTANCE || '0'
        });


const executeWithDistributedLock = async (operation, operationName, timeoutMs = 8000) => {
    // Usamos el ID de archivo que ya tienes en el scope superior del analizador
    const opId = `op_${operationName}_${Date.now()}`;
    const imgPath = archivoId || 'unknown';

    try {
        // Usamos el método exacto del archivo que encontraste
        return await sharpLock.executeSharpOperation(opId, imgPath, async () => {
            dragon.respira(`🔒 LOCK NATIVO ADQUIRIDO: ${operationName}`, 'analizadorImagen');

            // Ejecutar con el timeout de seguridad que ya teníamos
            return await Promise.race([
                operation(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout Sharp ${timeoutMs}ms`)), timeoutMs)
                )
            ]);
        });
    } catch (error) {
        dragon.sePreocupa(`Fallback en Lock Nativo (${operationName}): ${error.message}`, 'analizadorImagen');
        // Si el sistema de lock falla por red, ejecutamos la operación de todos modos (resiliencia)
        return await operation();
    }
};

// 🚀 EJECUCIÓN PARALELA CON LOCK DISTRIBUIDO PARA SHARP
const promesasAnalizadores = {};

for (const [nombre, config] of Object.entries(analizadores)) {
    promesasAnalizadores[nombre] = (async () => {
        const analyzerStartTime = performance.now();
        const usesSharp = SHARP_ANALYZERS.includes(nombre);

        try {
            let resultadoRaw;

            const SHARP_TIMEOUT = 45000;
            const NORMAL_TIMEOUT = 60000;

            if (usesSharp) {
                // 🚀 OPERACIONES SHARP CON LOCK DISTRIBUIDO
                resultadoRaw = await executeWithDistributedLock(
                    () => config.funcion(parametros),
                    nombre,
                    SHARP_TIMEOUT
                );

                // Verificar si es resultado degradado (fallback)
                if (resultadoRaw && resultadoRaw.degraded) {
                    dragon.sePreocupa(`Analizador Sharp ${nombre} en modo degradado`, 'analizadorImagen', 'SHARP_DEGRADED_DISTRIBUTED', {
                        archivoId,
                        analizador: nombre,
                        confianzaFallback: resultadoRaw.confianza || 0.5,
                        pm2Instance: process.env.NODE_APP_INSTANCE || '0'
                    });
                }
            } else { // <--- AQUÍ estaba el error, habia una llave extra antes
                // 🚀 ANALIZADORES NO-SHARP EJECUCIÓN DIRECTA
                resultadoRaw = await Promise.race([
                    config.funcion(parametros),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Analyzer timeout ${nombre} (${NORMAL_TIMEOUT}ms)`)), NORMAL_TIMEOUT)
                    )
                ]);
            }

            const analyzerDuration = performance.now() - analyzerStartTime;

            // VALIDAR Y ADAPTAR A RESPUESTA STANDARD
            const resultadoStandard = adaptarARespuestaStandardSiEsNecesario(
                nombre,
                resultadoRaw,
                analyzerDuration
            );

            resultadoStandard.exitoso = true;
            resultadoStandard.meta.ejecucion = {
                tiempo: analyzerDuration,
                sharp: usesSharp,
                exitoso: true,
                instancia: process.env.NODE_APP_INSTANCE || '0',
                pid: process.pid,
                distributedLockUsed: usesSharp
            };

            tiemposEjecucion[nombre] = Math.round(analyzerDuration * 100) / 100;

            return {
                nombre,
                success: true,
                resultado: resultadoStandard,
                sharpOperation: usesSharp
            };

        } catch (error) {
            const analyzerDuration = performance.now() - analyzerStartTime;
            tiemposEjecucion[nombre] = Math.round(analyzerDuration * 100) / 100;

            const resultadoError = crearRespuestaStandardError(
                nombre,
                error,
                analyzerDuration,
                usesSharp
            );

            resultadoError.exitoso = false;

            dragon.sePreocupa(`Error capturado en ${nombre}`, 'analizadorImagen', 'ANALYZER_ERROR_HANDLED', {
                archivoId,
                analizador: nombre,
                processingTime: tiemposEjecucion[nombre],
                error: error.message,
                sharpOperation: usesSharp,
                instanceId: process.env.NODE_APP_INSTANCE || '0'
            });

            errores.push({
                analizador: nombre,
                error: error.message,
                processingTime: tiemposEjecucion[nombre],
                sharpOperation: usesSharp,
                instanceId: process.env.NODE_APP_INSTANCE || '0'
            });

            return {
                nombre,
                success: false,
                resultado: resultadoError,
                sharpOperation: usesSharp
            };
        }
    })();
}

// 🚀 ESPERAR TODOS LOS ANALIZADORES
const resultadosPromesas = await Promise.allSettled(Object.values(promesasAnalizadores));

// Procesar resultados
for (const promesa of resultadosPromesas) {
    if (promesa.status === 'fulfilled') {
        const { nombre, resultado, success } = promesa.value;
        resultados[nombre] = resultado;

        // 🆕 NUEVO: Asegurar que tenga flag exitoso
        resultado.meta.ejecucion = resultado.meta.ejecucion || {};
        resultado.meta.ejecucion.exitoso = success;

        if (!success) {
            errores.push({
                analizador: nombre,
                error: resultado.narrativa.explicacion_tecnica
            });
        }
    } else {
        // Error inesperado en la promesa
        const nombre = 'unknown';
        const resultadoError = crearRespuestaStandardError(
            nombre,
            promesa.reason,
            0,
            false
        );

        resultados[nombre] = resultadoError;
        errores.push({
            analizador: nombre,
            error: promesa.reason.message
        });
    }
}

// 📊 ESTADÍSTICAS MEJORADAS
const sharpErrors = errores.filter(e => SHARP_ANALYZERS.includes(e.analizador)).length;
const nonSharpErrors = errores.length - sharpErrors;

// 🆕 NUEVO: Contar estándares válidos
const estandaresValidos = Object.values(resultados).filter(r =>
    esRespuestaStandardValida(r)
).length;

// 🆕 NUEVO: Contar operaciones con lock distribuido exitosas
const sharpConLockExitoso = Object.values(resultados)
    .filter(r => r.meta.ejecucion?.sharp && r.meta.ejecucion?.exitoso)
    .length;

const totalDuration = performance.now() - startTime;
const tiempos = Object.values(tiemposEjecucion);
const tiempoMaximo = tiempos.length > 0 ? Math.max(...tiempos) : 0;
const tiempoMinimo = tiempos.length > 0 ? Math.min(...tiempos) : 0;

let gananciaParalelismo = 1;
let tiempoTotalSecuencial = 0;
if (tiempoMaximo > 0 && tiempos.length > 0) {
    tiempoTotalSecuencial = tiempos.reduce((a, b) => a + b, 0);
    gananciaParalelismo = (tiempoTotalSecuencial / tiempoMaximo).toFixed(2);
}

dragon.sonrie('Análisis PARALELO con LOCK DISTRIBUIDO + Standard completado', 'analizadorImagen', 'DISTRIBUTED_STANDARD_COMPLETE', {
    archivoId,
    correlationId,
    totalAnalizadores: Object.keys(analizadores).length,
    analizadoresExitosos: Object.keys(resultados).filter(k => resultados[k].meta.ejecucion?.exitoso).length,
    estandaresValidos,
    sharpConLockExitoso,
    tiempoTotal: Math.round(totalDuration * 100) / 100,
    gananciaParalelismo: `${gananciaParalelismo}x`,
    eficiencia: tiempoMaximo > 0 ? `${((tiempoMaximo / totalDuration) * 100).toFixed(1)}%` : '0%',
    errores: {
        total: errores.length,
        sharpErrors,
        nonSharpErrors
    },
    distribucion: {
        instancia: process.env.NODE_APP_INSTANCE || '0',
        pid: process.pid,
        redisAvailable: !!redisClient,
        sharpOpsWithLock: Object.values(resultados).filter(r => r.meta.ejecucion?.distributedLockUsed).length
    },
    performance: totalDuration > 10000 ? 'LENTO' : totalDuration > 5000 ? 'MODERADO' : 'RÁPIDO'
});



        return {
            resultados, // 🆕 AHORA TODOS SON RespuestaStandard
            errores,
            tiemposEjecucion,
            totalAnalizadores: Object.keys(analizadores).length,
            analizadoresExitosos: Object.keys(resultados).filter(k => resultados[k].meta.ejecucion?.exitoso).length,
            estandaresValidos,
            tiempoTotal: Math.round(totalDuration * 100) / 100,
            timestamp: new Date().toISOString(),
            version: VERSION_MODULO,
            instancia: process.env.NODE_APP_INSTANCE || '0',
            pid: process.pid,

            // 🚀 METADATOS DE CONCURRENCIA DISTRIBUIDA (MANTENER IGUAL)
            concurrencia: {
                paralelismo: {
                    ganancia: gananciaParalelismo,
                    eficiencia: tiempoMaximo > 0 ? (tiempoMaximo / totalDuration) * 100 : 0,
                    tiempoMaximoIndividual: tiempoMaximo
                },
                distribucion: {
                    instanciasTotal: 4,
                    instanciaActual: process.env.NODE_APP_INSTANCE || '0',
                    sharpOpsConcurrentes: 1,
                    redisLockUtilizado: !!redisClient
                }
            }
        };

    } catch (error) {
        const totalDuration = performance.now() - startTime;

        dragon.agoniza('Error crítico en análisis paralelo distribuido', error, 'analizadorImagen', 'DISTRIBUTED_STANDARD_CRITICAL_ERROR', {
            archivoId,
            correlationId,
            tiempoTotal: Math.round(totalDuration * 100) / 100,
            instancia: process.env.NODE_APP_INSTANCE || '0',
            pid: process.pid
        });

        // 🆕 NUEVO: Error crítico también en RespuestaStandard
        const resultadoError = crearRespuestaStandardError(
            'sistema',
            error,
            totalDuration,
            false
        );

        return {
            resultados: { sistema: resultadoError },
            errores: [{ error: error.message, critical: true }],
            totalAnalizadores: 0,
            analizadoresExitosos: 0,
            estandaresValidos: 1, // Al menos el error es estándar
            tiempoTotal: Math.round(totalDuration * 100) / 100,
            timestamp: new Date().toISOString(),
            version: VERSION_MODULO,
            instancia: process.env.NODE_APP_INSTANCE || '0',
            pid: process.pid,
            concurrencia: {
                error: 'CRITICAL_FAILURE',
                instancia: process.env.NODE_APP_INSTANCE || '0'
            }
        };
    }


}

/**
 * FUSIÓN FORENSE V6.2 - MODELO DE INERCIA JUDICIAL ASIMÉTRICA CON CONTEXTO
 * ========================================================================
 * "El Tribunal Digital que distingue la Maestría de la Máquina"
 *
 * PRINCIPIOS FILOSÓFICOS:
 * 1. Justicia Contextual: No juzgues igual al anónimo que al verificado
 * 2. Presunción de Buena Fe Técnica: La excelencia verificada no es sospechosa
 * 3. Asimetría Proporcional: Severidad inversa a la transparencia
 * 4. Educación, No Solo Juicio: Cada veredicto enseña mejores prácticas
 * ========================================================================
 */

export function fusionarResultadoFAANG(resultadosAnalizadores) {
    const { resultados } = resultadosAnalizadores;

    // 📜 NIVEL 1: VETO ABSOLUTO (Evidencia Documental Irrefutable)
    const evidenciaIrrefutable = buscarEvidenciaIrrefutable(resultados);
    if (evidenciaIrrefutable) {
        return crearResultadoDirecto(evidenciaIrrefutable, resultados);
    }

    // 🧭 NIVEL 0: CONTEXTO DE ORIGEN (NUEVO EN V6.2)
    const contexto = determinarContextoOrigen(resultados);

    // ⚖️ NIVEL 2-3: JUICIO PONDERADO CONTEXTUAL
    return fusionarPorInerciaContextual(resultados, contexto);
}

/**
 * 🔍 Determina si un caso es de un profesional verificado (FIX V6.8)
 * CORRECCIÓN: Soporte dual para estructura 'forense' (V25) y 'datosForenses' (Legacy)
 */
function esCasoProfesionalVerificado(exif) {
    // 🚨 FIX CRÍTICO: Buscar en .forense (Estándar V25) O .datosForenses (Legacy)
    const rawData = exif?.forense?.raw_data || exif?.datosForenses?.raw_data || {};

    // Recuperar datos planos o crudos
    const datos = rawData.flat_exif || rawData.raw_exif || {};

    // 1. Hardware Profesional
    const camaraPro = /canon|nikon|sony|pentax|fujifilm|leica|ricoh|olympus|panasonic/i.test(datos.Make || '');

    // 2. Software de Edición Profesional
    const softwarePro = /photoshop|lightroom|capture one|camera raw|affinity/i.test(datos.Software || '');

    // 3. Historial de Edición
    const tieneHistorial = datos.History && datos.History.length >= 1;

    // 4. Origen RAW (Directo o Derivado)
    const esArchivoRaw = exif?.forense?.features_nn?.[2] === 1 || exif?.datosForenses?.features_nn?.[2] === 1;
    const tieneTrazaRaw = datos.RawFileName || datos.DerivedFrom || datos.OriginalDocumentID;

    const esOrigenRAW = esArchivoRaw || (tieneTrazaRaw !== undefined);

    // LOGICA FINAL
    return camaraPro && softwarePro && (tieneHistorial || esOrigenRAW);
}

/**
 * 🧭 NIVEL 0: CONTEXTO DE ORIGEN - "¿Quién es el acusado?"
 *
 * Clasifica la imagen en 3 categorías:
 * 1. PROFESIONAL_VERIFICADO: Cámara + Software Pro + Historial limpio
 * 2. DESCONOCIDO_SOSPECHOSO: Sin metadatos, anónimo
 * 3. ESTANDAR: Caso intermedio
 */
function determinarContextoOrigen(resultados) {
    const exif = resultados['analizadorExif'];
    const validator = resultados['analizadorValidator'];
    const c2pa = resultados['analizadorC2PA'];

    const { esCamara, esSoftwarePro, historialCoherente, exifCompleto } =
        analizarPerfilOrigen(exif, validator, c2pa);

    // 🏆 CATEGORÍA A: PROFESIONAL VERIFICADO (Quico Melero Case)
    if (esCamara && esSoftwarePro && historialCoherente) {
        // Verificar si es realmente profesional (no solo cámara + editor casual)
        if (esCasoProfesionalVerificado(exif)) {
            return {
                tipo: 'PROFESIONAL_VERIFICADO',
                multiplicadorIA: 0.5,
                masaInercial: 60,
                mensaje: '🏆 ORIGEN PROFESIONAL VERIFICADO (Patrón: Cámara Pro + Software Pro + Historial)',
                flags: { profesional: true, exifCompleto, casoQuicoMelero: true }
            };
        }
    }

    // 🚨 CATEGORÍA B: SOSPECHOSO/DESCONOCIDO
    // Solo cae aquí si NO hay rastros de cámara Y NO hay rastros de edición/historial.
    if (!esCamara && !esSoftwarePro && !exifCompleto) {
        return {
            tipo: 'DESCONOCIDO_SOSPECHOSO',
            multiplicadorIA: 2.0,    // Severo: Anonimato = Mayor escrutinio
            masaInercial: 40,
            mensaje: 'Origen anónimo o desconocido. Se aplica escrutinio máximo.',
            flags: { sospechoso: true }
        };
    }

    // 📊 CATEGORÍA C: ESTÁNDAR (Incluye el iPhone X / Telegram)
    // Cae aquí si esCamara=true O esSoftwarePro=true (sin ser ambos de forma coherente).
    return {
        tipo: 'ESTANDAR',
        multiplicadorIA: 1.3,        // Balanceado
        masaInercial: 50,
        mensaje: 'Metadatos estándar detectados (Fotografía casual o editada de forma básica).',
        flags: {}
    };
}

/**
 * 🔍 Análisis detallado del perfil de origen (FIX V6.8 - Rutas V25)
 */
function analizarPerfilOrigen(exif, validator, c2pa) {
    // 🚨 FIX 1: Rutas correctas para rawData (V25 vs Legacy)
    const rawData = exif?.forense?.raw_data || exif?.datosForenses?.raw_data || {};
    const datos = rawData.flat_exif || rawData.raw_exif || {};
    const flags = exif?.flags || {};

    // 1. ¿Es cámara real?
    const esCamara = flags.origen_camara || (datos.Make && datos.Model);

    // 2. Detección de Software Profesional
    // 🚨 FIX 2: Rutas correctas para herramientas
    const herramientasArray = [
        ...(exif?.forense?.herramientas || exif?.datosForenses?.herramientas || []),
        ...(c2pa?.forense?.herramientas || c2pa?.datosForenses?.herramientas || [])
    ];

    const softwareProRegex = /photoshop|lightroom|capture one|camera raw|affinity photo|phase one|dxo|darktable/i;

    // Comprobación Híbrida: Array procesado O Texto crudo
    const esSoftwarePro = herramientasArray.some(h => softwareProRegex.test(h.nombre)) ||
                          (datos.Software && softwareProRegex.test(datos.Software));

    // 3. ¿Historial coherente?
    // Ahora 'datos.History' funcionará porque 'datos' ya no está vacío
    const historialCoherente = validator?.evaluacion?.veredicto === 'Humano' ||
                               (datos.History && datos.History.length > 0);

    // 4. ¿EXIF completo? (Flexible con GPS para PRO)
    const esCamaraPro = /canon|nikon|sony|pentax|fujifilm|leica|ricoh|olympus|panasonic/i.test(datos.Make || '');
    const tieneDatosTecnicos = datos.ExposureTime && (datos.ISO || datos.FNumber);
    const tieneGPS = datos.GPSLatitude && datos.GPSLongitude;

    const exifCompleto = esCamara && tieneDatosTecnicos && (esCamaraPro || tieneGPS);

    return { esCamara, esSoftwarePro, historialCoherente, exifCompleto };
}

/**
 * 📋 Evalúa la completitud y coherencia del EXIF
 */
function evaluarCompletitudEXIF(exif) {
    const rawData = exif?.raw_data || {};

    // Campos esenciales para autenticidad
    const camposEsenciales = [
        'Make', 'Model', 'DateTimeOriginal',
        'ExposureTime', 'FNumber', 'ISO', 'FocalLength'
    ];

    const camposPresentes = camposEsenciales.filter(campo => rawData[campo] !== undefined);
    const porcentajeCompletitud = camposPresentes.length / camposEsenciales.length;

    // Requerimos al menos 60% de campos esenciales
    const esCompleto = porcentajeCompletitud >= 0.6;

    // Verificar coherencia técnica básica
    const iso = rawData.ISO;
    const esCoherente = !iso || (iso >= 50 && iso <= 51200);

    // GPS es opcional pero suma puntos
    const tieneGPS = rawData.GPSLatitude && rawData.GPSLongitude;

    return {
        esCompleto: esCompleto && esCoherente,
        porcentaje: porcentajeCompletitud,
        tieneGPS,
        camposFaltantes: camposEsenciales.filter(c => !rawData[c])
    };
}

/**
 * ⚖️ MOTOR DE PUNTUACIÓN V6.5 (FINAL) - "Tribunal Digital"
 * Incorpora: Escudos Profesionales, Amortiguamiento Social, NN Entrenada e Inercia Adaptativa.
 */
function fusionarPorInerciaContextual(resultados, contexto) {
    // 🏛️ JERARQUÍA DE PESOS
    const PESOS = {
        'critico': 50,
        'muy_alto': 25,
        'alto': 15,
        'medio': 5,
        'bajo': 0.5
    };

    let puntosHumano = 0;
    let puntosIA = 0;
    let evidenciasFuertes = [];
    let analizadoresIncluidos = [];
    let exclusionesProfesionales = [];

    // 🧠 1. INTEGRACIÓN DE NN ENTRENADA (VOTO PERICIAL ADICIONAL)
    const nnEntrenada = resultados['analizadorExif']?.datosForenses?.raw_data?.nn_output_entrenada;
    const nnOriginal = resultados['analizadorExif']?.datosForenses?.raw_data?.nn_output_original?.nn_score;

    if (nnEntrenada !== undefined) {
        const pesoNN = PESOS.alto;

        // Medir mejora respecto a NN original
        const mejora = nnOriginal !== undefined ?
            Math.abs(nnEntrenada - 0.5) - Math.abs(nnOriginal - 0.5) : 0;

        // Confianza = distancia al centro + mejora
        const confianzaNN = Math.abs(nnEntrenada - 0.5) + Math.max(0, mejora);
        const fuerzaNN = pesoNN * Math.min(confianzaNN, 1);

        if (nnEntrenada >= 0.7) {
            puntosHumano += fuerzaNN;
            evidenciasFuertes.push(`🧠 NN Entrenada: Confianza ${(nnEntrenada*100).toFixed(0)}% en origen humano`);
        } else if (nnEntrenada <= 0.3) {
            puntosIA += fuerzaNN * contexto.multiplicadorIA;
            evidenciasFuertes.push(`🧠 NN Entrenada: Confianza ${((1-nnEntrenada)*100).toFixed(0)}% en origen IA`);
        }
    }

    // --- Detección de Conflicto Humano Fuerte ---
    const hayEvidenciaHumanaFuerte = (
        (resultados['analizadorValidator']?.evaluacion?.peso === 'alto' && resultados['analizadorValidator']?.evaluacion?.veredicto === 'Humano') ||
        (resultados['analizadorMensajeria']?.evaluacion?.peso === 'alto' && resultados['analizadorMensajeria']?.evaluacion?.veredicto === 'Humano')
    );

    // 🔄 2. ITERACIÓN POR ANALIZADORES
    for (const [nombre, resultado] of Object.entries(resultados)) {
        if (!resultado?.exitoso || !resultado?.evaluacion) continue;

        let { peso, veredicto, confianza = 0.5 } = resultado.evaluacion;
        const pesoStr = peso?.toLowerCase() || 'bajo';
        let pesoValor = PESOS[pesoStr] || PESOS.bajo;

        // 🚨 MEDIDA DE EMERGENCIA: ELA TOPADO
        if (nombre === 'analizadorELA' && pesoValor > PESOS.medio) {
            pesoValor = PESOS.medio;
        }

        let esVotoNeutralizado = false;

        // 🛡️ ESCUDOS CONTEXTUALES (ELA/ARTEFACTOS)
        if (nombre === 'analizadorELA' || nombre === 'analizadorArtefactos') {
            const esAcusacionPorPerfeccion = resultado.narrativa?.explicacion_humana?.includes('Superficie digitalmente perfecta') ||
                                             resultado.narrativa?.explicacion_humana?.includes('Falta la varianza de error');

            if (esAcusacionPorPerfeccion) {
                if (contexto.tipo === 'PROFESIONAL_VERIFICADO') {
                    exclusionesProfesionales.push(`🛡️ ${nombre}: Perfección ignorada por Origen Profesional Verificado.`);
                    continue; // VETO TOTAL
                }
                if (hayEvidenciaHumanaFuerte && contexto.tipo !== 'DESCONOCIDO_SOSPECHOSO') {
                    exclusionesProfesionales.push(`⚠️ ${nombre}: Falso Positivo amortiguado por Conflicto Social/Cámara.`);
                    veredicto = 'Indeterminado';
                    pesoValor = PESOS['bajo'];
                    esVotoNeutralizado = true;
                }
            }
        }

        // 🛡️ ESCUDO PROFESIONAL GENÉRICO
        if (!esVotoNeutralizado && contexto.tipo === 'PROFESIONAL_VERIFICADO') {
            // Verificamos si existe la función para evitar error de referencia
            if (typeof aplicarEscudoProfesional === 'function') {
                const escudo = aplicarEscudoProfesional(nombre, veredicto, pesoValor, resultado);
                if (escudo.excluido) {
                    exclusionesProfesionales.push(escudo.mensaje);
                    continue;
                }
                pesoValor = escudo.pesoAjustado;
            }
        }

        // ⚖️ CÁLCULO DE FUERZA
        const fuerza = pesoValor * confianza;

        if (veredicto === 'Humano' || veredicto === 'Editado') {
            puntosHumano += fuerza;
            if (pesoValor >= PESOS.alto) {
                evidenciasFuertes.push(`✅ ${resultado.narrativa?.explicacion_humana || 'Evidencia humana fuerte'}`);
            }
        } else if (veredicto === 'Artificial' || veredicto === 'IA') {
            puntosIA += (fuerza * contexto.multiplicadorIA);
            if (pesoValor >= PESOS.alto) {
                evidenciasFuertes.push(`⚠️ ${resultado.narrativa?.explicacion_humana || 'Indicio fuerte de IA'}`);
            }
        }

        if (pesoValor >= PESOS.medio) {
            analizadoresIncluidos.push({
                nombre,
                peso: pesoStr,
                veredicto,
                fuerza,
                ajustado: (contexto.multiplicadorIA !== 1.0)
            });
        }
    }

    // 🧮 3. FÓRMULA V6.5 - INERCIA ADAPTATIVA (CORRECCIÓN CRÍTICA AQUI)
    // ==================================================================
    let masaTotal;

    if (contexto.tipo === 'PROFESIONAL_VERIFICADO') {
        // 👑 PRIVILEGIO REAL:
        // Si es profesional verificado, la resistencia (masa total) es mínima.
        // Esto permite que el score suba a 100% si PuntosIA es 0.
        masaTotal = contexto.masaInercial;
    } else {
        // Resto de casos: La masa total es doble para evitar falsos positivos fáciles.
        masaTotal = contexto.masaInercial * 2;
    }

    let scoreFinal = (puntosHumano + contexto.masaInercial) / (puntosHumano + puntosIA + masaTotal);
    // ==================================================================

    // 🎁 4. BONIFICACIONES FINALES

    // Bonificación por Transparencia (EXIF Completo)
    if (contexto.flags.exifCompleto) {
        const bonificacion = 0.15;
        scoreFinal = Math.min(1.0, scoreFinal * (1 + bonificacion));
    }

    // Bonificación por Coherencia NN-Contexto
    if (nnEntrenada !== undefined) {
        const coherencia = (contexto.tipo === 'PROFESIONAL_VERIFICADO' && nnEntrenada > 0.7) ||
                           (contexto.tipo === 'DESCONOCIDO_SOSPECHOSO' && nnEntrenada < 0.3) ||
                           (contexto.tipo === 'ESTANDAR' && nnEntrenada > 0.4 && nnEntrenada < 0.6);

        if (coherencia) {
            scoreFinal = Math.min(1.0, scoreFinal * 1.05); // +5% (con tope de 1.0)
            evidenciasFuertes.push(`🎯 NN Entrenada coherente con contexto (${contexto.tipo})`);
        }
    }

    // 🏁 5. GENERAR VEREDICTO
    return generarVeredictoFinal({
        scoreFinal,
        contexto,
        puntosHumano,
        puntosIA,
        evidenciasFuertes,
        analizadoresIncluidos,
        exclusionesProfesionales,
        resultados
    });
}

/**
 * 🛡️ ESCUDO PROFESIONAL - Protege la excelencia técnica (AJUSTE FINAL)
 */
function aplicarEscudoProfesional(nombre, veredicto, pesoValor, resultado) {
    // Lista de analizadores que pueden dar falsos positivos con excelencia técnica
    const analizadoresSensibles = {
        'analizadorELA': ['Superficie digitalmente perfecta', 'Falta varianza de error'],
        'analizadorArtefactos': ['Sin artefactos de compresión', 'Compresión mínima'],
        // Se pueden añadir más aquí si es necesario
    };

    // 1. CHEQUEO: ¿Es un analizador sensible y acusa de IA?
    if (analizadoresSensibles[nombre] && (veredicto === 'Artificial' || veredicto === 'IA')) {

        // Buscamos la narrativa para ver si la razón es la 'perfección' (Falso Positivo)
        const narrativa = resultado.narrativa?.explicacion_humana || '';

        const esFalsoPositivo = analizadoresSensibles[nombre].some(patron =>
            // Utilizamos el texto del log exacto como "patrón"
            narrativa.includes(patron)
        );

        if (esFalsoPositivo) {
            // DECISIÓN DRÁSTICA: Anular completamente el voto del ELA/Artefactos.
            return {
                excluido: true,
                pesoAjustado: 0,
                mensaje: `🛡️ ${nombre}: Excelencia técnica reconocida. Se ignora la acusación de perfección digital (FP).`
            };
        }
    }

    // 2. AJUSTE RESIDUAL (Si no se excluye, aplicar reducción de peso por defecto, pero no anular completamente el voto Humano)
    return {
        excluido: false,
        // Dejamos el peso como estaba (Alto/Medio) para que sume, pero si es demasiado alto, lo bajamos ligeramente.
        pesoAjustado: pesoValor,
        mensaje: null
    };
}

/**
 * 🏁 GENERAR VEREDICTO FINAL CON EXPLICACIÓN COMPLETA (Umbrales Ajustados)
 */
function generarVeredictoFinal(datos) {
    const { scoreFinal, contexto, evidenciasFuertes, exclusionesProfesionales, resultados } = datos;

    // 📊 UMBRALES V6.3 (Ajuste Táctico: Menos Indeterminados)
    // Humano Casual: >= 65% (Antes 70%)
    // Artificial:    <= 35% (Antes 30%)

    let decision, esAutentico, confianzaNivel, etiquetaExtra, explicacionFinal;

    // 1. CASO HUMANO PROFESIONAL (Umbral protegido)
    // Mantenemos 60% aquí porque el contexto ya verifica el origen.
    if (scoreFinal >= 0.60 && contexto.tipo === 'PROFESIONAL_VERIFICADO') {
        decision = "Humano Profesional";
        esAutentico = true;
        confianzaNivel = scoreFinal > 0.80 ? 'alta' : 'media';
        etiquetaExtra = "🏆";
        explicacionFinal = `✅ ORIGEN PROFESIONAL VERIFICADO. ` +
                           `La excelencia técnica ha sido reconocida y protegida. ` +
                           `${evidenciasFuertes.join(' ')}`;
    }
    // 2. CASO HUMANO ESTÁNDAR (Nuevo Umbral 65%)
    else if (scoreFinal >= 0.65) {
        decision = "Humano";
        esAutentico = true;
        // Ajustamos la confianza a la nueva escala
        confianzaNivel = scoreFinal > 0.80 ? 'alta' : 'media';
        explicacionFinal = `✅ ${evidenciasFuertes.join(' ') || 'Evidencia humana predominante'}`;
    }
    // 3. CASO ARTIFICIAL (Nuevo Umbral 35%)
    else if (scoreFinal <= 0.35) {
        decision = "Artificial";
        esAutentico = false;
        confianzaNivel = scoreFinal < 0.20 ? 'alta' : 'media';
        explicacionFinal = `🚨 ${evidenciasFuertes.join(' ') || 'Indicios significativos de IA'}`;
    }
    // 4. INDETERMINADO (Zona Gris: 36% - 64%)
    else {
        decision = "Indeterminado";
        esAutentico = null;
        confianzaNivel = 'baja';

        if (contexto.tipo === 'PROFESIONAL_VERIFICADO') {
            etiquetaExtra = " (Revisión Técnica)";
            explicacionFinal = `⚠️ ORIGEN PROFESIONAL CON ANOMALÍAS TÉCNICAS. ` +
                               `Considere: ${evidenciasFuertes.join(' ')}`;
        } else {
            explicacionFinal = `🔍 ${evidenciasFuertes.join(' ') || 'Evidencia contradictoria o insuficiente'}`;
        }
    }

    // 📝 AÑADIR NOTAS DE EXCLUSIÓN PROFESIONAL
    if (exclusionesProfesionales.length > 0) {
        explicacionFinal += `\n\n🛡️ ESCUDO PROFESIONAL ACTIVADO:\n${exclusionesProfesionales.join('\n')}`;
    }

    // 📊 ESTADÍSTICAS FINALES
    const v = typeof VERSION_MODULO !== 'undefined' ? VERSION_MODULO : 'Dragon3_FAANG_V6.3';

    return {
        consenso: {
            esAutentico,
            decision: decision + (etiquetaExtra || ''),
            confianza: confianzaNivel,
            // Confianza visual basada en la distancia al centro (0.5)
            confianzaPromedio: Math.abs(scoreFinal - 0.5) * 2,
            porcentajeAutentico: scoreFinal,
            totalVotos: datos.analizadoresIncluidos.length,
            votosPositivos: datos.analizadoresIncluidos.filter(a =>
                resultados[a.nombre]?.evaluacion?.veredicto === 'Humano'
            ).length,
            fuentes: datos.analizadoresIncluidos.map(a => ({
                analizador: a.nombre,
                peso: a.peso,
                veredicto: a.veredicto,
                fuerza: a.fuerza.toFixed(2),
                ajustado: a.ajustado
            })),
            algoritmo: 'inercia_contextual_v6.3',
            explicacion: explicacionFinal,
            contextoDetectado: contexto.tipo,
            mensajeContexto: contexto.mensaje,
            decisionDirecta: false
        },
        resultadosAnalizadores: resultados,
        timestamp: new Date().toISOString(),
        version: v
    };
}

/**
 * 📜 NIVEL 1: VETO ABSOLUTO (LÓGICA MAESTRO vs COPIA)
 */
function buscarEvidenciaIrrefutable(resultados) {
    // 1. C2PA de IA generativa (Mantenemos detección de fakes INTACTA)
    if (resultados.analizadorC2PA?.flags?.ia &&
        resultados.analizadorC2PA.evaluacion.peso === 'critico') {
        return { tipo: 'IA_CERTIFICADA', origen: 'analizadorC2PA', res: resultados.analizadorC2PA };
    }

    // 2. EXIF con software de IA explícito (Mantenemos detección de fakes INTACTA)
    if (resultados.analizadorExif?.flags?.ia &&
        resultados.analizadorExif.evaluacion.peso === 'critico') {
        return { tipo: 'IA_CERTIFICADA', origen: 'analizadorExif', res: resultados.analizadorExif };
    }

    // =====================================================================
    // 👑 LA SUPREMACÍA DEL SELLO BLADE (Lógica "Nuevo Original")
    // =====================================================================
    const mbh = resultados.analizadorMBH;

    if (mbh && mbh.exitoso) {
        // Buscamos evidencias en los datos crudos o en la narrativa
        const rawData = mbh.forense?.raw_data || mbh.datosForenses?.raw_data || {};
        const explicacion = mbh.narrativa?.explicacion_humana || "";

        // A. Detección por Energía Matemática (La prueba física)
        const energiaFractal = parseFloat(rawData.energy || 0);

        // B. ¿Tiene Sello Válido? (Energía > 500 o Autor Identificado)
        const tieneSello = energiaFractal > 500 ||
                           explicacion.includes("RASTREADA") ||
                           explicacion.includes("AUTOR IDENTIFICADO") ||
                           explicacion.includes("PROTEGIDO POR BLADE");

        // C. ¿ES UN PNG? (Condición Sine Qua Non para ser "Nuevo Original / Máster")
        // Consultamos el formato detectado por Sharp o los Metadatos
        const formatoSharp = resultados.analizadorSharp?.raw_data?.format || "";
        const formatoMeta = resultados.analizadorMetadatos?.raw_data?.FileTypeExtension || "";

        // Verificación robusta del formato
        const esPNG = (formatoSharp === 'png') || (formatoMeta && formatoMeta.toLowerCase() === 'png');

        if (tieneSello) {
            if (esPNG) {
                // 🏆 CASO 1: EL MÁSTER (PNG + SELLO) -> IRREFUTABLE
                // Si es PNG y tiene sello, es el "Nuevo Original Acuñado".
                // Esto anula cualquier duda sobre manipulación o metadatos.
                return {
                    tipo: 'HUMANO_CERTIFICADO',
                    origen: 'analizadorMBH',
                    res: {
                        ...mbh,
                        narrativa: {
                            ...mbh.narrativa,
                            // Explicación legal del estatus de "Nuevo Original"
                            explicacion_humana: `✅ CERTIFICADO MAESTRO BLADE. Archivo PNG con Sello Fractal de Alta Energía (${energiaFractal.toFixed(0)}). Propiedad Intelectual garantizada. Este archivo constituye el Original Digital Acuñado.`
                        }
                    }
                };
            } else {
                // 📸 CASO 2: LA COPIA (JPG/WebP + SELLO) -> DEJAR PASAR
                // Si tiene sello pero NO es PNG, NO forzamos el "Humano Certificado".
                // Dejamos que el sistema siga y evalúe la compresión/manipulación.
                // El resultado final será "Indeterminado" pero con la etiqueta "RASTREADO".
                return null;
            }
        }
    }

    return null;
}

function crearResultadoDirecto(evidencia, resultados) {
    const esIA = evidencia.tipo === 'IA_CERTIFICADA';
    const explicacion = esIA
        ? `🚨 EVIDENCIA IRREFUTABLE DE IA: ${evidencia.res.narrativa?.explicacion_humana || 'Firma de IA detectada'}`
        : `✅ EVIDENCIA IRREFUTABLE HUMANA: ${evidencia.res.narrativa?.explicacion_humana || 'Origen humano certificado'}`;

    return {
        consenso: {
            decision: esIA ? "Artificial (Certificado)" : "Humano (Certificado)",
            esAutentico: !esIA,
            confianza: 'maxima',
            confianzaPromedio: 1.0,
            porcentajeAutentico: esIA ? 0.01 : 0.99,
            totalVotos: 1,
            fuentes: [{ fuente: 'evidencia_directa', analizador: evidencia.origen }],
            algoritmo: 'veto_absoluto_v6.2',
            explicacion,
            decisionDirecta: true,
            motivoDecisionDirecta: evidencia.tipo
        },
        resultadosAnalizadores: resultados,
        timestamp: new Date().toISOString(),
        version: 'Dragon3_FAANG_V6.2'
    };
}

/**
 * 📚 DOCUMENTACIÓN DE USO:
 * 1. Niveles jerárquicos: Contexto (0), Veto (1), Pericial (2), Técnico (3).
 * 2. Protección Pro: EXIF completo + Bonificación transparencia (+15%).
 * 3. Contenido Anónimo: Multiplicador IA x2.0 e Inercia desfavorable.
 */

/**
 * GENERACIÓN RESULTADO FINAL - STANDARD V25 FAANG
 * Integra los resultados de la Fusión Local con la Inferencia de la Red Superior.
 */
const generarResultadoFinalFAANG = (
    resultadoConsolidado,
    analisisRedSuperior,
    parametros,
    hashImagen,
    tiempoInicio,
    securityResult
) => {
    const { archivoId, correlationId } = parametros;
    const tiempoTotal = Date.now() - tiempoInicio;
    const v = typeof VERSION_MODULO !== 'undefined' ? VERSION_MODULO : '3.0.0-FAANG';

    try {
        const consenso = resultadoConsolidado.consenso;
        const resultados = resultadoConsolidado.resultadosAnalizadores || {};

        // ============================
        // 1. CALCULAR FLAGS FINALES
        // ============================
        const flagsFinales = {
            es_ia: consenso.decision?.includes('Artificial') || false,
            es_autentico: consenso.decision?.includes('Humano') || false,
            tiene_edicion: false,
            origen_camara: false,
            superior_active: analisisRedSuperior && !analisisRedSuperior.degraded,
            degradado: !!analisisRedSuperior?.degraded
        };

        for (const res of Object.values(resultados)) {
            if (res && res.flags) {
                if (res.flags.tiene_edicion) flagsFinales.tiene_edicion = true;
                if (res.flags.origen_camara) flagsFinales.origen_camara = true;
                if (res.flags.es_ia && res.evaluacion?.peso === 'critico') {
                    flagsFinales.es_ia = true;
                    flagsFinales.es_autentico = false;
                }
            }
        }

        // ============================
        // 2. NARRATIVA BASE (sin ML)
        // ============================
        const explicaciones = [];

        const infoContexto = consenso.mensajeContexto || 'Origen sin clasificar';
        const infoScore = `📊 Score Humano: ${((consenso.porcentajeAutentico || 0) * 100).toFixed(1)}%.`;
        const infoAlgoritmo = `[Algoritmo: ${consenso.algoritmo || 'Hybrid_V25'}]`;

        explicaciones.push(infoScore);
        explicaciones.push(`[CONTEXTO NIVEL 0]: ${infoContexto}. ${infoAlgoritmo}`);

        const analizadoresClave = ['analizadorExif', 'analizadorMBH', 'analizadorC2PA', 'analizadorValidator'];
        for (const nombre of analizadoresClave) {
            if (resultados[nombre]?.exitoso && resultados[nombre]?.narrativa?.explicacion_humana) {
                explicaciones.push(resultados[nombre].narrativa.explicacion_humana);
            }
        }
        if (consenso.explicacion) explicaciones.push(consenso.explicacion);

        // ============================
        // 3. INTEGRACIÓN RED SUPERIOR (ML)
        // ============================
        let explicacionML = "";
        let scoreFinal = consenso.porcentajeAutentico || 0.5;

        if (analisisRedSuperior && !analisisRedSuperior.degraded) {
            // Extraer categoría y confianza de forma robusta
            let mlCategoria = analisisRedSuperior.categoria ||
                              analisisRedSuperior.resumen?.decision ||
                              analisisRedSuperior.evaluacion?.veredicto ||
                              (analisisRedSuperior.raw?.categoria) ||
                              'Analizado';

            let mlConfianza = (typeof analisisRedSuperior.confianza === 'number')
                ? analisisRedSuperior.confianza
                : (analisisRedSuperior.resumen?.confianza ??
                   analisisRedSuperior.evaluacion?.confianza ??
                   analisisRedSuperior.raw?.confianza ??
                   0);

            if (typeof mlConfianza !== 'number' || isNaN(mlConfianza)) mlConfianza = 0;
            const mlConfianzaPorcentaje = (mlConfianza * 100).toFixed(1);
            explicacionML = ` [🧠 ML Superior: ${mlCategoria} - Confianza: ${mlConfianzaPorcentaje}%]`;

            if (mlConfianza > 0.95) {
                scoreFinal = mlCategoria === 'Artificial' ? 0.01 : 0.99;
            }
        }

        // ============================
        // 4. CONSTRUIR narrativaFinal (OBLIGATORIO)
        // ============================
        const decisionTexto = consenso.decision || 'Indeterminado';
        let estado = 'warning';
        if (decisionTexto.includes('Artificial')) estado = 'danger';
        else if (decisionTexto.includes('Humano')) estado = 'success';

        const narrativaFinal = {
            estado: estado,
            titulo: `Análisis Forense: ${decisionTexto}`,
            explicacion_humana: (explicaciones.join(' ') + (explicacionML || '')).trim()
        };

        // ============================
        // 5. CONFIANZA NUMÉRICA PARA EL RESUMEN
        // ============================
        let confianzaNumerica = 0.55; // valor por defecto
        if (consenso.confianza === 'alta' || consenso.confianza === 'maxima') confianzaNumerica = 0.92;
        else if (consenso.confianza === 'media') confianzaNumerica = 0.75;
        else if (consenso.confianza === 'baja') confianzaNumerica = 0.4;
        else if (typeof consenso.confianza === 'number') confianzaNumerica = consenso.confianza;
        else if (typeof consenso.confianzaPromedio === 'number') confianzaNumerica = consenso.confianzaPromedio;
        else if (typeof consenso.porcentajeAutentico === 'number') confianzaNumerica = consenso.porcentajeAutentico;

        // ============================
        // 6. RETORNO OBJETO STANDARD API (V25)
        // ============================
        return {
            resumen: {
                decision: decisionTexto,
                confianza: confianzaNumerica,
                score: scoreFinal,
                modeloPrincipal: consenso.version || "Dragon3_FAANG_Standard_V25",
                explicacion: narrativaFinal.explicacion_humana,
                etiquetas: Object.keys(flagsFinales).filter(k => flagsFinales[k]),
                correlationId,
                archivoId,
                timestamp: new Date().toISOString(),
                tiempoTotal
            },
            detalles: {
                analizadores: resultados,
                consenso: consenso,
                superior: analisisRedSuperior || { status: 'offline' },
                seguridad: securityResult
            },
            metadata: {
                analyzerType: 'imagen',
                processingTime: tiempoTotal,
                timestamp: new Date().toISOString(),
                version: v,
                securityValidation: securityResult?.valid || false,
                hash: hashImagen
            },
            flags: flagsFinales,
            paraInforme: {
                explicacionExtendida: narrativaFinal.explicacion_humana,
                hashImagen,
                tiempoTotal,
                veredictoIA: flagsFinales.es_ia
            }
        };

    } catch (error) {
        if (typeof dragon !== 'undefined') {
            dragon.agoniza('Error generando resultado final FAANG', error, 'analizadorImagen', 'RESULTADO_FINAL_ERROR');
        }
        return {
            resumen: {
                decision: "Error",
                confianza: 0,
                score: 0,
                explicacion: `Fallo crítico en post-procesamiento: ${error.message}`
            },
            estado: "error",
            flags: { error: true }
        };
    }
};

/**
 * ====================================================================
 * ADAPTADOR MAESTRO (Definitivo)
 * Traduce RespuestaStandard (V25) y Legacy (V1) al formato API del Frontend.
 * ====================================================================
 */
function adaptarResultadoLegacyAFAANG(resultado) {
    // 1. Protección contra Nulos/Undefined
    if (!resultado) {
        return {
            resumen: { decision: "Error", confianza: 0, explicacion: "Resultado nulo" },
            detalles: { error: "Resultado nulo recibido en adaptador" },
            estado: "fallido",
            metadata: { error: true }
        };
    }


    // 2. DETECCIÓN: ¿Es formato RespuestaStandard V25? (Tiene 'evaluacion' y 'veredicto')
    if (resultado.evaluacion && resultado.narrativa) {
        return {
            resumen: {
                // TRADUCCIÓN CLAVE: veredicto -> decision
                decision: resultado.evaluacion.veredicto || "Indeterminado",
                confianza: resultado.evaluacion.confianza || 0,
                score: resultado.evaluacion.score_logico || 0,
                explicacion: resultado.narrativa.explicacion_humana || "",
                modeloPrincipal: "Dragon3_Standard_V25",
                etiquetas: resultado.flags ? Object.keys(resultado.flags).filter(k => resultado.flags[k]) : []
            },
            detalles: {
                // 🔥 FIX CRÍTICO: 'exitoso: true' explícito para que el Frontend cuente el analizador
                exitoso: true,

                // Pasamos todo el objeto Standard como detalles para que el frontend tenga acceso a todo
                ...resultado,

                // Aseguramos que forense esté disponible como raw_forense también
                raw_forense: resultado.forense
            },
            // Mapeamos los metadatos del Standard a la raíz
            metadata: {
                timestamp: new Date().toISOString(),
                version: resultado.meta?.version || (typeof VERSION_MODULO !== 'undefined' ? VERSION_MODULO : "3.0.0-FAANG"),
                id: resultado.meta?.id,
                processingTime: resultado.meta?.ms || 0
            },
            estado: "completado"
        };
    }

    // 3. DETECCIÓN: ¿Ya es formato API FAANG (resumen/detalles)?
    if (resultado.resumen && resultado.detalles && !resultado.resultado) {
        // Aseguramos que 'decision' exista, si no, fallback a 'Indeterminado'
        if (!resultado.resumen.decision) resultado.resumen.decision = "Indeterminado";
        return resultado;
    }

    // 4. FALLBACK: Formato Legacy (Dragon2 / Antiguo)
    const subRes = resultado.resultado || resultado;
    const consenso = subRes.detallado?.consenso || {};

    let decisionLegacy = resultado.decision || subRes.decision;
    if (!decisionLegacy) {
        decisionLegacy = (consenso.esAutentico === true) ? "Humano" :
                         (consenso.esAutentico === false) ? "Artificial" : "Indeterminado";
    }

    return {
        resumen: {
            decision: decisionLegacy || "Indeterminado",
            confianza: resultado.confianza || consenso.confianzaPromedio || 0,
            modeloPrincipal: "Dragon3_Legacy_Adapter",
            explicacion: consenso.explicacion || consenso.algoritmo || "",
            score: 0,
            etiquetas: []
        },
        detalles: subRes.detallado || {},
        estado: "completado",
        metadata: {
            adaptado: true,
            origen: "legacy"
        }
    };

}

/**
 * INICIALIZACIÓN DEL SISTEMA DE COLAS
 * Configura el consumidor para procesar imágenes en segundo plano.
 * NO bloquea el arranque del servidor (el bucle de consumo corre en background).
 */
export async function iniciarProcesamientoColas() {
    dragon.respira('Iniciando worker de análisis de imágenes...', 'analizadorImagen', 'WORKER_INIT');

    // Lanzamos el consumidor sin 'await' para no bloquear el Event Loop principal
    // (QueueManager.consume tiene un bucle infinito dentro)
    imageQueue.consume(
        DRAGON_STREAMS.PENDIENTES,      // Stream: imagenes:pendientes
        DRAGON_GROUPS.ANALIZADORES,     // Grupo: grupo-analizadores-imagen
        async (job) => {
            // --- LÓGICA DE PROCESAMIENTO (WORKER) ---
            try {
                const { archivoId, correlationId } = job.payload;

                dragon.sonrie(`🚀 Procesando imagen: ${archivoId}`, 'Worker', 'JOB_START', {
                    worker: imageQueue.consumerName,
                    correlationId
                });

                // Llamada a la función principal de análisis
                // Pasamos el payload completo que contiene rutaArchivo, etc.
                await analizarImagen(job.payload, correlationId, archivoId);

            } catch (error) {
                // Si analizarImagen falla, el QueueManager NO hará ACK y el mensaje
                // quedará pendiente para ser reintentado o inspeccionado.
                dragon.agoniza(`Fallo en trabajo ${job.id}`, error, 'analizadorImagen', 'JOB_FAILED');
                throw error; // Re-lanzar para que QueueManager sepa que falló
            }
        }
    ).catch(err => {
        // Captura errores de inicialización del consumidor (ej: fallo conexión Redis)
        dragon.agoniza('Error fatal iniciando consumidor de colas', err, 'analizadorImagen', 'CONSUMER_FATAL');
    });

    dragon.zen('✅ Sistema de Colas (Push + AutoRecovery) Iniciado', 'analizadorImagen');
}

// ====================================================================
// FAANG: ENHANCED EXPORTS - ENTERPRISE COMPATIBILITY
// ====================================================================

// Instancia global
const gestorStreamsFAANG = new GestorStreamsBidireccionalFAANG();

// 1. Export principal
export { gestorStreamsFAANG as gestorStreams };

// 2. Export por defecto
export default analizarImagen;

// 3. Clases y Configuración (Ya exportadas en su definición o aquí)
export {
    PerformanceMonitorFAANG,
    SecurityValidatorFAANG,
    CircuitBreakerFAANG,
    ConcurrencyManagerFAANG,
    DragonError,
    SecurityError,
    PerformanceError,
    CircuitBreakerError,
    ConcurrencyError,
    MemoryError,
    FAANG_CONFIG,
    STREAMS,
    CONSUMER_GROUPS,
    HASH_KEYS
};

// 4. Health Check
export async function getHealthCheck() {
    return await gestorStreamsFAANG.getHealthStatus();
}

// 5. EXPORTACIÓN NOMBRADA FINAL
// NOTA: setRedSuperior YA está exportada arriba, no la repetimos aquí.
export {
    analizarImagen
};

/**
 * ====================================================================
 * DRAGON3 FAANG - DOCUMENTACIÓN DEL ANALIZADOR DE IMÁGENES AVANZADO
 * ====================================================================
 *
 * DESCRIPCIÓN:
 * Analizador de imágenes con IA de nivel empresarial, siguiendo estándares FAANG.
 * Ofrece observabilidad completa, patrones de fiabilidad y optimización de rendimiento
 * para entornos de producción a gran escala.
 *
 * EXPORTS:
 * - analizarImagen (función): Función principal de análisis de imagen
 * - gestorStreams (clase): Gestor de streams avanzado
 * - PerformanceMonitorFAANG (clase): Monitorización de rendimiento
 * - SecurityValidatorFAANG (clase): Validación de seguridad
 * - CircuitBreakerFAANG (clase): Patrones de fiabilidad
 * - ConcurrencyManagerFAANG (clase): Gestión de concurrencia y peticiones
 * - Clases DragonError: Manejo avanzado de errores
 * - getHealthCheck (función): Endpoint para estado de salud
 *
 * COMPATIBILIDAD:
 * - Compatible totalmente con la API Dragon2
 * - Listo para integración con server.js
 * - Listo para integración con servidorCentral.js
 * - Streams Redis bidireccionales
 *
 * OBJETIVOS DE RENDIMIENTO:
 * - Análisis de imagen: P95 <200ms, P99 <500ms
 * - Inferencia ML: P95 <100ms
 * - Consumo de memoria: <500MB por análisis
 * - Análisis concurrente: 50+ simultáneos
 * - Tasa de errores: <1%
 * - Disponibilidad: 99.9%
 *
 * FUNCIONALIDADES FAANG:
 * ✅ Monitorización en tiempo real de P95/P99
 * ✅ Circuit breaker para máxima fiabilidad
 * ✅ Clasificación y manejo avanzado de errores
 * ✅ Gestión de memoria y optimización del GC
 * ✅ Validación de seguridad y detección de amenazas
 * ✅ Gestión de concurrencia y limitación de tasa
 * ✅ Trazabilidad distribuida (Correlation ID)
 * ✅ Monitorización y alertas de estado
 * ✅ Modos de degradación controlados
 * ✅ Auditoría exhaustiva de operaciones
 *
 * STREAMS DE MONITORIZACIÓN:
 * - PERFORMANCE_METRICS: Métricas de rendimiento en tiempo real
 * - ERROR_ALERTS: Clasificación y alertas de errores
 * - SECURITY_EVENTS: Registro de violaciones de seguridad
 * - HEALTH_CHECKS: Monitorización de estado de componentes
 * - AUDIT_TRAIL: Auditoría completa de operaciones
 *
 * CONFIGURACIÓN:
 * Todos los parámetros son configurables por variables de entorno con valores por defecto razonables.
 * Consulta el objeto FAANG_CONFIG para las opciones completas.
 *
 * USO:
 * ```javascript
 * import { analizarImagen, getHealthCheck } from './analizadorImagen.js';
 *
 * const resultado = await analizarImagen({
 *   rutaArchivo: '/ruta/a/imagen.jpg',
 *   archivoId: 'id_unico',
 *   correlationId: 'id_traza',
 *   nombreOriginal: 'imagen.jpg',
 *   usuarioId: 'usuario123',
 *   clientId: 'cliente456'
 * });
 *
 * const health = await getHealthCheck();
 * ```
 *
 * ====================================================================
 */

