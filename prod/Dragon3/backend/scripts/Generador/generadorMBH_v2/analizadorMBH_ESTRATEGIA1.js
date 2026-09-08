import sharp from 'sharp';
import fs from 'fs';
import ReedSolomon from 'reed-solomon';

const CONFIG = {
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 },
    CORRELACION_MIN: 0.3,
    DEBUG_RESCATE: false  // Cambiar a true para ver detalles
};

// 🆕 INICIALIZAR REED-SOLOMON DECODER
const rsDecoder = new ReedSolomon(4, 3);

/**
 * 🐉 DRAGON3 ANALIZADOR DWT-DCT + REED-SOLOMON
 */
export async function analizarImagenMBH(rutaImagen) {
    try {
        const { data, info } = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const buffer = Buffer.from(data);

        return analizarBufferDWT(buffer, info.width, info.height);
    } catch (error) {
        console.error("❌ Error en analizador RS:", error);
        throw error;
    }
}

function analizarBufferDWT(buffer, width, height) {
    const umbralDeteccion = 0.3;

    let mejorIntento = {
        identificado: false,
        energia: 0,
        id_numerico: 0,
        hash: "0000000",
        confianza: 0,
        diagnostico: {}
    };

    console.log(`   🔄 Aplicando DWT Haar para análisis...`);
    const { LL } = aplicarDWTHaar(buffer, width, height);

    const llWidth = Math.floor(width / 2);
    const llHeight = Math.floor(height / 2);

    console.log(`      Analizando LL subband: ${llWidth}x${llHeight}px`);

    const offsets = [[0, 0], [0, 1], [1, 0], [1, 1]];

    scanLoop: for (const [offX, offY] of offsets) {

        const candidatos = extraerEnergiaTwin64LL(LL, llWidth, llHeight, offX, offY);

        for (const { urnas, anchoRef } of candidatos) {

            // 🆕 Buscar con decodificación Reed-Solomon
            const match = buscarConReedSolomon(urnas);

            if (CONFIG.DEBUG_RESCATE && match) {
                const idHex = match.id ? match.id.toString(16).padStart(5,'0') : 'ERR';
                console.log(`      Ancho:${anchoRef.toString().padStart(4)} | ID:${idHex} | E:${match.scoreReal.toFixed(2).padStart(6)} | C:${match.correlacion.toFixed(4)} | Err:${match.erroresCorregidos || 0}`);
            }

            if (match) {
                const mejorCorrelacionActual = mejorIntento.diagnostico?.correlacion || 0;
                const mejorEnergiaActual = mejorIntento.diagnostico?.scoreFinal || 0;

                const diffCorr = match.correlacion - mejorCorrelacionActual;

                let esNuevoMejor = false;

                if (diffCorr > 0.1) {
                    esNuevoMejor = true;
                } else if (diffCorr > -0.1) {
                    esNuevoMejor = match.scoreReal > mejorEnergiaActual;
                }

                if (esNuevoMejor || mejorIntento.energia === 0) {

                    mejorIntento = {
                        identificado: match.scoreReal > umbralDeteccion && match.correlacion > CONFIG.CORRELACION_MIN && match.id !== null,
                        energia: match.scoreReal,
                        id_numerico: match.id || 0,
                        hash: match.id ? match.id.toString(16).toUpperCase().padStart(5, '0') : "00000",
                        confianza: Math.min(100, Math.round(match.correlacion * 100)),
                        diagnostico: {
                            scoreFinal: match.scoreReal,
                            rotacion: match.rot,
                            correlacion: match.correlacion,
                            erroresCorregidos: match.erroresCorregidos || 0,
                            offsetUsado: `${offX},${offY}`,
                            anchoReferencia: anchoRef
                        }
                    };

                    if (mejorIntento.energia > 0.8 && mejorIntento.diagnostico.correlacion > 0.8) break scanLoop;
                }
            }
        }
    }

    return mejorIntento;
}

/**
 * 🆕 BÚSQUEDA CON REED-SOLOMON
 *
 * En lugar de validar checksum, intenta DECODIFICAR con Reed-Solomon.
 * RS corregirá hasta 3 bits erróneos automáticamente.
 */
