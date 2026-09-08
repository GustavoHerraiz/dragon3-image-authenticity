/**
 * ============================================================================
 * DRAGON3 - GENERADOR MBH (V3 FINAL: ROBUSTO Y AUTOCONTENIDO)
 * ============================================================================
 * Implementa inyección de sello por Patrón Vogel Distribuido.
 * - Fix: Corregido el error de ejecución de MotorEspacial.
 * - Utiliza Pre-Renderizado para estabilidad de píxeles (JPG -> PNG -> RAW).
 * - Inyecta Manifiesto Universal y Hash de Integridad.
 * - Añade Metadatos limpios (Copyright/Autor).
 */

import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- ADAPTACIÓN DE RUTAS ---
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import dragon from '../../../utilidades/logger.js';

const SECRETO = process.env.MBH_SECRET || 'CLAVE_PRIVADA_QUICO_MELERO_2025';
const NOMBRE_MODULO = 'generadorMBH_v3.js';
const NUM_PUNTOS_VOGEL = 1500; // Puntos distribuidos para el sellado

// --- FUNCIONES AUXILIARES INCLUIDAS PARA AUTOCONTENIDO ---

function generarPatronVogel(width, height, centro, numPuntos) {
    const puntos = [];
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const maxRadio = Math.sqrt(Math.pow(Math.max(centro.x, width - centro.x), 2) +
                               Math.pow(Math.max(centro.y, height - centro.y), 2));
    const scale = maxRadio / Math.sqrt(numPuntos);

    for (let i = 0; i < numPuntos; i++) {
        const r = scale * Math.sqrt(i);
        const theta = i * GOLDEN_ANGLE;
        const x = Math.round(centro.x + r * Math.cos(theta));
        const y = Math.round(centro.y + r * Math.sin(theta));
        if (x >= 0 && x <= width - 8 && y >= 0 && y <= height - 8) puntos.push({ x, y });
    }
    return puntos;
}

function escribirBloque8x8(buffer, punto, anchoImagen, data, hash, channels) {
    const payloadBuffer = Buffer.alloc(8);
    payloadBuffer.writeUInt32BE(data, 0);
    payloadBuffer.writeUInt32BE(hash, 4);

    let bitIndex = 0;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (bitIndex >= 64) return;
            if (punto.y + y >= 0 && punto.x + x >= 0) {
                const offset = ((punto.y + y) * anchoImagen + (punto.x + x)) * channels;

                if (offset + 3 >= buffer.length) continue;

                const bytePayload = payloadBuffer[Math.floor(bitIndex / 8)];
                const bit = (bytePayload >> (7 - (bitIndex % 8))) & 1;

                // Escribir en el LSB del Canal Alpha (índice 3)
                buffer[offset + 3] = (buffer[offset + 3] & 0xFE) | bit;
            }
            bitIndex++;
        }
    }
}

function calcularHashEstructural(buffer) {
    const hash = crypto.createHash('sha256');
    const canales = 4;
    const pixelCount = buffer.length / canales;
    const rgbBuffer = Buffer.allocUnsafe(pixelCount * 3);

    // Aplicar máscara de cero para la estabilidad del hash
    let k = 0;
    for(let i=0; i<buffer.length; i+=canales) {
        rgbBuffer[k++] = buffer[i] & 0xFE;
        rgbBuffer[k++] = buffer[i+1] & 0xFE;
        rgbBuffer[k++] = buffer[i+2] & 0xFE;
    }
    hash.update(rgbBuffer);
    return hash.digest('hex');
}


export class GeneradorMBH {
    constructor() {
        // Dejar el constructor vacío para evitar el error de instancia no definida
    }

