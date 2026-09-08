import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Orquestador from './orquestador.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const plan = JSON.parse(fs.readFileSync('./planes/analizar-imagen-completa.json', 'utf8'));
const orquestador = new Orquestador(plan);

const rutaImagen = resolverRutaImagen('./dataset/hot/ia');
console.log('📸 Probando con:', path.basename(rutaImagen));
const buffer = fs.readFileSync(rutaImagen);
const entrada = { archivo: buffer.toString('base64'), nombreOriginal: 'test.jpg' };

const resultado = await orquestador.ejecutar(entrada);

console.log('🔍 Estructura de resultado:');
console.log('📋 Claves principales:', Object.keys(resultado));
console.log('📋 resultado.resultado:', Object.keys(resultado.resultado || {}));

if (resultado.resultado?.detalles?.resultados) {
  console.log('📋 Primer resultado:', JSON.stringify(resultado.resultado.detalles.resultados[0], null, 2));
} else {
  console.log('⚠️ No hay resultados en detalles');
}

process.exit(0);
