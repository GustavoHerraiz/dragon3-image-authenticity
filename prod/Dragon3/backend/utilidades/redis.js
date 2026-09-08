/**
 * ====================================================================
 * DRAGON3 - REDIS CLIENT EXPORT MODULE (FAANG STANDARDS)
 * ====================================================================
 *
 * Archivo: utilidades/redis.js
 * Proyecto: Dragon3 - Sistema Autentificación IA
 * Versión: 3.1.0-FAANG - SIN HEALTH CHECKS DUPLICADOS
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Punto de exportación único para todo el stack Redis de Dragon3.
 * SOLO exporta clases, utilidades y constantes. NUNCA una instancia global.
 * La única instancia de RedisClient debe crearse y registrarse explícitamente
 * en el entrypoint (ej. server.js) para máxima trazabilidad y fiabilidad.
 *
 * PRINCIPIOS FAANG:
 * - No singletons globales (evita efectos colaterales y bugs de registro)
 * - Exportación explícita de clases, utilidades y constantes
 * - Documentación exhaustiva y ejemplos de uso correcto
 * - Fallbacks defensivos para compatibilidad legacy
 * - Integridad de metadatos de cliente y trazabilidad total
 * - ❌ SIN HEALTH CHECKS DUPLICADOS (gestionados por HealthMonitor.js)
 *
 * ====================================================================
 */

// 1. Importa dinámicamente el módulo raíz de Redis Dragon3
import * as redisModule from './redis/index.js';

// 2. Exporta solo la CLASE principal por defecto (NUNCA una instancia global)
export default redisModule.default || redisModule;

// 3. Exporta utilidades y constantes (nunca instancia de cliente)
export const StreamConsumer = redisModule.StreamConsumer;
export const ConnectionManager = redisModule.ConnectionManager;
export const SERVICE_PRIORITIES = redisModule.SERVICE_PRIORITIES;
export const REDIS_EVENTS = redisModule.REDIS_EVENTS;
export const SYSTEM_STATES = redisModule.SYSTEM_STATES;
export const getSystemState = redisModule.getSystemState;

// ❌ ELIMINADO: runHealthCheck exportado
// Los health checks de Redis son gestionados exclusivamente por HealthMonitor.js

// 4. Exporta xgroupCreateSeguro para compatibilidad legacy, con fallback robusto y logging FAANG
let xgroupCreateSeguro;
try {
    ({ xgroupCreateSeguro } = await import('./redis/streams/StreamConsumer.js'));
} catch (error) {
    // Stub defensivo con logging estructurado
    xgroupCreateSeguro = async () => {
        const logger = global.dragonLogger || global.dragon;
        if (logger && logger.sePreocupa) {
            logger.sePreocupa('Fallo al importar xgroupCreateSeguro, usando stub fallback', 'redis.js', 'IMPORT_ERROR', {
                error: error.message,
                stack: error.stack
            });
        }
        return false;
    };
}
export { xgroupCreateSeguro };

/**
 * ====================================================================
 * FAANG: EJEMPLO DE USO CORRECTO (NO USAR SINGLETONS NI INSTANCIAS POR DEFECTO)
 * ====================================================================
 * // En server.js (entrypoint)
 * import RedisClient from './utilidades/redis.js';
 * import { ConnectionManager, SERVICE_PRIORITIES } from './utilidades/redis.js';
 *
 * const redisClient = new RedisClient({
 *   clientId: 'analizadorImagen',
 *   serviceName: 'analizadorImagen',
 *   priority: SERVICE_PRIORITIES.CRITICAL
 * });
 * ConnectionManager.registerClient(redisClient.clientId, redisClient);
 *
 * // En cualquier otro módulo
 * import { ConnectionManager } from './utilidades/redis.js';
 * const redis = ConnectionManager.getRawClientById('analizadorImagen');
 *
 * // NUNCA hacer: import { redisClient } from './utilidades/redis.js';  (ANTI-PATRÓN)
 * // NUNCA exportar ni instanciar RedisClient por defecto aquí.
 *
 * NOTA IMPORTANTE V3.1.0:
 * - Los health checks de Redis son gestionados EXCLUSIVAMENTE por HealthMonitor.js
 * - No hay health checks duplicados en el sistema Redis
 * - ConnectionManager.js opera en modo pasivo sin health checks activos
 * ====================================================================
 */
