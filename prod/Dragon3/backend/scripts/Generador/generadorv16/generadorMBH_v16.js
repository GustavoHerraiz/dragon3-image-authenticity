/**
 * ============================================================================
 * DRAGON3 - GENERADOR V16.2 "SYMBIOTIC STARDUST" (EDICIÓN DEFINITIVA)
 * ============================================================================
 */

import sharp from 'sharp';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import path from 'path';

// --- CONFIGURACIÓN DE SEGURIDAD ---
const PRIVATE_KEY = "CLAVE_PRIVADA_QUICO_MELERO_2025";
const TILE_SIZE = 256;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const UMBRAL_ENTROPIA = 400;

export const BASE_DE_DATOS_SELLOS = [
    { id: "X881", cliente: "Quico Melero", hash_suffix: "d760" }
];

export class GeneradorMBH_v16_2 {

    // 1. Identidad Perceptual (Brújula para el Analizador)
    async obtenerPHash(buffer, info) {
        const lowRes = await sharp(buffer, {raw: {width: info.width, height: info.height, channels: 4}})
            .resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
        const mean = lowRes.reduce((a, b) => a + b) / 64;
        return lowRes.map(val => (val > mean ? '1' : '0')).join('');
    }

    async sellarImagen(rutaEntrada, rutaSalida) {
    try {
        const tInicio = performance.now();
        console.log(`[V16.2] 🧪 INICIANDO PROTOCOLO SYMBIOTIC STARDUST...`);

        const image = sharp(rutaEntrada);
        const { data: buffer, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = info;

        // A. EXTRACCIÓN DEL DNA VISUAL (pHash)
        // Usamos el pHash para que la marca sea independiente del formato binario
        const pHashBits = await this.obtenerPHash(buffer, info);
        const pHashHex = BigInt('0b' + pHashBits).toString(16).padStart(16, '0');
        const SUFIJO = pHashHex.slice(-4); // Los 4 últimos dígitos del pHash
        const TARGET_20BIT = parseInt("f" + SUFIJO, 16); // ADN de 20 bits: prefijo 'f' + sufijo

        // --- SIMULACIÓN DE REGISTRO EN BASE DE DATOS ---
        // Registramos el sufijo para que el Analizador sepa a quién pertenece
        const registroExistente = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === SUFIJO);
        if (!registroExistente) {
            BASE_DE_DATOS_SELLOS.push({
                id: `D3-${SUFIJO.toUpperCase()}`,
                cliente: "Quico Melero",
                hash_suffix: SUFIJO,
                obra: path.basename(rutaEntrada)
            });
            console.log(`[REGISTRO] ADN f${SUFIJO} vinculado a Quico Melero en la DB.`);
        }
        // -----------------------------------------------

        console.log(`[V16.2] pHash: ${pHashHex} | ADN Target: f${SUFIJO}`);

        // B. FASE DE ESCUCHA (RECLUTAMIENTO POR RESONANCIA)
        // Buscamos los 16 bits del sufijo en el ruido natural
        const target16 = parseInt(SUFIJO, 16);
        let reclutas = [];
        let registro = 0, bits = 0;

        for (let i = 0; i < buffer.length; i++) {
            if (i % 4 === 3) continue; // No tocamos el canal Alfa aquí
            for (let b = 7; b >= 0; b--) {
                registro = ((registro << 1) | ((buffer[i] >> b) & 1)) & 0xFFFF;
                if (++bits >= 16 && registro === target16) {
                    // Filtramos por entropía para que el parche sea invisible y robusto
                    if (this.medirEntropia(buffer, i) >= UMBRAL_ENTROPIA) {
                        reclutas.push({
                            x: Math.floor((i / 4) % width),
                            y: Math.floor((i / 4) / width)
                        });
                    }
                }
            }
        }
        console.log(`[V16.2] Reclutas encontrados en el ruido: ${reclutas.length}`);

        // C. LADY STARDUST (INYECCIÓN DE ADN +-10 EN COLOR)
        // Aplicamos el diferencial de votos en el canal verde (puedes cambiarlo a otro)
        reclutas.forEach((p, idx) => {
            const bitIdx = idx % 20; // Repetimos el ADN de 20 bits cíclicamente
            const bitValue = (TARGET_20BIT >> (19 - bitIdx)) & 1;
            this.aplicarLadyStardust(buffer, p.x, p.y, width, bitValue);
        });

        // D. GEOMETRÍA VOGEL (CENTRO DINÁMICO EN CANAL ALFA)
        // La semilla depende de la clave y el pHash para que el Analizador la recree
        const semillaVogel = PRIVATE_KEY + pHashHex;
        let puntosGeometria = 0;

        for (let y = 0; y <= height - TILE_SIZE; y += TILE_SIZE) {
            for (let x = 0; x <= width - TILE_SIZE; x += TILE_SIZE) {
                // Generamos la espiral desplazada según el hash de la semilla
                const puntosVogel = this.calcularVogelSincronizado(x, y, semillaVogel);
                puntosVogel.forEach(p => {
                    const off = (p.y * width + p.x) * 4;
                    if (off + 3 < buffer.length) {
                        buffer[off + 3] |= 1; // Marcamos el LSB del canal Alfa
                        puntosGeometria++;
                    }
                });
            }
        }

        // GUARDAR EL MASTER (PNG para preservar los bits exactos)
        await sharp(buffer, { raw: { width, height, channels: 4 } }).png().toFile(rutaSalida);

        const tFin = performance.now();
        console.log(`\n============================================================`);
        console.log(`✅ MASTER GENERADO CON ÉXITO: ${rutaSalida}`);
        console.log(`   - Tiempo: ${((tFin - tInicio)/1000).toFixed(2)}s`);
        console.log(`   - Votos Stardust (Color +-10): ${reclutas.length}`);
        console.log(`   - Puntos Vogel (Alfa LSB): ${puntosGeometria}`);
        console.log(`   - ADN Registrado: f${SUFIJO}`);
        console.log(`============================================================\n`);

    } catch (e) {
        console.error(`[FATAL] Error en el proceso: ${e.message}`);
    }
}

