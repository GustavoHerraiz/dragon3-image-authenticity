/**
 * ============================================================================
 * 👁️ DRAGON EYE [MODO FAÚNDEZ] - 32 BIT ANALYZER
 * ============================================================================
 * ADAPTACIÓN DEL NÚCLEO DEFINITIVE v8.7 PARA PROTOCOLO DE 32 BITS.
 * - Identidad (16 bits) + Timestamp (16 bits).
 * - Mantiene robustez "Omni-Lock" y "Gravedad".
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,          // Canal Azul
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 },
    // 📅 FAÚNDEZ EPOCH (Debe coincidir con el Generador)
    FAUNDEZ_EPOCH: new Date('2026-01-01T00:00:00Z').getTime()
};

// TABLA DE COSENOS (Precalculada para velocidad)
const COS_TABLE = new Float32Array(8 * 8);
for (let i = 0; i < 8; i++) {
    for (let u = 0; u < 8; u++) {
        COS_TABLE[i * 8 + u] = Math.cos(((2 * i + 1) * u * Math.PI) / 16);
    }
}

/**
 * 👁️ ORQUESTADOR MAESTRO FAÚNDEZ (32 BITS)
 */
export async function analizarImagenFaundez(rutaImagen) {
    const res = {
        identificado: false,
        metodo: "DRAGON_EYE_FAUNDEZ_32",
        energia: 0,
        hash: "----",
        timestamp_val: 0,       // Valor crudo (minutos)
        timestamp_fecha: "----", // Fecha legible
        estado_tiempo: "UNK",    // OK / REPLAY / FUTURO
        cliente: "Desconocido",
        obra: "Desconocida",
        confianza: 0,
        geometria: { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: 0 },
        diagnostico: {} // Para informes detallados
    };

    try {
        if (!fs.existsSync(rutaImagen)) return res;

        const imageObj = sharp(rutaImagen);
        const { data: buffer, info } = await imageObj.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = info;

        // PASO 0: OMNI-LOCK DIRECTO (0,0) - Intento rápido
        // Extraemos señal pensando en 32 bits (ciclo 64)
        const senalDirecta = extraerSenalLineal(buffer, width, height, 0, 0, 1.0, 0);
        const strideDirecto = Math.floor(width / CONFIG.BLOCK_SIZE);

        // ⚠️ CAMBIO CLAVE: Proyectamos 32 urnas, no 16
        const urnasDirectas = proyectarUrnas32(senalDirecta, strideDirecto);

        let energiaDirecta = 0;
        for(let u of urnasDirectas) energiaDirecta += Math.abs(u);

        // Buscamos identidad en los primeros 16 bits
        const matchDirecto = buscarEnBDCiego32(urnasDirectas, energiaDirecta);

        // UMBRAL DE SEGURIDAD DIRECTO
        if (matchDirecto && matchDirecto.scoreReal > 1200) {
             res.identificado = true;
             res.hash = matchDirecto.hash;
             res.cliente = matchDirecto.cliente;
             res.obra = matchDirecto.obra;
             res.confianza = matchDirecto.confianza;
             res.energia = matchDirecto.scoreReal;
             res.metodo = "OMNI_LOCK_DIRECT_32";
             res.geometria = { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: strideDirecto };

             // 🕒 DECODIFICAR TIMESTAMP (Bits 16-31)
             const datosTiempo = decodificarTimestamp(urnasDirectas, matchDirecto.rot);
             res.timestamp_val = datosTiempo.val;
             res.timestamp_fecha = datosTiempo.fecha;
             res.estado_tiempo = datosTiempo.estado;

             res.diagnostico = {
                scoreFinal: matchDirecto.scoreReal,
                energiaBruta: matchDirecto.confianza,
                coherencia: matchDirecto.debugCoherencia || 0,
                flatness: matchDirecto.flatness || 0,
                ratio: matchDirecto.ratio || 0,
                angulo: 0
             };

             return res;
        }

        // PASO 1: BÚSQUEDA FÍSICA (INTACTO - Busca energía diferencial)
        let mejorSincro = { score: 0, faseX: 0, faseY: 0, escala: 1.0, angulo: 0 };
        const angulosFast = [0, 5, -5, 15, -15, 14, 16, 30, -30, 45, -45, 90];

        for (let angulo of angulosFast) {
            const factorGravedad = (angulo === 0) ? 1.0 : 0.6; // Gravedad v8.7
            for (let escala of [1.0, 0.5]) {
                for (let dy = 0; dy < 8; dy += 2) {
                    for (let dx = 0; dx < 8; dx += 2) {
                        const rawScore = muestreoRapidoEnergia(buffer, width, height, dx, dy, escala, angulo);
                        const scorePonderado = rawScore * factorGravedad;

                        if (scorePonderado > mejorSincro.score) {
                            mejorSincro = { score: scorePonderado, faseX: dx, faseY: dy, escala: escala, angulo: angulo };
                        }
                    }
                }
            }
        }

        if (mejorSincro.score < 5.0) {
            res.energia = mejorSincro.score;
            return res;
        }

        // FASE 2: EXTRACCIÓN FINO
        const senalLineal = extraerSenalLineal(buffer, width, height, mejorSincro.faseX, mejorSincro.faseY, mejorSincro.escala, mejorSincro.angulo);

        // FASE 3: STRIDE & IDENTIDAD (Adaptado a 32 bits)
        const bSizeFinal = Math.round(CONFIG.BLOCK_SIZE * mejorSincro.escala);
        const bloquesAnchoRecorte = Math.floor((width - mejorSincro.faseX) / bSizeFinal);

        // Iteramos Stride para sincronizar (hasta 128 offsets para cubrir ciclo 64)
        for (let sOffset = 0; sOffset < 128; sOffset++) {
            const strideHipotesis = bloquesAnchoRecorte + sOffset;

            // ⚠️ Proyección 32 bits
            const urnasProyectadas = proyectarUrnas32(senalLineal, strideHipotesis);

            let energiaTotal = 0;
            for(let u of urnasProyectadas) energiaTotal += Math.abs(u);

            const match = buscarEnBDCiego32(urnasProyectadas, energiaTotal);

            if (match) {
                let factorFinal = (mejorSincro.angulo === 0) ? 1.0 : 0.6;
                if (match.debugCoherencia >= 7) factorFinal = 1.0; // Inmunidad Vanguardia

                const scorePenalizado = match.scoreReal * factorFinal;

                if (scorePenalizado > 15) {
                    // Validación Vectorial (Balizas) - Intacto
                    const geoParaValidar = {
                        escala: mejorSincro.escala,
                        centroX: mejorSincro.faseX,
                        centroY: mejorSincro.faseY,
                        angulo: mejorSincro.angulo
                    };

                    // Usamos la validación vectorial clásica sobre la parte de identidad
                    if (validarConsensoVectorialSmart(buffer, width, height, geoParaValidar, match)) {
                         res.identificado = true;
                         res.hash = match.hash;
                         res.cliente = match.cliente;
                         res.obra = match.obra;
                         res.confianza = match.confianza;
                         res.energia = scorePenalizado;

                         res.geometria = {
                            escala: mejorSincro.escala,
                            centroX: mejorSincro.faseX,
                            centroY: mejorSincro.faseY,
                            angulo: mejorSincro.angulo,
                            strideOriginal: strideHipotesis
                         };

                         // 🕒 DECODIFICAR TIMESTAMP (Bits 16-31)
                         // Importante: Usamos la rotación detectada para alinear el Vagón
                         const datosTiempo = decodificarTimestamp(urnasProyectadas, match.rot);
                         res.timestamp_val = datosTiempo.val;
                         res.timestamp_fecha = datosTiempo.fecha;
                         res.estado_tiempo = datosTiempo.estado;

                         res.diagnostico = {
                            scoreFinal: scorePenalizado,
                            energiaBruta: match.confianza,
                            coherencia: match.debugCoherencia || 0,
                            flatness: match.flatness || 0,
                            ratio: match.ratio || 0,
                            angulo: mejorSincro.angulo
                         };

                         return res;
                    }
                }
            }
        }

        res.energia = mejorSincro.score;
        return res;

    } catch (e) {
        console.error("Error crítico en Analizador Faúndez:", e);
        return res;
    }
}
/**
 * ⚡ PROYECCIÓN 32 BITS (Ciclo de 64 bloques Twin)
 */
