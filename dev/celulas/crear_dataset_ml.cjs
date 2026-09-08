const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const docs = await db.collection('ejecuciones').find().sort({ timestamp: -1 }).limit(10).toArray();

  const featuresValidas = JSON.parse(fs.readFileSync('test_mover/resultados/features_validas.json', 'utf8'));

  const dataset = [];
  for (const doc of docs) {
    const row = {};
    const celdas = doc.datosCelulas || {};
    for (const [celula, lista] of Object.entries(featuresValidas)) {
      const celda = celdas[celula] || {};
      for (const feature of lista) {
        const key = celula + '.' + feature;
        const value = celda[feature];
        row[key] = (value !== undefined && value !== null) ? value : null;
      }
    }
    // Target real
    const target = doc.comentarioFeedback || '';
    row.target = target.includes('IA') ? 1 : 0;
    dataset.push(row);
  }

  // Guardar dataset
  fs.writeFileSync('dataset_ml.json', JSON.stringify(dataset, null, 2));
  console.log('✅ Dataset guardado en dataset_ml.json');
  console.log(`📊 ${dataset.length} registros`);
  process.exit(0);
})();
