import { analizarImagenMBH } from './analizadorMBH.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function testMutilacionCombinada() {
    const targetID = 0x000D760;
    const sizeOri = 1200; // Un lienzo más grande para tener margen de recorte
    const DIR_TEST = './TEST_MUTILACION_COMBINADA';

    if (!fs.existsSync(DIR_TEST)) fs.mkdirSync(DIR_TEST);

    console.log("🔥 INICIANDO TEST DE ESTRÉS: RESIZE + CROP (Mutilación Doble) 🔥\n");

    // 1. GENERACIÓN DEL SELLO ORIGINAL (ADN d760)
    const buffer = Buffer.alloc(sizeOri * sizeOri * 4, 128);
    for (let i = 3; i < buffer.length; i += 4) buffer[i] = 255;

    const low = targetID & 0x3FFF;
    const high = (targetID >> 14) & 0x3FFF;
    let mix = (low ^ high) * 19;
    const checksum = (mix ^ (mix >> 6)) & 0x0F;
    const payload = (targetID << 4) | checksum;

    const bloquesAncho = sizeOri / 8;
    for (let by = 0; by < (sizeOri / 8); by++) {
        for (let bx = 0; bx < bloquesAncho; bx++) {
            const idx = (by * bloquesAncho + bx) % 64;
            const bit = (payload >>> (31 - Math.floor(idx / 2))) & 1;
            const valor = (idx % 2 === 0) ? (bit ? 50 : -50) : (bit ? -50 : 50);
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    buffer[((by * 8 + i) * sizeOri + (bx * 8 + j)) * 4 + 2] = 128 + valor;
                }
            }
        }
    }

    const imgOriginalPath = path.join(DIR_TEST, 'original_pure.png');
    await sharp(buffer, { raw: { width: sizeOri, height: sizeOri, channels: 4 } }).toFile(imgOriginalPath);

    // 2. ESCENARIOS DE TORTURA
    const escenarios = [
        { resize: 0.8, crop: 100 }, // Reducir al 80% y quitar 100px de margen
        { resize: 0.7, crop: 150 }, // Reducir al 70% y quitar 150px de margen
        { resize: 0.6, crop: 50 },  // Reducir al 60% y quitar 50px de margen
        { resize: 0.4, crop: 200 }  // Reducir al 40% y quitar 200px de margen (NIVEL CRÍTICO)
    ];

    console.log("Resize\t| Recorte\t| ID Leído | Estado | Energía\t| Escala");
    console.log("---------------------------------------------------------------------------------");

    for (let esc of escenarios) {
        const sizeRes = Math.round(sizeOri * esc.resize);
        const tempPath = path.join(DIR_TEST, `tmp_R${esc.resize}_C${esc.crop}.png`);

        // Aplicamos Resize y luego Crop
        await sharp(imgOriginalPath)
            .resize(sizeRes, sizeRes, { kernel: 'lanczos3' })
            .extract({ left: esc.crop, top: esc.crop, width: sizeRes - (esc.crop * 2), height: sizeRes - (esc.crop * 2) })
            .toFile(tempPath);

        // Análisis forense
        const res = await analizarImagenMBH(tempPath);

        const exito = res.hash === "000D760" ? "✅ OK" : "❌ FAIL";
        console.log(`${esc.resize}\t| -${esc.crop}px\t| ${res.hash}  | ${exito}  | ${res.energia.toFixed(2)}\t| ${res.diagnostico.escalaUsada}`);

        fs.unlinkSync(tempPath);
    }

    console.log("\n[TEST FINALIZADO] El Motor Espacial ha intentado re-sincronizar el grado 0.");
}

testMutilacionCombinada();
