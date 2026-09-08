/**
 * winston.js - Núcleo de logging FAANG Dragon3
 * -----------------------------------------------------------
 * 100% Enterprise, KISS, robusto, trazabilidad máxima.
 * - Un solo núcleo Winston para toda la app.
 * - Enriquecimiento automático de trazabilidad (correlationId, usuario, IP, módulo, operación, instancia...).
 * - Formatos homogéneos para consola y archivos, fácil de parsear por ELK/Splunk.
 * - Fallback seguro: nunca bloquea el arranque.
 * - Métodos dragón (agoniza, zen, mideRendimiento...) compatibles con logger.js.
 * - Documentación profesional en cada función/export.
 * 
 * © 2025 GustavoHerraiz
 */

import winston from "winston";
import path from "path";
import fs from "fs";
import util from "util";
import os from "os";
import process from "process";

// ==== CONFIGURACIÓN GLOBAL Y CONSTANTES ====

/**
 * Directorio raíz de logs. Se crea si no existe.
 * Usa DRAGON_LOG_DIR, LOG_DIR o por defecto '/var/www/Dragon3/logs'.
 */
const logsDir = process.env.DRAGON_LOG_DIR || process.env.LOG_DIR || "/var/www/Dragon3/logs";
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
}

/**
 * Información de instancia para trazabilidad (hostname, pid, versión).
 */
const INSTANCE = {
  hostname: os.hostname(),
  pid: process.pid,
  version: process.env.npm_package_version || "dev"
};

/**
 * Niveles y colores personalizados Dragon3.
 */
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  },
  colors: {
    error: 'redBG white bold',
    warn: 'yellowBG black bold',
    info: 'green',
    http: 'magenta',
    verbose: 'cyan',
    debug: 'blue',
    silly: 'grey'
  }
};

/**
 * Emojis asociados a cada nivel para logs legibles en consola.
 * DRAGON: 💀 (error), 😤 (warn), 😰 (info), 💓 (http), 😊 (verbose), 🧘 (debug), 🤫 (silly)
 */
const levelEmojis = {
  error: '💀',
  warn: '😤',
  info: '😰',
  http: '💓',
  verbose: '😊',
  debug: '🧘',
  silly: '🤫'
};

winston.addColors(customLevels.colors);

// ==== ENRIQUECIMIENTO DE METADATOS (TRAZABILIDAD) ====

/**
 * Enriquecimiento homogéneo de metadatos para cada log.
 * Añade automáticamente correlationId, usuarioId, ip, hostname, versión, PID, timestamp.
 * Usa globales si están definidos (útil para middlewares de request).
 * 
 * @param {object} meta - Metadatos originales del log.
 * @returns {object} Metadatos enriquecidos.
 */
export function enrichMetadata(meta = {}) {
  return {
    ...meta,
    correlationId: meta.correlationId || meta.cid || global.correlationId || null,
    usuarioId: meta.usuarioId || meta.userId || global.usuarioId || null,
    ip: meta.ip || global.ip || null,
    hostname: INSTANCE.hostname,
    pid: INSTANCE.pid,
    version: INSTANCE.version,
    timestamp: new Date().toISOString()
  };
}

// ==== FORMATOS DE LOG ====

const errorStackFormat = winston.format.errors({ stack: true });
const consoleTimestampFormat = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' });
const fileTimestampFormat = winston.format.timestamp();

/**
 * Formato de log para consola, con colores y emojis, trazabilidad completa.
 */
