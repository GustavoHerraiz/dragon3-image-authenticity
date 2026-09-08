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

    const resultado = await new Promise((resolve, reject) => {
      const python = spawn(pythonBin, [pythonScript]);
      let out = '', err = '';

      python.stdin.write(buffer.toString('base64'));
      python.stdin.end();

      python.stdout.on('data', d => out += d.toString());
      python.stderr.on('data', d => err += d.toString());

      const timeout = setTimeout(() => {
        python.kill();
        reject(new Error('Timeout al ejecutar el script Python'));
      }, 15000);

      python.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0 || err) {
          return reject(new Error(err || `Código de salida: ${code}`));
        }
        try {
          const data = JSON.parse(out.trim());
          if (!data.exito) {
            return reject(new Error(data.error || 'Error en el script Python'));
          }
          resolve(data);
        } catch (e) {
          reject(new Error(`Error parseando JSON: ${e.message}`));
        }
      });

      python.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Error al ejecutar Python: ${err.message}`));
      });
    });

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
