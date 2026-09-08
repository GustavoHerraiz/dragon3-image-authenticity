import { analizarImagenMBH } from './analizadorMBH.js';
import sharp from 'sharp';
import fs from 'fs';

async function testStressInCrescendo() {
    const sizeOri = 1000;
    const targetID = 0x000D760;
    const PATH_ORIGINAL = 'temp_stress_original.png';
    const PATH_RESIZE = 'temp_stress_resize.png';

    // 1. GENERACIÓN DEL SELLO PURO (ADN d760)
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

    await sharp(buffer, { raw: { width: sizeOri, height: sizeOri, channels: 4 } }).toFile(PATH_ORIGINAL);

    // 2. ESCALAS DE MUTILACIÓN IN CRESCENDO (De menor a mayor destrucción)
    const escalas = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

    console.log("🔥 INICIANDO TEST DE ESTRÉS 'IN CRESCENDO' 🔥\n");
    console.log("Daño\t| ID Leído | Éxito | Energía\t| Diagnóstico del Motor v95");
    console.log("-------------------------------------------------------------------------");

    for (let factor of escalas) {
        const sizeRes = Math.round(sizeOri * factor);

        // Mutilación con Lanczos3 (destrucción de promedios)
        await sharp(PATH_ORIGINAL).resize(sizeRes, sizeRes, { kernel: 'lanczos3' }).toFile(PATH_RESIZE);

        // El Escáner a prueba
        const res = await analizarImagenMBH(PATH_RESIZE);

        const exito = res.hash === "000D760" ? "✅" : "❌";
        const danoStr = `x${factor}`;

        console.log(`${danoStr}\t| ${res.hash}  |  ${exito}  | ${res.energia.toFixed(4)}\t| ${res.diagnostico.escalaUsada}`);
    }

    // 3. LIMPIEZA DEL LABORATORIO
    if (fs.existsSync(PATH_ORIGINAL)) fs.unlinkSync(PATH_ORIGINAL);
    if (fs.existsSync(PATH_RESIZE)) fs.unlinkSync(PATH_RESIZE);

    console.log("\n[TEST FINALIZADO] Telemetría registrada para Blade Corporation.");
}

testStressInCrescendo();