function buscarConReedSolomon(urnasRAW) {
    const DNA_LENGTH = 64;

    const mean = urnasRAW.reduce((sum, v) => sum + v, 0) / DNA_LENGTH;
    const std = Math.sqrt(urnasRAW.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / DNA_LENGTH);

    const matchesValidos = [];

    for (let rot = 0; rot < DNA_LENGTH; rot++) {

        let payloadLeido = 0;
        let energiaTotal = 0;
        let correlacionAcumulada = 0;

        for (let i = 0; i < 32; i++) {
            const idxBit = (i * 2 + rot) % DNA_LENGTH;
            const idxSombra = (i * 2 + 1 + rot) % DNA_LENGTH;

            const eBit = urnasRAW[idxBit];
            const eSombra = urnasRAW[idxSombra];

            const energiaNeta = eBit - eSombra;

            energiaTotal += Math.abs(energiaNeta);
            correlacionAcumulada += Math.abs(energiaNeta);

            if (energiaNeta > 0) {
                payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
            }
        }

        // 🆕 DECODIFICAR CON REED-SOLOMON
        const rsResult = decodificarReedSolomon(payloadLeido);

        if (rsResult.success) {
            const scoreEnergia = energiaTotal / 64;
            const correlacionNormalizada = std > 0 ? correlacionAcumulada / (64 * std) : 0;
            const scoreCombinado = scoreEnergia * 0.7 + Math.min(1, correlacionNormalizada) * 0.3;

            matchesValidos.push({
                id: rsResult.id,
                scoreReal: scoreEnergia,
                correlacion: Math.min(1, correlacionNormalizada),
                scoreCombinado: scoreCombinado,
                rot: rot,
                erroresCorregidos: rsResult.erroresCorregidos
            });
        }
    }

    if (matchesValidos.length === 0) {
        return null;
    }

    // Ordenar por correlación (prioridad) y errores corregidos (secundario)
    matchesValidos.sort((a, b) => {
        const diffCorr = Math.abs(a.correlacion - b.correlacion);
        if (diffCorr > 0.05) {
            return b.correlacion - a.correlacion;
        }

        // Si correlación similar, preferir menos errores corregidos
        if (a.erroresCorregidos !== b.erroresCorregidos) {
            return a.erroresCorregidos - b.erroresCorregidos;
        }

        const diffEnergia = Math.abs(a.scoreReal - b.scoreReal);
        if (diffEnergia > 1.0) {
            return b.scoreReal - a.scoreReal;
        }

        return a.rot - b.rot;
    });

    if (CONFIG.DEBUG_RESCATE && matchesValidos.length > 1) {
        console.log(`   🔍 ${matchesValidos.length} decodificaciones RS válidas:`);
        matchesValidos.slice(0, 3).forEach((m, i) => {
            console.log(`      ${i === 0 ? '→' : ' '} Rot:${m.rot} | ID:${m.id.toString(16).padStart(5, '0')} | C:${m.correlacion.toFixed(3)} | Err:${m.erroresCorregidos}`);
        });
    }

    return matchesValidos[0];
}

/**
 * 🆕 DECODIFICAR PAYLOAD CON REED-SOLOMON
 */
function decodificarReedSolomon(payload32) {
    try {
        // Convertir payload 32 bits a bytes
        const receivedBytes = new Uint8Array(4);
        receivedBytes[0] = (payload32 >>> 24) & 0xFF;
        receivedBytes[1] = (payload32 >>> 16) & 0xFF;
        receivedBytes[2] = (payload32 >>> 8) & 0xFF;
        receivedBytes[3] = payload32 & 0xFF;

        // Intentar decodificar con Reed-Solomon
        const decoded = rsDecoder.decode(receivedBytes);

        if (!decoded) {
            // Demasiados errores para corregir
            return { success: false };
        }

        // Extraer ID de 20 bits de los 3 primeros bytes
        const id20bits =
            ((decoded[0] << 12) & 0xFF000) |
            ((decoded[1] << 4) & 0x0FF0) |
            ((decoded[2] >>> 4) & 0x000F);

        // Contar errores corregidos (comparando bytes originales vs corregidos)
        let errores = 0;
        for (let i = 0; i < 4; i++) {
            if (receivedBytes[i] !== decoded[i]) errores++;
        }

        return {
            success: true,
            id: id20bits,
            erroresCorregidos: errores
        };

    } catch (error) {
        // Error en decodificación
        return { success: false };
    }
}

/**
 * Extrae energía Twin-64 del LL subband (sin cambios)
 */
