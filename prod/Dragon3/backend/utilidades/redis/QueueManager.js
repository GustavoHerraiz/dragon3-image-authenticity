/**
 * QueueManager.js - Gestor de Colas Redis Enterprise (PM2 Cluster Aware)
 * ======================================================================
 * - Identidad estable: Usa NODE_APP_INSTANCE para persistencia tras reinicios.
 * - Modelo Push: Usa 'BLOCK 0' para latencia cero y CPU cero en reposo.
 * - Auto-Healing: 'Garbage Collector' con procesamiento INMEDIATO.
 * - Zero-Config: Se autoconfigura basándose en el entorno.
 */

import os from 'os';
import { rawRedisClient } from './core/RedisClient.js';
import dragon from '../logger.js';

class QueueManager {
    /**
     * @param {string} serviceName - Nombre del servicio (ej: 'imagen-analyzer')
     * @param {Object} config - Configuración opcional
     */
    constructor(serviceName, config = {}) {
        this.serviceName = serviceName;
        this.minIdleTime = config.minIdleTime || 60000; // 1 min para considerar zombi
        this.batchSize = config.batchSize || 1;

        // 1. IDENTIDAD DE CLÚSTER (CRÍTICO)
        // PM2 inyecta NODE_APP_INSTANCE (0, 1, 2...). Si no existe, somos nodo único (0).
        this.instanceId = process.env.NODE_APP_INSTANCE || '0';
        this.hostname = os.hostname();
        // ID estable: si el proceso 0 reinicia, recupera este mismo ID y sus mensajes.
        this.consumerName = `${serviceName}-${this.hostname}-${this.instanceId}`;

        this.isShuttingDown = false;

        // Cliente dedicado para BLOCK (Duplicado para no bloquear el compartido)
        this.blockingRedis = null;

        dragon.respira(`QueueManager inicializado`, 'QueueManager', 'INIT', {
            consumer: this.consumerName,
            instance: this.instanceId,
            mode: 'Cluster-Aware'
        });
    }

    /**
     * Publicar mensaje (Fire & Forget)
     * Usa el cliente compartido (rápido, no bloqueante).
     */
    async publish(stream, payload) {
        try {
            const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
            // XADD stream * payload ...
            await rawRedisClient.xadd(stream, '*', 'payload', dataStr, 'ts', Date.now());
        } catch (e) {
            dragon.agoniza(`Error publicando en ${stream}`, e, 'QueueManager', 'PUBLISH_ERROR');
            throw e;
        }
    }

