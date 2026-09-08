/**
 * ====================================================================
 * DRAGON3 - SERVIDOR CENTRAL WEBSOCKET FAANG ENTERPRISE (VERSIÓN UNIFICADA)
 * ====================================================================
 *
 * Archivo: servicios/servidorCentral.js
 * Proyecto: Dragon3 - Sistema Autentificación IA Enterprise
 * Versión: 6.0.0-FAANG
 * Fecha: 2025-11-10
 * Autor: Gustavo Herráiz (@GustavoHerraiz) - Lead Architect
 *
 * DESCRIPCIÓN:
 * Servidor central WebSocket + Redis Streams + Pub/Sub que orquesta
 * comunicación entre el frontend, analizadorImagen.js y redSuperior.js.
 * Implementa patrones FAANG de observabilidad, resiliencia, seguridad,
 * trazabilidad, circuit breaker y performance tracking P95/P99.
 *
 * CONTRATOS:
 * - server.js: crearServidorCentralFAANG(...) retorna instancia con:
 *   setRedSuperior(), startSuperiorStreamConsumer(), getHealthStatus(), gracefulShutdown()
 * - analizadorImagen.js: servidorCentral publica respuestas en
 *   dragon3:stream:res:superior con {archivoId, correlationId, respuesta, timestamp}
 * - redSuperior.js: usa redSuperior.predecir(features, { correlationId, archivoId })
 *
 * ====================================================================
 */

// servicios/servidorCentral.js

import { WebSocketServer } from 'ws';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import crypto from 'node:crypto';
import os from 'node:os';

import * as ort from 'onnxruntime-node';
import dragon, { dragonLogger } from '../utilidades/logger.js';
import connectionManager from '../utilidades/redis/core/ConnectionManager.js';
import * as StreamManager from '../utilidades/redis/StreamManager.js';
import redSuperiorSingleton, { redSuperior as redSuperiorExport } from './redSuperior/redSuperior.js';
import * as tf from '@tensorflow/tfjs-node';

// 🎯 IMPORTACIONES CORREGIDAS: Traemos los túneles específicos
import mainRedisClient, { rawRedisClient, analysisRedisClient } from '../utilidades/redis/core/RedisClient.js';
import { SERVICE_PRIORITIES } from '../utilidades/redis/core/constants.js';

import { convertir90a20 } from '../utilidades/featureConverter.js'

// NOTA: Si tienes redisPublisher / redisSubscriber en server.js, se inyectan en factory

// ====================================================================
// CONSTANTES PRINCIPALES
// ====================================================================
const NOMBRE_MODULO = 'servidorCentral';
const VERSION_MODULO = '6.0.0-FAANG';

// ==== Superior Request Processing (Redis, sin loops) ====
const REQ_STREAM_SUPERIOR = 'dragon3:stream:req:superior';
const REQ_GROUP_SUPERIOR  = 'servidor-central-superior'; // grupo exclusivo del Servidor Central
const CONSUMER_ID_SUPERIOR = `${os.hostname()}-${process.pid}-sc-sup`;

const STREAMS = {
  REQUEST_SUPERIOR: 'dragon3:stream:req:superior',
  RESPONSE_SUPERIOR: 'dragon3:stream:res:superior'
};
const RES_STREAM_GLOBAL = STREAMS.RESPONSE_SUPERIOR;

const CONSUMER_GROUPS = {
  SUPERIOR_PROCESSORS: 'dragon3-superior-processors'
};

const CHANNELS = {
  NOTIFICATIONS_SUPERIOR: 'dragon3:notifications:superior',
  RESPONSE_NOTIFICATIONS: 'dragon3:notifications:respuesta',
  HEARTBEAT: 'dragon3:heartbeat',
  PERFORMANCE_METRICS: 'dragon3:performance:websocket'
};

// ====================================================================
// INICIALIZACIÓN DE CONEXIONES DEDICADAS
// ====================================================================

// ====================================================================
// INICIALIZACIÓN DE CONEXIONES DEDICADAS (MODO RESILIENCIA)
// ====================================================================

// 1. Cliente Principal
const mainClientInstance = mainRedisClient; // Es el main-client del core

connectionManager.registerClient('server-main', {
    client: mainClientInstance.client,
    serviceName: 'MainServer',
    priority: 'CRITICAL'
});

// 2. Cliente para Streams (RS)
const streamClientInstance = analysisRedisClient;

connectionManager.registerClient('server-streams', {
    client: streamClientInstance.client,
    serviceName: 'SuperiorStreamProcessor',
    priority: 'HIGH'
});



