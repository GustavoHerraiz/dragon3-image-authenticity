// analizador_v6.js
// ✅ CORREGIDO: Usa ExifTool para leer metadatos en PNG
// ✅ Sharp solo se usa para píxeles

import sharp from 'sharp';
import { MotorEspacial } from './MotorEspacial.js';
import { telemetry } from './telemetry.js';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execPromise = util.promisify(exec);

const MODULE = 'AnalizadorV6';
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: true,
    SCORE_THRESHOLD: 10.0,
    PAIRS_THRESHOLD: 25,
    ENABLE_FALLBACK: true
};

const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

// ================================================================
// 🔧 LECTURA DE METADATOS CON EXIFTOOL (para PNG y cualquier formato)
// ================================================================
function getExifToolPath() {
    const baseDir = process.cwd();
    const rutasPosibles = [
        path.join(baseDir, 'resources', 'exiftool', 'exiftool-13.59_64', 'exiftool_win.exe'),
        path.join(baseDir, 'resources', 'exiftool', 'exiftool_win.exe'),
        path.join(baseDir, 'exiftool', 'exiftool_win.exe'),
        path.join(process.resourcesPath || '', 'exiftool', 'exiftool_win.exe'),
        'exiftool'
    ];
    for (const ruta of rutasPosibles) {
        if (fs.existsSync(ruta)) return ruta;
    }
    return null;
}

async function leerMetadatosExifTool(ruta) {
    try {
        const exifPath = getExifToolPath();
        if (!exifPath) {
            telemetry.debug(MODULE, 'ExifTool no encontrado, usando Sharp para metadatos básicos');
            return null;
        }
        const { stdout } = await execPromise(`"${exifPath}" -j "${ruta}"`);
        const data = JSON.parse(stdout);
        if (data && data.length > 0) {
            return data[0];
        }
        return null;
    } catch (err) {
        telemetry.debug(MODULE, `Error leyendo metadatos con ExifTool: ${err.message}`);
        return null;
    }
}

// --- FUNCIONES PARA EXTRAER ID COMPLETO ---
function extraerIDCompleto(texto) {
    if (!texto) return null;
    const regex = /DRAGON3_ID:\s*([A-Z0-9_]+)/i;
    const match = texto.match(regex);
    if (match) return match[1].trim();
    return null;
}

function extraerHashDeIDCompleto(idCompleto) {
    if (!idCompleto) return null;
    const partes = idCompleto.split('_');
    const hash = partes[partes.length - 1];
    if (hash && /^[0-9A-F]{7}$/i.test(hash)) {
        return hash.toUpperCase();
    }
    return null;
}

// --- MOTOR FORENSE V6 ---
class MotorForenseV6 {
    static dct8x8(block) {
        let dct = Array(8).fill(0).map(() => Array(8).fill(0));
        const C = (u) => (u === 0 ? 0.7071 : 1);
        for (let u = 0; u < 8; u++) {
            for (let v = 0; v < 8; v++) {
                let sum = 0;
                for (let x = 0; x < 8; x++) {
                    for (let y = 0; y < 8; y++) sum += block[y][x] * COS_TABLE[u * 8 + x] * COS_TABLE[v * 8 + y];
                }
                dct[v][u] = 0.25 * C(u) * C(v) * sum;
            }
        }
        return dct;
    }

    static extraerConMetricas(data, info, offX, offY) {
        let sumDiff = new Array(64).fill(0);
        let count = new Array(64).fill(0);

        for (let y = offY; y <= info.height - 8; y += 8) {
            let pos = 0;
            for (let x = offX; x <= info.width - 8; x += 8) {
                let block = Array(8).fill(0).map(() => Array(8).fill(0));
                for (let i = 0; i < 8; i++) {
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                        block[i][j] = data[idx] - 128;
                    }
                }
                const dct = this.dct8x8(block);
                const diff = dct[1][1] - dct[2][2];
                sumDiff[pos] += diff;
                count[pos]++;
                pos = (pos + 1) % 64;
            }
        }

