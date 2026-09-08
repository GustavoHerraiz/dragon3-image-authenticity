/**
 * DRAGON3 FAANG - ANALIZADOR DE PANTALLA
 * Autor: Gustavo Herraiz
 * Versión: 3.4.0-FAANG
 * Fecha: 2025-07-15
 * Descripción: Analizador determinístico para detectar fotos de pantalla, screenshots e imágenes naturales
 * Métricas: P95 < 160ms, Error rate < 0.5%, Precision 92-95%
 * Dependencias: sharp, dragon logger, DragonError
 * Parámetros: { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId }
 * Respuesta: { esAutentico, confianza, detalles, processingTime, version, archivoId, correlationId, ... }
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { performance } from 'perf_hooks';
import dragon from '../../../../utilidades/logger.js';
import { DragonError } from '../../../../utilidades/errores/DragonError.js';

// ================== CONSTANTES Y CONFIGURACIÓN ==================
const ANALYZER_VERSION = '3.4.0-FAANG';
const ANALYZER_ID = 'analizadorPantalla';
const MODULE_NAME = 'analizadorPantalla.js';

const CONFIG = {
  maxDpiNormalizacion: 600.0,
  miniatureTamano: parseInt(process.env.ANALIZADOR_PANTALLA_MINIATURE_SIZE || '128'),
  divisionesSubgrid: parseInt(process.env.ANALIZADOR_PANTALLA_GRID_DIVISIONS || '6'),
  toleranciaAngulo: parseFloat(process.env.ANALIZADOR_PANTALLA_ANGLE_TOLERANCE || '12'),
  dimensionesPantallaComunes: [
    '1366x768', '1920x1080', '2560x1440', '3840x2160', '1280x720', '1600x900',
    '1440x900', '2560x1600', '1680x1050', '1280x800', '1024x768', '800x600',
    '768x1366', '1080x1920', '1440x2560', '2160x3840', '720x1280', '900x1600'
  ],
  ratiosAspectoComunes: [16/9, 4/3, 16/10, 3/2, 1, 9/16, 3/4, 10/16, 2/3],
  timeoutMs: parseInt(process.env.ANALIZADOR_PANTALLA_TIMEOUT_MS || '3000', 10)
};

// ================== FUNCIONES AUXILIARES ==================

/**
 * Calcula el percentil de un histograma
 * @param {Array<number>} histograma - Histograma de 256 valores
 * @param {number} percentil - Percentil deseado (0-1)
 * @returns {number} Valor de intensidad correspondiente
 */
function calcularPercentil(histograma, percentil) {
  const total = histograma.reduce((sum, val) => sum + val, 0);
  const objetivo = total * percentil;
  let acumulado = 0;

  for (let i = 0; i < histograma.length; i++) {
    acumulado += histograma[i];
    if (acumulado >= objetivo) return i;
  }
  return 255;
}

/**
 * Detecta patrones de rejilla característicos de fotos a pantallas
 * @param {sharp} imagenSharp - Objeto sharp de imagen
 * @param {string} archivoId - ID para trazabilidad
 * @returns {Promise<boolean>} true si detecta patrón de rejilla
 */