function extraerEnergiaTwin64LL(LL, llWidth, llHeight, offsetX = 0, offsetY = 0) {
    const DNA_LENGTH = 64;
    const blockSize = CONFIG.BLOCK_SIZE;

    const u1 = CONFIG.FREQ_1.u, v1 = CONFIG.FREQ_1.v;
    const u2 = CONFIG.FREQ_2.u, v2 = CONFIG.FREQ_2.v;

    const blocksPerRowActual = Math.floor((llWidth - offsetX) / blockSize);

    const candidatosAnchos = [
        blocksPerRowActual,
        Math.round(blocksPerRowActual * 1.9873),
        Math.round(blocksPerRowActual * 4.0256),
        Math.round(blocksPerRowActual * 1.3305),
        Math.round(blocksPerRowActual * 1.5096),
        Math.round(blocksPerRowActual * 2.0),
        Math.round(blocksPerRowActual * 4.0),
        Math.round(blocksPerRowActual * 0.5),
        366, 183, 91, 274, 241,
        157, 79, 39,
        125, 62, 93, 135
    ];

    const anchosUnicos = [...new Set(candidatosAnchos)]
        .filter(a => a > 0)
        .sort((a, b) => Math.abs(blocksPerRowActual - a) - Math.abs(blocksPerRowActual - b));

    const resultados = anchosUnicos.map(anchoRef => {
        const urnas = new Float32Array(DNA_LENGTH).fill(0);
        const conteo = new Float32Array(DNA_LENGTH).fill(0);

        for (let y = offsetY; y <= llHeight - blockSize; y += blockSize) {
            const blockY = Math.floor(y / blockSize);

            for (let x = offsetX; x <= llWidth - blockSize; x += blockSize) {
                const blockX = Math.floor(x / blockSize);

                const val1 = calcularCoeficienteDCTLL(LL, llWidth, x, y, u1, v1);
                const val2 = calcularCoeficienteDCTLL(LL, llWidth, x, y, u2, v2);

                const diff = val1 - val2;

                const linearIdx = blockY * anchoRef + blockX;
                const idx = linearIdx % DNA_LENGTH;

                urnas[idx] += diff;
                conteo[idx]++;
            }
        }

        for (let i = 0; i < DNA_LENGTH; i++) {
            if (conteo[i] > 0) urnas[i] /= conteo[i];
        }

        return { urnas, anchoRef };
    });

    return resultados;
}

function calcularCoeficienteDCTLL(LL, llWidth, startX, startY, u, v) {
    const n = 8;
    let sum = 0;
    const Cu = (u === 0) ? 1 / Math.sqrt(2) : 1;
    const Cv = (v === 0) ? 1 / Math.sqrt(2) : 1;

    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            const idx = (startY + y) * llWidth + (startX + x);
            const pixel = LL[idx] - 128;

            sum += pixel *
                   Math.cos(((2 * x + 1) * u * Math.PI) / 16) *
                   Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        }
    }

    return 0.25 * Cu * Cv * sum;
}

function aplicarDWTHaar(buffer, width, height) {
    const llWidth = Math.floor(width / 2);
    const llHeight = Math.floor(height / 2);

    const LL = new Float32Array(llWidth * llHeight);
    const LH = new Float32Array(llWidth * llHeight);
    const HL = new Float32Array(llWidth * llHeight);
    const HH = new Float32Array(llWidth * llHeight);

    for (let y = 0; y < height - 1; y += 2) {
        for (let x = 0; x < width - 1; x += 2) {
            const idx00 = (y * width + x) * 4 + 2;
            const idx01 = (y * width + (x + 1)) * 4 + 2;
            const idx10 = ((y + 1) * width + x) * 4 + 2;
            const idx11 = ((y + 1) * width + (x + 1)) * 4 + 2;

            const a = buffer[idx00];
            const b = buffer[idx01];
            const c = buffer[idx10];
            const d = buffer[idx11];

            const outIdx = (y / 2) * llWidth + (x / 2);

            LL[outIdx] = (a + b + c + d) / 4;
            LH[outIdx] = (a + b - c - d) / 4;
            HL[outIdx] = (a - b + c - d) / 4;
            HH[outIdx] = (a - b - c + d) / 4;
        }
    }

    return { LL, LH, HL, HH };
}

export { analizarBufferDWT };
