import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar directamente una célula que no usa cola
import detectarTextura from './celulas/detectar-textura-ruido.js';

const files = fs.readdirSync('./dataset/hot/ia/');
const nombre = files[0];
console.log('📸 Probando con:', nombre);
const buffer = fs.readFileSync(`./dataset/hot/ia/${nombre}`);

const entrada = { payload: buffer };
const resultado = await detectarTextura(entrada, {});

console.log('\n📊 Resultado de detectar-textura-ruido:');
console.log('   esIA:', resultado.resultado?.esIA);
console.log('   confianza:', resultado.resultado?.confianza);
console.log('   peso:', resultado.resultado?.peso);
console.log('   decision:', resultado.resultado?.decision);

process.exit(0);
