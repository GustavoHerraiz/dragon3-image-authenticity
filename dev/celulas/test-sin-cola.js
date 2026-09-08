import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Importar directamente una célula que no usa cola
import detectarTextura from './celulas/detectar-textura-ruido.js';

const rutaImagen = resolverRutaImagen('./dataset/hot/ia');
console.log('📸 Probando con:', path.basename(rutaImagen));
const buffer = fs.readFileSync(rutaImagen);

const entrada = { payload: buffer };
const resultado = await detectarTextura(entrada, {});

console.log('\n📊 Resultado de detectar-textura-ruido:');
console.log('   esIA:', resultado.resultado?.esIA);
console.log('   confianza:', resultado.resultado?.confianza);
console.log('   peso:', resultado.resultado?.peso);
console.log('   decision:', resultado.resultado?.decision);

process.exit(0);
