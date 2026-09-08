/**
 * @file RedisClient.js
 * @description Cliente Redis Enterprise FAANG/Dragon: resiliencia, fallback y observabilidad.
 * Manejo estricto de clientId y serviceName. Registro consistente en ConnectionManager SOLO desde el entrypoint.
 * @author Gustavo Herraiz
 * @date 2025-07-10
 * @version 4.2.0
 */
import Redis from 'ioredis';
import { performance } from 'perf_hooks';
import LRUCache from 'lru-cache';
import dragonLogger from '../../logger.js';
import { SERVICE_PRIORITIES, REDIS_EVENTS, TIMEOUTS } from './constants.js';
import globalConnectionManager from './ConnectionManager.js';

class RedisDegradedError extends Error {
  constructor(message) {
    super(message || 'Redis is in degraded mode');
    this.name = 'RedisDegradedError';
  }
}

class RedisClient {
  /**
   * @constructor
   * @param {Object} config
   * @param {string} config.clientId - ID único e inmutable del cliente Redis
   * @param {string} config.serviceName - Nombre del servicio que usa el cliente
   * @param {string} [config.priority=MEDIUM]
   * @param {number} [config.maxRetries=10]
   * @param {boolean} [config.useFallbackCache=true]
   */
  constructor(config = {}) {
    // Validación estricta de clientId y serviceName
    if (!config.clientId || typeof config.clientId !== 'string') {
      dragonLogger.sePreocupa(
        'RedisClient instanciado sin clientId explícito. Usando "default" (NO recomendado en producción)',
        null,
        'RedisClient.js',
        'REDIS_CLIENTID_DEFAULT'
      );
      this.clientId = 'default';
    } else {
      this.clientId = config.clientId;
    }

    if (!config.serviceName || typeof config.serviceName !== 'string') {
      dragonLogger.sePreocupa(
        `RedisClient (${this.clientId}) instanciado sin serviceName explícito. Usando "unknown-service"`,
        null,
        'RedisClient.js',
        'REDIS_SERVICENAME_DEFAULT'
      );
      this.serviceName = 'unknown-service';
    } else {
      this.serviceName = config.serviceName;
    }

    this.priority = config.priority || SERVICE_PRIORITIES.MEDIUM;
    this.maxRetries = config.maxRetries || 10;

    this.isDegraded = false;
    this.lastInitError = null;

    // Fallback (cache LRU)
    this.fallbackEnabled = config.useFallbackCache !== false;
    this.fallbackOnlyForCache = config.fallbackOnlyForCache || false;
    this.fallbackCache = new LRUCache({ max: 200, ttl: 1000 * 60 });

    // Métricas y estado
    this.metrics = {
      operationCount: 0,
      errorCount: 0,
      reconnects: 0,
      latencies: []
    };

    // Estado
    this.status = {
      isConnected: false,
      isInitializing: true,
      lastConnectTime: null,
      lastErrorTime: null,
      connectionAttempt: 0,
      circuitBreakerOpen: false
    };

    // Opciones avanzadas para ioredis
    this.options = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      db: (() => {
  const raw = config.db !== undefined ? config.db : process.env.REDIS_DB;
  if (raw === undefined) return 0;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
})(),
      family: 4, // Forzar IPv4 cuando se usa "localhost"
      keepAlive: 3000,
      retryStrategy: this._retryStrategy.bind(this),
      connectTimeout: TIMEOUTS.CONNECT,
      commandTimeout: TIMEOUTS.COMMAND,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      offlineQueueSize: 1000,
      enableReadyCheck: true,
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {})
    };

    try {
      if (this.priority !== SERVICE_PRIORITIES.LOW) {
        this._initializeClient();
      } else {
        this.status.isInitializing = false;
      }
    } catch (err) {
      this.isDegraded = true;
      this.status.isInitializing = false;
      this.lastInitError = err;
      dragonLogger.agoniza(`FAANG/Dragon: Error inicializando cliente Redis ${this.clientId}: ${err.message}`, {
        error: err.message,
        stack: err.stack,
        service: this.serviceName,
        degraded: true
      });
    }

    // Inmutabilidad para identificación
    Object.defineProperty(this, 'clientId', { writable: false });
    Object.defineProperty(this, 'serviceName', { writable: false });

    // CORRECCIÓN: Guardamos la referencia para que sea accesible desde la instancia (Audit-ready)
    this.manager = globalConnectionManager;

    // Registro ÚNICO en el ConnectionManager
    if (this.manager && typeof this.manager.registerClient === 'function') {
      this.manager.registerClient(this.clientId, this);
    }
  }
  _initializeClient() {
    try {
      this.client = new Redis(this.options);

      this.client.on('connect', () => {
        this._handleConnect();
        globalConnectionManager.reportSuccess(this.clientId, this.serviceName, this.priority);
      });

      this.client.on('ready', () => {
        this._handleReady();
        this.status.isInitializing = false;
        globalConnectionManager.reportSuccess(this.clientId, this.serviceName, this.priority);
      });

      this.client.on('error', (err) => {
        this._handleError(err);
        globalConnectionManager.reportError(this.clientId, this.serviceName, this.priority, err);
        this.status.isInitializing = false;
      });

      this.client.on('close', () => {
        this._handleClose();
        this.status.isInitializing = false;
      });

      this.client.on('reconnecting', () => {
        this._handleReconnecting();
        this.status.isInitializing = true;
      });

      this.client.on('end', () => {
        this._handleEnd();
        this.status.isInitializing = false;
      });

      dragonLogger.zen(`Redis client ${this.clientId} (${this.serviceName}) inicializando conexión`, {
        service: this.serviceName,
        clientId: this.clientId,
        priority: this.priority,
        status: this.status
      });
    } catch (err) {
      this.isDegraded = true;
      this.status.isInitializing = false;
      this.lastInitError = err;
      dragonLogger.agoniza(`FAANG/Dragon: Error inicializando cliente Redis ${this.clientId}: ${err.message}`, {
        error: err.message,
        stack: err.stack,
        service: this.serviceName,
        degraded: true
      });
      globalConnectionManager.reportFailure(this.clientId, this.serviceName, this.priority);
    }
  }

  _retryStrategy(attempts) {
    this.status.connectionAttempt = attempts;

    if (attempts >= this.maxRetries) {
      dragonLogger.agoniza(
        `Redis ${this.clientId} (${this.serviceName}) - Máximo de intentos alcanzado (${attempts}), degradando cliente`,
        {
          service: this.serviceName,
          clientId: this.clientId,
          attempts,
          degraded: true
        }
      );
      globalConnectionManager.reportFailure(this.clientId, this.serviceName, this.priority);
      this.isDegraded = true;
      this._openCircuitBreaker();
      return null; // Detener reintentos
    }

    // Backoff por prioridad
    let delay;
    const baseDelay = 1000;
    switch (this.priority) {
      case SERVICE_PRIORITIES.CRITICAL:
        delay = baseDelay * Math.min(1.5, attempts);
        break;
      case SERVICE_PRIORITIES.HIGH:
        delay = baseDelay * Math.min(2, attempts);
        break;
      case SERVICE_PRIORITIES.MEDIUM:
        delay = baseDelay * Math.pow(1.5, attempts);
        break;
      case SERVICE_PRIORITIES.LOW:
        delay = baseDelay * Math.pow(2, attempts);
        break;
      default:
        delay = baseDelay * Math.pow(1.8, attempts);
    }
    const jitter = 0.8 + Math.random() * 0.4;
    delay = Math.floor(delay * jitter);
    delay = Math.min(delay, 30 * 1000);

    dragonLogger.sePreocupa(`Redis ${this.serviceName} - Reconectando en ${delay}ms (intento ${attempts})`, {
      service: this.serviceName,
      clientId: this.clientId,
      attemptNumber: attempts,
      delay
    });

    return delay;
  }

 // ---- EVENTOS REDIS ----

  _handleConnect() {
    this.isDegraded = false;
    dragonLogger.zen(`Redis ${this.serviceName} - Conexión establecida`, {
      service: this.serviceName,
      clientId: this.clientId
    });
  }

  _handleReady() {
    this.status.isConnected = true;
    this.status.lastConnectTime = Date.now();
    this.status.connectionAttempt = 0;
    this._closeCircuitBreaker();
    this.isDegraded = false;

    this.heartbeatTimer = setInterval(() => {
        if (this.client && this.status.isConnected) {
            this.client.ping().catch(() => {
                // Si el corazón falla, el error se capturará en el evento 'error'
            });
            // 🐉 El latido del Dragón. ❤️ (Silencioso)
        }
    }, 5000);

    dragonLogger.sePreocupa(`Redis ${this.serviceName} - Cliente listo (Heartbeat activo)`, {
      service: this.serviceName,
      clientId: this.clientId,
      reconnects: this.metrics.reconnects,
      uptime: this._calculateUptime()
    });
    globalConnectionManager.reportSuccess(this.clientId, this.serviceName, this.priority);
  }

  _handleError(err) {
    this.metrics.errorCount++;
    this.status.lastErrorTime = Date.now();
    dragonLogger.agoniza(`Redis ${this.serviceName} - Error: ${err.message}`, {
      service: this.serviceName,
      clientId: this.clientId,
      errorMessage: err.message,
      code: err.code || 'UNKNOWN_ERROR'
    });
    this.isDegraded = true;
    globalConnectionManager.reportError(this.clientId, this.serviceName, this.priority, err);
  }

  _handleClose() {
    this._stopHeartbeat(); // 🎯 DETENER LATIDO
    this.status.isConnected = false;
    this.isDegraded = true;
    dragonLogger.seEnfada(`Redis ${this.serviceName} - Conexión cerrada`, {
      service: this.serviceName,
      clientId: this.clientId
    });
  }

  _handleReconnecting() {
    this.metrics.reconnects++;
    this.isDegraded = true;
    dragonLogger.sePreocupa(`Redis ${this.serviceName} - Reconectando (intento #${this.status.connectionAttempt})`, {
      service: this.serviceName,
      clientId: this.clientId,
      attempt: this.status.connectionAttempt
    });
  }

  _handleEnd() {
    this._stopHeartbeat(); // 🎯 DETENER LATIDO
    this.status.isConnected = false;
    this.isDegraded = true;
    dragonLogger.seEnfada(`Redis ${this.serviceName} - Cliente finalizado`, {
      service: this.serviceName,
      clientId: this.clientId
    });
  }

  // Método auxiliar para limpiar el timer
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ---- CIRCUIT BREAKER ----

  _openCircuitBreaker() {
    if (!this.status.circuitBreakerOpen) {
      this.status.circuitBreakerOpen = true;
      this.isDegraded = true;
      dragonLogger.seEnfada(`Redis ${this.serviceName} - Circuit breaker abierto`, {
        service: this.serviceName,
        clientId: this.clientId,
        degraded: true
      });
      setTimeout(() => {
        this._halfOpenCircuitBreaker();
      }, this._calculateCircuitBreakerTimeout());
    }
  }

  _halfOpenCircuitBreaker() {
    dragonLogger.sePreocupa(`Redis ${this.serviceName} - Circuit breaker semi-abierto`, {
      service: this.serviceName,
      clientId: this.clientId
    });
    this._initializeClient();
  }

  _closeCircuitBreaker() {
    if (this.status.circuitBreakerOpen) {
      this.status.circuitBreakerOpen = false;
      this.isDegraded = false;
      dragonLogger.sePreocupa(`Redis ${this.serviceName} - Circuit breaker cerrado`, {
        service: this.serviceName,
        clientId: this.clientId
      });
    }
  }

  /**
 * Ejecuta PING en una conexión duplicada y aislada para evitar colas de XREAD BLOCK.
 * @param {number} [timeout=300] - Timeout agresivo en ms.
 * @returns {Promise<number>} - Latencia del PING en ms, o lanza un error de timeout.
 */
