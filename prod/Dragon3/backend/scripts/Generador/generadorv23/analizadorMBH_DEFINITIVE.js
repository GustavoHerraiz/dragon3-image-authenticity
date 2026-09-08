/**
 * ============================================================================
 * 👁️ DRAGON EYE v7.6 - FORENSIC CORE (ROBUST & FAST)
 * ============================================================================
 * 1. FIX: 'muestreoRapidoEnergia' ahora usa un escaneo esparcido (Sparse Scan)
 * en lugar de un solo punto. Recupera la precisión global.
 * 2. FIX: Ángulos ampliados para cubrir ataques de 15° y 45°.
 * 3. CORE: Mantiene la optimización de Fase 2 (Extracción Lineal) para velocidad.
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,          // Canal Azul
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 }
};

// TABLA DE COSENOS (Precalculada)
const COS_TABLE = new Float32Array(8 * 8);
for (let i = 0; i < 8; i++) {
    for (let u = 0; u < 8; u++) {
        COS_TABLE[i * 8 + u] = Math.cos(((2 * i + 1) * u * Math.PI) / 16);
    }
}

/**
 * 👁️ ORQUESTADOR MAESTRO v8.7 (GRAVITY PERSISTENCE)
 * - Umbral Omni-Lock subido a 1200 para evitar falsos positivos tempranos.
 * - La gravedad (0.6) se aplica al SCORE FINAL de identidad, no solo a la sincro.
 */
