/**
 * ====================================================================
 * DRAGON3 - REDES ESPEJO FAANG ENTERPRISE (ON-DEMAND STREAMS)
 * ====================================================================
 *
 * Archivo: backend/servicios/imagen/redesEspejo/redesEspejo.js
 * Versión: 4.0.0-FAANG-ONDEMAND-COMPATIBLE
 *
 * DESCRIPCIÓN:
 * Sistema de redes espejo on-demand 100% compatible con:
 * - analizadorImagen.js (contrato streams asíncronos)
 * - modelo.js (contrato formato datos EXIF)
 * - Arquitectura FAANG Enterprise existente
 *
 * CAMBIO PRINCIPAL:
 * Reemplaza loop infinito por procesamiento on-demand controlado
 * Elimina consumers zombies manteniendo compatibilidad total
 *
 * Autor: Gustavo Herráiz - Lead Architect
 * ====================================================================
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dragonLogger from '../../../utilidades/logger.js';

// Importar ioredis directamente para crear un cliente independiente
import Redis from 'ioredis';

// ====================================================================
// CONFIGURACIÓN FAANG ENTERPRISE - CLIENTE REDIS INDEPENDIENTE
// ====================================================================

// ✅ Cliente Redis independiente para redes espejo (aislado del connectionManager)
const redisEspejo = new Redis({
  host: '127.0.0.1', // Usar IP explícita para evitar bucles de DNS
  port: 6379,
  password: 'mFSv55LIO5/0R/0hrzuth+tw3hmtMTbT',
  lazyConnect: false, // Conectar inmediatamente
  connectTimeout: 1000, // 1 segundo de timeout de conexión
  commandTimeout: 1000, // 1 segundo de timeout de comandos
  maxRetriesPerRequest: 1, // Solo un reintento
  retryDelayOnFailover: 0,
  family: 4, // Forzar IPv4
  connectionName: 'redesEspejo_isolated', // Nombre único para la conexión
  autoResubscribe: false, // No resuscribir automáticamente
  autoResendUnfulfilledCommands: false // No reenviar comandos no cumplidos
});

// Eventos para monitoreo
redisEspejo.on('connect', () => {
  dragonLogger.zen('Redis Espejo (aislado) conectado', 'redesEspejo.js', 'REDIS_ESPEJO_CONNECTED');
});

redisEspejo.on('error', (err) => {
  dragonLogger.sePreocupa('Error en Redis Espejo (aislado)', 'redesEspejo.js', 'REDIS_ESPEJO_ERROR', { error: err.message });
});

redisEspejo.on('close', () => {
  dragonLogger.respira('Conexión Redis Espejo (aislado) cerrada', 'redesEspejo.js', 'REDIS_ESPEJO_CLOSED');
});

const RUTA_BASE = '/var/www/Dragon3/backend/servicios/imagen/redesEspejo';
const STREAM_REQ = 'dragon3:stream:req:espejo';
const STREAM_RESP = 'dragon3:stream:resp:espejo';
const CONSUMER_GROUP = 'dragon3-espejo-processors';
const MAX_PROCESSING_TIME = 30000; // 30 segundos máximo por mensaje
const BLOCK_TIMEOUT = 5000; // 5 segundos timeout de lectura
const CLEANUP_IDLE_THRESHOLD = 300000; // 5 minutos para limpiar zombies

// Estado para control de ejecución
let espejoRunning = false;
let currentProcessing = null;

// ====================================================================
// CORE - DESCUBRIMIENTO Y CARGA DE REDES ESPEJO
// ====================================================================

/**
 * Descubre dinámicamente todas las redes espejo disponibles
 * @returns {Array} Lista de redes espejo descubiertas
 */
