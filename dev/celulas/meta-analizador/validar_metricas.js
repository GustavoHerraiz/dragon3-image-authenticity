/**
 * validar_metricas.js
 * Valida que las ejecuciones en MongoDB tengan métricas internas
 */

import mongoose from 'mongoose';

const MONGO_URI = 'MONGO_URI_FROM_ENV';

async function validarMetricas() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const collection = db.collection('ejecuciones');

  const total = await collection.countDocuments();
  const conMetricas = await collection.countDocuments({
  'datosCelulas.detectar-textura-ruido.varianzaLocalPromedio': { $exists: true }
});
  console.log('📊 VALIDACIÓN DE MÉTRICAS:');
  console.log(`   Total ejecuciones: ${total}`);
  console.log(`   Con métricas internas: ${conMetricas}`);
  console.log(`   Sin métricas: ${total - conMetricas}`);
  console.log(`   Porcentaje con métricas: ${(conMetricas / total * 100).toFixed(1)}%`);

  process.exit(0);
}

validarMetricas().catch(console.error);