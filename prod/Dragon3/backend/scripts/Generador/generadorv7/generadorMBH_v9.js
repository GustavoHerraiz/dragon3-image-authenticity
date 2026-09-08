/**
 * ============================================================================
 * DRAGON3 - GENERADOR MBH V9 (ESTRATEGIA HÍBRIDA MEJORADA)
 * ============================================================================
 * Estrategia:
 * - PUNTOS CENTRALES (10 primeros): Información completa + índice
 * - PUNTOS PERIFÉRICOS (413 restantes): Solo índice + checksum (16 bits)
 * - Todo en canal Alpha (invisible)
 */

import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import dragon from '../../../utilidades/logger.js';

const SECRETO = process.env.MBH_SECRET || 'CLAVE_PRIVADA_QUICO_MELERO_2025';
const NOMBRE_MODULO = 'generadorMBH_v9.js';
const NUM_PUNTOS_TOTAL = 423;
const NUM_PUNTOS_CENTRALES = 10;
const NUM_PUNTOS_PERIFERICOS = NUM_PUNTOS_TOTAL - NUM_PUNTOS_CENTRALES;

// --- FUNCIONES AUXILIARES V9 ---

function generarPatronVogel_v9(width, height, centro, numPuntos) {
        const puntos = [];
        const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

        // --- CORRECCIÓN: EXPANSIÓN TOTAL ---
        // Calculamos la distancia desde el centro a las 4 esquinas del lienzo.
        const distEsq1 = Math.hypot(centro.x - 0, centro.y - 0);          // Sup-Izq
        const distEsq2 = Math.hypot(centro.x - width, centro.y - 0);      // Sup-Der
        const distEsq3 = Math.hypot(centro.x - 0, centro.y - height);     // Inf-Izq
        const distEsq4 = Math.hypot(centro.x - width, centro.y - height); // Inf-Der

        // Usamos la distancia MÁXIMA como radio.
        // Esto fuerza a la espiral a expandirse hasta cubrir el píxel más lejano.
        const radioMax = Math.max(distEsq1, distEsq2, distEsq3, distEsq4);

        const scale = radioMax / Math.sqrt(numPuntos);

        for (let i = 0; i < numPuntos; i++) {
            const r = scale * Math.sqrt(i);
            const theta = i * GOLDEN_ANGLE;

            // Coordenadas absolutas
            const x = Math.round(centro.x + r * Math.cos(theta));
            const y = Math.round(centro.y + r * Math.sin(theta));

            // CLIPPING: "Recortamos" los puntos que se salen del lienzo.
            // Así la espiral es teóricamente gigante, pero solo guardamos lo útil.
            if (x >= 0 && x < width && y >= 0 && y < height) {
                puntos.push({
                    x,
                    y,
                    index: i,
                    r: r,
                    theta: theta,
                    // Metadatos para el analizador
                    x_teor_norm: Math.cos(theta),
                    y_teor_norm: Math.sin(theta),
                    distancia_norm: Math.sqrt(i)
                });
            }
        }
        return puntos;
    }

function escribirPuntoCentral(buffer, punto, anchoImagen, datos, hash, channels) {
    const payloadBuffer = Buffer.alloc(8); // 64 bits
    // Estructura: [32 bits datos][23 bits hash][9 bits índice]
    const hash23 = hash & 0x7FFFFF; // 23 bits del hash
    const datos32 = datos & 0xFFFFFFFF;

    // Combinar en 64 bits
    const bits64 = (BigInt(datos32) << 32n) |
                   (BigInt(hash23) << 9n) |
                   BigInt(punto.index);

    payloadBuffer.writeBigUInt64BE(bits64);

    // Escribir en bloque 8x8 (LSB de Alpha)
    let bitIndex = 0;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (bitIndex >= 64) return;
            if (punto.y + y >= 0 && punto.x + x >= 0) {
                const offset = ((punto.y + y) * anchoImagen + (punto.x + x)) * channels;
                if (offset + 3 >= buffer.length) continue;

                const bytePayload = payloadBuffer[Math.floor(bitIndex / 8)];
                const bit = (bytePayload >> (7 - (bitIndex % 8))) & 1;
                buffer[offset + 3] = (buffer[offset + 3] & 0xFE) | bit;
            }
            bitIndex++;
        }
    }
}

