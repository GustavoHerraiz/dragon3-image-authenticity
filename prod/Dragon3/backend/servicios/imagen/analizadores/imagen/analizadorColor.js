/**
 * analizadorColor.js - DRAGON3 FAANG
 * @version 5.0.0-STD_V25_ROBUST
 * @description Analizador cromático y de texturas.
 * - Detecta patrones planos (típicos de IA antigua o filtros).
 * - Detecta alta frecuencia (ruido natural de cámara).
 * - ADAPTADO AL ESTÁNDAR V25 (No lanza excepciones, devuelve JSON).
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import dragon from '../../../../utilidades/logger.js';
// 👇 IMPORTACIÓN ESTÁNDAR
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const ANALYZER_VERSION = '5.0.0-STD_V25_ROBUST';
const MODULE_NAME = 'analizadorColor.js';

// ================== LOGICA MATEMÁTICA (INTACTA PERO PROTEGIDA) ==================

async function analizarTexturaYGradiente(imgBuffer) {
  try {
    const pixels = await sharp(imgBuffer)
      .resize(128, 128, { fit: 'fill' }) // Forzamos tamaño para evitar errores
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = pixels;
    const { width, height, channels } = info;

    if (!data || channels < 3) return { texturaStd: 0, gradienteProm: 0, checkerboardScore: 0 };

    const getPixel = (x, y, c) => data[(y * width + x) * channels + c];

    let gradSum = 0, gradCount = 0;
    let checkerboardSum = 0;
    let texturaVals = [];

    // Muestreo para evitar bucles gigantes en imágenes grandes (aunque ya hicimos resize)
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const val = getPixel(x, y, c);
          const dx = Math.abs(val - getPixel(x + 1, y, c));
          const dy = Math.abs(val - getPixel(x, y + 1, c));

          gradSum += dx + dy;
          gradCount += 2;

          const cbScore = Math.abs(val - getPixel(x + 1, y + 1, c));
          checkerboardSum += cbScore;
          texturaVals.push(val);
        }
      }
    }

    const gradienteProm = gradCount > 0 ? gradSum / gradCount : 0;
    const checkerboardScore = gradCount > 0 ? checkerboardSum / gradCount : 0;

    // Desviación estándar de la textura
    const meanTextura = texturaVals.length > 0 ? texturaVals.reduce((a, b) => a + b, 0) / texturaVals.length : 0;
    const varianza = texturaVals.length > 0 ? texturaVals.reduce((a, b) => a + Math.pow(b - meanTextura, 2), 0) / texturaVals.length : 0;
    const texturaStd = Math.sqrt(varianza);

    return {
        texturaStd: Math.round(texturaStd),
        gradienteProm: Math.round(gradienteProm),
        checkerboardScore: Math.round(checkerboardScore)
    };

  } catch (error) {
    dragon.sePreocupa("Error cálculo textura", MODULE_NAME, "MATH_ERROR", { error: error.message });
    return { texturaStd: 0, gradienteProm: 0, checkerboardScore: 0 };
  }
}

// ================== FUNCIÓN PRINCIPAL ==================

export async function analizarImagen(params) {
  const start = Date.now();
  const { rutaArchivo, archivoId, correlationId } = params || {};

  // 👇 1. INICIALIZAR REPORTE STANDARD
  const reporte = new RespuestaStandard("analizadorColor", "Análisis Cromático", ANALYZER_VERSION);

  if (!rutaArchivo || !archivoId) {
    return reporte.error(new Error('Parámetros incompletos')).cerrar();
  }

  try {
    if (!existsSync(rutaArchivo)) return reporte.error(new Error('Archivo no encontrado')).cerrar();

    // Carga robusta con Sharp
    const image = sharp(rutaArchivo, { failOnError: false }); // Evita crash por warnings

    // A. Estadísticas de Color (Stats)
    const stats = await image.stats().catch(() => null);

    if (!stats) {
        return reporte.skip("No se pudieron extraer estadísticas de color (formato no soportado o corrupto).").cerrar();
    }

    // Cálculos básicos
    const { channels } = stats;
    const meanR = channels[0].mean;
    const meanG = channels[1].mean;
    const meanB = channels[2].mean;
    const stdevTotal = (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3;
    const entropia = stats.entropy || 0;
    const colorDominante = `RGB(${Math.round(meanR)}, ${Math.round(meanG)}, ${Math.round(meanB)})`;

    // B. Análisis de Textura
    const imgBuffer = await image.toBuffer();
    const { texturaStd, gradienteProm, checkerboardScore } = await analizarTexturaYGradiente(imgBuffer);

    // --- LÓGICA DE DECISIÓN (Simplificada y Robusta) ---

    let decision = "Indeterminado";
    let confianza = 0.5;
    let score = 50;
    let mensajeCorto = "Patrones cromáticos neutros";

    // 1. Patrón Artificial (Plano, baja entropía, checkerboard bajo)
    if (checkerboardScore < 8 && texturaStd < 25 && entropia < 5.5) {
        decision = "Artificial";
        confianza = 0.75; // Confianza media (el color engaña)
        score = 80;
        mensajeCorto = "Textura plana / artificial detectada";
    }
    // 2. Patrón Natural (Alta variabilidad, ruido, entropía normal)
    else if (texturaStd > 50 && gradienteProm > 15 && stdevTotal > 30) {
        decision = "Humano";
        confianza = 0.70;
        score = 70;
        mensajeCorto = "Variabilidad natural de color y textura";
    }
    // 3. Casos extremos (Negro total o Blanco total)
    else if (stdevTotal < 5) {
        decision = "Indeterminado";
        mensajeCorto = "Imagen uniforme (color sólido)";
        confianza = 0.3;
    }

    // --- CONSTRUCCIÓN DEL REPORTE ---

    // El color tiene peso BAJO (apoya, no decide)
    reporte.definirVoto(decision, confianza, score, "bajo");

    const icono = decision === 'Artificial' ? '🎨' : (decision === 'Humano' ? '🌈' : '⚪');
    const estado = decision === 'Artificial' ? 'warning' : 'success'; // Warning, no Danger (es débil)

    reporte.concluir(
        estado, icono, mensajeCorto,
        `Análisis cromático: ${mensajeCorto}. Entropía: ${entropia.toFixed(2)}. Textura: ${texturaStd}.`,
        `Entropy=${entropia.toFixed(2)}, TextureStd=${texturaStd}, Gradient=${gradienteProm}.`
    );

    // Datos Visuales
    reporte.agregarDato("Color Dominante", colorDominante);
    reporte.agregarDato("Entropía", entropia.toFixed(2));
    reporte.agregarDato("Textura", texturaStd > 40 ? "Alta (Natural)" : "Baja (Suave)");

    if (decision === "Artificial") {
        reporte.activarFlag("ia"); // Sospecha
    }

    // Datos Forenses
    reporte.datosForenses(score, "Color/Texture Stats", {
        rgb_mean: { r: meanR, g: meanG, b: meanB },
        std_dev: stdevTotal,
        entropy: entropia,
        texture_metrics: { texturaStd, gradienteProm, checkerboardScore }
    });

    dragon.mideRendimiento('analizarColor', Date.now() - start, MODULE_NAME, { archivoId });

    return reporte.cerrar();

  } catch (error) {
    // Captura cualquier error de Sharp y devuelve un fallo controlado
    return reporte.error(error).cerrar();
  }
}

export default { analizarImagen, version: ANALYZER_VERSION };
