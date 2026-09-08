import { calcularPrecisionPorCelula } from '../meta-analizador/extractor.js';

const { precision, total } = await calcularPrecisionPorCelula();

console.log(`📊 Total ejecuciones analizadas: ${total}`);
console.log('\n📊 PRECISIÓN POR CÉLULA:');
for (const [celulaId, stats] of Object.entries(precision)) {
  const pct = (stats.precision * 100).toFixed(1);
  console.log(`   ${celulaId}: ${pct}% (${stats.aciertos}/${stats.total})`);
}
process.exit(0);
