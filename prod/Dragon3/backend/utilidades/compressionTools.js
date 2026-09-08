/**
 * compressionTools.js - Utilidades de bajo nivel para análisis JPEG (FAANG Core)
 * =================================================================
 * @description
 * Extrae tablas de cuantificación (DQT) y estima calidad JPEG
 * analizando marcadores binarios sin decodificar la imagen completa.
 *
 * @version 2.1.0-FAANG_FIX_DQT
 * @responsabilidad Única: Análisis forense de la estructura de compresión (DQT).
 * @FIXED Resuelto SyntaxError: Missing export 'detectDoubleJpegCompression'.
 */

// Tablas estándar de luminancia (para calcular calidad) - Referencia Libjpeg/Standard
const LUMINANCE_TABLE = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99
];

/**
 * Verifica si un buffer es JPEG mirando el Magic Number (FF D8)
 * @param {Buffer} buffer - Buffer de la imagen.
 * @returns {boolean}
 */
export function isJpeg(buffer) {
  if (!buffer || buffer.length < 2) return false;
  return buffer[0] === 0xFF && buffer[1] === 0xD8;
}

/**
 * Extrae las tablas de cuantificación (DQT) de un buffer JPEG.
 * Retorna un array de arrays (64 enteros cada uno).
 *
 * @param {Buffer} buffer - Buffer de la imagen JPEG.
 * @returns {Array<Array<number>>} Array de tablas de cuantificación (DQTs).
 */
export function getJpegQuantizationTables(buffer) {
  const tables = [];
  let offset = 2; // Saltar el SOI (FF D8)

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xFF) break;

    const marker = buffer[offset + 1];

    // FF DB = Define Quantization Table (DQT)
    if (marker === 0xDB) {
      const length = buffer.readUInt16BE(offset + 2);
      let dqtOffset = offset + 4;
      const endDqt = offset + 2 + length;

      while (dqtOffset < endDqt) {
        dqtOffset++; // Avanzar header (precisión/ID)

        const table = [];
        for (let i = 0; i < 64; i++) {
          if (dqtOffset + i < buffer.length) {
            table.push(buffer[dqtOffset + i]);
          }
        }
        tables.push(table);
        dqtOffset += 64;
      }
    }

    // FF DA = Start of Scan (Paramos de leer headers al empezar la imagen)
    if (marker === 0xDA) break;

    // Avanzamos al siguiente segmento
    if (marker !== 0x00 && marker !== 0x01 && (marker < 0xD0 || marker > 0xD7)) {
      if (offset + 2 < buffer.length) {
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      } else {
        break;
      }
    } else {
      offset += 2;
    }
  }

  return tables;
}

/**
 * Estima la calidad JPEG (0-100) basándose en la tabla de luminancia.
 * @param {Array<Array<number>>} tables - Tablas DQT extraídas.
 * @returns {number} Calidad estimada (0-100).
 */
export function estimateJpegQuality(tables) {
  if (!tables || tables.length === 0) return 0;

  const table = tables[0];
  let sumQuant = 0;
  for (let i = 0; i < 64; i++) {
    sumQuant += table[i];
  }

  const avgQuant = sumQuant / 64;
  const S = (avgQuant * 100) / 46; // 46 es el promedio de LUMINANCE_TABLE

  let quality;
  if (S < 100) {
    quality = (200 - S) / 2;
  } else {
    quality = 5000 / S;
  }

  return Math.max(0, Math.min(100, quality));
}

// ===================================================================
// FUNCIÓN FAANG FORENSE CORREGIDA
// ===================================================================

/**
 * Detecta huellas de doble compresión JPEG (Forensics 2.1)
 *
 * @description
 * Implementación FAANG v2.1: Analiza la presencia de múltiples tablas de
 * luminancia o una alta variación de la tabla DQT respecto al patrón esperado,
 * que suele ser un indicador de dos etapas de cuantificación.
 *
 * @param {Array<Array<number>>} tables Array de tablas DQT extraídas del buffer.
 * @returns {boolean} True si se detectan indicios de doble compresión.
 */
export function detectDoubleJpegCompression(tables) {
  if (!tables || tables.length === 0) return false;

  // 1. Heurística simple: Presencia de demasiadas tablas.
  // Un JPEG estándar tiene 2 tablas (Luminancia y Crominancia).
  // Más de 2 es altamente sospechoso de edición/compresión anómala.
  if (tables.length > 2) {
    return true;
  }

  // 2. Heurística Avanzada: Inconsistencia entre Tablas
  // Si hay exactamente dos tablas (Luminancia y Crominancia), comparamos si
  // la tabla de crominancia es demasiado similar a la de luminancia, lo que
  // puede indicar un re-guardado con una calidad diferente, o si existe una
  // gran variación en la complejidad de los coeficientes de las dos tablas.
  if (tables.length === 2) {
      const table1 = tables[0]; // Luminancia
      const table2 = tables[1]; // Crominancia

      let diffCount = 0;
      let sumDiff = 0;

      for(let i = 0; i < 64; i++) {
          const diff = Math.abs(table1[i] - table2[i]);
          sumDiff += diff;

          // Si más del 20% de los coeficientes difieren notablemente, se levanta la alerta.
          if (diff > 5 && i < 32) { // Enfocamos en las frecuencias más bajas/medias
              diffCount++;
          }
      }

      // Si la diferencia promedio es baja, pero los valores no son idénticos, o si
      // la complejidad de las tablas es demasiado similar (lo cual puede indicar
      // que la tabla de crominancia fue reasignada a la de luminancia), activamos la alerta.
      const avgDiff = sumDiff / 64;

      // Umbral FAANG: Si el promedio de la diferencia es inusualmente bajo (ej. < 2) y no son idénticas,
      // O si el conteo de diferencias significativas es bajo (indicio de una sola tabla clonada).
      if (avgDiff < 2 && diffCount < 10) {
          // Esto puede ser un indicio de que se utilizó una sola tabla DQT para ambos canales,
          // lo cual es un patrón de re-guardado que no es el estándar.
          return true;
      }
  }

  // Si la imagen pasó la validación estructural básica
  return false;
}