// Error classes (Enterprise)
class DragonWebSocketError extends Error {
  constructor(message, code, severity, domain, metadata = {}) {
    super(message);
    this.name = 'DragonWebSocketError';
    this.code = code;
    this.severity = severity;
    this.domain = domain;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

class ConnectionError extends DragonWebSocketError {
  constructor(message, connectionId, metadata = {}) {
    super(message, 'CONNECTION_ERROR', 'medium', 'connection', { connectionId, ...metadata });
    this.retryable = true;
  }
}

class MessageProcessingError extends DragonWebSocketError {
  constructor(message, messageType, processingTime, metadata = {}) {
    super(message, 'MESSAGE_PROCESSING_ERROR', 'medium', 'websocket', {
      messageType, processingTime, ...metadata
    });
    this.retryable = true;
  }
}

class RedisCommError extends DragonWebSocketError {
  constructor(message, operation, metadata = {}) {
    super(message, `REDIS_${operation.toUpperCase()}_ERROR`, 'high', 'redis', { operation, ...metadata });
    this.alertRequired = true;
    this.retryable = operation !== 'connection_failed';
  }
}

class RateLimitError extends DragonWebSocketError {
  constructor(message, connectionId, currentRate, limit, metadata = {}) {
    super(message, 'RATE_LIMIT_EXCEEDED', 'medium', 'security', {
      connectionId, currentRate, limit,
      utilizationPercent: Math.round((currentRate / limit) * 100),
      ...metadata
    });
    this.retryable = false;
  }
}

// ====================================================================
// CONFIGURACIÓN FAANG (usa variables de entorno con defaults)
// ====================================================================
const FAANG_CONFIG = {
  performance: {
    websocketConnectionP95: parseInt(process.env.WS_CONN_P95_MS) || 100,
    websocketConnectionP99: parseInt(process.env.WS_CONN_P99_MS) || 200,
    messageProcessingP95: parseInt(process.env.MSG_PROC_P95_MS) || 50,
    messageProcessingP99: parseInt(process.env.MSG_PROC_P99_MS) || 100,
    redisStreamP95: parseInt(process.env.REDIS_STREAM_P95_MS) || 50,
    memoryLimitMB: parseInt(process.env.WS_MEMORY_LIMIT_MB) || 200,
    gcThresholdMB: parseInt(process.env.GC_THRESHOLD_MB) || 150
  },
  connections: {
    maxConnections: parseInt(process.env.MAX_WS_CONNECTIONS) || 1000,
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 30000,
    inactiveTimeout: parseInt(process.env.INACTIVE_CONN_TIMEOUT_MS) || 300000,
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    rateLimitMessages: parseInt(process.env.RATE_LIMIT_MESSAGES) || 120
  },
  circuitBreaker: {
    errorThreshold: parseInt(process.env.WS_ERROR_THRESHOLD) || 10,
    recoveryTime: parseInt(process.env.WS_RECOVERY_TIME_MS) || 30000,
    monitoringWindow: parseInt(process.env.WS_MONITORING_WINDOW_MS) || 300000,
    halfOpenMaxRequests: parseInt(process.env.WS_HALF_OPEN_MAX) || 5
  },
  security: {
    allowedOrigins: (process.env.ALLOWED_WS_ORIGINS || '*').split(','),
    maxMessageSize: parseInt(process.env.MAX_MESSAGE_SIZE_BYTES) || 1_048_576,
    enableMessageValidation: process.env.MESSAGE_VALIDATION_ENABLED !== 'false'
  }
};
// ====================================================================
// PERFORMANCE MONITOR
// ====================================================================
class WebSocketPerformanceMonitor {
  constructor() {
    this.metrics = {
      connectionTimes: [],
      messageProcessingTimes: [],
      streamProcessingTimes: [],
      memoryUsage: [],
      errorCounts: new Map(),
      connections: []
    };
    this.alertThresholds = {
      connectionP95: FAANG_CONFIG.performance.websocketConnectionP95,
      messageProcessingP95: FAANG_CONFIG.performance.messageProcessingP95,
      redisStreamP95: FAANG_CONFIG.performance.redisStreamP95
    };
    this.lastAlerts = new Map();
    this.alertCooldownMs = 60000;
    this.performanceObserver = new PerformanceObserver(list =>
      this._handleEntries(list.getEntries())
    );
    this.performanceObserver.observe({ entryTypes: ['measure', 'mark'] });
  }
  _handleEntries(entries) {
    for (const e of entries) {
      if (e.name.startsWith('ws:conn:')) this._record(this.metrics.connectionTimes, e.duration);
      if (e.name.startsWith('ws:msg:')) this._record(this.metrics.messageProcessingTimes, e.duration);
      if (e.name.startsWith('ws:stream:')) this._record(this.metrics.streamProcessingTimes, e.duration);
    }
  }
  _record(arr, val) {
    arr.push(val);
    const maxLen = 1000;
    if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
  }
  recordConnectionChange(active) {
    this.metrics.connections.push({ ts: Date.now(), active });
    if (this.metrics.connections.length > 1000) {
      this.metrics.connections = this.metrics.connections.slice(-1000);
    }
  }
  incrementErrorCount(type) {
    const cur = this.metrics.errorCounts.get(type) || 0;
    this.metrics.errorCounts.set(type, cur + 1);
  }
  _percentile(arr, p) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(s.length * p);
    return s[Math.min(idx, s.length - 1)];
  }
  getSummary() {
    const conn = this.metrics.connectionTimes;
    const msg = this.metrics.messageProcessingTimes;
    const stream = this.metrics.streamProcessingTimes;
    return {
      connections: {
        count: conn.length,
        p95: Math.round(this._percentile(conn, 0.95) * 100) / 100,
        average: conn.length ? Math.round((conn.reduce((a, b) => a + b, 0) / conn.length) * 100) / 100 : 0
      },
      messages: {
        count: msg.length,
        p95: Math.round(this._percentile(msg, 0.95) * 100) / 100,
        average: msg.length ? Math.round((msg.reduce((a, b) => a + b, 0) / msg.length) * 100) / 100 : 0
      },
      streams: {
        count: stream.length,
        p95: Math.round(this._percentile(stream, 0.95) * 100) / 100,
        average: stream.length ? Math.round((stream.reduce((a, b) => a + b, 0) / stream.length) * 100) / 100 : 0
      },
      errors: Object.fromEntries(this.metrics.errorCounts)
    };
  }
}

// ====================================================================
// CIRCUIT BREAKER
// ====================================================================
class WebSocketCircuitBreaker {
  constructor(config = {}) {
    this.errorThreshold = config.errorThreshold || FAANG_CONFIG.circuitBreaker.errorThreshold;
    this.recoveryTime = config.recoveryTime || FAANG_CONFIG.circuitBreaker.recoveryTime;
    this.halfOpenMaxRequests = config.halfOpenMaxRequests || FAANG_CONFIG.circuitBreaker.halfOpenMaxRequests;
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;
  }
  onSuccess() {
    this.successes++;
    if (this.state === 'HALF_OPEN' && this.successes >= this.halfOpenMaxRequests) {
      this.state = 'CLOSED';
      this.failures = 0;
      this.successes = 0;
      this.halfOpenRequests = 0;
    }
  }
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this._open();
    } else if (this.state === 'CLOSED' && this.failures >= this.errorThreshold) {
      this._open();
    }
  }
  _open() {
    this.state = 'OPEN';
  }
  shouldAttemptReset() {
    return this.state === 'OPEN' && this.lastFailureTime && (Date.now() - this.lastFailureTime) >= this.recoveryTime;
  }
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes
    };
  }
}

