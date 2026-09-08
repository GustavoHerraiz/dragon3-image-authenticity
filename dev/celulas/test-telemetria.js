import fs from 'fs';
import Orquestador from './orquestador.js';

const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orquestador = new Orquestador(plan);

const files = fs.readdirSync('./dataset/hot/ia/');
const nombre = files[0];
console.log('📸 Probando con:', nombre);
const buffer = fs.readFileSync(`./dataset/hot/ia/${nombre}`);
const entrada = { archivo: buffer.toString('base64'), nombreOriginal: 'test.jpg' };

console.log('⏳ Ejecutando orquestador...');
const resultado = await orquestador.ejecutar(entrada);
console.log('✅ Orquestador finalizado');

console.log('\n📊 Telemetría completa:');
for (const item of resultado.telemetria) {
  console.log(`\n📌 ${item.celulaId}:`);
  console.log(`   esIA: ${item.datosCompletos?.esIA}`);
  console.log(`   confianza: ${item.datosCompletos?.confianza}`);
  console.log(`   peso: ${item.datosCompletos?.peso}`);
}

process.exit(0);
