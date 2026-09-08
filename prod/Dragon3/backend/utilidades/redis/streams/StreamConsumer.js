/**
 * @file StreamConsumer.js
 * @description Consumidor de Redis Streams con resiliencia y recuperación para Dragon3 (FAANG/Dragon robusto)
 * @author Gustavo Herraiz
 * @date 2025-04-15
 * @version 2.2.2
 */

import { v4 as uuidv4 } from 'uuid';
import dragonLogger from '../../logger.js';
import { SERVICE_PRIORITIES } from '../core/constants.js';
import { getStreamConfig } from '../StreamManager.js'; // ✅ CORREGIDO: importación nombrada

class StreamConsumer {
  /**
   * @constructor
   * @param {Object} config - Configuración del consumidor
   * @param {string} config.streamKey - Clave del stream Redis
   * @param {string} config.groupName - Nombre del grupo de consumidores
   * @param {string} config.consumerName - Nombre del consumidor (opcional)
   * @param {Function} config.messageHandler - Función que procesa cada mensaje
   * @param {number} config.batchSize - Tamaño de lote (default: 10)
   * @param {number} config.pollInterval - Intervalo entre polls (ms, default: 1000)
   * @param {number} config.blockTime - Tiempo de bloqueo (ms, default: 2000)
   * @param {string} config.startId - ID inicial (default: '>')
   * @param {boolean} config.autoAck - Auto confirmación (default: true)
   * @param {Object} config.redis - Instancia de Redis (OBLIGATORIO)
   */
  constructor(config) {
    // Validaciones obligatorias
    if (!config || !config.streamKey) {
      dragonLogger.agoniza('StreamConsumer requiere streamKey', { component: 'StreamConsumer', config });
      this.isDegraded = true;
      return;
    }
    if (!config.groupName) {
      dragonLogger.agoniza('StreamConsumer requiere groupName', { component: 'StreamConsumer', config });
      this.isDegraded = true;
      return;
    }
    if (!config.messageHandler || typeof config.messageHandler !== 'function') {
      dragonLogger.agoniza('StreamConsumer requiere messageHandler como función', { component: 'StreamConsumer', config });
      this.isDegraded = true;
      return;
    }
    if (!config.redis) {
      dragonLogger.agoniza('StreamConsumer requiere una instancia de Redis en config.redis', { component: 'StreamConsumer', config });
      this.isDegraded = true;
      return;
    }

    // Validación contra StreamManager (única fuente de verdad)
    const streamConfig = getStreamConfig(config.streamKey, config.groupName); // ✅ USO DIRECTO
    if (!streamConfig) {
      dragonLogger.agoniza(
        `StreamConsumer recibe stream/grupo no definido en StreamManager: ${config.streamKey}/${config.groupName}`,
        { component: 'StreamConsumer', config }
      );
      this.isDegraded = true;
      return;
    }

    this.id = uuidv4();
    this.streamKey = config.streamKey;
    this.groupName = config.groupName;
    this.consumerName = config.consumerName || `consumer-${this.id.slice(0, 8)}`;
    this.messageHandler = config.messageHandler;
    this.redis = config.redis;

    // Opciones
    this.batchSize = config.batchSize || 10;
    this.pollInterval = config.pollInterval || 1000;
    this.blockTime = config.blockTime || 2000;
    this.startId = config.startId || '>';
    this.autoAck = config.autoAck !== undefined ? config.autoAck : true;

    // Control
    this.active = false;
    this.isProcessing = false;
    this.isPaused = false;
    this.isDegraded = false;
    this.lastError = null;
    this.lastSuccessfulPoll = null;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = config.maxConsecutiveErrors || 5;
    this.backoffStrategy = [1000, 2000, 3000, 5000, 8000, 13000, 21000];
    this.currentBackoffIndex = 0;

    // Estadísticas
    this.stats = {
      processed: 0,
      errors: 0,
      batchesProcessed: 0,
      reconnects: 0,
      lastLatency: 0,
      startTime: Date.now()
    };

    this.processingMessages = new Map();
    this.pendingMessages = [];

    dragonLogger.zen(`Stream Consumer ${this.consumerName} inicializado para ${this.streamKey} (grupo ${this.groupName})`, {
      component: 'StreamConsumer',
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      degraded: this.isDegraded
    });
  }