    // diferencial +-10 en bloque dual 3x3 para canal color (Verde)
    aplicarLadyStardust(buffer, x, y, width, bit) {
        const delta = bit ? 10 : -10;
        for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 3; dx++) {
                const off = ((y + dy) * width + (x + dx)) * 4;
                if (off + 1 < buffer.length) {
                    buffer[off + 1] = Math.max(0, Math.min(255, buffer[off + 1] + delta));
                }
            }
        }
    }

    medirEntropia(buf, i) {
        let e = 0;
        for (let k = 1; k < 12; k++) e += Math.abs(buf[i - k] - (buf[i - k - 1] || 0));
        return e;
    }

    calcularVogelSincronizado(offX, offY, semilla) {
        const hash = crypto.createHash('md5').update(semilla).digest();
        // El desplazamiento del centro depende de la clave y el pHash
        const centroX = offX + (TILE_SIZE / 2) + (hash[0] % 20);
        const centroY = offY + (TILE_SIZE / 2) + (hash[1] % 20);
        const scale = ((TILE_SIZE / 2) * 0.85) / Math.sqrt(30);
        const pts = [];
        for (let i = 0; i < 30; i++) {
            const r = scale * Math.sqrt(i);
            const theta = (i * GOLDEN_ANGLE) + (GOLDEN_ANGLE / 2);
            pts.push({ x: Math.floor(centroX + r * Math.cos(theta)), y: Math.floor(centroY + r * Math.sin(theta)) });
        }
        return pts;
    }
}

// EJECUCIÓN DEL MASTER
const gen = new GeneradorMBH_v16_2();
gen.sellarImagen('Atardecer.jpg', 'Atardecer_V16_Symbiotic_Master.png');
