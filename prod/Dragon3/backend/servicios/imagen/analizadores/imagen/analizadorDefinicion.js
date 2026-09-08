/**
 * analizadorDefinicion.js - DRAGON3 FAANG
 * @version 5.0.0-STD_V25
 * @description Analiza nitidez, complejidad y textura.
 * - Detecta imágenes "demasiado perfectas" (IA) o con "ruido natural" (Humano).
 * - Adaptado al contrato RespuestaStandard V25.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { performance } from 'perf_hooks';
import dragon from '../../../../utilidades/logger.js';
// 👇 IMPORTACIÓN ESTÁNDAR
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

// ================== CONSTANTES ==================

const ANALYZER_VERSION = '5.0.0-STD_V25';
const ANALYZER_ID = 'analizadorDefinicion';
const MODULE_NAME = 'analizadorDefinicion.js';

const CONFIG = {
  umbralBajaNitidez: parseFloat(process.env.ANALIZADOR_DEF_UMBRAL_BAJA || '8'),
  umbralAltaNitidez: parseFloat(process.env.ANALIZADOR_DEF_UMBRAL_ALTA || '15'),
  pesoNitidez: parseFloat(process.env.ANALIZADOR_DEF_PESO_NITIDEZ || '0.50'),
  pesoVariabilidad: parseFloat(process.env.ANALIZADOR_DEF_PESO_VARIABILIDAD || '0.30'),
  pesoComplejidadModerada: parseFloat(process.env.ANALIZADOR_DEF_PESO_COMPLEJIDAD || '0.20'),
  timeoutMs: parseInt(process.env.ANALIZADOR_DEF_TIMEOUT_MS || '3000', 10)
};

// ================== AUXILIARES MATEMÁTICOS ==================

function calcularEntropiaNormalizada(bufferGrises) {
  if (!bufferGrises?.length) return null;
  const histograma = new Array(256).fill(0);
  for (let i = 0; i < bufferGrises.length; i++) histograma[bufferGrises[i]]++;

  let entropia = 0;
  const total = bufferGrises.length;
  for (let i = 0; i < 256; i++) {
    if (histograma[i] > 0) {
      const p = histograma[i] / total;
      entropia -= p * Math.log2(p);
    }
  }
  return entropia / 8;
}

// ================== CLASE PRINCIPAL ==================

class AnalizadorDefinicion {
  constructor(options = {}) {
    this.version = ANALYZER_VERSION;
    this.id = ANALYZER_ID;
    this.options = { ...CONFIG, ...options };
  }

  async analizarImagen(parametros) {
    const t0 = performance.now();
    const { rutaArchivo, archivoId, correlationId } = parametros;

    // 👇 1. INICIALIZAR REPORTE STANDARD
    const reporte = new RespuestaStandard(ANALYZER_ID, "Definición & Nitidez", ANALYZER_VERSION);

    if (!rutaArchivo || !archivoId) {
        return reporte.error(new Error('Parámetros obligatorios faltantes')).cerrar();
    }

    try {
      if (!existsSync(rutaArchivo)) throw new Error(`Archivo no encontrado: ${rutaArchivo}`);

      // 🚀 OPTIMIZACIÓN MBH: Downsampling a 1024px
      const imagen = sharp(rutaArchivo, { failOnError: true })
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });
      
      const metadata = await imagen.metadata();

      if (!metadata.width || !metadata.height || metadata.width <= 1 || metadata.height <= 1) {
          return reporte.skip("Dimensiones insuficientes para análisis.", "No Aplica").cerrar();
      }

      // 1. Escala de grises (sobre la imagen reducida)
      const { data: bufferGrises, info: infoGris } = await imagen.clone().greyscale().raw().toBuffer({ resolveWithObject: true });

      // 2. Nitidez (Gradiente Optimizado)
      let gradientePromedio = 0;
      let scoreNitidezHumano = 0.5;
      let nitidezEvaluada = "Indeterminable";

      if (infoGris.height > 1 && infoGris.width > 0) {
        let sumaGradiente = 0;
        let muestras = 0;
        
        // Zancada de 2: Analizamos 1 de cada 4 píxeles para velocidad extrema
        for (let y = 0; y < infoGris.height - 1; y += 2) {
          const offset = y * infoGris.width;
          const offsetNext = (y + 1) * infoGris.width;
          for (let x = 0; x < infoGris.width; x += 2) {
            sumaGradiente += Math.abs(bufferGrises[offset + x] - bufferGrises[offsetNext + x]);
            muestras++;
          }
        }
        
        gradientePromedio = sumaGradiente / muestras;

        // Categorización MBH V25
        if (gradientePromedio >= this.options.umbralAltaNitidez) {
          scoreNitidezHumano = 0.1; 
          nitidezEvaluada = "Alta (Artificial)";
        } else if (gradientePromedio < this.options.umbralBajaNitidez) {
          scoreNitidezHumano = 0.2; 
          nitidezEvaluada = "Baja (Suave)";
        } else {
          scoreNitidezHumano = 0.9; 
          nitidezEvaluada = "Natural";
        }
      }

      // 3. Variabilidad (Std Dev)
      let scoreVariabilidadHumano = 0.5;
      const stats = await imagen.clone().greyscale().stats();
      const desviacionEstandar = stats.channels[0].stdev;
      // Normalizamos: Imágenes naturales suelen tener desviación media-alta
      scoreVariabilidadHumano = Math.min(1, desviacionEstandar / 60);

      // 4. Complejidad (Entropía)
      const entropia = calcularEntropiaNormalizada(bufferGrises);
      let scoreComplejidadHumano = 0.5;
      if (entropia !== null) {
        // Gaussiana centrada en 0.75 (complejidad visual fotográfica típica)
        scoreComplejidadHumano = Math.exp(-10 * Math.pow(entropia - 0.75, 2));
      }

      // --- CÁLCULO DE SCORE FINAL ---
      let scorePonderado = (
        scoreNitidezHumano * this.options.pesoNitidez +
        scoreVariabilidadHumano * this.options.pesoVariabilidad +
        scoreComplejidadHumano * this.options.pesoComplejidadModerada
      );

      // Score final 0-100
      const scoreFinal = Math.min(100, Math.max(0, scorePonderado * 100));

      // --- LÓGICA DE DECISIÓN V25 ---

      let decision = "Indeterminado";
      let confianza = 0.5;
      let pesoVoto = "medio"; // Definición es una evidencia de soporte
      let mensajeCorto = "Definición ambigua";

      if (scoreFinal >= 75) {
          decision = "Humano";
          confianza = 0.85;
          mensajeCorto = "Nitidez y textura naturales";
          reporte.activarFlag("camara");
      } else if (scoreFinal <= 30) {
          decision = "Artificial";
          confianza = 0.80;
          mensajeCorto = "Textura artificial (demasiado suave/dura)";
          reporte.activarFlag("ia");
      } else {
          mensajeCorto = "Patrones mixtos de nitidez";
          reporte.activarFlag("edicion"); // Posible filtro
      }

      // --- CONSTRUCCIÓN DEL REPORTE ---

      reporte.definirVoto(decision, confianza, scoreFinal, pesoVoto);

      const icono = decision === 'Humano' ? '👁️' : (decision === 'Artificial' ? '🤖' : '🎨');
      const estado = decision === 'Humano' ? 'success' : (decision === 'Artificial' ? 'warning' : 'info');

      reporte.concluir(
          estado, icono, mensajeCorto,
          `Análisis de definición: ${mensajeCorto}. La imagen presenta un nivel de detalle y complejidad ${
              decision === 'Humano' ? 'consistente con fotografía óptica.' : 'anómalo (posible generación sintética o filtrado excesivo).'
          }`,
          `Gradiente=${gradientePromedio.toFixed(2)}, StdDev=${desviacionEstandar.toFixed(2)}, Entropía=${entropia?.toFixed(2)}`
      );

      // Datos Visuales
      reporte.agregarDato("Nitidez", nitidezEvaluada);
      reporte.agregarDato("Complejidad", entropia ? (entropia * 100).toFixed(0) + "%" : "N/A");
      reporte.agregarDato("Variabilidad", desviacionEstandar.toFixed(1));

      // Datos Forenses
      reporte.datosForenses(scoreFinal, "Sharpness/Complexity weighted analysis", {
          gradient_avg: gradientePromedio,
          std_dev: desviacionEstandar,
          entropy_norm: entropia,
          scores_partial: {
              sharpness: scoreNitidezHumano,
              variability: scoreVariabilidadHumano,
              complexity: scoreComplejidadHumano
          }
      });

      dragon.mideRendimiento('analizarDefinicion', performance.now() - t0, MODULE_NAME, { archivoId });

      return reporte.cerrar();

    } catch (error) {
      return reporte.error(error).cerrar();
    }
  }

  getInfo() {
    return { nombre: ANALYZER_ID, version: ANALYZER_VERSION, tipo: 'ML-Enhanced' };
  }
}

export default new AnalizadorDefinicion();
export { AnalizadorDefinicion, ANALYZER_VERSION };
