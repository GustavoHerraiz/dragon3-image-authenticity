/**
 * @file ConnectionManager.js
 * @description Gestor global de conexiones Redis para Dragon3
 * @author Gustavo Herraiz
 * @date 2025-04-15
 * @version 3.2.0 - SIN HEALTH CHECKS
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import dragonLogger from '../../logger.js';
import { SERVICE_PRIORITIES, SYSTEM_STATES } from './constants.js';

/**
 * Gestor centralizado de conexiones Redis
 * Coordina reconexiones, prioriza servicios y evita thundering herd
 * VERSION 100% SIN HEALTH CHECKS - Gestionados por HealthMonitor.js
 */
class RedisConnectionManager extends EventEmitter {
  constructor() {
    super();
    this.id = uuidv4();
    this.clients = new Map();
    this.clientsByService = new Map();
    this.priorityQueues = {
      [SERVICE_PRIORITIES.CRITICAL]: [],
      [SERVICE_PRIORITIES.HIGH]: [],
      [SERVICE_PRIORITIES.MEDIUM]: [],
      [SERVICE_PRIORITIES.LOW]: []
    };

    // Estado global del sistema Redis
    this.systemState = {
      overallStatus: SYSTEM_STATES.UNKNOWN,
      connectedClients: 0,
      disconnectedClients: 0,
      lastStatusChange: Date.now(),
      reconnectionInProgress: false,
      lastError: null
    };

    // Configuración - SIN HEALTH CHECKS
    this.config = {
      reconnectInterval: 5000,
      maxConcurrentReconnects: 3,
      reconnectTimeout: 30000
    };

    dragonLogger.sePreocupa(`Redis Connection Manager ${this.id} iniciado (0 HEALTH CHECKS)`, {
      component: 'RedisConnectionManager',
      managerId: this.id,
      healthChecks: 'ELIMINADOS COMPLETAMENTE',
      reason: 'Gestionados 100% por HealthMonitor.js'
    });

    // Iniciar monitoreo pasivo (sin health checks)
    this._startMonitoring();
  }

  /**
   * Registra un cliente Redis con este gestor
   * @param {string} clientId - ID único del cliente
   * @param {RedisClient} client - Instancia del cliente Redis (DEBE tener .client)
   */
  registerClient(clientId, client) {
    try {
      // Validar que el cliente tenga la propiedad .client
      if (!client || !client.client) {
        dragonLogger.agoniza(`[FATAL] Intento de registrar cliente SIN propiedad .client`, {
          component: 'RedisConnectionManager',
          clientId,
          clientType: typeof client,
          clientProps: client ? Object.keys(client) : 'null'
        });
        throw new Error(`El cliente Redis (${clientId}) debe tener una propiedad .client con el cliente nativo.`);
      }

      dragonLogger.zen(`[DIAGNÓSTICO] Registrando cliente: ${clientId}`, {
        component: 'RedisConnectionManager',
        clientStructure: Object.keys(client),
        hasClientProp: !!client.client,
        serviceName: client.serviceName,
        initialStatus: client.status ? client.status : 'undefined'
      });

      // Estado de inicialización
      if (!client.status) {
        client.status = { isConnected: false, isInitializing: true };
      } else {
        client.status.isInitializing = true;
      }

      this.clients.set(clientId, client);

      // Agrupar por servicio
      if (!this.clientsByService.has(client.serviceName)) {
        this.clientsByService.set(client.serviceName, new Set());
      }
      this.clientsByService.get(client.serviceName).add(clientId);

      // Añadir a cola de prioridad
      if (this.priorityQueues[client.priority]) {
        this.priorityQueues[client.priority].push(clientId);
      } else {
        this.priorityQueues[SERVICE_PRIORITIES.MEDIUM].push(clientId);
      }

      dragonLogger.zen(`Cliente Redis ${clientId} (${client.serviceName}) registrado`, {
        component: 'RedisConnectionManager',
        clientId,
        serviceName: client.serviceName,
        priority: client.priority,
        status: client.status
      });

      // Actualizar estado global después de un breve retraso
      setTimeout(() => {
        this._updateSystemState();
      }, 100);

    } catch (error) {
      dragonLogger.agoniza(`[FATAL] Error al registrar cliente: ${error.message}`, {
        component: 'RedisConnectionManager',
        clientId,
        error: error.message,
        stack: error.stack,
        clientType: typeof client,
        clientProps: client ? Object.keys(client) : 'null'
      });
    }
  }

