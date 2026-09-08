import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,       // Canal Azul
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 },
    BITS_TOTAL: 32,
    UMB_DETECT_NATIVO: 0.15,
    UMB_DETECT_RESCATE: 0.08
};

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// ---------------------------------------------------------
// PRE-ESCÁNER DE FASE (GEOMETRÍA DE LA INFORMACIÓN)
// Detecta la escala matemática de la mutilación midiendo
// los puntos de costura subpíxel en el canal Azul.
// [VERSIÓN V96 - BLINDADA PARA RRSS Y JPG 80]
// ---------------------------------------------------------
function preEscaneoRadarFase(buffer, width, height) {
    let cruces = [];
    // Escaneamos la fila Y=4 (mitad del primer bloque para evitar bordes ruidosos)
    const offsetFila = 4 * width;
    const MARGEN = 6; // 🔥 El escudo contra el ruido JPG 80 (Histéresis)

    for (let x = 0; x < width - 1; x++) {
        const val1 = buffer[(offsetFila + x) * 4 + 2];
        const val2 = buffer[(offsetFila + x + 1) * 4 + 2];

        // Detección de arista cruzando la "franja muerta" (128 +/- MARGEN)
        // Ignora el ruido de cuantización de los bloques 8x8 del JPEG
        if ((val1 < (128 - MARGEN) && val2 > (128 + MARGEN)) ||
            (val1 > (128 + MARGEN) && val2 < (128 - MARGEN))) {

            // La interpolación se sigue haciendo contra el 128 teórico para máxima precisión
            const fraccion = (128 - val1) / (val2 - val1);
            cruces.push(x + fraccion);
        }
    }

    if (cruces.length < 2) return 1.0;

    let distancias = [];
    for (let i = 1; i < cruces.length; i++) distancias.push(cruces[i] - cruces[i-1]);
    distancias.sort((a, b) => a - b);

    const distanciaBase = distancias[0];
    const distanciasValidas = distancias.filter(d => d < distanciaBase * 1.5);

    if (distanciasValidas.length === 0) return 1.0;

    const mediaDistancia = distanciasValidas.reduce((a, b) => a + b, 0) / distanciasValidas.length;
    const factorEscala = mediaDistancia / 8;

    // Redondeo a 1 decimal para limpiar el ruido del payload Twin-64 (ej: 0.602 -> 0.6)
    return Math.round(factorEscala * 10) / 10;
}

export async function analizarImagenMBH(rutaImagen) {
    let mejorRes = {
        identificado: false,
        metodo: "DRAGON_EYE_v95_RADAR",
        energia: 0,
        hash: "----",
        id_numerico: -1,
        cliente: "---",
        obra: "---",
        diagnostico: { scoreFinal: 0, escalaUsada: "N/A", rotacion: 0 }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return mejorRes;

        const imageObj = sharp(rutaImagen).ensureAlpha();
        const { data: bufferOriginal, info } = await imageObj.raw().toBuffer({ resolveWithObject: true });

        // 1. TIPO 1: INTENTO NATIVO (Escaneo de la imagen tal cual entra)
        mejorRes = analizarBuffer(bufferOriginal, info.width, info.height, CONFIG.UMB_DETECT_NATIVO);
        if (mejorRes.identificado) {
            mejorRes.diagnostico.escalaUsada = "1.0 (Nativo)";
            // ELIMINADO EL RETURN PREMATURO. No nos fiamos de la primera impresión.
        }

        // 2. TIPO 2: PRE-ESCÁNER DE FASE (La Geometría de la Información)
        const escalaMutilacion = preEscaneoRadarFase(bufferOriginal, info.width, info.height);

        if (escalaMutilacion > 0 && escalaMutilacion !== 1.0) {
            // El radar detecta mutilación. Preparamos el antídoto.
            const factorRecuperacion = 1 / escalaMutilacion;
            const w = Math.round(info.width * factorRecuperacion);
            const h = Math.round(info.height * factorRecuperacion);

            if (w >= 64 && h >= 64 && w <= 8192 && h <= 8192) {
                const resized = await sharp(bufferOriginal, { raw: { width: info.width, height: info.height, channels: 4 } })
                    .resize(w, h, { kernel: 'nearest', fastShrinkOnLoad: false })
                    .raw().toBuffer({ resolveWithObject: true });

                const resRadar = analizarBuffer(resized.data, w, h, CONFIG.UMB_DETECT_RESCATE);

                // LÓGICA REY DE LA COLINA: El Radar solo gana si destruye la energía del ruido nativo
                if (resRadar.identificado && resRadar.id_numerico > 0) {
                    if (!mejorRes.identificado || resRadar.energia > mejorRes.energia) {
                        resRadar.diagnostico.escalaUsada = `Recuperación x${factorRecuperacion.toFixed(2)} (Mutilación: ${escalaMutilacion})`;
                        mejorRes = resRadar;
                    }
                }
            }
        }

        return mejorRes;

    } catch (e) {
        console.error("❌ Error crítico:", e);
        return mejorRes;
    }
}

