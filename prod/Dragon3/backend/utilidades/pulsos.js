/**
 * ====================================================================
 * DRAGON3 FAANG - SISTEMA DE PULSOS (HEARTBEAT)
 * ====================================================================
 *
 * Archivo: utilidades/pulsos.js
 * Proyecto: Dragon3 - AI Image Auth System
 * Versión: 1.0.0
 * Fecha: 2025-04-15
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Sistema de pulsos (heartbeat) para Dragon3 que permite monitorizar
 * servicios distribuidos, detectar fallos y mantener registro de estado
 * del sistema. Implementado con patrones de bajo consumo de recursos.
 * ====================================================================
 */

import { withRedis, executePipeline } from './redis.js';
import dragon from '../utilidades/logger.js';
import os from 'os';
import { hostname } from 'os';

// Prefijos para claves en Redis
const KEYS = {
  HEARTBEAT: 'dragon:pulso:',        // Prefijo para pulsos individuales
  REGISTRY: 'dragon:servicios',      // Hash con todos los servicios
  STATS: 'dragon:stats:'             // Prefijo para estadísticas
};

// Intervalos predeterminados (ms)
const DEFAULT_INTERVAL = parseInt(process.env.DRAGON_PULSE_INTERVAL) || 15000;
const DEFAULT_TTL = parseInt(process.env.DRAGON_PULSE_TTL) || 30;  // segundos

/**
 * Crea un sistema de pulsos para un servicio
 * 
 * @param {Object} options - Opciones de configuración
 * @param {string} options.serviceId - ID único del servicio
 * @param {string} options.serviceType - Tipo de servicio (api, worker, etc.)
 * @param {number} options.interval - Intervalo entre pulsos (ms)
 * @param {Object} options.metadata - Datos adicionales a almacenar
 * @returns {Object} - Controlador del sistema de pulsos
 */
export function crearPulsos(options = {}) {
  const {
    serviceId = `${process.env.SERVICE_TYPE || 'service'}-${hostname()}-${process.pid}`,
    serviceType = process.env.SERVICE_TYPE || 'unknown',
    interval = DEFAULT_INTERVAL,
    metadata = {}
  } = options;
  
  let isRunning = false;
  let heartbeatTimer = null;
  const startTime = Date.now();
  const heartbeatKey = `${KEYS.HEARTBEAT}${serviceId}`;
  
  // Información básica del servicio
  const serviceInfo = {
    id: serviceId,
    type: serviceType,
    host: hostname(),
    pid: process.pid,
    version: process.env.DRAGON_VERSION || '1.0',
    startTime,
    metadata
  };
  
  /**
   * Inicia el envío periódico de pulsos
   * @returns {Promise<void>}
   */
  async function iniciar() {
    if (isRunning) return;
    
    try {
      // Registrar servicio en directorio global
      await withRedis(client => client.hset(
        KEYS.REGISTRY,
        serviceId,
        JSON.stringify({
          ...serviceInfo,
          status: 'active',
          registered: Date.now()
        })
      ));
      
      // Enviar primer pulso inmediatamente
      await enviarPulso();
      
      // Configurar envío periódico
      heartbeatTimer = setInterval(async () => {
        try {
          await enviarPulso();
        } catch (err) {
          dragon.sePreocupa(`Error al enviar pulso: ${err.message}`, 'PULSOS', 'HEARTBEAT_ERROR');
        }
      }, interval);
      
      isRunning = true;
      dragon.respira(`Sistema de pulsos iniciado para ${serviceId}`, 'PULSOS', 'INIT');
    } catch (err) {
      dragon.seEnfada(`Error al iniciar sistema de pulsos: ${err.message}`, 'PULSOS', 'INIT_ERROR');
      throw err;
    }
  }
  
  /**
   * Detiene el envío de pulsos
   * @returns {Promise<void>}
   */
  async function detener() {
    if (!isRunning) return;
    
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    
    try {
      // Actualizar estado en registro
      await withRedis(client => client.hset(
        KEYS.REGISTRY,
        serviceId,
        JSON.stringify({
          ...serviceInfo,
          status: 'stopped',
          stoppedAt: Date.now()
        })
      ));
      
      // Eliminar clave de pulso
      await withRedis(client => client.del(heartbeatKey));
      
      isRunning = false;
      dragon.respira(`Sistema de pulsos detenido para ${serviceId}`, 'PULSOS', 'STOP');
    } catch (err) {
      dragon.sePreocupa(`Error al detener sistema de pulsos: ${err.message}`, 'PULSOS', 'STOP_ERROR');
    }
  }
  
  /**
   * Envía un pulso (heartbeat)
   * @returns {Promise<void>}
   */
  async function enviarPulso() {
    const now = Date.now();
    
    // Información del sistema para el pulso
    const systemInfo = getSystemInfo();
    
    const pulseData = {
      timestamp: now,
      uptime: now - startTime,
      host: hostname(),
      system: systemInfo
    };
    
    try {
      // Usar pipeline para eficiencia
      await executePipeline([
        // Actualizar pulso con TTL (2x intervalo para margen de seguridad)
        {
          name: 'setex',
          args: [
            heartbeatKey,
            Math.ceil(interval / 500) * DEFAULT_TTL,  // TTL en segundos
            JSON.stringify(pulseData)
          ]
        },
        // Actualizar estado en registro
        {
          name: 'hset',
          args: [
            KEYS.REGISTRY,
            serviceId,
            JSON.stringify({
              ...serviceInfo,
              status: 'active',
              lastHeartbeat: now,
              system: systemInfo
            })
          ]
        }
      ]);
    } catch (err) {
      dragon.sePreocupa(`Error al enviar pulso: ${err.message}`, 'PULSOS', 'PULSE_ERROR');
      throw err;
    }
  }
  
  /**
   * Obtiene estadísticas del sistema
   * @private
   * @returns {Object} - Información del sistema
   */
  function getSystemInfo() {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsed = memTotal - memFree;
    const memPercent = Math.round((memUsed / memTotal) * 100);
    
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    const cpuPercent = Math.round((loadAvg[0] / cpuCount) * 100);
    
    return {
      memory: {
        total: Math.floor(memTotal / 1024 / 1024),  // MB
        used: Math.floor(memUsed / 1024 / 1024),    // MB
        percent: memPercent
      },
      cpu: {
        count: cpuCount,
        load: loadAvg[0],
        percent: cpuPercent
      }
    };
  }
  
  return {
    iniciar,
    detener,
    enviarPulso,
    serviceId
  };
}

