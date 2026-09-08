import sharp from 'sharp';
import fs from 'fs';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

const CONFIG = {
    // --- FÍSICA BÚNKER (INTACTA) ---
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 77,       // La fuerza de la marca
    DCT_COEFF_1: { u: 1, v: 1 },  // Frecuencia baja (Resistencia)
    DCT_COEFF_2: { u: 2, v: 2 },  // Frecuencia media (Invisible)
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",

    // --- LÓGICA 32 BITS (NUEVA) ---
    BITS_ID: 28,            // 268 Millones de IDs únicos
    BITS_CHK: 4,            // Checksum Mentalista
    MAX_ID: 268435455       // Límite matemático (2^28 - 1)
};

export class GeneradorMBH {
    constructor() {
        console.log("🐉 DRAGON3 V20 [MENTALIST CORE]: Faúndez Physics + Mentalist Checksum");
    }

   async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        try {
            // 1. OBTENCIÓN DEL ID (28 BITS)
            // Prioridad: ID Numérico. Fallback: Hash Hex (últimos 7 chars)
            let idRaw = metadatosCliente?.id_numerico || parseInt((metadatosCliente?.hash_suffix || "0").replace('#','').slice(-7), 16);
            idRaw = idRaw & CONFIG.MAX_ID; // Limpiar a 28 bits

            // 2. CÁLCULO MENTALISTA V21 (Safe 32-bit Split)
            // Dividimos High/Low para evitar overflow al multiplicar por 19
            const low = idRaw & 0x3FFF;
            const high = (idRaw >> 14) & 0x3FFF;
            let mix = (low ^ high) * 19;
            const checksum = (mix ^ (mix >> 6)) & 0x0F;

            // 3. CONSTRUCCIÓN PAYLOAD (32 BITS)
            // [28 bits ID] + [4 bits Checksum] >>> 0 asegura entero sin signo
            const payload32 = ((idRaw << 4) | checksum) >>> 0;
            const selloHex = payload32.toString(16).padStart(8, '0').toUpperCase();

            console.log(`   ⚙️  Payload 32: ID [${idRaw}] + Chk [${checksum}] = Sello [${selloHex}]`);

            // 4. LECTURA DE IMAGEN
            const { data, info } = await sharp(rutaEntrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            let buffer = Buffer.from(data);

            // 5. MOTOR FÍSICO: STARDUST 32 (El Nuevo Estándar)
            // Pasamos el Entero 32 bits (payload32), NO el string
            buffer = this.inyectarStardust32(buffer, info.width, info.height, payload32);

            // 6. MOTOR GEOMÉTRICO (Opcional - Usamos Hex para visualización)
            if (this.inyectarGeometria) {
                buffer = this.inyectarGeometria(buffer, info.width, info.height, selloHex);
            }

            // 7. GUARDADO FORENSE
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .withMetadata()
                .toFile(rutaSalida);

            return selloHex;

        } catch (error) {
            console.error("❌ Error en GeneradorMBH 32-bit:", error);
            throw error;
        }
    }


    // =========================================================================
    // 🧬 MOTOR FÍSICO: STARDUST TWIN-64 (DOBLE HÉLICE)
    // =========================================================================
    inyectarStardust32(buffer, width, height, payload32) {
        // 1. GENERAMOS LA DOBLE HÉLICE (32 Bits -> 64 Pasos)
        // Por cada bit del ID, creamos un par: [BIT, !BIT]
        // Esto garantiza contraste local máximo.
        const secuenciaDNA = [];
        for (let i = 31; i >= 0; i--) {
            const bit = (payload32 >>> i) & 1;
            secuenciaDNA.push(bit);       // El Bit Real
            secuenciaDNA.push(bit ^ 1);   // El Gemelo Invertido (Sombra)
        }

        // Ahora tenemos 64 pasos que se repetirán cíclicamente
        const dnaLength = 64;

        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        let stepIndex = 0;

        const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
        const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
        const fuerza = CONFIG.STARDUST_INTENSITY;

        for (let y = 0; y <= height - blockSize; y += blockSize) {
            for (let x = 0; x <= width - blockSize; x += blockSize) {

                let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2);
                let dctBlock = this.dct8x8(blueBlock);

                // Leemos el paso correspondiente de la hélice (0..63)
                const bitToInject = secuenciaDNA[stepIndex % dnaLength];
                stepIndex++;

                // FÍSICA DIFERENCIAL
                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;

                // Anti-Clipping
                let aplicarFuerza = fuerza;
                if (Math.abs(dctBlock[0][0]) > 1000) aplicarFuerza = fuerza * 0.8;

                if (bitToInject === 1) {
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
