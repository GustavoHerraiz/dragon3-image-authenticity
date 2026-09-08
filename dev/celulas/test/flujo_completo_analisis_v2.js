/**
 * TEST DE FLUJO COMPLETO (con impresión del contenido de las variables)
 * 
 * Muestra el contenido completo de la respuesta del servidor y de
 * las variables internas para depurar.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, '..');
const LOG_FILE = '/tmp/flujo_completo_analisis_v2.log';
fs.writeFileSync(LOG_FILE, '');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

log('🚀 INICIO TEST FLUJO COMPLETO (con impresión de contenido)');

// ============================================================
// PASO 0: Verificar log en orquestador.js
// ============================================================
log('\n🔧 PASO 0: Verificando log en orquestador.js...');
const orquestadorPath = path.join(BASE_DIR, 'orquestador.js');
let orquestadorContent = fs.readFileSync(orquestadorPath, 'utf8');

if (!orquestadorContent.includes('/tmp/orquestador_celulas.log')) {
  log('⚠️ El log no está en orquestador.js. Añadiéndolo...');
  orquestadorContent = orquestadorContent.replace(
    /const modulo = await import\(path\.resolve\(celula\.ruta\)\);/,
    `const modulo = await import(path.resolve(celula.ruta));\n  const fs = require("fs");\n  fs.appendFileSync("/tmp/orquestador_celulas.log", \`[\${new Date().toISOString()}] Ejecutando célula: \${celula.id}\\n\`);`
  );
  fs.writeFileSync(orquestadorPath, orquestadorContent);
  log('✅ Log añadido en orquestador.js');
  exec('pm2 restart dragon3-embassy --update-env', (err) => {
    if (err) log(`⚠️ Error reiniciando Embassy: ${err.message}`);
    else log('✅ Embassy reiniciado');
  });
  setTimeout(() => continuarTest(), 2000);
} else {
  log('✅ El log ya está activo en orquestador.js');
  continuarTest();
}

function continuarTest() {
  // ============================================================
  // PASO 1: Limpiar archivos de log
  // ============================================================
  log('\n🧹 Limpiando archivos de log...');
  try {
    fs.writeFileSync('/tmp/orquestador_celulas.log', '');
    fs.writeFileSync('/tmp/parche.log', '');
    log('✅ Archivos limpiados');
  } catch (e) {
    log(`⚠️ No se pudo limpiar: ${e.message}`);
  }

  // ============================================================
  // PASO 2: Preparar imagen
  // ============================================================
  const imagePath = path.join(BASE_DIR, 'ai.png');
  if (!fs.existsSync(imagePath)) {
    log(`❌ Imagen no encontrada: ${imagePath}`);
    process.exit(1);
  }
  log(`✅ Imagen cargada: ${imagePath}`);

  // ============================================================
  // PASO 3: Ejecutar curl
  // ============================================================
  log('\n📡 Ejecutando curl...');
  const cmd = `curl -s -X POST -F "archivo=@${imagePath}" http://localhost:3000/analizar-imagen-publico`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      log(`❌ Error en curl: ${error.message}`);
      log(`stderr: ${stderr}`);
      process.exit(1);
    }

    log('📄 Respuesta del servidor recibida.');

    // ============================================================
    // PASO 4: Analizar respuesta JSON
    // ============================================================
    let data;
    try {
      data = JSON.parse(stdout);
      log('✅ Respuesta JSON válida');
    } catch (e) {
      log(`❌ No se pudo parsear JSON: ${e.message}`);
      log(`Respuesta cruda: ${stdout}`);
      process.exit(1);
    }

    // ============================================================
    // PASO 5: Mostrar el contenido COMPLETO de la respuesta
    // ============================================================
    log('\n📄 CONTENIDO COMPLETO DE LA RESPUESTA (data):');
    log(JSON.stringify(data, null, 2).substring(0, 2000) + '... (truncado)');

    // ============================================================
    // PASO 6: Extraer y mostrar variables específicas
    // ============================================================
    const decision = data.resumen?.decision || data.resultado?.decision || 'desconocido';
    const confianza = data.resumen?.confianza || data.resultado?.confianza || 'N/A';
    log(`\n📌 Decisión final: ${decision}`);
    log(`📌 Confianza: ${confianza}`);

    // Verificar si ml está presente
    const ml = data.detalles?.analizadores?.ml || data.resultado?.detalles?.analizadores?.ml;
    if (ml) {
      log(`⚠️ ML está presente (no debería en PNG)`);
    } else {
      log(`✅ ML NO está presente (correcto para PNG)`);
    }

    // Verificar si generar-veredicto está en la respuesta
    let genVerdictoPresente = false;
    if (data.detalles?.resultados) {
      const gen = data.detalles.resultados.find(r => r.celula === 'generar-veredicto');
      if (gen) {
        genVerdictoPresente = true;
        log(`✅ generar-veredicto ENCONTRADO en resultados`);
        log(`   esIA: ${gen.esIA}, confianza: ${gen.confianza}`);
        log(`   Contenido de generar-veredicto: ${JSON.stringify(gen, null, 2)}`);
      } else {
        log(`❌ generar-veredicto NO está en resultados`);
      }
    } else {
      log('⚠️ No hay "resultados" en la respuesta');
    }

    // 🔥 Mostrar el contenido de resultado.generar_veredicto si existe
    const resultadoBruto = data.resultado || data;
    if (resultadoBruto.generar_veredicto) {
      log('\n🔥 resultado.generar_veredicto ENCONTRADO en la respuesta:');
      log(JSON.stringify(resultadoBruto.generar_veredicto, null, 2));
    } else {
      log('\n❌ resultado.generar_veredicto NO está en la respuesta.');
    }

    // Mostrar el contenido de detalles.resultados si existe
    if (resultadoBruto.detalles?.resultados) {
      log('\n📋 detalles.resultados ENCONTRADO:');
      log(JSON.stringify(resultadoBruto.detalles.resultados, null, 2));
    } else {
      log('\n❌ detalles.resultados NO está en la respuesta.');
    }

    // ============================================================
    // PASO 7: Leer logs del orquestador y parche
    // ============================================================
    log('\n📜 Leyendo /tmp/orquestador_celulas.log...');
    let orquestadorLog = '';
    try {
      orquestadorLog = fs.readFileSync('/tmp/orquestador_celulas.log', 'utf8');
    } catch (e) {
      log(`⚠️ No se pudo leer: ${e.message}`);
    }

    if (orquestadorLog.trim()) {
      const lines = orquestadorLog.split('\n').filter(l => l.trim());
      log(`📄 Contenido del archivo (${lines.length} líneas):`);
      lines.forEach(line => log(`   ${line}`));
      const tieneGenerar = orquestadorLog.includes('generar-veredicto');
      if (tieneGenerar) {
        log('\n✅ ORQUESTADOR EJECUTÓ generar-veredicto');
      } else {
        log('\n❌ ORQUESTADOR NO EJECUTÓ generar-veredicto');
      }
    } else {
      log('⚠️ El archivo del orquestador está vacío.');
    }

    log('\n📜 Leyendo /tmp/parche.log...');
    let parcheLog = '';
    try {
      parcheLog = fs.readFileSync('/tmp/parche.log', 'utf8');
    } catch (e) {
      log(`⚠️ No se pudo leer: ${e.message}`);
    }

    if (parcheLog.trim()) {
      log(`📄 Contenido del archivo: ${parcheLog.trim()}`);
      log('✅ EL PARCHE SE EJECUTÓ');
    } else {
      log('⚠️ El archivo del parche está vacío.');
      log('❌ EL PARCHE NO SE EJECUTÓ');
    }

    // ============================================================
    // PASO 8: Resumen final
    // ============================================================
    log('\n📊 RESUMEN FINAL');
    if (orquestadorLog.includes('generar-veredicto')) {
      log('✅ El ORQUESTADOR ejecuta generar-veredicto.');
      if (parcheLog.trim()) {
        log('✅ El PARCHE se ejecuta correctamente.');
        if (genVerdictoPresente) {
          log('✅ Y la respuesta del servidor incluye generar-veredicto.');
          if (decision === 'IA' || decision === 'ia') {
            log('🎉 ÉXITO: La imagen se clasifica como IA.');
          } else {
            log('⚠️ La decisión final es humano. Los ajustes PNG pueden no estar funcionando.');
          }
        } else {
          log('❌ Pero la respuesta del servidor NO incluye generar-veredicto.');
          log('   El problema está en el adaptador FAANG: no está procesando generar_veredicto.');
          log('   Revisa adaptadorResultado.js y asegúrate de que incluye generar_veredicto en resultados.');
        }
      } else {
        log('❌ El PARCHE NO se ejecuta.');
        log('   Revisa el error "fs2 is not defined" en los logs.');
      }
    } else {
      log('❌ El ORQUESTADOR NO ejecuta generar-veredicto.');
      log('   Revisa el plan y la lógica de clasificación.');
    }

    log(`\n📄 Log completo en: ${LOG_FILE}`);
    log('🏁 FIN DEL TEST');
  });
}
