import sharp from 'sharp';
import fs from 'fs';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    // --- AJUSTES "MEGAFONO" (INTACTOS DE V18) ---
    STARDUST_INTENSITY: 55,      // Fuerza bruta
    DCT_COEFF_1: { u: 1, v: 1 }, // Frecuencias bajas
    DCT_COEFF_2: { u: 2, v: 2 }  // Frecuencias bajas
};

export class GeneradorMBH_v19 {
    constructor() {
        console.log("🐉 DRAGON3 V19 [Motor Espacial]: Stardust Legacy + Geometría Logarítmica");
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        // Asegurar que hash_suffix es string y minúsculas
        const datos = metadatosCliente || { id: "X881", hash_suffix: "d760" };
        const firma = (datos.hash_suffix || "d760").toLowerCase();

        console.log(`[V19] 🛰️ Inyectando Sello Espacial: ${firma}`);

        // 1. Convertir a Buffer RAW
        let image = sharp(rutaEntrada).ensureAlpha();
        const { data: buf, info } = await image.raw().toBuffer({ resolveWithObject: true });
        let buffer = Buffer.from(buf);

        // MOTOR 1: STARDUST LEGACY (V18 - INTACTO)
        // Mantiene la resistencia de fuerza bruta original
        buffer = this.inyectarStardustTwin(buffer, info.width, info.height, firma);

        // MOTOR 2: GEOMETRÍA ESPACIAL (V19 - NUEVO)
        // Usa tu MotorEspacial.js para situar las balizas
        buffer = this.inyectarGeometria(buffer, info.width, info.height, firma);

        // 3. GUARDADO FORENSE (SANDWICH)
        // Pega el buffer modificado sobre la original para conservar Exif
        await sharp(rutaEntrada)
            .composite([{
                input: buffer,
                raw: { width: info.width, height: info.height, channels: 4 },
                mode: 'src-over'
            }])
            .withMetadata() // 🟢 VITAL: Mantiene metadatos de cámara
            .png({ compressionLevel: 9 })
            .toFile(rutaSalida);

        return firma;
    }

    // =========================================================================
    // 🧱 MOTOR 1: STARDUST (CÓDIGO ORIGINAL V18 - NO TOCAR)
    // =========================================================================
    inyectarStardustTwin(buffer, width, height, hashHex) {
        const hashBin = BigInt('0x' + hashHex).toString(2).padStart(16, '0');
        const hashSombra = hashBin.split('').map(b => b === '1' ? '0' : '1').join('');

        let secuenciaADN = [];
        for (let i = 0; i < 16; i++) {
            secuenciaADN.push(parseInt(hashBin[i]));
            secuenciaADN.push(parseInt(hashSombra[i]));
        }

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

                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;

                if (bit === 1) {
                    dctBlock[v1][u1] = promedio + (fuerza / 2);
                    dctBlock[v2][u2] = promedio - (fuerza / 2);
                } else {
                    dctBlock[v1][u1] = promedio - (fuerza / 2);
                    dctBlock[v2][u2] = promedio + (fuerza / 2);
                }

                let newBlueBlock = this.idct8x8(dctBlock);
                this.escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
            }
        }
        return buffer;
    }

    // =========================================================================
// 🛰️ MOTOR 2: GEOMETRÍA (NUEVO - CONECTADO A MOTOR ESPACIAL)
// =========================================================================
inyectarGeometria(buffer, width, height, clave) {
    // 1. Calculamos el CENTRO único usando dimensiones + clave (estable a ediciones)
    const centro = MotorEspacial.calcularCentroUnico(width, height, null, CONFIG.PRIVATE_KEY);

    // 2. Obtenemos los puntos de la espiral logarítmica
    const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

    // 3. Marcamos los puntos (Baliza invisible en LSB del canal Alfa y Azul)
    // Esto servirá para que el Analizador (Búsqueda Ciega) sepa dónde buscar consenso
    let marcados = 0;
    puntos.forEach(p => {
        if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
            const idx = (p.y * width + p.x) * 4;
            // Forzamos bit impar en Alfa (Baliza)
            buffer[idx + 3] = (buffer[idx + 3] | 1);
            // Forzamos bit impar en Azul (Baliza adicional)
            buffer[idx + 2] = (buffer[idx + 2] | 1);
            marcados++;
        }
    });

    // console.log(`[V19] Geometría inyectada: ${marcados} balizas.`);
    return buffer;
}

    // =========================================================================
    // 🛠️ UTILIDADES (SHARED - INTACTAS)
    // =========================================================================
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
}