    async sellarImagen(rutaEntrada, rutaSalida) {
        try {
            if (!fs.existsSync(rutaEntrada)) throw new Error(`Archivo no encontrado: ${rutaEntrada}`);

            dragon.respira(`Iniciando sellado V3: ${rutaEntrada}`, NOMBRE_MODULO, 'INIT');

            // 1. PRE-RENDERIZADO ESTABLE (Canonicalización)
            const pngBufferInicial = await sharp(rutaEntrada)
                .rotate()
                .toColourspace('srgb')
                .png()
                .toBuffer();

            // 2. CARGA DE TRABAJO
            const imagenEstable = sharp(pngBufferInicial);
            const { data: buffer, info } = await imagenEstable
                .ensureAlpha() // Asegura 4 canales (RGBA)
                .raw()
                .toBuffer({ resolveWithObject: true });

            const canales = 4;

            // 3. CÁLCULO DE INTEGRIDAD Y ORIGEN
            const hashHex = calcularHashEstructural(buffer);

            // 🔥 CORRECCIÓN APLICADA: Llamada estática directa a MotorEspacial
            const origen = MotorEspacial.calcularCentroUnico(info.width, info.height, hashHex, SECRETO);

            const hashCortoStr = hashHex.substring(0, 8);
            const hashCorto = parseInt(hashCortoStr, 16);

            // 4. PREPARACIÓN DEL MANIFIESTO (El payload)
            const manifiesto = {
                aut: "Quico Melero",
                copy: "Blade Corp 2025",
                lic: "MBH-V3-Gold",
                hash: hashCortoStr,
                width_orig: info.width,
                height_orig: info.height,
                url: "blade.net/verify"
            };
            const manifiestoTexto = JSON.stringify(manifiesto);

            // 5. INYECCIÓN
            const puntosVogel = generarPatronVogel(info.width, info.height, origen, NUM_PUNTOS_VOGEL);
            const bufferManifiesto = Buffer.from(manifiestoTexto, 'utf-8');
            const longitudMensaje = bufferManifiesto.length;

            let bufferModificado = Buffer.from(buffer);

            dragon.respira(`Inyectando Manifiesto en ${puntosVogel.length} puntos...`, NOMBRE_MODULO, 'INJECT', { hash: hashCortoStr });

            puntosVogel.forEach((punto, index) => {
                const inicio = (index * 4) % longitudMensaje;
                let chunk = 0;
                for(let i=0; i<4; i++) {
                    if (inicio + i < longitudMensaje) chunk = (chunk << 8) | bufferManifiesto[inicio + i];
                    else chunk = (chunk << 8) | 0x00;
                }
                escribirBloque8x8(bufferModificado, punto, info.width, chunk, hashCorto, canales);
            });

            dragon.sonrie(`Sello inyectado. ID: ${manifiesto.lic}`, NOMBRE_MODULO, 'SELLO_OK', { puntos: puntosVogel.length });

            // 6. GUARDAR CON METADATOS LIMPIOS (V2 Compliance)
            const metadataFinal = {
                orientation: 1,
                copyright: "© Blade Corporation / Quico Melero",
                creator: manifiesto.aut,
                software: "Dragon3 MBH Engine V3",
                user: { ManifiestoMBH: manifiestoTexto }
            };

            await sharp(bufferModificado, {
                raw: {
                    width: info.width,
                    height: info.height,
                    channels: canales
                }
            })
            .withMetadata(metadataFinal)
            .png({ compressionLevel: 0, adaptiveFiltering: false, palette: false, force: true })
            .toFile(rutaSalida);

            return { id: manifiesto.lic, hash: hashCortoStr, ruta: rutaSalida };

        } catch (error) {
            dragon.agoniza('Fallo en generador V3', error, NOMBRE_MODULO, 'ERROR_GEN');
            throw error;
        }
    }
}

// --- UTILIDADES GLOBALES (para ejecución CLI) ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUTA_IMAGEN_BASE = path.join(__dirname, 'Atardecer.jpg');
const RUTA_IMAGEN_SALIDA = path.join(__dirname, 'Atardecer_Sellada.png');


if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        new GeneradorMBH().sellarImagen(args[0], args[1]);
    } else if (fs.existsSync(RUTA_IMAGEN_BASE)) {
        new GeneradorMBH().sellarImagen(RUTA_IMAGEN_BASE, RUTA_IMAGEN_SALIDA)
            .catch(err => console.error("Fallo al ejecutar la CLI de sellado:", err.message));
    }
}
