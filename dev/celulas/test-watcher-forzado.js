import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Orquestador from './orquestador.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../prod/Dragon3/backend/.env') });

await mongoose.connect(process.env.MONGO_URI);

const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orquestador = new Orquestador(plan);

// Tomar la primera imagen de hot/humanas/
const dir = './dataset/hot/humanas/';
const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
const nombre = files[0];
console.log('📸 Probando con:', nombre);

const buffer = fs.readFileSync(path.join(dir, nombre));
const entrada = { archivo: buffer.toString('base64'), nombreOriginal: 'test.jpg' };

const resultado = await orquestador.ejecutar(entrada);

console.log('✅ Plan ejecutado. CorrelationId:', resultado.correlationId);

// --- FORZAR GUARDADO MANUAL ---
const db = mongoose.connection.db;
const collection = db.collection('ejecuciones');

// Verificar si ya existe
const existe = await collection.findOne({ correlationId: resultado.correlationId });
if (existe) {
  console.log('⚠️ El documento ya existe en MongoDB');
} else {
  console.log('📝 Creando documento manualmente...');
  
  const telemetria = resultado.telemetria || [];
  const extension = 'jpg';
  
  const datosCelulas = {};
  for (const t of telemetria) {
    const datos = t.datosCompletos || {};
    datosCelulas[t.celulaId] = {
      esIA: datos.esIA ?? false,
      confianza: datos.confianza ?? 0,
      peso: datos.peso ?? 1,
      tiempoMs: t.tiempoMs || 0,
      exito: t.exito !== false
    };
  }
  
  const veredicto = resultado.resultado || {};
  
  const nuevoDoc = {
    correlationId: resultado.correlationId,
    timestamp: new Date(),
    formato: extension,
    tamañoBytes: buffer.length,
    veredicto: {
      esIA: veredicto.esIA ?? false,
      confianza: veredicto.confianza ?? 0,
      explicacion: veredicto.explicacion || ''
    },
    correccionHumana: true,
    comentarioFeedback: 'Dataset watcher - test forzado',
    datosCelulas: datosCelulas,
    tiempoTotalMs: resultado.tiempoTotal || 0,
    telemetria: telemetria.map(t => ({
      celulaId: t.celulaId,
      tiempoMs: t.tiempoMs || 0,
      exito: t.exito !== false,
      error: t.error || null
    })),
    contexto: {
      agenteId: 'dataset-watcher',
      planId: 'analizar-imagen-completa',
      origen: 'dataset'
    }
  };
  
  await collection.insertOne(nuevoDoc);
  console.log('✅ Documento creado forzadamente');
}

// Verificar el documento guardado
const doc = await collection.findOne({ correlationId: resultado.correlationId });
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
