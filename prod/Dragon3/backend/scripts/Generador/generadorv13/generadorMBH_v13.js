/**
 * ============================================================================
 * DRAGON3 - GENERADOR MBH V13 (ESTRATEGIA DIFERENCIAL TWIN-BLOCKS)
 * ============================================================================
 * 1. Capa Alpha: Espiral Vogel (Certificación Forense).
 * 2. Capa RGB: Modulación Diferencial de Luminancia (Supervivencia JPG).
 * - En lugar de ocultar bits, creamos relaciones de contraste (A > B).
 */

import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

const SECRETO = process.env.MBH_SECRET || 'CLAVE_PRIVADA_QUICO_MELERO_2025';

// --- CONFIGURACIÓN ---
const NUM_PUNTOS_VOGEL = 423; // Capa Alpha
const DENSIDAD_STARDUST = 150; // Puntos de contraste para la Capa RGB
const INTENSIDAD_DIFERENCIAL = 15; // Cuánto variamos el brillo (+/- 15 es sutil pero robusto)

export class GeneradorMBH_v13 {

    // ========================================================================
    // 🧠 LÓGICA CAPA 1: GEOMETRÍA VOGEL (ALPHA - INTACTA)
    // ========================================================================

    generarPatronVogel(width, height, centro, numPuntos) {
        const puntos = [];
        const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

        const areaImagen = width * height;
        const areaObjetivo = areaImagen * 1.15;
        const radioTeorico = Math.sqrt(areaObjetivo / Math.PI);
        const scale = radioTeorico / Math.sqrt(numPuntos);

        for (let i = 0; i < numPuntos; i++) {
            const r = scale * Math.sqrt(i);
            const theta = i * GOLDEN_ANGLE;
            const x = Math.round(centro.x + r * Math.cos(theta));
            const y = Math.round(centro.y + r * Math.sin(theta));

            if (x >= 0 && x < width && y >= 0 && y < height) {
                puntos.push({
                    x, y, index: i,
                    x_teor_norm: Math.cos(theta),
                    y_teor_norm: Math.sin(theta)
                });
            }
        }
        return puntos;
    }

    escribirPuntoVogel(buffer, punto, width, datos, hash, channels) {
        const esCentral = punto.index < 10;
        const numBits = esCentral ? 64 : 16;
        const blockSize = esCentral ? 8 : 4;

        let payload = 0n;
        if (esCentral) {
            const hash23 = hash & 0x7FFFFF;
            const datos32 = datos & 0xFFFFFFFF;
            payload = (BigInt(datos32) << 32n) | (BigInt(hash23) << 9n) | BigInt(punto.index);
        } else {
            const xInt = Math.abs(Math.round(punto.x_teor_norm * 1000)) % 128;
            const yInt = Math.abs(Math.round(punto.y_teor_norm * 1000)) % 128;
            const checksum = (punto.index + xInt + yInt) % 128;
            payload = BigInt((punto.index << 7) | checksum);
        }

        let bitIndex = 0;
        for (let y = 0; y < blockSize; y++) {
            for (let x = 0; x < blockSize; x++) {
                if (bitIndex >= numBits) return;
                const px = punto.x + x;
                const py = punto.y + y;

                if (px < width) {
                    const offset = ((py * width) + px) * channels + 3; // +3 = ALPHA
                    if (offset < buffer.length) {
                        const bit = Number((payload >> BigInt(numBits - 1 - bitIndex)) & 1n);
                        buffer[offset] = (buffer[offset] & 0xFE) | bit;
                    }
                }
                bitIndex++;
            }
        }
    }

    // ========================================================================
    // ⚖️ LÓGICA CAPA 2: LUMINANCE TWIN-BLOCKS (NUEVA ESTRATEGIA ROBUSTA)
    // ========================================================================

