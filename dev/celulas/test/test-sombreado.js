import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import detectarSombreado from '../celulas/detectar-sombreado.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testSombreado(imagenPath, nombre) {
  console.log(`\n========================================`);
  console.log(`🧪 PRUEBA SOMBREADO: ${nombre}`);
  console.log(`========================================`);
  
  try {
    const buffer = fs.readFileSync(imagenPath);
    const resultado = await detectarSombreado({ payload: buffer }, {});
    
    console.log('📊 DETECTOR DE SOMBREADO');
    console.log('✅ Éxito:', resultado.exito);
    console.log('🎯 Decisión:', resultado.resultado.decision);
    console.log('📊 Confianza:', (resultado.resultado.confianza * 100).toFixed(0) + '%');
    console.log('⚖️  Peso:', resultado.resultado.peso);
    console.log('📝 Explicación:', resultado.resultado.explicacion);
    console.log('📊 Métricas:');
    console.log('   - Variación brillo:', resultado.resultado.variacionBrillo?.toFixed(1));
    console.log('   - Contraste:', resultado.resultado.contraste?.toFixed(0));
    console.log('   - Gradiente luz:', resultado.resultado.gradienteLuz?.toFixed(1));
    console.log('   - Iluminación uniforme:', resultado.resultado.iluminacionUniforme);
    console.log('   - Contraste anormal:', resultado.resultado.contrasteAnormal);
    console.log('   - Gradiente anormal:', resultado.resultado.gradienteAnormal);
    console.log('   - Sombras inconsistentes:', resultado.resultado.sombrasInconsistentes);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

const basePath = path.join(__dirname, '..');
await testSombreado(path.join(basePath, 'ai.jpg'), 'AI (ai.jpg)');
await testSombreado(path.join(basePath, 'prueba.jpg'), 'HUMANA (prueba.jpg)');

console.log('\n========================================');
console.log('✅ PRUEBAS COMPLETADAS');
console.log('========================================\n');
