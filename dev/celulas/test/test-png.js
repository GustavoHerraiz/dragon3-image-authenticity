import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import detectarTextura from '../celulas/detectar-textura-ruido.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
  const imagePath = path.join(__dirname, '..', 'ai.png');
  
  if (!fs.existsSync(imagePath)) {
    console.log('❌ ai.png no encontrada. ¿Tienes una imagen PNG?');
    return;
  }
  
  const buffer = fs.readFileSync(imagePath);
  const resultado = await detectarTextura({ payload: buffer }, {});
  
  console.log('========================================');
  console.log('🧪 PRUEBA CON PNG');
  console.log('========================================');
  console.log('📁 Archivo: ai.png');
  console.log('📏 Tamaño:', buffer.length, 'bytes');
  console.log('📊 Formato detectado:', resultado.resultado.formatoOriginal);
  console.log('----------------------------------------');
  console.log('🤖 ¿Es IA?', resultado.resultado.esIA);
  console.log('📊 Confianza:', (resultado.resultado.confianza * 100).toFixed(1) + '%');
  console.log('🎯 Decisión:', resultado.resultado.decision);
  console.log('⚖️  Peso:', resultado.resultado.peso);
  console.log('📝 Explicación:', resultado.resultado.explicacion);
  console.log('----------------------------------------');
  console.log('📊 Métricas:');
  console.log('   - Varianza local:', resultado.resultado.varianzaLocalPromedio?.toFixed(2));
  console.log('   - Varianza ruido:', resultado.resultado.varianzaRuido?.toFixed(2));
  console.log('   - Entropía:', resultado.resultado.entropia?.toFixed(3));
  console.log('   - Gradiente:', resultado.resultado.gradientePromedio?.toFixed(2));
  console.log('========================================');
}

test();
