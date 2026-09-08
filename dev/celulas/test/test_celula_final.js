import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const celulaML = (await import('../celulas/celula-ml.js')).default;

const IMAGEN_PATH = path.join(__dirname, '../prueba.jpg');
const buffer = fs.readFileSync(IMAGEN_PATH);
const base64 = buffer.toString('base64');

console.log('🧪 TEST CÉLULA ML FINAL\n');
const t0 = performance.now();
const res = await celulaML({ payload: { buffer: base64 } }, {});
const dt = performance.now() - t0;

console.log('RESULTADO:');
console.log(`  esIA: ${res.resultado?.esIA}`);
console.log(`  confianza: ${res.resultado?.confianza}`);
console.log(`  explicacion: ${res.resultado?.explicacion}`);
console.log(`  exito: ${res.exito}`);
console.log(`  telemetria:`, res.telemetria);
console.log(`  tiempo total test: ${dt.toFixed(2)} ms`);
