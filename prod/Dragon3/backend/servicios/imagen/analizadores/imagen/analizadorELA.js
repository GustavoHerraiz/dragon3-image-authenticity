/**
 * analizadorELA.js - DRAGON3 FAANG (CORREGIDO)
 * @version 1.0.1-STABLE_FINAL
 * @description Error Level Analysis (Forensia Digital).
 * Detecta manipulaciones locales, parches y diferencias de compresión.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import dragon from '../../../../utilidades/logger.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const ANALYZER_VERSION = '1.0.1-STABLE_FINAL';
const ANALYZER_ID = 'analizadorELA';
const MODULE_NAME = 'analizadorELA.js';

// Configuración Forense ORIGINAL (INTACTA)
const CONFIG = {
  elaQuality: 95,
  resizeMax: 1024,
  umbralUniformidad: 2.0
};

/**
 * MOTOR MATEMÁTICO ELA (OPTIMIZADO V6.3) - NO SIMPLIFICADO
 */
async function calcularELA(rutaArchivo) {
  const originalPipeline = sharp(rutaArchivo)
    .resize(CONFIG.resizeMax, CONFIG.resizeMax, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha();

  const { data: bufOriginal, info } = await originalPipeline
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const jpegBuffer = await originalPipeline
    .clone()
    .jpeg({ quality: CONFIG.elaQuality })
    .toBuffer();

  const { data: bufRecomprimido } = await sharp(jpegBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (bufOriginal.length !== bufRecomprimido.length) {
      return { avgError: 0, maxError: 0, stdDevError: 0, width: info.width, height: info.height };
  }

  let sumaError = 0;
  let maxError = 0;
  let errorMap = [];
  const channels = info.channels;
  const step = channels * 4; // Zancada original conservada

  for (let i = 0; i < bufOriginal.length; i += step) {
    const diffR = Math.abs(bufOriginal[i] - bufRecomprimido[i]);
    const diffG = Math.abs(bufOriginal[i+1] - bufRecomprimido[i+1]);
    const diffB = Math.abs(bufOriginal[i+2] - bufRecomprimido[i+2]);

    const pixelError = (diffR + diffG + diffB) / 3;
    sumaError += pixelError;
    if (pixelError > maxError) maxError = pixelError;

    if (i % 80 === 0) errorMap.push(pixelError);
  }

  const numMuestras = bufOriginal.length / step;
  const avgError = sumaError / numMuestras;

  const meanMap = errorMap.reduce((a, b) => a + b, 0) / errorMap.length;
  const variance = errorMap.reduce((a, b) => a + Math.pow(b - meanMap, 2), 0) / errorMap.length;
  const stdDevError = Math.sqrt(variance);

  return { avgError, maxError, stdDevError, width: info.width, height: info.height };
}

export async function analizarImagen(params) {
  const start = Date.now();
  const { rutaArchivo, archivoId } = params || {};
  const reporte = new RespuestaStandard(ANALYZER_ID, "Análisis ELA (Integridad)", ANALYZER_VERSION);

  if (!rutaArchivo || !archivoId) {
    return reporte.error(new Error('Parámetros faltantes')).cerrar();
  }

  dragon.respira('Iniciando ELA Analysis', MODULE_NAME, 'START', { archivoId });

  try {
    if (!existsSync(rutaArchivo)) return reporte.error(new Error('Archivo no encontrado')).cerrar();

    const elaStats = await calcularELA(rutaArchivo);
    const { avgError, maxError, stdDevError } = elaStats;

    // --- LÓGICA FORENSE V26 (AJUSTADA PARA PROFESIONALES) ---
    let decision = "Indeterminado";
    let confianza = 0.5;
    let score = 50;
    let pesoVoto = "nulo";
    let mensajeCorto = "Patrón ELA neutro";
    let analizadoConExito = false;

    // CASO 1: Manipulación / Parche (Picos localizados)
    if (maxError > 60 && avgError < 5) {
        decision = "Indeterminado";
        confianza = 0.85; score = 40; pesoVoto = "medio";
        mensajeCorto = "Posible manipulación local (Parche)";
        reporte.activarFlag("manipulacion");
        reporte.activarFlag("edicion");
        analizadoConExito = true;
    }
    // CASO 2: Superficie Uniforme Artificial (IA Pura)
    // Bajamos umbrales para no cazar iPhones de gama alta
    else if (stdDevError < 1.5 && avgError < 3.0) {
        decision = "Artificial";
        confianza = 0.85; score = 90; pesoVoto = "alto";
        mensajeCorto = "Superficie digitalmente perfecta (IA)";
        reporte.activarFlag("ia");
        analizadoConExito = true;
    }
    // CASO 3: Ruido ELA Natural (Cámara Estándar)
    else if (stdDevError > 3.0 && avgError > 3 && avgError < 25) {
        decision = "Humano";
        confianza = 0.70; score = 80; pesoVoto = "alto";
        mensajeCorto = "Niveles de error consistentes (Natural)";
        reporte.activarFlag("camara");
        analizadoConExito = true;
    }
    // 🌟 NUEVO CASO 3.5: EL "INDETERMINADO PROFESIONAL" 🌟
    // Si el error es bajo pero la varianza es superior a la de una IA (IA < 2.0)
    // pero inferior a una cámara ruidosa (Cámara > 3.0).
    else if (stdDevError >= CONFIG.umbralUniformidad && stdDevError <= 3.0 && avgError < 3) {
        decision = "Humano"; // Lo validamos como humano
        confianza = 0.60;
        score = 75;
        pesoVoto = "bajo"; // Peso bajo porque ha sido procesado (Photoshop/Lightroom)
        mensajeCorto = "Firma de procesado profesional (Limpio)";
        reporte.activarFlag("edicion"); // Marcamos que hay edición, pero es humano
        analizadoConExito = true;
    }
    // CASO 4: Re-guardado masivo
    else if (avgError > 25) {
        mensajeCorto = "Degradación por re-compresión alta";
        reporte.activarFlag("mensajeria");
        pesoVoto = "nulo";
    }

    // GESTIÓN DE PESO FINAL
    if (!analizadoConExito && decision === "Indeterminado") {
        pesoVoto = "nulo";
    }

    reporte.definirVoto(decision, confianza, score, pesoVoto);

    const icono = decision === 'Artificial' ? '🤖' : (decision === 'Humano' ? '📸' : '🖌️');
    const estado = decision === 'Humano' ? 'success' : (decision === 'Artificial' ? 'warning' : 'info');

    reporte.concluir(estado, icono, mensajeCorto, `ELA: ${mensajeCorto}`,
      `Avg=${avgError.toFixed(2)}, MaxError=${maxError.toFixed(0)}, StdDev=${stdDevError.toFixed(2)}`);

    reporte.agregarDato("Nivel de Error", avgError.toFixed(2));
    reporte.agregarDato("Uniformidad", stdDevError.toFixed(2));
    if (maxError > 50) reporte.agregarDato("Anomalía Local", "Detectada");

    reporte.datosForenses(score, "Error Level Analysis", elaStats);
    dragon.mideRendimiento('analisis_ela', Date.now() - start, MODULE_NAME, { archivoId });

    return reporte.cerrar();

  } catch (error) {
    return reporte.skip(`Análisis ELA no aplicable: ${error.message}`, "No Aplica").cerrar();
  }
}

export default { analizarImagen, version: ANALYZER_VERSION };
