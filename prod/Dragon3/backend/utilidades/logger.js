/**
 * logger.js - Logger Winston FAANG Dragon3 - DEFINITIVE FIX 2025
 * KISS Principle: Logger estable, nunca bloquea y SIEMPRE loguea el stack de error.
 * FAANG: Serialización explícita de error, robusto, compatible con auditoría y tracing.
 * @author GustavoHerraiz
 * @date 2025-07-24
 * @version 3.0.2-FAANG-STACK
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const NOMBRE_MODULO = 'logger';

// =================== SAFE CONFIGURATION ===================

const FAANG_LOGGER_CONFIG = {
    paths: {
        guarida: process.env.DRAGON_LOG_DIR || '/var/www/Dragon3/logs',
        memoria: 'dragon.log',
        errorLog: 'dragon-errors.log'
    },
    environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        instanceId: os.hostname(),
        serviceVersion: '3.0.0-FAANG'
    }
};

// =================== SAFE DIRECTORY SETUP ===================

let directoriesSetup = false;

const ensureLoggingDirectories = () => {
    if (directoriesSetup) return;
    try {
        const baseDir = FAANG_LOGGER_CONFIG.paths.guarida;
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true, mode: 0o755 });
        }
        const errorDir = path.join(baseDir, 'errors');
        if (!fs.existsSync(errorDir)) {
            fs.mkdirSync(errorDir, { recursive: true, mode: 0o755 });
        }
        directoriesSetup = true;
    } catch (error) {
        // Fallback silencioso
        console.error('❌ Logger directory setup failed, using console fallback');
        directoriesSetup = false;
    }
};

// =================== WINSTON STANDARD LEVELS ===================

const WINSTON_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
};

const WINSTON_COLORS = {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    http: 'green',
    verbose: 'magenta',
    debug: 'white',
    silly: 'grey'
};

winston.addColors(WINSTON_COLORS);

// =================== ERROR SERIALIZER ===================

function serializeError(err) {
    if (!err) return null;
    // Si es Error nativo
    if (err instanceof Error) {
        return {
            message: err.message,
            name: err.name,
            stack: err.stack
        };
    }
    // Si es string
    if (typeof err === 'string') {
        return { message: err, name: 'StringError', stack: null };
    }
    // Si es objeto plano u "otro"
    return {
        message: err.message || JSON.stringify(err),
        name: err.name || typeof err,
        stack: err.stack || null
    };
}

// =================== SIMPLE FORMATS ===================

const simpleConsoleFormat = winston.format.printf(({ level, message, timestamp }) => {
    const emojis = {
        error: '💀',
        warn: '😤',
        info: '😰',
        http: '💓',
        verbose: '😊',
        debug: '🧘',
        silly: '🤫'
    };
    const emoji = emojis[level] || '🔍';
    const time = timestamp ? timestamp.substring(11, 19) : '';
    return `${time} ${emoji} ${message}`;
});

const simpleFileFormat = winston.format.printf((info) => {
    // Incluye error serializado si existe
    const logObj = {
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        service: info.service || 'dragon3',
        operation: info.operation || null,
        metadata: info.metadata || {}
    };
    if (info.error) {
        logObj.error = serializeError(info.error);
        // Incluye el error crudo por si acaso (útil para debug extremo)
        logObj.rawError = typeof info.error === 'object'
            ? JSON.stringify(info.error, Object.getOwnPropertyNames(info.error))
            : info.error;
    }
    return JSON.stringify(logObj);
});

// =================== SAFE WINSTON LOGGER ===================

let winstonLogger = null;

const createSafeLogger = () => {
    if (winstonLogger) return winstonLogger;

    ensureLoggingDirectories();

    const transports = [
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize({ level: true }),
                simpleConsoleFormat
            )
        })
    ];

    if (directoriesSetup) {
        try {
            transports.push(
                new winston.transports.File({
                    filename: path.join(FAANG_LOGGER_CONFIG.paths.guarida, FAANG_LOGGER_CONFIG.paths.memoria),
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        simpleFileFormat
                    )
                }),
                new winston.transports.File({
                    filename: path.join(FAANG_LOGGER_CONFIG.paths.guarida, 'errors', FAANG_LOGGER_CONFIG.paths.errorLog),
                    level: 'error',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        simpleFileFormat
                    )
                })
            );
        } catch (error) {
            console.warn('⚠️ File logging disabled, using console only');
        }
    }

    winstonLogger = winston.createLogger({
        levels: WINSTON_LEVELS,
        level: 'debug',
        transports,
        exitOnError: false,
        silent: false
    });

    winstonLogger.on('error', (error) => {
        if (!error.message?.includes('write after end')) {
            console.error('❌ Winston error:', error.message);
        }
    });

    return winstonLogger;
};

// =================== DRAGON SIMPLE CLASS ===================

class DragonSimple {
    constructor() {
        this.energia = 100;
        this.sessionId = crypto.randomBytes(4).toString('hex');
        this.initialized = false;
    }

    _ensureLogger() {
        if (!this.initialized) {
            this.logger = createSafeLogger();
            this.initialized = true;
        }
        return this.logger;
    }

    zen(mensaje, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.debug(mensaje, { service: modulo, operation: operacion, metadata });
        } catch (error) {
            console.log(`🧘 [${modulo}] ${mensaje}`);
        }
    }

    agoniza(mensaje, error = null, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.error(mensaje, {
                service: modulo,
                operation: operacion,
                metadata,
                error     // El formato de archivo ahora SIEMPRE serializa el error y el stack
            });
        } catch (logError) {
            // Fallback seguro
            console.error(`💀 [${modulo}] ${mensaje}`, error?.message || '');
        }
    }

    seEnfada(mensaje, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.warn(mensaje, { service: modulo, operation: operacion, metadata });
        } catch (error) {
            console.warn(`😤 [${modulo}] ${mensaje}`);
        }
    }

    sePreocupa(mensaje, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.info(mensaje, { service: modulo, operation: operacion, metadata });
        } catch (error) {
            console.info(`😰 [${modulo}] ${mensaje}`);
        }
    }

    respira(mensaje, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.http(mensaje, { service: modulo, operation: operacion, metadata });
        } catch (error) {
            console.log(`💓 [${modulo}] ${mensaje}`);
        }
    }

    sonrie(mensaje, modulo = '', operacion = '', metadata = {}) {
        try {
            const logger = this._ensureLogger();
            logger.verbose(mensaje, { service: modulo, operation: operacion, metadata });
        } catch (error) {
            console.log(`😊 [${modulo}] ${mensaje}`);
        }
    }

    mideRendimiento(operacion, ms, modulo = '', metadata = {}) {
        const performanceData = { ...metadata, duration: ms };
        if (ms > 1000) {
            this.agoniza(`${operacion} muy lenta ${ms}ms`, null, modulo, operacion, performanceData);
        } else if (ms > 500) {
            this.seEnfada(`${operacion} lenta ${ms}ms`, modulo, operacion, performanceData);
        } else if (ms > 200) {
            this.sePreocupa(`${operacion} normal ${ms}ms`, modulo, operacion, performanceData);
        } else if (ms < 50) {
            this.zen(`${operacion} perfecta ${ms}ms`, modulo, operacion, performanceData);
        } else {
            this.sonrie(`${operacion} buena ${ms}ms`, modulo, operacion, performanceData);
        }
    }

    despierta(modulo = 'DRAGON3') {
        this.energia = 100;
        this.sessionId = crypto.randomBytes(4).toString('hex');
        this.sonrie('🐲 Dragon despierta FAANG', modulo, 'STARTUP', {
            sessionId: this.sessionId,
            nodeVersion: process.version,
            platform: process.platform
        });
    }
}

// =================== PERFORMANCE MONITOR SIMPLE ===================

class SimplePerformanceMonitor {
    constructor() {
        this.initialized = false;
    }
    init() {
        if (!this.initialized) {
            console.log('📊 Logger Performance Monitor FAANG iniciado');
            this.initialized = true;
        }
    }
    recordWriteLatency() { /* no-op */ }
    incrementLogEntry() { /* no-op */ }
    incrementErrorCount() { /* no-op */ }
    getSummary() { return {}; }
}

// =================== SAFE EXPORTS ===================

let dragonInstance = null;
let performanceMonitorInstance = null;

const getDragon = () => {
    if (!dragonInstance) {
        dragonInstance = new DragonSimple();
        // NO llamar despierta() aquí - deja que lo haga el usuario
    }
    return dragonInstance;
};

const getPerformanceMonitor = () => {
    if (!performanceMonitorInstance) {
        performanceMonitorInstance = new SimplePerformanceMonitor();
        performanceMonitorInstance.init();
    }
    return performanceMonitorInstance;
};

// EXPORT SEGURO - lazy initialization
const dragonLogger = getDragon();

export default dragonLogger;
export {
    dragonLogger, // named export = instancia
    getDragon,    // (opcional) función para tests o usos avanzados
    createSafeLogger as winstonLogger,
    getPerformanceMonitor as loggerPerformanceMonitor,
    FAANG_LOGGER_CONFIG,
    WINSTON_LEVELS as DRAGON_CONSCIOUSNESS
};
