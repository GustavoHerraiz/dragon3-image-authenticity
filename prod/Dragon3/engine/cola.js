/**
 * cola.js
 *
 * Sistema de colas para operaciones pesadas (procesamiento de imagen con sharp).
 * Usa Bull con Redis, aislado en la base de datos 2 para no interferir con Dragon3.
 *
 * Principios: KISS, aislado, robusto, con reintentos, manejo de errores y timeout por célula.
 *
 * La concurrencia máxima se lee dinámicamente desde defensa.js (y por tanto desde configuracion.json),
 * lo que permite que el agente de decisión la ajuste automáticamente sin reiniciar el servidor.
 *
 * @module cola
 */

import Bull from 'bull';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde la ruta correcta
// Como server.js ya carga el .env, esto es un respaldo por si se ejecuta cola.js solo.
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

// ============================================================
//  CONFIGURACIÓN DE REDIS (con autenticación y caracteres especiales)
// ============================================================

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT, 10) || 6379;
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || '').replace(/^['"]+|['"]+$/g, '');
const REDIS_DB = parseInt(process.env.REDIS_DB, 10) || 2;
const CONFIG_PATH = path.join(__dirname, 'configuracion.json');

function getConcurrenciaMaxima() {
  if (process.env.QUEUE_CONCURRENCY) {
    return Math.max(1, Math.min(20, Number(process.env.QUEUE_CONCURRENCY)));
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return config.defensa?.segundaLinea?.concurrenciaMaxima || 5;
}

// Configuración de Redis para Bull (objeto, NO URL)
// Esto evita problemas con caracteres especiales en la contraseña (/ + @ etc.)
const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  // Si hay contraseña, la añadimos (sin escape)
  ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {})
};

console.log(`🔐 Conectando a Redis en ${REDIS_HOST}:${REDIS_PORT}, DB ${REDIS_DB} (autenticación: ${REDIS_PASSWORD ? 'sí' : 'no'})`);

// Nombre único para la cola (evita colisiones con Dragon3)
const QUEUE_NAME = 'celula:cola';

// Instancia única de la cola (singleton)
let colaInstance = null;
let colaCerrada = false;

async function logEstadoCola(cola, fase) {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      cola.getWaitingCount(),
      cola.getActiveCount(),
      cola.getCompletedCount(),
      cola.getFailedCount(),
      cola.getDelayedCount()
    ]);
    console.log(`[Bull:${QUEUE_NAME}] ${fase} | waiting=${waiting} active=${active} completed=${completed} failed=${failed} delayed=${delayed}`);
  } catch (error) {
    console.warn(`[Bull:${QUEUE_NAME}] ${fase} | no se pudo leer el estado: ${error.message}`);
  }
}

/**
 * Obtiene la instancia de la cola (singleton).
 * La concurrencia máxima se lee en tiempo real desde defensa.js.
 * @returns {Bull.Queue} Instancia de la cola Bull.
 */
export function getCola() {
  colaCerrada = false;
  if (!colaInstance) {
    const concurrenciaMaxima = getConcurrenciaMaxima();
    console.log(`📊 Concurrencia máxima configurada: ${concurrenciaMaxima} trabajos/segundo`);

    colaInstance = new Bull(QUEUE_NAME, {
      redis: redisOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        timeout: 30000,
        removeOnComplete: true,
        removeOnFail: false
      },
      limiter: {
        max: concurrenciaMaxima,
        duration: 1000
      }
    });

    colaInstance.on('ready', async () => {
      console.log(`[Bull:${QUEUE_NAME}] cola lista y en espera de trabajo`);
      await logEstadoCola(colaInstance, 'ready');
    });

    colaInstance.on('waiting', async (jobId) => {
      console.log(`[Bull:${QUEUE_NAME}] trabajo en espera: ${jobId}`);
      await logEstadoCola(colaInstance, 'waiting');
    });

    colaInstance.on('active', async (job) => {
      console.log(`[Bull:${QUEUE_NAME}] trabajo activo: job=${job.id} celula=${job.data.celulaId}`);
      await logEstadoCola(colaInstance, 'active');
    });

    colaInstance.on('completed', async (job, result) => {
      console.log(`[Bull:${QUEUE_NAME}] trabajo completado: job=${job.id} celula=${job.data.celulaId} resultado=${result ? 'ok' : 'vacío'}`);
      await logEstadoCola(colaInstance, 'completed');
    });

    colaInstance.on('failed', async (job, err) => {
      console.error(`[Bull:${QUEUE_NAME}] trabajo fallido: job=${job?.id} celula=${job?.data?.celulaId} error=${err?.message}`);
      await logEstadoCola(colaInstance, 'failed');
    });

    colaInstance.on('drained', async () => {
      console.log(`[Bull:${QUEUE_NAME}] cola drenada: queda en espera y lista para más trabajo`);
      await logEstadoCola(colaInstance, 'drained');
    });

    colaInstance.on('error', (error) => {
      console.error(`[Bull:${QUEUE_NAME}] error global de cola: ${error.message}`);
    });

    // Configurar workers
    _configurarWorkers(colaInstance);

    console.log(`🐂 Cola de trabajos inicializada (Redis DB 2) y queda en espera para más trabajo`);
  }
  return colaInstance;
}

