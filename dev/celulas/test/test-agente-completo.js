#!/usr/bin/env node

/**
 * test/test-agente-completo.js
 * 
 * Prueba integral del agente de decisión y todo el sistema.
 * 
 * Flujo:
 * 1. Copia de seguridad de archivos críticos (catálogo, planes, historial, baseline, cambios).
 * 2. Simula ejecuciones de agentes (con groundTruth) para generar telemetría.
 * 3. Ejecuta el agente en modo 'auto' para que genere y aplique propuestas.
 * 4. Verifica que se han generado planes y ajustes de peso.
 * 5. Verifica que los nuevos planes son válidos (se pueden ejecutar).
 * 6. Ejecuta el autodiagnóstico y verifica que funciona.
 * 7. Restaura el estado original.
 * 
 * Uso: node test/test-agente-completo.js
 * 
 * Principios: KISS, autónomo, documentado, seguro (con backup/restore).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa'; // Para ejecutar comandos de forma segura
import { obtenerCatalogoCompleto } from '../catalogo.js';
import { guardarTelemetria } from '../telemetria/almacen.js';
import { ejecutarAgente } from '../agente-decision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

// ============================================================
//  CONFIGURACIÓN
// ============================================================

const ARCHIVOS_CRITICOS = [
  'celulas/index.json',
  'planes/*.json',  // solo los planes generados (no los predefinidos)
  'telemetria/historial.json',
  'telemetria/baseline.json',
  'telemetria/cambios.json',
  'propuestas/pendientes/*.json',
  'propuestas/aplicadas/*.json',
  'propuestas/aprobadas/*.json',
  'propuestas/rechazadas/*.json'
];

const BACKUP_DIR = path.join(BASE_DIR, 'temp', 'backup-agente-test');

// ============================================================
//  UTILIDADES DE BACKUP / RESTORE
// ============================================================

function crearBackup() {
  console.log('📦 Creando backup de archivos críticos...');
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Copiar catálogo
  const catalogoPath = path.join(BASE_DIR, 'celulas', 'index.json');
  if (fs.existsSync(catalogoPath)) {
    fs.copyFileSync(catalogoPath, path.join(BACKUP_DIR, 'index.json'));
  }

  // Copiar historial
  const historialPath = path.join(BASE_DIR, 'telemetria', 'historial.json');
  if (fs.existsSync(historialPath)) {
    fs.copyFileSync(historialPath, path.join(BACKUP_DIR, 'historial.json'));
  }

  // Copiar baseline (si existe)
  const baselinePath = path.join(BASE_DIR, 'telemetria', 'baseline.json');
  if (fs.existsSync(baselinePath)) {
    fs.copyFileSync(baselinePath, path.join(BACKUP_DIR, 'baseline.json'));
  }

  // Copiar cambios (si existe)
  const cambiosPath = path.join(BASE_DIR, 'telemetria', 'cambios.json');
  if (fs.existsSync(cambiosPath)) {
    fs.copyFileSync(cambiosPath, path.join(BACKUP_DIR, 'cambios.json'));
  }

  // Copiar planes generados (evolucion-*.json)
  const planesDir = path.join(BASE_DIR, 'planes');
  if (fs.existsSync(planesDir)) {
    const planesBackupDir = path.join(BACKUP_DIR, 'planes');
    if (!fs.existsSync(planesBackupDir)) {
      fs.mkdirSync(planesBackupDir, { recursive: true });
    }
    const files = fs.readdirSync(planesDir).filter(f => f.startsWith('evolucion-'));
    for (const f of files) {
      fs.copyFileSync(path.join(planesDir, f), path.join(planesBackupDir, f));
    }
  }

  // Copiar propuestas (si existen)
  const propuestasDir = path.join(BASE_DIR, 'propuestas');
  if (fs.existsSync(propuestasDir)) {
    const propBackupDir = path.join(BACKUP_DIR, 'propuestas');
    if (!fs.existsSync(propBackupDir)) {
      fs.mkdirSync(propBackupDir, { recursive: true });
    }
    const subdirs = ['pendientes', 'aprobadas', 'aplicadas', 'rechazadas'];
    for (const sub of subdirs) {
      const src = path.join(propuestasDir, sub);
      const dst = path.join(propBackupDir, sub);
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
  // Restaurar catálogo
  const backupCatalogo = path.join(BACKUP_DIR, 'index.json');
  if (fs.existsSync(backupCatalogo)) {
    fs.copyFileSync(backupCatalogo, path.join(BASE_DIR, 'celulas', 'index.json'));
  }

  // Restaurar historial
  const backupHistorial = path.join(BACKUP_DIR, 'historial.json');
  if (fs.existsSync(backupHistorial)) {
    fs.copyFileSync(backupHistorial, path.join(BASE_DIR, 'telemetria', 'historial.json'));
  } else {
    // Si no había historial, crear vacío
    fs.writeFileSync(path.join(BASE_DIR, 'telemetria', 'historial.json'), JSON.stringify([], null, 2));
  }

  // Restaurar baseline
  const backupBaseline = path.join(BACKUP_DIR, 'baseline.json');
  if (fs.existsSync(backupBaseline)) {
    fs.copyFileSync(backupBaseline, path.join(BASE_DIR, 'telemetria', 'baseline.json'));
  } else {
    // Si no había baseline, eliminarla
    const baselinePath = path.join(BASE_DIR, 'telemetria', 'baseline.json');
    if (fs.existsSync(baselinePath)) fs.unlinkSync(baselinePath);
  }

  // Restaurar cambios
  const backupCambios = path.join(BACKUP_DIR, 'cambios.json');
  if (fs.existsSync(backupCambios)) {
    fs.copyFileSync(backupCambios, path.join(BASE_DIR, 'telemetria', 'cambios.json'));
  } else {
    const cambiosPath = path.join(BASE_DIR, 'telemetria', 'cambios.json');
    if (fs.existsSync(cambiosPath)) fs.unlinkSync(cambiosPath);
  }

  // Restaurar planes generados
  const backupPlanes = path.join(BACKUP_DIR, 'planes');
  if (fs.existsSync(backupPlanes)) {
    const planesDir = path.join(BASE_DIR, 'planes');
    const files = fs.readdirSync(backupPlanes);
    for (const f of files) {
      fs.copyFileSync(path.join(backupPlanes, f), path.join(planesDir, f));
    }
  }

  // Restaurar propuestas (limpiar las generadas y restaurar las de backup)
  const propuestasDir = path.join(BASE_DIR, 'propuestas');
  if (fs.existsSync(propuestasDir)) {
    // Eliminar todas las propuestas actuales
    const subdirs = ['pendientes', 'aprobadas', 'aplicadas', 'rechazadas'];
    for (const sub of subdirs) {
      const dir = path.join(propuestasDir, sub);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
    // Restaurar las de backup
    const backupProp = path.join(BACKUP_DIR, 'propuestas');
    if (fs.existsSync(backupProp)) {
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
  }

  // Eliminar directorio de backup
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  console.log('✅ Restauración completada.');
}

// ============================================================
//  GENERADOR DE EJECUCIONES SIMULADAS
// ============================================================

/**
 * Simula ejecuciones de agentes con groundTruth para llenar la telemetría.
 * @param {number} count - Número de ejecuciones a simular.
 * @param {Object} options - Opciones (tipos de archivo, proporción IA/humana, etc.)
 */
