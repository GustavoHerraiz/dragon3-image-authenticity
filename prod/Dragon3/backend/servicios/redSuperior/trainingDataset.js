/**
 * ====================================================================
 * DRAGON3 - TRAINING DATASET MEJORADO (SINTÉTICO + REALES)
 * ====================================================================
 *
 * Versión: 2.0.0-FAANG-Realistic
 * Fecha: 2025-05-06
 *
 * Descripción:
 * - Dataset sintético con distribuciones normales por clase (350 muestras/clase).
 * - Ruido controlado para evitar sobreajuste.
 * - Carga opcional de datos reales desde archivo JSON (./data/datos_reales.json).
 *
 * ====================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONSTANTES
// =============================================================================
export const CATEGORIAS = {
  HUMANO: 'humano',
  IA_GENERADO: 'ia_generado',
  EDITADO: 'editado'
};

// Tamaños por clase (sintéticos)
const DATASET_SIZES = {
  humano: 350,
  ia_generado: 350,
  editado: 350
};

const CLASS_MEANS = {
  humano: 0.95,      // más alto
  ia_generado: 0.05, // más bajo
  editado: 0.50      // medio
};
const STD_DEV = 0.10; // reducir ruido
// =============================================================================
// UTILIDADES DE GENERACIÓN
// =============================================================================

/**
 * Genera un valor aleatorio con distribución normal (Box-Muller)
 * @param {number} mean - Media
 * @param {number} stdDev - Desviación estándar
 * @returns {number}
 */
function normalRandom(mean, stdDev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  let val = mean + z * stdDev;
  return Math.min(1, Math.max(0, val)); // Clipping a [0,1]
}

/**
 * Genera los 9 features de un especialista concreto
 * @param {string} label - Clase
 * @param {number} specialistIndex - Índice del especialista (0-9)
 * @returns {number[]} Array de 9 features
 */
function generateSpecialistFeatures(label, specialistIndex) {
  const mean = CLASS_MEANS[label];
  // Añadir pequeña variación por especialista (para que no sean idénticos)
  const offset = (specialistIndex - 5) * 0.02;
  const adjustedMean = Math.min(0.95, Math.max(0.05, mean + offset));
  const features = [];
  for (let i = 0; i < 9; i++) {
    features.push(normalRandom(adjustedMean, STD_DEV));
  }
  return features;
}

/**
 * Genera los 10 scores de los analizadores locales (basados en la clase)
 * @param {string} label - Clase
 * @returns {number[]} Array de 10 scores
 */
function generateLocalAnalyzers(label) {
  const mean = CLASS_MEANS[label];
  const scores = [];
  for (let i = 0; i < 10; i++) {
    // Los analizadores locales tienen menos variabilidad (ruido más suave)
    scores.push(normalRandom(mean, 0.10));
  }
  return scores;
}

/**
 * Genera una muestra sintética completa
 * @param {string} label - Clase
 * @param {number} index - Índice (para ID único)
 * @returns {Object} Muestra
 */
function generateSyntheticSample(label, index) {
  const features = [];
  // Para cada uno de los 10 especialistas, generar 9 features
  for (let sp = 0; sp < 10; sp++) {
    const spFeatures = generateSpecialistFeatures(label, sp);
    features.push(...spFeatures);
  }
  const localAnalyzers = generateLocalAnalyzers(label);
  return {
    id: `synthetic_${label}_${index}_${crypto.randomBytes(4).toString('hex')}`,
    features,          // 90 elementos
    localAnalyzers,    // 10 elementos
    label,
    metadata: {
      synthetic: true,
      generated: new Date().toISOString(),
      version: '2.0.0'
    }
  };
}

/**
 * Carga datos reales si existen y los combina con el dataset
 * @returns {Array} Muestras reales (vacío si no hay archivo)
 */
