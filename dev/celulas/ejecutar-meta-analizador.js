/**
 * ejecutar-meta-analizador.js
 * 
 * Script para ejecutar el Meta-Analizador automáticamente.
 * Guarda las recomendaciones en MongoDB y envía alertas.
 */

import { analizarYRecomendar } from './meta-analizador/modelo.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../prod/Dragon3/backend/.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI no está configurado.');

async function ejecutar() {
  console.log('🧠 [Meta-Analizador] Ejecutando análisis automático...');
  console.log(`📅 ${new Date().toISOString()}`);
  
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado a MongoDB');
    
    // Ejecutar análisis
    const { stats, recomendaciones } = await analizarYRecomendar(0);  // 0 = sin límite
    
    // Guardar recomendaciones en MongoDB
    const db = mongoose.connection.db;
    const collection = db.collection('recomendaciones');
    
    // Limpiar recomendaciones antiguas (mantener historial)
    // await collection.deleteMany({ timestamp: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } });
    
    const doc = {
      timestamp: new Date(),
      totalEjecuciones: stats.total,
      totalCelulas: Object.keys(stats.porCelula).length,
      precisionPorCelula: stats.porCelula,
      precisionPorContexto: stats.porContexto,
      recomendaciones: recomendaciones,
      aplicadas: false
    };
    
    await collection.insertOne(doc);
    console.log(`✅ Recomendaciones guardadas (${recomendaciones.length})`);
    
    // Mostrar recomendaciones
    console.log('\n📊 RECOMENDACIONES:');
    if (recomendaciones.length === 0) {
      console.log('   ✅ No hay recomendaciones (todo funciona bien)');
    } else {
      for (const r of recomendaciones) {
        const prio = r.prioridad === 'alta' ? '🔥' : '📌';
        console.log(`   ${prio} [${r.tipo}] ${r.mensaje}`);
        console.log(`      → ${r.sugerencia}`);
      }
    }
    
    // Guardar en archivo de log
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, `meta-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${recomendaciones.length} recomendaciones\n`);
    
    console.log(`\n✅ Análisis completado. Log guardado en: ${logPath}`);
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

ejecutar();
