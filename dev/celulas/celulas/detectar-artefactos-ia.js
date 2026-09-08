/**
 * detectar-artefactos-ia.js
 * 
 * Detecta artefactos visuales típicos de imágenes generadas por IA:
 * - Ruido uniforme (varianza local baja)
 * - Patrones periódicos (autocorrelación alta)
 * - Poca diversidad tonal (pocos valores únicos)
 * - Texturas repetitivas (correlación entre píxeles vecinos)
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
 * Optimización: el tamaño de redimensionado se lee de configuracion.json
 * (clave: optimizacion.tamañoOptimizado) para permitir ajuste automático
 * por el agente de decisión.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function detectarArtefactosIA(entrada, contexto) {
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
    //  LECTURA DE CONFIGURACIÓN DE OPTIMIZACIÓN
    // ============================================================
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { tamañoOptimizado: 128 } };
    }
    const TAMAÑO = config.optimizacion?.tamañoOptimizado || 128;

    // 2. Convertir a escala de grises y redimensionar al tamaño optimizado
    const imagen = await sharp(buffer)
      .grayscale()
      .resize(TAMAÑO, TAMAÑO, { fit: 'fill' })
      .raw()
      .toBuffer();

    const pixeles = new Uint8Array(imagen);
    const total = pixeles.length;
    const lado = TAMAÑO;

    // --- Media global ---
    let mediaGlobal = 0;
    for (let i = 0; i < total; i++) mediaGlobal += pixeles[i];
    mediaGlobal /= total;

    // --- 1. Varianza local por bloques (8x8) ---
    const numBloques = 8;
    const bloqueSize = lado / numBloques;
    let varianzaLocalPromedio = 0;
    const varianzasLocales = [];

    for (let by = 0; by < numBloques; by++) {
      for (let bx = 0; bx < numBloques; bx++) {
        let sum = 0, count = 0;
        const yStart = by * bloqueSize;
        const yEnd = (by + 1) * bloqueSize;
        const xStart = bx * bloqueSize;
        const xEnd = (bx + 1) * bloqueSize;

        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = y * lado + x;
            sum += pixeles[idx];
            count++;
          }
        }
        const mediaLocal = sum / count;
        let varLocal = 0;
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = y * lado + x;
            varLocal += (pixeles[idx] - mediaLocal) ** 2;
          }
        }
        varLocal /= count;
        varianzasLocales.push(varLocal);
        varianzaLocalPromedio += varLocal;
      }
    }
    varianzaLocalPromedio /= (numBloques * numBloques);

    // --- 2. Autocorrelación (patrón de ruido) ---
    let autocorrelacion = 0;
    for (let i = 0; i < total - 1; i++) {
      autocorrelacion += (pixeles[i] - mediaGlobal) * (pixeles[i+1] - mediaGlobal);
    }
    autocorrelacion /= (total - 1);

    // --- 3. Diversidad tonal (valores únicos) ---
    const valoresUnicos = new Set(pixeles);
    const diversidad = valoresUnicos.size / 256;

    // --- 4. Correlación entre vecinos (texturas) ---
    let correlacion = 0;
    let pares = 0;
    for (let i = 0; i < total - 1; i++) {
      correlacion += (pixeles[i] - mediaGlobal) * (pixeles[i+1] - mediaGlobal);
      pares++;
    }
    correlacion = pares > 0 ? correlacion / pares : 0;
    const correlacionNormalizada = Math.min(Math.max(correlacion / 5000, 0), 1);

    // --- Umbrales empíricos (ajustables) ---
    const ruidoUniforme = varianzaLocalPromedio < 40;
    const ruidoPeriodico = Math.abs(autocorrelacion) > 800;
    const pocaDiversidad = diversidad < 0.35;
    const texturaRepetitiva = correlacionNormalizada > 0.8;

    // --- Decisión ---
    let puntuacion = 0;
    const evidencias = [];

    if (ruidoUniforme) {
      puntuacion += 0.3;
      evidencias.push('Ruido artificialmente uniforme (típico de IA)');
    }
    if (ruidoPeriodico) {
      puntuacion += 0.4;
      evidencias.push('Patrón de ruido periódico (típico de IA)');
    }
    if (texturaRepetitiva) {
      puntuacion += 0.3;
      evidencias.push('Patrones de textura repetitivos (típico de IA)');
    }
    if (pocaDiversidad) {
      puntuacion += 0.2;
      evidencias.push('Poca diversidad de tonos (típico de IA)');
    }

    if (evidencias.length === 0) {
      evidencias.push('No se detectaron artefactos visuales típicos de IA.');
    }

    const confianza = Math.min(puntuacion, 1);
    const esIA = confianza > 0.2;

    const explicacion = esIA
      ? `Se detectaron artefactos visuales típicos de IA (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`
      : `No se detectaron artefactos visuales de IA (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`;

    return {
      exito: true,
      resultado: {
        esIA,
        confianza,
        explicacion,
        evidencias,
        peso: 0.7,
        varianzaLocalPromedio,
        autocorrelacion,
        correlacion: correlacionNormalizada,
        diversidad,
        tamañoUsado: TAMAÑO // para depuración
      },
      metricas: { tiempoMs: 20 }
    };

  } catch (error) {
    return {
      exito: false,
      error: `Error en análisis de artefactos: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar artefactos: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.5
      },
      metricas: { tiempoMs: 0 }
    };
  }
}