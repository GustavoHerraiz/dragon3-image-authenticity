import { analizarImagenMBH } from './analizadorMBH.js';
import sharp from 'sharp';

async function ejecutarTest() {
    const PATH_ORIGINAL = 'original_con_sello.png';
    const PATH_RESIZE = 'copia_reducida_60.png';
    const width = 1000, height = 1000;
    const targetID = 0x000D760;

    // 1. Buffer limpio
    const buffer = Buffer.alloc(width * height * 4, 128);
    for (let i = 3; i < buffer.length; i += 4) buffer[i] = 255;

    // 2. Checksum y Payload
    const low = targetID & 0x3FFF;
    const high = (targetID >> 14) & 0x3FFF;
    let mix = (low ^ high) * 19;
    const checksum = (mix ^ (mix >> 6)) & 0x0F;
    const payload = (targetID << 4) | checksum;

    // 3. Inyección Twin-64 Fuerte (+/- 50)
    const bloquesAncho = width / 8;
    for (let by = 0; by < (height / 8); by++) {
        for (let bx = 0; bx < bloquesAncho; bx++) {
            const idx = (by * bloquesAncho + bx) % 64;
            const bit = (payload >>> (31 - Math.floor(idx / 2))) & 1;
            const valor = (idx % 2 === 0) ? (bit ? 50 : -50) : (bit ? -50 : 50);

            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const pIdx = ((by * 8 + i) * width + (bx * 8 + j)) * 4 + 2;
                    buffer[pIdx] = 128 + valor;
                }
            }
        }
    }

    await sharp(buffer, { raw: { width, height, channels: 4 } }).toFile(PATH_ORIGINAL);
    // Usamos Lanczos para simular un ataque real. El analizador usará 'nearest' para defenderse.
    await sharp(PATH_ORIGINAL).resize(600, 600, { kernel: 'lanczos3' }).toFile(PATH_RESIZE);

    console.log("🔍 Ejecutando Escáner de Rescate (Full Scan)...");
    const resultado = await analizarImagenMBH(PATH_RESIZE);

    console.log("\n--- RESULTADO ---");
    console.log(`ID Detectado: ${resultado.hash}`);
    console.log(`Es Correcto: ${resultado.hash === "000D760" ? '✅ SÍ' : '❌ NO'}`);
    console.log(`Energía: ${resultado.energia.toFixed(4)}`);
    console.log(`Escala: ${resultado.diagnostico.escalaUsada}`);
}
ejecutarTest();
