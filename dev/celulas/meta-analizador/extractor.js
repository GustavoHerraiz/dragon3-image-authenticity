/**
 * extractor.js
 * 
 * Extrae datos de MongoDB y los transforma en features para el Meta-Analizador.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la ruta correcta
dotenv.config({ path: path.resolve(__dirname, '../../prod/Dragon3/backend/.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI no está configurado.');

export async function conectarMongo() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');
  }
  return mongoose.connection.db;
}

export async function obtenerEjecuciones(filtro = {}, limite = 0) {  // ✅ 0 = sin límite
  const db = await conectarMongo();
  const collection = db.collection('ejecuciones');
  
  let query = collection.find(filtro).sort({ timestamp: -1 });
  
  if (limite > 0) {
    query = query.limit(limite);
  }
  
  return await query.toArray();
}

export function extraerFeatures(ejecucion) {
  const features = {};
  
  for (const [celulaId, datos] of Object.entries(ejecucion.datosCelulas || {})) {
    features[`${celulaId}_confianza`] = datos.confianza || 0;
    features[`${celulaId}_decision`] = datos.esIA ? 1 : 0;
    features[`${celulaId}_peso`] = datos.peso || 1;
    features[`${celulaId}_tiempo`] = datos.tiempoMs || 0;
  }
  
  features.formato = ejecucion.formato || 'desconocido';
  features.tamañoBytes = ejecucion.tamañoBytes || 0;
  features.tiempoTotalMs = ejecucion.tiempoTotalMs || 0;
  
  features.target_esIA = ejecucion.veredicto?.esIA ? 1 : 0;
  features.target_confianza = ejecucion.veredicto?.confianza || 0;
  
  return features;
}

export async function calcularPrecisionPorCelula(limite = 0) {  // 0 = sin límite
  const ejecuciones = await obtenerEjecuciones({}, limite);
  
  const precision = {};
  let total = 0;
  let conDatos = 0;
  
  for (const ejecucion of ejecuciones) {
    // Verificar si tiene datosCelulas
    if (!ejecucion.datosCelulas || typeof ejecucion.datosCelulas !== 'object') {
      continue;
    }
    
    const veredicto = ejecucion.veredicto?.esIA;
    if (veredicto === undefined) {
      continue;
    }
    
    // Verificar que datosCelulas tenga contenido
    const celulasKeys = Object.keys(ejecucion.datosCelulas);
    if (celulasKeys.length === 0) {
      continue;
    }
    
    total++;
    conDatos++;
    
    // Extraer datos de cada célula
    for (const [celulaId, datos] of Object.entries(ejecucion.datosCelulas)) {
      // Verificar que los datos tengan la estructura esperada
      if (!datos || typeof datos !== 'object') continue;
      
      const esIA = datos.esIA;
      if (esIA === undefined) continue;
      
      if (!precision[celulaId]) {
        precision[celulaId] = { aciertos: 0, total: 0 };
      }
      precision[celulaId].total++;
      if (esIA === veredicto) {
        precision[celulaId].aciertos++;
      }
    }
  }
  
  // Calcular porcentajes
  for (const [celulaId, stats] of Object.entries(precision)) {
    stats.precision = stats.total > 0 ? (stats.aciertos / stats.total) : 0;
  }
  
  console.log(`📊 Ejecuciones procesadas: ${total}`);
  console.log(`📊 Ejecuciones con datosCelulas: ${conDatos}`);
  console.log(`📊 Células con datos: ${Object.keys(precision).length}`);
  
  return { precision, total };
}