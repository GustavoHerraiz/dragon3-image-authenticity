/**
 * ====================================================================
 * ML WORKER - FAANG COMPLIANT
 * Procesa solicitudes de inferencia desde Redis Streams usando Red Superior.
 * Contrato: consume dragon3:stream:req:superior, responde en stream indicado
 *           o en dragon3:stream:res:superior.
 * Utiliza el cliente rawRedisClient exportado por RedisClient.js.
 * ====================================================================
 */
import { performance } from 'node:perf_hooks';
import dragon from '../../utilidades/logger.js';
import { rawRedisClient } from '../../utilidades/redis/core/RedisClient.js';
import redSuperior from '../redSuperior/redSuperior.js';

// Constantes (deben coincidir con servidorCentral.js)
const REQ_STREAM = 'dragon3:stream:req:superior';
const RES_STREAM_GLOBAL = 'dragon3:stream:res:superior';
const CONSUMER_GROUP = 'dragon3-superior-processors';
const CONSUMER_ID = `ml_worker_${process.pid}`;

class MLWorker {
  constructor() {
    this.running = false;
    this.stats = { processed: 0, errors: 0, lastError: null };
  }

  async initialize() {
    if (!redSuperior.initialized) {
      throw new Error('Red Superior no inicializada');
    }
    try {
      await rawRedisClient.xgroup('CREATE', REQ_STREAM, CONSUMER_GROUP, '0', 'MKSTREAM');
      dragon.zen(`Grupo ${CONSUMER_GROUP} listo`, 'mlWorker', 'GROUP_READY');
    } catch (err) {
      if (!err.message.includes('BUSYGROUP')) {
        dragon.agoniza('Error creando grupo', err, 'mlWorker', 'GROUP_ERROR');
        throw err;
      }
    }
    dragon.sonrie(`Worker ${CONSUMER_ID} inicializado`, 'mlWorker');
  }

  async start() {
    this.running = true;
    dragon.sonrie(`🔥 Worker ${CONSUMER_ID} escuchando en ${REQ_STREAM}`, 'mlWorker');

    while (this.running) {
      try {
        const result = await rawRedisClient.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_ID,
          'COUNT', '5',
          'BLOCK', '2000',
          'STREAMS', REQ_STREAM, '>'
        );

        // result tiene estructura: [[stream, [[id, [campo1, valor1, ...]]]]]
        if (!result || !result[0] || !result[0][1]) continue;

        for (const [id, fieldsArray] of result[0][1]) {
          // Convertir fieldsArray a objeto
          const msg = {};
          for (let i = 0; i < fieldsArray.length; i += 2) {
            msg[fieldsArray[i]] = fieldsArray[i + 1];
          }
          // Procesar mensaje (sin esperar para no bloquear el bucle)
          this.processMessage(id, msg).catch(err => {
            dragon.agoniza('Error en processMessage', err, 'mlWorker');
          });
        }
      } catch (err) {
        if (err.message.includes('NOGROUP')) {
          dragon.sePreocupa('Grupo/stream perdido, recreando...', 'mlWorker', 'GROUP_RECREATE');
          try {
            await rawRedisClient.xgroup('CREATE', REQ_STREAM, CONSUMER_GROUP, '0', 'MKSTREAM');
            dragon.zen('Grupo recreado con éxito', 'mlWorker', 'GROUP_RECREATED');
          } catch (e) {
            if (!e.message.includes('BUSYGROUP')) {
              dragon.agoniza('Error al recrear grupo', e, 'mlWorker');
            }
          }
          continue;
        }
        if (!err.message.includes('timeout')) {
          this.stats.errors++;
          this.stats.lastError = err.message;
          dragon.sePreocupa('Error en loop principal', 'mlWorker', 'LOOP_ERROR', { error: err.message });
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  async processMessage(msgId, msg) {
    const startTime = performance.now();
    let acked = false;
    try {
      // 1. Extraer campos obligatorios
      const archivoId = msg.archivoId;
      const correlationId = msg.correlationId;
      const respStream = msg.respStream || RES_STREAM_GLOBAL;
      let payload = {};

      if (msg.payload) {
        try {
          payload = JSON.parse(msg.payload);
        } catch (e) {
          throw new Error(`Payload inválido: ${e.message}`);
        }
      } else if (msg.datos) {
        // Retrocompatibilidad con formato antiguo
        payload = JSON.parse(msg.datos);
      } else {
        throw new Error('Mensaje sin payload ni datos');
      }

      let features = payload.features;
      if (typeof features === 'string') features = JSON.parse(features);
      if (!Array.isArray(features) || features.length === 0) {
        throw new Error('Features no válidas o vacías');
      }

      // 2. Invocar Red Superior
      const opciones = {
        correlationId,
        archivoId,
        herramientas: payload.herramientas || [],
        localAnalyzers: payload.localAnalyzers || null,
      };
      const resultado = await redSuperior.predecir(features, opciones);

      // 3. Publicar respuesta en el stream indicado (formato compatible con _xreadOnce)
const respuestaObjeto = {
  categoria: resultado.categoria,
  confianza: resultado.confianza,
  scores: resultado.scores,
  metadata: {
    timestamp: Date.now(),
    archivoId: archivoId,
    correlationId: correlationId
  }
};
const responseFields = [
  'respuesta', JSON.stringify(respuestaObjeto),
  'archivoId', archivoId,
  'correlationId', correlationId
];
console.log(`📤 Worker respondiendo a stream: ${respStream}`);
await rawRedisClient.xadd(respStream, '*', ...responseFields);

      // 4. Confirmar mensaje original (solo después de publicar respuesta)
      await rawRedisClient.xack(REQ_STREAM, CONSUMER_GROUP, msgId);
      acked = true;

      const latency = performance.now() - startTime;
      this.stats.processed++;
      dragon.respira('Mensaje procesado', 'mlWorker', 'MSG_OK', {
        msgId,
        correlationId,
        archivoId,
        categoria: resultado.categoria,
        confianza: resultado.confianza,
        latencyMs: Math.round(latency),
      });
    } catch (err) {
      dragon.agoniza('Error procesando mensaje', err, 'mlWorker', 'MSG_ERROR', {
        msgId,
        error: err.message,
      });
      // Aunque falle, hacer ACK para no bloquear el grupo (evita reprocesamiento infinito)
      if (!acked) {
        try {
          await rawRedisClient.xack(REQ_STREAM, CONSUMER_GROUP, msgId);
        } catch (ackErr) {
          dragon.sePreocupa('Fallo ACK después de error', 'mlWorker', 'ACK_ERROR', { msgId });
        }
      }
    }
  }

  async shutdown() {
    if (!this.running) return;
    this.running = false;
    dragon.respira('Shutdown iniciado', 'mlWorker', 'SHUTDOWN');
    // Esperar a que termine el ciclo actual (máx 5 segundos)
    let attempts = 0;
    while (this.stats.processing && attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }
    // No cerramos rawRedisClient porque es compartido con otros módulos.
    dragon.zen('Worker finalizado', 'mlWorker', 'SHUTDOWN_OK', this.stats);
  }
}

// Arranque del worker si se ejecuta directamente o vía PM2
const worker = new MLWorker();
// Usamos una función autoinvocada asíncrona para permitir await a nivel de módulo
(async () => {
  await worker.initialize();
  await worker.start();
})();

// Capturar señales de terminación
process.on('SIGTERM', () => worker.shutdown());
process.on('SIGINT', () => worker.shutdown());

export default worker;