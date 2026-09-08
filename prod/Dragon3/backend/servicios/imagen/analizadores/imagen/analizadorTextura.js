/**
 * DRAGON3 FAANG - ANALIZADOR TEXTURA V25 (OPTIMIZADO)
 * @version 5.0.0-STD_V25
 * @description Ejecuta 10 métricas texturales en paralelo.
 * Detecta patrones de repetición sintética vs caos natural.
 */

import sharp from 'sharp';
import dragon from '../../../../utilidades/logger.js';
import { DragonError } from '../../../../utilidades/errores/DragonError.js';
// 👇 IMPORTACIÓN ESTÁNDAR
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const ANALYZER_VERSION = '5.0.0-STD_V25';
const MODULE_NAME = 'analizadorTextura';
const ANALYZER_ID = 'analizadorTextura';
const CONFIG = {
  timeoutMs: 8000,
  maxImageSizeBytes: 15728640,
  resizeMax: 1024, // Esto garantiza que el lado más largo sea 1024
  sampleStep: 4    // Aumentamos el step para mantener P95 < 200ms en CPUs saturadas
};
// ================== CÁLCULOS MATEMÁTICOS (INTACTOS) ==================

async function calcularComplejidadTextural(data, width, height, windowSize) {
  return withTimeout((async () => {
    let complexitySum = 0;
    let samples = 0;
    const step = CONFIG.sampleStep;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        let sum = 0, sumSq = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const val = data[ny * width + nx];
              sum += val;
              sumSq += val * val;
              count++;
            }
          }
        }
        if (count > 0) {
          const variance = (sumSq / count) - Math.pow(sum / count, 2);
          complexitySum += Math.sqrt(Math.max(0, variance));
          samples++;
        }
      }
    }
    const avgComplexity = complexitySum / Math.max(1, samples);
    return Math.min(1, avgComplexity / 90);
  })(), 1500, 'complejidadTextural');
}

async function calcularUniformidadTextural(data, width, height, windowSize) {
  return withTimeout((async () => {
    const half = Math.floor(windowSize / 2);
    let uniformitySum = 0;
    let samples = 0;
    for (let y = half; y < height - half; y += CONFIG.sampleStep) {
      for (let x = half; x < width - half; x += CONFIG.sampleStep) {
        const centerVal = data[y * width + x];
        let diffSum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const val = data[(y + dy) * width + (x + dx)];
            diffSum += Math.abs(centerVal - val);
            count++;
          }
        }
        uniformitySum += 1 - (diffSum / count / 255);
        samples++;
      }
    }
    return Math.max(0, uniformitySum / Math.max(1, samples));
  })(), 1000, 'uniformidadTextural');
}

async function calcularPatronesRepetitivos(data, width, height) {
  return withTimeout((async () => {
    const sampleSize = Math.min(128, width, height);
    const startX = Math.floor((width - sampleSize) / 2);
    const startY = Math.floor((height - sampleSize) / 2);
    let maxCorrelation = 0;
    for (const offset of [2, 4, 8, 16]) {
      let correlationSum = 0;
      let validPairs = 0;
      for (let y = startY; y < startY + sampleSize; y += 2) {
        for (let x = startX; x < startX + sampleSize - offset; x += 2) {
          const current = data[y * width + x];
          const shifted = data[y * width + (x + offset)];
          const similarity = 1 - (Math.abs(current - shifted) / 255);
          correlationSum += similarity;
          validPairs++;
        }
      }
      if (validPairs > 0) {
        maxCorrelation = Math.max(maxCorrelation, correlationSum / validPairs);
      }
    }
    return Math.min(1, maxCorrelation);
  })(), 1000, 'patronesRepetitivos');
}

async function calcularVariacionLocal(data, width, height, windowSize) {
  return withTimeout((async () => {
    const half = Math.floor(windowSize / 2);
    let variationSum = 0;
    let samples = 0;
    for (let y = half; y < height - half; y += CONFIG.sampleStep) {
      for (let x = half; x < width - half; x += CONFIG.sampleStep) {
        let sum = 0, sumSq = 0, count = 0;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const val = data[(y + dy) * width + (x + dx)];
            sum += val;
            sumSq += val * val;
            count++;
          }
        }
        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        variationSum += Math.sqrt(Math.max(0, variance));
        samples++;
      }
    }
    return Math.min(1, variationSum / samples / 128);
  })(), 1200, 'variacionLocal');
}

