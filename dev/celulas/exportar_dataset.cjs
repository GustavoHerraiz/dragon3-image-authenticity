const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const docs = await db.collection('ejecuciones').find().toArray();

  // Cargar features válidas (las que definimos antes)
  const featuresValidas = JSON.parse(fs.readFileSync('test_mover/resultados/features_validas.json', 'utf8'));

  const dataset = [];
  for (const doc of docs) {
    const row = {};
    const celdas = doc.datosCelulas || {};
    // Extraer features
    for (const [celula, lista] of Object.entries(featuresValidas)) {
      const celda = celdas[celula] || {};
      for (const feature of lista) {
        const key = celula + '.' + feature;
        const value = celda[feature];
        row[key] = (value !== undefined && value !== null) ? value : null;
      }
    }
    // Target real desde comentarioFeedback
    const comentario = doc.comentarioFeedback || '';
    let target;
    if (comentario.includes('IA')) target = 1;
    else if (comentario.includes('humano')) target = 0;
    else target = -1; // desconocido
    row.target = target;
    dataset.push(row);
  }

  fs.writeFileSync('dataset_10.json', JSON.stringify(dataset, null, 2));
  console.log('✅ Dataset guardado en dataset_10.json');
  console.log(`📊 ${dataset.length} registros`);
  process.exit(0);
})();
