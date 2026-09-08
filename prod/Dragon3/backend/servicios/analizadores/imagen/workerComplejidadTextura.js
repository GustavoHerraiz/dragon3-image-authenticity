/**
 * ====================================================================
 * DRAGON3 FAANG ENTERPRISE - WORKER THREAD: COMPLEJIDAD TEXTURAL
 * ====================================================================
 *
 * Archivo: workerComplejidadTextura.js
 * Ubicación: /var/www/Dragon3/backend/servicios/imagen/analizadores/imagen/
 * Proyecto: Dragon3 - Sistema Autentificación IA
 * Versión: 1.0.0-FAANG
 * Fecha: 2025-08-08
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Worker Thread para calcular la complejidad textural de una imagen (entropía local)
 * de forma asíncrona y eficiente, evitando bloquear el event loop principal.
 * Cumple los estándares FAANG Enterprise: rendimiento, trazabilidad y robustez.
 *
 * MODO DE USO:
 * 1. Desde analizadorTextura.js, importar Worker de 'worker_threads'.
 * 2. Lanzar el worker pasando { data, width, height, windowSize } como mensaje.
 * 3. El worker responde con { resultado } (valor normalizado entre 0 y 1).
 *
 * CONTRATO DE ENTRADA:
 *   {
 *     data: Uint8Array (grayscale image buffer),
 *     width: Number (image width),
 *     height: Number (image height),
 *     windowSize: Number (tamaño de ventana local)
 *   }
 *
 * CONTRATO DE SALIDA:
 *   {
 *     resultado: Number (complejidad normalizada 0-1)
 *   }
 *
 * SEGURIDAD Y ROBUSTEZ:
 * - Validación básica de parámetros.
 * - Manejo de errores: responde con error estructurado en caso de fallo.
 * - No dependencias externas para máxima compatibilidad.
 *
 * KISS PRINCIPLE: Sin dependencias, síncrono, claro y auditable.
 * ====================================================================
 */

import { parentPort } from 'worker_threads';

if (!parentPort) {
  // FAANG: No finalizar el proceso principal, solo lanzar error si se importa mal
  throw new Error('workerComplejidadTextura.js debe ejecutarse solo como worker thread (no como módulo principal).');
}

parentPort.on('message', ({ data, width, height, windowSize }) => {
  try {
    // Validación FAANG: tipos y valores
    if (
      !data ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      typeof windowSize !== 'number' ||
      width <= 0 ||
      height <= 0 ||
      windowSize <= 0
    ) {
      parentPort.postMessage({ error: 'Parámetros inválidos para cálculo de complejidad textural.' });
      return;
    }

    // Función FAANG Enterprise: cálculo de complejidad textural (entropía local)
    const calcularComplejidadTextura = (data, width, height, windowSize) => {
      const halfWindow = Math.floor(windowSize / 2);
      let entropySum = 0;
      let validWindows = 0;

      for (let y = halfWindow; y < height - halfWindow; y += 3) {
        for (let x = halfWindow; x < width - halfWindow; x += 3) {
          const histogram = new Array(256).fill(0);
          let totalPixels = 0;

          for (let wy = -halfWindow; wy <= halfWindow; wy++) {
            for (let wx = -halfWindow; wx <= halfWindow; wx++) {
              const pixelY = y + wy;
              const pixelX = x + wx;
              const idx = pixelY * width + pixelX;
              const value = data[idx];
              histogram[value]++;
              totalPixels++;
            }
          }

          let entropy = 0;
          for (let i = 0; i < 256; i++) {
            if (histogram[i] > 0) {
              const probability = histogram[i] / totalPixels;
              entropy -= probability * Math.log2(probability);
            }
          }

          entropySum += entropy;
          validWindows++;
        }
      }

      if (validWindows === 0) return 0;
      const avgEntropy = entropySum / validWindows;
      // Normalizar entre 0-1 (max entropy teórica para 8-bit es log2(256) = 8)
      return Math.min(1, Math.max(0, avgEntropy / 8));
    };

    const resultado = calcularComplejidadTextura(data, width, height, windowSize);

    parentPort.postMessage({ resultado });
  } catch (err) {
    // Manejo FAANG de error: mensaje estructurado
    parentPort.postMessage({
      error: 'Error en workerComplejidadTextura: ' + (err?.message || String(err))
    });
  }
});
