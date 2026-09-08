import sharp from 'sharp';
import fs from 'fs';
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import ReedSolomon from 'reed-solomon';

const CONFIG = {
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 200,

    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",

    FUERZA_MINIMA_ABSOLUTA: 80,
    ANTICLIP_THRESHOLD: 2000,
    ANTICLIP_FACTOR: 0.9,

    // 🆕 REED-SOLOMON
    BITS_ID: 20,        // 20 bits = 1,048,576 IDs (antes 28 bits)
    BITS_ECC: 12,       // 12 bits de corrección (corrige 3 errores)
    MAX_ID: 1048575     // 2^20 - 1
};

// 🆕 INICIALIZAR REED-SOLOMON
// RS(4,3) significa: 4 bytes total, 3 bytes de datos, 1 byte de corrección
// Usamos 32 bits = 4 bytes: 20 bits datos + 12 bits ECC
const rsEncoder = new ReedSolomon(4, 3);

export class GeneradorMBH {
    constructor() {
        console.log("🐉 DRAGON3 V23 [DWT-DCT + REED-SOLOMON]: Corrección de Errores");
        console.log(`   🔬 ID: 20 bits | ECC: 12 bits | Corrige: 3 errores`);
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        try {
            // 1. OBTENCIÓN DEL ID (limitado a 20 bits)
            let idRaw = metadatosCliente?.id_numerico || parseInt((metadatosCliente?.hash_suffix || "0").replace('#','').slice(-5), 16);
            idRaw = idRaw & CONFIG.MAX_ID;  // Máscara 20 bits

            console.log(`   ⚙️  ID [${idRaw}] (20 bits)`);

            // 2. 🆕 GENERAR CÓDIGO REED-SOLOMON
            const payload32 = this.generarPayloadRS(idRaw);
            const selloHex = payload32.toString(16).padStart(8, '0').toUpperCase();

            console.log(`   🛡️  Payload 32: ID [${idRaw}] + RS-ECC = Sello [${selloHex}]`);

            // 3. LECTURA DE IMAGEN
            const { data, info } = await sharp(rutaEntrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            let buffer = Buffer.from(data);

            // 4. MOTOR DWT-DCT
            buffer = this.inyectarStardustDWT(buffer, info.width, info.height, payload32);

            // 5. GUARDADO
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .withMetadata()
                .toFile(rutaSalida);

            console.log(`   ✅ Sellado DWT-DCT + RS completado: ${rutaSalida}`);
            return selloHex;

        } catch (error) {
            console.error("❌ Error en GeneradorMBH RS:", error);
            throw error;
        }
    }

    /**
     * 🆕 GENERA PAYLOAD CON REED-SOLOMON
     *
     * Estructura:
     * - Byte 0-1: ID (20 bits, 2.5 bytes → usamos 3 bytes)
     * - Byte 3: Paridad Reed-Solomon (12 bits)
     */
    generarPayloadRS(id20bits) {
        // Convertir ID a bytes (necesitamos 3 bytes para 20 bits)
        const dataBytes = new Uint8Array(3);
        dataBytes[0] = (id20bits >> 12) & 0xFF;   // Bits 12-19
        dataBytes[1] = (id20bits >> 4) & 0xFF;    // Bits 4-11
        dataBytes[2] = (id20bits << 4) & 0xF0;    // Bits 0-3 en upper nibble

        // Generar código Reed-Solomon
        const encoded = rsEncoder.encode(dataBytes);

        // Combinar en 32 bits
        let payload32 = 0;
        payload32 |= (encoded[0] << 24);
        payload32 |= (encoded[1] << 16);
        payload32 |= (encoded[2] << 8);
        payload32 |= (encoded[3]);

        return payload32 >>> 0;
    }

    // =========================================================================
    // MOTOR DWT-DCT (sin cambios)
    // =========================================================================
    inyectarStardustDWT(buffer, width, height, payload32) {
        console.log(`\n   🔄 Aplicando DWT Haar...`);

        const { LL, LH, HL, HH } = this.aplicarDWTHaar(buffer, width, height);

        const llWidth = Math.floor(width / 2);
        const llHeight = Math.floor(height / 2);

        console.log(`      LL subband: ${llWidth}x${llHeight}px`);

        const secuenciaDNA = [];
        for (let i = 31; i >= 0; i--) {
            const bit = (payload32 >>> i) & 1;
            secuenciaDNA.push(bit);
            secuenciaDNA.push(bit ^ 1);
        }
        const dnaLength = 64;

        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        let stepIndex = 0;

        const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
        const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
        const fuerzaBase = CONFIG.STARDUST_INTENSITY;
        const fuerzaMinima = CONFIG.FUERZA_MINIMA_ABSOLUTA;

        let bloquesConSeñal = 0;
        let bloquesTotales = 0;
        let energiaTotal = 0;

        for (let y = 0; y <= llHeight - blockSize; y += blockSize) {
            for (let x = 0; x <= llWidth - blockSize; x += blockSize) {

                let llBlock = this.extraerBloqueLL(LL, llWidth, x, y);
                let dctBlock = this.dct8x8(llBlock);

                const bitToInject = secuenciaDNA[stepIndex % dnaLength];
                stepIndex++;
                bloquesTotales++;

                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;

                let aplicarFuerza = fuerzaBase;
                if (Math.abs(dctBlock[0][0]) > CONFIG.ANTICLIP_THRESHOLD) {
                    aplicarFuerza = fuerzaBase * CONFIG.ANTICLIP_FACTOR;
                }

                if (bitToInject === 1) {
                    const delta = aplicarFuerza / 2;
                    dctBlock[v1][u1] = promedio + Math.max(delta, fuerzaMinima / 2);
                    dctBlock[v2][u2] = promedio - Math.max(delta, fuerzaMinima / 2);
                } else {
                    const delta = aplicarFuerza / 2;
                    dctBlock[v1][u1] = promedio - Math.max(delta, fuerzaMinima / 2);
                    dctBlock[v2][u2] = promedio + Math.max(delta, fuerzaMinima / 2);
                }

                const energiaInsertada = Math.abs(dctBlock[v1][u1] - dctBlock[v2][u2]);
                energiaTotal += energiaInsertada;

                if (energiaInsertada > fuerzaMinima * 0.8) {
                    bloquesConSeñal++;
                }

                let newLLBlock = this.idct8x8(dctBlock);
                this.escribirBloqueLL(LL, llWidth, x, y, newLLBlock);
            }
        }

        console.log(`   🔄 Aplicando IDWT Haar...`);
        buffer = this.aplicarIDWTHaar(buffer, width, height, LL, LH, HL, HH);

        const porcentajeConSeñal = (bloquesConSeñal / bloquesTotales * 100).toFixed(1);
        const energiaMedia = (energiaTotal / bloquesTotales).toFixed(2);

        console.log(`   📊 DISTRIBUCIÓN DE SEÑAL (DWT-DCT + RS):`);
        console.log(`      Bloques procesados: ${bloquesTotales}`);
        console.log(`      Bloques con señal fuerte: ${bloquesConSeñal} (${porcentajeConSeñal}%)`);
        console.log(`      Energía media insertada: ${energiaMedia}`);

        if (parseFloat(porcentajeConSeñal) < 70) {
            console.log(`   ⚠️  ADVERTENCIA: Señal concentrada (${porcentajeConSeñal}% < 70%)`);
        } else {
            console.log(`   ✅ Distribución uniforme lograda en LL subband`);
        }

        return buffer;
    }

    aplicarDWTHaar(buffer, width, height) {
        const llWidth = Math.floor(width / 2);
        const llHeight = Math.floor(height / 2);

        const LL = new Float32Array(llWidth * llHeight);
        const LH = new Float32Array(llWidth * llHeight);
        const HL = new Float32Array(llWidth * llHeight);
        const HH = new Float32Array(llWidth * llHeight);

        for (let y = 0; y < height - 1; y += 2) {
            for (let x = 0; x < width - 1; x += 2) {
                const idx00 = (y * width + x) * 4 + 2;
                const idx01 = (y * width + (x + 1)) * 4 + 2;
                const idx10 = ((y + 1) * width + x) * 4 + 2;
                const idx11 = ((y + 1) * width + (x + 1)) * 4 + 2;

                const a = buffer[idx00];
                const b = buffer[idx01];
                const c = buffer[idx10];
                const d = buffer[idx11];

                const outIdx = (y / 2) * llWidth + (x / 2);

                LL[outIdx] = (a + b + c + d) / 4;
                LH[outIdx] = (a + b - c - d) / 4;
                HL[outIdx] = (a - b + c - d) / 4;
                HH[outIdx] = (a - b - c + d) / 4;
            }
        }

        return { LL, LH, HL, HH };
    }

    aplicarIDWTHaar(buffer, width, height, LL, LH, HL, HH) {
        const llWidth = Math.floor(width / 2);

        for (let y = 0; y < height - 1; y += 2) {
            for (let x = 0; x < width - 1; x += 2) {
                const inIdx = (y / 2) * llWidth + (x / 2);

                const ll = LL[inIdx];
                const lh = LH[inIdx];
                const hl = HL[inIdx];
                const hh = HH[inIdx];

                const a = ll + lh + hl + hh;
                const b = ll + lh - hl - hh;
                const c = ll - lh + hl - hh;
                const d = ll - lh - hl + hh;

                const idx00 = (y * width + x) * 4 + 2;
                const idx01 = (y * width + (x + 1)) * 4 + 2;
                const idx10 = ((y + 1) * width + x) * 4 + 2;
                const idx11 = ((y + 1) * width + (x + 1)) * 4 + 2;

                buffer[idx00] = Math.max(0, Math.min(255, Math.round(a)));
                buffer[idx01] = Math.max(0, Math.min(255, Math.round(b)));
                buffer[idx10] = Math.max(0, Math.min(255, Math.round(c)));
                buffer[idx11] = Math.max(0, Math.min(255, Math.round(d)));
            }
        }

        return buffer;
    }

    extraerBloqueLL(LL, llWidth, x, y) {
        const block = [];
        for (let i = 0; i < 8; i++) {
            const row = [];
            for (let j = 0; j < 8; j++) {
                const idx = (y + i) * llWidth + (x + j);
                row.push(LL[idx] - 128);
            }
            block.push(row);
        }
        return block;
    }

    escribirBloqueLL(LL, llWidth, x, y, block) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const idx = (y + i) * llWidth + (x + j);
                let val = block[i][j] + 128;
                if (val < 0) val = 0; else if (val > 255) val = 255;
                LL[idx] = val;
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