function descubrirRedes() {
  const redes = [];
  try {
    const subdirs = fs.readdirSync(RUTA_BASE, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    for (const dirent of subdirs) {
      const modeloPath = path.join(RUTA_BASE, dirent.name, 'modelo.js');
      if (fs.existsSync(modeloPath)) {
        redes.push({
          nombre: dirent.name,
          path: modeloPath
        });
      }
    }
    dragonLogger.sonrie(`Descubiertas ${redes.length} redes espejo`, 'redesEspejo.js', 'REDES_DISCOVERED', {
      redes: redes.map(r => r.nombre)
    });
  } catch (error) {
    dragonLogger.agoniza('Error descubriendo redes espejo', error, 'redesEspejo.js', 'REDES_DISCOVERY_ERROR');
  }
  return redes;
}

/**
 * Carga todas las redes espejo descubiertas
 * @param {Array} redes - Lista de redes a cargar
 * @returns {Object} Mapa de funciones analizar por red
 */
async function cargarRedes(redes) {
  const mirrors = {};
  for (const red of redes) {
    try {
      let modulo;
      try {
        modulo = await import(pathToFileURL(red.path).href);
      } catch (e) {
        modulo = require(red.path);
      }
      const analizarFn = modulo.analizar || modulo.default?.analizar;
      if (typeof analizarFn !== 'function') {
        dragonLogger.seEnfada(
          `Red espejo ${red.nombre} no expone función analizar() estándar`,
          'redesEspejo.js',
          'CONTRATO_INVALIDO',
          { red: red.nombre }
        );
        continue;
      }
      mirrors[red.nombre] = analizarFn;
      dragonLogger.sonrie(
        `Red espejo ${red.nombre} cargada correctamente`,
        'redesEspejo.js',
        'MIRRORNET_LOADED',
        { red: red.nombre }
      );
    } catch (err) {
      dragonLogger.agoniza(
        `Error cargando red espejo ${red.nombre}`,
        err,
        'redesEspejo.js',
        'MIRRORNET_LOAD_ERROR',
        { red: red.nombre }
      );
    }
  }
  return mirrors;
}

// ====================================================================
// CORE - LIMPIEZA Y MANTENIMIENTO
// ====================================================================

/**
 * Limpia consumers zombies del grupo de Redis
 * @param {Object} redis - Cliente Redis
 */
async function limpiarConsumidoresZombies(redis) {
  try {
    const consumers = await redis.xinfo('CONSUMERS', STREAM_REQ, CONSUMER_GROUP);
    let cleanedCount = 0;

    for (const consumer of consumers) {
      // Limpiar consumidores inactivos > 5 minutos
      if (consumer.idle > CLEANUP_IDLE_THRESHOLD) {
        try {
          await redis.xgroup('DELCONSUMER', STREAM_REQ, CONSUMER_GROUP, consumer.name);
          cleanedCount++;
          dragonLogger.respira(
            `Consumidor zombie limpiado: ${consumer.name}`,
            'redesEspejo.js',
            'CONSUMER_CLEANED',
            { consumer: consumer.name, idle: consumer.idle }
          );
        } catch (cleanupError) {
          // No fatal, continuar
        }
      }
    }

    if (cleanedCount > 0) {
      dragonLogger.sonrie(
        `Limpieza completada: ${cleanedCount} consumidores zombies removidos`,
        'redesEspejo.js',
        'CONSUMER_CLEANUP_COMPLETE'
      );
    }
  } catch (error) {
    dragonLogger.sePreocupa(
      'Error en limpieza de consumidores zombies',
      'redesEspejo.js',
      'CONSUMER_CLEANUP_ERROR',
      { error: error.message }
    );
  }
}

/**
 * Timeout wrapper para procesamiento de redes
 * @param {Promise} promise - Promesa a ejecutar
 * @param {number} timeoutMs - Timeout en milisegundos
 * @param {string} operation - Nombre de la operación
 */
async function procesarConTimeout(promise, timeoutMs, operation) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout después de ${timeoutMs}ms en ${operation}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle);
    throw error;
  }
}

// ====================================================================
// CORE - PROCESAMIENTO DE MENSAJES (100% COMPATIBLE)
// ====================================================================

/**
 * Procesa un mensaje de red espejo - 100% COMPATIBLE con contrato existente
 * @param {string} msgId - ID del mensaje Redis
 * @param {Object} campos - Campos del mensaje
 * @returns {Promise} Promesa de procesamiento
 */
