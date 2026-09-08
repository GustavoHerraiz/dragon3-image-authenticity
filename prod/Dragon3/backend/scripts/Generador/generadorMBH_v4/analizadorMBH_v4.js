/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         DRAGON3 — ANALIZADOR FUSIONADO v4 (V20 MILITARY)         ║
 * ║             EDICIÓN "MATARÓ" - ALPHA PRIORITY CORE               ║
 * ║                                                                  ║
 * ║  Arquitectura:                                                   ║
 * ║  · Nivel 0-A → Integridad Vogel (Prioridad PNG - Canal Alfa)     ║
 * ║  · N0 → Nativo Azul (32-bit Stardust + Checksum Mentalista)      ║
 * ║  · N1 → Radar V20 (Band-Pass, Histograma 8-Filas, Armónicos)     ║
 * ║  · N2 → Barrido Exhaustivo (Fall-back de emergencia)             ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,
    BLOCK_SIZE: 8,
    BITS_TOTAL: 32,
    UMB_DETECT_NATIVO: 0.15,
    UMB_DETECT_RESCATE: 0.08,
    CORRELACION_MIN: 0.3,
    INTENTAR_INVERSION: true,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY", // Sincronización con Generador
    DEBUG: true
};

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

function _log(msg) {
    if (CONFIG.DEBUG) console.log(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// RADAR DE FASE V20 (FAÚNDEZ CORE - BAND-PASS FILTER) - INTACTO
// ─────────────────────────────────────────────────────────────────────────────
function buscarCandidatosRadar(buffer, width, height, margen = 4) {
    let histogramaGlobal = {};
    const filasAnalizar = [0, 1, 2, 3, 4, 5, 6, 7];

    for (const filaOffset of filasAnalizar) {
        const filaY = Math.floor(height / 2) + filaOffset;
        const filaCruda = [];
        const offsetIndex = filaY * width;

        for (let x = 0; x < width; x++) filaCruda.push(buffer[(offsetIndex + x) * 4 + 2]);

        const fondoLuz = filtrarGaussiano1D(filaCruda, 8.0);
        const senalSuave = filtrarGaussiano1D(filaCruda, 0.5);

        const filaAplanada = [];
        for (let i = 0; i < width; i++) filaAplanada.push((senalSuave[i] - fondoLuz[i]) + 128);

        let costuras = [];
        for (let x = 2; x < width - 2; x++) {
            const v1 = filaAplanada[x], v2 = filaAplanada[x + 1];
            if ((v1 < (128 - margen) && v2 > (128 + margen)) ||
                (v1 > (128 + margen) && v2 < (128 - margen))) {
                costuras.push(x + (128 - v1) / (v2 - v1));
            }
        }

        for(let i = 1; i < costuras.length; i++) {
            let d = costuras[i] - costuras[i-1];
            if (d >= 1.5 && d < 65) {
                const bucket = Math.round(d * 2) / 2;
                histogramaGlobal[bucket] = (histogramaGlobal[bucket] || 0) + 1;
            }
        }
    }

    return Object.entries(histogramaGlobal)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(entry => parseFloat(entry[0]));
}

function filtrarGaussiano1D(fila, sigma) {
    const kernel = [];
    const radio = Math.ceil(sigma * 3);
    let suma = 0;
    for (let x = -radio; x <= radio; x++) {
        const peso = Math.exp(-(x * x) / (2 * sigma * sigma));
        kernel.push(peso);
        suma += peso;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= suma;

    const filtrada = [];
    for (let i = 0; i < fila.length; i++) {
        let val = 0;
        for (let k = 0; k < kernel.length; k++) {
            const idx = i + k - radio;
            if (idx >= 0 && idx < fila.length) val += fila[idx] * kernel[k];
        }
        filtrada.push(val);
    }
    return filtrada;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUNTO DE ENTRADA PRINCIPAL: PRIORIDAD ALFA -> LUEGO AZUL
// ─────────────────────────────────────────────────────────────────────────────
export async function analizarImagenMBH(rutaImagen) {
    const RESULTADO_VACIO = {
        identificado: false,
        metodo: "DRAGON_FUSIONADO_v4",
        energia: 0,
        hash: "----",
        id_numerico: 0,
        cliente: "---",
        obra: "---",
        veredicto: "---",
        diagnostico: { scoreFinal: 0, escalaUsada: "N/A", nivel: "---" }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return RESULTADO_VACIO;

        const { data: bufferOriginal, info } = await sharp(rutaImagen)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const esPNG = rutaImagen.toLowerCase().endsWith('.png');
        _log(`\n🐉 ANALIZADOR v4 [ALPHA FIRST] — ${rutaImagen} (${info.width}x${info.height})`);

        // ═══════════════════════════════════════════════════════════════
        // NIVEL 0-A: PRIORIDAD ABSOLUTA AL CANAL ALFA (Originalidad)
        // ═══════════════════════════════════════════════════════════════
        if (esPNG && info.channels === 4) {
            _log(`  [VOGEL] Iniciando validación de integridad en Alfa...`);

            // Sincronización de semilla vía pHash manual estable
            const pHashBits = obtenerPHashManual(bufferOriginal, info);
            const pHashHex = BigInt('0b' + pHashBits).toString(16).padStart(16, '0');
            const sufijoVogel = pHashHex.slice(-4);

            const vogel = verificarVogelReal(bufferOriginal, info, sufijoVogel);

            if (vogel.encontrado) {
                const ficha = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase() === sufijoVogel.toLowerCase());
                _log(`  [VOGEL] ✅ ORIGINAL CERTIFICADO | Hits: ${vogel.aciertos}/30`);

                return {
                    identificado: true,
                    veredicto: "Humano Original🏆",
                    score: 100.0,
                    metodo: "Vogel (Alfa)",
                    cliente: ficha ? ficha.cliente : "Autor Validado",
                    obra: ficha ? ficha.obra : "---",
                    hash: sufijoVogel.toUpperCase(),
                    diagnostico: { nivel: "N-ALFA", scoreFinal: 100 }
                };
            }
            _log(`  [VOGEL] ❌ Sello Alfa no detectado. Procediendo a escaneo Azul...`);
        }

        // ═══════════════════════════════════════════════════════════════
        // NIVEL 0: DETECCIÓN NATIVA AZUL
        // ═══════════════════════════════════════════════════════════════
        _log(`  [N0] Intento nativo Azul...`);
        let mejorRes = analizarBuffer(bufferOriginal, info.width, info.height, CONFIG.UMB_DETECT_NATIVO);
        mejorRes.diagnostico.nivel = "N0";
        mejorRes.veredicto = esPNG ? "Humano Copia (PNG)" : "Humano Copia (JPG)";
        inyectarDatosCliente(mejorRes);

        if (mejorRes.identificado && mejorRes.energia > CONFIG.UMB_DETECT_NATIVO && mejorRes.cliente !== "NO REGISTRADO") {
            mejorRes.diagnostico.escalaUsada = "1.0 (Nativo)";
            _log(`  [N0] ✅ MATCH DIRECTO | E:${mejorRes.energia.toFixed(3)} C:${mejorRes.diagnostico.correlacion.toFixed(3)}`);
            return mejorRes;
        }

        // ═══════════════════════════════════════════════════════════════
        // NIVEL 1: RADAR DE FASE V20 (Armónicos) - INTACTO
        // ═══════════════════════════════════════════════════════════════
        _log(`\n  [N1] Escáner de Fase Radar V20...`);
        const candidatosCrudos = buscarCandidatosRadar(bufferOriginal, info.width, info.height, 4);

        let armonicosAProbar = [];
        for (const cand of candidatosCrudos) {
            armonicosAProbar.push(cand, cand * 2, cand * 4, cand / 2);
        }
        armonicosAProbar = [...new Set(armonicosAProbar)].filter(c => c >= 1.0 && c <= 60).sort((a,b)=>a-b);

        for (const lambda of armonicosAProbar) {
            const factorEscala = lambda / 8;
            if (factorEscala === 1.0) continue;

            const factorRecuperacion = 1 / factorEscala;
            const w = Math.round(info.width * factorRecuperacion);
            const h = Math.round(info.height * factorRecuperacion);

            if (w < 64 || h < 64 || w > 12000 || h > 12000) continue;

            const resized = await sharp(bufferOriginal, {
                raw: { width: info.width, height: info.height, channels: 4 }
            })
                .resize(w, h, { kernel: 'nearest' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const resRadar = analizarBuffer(resized.data, w, h, CONFIG.UMB_DETECT_RESCATE);
            resRadar.veredicto = "Humano Copia (Procesado)";
            inyectarDatosCliente(resRadar);

            if (resRadar.identificado && resRadar.cliente !== "NO REGISTRADO") {
                const scoreRadar = resRadar.energia * 0.6 + resRadar.diagnostico.correlacion * 0.4;
                const scoreMejor = mejorRes.energia * 0.6 + mejorRes.diagnostico.correlacion * 0.4;

                if (scoreRadar > scoreMejor) {
                    resRadar.diagnostico.escalaUsada = `Recuperación x${factorRecuperacion.toFixed(2)}`;
                    resRadar.diagnostico.nivel = "N1-RadarV20";
                    mejorRes = resRadar;
                    if (mejorRes.energia > 0.3 && mejorRes.diagnostico.correlacion > 0.6) return mejorRes;
                }
            }
        }

        if (mejorRes.diagnostico.nivel === "N1-RadarV20") return mejorRes;

        // ═══════════════════════════════════════════════════════════════
        // NIVEL 2: BARRIDO EXHAUSTIVO - INTACTO
        // ═══════════════════════════════════════════════════════════════
        _log(`\n  [N2] Fallo Radar. Iniciando Barrido de Rescate...`);
        const escalas = generarEscalasInteligentes();

        for (const factor of escalas) {
            const w = Math.round(info.width * factor);
            const h = Math.round(info.height * factor);
            if (w < 64 || h < 64 || w > 8192 || h > 8192) continue;

            const bufferResized = await sharp(bufferOriginal, {
                raw: { width: info.width, height: info.height, channels: 4 }
            })
                .resize(w, h, { kernel: 'nearest' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const resEscala = analizarBuffer(bufferResized.data, w, h, CONFIG.UMB_DETECT_RESCATE);
            resEscala.veredicto = "Humano Copia (Rescatado)";
            inyectarDatosCliente(resEscala);

            if (resEscala.cliente !== "NO REGISTRADO") {
                const scoreNuevo = resEscala.energia * 0.6 + resEscala.diagnostico.correlacion * 0.4;
                const scoreActual = mejorRes.energia * 0.6 + mejorRes.diagnostico.correlacion * 0.4;

                if (scoreNuevo > scoreActual) {
                    resEscala.diagnostico.escalaUsada = `Barrido x${factor}`;
                    resEscala.diagnostico.nivel = "N2";
                    mejorRes = resEscala;
                    if (resEscala.identificado && resEscala.energia > 0.25) return mejorRes;
                }
            }
        }

        return mejorRes;

    } catch (e) {
        console.error("❌ Error crítico en Analizador Fusionado:", e);
        return RESULTADO_VACIO;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOPORTE INTEGRIDAD VOGEL (ALPHA CHANNEL)
// ─────────────────────────────────────────────────────────────────────────────
function verificarVogelReal(buf, info, hashSuffix) {
    const semilla = CONFIG.PRIVATE_KEY + BigInt('0x' + hashSuffix).toString(16).padStart(16, '0');

    // Sincronización con MotorEspacial (usando semilla para el jitter)
    const centro = MotorEspacial.calcularCentroUnico(info.width, info.height, semilla, CONFIG.PRIVATE_KEY);
    const pts = MotorEspacial.obtenerPuntosEspiral(info.width, info.height, centro);

    let aciertos = 0, total = 0;
    pts.forEach(p => {
        if (p.x >= 0 && p.x < info.width && p.y >= 0 && p.y < info.height) {
            const off = (p.y * info.width + p.x) * 4;
            if ((buf[off + 3] & 1) === 1) aciertos++; // Verificamos Bit LSB del Alfa
            total++;
        }
    });

    return { encontrado: (total > 0 && (aciertos / total) > 0.85), aciertos: aciertos };
}

function obtenerPHashManual(buf, info) {
    // Hash de los primeros 1000 píxeles para estabilidad de la semilla Vogel
    return BigInt('0x' + crypto.createHash('md5').update(buf.slice(0, 4000)).digest('hex').slice(0, 16)).toString(2).padStart(64, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISIS DE BUFFER (Validación Checksum & Correlación) - INTACTO
// ─────────────────────────────────────────────────────────────────────────────
function analizarBuffer(buffer, width, height, umbralDeteccion) {
    let mejorIntento = {
        identificado: false, energia: 0, hash: "----", id_numerico: 0,
        cliente: "---", obra: "---", confianza: 0,
        diagnostico: { scoreFinal: 0, rotacion: 0, correlacion: 0 }
    };

    const pasosAProbar = [8.0, 7.2, 5.28, 2.64];

    for (const step of pasosAProbar) {
        for (let offY = 0; offY < 8; offY++) {
            for (let offX = 0; offX < 8; offX++) {
                const candidatos = extraerEnergiaTwin64(buffer, width, height, offX, offY, step);

                for (const { urnas, anchoRef } of candidatos) {
                    const match = buscarPorCorrelacionCruzada(urnas);

                    if (match) {
                        const scoreCombinado = match.scoreReal * 0.7 + match.correlacion * 0.3;
                        const scoreMejorCombinado = (mejorIntento.diagnostico.scoreFinal || 0) * 0.7 + (mejorIntento.diagnostico.correlacion || 0) * 0.3;

                        if (scoreCombinado > scoreMejorCombinado) {
                            mejorIntento = {
                                identificado: match.scoreReal > umbralDeteccion && match.correlacion > CONFIG.CORRELACION_MIN,
                                energia: match.scoreReal,
                                id_numerico: match.id,
                                hash: match.id.toString(16).toUpperCase().padStart(8, '0'),
                                confianza: Math.min(100, Math.round(scoreCombinado * 100)),
                                diagnostico: {
                                    scoreFinal: match.scoreReal,
                                    rotacion: match.rot,
                                    correlacion: match.correlacion,
                                    checksumLeido: match.chk,
                                    offsetUsado: `${offX},${offY}`,
                                    anchoReferencia: anchoRef,
                                    stepUsado: step
                                }
                            };
                        }
                    }
                }
            }
        }
        if (mejorIntento.identificado) break;
    }
    return mejorIntento;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTOR TWIN-64 (Limpio y Matemático) - INTACTO
// ─────────────────────────────────────────────────────────────────────────────
function extraerEnergiaTwin64(buffer, width, height, offsetX = 0, offsetY = 0, step = 8) {
    const DNA_LENGTH = 64;
    const blocksPerRowActual = Math.floor((width - offsetX) / step);
    const anchosUnicos = [...new Set([blocksPerRowActual, blocksPerRowActual + 1])];

    return anchosUnicos.map(anchoRef => {
        const urnas = new Float32Array(DNA_LENGTH).fill(0);
        const conteo = new Float32Array(DNA_LENGTH).fill(0);

        for (let y = offsetY; y <= height - 8; y += step) {
            const blockY = Math.round((y - offsetY) / step);
            for (let x = offsetX; x <= width - 8; x += step) {
                const blockX = Math.round((x - offsetX) / step);
                const pxX = Math.floor(x);
                const pxY = Math.floor(y);

                const val1 = calcularCoeficienteDCT(buffer, width, pxX, pxY, 1, 1);
                const val2 = calcularCoeficienteDCT(buffer, width, pxX, pxY, 2, 2);

                const idx = (blockY * anchoRef + blockX) % DNA_LENGTH;
                urnas[idx] += (val1 - val2);
                conteo[idx]++;
            }
        }

        for (let i = 0; i < DNA_LENGTH; i++) {
            if (conteo[i] > 0) urnas[i] /= conteo[i];
        }
        return { urnas, anchoRef };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BÚSQUEDA CHECKSUM + CORRELACIÓN - INTACTO
// ─────────────────────────────────────────────────────────────────────────────
function buscarPorCorrelacionCruzada(urnasRAW) {
    let mejorMatch = null;
    let mejorScore = -Infinity;
    const DNA_LENGTH = 64;

    const mean = urnasRAW.reduce((sum, v) => sum + v, 0) / DNA_LENGTH;
    const std = Math.sqrt(urnasRAW.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / DNA_LENGTH);

    for (let rot = 0; rot < DNA_LENGTH; rot++) {
        let payloadLeido = 0;
        let energiaTotal = 0;
        let correlacionAcumulada = 0;

        for (let i = 0; i < 32; i++) {
            const idxBit = (i * 2 + rot) % DNA_LENGTH;
            const idxSombra = (i * 2 + 1 + rot) % DNA_LENGTH;
            const energiaNeta = urnasRAW[idxBit] - urnasRAW[idxSombra];

            energiaTotal += Math.abs(energiaNeta);
            correlacionAcumulada += Math.abs(energiaNeta);

            if (energiaNeta > 0) payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
        }

        const idLeido = payloadLeido >>> 4;
        const chkLeido = payloadLeido & 0x0F;
        const low = idLeido & 0x3FFF;
        const high = (idLeido >> 14) & 0x3FFF;
        let mix = (low ^ high) * 19;
        const chkEsperado = (mix ^ (mix >> 6)) & 0x0F;

        if (chkLeido === chkEsperado && idLeido !== 0 && idLeido !== 0x0FFFFFFF) {
            const scoreEnergia = energiaTotal / 64;
            const correlacionNormalizada = std > 0 ? correlacionAcumulada / (64 * std) : 0;
            const scoreCombinado = scoreEnergia * 0.7 + Math.min(1, correlacionNormalizada) * 0.3;

            if (scoreCombinado > mejorScore) {
                mejorScore = scoreCombinado;
                mejorMatch = {
                    id: idLeido, chk: chkLeido,
                    scoreReal: scoreEnergia,
                    correlacion: Math.min(1, correlacionNormalizada),
                    rot: rot
                };
            }
        }
    }

    if (CONFIG.INTENTAR_INVERSION && mejorMatch && mejorMatch.correlacion < 0.5) {
        const urnasInvertidas = urnasRAW.map(v => -v);
        const matchInv = buscarPorCorrelacionCruzada(urnasInvertidas);
        if (matchInv && matchInv.correlacion > mejorMatch.correlacion) mejorMatch = matchInv;
    }

    return mejorMatch;
}

function generarEscalasInteligentes() {
    const escalas = [1.0, 4.0, 3.33, 3.0, 2.5, 2.0, 1.5, 1.33, 0.9, 0.75, 0.66, 0.5, 0.33, 0.25];
    for (let f = 0.4; f <= 2.5; f += 0.05) escalas.push(parseFloat(f.toFixed(2)));
    return [...new Set(escalas)].sort((a, b) => Math.abs(1 - a) - Math.abs(1 - b));
}

function calcularCoeficienteDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;
    for (let y = 0; y < 8; y++) {
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[y * 8 + v];
        for (let x = 0; x < 8; x++) {
            const idx = rowOffset + (startX + x) * 4 + CONFIG.CHANNEL_IDX;
            sum += (buffer[idx] - 128) * COS_TABLE[x * 8 + u] * cosY;
        }
    }
    return sum * 0.25;
}

function inyectarDatosCliente(resultado) {
    const hashLargo = resultado.hash.toUpperCase();
    const ficha = BASE_DE_DATOS_SELLOS.find(s => hashLargo.endsWith(s.hash_suffix.toUpperCase()));
    if (ficha) {
        resultado.cliente = ficha.cliente;
        resultado.obra = ficha.obra;
    } else {
        resultado.cliente = "NO REGISTRADO";
        resultado.obra = "---";
    }
}
