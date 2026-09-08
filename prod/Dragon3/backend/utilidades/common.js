/**
 * ============================================================================
 * DRAGON3 ENTERPRISE - COMMON UTILITIES
 * ============================================================================
 * @file common.js
 * @version 1.0.0-FAANG
 * @description
 * Colección de utilidades comunes y funciones auxiliares requeridas por los analizadores.
 */

/**
 * Retorna la fecha y hora actual en formato ISO 8601 string.
 * Utilizado para el timestamp de metadatos FAANG.
 * @returns {string} Fecha y hora actual en formato ISO.
 */
export function nowIso() {
    return new Date().toISOString();
}

/**
 * Limita un número flotante al rango [0, 1].
 * Utilizado para normalizar scores o confianzas.
 * @param {number} value - Valor a limitar.
 * @returns {number} Valor limitado al rango [0, 1].
 */
export function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

export default { nowIso, clamp01 };