function loadRealSamples() {
  const realDataPath = path.join(__dirname, 'data', 'datos_reales.json');
  if (!fs.existsSync(realDataPath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(realDataPath, 'utf8');
    const realSamples = JSON.parse(content);
    if (!Array.isArray(realSamples)) return [];
    // Validar estructura básica
    return realSamples.filter(s => s.features && s.localAnalyzers && s.label);
  } catch (err) {
    console.error('Error cargando datos reales:', err.message);
    return [];
  }
}

/**
 * Guarda los datos reales (sobrescribe el archivo)
 * @param {Array} samples - Muestras reales
 */
export function saveRealSamples(samples) {
  const realDataPath = path.join(__dirname, 'data', 'datos_reales.json');
  const dir = path.dirname(realDataPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(realDataPath, JSON.stringify(samples, null, 2));
  console.log(`[trainingDataset] ${samples.length} muestras reales guardadas.`);
}

/**
 * Genera dataset completo (sintético + reales)
 * @returns {Array} Dataset combinado
 */
export function generateDataset() {
  const dataset = [];

  // Generar muestras sintéticas
  for (const [label, count] of Object.entries(DATASET_SIZES)) {
    for (let i = 0; i < count; i++) {
      dataset.push(generateSyntheticSample(label, i));
    }
  }

  // Cargar y añadir muestras reales (si existen)
  const realSamples = loadRealSamples();
  if (realSamples.length) {
    console.log(`[trainingDataset] Añadiendo ${realSamples.length} muestras reales al dataset.`);
    dataset.push(...realSamples);
  }

  // Mezclar (shuffle) para evitar sesgos de orden
  for (let i = dataset.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dataset[i], dataset[j]] = [dataset[j], dataset[i]];
  }

  return dataset;
}

// =============================================================================
// FUNCIONES DE DIVISIÓN Y CONVERSIÓN (compatibles con el resto del sistema)
// =============================================================================

/**
 * Divide dataset en train/validation/test (70/15/15)
 * @param {Array} dataset 
 * @param {number} trainRatio 
 * @param {number} valRatio 
 * @returns {Object}
 */
export function splitDataset(dataset, trainRatio = 0.7, valRatio = 0.15) {
  const trainSize = Math.floor(dataset.length * trainRatio);
  const valSize = Math.floor(dataset.length * valRatio);
  const trainSet = dataset.slice(0, trainSize);
  const valSet = dataset.slice(trainSize, trainSize + valSize);
  const testSet = dataset.slice(trainSize + valSize);
  return {
    train: trainSet,
    validation: valSet,
    test: testSet,
    metadata: {
      total: dataset.length,
      train: trainSet.length,
      validation: valSet.length,
      test: testSet.length,
      trainRatio,
      valRatio,
      testRatio: 1 - trainRatio - valRatio
    }
  };
}

/**
 * Convierte muestra a formato Brain.js para Small NN
 * @param {Object} sample 
 * @param {number} specialistIndex 
 * @returns {Object} { input, output }
 */
export function sampleToSmallNNFormat(sample, specialistIndex) {
  const startIdx = specialistIndex * 9;
  const input = sample.features.slice(startIdx, startIdx + 9);
  const output = [sample.label === CATEGORIAS.HUMANO ? 1 : 0];
  return { input, output };
}

/**
 * Convierte dataset completo a formato Small NN
 * @param {Array} dataset 
 * @param {number} specialistIndex 
 * @returns {Array}
 */
export function datasetToSmallNNFormat(dataset, specialistIndex) {
  return dataset.map(sample => sampleToSmallNNFormat(sample, specialistIndex));
}

/**
 * Convierte muestra a formato Brain.js para Red Mayor (20 inputs)
 * @param {Object} sample 
 * @param {Array|null} smallNNScores - Scores de los 10 especialistas (opcional)
 * @returns {Object} { input, output }
 */
export function sampleToRedMayorFormat(sample, smallNNScores = null) {
  let input;
  if (smallNNScores && Array.isArray(smallNNScores) && smallNNScores.length === 10) {
    input = [...smallNNScores, ...sample.localAnalyzers];
  } else {
    // Fallback: usar promedios
    input = [...Array(10).fill(0.5), ...sample.localAnalyzers];
  }
  const output = sample.label === CATEGORIAS.HUMANO ? [1, 0, 0] :
                 sample.label === CATEGORIAS.IA_GENERADO ? [0, 1, 0] :
                 [0, 0, 1];
  return { input, output };
}

/**
 * Convierte dataset completo a formato Red Mayor, aceptando lista de scores por muestra
 * @param {Array} dataset 
 * @param {Array|null} smallNNScoresList 
 * @returns {Array}
 */
export function datasetToRedMayorFormat(dataset, smallNNScoresList = null) {
  if (!smallNNScoresList) {
    return dataset.map(sample => sampleToRedMayorFormat(sample));
  }
  return dataset.map((sample, idx) => {
    const scores = smallNNScoresList[idx] || null;
    return sampleToRedMayorFormat(sample, scores);
  });
}

/**
 * Estadísticas del dataset (compatible)
 * @param {Array} dataset 
 * @returns {Object}
 */
export function getDatasetStats(dataset) {
  const labelCounts = { humano: 0, ia_generado: 0, editado: 0 };
  let featureSum = 0, featureMin = Infinity, featureMax = -Infinity;
  for (const sample of dataset) {
    labelCounts[sample.label] = (labelCounts[sample.label] || 0) + 1;
    for (const f of sample.features) {
      featureSum += f;
      if (f < featureMin) featureMin = f;
      if (f > featureMax) featureMax = f;
    }
  }
  const totalFeatures = dataset.length * 90;
  const featureMean = featureSum / totalFeatures;
  let variance = 0;
  for (const sample of dataset) {
    for (const f of sample.features) {
      variance += (f - featureMean) ** 2;
    }
  }
  const featureStd = Math.sqrt(variance / totalFeatures);
  return {
    totalSamples: dataset.length,
    labelDistribution: labelCounts,
    featureStats: {
      min: featureMin.toFixed(3),
      max: featureMax.toFixed(3),
      mean: featureMean.toFixed(3),
      std: featureStd.toFixed(3)
    }
  };
}

// Exportaciones adicionales
export { DATASET_SIZES };
export default {
  generateDataset,
  splitDataset,
  sampleToSmallNNFormat,
  datasetToSmallNNFormat,
  sampleToRedMayorFormat,
  datasetToRedMayorFormat,
  getDatasetStats,
  saveRealSamples,
  CATEGORIAS
};