function proyectarUrnas32(votos, stride) {
    // AHORA SON 32 URNAS (0-15: Identidad, 16-31: Tiempo)
    const urnas = new Float32Array(32).fill(0);

    for (const v of votos) {
        const bloqueLinealIndex = (v.y * stride + v.x);
        // El ciclo completo es de 64 pasos (32 bits * 2 bloques Twin)
        const ciclo = bloqueLinealIndex % 64;

        // TwinBlocks: Bloques pares llevan el dato positivo
        if (ciclo % 2 === 0) {
            const bitIndex = Math.floor(ciclo / 2);
            if (bitIndex < 32) {
                urnas[bitIndex] += v.valor;
            }
        }
        // (Opcional: Podríamos restar los impares para ganar SNR, pero KISS por ahora)
    }
    return urnas;
}

/**
 * 🎯 MOTOR DE IDENTIDAD FAÚNDEZ (Busca solo en los primeros 16 bits)
 */
function buscarEnBDCiego32(urnas32, energiaTotal) {
    let mejorMatch = null;
    let mejorScore = -Infinity;

    if (energiaTotal < 50) return null;

    // Extraemos solo la parte de Identidad (Urnas 0-15) para comparar
    // Pero OJO: La rotación afecta a TODO el tren de 32 bits.
    // Simplicidad: Asumimos que la identidad está en un bloque continuo.

    for (const sello of BASE_DE_DATOS_SELLOS) {
        const patronTeorico = hashABitsFirmados(sello.hash_suffix);

        // Probamos las 32 rotaciones posibles (porque el tren mide 32)
        for (let r = 0; r < 32; r++) {
            const urnasRotadas = rotarArray32(urnas32, r);

            // Analizamos solo los primeros 16 bits (Locomotora)
            let aportes = [];
            for (let i = 0; i < 16; i++) {
                aportes.push(urnasRotadas[i] * patronTeorico[i]);
            }

            // --- LÓGICA ESPARTANA v11 (Idéntica a Definitive) ---
            aportes.sort((a, b) => Math.abs(b) - Math.abs(a));
            const vanguardia = aportes.slice(0, 8);
            const retaguardia = aportes.slice(8, 16);

            let sumaVanguardia = 0;
            let coherenciaVanguardia = 0;
            for(let val of vanguardia) {
                sumaVanguardia += val;
                if (val > 0) coherenciaVanguardia++;
            }

            const picoMin = Math.abs(vanguardia[7]);
            const picoMax = Math.abs(vanguardia[0]);
            const flatness = picoMin / (picoMax + 1.0);

            let energiaCola = 0;
            for(let val of retaguardia) energiaCola += Math.abs(val);
            const ratio = sumaVanguardia / (energiaCola + 1.0);

            let scoreFinal = sumaVanguardia / 8;
            let esValido = false;

            if (coherenciaVanguardia >= 7) {
                if (scoreFinal > 10) {
                    if (scoreFinal >= 3000) {
                         if (flatness > 0.15) esValido = true;
                    } else {
                         if (flatness > 0.40) esValido = true;
                    }
                    if (esValido && coherenciaVanguardia === 8) scoreFinal *= 2.0;
                }
            }

            if (esValido && scoreFinal > mejorScore) {
                mejorScore = scoreFinal;
                mejorMatch = {
                    cliente: sello.cliente,
                    obra: sello.obra,
                    hash: sello.hash_suffix,
                    rot: r, // Guardamos rotación para decodificar tiempo después
                    confianza: sumaVanguardia,
                    scoreReal: scoreFinal,
                    balizasReferencia: sello.balizas,
                    debugCoherencia: coherenciaVanguardia,
                    flatness: flatness,
                    ratio: ratio
                };
            }
        }
    }
    return mejorMatch;
}
/**
 * 🕒 DECODIFICADOR DE TIMESTAMP (Bits 16-31)
 */