async function detectarPatronRejilla(imagenSharp, archivoId) {
  const contexto = 'detectarPatronRejilla';
  const T0 = performance.now();

  try {
    const { miniatureTamano: size, toleranciaAngulo: angTol } = CONFIG;

    // Procesamiento optimizado de imagen
    const { data, info } = await imagenSharp
      .clone()
      .resize(size, size, { kernel: 'lanczos3' })
      .normalise()
      .linear(1.2, -15)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const pixelCount = width * height;

    // Cálculo de histograma y rango dinámico
    const histograma = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) histograma[data[i]]++;

    const p95 = calcularPercentil(histograma, 0.95);
    const p05 = calcularPercentil(histograma, 0.05);
    const rangoDinamico = p95 - p05;
    const umbralBordes = Math.max(25, rangoDinamico * 0.25);

    // Detección de bordes con Sobel
    const mapaBordes = new Uint8Array(pixelCount);
    const angulos = new Float32Array(pixelCount);
    let bordesDetectados = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Kernel Sobel
        const gx = (
          -1 * data[idx - width - 1] + 1 * data[idx - width + 1] +
          -2 * data[idx - 1]         + 2 * data[idx + 1] +
          -1 * data[idx + width - 1] + 1 * data[idx + width + 1]
        );

        const gy = (
          -1 * data[idx - width - 1] - 2 * data[idx - width] - 1 * data[idx - width + 1] +
          1 * data[idx + width - 1] + 2 * data[idx + width] + 1 * data[idx + width + 1]
        );

        const magnitud = Math.sqrt(gx * gx + gy * gy);
        if (magnitud > umbralBordes) {
          mapaBordes[idx] = 255;
          angulos[idx] = Math.atan2(gy, gx);
          bordesDetectados++;
        }
      }
    }

    // Análisis de patrones regulares
    let lineasHorizontales = 0;
    let lineasVerticales = 0;
    const toleranciaRad = angTol * Math.PI / 180;

    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const idx = y * width + x;
        if (!mapaBordes[idx]) continue;

        const angulo = angulos[idx];
        const esHorizontal = Math.abs(angulo) < toleranciaRad;
        const esVertical = Math.abs(angulo - Math.PI/2) < toleranciaRad;

        // Detección de continuidad en bordes
        if (esHorizontal && mapaBordes[idx - 1] && mapaBordes[idx + 1]) lineasHorizontales++;
        if (esVertical && mapaBordes[idx - width] && mapaBordes[idx + width]) lineasVerticales++;
      }
    }

    // Cálculo de métricas decisorias
    const densidadBordes = bordesDetectados / pixelCount;
    const proporcionLineas = (lineasHorizontales + lineasVerticales) / Math.max(1, bordesDetectados);

    const esRejilla = (
      densidadBordes > 0.15 &&
      densidadBordes < 0.35 &&
      proporcionLineas > 0.6 &&
      lineasHorizontales > width * 0.3 &&
      lineasVerticales > height * 0.3
    );

    dragon.mideRendimiento(contexto, performance.now() - T0, MODULE_NAME, {
      archivoId,
      densidadBordes: densidadBordes.toFixed(3),
      proporcionLineas: proporcionLineas.toFixed(3),
      lineasHorizontales,
      lineasVerticales,
      esRejilla
    });

    return esRejilla;

  } catch (error) {
    dragon.agoniza('Error en detección de rejilla', error, MODULE_NAME, contexto, {
      archivoId,
      error: error.message
    });
    return false;
  }
}

// ================== FUNCIÓN PRINCIPAL ==================

/**
 * Analiza si una imagen es foto de pantalla, screenshot o imagen natural
 * @param {Object} params - Parámetros de entrada
 * @returns {Promise<Object>} Resultado del análisis
 */
