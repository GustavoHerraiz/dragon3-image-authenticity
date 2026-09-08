import sharp from 'sharp';
import fs from 'fs';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    // --- AJUSTES "BÚNKER" (INTACTOS DE FAUNDEZ) ---
    STARDUST_INTENSITY: 77,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 }
};

export class GeneradorMBH_v20 {
    constructor() {
        console.log("🐉 DRAGON3 V20 [MENTALIST CORE]: Faúndez Physics + Mentalist Checksum");
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        try {
            // Datos del cliente
            const datos = metadatosCliente || { hash_suffix: "d760" };
            // Obtenemos el ID Hex (12 bits efectivos)
            const idHex = (datos.hash_suffix || "d760").replace('#', '').toLowerCase();
            const idRaw = parseInt(idHex, 16) & 0xFFF; // Asegurar 12 bits

            // 🧠 CÁLCULO MENTALISTA (The Folded Prime)
            // Fórmula: ((ID * 19) XOR (ID >> 6)) AND 15
            const checksum = ((idRaw * 19) ^ (idRaw >> 6)) & 0x0F;

            // Construimos el Payload de 16 bits (4 caracteres Hex)
            // [12 bits ID] + [4 bits Checksum]
            const payloadVal = (idRaw << 4) | checksum;
            const selloMentalista = payloadVal.toString(16).padStart(4, '0');

            console.log(`   ⚙️  Payload V20: ID [${idRaw}] + Chk [${checksum}] = Sello [${selloMentalista}]`);

            // 1. Leer imagen
            let image = sharp(rutaEntrada).ensureAlpha();
            const { data: buf, info } = await image.raw().toBuffer({ resolveWithObject: true });
            let buffer = Buffer.from(buf);

            // 2. MOTOR FÍSICO: STARDUST TWIN (INTACTO DE FAUNDEZ)
            // Pasamos el selloMentalista en lugar del selloRotativo
            buffer = this.inyectarStardustTwin(buffer, info.width, info.height, selloMentalista);

            // 3. MOTOR GEOMÉTRICO (INTACTO - USA MOTOR ESPACIAL)
            buffer = this.inyectarGeometria(buffer, info.width, info.height, selloMentalista);

            // 4. GUARDADO FORENSE
            await sharp(rutaEntrada)
                .composite([{
                    input: buffer,
                    raw: { width: info.width, height: info.height, channels: 4 },
                    mode: 'src-over'
                }])
                .withMetadata()
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            return selloMentalista;

        } catch (error) {
            console.error("❌ Error en GeneradorMBH_v20:", error);
            throw error;
        }
    }

    // =========================================================================
    // 🧱 MOTOR FÍSICO: STARDUST TWIN (COPIA LITERAL DE FAUNDEZ)
    // =========================================================================
    inyectarStardustTwin(buffer, width, height, hashHex) {
        // Convertimos Hex a Binario (16 bits)
        const hashBin = BigInt('0x' + hashHex).toString(2).padStart(16, '0');
        // Generamos Sombra (Twin) invirtiendo bits -> 32 bits total
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

                // Anti-Clipping (Intacto)
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
    // 🛰️ MOTOR GEOMÉTRICO (COPIA LITERAL DE FAUNDEZ)
    // =========================================================================
    inyectarGeometria(buffer, width, height, clave) {
        // Usa MotorEspacial importado para calcular coordenadas
        const centro = MotorEspacial.calcularCentroUnico(width, height, null, CONFIG.PRIVATE_KEY);
        const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

        let marcados = 0;
        puntos.forEach(p => {
            if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
                const idx = (p.y * width + p.x) * 4;
                buffer[idx + 3] = (buffer[idx + 3] | 1); // Alfa LSB
                buffer[idx + 2] = (buffer[idx + 2] | 1); // Azul LSB
                marcados++;
            }
        });
        return buffer;
    }

    // =========================================================================
    // 🧮 UTILIDADES MATEMÁTICAS (COPIA LITERAL)
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
