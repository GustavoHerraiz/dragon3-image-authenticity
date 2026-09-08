/**
 * test_celula_completo.js
 * Test exhaustivo de la célula ML con telemetría completa,
 * extracción de features, predicción, comparación con etiqueta real.
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

// Para obtener la etiqueta real, usamos el JSON de prueba (si existe)
const JSON_PRUEBA_PATH = path.join(__dirname, '../test_mover/resultados/descarga_test.json');

async function testCompleto() {
  console.log('🧪 TEST COMPLETO DE CÉLULA ML\n');
  console.log('='.repeat(60));

  // 1. Cargar imagen
  console.log('\n📸 1. CARGANDO IMAGEN');
  const buffer = fs.readFileSync(IMAGEN_PATH);
  const base64 = buffer.toString('base64');
  console.log(`   Tamaño: ${buffer.length} bytes`);
  console.log(`   Ruta: ${IMAGEN_PATH}`);

  // 2. Buscar etiqueta real en el JSON de prueba (si existe)
  let etiquetaReal = null;
  if (fs.existsSync(JSON_PRUEBA_PATH)) {
    const data = JSON.parse(fs.readFileSync(JSON_PRUEBA_PATH, 'utf8'));
    // Buscar por nombre de archivo (prueba.jpg)
    for (const doc of data) {
      if (doc.nombreOriginal === 'prueba.jpg') {
        etiquetaReal = doc.comentarioFeedback || null;
        break;
      }
    }
  }
  console.log(`\n🏷️ Etiqueta real: ${etiquetaReal || 'No disponible'}`);

  // 3. Ejecutar la célula ML
  console.log('\n⏳ 3. EJECUTANDO CÉLULA ML...');
  const entrada = { payload: { buffer: base64 } };
  const t0 = performance.now();
  const resultado = await celulaML(entrada, {});
  const tiempoTotalTest = performance.now() - t0;

  // 4. Mostrar resultado y telemetría
  console.log('\n✅ 4. RESULTADO');
  console.log(`   exito: ${resultado.exito}`);
  if (resultado.error) {
    console.log(`   error: ${resultado.error}`);
  }

  const res = resultado.resultado || {};
  console.log(`   esIA: ${res.esIA}`);
  console.log(`   confianza: ${res.confianza}`);
  console.log(`   peso: ${res.peso}`);
  console.log(`   explicacion: ${res.explicacion}`);
  if (res.evidencias) {
    console.log(`   evidencias: ${res.evidencias.join(', ')}`);
  }

  // 5. Telemetría
  const tele = resultado.telemetria || {};
  console.log('\n⏱️ 5. TELEMETRÍA');
  console.log(`   Tiempo extracción (orquestador): ${(tele.tiempoExtraccion || 0).toFixed(2)} ms`);
  console.log(`   Tiempo predicción (modelo): ${(tele.tiempoPrediccion || 0).toFixed(2)} ms`);
  console.log(`   Tiempo total (célula): ${(tele.tiempoTotal || 0).toFixed(2)} ms`);
  console.log(`   Tiempo total (test): ${tiempoTotalTest.toFixed(2)} ms`);

  // 6. Comparar con etiqueta real (si existe)
  if (etiquetaReal) {
    const real = etiquetaReal.includes('IA') ? 'IA' : 'Humano';
    const pred = res.esIA ? 'IA' : 'Humano';
    const acierto = real === pred;
    console.log('\n🎯 6. COMPARACIÓN CON ETIQUETA REAL');
    console.log(`   Real: ${real}`);
    console.log(`   Pred: ${pred}`);
    console.log(`   Acierto: ${acierto ? '✅' : '❌'}`);
  }

  // 7. Log del orquestador (si se ha guardado)
  // Nota: La célula no devuelve logs, pero podemos habilitarlos en la célula si es necesario.

  console.log('\n' + '='.repeat(60));
  console.log('✅ TEST COMPLETADO');
}

testCompleto().catch(console.error);
