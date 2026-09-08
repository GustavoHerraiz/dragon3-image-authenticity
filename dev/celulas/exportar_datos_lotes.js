import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = 'mongodb+srv://gustavoherraiz:Lobosolitario@proyectodragon.yvzan.mongodb.net/dragon?retryWrites=true&w=majority&appName=ProyectoDragon';

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;

const dir = path.join(__dirname, 'backup_datos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Exportar en lotes de 1000 documentos
const BATCH_SIZE = 1000;
const total = await db.collection('ejecuciones').countDocuments();
console.log('📊 Total documentos:', total);

let offset = 0;
let batchNum = 1;

while (offset < total) {
  const batch = await db.collection('ejecuciones')
    .find()
    .skip(offset)
    .limit(BATCH_SIZE)
    .toArray();
  
  const filePath = path.join(dir, `ejecuciones_parte1_lote_${batchNum}.json`);
  fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
  console.log(`✅ Lote ${batchNum}: ${batch.length} documentos guardados`);
  
  offset += BATCH_SIZE;
  batchNum++;
}

console.log('✅ Exportación completada');
process.exit(0);
