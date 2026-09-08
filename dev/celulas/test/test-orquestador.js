import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Orquestador from '../orquestador.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testOrquestador() {
  console.log('========================================');
  console.log('🧪 TEST ORQUESTADOR V2 - PARALELISMO');
  console.log('========================================\n');
  
  // Cargar el plan (está en la carpeta /planes)
  const planPath = path.join(__dirname, '..', 'planes', 'analizar-imagen-completa.json');
  console.log(`📂 Buscando plan en: ${planPath}`);
  
  if (!fs.existsSync(planPath)) {
    console.error(`❌ No se encuentra el plan en: ${planPath}`);
    console.log('📂 Contenido de /planes:');
    const planesDir = path.join(__dirname, '..', 'planes');
    if (fs.existsSync(planesDir)) {
      const files = fs.readdirSync(planesDir);
      files.forEach(f => console.log(`   - ${f}`));
    } else {
      console.log('   ❌ La carpeta /planes no existe');
    }
    return;
  }
  
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  console.log('✅ Plan cargado:', plan.nombre);
  
  // Crear orquestador
  const orquestador = new Orquestador(plan);
  
  // Preparar entrada (imagen de prueba)
  const imagePath = path.join(__dirname, '..', 'ai.jpg');
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ No se encuentra la imagen: ${imagePath}`);
    return;
  }
  
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  
  const entrada = {
    archivo: base64,
    nombreOriginal: 'ai.jpg',
    tipoArchivo: 'imagen'
  };
  
  console.log('📤 Entrada preparada:');
  console.log(`   - Archivo: ai.jpg`);
  console.log(`   - Tamaño: ${buffer.length} bytes`);
  console.log(`   - Tipo: imagen\n`);
  
  // Ejecutar
  const inicio = performance.now();
  const resultado = await orquestador.ejecutar(entrada);
  const total = performance.now() - inicio;
  
  console.log('\n========================================');
  console.log('📊 RESULTADOS DEL TEST');
  console.log('========================================');
  console.log('✅ Éxito:', resultado.resultado ? true : false);
  console.log('🤖 ¿Es IA?', resultado.resultado?.esIA);
  console.log('📊 Confianza:', resultado.resultado?.confianza);
  console.log('⏱️  Tiempo total:', total.toFixed(2), 'ms');
  console.log('📊 Telemetría:', resultado.telemetria.length, 'células');
  console.log('🔑 CorrelationId:', resultado.correlationId);
  
  console.log('\n========================================');
  console.log('📊 ANÁLISIS DE TIEMPOS POR FASE');
  console.log('========================================');
  
  // Mostrar tiempos por célula (ordenados)
  resultado.telemetria.forEach(t => {
    const emoji = t.exito ? '✅' : '❌';
    console.log(`   ${emoji} ${t.celulaId}: ${t.tiempoMs.toFixed(2)}ms`);
  });
  
  console.log('\n========================================');
  console.log('📊 ANÁLISIS DE PARALELISMO');
  console.log('========================================');
  
  // Detectar células que podrían haberse ejecutado en paralelo
  const independientes = ['detectar-patrones-forenses', 'detectar-artefactos-ia', 
                          'detectar-textura-ruido', 'detectar-colores', 'detectar-sombreado'];
  
  const tiemposIndependientes = resultado.telemetria
    .filter(t => independientes.includes(t.celulaId))
    .map(t => t.tiempoMs);
  
  if (tiemposIndependientes.length > 0) {
    const maxTiempo = Math.max(...tiemposIndependientes);
    const sumaTiempos = tiemposIndependientes.reduce((a, b) => a + b, 0);
    
    console.log(`   📊 Células independientes (${tiemposIndependientes.length}):`);
    console.log(`      - Suma de tiempos secuencial: ${sumaTiempos.toFixed(2)}ms`);
    console.log(`      - Máximo tiempo (paralelo): ${maxTiempo.toFixed(2)}ms`);
    console.log(`      - Ahorro estimado: ${(sumaTiempos - maxTiempo).toFixed(2)}ms (${((1 - maxTiempo/sumaTiempos) * 100).toFixed(0)}%)`);
    
    if (sumaTiempos > maxTiempo * 1.5) {
      console.log(`   ✅ EL PARALELISMO ESTÁ FUNCIONANDO`);
    } else {
      console.log(`   ⚠️ EL PARALELISMO PODRÍA NO ESTAR FUNCIONANDO`);
    }
  }
  
  console.log('\n========================================');
  console.log('✅ TEST COMPLETADO');
  console.log('========================================\n');
}

testOrquestador().catch(console.error);
