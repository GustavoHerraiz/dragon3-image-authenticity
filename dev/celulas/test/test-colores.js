import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import detectarColores from '../celulas/detectar-colores.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testColores(imagenPath, nombre) {
  console.log(`\n========================================`);
  console.log(`🧪 PRUEBA: ${nombre}`);
  console.log(`========================================`);
  
  try {
    const buffer = fs.readFileSync(imagenPath);
    const resultado = await detectarColores({ payload: buffer }, {});
    
    console.log('📊 DETECTOR DE COLORES');
    console.log('✅ Éxito:', resultado.exito);
    console.log('🎯 Decisión:', resultado.resultado.decision);
    console.log('📊 Confianza:', (resultado.resultado.confianza * 100).toFixed(0) + '%');
    console.log('⚖️  Peso:', resultado.resultado.peso);
    console.log('📝 Explicación:', resultado.resultado.explicacion);
    console.log('📊 Métricas:');
    console.log('   - Saturación:', resultado.resultado.saturacionAprox?.toFixed(0));
    console.log('   - Temperatura:', resultado.resultado.temperatura);
    console.log('   - Dominancia:', resultado.resultado.dominancia?.toFixed(0) + '%');
    console.log('   - Variación cromática:', resultado.resultado.variacionCromatica?.toFixed(0));
    console.log('   - Piel irreal:', resultado.resultado.porcentajePielIrreal?.toFixed(0) + '%');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Prueba con IA
const basePath = path.join(__dirname, '..');
await testColores(path.join(basePath, 'ai.jpg'), 'AI (ai.jpg)');

// Prueba con Humana
await testColores(path.join(basePath, 'prueba.jpg'), 'HUMANA (prueba.jpg)');

console.log('\n========================================');
console.log('✅ PRUEBAS COMPLETADAS');
console.log('========================================\n');