/**
 * Comprueba el estado de servicios registrados
 * @returns {Promise<Object>} - Estado de los servicios
 */
export async function comprobarServicios() {
  try {
    // Obtener todos los servicios registrados
    const servicios = await withRedis(client => client.hgetall(KEYS.REGISTRY));
    
    if (!servicios) {
      return { activos: 0, inactivos: 0, servicios: [] };
    }
    
    const now = Date.now();
    const estado = {
      activos: 0,
      inactivos: 0,
      servicios: []
    };
    
    // Comprobar cada servicio
    await Promise.all(Object.entries(servicios).map(async ([id, dataJson]) => {
      try {
        const data = JSON.parse(dataJson);
        
        // Verificar si el pulso está activo (clave existe)
        const pulsoKey = `${KEYS.HEARTBEAT}${id}`;
        const pulsoExiste = await withRedis(client => client.exists(pulsoKey));
        
        const isActive = pulsoExiste === 1 && data.status === 'active';
        
        // Actualizar contadores
        if (isActive) {
          estado.activos++;
        } else {
          estado.inactivos++;
        }
        
        // Añadir a lista de servicios
        estado.servicios.push({
          id,
          tipo: data.type,
          host: data.host,
          activo: isActive,
          ultimoPulso: data.lastHeartbeat || 0,
          tiempoInactivo: data.lastHeartbeat ? now - data.lastHeartbeat : null
        });
      } catch (err) {
        dragon.sePreocupa(`Error procesando servicio ${id}: ${err.message}`, 'PULSOS', 'CHECK_ERROR');
      }
    }));
    
    return estado;
  } catch (err) {
    dragon.sePreocupa(`Error comprobando servicios: ${err.message}`, 'PULSOS', 'CHECK_SERVICES_ERROR');
    throw err;
  }
}

/**
 * Verifica si un servicio específico está activo
 * @param {string} serviceId - ID del servicio a comprobar
 * @returns {Promise<boolean>} - true si está activo
 */
export async function servicioActivo(serviceId) {
  try {
    const pulsoKey = `${KEYS.HEARTBEAT}${serviceId}`;
    const existe = await withRedis(client => client.exists(pulsoKey));
    return existe === 1;
  } catch (err) {
    dragon.sePreocupa(`Error verificando estado de ${serviceId}: ${err.message}`, 'PULSOS', 'CHECK_SERVICE_ERROR');
    return false;
  }
}

/**
 * Limpia servicios inactivos del registro
 * @param {number} maxInactiveTime - Tiempo máximo de inactividad (ms)
 * @returns {Promise<Array>} - Servicios eliminados
 */
export async function limpiarInactivos(maxInactiveTime = 3600000) {
  try {
    // Obtener todos los servicios
    const servicios = await withRedis(client => client.hgetall(KEYS.REGISTRY));
    
    if (!servicios) {
      return [];
    }
    
    const now = Date.now();
    const eliminados = [];
    
    // Comprobar cada servicio
    await Promise.all(Object.entries(servicios).map(async ([id, dataJson]) => {
      try {
        const data = JSON.parse(dataJson);
        
        // Si no tiene latido reciente y ha pasado el tiempo máximo
        if (data.lastHeartbeat && (now - data.lastHeartbeat > maxInactiveTime)) {
          // Eliminar del registro
          await withRedis(client => client.hdel(KEYS.REGISTRY, id));
          eliminados.push({
            id,
            tipo: data.type,
            host: data.host,
            ultimoPulso: data.lastHeartbeat
          });
        }
      } catch (err) {
        dragon.sePreocupa(`Error limpiando servicio ${id}: ${err.message}`, 'PULSOS', 'CLEANUP_ERROR');
      }
    }));
    
    if (eliminados.length > 0) {
      dragon.respira(`Limpiados ${eliminados.length} servicios inactivos`, 'PULSOS', 'CLEANUP');
    }
    
    return eliminados;
  } catch (err) {
    dragon.sePreocupa(`Error limpiando servicios inactivos: ${err.message}`, 'PULSOS', 'CLEANUP_SERVICES_ERROR');
    return [];
  }
}

export default crearPulsos;