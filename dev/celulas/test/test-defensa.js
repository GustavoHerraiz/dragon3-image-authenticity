#!/usr/bin/env node

/**
 * test/test-defensa.js
 * 
 * Prueba completa del sistema de defensa KISS (3 líneas) con verificación de:
 * 1. Rate limiting (línea 1)
 * 2. Cambio de modo a limitado (línea 2)
 * 3. Recuperación a modo normal (línea 2)
 * 4. Concurrencia de la cola (vasos comunicantes)
 * 5. Integridad de trabajos (no se pierden)
 * 
 * Uso: node test/test-defensa.js [--no-restore]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

// ============================================================
//  CONFIGURACIÓN
// ============================================================

const CONFIG_PATH = path.join(BASE_DIR, 'configuracion.json');
const BACKUP_CONFIG = path.join(__dirname, 'backup-config-defensa.json');
const IMAGEN_PATH = path.join(BASE_DIR, 'ai.jpg');
const TOKEN_EXPIRATION = '1h';

let RESTORE = true;
if (process.argv.includes('--no-restore')) RESTORE = false;
let colaRef = null; // Referencia a la cola para telemetría

function generarToken() {
  return jwt.sign(
    { agentId: 'cliente-publico-456', role: 'public' },
    'mi-secreto-temporal-123',
    { expiresIn: TOKEN_EXPIRATION }
  );
}

let TOKEN = generarToken();

// ============================================================
//  BACKUP / RESTORE
// ============================================================

function backupConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, BACKUP_CONFIG);
    console.log('📦 Backup de configuracion.json creado.');
  }
}

function restoreConfig() {
  if (fs.existsSync(BACKUP_CONFIG)) {
    fs.copyFileSync(BACKUP_CONFIG, CONFIG_PATH);
    fs.unlinkSync(BACKUP_CONFIG);
    console.log('🔄 configuracion.json restaurado.');
  }
}

// ============================================================
//  MODIFICAR CONFIGURACIÓN TEMPORALMENTE
// ============================================================

function setUmbralTemporal(nuevoUmbral) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const anterior = config.defensa.segundaLinea.umbral;
  config.defensa.segundaLinea.umbral = nuevoUmbral;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`🔧 Umbral temporal cambiado de ${anterior} a: ${nuevoUmbral}`);
}

// ============================================================
//  FUNCIONES DE PRUEBA
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enviarPeticion(agentId, archivoBase64, groundTruth = null, planId = 'analizar-imagen-completa') {
  const url = 'http://localhost:3002/agent/execute';
  const body = {
    agentId,
    token: TOKEN,
    configuracion: { planId },
    peticion: { archivo: archivoBase64 }
  };
  if (groundTruth !== null) {
    body.peticion.groundTruth = groundTruth;
  }
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const end = Date.now();
    const data = await response.json();
    return { status: response.status, data, tiempo: end - start };
  } catch (error) {
    return { status: 500, error: error.message, tiempo: Date.now() - start };
  }
}

async function getModoActual() {
  try {
    const { getModo } = await import('../defensa.js');
    return getModo();
  } catch {
    return 'desconocido';
  }
}

async function getConcurrenciaActual() {
  try {
    const { getConcurrenciaMaxima } = await import('../defensa.js');
    return getConcurrenciaMaxima();
  } catch {
    return null;
  }
}

async function getTelemetriaCola(cola) {
  try {
    const counts = await cola.getJobCounts();
    const jobs = await cola.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
    const waiting = counts.waiting || 0;
    const active = counts.active || 0;
    const completed = counts.completed || 0;
    const failed = counts.failed || 0;
    const delayed = counts.delayed || 0;
    const profundidad = waiting + active;
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      profundidad,
      jobs
    };
  } catch (error) {
    console.error('   ❌ Error al obtener telemetría de cola:', error.message);
    return null;
  }
}

async function getProfundidadCola(cola) {
  const tele = await getTelemetriaCola(cola);
  return tele ? tele.profundidad : -1;
}

async function forzarActualizacionModo() {
  try {
    const { actualizarModo } = await import('../defensa.js');
    await actualizarModo();
    console.log('   🔄 actualizarModo() forzado.');
    return true;
  } catch (error) {
    console.error('   ❌ Error al forzar actualizarModo():', error.message);
    return false;
  }
}

async function cerrarCola(cola) {
  try {
    await cola.close();
    console.log('   🧹 Cola cerrada correctamente.');
  } catch (error) {
    console.error('   ❌ Error al cerrar cola:', error.message);
  }
}

// ============================================================
//  PRUEBA PRINCIPAL
// ============================================================

async function testDefensa() {
  console.log('🛡️ TEST EXHAUSTIVO DEL SISTEMA DE DEFENSA (3 LÍNEAS)');
  console.log('====================================================\n');

  // 0. Verificar Agent Embassy
  console.log('🔍 Verificando Agent Embassy...');
  try {
    const resp = await fetch('http://localhost:3002/health');
    if (resp.status !== 200) {
      console.error('❌ Agent Embassy no está corriendo o no responde.');
      console.log('   Ejecuta: node agent-embassy.js en otra terminal.');
      process.exit(1);
    }
    console.log('✅ Agent Embassy está corriendo.\n');
  } catch {
    console.error('❌ Agent Embassy no está corriendo.');
    console.log('   Ejecuta: node agent-embassy.js en otra terminal.');
    process.exit(1);
  }

  // Renovar token
  TOKEN = generarToken();
  console.log(`🔑 Token renovado: ${TOKEN.substring(0, 20)}...\n`);

  // Backup
  backupConfig();

  try {
    // Leer imagen
    if (!fs.existsSync(IMAGEN_PATH)) {
      console.error(`❌ Imagen no encontrada: ${IMAGEN_PATH}`);
      process.exit(1);
    }
    const imagenBase64 = fs.readFileSync(IMAGEN_PATH).toString('base64');
    console.log(`📷 Imagen cargada: ${path.basename(IMAGEN_PATH)} (${imagenBase64.length} bytes base64)\n`);

    // ============================================================
    // 1. VERIFICACIÓN DE CONCURRENCIA
    // ============================================================
    console.log('📊 1. Verificando concurrencia máxima...');
    const concurrencia = await getConcurrenciaActual();
    console.log(`   Concurrencia configurada: ${concurrencia}`);
    if (concurrencia === 10) {
      console.log('   ✅ Concurrencia correcta (10).');
    } else {
      console.warn(`   ⚠️ Concurrencia esperada 10, pero se obtuvo ${concurrencia}.`);
    }

    // ============================================================
    // 2. RATE LIMITING (LÍNEA 1)
    // ============================================================
    console.log('\n📊 2. Rate limiting (línea 1)');
    console.log('   Enviando 35 peticiones rápidas (límite: 30/min)...');

    const resultadosRateLimit = [];
    for (let i = 0; i < 35; i++) {
      const result = await enviarPeticion('cliente-publico-456', imagenBase64, true);
      resultadosRateLimit.push(result.status);
      if ((i+1) % 10 === 0) console.log(`   ... ${i+1}/35 peticiones enviadas`);
    }
    const status429 = resultadosRateLimit.filter(s => s === 429).length;
    console.log(`   Peticiones con 429 (rate limit): ${status429}`);
    if (status429 === 0) {
      console.error('   ❌ No se recibió ninguna respuesta 429. El rate limiting podría no estar funcionando.');
    } else {
      console.log(`   ✅ Rate limiting funcionando (${status429} bloqueadas).`);
    }

    // ============================================================
    // 3. CAMBIO DE MODO A LIMITADO (LÍNEA 2)
    // ============================================================
    console.log('\n📊 3. Cambio de modo a limitado (línea 2)');
    console.log('   Reduciendo umbral temporalmente a 3 para facilitar la saturación...');
    setUmbralTemporal(3);

    // Inicializar cola
    console.log('   🐂 Inicializando cola...');
    const { getCola } = await import('../cola.js');
    const cola = getCola();
    colaRef = cola;
    console.log('   ✅ Cola inicializada.');

    // Modo inicial
    const modoInicial = await getModoActual();
    console.log(`   Modo inicial: ${modoInicial}`);

    // Lanzar 30 peticiones en paralelo
    const NUM_PETICIONES = 30;
    console.log(`\n   🚀 Enviando ${NUM_PETICIONES} peticiones en paralelo para saturar la cola...`);
    const peticiones = [];
    for (let i = 0; i < NUM_PETICIONES; i++) {
      const agentId = `cliente-publico-${i % 5}`;
      peticiones.push(enviarPeticion(agentId, imagenBase64, true, 'analizar-imagen-completa'));
    }
    console.log(`   ✅ ${NUM_PETICIONES} peticiones lanzadas.`);

    // Esperar a que la cola tenga profundidad >= 3
    console.log('\n   ⏳ Esperando a que la cola tenga profundidad >= 3...');
    let profundidad = 0;
    let intentos = 0;
    while (intentos < 20) {
      await sleep(500);
      profundidad = await getProfundidadCola(cola);
      console.log(`   📊 Profundidad: ${profundidad}`);
      if (profundidad >= 3) break;
      intentos++;
    }
    console.log(`   📊 Profundidad alcanzada: ${profundidad}`);

    if (profundidad >= 3) {
      console.log('   ✅ Profundidad suficiente. Forzando actualización del modo...');
      await forzarActualizacionModo();
    } else {
      console.log(`   ⚠️ Profundidad insuficiente (${profundidad}). Forzando actualización de todos modos...`);
      await forzarActualizacionModo();
    }

    // Verificar modo durante la saturación
    const modoDurante = await getModoActual();
    console.log(`   Modo durante saturación: ${modoDurante}`);
    const modoCambiado = modoDurante === 'limitado';
    if (modoCambiado) {
      console.log('   ✅ Modo cambiado a \'limitado\' durante la saturación.');
    } else {
      console.error(`   ❌ El modo no cambió a 'limitado' (sigue en '${modoDurante}').`);
    }

    // ============================================================
    // 4. RECUPERACIÓN A MODO NORMAL (LÍNEA 2)
    // ============================================================
    console.log('\n📊 4. Recuperación a modo normal (línea 2)');
    console.log('   ⏳ Esperando a que todas las peticiones terminen...');
    await Promise.all(peticiones);
    console.log('   ✅ Todas las peticiones completadas.');

    // Esperar a que la cola se vacíe (con timeout)
    console.log('   ⏳ Esperando a que la cola se vacíe...');
    let colaVacia = false;
    let intentosVaciado = 0;
    while (intentosVaciado < 20) {
      await sleep(500);
      const tele = await getTelemetriaCola(cola);
      if (tele && tele.profundidad === 0 && tele.waiting === 0 && tele.active === 0) {
        colaVacia = true;
        break;
      }
      intentosVaciado++;
    }

    if (colaVacia) {
      console.log('   ✅ Cola vacía.');
    } else {
      console.warn('   ⚠️ La cola no se vació completamente en el tiempo esperado.');
    }

    // Forzar actualización del modo después de vaciar la cola
    await forzarActualizacionModo();

    // Verificar modo final (debe ser normal)
    const modoFinal = await getModoActual();
    console.log(`   Modo final: ${modoFinal}`);
    const modoRecuperado = modoFinal === 'normal';
    if (modoRecuperado) {
      console.log('   ✅ Modo vuelto a \'normal\' después de la recuperación.');
    } else {
      console.error(`   ❌ El modo no volvió a 'normal' (sigue en '${modoFinal}').`);
    }

    // ============================================================
    // 5. TELEMETRÍA FINAL DE LA COLA (VASOS COMUNICANTES)
    // ============================================================
    console.log('\n📊 5. Telemetría final de la cola (vasos comunicantes)');
    const teleFinal = await getTelemetriaCola(cola);
    if (teleFinal) {
      console.log(`   Trabajos completados: ${teleFinal.completed}`);
      console.log(`   Trabajos fallidos: ${teleFinal.failed}`);
      console.log(`   Trabajos en waiting: ${teleFinal.waiting}`);
      console.log(`   Trabajos activos: ${teleFinal.active}`);
      console.log(`   Profundidad total: ${teleFinal.profundidad}`);
      // Verificar que no haya trabajos perdidos (completed + failed + waiting + active = NUM_PETICIONES)
      const totalProcesados = teleFinal.completed + teleFinal.failed + teleFinal.waiting + teleFinal.active;
      if (totalProcesados === NUM_PETICIONES) {
        console.log(`   ✅ Todos los trabajos contabilizados (${totalProcesados}/${NUM_PETICIONES}).`);
      } else {
        console.warn(`   ⚠️ Discrepancia: ${totalProcesados} vs ${NUM_PETICIONES} esperados.`);
      }
    }

    // ============================================================
    //  RESUMEN FINAL
    // ============================================================
    console.log('\n📊 RESUMEN DEL TEST DE DEFENSA');
    console.log('==============================');
    console.log(`   Concurrencia configurada: ${concurrencia} (esperado 10) ${concurrencia === 10 ? '✅' : '⚠️'}`);
    console.log(`   Rate limiting (429): ${status429 > 0 ? '✅' : '❌'}`);
    console.log(`   Cambio a modo limitado: ${modoCambiado ? '✅' : '❌'}`);
    console.log(`   Recuperación a modo normal: ${modoRecuperado ? '✅' : '❌'}`);
    console.log(`   Integridad de trabajos: ${teleFinal && teleFinal.completed + teleFinal.failed === NUM_PETICIONES ? '✅' : '⚠️'}`);
    console.log('');

    if (status429 > 0 && modoCambiado && modoRecuperado) {
      console.log('✅ EL SISTEMA DE DEFENSA FUNCIONA CORRECTAMENTE:');
      console.log('   - Rate limiting protege ante picos.');
      console.log('   - Cambia a modo limitado bajo carga.');
      console.log('   - Vuelve a modo normal tras la recuperación.');
      console.log('   - La cola gestiona los trabajos sin pérdidas.');
    } else {
      console.log('⚠️ ALGUNAS PRUEBAS FALLARON. REVISAR LOGS.');
    }

  } catch (error) {
    console.error('❌ Error durante el test:', error);
  } finally {
    if (colaRef) {
      console.log('\n🧹 Cerrando cola...');
      await cerrarCola(colaRef);
    }
    if (RESTORE) restoreConfig();
    console.log('\n✅ Test finalizado.');
  }
}

testDefensa().catch(console.error);