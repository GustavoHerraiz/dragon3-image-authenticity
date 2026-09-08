import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const celula = (await import('./celula-features.js')).default;

const IMAGEN_PATH = path.join(__dirname, '../prueba.jpg');
const buffer = fs.readFileSync(IMAGEN_PATH);
const base64 = buffer.toString('base64');

console.log('🧪 Test célula features con prueba.jpg\n');

const entrada = { payload: { buffer: base64 } };
const t0 = performance.now();
const res = await celula(entrada, {});
const dt = performance.now() - t0;

console.log('RESULTADO:');
console.log(`  exito: ${res.exito}`);
if (!res.exito) {
  console.log(`  error: ${res.error}`);
  process.exit(1);
}

console.log(`  features: ${Object.keys(res.resultado.features).length} grupos`);
console.log(`  telemetria:`, res.resultado.telemetria);
console.log(`\n  📊 DETALLE DE FEATURES:`);
for (const [key, value] of Object.entries(res.resultado.features)) {
  if (key === '_telemetria') continue;
  console.log(`  - ${key}: ${typeof value === 'object' ? Object.keys(value).length : 'valor único'}`);
}
console.log(`\n⏱️ Tiempo total test: ${dt.toFixed(2)} ms`);