// Reemplaza la función procesarMensajeEspejo por esta versión segura (resume resultados y evita cargar/parsear payloads gigantes)
export async function procesarMensajeEspejo(msgId, campos) {
  const startTime = Date.now();
  const consumerName = `redesEspejo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Helper: resumen seguro del resultado
  const summarizeResult = (res) => {
    try {
      if (res == null) return null;
      if (typeof res !== 'object') return { value: String(res).slice(0, 512) };
      return {
        exitoso: res.exitoso ?? res.success ?? null,
        confianza: typeof res.confianza === 'number' ? res.confianza : (typeof res.score === 'number' ? res.score : null),
        mensaje: (res.mensaje || res.message || res.resumen?.decision) ? String(res.mensaje || res.message || res.resumen?.decision).slice(0, 512) : null,
        detallesKeys: Object.keys(res).slice(0, 10)
      };
    } catch (e) {
      return { error: 'summarize_failed' };
    }
  };

  try {
    // Normalizar entrada: aceptar 'datos' o 'payload' y 'rutaArchivo'
    const archivoId = campos.archivoId ?? campos.fileId ?? null;
    const correlationId = campos.correlationId ?? campos.corrId ?? null;
    const rawData = campos.datos ?? campos.payload ?? null;
    const rutaArchivo = campos.rutaArchivo ?? campos.path ?? null;

    if (!archivoId || !correlationId || (!rawData && !rutaArchivo)) {
      dragonLogger.seEnfada('Mensaje espejo inválido - campos faltantes', 'redesEspejo.js', 'ESPEJO_MSG_INVALID', { msgId, archivoId, correlationId, hasRawData: !!rawData, hasRutaArchivo: !!rutaArchivo });
      return;
    }

    // Evitar parsear payloads enormes
    let parsedDatos = null;
    if (rawData) {
      try {
        const rawBytes = Buffer.byteLength(String(rawData), 'utf8');
        const MAX_PARSE_BYTES = 200 * 1024; // 200 KB
        if (rawBytes <= MAX_PARSE_BYTES) {
          parsedDatos = JSON.parse(rawData);
        } else {
          dragonLogger.sePreocupa('Payload demasiado grande para parsear en memoria, usando rutaArchivo o resumen', 'redesEspejo.js', 'ESPEJO_PAYLOAD_TOO_LARGE', { archivoId, msgId, sizeBytes: rawBytes });
        }
      } catch (parseError) {
        dragonLogger.seEnfada('Error parseando datos del mensaje espejo', 'redesEspejo.js', 'ESPEJO_MSG_PARSE_ERROR', { msgId, error: parseError.message, datosSample: String(rawData).substring(0,200) });
        return; // dejar pendiente o permitir otro worker procesar
      }
    }

    if (!parsedDatos && rutaArchivo) parsedDatos = { rutaArchivo };

    const input = { idImagen: archivoId, datos: parsedDatos && parsedDatos.exif ? parsedDatos.exif : (parsedDatos || { rutaArchivo }) };

    dragonLogger.respira('Iniciando procesamiento mensaje espejo', 'redesEspejo.js', 'ESPEJO_PROCESS_START', { archivoId, correlationId, consumerName, msgId });

    // Cargar mirrors
    let mirrors = {};
    try {
      const redesDescubiertas = descubrirRedes();
      mirrors = await cargarRedes(redesDescubiertas);
    } catch (loadErr) {
      dragonLogger.agoniza('Error cargando redes espejo', loadErr, 'redesEspejo.js', 'REDES_LOAD_ERROR', { archivoId, msgId });
      // publicar fallback y ACK para evitar bloqueo
      try {
        const fallbackResp = { archivoId, correlationId, redes: [], error: 'mirror_load_failed', timestamp: Date.now(), processingTime: Date.now() - startTime };
        await redisEspejo.xadd(STREAM_RESP, '*', 'archivoId', archivoId, 'correlationId', correlationId, 'respuesta', JSON.stringify(fallbackResp), 'timestamp', Date.now().toString());
        await redisEspejo.xack(STREAM_REQ, CONSUMER_GROUP, msgId);
      } catch (e) {
        dragonLogger.sePreocupa('No se pudo publicar fallback response ni ackear', 'redesEspejo.js', 'FALLBACK_PUBLISH_FAIL', { error: e.message });
      }
      return;
    }

    const redes = [];
    const promesas = [];
    for (const [nombre, analizarFn] of Object.entries(mirrors)) {
      const prom = procesarConTimeout((async () => await analizarFn(input))(), MAX_PROCESSING_TIME, `red-espejo-${nombre}`)
        .then(resultado => {
          redes.push({ nombre, resumen: summarizeResult(resultado), latencia: Date.now() - startTime, timestamp: new Date().toISOString() });
        })
        .catch(err => {
          redes.push({ nombre, error: true, resumen: { error: String(err).slice(0,200) }, timestamp: new Date().toISOString() });
        });
      promesas.push(prom);
    }

    await Promise.all(promesas);

    const redesSafe = redes.map(r => ({ nombre: r.nombre, latencia: r.latencia, timestamp: r.timestamp, resumen: r.resumen }));
    const respuesta = { archivoId, correlationId, redes: redesSafe, procesadoPor: consumerName, timestamp: Date.now(), processingTime: Date.now() - startTime };

    try {
      await redisEspejo.xadd(STREAM_RESP, '*', 'archivoId', String(archivoId), 'correlationId', String(correlationId), 'respuesta', JSON.stringify(respuesta), 'timestamp', Date.now().toString());
    } catch (publishErr) {
      dragonLogger.sePreocupa('Error publicando respuesta espejo en Redis', 'redesEspejo.js', 'ESPEJO_PUBLISH_ERROR', { archivoId, correlationId, error: publishErr.message });
      return;
    }

    try {
      await redisEspejo.xack(STREAM_REQ, CONSUMER_GROUP, msgId);
    } catch (ackErr) {
      dragonLogger.sePreocupa('Error ackeando mensaje espejo', 'redesEspejo.js', 'ESPEJO_ACK_ERROR', { archivoId, correlationId, msgId, error: ackErr.message });
    }

    dragonLogger.sonrie('Procesamiento mensaje espejo completado', 'redesEspejo.js', 'ESPEJO_PROCESS_SUCCESS', { archivoId, correlationId, msgId, processingTime: Date.now() - startTime, redesCount: redes.length, consumerName });

    return respuesta;

  } catch (err) {
    dragonLogger.agoniza('Error crítico procesando mensaje espejo', err, 'redesEspejo.js', 'ESPEJO_PROCESS_CRITICAL_ERROR', { msgId, processingTime: Date.now() - startTime, consumerName, archivoId: campos?.archivoId, correlationId: campos?.correlationId });
    throw err;
  }
}

// ====================================================================
// ORCHESTRATOR - PROCESAMIENTO ON-DEMAND (REEMPLAZA LOOP INFINITO)
// ====================================================================

/**
 * Procesa el siguiente mensaje disponible en el stream - ON-DEMAND
 * @returns {Promise<boolean>} True si procesó mensaje, false si no hay mensajes
 */
export async function procesarSiguienteMensajeEspejo() {
  if (currentProcessing) {
    dragonLogger.respira('Ya hay un procesamiento en curso, omitiendo', 'redesEspejo.js', 'ESPEJO_ALREADY_PROCESSING');
    return false;
  }

  currentProcessing = true;

  try {
    // ✅ LECTURA DE UN MENSAJE (mismo contrato que loop original)
    const mensajes = await redisEspejo.xreadgroup(
      'GROUP', CONSUMER_GROUP, `redesEspejo-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      'BLOCK', BLOCK_TIMEOUT,
      'COUNT', 1,
      'STREAMS', STREAM_REQ, '>'
    );

    if (!mensajes || mensajes.length === 0 || !mensajes[0][1] || mensajes[0][1].length === 0) {
      currentProcessing = false;
      return false; // No hay mensajes
    }

    const [msgId, msgFields] = mensajes[0][1][0];
    const campos = {};
    for (let i = 0; i < msgFields.length; i += 2) {
      campos[msgFields[i]] = msgFields[i + 1];
    }

    dragonLogger.respira(
      'Mensaje espejo recibido para procesamiento on-demand',
      'redesEspejo.js',
      'ESPEJO_MSG_RECEIVED',
      { msgId, archivoId: campos.archivoId }
    );

    // Procesar el mensaje
    await procesarMensajeEspejo(msgId, campos);

    currentProcessing = false;
    return true;

  } catch (err) {
    currentProcessing = false;

    if (err?.message && err.message.includes('Command timed out')) {
      // Timeout normal, no loggear como error
      return false;
    }

    dragonLogger.agoniza(
      'Error en procesamiento on-demand de mensaje espejo',
      err,
      'redesEspejo.js',
      'ESPEJO_ONDEMAND_ERROR'
    );
    return false;
  }
}

