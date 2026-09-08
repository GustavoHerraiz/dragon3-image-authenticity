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

// Features que necesita el ML
const featuresNecesarios = [
  'varianzaLocalPromedio',
  'entropia',
  'gradientePromedio',
  'varianzaRuido',
  'autocorrelacionNormalizada',
  'saturacionAprox',
  'temperatura',
  'dominancia',
  'variacionCromatica',
  'variacionBrillo',
  'contraste',
  'gradienteLuz',
  'brilloCuadrantes',
  'iluminacionUniforme',
  'contrasteAnormal',
  'sombrasInconsistentes',
  'nitidez',
  'desviacion',
  'decision',
  'puntuacionIA',
  'puntuacionHumano',
  'formato',
  'tamañoBytes',
  'confianza',
  'esIA',
  'peso',
  'tiempoMs'
];

console.log('🔍 VERIFICANDO FEATURES PARA ML:');
console.log('');

let totalFeatures = 0;
let featuresFaltantes = [];

for (const [nombre, datos] of Object.entries(celulas)) {
  const campos = Object.keys(datos);
  let encontrados = 0;
  
  for (const feature of featuresNecesarios) {
    if (campos.includes(feature)) {
      encontrados++;
    } else {
      featuresFaltantes.push(nombre + ': ' + feature);
    }
  }
  
  console.log('🔬 ' + nombre + ': ' + encontrados + '/' + featuresNecesarios.length + ' features');
  totalFeatures += encontrados;
}

console.log('');
console.log('📊 TOTAL: ' + totalFeatures + ' features encontrados');
console.log('📊 ESPERADO: ' + (featuresNecesarios.length * Object.keys(celulas).length));

if (featuresFaltantes.length > 0) {
  console.log('');
  console.log('⚠️ FEATURES FALTANTES:');
  for (const f of featuresFaltantes) {
    console.log('   - ' + f);
  }
} else {
  console.log('');
  console.log('✅ TODOS LOS FEATURES ESTÁN PRESENTES EN TODAS LAS CÉLULAS');
}

process.exit(0);
