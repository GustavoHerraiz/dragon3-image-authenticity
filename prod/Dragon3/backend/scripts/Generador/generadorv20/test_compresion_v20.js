import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v20 } from './analizadorMBH_v20.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGEN_ORIGINAL = path.join(__dirname, 'Atardecer.jpg');
const RUTA_MAESTRA = path.join(__dirname, 'maestra_v20.png');
const RESULTADOS_DIR = path.join(__dirname, 'TEST_ESTRES_V20');

async function ejecutarTestEstres() {
    console.log(`\n============================================================`);
    console.log(`🐉 DRAGON3 V20 GOLD: TEST DE RESISTENCIA (GIRO + JPEG)`);
    console.log(`============================================================\n`);

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ ERROR: No se encuentra 'Atardecer.jpg'`);
        return;
    }
    if (!fs.existsSync(RESULTADOS_DIR)) fs.mkdirSync(RESULTADOS_DIR);

    // --- 1. GENERACIÓN ---
    console.log(`[1/3] 🛠️  GENERANDO MAESTRA ORIGINAL...`);
    const generador = new GeneradorMBH_v18();
    await generador.sellarImagen(IMAGEN_ORIGINAL, RUTA_MAESTRA, { hash_suffix: 'd760' });
    console.log(`✅ Sello d760 inyectado.\n`);

    // --- 2. ATAQUES ---
    console.log(`[2/3] 🚀 INICIANDO ATAQUES: Giro 15° + Calidad 90 -> 10`);
    const calidades = [90, 80, 70, 60, 50, 40, 30, 20, 10];
    const GIRO_ATAQUE = 15;

    for (const q of calidades) {
        const rutaAtaque = path.join(RESULTADOS_DIR, `ataque_g${GIRO_ATAQUE}_q${q}.jpg`);

        // Aplicamos la rotación y la compresión simultáneamente
        await sharp(RUTA_MAESTRA)
            .rotate(GIRO_ATAQUE)
            .jpeg({ quality: q })
            .toFile(rutaAtaque);

        const tStart = Date.now();
        const res = await analizadorImagenMBH_v20(rutaAtaque);
        const tEnd = Date.now();

        const status = res.response.identificado ? "✅" : "❌";
        const hits = res.response.evidencia_visual?.Hits_Totales || 0;
        const angulo = res.response.rotacion_detectada || "---";

        console.log(`────────────────────────────────────────────────────────────`);
        console.log(`${status} JPG Q${q} | ⏱️ ${tEnd - tStart}ms`);
        if (res.response.identificado) {
            console.log(`   🎯 Hits: ${hits} | Ángulo Detectado: ${angulo}`);
        } else {
            console.log(`   ⚠️ SEÑAL PERDIDA: El ruido JPG Q${q} asfixió la señal.`);
        }
    }
}

ejecutarTestEstres().catch(console.error);