function decodificarTimestamp(urnas32Originales, rotacionDetectada) {
    // 1. Alineamos el tren usando la rotación con la que encontramos la Identidad
    const urnasAlineadas = rotarArray32(urnas32Originales, rotacionDetectada);

    // 2. Leemos los bits del Vagón (Índices 16 a 31)
    let valorBinario = 0;
    let bitsLeidos = "";

    for (let i = 0; i < 16; i++) {
        // Urna 16 es el Bit más significativo (MSB) o el menos?
        // En el generador hicimos: binTime = timeStamp16.toString(2)
        // Y concatenamos: ID + Time.
        // Así que urnas[16] es el primer bit del Time.

        const valorUrna = urnasAlineadas[16 + i];
        const bit = valorUrna > 0 ? 1 : 0; // Decisión dura (Hard Decision)

        bitsLeidos += bit;
        // Reconstruimos el entero (Big Endian porque toString(2) es así)
        valorBinario = (valorBinario << 1) | bit;
    }

    // 3. Interpretación Humana
    const minutosDesdeEpoch = valorBinario;
    const fechaEstimada = new Date(CONFIG.FAUNDEZ_EPOCH + (minutosDesdeEpoch * 60000));

    // 4. Comprobación Anti-Replay Básica (Ventana 24h)
    const ahora = Date.now();
    const difMinutos = (ahora - fechaEstimada.getTime()) / 60000;

    let estado = "OK";
    if (difMinutos < -5) estado = "FUTURO_IMPOSIBLE"; // Reloj desajustado o fake
    else if (difMinutos > 1440) estado = "CADUCADO (>24h)"; // Replay viejo
    else if (difMinutos > 0) estado = `OK (Hace ${Math.round(difMinutos)} min)`;

    return {
        val: valorBinario,
        fecha: fechaEstimada.toISOString(),
        estado: estado,
        bits_raw: bitsLeidos
    };
}