const dragonConsoleFormat = winston.format.printf(({ timestamp, level, message, stack, metadata }) => {
  const cleanLevel = level.replace(/\u001b\[[0-9;]*m/g, '');
  const emoji = levelEmojis[cleanLevel] || '🔍';
  const modulePart = metadata.module ? `[${metadata.module}]` : '';
  const opPart = metadata.operation ? `<${metadata.operation}>` : '';
  const cidPart = metadata.correlationId ? `(CID: ${metadata.correlationId})` : '';
  const userPart = metadata.usuarioId ? `(UID: ${metadata.usuarioId})` : '';
  const ipPart = metadata.ip ? `(IP: ${metadata.ip})` : '';
  const hostPart = metadata.hostname ? `(HOST: ${metadata.hostname})` : '';
  const pidPart = metadata.pid ? `(PID: ${metadata.pid})` : '';

  let logLine = `${timestamp} ${level} ${emoji} ${modulePart}${opPart}${cidPart}${userPart}${ipPart}${hostPart}${pidPart} :: ${message}`;

  // Meta extra (solo si hay y nivel alto)
  const otherMeta = { ...metadata };
  delete otherMeta.module; delete otherMeta.operation;
  delete otherMeta.correlationId; delete otherMeta.usuarioId; delete otherMeta.ip;
  delete otherMeta.hostname; delete otherMeta.version; delete otherMeta.pid; delete otherMeta.timestamp;
  delete otherMeta.level; delete otherMeta.message; delete otherMeta.stack; delete otherMeta.splat;

  const currentLevelValue = customLevels.levels[cleanLevel];
  if (currentLevelValue >= customLevels.levels.verbose && Object.keys(otherMeta).length > 0) {
    try {
      logLine += `\n  └─ Meta: ${util.inspect(otherMeta, { depth: null, colors: true })}`;
    } catch (e) {
      try { logLine += `\n  └─ Meta (raw): ${JSON.stringify(otherMeta)}`; }
      catch { /* ignorar */ }
    }
  }

  if (stack) {
    logLine += `\n  └─ Stack: ${stack.toString()}`;
  }
  return logLine;
});

// ==== CREACIÓN DEL LOGGER BASE ====

/**
 * Logger principal FAANG para toda la app.
 * Reutilizable y robusto, preparado para uso desde cualquier wrapper (ej. logger.js).
 */
const logLevel = (process.env.LOG_LEVEL || "info").toLowerCase();

const baseLogger = winston.createLogger({
  levels: customLevels.levels,
  level: logLevel,
  format: winston.format.combine(
    fileTimestampFormat,
    errorStackFormat,
    winston.format.splat(),
    winston.format.metadata()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        errorStackFormat,
        consoleTimestampFormat,
        winston.format.colorize({ all: true }),
        winston.format.splat(),
        winston.format.metadata({ fillExcept: [
          'timestamp','level','message','stack','splat'
        ] }),
        dragonConsoleFormat
      ),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "server.log"),
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 1024 * 1024 * 10,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: 'error',
      format: winston.format.json(),
      maxsize: 1024 * 1024 * 10,
      maxFiles: 3,
      tailable: true,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log'), format: winston.format.json() }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        consoleTimestampFormat,
        winston.format.printf(info => `${info.timestamp} ${info.level} ${info.message}`)
      )
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'rejections.log'), format: winston.format.json() }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        consoleTimestampFormat,
        winston.format.printf(info => `${info.timestamp} ${info.level} ${info.message}`)
      )
    })
  ],
  exitOnError: false,
});

// ==== WRAPPER DE NIVELES Y MÉTODOS DRAGON ====

/**
 * Métodos de log directos (info, error, warn, debug, etc.) y dragón (agoniza, zen...).
 * Enriquecen metadatos automáticamente.
 * Incluye los emojis Dragon como prefijo en el mensaje.
 */
export const log = {};
Object.keys(customLevels.levels).forEach(level => {
  const emoji = levelEmojis[level] || '🔍';
  /**
   * Log con nivel específico.
   * @param {string} message  Mensaje principal.
   * @param {object} [meta]   Metadatos opcionales (se enriquecen automáticamente).
   */
  log[level] = (message, meta = {}) => {
    baseLogger[level](`${emoji} ${message}`, enrichMetadata(meta));
  };
});

// Métodos dragón compatibles con logger.js
/**
 * Log de error crítico (agoniza).
 */
log.agoniza = (message, meta = {}) => log.error(message, meta);
/**
 * Log de advertencia dragón (seEnfada).
 */
log.seEnfada = (message, meta = {}) => log.warn(message, meta);
/**
 * Log de advertencia dragón (sePreocupa).
 */
log.sePreocupa = (message, meta = {}) => log.info(message, meta);
/**
 * Log de info dragón (respira).
 */
log.respira = (message, meta = {}) => log.http(message, meta);
/**
 * Log de info tranquila (zen).
 */
log.zen = (message, meta = {}) => log.debug(message, meta);
/**
 * Log de verbose dragón (sonrie).
 */
log.sonrie = (message, meta = {}) => log.verbose(message, meta);
/**
 * Log de debug de rendimiento.
 */
log.mideRendimiento = (message, meta = {}) => log.debug(message, meta);

// ==== EXPORTS PRINCIPALES ====

/**
 * Exporta el logger base (Winston), el wrapper de niveles y el enriquecedor de metadata.
 */
export default baseLogger;
