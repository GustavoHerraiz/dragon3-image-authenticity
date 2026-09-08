/**
 * TEST PARA RASTREAR POR QUÉ NO SE EJECUTA generar-veredicto
 * 
 * 1. Llama al servidor con una imagen PNG.
 * 2. Captura los logs del Embassy durante la ejecución.
 * 3. Analiza la respuesta y los logs para determinar si generar-veredicto se ejecutó.
 * 4. Muestra un resumen claro de lo que falla.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.resolve(__dirname, '..');
const LOG_FILE = '/tmp/rastreo_generar_veredicto.log';
fs.writeFileSync(LOG_FILE, '');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

log('🚀 INICIO RASTREO DE generar-veredicto');

const imagePath = path.join(BASE_DIR, 'ai.png');
if (!fs.existsSync(imagePath)) {
  log(`❌ Imagen no encontrada: ${imagePath}`);
  process.exit(1);
}
log(`✅ Imagen: ${imagePath}`);

// 1. Limpiar logs del Embassy antes de la prueba
log('\n🧹 Limpiando logs del Embassy...');
exec('pm2 flush dragon3-embassy', (err) => {
  if (err) log(`⚠️ No se pudo limpiar logs: ${err.message}`);
});

// 2. Hacer la llamada al servidor
log('\n📡 Llamando al servidor...');
const cmd = `curl -s -X POST -F "archivo=@${imagePath}" http://localhost:3000/analizar-imagen-publico`;

exec(cmd, (error, stdout, stderr) => {
  if (error) {
    log(`❌ Error en curl: ${error.message}`);
    process.exit(1);
  }

  log('📄 Respuesta del servidor recibida.');

  // 3. Analizar respuesta JSON
  let data;
  try {
    data = JSON.parse(stdout);
    log('✅ Respuesta JSON válida');
  } catch (e) {
    log(`❌ No se pudo parsear JSON: ${e.message}`);
    log(`Respuesta: ${stdout}`);
    process.exit(1);
  }

  const decision = data.resumen?.decision || data.resultado?.decision || 'desconocido';
  const confianza = data.resumen?.confianza || data.resultado?.confianza || 'N/A';
  log(`📌 Decisión final: ${decision}`);
  log(`📌 Confianza: ${confianza}`);

  // 4. Verificar si generar-veredicto está en los resultados
  let genVerdictoPresente = false;
  if (data.detalles?.resultados) {
    const gen = data.detalles.resultados.find(r => r.celula === 'generar-veredicto');
    if (gen) {
      genVerdictoPresente = true;
      log(`✅ generar-veredicto ENCONTRADO en resultados`);
      log(`   esIA: ${gen.esIA}, confianza: ${gen.confianza}`);
    } else {
      log(`❌ generar-veredicto NO está en resultados`);
    }
  } else {
    log('⚠️ No hay "resultados" en la respuesta');
  }

  // 5. Verificar si ml está presente (no debería, porque es PNG)
  const ml = data.detalles?.analizadores?.ml || data.resultado?.detalles?.analizadores?.ml;
  if (ml) {
    log(`⚠️ ML está presente (no debería en PNG)`);
  } else {
    log(`✅ ML NO está presente (correcto para PNG)`);
  }

  // 6. Recuperar los logs del Embassy después de la llamada
  log('\n📜 Recuperando logs del Embassy (últimas 30 líneas)...');
  exec('pm2 logs dragon3-embassy --lines 30 --nostream', (err, logsOut) => {
    if (err) {
      log(`⚠️ Error recuperando logs: ${err.message}`);
    } else {
      log('📄 Logs del Embassy:');
      const lines = logsOut.split('\n');
      let foundGenerar = false;
      let foundError = false;
      lines.forEach(line => {
        if (line.includes('generar-veredicto')) {
          foundGenerar = true;
          log(`   🔍 ${line.trim()}`);
        }
        if (line.includes('error') || line.includes('Error')) {
          foundError = true;
          log(`   ⚠️ ${line.trim()}`);
        }
        // También buscar el parche
        if (line.includes('PARCHE') || line.includes('inyectado') || line.includes('forzando')) {
          log(`   🔧 ${line.trim()}`);
        }
      });
      if (!foundGenerar) {
        log('❌ NO se encontró ninguna línea con "generar-veredicto" en los logs del Embassy.');
        log('   Esto confirma que la célula no se ejecutó o no generó logs.');
      }
      if (!foundError) {
        log('✅ No se encontraron errores obvios en los logs.');
      }
    }

    // 7. Resumen final
    log('\n📊 RESUMEN FINAL');
    if (genVerdictoPresente) {
      if (decision === 'IA' || decision === 'ia') {
        log('🎉 ÉXITO: generar-veredicto se ejecuta y la imagen se clasifica como IA.');
      } else {
        log('⚠️ generar-veredicto se ejecuta pero la decisión final es humano.');
        log('   Los ajustes PNG pueden no estar surtiendo efecto.');
      }
    } else {
      log('❌ generar-veredicto NO se ejecuta en el flujo real.');
      log('   Posibles causas:');
      log('   - El plan no la incluye (verificar analizar-imagen-sin-ml.json).');
      log('   - El orquestador no la ejecuta (revisar clasificación de células).');
      log('   - El Embassy no está usando el orquestador correctamente.');
      log('   - El parche en agent-embassy.js no se está ejecutando.');
      log('   - Hay un error de sintaxis en generar-veredicto.js que impide su ejecución.');
    }

    log(`\n📄 Log completo en: ${LOG_FILE}`);
    log('🏁 FIN DEL RASTREO');
  });
});
