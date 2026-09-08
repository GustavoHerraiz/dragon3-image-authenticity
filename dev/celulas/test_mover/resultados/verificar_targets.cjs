const fs = require('fs');
const data = JSON.parse(fs.readFileSync('descarga_test.json', 'utf8'));

console.log('📊 TARGET DE CADA DOCUMENTO:\n');
for (let i = 0; i < data.length; i++) {
  const doc = data[i];
  const target = doc.veredicto?.esIA ? 'IA' : 'HUMANO';
  const confianza = doc.veredicto?.confianza || 0;
  console.log(`  Doc ${i+1}: ${target} (${confianza})`);
}