export async function analizarImagenDefinitiva(rutaImagen) {
    const res = {
        identificado: false,
        metodo: "DRAGON_EYE_v8.7_GRAVITY",
        energia: 0,
        hash: "----",
        cliente: "Desconocido",
        obra: "Desconocida",
        confianza: 0,
        geometria: { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: 0 }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return res;

        const imageObj = sharp(rutaImagen);
        const { data: buffer, info } = await imageObj.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = info;

        // PASO 0: OMNI-LOCK DIRECTO (0,0)
        const senalDirecta = extraerSenalLineal(buffer, width, height, 0, 0, 1.0, 0);
        const strideDirecto = Math.floor(width / CONFIG.BLOCK_SIZE);
        const urnasDirectas = proyectarUrnas(senalDirecta, strideDirecto);

        let energiaDirecta = 0;
        for(let u of urnasDirectas) energiaDirecta += Math.abs(u);
        const matchDirecto = buscarEnBDCiego(urnasDirectas, energiaDirecta);

        // UMBRAL DE SEGURIDAD
        if (matchDirecto && matchDirecto.scoreReal > 1200) {
             res.identificado = true;
             res.hash = matchDirecto.hash;
             res.cliente = matchDirecto.cliente;
             res.obra = matchDirecto.obra;
             res.confianza = matchDirecto.confianza;
             res.energia = matchDirecto.scoreReal;
             res.metodo = "OMNI_LOCK_DIRECT";
             res.geometria = { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: strideDirecto };

             // 👇👇👇 ¡¡PEGALO AQUÍ TAMBIÉN!! 👇👇👇
             res.diagnostico = {
                scoreFinal: matchDirecto.scoreReal,
                energiaBruta: matchDirecto.confianza,
                coherencia: matchDirecto.debugCoherencia || 0,
                flatness: matchDirecto.flatness || 0,
                ratio: matchDirecto.ratio || 0,
                angulo: 0
             };
             // 👆👆👆 ESTO ES LO QUE FALTABA 👆👆👆

             return res; // Se salía aquí sin llevarse los datos
        }

        // PASO 1: BÚSQUEDA FÍSICA
        let mejorSincro = { score: 0, faseX: 0, faseY: 0, escala: 1.0, angulo: 0 };
        const angulosFast = [0, 5, -5, 15, -15, 14, 16, 30, -30, 45, -45, 90];

        for (let angulo of angulosFast) {
            // GRAVEDAD: 0.6 para matar aliasing
            const factorGravedad = (angulo === 0) ? 1.0 : 0.6;

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

        // FASE 2: EXTRACCIÓN
        const senalLineal = extraerSenalLineal(buffer, width, height, mejorSincro.faseX, mejorSincro.faseY, mejorSincro.escala, mejorSincro.angulo);

        // FASE 3: STRIDE & IDENTIDAD
        const bSizeFinal = Math.round(CONFIG.BLOCK_SIZE * mejorSincro.escala);
        const bloquesAnchoRecorte = Math.floor((width - mejorSincro.faseX) / bSizeFinal);

        // Factor de Gravedad FINAL (Persistente)
        const gravedadFinal = (mejorSincro.angulo === 0) ? 1.0 : 0.6;

        for (let sOffset = 0; sOffset < 64; sOffset++) {
            const strideHipotesis = bloquesAnchoRecorte + sOffset;
            const urnasProyectadas = proyectarUrnas(senalLineal, strideHipotesis);

            let energiaTotal = 0;
            for(let u of urnasProyectadas) energiaTotal += Math.abs(u);

            const match = buscarEnBDCiego(urnasProyectadas, energiaTotal);

            if (match) {
                // GRAVEDAD
                let factorFinal = (mejorSincro.angulo === 0) ? 1.0 : 0.6;

                // INMUNIDAD VANGUARDIA
                if (match.debugCoherencia >= 7) factorFinal = 1.0;

                const scorePenalizado = match.scoreReal * factorFinal;

                // UMBRAL 15
                if (scorePenalizado > 15) {
                    // ... validación ...
                    const geoParaValidar = {
                        escala: mejorSincro.escala,
                        centroX: mejorSincro.faseX,
                        centroY: mejorSincro.faseY,
                        angulo: mejorSincro.angulo
                    };

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

                         // --- INYECCIÓN DE TELEMETRÍA FORENSE ---
                         // Necesario para el informe detallado del test de tortura
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
        console.error("Error crítico en analizador:", e);
        return res;
    }
}

/**
 * 🚀 MUESTREO ROBUSTO v8.3 (PURE)
 * Revertido a diferencial simple.
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

            // Diferencial Absoluto Simple
            energiaDiferencial += Math.abs(sigA - sigB);
            bloquesLeidos++;
        }
    }

    return bloquesLeidos > 0 ? (energiaDiferencial / bloquesLeidos) : 0;
}

/**
 * 🚀 EXTRACCIÓN LINEAL v8.3 (PURE SENSITIVITY)
 * Revertido a sustracción simple para máxima sensibilidad con Crops.
 * Eliminado el "Judo" que amplificaba el Sharpen.
 */
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

            // Sustracción simple: Máxima tracción para señales débiles
            votos.push({ y, x, valor: sigA - sigB });
        }
    }
    return votos;
}

/**
 * ⚡ PROYECCIÓN
 */
function proyectarUrnas(votos, stride) {
    const urnas = new Float32Array(16).fill(0);
    for (const v of votos) {
        const bloqueLinealIndex = (v.y * stride + v.x);
        const ciclo = bloqueLinealIndex % 32;
        if (ciclo % 2 === 0) {
            const bitIndex = Math.floor(ciclo / 2);
            urnas[bitIndex] += v.valor;
        }
    }
    return urnas;
}

/**
 * 🛰️ VALIDADOR TOPOGRÁFICO (HARDENED v7.8)
 * Umbral subido a 4.5 para evitar falsos positivos por ruido de fondo.
 * Verifica si las balizas del cliente están físicamente donde deberían.
 */
function validarConsensoTopografico(buffer, width, height, geo, match) {
    let votosPositivos = 0;
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * geo.escala);
    const rad = (geo.angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    if (!match.balizasReferencia || match.balizasReferencia.length === 0) return true;

    // Validamos las 3 balizas principales
    const balizasAValidar = match.balizasReferencia.slice(0, 3);
    const totalAValidar = balizasAValidar.length;

    for (const b of balizasAValidar) {
        // Coordenadas relativas
        const relX = b.x * blockSize;
        const relY = b.y * blockSize;

        // Rotación
        const rotX = relX * cosA - relY * sinA;
        const rotY = relX * sinA + relY * cosA;

        // Coordenadas absolutas
        const px = Math.floor(geo.centroX + rotX);
        const py = Math.floor(geo.centroY + rotY);

        if (px < 0 || px + blockSize > width || py < 0 || py + blockSize > height) continue;

        // Leemos señal local
        const sigA = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, geo.angulo);
        const sigB = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, geo.angulo);

        // UMBRAL ENDURECIDO: 4.5 (Antes 2.0)
        // El ruido aleatorio rara vez genera un diferencial > 4.0.
        // La señal real suele estar entre 10.0 y 50.0.
        if (Math.abs(sigA - sigB) > 4.5) votosPositivos++;
    }

    // Exigimos mayoría simple (2 de 3)
    return votosPositivos >= Math.ceil(totalAValidar / 2);
}

/**
 * 🧱 DCT ROTATIVA
 */
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

/**
 * 🎯 MOTOR DE IDENTIDAD v11.0 (SPARTAN LOGIC)
 * - Simplificación radical: ELIMINADAS todas las excepciones de energía.
 * - FILTRO ÚNICO: Coherencia Espacial.
 * - Si no alineas 7 de 8 vectores, eres ruido. Punto.
 */
