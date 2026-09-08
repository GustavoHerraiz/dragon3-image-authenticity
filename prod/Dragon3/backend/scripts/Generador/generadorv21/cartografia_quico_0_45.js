import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v21 } from './analizadorMBH_v21.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGEN_BASE = path.join(__dirname, 'Atardecer.jpg');
const MAESTRA = path.join(__dirname, 'quico_maestra_carto.png');
const RESULTADOS_JSON = path.join(__dirname, 'CARTA_NAVEGACION_QUICO.json');

async function iniciarCartografia() {
    console.log(`\n============================================================`);
    console.log(`🛡️  DRAGON3: CARTOGRAFÍA SOBERANA V21.186 (0°-45°)`);
    console.log(`📍 DISTANCIA BLOQUEADA: 32.3`);
    console.log(`============================================================\n`);

    const generador = new GeneradorMBH_v18();

    // 🛠️ FORZAMOS LA MALLA 32.3 EN LA INYECCIÓN [cite: 2025-12-27]
    await generador.sellarImagen(IMAGEN_BASE, MAESTRA, {
        hash_suffix: 'd760',
        distancia: 32.3  // <--- ESTO ES LO QUE FALTABA
    });

    console.log(`✅ MAESTRA GENERADA CON MALLA 32.3`);

    const tabla = [];

    for (let grado = 45; grado <= 90; grado++) {
    process.stdout.write(`📐 [${grado}/90] Escaneando... `);

    const temp = path.join(__dirname, `temp_step_${grado}.jpg`);
    await sharp(MAESTRA).rotate(grado).jpeg({ quality: 30 }).toFile(temp);

    // Pasamos el grado para que el analizador centre el sensor
    const res = await analizadorImagenMBH_v21(temp, grado);

    if (res.response.identificado) {
        const ang = parseFloat(res.response.rotacion_detectada);
        const data = { ataque: grado, real: ang.toFixed(3), deriva: (ang - grado).toFixed(3), hits: res.response.evidencia_visual.Hits };
        tabla.push(data);
        process.stdout.write(`✅ SINCRO: ${ang.toFixed(3)}° | Hits: ${data.hits}\n`);
    } else {
        process.stdout.write(`❌ PUNTO CIEGO\n`);
    }

    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    fs.writeFileSync(RESULTADOS_JSON, JSON.stringify(tabla, null, 2));
}
}

iniciarCartografia().catch(console.error);
