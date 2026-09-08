/**
 * @fileoverview WebSocket Manager for Dragon3 System
 * @version 3.0.0
 * @author Gustavo Herraiz
 * @description Enterprise-grade WebSocket management with memory controls,
 *              connection limits, and automatic resource cleanup
 * @license Proprietary - Dragon Project
 */

// Convertido a ESM para consistencia con el resto del proyecto
import WebSocket, { WebSocketServer } from 'ws';
import dragon from "./logger.js";
import { performance } from 'perf_hooks';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * @constant {Object} CONFIG - Core configuration parameters
 * @private
 */
const CONFIG = {
  MAX_CONNECTIONS: 2000,
  MAX_CONNECTIONS_PER_IP: 50,
  HEARTBEAT_INTERVAL_MS: 30000,
  CONNECTION_TIMEOUT_MS: 60000,
  MEMORY_THRESHOLD_PERCENT: 80,
  MEMORY_CHECK_INTERVAL_MS: 15000,
  MAX_MESSAGE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  AUTO_RECONNECT: true,
  RECONNECT_INTERVAL_MS: 3000,
  MAX_RECONNECT_ATTEMPTS: 10
};

/**
 * Enterprise-grade WebSocket Manager for Dragon3
 * @class WebSocketManager
 */
class WebSocketManager {
  /**
   * Create WebSocketManager instance
   * @constructor
   */
  constructor() {
    /** @private {Map<string, Object>} - Active connections */
    this._connections = new Map();

    /** @private {Map<string, number>} - IP address tracking */
    this._ipConnections = new Map();

    /** @private {Object} - Performance metrics */
    this._metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesRecibidos: 0,
      messagesEnviados: 0,
      errors: 0,
      reconnects: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      p95LatencyMs: 0,
      latencies: [],
      // Métricas específicas para Dragon3
      analisisExitoso: 0,
      analisisFallido: 0,
      tiempoPromedioAnalisis: 0
    };

    /** @private {Array<Function>} - Event listeners */
    this._eventListeners = {};

    /** @private {Map<string, Object>} - Caché para optimizar rendimiento */
    this._cache = new Map();

    // Start memory monitoring
    this._startMemoryMonitoring();
    this._programarResetMetricas();

