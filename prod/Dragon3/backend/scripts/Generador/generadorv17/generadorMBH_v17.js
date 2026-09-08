import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';


// CONFIGURACIÓN MAESTRA
const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    // Configuración Stardust (DCT / Baja Frecuencia)
    STARDUST_BLOCK_SIZE: 8,   // Bloques de 8x8 (estándar JPEG)
    STARDUST_INTENSITY: 25,   // Intensidad de la marca (visible en frecuencia, invisible al ojo)
    DCT_COEFF_1: { u: 3, v: 3 }, // Coeficiente de frecuencia media-baja (resistente)
    DCT_COEFF_2: { u: 4, v: 4 }  // Coeficiente par para comparación
};

export class GeneradorMBH_v17 {

    constructor() {
        console.log("🐉 DRAGON3 V17 [Dual-Engine]: Vogel (Alfa) + Stardust DCT (Frecuencia)");
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente = null) {
        // 1. Datos del Cliente (Semilla)
        const datos = metadatosCliente || { id: "X881", hash_suffix: "f0c00" }; // Default test
        console.log(`[V17] 🧬 Inyectando ADN: ${datos.hash_suffix}`);

        // 2. Cargar imagen y asegurar ALFA (Lienzo del Notario)
        let image = sharp(rutaEntrada).ensureAlpha();
        const metadata = await image.metadata();

        // Convertimos a buffer raw para operar a nivel de píxel/bloque
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

        // Clonamos el buffer para trabajar
        let buffer = Buffer.from(data);

        // =========================================================
        // MOTOR 1: STARDUST V17 (DETECTIVE) - CANAL AZUL (DCT)
        // Estrategia: Modificación de baja frecuencia en bloques 8x8
        // =========================================================
        console.log("[V17] 🛡️  Motor Stardust: Inyectando en Baja Frecuencia (DCT)...");
        buffer = this.inyectarStardustDCT(buffer, info.width, info.height, datos.hash_suffix);

        // =========================================================
        // MOTOR 2: VOGEL V16 (NOTARIO) - CANAL ALFA (GEOMETRÍA)
        // Estrategia: Intocable. Geometría sagrada en transparencia.
        // =========================================================
        console.log("[V17] 📜 Motor Vogel: Certificando en Canal Alfa...");
        buffer = this.inyectarVogel(buffer, info.width, info.height, datos.hash_suffix);

        // 3. Guardar Master
        await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
            .png({ compressionLevel: 9 })
            .toFile(rutaSalida);

        console.log(`[V17] ✅ MASTER GENERADO: ${rutaSalida}`);
        return datos.hash_suffix;
    }

    // -----------------------------------------------------------------------
    // MOTOR 1: STARDUST DCT (NUEVO)
    // -----------------------------------------------------------------------
    inyectarStardustDCT(buffer, width, height, hashSuffix) {
        // Convertimos el hash a binario (ej: "f0c0" -> "11110000...")
        const hashBinario = BigInt('0x' + hashSuffix).toString(2).padStart(16, '0');
        const bits = hashBinario.split('').map(b => parseInt(b));

        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        let bitIndex = 0;

        // Recorremos la imagen en bloques de 8x8
        for (let y = 0; y <= height - blockSize; y += blockSize) {
            for (let x = 0; x <= width - blockSize; x += blockSize) {

                // Extraemos el Canal AZUL del bloque (el ojo es menos sensible al azul)
                // y aplicamos DCT
                let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2); // 2 = Azul
                let dctBlock = this.dct8x8(blueBlock);

                // --- INCRUSTACIÓN FORENSE ---
                // Seleccionamos el bit a esconder (repetimos el hash en bucle)
                const bit = bits[bitIndex % bits.length];
                bitIndex++;

                // Modificamos la relación entre dos coeficientes de frecuencia media
                // Si bit 1 -> Coeff A > Coeff B
                // Si bit 0 -> Coeff A < Coeff B
                const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
                const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;

                const delta = CONFIG.STARDUST_INTENSITY;

                if (bit === 1) {
                    if (dctBlock[v1][u1] <= dctBlock[v2][u2]) {
                        dctBlock[v1][u1] += delta;
                        dctBlock[v2][u2] -= delta;
                    }
                } else {
                    if (dctBlock[v1][u1] >= dctBlock[v2][u2]) {
                        dctBlock[v1][u1] -= delta;
                        dctBlock[v2][u2] += delta;
                    }
                }

                // Inversa DCT para volver a píxeles
                let newBlueBlock = this.idct8x8(dctBlock);

                // Escribimos el bloque modificado en el buffer
                this.escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
            }
        }
        return buffer;
    }

    // -----------------------------------------------------------------------
    // MOTOR 2: VOGEL (LEGACY - BLINDADO)
    // -----------------------------------------------------------------------
    inyectarVogel(buffer, width, height, hashSuffix) {
        // Esta función NO SE TOCA. Es la notaría.
        const semilla = CONFIG.PRIVATE_KEY + BigInt('0x' + hashSuffix).toString(16).padStart(16, '0');
        const pHash = BigInt('0x' + hashSuffix).toString(16).padStart(16, '0'); // Simplificado para el ejemplo

        // Usamos Tiling de 256 para sembrar el Alfa
        for (let y = 0; y <= height - CONFIG.TILE_SIZE; y += CONFIG.TILE_SIZE) {
            for (let x = 0; x <= width - CONFIG.TILE_SIZE; x += CONFIG.TILE_SIZE) {
                const puntos = this.calcularVogel(x, y, semilla);

                puntos.forEach(p => {
                    if (p.x < width && p.y < height) {
                        const idx = (p.y * width + p.x) * 4;
                        // Marcamos el LSB del Canal Alfa
                        let alfa = buffer[idx + 3];
                        buffer[idx + 3] = (alfa | 1); // Forzamos bit 1
                    }
                });
            }
        }
        return buffer;
    }

    // -----------------------------------------------------------------------
    // UTILIDADES MATEMÁTICAS (DCT & VOGEL)
    // -----------------------------------------------------------------------

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
                // Clamp entre 0 y 255
                let val = Math.round(block[y][x]);
                if (val < 0) val = 0;
                if (val > 255) val = 255;
                buffer[idx + channelOffset] = val;
            }
        }
    }

    // Implementación simple de DCT 8x8 (O(N^4) pero robusta para JS puro)
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

    // Implementación simple de IDCT 8x8
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

        for (let i = 0; i < 30; i++) { // 30 puntos
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