// ====================================================================
// SECURITY VALIDATOR
// ====================================================================
class WebSocketSecurityValidator {
  constructor() {
    this.suspiciousPatterns = new Set([
      '<script', 'javascript:', 'eval(', 'onerror=', 'onload=', 'prompt(',
      'document.cookie', 'window.location'
    ]);
    this.blockedIPs = new Set((process.env.BLOCKED_WS_IPS || '').split(',').filter(Boolean));
  }
  async validateConnection(req, connectionId) {
    const ip = req.socket.remoteAddress;
    if (this.blockedIPs.has(ip)) {
      throw new ConnectionError(`IP bloqueada: ${ip}`, connectionId, { ip });
    }
    return { valid: true, ip };
  }
  async validateMessage(raw, connectionId) {
    if (raw.length > FAANG_CONFIG.security.maxMessageSize) {
      throw new MessageProcessingError('Mensaje supera tamaño máximo', 'oversized', 0, {
        size: raw.length,
        limit: FAANG_CONFIG.security.maxMessageSize,
        connectionId
      });
    }
    const lower = raw.toLowerCase();
    for (const p of this.suspiciousPatterns) {
      if (lower.includes(p)) {
        throw new MessageProcessingError('Patrón sospechoso detectado', 'suspicious_content', 0, {
          pattern: p,
          connectionId
        });
      }
    }
    return true;
  }
  maskIP(ip) {
    if (!ip) return 'unknown';
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.xxx.xxx` : ip;
  }
  getSecuritySummary() {
    return {
      suspiciousPatterns: this.suspiciousPatterns.size,
      blockedIPs: this.blockedIPs.size
    };
  }
}

// ====================================================================
// CONNECTION MANAGER
// ====================================================================
class WebSocketConnectionManager {
  constructor(maxConnections = FAANG_CONFIG.connections.maxConnections) {
    this.maxConnections = maxConnections;
    this.connections = new Map();
    this.metrics = {
      totalConnections: 0,
      peakConnections: 0,
      rateLimitViolations: 0,
      connectionDurations: []
    };
    this.rateLimiter = new Map();
  }
  async addConnection(ws, connectionId, clientIP) {
    if (this.connections.size >= this.maxConnections) {
      throw new ConnectionError(
        `Máximo de conexiones alcanzado ${this.connections.size}/${this.maxConnections}`,
        connectionId,
        { max: this.maxConnections }
      );
    }
    const now = Date.now();
    this.connections.set(connectionId, {
      ws, clientIP, connectTime: now, lastActivity: now, messageCount: 0, errorCount: 0
    });
    this.metrics.totalConnections++;
    if (this.connections.size > this.metrics.peakConnections) this.metrics.peakConnections = this.connections.size;
    this.rateLimiter.set(connectionId, {
      messageCount: 0,
      resetTime: now + FAANG_CONFIG.connections.rateLimitWindow
    });
    return this.connections.get(connectionId);
  }
  removeConnection(connectionId, reason = 'normal_close') {
    const info = this.connections.get(connectionId);
    if (info) {
      const dur = Date.now() - info.connectTime;
      this.metrics.connectionDurations.push(dur);
      this.connections.delete(connectionId);
      this.rateLimiter.delete(connectionId);
    }
  }
  updateActivity(connectionId) {
    const info = this.connections.get(connectionId);
    if (info) {
      info.lastActivity = Date.now();
      info.messageCount++;
    }
  }
  checkRateLimit(connectionId) {
    const rl = this.rateLimiter.get(connectionId);
    if (!rl) return true;
    const now = Date.now();
    if (now >= rl.resetTime) {
      rl.messageCount = 1;
      rl.resetTime = now + FAANG_CONFIG.connections.rateLimitWindow;
      return true;
    }
    if (rl.messageCount >= FAANG_CONFIG.connections.rateLimitMessages) {
      this.metrics.rateLimitViolations++;
      throw new RateLimitError(
        'Rate limit excedido',
        connectionId,
        rl.messageCount,
        FAANG_CONFIG.connections.rateLimitMessages,
        { timeToReset: rl.resetTime - now }
      );
    }
    rl.messageCount++;
    return true;
  }
  getConnectionInfo(connectionId) {
    return this.connections.get(connectionId);
  }
  getConnectionMetrics() {
    const avgDur = this.metrics.connectionDurations.length
      ? this.metrics.connectionDurations.reduce((a, b) => a + b, 0) / this.metrics.connectionDurations.length
      : 0;
    return {
      activeConnections: this.connections.size,
      totalConnections: this.metrics.totalConnections,
      peakConnections: this.metrics.peakConnections,
      averageDurationMs: Math.round(avgDur),
      rateLimitViolations: this.metrics.rateLimitViolations,
      utilizationPercent: Math.round((this.connections.size / this.maxConnections) * 100)
    };
  }
  async gracefulShutdown() {
    for (const [id, info] of this.connections.entries()) {
      try { info.ws.close(1001, 'shutdown'); } catch {}
      this.removeConnection(id, 'shutdown');
    }
  }
}
// ====================================================================
// FEATURE EXTRACTOR
// ====================================================================
class FeatureExtractor {
  async extraer(bufferImagen, opciones = {}) {
    const correlationId = opciones.correlationId || crypto.randomUUID();
    const start = performance.now();
    try {
      const result = await tf.tidy(() => {
        const img = tf.node.decodeImage(bufferImagen, 3);
        const resized = tf.image.resizeBilinear(img, [224, 224]);
        const normalized = resized.div(255.0).expandDims(0);
        return {
          valores: Array.from(normalized.dataSync()),
          shape: normalized.shape,
          tipo: opciones.tipo || 'imagen',
          timestamp: Date.now()
        };
      });
      const dur = performance.now() - start;
      dragonLogger.zen('Features extraídas', NOMBRE_MODULO, 'FEATURES_OK', {
        correlationId, durMs: Math.round(dur)
      });
      return result;
    } catch (e) {
      dragonLogger.agoniza('Error extrayendo features', e, NOMBRE_MODULO, 'FEATURES_ERROR', {
        correlationId
      });
      throw e;
    }
  }
}

// ====================================================================
// SERVIDOR CENTRAL FAANG ENTERPRISE - VERSION CORREGIDA (ANTI-FATAL)
// ====================================================================
export class ServidorCentralFAANG {
  constructor(
    puerto,
    redisPublisher = null,
    redisSubscriber = null,
    redSuperiorInstance = null,
    customServer = null,
    config = {}
  ) {
    const initStart = performance.now();
    this.version = VERSION_MODULO;
    this.puerto = puerto;
    this.customServer = customServer;
    this.config = config;

    // 1. 🛡️ EXTRACCIÓN Y VALIDACIÓN DE MOTORES REDIS
    const rawMain = mainRedisClient?.client;
    const rawStream = rawRedisClient;

    this.redis = (typeof rawMain === 'object' && rawMain !== null) ? rawMain : null;
    this.redisSub = this.redis;

    // Fallback a objeto seguro para evitar undefined.showFriendlyErrorStack en streams
    this.rawRedisClient = (typeof rawStream === 'object' && rawStream !== null) ? rawStream : null;
    this.streamRedis = this.rawRedisClient;

    // 2. 🎯 REGISTRO DE OBSERVABILIDAD BLINDADO (Solución al error isInitializing en string)
    if (connectionManager?.registerClient) {
        const safeRegister = (id, motor, priority) => {
            const clientToRegister = (typeof motor === 'object' && motor !== null)
                ? motor
                : { status: motor || 'initializing', isProxy: true };

            connectionManager.registerClient(id, {
                client: clientToRegister,
                clientId: id,
                priority: priority
            });
        };

        safeRegister('server-main', this.redis, 'CRITICAL');
        safeRegister('server-streams', this.rawRedisClient, 'HIGH');
    }

    // 3. 📊 ESTADO GENERAL
    this.healthStatus = {
      websocket: 'initializing',
      redis: this.redis?.status === 'ready' ? 'ready' : 'unavailable',
      redSuperior: 'pending',
      circuitBreaker: 'closed',
      performance: 'optimal'
    };

    this.startTime = Date.now();
    this.totalMessages = 0;
    this.totalErrors = 0;
    this.consumerActive = false;
    this.consumerLoopAbort = false;

    // 4. 🌀 PROPIEDADES PARA WORKER ASÍNCRONO
    this._pendingRequests = new Map();
    this._respConsumerActive = false;
    this._respConsumerAbort = false;

    // 5. 🛠️ COMPONENTES DE INFRAESTRUCTURA
    this.performanceMonitor = new WebSocketPerformanceMonitor();
    this.circuitBreaker = new WebSocketCircuitBreaker();
    this.securityValidator = new WebSocketSecurityValidator();
    this.connectionManager = new WebSocketConnectionManager();
    this.extractorFeatures = new FeatureExtractor();
    this.redSuperior = null;

    // Inyectar Red Superior
    if (redSuperiorInstance) {
      this.setRedSuperior(redSuperiorInstance);
    }

    // 6. 🌐 CONFIGURACIÓN WEBSOCKET SERVER
    if (!this.customServer) {
      const err = new Error('customServer (http.Server) requerido');
      dragonLogger.agoniza('customServer faltante', err, NOMBRE_MODULO, 'CUSTOM_SERVER_MISSING');
      throw err;
    }

    const WS_PORT = 8081;
this.wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' });
console.log(`✅ WebSocket server escuchando en puerto ${WS_PORT}`);

    // 7. 🚀 INICIALIZACIÓN DE HANDLERS Y EYE
    this._setupWebSocketHandlers();
    this.inicializarDragonEye();
    this.setupEventListeners();

    // 8. 🏁 LOG FINAL DE ÉXITO ÚNICO
    const initDur = performance.now() - initStart;
    dragonLogger.zen('ServidorCentralFAANG inicializado correctamente', NOMBRE_MODULO, 'SC_INIT_OK', {
      durMs: Math.round(initDur),
      puerto: this.puerto,
      version: this.version,
      hasRedis: !!this.redis
    });
    this._knnModule = null;
this._knnInicializado = false;
  }



  // Inyección / reasignación de Red Superior
  setRedSuperior(red) {
    try {
      if (!red || typeof red !== 'object' || typeof red.predecir !== 'function') {
        throw new Error('Red Superior inválida (requiere predecir())');
      }
      this.redSuperior = red;
      this.healthStatus.redSuperior = 'ready';
      dragonLogger.sonrie('Red Superior asignada', NOMBRE_MODULO, 'RED_SUPERIOR_SET', {
        versionRed: red.version || 'unknown'
      });
      return true;
    } catch (e) {
      dragonLogger.agoniza('Error asignando Red Superior', e, NOMBRE_MODULO, 'RED_SUPERIOR_SET_ERROR', {
        error: e.message
      });
      this.redSuperior = {
        predecir: async () => ({ degraded: true, categoria: 'timeout', confianza: 0 })
      };
      this.healthStatus.redSuperior = 'fallback';
      return false;
    }
  }
    async _ensureStreams() {
  // No-op: el stream/grupo de requests se crea en iniciarSuperiorRequestProcessor().
  // No sembramos RESPUESTA_SUPERIOR global (usamos resp:superior:{archivoId} por solicitud).
  return;
}


  async _handleWSMessage(mensaje, ws, connectionId) {
  const start = performance.now();
  this.totalMessages++;

  // Validación rápida
  if (mensaje.length > FAANG_CONFIG.security.maxMessageSize) {
    ws.send(JSON.stringify({ type: 'error', error: 'message_too_large' }));
    return;
  }

  // Seguridad de contenido
  try {
    await this.securityValidator.validateMessage(mensaje, connectionId);
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', error: 'security_violation' }));
    return;
  }

  let data;
  try { data = JSON.parse(mensaje); } catch {
    ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
    return;
  }

  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', connectionId, ts: Date.now() }));
      break;
    case 'analysis_request':
      await this._processAnalysisRequest(ws, connectionId, data);
      break;
    case 'health_check':
      ws.send(JSON.stringify({
        type: 'health_response',
        status: 'ok',
        connectionId,
        version: this.version,
        timestamp: new Date().toISOString()
      }));
      break;
    case 'service_register':
      ws.send(JSON.stringify({ type: 'service_registered', connectionId, ts: Date.now() }));
      break;
    case 'request_explanation':
      await this._handleExplanationRequest(ws, connectionId, data);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', error: `unknown_type:${data.type}` }));
  }

  const duration = performance.now() - start;
  this.performanceMonitor._record(this.performanceMonitor.metrics.messageProcessingTimes, duration);
}

_setupWebSocketHandlers() {
  this.wss.on('connection', (ws, req) => {
    const connectionId = crypto.randomUUID();
    const clientIP = req?.socket?.remoteAddress || 'unknown';
    let securityResult = { valid: true };
    try {
      securityResult = this.securityValidator.validateConnection(req, connectionId);
    } catch (e) {
      ws.close(1008, 'security_rejected');
      return;
    }
    this.connectionManager.addConnection(ws, connectionId, clientIP);
    this.performanceMonitor.recordConnectionChange(this.connectionManager.getConnectionMetrics().activeConnections);
    ws.send(JSON.stringify({
      type: 'connected',
      connectionId,
      status: 'ready',
      version: this.version,
      timestamp: new Date().toISOString()
    }));
    dragonLogger.respira('Cliente WebSocket conectado', NOMBRE_MODULO, 'WS_CONN', {
      connectionId,
      ipMasked: this.securityValidator.maskIP(clientIP)
    });
    const self = this; // para preservar el contexto
    ws.on('message', async raw => {
      try {
        self.connectionManager.checkRateLimit(connectionId);
        await self._handleWSMessage(raw.toString(), ws, connectionId);
      } catch (e) {
        if (e instanceof RateLimitError) {
          ws.send(JSON.stringify({ type: 'error', error: 'rate_limit_exceeded', retryable: false }));
        } else {
          ws.send(JSON.stringify({ type: 'error', error: e.message }));
        }
      }
    });
    ws.on('close', (code) => {
      this.connectionManager.removeConnection(connectionId, this._closeReason(code));
      this.performanceMonitor.recordConnectionChange(this.connectionManager.getConnectionMetrics().activeConnections);
    });
    ws.on('error', (err) => {
      this.performanceMonitor.incrementErrorCount('ws_error');
      dragonLogger.sePreocupa('Error WebSocket', NOMBRE_MODULO, 'WS_ERROR', { error: err.message });
    });
  });
  this.wss.on('error', (err) => {
    this.performanceMonitor.incrementErrorCount('wss_error');
    dragonLogger.agoniza('Error servidor WebSocket', err, NOMBRE_MODULO, 'WSS_FATAL');
  });
}



  _closeReason(code) {
    const reasons = {
      1000: 'normal_close',
      1001: 'going_away',
      1002: 'protocol_error',
      1006: 'abnormal_closure',
      1008: 'policy_violation',
      1011: 'internal_error'
    };
    return reasons[code] || `code_${code}`;
  }

  async _handleExplanationRequest(ws, connectionId, data) {
  const archivoId = data.archivoId;
  if (!archivoId) {
    ws.send(JSON.stringify({ type: 'explanation_error', error: 'archivoId requerido' }));
    return;
  }

  const redis = this.rawRedisClient;
  if (!redis) {
    ws.send(JSON.stringify({ type: 'explanation_error', error: 'Redis no disponible' }));
    return;
  }

  let analysisData;
  try {
    const stored = await redis.get(`dragon3:analysis:${archivoId}`);
    if (!stored) {
      ws.send(JSON.stringify({ type: 'explanation_error', error: 'No se encontraron datos del análisis' }));
      return;
    }
    analysisData = JSON.parse(stored);
  } catch (err) {
    dragonLogger.sePreocupa('Error recuperando datos de análisis', NOMBRE_MODULO, 'EXPLANATION_RETRIEVE_ERROR', {
      archivoId,
      error: err.message
    });
    ws.send(JSON.stringify({ type: 'explanation_error', error: 'Error interno al recuperar datos' }));
    return;
  }

  const { features90, localAnalyzers } = analysisData;
  if (!features90 || !Array.isArray(features90) || features90.length !== 90) {
    ws.send(JSON.stringify({ type: 'explanation_error', error: 'Features inválidos o ausentes' }));
    return;
  }

  // Convertir 90 features → scores de especialistas (media por bloque de 9)
  const scores = [];
  for (let i = 0; i < 90; i += 9) {
    const block = features90.slice(i, i + 9);
    const mean = block.reduce((a, b) => a + b, 0) / 9;
    scores.push(mean);
  }

  const locals = Array.isArray(localAnalyzers) && localAnalyzers.length === 10
    ? localAnalyzers
    : Array(10).fill(0.5);

  const input20 = [...scores, ...locals];

  // Cargar el módulo KNN una sola vez (lazy loading)
  if (!this._knnInicializado) {
    try {
      this._knnModule = await import('./explicabilidad/knnExplicador.js');
      await this._knnModule.cargarConocimiento();
      this._knnInicializado = true;
      dragonLogger.sonrie('Módulo KNN cargado y conocimiento inicializado', NOMBRE_MODULO);
    } catch (err) {
      dragonLogger.agoniza('Error cargando módulo KNN', err, NOMBRE_MODULO, 'KNN_LOAD_ERROR');
      ws.send(JSON.stringify({ type: 'explanation_error', error: 'Servicio de explicación no disponible' }));
      return;
    }
  }

  const knn = this._knnModule;
  const nombresEspecialistas = [
    'exif_camera', 'exif_editing', 'texture', 'gan_artifacts',
    'diffusion_artifacts', 'sharpness', 'compression', 'c2pa',
    'resolution', 'metadata'
  ];

  // Obtener modo detallado (opcional) del cliente
  const modoDetallado = data.modoDetallado === true;

  let explicacion;
  try {
    const opciones = {
      features90: features90,
      nombresEspecialistas: nombresEspecialistas,
      modoDetallado: modoDetallado
    };
    explicacion = knn.generarExplicacionTexto(input20, 5, opciones);
  } catch (err) {
    dragonLogger.agoniza('Error generando explicación KNN', err, NOMBRE_MODULO, 'KNN_EXPLAIN_ERROR');
    ws.send(JSON.stringify({ type: 'explanation_error', error: 'Error al generar explicación' }));
    return;
  }

  ws.send(JSON.stringify({
    type: 'explanation_response',
    archivoId,
    explicacion: explicacion,
    timestamp: new Date().toISOString()
  }));

  dragonLogger.respira('Explicación enviada al cliente', NOMBRE_MODULO, 'EXPLANATION_SENT', {
    archivoId,
    connectionId,
    modoDetallado
  });
}

  /**
 * Procesa una solicitud de análisis recibida por WebSocket.
 * Publica un mensaje en el stream de solicitudes y espera la respuesta del worker.
 * @param {WebSocket} ws - Conexión WebSocket del cliente.
 * @param {string} connectionId - ID único de la conexión.
 * @param {Object} datos - Objeto parseado del mensaje.
 */
async _processAnalysisRequest(ws, connectionId, datos) {
  const correlationId = datos.correlationId || crypto.randomUUID();
  const archivoId = datos.archivoId || 'unknown';

  // 1. Validar que haya features
  const features = Array.isArray(datos.features) ? datos.features : datos.data || [];
  if (!features.length) {
    ws.send(JSON.stringify({
      type: 'analysis_response',
      status: 'error',
      error: 'No features provided',
      connectionId,
      correlationId,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. Preparar payload para el worker
  const payload = {
    features,
    herramientas: datos.herramientas || datos.metadata?.herramientas || [],
    localAnalyzers: datos.localAnalyzers || null
  };

  // 3. Crear promesa para esperar la respuesta
  const responsePromise = new Promise((resolve, reject) => {
    this._pendingRequests.set(correlationId, {
      resolve,
      reject,
      ws,
      connectionId,
      timestamp: Date.now(),
      timeout: setTimeout(() => {
        if (this._pendingRequests.has(correlationId)) {
          this._pendingRequests.delete(correlationId);
          reject(new Error(`Timeout waiting for inference response (${correlationId})`));
        }
      }, 30000) // 30 segundos timeout
    });
  });

  // 4. Publicar mensaje en el stream de solicitudes
  try {
    await this.rawRedisClient.xadd(
      REQ_STREAM_SUPERIOR,
      '*',
      'archivoId', archivoId,
      'correlationId', correlationId,
      'payload', JSON.stringify(payload)
      // No enviamos respStream, usamos el global + correlationId
    );
    dragonLogger.respira('Solicitud publicada en stream', NOMBRE_MODULO, 'REQ_PUBLISHED', {
      correlationId,
      archivoId,
      connectionId
    });
  } catch (err) {
    this._cleanupPending(correlationId);
    dragonLogger.agoniza('Error publicando en stream', err, NOMBRE_MODULO, 'XADD_ERROR', {
      correlationId
    });
    ws.send(JSON.stringify({
      type: 'analysis_response',
      status: 'error',
      error: 'Redis stream unavailable',
      connectionId,
      correlationId,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 5. Esperar la respuesta del worker (o timeout)
  try {
    const resultado = await responsePromise;
    ws.send(JSON.stringify({
      type: 'analysis_response',
      status: 'completed',
      connectionId,
      correlationId,
      archivoId,
      resultado,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    // Timeout u otro error
    if (!ws.readyState === ws.OPEN) return;
    ws.send(JSON.stringify({
      type: 'analysis_response',
      status: 'error',
      error: err.message,
      connectionId,
      correlationId,
      timestamp: new Date().toISOString()
    }));
  }
}

// Método auxiliar para limpiar pending request
_cleanupPending(correlationId) {
  const pending = this._pendingRequests.get(correlationId);
  if (pending) {
    clearTimeout(pending.timeout);
    this._pendingRequests.delete(correlationId);
  }
}
    // ====================================================================
  // REDIS STREAMS SUPERIOR - CONSUMER
  // ====================================================================

  async ensureConsumerGroup() {
    if (!this.rawRedisClient) return;
    try {
      // GROUP exists? attempt create with MKSTREAM
      await this.rawRedisClient.xgroup(
        'CREATE',
        STREAMS.REQUEST_SUPERIOR,
        CONSUMER_GROUPS.SUPERIOR_PROCESSORS,
        '0',
        'MKSTREAM'
      );
    } catch (e) {
      // Ignore BUSYGROUP errors
      if (!/BUSYGROUP/.test(e.message)) {
        dragonLogger.sePreocupa('Fallo al crear grupo consumer', NOMBRE_MODULO, 'GROUP_CREATE_WARN', {
          error: e.message
        });
      }
    }
  }

  parseStreamFields(fieldsArray) {
    const obj = {};
    for (let i = 0; i < fieldsArray.length; i += 2) {
      obj[fieldsArray[i]] = fieldsArray[i + 1];
    }
    return obj;
  }

  async handleStreamMessage(streamName, msgId, fieldArray) {
    const start = performance.now();
    try {
      const fieldsObj = this.parseStreamFields(fieldArray);

      // Payload format: { features } dentro de 'payload'
      let features = null;
      if (fieldsObj.payload) {
        try {
          const parsed = JSON.parse(fieldsObj.payload);
          features = parsed.features;
        } catch (e) {
          dragonLogger.sePreocupa('Error parseando payload', NOMBRE_MODULO, 'PAYLOAD_PARSE_ERROR', {
            msgId, error: e.message
          });
        }
      }
      if (!features && fieldsObj.features) {
        try { features = JSON.parse(fieldsObj.features); } catch { features = null; }
      }
      if (!Array.isArray(features) || !features.length) {
        await this._safeAck(streamName, msgId);
        dragonLogger.sePreocupa('Mensaje sin features válidos, ACK', NOMBRE_MODULO, 'MSG_INVALID_ACK', { msgId });
        return;
      }

      const correlationId = fieldsObj.correlationId || crypto.randomUUID();
      const archivoId = fieldsObj.archivoId || 'unknown';

      let prediccion;
      try {
        prediccion = await this.redSuperior.predecir(features, { correlationId, archivoId });
      } catch (e) {
        prediccion = { degraded: true, categoria: 'error', confianza: 0, error: e.message };
      }

      // Publicar respuesta en el stream específico que espera el analizador
try {
  const streamEspecifico = `dragon3:stream:resp:superior:${archivoId}`; //
  await this.rawRedisClient.xadd(
    streamEspecifico,
    '*',
    'respuesta', JSON.stringify(prediccion),
    'archivoId', archivoId,
    'correlationId', correlationId,
    'timestamp', Date.now().toString()
  );
  // Opcional: ponerle un TTL al stream para que no crezca infinito
  await this.rawRedisClient.expire(streamEspecifico, 60);
} catch (pubErr) {
        dragonLogger.sePreocupa('Error publicando respuesta superior', NOMBRE_MODULO, 'RESPONSE_PUBLISH_ERROR', {
          error: pubErr.message
        });
      }

      // ACK
      await this._safeAck(streamName, msgId);

      const dur = performance.now() - start;
      this.performanceMonitor._record(this.performanceMonitor.metrics.streamProcessingTimes, dur);

      dragonLogger.respira('Mensaje superior procesado', NOMBRE_MODULO, 'STREAM_MSG_OK', {
        msgId, durMs: Math.round(dur), archivoId, correlationId
      });

    } catch (e) {
      this.performanceMonitor.incrementErrorCount('stream_message_error');
      dragonLogger.agoniza('Error procesando mensaje stream', e, NOMBRE_MODULO, 'STREAM_MSG_ERROR', {});
      // ACK incluso si error para evitar bloqueo
      try { await this._safeAck(streamName, msgId); } catch {}
    }
  }

  async _safeAck(streamName, msgId) {
    try {
      await this.rawRedisClient.xack(streamName, CONSUMER_GROUPS.SUPERIOR_PROCESSORS, msgId);
    } catch {}
  }

 async startSuperiorStreamConsumer() {
  if (this._respConsumerActive) return;
  this._respConsumerActive = true;
  this._respConsumerAbort = false;

  dragonLogger.zen('Iniciando consumidor de respuestas (RES_STREAM)', NOMBRE_MODULO, 'RES_CONSUMER_START', {
    stream: RES_STREAM_GLOBAL
  });

  while (!this._respConsumerAbort) {
    try {
      const result = await this.rawRedisClient.xread(
        'BLOCK', 1000,
        'STREAMS', RES_STREAM_GLOBAL, '$'
      );

      if (!result) continue;

      for (const [stream, messages] of result) {
        for (const [msgId, fieldsArray] of messages) {
          const fields = {};
          for (let i = 0; i < fieldsArray.length; i += 2) {
            fields[fieldsArray[i]] = fieldsArray[i + 1];
          }

          const correlationId = fields.correlationId;
          if (!correlationId) {
            dragonLogger.sePreocupa('Respuesta sin correlationId', NOMBRE_MODULO, 'NO_CORRELATION', { msgId });
            continue;
          }

          const pending = this._pendingRequests.get(correlationId);
          if (!pending) {
            dragonLogger.sePreocupa('Respuesta huérfana', NOMBRE_MODULO, 'ORPHAN_RESPONSE', { correlationId });
            continue;
          }

          const resultado = {
            categoria: fields.categoria,
            confianza: parseFloat(fields.confianza),
            scores: fields.scores ? JSON.parse(fields.scores) : null,
            metadata: {
              timestamp: parseInt(fields.timestamp, 10),
              archivoId: fields.archivoId
            }
          };

          pending.resolve(resultado);
          this._cleanupPending(correlationId);

          dragonLogger.respira('Respuesta entregada', NOMBRE_MODULO, 'RESPONSE_DELIVERED', {
            correlationId,
            categoria: resultado.categoria
          });
        }
      }
    } catch (err) {
      if (!this._respConsumerAbort && !err.message.includes('timeout')) {
        dragonLogger.agoniza('Error en consumidor', err, NOMBRE_MODULO, 'RES_CONSUMER_ERROR');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  this._respConsumerActive = false;
  dragonLogger.respira('Consumidor detenido', NOMBRE_MODULO, 'RES_CONSUMER_STOP');
}

    // ====================================================================
  // HEALTH STATUS
  // ====================================================================
  async getHealthStatus() {
    try {
      const connectionMetrics = this.connectionManager.getConnectionMetrics();
      const performanceSummary = this.performanceMonitor.getSummary();
      const circuitState = this.circuitBreaker.getState();
      const uptimeMs = Date.now() - this.startTime;
      let status = 'ok';
      const issues = [];
      if (circuitState.state === 'OPEN') {
        status = 'degraded';
        issues.push('circuit_open');
      }
      if (connectionMetrics.utilizationPercent > 90) {
        status = status === 'ok' ? 'stressed' : status;
        issues.push('high_connection_utilization');
      }
      return {
        status,
        issues,
        version: this.version,
        uptimeSeconds: Math.round(uptimeMs / 1000),
        timestamp: new Date().toISOString(),
        components: {
          websocket: { active: !!this.wss, port: this.puerto },
          redis: { status: this.redis ? 'connected' : 'unavailable' },
          circuitBreaker: circuitState
        },
        performance: performanceSummary
      };
    } catch (e) {
      dragonLogger.agoniza('Error health status', e, NOMBRE_MODULO, 'HEALTH_STATUS_ERROR');
      return {
        status: 'error',
        error: e.message,
        version: this.version,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ====================================================================
// GRACEFUL SHUTDOWN
// ====================================================================
async gracefulShutdown() {
  try {
    dragonLogger.respira('Iniciando graceful shutdown', NOMBRE_MODULO, 'SHUTDOWN_START');

    // 1. Detener el consumidor de respuestas (worker → servidor)
    this._respConsumerAbort = true;
    let attempts = 0;
    while (this._respConsumerActive && attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    // 2. Rechazar todas las promesas pendientes (solicitudes de análisis en curso)
    for (const [correlationId, pending] of this._pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server shutdown'));
      this._pendingRequests.delete(correlationId);
    }

    // 3. Detener consumidores antiguos (si los hubiera)
    this.consumerLoopAbort = true;
    this.consumerActive = false;

    // 4. Cerrar servidor WebSocket
    if (this.wss) {
      const closePromise = new Promise(resolve => {
        try {
          this.wss.close(() => resolve());
        } catch {
          resolve();
        }
      });
      await closePromise;
    }

    // 5. Cerrar gestor de conexiones WebSocket
    await this.connectionManager.gracefulShutdown();

    // 6. Cerrar conexiones Redis (si fueron inyectadas)
    try { await this.redis?.quit?.(); } catch {}
    try { if (this.redisSub && this.redisSub !== this.redis) await this.redisSub.quit(); } catch {}

    dragonLogger.zen('ServidorCentral apagado correctamente', NOMBRE_MODULO, 'SHUTDOWN_OK', {
      totalMessages: this.totalMessages,
      totalErrors: this.totalErrors
    });
  } catch (e) {
    dragonLogger.agoniza('Error en shutdown', e, NOMBRE_MODULO, 'SHUTDOWN_ERROR');
  }
}

  // ====================================================================
  // DRAGON EYE (SENSORES INTERNOS)
  // ====================================================================
  inicializarDragonEye() {
    this.DragonEye = {
      sensor: new Map(),
      pulse: (name, metrics) => {
        this.DragonEye.sensor.set(name, {
          ts: Date.now(),
          metrics,
          status: 'alive'
        });
      },
      get: (name) => this.DragonEye.sensor.get(name),
      all: () => Object.fromEntries(this.DragonEye.sensor.entries())
    };
  }

  setupEventListeners() {
  this._shuttingDown = false;
  const onSignal = async (sig) => {
    if (this._shuttingDown) return;
    this._shuttingDown = true;
    dragonLogger.respira(`${sig} recibido`, NOMBRE_MODULO, sig);
    try {
      await this.gracefulShutdown();
      await this.redSuperior?.shutdown?.();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    dragonLogger.agoniza('UNHANDLED REJECTION', err, NOMBRE_MODULO, 'UNHANDLED_REJECTION');
  });
}
}

// [CODE] - ServidorCentral.js (Request Processor Corregido)
async function iniciarSuperiorRequestProcessor() {
  const MODULE_NAME = 'servidorCentral.js';

  // 1. CARRIL EXCLUSIVO: Perfecto. No interfiere con Locks ni Cache.
  const redis = connectionManager.getRawClientById('server-streams');

  if (!redis) {
    dragon.agoniza('Cliente server-streams no listo', null, MODULE_NAME);
    return;
  }

  // 2. INFRAESTRUCTURA: MKSTREAM es vital para evitar errores de "Stream not found"
  try {
    await redis.xgroup('CREATE', REQ_STREAM_SUPERIOR, REQ_GROUP_SUPERIOR, '$', 'MKSTREAM');
  } catch (e) {
    if (!/BUSYGROUP/.test(e.message)) {
      dragon.sePreocupa('Error XGROUP', MODULE_NAME, 'XG_ERR', { msg: e.message });
    }
  }

  // 3. EL LOOP RECURSIVO: Evitamos el "Stack Overflow" usando un loop controlado
  // Pasamos el cliente dedicado para que 'processNextSuperiorRequest' lo use siempre
  ejecutarLoopInfinito(redis);
}

// Helper para mantener el loop vivo sin desbordar la pila de llamadas
async function ejecutarLoopInfinito(redis) {
    while (true) {
        try {
            await processNextSuperiorRequest(redis);
        } catch (err) {
            dragon.agoniza('Fallo en ciclo de petición superior', err, 'servidorCentral.js');
            await new Promise(r => setTimeout(r, 2000)); // Backoff de seguridad
        }
    }
}

/**
 * [CODE] Versión FAANG: Aislamiento Total, Pipeline y Zero-Fallback
 */
async function processNextSuperiorRequest(redis) {
    const MODULE_NAME = 'servidorCentral.js';
    const CONSUMER_ID = `consumer-${process.pid}`;

    while (true) {
        // 0) VALIDACIÓN DE CARRIL (Prohibido saltar a 'server-main')
        if (!redis || redis.status === 'end' || redis.status === 'close') {
            dragon.sePreocupa('Carril streams desconectado. Reintentando...', MODULE_NAME);
            await new Promise(r => setTimeout(r, 1500));
            // Intentamos recuperar el carril correcto, nunca el de los locks
            redis = connectionManager.getRawClientById('server-streams');
            continue;
        }

        try {
            // 1) LECTURA REACTIVA (BLOCK 500ms es ideal para el Event Loop)
            const xreadResult = await redis.xreadgroup(
                'GROUP', REQ_GROUP_SUPERIOR, CONSUMER_ID,
                'COUNT', '1',
                'BLOCK', '500',
                'STREAMS', REQ_STREAM_SUPERIOR, '>'
            );

            // 2) Ciclo vacío (Timeout normal del BLOCK)
            if (!xreadResult || !xreadResult[0]) continue;

            // 3) PARSEO DE MENSAJE (Estructura de Redis)
            const [[messageId, fields]] = xreadResult[0][1];
            const obj = {};
            for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];

            const { archivoId, correlationId, payload: rawPayload, respStream } = obj;

            // Validación de integridad
            if (!archivoId || !correlationId || !respStream) {
                await redis.xack(REQ_STREAM_SUPERIOR, REQ_GROUP_SUPERIOR, messageId);
                continue;
            }

            // 4) FEATURES (MBH Validation)
            let features = [];
            try {
                const parsed = JSON.parse(rawPayload || '{}');
                features = parsed.features || [];
                if (features.length === 0) throw new Error('NO_FEATURES');
            } catch (e) {
                await redis.xack(REQ_STREAM_SUPERIOR, REQ_GROUP_SUPERIOR, messageId);
                dragon.sePreocupa('Payload corrupto en Stream', MODULE_NAME, 'PAYLOAD_ERR');
                continue;
            }

            // 5) INFERENCIA RED SUPERIOR (RS)
            let resultadoSuperior;
            try {
                const rs = global.redSuperior || (typeof redSuperiorExport !== 'undefined' ? redSuperiorExport : null);
                if (!rs) throw new Error('RS_NOT_READY');

                const t0 = performance.now();
                resultadoSuperior = await rs.predecir(features, { archivoId, correlationId });
                const inferMs = Math.round(performance.now() - t0);

                dragon.respira('RS Inferencia OK', MODULE_NAME, 'RS_PERF', { ms: inferMs });
            } catch (inferErr) {
                resultadoSuperior = { categoria: 'error', confianza: 0, degraded: true };
                dragon.agoniza('Fallo RS', inferErr, MODULE_NAME);
            }

            // 6) RESPUESTA ATÓMICA (PIPELINE: 3 comandos en 1 solo viaje de red)
            // Esto reduce la latencia de red un 66% y libera el socket rápido
            await redis.pipeline()
                .xadd(
                    respStream, '*',
                    'archivoId', archivoId,
                    'correlationId', correlationId,
                    'respuesta', JSON.stringify(resultadoSuperior),
                    'timestamp', Date.now().toString()
                )
                .expire(respStream, 300) // TTL de seguridad 5 min
                .xack(REQ_STREAM_SUPERIOR, REQ_GROUP_SUPERIOR, messageId)
                .exec();

            dragon.sonrie('Ciclo RS Completado', MODULE_NAME, 'SUCCESS', { archivoId });

        } catch (err) {
            // Ignorar timeouts de red del comando BLOCK
            if (/Command timed out/i.test(err.message)) continue;

            dragon.agoniza('Error en loop superior', err, MODULE_NAME);

            // Recuperación de grupo si Redis se reinicia
            if (/NOGROUP/.test(err.message)) {
                await redis.xgroup('CREATE', REQ_STREAM_SUPERIOR, REQ_GROUP_SUPERIOR, '$', 'MKSTREAM').catch(() => {});
            }

            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

// ====================================================================
// EXPORTS PRINCIPALES
// ====================================================================
export default ServidorCentralFAANG;
export {
  WebSocketPerformanceMonitor,
  WebSocketCircuitBreaker,
  WebSocketSecurityValidator,
  WebSocketConnectionManager,
  FeatureExtractor,
  DragonWebSocketError,
  ConnectionError,
  MessageProcessingError,
  RedisCommError,
  RateLimitError,
  FAANG_CONFIG,
  STREAMS,
  CONSUMER_GROUPS,
  CHANNELS
};

// ====================================================================
// FACTORY FUNCTION (Contrato server.js)
// ====================================================================
/**
 * FACTORY FUNCTION: Orquesta la creación e inicialización asíncrona del Servidor Central.
 * Resuelve el SyntaxError del constructor moviendo los awaits aquí.
 */
export async function crearServidorCentralFAANG(
  puerto,
  redisPublisher = null,
  redisSubscriber = null,
  redSuperiorInstance = null,
  customServer = null,
  config = {}
) {
  const start = performance.now();
  const correlationId = `factory-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  dragonLogger.respira('Iniciando factory ServidorCentralFAANG', NOMBRE_MODULO, 'FACTORY_START', {
    correlationId,
    puerto,
    hasRedSuperior: !!redSuperiorInstance
  });

  // 1. Validar Red Superior (RS)
  if (!redSuperiorInstance || typeof redSuperiorInstance.predecir !== 'function') {
    const err = new Error('redSuperiorInstance inválida: requiere método predecir()');
    dragonLogger.agoniza('RS inválida en factory', err, NOMBRE_MODULO, 'FACTORY_RS_ERROR');
    throw err;
  }

  let servidor;
  try {
    // 2. Instanciación Síncrona (Limpia de awaits)
    servidor = new ServidorCentralFAANG(
      puerto,
      redisPublisher,
      redisSubscriber,
      redSuperiorInstance,
      customServer,
      config
    );

    // 3. Inicialización de Infraestructura Asíncrona
    // Aseguramos que los Streams y Grupos existan antes de arrancar[cite: 4]
    await StreamManager.ensureAllStreams(redisPublisher.client || redisPublisher);

    // 4. Iniciar Consumidor de Respuestas (RS -> Servidor)
    // Mantenemos esto porque es la escucha activa del worker
    servidor.startSuperiorStreamConsumer().catch(err => {
      dragonLogger.agoniza('Error en loop de respuestas RS', err, NOMBRE_MODULO);
    });

    dragonLogger.sonrie('Servidor vinculado al Canal (DB 1)', NOMBRE_MODULO, 'INFRA_READY');

  } catch (e) {
    dragonLogger.agoniza('Fallo en la creación del servidor', e, NOMBRE_MODULO, 'FACTORY_INSTANCE_ERROR', {
      correlationId,
      error: e.message
    });
    throw e;
  }

  const dur = performance.now() - start;
  dragonLogger.zen('Factory ServidorCentralFAANG completada', NOMBRE_MODULO, 'FACTORY_OK', {
    correlationId,
    durMs: Math.round(dur),
    version: servidor.version
  });

  return servidor;
}
