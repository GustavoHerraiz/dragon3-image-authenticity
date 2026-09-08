import fs from 'fs';
import Orquestador from './orquestador.js';

const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orquestador = new Orquestador(plan);

const files = fs.readdirSync('./dataset/hot/ia/');
if (files.length === 0) {
  console.log('❌ No hay imágenes en hot/ia/');
  process.exit(1);
}

const nombre = files[0];
console.log('📸 Probando con:', nombre);
const buffer = fs.readFileSync(`./dataset/hot/ia/${nombre}`);
const entrada = { archivo: buffer.toString('base64'), nombreOriginal: 'test.jpg' };

const resultado = await orquestador.ejecutar(entrada);

console.log('🔍 Estructura de resultado:');
console.log('📋 Claves principales:', Object.keys(resultado));
console.log('📋 resultado.resultado:', Object.keys(resultado.resultado || {}));

if (resultado.resultado?.detalles?.resultados) {
  console.log('📋 Primer resultado:', JSON.stringify(resultado.resultado.detalles.resultados[0], null, 2));
} else {
  console.log('⚠️ No hay resultados en detalles');
}

process.exit(0);
