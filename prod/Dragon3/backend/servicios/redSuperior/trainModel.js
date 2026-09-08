/**
 * ====================================================================
 * DRAGON3 - TRAINING SCRIPT (ENTRENA TODAS LAS REDES)
 * ====================================================================
 *
 * Archivo: servicios/redSuperior/trainModel.js
 * Proyecto: Dragon3 - Sistema Autentificación IA Enterprise
 * Versión: 1.0.0-FAANG-Training
 * Fecha: 2025-04-15
 * Autor: Gustavo Herráiz (@GustavoHerraiz) - Lead Architect
 *
 * DESCRIPCIÓN:
 * Script de entrenamiento para Red Superior. Entrena 10 Small NNs
 * y 1 Red Mayor usando Brain.js. Guarda pesos en ./models/*.json.
 *
 * USO:
 * ```bash
 * cd /var/www/Dragon3/backend/servicios/redSuperior
 * node trainModel.js
 * ```
 *
 * PROCESO:
 * 1. ✅ Generar dataset sintético (100 samples)
 * 2. ✅ Dividir en train/val/test (70/15/15)
 * 3. ✅ Entrenar 10 Small NNs (paralelo)
 * 4. ✅ Ejecutar Small NNs en dataset para Red Mayor
 * 5. ✅ Entrenar Red Mayor
 * 6. ✅ Evaluar en test set
 * 7. ✅ Guardar pesos en ./models/
 *
 * MÉTRICAS:
 * - Training accuracy
 * - Validation accuracy
 * - Test accuracy
 * - Confusion matrix
 * - Training time
 *
 * ====================================================================
 */

// =============================================================================
// IMPORTS
// =============================================================================
import brain from 'brain.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

// Dataset
import {
  generateDataset,
  splitDataset,
  datasetToSmallNNFormat,
  datasetToRedMayorFormat,
  getDatasetStats,
  CATEGORIAS
} from './trainingDataset.js';

// Logging
import dragon from '../../utilidades/logger.js';

// =============================================================================
// CONSTANTES
// =============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOMBRE_MODULO = 'trainModel';
const VERSION_MODULO = '1.0.0-FAANG-Training';

const MODELS_DIR = path.join(__dirname, 'models');

/**
 * Nombres de especialistas
 */
const SPECIALIST_NAMES = [
  'exif_camera',
  'exif_editing',
  'texture',
  'gan_artifacts',
  'diffusion_artifacts',
  'sharpness',
  'compression',
  'c2pa',
  'resolution',
  'metadata'
];

/**
 * Configuración de entrenamiento
 */
const TRAINING_CONFIG = {
  smallNN: {
    iterations: 2000,
    errorThresh: 0.005,
    log: true,
    logPeriod: 100,
    learningRate: 0.01,
    momentum: 0.1
  },
  redMayor: {
    iterations: 3000,
    errorThresh: 0.003,
    log: true,
    logPeriod: 100,
    learningRate: 0.005,
    momentum: 0.1
  }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Asegura que existe el directorio
 */
function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Guarda modelo en JSON
 */
function saveModel(net, name) {
  const modelPath = path.join(MODELS_DIR, `${name}.json`);
  const modelData = net.toJSON();
  fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2));

  dragon.sonrie(
    `Modelo ${name} guardado`,
    NOMBRE_MODULO,
    'MODEL_SAVED',
    {
      name,
      path: modelPath,
      size: Math.round(JSON.stringify(modelData).length / 1024) + 'KB'
    }
  );
}

/**
 * Calcula accuracy
 */
function calculateAccuracy(net, testSet) {
  let correct = 0;

  testSet.forEach(sample => {
    const output = net.run(sample.input);
    const predicted = Array.isArray(output) ? output[0] : output;
    const actual = Array.isArray(sample.output) ? sample.output[0] : sample.output;

    const predictedLabel = predicted > 0.5 ? 1 : 0;
    if (predictedLabel === actual) {
      correct++;
    }
  });

  return correct / testSet.length;
}

