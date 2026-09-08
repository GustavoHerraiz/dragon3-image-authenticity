const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const docs = await db.collection('ejecuciones').find().sort({ timestamp: -1 }).limit(10).toArray();

  console.log('\n📊 ETIQUETA REAL SEGÚN CARPETA DE ORIGEN:\n');
  for (const doc of docs) {
    const id = doc._id.toString().slice(-6);
    const comentario = doc.comentarioFeedback || 'sin-etiqueta';
    const nombre = doc.nombreOriginal || 'sin-nombre';
    const veredicto = doc.veredicto?.esIA ? 'IA' : 'HUMANO';
    console.log(`  ${id}: ${comentario} | ${nombre} | Veredicto: ${veredicto}`);
  }
  process.exit(0);
})();
