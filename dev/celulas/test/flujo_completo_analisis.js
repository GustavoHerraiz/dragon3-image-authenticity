/**
 * TEST DE FLUJO COMPLETO DE ANÁLISIS (versión servidor)
 * Usa FormData nativo (Node 18+)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, '..');
const LOG_FILE = '/tmp/flujo_completo_analisis.log';
fs.writeFileSync(LOG_FILE, '');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

log('🚀 INICIO TEST DE FLUJO COMPLETO (vía servidor)');

const imagePath = path.join(BASE_DIR, 'ai.png');
if (!fs.existsSync(imagePath)) {
  log(`❌ Imagen no encontrada: ${imagePath}`);
  process.exit(1);
}
log(`✅ Imagen cargada: ${imagePath}`);

log('\n📡 Llamando a http://localhost:3000/analizar-imagen-publico');
const form = new FormData();
form.append('archivo', fs.createReadStream(imagePath));

try {
  const response = await fetch('http://localhost:3000/analizar-imagen-publico', {
    method: 'POST',
    body: form
  });
  const text = await response.text();
  log(`📊 Status: ${response.status}`);
  log(`📄 Respuesta (primeros 500): ${text.substring(0, 500)}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    log(`❌ No se pudo parsear JSON: ${e.message}`);
    process.exit(1);
  }

  const decision = data.resumen?.decision || data.resultado?.decision || 'desconocido';
  const confianza = data.resumen?.confianza || data.resultado?.confianza || 'N/A';
  log(`✅ Decisión: ${decision}, Confianza: ${confianza}`);

  const ml = data.detalles?.analizadores?.ml || data.resultado?.detalles?.analizadores?.ml;
  if (ml) {
    log(`✅ ML presente: ${ml.evaluacion?.veredicto} (confianza: ${ml.evaluacion?.confianza})`);
  } else {
    log('⚠️ ML NO está presente en la respuesta');
  }

  if (decision === 'IA' || decision === 'ia') {
    log('🎉 ÉXITO: La imagen se clasifica como IA');
  } else {
    log('⚠️ La imagen se clasifica como humano o desconocido');
  }

} catch (error) {
  log(`❌ Error llamando al servidor: ${error.message}`);
}

log(`\n📄 Log guardado en: ${LOG_FILE}`);