/**
 * Calcula accuracy para Red Mayor (multi-class)
 */
function calculateMultiClassAccuracy(net, testSet) {
  let correct = 0;

  testSet.forEach(sample => {
    const output = net.run(sample.input);
    const predicted = output.indexOf(Math.max(...output));
    const actual = sample.output.indexOf(Math.max(...sample.output));

    if (predicted === actual) {
      correct++;
    }
  });

  return correct / testSet.length;
}

/**
 * Genera confusion matrix
 */
function generateConfusionMatrix(net, testSet) {
  const matrix = {
    humano: { humano: 0, ia_generado: 0, editado: 0 },
    ia_generado: { humano: 0, ia_generado: 0, editado: 0 },
    editado: { humano: 0, ia_generado: 0, editado: 0 }
  };

  const labels = [CATEGORIAS.HUMANO, CATEGORIAS.IA_GENERADO, CATEGORIAS.EDITADO];

  testSet.forEach(sample => {
    const output = net.run(sample.input);
    const predictedIdx = output.indexOf(Math.max(...output));
    const actualIdx = sample.output.indexOf(Math.max(...sample.output));

    const predicted = labels[predictedIdx];
    const actual = labels[actualIdx];

    matrix[actual][predicted]++;
  });

  return matrix;
}

// =============================================================================
// ENTRENAMIENTO SMALL NNS
// =============================================================================

/**
 * Entrena una Small NN
 */
async function trainSmallNN(name, index, trainSet, testSet) {
  const startTime = performance.now();

  dragon.respira(
    `Entrenando Small NN: ${name}`,
    NOMBRE_MODULO,
    'TRAIN_SMALL_NN_START',
    {
      name,
      index,
      trainSamples: trainSet.length,
      testSamples: testSet.length
    }
  );

  // Crear red neuronal
  const net = new brain.NeuralNetwork({
    hiddenLayers: [16, 8],
    activation: 'sigmoid',
    learningRate: TRAINING_CONFIG.smallNN.learningRate
  });

  // Preparar datos
  const trainData = datasetToSmallNNFormat(trainSet, index);
  const testData = datasetToSmallNNFormat(testSet, index);

  // Entrenar
  const stats = net.train(trainData, TRAINING_CONFIG.smallNN);

  // Evaluar
  const testAccuracy = calculateAccuracy(net, testData);

  const duration = performance.now() - startTime;

  dragon.sonrie(
    `Small NN ${name} entrenada`,
    NOMBRE_MODULO,
    'TRAIN_SMALL_NN_SUCCESS',
    {
      name,
      index,
      iterations: stats.iterations,
      error: Math.round(stats.error * 10000) / 10000,
      testAccuracy: Math.round(testAccuracy * 100) + '%',
      duration: Math.round(duration / 1000) + 's'
    }
  );

  // Guardar modelo
  saveModel(net, name);

  return {
    name,
    net,
    stats,
    testAccuracy,
    duration
  };
}

/**
 * Entrena todas las Small NNs en paralelo
 */
async function trainAllSmallNNs(trainSet, testSet) {
  const startTime = performance.now();

  dragon.respira(
    'Entrenando 10 Small NNs en paralelo',
    NOMBRE_MODULO,
    'TRAIN_ALL_SMALL_NNS_START',
    {
      specialists: SPECIALIST_NAMES.length,
      trainSamples: trainSet.length,
      testSamples: testSet.length
    }
  );

  const promises = SPECIALIST_NAMES.map((name, index) =>
    trainSmallNN(name, index, trainSet, testSet)
  );

  const results = await Promise.all(promises);

  const duration = performance.now() - startTime;

  const avgAccuracy = results.reduce((sum, r) => sum + r.testAccuracy, 0) / results.length;

  dragon.sonrie(
    '10 Small NNs entrenadas exitosamente',
    NOMBRE_MODULO,
    'TRAIN_ALL_SMALL_NNS_SUCCESS',
    {
      specialists: results.length,
      avgAccuracy: Math.round(avgAccuracy * 100) + '%',
      duration: Math.round(duration / 1000) + 's',
      results: results.map(r => ({
        name: r.name,
        accuracy: Math.round(r.testAccuracy * 100) + '%'
      }))
    }
  );

  return results;
}

