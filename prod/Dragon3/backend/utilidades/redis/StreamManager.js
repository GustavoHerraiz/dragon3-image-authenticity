/**
 * @file StreamManager.js
 * @description
 * Centraliza la definición, creación y consulta de streams y grupos de consumidores Redis para Dragon3.
 * Garantiza que la configuración es fuente de verdad y compatible con StreamConsumer.js.
 * FAANG: Logging estructurado Dragon3, resiliencia, KISS.
 *
 * USO TÍPICO:
 *   import StreamManager from './StreamManager.js'
 *   await StreamManager.ensureAllStreams(redisClient)
 *   const { streamKey, groupName } = StreamManager.getStreamConfig('imagenes:procesadas', 'servidor-central')
 *   const consumer = new StreamConsumer({ ...streamKey/groupName..., ...handlers... })
 *
 * @author Gustavo Herraiz
 * @date 2025-04-15
 * @version 2.2.1-FAANG
 */

import dragonLogger from '../logger.js';

/**
 * =====================================================================
 * DRAGON3 FAANG - DEFINICIÓN CENTRALIZADA DE STREAMS Y GRUPOS REDIS
 * =====================================================================
 *
 * Este módulo es la única fuente de verdad para los streams y grupos
 * de consumidores Redis utilizados por Dragon3, garantizando trazabilidad,
 * resiliencia y compatibilidad con todo el stack de mensajería.
 *
 * Lead Architect: Gustavo Herraiz
 * Última actualización: 2025-08-19
 *
 * USO:
 *  - Solo aquí se añaden/actualizan los streams y grupos.
 *  - Cualquier nuevo tipo de análisis (ej: PDF) debe definirse aquí.
 *  - No crear ni modificar streams/grupos fuera de este fichero.
 *
 * REGLAS FAANG:
 *  - Todos los logs y errores deben ir a dragonLogger.
 *  - La función ensureAllStreams valida la infraestructura antes de arrancar.
 *  - Los consumers obtienen la config con getStreamConfig.
 *
 * DOCUMENTACIÓN DE STREAMS Y GRUPOS:
 *  - Cada stream tiene clave, descripción y listado de grupos con su propósito.
 *  - Los streams de PDF están perfectamente segregados: análisis local, red espejo y red superior.
 *
 * EJEMPLO DE USO:
 *    import { ensureAllStreams, getStreamConfig } from './StreamManager.js';
 *    await ensureAllStreams(redisClient);
 *    const { streamKey, groupName } = getStreamConfig('pdf:procesados', 'servidor-central-pdf');
 * =====================================================================
 */

