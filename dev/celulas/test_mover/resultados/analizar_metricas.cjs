const fs = require('fs');
const data = JSON.parse(fs.readFileSync('descarga_test.json', 'utf8'));

const metricasPorCelula = {};

for (const doc of data) {
  const celdas = doc.datosCelulas || {};
  for (const [nombre, celda] of Object.entries(celdas)) {
    if (!metricasPorCelula[nombre]) {
      metricasPorCelula[nombre] = {};
    }
    const keys = Object.keys(celda).filter(k => 
      celda[k] !== null && 
      celda[k] !== undefined &&
      typeof celda[k] !== 'object' &&
      k !== '_id' &&
      k !== 'timestamp' &&
      k !== 'correlationId'
    );
    for (const k of keys) {
      metricasPorCelula[nombre][k] = (metricasPorCelula[nombre][k] || 0) + 1;
    }
  }
}

console.log('📊 MÉTRICAS POR CÉLULA:\n');
for (const [celula, metricas] of Object.entries(metricasPorCelula)) {
  const keys = Object.keys(metricas).sort();
  console.log('🔬 ' + celula + ': ' + keys.length + ' metricas');
  console.log('   ' + keys.join(', '));
  console.log('');
}

// Células con solo campos básicos
console.log('❌ CÉLULAS CON SOLO CAMPOS BÁSICOS (probablemente fallan):');
for (const [celula, metricas] of Object.entries(metricasPorCelula)) {
  const keys = Object.keys(metricas);
  const basicos = ['esIA','confianza','peso','tiempoMs','exito'];
  const soloBasicos = keys.every(k => basicos.includes(k));
  if (soloBasicos && keys.length <= 5) {
    console.log('  - ' + celula);
  }
}