  /**
 * Devuelve el cliente Redis *real* (raw) para consumo de streams
 * @param {string} clientId - ID único del cliente
 * @returns {object|undefined} Cliente Redis nativo o undefined si no existe
 */
getRawClientById(clientId) {
    try {
        const wrapper = this.clients.get(clientId);

        if (!wrapper) {
            dragonLogger.agoniza(`[DIAGNÓSTICO] Cliente no encontrado: ${clientId}`, {
                component: 'RedisConnectionManager',
                clientId,
                clientsKeys: Array.from(this.clients.keys())
            });
            return undefined;
        }

        // Solo aceptar .client como entrypoint
        if (!wrapper.client) {
            dragonLogger.agoniza(`[DIAGNÓSTICO] Cliente Redis ${clientId} no tiene propiedad .client`, {
                component: 'RedisConnectionManager',
                clientId,
                wrapperKeys: Object.keys(wrapper)
            });
            return undefined;
        }

        // Validar que el cliente nativo tenga los métodos críticos
        const requiredMethods = ['xadd', 'xreadgroup'];
        const missingMethods = requiredMethods.filter(
            method => typeof wrapper.client[method] !== 'function'
        );

        if (missingMethods.length > 0) {
            dragonLogger.agoniza(`[FATAL] Cliente Redis ${clientId} no tiene los métodos críticos: ${missingMethods.join(', ')}`, {
                component: 'RedisConnectionManager',
                clientId,
                clientType: typeof wrapper.client,
                clientMethods: Object.keys(wrapper.client)
            });
            return undefined;
        }

        // ✅ CORRECCIÓN: SIEMPRE devolver el cliente nativo (ioredis)
        return wrapper.client;
    } catch (error) {
        dragonLogger.agoniza(`[FATAL] Error en getRawClientById: ${error.message}`, {
            component: 'RedisConnectionManager',
            clientId,
            stack: error.stack
        });
        return undefined;
    }
}

  /**
   * Reporta conexión exitosa de un cliente
   * @param {string} clientId - ID del cliente
   * @param {string} serviceName - Nombre del servicio
   * @param {string} priority - Prioridad del servicio
   */
  reportSuccess(clientId, serviceName, priority) {
    const client = this.clients.get(clientId);
    if (!client) return;

    this._updateSystemState();
  }

  /**
   * Reporta error de un cliente Redis
   * @param {string} clientId - ID del cliente
   * @param {string} serviceName - Nombre del servicio
   * @param {string} priority - Prioridad del servicio
   * @param {Error} error - Error ocurrido
   */
  reportError(clientId, serviceName, priority, error) {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.systemState.lastError = {
      clientId,
      serviceName,
      priority,
      message: error.message,
      time: Date.now()
    };

    this._updateSystemState();
  }

  /**
   * Reporta fallo definitivo de un cliente
   * @param {string} clientId - ID del cliente
   * @param {string} serviceName - Nombre del servicio
   * @param {string} priority - Prioridad del servicio
   */
  reportFailure(clientId, serviceName, priority) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Si es un servicio crítico o de alta prioridad, iniciar recuperación
    if (priority === SERVICE_PRIORITIES.CRITICAL || priority === SERVICE_PRIORITIES.HIGH) {
      this._initiateSystemRecovery();
    }