  async start() {
    if (this.active) {
      dragonLogger.debug(`Stream Consumer ${this.consumerName} ya está activo`, { component: 'StreamConsumer', consumerName: this.consumerName });
      return true;
    }
    if (this.isDegraded) {
      dragonLogger.sePreocupa(`StreamConsumer ${this.consumerName} arrancado en modo degradado. No procesará mensajes.`, { component: 'StreamConsumer', consumerName: this.consumerName });
      this.active = true;
      return true;
    }
    try {
      const exists = await this._ensureConsumerGroup();
      if (!exists) {
        dragonLogger.agoniza(`No se puede iniciar StreamConsumer: stream/grupo no disponible (${this.streamKey}/${this.groupName}).`, {
          component: 'StreamConsumer',
          consumerName: this.consumerName,
          streamKey: this.streamKey,
          groupName: this.groupName
        });
        this.isDegraded = true;
        return false;
      }

      dragonLogger.info(`Stream Consumer ${this.consumerName} iniciando para ${this.streamKey} (grupo ${this.groupName})`, {
        component: 'StreamConsumer',
        streamKey: this.streamKey,
        groupName: this.groupName,
        consumerName: this.consumerName
      });

      this.active = true;
      this.isPaused = false;
      this._pollMessages();
      this._startHealthCheck();
      return true;
    } catch (err) {
      dragonLogger.error(`Error iniciando Stream Consumer ${this.consumerName}: ${err.message}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        error: err.message,
        stack: err.stack
      });
      this.lastError = { message: err.message, time: new Date() };
      this.consecutiveErrors++;
      this.stats.errors++;
      this.isDegraded = true;
      return false;
    }
  }

  async stop() {
    if (!this.active) return;
    dragonLogger.info(`Stream Consumer ${this.consumerName} deteniendo`, { component: 'StreamConsumer', consumerName: this.consumerName });
    this.active = false;
    if (this.isProcessing) {
      dragonLogger.debug(`Esperando fin de procesamiento para ${this.consumerName}`, { component: 'StreamConsumer' });
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (!this.isProcessing) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 5000);
      });
    }
    dragonLogger.info(`Stream Consumer ${this.consumerName} detenido`, {
      component: 'StreamConsumer',
      consumerName: this.consumerName,
      processed: this.stats.processed,
      errors: this.stats.errors
    });
  }

  _determineServicePriority(streamKey) {
    const critical = ['imagenes:pendientes', 'auth', 'security', 'emergencia'];
    const high = ['grupo-analizadores-imagen', 'mirror', 'superior', 'procesamiento:imagenes'];
    const low = ['logs', 'stats', 'analytics', 'informes'];
    const key = streamKey.toLowerCase();
    if (critical.some(term => key.includes(term))) return SERVICE_PRIORITIES.CRITICAL;
    if (high.some(term => key.includes(term))) return SERVICE_PRIORITIES.HIGH;
    if (low.some(term => key.includes(term))) return SERVICE_PRIORITIES.LOW;
    return SERVICE_PRIORITIES.MEDIUM;
  }

  async _ensureConsumerGroup() {
    try {
      const streamInfo = await this.redis.xinfo('STREAM', this.streamKey).catch(() => null);
      if (!streamInfo) {
        dragonLogger.sePreocupa(`Stream ${this.streamKey} no existe. Debe ser creado por StreamManager.`, {
          component: 'StreamConsumer',
          streamKey: this.streamKey,
          groupName: this.groupName
        });
        return false;
      }
      const groups = await this.redis.xinfo('GROUPS', this.streamKey).catch(() => []);
      if (!Array.isArray(groups) || groups.length === 0) {
        dragonLogger.sePreocupa(`No hay grupos en el stream ${this.streamKey}`, { component: 'StreamConsumer', streamKey: this.streamKey, groupName: this.groupName });
        return false;
      }
      let groupExists = false;
      for (const groupEntry of groups) {
        if (Array.isArray(groupEntry)) {
          const nameIndex = groupEntry.indexOf('name');
          if (nameIndex !== -1 && groupEntry[nameIndex + 1] === this.groupName) {
            groupExists = true;
            break;
          }
        }
      }
      if (!groupExists) {
        dragonLogger.sePreocupa(`Grupo ${this.groupName} no existe en ${this.streamKey}. Debe ser creado por StreamManager.`, {
          component: 'StreamConsumer',
          streamKey: this.streamKey,
          groupName: this.groupName
        });
        return false;
      }
      return true;
    } catch (err) {
      dragonLogger.error(`Error verificando grupo para ${this.streamKey}: ${err.message}`, {
        component: 'StreamConsumer',
        streamKey: this.streamKey,
        groupName: this.groupName,
        error: err.message
      });
      this.isDegraded = true;
      return false;
    }
  }

  _pollMessages() {
    if (!this.active || this.isPaused || this.isDegraded) return;
    if (this.isProcessing) {
      setTimeout(() => this._pollMessages(), 100);
      return;
    }
    this.isProcessing = true;
    if (this.pendingMessages.length > 0) {
      this._processPendingMessages()
        .catch(err => {
          dragonLogger.error(`Error procesando mensajes pendientes: ${err.message}`, {
            component: 'StreamConsumer',
            consumerName: this.consumerName,
            error: err.message
          });
        })
        .finally(() => this._fetchAndProcessMessages());
    } else {
      this._fetchAndProcessMessages();
    }
  }

  async _fetchAndProcessMessages() {
    try {
      const streamsObj = { [this.streamKey]: this.startId };
      const result = await this.redis.xreadgroup(
        this.groupName,
        this.consumerName,
        streamsObj,
        { count: this.batchSize, block: this.blockTime }
      );

      if (this.consecutiveErrors > 0) {
        this.consecutiveErrors = 0;
        this.currentBackoffIndex = 0;
      }
      this.lastSuccessfulPoll = Date.now();

      if (!result || result.length === 0 || !result[0] || !result[0][1] || result[0][1].length === 0) {
        this.isProcessing = false;
        if (this.active && !this.isPaused) setTimeout(() => this._pollMessages(), this.pollInterval);
        return;
      }

      const messages = result[0][1];
      this.stats.batchesProcessed++;

      for (const [messageId, fields] of messages) {
        const messageData = {};
        for (let i = 0; i < fields.length; i += 2) messageData[fields[i]] = fields[i + 1];

        this.processingMessages.set(messageId, { data: messageData, startTime: Date.now() });
        try {
          await this._processMessage(messageId, messageData, this.streamKey);
          if (this.autoAck) await this.ackMessage(messageId);
          this.stats.processed++;
        } catch (err) {
          dragonLogger.error(`Error procesando mensaje ${messageId}: ${err.message}`, {
            component: 'StreamConsumer',
            consumerName: this.consumerName,
            messageId,
            error: err.message
          });
          this.stats.errors++;
        } finally {
          this.processingMessages.delete(messageId);
        }
      }

      this.isProcessing = false;
      if (this.active && !this.isPaused) setTimeout(() => this._pollMessages(), 0);
    } catch (err) {
      this.isProcessing = false;
      this.consecutiveErrors++;
      this.stats.errors++;
      this.lastError = { message: err.message, time: new Date() };

      dragonLogger.error(`Error en polling de ${this.streamKey}: ${err.message}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        streamKey: this.streamKey,
        consecutiveErrors: this.consecutiveErrors,
        error: err.message
      });

      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        dragonLogger.warn(`Demasiados errores consecutivos (${this.consecutiveErrors}), pausando consumer ${this.consumerName}`, { component: 'StreamConsumer', consumerName: this.consumerName });
        this.isPaused = true;
        const backoffTime = this._getNextBackoff();
        setTimeout(() => {
          dragonLogger.info(`Reanudando consumer ${this.consumerName} tras backoff ${backoffTime}ms`, { component: 'StreamConsumer', consumerName: this.consumerName, backoffTime });
          this.isPaused = false;
          this.consecutiveErrors = 0;
          this._pollMessages();
        }, backoffTime);
        return;
      }