// ====================================================================
// INITIALIZATION - INICIALIZACIÓN FAANG ENTERPRISE
// ====================================================================

/**
 * Inicializa el sistema de redes espejo FAANG Enterprise
 * @param {Object} serviceState - Estado global de servicios (opcional)
 */
export async function initializeRedesEspejo(serviceState) {
  if (espejoRunning) {
    dragonLogger.sePreocupa('Red Espejo ya estaba inicializada', 'redesEspejo.js', 'REDES_ESPEJO_ALREADY_RUNNING');
    return;
  }

  try {
    dragonLogger.respira('Inicializando Red Espejo FAANG Enterprise (On-Demand)', 'redesEspejo.js', 'REDES_ESPEJO_INIT');

    // Limpiar zombies al iniciar
    await limpiarConsumidoresZombies(redisEspejo);

    // Asegurar grupo consumidor
    await asegurarGrupoConsumidor();

    espejoRunning = true;

    if (serviceState) {
      serviceState.redesEspejo = {
        status: 'ready',
        lastCheck: Date.now(),
        mode: 'on-demand',
        version: '4.0.0-FAANG-ONDEMAND-COMPATIBLE'
      };
    }

    dragonLogger.zen(
      'Red Espejo FAANG Enterprise inicializada correctamente (Modo On-Demand)',
      'redesEspejo.js',
      'REDES_ESPEJO_READY',
      { mode: 'on-demand', version: '4.0.0-FAANG-ONDEMAND-COMPATIBLE' }
    );

  } catch (err) {
    dragonLogger.agoniza(
      'Error inicializando Red Espejo FAANG Enterprise',
      err,
      'redesEspejo.js',
      'REDES_ESPEJO_INIT_ERROR'
    );

    if (serviceState) {
      serviceState.redesEspejo = { status: 'error', lastCheck: Date.now() };
    }
  }
}

