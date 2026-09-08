import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI no está configurado.');

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;

console.log('📦 Haciendo backup de ejecuciones...');

const ejecuciones = await db.collection('ejecuciones').find().toArray();

const backupDir = path.join(__dirname, 'backup_mongo');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = Date.now();
const filePath = path.join(backupDir, 'ejecuciones_' + timestamp + '.json');
fs.writeFileSync(filePath, JSON.stringify(ejecuciones, null, 2));

console.log('✅ Backup guardado en:', filePath);
console.log('📊 Total documentos:', ejecuciones.length);

process.exit(0);
