import sharp from 'sharp';
import { MotorEspacial } from './MotorEspacial.js';
import { telemetry } from './telemetry.js';
import { performance } from 'perf_hooks';

const MODULE = 'AnalizadorV5';
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: true
};

const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
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

// --- MOTOR FORENSE ---
class MotorForense {
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

    static async validar(bits, db) {
        const intentar = async (b) => {
            const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
            const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
            const chk = parseInt(b.substring(28), 2);
            const low = idInt & 0x3FFF;
            const high = (idInt >> 14) & 0x3FFF;
            const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
            const reg = db ? await db.buscarPorHash(idHex) : null;
            return { ok: chk === calc && !!reg, id: idHex, cliente: reg?.cliente, obra: reg?.obra };
        };
        for (let i = 0; i < 32; i++) {
            let rot = bits.substring(i) + bits.substring(0, i);
            let r = await intentar(rot); if (r.ok) return { ...r };
            let inv = rot.split('').map(x => x === '1' ? '0' : '1').join('');
            let rI = await intentar(inv); if (rI.ok) return { ...rI };
        }
        return { ok: false };
    }
}

// --- FUNCIÓN PRINCIPAL ---
export async function analizarImagenMBH(ruta, db, timeoutMs = 540000) {
    const startTime = performance.now();
    telemetry.info(MODULE, `Iniciando análisis de: ${ruta}`);

    try {
        const metaOrig = await sharp(ruta).metadata();
        const esPNG = metaOrig.format === 'png';
        let idEnMetadatos = null;
        let idCompletoMetadatos = null;
        let prefijoEnMetadatos = null;

        // --- BÚSQUEDA DE METADATOS ---
        // 1. ImageDescription
        if (metaOrig.imageDescription && metaOrig.imageDescription.includes("DRAGON3_ID:")) {
            const idCompleto = extraerIDCompleto(metaOrig.imageDescription);
            if (idCompleto) {
                idCompletoMetadatos = idCompleto;
                idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
            }
        }
        // 2. XMP
        if (!idEnMetadatos && metaOrig.xmp) {
            const xmpString = metaOrig.xmp.toString('ascii');
            if (xmpString.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(xmpString);
                if (idCompleto) {
                    idCompletoMetadatos = idCompleto;
                    idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                    prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
                }
            }
        }
        // 3. EXIF
        if (!idEnMetadatos && metaOrig.exif) {
            const exifString = metaOrig.exif.toString('ascii');
            if (exifString.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(exifString);
                if (idCompleto) {
                    idCompletoMetadatos = idCompleto;
                    idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                    prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
                }
            }
        }
        // 4. IPTC
        if (!idEnMetadatos && metaOrig.iptc) {
            const iptcString = metaOrig.iptc.toString('ascii');
            if (iptcString.includes("DRAGON3_ID:")) {
                const idCompleto = extraerIDCompleto(iptcString);
                if (idCompleto) {
                    idCompletoMetadatos = idCompleto;
                    idEnMetadatos = extraerHashDeIDCompleto(idCompleto);
                    prefijoEnMetadatos = idCompleto.includes('_') ? idCompleto.split('_')[0] : null;
                }
            }
        }

        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let match = { identificado: false };

        const escalas = [1.0, 0.5, 0.75, 1.5, 2.0, 1.25, 4 / 3, 10 / 3];
        const variantes = [
            { m: "NOR", b: bufferRadar },
            { m: "MIR", b: await sharp(bufferRadar).flip().toBuffer() }
        ];

        busqueda: for (let v of variantes) {
            for (let deg of [0, 90, 180, 270]) {
                let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                for (let f of escalas) {
                    if (performance.now() - startTime > timeoutMs) {
                        telemetry.warn(MODULE, `Timeout superado (${timeoutMs}ms) en búsqueda principal`);
                        break busqueda;
                    }
                    const { data: dRes, info: iRes } = await sharp(imgBase)
                        .resize({ width: Math.round(info.width * f) })
                        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

                    let bits = await MotorForense.extraer(dRes, iRes, 0, 0);
                    let res = await MotorForense.validar(bits, db);
                    if (res.ok) {
                        match = { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                        break busqueda;
                    }
                }
            }
        }

        if (!match.identificado) {
            deepscan: for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (performance.now() - startTime > timeoutMs) {
                        telemetry.warn(MODULE, `Timeout superado en Deep Scan`);
                        break deepscan;
                    }
                    let bits = await MotorForense.extraer(data, info, x, y);
                    let res = await MotorForense.validar(bits, db);
                    if (res.ok) {
                        match = { ...res, identificado: true };
                        break deepscan;
                    }
                }
            }
        }

        const elapsed = performance.now() - startTime;
        if (match.identificado) {
            let integridad_legal = "✅ Metadatos íntegros";
            if (!idEnMetadatos) {
                integridad_legal = "⚠️ ALERTA: Metadatos borrados (Limpieza detectada)";
            } else if (idEnMetadatos !== match.id) {
                integridad_legal = `❌ FRAUDE: ID metadatos (${idEnMetadatos}) no coincide con sello real (${match.id})`;
            }

            let veredicto = `Copia no autorizada de ${match.cliente} - "${match.obra}"`;

            // 🔥 VERIFICACIÓN VOGEL CON ID COMPLETO
            if (esPNG && idCompletoMetadatos) {
                const { data: dataPNG, info: infoPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const hits = verificarVogel(dataPNG, infoPNG, idCompletoMetadatos);
                if (hits >= 25) {
                    veredicto = `Original de ${match.cliente} - "${match.obra}" 🏆`;
                }
            }

            telemetry.info(MODULE, `Análisis exitoso: ${match.id}`, {
                veredicto,
                tiempo_ms: Math.round(elapsed),
                escala: match.escala,
                integridad_legal,
                prefijo_metadatos: prefijoEnMetadatos || 'N/A'
            });

            return { identificado: true, veredicto, hash: match.id, cliente: match.cliente, obra: match.obra, integridad_legal };
        }

        telemetry.info(MODULE, `Análisis completado: NO identificado`, { tiempo_ms: Math.round(elapsed) });
        return { identificado: false, veredicto: "Archivo sin sello / No identificado" };

    } catch (e) {
        telemetry.error(MODULE, `Error en análisis: ${e.message}`, { stack: e.stack });
        return { identificado: false, error: e.message };
    }
}

// --- VERIFICACIÓN VOGEL (CON ID COMPLETO) ---
function verificarVogel(buffer, info, idCompleto) {
    let unosEnAlfa = 0;
    const totalPixeles = info.width * info.height;
    for (let i = 3; i < buffer.length; i += 4) {
        if ((buffer[i] & 1) === 1) unosEnAlfa++;
    }
    if (unosEnAlfa / totalPixeles > 0.99) {
        telemetry.debug(MODULE, 'Alfa saturado detectado, abortando Vogel');
        return 0;
    }
    const centro = MotorEspacial.calcularCentroUnico(info.width, info.height, idCompleto, CONFIG.PRIVATE_KEY);
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