// --- UTILIDADES ---

function rotarArray32(arr, n) {
    const l = 32;
    const res = new Float32Array(l);
    for (let i = 0; i < l; i++) {
        // Rotación circular segura
        res[(i + n) % l] = arr[i];
    }
    return res;
}

function hashABitsFirmados(hashHex) {
    const bin = parseInt(hashHex, 16).toString(2).padStart(16, '0');
    return bin.split('').map(bit => bit === '1' ? 1.0 : -1.0);
}

// --- FUNCIONES FÍSICAS INTACTAS (Muestreo, Extracción DCT, etc) ---
// COPIA Y PEGA AQUÍ LAS FUNCIONES DEL DEFINITIVE v8.7:
// - muestreoRapidoEnergia
// - extraerSenalLineal
// - calcularCoeficienteDCT
// - validarConsensoVectorialSmart
// (Son idénticas, no cambian por ser 32 bits porque operan a nivel de píxel)
// Por brevedad en el chat, asumo que las copias del archivo anterior.
// SI LAS NECESITAS EXPLÍCITAS, PÍDEMELAS.

/**
 * 🚀 MUESTREO ROBUSTO v8.3 (INTACTO)
 */
function muestreoRapidoEnergia(buffer, width, height, offsetX, offsetY, escala, angulo) {
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * escala);
    if (blockSize < 4) return 0;
    const bloquesAncho = Math.floor((width - offsetX) / blockSize);
    const bloquesAlto = Math.floor((height - offsetY) / blockSize);
    let energiaDiferencial = 0;
    let bloquesLeidos = 0;
    for (let y = 0; y < bloquesAlto; y += 4) {
        for (let x = 0; x < bloquesAncho - 1; x += 4) {
            const pxA = offsetX + x * blockSize;
            const pyA = offsetY + y * blockSize;
            const pxB = offsetX + (x + 1) * blockSize;
            const pyB = offsetY + y * blockSize;
            const sigA = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo);
            const sigB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo);
            energiaDiferencial += Math.abs(sigA - sigB);
            bloquesLeidos++;
        }
    }
    return bloquesLeidos > 0 ? (energiaDiferencial / bloquesLeidos) : 0;
}

