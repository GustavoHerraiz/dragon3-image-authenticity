import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = 'MONGO_URI_FROM_ENV';

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;

const ejecuciones = await db.collection('ejecuciones').find().toArray();
console.log('📊 Total exportadas:', ejecuciones.length);

const dir = path.join(__dirname, 'backup_datos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const filePath = path.join(dir, 'ejecuciones_parte1.json');
fs.writeFileSync(filePath, JSON.stringify(ejecuciones, null, 2));

console.log('✅ Guardado en:', filePath);
process.exit(0);
