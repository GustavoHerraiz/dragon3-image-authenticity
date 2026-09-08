import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';

const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    // --- AJUSTES "MEGAFONO" ---
    STARDUST_INTENSITY: 55,      // Fuerza bruta
    DCT_COEFF_1: { u: 1, v: 1 }, // Frecuencias bajas
    DCT_COEFF_2: { u: 2, v: 2 }  // Frecuencias bajas
};

export class GeneradorMBH_v18 {
    constructor() {
        console.log("🐉 DRAGON3 V18.1 [Twin-Key]: Configuración 'Iron-Clad' (Apisonadora)");
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        // Asegurar que hash_suffix es string y minúsculas
        const datos = metadatosCliente || { id: "X881", hash_suffix: "d760" };
        const firma = (datos.hash_suffix || "d760").toLowerCase();

        console.log(`[V18] 🔊 Inyectando Señal Fuerte: ${firma}`);

        let image = sharp(rutaEntrada).ensureAlpha();
        const { data: buf, info } = await image.raw().toBuffer({ resolveWithObject: true });
        let buffer = Buffer.from(buf);

        // MOTOR 1: STARDUST (TWIN-KEY DEEP)
        buffer = this.inyectarStardustTwin(buffer, info.width, info.height, firma);

        // MOTOR 2: VOGEL (CANAL ALFA)
        buffer = this.inyectarVogel(buffer, info.width, info.height, firma);

        await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
            .png({ compressionLevel: 9 })
            .toFile(rutaSalida);

        return firma;
    }

    inyectarStardustTwin(buffer, width, height, hashHex) {
        // 1. Convertir Hex a Binario de forma robusta
        const hashBin = BigInt('0x' + hashHex).toString(2).padStart(16, '0');

        // 2. Crear Sombra (Invertida)
        const hashSombra = hashBin.split('').map(b => b === '1' ? '0' : '1').join('');

        // 3. Generar Secuencia ADN (Intercalada: Bit - Sombra - Bit - Sombra...)
        let secuenciaADN = [];
        for (let i = 0; i < 16; i++) {
            secuenciaADN.push(parseInt(hashBin[i]));
            secuenciaADN.push(parseInt(hashSombra[i]));
        }

        console.log(`[V18] 🧬 ADN Generado (${secuenciaADN.length} bits): ${hashHex}`);

        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        let bitIndex = 0;
        const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
        const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
        const fuerza = CONFIG.STARDUST_INTENSITY;

        for (let y = 0; y <= height - blockSize; y += blockSize) {
            for (let x = 0; x <= width - blockSize; x += blockSize) {

                let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2);
                let dctBlock = this.dct8x8(blueBlock);

                const bit = secuenciaADN[bitIndex % 32];
                bitIndex++;

                // --- CORRECCIÓN CRÍTICA: LÓGICA ABSOLUTISTA ---
                // No miramos "cómo estaba", imponemos "cómo debe ser".
                // Calculamos el centro actual y forzamos la separación desde ahí.

                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;

                if (bit === 1) {
                    // Queremos que Val1 >> Val2
                    dctBlock[v1][u1] = promedio + (fuerza / 2);
                    dctBlock[v2][u2] = promedio - (fuerza / 2);
                } else {
                    // Queremos que Val1 << Val2
                    dctBlock[v1][u1] = promedio - (fuerza / 2);
                    dctBlock[v2][u2] = promedio + (fuerza / 2);
                }

                let newBlueBlock = this.idct8x8(dctBlock);
                this.escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
            }
        }
        return buffer;
    }

    inyectarVogel(buffer, width, height, hashSuffix) {
        const semilla = CONFIG.PRIVATE_KEY + BigInt('0x' + hashSuffix).toString(16).padStart(16, '0');
        for (let y = 0; y <= height - CONFIG.TILE_SIZE; y += CONFIG.TILE_SIZE) {
            for (let x = 0; x <= width - CONFIG.TILE_SIZE; x += CONFIG.TILE_SIZE) {
                const puntos = this.calcularVogel(x, y, semilla);
                puntos.forEach(p => {
                    if (p.x < width && p.y < height) {
                        const idx = (p.y * width + p.x) * 4;
                        buffer[idx + 3] = (buffer[idx + 3] | 1);
                    }
                });
            }
        }
        return buffer;
    }

    extraerBloqueCanal(buffer, width, startX, startY, channelOffset) {
        let block = [];
        for (let y = 0; y < 8; y++) {
            let row = [];
            for (let x = 0; x < 8; x++) {
                const idx = ((startY + y) * width + (startX + x)) * 4;
                row.push(buffer[idx + channelOffset]);
            }
            block.push(row);
        }
        return block;
    }

    escribirBloqueCanal(buffer, width, startX, startY, channelOffset, block) {
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const idx = ((startY + y) * width + (startX + x)) * 4;
                let val = Math.round(block[y][x]);
                if (val < 0) val = 0; else if (val > 255) val = 255;
                buffer[idx + channelOffset] = val;
            }
        }
    }

    dct8x8(block) {
        const n = 8;
        let dct = Array(n).fill(0).map(() => Array(n).fill(0));
        const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
        for (let u = 0; u < n; u++) {
            for (let v = 0; v < n; v++) {
                let sum = 0;
                for (let x = 0; x < n; x++) {
                    for (let y = 0; y < n; y++) {
                        sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                    }
                }
                dct[v][u] = 0.25 * C(u) * C(v) * sum;
            }
        }
        return dct;
    }

    idct8x8(dct) {
        const n = 8;
        let block = Array(n).fill(0).map(() => Array(n).fill(0));
        const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                let sum = 0;
                for (let u = 0; u < n; u++) {
                    for (let v = 0; v < n; v++) {
                        sum += C(u) * C(v) * dct[v][u] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                    }
                }
                block[y][x] = 0.25 * sum;
            }
        }
        return block;
    }

    calcularVogel(offX, offY, semilla) {
        const hash = crypto.createHash('md5').update(semilla).digest();
        const centroX = offX + (CONFIG.TILE_SIZE / 2) + (hash[0] % 20);
        const centroY = offY + (CONFIG.TILE_SIZE / 2) + (hash[1] % 20);
        const pts = [];
        const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < 30; i++) {
            const r = (CONFIG.TILE_SIZE / 2) * 0.8 * Math.sqrt(i / 30);
            const theta = i * GOLDEN_ANGLE;
            pts.push({
                x: Math.floor(centroX + r * Math.cos(theta)),
                y: Math.floor(centroY + r * Math.sin(theta))
            });
        }
        return pts;
    }
}