/**
 * Asegura la existencia del grupo consumidor Redis
 */
async function asegurarGrupoConsumidor() {
  try {
    await redisEspejo.call('XGROUP', 'CREATE', STREAM_REQ, CONSUMER_GROUP, '$', 'MKSTREAM');
    dragonLogger.sonrie('Grupo consumidor Redis asegurado', 'redesEspejo.js', 'REDIS_GROUP_CREATED');
  } catch (err) {
    if (!/BUSYGROUP/.test(String(err))) {
      dragonLogger.agoniza(
        'Error creando grupo consumidor Redis',
        err,
        'redesEspejo.js',
        'REDIS_XGROUP_ERROR'
      );
    }
  }
}

// ====================================================================
// HEALTH & MONITORING - MONITOREO FAANG ENTERPRISE
// ====================================================================

/**
 * Verifica el estado de salud del sistema de redes espejo
 * @returns {Object} Estado de salud
 */
export function healthCheckRedesEspejo() {
  const estado = {
    status: espejoRunning ? 'healthy' : 'stopped',
    mode: 'on-demand',
    version: '4.0.0-FAANG-ONDEMAND-COMPATIBLE',
    timestamp: new Date().toISOString(),
    redis: redisEspejo.status === 'ready' ? true : false,
    currentProcessing: !!currentProcessing
  };

  if (!espejoRunning) {
    estado.issues = ['Sistema no está ejecutándose'];
  }

  if (redisEspejo.status !== 'ready') {
    estado.issues = [...(estado.issues || []), 'Cliente Redis no está listo'];
  }

  return estado;
}

/**
 * Apagado graceful del sistema
 */
export async function shutdownRedesEspejo() {
  if (!espejoRunning) return;

  dragonLogger.respira('Apagando Red Espejo FAANG Enterprise...', 'redesEspejo.js', 'REDES_ESPEJO_SHUTDOWN');

  espejoRunning = false;

  // Esperar a que termine el procesamiento actual
  let waitCount = 0;
  while (currentProcessing && waitCount < 10) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waitCount++;
  }

  // Cerrar conexión Redis
  await redisEspejo.quit();

  dragonLogger.zen(
    'Red Espejo FAANG Enterprise apagada correctamente',
    'redesEspejo.js',
    'REDES_ESPEJO_SHUTDOWN_COMPLETE'
  );
}

// ====================================================================
// PUBLIC API - API PÚBLICA FAANG ENTERPRISE
// ====================================================================

export {
  descubrirRedes,
  cargarRedes
};

export default {
  // Core
  procesarMensajeEspejo,
  procesarSiguienteMensajeEspejo,

  // Management
  initializeRedesEspejo,
  shutdownRedesEspejo,
  healthCheckRedesEspejo,

  // Discovery
  descubrirRedes,
  cargarRedes,

  // Metadata
  version: '4.0.0-FAANG-ONDEMAND-COMPATIBLE',
  mode: 'on-demand'
};
