import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v21 } from './analizadorMBH_v21.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGEN_ORIGINAL = path.join(__dirname, 'Atardecer.jpg');
const RUTA_MAESTRA = path.join(__dirname, 'maestra_v21.png');
const RESULTADOS_DIR = path.join(__dirname, 'TEST_V21_SCALPEL');

async function ejecutarTestEstresV21() {
    console.log(`\n============================================================`);
    console.log(`🐉 DRAGON3 V21 GOLD: TEST DE DERIVA REAL (ATAQUE 30°)`);
    console.log(`============================================================\n`);

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ ERROR: No se encuentra 'Atardecer.jpg'.`);
        return;
    }
    if (!fs.existsSync(RESULTADOS_DIR)) fs.mkdirSync(RESULTADOS_DIR);

    console.log(`[1/3] 🛠️  GENERANDO MAESTRA ORIGINAL (V18)...`);
    const generador = new GeneradorMBH_v18();
    await generador.sellarImagen(IMAGEN_ORIGINAL, RUTA_MAESTRA, { hash_suffix: 'd760' });
    console.log(`✅ Sello d760 inyectado (Quico Melero).\n`);

    const GIRO_ATAQUE = 30.00;
    const calidades = [90, 70, 50, 30, 10];

    console.log(`[2/3] 🚀 LANZANDO ATAQUE: Giro ${GIRO_ATAQUE}° + Chroma 4:2:0`);

    for (const q of calidades) {
        const rutaAtaque = path.join(RESULTADOS_DIR, `ataque_g${GIRO_ATAQUE}_q${q}.jpg`);

        await sharp(RUTA_MAESTRA)
            .rotate(GIRO_ATAQUE)
            .jpeg({ quality: q, chromaSubsampling: '4:2:0' })
            .toFile(rutaAtaque);

        const tStart = Date.now();
        const res = await analizadorImagenMBH_v21(rutaAtaque);
        const latencia = Date.now() - tStart;

        const status = res.response.identificado ? "✅" : "❌";
        const hits = res.response.evidencia_visual?.Hits || 0;
        const autor = res.response.evidencia_visual?.Cliente || "DESCONOCIDO";
        const angDetectado = res.response.rotacion_detectada || "---";

        console.log(`────────────────────────────────────────────────────────────`);
        console.log(`${status} Q${q} | ⏱️ ${latencia}ms | Autor: ${autor} | Hits: ${hits}`);
        if (res.response.identificado) {
            console.log(`   🎯 Deriva Detectada: ${angDetectado}°`);
        }
    }

    console.log(`\n============================================================`);
    console.log(`🏁 TEST DE DERIVA FINALIZADO`);
    console.log(`============================================================\n`);
}

ejecutarTestEstresV21().catch(console.error);
