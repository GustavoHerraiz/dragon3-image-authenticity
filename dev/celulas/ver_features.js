import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '../../prod/Dragon3/backend/.env' });

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const doc = await db.collection('ejecuciones')
  .find()
  .sort({ timestamp: -1 })
  .limit(1)
  .toArray();

const celulas = doc[0].datosCelulas || {};
console.log('📊 FEATURES DISPONIBLES POR CÉLULA:');
console.log('');

for (const [nombre, datos] of Object.entries(celulas)) {
  const campos = Object.keys(datos);
  console.log('🔬 ' + nombre + ':');
  console.log('   Campos: ' + campos.length);
  console.log('   ' + campos.join(', '));
  console.log('');
}

let total = 0;
for (const datos of Object.values(celulas)) {
  total += Object.keys(datos).length;
}
console.log('📋 TOTAL DE FEATURES POR CÉLULA:');
console.log('   ' + total + ' campos en total');

process.exit(0);
