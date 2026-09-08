const fs = require('fs');
const data = JSON.parse(fs.readFileSync('descarga_test.json', 'utf8'));

// Cargar lista de features válidas
const featuresValidas = JSON.parse(fs.readFileSync('features_validas.json', 'utf8'));

// Extraer todas las features planas con su valor por documento
const todasLasFeatures = {};
const targets = [];

for (let i = 0; i < data.length; i++) {
  const doc = data[i];
  const celdas = doc.datosCelulas || {};
  const target = doc.veredicto?.esIA ? 1 : 0;
  targets.push(target);

  for (const [celula, lista] of Object.entries(featuresValidas)) {
    const celda = celdas[celula] || {};
    for (const feature of lista) {
      const key = celula + '.' + feature;
      const value = celda[feature];
      if (!todasLasFeatures[key]) todasLasFeatures[key] = [];
      // Si es objeto, lo guardamos como string o lo ignoramos
      if (typeof value === 'object' && value !== null) {
        todasLasFeatures[key].push(JSON.stringify(value));
      } else {
        todasLasFeatures[key].push(value !== undefined ? value : null);
      }
    }
  }
}

// Función para calcular estadísticas
function analizarFeature(values, targets) {
  const humanos = [];
  const ia = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || v === '') continue;
    const num = parseFloat(v);
    if (isNaN(num)) continue;
    if (targets[i] === 0) humanos.push(num);
    else ia.push(num);
  }

  if (humanos.length === 0 && ia.length === 0) return null;
  if (humanos.length === 0 || ia.length === 0) {
    return { utilidad: 'DESCARTAR', motivo: 'Solo una clase tiene valores' };
  }

  const mediaH = humanos.reduce((a,b) => a + b, 0) / humanos.length;
  const mediaI = ia.reduce((a,b) => a + b, 0) / ia.length;
  const diff = Math.abs(mediaH - mediaI);
  const maxMedia = Math.max(mediaH, mediaI);
  const diffRel = maxMedia > 0 ? diff / maxMedia : 0;

  // Detectar si es constante (desviación muy baja)
  const all = [...humanos, ...ia];
  const meanAll = all.reduce((a,b) => a + b, 0) / all.length;
  const stdAll = Math.sqrt(all.reduce((a,b) => a + (b - meanAll) ** 2, 0) / all.length);
  const cv = meanAll !== 0 ? stdAll / Math.abs(meanAll) : Infinity;

  let utilidad = 'BAJA';
  let motivo = '';

  if (cv < 0.05) {
    utilidad = 'DESCARTAR';
    motivo = 'Valor casi constante (CV < 5%)';
  } else if (diffRel > 0.3) {
    utilidad = 'ALTA';
    motivo = `Diferencia significativa (${(diffRel * 100).toFixed(0)}%)`;
  } else if (diffRel > 0.15) {
    utilidad = 'MEDIA';
    motivo = `Diferencia moderada (${(diffRel * 100).toFixed(0)}%)`;
  } else {
    utilidad = 'BAJA';
    motivo = `Poca diferencia (${(diffRel * 100).toFixed(0)}%)`;
  }

  return {
    utilidad,
    motivo,
    mediaHumano: mediaH,
    mediaIA: mediaI,
    diff: diff,
    diffRel: diffRel,
    cv: cv,
    muestras: { humanos: humanos.length, ia: ia.length }
  };
}

// Analizar cada feature
console.log('📊 ANÁLISIS DE FEATURES PARA RANDOM FOREST\n');
console.log('Clasificación: ALTA | MEDIA | BAJA | DESCARTAR\n');

const resultados = {};
for (const [key, values] of Object.entries(todasLasFeatures)) {
  const analisis = analizarFeature(values, targets);
  if (analisis) {
    resultados[key] = analisis;
  }
}

// Agrupar por utilidad
const grupos = { ALTA: [], MEDIA: [], BAJA: [], DESCARTAR: [] };
for (const [key, info] of Object.entries(resultados)) {
  grupos[info.utilidad].push({ key, ...info });
}

console.log('🔴 DESCARTAR (no útiles):');
for (const item of grupos.DESCARTAR) {
  console.log(`  ❌ ${item.key}: ${item.motivo}`);
}
console.log('');

console.log('🟡 BAJA (poco útiles):');
for (const item of grupos.BAJA) {
  console.log(`  ⚠️ ${item.key}: ${item.motivo}`);
}
console.log('');

console.log('🟠 MEDIA (útiles moderadas):');
for (const item of grupos.MEDIA) {
  console.log(`  📊 ${item.key}: ${item.motivo}`);
}
console.log('');

console.log('🟢 ALTA (muy útiles):');
for (const item of grupos.ALTA) {
  console.log(`  ✅ ${item.key}: ${item.motivo}`);
}
console.log('');

console.log('📊 RESUMEN FINAL:');
console.log(`  ALTA: ${grupos.ALTA.length}`);
console.log(`  MEDIA: ${grupos.MEDIA.length}`);
console.log(`  BAJA: ${grupos.BAJA.length}`);
console.log(`  DESCARTAR: ${grupos.DESCARTAR.length}`);
console.log(`  TOTAL ANALIZADAS: ${Object.keys(resultados).length}`);
