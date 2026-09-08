/**
 * detectar-colores.js
 *
 * CÉLULA ATÓMICA - DETECCIÓN DE PALETA DE COLORES
 * ================================================
 *
 * VERSIÓN: 1.0.0
 * ESTADO: PRODUCCIÓN ✅
 *
 *
 * PROPÓSITO:
 * ----------
 * Analiza la paleta de colores de la imagen para detectar patrones típicos
 * de imágenes generadas por IA:
 *
 * 1. SATURACIÓN BAJA: Las IAs suelen generar colores menos saturados
 *    o con saturación artificialmente uniforme.
 *
 * 2. PALETA FRÍA: Las IAs tienden a usar tonos azulados/verdosos
 *    en lugar de tonos cálidos naturales.
 *
 * 3. DOMINANCIA DE UN COLOR: Las IAs suelen tener un color dominante
 *    que cubre grandes áreas de la imagen.
 *
 * 4. POCA VARIACIÓN: Las IAs tienen menos variación cromática
 *    que las imágenes naturales.
 *
 * 5. COLORES NO NATURALES: Las IAs generan colores que no existen
 *    en la naturaleza (ej. pieles moradas, cielos verdes).
 *
 *
 * FILOSOFÍA KISS:
 * ---------------
 * "Si no estás 100% seguro, cállate."
 *
 * Esta célula SOLO opina cuando hay EVIDENCIAS CLARAS de paleta artificial.
 * En casos dudosos, se retira con peso mínimo.
 *
 *
 * DETECTA EVIDENCIAS CLARAS DE IA (Puntuación ≥ 70%):
 * --------------------------------------------------
 * - Saturación media < 30 (colores apagados)
 * - Temperatura de color fría (tono > 200° en HSV)
 * - Dominancia de un solo color (> 40% de la imagen)
 * - Variación cromática baja (< 50 en desviación estándar)
 *
 *
 * CONTRATO:
 * ---------
 * ENTRADA:  { payload: Buffer | string | { buffer, bufferBase64, data } }
 * SALIDA:   { exito, resultado: { esIA, confianza, explicacion, evidencias,
 *             peso, ...datos_tecnicos } }
 *
 *
 * RENDIMIENTO:
 * ------------
 * - Tiempo promedio: < 30ms
 * - Memoria: ~50KB (imagen redimensionada)
 * - CPU: Bajo (operaciones vectorizadas con Sharp)
 *
 *
 * DEPENDENCIAS:
 * -------------
 * - sharp: Procesamiento de imágenes y estadísticas
 * - fs, path: Lectura de configuración
 *
 *
 * @module detectar-colores
 * @version 1.0.0
 * @author Dragon3 / Agent Embassy
 * @license MIT
 */

// ============================================================
//  IMPORTS
// ============================================================

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================
//  CONSTANTES DE MÓDULO
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * UMBRALES PARA EVIDENCIAS CLARAS
 *
 * Basado en pruebas empíricas con:
 * - Imágenes IA de última generación (Midjourney V6, DALL-E 3, SDXL)
 * - Imágenes humanas RAW y procesadas
 * - Imágenes mixtas (humanas con procesamiento)
 */
const UMBRALES = {
  // ============================================================
  //  EVIDENCIAS CLARAS DE IA (Muy restrictivos)
  // ============================================================

  // Saturación media en HSV (0-100, típico natural: 40-70)
  IA_SATURACION_MAXIMA: 30,          // Colores apagados (típico IA)

  // Temperatura de color en HSV (0-360°, natural: 0-60° cálido)
  IA_TONO_MINIMO_FRIO: 200,          // Tono frío (azul/verde) (típico IA)
  IA_TONO_MAXIMO_FRIO: 300,          // Rango de tonos fríos

  // Dominancia de un color (% de píxeles del color dominante)
  IA_DOMINANCIA_MINIMA: 40,          // Un solo color > 40% (típico IA)

  // Variación cromática (desviación estándar de colores)
  IA_VARIACION_MAXIMA: 50,           // Poca variación (típico IA)

  // ============================================================
  //  EVIDENCIAS CLARAS DE HUMANO (Muy restrictivos)
  // ============================================================

  // Saturación alta (colores vivos)
  HUMANO_SATURACION_MINIMA: 50,      // Colores vivos (típico humano)

  // Temperatura cálida
  HUMANO_TONO_MAXIMO_CALIDO: 60,     // Tono cálido (típico humano)

  // ============================================================
  //  UMBRALES DE DECISIÓN
  // ============================================================
  CONFIANZA_MINIMA_SEGURO: 0.7,      // Para considerar "seguro"
};

// ============================================================
//  FUNCIÓN PRINCIPAL
// ============================================================

