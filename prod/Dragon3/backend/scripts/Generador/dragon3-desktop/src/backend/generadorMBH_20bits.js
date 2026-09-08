// generadorMBH_20bits.js
// 🔥 GENERADOR CON ID DE 20 BITS + MENTALISTA CHK (4 bits) = 24 bits totales

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { MotorEspacial } from './MotorEspacial.js';

const CONFIG = {
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 77,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    // 🔥 NUEVOS PARÁMETROS
    BITS_ID: 20,
    BITS_CHK: 4,
    MAX_ID: 1048575 // 2^20 - 1
};

export class GeneradorMBH_20bits {
    constructor(db, licenseManager) {
        this.db = db;
        this.licenseManager = licenseManager;
        console.log('🐉 GeneradorMBH 20 bits inicializado');
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        const startTime = performance.now();

        try {
            // Obtener ID numérico
            let idNumerico = metadatosCliente.id_numerico || 0;
            if (idNumerico === 0) {
                idNumerico = await this.db.obtenerSiguienteId();
            }

            // 🔥 LIMITAR A 20 BITS
            idNumerico = idNumerico & CONFIG.MAX_ID;

            const idHex = idNumerico.toString(16).toUpperCase().padStart(5, '0');
            const chk = this.calcularChecksumMentalista(idNumerico);
            
            // 🔥 PAYLOAD DE 24 BITS (20 ID + 4 CHK)
            const payload24 = (idNumerico << 4) | chk;

            // Construir ID completo (prefijo + 5 dígitos)
            let prefijo = await this.db.obtenerPrefijo();
            if (!prefijo) {
                const config = await this.db.obtenerConfiguracion();
                prefijo = config?.prefijo_usuario || 'DEM';
            }
            const idCompleto = `${prefijo}_${idHex}`;

            // Preparar salida
            const outputDir = metadatosCliente.outputDir || path.dirname(rutaEntrada);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

            const baseName = path.basename(rutaEntrada, path.extname(rutaEntrada));
            if (!rutaSalida) {
                rutaSalida = path.join(outputDir, `${baseName}_${idCompleto}.png`);
            }

            // Leer imagen
            const extractor = sharp(rutaEntrada);
            const { data: bufferBase, info } = await extractor
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            let buffer = bufferBase;

            // 🔥 INYECCIÓN STARDUST CON 24 BITS
            buffer = this.inyectarStardust24(buffer, info.width, info.height, payload24);

            // Limpieza alfa
            for (let i = 3; i < buffer.length; i += 4) {
                buffer[i] = buffer[i] & 0xFE;
            }

            // Inyección Vogel (sin cambios)
            buffer = this.inyectarGeometria(buffer, info.width, info.height, idHex);

            // Guardar
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            // Registrar en DB
            try {
                await this.db.registrarSello(
                    idNumerico,
                    idHex,
                    metadatosCliente.proyectoId || 1,
                    metadatosCliente.cliente || 'Prueba 20 bits',
                    metadatosCliente.obra || 'Test 20 bits',
                    metadatosCliente.coleccion || null,
                    metadatosCliente.derechos || 'Todos los derechos reservados',
                    metadatosCliente.email_contacto || '',
                    metadatosCliente.compartir_blade || 0
                );
            } catch (dbErr) {
                console.log(`⚠️ DB: ${dbErr.message}`);
            }

            const elapsed = performance.now() - startTime;
            console.log(`✅ Sellado 20 bits completado en ${Math.round(elapsed)}ms (ID: ${idCompleto})`);

            return { ok: true, id: idCompleto, ruta: rutaSalida };

        } catch (err) {
            console.error(`❌ Error: ${err.message}`);
            return { ok: false, error: err.message };
        }
    }

    // ================================================================
    // 🔥 STARDUST CON 24 BITS (20 ID + 4 CHK)
    // ================================================================
    inyectarStardust24(buffer, width, height, payload24) {
        // Doble hélice: [bit, !bit] para 24 bits → 48 bits totales
        const secuenciaDNA = [];
        for (let i = 23; i >= 0; i--) {
            const bit = (payload24 >>> i) & 1;
            secuenciaDNA.push(bit);
            secuenciaDNA.push(bit ^ 1);
        }

        const dnaLength = 48;
        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
        const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
        const fuerza = CONFIG.STARDUST_INTENSITY;

        for (let y = 0; y <= height - blockSize; y += blockSize) {
            let stepIndex = 0;
            for (let x = 0; x <= width - blockSize; x += blockSize) {
                let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2);
                let dctBlock = this.dct8x8(blueBlock);
                const bitToInject = secuenciaDNA[stepIndex % dnaLength];
                stepIndex++;

                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;
                let aplicarFuerza = fuerza;
                if (Math.abs(dctBlock) > 1000) aplicarFuerza = fuerza * 0.8;

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

    // ================================================================
    // VOGEL (sin cambios)
    // ================================================================
    inyectarGeometria(buffer, width, height, idHex) {
        const hashLimpio = idHex;
        const centro = MotorEspacial.calcularCentroUnico(
            width, height, hashLimpio, CONFIG.PRIVATE_KEY
        );
        const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

        puntos.forEach(p => {
            if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
                const idx = (p.y * width + p.x) * 4;
                buffer[idx + 3] = (buffer[idx + 3] | 1);
                buffer[idx + 2] = (buffer[idx + 2] | 1);
            }
        });
        return buffer;
    }

    // ================================================================
    // UTILIDADES
    // ================================================================
    calcularChecksumMentalista(id20) {
        const L = id20 & 0x3FF; // 10 bits bajos
        const H = (id20 >> 10) & 0x3FF; // 10 bits altos
        const X = L ^ H;
        const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
        return V & 0x0F;
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
                if (val < 0) val = 0;
                if (val > 255) val = 255;
                buffer[idx] = Math.round(val);
            }
        }
    }
}