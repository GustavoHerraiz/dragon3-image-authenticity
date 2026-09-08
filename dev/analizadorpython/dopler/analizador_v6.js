import sharp from 'sharp';
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';
import { performance } from 'perf_hooks';

const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: true,
    SCORE_THRESHOLD: 10.0,
    PAIRS_THRESHOLD: 25,
    ENABLE_FALLBACK: true  // Si falla la fase rápida, ejecuta la búsqueda exhaustiva (V5)
};

const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// --------------------------------------------------------------
// Clase con métodos de DCT y extracción (versión rápida con métricas)
// --------------------------------------------------------------
class MotorRapido {
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
}

// --------------------------------------------------------------
// Clase con la lógica de extracción ORIGINAL de V5 (sin métricas)
// --------------------------------------------------------------
class MotorV5 {
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

    static async extraer(data, info, offX, offY) {
        let acumuladores = Array(64).fill(0);
        for (let y = offY; y <= info.height - 8; y += 8) {
            let stepPerRow = 0;
            for (let x = offX; x <= info.width - 8; x += 8) {
                let block = Array(8).fill(0).map(() => Array(8).fill(0));
                for (let i = 0; i < 8; i++) {
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                        block[i][j] = data[idx] - 128;
                    }
                }
                const d = this.dct8x8(block);
                acumuladores[stepPerRow % 64] += (d[1][1] - d[2][2]);
                stepPerRow++;
            }
        }
        return Array.from({length: 32}, (_, i) => (acumuladores[i*2] > acumuladores[i*2+1] ? "1" : "0")).join('');
    }
}

// --------------------------------------------------------------
// Función de validación (común)
// --------------------------------------------------------------
function validarBits(bits) {
    const intentar = (b) => {
        const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
        const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
        const chk = parseInt(b.substring(28), 2);
        const low = idInt & 0x3FFF;
        const high = (idInt >> 14) & 0x3FFF;
        const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
        const reg = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === idHex);
        return { ok: chk === calc && !!reg, id: idHex, cliente: reg?.cliente, obra: reg?.obra };
    };
    for (let i = 0; i < 32; i++) {
        let rot = bits.substring(i) + bits.substring(0, i);
        let r = intentar(rot);
        if (r.ok) return { ...r };
        let inv = rot.split('').map(x => x === '1' ? '0' : '1').join('');
        let rI = intentar(inv);
        if (rI.ok) return { ...rI };
    }
    return { ok: false };
}