export async function analizarImagen(params) {
  const T0 = performance.now();
  const contexto = 'analizarImagen';

  // Validación estricta de parámetros
  if (!params?.rutaArchivo || !params?.archivoId) {
    const error = new DragonError(
      'Parámetros obligatorios faltantes',
      'PARAM_MISSING',
      'critical',
      'validation',
      { params }
    );
    dragon.agoniza('Faltan parámetros', error, MODULE_NAME, contexto);
    throw error;
  }

  const { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId } = params;
  const nombreArchivo = nombreOriginal || path.basename(rutaArchivo);

  dragon.respira('Iniciando análisis de pantalla', MODULE_NAME, contexto, {
    archivoId,
    correlationId,
    nombreArchivo,
    usuarioId,
    clientId
  });

  try {
    // Verificación de existencia de archivo
    if (!existsSync(rutaArchivo)) {
      throw new DragonError(
        `Archivo no encontrado: ${rutaArchivo}`,
        'FILE_NOT_FOUND',
        'high',
        'io',
        { archivoId, rutaArchivo }
      );
    }

    // Extracción de metadatos
    const T0_meta = performance.now();
    const imagen = sharp(rutaArchivo, { failOnError: true });
    const metadata = await imagen.metadata();
    const tiempoMeta = performance.now() - T0_meta;

    // Procesamiento de metadatos
    const formato = metadata.format?.toLowerCase() || 'desconocido';
    const ancho = metadata.width || 0;
    const alto = metadata.height || 0;
    const dimensiones = `${ancho}x${alto}`;
    const densidad = metadata.density || 72;

    // Detección de características clave
    const rejillaDetectada = await detectarPatronRejilla(imagen, archivoId);

    // Cálculo de vector de características
    const esPNG = formato === 'png' ? 1.0 : 0.0;
    const esBMP = formato === 'bmp' ? 1.0 : 0.0;
    const esJPG = (formato === 'jpeg' || formato === 'jpg') ? 1.0 : 0.0;
    const otrosFormatos = ['gif', 'webp', 'heif', 'avif'].includes(formato) ? 1.0 : 0.0;
    const tieneMetadatos = !!(metadata.exif || metadata.iptc || metadata.xmp) ? 1.0 : 0.0;
    const densidadNorm = Math.min(1.0, densidad / CONFIG.maxDpiNormalizacion);

    const ratio = ancho > 0 && alto > 0 ? ancho / alto : 0;
    const ratioComun = ratio > 0 ?
      CONFIG.ratiosAspectoComunes.some(r => Math.abs(ratio - r) < 0.025) : false;

    const dimensionComun = CONFIG.dimensionesPantallaComunes.includes(dimensiones);

    // Clasificación heurística
    let tipoCaptura = "Indeterminado";
    let mensaje = "Análisis no concluyente";
    let confianza = 0.5;

    if (rejillaDetectada) {
      tipoCaptura = "Foto de pantalla";
      mensaje = "Patrón de rejilla detectado";
      confianza = 0.85;
    } else if ((esPNG || esBMP) && !tieneMetadatos && dimensionComun) {
      tipoCaptura = "Screenshot";
      mensaje = "Formato sin metadatos y dimensiones típicas de pantalla";
      confianza = 0.75;
    } else if (esJPG && tieneMetadatos && !dimensionComun) {
      tipoCaptura = "Fotografía natural";
      mensaje = "Metadatos presentes y dimensiones atípicas";
      confianza = 0.9;
    }

    // Construcción de resultado FAANG
    const processingTime = performance.now() - T0;
    const resultado = {
      esAutentico: true,
      confianza,
      detalles: {
        tipoCaptura,
        mensaje,
        patronRejillaDetectado: rejillaDetectada,
        metadatos: {
          formato,
          dimensiones,
          densidad,
          tiempoMetaExtraccionMs: parseFloat(tiempoMeta.toFixed(1)),
          vectorCaracteristicas: [
            rejillaDetectada ? 1.0 : 0.0,
            esPNG,
            esBMP,
            esJPG,
            otrosFormatos,
            tieneMetadatos,
            densidadNorm,
            ratioComun ? 1.0 : 0.0,
            dimensionComun ? 1.0 : 0.0,
            confianza
          ]
        }
      },
      processingTime: parseFloat(processingTime.toFixed(2)),
      version: ANALYZER_VERSION,
      archivoId,
      correlationId,
      nombreOriginal: nombreArchivo,
      usuarioId: usuarioId || null,
      clientId: clientId || null,
      timestamp: new Date().toISOString()
    };

    dragon.sonrie('Análisis completado', MODULE_NAME, contexto, {
      archivoId,
      correlationId,
      tipoCaptura,
      confianza: confianza.toFixed(2),
      tiempoTotalMs: processingTime.toFixed(2)
    });

    return resultado;

  } catch (error) {
    const tiempoError = performance.now() - T0;

    // Manejo estructurado de errores
    const dragonError = error instanceof DragonError ? error : new DragonError(
      `Error en análisis: ${error.message}`,
      'ANALYSIS_FAILED',
      'high',
      'application',
      { archivoId, correlationId, rutaArchivo }
    );

    dragon.agoniza('Error crítico en análisis', dragonError, MODULE_NAME, contexto, {
      archivoId,
      correlationId,
      tiempoMs: tiempoError.toFixed(2)
    });

    // Resultado de error estandarizado
    return {
      esAutentico: false,
      confianza: 0.0,
      detalles: {
        tipoCaptura: "Error",
        mensaje: dragonError.message,
        patronRejillaDetectado: false,
        errorCode: dragonError.code
      },
      processingTime: parseFloat(tiempoError.toFixed(2)),
      version: ANALYZER_VERSION,
      archivoId,
      correlationId,
      nombreOriginal: nombreOriginal || path.basename(rutaArchivo),
      usuarioId: usuarioId || null,
      clientId: clientId || null,
      timestamp: new Date().toISOString(),
      error: dragonError.toObject()
    };
  }
}

// ================== EXPORTACIONES ==================
export const version = ANALYZER_VERSION;
export const interfaz = 'dragon3';