// =============================================================================
// ENTRENAMIENTO RED MAYOR
// =============================================================================

/**
 * Genera scores de Small NNs para dataset
 */
function generateSmallNNScores(smallNNs, dataset) {
  return dataset.map(sample => {
    const scores = [];
    SPECIALIST_NAMES.forEach((name, index) => {
      const specialist = smallNNs.find(s => s.name === name);
      const startIdx = index * 9;
      const endIdx = startIdx + 9;
      const input = sample.features.slice(startIdx, endIdx);
      const output = specialist.net.run(input);
      const score = Array.isArray(output) ? output[0] : output;
      scores.push(score);
    });
    return { scores, localAnalyzers: sample.localAnalyzers };
  });
}

/**
 * Entrena Red Mayor
 */
async function trainRedMayor(smallNNs, trainSet, testSet) {
  const startTime = performance.now();

  dragon.respira(
    'Entrenando Red Mayor (ensemble)',
    NOMBRE_MODULO,
    'TRAIN_RED_MAYOR_START',
    {
      inputSize: 20,
      hiddenLayers: [64, 32],
      outputSize: 3,
      trainSamples: trainSet.length,
      testSamples: testSet.length
    }
  );

  // Crear red neuronal
  const net = new brain.NeuralNetwork({
    hiddenLayers: [64, 32],
    activation: 'sigmoid',
    learningRate: TRAINING_CONFIG.redMayor.learningRate
  });

  // Generar scores de Small NNs + analizadores locales para todo el dataset
  dragon.zen(
    'Generando scores Small NNs y analizadores locales para Red Mayor',
    NOMBRE_MODULO,
    'GENERATE_SMALL_NN_SCORES',
    {
      trainSamples: trainSet.length,
      testSamples: testSet.length
    }
  );

  // trainSmallNNScores es un array de objetos { scores, localAnalyzers }
  const trainSmallNNScores = generateSmallNNScores(smallNNs, trainSet);
  const testSmallNNScores = generateSmallNNScores(smallNNs, testSet);

  // Preparar datos de entrenamiento: input de 20 features (10 scores + 10 localAnalyzers)
  const trainData = trainSet.map((sample, idx) => {
    const { scores, localAnalyzers } = trainSmallNNScores[idx];
    const input = [...scores, ...localAnalyzers]; // 20 features
    const output = sample.label === CATEGORIAS.HUMANO ? [1, 0, 0] :
                   sample.label === CATEGORIAS.IA_GENERADO ? [0, 1, 0] :
                   [0, 0, 1];
    return { input, output };
  });

  // Preparar datos de test (mismo formato)
  const testData = testSet.map((sample, idx) => {
    const { scores, localAnalyzers } = testSmallNNScores[idx];
    const input = [...scores, ...localAnalyzers];
    const output = sample.label === CATEGORIAS.HUMANO ? [1, 0, 0] :
                   sample.label === CATEGORIAS.IA_GENERADO ? [0, 1, 0] :
                   [0, 0, 1];
    return { input, output };
  });

  // Entrenar
  const stats = net.train(trainData, TRAINING_CONFIG.redMayor);

  // Evaluar
  const testAccuracy = calculateMultiClassAccuracy(net, testData);
  const confusionMatrix = generateConfusionMatrix(net, testData);

  const duration = performance.now() - startTime;

  dragon.sonrie(
    'Red Mayor entrenada exitosamente',
    NOMBRE_MODULO,
    'TRAIN_RED_MAYOR_SUCCESS',
    {
      iterations: stats.iterations,
      error: Math.round(stats.error * 10000) / 10000,
      testAccuracy: Math.round(testAccuracy * 100) + '%',
      duration: Math.round(duration / 1000) + 's',
      confusionMatrix
    }
  );

  // Guardar modelo
  saveModel(net, 'red_mayor');

  return {
    net,
    stats,
    testAccuracy,
    confusionMatrix,
    duration
  };
}

