const fs = require('fs');
const data = JSON.parse(fs.readFileSync('descarga_test.json', 'utf8'));

const featuresClave = [
  'detectar-textura-ruido.varianzaLocalPromedio',
  'detectar-textura-ruido.entropia',
  'detectar-sombreado.contraste',
  'detectar-colores.saturacionAprox',
  'detectar-artefactos-ia.autocorrelacion'
];

console.log('📊 VALORES DE FEATURES CLAVE POR DOCUMENTO:\n');

for (const key of featuresClave) {
  const [celula, feature] = key.split('.');
  console.log(`🔬 ${key}:`);
  for (let i = 0; i < data.length; i++) {
    const doc = data[i];
    const target = doc.veredicto?.esIA ? 'IA' : 'HUMANO';
    const valor = doc.datosCelulas?.[celula]?.[feature];
    console.log(`  Doc ${i+1} (${target}): ${valor !== undefined ? valor : 'undefined'}`);
  }
  console.log('');
}
