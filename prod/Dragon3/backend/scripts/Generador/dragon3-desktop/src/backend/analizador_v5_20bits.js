// analizador_v5_20bits.js
// 🔥 VERSIÓN DEFINITIVA: MODO BLUR ORIGINAL (TWINBLOCK) OPTIMIZADO
//    - Motor 1: Umbral (JPEG)
//    - Rutas estáticas
//    - Modo blur: TwinBlock + offsets 0..7, timeout 2s, umbral 1000, tolerancia 3

import sharp from 'sharp';
import path from 'path';
import { MotorEspacial } from './MotorEspacial.js';
import { telemetry } from './telemetry.js';
import { performance } from 'perf_hooks';
import { DragonDB } from './database.js';

const MODULE = 'AnalizadorV5_20bits';

const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: false,
    BITS_ID: 20,
    BITS_CHK: 4,
    BITS_TOTAL: 24,
    EARLY_DETECTION_BLOCKS: 100,
    UMBRAL_ENERGIA: 5000,
    // Rutas estáticas
    RUTAS_ESTATICAS: [
        { x: 0, y: 0, name: 'BASE' },
        { x: 8, y: 216, name: 'ECHO' },
        { x: 15, y: 176, name: 'BLUR' },
        { x: 0, y: 81, name: 'CROP' },
        { x: 11, y: 78, name: 'RESCALE' },
        { x: 6, y: 10, name: 'RRSS' }
    ],
    ENTORNO_OFFSETS: [0, 1, 2, 3, 4, 5, 6, 7],
    TIMEOUT_RUTA: 5000,
    // Modo blur (TwinBlock)
    BLUR_OFFSETS: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    TOLERANCIA_HAMMING_BLUR: 5,
    TWINBLOCK_TIMEOUT: 1000,        // 1 segundos por offset
    TWINBLOCK_UMBRAL: 1000,         // Umbral bajo para señal débil
    TIMEOUT_GLOBAL: 120000
};

let db;
try {
    db = new DragonDB();
    await db._ensureOpen();
    telemetry.info(MODULE, '✅ SQLite cargada');
} catch (e) {
    telemetry.warn(MODULE, `⚠️ DB en memoria: ${e.message}`);
    const BASE = [];
    db = {
        async buscarPorHash(hash) {
            return BASE.find(s => s.hash_suffix === hash) || null;
        }
    };
}

// ================================================================
// DCT 8×8 Y EXTRACCIÓN DE DIFERENCIA
// ================================================================
function dct8x8(block) {
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

function extraerDiffBloque(data, info, x, y, offsetX = 0, offsetY = 0) {
    const block = new Array(8).fill(0).map(() => new Array(8).fill(0));
    const startX = x + offsetX;
    const startY = y + offsetY;
    for (let a = 0; a < 8; a++) {
        for (let b = 0; b < 8; b++) {
            const idx = ((startY + a) * info.width + (startX + b)) * 4 + 2;
            block[a][b] = data[idx] - 128;
        }
    }
    const dct = dct8x8(block);
    return dct[1][1] - dct[2][2];
}

// ================================================================
// VALIDACIÓN DE BITS CON TOLERANCIA HAMMING
// ================================================================
async function validarBits24ConTolerancia(bits, tolerancia = 0) {
    for (let i = 0; i < 24; i++) {
        let rot = bits.substring(i) + bits.substring(0, i);
        const idLeido = (parseInt(rot.substring(0, 20), 2)) >>> 0;
        const chkLeido = parseInt(rot.substring(20), 2);
        const low = idLeido & 0x3FF;
        const high = (idLeido >> 10) & 0x3FF;
        const X = low ^ high;
        const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
        const chkEsperado = V & 0x0F;
        if (chkLeido === chkEsperado) {
            const idHex = idLeido.toString(16).toUpperCase().padStart(5, '0');
            const reg = await db.buscarPorHash(idHex);
            if (reg) {
                return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra, distancia: 0 };
            }
        }
        if (tolerancia > 0) {
            const maxMask = 1 << 20;
            for (let mask = 0; mask < maxMask; mask++) {
                if (popCount(mask) > tolerancia) continue;
                const idMod = idLeido ^ mask;
                const low2 = idMod & 0x3FF;
                const high2 = (idMod >> 10) & 0x3FF;
                const X2 = low2 ^ high2;
                const V2 = ((X2 * 19) ^ ((X2 * 19) >> 6)) & 0xFFF;
                const chkCalc = V2 & 0x0F;
                if (chkCalc === chkLeido) {
                    const idHex = idMod.toString(16).toUpperCase().padStart(5, '0');
                    const reg = await db.buscarPorHash(idHex);
                    if (reg) {
                        return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra, distancia: popCount(mask) };
                    }
                }
            }
        }
    }
    return null;
}