    dragon.zen('WebSocketManager Enterprise inicializado para Dragon3', 'WebSocketManager', 'INIT');
  }

  /**
   * Create a WebSocket server
   * @param {Object} options - Server options
   * @param {number} [options.puerto] - Server port
   * @param {http.Server} [options.servidor] - HTTP server to attach to
   * @param {Function} [options.alConectar] - Connection callback
   * @param {Function} [options.alMensaje] - Message callback
   * @param {Function} [options.alError] - Error callback
   * @returns {WebSocketServer} WebSocket server instance
   */
  crearServidor(options = {}) {
    const configuracionServidor = {
      maxPayload: CONFIG.MAX_MESSAGE_SIZE_BYTES,
      perMessageDeflate: options.compresionHabilitada ? {
        zlibDeflateOptions: {
          level: 6,
          memLevel: 8
        }
      } : false,
      ...options
    };

    // Validación de origen si está habilitada
    if (options.validacionOrigen && options.origenesPermitidos && options.origenesPermitidos.length > 0) {
      configuracionServidor.verifyClient = (info) => {
        const origen = info.origin || info.req.headers.origin;
        return options.origenesPermitidos.includes(origen);
      };
    }

    const servidor = new WebSocketServer(configuracionServidor);

    servidor.on('connection', (socket, request) => {
      this._gestionarConexion(socket, request, options.alConectar);

      socket.on('message', (mensaje) => {
        const inicio = performance.now();

        try {
          // Registrar métrica de mensaje recibido
          this._metrics.messagesRecibidos++;

          // Procesar mensaje si existe callback
          if (options.alMensaje) {
            options.alMensaje(mensaje, socket);
          }

          // Registrar latencia para cálculo P95
          const latencia = performance.now() - inicio;
          this._metrics.latencies.push(latencia);

          // Mantener solo las últimas 1000 mediciones para P95
          if (this._metrics.latencies.length > 1000) {
            this._metrics.latencies.shift();
          }

        } catch (error) {
          this._metrics.errors++;
          dragon.agoniza('Error al procesar mensaje', error, 'WebSocketManager', 'PROCESS_MESSAGE', {
            messageType: typeof mensaje,
            messageSize: mensaje?.length || 0
          });

          if (options.alError) {
            options.alError(error, socket);
          }
        }
      });
    });

    servidor.on('error', (error) => {
      this._metrics.errors++;
      dragon.agoniza('Error en servidor WebSocket', error, 'WebSocketManager', 'SERVER_ERROR');

      if (options.alError) {
        options.alError(error);
      }
    });

    // Monitorización avanzada del servidor
    setInterval(() => {
      this._actualizarEstadisticasServidor(servidor);
    }, 60000); // Cada minuto

    dragon.sonrie(`Servidor WebSocket creado ${options.puerto ? `en puerto ${options.puerto}` : 'con servidor personalizado'}`,
      'WebSocketManager', 'SERVER_CREATE');
    return servidor;
  }

  /**
   * Create a WebSocket client
   * @param {string} url - WebSocket server URL to connect to
   * @param {Object} options - Client options
   * @param {Function} [options.alAbrir] - Open connection callback
   * @param {Function} [options.alMensaje] - Message callback
   * @param {Function} [options.alCerrar] - Close callback
   * @param {Function} [options.alError] - Error callback
   * @param {Object} [options.protocolos] - Subprotocolos WebSocket
   * @returns {WebSocket} WebSocket client instance
   */
  crearCliente(url, options = {}) {
    let intentosReconexion = 0;
    const clienteId = this._generarId();

    // Función para establecer conexión con manejo de reconexión
    const conectar = () => {
      dragon.respira(`Conectando a ${url} (ID: ${clienteId})...`, 'WebSocketManager', 'CLIENT_CONNECT');

      const clienteOpciones = {
        perMessageDeflate: options.compresionHabilitada || false,
        ...options
      };

      const cliente = new WebSocket(url, options.protocolos, clienteOpciones);

      // Manejar evento de conexión establecida
      cliente.on('open', () => {
        intentosReconexion = 0;
        this._metrics.activeConnections++;
        dragon.respira(`Conectado a ${url} (ID: ${clienteId})`, 'WebSocketManager', 'CLIENT_CONNECTED');

        // Ejecutar callback si existe
        if (options.alAbrir) {
          options.alAbrir(cliente);
        }
      });

      // Manejar mensajes recibidos
      cliente.on('message', (mensaje) => {
        const inicio = performance.now();

        try {
          this._metrics.messagesRecibidos++;

          // Procesar mensaje con callback
          if (options.alMensaje) {
            options.alMensaje(mensaje, cliente);
          }

          // Métricas de latencia
          const latencia = performance.now() - inicio;
          this._metrics.latencies.push(latencia);
          if (this._metrics.latencies.length > 1000) {
            this._metrics.latencies.shift();
          }

        } catch (error) {
          this._metrics.errors++;
          dragon.agoniza('Error al procesar mensaje de cliente', error, 'WebSocketManager', 'CLIENT_MESSAGE_ERROR', {
            messageType: typeof mensaje,
            messageSize: mensaje?.length || 0
          });

          if (options.alError) {
            options.alError(error, cliente);
          }
        }
      });

      // Manejar cierre de conexión
      cliente.on('close', (codigo, razon) => {
        this._metrics.activeConnections = Math.max(0, this._metrics.activeConnections - 1);
        dragon.respira(`Desconectado de ${url} (ID: ${clienteId}) con código ${codigo}: ${razon || 'Sin razón'}`,
          'WebSocketManager', 'CLIENT_DISCONNECTED', { codigo, razon });

        // Ejecutar callback de cierre
        if (options.alCerrar) {
          options.alCerrar(codigo, razon, cliente);
        }

        // Manejar reconexión automática
        if (CONFIG.AUTO_RECONNECT && intentosReconexion < CONFIG.MAX_RECONNECT_ATTEMPTS) {
          intentosReconexion++;
          this._metrics.reconnects++;

          const tiempoEspera = Math.min(
            CONFIG.RECONNECT_INTERVAL_MS * Math.pow(1.5, intentosReconexion - 1),
            30000
          );

          dragon.respira(`Reconectando a ${url} (ID: ${clienteId}), intento ${intentosReconexion} en ${tiempoEspera}ms...`,
            'WebSocketManager', 'CLIENT_RECONNECT', { intento: intentosReconexion, tiempoEspera });
          setTimeout(conectar, tiempoEspera);
        }
      });

      // Manejar errores
      cliente.on('error', (error) => {
        this._metrics.errors++;
        dragon.agoniza(`Error de cliente para ${url} (ID: ${clienteId})`, error, 'WebSocketManager', 'CLIENT_ERROR');

        if (options.alError) {
          options.alError(error, cliente);
        }
      });

      // Configurar ping para mantener conexión activa
      const intervaloPing = setInterval(() => {
        if (cliente.readyState === WebSocket.OPEN) {
          cliente.ping();
        } else {
          clearInterval(intervaloPing);
        }
      }, CONFIG.HEARTBEAT_INTERVAL_MS);

      return cliente;
    };

    return conectar();
  }

  /**
   * Envía mensaje a todos los clientes conectados con filtrado opcional
   * @param {WebSocketServer} servidor - Servidor WebSocket
   * @param {*} datos - Datos a transmitir
   * @param {Function} [filtro] - Función de filtrado opcional
   * @returns {number} Número de clientes a los que se envió el mensaje
   */
    difundir(servidor, datos, filtro = null) {
    let contador = 0;
    const inicio = performance.now();

    try {
      servidor.clients.forEach((cliente) => {
        if (!filtro || filtro(cliente)) {
          // Usa enviarACliente, que sí controla backpressure
          if (this.enviarACliente(cliente, datos)) {
            contador++;
          }
        }
      });

      const tiempoTotal = performance.now() - inicio;
      dragon.zen(`Difusión enviada a ${contador} clientes en ${tiempoTotal.toFixed(2)}ms`,
        'WebSocketManager', 'BROADCAST', { contador, tiempoTotal: tiempoTotal.toFixed(2) });
      return contador;
    } catch (error) {
      this._metrics.errors++;
      dragon.agoniza('Error en difusión', error, 'WebSocketManager', 'BROADCAST_ERROR');
      throw error;
    }
  }

  /**
   * Envía mensaje a grupo específico de clientes por sala
   * @param {WebSocketServer} servidor - Servidor WebSocket
   * @param {string} sala - Identificador de sala
   * @param {*} datos - Datos a transmitir
   * @returns {number} Número de clientes a los que se envió el mensaje
   */
  difundirASala(servidor, sala, datos) {
    return this.difundir(servidor, datos, (cliente) => {
      return cliente.sala === sala;
    });
  }

  /**
   * Obtiene métricas actualizadas del WebSocketManager
   * @returns {Object} Métricas de rendimiento actuales
   */
  obtenerMetricas() {
    // Calcular latencia P95
    if (this._metrics.latencies.length > 0) {
      const ordenadas = [...this._metrics.latencies].sort((a, b) => a - b);
      const indice = Math.floor(ordenadas.length * 0.95);
      this._metrics.p95LatencyMs = ordenadas[indice];
    }

    // Calcular uptime en segundos
    const uptimeSegundos = Math.floor(process.uptime());

    // Monitorear rendimiento del WebSocketManager
    dragon.mideRendimiento('websocket_latencia_p95', this._metrics.p95LatencyMs, 'WebSocketManager', {
      conexionesActivas: this._metrics.activeConnections,
      memoryUsage: this._metrics.memoryUsage,
      uptimeSegundos
    });

    return {
      ...this._metrics,
      uptimeSegundos,
      uptimeFormateado: this._formatearTiempo(uptimeSegundos),
      timestamp: new Date().toISOString(),
      // Métricas específicas para FAANG
      errorRate: this._metrics.totalConnections > 0
        ? (this._metrics.errors / this._metrics.totalConnections * 100).toFixed(3)
        : 0
    };
  }

  /**
   * Asigna cliente a una sala específica para agrupación
   * @param {WebSocket} cliente - Cliente WebSocket
   * @param {string} sala - Identificador de sala
   */
  asignarASala(cliente, sala) {
    if (cliente && cliente.readyState === WebSocket.OPEN) {
      cliente.sala = sala;
      dragon.zen(`Cliente asignado a sala: ${sala}`, 'WebSocketManager', 'ROOM_ASSIGN');
      return true;
    }
    return false;
  }

  /**
   * Cierra todas las conexiones activas y libera recursos
   * @param {number} [codigo=1000] - Código de cierre WebSocket
   * @param {string} [razon='Servidor cerrando'] - Razón del cierre
   */
  cerrarTodo(codigo = 1000, razon = 'Servidor cerrando') {
    let cerradas = 0;

    this._connections.forEach((conexion, id) => {
      try {
        if (conexion.socket.readyState === WebSocket.OPEN) {
          conexion.socket.close(codigo, razon);
          cerradas++;
        }
      } catch (error) {
        dragon.sePreocupa(`Error al cerrar conexión ${id}`, error, 'WebSocketManager', 'CLOSE_ERROR');
      }
    });

    this._connections.clear();
    this._ipConnections.clear();
    this._metrics.activeConnections = 0;

    dragon.zen(`Cerradas ${cerradas} conexiones WebSocket`, 'WebSocketManager', 'CLOSE_ALL', { cerradas });

    // Forzar liberación de memoria si es posible
    if (global.gc) {
      global.gc();
      dragon.respira('Colector de basura ejecutado manualmente', 'WebSocketManager', 'FORCE_GC');
    }
  }

  /**
   * Gestiona nueva conexión WebSocket entrante
   * @private
   * @param {WebSocket} socket - Conexión WebSocket
   * @param {http.IncomingMessage} request - Solicitud HTTP
   * @param {Function} [alConectar] - Callback de conexión
   */
  _gestionarConexion(socket, request, alConectar) {
    const ip = request.socket.remoteAddress;
    const conexionId = this._generarId();

    // Verificar límite total de conexiones
    if (this._connections.size >= CONFIG.MAX_CONNECTIONS) {
      dragon.sePreocupa(`Límite de conexiones alcanzado (${CONFIG.MAX_CONNECTIONS}), rechazando nueva conexión`,
        'WebSocketManager', 'CONNECTION_LIMIT');
      socket.close(1013, 'Límite de conexiones alcanzado');
      return;
    }

    // Verificar límites por IP
    const ipCount = (this._ipConnections.get(ip) || 0) + 1;
    if (ipCount > CONFIG.MAX_CONNECTIONS_PER_IP) {
      dragon.sePreocupa(`IP ${ip} excedió límite de conexiones (${CONFIG.MAX_CONNECTIONS_PER_IP})`,
        'WebSocketManager', 'IP_LIMIT', { ip, count: ipCount });
      socket.close(1008, 'Límite de conexiones por IP excedido');
      return;
    }
    this._ipConnections.set(ip, ipCount);

    // Almacenar información de conexión
    this._connections.set(conexionId, {
      socket,
      ip,
      conectadoEn: Date.now(),
      ultimaActividad: Date.now(),
      activo: true,
      mensajesRecibidos: 0,
      mensajesEnviados: 0,
      userAgent: request.headers['user-agent'] || 'Desconocido'
    });

    this._metrics.totalConnections++;
    this._metrics.activeConnections++;

    dragon.respira(`Nueva conexión ${conexionId} desde ${ip}`, 'WebSocketManager', 'NEW_CONNECTION', {
      userAgent: request.headers['user-agent']?.substring(0, 100) || 'Desconocido'
    });

    // Configurar timeout de conexión
    socket.activo = true;
    socket.on('pong', () => {
      socket.activo = true;
      const conn = this._connections.get(conexionId);
      if (conn) {
        conn.ultimaActividad = Date.now();
        conn.activo = true;
      }
    });

    // Configurar heartbeat
    const intervaloPing = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.activo = false;
        socket.ping();
      } else {
        clearInterval(intervaloPing);
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);

    // Manejar cierre
    socket.on('close', () => {
      clearInterval(intervaloPing);
      this._removeConnection(conexionId, ip);
      dragon.respira(`Conexión ${conexionId} cerrada`, 'WebSocketManager', 'CONNECTION_CLOSED');
    });

    // Manejar mensajes
    socket.on('message', () => {
      const conn = this._connections.get(conexionId);
      if (conn) {
        conn.ultimaActividad = Date.now();
        conn.mensajesRecibidos++;
      }
    });

    // Invocar callback si se proporciona
    if (alConectar) {
      alConectar(socket, request);
    }
  }

  /**
   * Elimina conexión y limpia recursos
   * @private
   * @param {string} conexionId - ID de conexión
   * @param {string} ip - Dirección IP
   */
  _removeConnection(conexionId, ip) {
    // Limpiar contador IP
    if (ip) {
      const count = this._ipConnections.get(ip);
      if (count > 1) {
        this._ipConnections.set(ip, count - 1);
      } else {
        this._ipConnections.delete(ip);
      }
    }

    // Eliminar de conexiones
    this._connections.delete(conexionId);

    this._metrics.activeConnections = Math.max(0, this._metrics.activeConnections - 1);
  }

  /**
   * Inicia monitoreo de memoria y limpieza automática
   * @private
   */
  _startMemoryMonitoring() {
    setInterval(() => {
      try {
        const memoryUsage = process.memoryUsage();
        const memoriaTotal = os.totalmem();
        const porcentajeUsado = (memoryUsage.heapUsed / memoriaTotal) * 100;

        this._metrics.memoryUsage = porcentajeUsado;

        // Monitorear CPU si es posible (Node.js >8.0)
        try {
          const startUsage = process.cpuUsage();
          setTimeout(() => {
            const endUsage = process.cpuUsage(startUsage);
            const totalCPUUsage = (endUsage.user + endUsage.system) / 1000000; // Convert to seconds
            this._metrics.cpuUsage = totalCPUUsage * 100;
          }, 100);
        } catch (err) {
          // Ignorar error, esta métrica es opcional
        }

        // Realizar limpieza si se excede umbral de memoria
        if (porcentajeUsado > CONFIG.MEMORY_THRESHOLD_PERCENT) {
          dragon.sePreocupa(`Presión de memoria WebSocket detectada: ${porcentajeUsado.toFixed(1)}%`,
            'WebSocketManager', 'MEMORY_PRESSURE', {
              porcentajeUsado: porcentajeUsado.toFixed(1),
              umbral: CONFIG.MEMORY_THRESHOLD_PERCENT,
              heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
            });
          this._realizarLimpiezaMemoria();
        }

        // Limpiar conexiones inactivas
        this._limpiarConexionesInactivas();

      } catch (error) {
        dragon.agoniza('Error en monitoreo de memoria', error, 'WebSocketManager', 'MEMORY_MONITOR_ERROR');
      }
    }, CONFIG.MEMORY_CHECK_INTERVAL_MS);
  }

  /**
   * Programa reseteo periódico de algunas métricas para evitar overflow
   * @private
   */
  _programarResetMetricas() {
    // Reset diario de métricas acumulativas para evitar overflow
    setInterval(() => {
      // Preservar solo métricas activas, resetear acumulativas
      const activas = this._metrics.activeConnections;

      this._metrics.latencies = [];
      this._metrics.messagesRecibidos = 0;
      this._metrics.messagesEnviados = 0;

      dragon.respira('Métricas acumulativas reseteadas para prevenir overflow',
        'WebSocketManager', 'METRICS_RESET');
    }, 24 * 60 * 60 * 1000); // Cada 24 horas
  }

  /**
   * Limpia conexiones inactivas
   * @private
   */
  _limpiarConexionesInactivas() {
    const ahora = Date.now();
    let limpiadasCount = 0;

    this._connections.forEach((conn, id) => {
      const tiempoInactivo = ahora - conn.ultimaActividad;

      if (!conn.activo || tiempoInactivo > CONFIG.CONNECTION_TIMEOUT_MS) {
        try {
          conn.socket.terminate();
          this._removeConnection(id, conn.ip);
          limpiadasCount++;
        } catch (error) {
          dragon.sePreocupa(`Error limpiando conexión ${id}`, error, 'WebSocketManager', 'CLEANUP_ERROR');
        }
      }
    });

    if (limpiadasCount > 0) {
      dragon.respira(`Limpiadas ${limpiadasCount} conexiones inactivas`,
        'WebSocketManager', 'CONNECTIONS_CLEANUP', { count: limpiadasCount });
    }
  }

  /**
   * Realiza limpieza de memoria cuando hay alta presión
   * @private
   */
  _realizarLimpiezaMemoria() {
    // Ordenar conexiones por tiempo de actividad (más antiguas primero)
    const conexionesOrdenadas = [...this._connections.entries()]
      .sort((a, b) => a[1].ultimaActividad - b[1].ultimaActividad);

    // Eliminar 15% más antiguas con notificación al cliente
    const conexionesAEliminar = Math.max(1, Math.ceil(conexionesOrdenadas.length * 0.15));
    let eliminadasCount = 0;

    for (let i = 0; i < conexionesAEliminar && i < conexionesOrdenadas.length; i++) {
      const [id, conn] = conexionesOrdenadas[i];
      try {
        // Enviar notificación antes de cerrar si es posible
        if (conn.socket.readyState === WebSocket.OPEN) {
          try {
            this.enviarACliente(conn.socket, {
            tipo: 'sistema',
            accion: 'reconexion_requerida',
            mensaje: 'Reconexión requerida por mantenimiento del servidor'
          });
          } catch (e) {
            // Ignorar errores al enviar notificación
          }

          conn.socket.close(1001, 'Servidor bajo presión de memoria');
        } else {
          conn.socket.terminate();
        }

        this._removeConnection(id, conn.ip);
        eliminadasCount++;
      } catch (error) {
        dragon.sePreocupa(`Error eliminando conexión ${id} durante limpieza`,
          error, 'WebSocketManager', 'MEMORY_CLEANUP_ERROR');
      }
    }

    dragon.sonrie(`Limpieza por presión de memoria: eliminadas ${eliminadasCount} conexiones`,
      'WebSocketManager', 'MEMORY_CLEANUP', { eliminadas: eliminadasCount });

    // Forzar recolección de basura si disponible
    if (global.gc) {
      global.gc();
      dragon.respira('Recolección de basura forzada', 'WebSocketManager', 'FORCE_GC');
    }
  }

  /**
   * Actualiza estadísticas del servidor
   * @private
   * @param {WebSocketServer} servidor - Servidor a monitorear
   */
  _actualizarEstadisticasServidor(servidor) {
    try {
      // Calcular métricas P95 de latencia
      if (this._metrics.latencies.length > 0) {
        const ordenadas = [...this._metrics.latencies].sort((a, b) => a - b);
        const indice = Math.floor(ordenadas.length * 0.95);
        this._metrics.p95LatencyMs = ordenadas[indice];
      }

      // Verificar umbrales de alerta
      if (this._metrics.p95LatencyMs > 200) {
        dragon.sePreocupa(`¡ALERTA! Latencia P95 por encima del umbral: ${this._metrics.p95LatencyMs.toFixed(2)}ms`,
          'WebSocketManager', 'HIGH_LATENCY_ALERT', {
          p95Actual: this._metrics.p95LatencyMs.toFixed(2),
          umbralLatencia: 200,
          conexionesActivas: this._metrics.activeConnections
        });
      }

      if (this._metrics.memoryUsage > 90) {
        dragon.sePreocupa(`¡ALERTA! Uso de memoria crítico: ${this._metrics.memoryUsage.toFixed(1)}%`,
          'WebSocketManager', 'CRITICAL_MEMORY_ALERT', {
          memoriaActual: this._metrics.memoryUsage.toFixed(1),
          umbralCritico: 90
        });
      }

      // Registrar métricas de rendimiento periodicamente
      dragon.respira(
        `Estado WebSocket: ${this._metrics.activeConnections} conexiones | ` +
        `P95: ${this._metrics.p95LatencyMs.toFixed(2)}ms | ` +
        `Memoria: ${this._metrics.memoryUsage.toFixed(1)}% | ` +
        `Errores: ${this._metrics.errors}`,
        'WebSocketManager', 'STATS_UPDATE'
      );
    } catch (error) {
      dragon.agoniza('Error actualizando estadísticas', error, 'WebSocketManager', 'STATS_ERROR');
    }
  }

  /**
   * Genera ID único para conexión
   * @private
   * @returns {string} ID único
   */
  _generarId() {
    return uuidv4().substring(0, 8);
  }

  /**
   * Formatea tiempo en segundos a formato legible
   * @private
   * @param {number} segundos - Segundos a formatear
   * @returns {string} Tiempo formateado
   */
  _formatearTiempo(segundos) {
    const dias = Math.floor(segundos / (24 * 60 * 60));
    const horas = Math.floor((segundos % (24 * 60 * 60)) / (60 * 60));
    const minutos = Math.floor((segundos % (60 * 60)) / 60);
    const segs = Math.floor(segundos % 60);

    return `${dias}d ${horas}h ${minutos}m ${segs}s`;
  }

  /**
   * Registrar análisis exitoso para métricas Dragon3
   * @param {number} tiempoProcesamiento - Tiempo de procesamiento en ms
   */
  registrarAnalisisExitoso(tiempoProcesamiento) {
    this._metrics.analisisExitoso++;
    this._actualizarTiempoAnalisis(tiempoProcesamiento);
    dragon.zen('Análisis WebSocket exitoso registrado', 'WebSocketManager', 'ANALYSIS_SUCCESS', {
      tiempoProcesamiento,
      totalExitosos: this._metrics.analisisExitoso
    });
  }

  /**
   * Registrar análisis fallido para métricas Dragon3
   * @param {number} tiempoProcesamiento - Tiempo de procesamiento en ms
   */
  registrarAnalisisFallido(tiempoProcesamiento) {
    this._metrics.analisisFallido++;
    this._actualizarTiempoAnalisis(tiempoProcesamiento);
    dragon.sePreocupa('Análisis WebSocket fallido registrado', 'WebSocketManager', 'ANALYSIS_FAILURE', {
      tiempoProcesamiento,
      totalFallidos: this._metrics.analisisFallido
    });
  }

  /**
   * Actualiza el tiempo promedio de análisis
   * @private
   * @param {number} tiempoProcesamiento - Tiempo de procesamiento en ms
   */
  _actualizarTiempoAnalisis(tiempoProcesamiento) {
    const totalAnalisis = this._metrics.analisisExitoso + this._metrics.analisisFallido;
    if (totalAnalisis > 0) {
      // Media móvil ponderada (90% histórico, 10% nuevo valor)
      this._metrics.tiempoPromedioAnalisis =
        (this._metrics.tiempoPromedioAnalisis * 0.9) + (tiempoProcesamiento * 0.1);
    } else {
      this._metrics.tiempoPromedioAnalisis = tiempoProcesamiento;
    }
  }

  /**
   * Comprime datos para transmisión eficiente
   * @param {Object|string} datos - Datos a comprimir
   * @returns {string} Datos comprimidos
   */
  comprimirDatos(datos) {
    try {
      const datosString = typeof datos === 'string' ? datos : JSON.stringify(datos);
      // En una implementación real aquí habría compresión
      return datosString;
    } catch (error) {
      dragon.agoniza('Error comprimiendo datos', error, 'WebSocketManager', 'COMPRESSION_ERROR');
      throw error;
    }
  }

    /**
   * Envía mensaje a cliente específico con manejo de errores y control de backpressure
   * @param {WebSocket} cliente - Cliente WebSocket
   * @param {Object} datos - Datos a enviar
   * @returns {boolean} Éxito del envío
   */
  enviarACliente(cliente, datos) {
    try {
      if (cliente.readyState !== WebSocket.OPEN) {
        dragon.sePreocupa('Intento de envío a cliente no conectado', 'WebSocketManager', 'CLIENT_NOT_READY');
        return false;
      }

      // Control de backpressure: no enviar si el buffer supera el umbral
      const MAX_BUFFERED_AMOUNT = process.env.WS_MAX_BUFFERED_AMOUNT
        ? parseInt(process.env.WS_MAX_BUFFERED_AMOUNT, 10)
        : 1024 * 1024; // 1MB por defecto

      if (cliente.bufferedAmount >= MAX_BUFFERED_AMOUNT) {
        this._metrics.backpressureBloqueos = (this._metrics.backpressureBloqueos || 0) + 1;
        dragon.sePreocupa(
          `Backpressure: envío bloqueado (bufferedAmount=${cliente.bufferedAmount})`,
          'WebSocketManager',
          'BACKPRESSURE_BLOCKED',
          { bufferedAmount: cliente.bufferedAmount, max: MAX_BUFFERED_AMOUNT }
        );
        return false;
      }

      cliente.send(typeof datos === 'string' ? datos : JSON.stringify(datos));
      this._metrics.messagesEnviados++;
      return true;
    } catch (error) {
      this._metrics.errors++;
      dragon.agoniza('Error enviando a cliente', error, 'WebSocketManager', 'SEND_ERROR');
      return false;
    }
  }

  /**
   * Obtiene estadísticas del WebSocketManager en formato para monitoreo
   * @returns {Object} Estadísticas formateadas
   */
  obtenerEstadisticas() {
    const metricas = this.obtenerMetricas();

    return {
      estado: this._metrics.errors > 100 ? 'degradado' : 'healthy',
      conexionesActivas: metricas.activeConnections,
      totalConexiones: metricas.totalConnections,
      latenciaP95: `${metricas.p95LatencyMs.toFixed(2)}ms`,
      memoria: `${metricas.memoryUsage.toFixed(1)}%`,
      mensajesRecibidos: metricas.messagesRecibidos,
      mensajesEnviados: metricas.messagesEnviados,
      errores: metricas.errors,
      analisisExitoso: metricas.analisisExitoso,
      analisisFallido: metricas.analisisFallido,
      tiempoPromedioAnalisis: `${metricas.tiempoPromedioAnalisis.toFixed(2)}ms`,
      uptime: metricas.uptimeFormateado,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Devuelve el número de clientes en una sala específica
   * @param {WebSocketServer} servidor - Servidor WebSocket
   * @param {string} sala - Identificador de sala
   * @returns {number} Número de clientes en la sala
   */
  contarClientesEnSala(servidor, sala) {
    let contador = 0;
    servidor.clients.forEach(cliente => {
      if (cliente.readyState === WebSocket.OPEN && cliente.sala === sala) {
        contador++;
      }
    });
    return contador;
  }
}

// Crear instancia singleton
const wsManager = new WebSocketManager();

// Exportar como módulo ESM
export default wsManager;