        let media = new Array(64);
        for (let i = 0; i < 64; i++) media[i] = count[i] > 0 ? sumDiff[i] / count[i] : 0;

        let score = 0;
        for (let i = 0; i < 64; i++) score += Math.abs(media[i]);

        let bits64 = new Array(64);
        for (let i = 0; i < 64; i++) bits64[i] = media[i] > 0 ? 1 : 0;

        let pairs = 0;
        for (let i = 0; i < 32; i++) if (bits64[2*i] !== bits64[2*i+1]) pairs++;

        let bits32 = '';
        for (let i = 0; i < 32; i++) bits32 += bits64[2*i];

        return { bits: bits32, score, pairs };
    }

    static extraerBits(data, info, offX, offY) {
        let sumDiff = new Array(64).fill(0);
        let count = new Array(64).fill(0);

        for (let y = offY; y <= info.height - 8; y += 8) {
            let pos = 0;
            for (let x = offX; x <= info.width - 8; x += 8) {
                let block = Array(8).fill(0).map(() => Array(8).fill(0));
                for (let i = 0; i < 8; i++) {
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                        block[i][j] = data[idx] - 128;
                    }
                }
                const dct = this.dct8x8(block);
                const diff = dct[1][1] - dct[2][2];
                sumDiff[pos] += diff;
                count[pos]++;
                pos = (pos + 1) % 64;
            }
        }

        let media = new Array(64);
        for (let i = 0; i < 64; i++) media[i] = count[i] > 0 ? sumDiff[i] / count[i] : 0;
        let bits64 = new Array(64);
        for (let i = 0; i < 64; i++) bits64[i] = media[i] > 0 ? 1 : 0;
        let bits32 = '';
        for (let i = 0; i < 32; i++) bits32 += bits64[2*i];
        return bits32;
    }

    static async validar(bits, db) {
        const intentar = async (b) => {
            const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
            const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
            const chk = parseInt(b.substring(28), 2);
            const low = idInt & 0x3FFF;
            const high = (idInt >> 14) & 0x3FFF;
            const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
            
            const reg = db ? await db.buscarPorHash(idHex) : null;
            
            return { 
                ok: chk === calc && !!reg, 
                id: idHex, 
                cliente: reg?.cliente, 
                obra: reg?.obra 
            };
        };
        
        for (let i = 0; i < 32; i++) {
            let rot = bits.substring(i) + bits.substring(0, i);
            let r = await intentar(rot);
            if (r.ok) return { ...r };
            let inv = rot.split('').map(x => x === '1' ? '0' : '1').join('');
            let rI = await intentar(inv);
            if (rI.ok) return { ...rI };
        }
        return { ok: false };
    }
}

