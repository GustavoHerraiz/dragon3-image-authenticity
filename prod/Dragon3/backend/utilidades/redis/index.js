/**
 * @file index.js
 * @description Punto de entrada FAANG-robusto del sistema Redis Enterprise Resilience Framework (RERF)
 * Garantiza máxima resiliencia: nunca lanza excepción letal, siempre exporta stubs si falla la inicialización.
 */

let redisClient, rawRedisClient, ConnectionManager, StreamConsumer, StreamManager;
let SERVICE_PRIORITIES, REDIS_EVENTS, SYSTEM_STATES;
let importError = null;

// FAANG: Importación robusta de dependencias internas
try {
  // 1. CARGA DE CONSTANTES (Primero para evitar TDZ en desestructuraciones)
  const constantsModule = await import('./core/constants.js');
  SERVICE_PRIORITIES = constantsModule.SERVICE_PRIORITIES;
  REDIS_EVENTS = constantsModule.REDIS_EVENTS;
  SYSTEM_STATES = constantsModule.SYSTEM_STATES;

  // 2. CLIENTE REDIS
  const redisClientModule = await import('./core/RedisClient.js');
  redisClient = redisClientModule.default || redisClientModule.redisClient; 
  rawRedisClient = redisClientModule.rawRedisClient;

  // 3. MANAGERS Y CONSUMER
  const connModule = await import('./core/ConnectionManager.js');
  ConnectionManager = connModule.default || connModule;

  const consumerModule = await import('./streams/StreamConsumer.js');
  StreamConsumer = consumerModule.default || consumerModule;

  const managerModule = await import('./StreamManager.js');
  StreamManager = managerModule.default || managerModule;

} catch (error) {
  importError = error;

  console.error("💥 [DRAGON3 FATAL] ERROR IMPORTANDO DEPENDENCIAS EN REDIS/INDEX.JS:", error);

  if (typeof dragon !== 'undefined' && dragon.sePreocupa) {
    dragon.sePreocupa(
      'Fallo al importar dependencias internas de redis/index.js',
      'redis/index.js',
      'REDIS_ENTRYPOINT_IMPORT_ERROR',
      { error: error.message, stack: error.stack }
    );
  }

  // Stubs de Resiliencia (Mantenidos según protocolo MBH)
  if (!redisClient) {
    redisClient = {
      isDegraded: true,
      get: async () => null,
      set: async () => false,
      del: async () => 0,
      on: () => {},
      quit: async () => {},
      reconnect: async () => {},
      health: () => ({
        status: 'degraded',
        error: importError?.message || 'RedisClient import error'
      })
    };
  }

  if (!rawRedisClient) {
    rawRedisClient = { 
      status: 'degraded',
      call: async () => { throw new Error('Redis degradado: Instancia no inicializada'); }
    };
  }

  if (!ConnectionManager) {
    ConnectionManager = {
      getSystemState: () => ({
        status: 'degraded',
        error: importError?.message || 'ConnectionManager import error'
      }),
      on: () => {},
      getAllClients: () => ({})
    };
  }

  if (!StreamConsumer) {
    StreamConsumer = class { 
      constructor() { this.isDegraded = true; }
      start() {} 
      stop() {}
      health() { return { status: 'degraded' }; }
    };
  }

  if (!StreamManager) {
    StreamManager = { ensureAllStreams: async () => {}, ensureStreamAndGroup: async () => {} };
  }

  if (!SERVICE_PRIORITIES) {
    SERVICE_PRIORITIES = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
  }
  if (!REDIS_EVENTS) REDIS_EVENTS = {};
  if (!SYSTEM_STATES) SYSTEM_STATES = {};
}

// Lógica de delegación (Mantenida intacta)
async function delegateStreamAndGroupInitialization() {
  if (!rawRedisClient || redisClient?.isDegraded || !StreamManager || typeof StreamManager.ensureAllStreams !== 'function') {
    return;
  }
  try {
    const target = rawRedisClient?.client || rawRedisClient;
    if (rawRedisClient.status === 'ready') {
      await StreamManager.ensureAllStreams(target);
    }
  } catch (err) { /* Silencioso según protocolo */ }
}

function _determineServicePriority(serviceName) {
  const nameNormalized = (serviceName || '').toLowerCase();
  if (nameNormalized.includes('auth') || nameNormalized.includes('security')) return SERVICE_PRIORITIES.CRITICAL;
  if (nameNormalized.includes('video') || nameNormalized.includes('image')) return SERVICE_PRIORITIES.HIGH;
  return SERVICE_PRIORITIES.MEDIUM;
}

function getSystemState() {
  try {
    if (ConnectionManager && typeof ConnectionManager.getSystemState === 'function') {
      return ConnectionManager.getSystemState();
    }
    return { status: 'degraded', error: 'ConnectionManager unavailable' };
  } catch (error) {
    return { status: 'degraded', error: error.message };
  }
}

// Módulo unificado para exportación por defecto
const redisModule = {
  redisClient,
  rawRedisClient,
  StreamConsumer,
  StreamManager,
  ConnectionManager,
  globalConnectionManager: ConnectionManager,
  SERVICE_PRIORITIES,
  REDIS_EVENTS,
  SYSTEM_STATES,
  getSystemState,
  _determineServicePriority,
  delegateStreamAndGroupInitialization
};

export default redisModule;

// Exportaciones nombradas (Cruciales para el test destructurado)
export {
  redisClient,
  rawRedisClient,
  StreamConsumer,
  StreamManager,
  ConnectionManager,
  ConnectionManager as globalConnectionManager,
  SERVICE_PRIORITIES,
  REDIS_EVENTS,
  SYSTEM_STATES,
  getSystemState
};