function popCount(x) {
    let c = 0;
    while (x) { c += x & 1; x >>= 1; }
    return c;
}

// ================================================================
// MOTOR 1: UMBRAL (8×8 normal)
// ================================================================
async function analizarConUmbral(data, info, offsetX, offsetY, verbose = false, timeoutMs = CONFIG.TIMEOUT_RUTA, umbral = CONFIG.UMBRAL_ENERGIA, tolerancia = 0) {
    const startTime = performance.now();
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let resultadoFinal = null;
    let energiaTotal = 0;
    let adn = "";

    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 8) {
            if (performance.now() - startTime > timeoutMs) {
                if (verbose) telemetry.warn(MODULE, `⏱️ Timeout en umbral (offset ${offsetX},${offsetY})`);
                return { ok: false, error: 'timeout', bloques: bloquesProcesados, energia: energiaTotal, adn };
            }

            const diff = extraerDiffBloque(data, info, x, y, offsetX, offsetY);
            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % CONFIG.EARLY_DETECTION_BLOCKS === 0) {
                energiaTotal = 0;
                for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);

                const bits = new Array(24);
                for (let i = 0; i < 24; i++) {
                    const bitVal = urnas[i * 2];
                    const sombraVal = urnas[i * 2 + 1];
                    bits[i] = bitVal > sombraVal ? "1" : "0";
                }
                adn = bits.join('');

                if (energiaTotal > umbral) {
                    const valid = await validarBits24ConTolerancia(adn, tolerancia);
                    if (valid && valid.ok) {
                        resultadoFinal = valid;
                        if (verbose) {
                            console.log(`✅ Motor 1 (offset ${offsetX},${offsetY}) detectó en ${bloquesProcesados} bloques`);
                            console.log(`   🔑 ID: ${valid.id} | Distancia: ${valid.distancia}`);
                        }
                        break;
                    }
                }
            }
        }
        if (resultadoFinal) break;
    }

    if (!resultadoFinal) {
        return { ok: false, energia: energiaTotal, adn, bloques: bloquesProcesados };
    }

    return {
        ok: true,
        id: resultadoFinal.id,
        cliente: resultadoFinal.cliente,
        obra: resultadoFinal.obra,
        metodo: `umbral_8x8_${offsetX}_${offsetY}`,
        bloques: bloquesProcesados,
        energia: energiaTotal,
        adn,
        distancia: resultadoFinal.distancia || 0
    };
}

// ================================================================
// MODO BLUR: TWINBLOCK (8×8 con resta de pares)
// ================================================================
async function analizarConTwinBlock(data, info, offsetX, offsetY, verbose = false, timeoutMs = CONFIG.TWINBLOCK_TIMEOUT, umbral = CONFIG.TWINBLOCK_UMBRAL, tolerancia = 0) {
    const startTime = performance.now();
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let resultadoFinal = null;
    let energiaTotal = 0;
    let adn = "";

    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 16) {
            if (performance.now() - startTime > timeoutMs) {
                if (verbose) telemetry.warn(MODULE, `⏱️ Timeout en TwinBlock (offset ${offsetX},${offsetY})`);
                return { ok: false, error: 'timeout', bloques: bloquesProcesados, energia: energiaTotal, adn };
            }

            const readX = x + offsetX;
            const readY = y + offsetY;
            if (readX + 16 > info.width || readY + 8 > info.height) continue;

            const diffA = extraerDiffBloque(data, info, readX, readY);
            const diffB = extraerDiffBloque(data, info, readX + 8, readY);
            const diff = diffA - diffB;

            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % CONFIG.EARLY_DETECTION_BLOCKS === 0) {
                energiaTotal = 0;
                for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);

                const bits = new Array(24);
                for (let i = 0; i < 24; i++) {
                    const bitVal = urnas[i * 2];
                    const sombraVal = urnas[i * 2 + 1];
                    bits[i] = bitVal > sombraVal ? "1" : "0";
                }
                adn = bits.join('');

                if (energiaTotal > umbral) {
                    const valid = await validarBits24ConTolerancia(adn, tolerancia);
                    if (valid && valid.ok) {
                        resultadoFinal = valid;
                        if (verbose) {
                            console.log(`✅ TwinBlock (offset ${offsetX},${offsetY}) detectó en ${bloquesProcesados} pares`);
                            console.log(`   🔑 ID: ${valid.id} | Distancia: ${valid.distancia}`);
                        }
                        break;
                    }
                }
            }
        }
        if (resultadoFinal) break;
    }

    if (!resultadoFinal) {
        return { ok: false, energia: energiaTotal, adn, bloques: bloquesProcesados };
    }

    return {
        ok: true,
        id: resultadoFinal.id,
        cliente: resultadoFinal.cliente,
        obra: resultadoFinal.obra,
        metodo: `TwinBlock_${offsetX}_${offsetY}`,
        bloques: bloquesProcesados,
        energia: energiaTotal,
        adn,
        distancia: resultadoFinal.distancia || 0
    };
}

