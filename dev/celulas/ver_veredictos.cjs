const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const docs = await db.collection('ejecuciones').find().sort({ timestamp: -1 }).limit(10).toArray();

  console.log('📊 VEREDICTOS POR CÉLULA Y FINAL:\n');
  for (const doc of docs) {
    const id = doc._id.toString().slice(-6);
    const celdas = doc.datosCelulas || {};
    const final = doc.veredicto?.esIA ? 'IA' : 'HUMANO';
    const conf = doc.veredicto?.confianza || 0;
    console.log(`📄 Documento ${id}: FINAL = ${final} (${conf})`);
    
    const nombres = Object.keys(celdas).filter(c => c !== 'cargar-imagen' && c !== 'generar-veredicto');
    for (const nombre of nombres) {
      const celda = celdas[nombre];
      const esIA = celda.esIA;
      const confCel = celda.confianza;
      if (esIA !== undefined && esIA !== null) {
        console.log(`   ${nombre}: ${esIA ? 'IA' : 'HUMANO'} (conf: ${confCel})`);
      }
    }
    console.log('');
  }
  process.exit(0);
})();
