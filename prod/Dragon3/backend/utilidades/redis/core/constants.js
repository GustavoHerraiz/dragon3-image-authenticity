/**
 * @file constants.js
 * @description Constantes robustas para sistema Redis Enterprise Dragon3 (FAANG/Dragon)
 */

// 1. Exportaciones directas para evitar TDZ (Temporal Dead Zone)
export const SERVICE_PRIORITIES = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
});

export const REDIS_EVENTS = Object.freeze({
  CONNECT: 'connect',
  READY: 'ready',
  ERROR: 'error',
  CLOSE: 'close',
  RECONNECTING: 'reconnecting',
  END: 'end',
  CONNECTION_CHANGE: 'connectionChange',
  CIRCUIT_BREAKER_OPEN: 'circuitBreakerOpen',
  CIRCUIT_BREAKER_CLOSE: 'circuitBreakerClose',
  DEGRADED_MODE: 'degradedMode'
});

export const SYSTEM_STATES = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  CRITICAL: 'CRITICAL',
  RECOVERING: 'RECOVERING',
  UNKNOWN: 'UNKNOWN'
});

export const PRIORITY_COMMANDS = Object.freeze([
  'AUTH', 'PING', 'SET', 'GET', 'XADD', 'XREADGROUP'
]);

export const TIMEOUTS = Object.freeze({
  CONNECT: 10000,
  COMMAND: 5000,
  HEALTH_CHECK: 2000,
  CIRCUIT_BREAKER: 30000,
  RECONNECT: 60000
});

/**
 * 🐉 NOTA DRAGON:
 * Se eliminó la validación interna por console.error durante la carga 
 * para evitar colisiones de sintaxis en el motor ESM de Node.js.
 * La integridad se garantiza por el Object.freeze y exportación directa.
 */