// =============================================================================
// MAIN TRAINING PIPELINE
// =============================================================================

/**
 * Pipeline completo de entrenamiento
 */
async function trainPipeline() {
  const pipelineStartTime = performance.now();

  dragon.sonrie(
    '🚀 Iniciando pipeline de entrenamiento Dragon3 Red Superior',
    NOMBRE_MODULO,
    'TRAIN_PIPELINE_START',
    {
      version: VERSION_MODULO,
      library: 'brain.js'
    }
  );

  try {
    // Asegurar directorio de modelos
    ensureDirectory(MODELS_DIR);

    // ========== PASO 1: GENERAR DATASET ==========
    dragon.respira(
      'PASO 1/6: Generando dataset sintético',
      NOMBRE_MODULO,
      'STEP_1_GENERATE_DATASET',
      {}
    );

    const dataset = generateDataset();
    const stats = getDatasetStats(dataset);

    dragon.zen(
      'Dataset generado',
      NOMBRE_MODULO,
      'DATASET_GENERATED',
      {
        totalSamples: stats.totalSamples,
        distribution: stats.labelDistribution,
        featureStats: stats.featureStats
      }
    );

    // ========== PASO 2: DIVIDIR DATASET ==========
    dragon.respira(
      'PASO 2/6: Dividiendo dataset (train/val/test)',
      NOMBRE_MODULO,
      'STEP_2_SPLIT_DATASET',
      {}
    );

    const { train, validation, test, metadata } = splitDataset(dataset);

    dragon.zen(
      'Dataset dividido',
      NOMBRE_MODULO,
      'DATASET_SPLIT',
      {
        train: metadata.train,
        validation: metadata.validation,
        test: metadata.test,
        ratios: {
          train: metadata.trainRatio,
          val: metadata.valRatio,
          test: metadata.testRatio
        }
      }
    );

    // ========== PASO 3: ENTRENAR 10 SMALL NNS ==========
    dragon.respira(
      'PASO 3/6: Entrenando 10 Small NNs especializadas',
      NOMBRE_MODULO,
      'STEP_3_TRAIN_SMALL_NNS',
      {}
    );

    const smallNNs = await trainAllSmallNNs(train, test);

    // ========== PASO 4: ENTRENAR RED MAYOR ==========
    dragon.respira(
      'PASO 4/6: Entrenando Red Mayor (ensemble)',
      NOMBRE_MODULO,
      'STEP_4_TRAIN_RED_MAYOR',
      {}
    );

    const redMayor = await trainRedMayor(smallNNs, train, test);

    // ========== PASO 5: EVALUACIÓN FINAL ==========
    dragon.respira(
      'PASO 5/6: Evaluación final en test set',
      NOMBRE_MODULO,
      'STEP_5_FINAL_EVALUATION',
      {}
    );

    const finalResults = {
      smallNNs: {
        count: smallNNs.length,
        avgAccuracy: Math.round(
          (smallNNs.reduce((sum, s) => sum + s.testAccuracy, 0) / smallNNs.length) * 100
        ) + '%',
        individual: smallNNs.map(s => ({
          name: s.name,
          accuracy: Math.round(s.testAccuracy * 100) + '%'
        }))
      },
      redMayor: {
        accuracy: Math.round(redMayor.testAccuracy * 100) + '%',
        confusionMatrix: redMayor.confusionMatrix
      }
    };

    dragon.zen(
      'Evaluación final completada',
      NOMBRE_MODULO,
      'FINAL_EVALUATION_COMPLETED',
      finalResults
    );

    // ========== PASO 6: GUARDAR RESUMEN ==========
    dragon.respira(
      'PASO 6/6: Guardando resumen de entrenamiento',
      NOMBRE_MODULO,
      'STEP_6_SAVE_SUMMARY',
      {}
    );

    const pipelineDuration = performance.now() - pipelineStartTime;

    const summary = {
      version: VERSION_MODULO,
      timestamp: new Date().toISOString(),
      dataset: {
        total: stats.totalSamples,
        distribution: stats.labelDistribution,
        splits: metadata
      },
      training: {
        smallNNs: {
          config: TRAINING_CONFIG.smallNN,
          results: smallNNs.map(s => ({
            name: s.name,
            iterations: s.stats.iterations,
            error: Math.round(s.stats.error * 10000) / 10000,
            testAccuracy: Math.round(s.testAccuracy * 100) + '%',
            duration: Math.round(s.duration / 1000) + 's'
          }))
        },
        redMayor: {
          config: TRAINING_CONFIG.redMayor,
          iterations: redMayor.stats.iterations,
          error: Math.round(redMayor.stats.error * 10000) / 10000,
          testAccuracy: Math.round(redMayor.testAccuracy * 100) + '%',
          confusionMatrix: redMayor.confusionMatrix,
          duration: Math.round(redMayor.duration / 1000) + 's'
        }
      },
      results: finalResults,
      totalDuration: Math.round(pipelineDuration / 1000) + 's'
    };

    const summaryPath = path.join(MODELS_DIR, 'training_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    dragon.sonrie(
      '✅ Pipeline de entrenamiento completado exitosamente',
      NOMBRE_MODULO,
      'TRAIN_PIPELINE_SUCCESS',
      {
        modelsDir: MODELS_DIR,
        totalDuration: summary.totalDuration,
        smallNNsAvgAccuracy: finalResults.smallNNs.avgAccuracy,
        redMayorAccuracy: finalResults.redMayor.accuracy,
        summaryPath
      }
    );

    return summary;

  } catch (error) {
    const pipelineDuration = performance.now() - pipelineStartTime;

    dragon.agoniza(
      'Error en pipeline de entrenamiento',
      error,
      NOMBRE_MODULO,
      'TRAIN_PIPELINE_ERROR',
      {
        error: error.message,
        stack: error.stack,
        duration: Math.round(pipelineDuration / 1000) + 's'
      }
    );

    throw error;
  }
}