// ================================================================
// FUNCIÓN PRINCIPAL (con modo blur original)
// ================================================================
export async function analizarImagenMBH_20bits(ruta, dbExterna, timeoutMs = CONFIG.TIMEOUT_GLOBAL, opciones = {}) {
    const startTime = performance.now();
    const dbInstance = dbExterna || db;
    const {
        verbose = false,
        modoBlur = false,
        toleranciaBlur = CONFIG.TOLERANCIA_HAMMING_BLUR
    } = opciones;

    telemetry.info(MODULE, `Iniciando análisis de: ${ruta}`);

    try {
        const metaOrig = await sharp(ruta).metadata();
        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        console.log(`\n🔍 [ANÁLISIS] ${path.basename(ruta)} (${info.width}x${info.height})`);

        // ============================================================
        // PASO 1: Motor 1 en (0,0)
        // ============================================================
        console.log(`   [MOTOR 1] Umbral en (0,0)...`);
        const resBase = await analizarConUmbral(data, info, 0, 0, verbose, CONFIG.TIMEOUT_RUTA, CONFIG.UMBRAL_ENERGIA, 0);
        if (resBase.ok) {
            console.log(`   ✅ [MOTOR 1] DETECTADO en BASE: ${resBase.id}`);
            return {
                identificado: true,
                hash: resBase.id,
                cliente: resBase.cliente,
                obra: resBase.obra,
                metodo: resBase.metodo,
                veredicto: `Original de ${resBase.cliente} - "${resBase.obra}" 🏆`
            };
        }
        console.log(`   ⚠️ [MOTOR 1] No detectado en (0,0).`);

        // ============================================================
        // PASO 2: Rutas estáticas (sin tolerancia)
        // ============================================================
        for (const ruta of CONFIG.RUTAS_ESTATICAS) {
            if (ruta.x === 0 && ruta.y === 0) continue;
            console.log(`   [MOTOR 1] Probando ruta ${ruta.name} (${ruta.x},${ruta.y})...`);
            const res = await analizarConUmbral(data, info, ruta.x, ruta.y, verbose, CONFIG.TIMEOUT_RUTA, CONFIG.UMBRAL_ENERGIA, 0);
            if (res.ok) {
                console.log(`   ✅ [MOTOR 1] DETECTADO en ${ruta.name}: ${res.id}`);
                return {
                    identificado: true,
                    hash: res.id,
                    cliente: res.cliente,
                    obra: res.obra,
                    metodo: res.metodo,
                    veredicto: `Original de ${res.cliente} - "${res.obra}" 🏆`
                };
            }
        }

        // ============================================================
        // PASO 3: MODO BLUR (TwinBlock optimizado)
        // ============================================================
        if (modoBlur) {
            console.log(`\n   🔷 [MODO BLUR] TwinBlock con offsets 0..7 (timeout ${CONFIG.TWINBLOCK_TIMEOUT}ms, umbral ${CONFIG.TWINBLOCK_UMBRAL})...`);
            for (const offX of CONFIG.BLUR_OFFSETS) {
                for (const offY of CONFIG.BLUR_OFFSETS) {
                    if (offX === 0 && offY === 0) continue;
                    const res = await analizarConTwinBlock(data, info, offX, offY, verbose, CONFIG.TWINBLOCK_TIMEOUT, CONFIG.TWINBLOCK_UMBRAL, toleranciaBlur);
                    if (res.ok) {
                        console.log(`   ✅ [MODO BLUR] DETECTADO en offset (${offX},${offY})`);
                        console.log(`      🔑 ID: ${res.id} | Distancia: ${res.distancia}`);
                        return {
                            identificado: true,
                            hash: res.id,
                            cliente: res.cliente,
                            obra: res.obra,
                            metodo: res.metodo,
                            veredicto: `Original de ${res.cliente} - "${res.obra}" 🏆`
                        };
                    }
                }
            }
            console.log(`   ⚠️ [MODO BLUR] No detectado en ningún offset.`);
        }

        return { identificado: false, veredicto: "No identificado" };

    } catch (e) {
        telemetry.error(MODULE, `Error: ${e.message}`);
        return { identificado: false, error: e.message };
    }
}