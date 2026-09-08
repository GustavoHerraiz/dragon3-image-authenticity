const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const docs = await db.collection('ejecuciones').find().sort({ timestamp: -1 }).limit(10).toArray();

  console.log('📊 ETIQUETA REAL vs VEREDICTO DEL SISTEMA:\n');
  let aciertos = 0;
  for (const doc of docs) {
    const real = doc.comentarioFeedback || 'sin-etiqueta';
    const pred = doc.veredicto?.esIA ? 'IA' : 'HUMANO';
    const acierto = (real.includes('IA') && pred === 'IA') || (real.includes('HUMANO') && pred === 'HUMANO');
    if (acierto) aciertos++;
    console.log(`  Real: ${real} → Pred: ${pred} → ${acierto ? '✅' : '❌'}`);
  }
  console.log(`\n✅ Aciertos: ${aciertos}/${docs.length}`);
  process.exit(0);
})();
