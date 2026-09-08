/**
 * celula-features.js
 * ==================
 * Célula que extrae los 7 features de imagen:
 * 1. Raw Pixels (estadísticos)
 * 2. Color Histograms (RGB)
 * 3. DCT (alta frecuencia)
 * 4. HOG
 * 5. LBP
 * 6. GLCM
 * 7. Wavelet
 * 
 * Entrada: { payload: { buffer: base64, formato: 'jpg' } }
 * Salida: {
 *   resultado: { features: {...}, telemetria: {...} },
 *   exito: true/false
 * }
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const LAB_DIR = __dirname;

// Ruta al script Python
const PYTHON_SCRIPT = path.join(LAB_DIR, 'extractor_features_corregido.py');

export default async function celulaFeatures(entrada, contexto) {
  const t0 = performance.now();
  const buffer = entrada?.payload?.buffer;
  
  if (!buffer) {
    return {
      resultado: null,
      exito: false,
      error: 'No se recibió buffer',
      telemetria: { tiempoTotal: performance.now() - t0 }
    };
  }

  // 1. Guardar imagen temporal
  const tempFile = path.join(LAB_DIR, `temp_${Date.now()}.jpg`);
  try {
    fs.writeFileSync(tempFile, Buffer.from(buffer, 'base64'));
  } catch (e) {
    return {
      resultado: null,
      exito: false,
      error: `Error guardando imagen: ${e.message}`,
      telemetria: { tiempoTotal: performance.now() - t0 }
    };
  }

  // 2. Ejecutar Python
  try {
    const { stdout, stderr } = await execFileAsync('python3', [PYTHON_SCRIPT, tempFile], {
      timeout: 60000, // 60 segundos máximo
      maxBuffer: 1024 * 1024 * 10 // 10 MB
    });

    // 3. Parsear salida
    const resultado = JSON.parse(stdout);
    if (resultado.error) {
      throw new Error(resultado.error);
    }

    // 4. Limpiar archivo temporal
    fs.unlinkSync(tempFile);

    // 5. Extraer telemetría (incluida en el JSON)
    const telemetria = resultado._telemetria || {};
    telemetria.tiempoTotalCelula = performance.now() - t0;
    delete resultado._telemetria; // quitarla de los features

    return {
      resultado: {
        features: resultado,
        telemetria: telemetria
      },
      exito: true,
      telemetria: telemetria
    };

  } catch (error) {
    // Limpiar archivo
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    return {
      resultado: null,
      exito: false,
      error: `Error ejecutando extractor: ${error.message}`,
      telemetria: { tiempoTotal: performance.now() - t0 }
    };
  }
}