const STREAM_DEFINITIONS = [

// ==== FLUJO IMAGEN ENTRADA (FALTABA ESTO) ====
  {
    key: 'imagenes:pendientes',
    description: 'Cola de entrada de imágenes para analizar.',
    groups: [
      {
        name: 'grupo-analizadores-imagen',
        description: 'Grupo de workers que procesan las imágenes.'
      }
    ]
  },
  // ==== FLUJO VIDEO ====
  {
    key: 'video:events',
    description: 'Stream de eventos de procesamiento de vídeo para nodos procesadores.',
    groups: [
      {
        name: 'procesadores',
        description: 'Grupo principal para nodos procesadores de vídeo.'
      }
    ]
  },

  // ==== FLUJO IMAGEN ====
  {
    key: 'imagenes:procesadas',
    description: 'Stream para publicar resultados del análisis de imágenes.',
    groups: [
      {
        name: 'servidor-central',
        description: 'Grupo para el servidor central que recoge los resultados.'
      }
    ]
  },

  // ==== FLUJO RED ESPEJO / RED SUPERIOR IMAGEN ====
  {
    key: 'dragon3:stream:req:espejo',
    description: 'Stream de requests hacia red espejo (imágenes)',
    groups: [
      { name: 'dragon3-espejo-processors', description: 'Procesadores de red espejo (imágenes)' }
    ]
  },
  {
    key: 'dragon3:stream:resp:espejo',
    description: 'Stream de respuestas desde red espejo (imágenes)',
    groups: [
      { name: 'dragon3-espejo-processors', description: 'Procesadores de red espejo (imágenes)' }
    ]
  },
  {
    key: 'dragon3:stream:req:superior',
    description: 'Stream de requests hacia red superior (imágenes)',
    groups: [
      { name: 'dragon3-superior-processors', description: 'Procesadores de red superior (imágenes)' }
    ]
  },
  // ========== MODIFICACIÓN (unificación grupos RESPUESTA_SUPERIOR) ==========
  {
    key: 'dragon3:stream:resp:superior',
    description: 'Stream de respuestas desde red superior (imágenes)',
    groups: [
      {
        name: 'dragon3-superior-processors',
        description: 'Procesadores de red superior (imágenes)'
      }
      // Eliminado grupo legacy: servidor-central-response-group
    ]
  },
  // =======================================================================

  // ==== FLUJO PDF (NUEVO, ENTERPRISE, BIDIRECCIONAL) ====
  {
    key: 'pdf:procesados',
    description: 'Stream para publicar resultados del análisis de PDF.',
    groups: [
      {
        name: 'servidor-central-pdf',
        description: 'Grupo para el servidor central que recoge los resultados PDF.'
      }
    ]
  },
  {
    key: 'dragon3:stream:req:pdf',
    description: 'Stream de requests hacia red espejo para PDFs',
    groups: [
      { name: 'dragon3-pdf-espejo-processors', description: 'Procesadores de red espejo PDF' }
    ]
  },
  {
    key: 'dragon3:stream:resp:pdf',
    description: 'Stream de respuestas desde red espejo para PDFs',
    groups: [
      { name: 'dragon3-pdf-espejo-processors', description: 'Procesadores de red espejo PDF' }
    ]
  },
  {
    key: 'dragon3:stream:req:pdf-superior',
    description: 'Stream de requests hacia red superior para PDFs',
    groups: [
      { name: 'dragon3-pdf-superior-processors', description: 'Procesadores de red superior PDF' }
    ]
  },
  {
    key: 'dragon3:stream:resp:pdf-superior',
    description: 'Stream de respuestas desde red superior para PDFs',
    groups: [
      { name: 'dragon3-pdf-superior-processors', description: 'Procesadores de red superior PDF' }
    ]
  },

  // ==== INFRAESTRUCTURA Y MONITORIZACIÓN GLOBAL ====
  {
    key: 'dragon3:stream:status',
    description: 'Actualizaciones de estado',
    groups: [
      { name: 'dragon3-status-monitors', description: 'Monitores de estado' }
    ]
  },
  {
    key: 'dragon3:stream:perf:metrics',
    description: 'Métricas de rendimiento',
    groups: [
      { name: 'dragon3-performance-collectors', description: 'Recolectores de métricas' }
    ]
  },
  {
    key: 'dragon3:stream:error:alerts',
    description: 'Alertas de error',
    groups: [
      { name: 'dragon3-error-handlers', description: 'Manejadores de errores' }
    ]
  },
  {
    key: 'dragon3:stream:security:events',
    description: 'Eventos de seguridad',
    groups: [
      { name: 'dragon3-security-monitors', description: 'Monitores de seguridad' }
    ]
  },
  {
    key: 'dragon3:stream:health:checks',
    description: 'Health checks',
    groups: [
      { name: 'dragon3-health-monitors', description: 'Monitores de salud' }
    ]
  },
  {
    key: 'dragon3:stream:audit:trail',
    description: 'Auditoría de operaciones',
    groups: [
      { name: 'dragon3-audit-processors', description: 'Procesadores de auditoría' }
    ]
  }
];

export { STREAM_DEFINITIONS };

/**
 * Asegura que todos los streams y grupos definidos existan en Redis.
 * Debe llamarse una vez al arrancar el sistema, antes de iniciar consumidores.
 * Utiliza comandos Redis estándar compatibles con ioredis: .call('XINFO', ...), .call('XGROUP', ...).
 */
