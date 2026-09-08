import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto'; // Necesario para la hora
import { MotorEspacial } from './matematicas/MotorEspacial.js';

const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    // --- AJUSTES "BÚNKER" (INTACTOS DE V19) ---
    STARDUST_INTENSITY: 77,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 }
};

export class GeneradorFaundez {
    constructor() {
        console.log("🐉 DRAGON3 [TOTP SYSTEM]: Full Architecture (Metadata + Physics + Geometry)");
    }

    // =========================================================================
    // 1. FUNCIÓN PRINCIPAL
    // =========================================================================
    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        try {
            // Datos del cliente
            const datos = metadatosCliente || { id: "X881", hash_suffix: "d760" };
            const idOriginalHex = (datos.hash_suffix || "d760").toLowerCase();

            // 🧠 CÁLCULO DEL SELLO ROTATIVO (TOTP)
            // Esto es lo único "nuevo". La física es la de siempre.
            const selloRotativo = this._generarSelloRotativo(idOriginalHex);

            console.log(`[FAUNDEZ] ⏱️ Inyectando Sello TOTP: ${selloRotativo} (ID Base: ${idOriginalHex})`);

            // 1. Leer imagen y obtener buffer RAW
            let image = sharp(rutaEntrada).ensureAlpha();
            const { data: buf, info } = await image.raw().toBuffer({ resolveWithObject: true });
            let buffer = Buffer.from(buf);

            // 2. MOTOR FÍSICO: STARDUST TWIN (INTACTO)
            buffer = this.inyectarStardustTwin(buffer, info.width, info.height, selloRotativo);

            // 3. MOTOR GEOMÉTRICO (INTACTO - CONECTADO A MOTOR ESPACIAL)
            buffer = this.inyectarGeometria(buffer, info.width, info.height, selloRotativo);

            // 4. GUARDADO FORENSE (SANDWICH COMPOSITE)
            // Esta es la técnica correcta para mantener EXIF y Metadatos originales.
            // Superponemos el buffer modificado sobre la imagen original.
            await sharp(rutaEntrada)
                .composite([{
                    input: buffer,
                    raw: { width: info.width, height: info.height, channels: 4 },
                    mode: 'src-over'
                }])
                .withMetadata() // ⚠️ CRÍTICO: Mantiene los datos de la cámara/origen
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            return selloRotativo;

        } catch (error) {
            console.error("❌ Error en GeneradorFaundez:", error);
            throw error;
        }
    }

    // =========================================================================
    // 🧠 LÓGICA TOTP (NUEVA)
    // =========================================================================
    _generarSelloRotativo(idHex) {
        const idNum = parseInt(idHex, 16) & 0xFFF;
        const nib1 = (idNum >> 8) & 0xF;
        const nib2 = (idNum >> 4) & 0xF;
        const nib3 = idNum & 0xF;
        const checksum = (nib1 + nib2 + nib3) % 16;
        const paqueteDatos = (idNum << 4) | checksum;
        const mascaraTiempo = this._calcularMascaraTiempo();
        const selloFinal = paqueteDatos ^ mascaraTiempo;
        return selloFinal.toString(16).padStart(4, '0');
    }

    _calcularMascaraTiempo() {
        const epochMinutos = Math.floor(Date.now() / 60000);
        const hash = crypto.createHash('sha256').update(String(epochMinutos)).digest('hex');
        return parseInt(hash.substring(0, 4), 16);
    }

    // =========================================================================
    // 🧱 MOTOR FÍSICO: STARDUST TWIN
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

                // Control de clipping para evitar artefactos visuales extremos
                let aplicarFuerza = fuerza;
                if (dctBlock[0][0] > 1000 || dctBlock[0][0] < -1000) aplicarFuerza = fuerza * 0.8;

                if (bit === 1) {
                    dctBlock[v1][u1] = promedio + (aplicarFuerza / 2);
                    dctBlock[v2][u2] = promedio - (aplicarFuerza / 2);
                } else {
                    dctBlock[v1][u1] = promedio - (aplicarFuerza / 2);
                    dctBlock[v2][u2] = promedio + (aplicarFuerza / 2);
                }

                let newBlueBlock = this.idct8x8(dctBlock);
                this.escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
            }
        }
        return buffer;
    }

    // =========================================================================
    // 🛰️ MOTOR 2: GEOMETRÍA (COMPLETO)
    // =========================================================================
    inyectarGeometria(buffer, width, height, clave) {
        // 1. Calculamos el CENTRO único usando dimensiones + clave (estable a ediciones)
        const centro = MotorEspacial.calcularCentroUnico(width, height, null, CONFIG.PRIVATE_KEY);

        // 2. Obtenemos los puntos de la espiral logarítmica
        const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

        // 3. Marcamos los puntos (Baliza invisible en LSB del canal Alfa y Azul)
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
        return buffer;
    }

    // =========================================================================
    // 🧮 UTILIDADES MATEMÁTICAS (COMPLETAS)
    // =========================================================================
    extraerBloqueCanal(buffer, width, x, y, channel) {
        const block = [];
        for (let i = 0; i < 8; i++) {
            const row = [];
            for (let j = 0; j < 8; j++) {
                const idx = ((y + i) * width + (x + j)) * 4 + channel;
                row.push(buffer[idx] - 128);
            }
            block.push(row);
        }
        return block;
    }

    escribirBloqueCanal(buffer, width, x, y, channel, block) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const idx = ((y + i) * width + (x + j)) * 4 + channel;
                let val = block[i][j] + 128;
                if (val < 0) val = 0; else if (val > 255) val = 255;
                buffer[idx] = Math.round(val);
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