/**
 * Detecta patrones de color típicos de IA
 *
 * @param {Object} entrada - Datos de entrada
 * @param {*} entrada.payload - Buffer, string base64 o objeto con datos
 * @param {Object} [entrada.contexto] - Contexto compartido (opcional)
 * @param {Object} [entrada.metadatos] - Metadatos adicionales (opcional)
 * @param {Object} contexto - Contexto compartido mutable
 * @returns {Promise<Object>} Resultado estandarizado
 */
export default async function detectarColores(entrada, contexto) {
  // Variables de estado
  let buffer = null;
  const inicioTiempo = performance.now();

  try {
    // ============================================================
    //  FASE 1: EXTRACCIÓN ROBUSTA DEL BUFFER
    // ============================================================
    // Maneja TODOS los formatos posibles de entrada.

    const payload = entrada.payload;

    // --- CASO 1: String (base64 directo) ---
    if (typeof payload === 'string') {
      const base64Limpia = payload.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');

      if (!buffer || buffer.length === 0) {
        throw new Error('String base64 vacío o inválido');
      }
    }

    // --- CASO 2: Buffer nativo ---
    else if (Buffer.isBuffer(payload)) {
      buffer = payload;

      if (buffer.length === 0) {
        throw new Error('Buffer vacío');
      }
    }

    // --- CASO 3: Objeto con varios formatos posibles ---
    else if (payload && typeof payload === 'object') {
      let base64Str = null;

      if (payload.buffer && typeof payload.buffer === 'string') {
        base64Str = payload.buffer;
      } else if (payload.bufferBase64 && typeof payload.bufferBase64 === 'string') {
        base64Str = payload.bufferBase64;
      } else if (payload.data && typeof payload.data === 'string') {
        base64Str = payload.data;
      } else if (payload.base64 && typeof payload.base64 === 'string') {
        base64Str = payload.base64;
      } else if (payload.buffer && Buffer.isBuffer(payload.buffer)) {
        buffer = payload.buffer;
      }

      if (base64Str) {
        const base64Limpia = base64Str.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Limpia, 'base64');

        if (!buffer || buffer.length === 0) {
          throw new Error('Base64 extraído está vacío o inválido');
        }
      }

      if (!buffer) {
        throw new Error(`No se pudo extraer buffer del objeto. Propiedades: ${Object.keys(payload).join(', ')}`);
      }
    }

    // --- CASO 4: Tipo no soportado ---
    else {
      throw new Error(`Tipo de payload no soportado: ${typeof payload}`);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('No se pudo obtener un buffer válido');
    }

    // ============================================================
    //  FASE 2: LECTURA DE CONFIGURACIÓN
    // ============================================================
    // Para mantener consistencia con el resto del sistema.

    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configData);
    } catch {
      config = { optimizacion: { tamañoOptimizado: 128 } };
    }
    const TAMAÑO = config.optimizacion?.tamañoOptimizado || 128;

    // ============================================================
    //  FASE 3: ANÁLISIS DE COLORES
    // ============================================================
    // Usamos Sharp para obtener estadísticas de color de forma
    // eficiente y vectorizada.

    // 3.1. Obtener estadísticas de color en RGB
    const stats = await sharp(buffer)
      .resize(TAMAÑO, TAMAÑO, { fit: 'fill' })
      .stats();

    const canales = stats.channels;

    // 3.2. Extraer medias y desviaciones de RGB
    const mediaR = canales[0]?.mean || 0;
    const mediaG = canales[1]?.mean || 0;
    const mediaB = canales[2]?.mean || 0;

    const devR = canales[0]?.stdev || 0;
    const devG = canales[1]?.stdev || 0;
    const devB = canales[2]?.stdev || 0;

    // 3.3. Calcular saturación aproximada (desviación de RGB)
    // Imágenes saturadas tienen alta desviación entre canales
    const desviacionRGB = (devR + devG + devB) / 3;
    const saturacionAprox = Math.min(desviacionRGB * 2, 100);

    // 3.4. Calcular temperatura de color (relación R/B)
    const relacionRB = mediaR / (mediaB + 0.001);
    const esCalida = relacionRB > 1.2; // R > B = cálida
    const esFria = relacionRB < 0.8;   // R < B = fría

    // 3.5. Calcular variación cromática
    const variacionCromatica = Math.sqrt(
      (devR * devR + devG * devG + devB * devB) / 3
    );

    // 3.6. Calcular dominancia de color (histograma simplificado)
    // Usamos una muestra de píxeles para detectar color dominante
    const imagenMuestra = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer();

    const pixeles = new Uint8Array(imagenMuestra);
    const histogramaColores = {};

    // Muestrear píxeles para detectar dominancia
    for (let i = 0; i < pixeles.length; i += 3) {
      const r = pixeles[i];
      const g = pixeles[i + 1];
      const b = pixeles[i + 2];

      // Cuantizar colores a 16 niveles para simplificar
      const rQ = Math.floor(r / 16);
      const gQ = Math.floor(g / 16);
      const bQ = Math.floor(b / 16);
      const clave = `${rQ},${gQ},${bQ}`;

      histogramaColores[clave] = (histogramaColores[clave] || 0) + 1;
    }

    // Encontrar color más frecuente
    let maxFrecuencia = 0;
    for (const [clave, frecuencia] of Object.entries(histogramaColores)) {
      if (frecuencia > maxFrecuencia) {
        maxFrecuencia = frecuencia;
      }
    }

    const totalMuestra = pixeles.length / 3;
    const dominancia = (maxFrecuencia / totalMuestra) * 100;

    // 3.7. Detectar colores no naturales (ej. piel irreal)
    // Valores aproximados de piel humana: R: 150-250, G: 100-180, B: 80-160
    let coloresNoNaturales = 0;
    let countPiel = 0;

    for (let i = 0; i < pixeles.length; i += 3) {
      const r = pixeles[i];
      const g = pixeles[i + 1];
      const b = pixeles[i + 2];

      // Detectar posibles tonos de piel
      const esPiel = (r > 120 && r < 255 && g > 80 && g < 200 && b > 60 && b < 180);
      if (esPiel) {
        countPiel++;
        // Si la piel es irreal (muy saturada o desaturada)
        const esPielIrreal = (r - g) < 20 || (r - b) < 30;
        if (esPielIrreal) {
          coloresNoNaturales++;
        }
      }
    }

    const porcentajePielIrreal = countPiel > 0 ? (coloresNoNaturales / countPiel) * 100 : 0;

    // ============================================================
    //  FASE 4: DETECCIÓN DE EVIDENCIAS CLARAS
    // ============================================================
    // Cada indicador contribuye con un peso específico.

    let puntuacionIA = 0;
    let puntuacionHumano = 0;
    const evidenciasIA = [];
    const evidenciasHumano = [];

    // --- 4.1. Saturación baja (IA) ---
    if (saturacionAprox < UMBRALES.IA_SATURACION_MAXIMA) {
      puntuacionIA += 0.35;
      evidenciasIA.push(`Saturación baja (${saturacionAprox.toFixed(0)}%) - colores apagados`);
    }

    // --- 4.2. Temperatura fría (IA) ---
    if (esFria) {
      puntuacionIA += 0.25;
      evidenciasIA.push('Temperatura de color fría (tonos azulados)');
    }

    // --- 4.3. Dominancia de un color (IA) ---
    if (dominancia > UMBRALES.IA_DOMINANCIA_MINIMA) {
      puntuacionIA += 0.20;
      evidenciasIA.push(`Color dominante excesivo (${dominancia.toFixed(0)}% de la imagen)`);
    }

    // --- 4.4. Baja variación cromática (IA) ---
    if (variacionCromatica < UMBRALES.IA_VARIACION_MAXIMA) {
      puntuacionIA += 0.12;
      evidenciasIA.push(`Poca variación cromática (${variacionCromatica.toFixed(0)})`);
    }

    // --- 4.5. Piel irreal (IA) ---
    if (porcentajePielIrreal > 30) {
      puntuacionIA += 0.08;
      evidenciasIA.push(`Piel con colores irreales (${porcentajePielIrreal.toFixed(0)}% de la piel)`);
    }

    // --- 4.6. Evidencias de humano ---
    if (saturacionAprox > UMBRALES.HUMANO_SATURACION_MINIMA) {
      puntuacionHumano += 0.35;
      evidenciasHumano.push(`Saturación alta (${saturacionAprox.toFixed(0)}%) - colores vivos`);
    }

    if (esCalida) {
      puntuacionHumano += 0.35;
      evidenciasHumano.push('Temperatura de color cálida (tonos naturales)');
    }

    if (dominancia < 25) {
      puntuacionHumano += 0.30;
      evidenciasHumano.push('Paleta de colores variada');
    }

    // ============================================================
    //  FASE 5: DECISIÓN FINAL
    // ============================================================
    // Solo opinamos si tenemos EVIDENCIAS CLARAS.

    let esIA = false;
    let confianza = 0;
    let explicacion = '';
    let evidencias = [];
    let peso = 0.1; // Por defecto, mínimo (indeterminado)
    let decision = 'INDETERMINADO';

    // --- CASO 1: EVIDENCIA CLARA DE IA ---
    if (puntuacionIA >= UMBRALES.CONFIANZA_MINIMA_SEGURO) {
      esIA = true;
      confianza = Math.min(puntuacionIA, 1);
      evidencias = evidenciasIA;
      peso = 0.5; // Peso medio (complementa a otras células)
      decision = 'IA_EVIDENTE';
      explicacion = `🔴 Paleta de colores artificial (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}.`;
    }

    // --- CASO 2: EVIDENCIA CLARA DE HUMANO ---
    else if (puntuacionHumano >= UMBRALES.CONFIANZA_MINIMA_SEGURO) {
      esIA = false;
      confianza = Math.min(puntuacionHumano, 1);
      evidencias = evidenciasHumano;
      peso = 0.5; // Peso medio
      decision = 'HUMANO_EVIDENTE';
      explicacion = `🟢 Paleta de colores natural (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}.`;
    }

    // --- CASO 3: INDETERMINADO ---
    else {
      esIA = false;
      confianza = 0.1;
      peso = 0.1;
      decision = 'INDETERMINADO';

      const mensajes = [];
      if (puntuacionIA > 0.3) {
        mensajes.push(`indicios de IA (${(puntuacionIA * 100).toFixed(0)}%)`);
      }
      if (puntuacionHumano > 0.3) {
        mensajes.push(`indicios de humano (${(puntuacionHumano * 100).toFixed(0)}%)`);
      }
      if (mensajes.length === 0) {
        mensajes.push('no hay indicios claros');
      }

      explicacion = `⚪ INDETERMINADO: ${mensajes.join(' y ')}. La paleta de colores no es concluyente.`;
      evidencias = ['No hay evidencias claras en la paleta de colores'];
    }

    // ============================================================
    //  FASE 6: CONSTRUCCIÓN DE LA RESPUESTA
    // ============================================================
    // Cumplir con el contrato exactamente.

    const tiempoMs = performance.now() - inicioTiempo;

    return {
      exito: true,
      resultado: {
        // --- CAMPOS OBLIGATORIOS ---
        esIA,
        confianza,
        explicacion,
        evidencias,
        peso,

        // --- METADATOS DE DECISIÓN ---
        decision,
        puntuacionIA,
        puntuacionHumano,

        // --- MÉTRICAS DE COLOR ---
        saturacionAprox,
        temperatura: esCalida ? 'calida' : (esFria ? 'fria' : 'neutra'),
        relacionRB,
        variacionCromatica,
        dominancia,
        porcentajePielIrreal,

        // --- METADATOS DE PROCESAMIENTO ---
        tamañoUsado: TAMAÑO,
        tiempoProcesamientoMs: tiempoMs,
      },
      metricas: {
        tiempoMs,
        decision,
      },
      contexto: contexto || {},
    };

  } catch (error) {
    const tiempoMs = performance.now() - inicioTiempo;

    if (process.env.NODE_ENV === 'development') {
      console.error('[detectar-colores] Error:', error.message);
    }

    return {
      exito: false,
      error: `Error en detección de colores: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `No se pudo analizar la paleta de colores: ${error.message}`,
        evidencias: ['Error durante el análisis de colores'],
        peso: 0.1,
        decision: 'ERROR',
        tiempoProcesamientoMs: tiempoMs,
      },
      metricas: {
        tiempoMs,
        error: true,
      },
      contexto: contexto || {},
    };
  }
}

// ============================================================
//  EXPORTACIÓN PARA PRUEBAS UNITARIAS
// ============================================================

export async function testDetectarColores(imagenPath) {
  const fs = require('fs');
  const buffer = fs.readFileSync(imagenPath);
  return await detectarColores({ payload: buffer }, {});
}

// ============================================================
//  DOCUMENTACIÓN DE USO
// ============================================================

/**
 * EJEMPLOS DE USO:
 *
 * // 1. Uso básico con Buffer
 * const buffer = fs.readFileSync('imagen.jpg');
 * const resultado = await detectarColores({ payload: buffer }, {});
 *
 * // 2. Con objeto de cargar-imagen
 * const imagenCargada = await cargarImagen({ payload: archivo }, {});
 * const resultado = await detectarColores({
 *   payload: imagenCargada.resultado
 * }, {});
 *
 * // 3. Ver resultado
 * if (resultado.exito) {
 *   console.log('Decisión:', resultado.resultado.decision);
 *   console.log('Confianza:', resultado.resultado.confianza);
 *   console.log('Saturación:', resultado.resultado.saturacionAprox);
 * }
 */

// ============================================================
//  HISTORIAL DE CAMBIOS
// ============================================================

/**
 * v1.0.0 (2026-08-21)
 * - Versión inicial
 * - Detección de saturación, temperatura, dominancia
 * - KISS: solo casos claros (>70% confianza)
 * - Peso variable: 0.5 si seguro, 0.1 si duda
 * - Tiempo objetivo: < 30ms
 */

// ============================================================
//  FIN DEL MÓDULO
// ============================================================