export async function ensureAllStreams(redis) {
  // 1. BLINDAJE: Extraer el cliente nativo para asegurar que existe .call()
  const client = redis ? (redis.client || redis) : null;

  if (!client || typeof client.call !== "function") {
    dragonLogger.sePreocupa(
      `[DEBUG] El cliente Redis recibido NO es válido para Streams.`,
      { component: "StreamManager", tipo: typeof client }
    );
    // IMPORTANTE: Devolvemos false en lugar de lanzar Error para no parar el server
    return false;
  }

  dragonLogger.respira(
    'Asegurando existencia de streams y grupos definidos en Redis',
    { component: 'StreamManager', totalStreams: STREAM_DEFINITIONS.length }
  );

  let globalSuccess = true;

  for (const stream of STREAM_DEFINITIONS) {
    for (const group of stream.groups) {
      // Usamos el cliente verificado (client)
      const result = await ensureStreamAndGroup(client, stream.key, group.name);

      if (result && typeof result === 'object') {
        // Logs de éxito
        if (result.streamStatus === 'created/verified') {
          dragonLogger.sonrie(`Stream verificado/creado: ${stream.key}`, { component: 'StreamManager' });
        }

        if (result.groupStatus === 'created') {
          dragonLogger.sonrie(`Grupo creado: ${group.name} en ${stream.key}`, { component: 'StreamManager' });
        } else if (result.groupStatus === 'exists') {
          dragonLogger.zen(`Grupo ya existe: ${group.name}`, { component: 'StreamManager' });
        }

        // Si falla un stream concreto, avisamos pero NO lanzamos throw
        if (!result.success) {
          dragonLogger.sePreocupa(
            `No se pudo asegurar stream/grupo: ${stream.key}/${group.name} (pero continuamos)`,
            { component: 'StreamManager' }
          );
          globalSuccess = false;
        }
      } else {
        dragonLogger.sePreocupa(
          `Error inesperado en stream: ${stream.key}`,
          { component: 'StreamManager' }
        );
        globalSuccess = false;
      }
    }
  }

  if (globalSuccess) {
    dragonLogger.zen(
      'Todos los streams y grupos asegurados correctamente',
      { component: 'StreamManager', total: STREAM_DEFINITIONS.length }
    );
  } else {
    dragonLogger.sePreocupa(
      'Infraestructura de streams completada con advertencias.',
      { component: 'StreamManager' }
    );
  }

  return globalSuccess;
}

/**
 * Crea un stream y grupo solo si no existen.
 * KISS: Uso de MKSTREAM para evitar mensajes basura de "init".
 */
export async function ensureStreamAndGroup(redis, streamKey, groupName) {
  // 1. BLINDAJE: Si redis es undefined o null, abortamos con dignidad
  if (!redis) {
    return {
      success: false,
      streamStatus: 'error',
      groupStatus: 'redis_undefined'
    };
  }

  // 2. Extraer el motor nativo de forma segura
  const client = redis.client || redis;

  // 3. Verificación extra: Si el cliente extraído no tiene .call, algo va muy mal
  if (typeof client.call !== 'function') {
    return { success: false, streamStatus: 'error', groupStatus: 'no_call_method' };
  }

  let streamStatus = 'exists';
  let groupStatus = 'unknown';

  try {
    try {
      await client.call('XGROUP', 'CREATE', streamKey, groupName, '$', 'MKSTREAM');
      groupStatus = 'created';
      streamStatus = 'created/verified';
    } catch (err) {
      if (err && err.message && err.message.includes('BUSYGROUP')) {
        groupStatus = 'exists';
      } else {
        throw err;
      }
    }
    return { success: true, streamStatus, groupStatus };
  } catch (error) {
    // Usamos console.error si el logger falla
    console.error(`[STREAM ERROR] ${streamKey}: ${error.message}`);
    return { success: false, streamStatus, groupStatus };
  }
}

export function getStreamDefinitions() {
  return STREAM_DEFINITIONS;
}

export function getStreamConfig(streamKey, groupName) {
  const stream = STREAM_DEFINITIONS.find(s => s.key === streamKey);
  if (!stream) return null;
  const group = stream.groups.find(g => g.name === groupName);
  if (!group) return null;
  return { streamKey: stream.key, groupName: group.name };
}

export function getAllStreamConfigs() {
  const configs = [];
  for (const stream of STREAM_DEFINITIONS) {
    for (const group of stream.groups) {
      configs.push({ streamKey: stream.key, groupName: group.name });
    }
  }
  return configs;
}

export default {
  ensureAllStreams,
  ensureStreamAndGroup,
  getStreamDefinitions,
  getStreamConfig,
  getAllStreamConfigs
};
