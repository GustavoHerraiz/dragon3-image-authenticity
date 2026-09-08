// ================================================================
// analizador_v5.js - VERSIÓN ESTABLE (primer match, sin ponderación)
// ================================================================

import sharp from 'sharp';
import { MotorEspacial } from './MotorEspacial.js';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execPromise = util.promisify(exec);

const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: false,
    TIMEOUT_MS: 60000,
    VOGEL_THRESHOLD: 25,
    TOLERANCIA_HAMMING: 2,
    TWINBLOCK_ACTIVADO: true,
    MAX_BLOQUES_JPEG: 10000
};

// ================================================================
// 1. EXIFTOOL
// ================================================================
function getExifToolPath() {
    const baseDir = path.resolve(__dirname, '..', '..');
    const rutasPosibles = [
        path.join(baseDir, 'resources', 'exiftool', 'exiftool_win.exe'),
        path.join(baseDir, 'resources', 'exiftool', 'exiftool.exe'),
        path.join(baseDir, '..', 'resources', 'exiftool', 'exiftool_win.exe'),
        path.join(process.resourcesPath || '', 'exiftool', 'exiftool_win.exe'),
        'exiftool'
    ];
    for (const ruta of rutasPosibles) {
        if (fs.existsSync(ruta)) {
            if (CONFIG.DEBUG) console.log(`✅ ExifTool: ${ruta}`);
            return ruta;
        }
    }
    return null;
}

async function leerMetadatosExifTool(ruta) {
    try {
        const exifPath = getExifToolPath();
        if (!exifPath) return null;
        const { stdout } = await execPromise(`"${exifPath}" -j "${ruta}"`);
        const data = JSON.parse(stdout);
        return data?.[0] || null;
    } catch { return null; }
}

// ================================================================
// 2. EXTRACCIÓN DE ID DESDE METADATOS
// ================================================================
function extraerIDCompleto(texto) {
    if (!texto) return null;
    const m = texto.match(/DRAGON3_ID:\s*([A-Z0-9_]+)/i);
    return m ? m[1].trim() : null;
}

function extraerHashDeIDCompleto(id) {
    if (!id) return null;
    const partes = id.split('_');
    const hash = partes[partes.length - 1];
    return (hash && /^[0-9A-F]{7}$/i.test(hash)) ? hash.toUpperCase() : null;
}

// ================================================================
// 3. DCT Y MOTOR FORENSE (CON TOLERANCIA HAMMING)
// ================================================================
const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

class MotorForense {
    static dct8x8(block) {
        let dct = Array(8).fill(0).map(() => Array(8).fill(0));
        const C = (u) => (u === 0 ? 0.7071 : 1);
        for (let u = 0; u < 8; u++) {
            for (let v = 0; v < 8; v++) {
                let sum = 0;
                for (let x = 0; x < 8; x++) {
                    for (let y = 0; y < 8; y++) {
                        sum += block[y][x] * COS_TABLE[u * 8 + x] * COS_TABLE[v * 8 + y];
                    }
                }
                dct[v][u] = 0.25 * C(u) * C(v) * sum;
            }
        }
        return dct;
    }