function buscarEnBDCiego(urnasEnergia, energiaTotal) {
    let mejorMatch = null;
    let mejorScore = -Infinity;

    if (energiaTotal < 50) return null;

    for (const sello of BASE_DE_DATOS_SELLOS) {
        const patronTeorico = hashABitsFirmados(sello.hash_suffix);

        for (let r = 0; r < 16; r++) {
            const urnasRotadas = rotarArray(urnasEnergia, r);
            let aportes = [];

            // 1. DEMODULACIÓN
            for (let i = 0; i < 16; i++) {
                aportes.push(urnasRotadas[i] * patronTeorico[i]);
            }

            // 2. ORDENAR
            aportes.sort((a, b) => Math.abs(b) - Math.abs(a));
            const vanguardia = aportes.slice(0, 8);
            const retaguardia = aportes.slice(8, 16);

            // 3. ANÁLISIS VANGUARDIA
            let sumaVanguardia = 0;
            let coherenciaVanguardia = 0;
            for(let val of vanguardia) {
                sumaVanguardia += val;
                if (val > 0) coherenciaVanguardia++;
            }

            // 4. MÉTRICAS
            const picoMax = Math.abs(vanguardia[0]);
            const picoMin = Math.abs(vanguardia[7]);
            const flatness = picoMin / (picoMax + 1.0);

            let energiaCola = 0;
            for(let val of retaguardia) energiaCola += Math.abs(val);
            const ratio = sumaVanguardia / (energiaCola + 1.0);

            let scoreFinal = sumaVanguardia / 8;
            let esValido = false;

            // --- LÓGICA ESPARTANA v11 ---

            // REGLA SUPREMA: EL MURO DE COHERENCIA
            // Da igual si tienes 1 millón de energía. Si no hay orden (>=7), eres ruido.
            if (coherenciaVanguardia >= 7) {

                // REGLA SECUNDARIA: SOLIDEZ (Flatness)
                // Evita falsos positivos débiles (como F2_02).
                if (scoreFinal > 10) {
                    if (scoreFinal >= 3000) {
                         // Señal Fuerte (>3000): Permitimos distorsión por Aliasing
                         if (flatness > 0.15) esValido = true;
                    } else {
                         // Señal Débil (<3000): Exigimos solidez para filtrar pareidolias
                         if (flatness > 0.40) esValido = true;
                    }

                    if (esValido) {
                        // PREMIO A LA PERFECCIÓN
                        // Jerome tiene Coherencia 8. El ruido con suerte llega a 7.
                        // Esto garantiza que Jerome gane siempre en caso de duda.
                        if (coherenciaVanguardia === 8) scoreFinal *= 2.0;
                    }
                }
            }

            if (esValido && scoreFinal > mejorScore) {
                mejorScore = scoreFinal;
                mejorMatch = {
                    cliente: sello.cliente,
                    obra: sello.obra,
                    hash: sello.hash_suffix,
                    rot: r,
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

// UTILIDADES
function hashABitsFirmados(hashHex) {
    const bin = parseInt(hashHex, 16).toString(2).padStart(16, '0');
    return bin.split('').map(bit => bit === '1' ? 1.0 : -1.0);
}

function rotarArray(arr, n) {
    const l = arr.length;
    const res = new Float32Array(l);
    for (let i = 0; i < l; i++) res[(i + n) % l] = arr[i];
    return res;
}

/**
 * 🛡️ VALIDADOR VECTORIAL SMART (v8.1/v8.5)
 * Verifica el PORCENTAJE de aciertos de signo en balizas visibles.
 * - Sharpen (Ruido): ~50% aciertos (Azar) -> Falla.
 * - Crop (Señal): ~100% aciertos en lo visible -> Pasa.
 * - Umbral: 0.7 (Permite 1 error de cada 4 balizas).
 */
function validarConsensoVectorialSmart(buffer, width, height, geo, match) {
    let aciertos = 0;
    let totalVisibles = 0;

    const blockSize = Math.round(CONFIG.BLOCK_SIZE * geo.escala);
    const rad = (geo.angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    if (!match.balizasReferencia) return true;

    // Validamos hasta 5 balizas
    const balizas = match.balizasReferencia.slice(0, 5);

    for (const b of balizas) {
        // Proyección de coordenadas
        const relX = b.x * blockSize;
        const relY = b.y * blockSize;
        const rotX = relX * cosA - relY * sinA;
        const rotY = relX * sinA + relY * cosA;
        const px = Math.floor(geo.centroX + rotX);
        const py = Math.floor(geo.centroY + rotY);

        // Si cae fuera (Crop), no cuenta ni a favor ni en contra.
        if (px < 0 || px + blockSize > width || py < 0 || py + blockSize > height) continue;

        totalVisibles++;

        const sigA = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, geo.angulo);
        const sigB = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, geo.angulo);
        const dif = sigA - sigB;

        // Determinamos signo esperado
        let signoEsperado = (b.valor === undefined || b.valor === 1) ? 1.0 : -1.0;
        if (match.faseInvertida) signoEsperado *= -1.0;

        // VALIDACIÓN:
        // Solo contamos si hay energía suficiente (>2.5) para evitar ruido térmico
        if (Math.abs(dif) > 2.5) {
            // Si el signo coincide, es un acierto.
            if (Math.sign(dif) === Math.sign(signoEsperado)) {
                aciertos++;
            }
            // Si no coincide, no suma (es un error).
        }
    }

    // Si no vemos balizas (crop total), asumimos fallo o inseguridad
    if (totalVisibles === 0) return false;

    // RATIO DE ÉXITO:
    // Sharpen tendrá ~0.5. Crop tendrá 1.0.
    // Exigimos 0.7 para filtrar el azar.
    return (aciertos / totalVisibles) >= 0.7;
}
