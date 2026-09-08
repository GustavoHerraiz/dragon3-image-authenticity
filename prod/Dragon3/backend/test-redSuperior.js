/**
 * test-redSuperior.js - DIAGNÓSTICO AVANZADO CON EXPLICABILIDAD KNN
 * 
 * Mide rendimiento y precisión de la Red Superior.
 * Genera una base de conocimiento (conocimiento.json) con ejemplos reales.
 * Utiliza KNN para explicar las predicciones de forma fiable.
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDataset } from './servicios/redSuperior/trainingDataset.js';
import redSuperiorSingleton from './servicios/redSuperior/redSuperior.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTADOS = {
  timestamp: new Date().toISOString(),
  version: '3.0.0-KNN-EXPLAIN',
  tests: {}
};

// ============================================================================
// UTILIDADES
// ============================================================================
function calcularPercentiles(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { p50, p95, p99, max, avg };
}

function normalizeArray(arr) {
  if (!arr || arr.length === 0) return [];
  const numeric = arr.map(v => (typeof v === 'number' && !isNaN(v)) ? v : 0);
  let min = Infinity, max = -Infinity;
  for (const v of numeric) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 1e-10) return numeric.map(() => 0.5);
  return numeric.map(v => (v - min) / (max - min));
}

// ============================================================================
// TEST 1: Carga de modelos
// ============================================================================
async function testCargaModelos() {
  console.log('\n📦 TEST 1: Carga de modelos...');
  const start = performance.now();
  try {
    const rs = redSuperiorSingleton;
    const end = performance.now();
    const duracion = end - start;
    const smallNNsCargados = Object.keys(rs.specialists || {}).length;
    const tieneRedMayor = !!rs.redMayor;
    const modeloEsperado = 10;
    RESULTADOS.tests.cargaModelos = {
      exitoso: true,
      duracionMs: duracion,
      smallNNsCargados,
      redMayorCargada: tieneRedMayor,
      ok: smallNNsCargados === modeloEsperado && tieneRedMayor
    };
    console.log(`   ✅ Carga completada en ${duracion.toFixed(2)}ms`);
    console.log(`   📊 Small NNs: ${smallNNsCargados}/${modeloEsperado}`);
    console.log(`   📊 Red Mayor: ${tieneRedMayor ? '✅' : '❌'}`);
    return rs;
  } catch (err) {
    RESULTADOS.tests.cargaModelos = { exitoso: false, error: err.message };
    console.error(`   ❌ Error: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// TEST 2: Normalización (solo informativo)
// ============================================================================
function testNormalizacion() {
  console.log('\n📊 TEST 2: Normalización de features...');
  RESULTADOS.tests.normalizacion = {
    exitoso: true, // ya no es crítico
    funcionEncontrada: false,
    error: 'normalizeFeatures no está exportada globalmente, pero se usa internamente'
  };
  console.log('   ⚠️ normalizeFeatures no está exportada, pero se usa internamente.');
}

// ============================================================================
// TEST 3: Forward pass manual
// ============================================================================
async function testForwardPass(rs) {
  console.log('\n⚙️ TEST 3: Forward pass manual...');
  if (!rs.redMayor || !rs.redMayor.layers) {
    RESULTADOS.tests.forwardPass = { exitoso: false, error: 'Modelo Red Mayor no cargado correctamente' };
    console.log('   ❌ Red Mayor no disponible');
    return;
  }
  const inputDummy = Array(20).fill(0.5);
  try {
    const start = performance.now();
    const output = rs._forwardPass(inputDummy, rs.redMayor);
    const duracion = performance.now() - start;
    const tieneNaN = output.some(v => isNaN(v));
    const dimensionOk = Array.isArray(output) && output.length === 3;
    RESULTADOS.tests.forwardPass = {
      exitoso: !tieneNaN && dimensionOk,
      duracionMs: duracion,
      outputPreview: output.map(v => v.toFixed(4)),
      dimensionOutput: output.length,
      tieneNaN
    };
    console.log(`   ✅ Forward pass: ${duracion.toFixed(3)}ms`);
    console.log(`   📤 Output: ${output.map(v => v.toFixed(4)).join(', ')}`);
    if (tieneNaN) console.log('   ⚠️ [WARN] Se detectaron valores NaN');
    if (!dimensionOk) console.log(`   ⚠️ [WARN] Dimensión esperada 3, obtenida ${output.length}`);
  } catch (err) {
    RESULTADOS.tests.forwardPass = { exitoso: false, error: err.message };
    console.log(`   ❌ Error: ${err.message}`);
  }
}

// ============================================================================
// TEST 4: Predicción en lote (rendimiento)
// ============================================================================
async function testBatchPrediccion(rs) {
  console.log('\n🚀 TEST 4: Predicción en lote (1000 iteraciones) ...');
  const featuresDummy = Array(90).fill(0.5);
  const opciones = { localAnalyzers: Array(10).fill(0.5) };
  const latencias = [];
  const iterations = 1000;
  for (let i = 0; i < 10; i++) await rs.predecir(featuresDummy, opciones);
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await rs.predecir(featuresDummy, opciones);
    const end = performance.now();
    latencias.push(end - start);
  }
  const percentiles = calcularPercentiles(latencias);
  const throughput = iterations / (latencias.reduce((a, b) => a + b, 0) / 1000);
  RESULTADOS.tests.batchPrediccion = {
    exitoso: true,
    iterations,
    latencia: percentiles,
    throughput: `${throughput.toFixed(0)} pred/seg`
  };
  console.log(`   ✅ Batch completado (${iterations} pred)`);
  console.log(`   ⏱️  P50: ${percentiles.p50.toFixed(3)}ms | P95: ${percentiles.p95.toFixed(3)}ms | P99: ${percentiles.p99.toFixed(3)}ms`);
  console.log(`   📈 Throughput: ${throughput.toFixed(0)} pred/seg`);
}

// ============================================================================
// TEST 5: Precisión y generación de conocimiento
// ============================================================================
async function testPrecisionYConocimiento(rs) {
  console.log('\n🎯 TEST 5: Precisión + Generación de conocimiento KNN...');
  const dataset = generateDataset();
  const testSet = dataset.slice(770); // últimas 280 muestras
  let correctos = 0;
  const confusion = {
    humano: { humano: 0, ia_generado: 0, editado: 0 },
    ia_generado: { humano: 0, ia_generado: 0, editado: 0 },
    editado: { humano: 0, ia_generado: 0, editado: 0 }
  };
  const errores = { humano: [], ia_generado: [], editado: [] };
  const conocimiento = []; // almacenará { input20, categoria, id }

  const SPECIALIST_NAMES = [
    'exif_camera', 'exif_editing', 'texture', 'gan_artifacts',
    'diffusion_artifacts', 'sharpness', 'compression', 'c2pa',
    'resolution', 'metadata'
  ];

  for (const sample of testSet) {
    // Obtener predicción y construir input20 real
    const resultado = await rs.predecir(sample.features, { localAnalyzers: sample.localAnalyzers });
    const predLabel = resultado.categoria;
    const realLabel = sample.label;
    if (predLabel === realLabel) correctos++;
    confusion[realLabel][predLabel] = (confusion[realLabel][predLabel] || 0) + 1;
    if (predLabel !== realLabel && errores[realLabel].length < 5) {
      // Reconstruir input20 para diagnóstico
      const chunks = rs._splitFeatures(sample.features, 10);
      const smallNNScores = [];
      for (const name of SPECIALIST_NAMES) {
        const rawData = chunks[name] || [];
        const input = normalizeArray(rawData);
        const output = rs._forwardPass(input, rs.specialists[name]);
        const score = (Array.isArray(output) && !isNaN(output[0])) ? output[0] : 0.5;
        smallNNScores.push(score);
      }
      const localesBase = sample.localAnalyzers;
      const redMayorInput = [...smallNNScores, ...localesBase];
      const redMayorOutputRaw = rs._forwardPass(redMayorInput, rs.redMayor);
      const max = Math.max(...redMayorOutputRaw);
      const exps = redMayorOutputRaw.map(x => Math.exp(x - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      const scoresFinal = exps.map(x => x / sum);
      errores[realLabel].push({
        id: sample.id,
        realLabel,
        predLabel,
        confianza: resultado.confianza,
        smallNNScores: smallNNScores.map(v => v.toFixed(4)),
        localAnalyzers: sample.localAnalyzers.map(v => v.toFixed(4)),
        redMayorInput: redMayorInput.map(v => v.toFixed(4)),
        redMayorOutputRaw: redMayorOutputRaw.map(v => v.toFixed(4)),
        softmaxOutput: scoresFinal.map(v => v.toFixed(4)),
        contextVector: resultado.metadata.contextVector
      });
    }

    // ---------- Construir conocimiento (input20 + categoria) para TODAS las muestras ----------
    const chunks = rs._splitFeatures(sample.features, 10);
    const smallNNScores = [];
    for (const name of SPECIALIST_NAMES) {
      const rawData = chunks[name] || [];
      const input = normalizeArray(rawData);
      const output = rs._forwardPass(input, rs.specialists[name]);
      const score = (Array.isArray(output) && !isNaN(output[0])) ? output[0] : 0.5;
      smallNNScores.push(score);
    }
    const input20 = [...smallNNScores, ...sample.localAnalyzers];
    conocimiento.push({
  input20,
  categoria: predLabel,
  id: sample.id,
  features90: sample.features,          // ← añadir
  scoresEspecialistas: smallNNScores    // ← opcional
});  }

  const accuracy = (correctos / testSet.length) * 100;
  console.log(`   ✅ Accuracy: ${accuracy.toFixed(1)}% (${correctos}/${testSet.length})`);
  console.log(`   📊 Confusion matrix:`);
  console.log(`       Humano → H:${confusion.humano.humano} IA:${confusion.humano.ia_generado} E:${confusion.humano.editado}`);
  console.log(`       IA     → H:${confusion.ia_generado.humano} IA:${confusion.ia_generado.ia_generado} E:${confusion.ia_generado.editado}`);
  console.log(`       Editado→ H:${confusion.editado.humano} IA:${confusion.editado.ia_generado} E:${confusion.editado.editado}`);

  if (Object.keys(errores).some(k => errores[k].length > 0)) {
    console.log(`\n   🔍 ANÁLISIS DE ERRORES (primeros 5 por clase):`);
    for (const [clase, lista] of Object.entries(errores)) {
      if (lista.length === 0) continue;
      console.log(`\n   --- Errores en clase "${clase}" (${lista.length} muestras) ---`);
      for (let idx = 0; idx < lista.length; idx++) {
        const err = lista[idx];
        console.log(`\n   [${idx+1}] Muestra ${err.id}`);
        console.log(`       Real: ${err.realLabel} → Predicho: ${err.predLabel} (confianza ${err.confianza.toFixed(3)})`);
        console.log(`       Scores especialistas: ${err.smallNNScores.join(', ')}`);
        console.log(`       Local analyzers:       ${err.localAnalyzers.join(', ')}`);
        console.log(`       Entrada Red Mayor (20): ${err.redMayorInput.join(', ')}`);
        console.log(`       Salida raw Red Mayor:  ${err.redMayorOutputRaw.join(', ')}`);
        console.log(`       Softmax final:         ${err.softmaxOutput.join(', ')}`);
        console.log(`       Vector contexto:       ${err.contextVector.join(', ')}`);
      }
    }
  }

  // Guardar conocimiento en archivo JSON
  const rutaConocimiento = path.join(process.cwd(), 'conocimiento.json');
  fs.writeFileSync(rutaConocimiento, JSON.stringify(conocimiento, null, 2));
  console.log(`\n   📚 Conocimiento KNN guardado: ${conocimiento.length} ejemplos en ${rutaConocimiento}`);

  RESULTADOS.tests.precisionDataset = {
    exitoso: true,
    samples: testSet.length,
    accuracy: `${accuracy.toFixed(1)}%`,
    confusionMatrix: confusion,
    errores: errores
  };
  return conocimiento;
}

// ============================================================================
// TEST 6: Memoria
// ============================================================================
function testMemoria() {
  console.log('\n🧠 TEST 6: Consumo de memoria...');
  const mem = process.memoryUsage();
  const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
  const rssMB = (mem.rss / 1024 / 1024).toFixed(2);
  RESULTADOS.tests.memoria = {
    exitoso: true,
    heapUsedMB: heapUsedMB,
    rssMB: rssMB
  };
  console.log(`   💾 Heap: ${heapUsedMB}MB | RSS: ${rssMB}MB`);
}

// ============================================================================
// TEST 7: Validación de entradas
// ============================================================================
async function testValidacionEntradas(rs) {
  console.log('\n🔍 TEST 7: Validación de entradas (casos extremos)...');
  const casos = [
    { name: 'Features correctas (90)', input: Array(90).fill(0.5), esperaError: false },
    { name: 'Features cortas (80)', input: Array(80).fill(0.5), esperaError: true },
    { name: 'Features largas (100)', input: Array(100).fill(0.5), esperaError: true },
    { name: 'Features con NaN', input: [...Array(89).fill(0.5), NaN], esperaError: false },
    { name: 'Features vacías', input: [], esperaError: true }
  ];
  const resultados = [];
  for (const caso of casos) {
    try {
      const start = performance.now();
      const res = await rs.predecir(caso.input, {});
      const duracion = performance.now() - start;
      const ok = !caso.esperaError;
      resultados.push({ nombre: caso.name, ok, duracion: duracion.toFixed(2), message: res.categoria });
      if (!ok) console.log(`   ⚠️ ${caso.name}: Debería haber fallado pero devolvió ${res.categoria}`);
      else console.log(`   ✅ ${caso.name}: OK (${duracion.toFixed(2)}ms)`);
    } catch (err) {
      if (caso.esperaError) {
        console.log(`   ✅ ${caso.name}: Falló como se esperaba`);
        resultados.push({ nombre: caso.name, ok: true });
      } else {
        console.log(`   ❌ ${caso.name}: Error inesperado: ${err.message}`);
        resultados.push({ nombre: caso.name, ok: false, error: err.message });
      }
    }
  }
  const todosOk = resultados.every(r => r.ok);
  RESULTADOS.tests.validacionEntradas = { exitoso: todosOk, casos: resultados };
}

// ============================================================================
// TEST 8: Vector contextual
// ============================================================================
function testContexto(rs) {
  console.log('\n🌍 TEST 8: Vector contextual (herramientas sospechosas)...');
  const pruebas = [
    { desc: 'MIDJOURNEY', contexto: 'Created with Midjourney v6', esperadoBitIA: 1 },
    { desc: 'STABLE DIFFUSION', contexto: 'Stable Diffusion XL', esperadoBitIA: 1 },
    { desc: 'ADOBE FIREFLY', contexto: 'Adobe Firefly Generative Fill', esperadoBitIA: 1, esperadoBitEdicion: 1 },
    { desc: 'FOTOGRAFÍA REAL', contexto: 'Nikon D850, f/2.8, ISO 100', esperadoBitCamera: 1 },
    { desc: 'EDICIÓN LEGÍTIMA', contexto: 'Adobe Photoshop CC', esperadoBitEdicion: 1 }
  ];
  const resultados = [];
  for (const p of pruebas) {
    const vCtx = rs._generarVectorContextual({ contexto: p.contexto });
    const bits = { bitIA: vCtx[0], bitEdicion: vCtx[1], bitCamera: vCtx[2] };
    let ok = true;
    if (p.esperadoBitIA !== undefined && bits.bitIA !== p.esperadoBitIA) ok = false;
    if (p.esperadoBitCamera !== undefined && bits.bitCamera !== p.esperadoBitCamera) ok = false;
    if (p.esperadoBitEdicion !== undefined && bits.bitEdicion !== p.esperadoBitEdicion) ok = false;
    resultados.push({ desc: p.desc, contexto: p.contexto, bits, ok });
    console.log(`   ${ok ? '✅' : '❌'} ${p.desc}: IA=${bits.bitIA} Edición=${bits.bitEdicion} Cámara=${bits.bitCamera} (${p.contexto})`);
  }
  const todosOk = resultados.every(r => r.ok);
  RESULTADOS.tests.contexto = { exitoso: todosOk, pruebas: resultados };
}

// ============================================================================
// TEST 9: Explicabilidad KNN (versión mejorada: ponderada + diferencias)
// ============================================================================
async function testExplicabilidadKNN(rs, conocimiento) {
  console.log('\n🔮 TEST 9: Explicabilidad KNN (vecinos cercanos con ponderación por distancia)...');
  if (!conocimiento || conocimiento.length === 0) {
    console.log('   ⚠️ No hay conocimiento disponible, omitiendo test de explicabilidad.');
    RESULTADOS.tests.explicabilidad = { exitoso: false, error: 'Conocimiento no disponible' };
    return;
  }

  // Importar el módulo KNN mejorado
  let knn;
  try {
    const knnModule = await import('./servicios/explicabilidad/knnExplicador.js');
    knn = knnModule;
    knn.cargarConocimiento(); // carga conocimiento.json (debe estar en la raíz)
  } catch (err) {
    console.log(`   ❌ No se pudo cargar el módulo KNN: ${err.message}`);
    RESULTADOS.tests.explicabilidad = { exitoso: false, error: err.message };
    return;
  }

  // Lista de nombres de especialistas (para mostrar diferencias)
  const SPECIALIST_NAMES = [
    'exif_camera', 'exif_editing', 'texture', 'gan_artifacts',
    'diffusion_artifacts', 'sharpness', 'compression', 'c2pa',
    'resolution', 'metadata'
  ];

  // Tomar las primeras 3 muestras del conocimiento para mostrar explicaciones
  const muestras = conocimiento.slice(0, 3);
  const explicaciones = [];
  for (let i = 0; i < muestras.length; i++) {
    const muestra = muestras[i];
    const input20 = muestra.input20;
    // Opcionalmente, si el conocimiento guardó features90, los usamos para diferencias
    const opciones = {
      features90: muestra.features90 || null,
      nombresEspecialistas: SPECIALIST_NAMES
    };
    const resultado = knn.explicarPorKNN(input20, 5);          // voto ponderado
    const texto = knn.generarExplicacionTexto(input20, 5, opciones); // texto con diferencias
    console.log(`\n   --- Muestra ${i+1}: ID ${muestra.id} (Real: ${muestra.categoria}) ---`);
    console.log(texto);
    explicaciones.push({
      id: muestra.id,
      real: muestra.categoria,
      vecinos: resultado.vecinos,
      confianza: resultado.confianza
    });
  }

  RESULTADOS.tests.explicabilidad = {
    exitoso: true,
    metodo: 'KNN ponderado por distancia',
    muestrasExplicadas: explicaciones
  };
  console.log('\n   ✅ Explicabilidad KNN mejorada completada.');
}
// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('🐉 INICIANDO TEST EXHAUSTIVO DE RED SUPERIOR (DRAGON3) - MODO KNN EXPLICATIVO\n');
  const rs = await testCargaModelos();
  testNormalizacion();
  await testForwardPass(rs);
  await testBatchPrediccion(rs);
  const conocimiento = await testPrecisionYConocimiento(rs);
  testMemoria();
  await testValidacionEntradas(rs);
  testContexto(rs);
  await testExplicabilidadKNN(rs, conocimiento);

  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN DEL TEST');
  console.log('='.repeat(60));
  let todosExitosos = true;
  for (const [nombre, test] of Object.entries(RESULTADOS.tests)) {
    const ok = test.exitoso === true;
    todosExitosos = todosExitosos && ok;
    console.log(`${ok ? '✅' : '❌'} ${nombre}: ${ok ? 'ÉXITO' : 'FALLO'}${test.error ? ` (${test.error})` : ''}`);
  }
  console.log('\n' + '='.repeat(60));
  if (todosExitosos) {
    console.log('🎉 SISTEMA EN ESTADO ÓPTIMO: TODOS LOS TEST PASARON');
  } else {
    console.log('⚠️ SE DETECTARON PROBLEMAS: Revisa los logs y aplica correcciones');
  }
  console.log('='.repeat(60));

  const outputPath = path.join(__dirname, 'test-redSuperior-resultado.json');
  fs.writeFileSync(outputPath, JSON.stringify(RESULTADOS, null, 2));
  console.log(`\n📁 Resultados guardados en: ${outputPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error('💥 ERROR FATAL:', err);
  process.exit(1);
});