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
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const REDIS_DB = parseInt(process.env.REDIS_DB, 10) || 2;
const CONFIG_PATH = path.join(__dirname, 'configuracion.json');

function getConcurrenciaMaxima() {
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
        attempts: 3,                    // Reintentar hasta 3 veces si falla
        backoff: {
          type: 'exponential',
          delay: 1000                  // Espera 1s, 2s, 4s entre reintentos
        },
        timeout: 30000,                // Tiempo máximo de ejecución por defecto (30s)
        removeOnComplete: true,        // Eliminar trabajos completados
        removeOnFail: false            // Mantener fallidos para depuración
      },
      limiter: {
        max: concurrenciaMaxima,       // Número máximo de trabajos concurrentes (leído de defensa.js)
        duration: 1000                 // Por segundo
      }
    });

    // Configurar workers
    _configurarWorkers(colaInstance);

    console.log('🐂 Cola de trabajos inicializada (Redis DB 2)');
  }
  return colaInstance;
}

/**
 * Configura los workers para procesar los trabajos de la cola.
 * @param {Bull.Queue} cola - Instancia de la cola.
 */
function _configurarWorkers(cola) {
  cola.process('procesar-celula', getConcurrenciaMaxima(), async (job) => {
    const { celulaId, ruta, entrada, contexto } = job.data;

    try {
      // Importar dinámicamente la célula (ruta absoluta)
      const rutaAbsoluta = path.resolve(ruta);
      const modulo = await import(rutaAbsoluta);
      const fn = modulo.default || modulo;

      // Ejecutar la célula
      const salida = await fn(entrada, contexto);

      return salida;
    } catch (error) {
      // Relanzar el error para que Bull lo maneje (reintentos)
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