async function calcularDensidadBordes(data, width, height) {
  return withTimeout((async () => {
    let edgePixels = 0;
    let totalPixels = 0;
    for (let y = 1; y < height - 1; y += CONFIG.sampleStep) {
      for (let x = 1; x < width - 1; x += CONFIG.sampleStep) {
        const idx = y * width + x;
        const gx = -data[idx - 1] + data[idx + 1];
        const gy = -data[idx - width] + data[idx + width];
        const magnitude = Math.abs(gx) + Math.abs(gy);
        if (magnitude > 60) edgePixels++;
        totalPixels++;
      }
    }
    return Math.min(1, edgePixels / Math.max(1, totalPixels));
  })(), 1000, 'densidadBordes');
}

async function calcularContrasteMicro(data, width, height) {
  return withTimeout((async () => {
    let contrastSum = 0;
    let pairs = 0;
    for (let y = 0; y < height; y += CONFIG.sampleStep) {
      for (let x = 0; x < width - 1; x += CONFIG.sampleStep) {
        const diff = Math.abs(data[y * width + x] - data[y * width + (x + 1)]);
        contrastSum += diff;
        pairs++;
      }
    }
    return Math.min(1, contrastSum / pairs / 255);
  })(), 800, 'contrasteMicro');
}

async function calcularEscalaTextural(data, width, height, windowSize) {
  return withTimeout((async () => {
    const half = Math.floor(windowSize / 2);
    let scaleSum = 0;
    let samples = 0;
    for (let y = half; y < height - half; y += CONFIG.sampleStep) {
      for (let x = half; x < width - half; x += CONFIG.sampleStep) {
        let minVal = 255, maxVal = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const val = data[(y + dy) * width + (x + dx)];
            minVal = Math.min(minVal, val);
            maxVal = Math.max(maxVal, val);
          }
        }
        scaleSum += (maxVal - minVal) / 255;
        samples++;
      }
    }
    return scaleSum / Math.max(1, samples);
  })(), 1000, 'escalaTextural');
}

async function calcularAnisotropiaTextural(data, width, height) {
  return withTimeout((async () => {
    const directions = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }];
    const variances = [];
    for (const dir of directions) {
      let varianceSum = 0;
      let pairs = 0;
      for (let y = 1; y < height - 1; y += CONFIG.sampleStep) {
        for (let x = 1; x < width - 1; x += CONFIG.sampleStep) {
          const current = data[y * width + x];
          const neighbor = data[(y + dir.dy) * width + (x + dir.dx)];
          const diff = Math.abs(current - neighbor);
          varianceSum += diff * diff;
          pairs++;
        }
      }
      if (pairs > 0) variances.push(varianceSum / pairs);
    }
    if (variances.length === 0) return 0.5;
    const maxVar = Math.max(...variances);
    const minVar = Math.min(...variances);
    return maxVar > 0 ? (maxVar - minVar) / maxVar : 0.5;
  })(), 1200, 'anisotropiaTextural');
}

async function calcularRugosidadEstadistica(data, width, height, windowSize) {
  return withTimeout((async () => {
    const half = Math.floor(windowSize / 2);
    let roughnessSum = 0;
    let samples = 0;
    for (let y = half; y < height - half; y += CONFIG.sampleStep) {
      for (let x = half; x < width - half; x += CONFIG.sampleStep) {
        const center = data[y * width + x];
        let diffSum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const val = data[(y + dy) * width + (x + dx)];
            diffSum += Math.abs(center - val);
            count++;
          }
        }
        roughnessSum += diffSum / count;
        samples++;
      }
    }
    return Math.min(1, roughnessSum / samples / 255);
  })(), 1000, 'rugosidadEstadistica');
}

async function calcularEntropiaGlobal(data, width, height) {
  return withTimeout((async () => {
    const histogram = new Array(256).fill(0);
    const totalPixels = width * height;
    for (let i = 0; i < data.length; i++) histogram[data[i]]++;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const p = histogram[i] / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }
    return Math.min(1, entropy / 8);
  })(), 800, 'entropiaGlobal');
}

function withTimeout(promise, ms, methodName) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => {
        // En lugar de colgarse, devuelve un valor neutro para no romper el promedio
        resolve(0.5); 
      }, ms);
    })
  ]);
}