    this._updateSystemState();
  }

  /**
   * Obtiene el estado actual del sistema
   * @returns {Object} Estado del sistema
   */
  getSystemState() {
    return {
      ...this.systemState,
      timestamp: Date.now(),
      clientCount: this.clients.size,
      clientsByPriority: {
        CRITICAL: this.priorityQueues[SERVICE_PRIORITIES.CRITICAL].length,
        HIGH: this.priorityQueues[SERVICE_PRIORITIES.HIGH].length,
        MEDIUM: this.priorityQueues[SERVICE_PRIORITIES.MEDIUM].length,
        LOW: this.priorityQueues[SERVICE_PRIORITIES.LOW].length
      },
      health_checks: 'ELIMINADOS - Gestionados por HealthMonitor.js'
    };
  }

  /**
   * Monitoreo continuo de sistema - 100% SIN HEALTH CHECKS
   * @private
   */
  _startMonitoring() {
    // ✅ MONITOREO 100% PASIVO - 0 HEALTH CHECKS
    dragonLogger.zen('Monitoring pasivo iniciado (0 health checks)', {
      component: 'RedisConnectionManager',
      managerId: this.id,
      healthChecks: 'ELIMINADOS COMPLETAMENTE'
    });

    // Solo actualización de estado basado en eventos
    setInterval(() => {
      this._updateSystemState();
    }, 30000);
  }

  /**
   * Actualiza el estado global basado en clientes conectados
   * @private
   */
  _updateSystemState() {
    try {
      let connected = 0;
      let disconnected = 0;

      // Contar clientes conectados y desconectados
      for (const client of this.clients.values()) {
        if (client.status && client.status.isConnected) {
          connected++;
        } else {
          disconnected++;
        }
      }

      this.systemState.connectedClients = connected;
      this.systemState.disconnectedClients = disconnected;

      // Calcular estado general
      const previousStatus = this.systemState.overallStatus;

      if (this.clients.size === 0) {
        this.systemState.overallStatus = SYSTEM_STATES.UNKNOWN;
      } else if (disconnected === 0) {
        this.systemState.overallStatus = SYSTEM_STATES.HEALTHY;
      } else if (connected === 0) {
        this.systemState.overallStatus = SYSTEM_STATES.CRITICAL;
      } else if (this._areCriticalServicesHealthy()) {
        this.systemState.overallStatus = SYSTEM_STATES.DEGRADED;
      } else {
        this.systemState.overallStatus = SYSTEM_STATES.CRITICAL;
      }

      // Si cambió el estado, registrar
      if (previousStatus !== this.systemState.overallStatus) {
        this.systemState.lastStatusChange = Date.now();

        dragonLogger.sePreocupa(`Estado del sistema Redis cambió: ${previousStatus} → ${this.systemState.overallStatus}`, {
          component: 'RedisConnectionManager',
          previousStatus,
          currentStatus: this.systemState.overallStatus,
          connected,
          disconnected
        });

        this.emit('stateChange', this.systemState);
      }
    } catch (error) {
      dragonLogger.agoniza(`[FATAL] Error en _updateSystemState: ${error.message}`, {
        component: 'RedisConnectionManager',
        error: error.stack
      });
    }
  }

  /**
   * Inicia proceso de recuperación del sistema
   * @private
   */
  _initiateSystemRecovery() {
    if (this.systemState.reconnectionInProgress) {
      return;
    }

    this.systemState.reconnectionInProgress = true;
    this.systemState.overallStatus = SYSTEM_STATES.RECOVERING;

    dragonLogger.sePreocupa('Iniciando proceso de recuperación del sistema Redis', {
      component: 'RedisConnectionManager'
    });

    this._reconnectByPriority(SERVICE_PRIORITIES.CRITICAL)
      .then(() => this._reconnectByPriority(SERVICE_PRIORITIES.HIGH))
      .then(() => {
        dragonLogger.sePreocupa('Recuperación de servicios críticos completada', {
          component: 'RedisConnectionManager'
        });
        this._evaluateSystemRecovery();
      })
      .catch(err => {
        dragonLogger.agoniza(`Error durante recuperación del sistema: ${err.message}`, {
          component: 'RedisConnectionManager'
        });
      })
      .finally(() => {
        this.systemState.reconnectionInProgress = false;
        this._updateSystemState();
      });
  }

  /**
   * Evalúa si debe continuar con recuperación de servicios no críticos
   * @private
   */
  _evaluateSystemRecovery() {
    const criticalHealthy = this._areCriticalServicesHealthy();

    if (!criticalHealthy) {
      dragonLogger.seEnfada('No se puede continuar con recuperación - críticos siguen caídos', {
        component: 'RedisConnectionManager'
      });
      return;
    }

    dragonLogger.sePreocupa('Continuando recuperación con servicios de prioridad media', {
      component: 'RedisConnectionManager'
    });

    this._reconnectByPriority(SERVICE_PRIORITIES.MEDIUM)
      .then(() => this._reconnectByPriority(SERVICE_PRIORITIES.LOW))
      .then(() => {
        dragonLogger.sePreocupa('Proceso de recuperación del sistema Redis completado', {
          component: 'RedisConnectionManager'
        });
      })
      .catch(err => {
        dragonLogger.agoniza(`Error durante recuperación de servicios no críticos: ${err.message}`, {
          component: 'RedisConnectionManager'
        });
      });
  }

  /**
   * Verifica si todos los servicios críticos están sanos
   * @private
   * @returns {boolean}
   */
  _areCriticalServicesHealthy() {
    const criticalClients = this.priorityQueues[SERVICE_PRIORITIES.CRITICAL];

    if (criticalClients.length === 0) {
      return true;
    }

    for (const clientId of criticalClients) {
      const client = this.clients.get(clientId);
      if (!client || !client.status.isConnected) {
        return false;
      }
    }

    return true;
  }

  /**
   * Reconecta clientes según su prioridad
   * @private
   */
  async _reconnectByPriority(priority) {
    const clientIds = this.priorityQueues[priority];

    if (!clientIds || clientIds.length === 0) {
      return;
    }

    dragonLogger.sePreocupa(`Iniciando reconexión de ${clientIds.length} clientes de prioridad ${priority}`, {
      component: 'RedisConnectionManager',
      priority,
      clientCount: clientIds.length
    });

    const batchSize = Math.min(this.config.maxConcurrentReconnects, clientIds.length);
    let reconnected = 0;

    for (let i = 0; i < clientIds.length; i += batchSize) {
      const batch = clientIds.slice(i, i + batchSize);

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const reconnectPromises = batch.map(clientId => {
        const client = this.clients.get(clientId);
        if (!client) return Promise.resolve();

        if (client.status.isConnected) {
          reconnected++;
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          if (client.client && typeof client.client.connect === 'function') {
            client.client.connect().catch(() => {});
          }
          setTimeout(() => resolve(), 5000);
        });
      });

      await Promise.all(reconnectPromises);
    }

    dragonLogger.sePreocupa(`Reconexión de clientes de prioridad ${priority} completada`, {
      component: 'RedisConnectionManager',
      priority,
      reconnected
    });
  }
}

// Singleton global
const globalConnectionManager = new RedisConnectionManager();

export default globalConnectionManager;
