import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import detectarBordes from '../celulas/detectar-bordes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testBordes(imagenPath, nombre) {
  console.log(`\n========================================`);
  console.log(`🧪 PRUEBA BORDES: ${nombre}`);
  console.log(`========================================`);
  
  try {
    // Verificar que la imagen existe
    if (!fs.existsSync(imagenPath)) {
      console.error(`❌ Imagen no encontrada: ${imagenPath}`);
      return;
    }
    
    const buffer = fs.readFileSync(imagenPath);
    console.log(`📁 Imagen cargada: ${buffer.length} bytes`);
    
    const resultado = await detectarBordes({ payload: buffer }, {});
    
    console.log('📊 RESULTADO:');
    console.log('✅ Éxito:', resultado.exito);
    console.log('🎯 Decisión:', resultado.resultado?.decision);
    console.log('📊 Confianza:', resultado.resultado?.confianza !== undefined ? (resultado.resultado.confianza * 100).toFixed(0) + '%' : 'undefined');
    console.log('⚖️  Peso:', resultado.resultado?.peso);
    console.log('📝 Explicación:', resultado.resultado?.explicacion);
    console.log('📊 Métricas:');
    console.log('   - Nitidez:', resultado.resultado?.nitidez?.toFixed(2) ?? 'undefined');
    console.log('   - Desviación:', resultado.resultado?.desviacion?.toFixed(2) ?? 'undefined');
    console.log('   - Puntuación IA:', resultado.resultado?.puntuacionIA?.toFixed(2) ?? 'undefined');
    console.log('   - Puntuación Humano:', resultado.resultado?.puntuacionHumano?.toFixed(2) ?? 'undefined');
    
    if (resultado.error) {
      console.log('❌ Error:', resultado.error);
    }
    
  } catch (error) {
    console.error('❌ Excepción:', error.message);
    console.error(error.stack);
  }
}

const basePath = path.join(__dirname, '..');
await testBordes(path.join(basePath, 'ai.jpg'), 'AI (ai.jpg)');
await testBordes(path.join(basePath, 'prueba.jpg'), 'HUMANA (prueba.jpg)');

console.log('\n========================================');
console.log('✅ PRUEBAS COMPLETADAS');
console.log('========================================\n');