function analizarBuffer(buffer, width, height, umbralDeteccion) {
    let mejorIntento = { identificado: false, energia: 0, hash: "----", id_numerico: -1, diagnostico: { scoreFinal: 0 } };

    scanLoop:
    for (let offY = 0; offY < 8; offY++) {
        for (let offX = 0; offX < 8; offX++) {
            const candidatos = extraerEnergiaTwin64(buffer, width, height, offX, offY);
            for (const { urnas, anchoRef } of candidatos) {
                const match = buscarPatronMentalistaTwin(urnas);

                if (match && match.id > 0 && match.scoreReal > (mejorIntento.diagnostico.scoreFinal || 0)) {
                    mejorIntento = {
                        identificado: match.scoreReal > umbralDeteccion,
                        energia: match.scoreReal,
                        id_numerico: match.id,
                        hash: match.id.toString(16).toUpperCase().padStart(7, '0'),
                        diagnostico: { scoreFinal: match.scoreReal, rotacion: match.rot, anchoReferencia: anchoRef }
                    };
                    // Salida rápida si el anclaje es perfecto
                    if (mejorIntento.energia > 0.8) break scanLoop;
                }
            }
        }
    }
    if (mejorIntento.identificado) inyectarDatosCliente(mejorIntento);
    return mejorIntento;
}

function extraerEnergiaTwin64(buffer, width, height, offsetX = 0, offsetY = 0) {
    const DNA_LENGTH = 64;
    const blockSize = 8;
    const u1 = 1, v1 = 1, u2 = 2, v2 = 2;
    const blocksPerRowActual = Math.floor((width - offsetX) / blockSize);
    const anchosUnicos = [...new Set([blocksPerRowActual, blocksPerRowActual+1, blocksPerRowActual-1, 125, 62, 93])];

    return anchosUnicos.map(anchoRef => {
        const urnas = new Float32Array(DNA_LENGTH).fill(0);
        const conteo = new Float32Array(DNA_LENGTH).fill(0);
        for (let y = offsetY; y <= height - blockSize; y += blockSize) {
            const blockY = Math.floor(y / blockSize);
            for (let x = offsetX; x <= width - blockSize; x += blockSize) {
                const blockX = Math.floor(x / blockSize);
                const val1 = calcularCoeficienteDCT(buffer, width, x, y, u1, v1);
                const val2 = calcularCoeficienteDCT(buffer, width, x, y, u2, v2);
                const idx = (blockY * anchoRef + blockX) % DNA_LENGTH;
                urnas[idx] += (val1 - val2);
                conteo[idx]++;
            }
        }
        for (let i = 0; i < DNA_LENGTH; i++) if (conteo[i] > 0) urnas[i] /= conteo[i];
        return { urnas, anchoRef };
    });
}

function buscarPatronMentalistaTwin(urnasRAW) {
    let mejorMatch = null;
    let mejorScore = -Infinity;
    for (let rot = 0; rot < 64; rot++) {
        let payloadLeido = 0, energiaTotal = 0;
        for (let i = 0; i < 32; i++) {
            const diff = urnasRAW[(i*2 + rot)%64] - urnasRAW[(i*2+1+rot)%64];
            energiaTotal += Math.abs(diff);
            if (diff > 0) payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
        }
        const idLeido = payloadLeido >>> 4;
        const chkLeido = payloadLeido & 0x0F;
        const low = idLeido & 0x3FFF, high = (idLeido >> 14) & 0x3FFF;
        let mix = (low ^ high) * 19;
        if (chkLeido === ((mix ^ (mix >> 6)) & 0x0F)) {
            const score = energiaTotal / 64;
            if (score > mejorScore) {
                mejorScore = score;
                mejorMatch = { id: idLeido, scoreReal: score, rot: rot };
            }
        }
    }
    return mejorMatch;
}

function calcularCoeficienteDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;
    for (let y = 0; y < 8; y++) {
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[y * 8 + v];
        for (let x = 0; x < 8; x++) {
            sum += (buffer[rowOffset + (startX + x) * 4 + 2] - 128) * COS_TABLE[x * 8 + u] * cosY;
        }
    }
    return sum * 0.25;
}

function inyectarDatosCliente(resultado) {
    const ficha = BASE_DE_DATOS_SELLOS.find(s => resultado.hash.endsWith(s.hash_suffix.toUpperCase()));
    if (ficha) { resultado.cliente = ficha.cliente; resultado.obra = ficha.obra; }
}