// =============================================================================
// EXECUTION
// =============================================================================

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  trainPipeline()
    .then(summary => {
      console.log('\n✅ Entrenamiento completado exitosamente');
      console.log(`📊 Accuracy Red Mayor: ${summary.results.redMayor.accuracy}`);
      console.log(`⏱️  Duración total: ${summary.totalDuration}`);
      console.log(`📁 Modelos guardados en: ${MODELS_DIR}\n`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Error en entrenamiento:', error.message);
      process.exit(1);
    });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default trainPipeline;

export {
  trainSmallNN,
  trainAllSmallNNs,
  trainRedMayor,
  calculateAccuracy,
  calculateMultiClassAccuracy,
  generateConfusionMatrix
};

/**
 * ====================================================================
 * FIN DE ARCHIVO - trainModel.js COMPLETO
 * Dragon3 Training Script (Brain.js)
 * Versión: 1.0.0-FAANG-Training
 * Autor: Gustavo Herráiz (@GustavoHerraiz)
 *
 * TRAINING PIPELINE:
 * ✅ Genera dataset sintético (100 samples)
 * ✅ Divide train/val/test (70/15/15)
 * ✅ Entrena 10 Small NNs en paralelo
 * ✅ Entrena Red Mayor (ensemble)
 * ✅ Evalúa en test set
 * ✅ Guarda modelos en ./models/*.json
 * ✅ Genera training summary
 *
 * USO:
 * cd /var/www/Dragon3/backend/servicios/redSuperior
 * node trainModel.js
 * ====================================================================
 */
