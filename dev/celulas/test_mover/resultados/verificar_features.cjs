const fs = require('fs');
const data = JSON.parse(fs.readFileSync('descarga_test.json', 'utf8'));
const featuresValidas = JSON.parse(fs.readFileSync('features_validas.json', 'utf8'));

const resultados = {};

for (let i = 0; i < data.length; i++) {
  const doc = data[i];
  const celdas = doc.datosCelulas || {};
  const docId = doc._id || `doc-${i}`;
  resultados[docId] = {};

  for (const [celula, lista] of Object.entries(featuresValidas)) {
    const celda = celdas[celula] || {};
    const faltantes = [];
    for (const feature of lista) {
      if (!(feature in celda) || celda[feature] === null || celda[feature] === undefined) {
        faltantes.push(feature);
      }
    }
    resultados[docId][celula] = {
      total: lista.length,
      presentes: lista.length - faltantes.length,
      faltantes: faltantes
    };
  }
}

console.log('📊 VERIFICACIÓN DE FEATURES POR DOCUMENTO:\n');

for (const [docId, celdas] of Object.entries(resultados)) {
  console.log('📄 Documento:', docId);
  let ok = true;
  for (const [celula, stats] of Object.entries(celdas)) {
    const estado = stats.faltantes.length === 0 ? '✅' : '❌';
    console.log(`  ${estado} ${celula}: ${stats.presentes}/${stats.total}`);
    if (stats.faltantes.length > 0) {
      console.log(`     Faltan: ${stats.faltantes.join(', ')}`);
      ok = false;
    }
  }
  console.log(`  ${ok ? '✅ TODAS LAS FEATURES PRESENTES' : '❌ FALTAN FEATURES'}`);
  console.log('');
}

// Resumen global
console.log('📊 RESUMEN GLOBAL:');
const totalDocs = data.length;
const celdasConFaltantes = {};

for (const [docId, celdas] of Object.entries(resultados)) {
  for (const [celula, stats] of Object.entries(celdas)) {
    if (stats.faltantes.length > 0) {
      if (!celdasConFaltantes[celula]) celdasConFaltantes[celula] = 0;
      celdasConFaltantes[celula]++;
    }
  }
}

console.log('Células con features faltantes en algunos documentos:');
for (const [celula, count] of Object.entries(celdasConFaltantes)) {
  console.log(`  ${celula}: ${count}/${totalDocs} documentos con faltantes`);
}