function calcularChecksumPunto(punto) {
    // Checksum de 7 bits basado en índice y posición teórica
    const xInt = Math.abs(Math.round(punto.x_teor_norm * 1000)) % 128;
    const yInt = Math.abs(Math.round(punto.y_teor_norm * 1000)) % 128;
    return (punto.index + xInt + yInt) % 128;
}

function escribirPuntoPeriferico(buffer, punto, anchoImagen, channels) {
    // Estructura: [9 bits índice][7 bits checksum] = 16 bits
    const checksum = calcularChecksumPunto(punto);
    const bits16 = (punto.index << 7) | checksum;

    // Escribir en bloque 4x4 (16 píxeles, 1 bit por píxel)
    let bitIndex = 0;
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            if (bitIndex >= 16) return;
            if (punto.y + y >= 0 && punto.x + x >= 0) {
                const offset = ((punto.y + y) * anchoImagen + (punto.x + x)) * channels;
                if (offset + 3 >= buffer.length) continue;

                const bit = (bits16 >> (15 - bitIndex)) & 1;
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

    let k = 0;
    for (let i = 0; i < buffer.length; i += canales) {
        rgbBuffer[k++] = buffer[i] & 0xFE;
        rgbBuffer[k++] = buffer[i + 1] & 0xFE;
        rgbBuffer[k++] = buffer[i + 2] & 0xFE;
    }
    hash.update(rgbBuffer);
    return hash.digest('hex');
}

export class GeneradorMBH_v9 {
    async sellarImagen(rutaEntrada, rutaSalida) {
        try {
            console.log(`\n[GENERADOR V9] 🚀 INICIANDO SELLADO V9`);
            console.log(`[GENERADOR V9] 📁 Entrada: ${rutaEntrada}`);

            if (!fs.existsSync(rutaEntrada)) {
                throw new Error(`Archivo no encontrado: ${rutaEntrada}`);
            }

            // 1. PRE-RENDERIZADO ESTABLE
            const pngBufferInicial = await sharp(rutaEntrada)
                .rotate()
                .toColourspace('srgb')
                .png()
                .toBuffer();

            // 2. CARGA DE TRABAJO
            const imagenEstable = sharp(pngBufferInicial);
            const { data: buffer, info } = await imagenEstable
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const canales = 4;
            console.log(`[GENERADOR V9] 📏 Dimensiones: ${info.width}x${info.height}`);

            // 3. CÁLCULO DE HASH Y CENTRO
            const hashHex = calcularHashEstructural(buffer);
            const origen = MotorEspacial.calcularCentroUnico(info.width, info.height, hashHex, SECRETO);
            const hashCortoStr = hashHex.substring(0, 8);
            const hashCorto = parseInt(hashCortoStr, 16);

            console.log(`[GENERADOR V9] 🔑 Hash: ${hashCortoStr}`);
            console.log(`[GENERADOR V9] 🎯 Centro: (${origen.x}, ${origen.y})`);

            // 4. PREPARAR MANIFIESTO
            const manifiesto = {
                aut: "Quico Melero",
                copy: "Blade Corp 2025",
                lic: "MBH-V9-Hybrid",
                hash: hashCortoStr,
                width_orig: info.width,
                height_orig: info.height,
                url: "blade.net/verify",
                version: "9.0.0",
                estrategia: "hibrida_v9",
                puntos_centrales: NUM_PUNTOS_CENTRALES,
                puntos_perifericos: NUM_PUNTOS_PERIFERICOS,
                centro: `${origen.x},${origen.y}`
            };

            const manifiestoTexto = JSON.stringify(manifiesto);
            console.log(`[GENERADOR V9] 📋 Manifiesto creado`);

            // 5. GENERAR PUNTOS VOGEL
            const puntosVogel = generarPatronVogel_v9(info.width, info.height, origen, NUM_PUNTOS_TOTAL);
            console.log(`[GENERADOR V9] 📍 Puntos generados: ${puntosVogel.length}/${NUM_PUNTOS_TOTAL}`);

            // 6. INYECTAR SELLO
            let bufferModificado = Buffer.from(buffer);
            const bufferManifiesto = Buffer.from(manifiestoTexto, 'utf-8');
            const longitudMensaje = bufferManifiesto.length;

            console.log(`[GENERADOR V9] 💉 Inyectando puntos...`);

            let puntosCentralesInyectados = 0;
            let puntosPerifericosInyectados = 0;

            puntosVogel.forEach((punto, index) => {
                if (index < NUM_PUNTOS_CENTRALES) {
                    // PUNTOS CENTRALES: información completa + índice
                    const inicio = (index * 4) % longitudMensaje;
                    let datosChunk = 0;
                    for (let i = 0; i < 4; i++) {
                        if (inicio + i < longitudMensaje) {
                            datosChunk = (datosChunk << 8) | bufferManifiesto[inicio + i];
                        } else {
                            datosChunk = (datosChunk << 8) | 0x00;
                        }
                    }

                    escribirPuntoCentral(bufferModificado, punto, info.width, datosChunk, hashCorto, canales);
                    puntosCentralesInyectados++;
                } else {
                    // PUNTOS PERIFÉRICOS: solo índice + checksum
                    escribirPuntoPeriferico(bufferModificado, punto, info.width, canales);
                    puntosPerifericosInyectados++;
                }
            });

            console.log(`[GENERADOR V9] ✅ Inyección completada:`);
            console.log(`   • Puntos centrales: ${puntosCentralesInyectados}/${NUM_PUNTOS_CENTRALES}`);
            console.log(`   • Puntos periféricos: ${puntosPerifericosInyectados}/${NUM_PUNTOS_PERIFERICOS}`);

            // 7. GUARDAR IMAGEN
            const metadataFinal = {
                orientation: 1,
                copyright: "© Blade Corporation / Quico Melero",
                creator: manifiesto.aut,
                software: "Dragon3 MBH Engine V9 (Híbrido)",
                user: {
                    ManifiestoMBH: manifiestoTexto,
                    Version: "9.0.0",
                    Estrategia: "hibrida_v9"
                }
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

            console.log(`[GENERADOR V9] 💾 Imagen guardada: ${rutaSalida}`);

            return {
                id: manifiesto.lic,
                hash: hashCortoStr,
                ruta: rutaSalida,
                centro: origen,
                puntos_centrales: puntosCentralesInyectados,
                puntos_perifericos: puntosPerifericosInyectados,
                manifiesto: manifiesto
            };

        } catch (error) {
            console.error(`[GENERADOR V9] ❌ Error: ${error.message}`);
            throw error;
        }
    }
}

// --- EJECUCIÓN CLI ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        new GeneradorMBH_v9().sellarImagen(args[0], args[1])
            .then(result => {
                console.log(`\n[GENERADOR V9] ✅ SELLO APLICADO`);
                console.log(`   Hash: ${result.hash}`);
                console.log(`   Centro: (${result.centro.x}, ${result.centro.y})`);
            })
            .catch(err => console.error("[GENERADOR V9] ❌ Error:", err.message));
    } else {
        const RUTA_IMAGEN_BASE = path.join(__dirname, 'Atardecer.jpg');
        const RUTA_IMAGEN_SALIDA = path.join(__dirname, 'Atardecer_Sellada_V9.png');

        if (fs.existsSync(RUTA_IMAGEN_BASE)) {
            new GeneradorMBH_v9().sellarImagen(RUTA_IMAGEN_BASE, RUTA_IMAGEN_SALIDA)
                .then(result => {
                    console.log(`\n[GENERADOR V9] ✅ SELLO APLICADO`);
                    console.log(`   Hash: ${result.hash}`);
                    console.log(`   Centro: (${result.centro.x}, ${result.centro.y})`);
                })
                .catch(err => console.error("[GENERADOR V9] ❌ Error:", err.message));
        }
    }
}
