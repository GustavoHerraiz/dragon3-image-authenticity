import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH.js';

// CONFIGURACIÓN DE ESCANEO
const CONFIG = {
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 },
    BLOCK_SIZE: 8,
    CHANNEL_IDX: 2
};

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

async function generarMapaCalor(inputBuffer, width, height, nombre) {
    console.log(`🔥 Generando mapa SHARPEN para: ${nombre}...`);
    const heatMapBuffer = Buffer.alloc(width * height);
    const u1 = CONFIG.FREQ_1.u, v1 = CONFIG.FREQ_1.v;
    const u2 = CONFIG.FREQ_2.u, v2 = CONFIG.FREQ_2.v;

    for (let y = 0; y <= height - 8; y++) {
        for (let x = 0; x <= width - 8; x++) {
            const val1 = calcularDCT(inputBuffer, width, x, y, u1, v1);
            const val2 = calcularDCT(inputBuffer, width, x, y, u2, v2);
            // Exageramos x5 el contraste para ver si revive el fantasma
            let pixelVal = Math.min(255, Math.floor(Math.abs(val1 - val2) * 5));
            heatMapBuffer[y * width + x] = pixelVal;
        }
    }

    await sharp(heatMapBuffer, { raw: { width, height, channels: 1 } })
        .png().toFile(`mapa_calor_sharpen_${nombre}.png`);
}

function calcularDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;
    for (let y = 0; y < 8; y++) {
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[y * 8 + v];
        for (let x = 0; x < 8; x++) {
            const pixelVal = buffer[rowOffset + (startX + x) * 4 + CONFIG.CHANNEL_IDX] - 128;
            sum += pixelVal * COS_TABLE[x * 8 + u] * cosY;
        }
    }
    return sum * 0.25;
}

(async () => {
    try {
        console.log("🔬 DIAGNÓSTICO VISUAL: ESTRATEGIA SHARPEN (Resurrección)...");

        // 1. GENERAR MASTER
        const generador = new GeneradorMBH();
        await sharp({ create: { width: 1000, height: 1000, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 255 } } })
            .png().toFile('lienzo.png');
        await generador.sellarImagen('lienzo.png', 'master_diag.png', { cliente: "TEST" });

        const { data: masterBuf, info: masterInfo } = await sharp('master_diag.png').raw().toBuffer({ resolveWithObject: true });

        // 2. CICLO ATAQUE -> RESCATE -> SHARPEN
        // Probamos escalas críticas
        const escalas = [0.5, 0.75, 1.0, 1.5];

        for (const factor of escalas) {
            const wAttack = Math.round(masterInfo.width * factor);
            const hAttack = Math.round(masterInfo.height * factor);

            // A: ATAQUE (Resize) + B: RESCATE (Volver a tamaño original con Lanczos)
            let pipeline = sharp(masterBuf, { raw: { width: masterInfo.width, height: masterInfo.height, channels: 4 } })
                .resize(wAttack, hAttack) // Reducir (Romper la señal)
                .resize(masterInfo.width, masterInfo.height, { kernel: 'lanczos3' }); // Recuperar tamaño (Señal borrosa)

            // C: LA ESTRATEGIA (SHARPEN)
            // Aplicamos un Sharpen agresivo para convertir lo borroso en bordes DCT legibles
            pipeline = pipeline.sharpen({
                sigma: 2.5,  // Radio de acción (agresivo)
                m1: 1.0,     // Nivel de detalle en zonas planas
                m2: 20.0     // Nivel de detalle en bordes (Aquí está la clave)
            });

            const finalBuf = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

            await generarMapaCalor(finalBuf.data, masterInfo.width, masterInfo.height, `x${factor}`);
        }

        console.log("👉 Mapas generados. Si ves rayas en x0.5, hemos ganado.");

    } catch (e) { console.error(e); }
})();