      if (this.active && !this.isPaused) setTimeout(() => this._pollMessages(), this.pollInterval);
    }
  }

  _getNextBackoff() {
    const backoff = this.backoffStrategy[this.currentBackoffIndex] || this.backoffStrategy[this.backoffStrategy.length - 1];
    if (this.currentBackoffIndex < this.backoffStrategy.length - 1) this.currentBackoffIndex++;
    return backoff;
  }

  async _processMessage(messageId, messageData, streamKey) {
    return this.messageHandler(messageId, messageData, streamKey);
  }

  async _processPendingMessages() {
    if (this.pendingMessages.length === 0) return;
    dragonLogger.info(`Procesando ${this.pendingMessages.length} mensajes pendientes locales`, {
      component: 'StreamConsumer',
      consumerName: this.consumerName,
      pendingCount: this.pendingMessages.length
    });
    const messagesToProcess = [...this.pendingMessages];
    this.pendingMessages = [];
    for (const msg of messagesToProcess) {
      try {
        await this._processMessage(msg.id, msg.data, this.streamKey);
        if (this.autoAck) await this.ackMessage(msg.id);
        this.stats.processed++;
      } catch (err) {
        dragonLogger.error(`Error procesando mensaje pendiente ${msg.id}: ${err.message}`, {
          component: 'StreamConsumer',
          consumerName: this.consumerName,
          messageId: msg.id,
          error: err.message
        });
        this.stats.errors++;
        this.pendingMessages.push(msg);
      }
    }
  }

  async ackMessage(messageId) {
    try {
      await this.redis.xack(this.streamKey, this.groupName, messageId);
      return true;
    } catch (err) {
      dragonLogger.error(`Error confirmando mensaje ${messageId}: ${err.message}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        messageId,
        error: err.message
      });
      return false;
    }
  }

  async recoverPendingMessages() {
    try {
      dragonLogger.info(`Recuperando mensajes pendientes para ${this.consumerName}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        streamKey: this.streamKey,
        groupName: this.groupName
      });
      const pendingInfo = await this.redis.xpending(this.streamKey, this.groupName);
      if (!pendingInfo || pendingInfo.count === 0) {
        dragonLogger.debug(`No hay mensajes pendientes para ${this.consumerName}`, { component: 'StreamConsumer' });
        return 0;
      }
      const pendingCount = pendingInfo.count;
      const pendingMessages = await this.redis.xpending(this.streamKey, this.groupName, '-', '+', pendingCount);
      if (!Array.isArray(pendingMessages) || pendingMessages.length === 0) return 0;
      const messageIds = pendingMessages.map(msg => (Array.isArray(msg) ? msg[0] : msg.id));
      let recoveredCount = 0;
      for (let i = 0; i < messageIds.length; i += 50) {
        const batch = messageIds.slice(i, i + 50);
        const claimed = await this.redis.xclaim(this.streamKey, this.groupName, this.consumerName, 0, ...batch);
        if (claimed && Array.isArray(claimed)) {
          for (const [msgId, fields] of claimed) {
            const messageData = {};
            for (let j = 0; j < fields.length; j += 2) messageData[fields[j]] = fields[j + 1];
            this.pendingMessages.push({ id: msgId, data: messageData });
            recoveredCount++;
          }
        }
      }
      dragonLogger.info(`Recuperados ${recoveredCount} mensajes pendientes para ${this.consumerName}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        recoveredCount
      });
      return recoveredCount;
    } catch (err) {
      dragonLogger.error(`Error recuperando mensajes pendientes: ${err.message}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        error: err.message
      });
      return 0;
    }
  }

  _startHealthCheck() {
    setInterval(() => this._healthCheck(), 30000);
  }

  async _healthCheck() {
    if (!this.active || this.isPaused) return;
    try {
      const sinceLastPoll = this.lastSuccessfulPoll ? Date.now() - this.lastSuccessfulPoll : 0;
      if (sinceLastPoll > 2 * 60 * 1000) {
        dragonLogger.warn(`Health check: ${this.consumerName} sin polls exitosos por ${Math.round(sinceLastPoll / 1000)}s`, {
          component: 'StreamConsumer',
          consumerName: this.consumerName,
          sinceLastPoll: Math.round(sinceLastPoll / 1000)
        });
        await this.recoverPendingMessages();
      }
      const errorRate = this.stats.processed > 0 ? this.stats.errors / this.stats.processed : 0;
      dragonLogger.debug(`Health check ${this.consumerName}: Procesados: ${this.stats.processed}, Errores: ${this.stats.errors} (${(errorRate * 100).toFixed(2)}%)`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        processed: this.stats.processed,
        errors: this.stats.errors,
        errorRate,
        pendingCount: this.pendingMessages.length,
        processingCount: this.processingMessages.size,
        uptime: Math.floor((Date.now() - this.stats.startTime) / 1000)
      });
      if (errorRate > 0.01 && this.stats.processed > 100) {
        dragonLogger.warn(`Tasa de error elevada (${(errorRate * 100).toFixed(2)}%) para consumidor ${this.consumerName}`, {
          component: 'StreamConsumer',
          consumerName: this.consumerName,
          errorRate,
          threshold: '1%',
          processed: this.stats.processed,
          errors: this.stats.errors
        });
      }
    } catch (err) {
      dragonLogger.error(`Error en health check de ${this.consumerName}: ${err.message}`, {
        component: 'StreamConsumer',
        consumerName: this.consumerName,
        error: err.message
      });
    }
  }

  getStats() {
    const uptimeMs = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const errorRate = this.stats.processed > 0 ? this.stats.errors / this.stats.processed : 0;
    return {
      ...this.stats,
      errorRate,
      active: this.active,
      isPaused: this.isPaused,
      isProcessing: this.isProcessing,
      streamKey: this.streamKey,
      groupName: this.groupName,
      consumerName: this.consumerName,
      uptime: Math.floor(uptimeMs / 1000),
      lastError: this.lastError,
      pendingCount: this.pendingMessages.length,
      processingCount: this.processingMessages.size,
      performance: {
        messagesPerSecond: uptimeMs > 0 ? this.stats.processed / (uptimeMs / 1000) : 0
      }
    };
  }
}

export default StreamConsumer;