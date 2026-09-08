/**
 * DIAGNÓSTICO DEL EMBASSY: ¿QUÉ USA PARA EJECUTAR EL PLAN?
 * 
 * 1. Inspecciona el código de agent-embassy.js para ver qué módulos importa y usa.
 * 2. Ejecuta una petición real al servidor.
 * 3. Analiza los logs del Embassy en busca de pistas.
 * 4. Muestra un resumen claro de lo que está sucediendo.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, '..');
const LOG_FILE = '/tmp/diagnostico_embassy.log';
fs.writeFileSync(LOG_FILE, '');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

log('🔍 DIAGNÓSTICO DEL EMBASSY');
log('📂 Base: ' + BASE_DIR);

// ============================================================
// PASO 1: Analizar el código de agent-embassy.js
// ============================================================
log('\n📄 PASO 1: Analizando agent-embassy.js...');
const agentPath = path.join(BASE_DIR, 'agent-embassy.js');
if (!fs.existsSync(agentPath)) {
  log(`❌ No se encontró ${agentPath}`);
  process.exit(1);
}

const content = fs.readFileSync(agentPath, 'utf8');

// Buscar importaciones
const imports = [];
const importRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
let match;
while ((match = importRegex.exec(content)) !== null) {
  imports.push({ name: match[1], source: match[2] });
}
log('📦 Importaciones encontradas:');
imports.forEach(i => log(`   ${i.name} ← ${i.source}`));

// Buscar uso de orquestador
const usesOrquestador = content.includes('Orquestador') || content.includes('orquestador');
log(`\n🔍 ¿Usa Orquestador? ${usesOrquestador ? '✅ SÍ' : '❌ NO'}`);

// Buscar uso de planificador
const usesPlanificador = content.includes('planificador') || content.includes('planificar');
log(`🔍 ¿Usa planificador? ${usesPlanificador ? '✅ SÍ' : '❌ NO'}`);

// Buscar uso de generador-plan
const usesGenerador = content.includes('generador-plan') || content.includes('generarPlan');
log(`🔍 ¿Usa generador-plan? ${usesGenerador ? '✅ SÍ' : '❌ NO'}`);

// Buscar si se instancia Orquestador
const instanciaOrquestador = content.includes('new Orquestador');
log(`🔍 ¿Instancia Orquestador? ${instanciaOrquestador ? '✅ SÍ' : '❌ NO'}`);

// Buscar llamada a ejecutar
const ejecutaOrquestador = content.includes('orquestador.ejecutar');
log(`🔍 ¿Ejecuta orquestador? ${ejecutaOrquestador ? '✅ SÍ' : '❌ NO'}`);

// ============================================================
// PASO 2: Ejecutar una petición real
// ============================================================
log('\n📡 PASO 2: Ejecutando petición real al servidor...');
const imagePath = path.join(BASE_DIR, 'ai.png');
if (!fs.existsSync(imagePath)) {
  log(`❌ Imagen no encontrada: ${imagePath}`);
  process.exit(1);
}

// Limpiar logs del Embassy antes de la petición
exec('pm2 flush dragon3-embassy', (err) => {
  if (err) log(`⚠️ No se pudo limpiar logs: ${err.message}`);

  // Hacer la petición
  const cmd = `curl -s -X POST -F "archivo=@${imagePath}" http://localhost:3000/analizar-imagen-publico > /dev/null 2>&1`;
  exec(cmd, (err) => {
    if (err) log(`⚠️ Error en curl: ${err.message}`);

    // ============================================================
    // PASO 3: Analizar los logs del Embassy
    // ============================================================
    log('\n📜 PASO 3: Analizando logs del Embassy...');
    exec('pm2 logs dragon3-embassy --lines 100 --nostream', (err, logsOut) => {
      if (err) {
        log(`❌ Error recuperando logs: ${err.message}`);
        process.exit(1);
      }

      const lines = logsOut.split('\n');
      const logLines = lines.filter(l => l.trim());

      // Buscar palabras clave
      const keywords = [
        'orquestador', 'Orquestador',
        'planificador', 'planificar',
        'generador-plan', 'generarPlan',
        'ejecutar', 'Ejecutando',
        'plan', 'Plan',
        'célula', 'Célula'
      ];

      log('🔎 Buscando en logs:');
      let found = false;
      keywords.forEach(kw => {
        const foundLines = logLines.filter(l => l.includes(kw));
        if (foundLines.length > 0) {
          found = true;
          log(`   ✅ "${kw}" aparece ${foundLines.length} veces`);
          // Mostrar primeras 3 líneas
          foundLines.slice(0, 3).forEach(line => {
            log(`      ${line.trim().substring(0, 120)}`);
          });
        } else {
          log(`   ❌ "${kw}" NO aparece`);
        }
      });

      if (!found) {
        log('⚠️ No se encontraron palabras clave en los logs.');
      }

      // ============================================================
      // PASO 4: Resumen final
      // ============================================================
      log('\n📊 RESUMEN FINAL');
      if (usesOrquestador && instanciaOrquestador && ejecutaOrquestador) {
        log('✅ El Embassy está configurado para usar el Orquestador.');
        if (found) {
          log('📌 Los logs confirman que el Orquestador se está ejecutando.');
        } else {
          log('⚠️ Los logs no muestran rastro del Orquestador. Puede que falle antes de llegar a la ejecución.');
          log('   Revisa si hay errores en los logs (busca "error" o "Error").');
        }
      } else if (usesPlanificador) {
        log('⚠️ El Embassy parece usar planificador en lugar de orquestador.');
        if (found) {
          log('📌 Los logs confirman que el planificador se está ejecutando.');
        } else {
          log('⚠️ Los logs no muestran rastro del planificador.');
        }
      } else if (usesGenerador) {
        log('⚠️ El Embassy parece usar generador-plan en lugar de orquestador.');
        if (found) {
          log('📌 Los logs confirman que generador-plan se está ejecutando.');
        } else {
          log('⚠️ Los logs no muestran rastro de generador-plan.');
        }
      } else {
        log('❓ No se pudo determinar qué usa el Embassy para ejecutar el plan.');
        log('   Revisa el código de agent-embassy.js manualmente.');
      }

      // Mostrar las primeras 5 líneas de los logs para referencia
      log('\n📄 Primeras 10 líneas de los logs del Embassy:');
      logLines.slice(0, 10).forEach(line => {
        log(`   ${line.substring(0, 150)}`);
      });

      log(`\n📄 Log completo en: ${LOG_FILE}`);
      log('🏁 FIN DEL DIAGNÓSTICO');
    });
  });
});
