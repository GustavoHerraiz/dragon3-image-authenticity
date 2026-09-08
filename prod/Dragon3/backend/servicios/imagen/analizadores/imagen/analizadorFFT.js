/**
 * analizadorFFT.js - DRAGON3 FAANG
 * @version 1.0.0-STD_V25_SPECTRAL
 * @description Análisis de Espectro de Frecuencia (Fourier).
 * Detecta la "huella digital" de convoluciones de IA (GANs/Diffusion)
 * invisible al ojo humano.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import dragon from '../../../../utilidades/logger.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const ANALYZER_VERSION = '1.0.0-STD_V25_SPECTRAL';
const ANALYZER_ID = 'analizadorFFT';
const MODULE_NAME = 'analizadorFFT.js';

const CONFIG = {
  size: 512, // 🚨 SUBIMOS DE 256 A 512
  umbralPicos: 4.5, // Cuántas veces por encima de la media es un "pico" sospechoso
  ratioArtificial: 0.05 // % de picos anómalos para considerar IA
};

// ================== MOTOR MATEMÁTICO FFT (Pure JS Optimized) ==================

// Clase compleja simple para FFT
class Complex {
  constructor(re, im) { this.re = re; this.im = im; }
  add(other) { return new Complex(this.re + other.re, this.im + other.im); }
  sub(other) { return new Complex(this.re - other.re, this.im - other.im); }
  mul(other) { return new Complex(this.re * other.re - this.im * other.im, this.re * other.im + this.im * other.re); }
}

// FFT 1D (Cooley-Tukey)
function fft1D(data) {
  const N = data.length;
  if (N <= 1) return data;

  const even = fft1D(data.filter((_, i) => i % 2 === 0));
  const odd = fft1D(data.filter((_, i) => i % 2 !== 0));

  const result = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const t = new Complex(Math.cos(angle), Math.sin(angle)).mul(odd[k]);
    result[k] = even[k].add(t);
    result[k + N / 2] = even[k].sub(t);
  }
  return result;
}

// FFT 2D sobre buffer de imagen
function calcularFFT2D(pixels, size) {
  // 1. Preparar Matriz Compleja
  let matrix = [];
  for (let y = 0; y < size; y++) {
    let row = [];
    for (let x = 0; x < size; x++) {
      row.push(new Complex(pixels[y * size + x], 0));
    }
    matrix.push(row);
  }

  // 2. FFT por Filas
  for (let y = 0; y < size; y++) {
    matrix[y] = fft1D(matrix[y]);
  }

  // 3. Transponer
  let transposed = Array(size).fill(0).map(() => Array(size));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      transposed[x][y] = matrix[y][x];
    }
  }

  // 4. FFT por Columnas (sobre la transpuesta)
  for (let y = 0; y < size; y++) {
    transposed[y] = fft1D(transposed[y]);
  }

  // 5. Calcular Magnitud (Espectro) y Logaritmo para visualización/análisis
  // También hacemos "FFT Shift" lógico moviendo el DC al centro para analizar
  let spectrum = [];
  let totalEnergy = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = transposed[x][y]; // Nota: transposed[x][y] es matrix[y][x] original procesada
      const mag = Math.sqrt(c.re * c.re + c.im * c.im);
      const logMag = Math.log(mag + 1); // Escala logarítmica
      spectrum.push(logMag);
      totalEnergy += logMag;
    }
  }

  return { spectrum, meanEnergy: totalEnergy / (size * size) };
}

// ================== ANÁLISIS FORENSE DEL ESPECTRO ==================

function analizarEspectro(spectrum, size, mean) {
  let picosAnomalos = 0;
  let totalPuntos = size * size;
  let sumaVarianza = 0; // Nueva métrica MBH
  let puntosAnalizados = 0;

  const center = size / 2;
  const ignoreRadius = 8; // Ampliamos un poco el radio central

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 1. Ignorar solo el núcleo de bajas frecuencias
      if (Math.abs(x - center) < ignoreRadius && Math.abs(y - center) < ignoreRadius) continue;

      // 🚨 CAMBIO CLAVE: Ya no ignoramos toda la "cruz central". 
      // Las IAs de difusión suelen dejar rastros en los ejes.
      
      const val = spectrum[y * size + x];
      
      // 2. Acumular datos para medir la "perfección" (Varianza)
      sumaVarianza += Math.pow(val - mean, 2);
      puntosAnalizados++;

      // 3. Detección clásica de picos (para GANs antiguas)
      if (val > mean * CONFIG.umbralPicos) {
        picosAnomalos++;
      }
    }
  }

  const ratioAnomalia = picosAnomalos / totalPuntos;
  const varianzaEspectral = sumaVarianza / puntosAnalizados; // Cuanto más baja, más sospecha de IA

  return { picosAnomalos, ratioAnomalia, varianzaEspectral };
}

// ================== CLASE PRINCIPAL ==================

export async function analizarImagen(params) {
  const start = Date.now();
  const { rutaArchivo, archivoId, correlationId } = params || {};

  const reporte = new RespuestaStandard(ANALYZER_ID, "Análisis Espectral (FFT)", ANALYZER_VERSION);

  if (!rutaArchivo || !archivoId) {
    return reporte.error(new Error('Parámetros faltantes')).cerrar();
  }

  dragon.respira('Iniciando FFT Analysis', MODULE_NAME, 'START', { archivoId });

  try {
    if (!existsSync(rutaArchivo)) return reporte.error(new Error('Archivo no encontrado')).cerrar();

    // 1. Preprocesar (Subimos a 512px para captar más detalle espectral si CONFIG lo permite)
    const buffer = await sharp(rutaArchivo)
      .resize(CONFIG.size, CONFIG.size, { fit: 'fill' }) 
      .greyscale()
      .raw()
      .toBuffer();

    // 2. Ejecutar FFT
    const { spectrum, meanEnergy } = calcularFFT2D(buffer, CONFIG.size);

    // 3. Análisis Forense (Ahora con Varianza)
    const { picosAnomalos, ratioAnomalia, varianzaEspectral } = analizarEspectro(spectrum, CONFIG.size, meanEnergy);

    // --- LÓGICA DE DECISIÓN V25 (ANTI-DIFUSIÓN) ---

    let decision = "Indeterminado";
    let confianza = 0.5;
    let score = 50;
    let pesoVoto = "alto";
    let mensajeCorto = "Espectro normal";

    // CASO 1: Rejilla/GAN (Clásico)
    if (ratioAnomalia > CONFIG.ratioArtificial) {
        decision = "Artificial";
        confianza = 0.85 + Math.min(0.14, ratioAnomalia);
        score = 10; // Score humano muy bajo
        mensajeCorto = "Artefactos de frecuencia (Grid/GAN)";
        reporte.activarFlag("ia");
    }
    // CASO 2: La "Perfección" de Midjourney/Difusión (Varianza ultra baja)
    // Una imagen real tiene un espectro "sucio". La IA es demasiado limpia.
    else if (varianzaEspectral < 0.45) { 
        decision = "Artificial";
        confianza = 0.82;
        score = 20; 
        mensajeCorto = "Espectro ultra-limpio (Firma de IA)";
        reporte.activarFlag("ia");
    }
    // CASO 3: Espectro Natural (Caos orgánico)
    else if (ratioAnomalia < 0.001 && varianzaEspectral > 0.6) {
        decision = "Humano";
        confianza = 0.85;
        score = 90;
        mensajeCorto = "Decaimiento natural y ruido orgánico";
        reporte.activarFlag("camara");
    }
    else {
        decision = "Indeterminado";
        confianza = 0.6;
        mensajeCorto = "Patrones espectrales mixtos";
    }

    // --- CONSTRUCCIÓN DEL REPORTE ---

    reporte.definirVoto(decision, confianza, score, pesoVoto);

    const icono = decision === 'Artificial' ? '🤖' : (decision === 'Humano' ? '📸' : '〰️');
    const estado = decision === 'Artificial' ? 'danger' : (decision === 'Humano' ? 'success' : 'info');

    reporte.concluir(
        estado, icono, mensajeCorto,
        `Análisis de Fourier (FFT): ${mensajeCorto}. ${
            decision === 'Artificial' 
            ? 'Se detectan patrones de frecuencia sintéticos o una uniformidad espectral incompatible con sensores ópticos.' 
            : 'El espectro muestra el caos y decaimiento típicos de una captura física.'
        }`,
        `Anomalía=${(ratioAnomalia*100).toFixed(2)}%. Varianza=${varianzaEspectral.toFixed(3)}.`
    );

    // Datos Visuales
    reporte.agregarDato("Anomalía Espectral", (ratioAnomalia*100).toFixed(2) + "%");
    reporte.agregarDato("Pureza de Espectro", varianzaEspectral.toFixed(3));

    // Datos Forenses
    reporte.datosForenses(score, "Fast Fourier Transform (2D Spectrum)", {
        spectrum_size: CONFIG.size,
        anomalous_peaks: picosAnomalos,
        anomaly_ratio: ratioAnomalia,
        spectral_variance: varianzaEspectral,
        energy_mean: meanEnergy
    });

    dragon.mideRendimiento('analisis_fft', Date.now() - start, MODULE_NAME, { archivoId });

    return reporte.cerrar();

  } catch (error) {
    return reporte.error(error).cerrar();
  }
}
export default { analizarImagen, version: ANALYZER_VERSION };