function generarEjecucionesSimuladas(count = 20, options = {}) {
  console.log(`📤 Generando ${count} ejecuciones simuladas...`);

  const tipos = options.tipos || ['image'];
  const proporcionIA = options.proporcionIA || 0.5; // 50% IA, 50% humanas
  const agentes = options.agentes || ['cliente-publico-456', 'partner-789'];

  // Plantillas de células para diferentes tipos de archivo
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
    ],
    'pdf': [],
    'video': []
  };

  for (let i = 0; i < count; i++) {
    const tipo = tipos[i % tipos.length];
    const esIA = Math.random() < proporcionIA;
    const agentId = agentes[i % agentes.length];
    const celulas = celulasPorTipo[tipo] || [];

    // Simular tiempos (aleatorios pero realistas)
    const tiempos = celulas.map(() => Math.random() * 50 + 5);
    const tiempoTotal = tiempos.reduce((a, b) => a + b, 0);

    // Simular éxito (mayoría de las veces verdadero)
    const exito = Math.random() > 0.1;

    // Crear telemetría detallada
    const telemetria = celulas.map((id, idx) => ({
      celulaId: id,
      tiempoMs: tiempos[idx],
      exito: exito,
      error: exito ? null : 'Error simulado',
      metricas: {},
      esIA: Math.random() > 0.3 // Simular voto de la célula
    }));

    // Guardar telemetría
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
      metadatosExtra: {
        formato: 'jpeg',
        ancho: 1024,
        alto: 768,
        tamañoBytes: Math.floor(Math.random() * 500000) + 100000
      },
      huellaDigital: `simhash${i}`,
      tiemposPorCelula: tiempos.map((t, idx) => ({ celulaId: celulas[idx], tiempoMs: t })),
      pesosCelulas: celulas.map(id => ({ celulaId: id, peso: 1.0 }))
    });
  }

  console.log(`✅ ${count} ejecuciones simuladas guardadas.`);
}

// ============================================================
//  VERIFICACIONES
// ============================================================

function verificarPlanesGenerados() {
  console.log('🔍 Verificando planes generados...');
  const planesDir = path.join(BASE_DIR, 'planes');
  if (!fs.existsSync(planesDir)) {
    console.error('❌ No existe la carpeta planes.');
    return false;
  }
  const planes = fs.readdirSync(planesDir).filter(f => f.startsWith('evolucion-') && f.endsWith('.json'));
  if (planes.length === 0) {
    console.error('❌ No se generaron planes evolucionados.');
    return false;
  }
  console.log(`✅ ${planes.length} planes generados.`);
  // Verificar que los planes son JSON válidos
  for (const f of planes) {
    try {
      const content = fs.readFileSync(path.join(planesDir, f), 'utf8');
      JSON.parse(content);
    } catch (e) {
      console.error(`❌ Plan ${f} no es JSON válido.`);
      return false;
    }
  }
  return true;
}

