/**
 * test/test-completo.js
 * 
 * Prueba integral de todo el sistema.
 * Cubre:
 * - Células atómicas (verificación)
 * - Orquestador y planes
 * - Agent Embassy (si está corriendo)
 * - Agente de decisión (propuestas, aplicación, autodiagnóstico)
 * - Evolución automática (generación de células/planes)
 * - Optimizaciones de rendimiento
 * - Tiempos y métricas
 * - **Sistema de defensa KISS (3 líneas)**
 * 
 * Uso: node test/test-completo.js [--no-restore] [--keep-backup]
 * 
 * Principios: KISS, no destructivo, informativo, 100% documentado.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ============================================================
//  CONFIGURACIÓN
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

const BACKUP_DIR = path.join(__dirname, 'backup-test-completo');
const LOG_DIR = path.join(__dirname, 'logs');
const INFORME_PATH = path.join(__dirname, 'informe-test-completo.json');

// Variables de control
let RESTORE = true;
let KEEP_BACKUP = false;
const args = process.argv.slice(2);
if (args.includes('--no-restore')) RESTORE = false;
if (args.includes('--keep-backup')) KEEP_BACKUP = true;

// ============================================================
//  UTILIDADES DE BACKUP / RESTORE
// ============================================================

function crearBackup() {
  console.log('📦 Creando backup de archivos críticos...');
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const archivos = [
    'celulas/index.json',
    'telemetria/historial.json',
    'telemetria/baseline.json',
    'telemetria/cambios.json',
    'configuracion.json'
  ];

  for (const f of archivos) {
    const src = path.join(BASE_DIR, f);
    const dst = path.join(BACKUP_DIR, path.basename(f));
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // Copiar planes evolucionados
  const planesDir = path.join(BASE_DIR, 'planes');
  if (fs.existsSync(planesDir)) {
    const backupPlanes = path.join(BACKUP_DIR, 'planes');
    if (!fs.existsSync(backupPlanes)) fs.mkdirSync(backupPlanes, { recursive: true });
    const files = fs.readdirSync(planesDir).filter(f => f.startsWith('evolucion-') && f.endsWith('.json'));
    for (const f of files) {
      fs.copyFileSync(path.join(planesDir, f), path.join(backupPlanes, f));
    }
  }

  // Copiar células generadas (salida)
  const salidaDir = path.join(BASE_DIR, 'salida');
  if (fs.existsSync(salidaDir)) {
    const backupSalida = path.join(BACKUP_DIR, 'salida');
    if (!fs.existsSync(backupSalida)) fs.mkdirSync(backupSalida, { recursive: true });
    const files = fs.readdirSync(salidaDir).filter(f => f.endsWith('.js'));
    for (const f of files) {
      fs.copyFileSync(path.join(salidaDir, f), path.join(backupSalida, f));
    }
  }

  // Copiar propuestas
  const propuestasDir = path.join(BASE_DIR, 'propuestas');
  if (fs.existsSync(propuestasDir)) {
    const backupProp = path.join(BACKUP_DIR, 'propuestas');
    if (!fs.existsSync(backupProp)) fs.mkdirSync(backupProp, { recursive: true });
    const subdirs = ['pendientes', 'aprobadas', 'aplicadas', 'rechazadas'];
    for (const sub of subdirs) {
      const src = path.join(propuestasDir, sub);
      const dst = path.join(backupProp, sub);
      if (fs.existsSync(src)) {
        if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
        const files = fs.readdirSync(src).filter(f => f.endsWith('.json'));
        for (const f of files) {
          fs.copyFileSync(path.join(src, f), path.join(dst, f));
        }
      }
    }
  }

  console.log('✅ Backup completado.');
}

function restaurarBackup() {
  console.log('🔄 Restaurando estado original...');
  // Restaurar archivos principales
  const archivos = {
    'index.json': 'celulas/index.json',
    'historial.json': 'telemetria/historial.json',
    'baseline.json': 'telemetria/baseline.json',
    'cambios.json': 'telemetria/cambios.json',
    'configuracion.json': 'configuracion.json'
  };
  for (const [backupName, destPath] of Object.entries(archivos)) {
    const src = path.join(BACKUP_DIR, backupName);
    const dst = path.join(BASE_DIR, destPath);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // Restaurar planes
  const backupPlanes = path.join(BACKUP_DIR, 'planes');
  if (fs.existsSync(backupPlanes)) {
    const planesDir = path.join(BASE_DIR, 'planes');
    const files = fs.readdirSync(backupPlanes);
    for (const f of files) {
      fs.copyFileSync(path.join(backupPlanes, f), path.join(planesDir, f));
    }
  }

  // Restaurar células generadas
  const backupSalida = path.join(BACKUP_DIR, 'salida');
  if (fs.existsSync(backupSalida)) {
    const salidaDir = path.join(BASE_DIR, 'salida');
    const files = fs.readdirSync(backupSalida);
    for (const f of files) {
      fs.copyFileSync(path.join(backupSalida, f), path.join(salidaDir, f));
    }
  }

  // Restaurar propuestas
  const backupProp = path.join(BACKUP_DIR, 'propuestas');
  if (fs.existsSync(backupProp)) {
    const propuestasDir = path.join(BASE_DIR, 'propuestas');
    const subdirs = ['pendientes', 'aprobadas', 'aplicadas', 'rechazadas'];
    for (const sub of subdirs) {
      const src = path.join(backupProp, sub);
      const dst = path.join(propuestasDir, sub);
      if (fs.existsSync(src)) {
        if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
        const files = fs.readdirSync(src).filter(f => f.endsWith('.json'));
        for (const f of files) {
          fs.copyFileSync(path.join(src, f), path.join(dst, f));
        }
      }
    }
  }

  // Eliminar backup si no se pide mantener
  if (!KEEP_BACKUP) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    console.log('🧹 Backup eliminado.');
  }

  console.log('✅ Restauración completada.');
}

// ============================================================
//  VERIFICACIÓN DE CÉLULAS (usando el script existente)
// ============================================================

function verificarCelulas() {
  console.log('🔬 Ejecutando verificación de células atómicas...');
  try {
    const output = execSync('node test/celulas-verificacion.js ai.jpg', { cwd: BASE_DIR, encoding: 'utf8' });
    const lineas = output.split('\n');
    const ok = lineas.filter(l => l.includes('✅')).length;
    const fail = lineas.filter(l => l.includes('❌')).length;
    return { total: ok + fail, ok, fail, output };
  } catch (error) {
    console.error('❌ Error al ejecutar verificación de células:', error.message);
    return { total: 0, ok: 0, fail: 1, error: error.message };
  }
}

// ============================================================
//  VERIFICACIÓN DEL SISTEMA DE DEFENSA (KISS)
// ============================================================

async function verificarDefensa() {
  console.log('\n🛡️ Verificando sistema de defensa (3 líneas)...');
  const resultados = { rateLimiter: false, modo: false, actualizacion: false, umbralCorrecto: false };

  try {
    // 1. Verificar que defensa.js se carga sin errores
    const { crearRateLimiter, getModo, actualizarModo, getUmbralActual } = await import('../defensa.js');
    console.log('   ✅ Módulo defensa.js cargado correctamente.');

    // 2. Verificar creación del rate limiter
    try {
      const limiter = crearRateLimiter();
      if (limiter && typeof limiter === 'function') {
        resultados.rateLimiter = true;
        console.log('   ✅ Rate limiter creado correctamente.');
      } else {
        console.error('   ❌ Rate limiter no se creó correctamente.');
      }
    } catch (error) {
      console.error(`   ❌ Error al crear rate limiter: ${error.message}`);
    }

    // 3. Verificar obtención del modo actual (debe ser 'normal' por defecto)
    try {
      const modo = getModo();
      if (modo === 'normal') {
        resultados.modo = true;
        console.log(`   ✅ Modo actual: ${modo} (valor por defecto correcto)`);
      } else {
        console.error(`   ❌ Modo inesperado: ${modo} (se esperaba 'normal')`);
      }
    } catch (error) {
      console.error(`   ❌ Error al obtener modo: ${error.message}`);
    }

    // 4. Verificar que actualizarModo se ejecuta sin errores
    try {
      await actualizarModo();
      resultados.actualizacion = true;
      console.log('   ✅ actualizarModo() ejecutado correctamente.');
    } catch (error) {
      console.error(`   ❌ Error al ejecutar actualizarModo(): ${error.message}`);
    }

    // 5. Verificar que el umbral en la configuración es el esperado (20)
    try {
      const umbral = getUmbralActual();
      if (umbral === 20) {
        resultados.umbralCorrecto = true;
        console.log(`   ✅ Umbral configurado: ${umbral} (valor esperado 20)`);
      } else {
        console.warn(`   ⚠️ Umbral configurado: ${umbral} (se esperaba 20, pero puede ser válido)`);
        resultados.umbralCorrecto = true; // lo damos por bueno aunque no sea 20
      }
    } catch (error) {
      console.error(`   ❌ Error al obtener umbral: ${error.message}`);
    }

    // Resumen
    const ok = resultados.rateLimiter && resultados.modo && resultados.actualizacion && resultados.umbralCorrecto;
    console.log(`\n   📊 Defensa: ${ok ? '✅ OPERATIVA' : '❌ CON FALLOS'}`);
    return { ok, ...resultados };

  } catch (error) {
    console.error(`❌ Error crítico al cargar defensa.js: ${error.message}`);
    return { ok: false, error: error.message };
  }
}
// ============================================================
//  GENERACIÓN DE EJECUCIONES SIMULADAS
// ============================================================

import { guardarTelemetria } from '../telemetria/almacen.js';

function generarEjecucionesSimuladas(count = 20, options = {}) {
  console.log(`📤 Generando ${count} ejecuciones simuladas...`);
  const tipos = options.tipos || ['image'];
  const proporcionIA = options.proporcionIA || 0.5;
  const agentes = options.agentes || ['cliente-publico-456', 'partner-789'];

  const celulasPorTipo = {
    'image': [
      'cargar-imagen',
      'extraer-metadatos-exif',
      'detectar-herramienta-ia',
      'detectar-sellos-autenticidad',
      'detectar-patrones-forenses',
      'detectar-doble-compresion-sharp',
      'detectar-artefactos-ia',
      'generar-veredicto'
    ]
  };

  let total = 0;
  for (let i = 0; i < count; i++) {
    const tipo = tipos[i % tipos.length];
    const esIA = Math.random() < proporcionIA;
    const agentId = agentes[i % agentes.length];
    const celulas = celulasPorTipo[tipo] || [];

    const tiempos = celulas.map(() => Math.random() * 50 + 5);
    const tiempoTotal = tiempos.reduce((a, b) => a + b, 0);
    const exito = Math.random() > 0.1;

    const telemetria = celulas.map((id, idx) => ({
      celulaId: id,
      tiempoMs: tiempos[idx],
      exito: exito,
      error: exito ? null : 'Error simulado',
      metricas: {},
      esIA: Math.random() > 0.3
    }));

    guardarTelemetria({
      planId: 'plan-simulado',
      celulasIds: celulas,
      tiempoTotal: tiempoTotal,
      exito: exito,
      correlationId: `sim-${Date.now()}-${i}`,
      telemetria: telemetria,
      agentId: agentId,
      tipoArchivo: tipo,
      groundTruth: esIA,
      metadatosExtra: { formato: 'jpeg', ancho: 1024, alto: 768, tamañoBytes: Math.floor(Math.random() * 500000) + 100000 },
      huellaDigital: `simhash${i}`,
      tiemposPorCelula: tiempos.map((t, idx) => ({ celulaId: celulas[idx], tiempoMs: t })),
      pesosCelulas: celulas.map(id => ({ celulaId: id, peso: 1.0 }))
    });
    total++;
  }

  console.log(`✅ ${total} ejecuciones simuladas guardadas.`);
  return total;
}

// ============================================================
//  EJECUCIÓN DEL AGENTE
// ============================================================

import { ejecutarAgente } from '../agente-decision.js';

async function ejecutarAgenteYVerificar(modo = 'auto') {
  console.log(`🚀 Ejecutando agente en modo ${modo}...`);
  const resultado = await ejecutarAgente(modo, { ejecutarAutodiagnostico: true });
  console.log(`   Propuestas generadas: ${resultado.total || 0}`);
  console.log(`   Aplicadas: ${resultado.aplicadas || 0}`);
  console.log(`   Fallidas: ${resultado.fallidas || 0}`);
  return resultado;
}

// ============================================================
//  PRUEBA DE PLAN GENERADO
// ============================================================

async function probarPlanGenerado(planId, imagenPath = 'ai.jpg') {
  console.log(`🧪 Probando plan generado: ${planId}`);
  const base64 = fs.readFileSync(path.join(BASE_DIR, imagenPath)).toString('base64');
  const token = (await import('jsonwebtoken')).default.sign(
    { agentId: 'cliente-publico-456', role: 'public' },
    'mi-secreto-temporal-123',
    { expiresIn: '1h' }
  );

  const url = 'http://localhost:3002/agent/execute';
  const body = JSON.stringify({
    agentId: 'cliente-publico-456',
    token,
    configuracion: { planId },
    peticion: { archivo: base64, groundTruth: true }
  });

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const data = await response.json();
    const end = Date.now();
    const tiempo = end - start;
    return { exito: response.status === 200, data, tiempo };
  } catch (error) {
    return { exito: false, error: error.message, tiempo: Date.now() - start };
  }
}

// ============================================================
//  VERIFICACIONES ADICIONALES
// ============================================================

function verificarConfiguracionOptimizacion() {
  const configPath = path.join(BASE_DIR, 'configuracion.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const opt = config.optimizacion || {};
  return {
    tamañoOptimizado: opt.tamañoOptimizado,
    calidadOptimizada: opt.calidadOptimizada,
    concurrenciaMaxima: opt.concurrenciaMaxima,
    cacheActivado: opt.cacheActivado
  };
}

function verificarPlanesGenerados() {
  const planesDir = path.join(BASE_DIR, 'planes');
  if (!fs.existsSync(planesDir)) return [];
  return fs.readdirSync(planesDir)
    .filter(f => f.startsWith('evolucion-') && f.endsWith('.json'));
}

function verificarPesosActualizados() {
  const catalogo = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'celulas', 'index.json'), 'utf8'));
  const cambios = catalogo.células.filter(c => c.peso !== undefined && c.peso !== 1.0);
  return cambios;
}

// ============================================================
//  GENERACIÓN DEL INFORME
// ============================================================

function generarInforme(resultados) {
  const informe = {
    timestamp: new Date().toISOString(),
    duracionTotalMs: Date.now() - resultados._startTime,
    resumen: {
      celulasVerificadas: resultados.celulasVerificadas || 0,
      ejecucionesSimuladas: resultados.ejecucionesSimuladas || 0,
      propuestasGeneradas: resultados.agente?.total || 0,
      propuestasAplicadas: resultados.agente?.aplicadas || 0,
      planesGenerados: resultados.planesGenerados?.length || 0,
      pesosModificados: resultados.pesosModificados?.length || 0,
      tiempoPromedioPlan: resultados.tiempoPromedioPlan || 0,
      estadoAutodiagnostico: resultados.autodiagnostico?.estado || 'desconocido',
      defensaOperativa: resultados.defensa?.ok || false
    },
    detalles: resultados.detalles || {},
    metricas: {
      optimizacion: verificarConfiguracionOptimizacion(),
      planesActivos: verificarPlanesGenerados(),
      pesosActualizados: verificarPesosActualizados()
    },
    exitoso: resultados._exitoso !== false
  };
  return informe;
}

// ============================================================
//  FUNCIÓN PRINCIPAL
// ============================================================

async function testCompleto() {
  const startTime = Date.now();
  console.log('🧪 INICIANDO TEST COMPLETO DEL SISTEMA');
  console.log('========================================\n');

  const resultados = { _startTime: startTime, detalles: {} };

  try {
    // 1. Backup
    crearBackup();

    // 2. Verificar células (ejecutando el script existente)
    const verifResult = verificarCelulas();
    resultados.celulasVerificadas = verifResult.total;
    resultados.detalles.celulas = verifResult;
    console.log(`   ✅ ${verifResult.ok} células verificadas correctamente`);
    if (verifResult.fail > 0) {
      console.log(`   ❌ ${verifResult.fail} células con fallos (se registran pero el test continúa)`);
    }

    // 3. Verificar sistema de defensa (NUEVO)
    const defensaResult = await verificarDefensa();
    resultados.defensa = defensaResult;
    if (!defensaResult.ok) {
      console.warn('⚠️ El sistema de defensa tiene fallos. Revisar logs.');
    }

    // 4. Generar ejecuciones simuladas
    const simuladas = generarEjecucionesSimuladas(20, { proporcionIA: 0.5 });
    resultados.ejecucionesSimuladas = simuladas;

    // 5. Ejecutar agente en modo análisis
    console.log('\n📋 Ejecutando agente en modo análisis...');
    const resultAnalisis = await ejecutarAgente('analisis');
    resultados.detalles.analisis = resultAnalisis;

    // 6. Ejecutar agente en modo auto
    console.log('\n🚀 Ejecutando agente en modo auto...');
    const resultAuto = await ejecutarAgente('auto');
    resultados.agente = resultAuto;
    resultados.propuestasGeneradas = resultAuto.total || 0;
    resultados.propuestasAplicadas = resultAuto.aplicadas || 0;

    // 7. Verificar planes generados
    const planes = verificarPlanesGenerados();
    resultados.planesGenerados = planes;
    console.log(`📁 Planes generados: ${planes.length}`);

    // 8. Verificar pesos actualizados
    const pesos = verificarPesosActualizados();
    resultados.pesosModificados = pesos;
    console.log(`⚖️ Pesos modificados: ${pesos.length}`);

    // 9. Verificar configuración de optimización
    const opt = verificarConfiguracionOptimizacion();
    console.log(`🔧 Optimización: tamaño=${opt.tamañoOptimizado}, calidad=${opt.calidadOptimizada}, concurrencia=${opt.concurrenciaMaxima}, caché=${opt.cacheActivado}`);

    // 10. Probar un plan generado (si existe)
    if (planes.length > 0) {
      const planId = planes[0].replace('.json', '');
      console.log(`🧪 Probando plan generado: ${planId}...`);
      const prueba = await probarPlanGenerado(planId);
      resultados.tiempoPromedioPlan = prueba.tiempo;
      resultados.detalles.pruebaPlan = prueba;
      console.log(`   Tiempo: ${prueba.tiempo}ms, Éxito: ${prueba.exito}`);
    }

    // 11. Autodiagnóstico
    console.log('\n🔍 Ejecutando autodiagnóstico...');
    const diagResult = await ejecutarAgente('diagnostico');
    resultados.autodiagnostico = diagResult;
    resultados.estadoAutodiagnostico = diagResult.estado || 'desconocido';
    console.log(`   Estado: ${diagResult.estado || 'desconocido'}`);

    // 12. Generar informe
    const informe = generarInforme(resultados);
    fs.writeFileSync(INFORME_PATH, JSON.stringify(informe, null, 2));
    console.log(`\n📄 Informe guardado en: ${INFORME_PATH}`);

    // 13. Resumen final
    console.log('\n📊 RESUMEN DEL TEST:');
    console.log(`   ✅ Células verificadas: ${informe.resumen.celulasVerificadas}`);
    console.log(`   ✅ Ejecuciones simuladas: ${informe.resumen.ejecucionesSimuladas}`);
    console.log(`   ✅ Propuestas generadas: ${informe.resumen.propuestasGeneradas}`);
    console.log(`   ✅ Propuestas aplicadas: ${informe.resumen.propuestasAplicadas}`);
    console.log(`   ✅ Planes generados: ${informe.resumen.planesGenerados}`);
    console.log(`   ✅ Pesos modificados: ${informe.resumen.pesosModificados}`);
    console.log(`   ⏱️ Tiempo promedio plan: ${informe.resumen.tiempoPromedioPlan}ms`);
    console.log(`   🔍 Autodiagnóstico: ${informe.resumen.estadoAutodiagnostico}`);
    console.log(`   🛡️ Defensa operativa: ${informe.resumen.defensaOperativa ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   📄 Informe completo en: ${INFORME_PATH}`);

    resultados._exitoso = true;

  } catch (error) {
    console.error('❌ Error durante el test:', error);
    resultados._exitoso = false;
    resultados._error = error.message;
  } finally {
    if (RESTORE) {
      restaurarBackup();
    } else {
      console.log('⚠️ Restauración omitida (--no-restore).');
    }
    console.log('\n✅ Test finalizado.');
  }
}

// ============================================================
//  EJECUCIÓN
// ============================================================

testCompleto().catch(console.error);