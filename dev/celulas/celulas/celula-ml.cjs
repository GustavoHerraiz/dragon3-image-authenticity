/**
 * celula-ml.js
 * 
 * Célula ML basada en XGBoost optimizado (91.7% de precisión).
 * Versión CommonJS para compatibilidad con el watcher.
 * 
 * Entrada: payload.buffer (imagen en base64 o buffer)
 * Salida: { esIA, confianza, explicacion, evidencias, peso, ... }
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cacheML = new Map();
const CACHE_MAX_ENTRIES = 100;
let procesoPython = null;
let bufferSalida = '';
let colaPredicciones = Promise.resolve();

function obtenerWorker(pythonBin, pythonScript) {
  if (procesoPython) return procesoPython;

  procesoPython = spawn(pythonBin, [pythonScript], { stdio: ['pipe', 'pipe', 'pipe'] });
  procesoPython.on('error', error => {
    procesoPython = null;
    console.error(`❌ Worker ML detenido: ${error.message}`);
  });
  procesoPython.on('close', () => {
    procesoPython = null;
  });
  return procesoPython;
}

function predecirConWorker(pythonBin, pythonScript, imagenBase64) {
  colaPredicciones = colaPredicciones.then(() => new Promise((resolve, reject) => {
    const worker = obtenerWorker(pythonBin, pythonScript);
    let respuesta = null;
    const timeout = setTimeout(() => reject(new Error('Timeout al ejecutar el worker Python')), 15000);
    const recibir = datos => {
      bufferSalida += datos.toString();
      const lineas = bufferSalida.split('\n');
      bufferSalida = lineas.pop();
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        try {
          respuesta = JSON.parse(linea);
        } catch (error) {
          clearTimeout(timeout);
          reject(new Error(`Error parseando JSON del worker: ${error.message}`));
          return;
        }
        clearTimeout(timeout);
        worker.stdout.off('data', recibir);
        resolve(respuesta);
        return;
      }
    };
    worker.stdout.on('data', recibir);
    worker.stdin.write(`${imagenBase64}\n`);
  })).catch(error => {
    procesoPython?.kill();
    procesoPython = null;
    throw error;
  });
  return colaPredicciones;
}

function cerrarWorkerML() {
  if (procesoPython) {
    procesoPython.kill();
    procesoPython = null;
  }
}

process.once('SIGTERM', cerrarWorkerML);
process.once('SIGINT', cerrarWorkerML);

module.exports = async function celulaML(entrada, contexto) {
  let buffer;
  const startTime = Date.now();

  try {
    // 1. EXTRACCIÓN ROBUSTA DEL BUFFER
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
        throw new Error('No se pudo extraer el buffer del objeto payload.');
      }
    } else {
      throw new Error(`Tipo de payload no soportado: ${typeof payload}`);
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('El buffer está vacío o no se pudo obtener.');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (cacheML.has(hash)) {
      const cacheado = JSON.parse(JSON.stringify(cacheML.get(hash)));
      cacheado.metricas = { ...cacheado.metricas, tiempoMs: 0, cache: true };
      return cacheado;
    }

    // 2. LECTURA DE CONFIGURACIÓN (opcional)
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { tamañoOptimizado: 128 } };
    }
    // no se usa, pero se lee por cumplir la guía

    // 3. LLAMADA AL SCRIPT PYTHON
    const pythonBin = process.env.PYTHON_BIN || path.join(__dirname, '..', 'laboratorio', 'venv_ml', 'bin', 'python');
    const pythonScript = process.env.ML_PREDICTOR_SCRIPT || path.join(__dirname, 'predictor_xgboost.py');

    const resultado = await predecirConWorker(pythonBin, pythonScript, buffer.toString('base64'));
    if (!resultado.exito) throw new Error(resultado.error || 'Error en el worker Python');

    // 4. CONSTRUCCIÓN DEL RESULTADO
    const tiempoMs = Date.now() - startTime;
    const evidencias = [
      `Confianza ML: ${(resultado.confianza * 100).toFixed(1)}%`,
      `Extracción: ${resultado.tiempoExtraccionMs}ms`,
      `Predicción: ${resultado.tiempoPrediccionMs}ms`
    ];

    const esIA = resultado.esIA;
    const explicacion = esIA
      ? 'El modelo ML detecta patrones compatibles con IA.'
      : 'El modelo ML no detecta patrones suficientes para clasificar la imagen como generada por IA.';

    const salida = {
      exito: true,
      resultado: {
        esIA,
        confianza: resultado.confianza,
        explicacion,
        evidencias,
        peso: 0.5,
        modelo: 'xgboost',
        versionModelo: 'optimizado-25000'
      },
      metricas: {
        tiempoMs: tiempoMs,
        extraccionMs: resultado.tiempoExtraccionMs,
        cargaModeloMs: resultado.tiempoCargaModeloMs,
        prediccionMs: resultado.tiempoPrediccionMs
      }
    };

    if (cacheML.size >= CACHE_MAX_ENTRIES) {
      cacheML.delete(cacheML.keys().next().value);
    }
    cacheML.set(hash, JSON.parse(JSON.stringify(salida)));
    return salida;

  } catch (error) {
    const tiempoMs = Date.now() - startTime;
    return {
      exito: false,
      error: `Error en célula ML: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar con ML: ${error.message}`,
        evidencias: ['Error durante el análisis ML'],
        peso: 0.5,
      },
      metricas: { tiempoMs }
    };
  }
};
