/**
 * detectar-doble-compresion-sharp.js
 *
 * Detecta doble compresión en imágenes JPEG mediante:
 * 1. Comparación de tamaños (re-compresión con calidad ajustable).
 * 2. Análisis de tablas de cuantización (con jpeg-js).
 * 3. 🔥 CONTEXTUALIZACIÓN: distingue entre compresión de plataforma
 *    (WhatsApp, Instagram, etc.) y compresión sospechosa.
 *
 * Entrada: puede ser:
 *   - string: base64 de la imagen.
 *   - Buffer: buffer nativo.
 *   - objeto { buffer: "base64", ... } (resultado de cargar-imagen)
 *
 * Salida: { esIA, confianza, explicacion, evidencias, peso, ... }
 *
 * Contrato: cumple con el formato esperado por generar-veredicto
 *
 * Principios: KISS, real, rápido (< 20ms), robusto.
 *
 * Optimización: la calidad de recompresión se lee de configuracion.json
 * (clave: optimizacion.calidadOptimizada) para permitir ajuste automático
 * por el agente de decisión.
 *
 * @module detectar-doble-compresion-sharp
 */

import sharp from 'sharp';
import jpeg from 'jpeg-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function detectarDobleCompresion(entrada, contexto) {
  let buffer;

  try {
    // ============================================================
    //  EXTRACCIÓN ROBUSTA DEL BUFFER
    // ============================================================
    const payload = entrada.payload;

    if (typeof payload === 'string') {
      const base64Limpia = payload.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else if (Buffer.isBuffer(payload)) {
      buffer = payload;
    } else if (payload && typeof payload === 'object') {
      let base64Str = null;
      if (payload.buffer && typeof payload.buffer === 'string') {
        base64Str = payload.buffer;
      } else if (payload.bufferBase64 && typeof payload.bufferBase64 === 'string') {
        base64Str = payload.bufferBase64;
      } else if (payload.data && typeof payload.data === 'string') {
        base64Str = payload.data;
      } else if (payload.buffer && Buffer.isBuffer(payload.buffer)) {
        buffer = payload.buffer;
      }
      if (base64Str) {
        const base64Limpia = base64Str.replace(/^data:image\/\w+;base64,/, '');
        buffer = Buffer.from(base64Limpia, 'base64');
      } else if (!buffer) {
        console.warn('⚠️ No se pudo extraer buffer del payload. Payload:', JSON.stringify(payload).substring(0, 200));
        throw new Error('No se pudo extraer el buffer del objeto payload.');
      }
    } else {
      throw new Error(`Tipo de payload no soportado: ${typeof payload}`);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('El buffer está vacío o no se pudo obtener.');
    }

    // ============================================================
    //  VERIFICAR FORMATO
    // ============================================================
    const metadata = await sharp(buffer).metadata();
    if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
      return {
        exito: false,
        error: 'La imagen no es JPEG',
        resultado: {
          esIA: false,
          confianza: 0,
          explicacion: 'La imagen no es JPEG, no se puede analizar doble compresión.',
          evidencias: ['Formato no compatible: ' + metadata.format],
          peso: 0.4
        },
        metricas: { tiempoMs: 0 }
      };
    }

    // ============================================================
    //  LECTURA DE CONFIGURACIÓN
    // ============================================================
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { calidadOptimizada: 90 } };
    }
    const CALIDAD = config.optimizacion?.calidadOptimizada || 90;

    // ============================================================
    //  TÉCNICA 1: COMPARACIÓN DE TAMAÑOS
    // ============================================================
    const tamañoOriginal = buffer.length;

    const recompressed = await sharp(buffer)
      .jpeg({ quality: CALIDAD, force: false })
      .toBuffer();

    const tamañoRecomp = recompressed.length;
    const diferencia = (tamañoOriginal - tamañoRecomp) / tamañoOriginal;

    let confianzaTamanio = 0;
    let dobleCompresionTamanio = false;
    const UMBRAL_TAMANIO = 0.05;

    if (diferencia > 0) {
      dobleCompresionTamanio = diferencia > UMBRAL_TAMANIO;
      confianzaTamanio = Math.min(diferencia / (UMBRAL_TAMANIO * 2), 1);
    } else {
      dobleCompresionTamanio = false;
      confianzaTamanio = 0;
    }

    // ============================================================
    //  TÉCNICA 2: ANÁLISIS DE TABLAS DE CUANTIZACIÓN
    // ============================================================
    let tablaAnomala = false;
    let confianzaTabla = 0;

    try {
      const decoded = jpeg.decode(buffer, { useTArray: true });
      const qt = decoded.quantizationTables;
      if (qt && qt.length > 0) {
        const tabla = qt[0];
        let suma = 0;
        for (let i = 0; i < tabla.length; i++) suma += tabla[i];
        const promedio = suma / tabla.length;
        if (promedio < 5 || promedio > 50) {
          tablaAnomala = true;
          const desviacion = Math.abs(promedio - 20) / 20;
          confianzaTabla = Math.min(desviacion, 1);
        }
      }
    } catch (e) {
      console.warn('⚠️ No se pudo analizar tablas de cuantización:', e.message);
    }

    // ============================================================
    //  🔥 CONTEXTUALIZACIÓN: DETECTAR COMPRESIÓN DE PLATAFORMA
    // ============================================================
    // 🔥 PATRONES CONOCIDOS DE PLATAFORMAS
    const dimensiones = metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : null;
    const esCompresionWhatsApp = dimensiones && (dimensiones.width <= 1600 && dimensiones.height <= 1600) && diferencia > 0.3;
    const esCompresionInstagram = dimensiones && (dimensiones.width <= 1080 || dimensiones.height <= 1080) && diferencia > 0.25;
    const esCompresionFacebook = dimensiones && (dimensiones.width <= 2048 && dimensiones.height <= 2048) && diferencia > 0.2;
    const esCompresionTelegram = dimensiones && (dimensiones.width <= 2560 && dimensiones.height <= 2560) && diferencia > 0.15;

    // 🔥 Si la diferencia es muy grande (>50%) y la imagen tiene dimensiones de plataforma, es compresión de plataforma
    const esCompresionPlataforma = esCompresionWhatsApp || esCompresionInstagram || esCompresionFacebook || esCompresionTelegram;

    // ============================================================
    //  🔥 DECISIÓN CONTEXTUALIZADA
    // ============================================================
    let puntuacion = 0;
    const evidencias = [];
    let peso = 0.5;

    // 🔥 Si es compresión de plataforma, NO vota IA (peso bajo, confianza baja)
    if (esCompresionPlataforma && dobleCompresionTamanio) {
      // Es compresión normal de plataforma → no es IA
      evidencias.push(`Compresión típica de plataforma (${diferencia * 100}%)`);
      puntuacion = 0.1; // Confianza muy baja (casi humano)
      peso = 0.2; // Peso muy bajo
    } else if (dobleCompresionTamanio) {
      // Doble compresión no explicada por plataforma → sospechosa
      puntuacion += 0.5;
      evidencias.push(`Doble compresión por tamaño (${(diferencia * 100).toFixed(1)}%)`);
    }

    if (tablaAnomala) {
      puntuacion += 0.3;
      evidencias.push('Tabla de cuantización anómala');
    }

    // 🔥 Si no hay evidencias, no es IA
    if (evidencias.length === 0) {
      evidencias.push('No se detectaron signos de doble compresión.');
    }

    const confianza = Math.min(puntuacion, 0.7); // 🔥 Máximo 70% (nunca 100%)
    const esIA = confianza > 0.3; // 🔥 Umbral más alto (0.3 en lugar de 0.25)

    const explicacion = esIA
      ? `Se detectaron signos de doble compresión (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`
      : `No se detectaron signos relevantes de doble compresión (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`;

    // ============================================================
    //  RETORNO CON EL CONTRATO
    // ============================================================
    const resultado = {
      esIA,
      confianza,
      explicacion,
      evidencias,
      peso,
      dobleCompresionTamanio,
      diferencia,
      tablaAnomala,
      tamañoOriginal,
      tamañoRecomp,
      calidadUsada: CALIDAD,
      // 🔥 METADATOS DE CONTEXTUALIZACIÓN
      contexto: {
        dimensiones,
        esCompresionPlataforma,
        esCompresionWhatsApp,
        esCompresionInstagram,
        esCompresionFacebook,
        esCompresionTelegram
      }
    };

    console.log(`🔍 [detectar-doble-compresion-sharp] diferencia: ${diferencia} (calidad: ${CALIDAD}) | plataforma: ${esCompresionPlataforma}`);

    return {
      exito: true,
      resultado,
      metricas: { tiempoMs: 18 }
    };

  } catch (error) {
    return {
      exito: false,
      error: `Error en análisis de doble compresión: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar doble compresión: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.4
      },
      metricas: { tiempoMs: 0 }
    };
  }
}