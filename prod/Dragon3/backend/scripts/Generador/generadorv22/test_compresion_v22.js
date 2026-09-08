import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v22 } from './analizadorMBH_v22.js'; // <--- IMPORTACIÓN V22

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGEN_ORIGINAL = path.join(__dirname, 'Atardecer.jpg');
const RUTA_MAESTRA = path.join(__dirname, 'maestra_v22.png');
const RESULTADOS_DIR = path.join(__dirname, 'TEST_V22_RESONANCIA');

async function ejecutarNena2() {
    console.log(`\n============================================================`);
    console.log(`🐉 DRAGON3 NENA 2: PROTOCOLO DE RESONANCIA 5/2`);
    console.log(`============================================================\n`);

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ ERROR: No se encuentra 'Atardecer.jpg'.`);
        return;
    }
    if (!fs.existsSync(RESULTADOS_DIR)) fs.mkdirSync(RESULTADOS_DIR);

    console.log(`[1/2] 🛠️  INYECTANDO SELLO d760...`);
    const generador = new GeneradorMBH_v18();
    await generador.sellarImagen(IMAGEN_ORIGINAL, RUTA_MAESTRA, { hash_suffix: 'd760' });
    console.log(`✅ Autor d760 (Quico Melero) vinculado al lienzo.\n`);

    console.log(`[2/2] 🚀 ESCANEO QUIRÚRGICO (17 PUNTOS DE ORO)...`);
    
    const calidades = [90, 70, 50, 30]; // Calidades de ataque

    for (const q of calidades) {
        const rutaAtaque = path.join(RESULTADOS_DIR, `nena2_q${q}.jpg`);
        await sharp(RUTA_MAESTRA).jpeg({ quality: q }).toFile(rutaAtaque);

        const tStart = Date.now();
        const res = await analizadorImagenMBH_v22(rutaAtaque);
        const latencia = Date.now() - tStart;

        if (res.response.identificado) {
            console.log(`────────────────────────────────────────────────────────────`);
            console.log(`✅ Q${q} | ADN: ${res.response.dni_obra} | Hits: ${res.response.hits}`);
            console.log(`   📊 Resonancia: ${res.response.resonancia} (Deriva: ${res.response.deriva})`);
            console.log(`   ⚡ Energía Media Bulto: ${res.response.energia_bulto}`);
            console.log(`   💎 Veredicto: ${res.response.veredicto}`);
        } else {
            console.log(`❌ Q${q} | Sin señal detectable.`);
        }    }
    console.log(`\n============================================================`);
}

ejecutarNena2().catch(console.error);