/**
 * ============================================================================
 * DRAGON3 - GENERADOR V15 "HYDRA" (MOSAICO HOLOGRÁFICO)
 * ============================================================================
 * Estrategia: Tiling (Teselado).
 * La imagen se divide en celdas de seguridad (TILE_SIZE).
 * Cada celda contiene una copia completa e independiente del sello.
 * Ventaja: Resistencia extrema al recorte (Crop).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// --- CONFIGURACIÓN HYDRA ---
const TILE_SIZE = 256; // Tamaño de cada "baldosa" de seguridad (px)
const DENSIDAD_STARDUST_POR_TILE = 40; // Puntos por celda (menos densidad porque hay muchas celdas)
const NUM_PUNTOS_ALPHA_POR_TILE = 30; // Geometría Vogel por celda
const PRIVATE_KEY = process.env.MBH_SECRET || "CLAVE_PRIVADA_QUICO_MELERO_2025";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// --- BASE DE DATOS MOCK ---
const CLIENTE_ACTUAL = {
    id_licencia: "MBH-2025-X881",
    cliente: "Quico Melero",
    hash_suffix: "d760" // Hash de 16 bits (4 hex)
};

// ============================================================================
// 🛠️ MOTOR MATEMÁTICO RELATIVO
// ============================================================================

function crearGeneradorAleatorio(semilla) {
    let h = 0x811c9dc5;
    for (let i = 0; i < semilla.length; i++) { h ^= semilla.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

// Genera puntos relativos al centro de una celda (0,0 es el centro del tile)
function generarVogelRelativo(numPuntos, radioMax) {
    const puntos = [];
    const scale = radioMax / Math.sqrt(numPuntos);
    for (let i = 0; i < numPuntos; i++) {
        const r = scale * Math.sqrt(i);
        const theta = i * GOLDEN_ANGLE;
        puntos.push({
            x: r * Math.cos(theta), // Relativo al centro
            y: r * Math.sin(theta),
            index: i
        });
    }
    return puntos;
}

// Genera Stardust relativo al tamaño del tile
function generarStardustRelativo(tileSize, numPuntos, semilla) {
    const puntos = [];
    const random = crearGeneradorAleatorio(semilla);
    const margen = 10;
    for (let i = 0; i < numPuntos; i++) {
        puntos.push({
            x: Math.floor(random() * (tileSize - margen * 2)) + margen,
            y: Math.floor(random() * (tileSize - margen * 2)) + margen,
            bitIndex: i % 16
        });
    }
    return puntos;
}

// ============================================================================
// 🧬 INYECTOR HYDRA
// ============================================================================

export class GeneradorMBH_v15 {

    constructor() {
        console.log(`[GENERADOR V15] 🐍 Inicializando Protocolo HYDRA...`);
        console.log(`[GENERADOR V15] 🧱 Tile Size: ${TILE_SIZE}x${TILE_SIZE}px`);
    }

    async sellarImagen(rutaEntrada, rutaSalida) {
        try {
            console.log(`[HYDRA] Cargando: ${path.basename(rutaEntrada)}`);
            const image = sharp(rutaEntrada);
            const metadata = await image.metadata();

            // Asegurar canal Alpha
            const buffer = await image.ensureAlpha().raw().toBuffer();
            const width = metadata.width;
            const height = metadata.height;
            const channels = 4; // R, G, B, Alpha

            // Calcular Grid
            const cols = Math.ceil(width / TILE_SIZE);
            const rows = Math.ceil(height / TILE_SIZE);
            console.log(`[HYDRA] 📐 Grid calculado: ${cols}x${rows} (${cols*rows} celdas activas)`);

            // Preparar patrones BASE (se repetirán en cada tile)
            const radioVogel = (TILE_SIZE / 2) * 0.8; // 80% del radio del tile
            const patronVogel = generarVogelRelativo(NUM_PUNTOS_ALPHA_POR_TILE, radioVogel);
            const patronStardust = generarStardustRelativo(TILE_SIZE, DENSIDAD_STARDUST_POR_TILE, PRIVATE_KEY);

            let totalPuntosAlpha = 0;
            let totalParesStardust = 0;

            // --- BUCLE PRINCIPAL (ITERAR POR CELDAS) ---
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {

                    // Coordenadas absolutas de la esquina superior izquierda del Tile
                    const tileX = c * TILE_SIZE;
                    const tileY = r * TILE_SIZE;

                    // Centro absoluto del Tile (para Vogel)
                    const centerX = tileX + (TILE_SIZE / 2);
                    const centerY = tileY + (TILE_SIZE / 2);

                    // 1. INYECTAR CAPA ALPHA (VOGEL) EN ESTE TILE
                    patronVogel.forEach(p => {
                        const absX = Math.floor(centerX + p.x);
                        const absY = Math.floor(centerY + p.y);

                        // Chequeo de límites (por si es el último tile y se sale)
                        if (absX >= 0 && absX < width && absY >= 0 && absY < height) {
                            const offset = (absY * width + absX) * channels;
                            // Codificación LSB en Alpha (Misma lógica V13 pero repetida)
                            // Aquí simplificamos: Solo marcamos geometría para detección,
                            // en V15 completa meteríamos datos reales.
                            // Marcamos bit 0 de Alpha como "1"
                            buffer[offset + 3] |= 1;
                            totalPuntosAlpha++;
                        }
                    });

                    // 2. INYECTAR CAPA DIFERENCIAL (STARDUST) EN ESTE TILE
                    patronStardust.forEach(p => {
                        const absX = Math.floor(tileX + p.x);
                        const absY = Math.floor(tileY + p.y);

                        // Bloque A y B (Vecinos dentro del tile)
                        // Aumentamos Delta según el bit del Hash del cliente
                        // Hash: "d760" -> 1101...
                        const targetBit = (parseInt(CLIENTE_ACTUAL.hash_suffix, 16) >> (15 - p.bitIndex)) & 1;
                        const delta = targetBit ? 11 : -11; // NIVEL DIOS / INVISIBILIDAD CUÁNTICA

                        // Modificar Bloque A (3x3)
                        for(let dy=0; dy<3; dy++) for(let dx=0; dx<3; dx++) {
                            const px = absX + dx; const py = absY + dy;
                            if (px < width && py < height) {
                                const off = (py * width + px) * channels;
                                buffer[off] = Math.max(0, Math.min(255, buffer[off] + delta));     // R
                                buffer[off+1] = Math.max(0, Math.min(255, buffer[off+1] + delta)); // G
                                buffer[off+2] = Math.max(0, Math.min(255, buffer[off+2] + delta)); // B
                            }
                        }

                        // Modificar Bloque B (Compensación inversa para invisibilidad)
                        const bx = absX + 3; // 3px a la derecha
                        for(let dy=0; dy<3; dy++) for(let dx=0; dx<3; dx++) {
                            const px = bx + dx; const py = absY + dy;
                            if (px < width && py < height) {
                                const off = (py * width + px) * channels;
                                buffer[off] = Math.max(0, Math.min(255, buffer[off] - delta));     // R
                                buffer[off+1] = Math.max(0, Math.min(255, buffer[off+1] - delta)); // G
                                buffer[off+2] = Math.max(0, Math.min(255, buffer[off+2] - delta)); // B
                            }
                        }
                        totalParesStardust++;
                    });
                }
            }

            console.log(`[HYDRA] ✅ Inyección completada.`);
            console.log(`   - Puntos Alpha Totales: ${totalPuntosAlpha}`);
            console.log(`   - Pares Stardust Totales: ${totalParesStardust}`);

            // Guardar
            await sharp(buffer, { raw: { width, height, channels } })
                .png({ compressionLevel: 9 })
                .toFile(rutaSalida);

            console.log(`[HYDRA] 💾 Imagen guardada: ${rutaSalida}`);

        } catch (error) {
            console.error(`[ERROR HYDRA] ${error.message}`);
        }
    }
}

// --- EJECUCIÓN DIRECTA ---
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const gen = new GeneradorMBH_v15();
    // Ajusta las rutas según tu entorno
    gen.sellarImagen('Atardecer.jpg', 'Atardecer_Hydra_V15.png');
}