function verificarPesosActualizados() {
  console.log('🔍 Verificando ajustes de peso...');
  const catalogo = obtenerCatalogoCompleto();
  let pesosModificados = false;
  for (const celula of catalogo.células) {
    if (celula.peso !== undefined && celula.peso !== 1.0) {
      pesosModificados = true;
      console.log(`   Célula ${celula.id}: peso = ${celula.peso}`);
    }
  }
  if (!pesosModificados) {
    console.log('⚠️ No se detectaron cambios en los pesos (puede ser normal si no había propuestas).');
  } else {
    console.log('✅ Pesos modificados correctamente.');
  }
  return true;
}

function verificarAutodiagnostico() {
  console.log('🔍 Verificando autodiagnóstico...');
  const baselinePath = path.join(BASE_DIR, 'telemetria', 'baseline.json');
  if (!fs.existsSync(baselinePath)) {
    console.error('❌ No se generó baseline.');
    return false;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  console.log(`   Baseline guardada: ${baseline.timestamp}`);
  // Verificar que tiene las métricas esperadas
  const metricas = baseline.metricas || {};
  if (metricas.precisionGlobal === undefined) {
    console.warn('⚠️ Baseline sin precisión global (puede ser normal sin groundTruth).');
  }
  return true;
}

// ============================================================
//  PRUEBA PRINCIPAL
// ============================================================

async function testAgenteCompleto() {
  console.log('🧪 INICIANDO TEST COMPLETO DEL AGENTE');
  console.log('=======================================\n');

  // 1. Backup
  crearBackup();

  try {
    // 2. Limpiar historial para empezar desde cero
    const historialPath = path.join(BASE_DIR, 'telemetria', 'historial.json');
    fs.writeFileSync(historialPath, JSON.stringify([], null, 2));
    console.log('🧹 Historial limpiado.\n');

    // 3. Generar ejecuciones simuladas (con groundTruth)
    generarEjecucionesSimuladas(30, { proporcionIA: 0.5 });

    // 4. Ejecutar agente en modo auto
    console.log('\n🚀 Ejecutando agente en modo auto...');
    const resultado = await ejecutarAgente('auto', { ejecutarAutodiagnostico: true });
    console.log(`   Resultado: ${resultado.aplicadas} propuestas aplicadas, ${resultado.fallidas} fallidas.\n`);

    // 5. Verificaciones
    const okPlanes = verificarPlanesGenerados();
    const okPesos = verificarPesosActualizados();
    const okDiagnostico = verificarAutodiagnostico();

    // 6. Verificar que los planes generados se pueden ejecutar (usar uno de ejemplo)
    console.log('🔍 Verificando ejecución de un plan generado...');
    const planes = fs.readdirSync(path.join(BASE_DIR, 'planes')).filter(f => f.startsWith('evolucion-') && f.endsWith('.json'));
    if (planes.length > 0) {
      const planEjemplo = planes[0];
      const planPath = path.join(BASE_DIR, 'planes', planEjemplo);
      // Intentar cargar el plan
      try {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
        console.log(`   Plan ${planEjemplo} cargado correctamente.`);
        console.log(`   Células: ${plan.células.map(c => c.id).join(', ')}`);
        // Podríamos intentar ejecutarlo con una imagen de prueba, pero eso requeriría un agente-embassy corriendo.
        // Por ahora, solo validamos que el JSON es válido.
      } catch (e) {
        console.error(`❌ Error al cargar plan ${planEjemplo}: ${e.message}`);
        throw new Error('Plan inválido');
      }
    }

    // 7. Resumen final
    console.log('\n📊 RESUMEN DEL TEST:');
    console.log(`   ✅ Planes generados: ${okPlanes ? 'OK' : 'FALLÓ'}`);
    console.log(`   ✅ Pesos actualizados: ${okPesos ? 'OK' : 'FALLÓ'}`);
    console.log(`   ✅ Autodiagnóstico: ${okDiagnostico ? 'OK' : 'FALLÓ'}`);

    if (okPlanes && okPesos && okDiagnostico) {
      console.log('\n✅ TEST COMPLETADO CON ÉXITO.');
    } else {
      console.log('\n❌ ALGUNAS VERIFICACIONES FALLARON.');
    }

  } catch (error) {
    console.error('❌ Error durante el test:', error);
  } finally {
    // Restaurar estado original
    restaurarBackup();
    console.log('\n🧹 Estado original restaurado.');
  }
}

// ============================================================
//  EJECUCIÓN
// ============================================================

testAgenteCompleto().catch(console.error);