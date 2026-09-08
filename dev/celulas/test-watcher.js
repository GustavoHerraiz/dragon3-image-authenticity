import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Orquestador from './orquestador.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../prod/Dragon3/backend/.env') });

function resolverRutaImagen(carpeta) {
  const rutas = [
    path.resolve(__dirname, carpeta),
    path.resolve(__dirname, '../../prod/Dragon3/test.jpg'),
    path.resolve(__dirname, '../../prod/Dragon3/backend/unico.png'),
    path.resolve('/opt/dragon3/prod/Dragon3/test.jpg')
  ];

  for (const ruta of rutas) {
    if (fs.existsSync(ruta)) {
      if (fs.statSync(ruta).isDirectory()) {
        const archivos = fs.readdirSync(ruta).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        if (archivos.length > 0) return path.join(ruta, archivos[0]);
        continue;
      }
      return ruta;
    }
  }

  throw new Error('No se encontró ninguna imagen válida para ejecutar la prueba.');
}

await mongoose.connect(process.env.MONGO_URI);

const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orquestador = new Orquestador(plan);

// Tomar la primera imagen de hot/humanas/
const rutaImagen = resolverRutaImagen('./dataset/hot/humanas');
console.log('📸 Probando con:', path.basename(rutaImagen));

const buffer = fs.readFileSync(rutaImagen);
const entrada = { archivo: buffer.toString('base64'), nombreOriginal: 'test.jpg' };

const resultado = await orquestador.ejecutar(entrada);

console.log('✅ Plan ejecutado. CorrelationId:', resultado.correlationId);

// Verificar MongoDB
const db = mongoose.connection.db;
const doc = await db.collection('ejecuciones').findOne({ correlationId: resultado.correlationId });

if (doc) {
  console.log('📊 Documento guardado:');
  console.log('   Número de células:', Object.keys(doc.datosCelulas || {}).length);
  const primera = Object.values(doc.datosCelulas || {})[0];
  console.log('   Confianza de primera célula:', primera?.confianza);
  console.log('   esIA de primera célula:', primera?.esIA);
  console.log('   Peso de primera célula:', primera?.peso);
} else {
  console.log('❌ No se encontró el documento en MongoDB');
}

process.exit(0);