// --- FUNCIÓN PRINCIPAL ---
export async function analizarImagenRapido(ruta, db, timeoutMs = 15000, fallbackAV5 = true) {
    const startTime = performance.now();
    telemetry.info(MODULE, `Iniciando análisis rápido de: ${ruta}`);

    try {
        const metaOriginal = await sharp(ruta).metadata();
        const esPNG = metaOriginal.format === 'png';
        
        // ================================================================
        // 🔥 LECTURA DE METADATOS CON EXIFTOOL (para PNG y JPG)
        // ================================================================
        const metaExif = await leerMetadatosExifTool(ruta);
        
        let idEnMetadatos = null;
        let idCompletoMetadatos = null;
        let prefijoEnMetadatos = null;
        let imageDescription = null;
        let artist = null;
        let copyright = null;
        let software = null;

        if (metaExif) {
            imageDescription = metaExif.ImageDescription || null;
            artist = metaExif.Artist || null;
            copyright = metaExif.Copyright || null;
            software = metaExif.Software || null;
            
            if (imageDescription && imageDescription.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(imageDescription);
                if (idCompleto) {
                    idCompletoMetadatos = idCompleto;
                    idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                    prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
                }
            }
        } else {
            // Fallback a Sharp si ExifTool no funciona (solo para JPG)
            if (metaOriginal.imageDescription && metaOriginal.imageDescription.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(metaOriginal.imageDescription);
                if (idCompleto) {
                    idCompletoMetadatos = idCompleto;
                    idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                    prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
                }
            } else if (metaOriginal.exif) {
                const exifString = metaOriginal.exif.toString('ascii');
                const busqueda = exifString.match(/DRAGON3_ID:([A-F0-9]{7})/i);
                if (busqueda) idEnMetadatos = busqueda[1].toUpperCase();
            }
        }

        // 2. NORMALIZACIÓN PARA RADAR
        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let match = { identificado: false };
        const MAX_TIMEOUT_MS = timeoutMs;

        const escalas = [1.0, 0.5, 0.75, 1.5, 2.0, 1.25, 4/3, 10/3];
        const variantes = [
            { m: "NOR", b: bufferRadar },
            { m: "MIR", b: await sharp(bufferRadar).flip().toBuffer() }
        ];

        // ================================================================
        // 🔥 FASE 1: ESCALA ORIGINAL (1.0) - SIN ROTACIONES NI FILTROS
        // ================================================================
        telemetry.debug(MODULE, '🔍 Fase 1: Extrayendo en escala original (1.0)...');
        
        const bitsOriginal = MotorForenseV6.extraerBits(data, info, 0, 0);
        let resOriginal = await MotorForenseV6.validar(bitsOriginal, db);
        if (resOriginal.ok) {
            telemetry.info(MODULE, `✅ Hash encontrado en escala original: ${resOriginal.id}`);
            match = { ...resOriginal, identificado: true, escala: 1.0, modo: "NOR", rot: 0 };
        }

        // ================================================================
        // 🔥 FASE 2: DEEP SCAN EN ESCALA ORIGINAL (offsets 0-7)
        // ================================================================
        if (!match.identificado) {
            telemetry.debug(MODULE, '🔍 Fase 2: Deep scan en escala original...');
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (performance.now() - startTime > MAX_TIMEOUT_MS) break;
                    const bits = MotorForenseV6.extraerBits(data, info, x, y);
                    let res = await MotorForenseV6.validar(bits, db);
                    if (res.ok) {
                        telemetry.info(MODULE, `✅ Hash encontrado en deep scan: ${res.id} (offset ${x},${y})`);
                        match = { ...res, identificado: true, escala: 1.0, modo: "NOR", rot: 0 };
                        break;
                    }
                }
                if (match.identificado) break;
            }
        }

        // ================================================================
        // 🔥 FASE 3: OTRAS ESCALAS Y ROTACIONES (si falló en escala original)
        // ================================================================
        if (!match.identificado) {
            telemetry.debug(MODULE, '🔍 Fase 3: Búsqueda en otras escalas y rotaciones...');
            
            async function busquedaExhaustiva() {
                for (let v of variantes) {
                    for (let deg of [0, 90, 180, 270]) {
                        let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                        for (let f of escalas) {
                            if (f === 1.0 && deg === 0 && v.m === "NOR") continue;
                            if (performance.now() - startTime > MAX_TIMEOUT_MS) {
                                telemetry.warn(MODULE, `Timeout en búsqueda exhaustiva`);
                                return null;
                            }
                            const { data: dRes, info: iRes } = await sharp(imgBase)
                                .resize({ width: Math.round(info.width * f) })
                                .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                            const bits = MotorForenseV6.extraerBits(dRes, iRes, 0, 0);
                            let res = await MotorForenseV6.validar(bits, db);
                            if (res.ok) {
                                return { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                            }
                        }
                    }
                }
                return null;
            }

            match = await busquedaExhaustiva();

            if (!match) {
                telemetry.debug(MODULE, '🔍 Fase 4: Deep scan en otras escalas...');
                for (let v of variantes) {
                    for (let deg of [0, 90, 180, 270]) {
                        let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                        for (let f of escalas) {
                            if (f === 1.0 && deg === 0 && v.m === "NOR") continue;
                            if (performance.now() - startTime > MAX_TIMEOUT_MS) break;
                            const { data: dRes, info: iRes } = await sharp(imgBase)
                                .resize({ width: Math.round(info.width * f) })
                                .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                            
                            for (let y = 0; y < 8; y++) {
                                for (let x = 0; x < 8; x++) {
                                    if (performance.now() - startTime > MAX_TIMEOUT_MS) break;
                                    const bits = MotorForenseV6.extraerBits(dRes, iRes, x, y);
                                    let res = await MotorForenseV6.validar(bits, db);
                                    if (res.ok) {
                                        match = { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                                        break;
                                    }
                                }
                                if (match.identificado) break;
                            }
                            if (match.identificado) break;
                        }
                        if (match.identificado) break;
                    }
                    if (match.identificado) break;
                }
            }
        }

        const elapsed = performance.now() - startTime;

        // ================================================================
        // 🔥 VERIFICACIÓN VOGEL CON EL HASH EXTRAÍDO
        // ================================================================
        if (match?.identificado) {
            let veredicto = `Copia no autorizada de ${match.cliente} - "${match.obra}"`;
            let integridad_legal = "✅ Metadatos íntegros";

            // A. Cotejo de Identidad (Píxeles vs Metadatos) - AHORA CON EXIFTOOL
            if (!idEnMetadatos) {
                integridad_legal = "⚠️ ALERTA: Metadatos borrados (Limpieza detectada)";
            } else if (idEnMetadatos !== match.id) {
                integridad_legal = `❌ FRAUDE: ID metadatos (${idEnMetadatos}) no coincide con sello real (${match.id})`;
            }

            // B. VERIFICACIÓN VOGEL - USA match.id (SIN PREFIJO)
            if (esPNG) {
                const { data: dataPNG, info: infoPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const hits = verificarVogel(dataPNG, infoPNG, match.id);
                if (hits >= 25) {
                    veredicto = `Original de ${match.cliente} - "${match.obra}" 🏆`;
                }
            }

            telemetry.info(MODULE, `Análisis rápido exitoso: ${match.id}`, {
                veredicto,
                tiempo_ms: Math.round(elapsed),
                escala: match.escala || '1',
                integridad_legal,
                prefijo_metadatos: prefijoEnMetadatos || 'N/A'
            });
            return {
                identificado: true,
                veredicto,
                hash: match.id,
                cliente: match.cliente,
                obra: match.obra,
                integridad_legal
            };
        }

        telemetry.info(MODULE, `Análisis rápido completado: NO identificado`, { tiempo_ms: Math.round(elapsed) });
        return { identificado: false, veredicto: "Archivo sin sello / No identificado (modo rápido)" };
    } catch (e) {
        telemetry.error(MODULE, `Error en análisis rápido: ${e.message}`, { stack: e.stack });
        return { identificado: false, error: e.message };
    }
}

// --- VERIFICACIÓN VOGEL ---
function verificarVogel(buffer, info, idHex) {
    let unosEnAlfa = 0;
    const totalPixeles = info.width * info.height;
    for (let i = 3; i < buffer.length; i += 4) if ((buffer[i] & 1) === 1) unosEnAlfa++;
    if (unosEnAlfa / totalPixeles > 0.99) return 0;
    
    const centro = MotorEspacial.calcularCentroUnico(
        info.width, 
        info.height, 
        idHex,
        CONFIG.PRIVATE_KEY
    );
    const pts = MotorEspacial.obtenerPuntosEspiral(info.width, info.height, centro);
    let hits = 0;
    pts.forEach(p => {
        const idx = (p.y * info.width + p.x) * 4 + 3;
        if (p.x >= 0 && p.x < info.width && p.y >= 0 && p.y < info.height && (buffer[idx] & 1) === 1) hits++;
    });
    return hits;
}

export { MotorForenseV6 };