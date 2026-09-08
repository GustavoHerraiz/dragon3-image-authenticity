/**
 * test_celula_ml.js
 * Test completo de la célula ML con telemetría.
 * Mide tiempos de extracción, predicción y total.
 * Usa la imagen prueba.jpg de /opt/dragon3/dev/celulas.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar la célula ML
const celulaML = (await import('../celulas/celula-ml.js')).default;

// Ruta a la imagen de prueba
const IMAGEN_PATH = path.join(__dirname, '../prueba.jpg');

async function testCelulaML() {
  console.log('🧪 Iniciando test de célula ML...\n');

  // 1. Cargar imagen
  console.log('📸 Cargando imagen:', IMAGEN_PATH);
  const buffer = fs.readFileSync(IMAGEN_PATH);
  const base64 = buffer.toString('base64');
  console.log(`   Tamaño: ${buffer.length} bytes`);

  // 2. Ejecutar célula
  const entrada = { payload: { buffer: base64 } };
  const t0 = performance.now();
  const resultado = await celulaML(entrada, {});
  const tiempoTotal = performance.now() - t0;

  // 3. Mostrar resultados
  console.log('\n✅ RESULTADO:');
  console.log(`   esIA: ${resultado.resultado?.esIA}`);
  console.log(`   confianza: ${resultado.resultado?.confianza}`);
  console.log(`   explicacion: ${resultado.resultado?.explicacion}`);
  console.log(`   exito: ${resultado.exito}`);

  // 4. Mostrar telemetría
  console.log('\n⏱️ TELEMETRÍA:');
  const tele = resultado.telemetria || {};
  console.log(`   Tiempo extracción: ${(tele.tiempoExtraccion || 0).toFixed(2)} ms`);
  console.log(`   Tiempo predicción: ${(tele.tiempoPrediccion || 0).toFixed(2)} ms`);
  console.log(`   Tiempo total (célula): ${(tele.tiempoTotal || 0).toFixed(2)} ms`);
  console.log(`   Tiempo total (test): ${tiempoTotal.toFixed(2)} ms`);

  // 5. Verificar coherencia
  if (resultado.exito) {
    console.log('\n✅ Test completado con éxito.');
  } else {
    console.log('\n❌ Test falló.');
    if (resultado.error) console.log(`   Error: ${resultado.error}`);
  }
}

testCelulaML().catch(console.error);