async function ejecutarCalculosTextura(data, width, height, archivoId) {
  const windowSize = Math.max(3, Math.min(15, Math.floor(Math.sqrt((width * height) / 100000) * 2)));

  const resultados = await Promise.all([
    calcularComplejidadTextural(data, width, height, windowSize),
    calcularUniformidadTextural(data, width, height, windowSize),
    calcularPatronesRepetitivos(data, width, height),
    calcularVariacionLocal(data, width, height, windowSize),
    calcularDensidadBordes(data, width, height),
    calcularContrasteMicro(data, width, height),
    calcularEscalaTextural(data, width, height, windowSize),
    calcularAnisotropiaTextural(data, width, height),
    calcularRugosidadEstadistica(data, width, height, windowSize),
    calcularEntropiaGlobal(data, width, height)
  ]);

  return {
    complejidadTextura: resultados[0],
    uniformidadTextura: resultados[1],
    patronesRepetitivos: resultados[2],
    variacionLocal: resultados[3],
    densidadBordes: resultados[4],
    contrasteMicro: resultados[5],
    escalaTextural: resultados[6],
    anisotropiaTextural: resultados[7],
    rugosidadEstadistica: resultados[8],
    entropiaGlobal: resultados[9],
    paramArray: resultados.map(p => Math.max(0, Math.min(1, Number(p.toFixed(4)))))
  };
}

// ================== FUNCIÓN PRINCIPAL ==================

export async function analizarImagen(params) {
  const { rutaArchivo, archivoId } = params || {};
  const t0 = Date.now();
  const reporte = new RespuestaStandard(ANALYZER_ID, "Análisis de Textura", ANALYZER_VERSION);

  if (!rutaArchivo || !archivoId) return reporte.error('Parámetros faltantes').cerrar();

  try {
    const image = sharp(rutaArchivo, { failOnError: true });
    
    // [ME] Forzamos el redimensionado y extraemos info real del buffer generado
    const { data: imageBuffer, info } = await image
      .resize(CONFIG.resizeMax, CONFIG.resizeMax, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info; 

    if (!width || !height || imageBuffer.length === 0) throw new Error('Imagen inválida');

    // Ejecución de cálculos
    const paramsTextura = await ejecutarCalculosTextura(imageBuffer, width, height, archivoId);

    // --- LÓGICA DE DECISIÓN CORREGIDA ---
    const { densidadBordes, variacionLocal, contrasteMicro, patronesRepetitivos, uniformidadTextura, complejidadTextura } = paramsTextura;

    let decision = "Indeterminado";
    let confianza = 0.5;
    let score = 50;
    let mensajeCorto = "Textura mixta";

    const indiciosIA = (densidadBordes > 0.25 && variacionLocal > 0.18 && contrasteMicro > 0.035);
    const indiciosHumano = (patronesRepetitivos > 0.75 && uniformidadTextura > 0.6 && complejidadTextura > 0.3);

    if (indiciosIA && !indiciosHumano) {
        decision = "Artificial";
        confianza = 0.65;
        score = 35;
        mensajeCorto = "Alto contraste artificial";
        reporte.activarFlag("ia");
    } else if (indiciosHumano && !indiciosIA) {
        decision = "Humano";
        confianza = 0.70;
        score = 70;
        mensajeCorto = "Patrones orgánicos";
        reporte.activarFlag("camara");
    }

    // [FIX] Referencia correcta a 'decision'
    reporte.definirVoto(decision, confianza, score, "medio");

    reporte.concluir(
        decision === 'Humano' ? 'success' : (decision === 'Artificial' ? 'warning' : 'info'),
        decision === 'Humano' ? '🧶' : (decision === 'Artificial' ? '🤖' : '❓'),
        mensajeCorto,
        `Análisis textural: ${mensajeCorto}.`,
        `Bordes=${densidadBordes.toFixed(2)}, Uniformidad=${uniformidadTextura.toFixed(2)}`
    );

    // [RS] Inyección de datos crudos para evitar el null
    reporte.setDatosCrudos(paramsTextura);
    
    dragon.mideRendimiento('analizarTextura', Date.now() - t0, MODULE_NAME, { archivoId });
    return reporte.cerrar();

  } catch (error) {
    dragon.agoniza('Error Crítico Textura', error.message, 'analizadorTextura', 'TEXTURA_FAIL', { 
        stack: error.stack,
        archivoId 
    });
    throw error; // Esto permite que el orquestador sepa que falló
}
}

export default analizarImagen;
