import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis'; // <--- Ponlo aquí arriba

import { registrarCasoDificil } from './data/entrenamiento_continuo.js';

// Logging
import dragon from '../../utilidades/logger.js';

// =============================================================================
// CONSTANTES Y CONFIGURACIÓN (MANTENIDO v2.1.0)
// =============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOMBRE_MODULO = 'redSuperiorSmallNN';
const VERSION_MODULO = '3.0.0-FAANG-ManualInference-Hybrid';
const MODELS_DIR = path.join(__dirname, 'models');

const CATEGORIAS = {
  HUMANO: 'humano',
  IA_GENERADO: 'ia_generado',
  EDITADO: 'editado'
};

const ARCHITECTURES = {
  smallNN: { inputSize: 9, hiddenLayers: [16, 8], outputSize: 1 },
  redMayor: { inputSize: 20, hiddenLayers: [64, 32], outputSize: 3 }
};

const SPECIALIST_NAMES = [
  'exif_camera', 'exif_editing', 'texture', 'gan_artifacts',
  'diffusion_artifacts', 'sharpness', 'compression', 'c2pa',
  'resolution', 'metadata'
];

// =============================================================================
// FUNCIÓN DE NORMALIZACIÓN PARA FEATURES (RANGO [0,1])
// =============================================================================
function normalizeFeatures(arr) {
  // Casos borde
  if (!arr || !Array.isArray(arr) || arr.length === 0) {
    return [];
  }
  
  // Filtrar valores no numéricos y convertir a número
  const numericValues = arr.map(v => {
    const num = parseFloat(v);
    return isNaN(num) ? 0 : num;
  });
  
  // Calcular min y max
  let min = Infinity;
  let max = -Infinity;
  for (const val of numericValues) {
    if (val < min) min = val;
    if (val > max) max = val;
  }
  
  // Si todos los valores son iguales (o rango cero), devolver 0.5 para todos
  if (max === min || max - min < 1e-10) {
    return numericValues.map(() => 0.5);
  }
  
  // Normalizar al rango [0,1]
  return numericValues.map(val => (val - min) / (max - min));
}

// Al final de la definición de normalizeFeatures, antes del singleton
global.normalizeFeatures = normalizeFeatures;

// =============================================================================
// CLASES DE ERROR (MANTENIDAS 100% v2.1.0)
// =============================================================================
class InferenceError extends Error {
  constructor(message, specialist, metadata = {}) {
    super(message);
    this.name = 'InferenceError';
    this.specialist = specialist;
    this.metadata = metadata;
  }
}

class FeatureValidationError extends Error {
  constructor(message, expectedLength, actualLength, metadata = {}) {
    super(message);
    this.name = 'FeatureValidationError';
    this.expectedLength = expectedLength;
    this.actualLength = actualLength;
    this.metadata = metadata;
  }
}

class ModelLoadError extends Error {
  constructor(message, modelName, metadata = {}) {
    super(message);
    this.name = 'ModelLoadError';
    this.modelName = modelName;
    this.metadata = metadata;
  }
}

// =============================================================================
// FUNCIONES DE UTILIDAD (FORWARD PASS MANUAL v3.0.0)
// =============================================================================
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function denseLayer(input, weights, biases) {
  const output = [];
  for (let i = 0; i < weights.length; i++) {
    let sum = biases[i];
    for (let j = 0; j < input.length; j++) {
      sum += input[j] * weights[i][j];
    }
    output.push(sigmoid(sum));
  }
  return output;
}

