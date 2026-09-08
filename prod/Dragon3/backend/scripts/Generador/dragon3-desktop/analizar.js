// analizar.js
import { analizarImagenMBH } from './src/backend/analizador_v5.js';
import { DragonDB } from './src/backend/database.js';

const db = new DragonDB();
await db._ensureOpen();

const ruta = 'C:\\Users\\Administrador\\Desktop\\Imagenes para Dragon\\Fotos mobil\\carpetaraiz\\Argentona\\IMG_20180728_143049_GHL_000000C.png';

const resultado = await analizarImagenMBH(ruta, db, 30000);
console.log('📊 Resultado análisis:', resultado);

await db.cerrar();