    crearGeneradorAleatorio(semilla) {
        let h = 0x811c9dc5;
        for (let i = 0; i < semilla.length; i++) {
            h ^= semilla.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return function() {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return ((h ^= h >>> 16) >>> 0) / 4294967296;
        };
    }

    generarNubeStardust(width, height, numPuntos) {
        const puntos = [];
        const random = this.crearGeneradorAleatorio(SECRETO);
        const margen = 20;

        for (let i = 0; i < numPuntos; i++) {
            const x = Math.floor(random() * (width - margen * 2)) + margen;
            const y = Math.floor(random() * (height - margen * 2)) + margen;

            // Asignamos qué bit del hash (0-15) le toca guardar a este punto
            // Esto es crucial para reconstruir el mensaje luego
            puntos.push({ x, y, bitIndex: i % 16 });
        }
        return puntos;
    }

    // Función auxiliar para modificar el brillo de un bloque 3x3
    modificarBloque(buffer, x, y, width, channels, delta) {
        for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 3; dx++) {
                const offset = ((y + dy) * width + (x + dx)) * channels;

                if (offset + 2 < buffer.length) {
                    // Modificamos R, G y B por igual para cambiar la LUMINANCIA
                    // sin alterar el tono cromático (menos sospechoso para el ojo)
                    for (let c = 0; c < 3; c++) { // 0=R, 1=G, 2=B
                        let val = buffer[offset + c];
                        // Sumamos el delta y aseguramos límites 0-255
                        val = Math.max(0, Math.min(255, val + delta));
                        buffer[offset + c] = val;
                    }
                }
            }
        }
    }

    escribirDiferencial(buffer, punto, width, hashPayload, channels) {
        // 1. Extraemos el bit que queremos guardar (0 o 1)
        const bit = (hashPayload >> (15 - punto.bitIndex)) & 1;

        // 2. Definimos dos bloques vecinos: A (Izquierda) y B (Derecha)
        const xA = punto.x;
        const yA = punto.y;

        const xB = punto.x + 3; // Desplazado 3 píxeles a la derecha
        const yB = punto.y;

        // 3. Aplicamos la lógica del "Balancín"
        if (bit === 1) {
            // Encode 1: A más brillante (+), B más oscuro (-)
            this.modificarBloque(buffer, xA, yA, width, channels, +INTENSIDAD_DIFERENCIAL);
            this.modificarBloque(buffer, xB, yB, width, channels, -INTENSIDAD_DIFERENCIAL);
        } else {
            // Encode 0: A más oscuro (-), B más brillante (+)
            this.modificarBloque(buffer, xA, yA, width, channels, -INTENSIDAD_DIFERENCIAL);
            this.modificarBloque(buffer, xB, yB, width, channels, +INTENSIDAD_DIFERENCIAL);
        }
    }

    // ========================================================================
    // 🚀 ORQUESTADOR PRINCIPAL
    // ========================================================================

    calcularHashEstructural(buffer) {
        const hash = crypto.createHash('sha256');
        for (let i = 0; i < buffer.length; i += 4) {
            hash.update(Buffer.from([buffer[i], buffer[i+1], buffer[i+2]]));
        }
        return hash.digest('hex');
    }

    async sellarImagen(rutaEntrada, rutaSalida) {
        try {
            console.log(`\n[GENERADOR V13] ⚖️ INICIANDO ESTRATEGIA DIFERENCIAL (TWIN-BLOCKS)`);

            const { data: buffer, info } = await sharp(rutaEntrada)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const canales = 4;
            console.log(`[GENERADOR V13] 📏 Imagen: ${info.width}x${info.height}`);

            // 1. CÁLCULOS
            const hashHex = this.calcularHashEstructural(buffer);
            const hashFinal4 = hashHex.substring(hashHex.length - 4); // Matrícula corta
            const hashPayload16 = parseInt(hashFinal4, 16);

            let origen;
            try {
                origen = MotorEspacial.calcularCentroUnico(info.width, info.height, hashHex, SECRETO);
            } catch (e) {
                console.log("[GENERADOR V13] ⚠️ MotorEspacial fallback a centro geométrico.");
                origen = { x: Math.floor(info.width/2), y: Math.floor(info.height/2) };
            }

            console.log(`[GENERADOR V13] 🔑 Hash Stardust: ${hashFinal4} (0x${hashFinal4})`);

            let bufferModificado = Buffer.from(buffer);

            // 2. CAPA 1: ALPHA (VOGEL - INTACTO)
            console.log(`[GENERADOR V13] 🛡️ Inyectando Capa Alpha (Vogel)...`);
            const puntosVogel = this.generarPatronVogel(info.width, info.height, origen, NUM_PUNTOS_VOGEL);
            const hashCorto = parseInt(hashHex.substring(0, 8), 16);
            const datosDummy = 0xAABBCCDD;

            puntosVogel.forEach(p => {
                this.escribirPuntoVogel(bufferModificado, p, info.width, datosDummy, hashCorto, canales);
            });

            // 3. CAPA 2: RGB (DIFERENCIAL - NUEVO)
            console.log(`[GENERADOR V13] ⚖️ Inyectando Capa Diferencial (Twin-Blocks)...`);
            // Generamos coordenadas aleatorias deterministas
            const puntosStardust = this.generarNubeStardust(info.width, info.height, DENSIDAD_STARDUST);

            puntosStardust.forEach(p => {
                this.escribirDiferencial(bufferModificado, p, info.width, hashPayload16, canales);
            });
            console.log(`   ✅ ${puntosStardust.length} pares de bloques de contraste inyectados.`);

            // 4. GUARDAR
            await sharp(bufferModificado, {
                raw: { width: info.width, height: info.height, channels: canales }
            })
            .withMetadata({
                tEXt: { Software: "Dragon3 V13 Differential" }
            })
            .png({ compressionLevel: 0, force: true })
            .toFile(rutaSalida);

            console.log(`[GENERADOR V13] 💾 Imagen guardada: ${rutaSalida}`);

            return { hash_end: hashFinal4 };

        } catch (error) {
            console.error(`[GENERADOR V13] ❌ Error: ${error.message}`);
            throw error;
        }
    }
}

// --- CLI ---
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        new GeneradorMBH_v13().sellarImagen(args[0], args[1]);
    }
}