async pingIsolated(timeout = 300) {
    if (this.isDegraded || !this.client || typeof this.client.duplicate !== 'function') {
        throw new RedisDegradedError(`Cliente degradado o .duplicate no disponible (${this.clientId})`);
    }

    const startTime = performance.now();
    let isolatedClient = null;

    try {
        // 🎯 CRÍTICO: Duplicar la conexión para obtener un socket totalmente nuevo
        isolatedClient = this.client.duplicate();

        // El primer comando (PING) disparará la conexión.
        const pingPromise = isolatedClient.ping();

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Isolated PING timeout (${timeout}ms)`)), timeout);
        });

        const result = await Promise.race([pingPromise, timeoutPromise]);

        const latency = performance.now() - startTime;

        if (result !== 'PONG') {
            throw new Error(`PING returned non-PONG result: ${result}`);
        }

        return latency;

    } catch (error) {
        throw error;
    } finally {
        // 🛑 CRÍTICO: CERRAR INMEDIATAMENTE EL CLIENTE DUPLICADO PARA LIBERAR EL SOCKET
        if (isolatedClient) {
            await isolatedClient.quit().catch(() => {});
        }
    }
}

  // ---- MÉTODOS PRINCIPALES ----

  async executeCommand(operation, command, args = [], options = {}) {
    // Si circuito está abierto o degradado
    if (this.status.circuitBreakerOpen || this.isDegraded || !this.client) {
      dragonLogger.seEnfada(
        `Redis ${this.serviceName} - Operación ${command} rechazada, modo degradado/circuito abierto.`,
        {
          service: this.serviceName,
          command,
          degraded: true
        }
      );

      // Solo fallback para GET si está habilitado y permitido
      if (
        this.fallbackEnabled &&
        options.useFallback &&
        (!this.fallbackOnlyForCache || command.startsWith('GET')) &&
        args[0]
      ) {
        const cachedValue = this.fallbackCache.get(args[0]);
        if (cachedValue !== undefined) {
          dragonLogger.sePreocupa(`Redis ${this.serviceName} - Respondiendo desde fallback LRU para ${args[0]}`);
          return cachedValue;
        }
      }
      throw new RedisDegradedError(`Redis degradado: operación ${command} no disponible`);
    }

    // Inicializar cliente bajo demanda para servicios LOW
    if (!this.client && this.priority === SERVICE_PRIORITIES.LOW) {
      this._initializeClient();
    }

    const startTime = performance.now();
    this.metrics.operationCount++;

    try {
      const result = await operation.apply(this.client, args);

      const latency = performance.now() - startTime;
      this.metrics.latencies.push(latency);
      if (this.metrics.latencies.length > 100) this.metrics.latencies.shift();

      // Actualizar cache fallback para GET
      if (command.startsWith('GET') && args[0] && result !== null) {
        this.fallbackCache.set(args[0], result, {
          ttl: options.cacheTTL || 60 * 1000
        });
      }

      return result;
    } catch (err) {
      this.metrics.errorCount++;
      this.isDegraded = true;
      dragonLogger.agoniza(`Redis ${this.serviceName} - Error ejecutando ${command}: ${err.message}`, {
        service: this.serviceName,
        clientId: this.clientId,
        command,
        error: err.message,
        degraded: true
      });
      this._evaluateCircuitBreaker();

      // Fallback solo para GET si está habilitado y permitido
      if (
        this.fallbackEnabled &&
        options.useFallback &&
        (!this.fallbackOnlyForCache || command.startsWith('GET')) &&
        args[0]
      ) {
        const cachedValue = this.fallbackCache.get(args[0]);
        if (cachedValue !== undefined) {
          dragonLogger.sePreocupa(`Redis ${this.serviceName} - Usando valor en cache fallback para ${args[0]}`);
          return cachedValue;
        }
      }
      throw new RedisDegradedError(`Redis degradado: operación ${command} no disponible`);
    }
  }

  async get(key, options = {}) {
    return this.executeCommand(this.client?.get, 'GET', [key], {
      useFallback: true,
      ...options
    });
  }

  async set(key, value, options = {}) {
    const args = [key, value];
    if (options.ttl) args.push('PX', options.ttl);
    return this.executeCommand(this.client?.set, 'SET', args, options);
  }

  async del(keys, options = {}) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    return this.executeCommand(this.client?.del, 'DEL', keyArray, options);
  }

  // Acepta objeto de campos o pares planos k1,v1,k2,v2,...
  async xadd(streamKey, id, ...rest) {
    let args = [streamKey, id];

    if (rest.length === 1 && rest[0] && typeof rest[0] === 'object' && !Array.isArray(rest[0])) {
      const fieldsObj = rest[0];
      for (const [k, v] of Object.entries(fieldsObj)) {
        args.push(k, v);
      }
    } else {
      args = args.concat(rest);
    }

    return this.executeCommand(this.client?.xadd, 'XADD', args, {
      critical: true
    });
  }

  async xread(streamKey, id, options = {}) {
    const args = ['COUNT', options.count || 100, 'BLOCK', options.block || 0, 'STREAMS', streamKey, id];
    return this.executeCommand(this.client?.xread, 'XREAD', args, options);
  }

  async xreadgroup(group, consumer, streamIds, options = {}) {
    const args = ['GROUP', group, consumer, 'COUNT', options.count || 10, 'BLOCK', options.block || 100, 'STREAMS'];
    const streams = Object.keys(streamIds);
    const ids = Object.values(streamIds);
    args.push(...streams, ...ids);
    return this.executeCommand(this.client?.xreadgroup, 'XREADGROUP', args, {
      critical: this.priority === SERVICE_PRIORITIES.CRITICAL,
      ...options
    });
  }

  isDegradedMode() {
    return !!this.isDegraded;
  }

  health() {
    return {
      status: this.isDegraded ? 'degraded' : this.status.isConnected ? 'ok' : 'disconnected',
      isDegraded: !!this.isDegraded,
      lastError: this.lastInitError ? this.lastInitError.message : null,
      lastConnectTime: this.status.lastConnectTime,
      lastErrorTime: this.status.lastErrorTime,
      circuitBreakerOpen: !!this.status.circuitBreakerOpen
    };
  }

  _evaluateCircuitBreaker() {
    const recentOps = Math.min(this.metrics.operationCount, 100);
    const errorRate = this.metrics.errorCount / (recentOps || 1);
    if (recentOps > 10 && errorRate > 0.5) {
      this._openCircuitBreaker();
    }
  }

  _calculateCircuitBreakerTimeout() {
    const baseTimeout = 15000;
    switch (this.priority) {
      case SERVICE_PRIORITIES.CRITICAL:
        return baseTimeout;
      case SERVICE_PRIORITIES.HIGH:
        return baseTimeout * 2;
      case SERVICE_PRIORITIES.MEDIUM:
        return baseTimeout * 4;
      case SERVICE_PRIORITIES.LOW:
        return baseTimeout * 8;
      default:
        return baseTimeout * 4;
    }
  }

  _calculateUptime() {
    if (!this.status.lastConnectTime) return 0;
    return (Date.now() - this.status.lastConnectTime) / 1000;
  }

  // Valor seguro por comando para fallback
  _getDefaultValueForCommand(command) {
    switch ((command || '').toUpperCase()) {
      case 'GET':
        return null;
      case 'SET':
      case 'DEL':
        return false;
      case 'INCR':
      case 'DECR':
      case 'INCRBY':
      case 'DECRBY':
        return 0;
      case 'HGETALL':
      case 'HMGET':
      case 'HGET':
        return {};
      case 'SMEMBERS':
      case 'ZRANGE':
      case 'LRANGE':
      case 'XREAD':
      case 'XREADGROUP':
        return [];
      default:
        return null;
    }
  }

  // (OPCIONAL) Registro manual con el manager
  registerWithManager() {
    globalConnectionManager.registerClient(this.clientId, this);
  }

  getMetrics() {
    const latencies = [...this.metrics.latencies].sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    return {
      operations: this.metrics.operationCount,
      errors: this.metrics.errorCount,
      errorRate: this.metrics.operationCount > 0 ? this.metrics.errorCount / this.metrics.operationCount : 0,
      reconnects: this.metrics.reconnects,
      latency: {
        p50,
        p95,
        p99,
        avg: latencies.length > 0 ? latencies.reduce((sum, val) => sum + val, 0) / latencies.length : 0
      },
      uptime: this._calculateUptime(),
      circuitBreakerOpen: this.status.circuitBreakerOpen
    };
  }
}



// =====================================================================
// RAW REDIS CLIENT PARA STREAMS (NUEVO)
// =====================================================================
/**
 * Cliente Redis raw (ioredis nativo) para operaciones de streams.
 * Necesario porque RedisClient es un wrapper que NO expone xreadgroup/xadd directamente.
 * Este cliente se usa en consumidores de Redis Streams.
 */
let rawRedisClient = null;

try {
  dragonLogger.respira('Inicializando raw Redis client para streams', 'RedisClient', 'RAW_CLIENT_INIT', {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  });

  rawRedisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    db: parseInt(process.env.REDIS_DB_ANALYSIS, 10) || 1,
    family: 4, // Forzar IPv4 cuando se usa "localhost"
    retryStrategy: (times) => {
      if (times > 10) {
        dragonLogger.sePreocupa('Raw Redis client - máximo de reintentos alcanzado', 'RedisClient', 'RAW_CLIENT_MAX_RETRIES');
        return null;
      }
      const delay = Math.min(times * 1000, 3000);
      dragonLogger.zen(
        `Raw Redis client - reintentando en ${delay}ms (intento ${times})`,
        'RedisClient',
        'RAW_CLIENT_RETRY',
        { attempt: times, delay }
      );
      return delay;
    },
    connectTimeout: 10000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    enableReadyCheck: true,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {})
  });

  rawRedisClient.on('ready', () => {
    dragonLogger.zen('✅ Raw Redis client ready para streams', 'RedisClient', 'RAW_CLIENT_READY', {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
  });

  rawRedisClient.on('error', (err) => {
    dragonLogger.agoniza('❌ Raw Redis client error', err, 'RedisClient', 'RAW_CLIENT_ERROR', {
      error: err.message,
      code: err.code
    });
  });

  rawRedisClient.on('close', () => {
    dragonLogger.sePreocupa('Raw Redis client conexión cerrada', 'RedisClient', 'RAW_CLIENT_CLOSE');
  });

  rawRedisClient.on('reconnecting', (delay) => {
    dragonLogger.sePreocupa(`Raw Redis client reconectando en ${delay}ms`, 'RedisClient', 'RAW_CLIENT_RECONNECTING', {
      delay
    });
  });
} catch (err) {
  dragonLogger.agoniza('Error crítico inicializando raw Redis client', err, 'RedisClient', 'RAW_CLIENT_INIT_ERROR', {
    error: err.message,
    stack: err.stack
  });

  // Stub degradado para evitar crashes
  rawRedisClient = {
    xreadgroup: async () => {
      throw new Error('Raw Redis client no disponible - modo degradado');
    },
    xadd: async () => {
      throw new Error('Raw Redis client no disponible - modo degradado');
    },
    xack: async () => {
      throw new Error('Raw Redis client no disponible - modo degradado');
    },
    call: async () => {
      throw new Error('Raw Redis client no disponible - modo degradado');
    },
    on: () => {},
    quit: async () => {}
  };
}
// =====================================================================
// REDIS PING CLIENT PARA HEALTH CHECKS (SOLUCIÓN 477ms)
// =====================================================================
/**
 * Cliente Redis dedicado exclusivamente para health checks (PING).
 * Evita la contaminación de socket por XREADGROUP BLOCK 0.
 */
let redisPingClient = null;

try {
  dragonLogger.respira('Inicializando Redis Ping Client para health checks', 'RedisClient', 'PING_CLIENT_INIT');

  redisPingClient = new RedisClient({
    clientId: 'redisPingClient',
    serviceName: 'health-check-ping',
    priority: 'HIGH',
    useFallbackCache: false,
    fallbackOnlyForCache: false
  });

  // Registramos en el ConnectionManager
  globalConnectionManager.registerClient('redisPingClient', redisPingClient);

  dragonLogger.zen('✅ Redis Ping Client inicializado para health checks', 'RedisClient', 'PING_CLIENT_READY', {
    clientId: 'redisPingClient',
    serviceName: 'health-check-ping',
    priority: 'HIGH'
  });
} catch (err) {
  dragonLogger.agoniza('Error crítico inicializando Redis Ping Client', err, 'RedisClient', 'PING_CLIENT_INIT_ERROR', {
    error: err.message,
    stack: err.stack
  });

  // Stub degradado para evitar crashes
  redisPingClient = {
    pingIsolated: async () => {
      throw new Error('Redis Ping Client no disponible - modo degradado');
    },
    health: () => ({ status: 'degraded', isDegraded: true }),
    on: () => {},
    quit: async () => {}
  };
}

// =====================================================================
// EXPORTACIONES CORREGIDAS (DRAGON3: SEGMENTACIÓN DB 0 / DB 1)
// =====================================================================

/**
 * TÚNEL A: INGESTA (DB 0)
 * Cliente principal para el backend y operaciones críticas de escritura.
 */
const mainRedisClient = new RedisClient({
  clientId: 'main-client-db0',
  serviceName: 'dragon-ingesta',
  priority: SERVICE_PRIORITIES.CRITICAL,
  useFallbackCache: true
});

/**
 * TÚNEL B: ANÁLISIS (DB 1)
 * Cliente dedicado para los 13 analizadores y telemetría de resultados.
 */
const analysisRedisClient = new RedisClient({
  clientId: 'analysis-client-db1',
  serviceName: 'dragon-analysis',
  priority: SERVICE_PRIORITIES.HIGH,
  useFallbackCache: false,
  db: parseInt(process.env.REDIS_DB_ANALYSIS, 10) || 1,
});



// Exportaciones de instancias
export { RedisClient, rawRedisClient, redisPingClient, analysisRedisClient };
export default mainRedisClient;