    static _getBlock(data, info, x, y) {
        const block = Array(8).fill(0).map(() => Array(8).fill(0));
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                block[i][j] = data[idx] - 128;
            }
        }
        return block;
    }

    static _bitsFromAcum(acum) {
        let bits = '';
        for (let i = 0; i < 32; i++) {
            bits += (acum[2*i] > acum[2*i+1]) ? '1' : '0';
        }
        return bits;
    }

    static extraer(data, info, offX, offY) {
        const acum = Array(64).fill(0);
        let cnt = 0;
        for (let y = offY; y <= info.height - 8; y += 8) {
            for (let x = offX; x <= info.width - 8; x += 8) {
                const block = this._getBlock(data, info, x, y);
                const d = this.dct8x8(block);
                acum[cnt % 64] += (d[1][1] - d[2][2]);
                cnt++;
            }
        }
        return this._bitsFromAcum(acum);
    }

    static async validar(bits, db, tolerancia = CONFIG.TOLERANCIA_HAMMING) {
        const popCount = (x) => {
            let c = 0;
            while (x) { c += x & 1; x >>= 1; }
            return c;
        };

        const intentar = async (idInt, chk) => {
            const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
            const reg = await db.buscarPorHash(idHex);
            if (!reg) return null;
            const low = idInt & 0x3FFF;
            const high = (idInt >> 14) & 0x3FFF;
            const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
            if (chk !== calc) return null;
            return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra };
        };

        for (let i = 0; i < 32; i++) {
            let rot = bits.substring(i) + bits.substring(0, i);
            const idInt = (parseInt(rot.substring(0, 28), 2)) >>> 0;
            const chk = parseInt(rot.substring(28), 2);

            let r = await intentar(idInt, chk);
            if (r) return r;

            if (tolerancia > 0) {
                const maxMask = Math.min(1 << 20, 10000);
                for (let mask = 0; mask < maxMask; mask++) {
                    if (popCount(mask) > tolerancia) continue;
                    const idMod = idInt ^ mask;
                    const low2 = idMod & 0x3FFF;
                    const high2 = (idMod >> 14) & 0x3FFF;
                    const calc2 = ((low2 ^ high2) * 19 ^ ((low2 ^ high2) * 19 >> 6)) & 0x0F;
                    if (calc2 === chk) {
                        const r2 = await intentar(idMod, chk);
                        if (r2) return r2;
                    }
                }
            }

            let inv = rot.split('').map(x => x === '1' ? '0' : '1').join('');
            const idInv = (parseInt(inv.substring(0, 28), 2)) >>> 0;
            const chkInv = parseInt(inv.substring(28), 2);
            let rInv = await intentar(idInv, chkInv);
            if (rInv) return rInv;

            if (tolerancia > 0) {
                const maxMask = Math.min(1 << 20, 10000);
                for (let mask = 0; mask < maxMask; mask++) {
                    if (popCount(mask) > tolerancia) continue;
                    const idMod = idInv ^ mask;
                    const low2 = idMod & 0x3FFF;
                    const high2 = (idMod >> 14) & 0x3FFF;
                    const calc2 = ((low2 ^ high2) * 19 ^ ((low2 ^ high2) * 19 >> 6)) & 0x0F;
                    if (calc2 === chkInv) {
                        const r2 = await intentar(idMod, chkInv);
                        if (r2) return r2;
                    }
                }
            }
        }
        return null;
    }
}

// ================================================================
// 4. MOTOR JPEG (PRIMER MATCH VÁLIDO, CORREGIDO)
// ================================================================
async function _motorJPEGConMetodo(data, info, db, usarTwin, maxBloques, verbose) {
    const acum = new Float32Array(64).fill(0);
    let bloques = 0;

    for (let y = 0; y <= info.height - 8 && bloques < maxBloques; y += 8) {
        for (let x = 0; x <= info.width - (usarTwin ? 16 : 8) && bloques < maxBloques; x += (usarTwin ? 16 : 8)) {
            let diff;

            if (usarTwin) {
                const blockA = MotorForense._getBlock(data, info, x, y);
                const blockB = MotorForense._getBlock(data, info, x + 8, y);
                const dA = MotorForense.dct8x8(blockA);
                const dB = MotorForense.dct8x8(blockB);
                diff = (dA[1][1] - dA[2][2]) - (dB[1][1] - dB[2][2]);
            } else {
                const block = MotorForense._getBlock(data, info, x, y);
                const d = MotorForense.dct8x8(block);
                diff = d[1][1] - d[2][2];
            }

            acum[bloques % 64] += diff;
            bloques++;

            if (bloques % 100 === 0) {
                const bits = MotorForense._bitsFromAcum(acum);
                const valid = await MotorForense.validar(bits, db);
                if (valid && valid.ok) {
                    if (verbose) console.log(`   ✅ Primer match en ${bloques} bloques: ${valid.id}`);
                    return valid;
                }
            }
        }
    }
    return null;
}

async function motorJPEG(data, info, db, verbose = false) {
    const MAX = CONFIG.MAX_BLOQUES_JPEG;

    if (verbose) console.log(`   🔍 Motor JPEG (normal)...`);
    let result = await _motorJPEGConMetodo(data, info, db, false, MAX, verbose);
    if (result) return result;

    // TwinBlock solo si el normal no encontró nada (opcional)
    if (verbose) console.log(`   🔍 Motor JPEG (TwinBlock)...`);
    result = await _motorJPEGConMetodo(data, info, db, true, MAX, verbose);
    if (result) return result;

    if (verbose) console.log(`   ❌ Motor JPEG no detectó`);
    return null;
}

// ================================================================
// 5. VOGEL (para PNG)
// ================================================================
function verificarVogel(buffer, info, idHex) {
    let unos = 0;
    const total = info.width * info.height;
    for (let i = 3; i < buffer.length; i += 4) {
        if ((buffer[i] & 1) === 1) unos++;
    }
    if (unos / total > 0.99) return 0;

    const centro = MotorEspacial.calcularCentroUnico(info.width, info.height, idHex, CONFIG.PRIVATE_KEY);
    const pts = MotorEspacial.obtenerPuntosEspiral(info.width, info.height, centro);
    let hits = 0;
    pts.forEach(p => {
        const idx = (p.y * info.width + p.x) * 4 + 3;
        if (p.x >= 0 && p.x < info.width && p.y >= 0 && p.y < info.height) {
            if ((buffer[idx] & 1) === 1) hits++;
        }
    });
    return hits;
}

