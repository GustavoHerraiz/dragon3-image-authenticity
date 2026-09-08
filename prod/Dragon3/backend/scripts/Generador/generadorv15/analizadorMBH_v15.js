/**
 * ============================================================================
 * DRAGON3 - ANALIZADOR V15.4 "NANO-HYDRA HUNTER" (NO-GHOST FIX)
 * ============================================================================
 * Corrección Crítica: Se ignora totalmente el hash '0000' (Ruido/Silencio)
 * para evitar falsos positivos en zonas lisas (cielos/degradados).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// --- CONFIGURACIÓN ---
const TILE_SIZE = 256; // Nano-Tiles
const PRIVATE_KEY = process.env.MBH_SECRET || "CLAVE_PRIVADA_QUICO_MELERO_2025";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SCAN_STEP = 1; // Precisión Hunter

const DENSIDAD_STARDUST_POR_TILE = 40;
const NUM_PUNTOS_ALPHA_POR_TILE = 30;

const BASE_DE_DATOS_SELLOS = [
    { id: "X881", cliente: "Quico Melero", hash_suffix: "d760" },
    // Eliminamos Blade Corp de la DB para evitar confusiones, o lo filtramos por lógica
    { id: "Y002", cliente: "Blade Corp Demo", hash_suffix: "0000" }
];

// ============================================================================
// 1. UTILIDADES
// ============================================================================

function crearGeneradorAleatorio(semilla) {
    let h = 0x811c9dc5;
    for (let i = 0; i < semilla.length; i++) { h ^= semilla.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

function generarVogelRelativo(numPuntos, radioMax) {
    const puntos = []; const scale = radioMax / Math.sqrt(numPuntos);
    for (let i = 0; i < numPuntos; i++) {
        const r = scale * Math.sqrt(i); const theta = i * GOLDEN_ANGLE;
        puntos.push({ x: r * Math.cos(theta), y: r * Math.sin(theta), index: i });
    }
    return puntos;
}

function generarStardustRelativo(tileSize, numPuntos, semilla) {
    const puntos = []; const random = crearGeneradorAleatorio(semilla); const margen = 8;
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
// 2. LECTURA
// ============================================================================

function analizarVentana(buffer, imgW, imgH, offX, offY) {
    // A. ALPHA (INFORMATIVO)
    const radioVogel = (TILE_SIZE / 2) * 0.85;
    const patronVogel = generarVogelRelativo(NUM_PUNTOS_ALPHA_POR_TILE, radioVogel);
    const centerX = offX + (TILE_SIZE / 2);
    const centerY = offY + (TILE_SIZE / 2);

    let alphaHits = 0;
    for (const p of patronVogel) {
        const absX = Math.floor(centerX + p.x); const absY = Math.floor(centerY + p.y);
        if (absX >= 0 && absX < imgW && absY >= 0 && absY < imgH) {
            const offset = (absY * imgW + absX) * 4;
            if ((buffer[offset + 3] & 1) === 1) alphaHits++;
        }
    }

    // B. STARDUST
    const patronStardust = generarStardustRelativo(TILE_SIZE, DENSIDAD_STARDUST_POR_TILE, PRIVATE_KEY);
    const votos = Array(16).fill(null).map(() => ({ unos: 0, ceros: 0 }));

    for (const p of patronStardust) {
        const absX = Math.floor(offX + p.x); const absY = Math.floor(offY + p.y);
        let ba=0, ca=0, bb=0, cb=0;

        // Bloque A
        for(let dy=0; dy<3; dy++) for(let dx=0; dx<3; dx++) {
            const px = absX + dx; const py = absY + dy;
            if (px < imgW && py < imgH) {
                const off = (py * imgW + px) * 4;
                if (off+2 < buffer.length) { ba += buffer[off]+buffer[off+1]+buffer[off+2]; ca += 3; }
            }
        }
        // Bloque B (+3px)
        const bx = absX + 3;
        for(let dy=0; dy<3; dy++) for(let dx=0; dx<3; dx++) {
            const px = bx + dx; const py = absY + dy;
            if (px < imgW && py < imgH) {
                const off = (py * imgW + px) * 4;
                if (off+2 < buffer.length) { bb += buffer[off]+buffer[off+1]+buffer[off+2]; cb += 3; }
            }
        }

        const valA = ca>0?ba/ca:0; const valB = cb>0?bb/cb:0;
        if (valA > valB + 2.0) votos[p.bitIndex].unos++;
        else if (valB > valA + 2.0) votos[p.bitIndex].ceros++;
    }

    let hash = 0; let bits = 0; let confSum = 0;
    for (let i = 0; i < 16; i++) {
        const v = votos[i]; const t = v.unos + v.ceros;
        if (t > 0) {
            bits++;
            confSum += Math.max(v.unos, v.ceros) / t;
            if (v.unos > v.ceros) hash |= (1 << (15 - i));
        }
    }

    if (bits < 10) return null;

    return {
        hashHex: hash.toString(16).padStart(4, '0'),
        confianza: confSum / 16,
        alphaScore: alphaHits / NUM_PUNTOS_ALPHA_POR_TILE
    };
}

// ============================================================================
// 3. MAIN (VERSIÓN FINAL CALIBRADA V15.7 - "THE SNIPER")
// ============================================================================

export async function analizadorImagenMBH_v15(ruta) {
    const res = new RespuestaStandard("analizadorMBH_v15", "Nano-Hydra Hunter V15.7", "15.7.0");
    try {
        console.log(`[HYDRA] Escaneando: ${path.basename(ruta)} (Tile: ${TILE_SIZE}px | Step: ${SCAN_STEP}px)`);
        const { data: buf, info } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let tilesFound = 0;
        let bestConf = 0;
        let detected = null;
        let checks = 0;

        for (let y = 0; y <= info.height - TILE_SIZE; y += SCAN_STEP) {
            for (let x = 0; x <= info.width - TILE_SIZE; x += SCAN_STEP) {
                checks++;
                const r = analizarVentana(buf, info.width, info.height, x, y);

                // 1. EL MURO ANTI-OLIVO (Blindaje a 0.86)
                // Bloquea falsos positivos de textura natural (máx detectado: 85.4%)
                if (r && r.confianza > 0.86) {

                    // Filtro de ruido homogéneo
                    if (r.hashHex === '0000') continue;

                    const match = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === r.hashHex);
                    if (match) {
                        tilesFound++;

                        // 2. DETECCIÓN POR CALIDAD (Sniping)
                        // Si pasa el muro de 0.86, la señal es legítima.
                        // Guardamos la mejor coincidencia encontrada.
                        if (r.confianza > bestConf) {
                            bestConf = r.confianza;
                            detected = match;
                        }
                    }
                }
            }
            // Optimización: si encontramos una señal casi perfecta, no hace falta seguir escaneando
            if (bestConf > 0.98) break;
        }

        // 3. FRENO DE MANO (Sensibilidad Máxima)
        // Con 1 solo hit de alta confianza (>0.86) es suficiente para validar
        if (tilesFound < 1) {
            detected = null;
            bestConf = 0;
        }

        console.log(`[HYDRA] Resultado: ${tilesFound} hits. Mejor Conf: ${(bestConf * 100).toFixed(1)}%`);

        let tit = "FALLO", msg = "No detectado", est = "danger";
        if (detected) {
            tit = "EXITO";
            msg = `Cliente: ${detected.cliente}`;
            est = "success";
        }

        res.definirVoto(tit, bestConf, bestConf * 100, "Alto");
        res.response.evidencia_visual = {
            Cliente_Identificado: detected,
            Hits_Totales: tilesFound,
            Mejor_Confianza: bestConf,
            Checks_Realizados: checks,
            Hash_Detectado: detected ? detected.hash_suffix : null
        };
        return res;

    } catch (e) {
        return res.error("Error", e.message).cerrar();
    }
}

// --- CLI ---
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const args = process.argv.slice(2);
    if (args.length >= 1) {
        analizadorImagenMBH_v15(args[0]).then(r => {
            const ev = r.response.evidencia_visual;
            if (ev.Cliente_Identificado) {
                console.log(`✅ EXITO: ${ev.Cliente_Identificado.cliente} (${(ev.Mejor_Confianza*100).toFixed(1)}%)`);
            } else {
                console.log(`❌ FALLO`);
            }
        });
    }
}
