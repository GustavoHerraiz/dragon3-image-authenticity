/**
 * DRAGON3 FAANG - CLASE DE ERROR PERSONALIZADO
 * Lead Architect: Gustavo Herráiz
 * Versión: 1.0.0-FAANG
 * Fecha: 2025-07-11
 * Ubicación: /var/www/Dragon3/utilidades/errors/DragonError.js
 * Descripción: Error estructurado para analizadores y servicios Dragon3 FAANG/KISS.
 * - Proporciona errores con trazabilidad, contexto, gravedad y tipo.
 * - Compatible con logging avanzado y auditoría.
 * - Listo para producción y pruebas.
 *
 * Ejemplo de uso:
 *   throw new DragonError(
 *     'Error de análisis',
 *     'ANALYSIS_FAILED',
 *     'high',
 *     'application',
 *     { archivoId, correlationId }
 *   );
 */

export class DragonError extends Error {
  /**
   * Constructor de DragonError
   * @param {string} message - Mensaje descriptivo del error.
   * @param {string} code - Código único de error (ej: 'FILE_NOT_FOUND').
   * @param {'low'|'medium'|'high'|'critical'} severity - Gravedad del error.
   * @param {'validation'|'application'|'io'|'security'|'performance'|'unknown'} type - Tipo de error.
   * @param {object} context - Objeto con IDs y metadatos relevantes (archivoId, correlationId, etc.).
   */
  constructor(
    message,
    code = 'UNKNOWN_ERROR',
    severity = 'medium',
    type = 'application',
    context = {}
  ) {
    super(message);
    this.name = 'DragonError';
    this.code = code;
    this.severity = severity;
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
    // Evita duplicar stack si ya es DragonError
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Retorna el error en formato JSON estructurado FAANG.
   * @returns {object}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Indica si el error es de validación de parámetros.
   * @returns {boolean}
   */
  isValidation() {
    return this.type === 'validation';
  }

  /**
   * Indica si el error es crítico.
   * @returns {boolean}
   */
  isCritical() {
    return this.severity === 'critical' || this.severity === 'high';
  }
}

/*
========================
Ejemplo de integración FAANG/KISS en un analizador:

import { DragonError } from '../../../../utilidades/errors/DragonError.js';

if (!params.archivoId) {
  throw new DragonError(
    'Falta archivoId',
    'PARAMS_MISSING',
    'critical',
    'validation',
    { params }
  );
}

try {
  // ... lógica principal ...
} catch (error) {
  throw new DragonError(
    `Error de análisis: ${error.message}`,
    'ANALYSIS_FAILED',
    'high',
    'application',
    { archivoId: params.archivoId, correlationId: params.correlationId }
  );
}
========================
*/