function extraerSenalLineal(buffer, width, height, offsetX, offsetY, escala, angulo) {
    const votos = [];
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * escala);
    const bloquesAncho = Math.floor((width - offsetX) / blockSize);
    const bloquesAlto = Math.floor((height - offsetY) / blockSize);
    for (let y = 0; y < bloquesAlto; y++) {
        for (let x = 0; x < bloquesAncho - 1; x += 2) {
            const pxA = offsetX + x * blockSize;
            const pyA = offsetY + y * blockSize;
            const pxB = offsetX + (x + 1) * blockSize;
            const pyB = offsetY + y * blockSize;
            const sigA = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);
            const sigB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);
            votos.push({ y, x, valor: sigA - sigB });
        }
    }
    return votos;
}

function calcularCoeficienteDCT(buffer, width, height, startX, startY, u, v, size, angulo = 0) {
    let sum = 0;
    const rad = (angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const rx = (x - 4) * (size / 8);
            const ry = (y - 4) * (size / 8);
            const rotX = rx * cosA - ry * sinA;
            const rotY = rx * sinA + ry * cosA;
            let px = Math.floor(startX + 4 + rotX);
            let py = Math.floor(startY + 4 + rotY);
            if (px < 0) px = 0; else if (px >= width) px = width - 1;
            if (py < 0) py = 0; else if (py >= height) py = height - 1;
            const idx = (py * width + px) * 4 + CONFIG.CHANNEL_IDX;
            const val = buffer[idx] - 128;
            const cosX = COS_TABLE[x * 8 + u];
            const cosY = COS_TABLE[y * 8 + v];
            sum += val * cosX * cosY;
        }
    }
    return sum;
}

function validarConsensoVectorialSmart(buffer, width, height, geo, match) {
    let aciertos = 0;
    let totalVisibles = 0;
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * geo.escala);
    const rad = (geo.angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    if (!match.balizasReferencia) return true;
    const balizas = match.balizasReferencia.slice(0, 5);
    for (const b of balizas) {
        const relX = b.x * blockSize;
        const relY = b.y * blockSize;
        const rotX = relX * cosA - relY * sinA;
        const rotY = relX * sinA + relY * cosA;
        const px = Math.floor(geo.centroX + rotX);
        const py = Math.floor(geo.centroY + rotY);
        if (px < 0 || px + blockSize > width || py < 0 || py + blockSize > height) continue;
        totalVisibles++;
        const sigA = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, geo.angulo);
        const sigB = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, geo.angulo);
        const dif = sigA - sigB;
        let signoEsperado = (b.valor === undefined || b.valor === 1) ? 1.0 : -1.0;
        if (match.faseInvertida) signoEsperado *= -1.0;
        if (Math.abs(dif) > 2.5) {
            if (Math.sign(dif) === Math.sign(signoEsperado)) {
                aciertos++;
            }
        }
    }
    if (totalVisibles === 0) return false;
    return (aciertos / totalVisibles) >= 0.7;
}
