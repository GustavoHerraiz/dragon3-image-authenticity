import { analizarImagenMBH } from './analizador_v5.js';
import fs from 'fs';
import path from 'path';

// Buscamos la última imagen generada en la carpeta capturas
const directorio = './capturas';
const archivos = fs.readdirSync(directorio)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, time: fs.statSync(path.join(directorio, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

if (archivos.length === 0) {
    console.log("❌ No hay capturas para analizar.");
    process.exit();
}

const ultimaCaptura = path.join(directorio, archivos[0].name);

console.log(`🔍 Analizando última evidencia: ${ultimaCaptura}...`);

analizarImagenMBH(ultimaCaptura).then(resultado => {
    console.log("\n--- 🛡️ VEREDICTO DEL ANALIZADOR ---");
    console.log(JSON.stringify(resultado, null, 2));

    if (resultado.identificado) {
        console.log("\n✅ ÉXITO: El Analizador ha detectado el sello oculto en los píxeles.");
    } else {
        console.log("\n❌ ERROR: El Analizador no encuentra la marca (Revisar intensidad).");
    }
});
