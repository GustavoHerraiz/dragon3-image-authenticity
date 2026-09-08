import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

import { performance } from 'perf_hooks'; // Añade esta línea a tus imports

const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    DEBUG: true
};

const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

class MotorForense {
    // ... (dct8x8 y extraer se mantienen iguales para no romper la física) ...
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

    static validar(bits) {
        const intentar = (b) => {
            const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
            const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
            const chk = parseInt(b.substring(28), 2);

            // Lógica matemática Mentalist
            const low = idInt & 0x3FFF;
            const high = (idInt >> 14) & 0x3FFF;
            const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;

            // --- 🔎 BÚSQUEDA EN BASE DE DATOS JSON ---
            let reg = null;
            try {
                const rutaDB = './base_datos_sellos.json';
                if (fs.existsSync(rutaDB)) {
                    const rawData = fs.readFileSync(rutaDB, 'utf8');
                    const registros = JSON.parse(rawData || "[]");
                    reg = registros.find(s => s.hash_suffix === idHex);
                }
            } catch (e) {
                // Si hay error en la DB, el sistema sigue pero no encontrará al autor
                console.error("⚠️ Error consultando DB en Analizador:", e.message);
            }
            // -----------------------------------------

            return {
                ok: chk === calc && !!reg,
                id: idHex,
                cliente: reg?.cliente,
                obra: reg?.obra
            };
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
}

export async function analizarImagenMBH(ruta) {
    try {


        // 1. LECTURA DE METADATOS (LA MATRÍCULA Y EL FORMATO REAL)
        const metaOrig = await sharp(ruta).metadata();
        const esPNG = metaOrig.format === 'png';
        let idEnMetadatos = null;

        // Extraemos el ID (Técnica del Sándwich Forense)
        // Intento A: Lectura directa (Suele funcionar bien en JPG)
        if (metaOrig.imageDescription && metaOrig.imageDescription.includes("DRAGON3_ID:")) {
            idEnMetadatos = metaOrig.imageDescription.split("DRAGON3_ID:")[1].trim().substring(0, 7).toUpperCase();
        }
        // Intento B: Extracción profunda desde el Buffer Binario (Vital para los PNG Máster)
        else if (metaOrig.exif) {
            const exifString = metaOrig.exif.toString('ascii');
            const busqueda = exifString.match(/DRAGON3_ID:([A-F0-9]{7})/i);
            if (busqueda) {
                idEnMetadatos = busqueda[1].toUpperCase();
            }
        }

        // 2. NORMALIZACIÓN PARA RADAR (JPG-ización interna)
        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        let match = { identificado: false };

        // 3. RADAR MULTI-ESCALA Y GEOMÉTRICO (Canal Azul / Identidad)
        const escalas = [1.0, 0.5, 0.75, 1.5, 2.0, 1.25, 4 / 3, 10 / 3];
        const variantes = [
            { m: "NOR", b: bufferRadar },
            { m: "MIR", b: await sharp(bufferRadar).flip().toBuffer() }
        ];

        // ⏱️ INICIO DEL LIMITADOR KISS (SLA FAANG)
        const startTime = performance.now();
        const MAX_TIMEOUT_MS = 540000;

        busqueda: for (let v of variantes) {
            for (let deg of [0, 90, 180, 270]) {
                let imgBase = deg === 0 ? v.b : await sharp(v.b).rotate(deg).toBuffer();
                for (let f of escalas) {

                    // 🛡️ CIRCUIT BREAKER: Cortamos la hemorragia de CPU si superamos el tiempo
                    if (performance.now() - startTime > MAX_TIMEOUT_MS) {
                        if (CONFIG.DEBUG) console.log(`⚠️ TIMEOUT SUPERADO (${MAX_TIMEOUT_MS}ms): Abortando Radar Geométrico para proteger SLA.`);
                        break busqueda;
                    }

                    const { data: dRes, info: iRes } = await sharp(imgBase)
                        .resize({ width: Math.round(info.width * f) })
                        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

                    let bits = await MotorForense.extraer(dRes, iRes, 0, 0);
                    let res = MotorForense.validar(bits);
                    if (res.ok) {
                        match = { ...res, identificado: true, escala: f, modo: v.m, rot: deg };
                        break busqueda;
                    }
                }
            }
        }

        // 4. DEEP SCAN (Crops/Desplazamientos)
        if (!match.identificado) {
            deepscan: for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {

                    // 🛡️ CIRCUIT BREAKER para el escáner profundo
                    if (performance.now() - startTime > MAX_TIMEOUT_MS) {
                        if (CONFIG.DEBUG) console.log(`⚠️ TIMEOUT SUPERADO (${MAX_TIMEOUT_MS}ms): Abortando Deep Scan.`);
                        break deepscan; // Salimos de ambos bucles inmediatamente
                    }

                    let bits = await MotorForense.extraer(data, info, x, y);
                    let res = MotorForense.validar(bits);
                    if (res.ok) { match = { ...res, identificado: true }; break deepscan; }
                }
            }
        }

        // 5. VEREDICTO FINAL Y COTEJO LEGAL
        if (match.identificado) {
            let veredicto = `Copia no autorizada de ${match.cliente} - "${match.obra}"`;
            let integridad_legal = "✅ Metadatos íntegros";

            // A. Cotejo de Identidad (Píxeles vs Metadatos)
            if (!idEnMetadatos) {
                integridad_legal = "⚠️ ALERTA: Metadatos borrados (Limpieza detectada)";
            } else if (idEnMetadatos !== match.id) {
                integridad_legal = `❌ FRAUDE: ID metadatos (${idEnMetadatos}) no coincide con sello real (${match.id})`;
            }

            // B. Prueba de Integridad (Originalidad Vogel)
            if (esPNG) {
                // Importante: verificarVogel ya debe incluir el escáner de "Alfa Saturado"
                const { data: dataPNG, info: infoPNG } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const hits = verificarVogel(dataPNG, infoPNG, match.id);

                if (hits >= 25) {
                    veredicto = `Original de ${match.cliente} - "${match.obra}" 🏆`;
                }
            }

            if (CONFIG.DEBUG) console.log(`[DRAGON3] ${integridad_legal} | Escala: ${match.escala}x`);

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

function verificarVogel(buffer, info, idHex) {
    // 🛡️ CONTROL DE CALIDAD: DETECTOR DE ALFA SATURADO (EVITA FALSOS POSITIVOS)
    let unosEnAlfa = 0;
    const totalPixeles = info.width * info.height;

    // Escaneamos el LSB de todo el canal Alfa
    for (let i = 3; i < buffer.length; i += 4) {
        if ((buffer[i] & 1) === 1) unosEnAlfa++;
    }

    // Si más del 99% de la imagen tiene el bit 1, es un PNG estándar (255)
    // No puede ser nuestro máster porque nuestro máster tiene el Alfa "limpio" (bit 0)
    if (unosEnAlfa / totalPixeles > 0.99) {
        if (CONFIG.DEBUG) console.log("⚠️ ALFA SATURADO DETECTADO: Abortando veredicto Original.");
        return 0;
    }

    // --- SI PASA EL FILTRO, BUSCAMOS LA ESPIRAL REAL ---
    // Sincronizamos la semilla exacta que usó el Generador (idHex directo)
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
