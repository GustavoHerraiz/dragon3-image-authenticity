/**
 * defensa.js — Módulo central del sistema de defensa KISS (3 líneas)
 *
 * Contiene:
 * - Rate limiter (línea 1)
 * - Monitor de cola y modo de operación (línea 2)
 * - Ajuste de umbrales (línea 3, usado por agente-decision.js)
 * - Gestión de concurrencia (línea 2, para cola Bull)
 *
 * No modifica ningún otro script; es autocontenido.
 *
 * @module defensa
 */

import { getCola } from './cola.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'configuracion.json');

let modoActual = 'normal';

// ============================================================
// 1. Rate Limiter (línea 1, para agent-embassy.js)
// ============================================================

/**
 * Crea un middleware de rate limiting para Express.
 * Los límites se leen de configuracion.json.
 * @returns {Function} Middleware de rate limiting.
 */
export function crearRateLimiter() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const maxPeticiones = config.defensa?.rateLimit?.maxPeticionesPorMinuto || 30;
  const ventanaMs = config.defensa?.rateLimit?.ventanaMs || 60000;

  return rateLimit({
    windowMs: ventanaMs,
    max: (req) => {
      const agentId = req.body.agentId || 'anonimo';
      const limitesPersonalizados = config.defensa?.rateLimit?.agentes || {};
      return limitesPersonalizados[agentId] || maxPeticiones;
    },
    keyGenerator: (req) => {
      const ip = req.body.agentId || req.ip || req.socket?.remoteAddress;
      if (ip && !req.body.agentId) {
        return ipKeyGenerator(ip);
      }
      return ip || 'unknown';
    },
    handler: (req, res) => {
      res.status(429).json({ error: 'Demasiadas peticiones. Intenta más tarde.' });
    },
    skip: (req) => {
      const agentId = req.body.agentId;
      const agentesConfianza = config.defensa?.rateLimit?.agentesConfianza || [];
      return agentesConfianza.includes(agentId);
    }
  });
}

// ============================================================
// 2. Monitor de cola y modo (línea 2)
// ============================================================

/**
 * Actualiza el modo de operación (normal/limitado) basado en la profundidad de la cola.
 * Se ejecuta automáticamente cada 5 segundos.
 */
export async function actualizarModo() {
  try {
    const cola = getCola();
    const counts = await cola.getJobCounts();
    const profundidad = (counts.waiting || 0) + (counts.active || 0);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const umbral = config.defensa?.segundaLinea?.umbral || 20;
    const nuevoModo = profundidad > umbral ? 'limitado' : 'normal';

    if (nuevoModo !== modoActual) {
      modoActual = nuevoModo;
      console.log(`🔄 Modo cambiado a: ${modoActual} (profundidad: ${profundidad})`);
      // Opcional: guardar en Redis si se usa
      // await redisClient.set('dragon3:modo', modoActual);
    }
  } catch (error) {
    console.error('❌ Error en monitor de cola:', error.message);
  }
}

// Iniciar monitor cada 5 segundos
setInterval(actualizarModo, 5000);

/**
 * Obtiene el modo de operación actual.
 * @returns {string} 'normal' o 'limitado'
 */
export function getModo() {
  return modoActual;
}

// ============================================================
// 3. Validación MIME (línea 1)
// ============================================================

const MIMES_SOPORTADOS = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'video/mp4'
];

/**
 * Valida si un tipo MIME está soportado.
 * @param {string} mimeType - Tipo MIME a validar.
 * @returns {boolean} true si está soportado.
 */
export function validarMime(mimeType) {
  return MIMES_SOPORTADOS.includes(mimeType);
}

// ============================================================
// 4. Ajuste de umbrales (línea 3, para agente-decision.js)
// ============================================================

/**
 * Obtiene el umbral actual para el cambio de modo.
 * @returns {number} Umbral configurado.
 */
export function getUmbralActual() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return config.defensa?.segundaLinea?.umbral || 20;
}

/**
 * Ajusta el umbral de cambio de modo, respetando límites min/max.
 * @param {number} nuevoUmbral - Nuevo valor deseado.
 */
export function setUmbral(nuevoUmbral) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const min = config.defensa?.segundaLinea?.minUmbral || 10;
  const max = config.defensa?.segundaLinea?.maxUmbral || 50;
  const clamped = Math.max(min, Math.min(max, nuevoUmbral));
  if (clamped !== config.defensa.segundaLinea.umbral) {
    config.defensa.segundaLinea.umbral = clamped;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`📊 Umbral ajustado a: ${clamped}`);
  }
}

// ============================================================
// 5. Gestión de concurrencia (línea 2, para cola Bull)
// ============================================================

/**
 * Obtiene la concurrencia máxima actual desde la configuración.
 * @returns {number} Número máximo de trabajos simultáneos.
 */
export function getConcurrenciaMaxima() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return config.defensa?.segundaLinea?.concurrenciaMaxima || 5;
}

/**
 * Ajusta la concurrencia máxima de la cola y guarda en configuración.
 * @param {number} nuevoValor - Nuevo valor (se clamp entre 1 y 20).
 */
export function setConcurrenciaMaxima(nuevoValor) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const min = 1;
  const max = 20;
  const clamped = Math.max(min, Math.min(max, nuevoValor));
  if (clamped !== config.defensa.segundaLinea.concurrenciaMaxima) {
    config.defensa.segundaLinea.concurrenciaMaxima = clamped;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`📊 Concurrencia ajustada a: ${clamped}`);
  }
}

// ============================================================
// 6. Recarga de configuración (para cambios en caliente)
// ============================================================

/**
 * Recarga la configuración de defensa sin reiniciar el servidor.
 * Útil para aplicar cambios realizados por el agente.
 */
export function recargarConfiguracion() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log('🔄 Configuración de defensa recargada.');
    // Forzar actualización del modo con la nueva configuración
    actualizarModo();
  } catch (error) {
    console.error('❌ Error al recargar configuración:', error.message);
  }
}