function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map(x => Math.exp(x - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  return expLogits.map(x => x / sumExp);
}



function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* [CODE] RED SUPERIOR (RS) - PROTOCOLO MBH v3.1
   Target: P95 < 200ms | Jerarquía: Datos > Inferencia
   Fix: Eliminado conflicto Bit 3 (Adobe/C2PA) y blindaje contra NaN.
*/

export class RedSuperiorSmallNN {
  constructor() {
    this.version = VERSION_MODULO;
    this.initialized = false;
    this.dictHerramientas = null;
    this.specialists = {};
    this.analysisClient = null;
    this.metrics = {
      totalPredictions: 0,
      totalErrors: 0,
      latencies: [],
      categoryDistribution: { humano: 0, ia_generated: 0, edited: 0 }
    };

    try {
      ensureDirectory(MODELS_DIR);

      const configPathAbsoluta = '/opt/dragon3/prod/Dragon3/backend/servicios/imagen/analizadores/imagen/analizadorHerramientasSospechosas.json';
      const configPathRelativa = path.join(__dirname, 'config', 'analizadorHerramientasSospechosas.json');
      const finalPath = fs.existsSync(configPathAbsoluta) ? configPathAbsoluta : configPathRelativa;

      if (fs.existsSync(finalPath)) {
        this.dictHerramientas = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
      }

      for (const name of SPECIALIST_NAMES) {
        this.specialists[name] = this._initSmallNN(name);
      }
      this.redMayor = this._initRedMayor();

      this.initialized = true;
      if (this.dictHerramientas) dragon.sonrie('RS SmallNN + Contexto MBH (Diccionario Cargado)', NOMBRE_MODULO);
    } catch (error) {
      dragon.agoniza('Error Crítico en Inicialización Red Superior', error, NOMBRE_MODULO);
      throw error;
    }
  }
  // Método para que el inicializador de PM2 le pase la conexión de la DB 1
  setAnalysisClient(client) {
    this.analysisClient = client;
    this.initialized = true;
    console.log("✅ Cliente de Análisis (DB 1) vinculado a RedSuperior");
  }

async predecirDesdeRedMayor(input20) {
  if (!this.redMayor) throw new Error('Red Mayor no inicializada');
  const output = this._forwardPass(input20, this.redMayor);
  // Aplicar softmax manual
  const max = Math.max(...output);
  const exps = output.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const scores = exps.map(x => x / sum);
  const idx = scores.indexOf(Math.max(...scores));
  const categorias = ['humano', 'ia_generado', 'editado'];
  return { categoria: categorias[idx], confianza: scores[idx], scores };
}

  _initSmallNN(name) {
    const modelPath = path.join(MODELS_DIR, `${name}.json`);
    const modelData = this.validateModelFile(modelPath, name);
    const parsed = this.parseBrainJSModel(modelData);
    return { ...parsed, name, initialized: true };
  }

  _initRedMayor() {
    const modelPath = path.join(MODELS_DIR, 'red_mayor.json');
    const modelData = this.validateModelFile(modelPath, 'red_mayor');
    const parsed = this.parseBrainJSModel(modelData);
    return { ...parsed, name: 'red_mayor', initialized: true };
  }

  validateModelFile(modelPath, name) {
    if (!fs.existsSync(modelPath)) throw new Error(`Model not found: ${name}`);
    return JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  }

  parseBrainJSModel(modelJSON) {
    const layers = [];
    if (!modelJSON.layers) throw new Error('Invalid model structure');
    for (const layer of modelJSON.layers) {
      const weights = [];
      const biases = [];
      if (layer.weights) {
        for (const neuron of layer.weights) weights.push(neuron);
        biases.push(...(layer.biases || []));
      } else if (Array.isArray(layer)) {
        for (const neuron of layer) {
          if (neuron.weights) {
            weights.push(neuron.weights);
            biases.push(neuron.bias || 0);
          }
        }
      }
      if (weights.length > 0) layers.push({ weights, biases });
    }
    return { layers, architecture: modelJSON.sizes };
  }

  _forwardPass(input, model) {
    if (!model || !model.layers) return [0.33, 0.34, 0.33];

    let current = [...input];
    try {
      for (const layer of model.layers) {
        // Soporte para ambos formatos: capa como objeto {weights, biases} o capa como array de neuronas
        const weights = layer.weights || layer;
        const biases = layer.biases || [];

        const nextActivation = [];
        for (let j = 0; j < weights.length; j++) {
          let sum = biases[j] || 0;
          const neuronWeights = weights[j].weights || weights[j]; // Soporte para niveles extra de anidación

          for (let k = 0; k < current.length; k++) {
            sum += current[k] * (neuronWeights[k] || 0);
          }
          // Sigmoide
          nextActivation.push(1 / (1 + Math.exp(-Math.max(-500, Math.min(500, sum)))));
        }
        current = nextActivation;
      }
      return current;
    } catch (e) {
      return [0.33, 0.34, 0.33];
    }
  }

  _generarVectorContextual(opciones) {
    const vCtx = [0, 0, 0, 0, 0];
    const contexto = opciones.contexto || opciones.herramientas || "";
    if (!contexto || !this.dictHerramientas) return vCtx;

    const str = (typeof contexto === 'string' ? contexto : JSON.stringify(contexto)).toLowerCase();
    const toArr = (val) => Array.isArray(val) ? val : (val ? [val] : []);

    const patronesIA = [...toArr(this.dictHerramientas.softwareGeneracionIA), ...toArr(this.dictHerramientas.marcasIA)];
    if (patronesIA.some(p => new RegExp(p, 'i').test(str))) vCtx[0] = 1;

    const patronesEdicion = [...toArr(this.dictHerramientas.softwareEdicion)];
    if (patronesEdicion.some(p => new RegExp(p, 'i').test(str))) vCtx[1] = 1;

    if (str.match(/(nikon|canon|sony|sensor|camera|apple|iphone)/i)) vCtx[2] = 1;
    if (str.match(/(c2pa|provenance|jumbf|content\.credentials)/i)) vCtx[3] = 1;
    if (str.match(/(truncado|anomal|manipulad)/i)) vCtx[4] = 1;

    return vCtx;
  }

  _splitFeatures(features, chunkSize) {
    const chunks = {};
    SPECIALIST_NAMES.forEach((name, i) => {
      chunks[name] = features.slice(i * chunkSize, (i + 1) * chunkSize);
    });
    return chunks;
  }

  async predecir(features, opciones = {}) {
  const startTime = Date.now();
  const NOMBRE_MODULO = 'redSuperior.js';

  if (!features || !Array.isArray(features) || features.length !== 90) {
  const errorMsg = `Features inválidos: esperado 90, recibido ${features?.length || 0}`;
  throw new Error(errorMsg);
}
  try {
    if (!this.initialized) await this.initialize();

    // 🔹 Asegurar que la función normalizeFeatures esté disponible
    // Si no está definida globalmente, la definimos localmente
    const normalize = (typeof normalizeFeatures === 'function')
      ? normalizeFeatures
      : (arr) => {
          if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
          const numeric = arr.map(v => (typeof v === 'number' && !isNaN(v)) ? v : 0);
          let min = Infinity, max = -Infinity;
          for (const v of numeric) { if (v < min) min = v; if (v > max) max = v; }
          if (max - min < 1e-10) return numeric.map(() => 0.5);
          return numeric.map(v => (v - min) / (max - min));
        };

    // 1. Inferencia Especialistas
    const chunks = this._splitFeatures(features, 10);
    const smallNNResults = SPECIALIST_NAMES.map((name) => {
      const rawData = chunks[name] || [];

      // Normalizar el chunk antes de pasarlo al especialista
      let input;
      try {
        input = normalize(rawData);
      } catch (e) {
        input = rawData; // fallback
      }

      const output = this._forwardPass(input, this.specialists[name]);
      const score = (Array.isArray(output) && !isNaN(output[0])) ? output[0] : 0.5;
      return { name, score };
    });

    // 2. Contexto (solo para bias de seguridad, no se inyecta en la red)
const vCtx = this._generarVectorContextual(opciones);
const localesBase = opciones.localAnalyzers || Array(10).fill(0.5);

// 3. Inferencia Red Mayor (entrada: 10 scores especialistas + 10 local analyzers)
const redMayorInput = [...smallNNResults.map(r => r.score), ...localesBase];
// 👇 LOG TEMPORAL PARA DEPURAR
if (process.env.DEBUG_INPUT === '1') {
  console.log('redMayorInput real:', redMayorInput.map(v => v.toFixed(4)).join(', '));
}
const redMayorOutput = this._forwardPass(redMayorInput, this.redMayor);
    // 4. Softmax (fallback manual)
    let scores;
    if (typeof softmax === 'function') {
      scores = softmax(redMayorOutput);
    } else {
      const max = Math.max(...redMayorOutput);
      const exps = redMayorOutput.map(x => Math.exp(x - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      scores = exps.map(x => x / sum);
    }

    // 5. Fallback por NaNs
    if (!scores || scores.some(s => isNaN(s))) {
      if (vCtx[2] === 1) scores = [0.85, 0.05, 0.10];
      else if (vCtx[1] === 1) scores = [0.10, 0.05, 0.85];
      else scores = [0.33, 0.34, 0.33];
    }

    // 6. BIAS DE SEGURIDAD MBH
    const esIAConfirmada = (vCtx[0] === 1 || vCtx[3] === 1);
    if (esIAConfirmada) scores = [0.00, 1.00, 0.00];

    // 7. Selección de categoría
    const maxScore = Math.max(...scores);
    const index = scores.indexOf(maxScore);
    const categoriasMap = [CATEGORIAS.HUMANO, CATEGORIAS.IA_GENERADO, CATEGORIAS.EDITADO];
    const categoria = categoriasMap[index] || CATEGORIAS.EDITADO;

    const latency = Date.now() - startTime;
    if (this.metrics) {
      this.metrics.totalPredictions++;
      this.metrics.latencies.push(latency);
    }

    return {
      categoria,
      confianza: maxScore,
      scores,
      metadata: { contextVector: vCtx, latency, biasApplied: esIAConfirmada }
    };

  } catch (err) {
    if (typeof dragon !== 'undefined') {
      dragon.agoniza('Error en predecir RS', err, NOMBRE_MODULO);
    } else {
      console.error(`[${NOMBRE_MODULO}] Error Crítico:`, err.message);
    }
    return { categoria: 'error_catch', confianza: 0, scores: [0.33, 0.34, 0.33] };
  }
}

  async optimizarPesos(dataset, epocas = 2000) {
    const NOMBRE_MODULO = 'redSuperior.js';
    const lr = 0.5; // Learning Rate agresivo para romper la inercia
    try {
      for (let i = 0; i < epocas; i++) {
        for (const dato of dataset) {
          let input = Array.isArray(dato.input) ? dato.input : (typeof dato.input === 'string' ? dato.input.split(',').map(Number) : null);
          let output = Array.isArray(dato.output) ? dato.output : (typeof dato.output === 'string' ? dato.output.split(',').map(Number) : null);
          if (!input || !output || input.length !== 15) continue;

          // 1. FORWARD PASS
          let activaciones = [[...input]];
          let current = [...input];
          for (const layer of this.redMayor.layers) {
            let next = [];
            for (let j = 0; j < layer.weights.length; j++) {
              let sum = (layer.biases[j] || 0);
              for (let k = 0; k < current.length; k++) sum += current[k] * layer.weights[j][k];
              next.push(1 / (1 + Math.exp(-Math.max(-500, Math.min(500, sum)))));
            }
            current = next;
            activaciones.push(current);
          }

          // 2. BACKPROPAGATION (Ajuste de todas las capas)
          let error = output.map((target, idx) => target - current[idx]);

          for (let l = this.redMayor.layers.length - 1; l >= 0; l--) {
            let layer = this.redMayor.layers[l];
            let prevActivations = activaciones[l];
            let nextError = new Array(prevActivations.length).fill(0);

            for (let j = 0; j < layer.weights.length; j++) {
              let d_error = error[j] * current[j] * (1 - current[j]); // Derivada sigmoide
              for (let k = 0; k < layer.weights[j].length; k++) {
                nextError[k] += layer.weights[j][k] * d_error;
                layer.weights[j][k] += lr * d_error * prevActivations[k];
              }
              layer.biases[j] += lr * d_error;
            }
            error = nextError;
            current = prevActivations;
          }
        }
      }
      fs.writeFileSync(path.join(MODELS_DIR, 'red_mayor.json'), JSON.stringify(this.redMayor, null, 2));
      return true;
    } catch (err) {
      console.error("🚨 FALLO CRÍTICO:", err.message);
      return false;
    }
  }

}
// 1. Instanciamos el Singleton para que todo el sistema comparta la misma red
const redSuperiorSingleton = new RedSuperiorSmallNN();

redSuperiorSingleton.normalizeFeatures = normalizeFeatures;


// =============================================================================
// INICIADOR DE WORKER INDEPENDIENTE (FIXED)
// =============================================================================
const iniciarModoWorker = async () => {
    try {
        console.log("🔍 [ML-WORKER] Verificando entorno...");

        // 1. IMPORTAMOS REDIS Y CREAMOS LA CONEXIÓN REAL

        const clientDB1 = new Redis({
    host: '127.0.0.1',
    port: 6379,
    db: 1,
    password: process.env.REDIS_PASSWORD
});

        // 2. LE PASAMOS LA CONEXIÓN AL SINGLETON USANDO TU NUEVO MÉTODO
        redSuperiorSingleton.setAnalysisClient(clientDB1);

        // 3. AHORA SÍ, ARRANCAMOS EL BUCLE
        console.log("🚀 ****************** ¡ESTOY USANDO EL NUEVO BUCLE! ******************");
        await bucleDeEscucha();

    } catch (err) {
        console.error("❌ Error crítico en el loop del Worker:", err);
        process.exit(1);
    }
};

async function bucleDeEscucha() {
    // IMPORTANTE: Asegúrate de que 'analysisClient' es el nombre real
    // del cliente que conectaste a la DB 1 en tu inicialización.
    const redis = redSuperiorSingleton.analysisClient;

    if (!redis) {
        throw new Error("No hay cliente Redis (analysisClient) disponible en el Singleton");
    }

    while (true) {
        try {
            const respuesta = await redis.xreadgroup(
                'GROUP', 'dragon3-superior-processors', `worker_${process.pid}`, // ID dinámico por proceso
                'COUNT', '1', 'BLOCK', '5000',
                'STREAMS', 'dragon3:stream:req:superior', '>'
            );

            if (!respuesta) continue;

            const [stream, mensajes] = respuesta[0];
            for (const [id, campos] of mensajes) {
                const data = {};
                for (let i = 0; i < campos.length; i += 2) data[campos[i]] = campos[i+1];

                // 🎯 LA LÓGICA DE NEGOCIO
                const features = data.payload ? JSON.parse(data.payload).features : [];
                const resultado = await redSuperiorSingleton.predecir(features, { contexto: data.payload });

                // 📤 LA VUELTA (El XLEN que antes daba 0)
                if (data.respStream) {
                    await redis.xadd(data.respStream, '*',
                        'archivoId', data.archivoId || 'no-id',
                        'resultado', JSON.stringify(resultado),
                        'correlationId', data.correlationId || ''
                    );
                    console.log(`✅ Respuesta enviada a ${data.respStream} [ID: ${id}]`);
                }

                // 🏁 EL CIERRE (Saca el mensaje de PENDING)
                await redis.xack('dragon3:stream:req:superior', 'dragon3-superior-processors', id);
            }
        } catch (err) {
            console.error("❌ Error en bucle de lectura:", err);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Evita bucle infinito de errores
        }
    }
}

// Disparador del Worker
if (import.meta.url.includes(process.argv[1]) || process.env.DRAGON_MODE === 'worker') {
    iniciarModoWorker();
}

// =============================================================================
// EXPORTS (COMPATIBILIDAD TOTAL MBH)
// =============================================================================

export { normalizeFeatures };

// 2. Exportación por defecto (La que pedía el SyntaxError)
export default redSuperiorSingleton;

// 3. Exportaciones nombradas (Para desestructuración y utilidades)
export {
    redSuperiorSingleton as redSuperior,
    RedSuperiorSmallNN as redSuperiorExport,
    CATEGORIAS,
    ARCHITECTURES,
    SPECIALIST_NAMES,
    InferenceError,
    FeatureValidationError,
    ModelLoadError
};