/**
 * Configura los workers para procesar los trabajos de la cola.
 * @param {Bull.Queue} cola - Instancia de la cola.
 */
function _configurarWorkers(cola) {
  const concurrenciaSerial = 1;
  cola.process('procesar-celula', concurrenciaSerial, async (job) => {
    const { celulaId, ruta, entrada, contexto } = job.data;
    console.log(`[Bull:${QUEUE_NAME}] procesando job=${job.id} celula=${celulaId} en worker serial`);

    try {
      // Importar dinámicamente la célula (ruta absoluta)
      const rutaAbsoluta = path.resolve(ruta);
      const modulo = await import(rutaAbsoluta);
      const fn = modulo.default || modulo;

      // Ejecutar la célula
      const salida = await fn(entrada, contexto);
      console.log(`[Bull:${QUEUE_NAME}] salida OK job=${job.id} celula=${celulaId}`);
      return salida;
    } catch (error) {
      console.error(`[Bull:${QUEUE_NAME}] fallo en job=${job.id} celula=${celulaId}: ${error.message}`);
      throw new Error(`Error al procesar célula "${celulaId}": ${error.message}`);
    }
  });

  // Eventos de la cola (para depuración)
  cola.on('completed', (job, result) => {
    console.log(`✅ Trabajo completado: ${job.id} (célula: ${job.data.celulaId})`);
  });

  cola.on('failed', (job, err) => {
    console.error(`❌ Trabajo fallido: ${job.id} (célula: ${job.data.celulaId})`, err.message);
  });

  cola.on('stalled', (job) => {
    console.warn(`⚠️ Trabajo estancado: ${job.id} (célula: ${job.data.celulaId})`);
  });
}

/**
 * Encola un trabajo para procesar una célula pesada con timeout configurable.
 * @param {string} celulaId - ID de la célula.
 * @param {string} ruta - Ruta al archivo de la célula.
 * @param {Object} entrada - Entrada para la célula.
 * @param {Object} contexto - Contexto compartido.
 * @param {number} [timeout=5000] - Tiempo máximo de ejecución en milisegundos.
 * @returns {Promise<Object>} Resultado de la célula.
 */
export async function encolarCelula(celulaId, ruta, entrada, contexto, timeout = 5000) {
  const cola = getCola();
  const job = await cola.add('procesar-celula', {
    celulaId,
    ruta,
    entrada,
    contexto
  }, {
    timeout: timeout // Timeout específico para esta célula
  });
  // Esperar a que el trabajo termine y devolver el resultado
  return await job.finished();
}

/**
 * Recarga la configuración de concurrencia (para aplicar cambios en caliente).
 * Bull no permite cambiar el limiter una vez creada la cola, pero esta función
 * queda preparada para futuras implementaciones (ej. reiniciar workers con pm2).
 * @returns {Promise<boolean>} true si se recargó correctamente (siempre true).
 */
export async function recargarConcurrencia() {
  try {
    const nuevoMax = getConcurrenciaMaxima();
    console.log(`🔄 Recarga de concurrencia solicitada. Nuevo valor: ${nuevoMax}`);
    console.log('   (Nota: Bull no permite cambiar el limiter en caliente sin reiniciar workers)');
    console.log('   Para aplicar el cambio, reinicie el proceso (pm2 restart) o reinicie los workers.');
    return true;
  } catch (error) {
    console.error('❌ Error al recargar concurrencia:', error.message);
    return false;
  }
}

/**
 * Cierra la cola y libera recursos.
 * Debe llamarse al apagar el servidor.
 */
export async function cerrarCola() {
  if (colaInstance) {
    colaCerrada = true;
    await colaInstance.close();
    colaInstance = null;
    console.log('🐂 Cola de trabajos cerrada.');
  }
}

export function estaColaCerrada() {
  return colaCerrada;
}

// ============================================================
//  MANEJO DE SEÑALES DE TERMINACIÓN
// ============================================================

// Si el proceso termina, cerrar la cola
process.on('SIGTERM', async () => {
  await cerrarCola();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await cerrarCola();
  process.exit(0);
});

// ============================================================
//  EXPORTACIÓN POR DEFECTO (para facilitar la importación)
// ============================================================

export default {
  getCola,
  encolarCelula,
  cerrarCola,
  recargarConcurrencia
};