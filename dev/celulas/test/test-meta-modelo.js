import { analizarYRecomendar } from '../meta-analizador/modelo.js';

const { stats, recomendaciones } = await analizarYRecomendar();

console.log('\n📊 ESTADÍSTICAS:');
console.log(`   Total ejecuciones: ${stats.total}`);
console.log(`   Células: ${Object.keys(stats.porCelula).length}`);

console.log('\n📊 PRECISIÓN POR CÉLULA:');
for (const [celulaId, data] of Object.entries(stats.porCelula)) {
  const pct = (data.precision * 100).toFixed(1);
  const estado = data.estado;
  const emoji = estado === 'buena' ? '🟢' : estado === 'media' ? '🟡' : '🔴';
  console.log(`   ${emoji} ${celulaId}: ${pct}% (${data.aciertos}/${data.total})`);
}

console.log('\n📊 RECOMENDACIONES:');
if (recomendaciones.length === 0) {
  console.log('   ✅ No hay recomendaciones (todo funciona bien)');
} else {
  for (const r of recomendaciones) {
    const prio = r.prioridad === 'alta' ? '🔥' : '📌';
    console.log(`   ${prio} [${r.tipo}] ${r.mensaje}`);
    console.log(`      → ${r.sugerencia}`);
  }
}

process.exit(0);