    /**
     * Consumir Mensajes (Bucle Infinito Reactivo)
     * @param {string} stream - Stream origen
     * @param {string} group - Grupo de consumo
     * @param {function} handler - Lógica de negocio async (job) => {}
     */
    async consume(stream, group, handler) {
        // 1. Asegurar Infraestructura (Idempotente)
        await this._ensureGroup(stream, group);

        // 2. Preparar Cliente Bloqueante (AISLAMIENTO CRÍTICO)
        if (!this.blockingRedis) {
            // Usamos el carril exclusivo para streams que configuramos en ConnectionManager
            // Esto evita que el BLOCK 0 secuestre el socket de los locks/cache.
            const dedicatedClient = connectionManager.getRawClientById('server-streams');

            if (dedicatedClient) {
                this.blockingRedis = dedicatedClient;
            } else {
                // Fallback: duplicar el cliente pero forzando la eliminación de timeouts
                // para que el socket no se cierre durante el BLOCK 0.
                this.blockingRedis = rawRedisClient.duplicate({ 
                    commandTimeout: null, 
                    enableReadyCheck: false 
                });
            }
        }

        // 3. Iniciar Barrendero (Recovery) en segundo plano
        this._startRecoveryCron(stream, group, handler);

        dragon.zen(`🎧 Consumidor ${this.consumerName} en carril dedicado escuchando ${stream}`, 'QueueManager');

        // 4. Bucle Principal (PUSH)
        while (!this.isShuttingDown) {
            try {
                // A. Leer mensajes pendientes propios (Crash Recovery)
                // Usamos '0' para recuperar lo que este nodo dejó a medias antes de un reinicio.
                let messages = await this.blockingRedis.xreadgroup(
                    'GROUP', group, this.consumerName,
                    'COUNT', this.batchSize,
                    'STREAMS', stream, '0'
                );

                // B. Si no hay pendientes, esperar nuevos (BLOCK 0)
                // Al estar en this.blockingRedis (carril streams), esto NO afecta a los locks.
                if (!messages || messages.length === 0 || messages[0][1].length === 0) {
                    messages = await this.blockingRedis.xreadgroup(
                        'GROUP', group, this.consumerName,
                        'COUNT', 1,
                        'BLOCK', 0, 
                        'STREAMS', stream, '>' 
                    );
                }

                // C. Procesar
                if (messages && messages.length > 0) {
                    const [ , streamMessages ] = messages[0];

                    for (const [id, fields] of streamMessages) {
                        // Importante: _processMessage usa rawRedisClient para el XACK (carril rápido)
                        await this._processMessage(id, fields, stream, group, handler);
                    }
                }

            } catch (error) {
                if (!this.isShuttingDown) {
                    dragon.sePreocupa(`Error en bucle de consumo`, 'QueueManager', 'LOOP_ERR', { error: error.message });
                    // Evitamos bucles infinitos de error que saturen la CPU
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
    }

    /**
     * Procesa un mensaje y hace ACK si tiene éxito
     */
    async _processMessage(id, fields, stream, group, handler) {
        // const start = Date.now(); // Descomentar para métricas
        try {
            // Parsear campos (Redis devuelve array plano [key, val, key, val])
            const job = { id, payload: null, ...this._parseFields(fields) };

            // Ejecutar lógica de negocio
            await handler(job);

            // Confirmar (ACK) - "Trabajo terminado, bórralo de pendientes"
            await rawRedisClient.xack(stream, group, id);

        } catch (error) {
            dragon.agoniza(`Fallo procesando mensaje ${id}`, error, 'QueueManager', 'PROCESS_FAIL');
            // NO hacemos ACK. El mensaje queda en PENDING para que el Barrendero lo reintente o mueva a DeadLetter.
        }
    }

    /**
     * El Barrendero (Garbage Collector Distribuido)
     * Se ejecuta periódicamente para reclamar mensajes abandonados por nodos muertos.
     */
    _startRecoveryCron(stream, group, handler) {
        // Intervalo aleatorio (Jitter) para evitar que los 4 nodos golpeen a la vez
        const intervalMs = 60000 + (Math.random() * 10000);

        setInterval(async () => {
            if (this.isShuttingDown) return;

            try {
                // XAUTOCLAIM: Atómico y eficiente.
                // "Dame mensajes de este grupo que lleven > 1 min sin ACK, y asígnamelos a mí".
                const [ , claimedMessages ] = await rawRedisClient.xautoclaim(
                    stream, group, this.consumerName,
                    this.minIdleTime,
                    '0-0',
                    'COUNT', 5
                );

                // CORRECCIÓN GUSTAVO: Procesar inmediatamente
                if (claimedMessages && claimedMessages.length > 0) {
                    dragon.sePreocupa(`♻️ Recuperados ${claimedMessages.length} mensajes zombis`, 'QueueManager', 'RECOVERY', { instance: this.instanceId });

                    for (const [id, fields] of claimedMessages) {
                        // Procesamos YA, porque el bucle principal está mirando a '>' (nuevos)
                        // y no vería estos mensajes 'viejos' recién adquiridos.
                        await this._processMessage(id, fields, stream, group, handler);
                    }
                }
            } catch (e) {
                dragon.sePreocupa(`Error en recovery`, 'QueueManager', 'RECOVERY_ERR', { error: e.message });
            }
        }, intervalMs);
    }

    // --- Helpers ---

    async _ensureGroup(stream, group) {
        try {
            await rawRedisClient.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
        } catch (e) {
            if (!e.message.includes('BUSYGROUP')) throw e;
        }
    }

    _parseFields(fields) {
        const obj = {};
        for (let i = 0; i < fields.length; i += 2) {
            const key = fields[i];
            let val = fields[i+1];
            if (key === 'payload') {
                try { val = JSON.parse(val); } catch {}
            }
            obj[key] = val;
        }
        return obj;
    }

    async shutdown() {
        this.isShuttingDown = true;
        if (this.blockingRedis) await this.blockingRedis.quit();
    }
}

export default QueueManager;
