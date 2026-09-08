/**
 * TEST DE FLUJO COMPLETO (Embassy → Orquestador → generar-veredicto)
 * 
 * Sigue paso a paso el proceso que realiza el Embassy cuando recibe una petición:
 * 1. Carga el plan.
 * 2. Instancia el orquestador.
 * 3. Ejecuta el orquestador.
 * 4. Muestra el resultado final.
 * 
 * Registra cada paso con el archivo involucrado y el estado.
 * 
 * Ubicación: /opt/dragon3/dev/celulas/test/flujo_completo.js
 * Ejecución: node /opt/dragon3/dev/celulas/test/flujo_completo.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, '..');

// Archivos clave
const PLAN_PATH = path.join(BASE_DIR, 'planes/analizar-imagen-sin-ml.json');
const ORQUESTADOR_PATH = path.join(BASE_DIR, 'orquestador.js');
const GENERAR_VEREDICTO_PATH = path.join(BASE_DIR, 'celulas/generar-veredicto.js');
const AGENT_EMBASSY_PATH = path.join(BASE_DIR, 'agent-embassy.js');

// Log en archivo
const LOG_FILE = '/tmp/flujo_completo.log';
fs.writeFileSync(LOG_FILE, '');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

log('🚀 INICIO DEL TEST DE FLUJO COMPLETO');
log(`📂 Base: ${BASE_DIR}`);

// Declaramos `plan` en el ámbito superior
let plan = null;

// ============================================================
// PASO 1: Verificar archivos
// ============================================================
log('\n📂 PASO 1: Verificando archivos del sistema');
const archivos = [
  { nombre: 'Plan', ruta: PLAN_PATH },
  { nombre: 'Orquestador', ruta: ORQUESTADOR_PATH },
  { nombre: 'generar-veredicto', ruta: GENERAR_VEREDICTO_PATH },
  { nombre: 'agent-embassy', ruta: AGENT_EMBASSY_PATH }
];

for (const archivo of archivos) {
  if (fs.existsSync(archivo.ruta)) {
    log(`   ✅ ${archivo.nombre}: ${archivo.ruta}`);
  } else {
    log(`   ❌ ${archivo.nombre}: NO EXISTE (${archivo.ruta})`);
    process.exit(1);
  }
}

// ============================================================
// PASO 2: Cargar el plan
// ============================================================
log('\n📄 PASO 2: Cargando plan');
try {
  const planContent = fs.readFileSync(PLAN_PATH, 'utf8');
  plan = JSON.parse(planContent);
  log(`   ✅ Plan cargado: "${plan.nombre}"`);
  log(`   📋 Células (${plan.células.length}): ${plan.células.map(c => c.id).join(', ')}`);
  // Verificar que generar-veredicto está en el plan
  const tieneGenerar = plan.células.some(c => c.id === 'generar-veredicto');
  if (tieneGenerar) {
    log('   ✅ generar-veredicto ENCONTRADA en el plan');
  } else {
    log('   ❌ generar-veredicto NO está en el plan');
    process.exit(1);
  }
} catch (error) {
  log(`   ❌ Error cargando plan: ${error.message}`);
  process.exit(1);
}

// ============================================================
// PASO 3: Importar el orquestador
// ============================================================
log('\n🔧 PASO 3: Importando orquestador');
let Orquestador;
try {
  const module = await import(ORQUESTADOR_PATH);
  Orquestador = module.default;
  log('   ✅ Orquestador importado correctamente');
} catch (error) {
  log(`   ❌ Error importando orquestador: ${error.message}`);
  process.exit(1);
}

// ============================================================
// PASO 4: Preparar entrada simulada
// ============================================================
log('\n📦 PASO 4: Preparando entrada simulada');
// Imagen PNG de 1x1 en base64
const entrada = {
  archivo: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  params: {},
  agentId: 'test-flujo',
  correlationId: 'flujo-test-123',
  nombreOriginal: 'test.png'
};
log('   ✅ Entrada preparada (PNG 1x1)');

// ============================================================
// PASO 5: Instanciar y ejecutar el orquestador
// ============================================================
log('\n🚀 PASO 5: Instanciando y ejecutando orquestador');
let resultado;
let orquestador;
try {
  orquestador = new Orquestador(plan);
  log('   ✅ Orquestador instanciado');
  log(`   📌 CorrelationId: ${orquestador.correlationId}`);
  log('   ⏳ Ejecutando orquestador...');
  const inicio = performance.now();
  resultado = await orquestador.ejecutar(entrada);
  const tiempo = performance.now() - inicio;
  log(`   ✅ Orquestador finalizado en ${tiempo.toFixed(2)}ms`);
} catch (error) {
  log(`   ❌ Error en orquestador: ${error.message}`);
  log(`   Stack: ${error.stack}`);
  process.exit(1);
}

// ============================================================
// PASO 6: Analizar resultados
// ============================================================
log('\n🔍 PASO 6: Analizando resultados');

// 6.1. Verificar que el resultado contiene generar-veredicto
const resultadoKeys = Object.keys(resultado.resultado || {});
log(`   📌 Claves en resultado: ${resultadoKeys.join(', ')}`);

// Buscar generar-veredicto (puede estar con guión o sin él)
const generarKey = resultadoKeys.find(k => k.includes('generar-veredicto'));
if (generarKey) {
  log(`   ✅ generar-veredicto ENCONTRADO en resultado (clave: ${generarKey})`);
  const data = resultado.resultado[generarKey];
  if (data && data.resultado) {
    log(`      esIA: ${data.resultado.esIA}`);
    log(`      confianza: ${data.resultado.confianza}`);
  } else {
    log('      ⚠️ El objeto generar-veredicto no tiene campo "resultado"');
  }
} else {
  log('   ❌ generar-veredicto NO está en el resultado');
}

// 6.2. Verificar telemetría
const teleKeys = resultado.telemetria.map(t => t.celulaId);
log(`   📌 Células en telemetria: ${teleKeys.join(', ')}`);
if (teleKeys.includes('generar-veredicto')) {
  log('   ✅ generar-veredicto ENCONTRADO en telemetria');
  const entry = resultado.telemetria.find(t => t.celulaId === 'generar-veredicto');
  log(`      exito: ${entry.exito}`);
  log(`      error: ${entry.error || 'ninguno'}`);
} else {
  log('   ❌ generar-veredicto NO está en telemetria');
}

// 6.3. Verificar el archivo /tmp/generar-veredicto.log
const logPath = '/tmp/generar-veredicto.log';
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf8').trim();
  log(`   ✅ /tmp/generar-veredicto.log existe: ${content}`);
} else {
  log('   ❌ /tmp/generar-veredicto.log NO existe (la célula no escribió el log)');
}

// ============================================================
// PASO 7: Resumen final
// ============================================================
log('\n📊 RESUMEN FINAL');
const exito = resultado.resultado && (generarKey || teleKeys.includes('generar-veredicto'));
if (exito) {
  log('✅ TEST SUPERADO: El flujo completo funciona correctamente.');
  log('   El orquestador ejecuta generar-veredicto y genera el resultado.');
  log('   El problema está en cómo el Embassy integra el orquestador.');
} else {
  log('❌ TEST FALLIDO: El flujo no funciona como se esperaba.');
  log('   generar-veredicto no se ejecuta o no se refleja en el resultado.');
}

log(`\n📄 Log completo en: ${LOG_FILE}`);
log('🏁 FIN DEL TEST');

// ============================================================
// Exportar resultado (opcional)
// ============================================================
export default { exito, resultado, orquestador };