// ================================================================
// 6. FUNCIÓN PRINCIPAL
// ================================================================
export async function analizarImagenMBH(ruta, db, timeoutMs = CONFIG.TIMEOUT_MS) {
    const start = performance.now();
    console.log(`\n🚀 Analizando: ${path.basename(ruta)}`);

    try {
        const meta = await sharp(ruta).metadata();
        const esPNG = meta.format === 'png';
        const esJPG = meta.format === 'jpeg' || meta.format === 'jpg';

        let idMeta = null;
        const metaExif = await leerMetadatosExifTool(ruta);
        if (metaExif) {
            let desc = metaExif.ImageDescription || metaExif.XMP?.Description || null;
            if (desc && desc.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(desc);
                if (idCompleto) idMeta = extraerHashDeIDCompleto(idCompleto);
            }
        }

        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        // ---- VOGEL PARA PNG ----
        if (esPNG && idMeta) {
            const { data: dPNG, info: iPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const hits = verificarVogel(dPNG, iPNG, idMeta);
            if (hits >= CONFIG.VOGEL_THRESHOLD) {
                const reg = await db.buscarPorHash(idMeta);
                if (reg) {
                    console.log(`   ✅ Vogel: ${idMeta} (${hits} hits)`);
                    return {
                        identificado: true,
                        veredicto: `Original de ${reg.cliente} - "${reg.obra}" 🏆`,
                        hash: idMeta,
                        cliente: reg.cliente,
                        obra: reg.obra,
                        integridad_legal: "✅ Metadatos íntegros (Vogel)",
                        metodo: 'Vogel'
                    };
                }
            }
        }

        // ---- MOTOR JPEG PARA JPG ----
        if (esJPG) {
            const jpegResult = await motorJPEG(data, info, db, true);
            if (jpegResult) {
                return {
                    identificado: true,
                    veredicto: `Copia no autorizada de ${jpegResult.cliente} - "${jpegResult.obra}"`,
                    hash: jpegResult.id,
                    cliente: jpegResult.cliente,
                    obra: jpegResult.obra,
                    integridad_legal: "✅ Metadatos íntegros",
                    metodo: 'JPEG'
                };
            }
        }

        // ---- RADAR (fallback) ----
        console.log(`   🔍 Radar...`);
        const escalas = [1.0, 0.5, 0.75, 1.5, 2.0];
        const variantes = [{ m: "NOR", b: bufferRadar }];
        let match = null;

        busqueda: for (const v of variantes) {
            for (const deg of [0, 90, 180, 270]) {
                const imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                for (const f of escalas) {
                    if (performance.now() - start > timeoutMs) break busqueda;
                    const { data: dRes, info: iRes } = await sharp(imgBase)
                        .resize({ width: Math.round(info.width * f) })
                        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

                    let bits = MotorForense.extraer(dRes, iRes, 0, 0);
                    let res = await MotorForense.validar(bits, db);
                    if (res) { match = res; break busqueda; }
                    for (let oy = 0; oy < 8; oy++) {
                        for (let ox = 0; ox < 8; ox++) {
                            if (performance.now() - start > timeoutMs) break;
                            let bitsOff = MotorForense.extraer(dRes, iRes, ox, oy);
                            let resOff = await MotorForense.validar(bitsOff, db);
                            if (resOff) { match = resOff; break busqueda; }
                        }
                        if (match) break;
                    }
                }
                if (match) break;
            }
            if (match) break;
        }

        // ---- DEEPSCAN ----
        if (!match) {
            console.log(`   🔍 DeepScan...`);
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (performance.now() - start > timeoutMs) break;
                    let bits = MotorForense.extraer(data, info, x, y);
                    let res = await MotorForense.validar(bits, db);
                    if (res) { match = res; break; }
                }
                if (match) break;
            }
        }

        if (match) {
            console.log(`   ✅ ${match.id} (${match.cliente} - ${match.obra})`);
            let veredicto = `Copia no autorizada de ${match.cliente} - "${match.obra}"`;
            if (esPNG) {
                const { data: dPNG, info: iPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const hits = verificarVogel(dPNG, iPNG, match.id);
                if (hits >= CONFIG.VOGEL_THRESHOLD) {
                    veredicto = `Original de ${match.cliente} - "${match.obra}" 🏆`;
                }
            }
            return {
                identificado: true,
                veredicto,
                hash: match.id,
                cliente: match.cliente,
                obra: match.obra,
                integridad_legal: "✅ Metadatos íntegros",
                metodo: match.metodo || 'Radar'
            };
        }

        console.log(`   ❌ No identificado`);
        return { identificado: false, veredicto: "Archivo sin sello / No identificado" };

    } catch (e) {
        console.log(`   ❌ ERROR: ${e.message}`);
        return { identificado: false, error: e.message };
    }
}