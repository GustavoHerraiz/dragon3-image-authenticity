/**
 * @file adaptadorRedis.js
 * @description
 * Adaptador universal para clientes Redis en Dragon3.
 * Añade métodos estándar de Redis Streams (xgroup, xinfo, etc) a cualquier cliente compatible,
 * ya sea ioredis (usa .call) o node-redis v4+ (usa .sendCommand).
 * Permite que el resto del sistema utilice una interfaz unificada, robusta y portable.
 *
 * Por qué es necesario:
 * - ioredis expone .call('XGROUP', ...), pero no siempre helpers como xgroup().
 * - node-redis v4+ expone .sendCommand(['XGROUP', ...]), pero tampoco helpers.
 * - Algunos mocks/test doubles pueden no tener ninguno, en ese caso no se adapta y loguea aviso.
 *
 * Uso:
 *   import adaptarClienteRedis from './adaptadorRedis.js'
 *   const redisClient = new Redis(...);
 *   adaptarClienteRedis(redisClient);
 *   // Ahora puedes: await redisClient.xgroup('CREATE', ...)
 *
 * Logging:
 * - dragonLogger.sePreocupa si se aplica la adaptación (métodos y backend detectado).
 * - dragonLogger.sePreocupa si no puede adaptar el cliente (ni .call ni .sendCommand).
 * - Nunca lanza excepción ni usa console.log.
 *
 * @author Gustavo Herraiz
 * @date 2025-07-08
 * @version 2.2.0-FAANG
 */

import dragonLogger from '../logger.js';

/**
 * Adapta un cliente Redis para exponer métodos estándar de Redis Streams si no existen.
 * Añade: xgroup, xadd, xread, xreadgroup, xack, xinfo, xdel
 * - Para ioredis: usa .call(COMMAND, ...)
 * - Para node-redis v4+: usa .sendCommand([COMMAND, ...])
 * - Para otros: loguea advertencia y no adapta.
 *
 * @param {object} redisClient - Cliente redis (ioredis, node-redis v4+) a adaptar
 * @returns {object|null} - El mismo cliente adaptado, o null si no se pudo adaptar
 */
export function adaptarClienteRedis(redisClient) {
  if (!redisClient) return null;

  // Detectar si ya está adaptado (idempotente)
  if (redisClient.xgroup && redisClient.xinfo) {
    return redisClient;
  }

  const streamMethods = [
    'xgroup',      // Grupos de consumidores
    'xadd',        // Añadir eventos
    'xread',       // Lectura básica
    'xreadgroup',  // Lectura por grupo
    'xack',        // Ack de mensajes
    'xinfo',       // Info de streams/grupos
    'xdel'         // Borrado de mensajes
  ];

  // ioredis: .call
  if (typeof redisClient.call === 'function') {
    streamMethods.forEach(method => {
      redisClient[method] = function (...args) {
        return this.call(method.toUpperCase(), ...args);
      };
    });
    dragonLogger.sePreocupa('Adaptador Redis Streams aplicado (ioredis/call)', {
      component: 'RedisAdapter',
      backend: 'ioredis',
      methods: streamMethods
    });
    return redisClient;
  }

  // node-redis v4+: .sendCommand
  if (typeof redisClient.sendCommand === 'function') {
    streamMethods.forEach(method => {
      redisClient[method] = function (...args) {
        // node-redis requiere array de strings como comando
        return this.sendCommand([method.toUpperCase(), ...args]);
      };
    });
    dragonLogger.sePreocupa('Adaptador Redis Streams aplicado (node-redis/sendCommand)', {
      component: 'RedisAdapter',
      backend: 'node-redis',
      methods: streamMethods
    });
    return redisClient;
  }

  // No compatible: no se adapta
  dragonLogger.sePreocupa('No se pudo adaptar cliente Redis: ni .call ni .sendCommand presentes', {
    component: 'RedisAdapter',
    backend: 'desconocido'
  });
  return null;
}

export default adaptarClienteRedis;