// --------------------------------------------------------------
// Función principal
// --------------------------------------------------------------
export async function analizarImagenMBH(ruta) {
    try {
        const metaOrig = await sharp(ruta).metadata();
        const esPNG = metaOrig.format === 'png';
        let idEnMetadatos = null;

        if (metaOrig.imageDescription && metaOrig.imageDescription.includes("DRAGON3_ID:")) {
            idEnMetadatos = metaOrig.imageDescription.split("DRAGON3_ID:")[1].trim().substring(0, 7).toUpperCase();
        } else if (metaOrig.exif) {
            const exifString = metaOrig.exif.toString('ascii');
            const busqueda = exifString.match(/DRAGON3_ID:([A-F0-9]{7})/i);
            if (busqueda) idEnMetadatos = busqueda[1].toUpperCase();
        }

        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let match = { identificado: false };
        const startTime = performance.now();
        const MAX_TIMEOUT_MS = 540000;

        const escalas = [1.0, 0.5, 0.75, 1.5, 2.0, 1.25, 4/3, 10/3];
        const variantes = [
            { m: "NOR", b: bufferRadar },
            { m: "MIR", b: await sharp(bufferRadar).flip().toBuffer() }
        ];

        // ----------------------------------------------------------
        // FASE RÁPIDA (usando MotorRapido)
        // ----------------------------------------------------------
        async function busquedaRapida() {
            for (let v of variantes) {
                for (let deg of [0, 90, 180, 270]) {
                    let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                    for (let f of escalas) {
                        if (performance.now() - startTime > MAX_TIMEOUT_MS) return null;
                        const { data: dRes, info: iRes } = await sharp(imgBase)
                            .resize({ width: Math.round(info.width * f) })
                            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                        const { bits, score, pairs } = MotorRapido.extraerConMetricas(dRes, iRes, 0, 0);
                        if (score > CONFIG.SCORE_THRESHOLD && pairs >= CONFIG.PAIRS_THRESHOLD) {
                            let res = validarBits(bits);
                            if (res.ok) return { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                        }
                    }
                }
            }
            return null;
        }

        match = await busquedaRapida();

        // ----------------------------------------------------------
        // FASE EXHAUSTIVA (original de V5) solo si falló la rápida y está habilitada
        // ----------------------------------------------------------
        if (!match && CONFIG.ENABLE_FALLBACK) {
            if (CONFIG.DEBUG) console.log("🔁 Fase rápida sin éxito. Iniciando búsqueda exhaustiva (V5 original)...");
            
            // Reproducimos exactamente el mismo bucle que en V5
            busquedaExhaustiva: for (let v of variantes) {
                for (let deg of [0, 90, 180, 270]) {
                    let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                    for (let f of escalas) {
                        if (performance.now() - startTime > MAX_TIMEOUT_MS) {
                            if (CONFIG.DEBUG) console.log(`⚠️ TIMEOUT en búsqueda exhaustiva.`);
                            break busquedaExhaustiva;
                        }
                        const { data: dRes, info: iRes } = await sharp(imgBase)
                            .resize({ width: Math.round(info.width * f) })
                            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                        let bits = await MotorV5.extraer(dRes, iRes, 0, 0);
                        let res = validarBits(bits);
                        if (res.ok) {
                            match = { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                            break busquedaExhaustiva;
                        }
                    }
                }
            }

            // Deep scan (desplazamientos) igual que V5
            if (!match) {
                deepscan: for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        if (performance.now() - startTime > MAX_TIMEOUT_MS) {
                            if (CONFIG.DEBUG) console.log(`⚠️ TIMEOUT en deep scan exhaustivo.`);
                            break deepscan;
                        }
                        let bits = await MotorV5.extraer(data, info, x, y);
                        let res = validarBits(bits);
                        if (res.ok) {
                            match = { ...res, identificado: true };
                            break deepscan;
                        }
                    }
                }
            }
        }

        // Si aún no hay match, intentamos deep scan rápido (por si acaso, aunque es raro)
        if (!match) {
            if (CONFIG.DEBUG) console.log("🔍 Deep scan rápido...");
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (performance.now() - startTime > MAX_TIMEOUT_MS) break;
                    const { bits, score, pairs } = MotorRapido.extraerConMetricas(data, info, x, y);
                    if (score > CONFIG.SCORE_THRESHOLD && pairs >= CONFIG.PAIRS_THRESHOLD) {
                        let res = validarBits(bits);
                        if (res.ok) {
                            match = { ...res, identificado: true };
                            break;
                        }
                    }
                }
                if (match) break;
            }
        }

        // ----------------------------------------------------------
        // Verificación final y salida
        // ----------------------------------------------------------
        if (match?.identificado) {
            let veredicto = `Copia no autorizada de ${match.cliente} - "${match.obra}"`;
            let integridad_legal = "✅ Metadatos íntegros";
            if (!idEnMetadatos) {
                integridad_legal = "⚠️ ALERTA: Metadatos borrados (Limpieza detectada)";
            } else if (idEnMetadatos !== match.id) {
                integridad_legal = `❌ FRAUDE: ID metadatos (${idEnMetadatos}) no coincide con sello real (${match.id})`;
            }
            if (esPNG) {
                const { data: dataPNG, info: infoPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const hits = verificarVogel(dataPNG, infoPNG, match.id);
                if (hits >= 25) veredicto = `Original de ${match.cliente} - "${match.obra}" 🏆`;
            }
            if (CONFIG.DEBUG) console.log(`[DRAGON3] ${integridad_legal} | Escala: ${match.escala || '1'}x`);
            return {
                identificado: true,
                veredicto,
                hash: match.id,
                cliente: match.cliente,
                obra: match.obra,
                integridad_legal
            };
        }

        return { identificado: false, veredicto: "Archivo sin sello / No identificado" };
    } catch (e) {
        return { identificado: false, error: e.message };
    }
}

// --------------------------------------------------------------
// Verificación de la espiral Vogel (igual que V5)
// --------------------------------------------------------------
function verificarVogel(buffer, info, idHex) {
    let unosEnAlfa = 0;
    const totalPixeles = info.width * info.height;
    for (let i = 3; i < buffer.length; i += 4) {
        if ((buffer[i] & 1) === 1) unosEnAlfa++;
    }
    if (unosEnAlfa / totalPixeles > 0.99) return 0;
    const centro = MotorEspacial.calcularCentroUnico(info.width, info.height, idHex, CONFIG.PRIVATE_KEY);
    const pts = MotorEspacial.obtenerPuntosEspiral(info.width, info.height, centro);
    let hits = 0;
    pts.forEach(p => {
        const idx = (p.y * info.width + p.x) * 4 + 3;
        if (p.x >= 0 && p.x < info.width && p.y >= 0 && p.y < info.height && (buffer[idx] & 1) === 1) hits++;
    });
    return hits;
}