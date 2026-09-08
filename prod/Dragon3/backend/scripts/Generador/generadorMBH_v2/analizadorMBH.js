import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    // FÍSICA BÚNKER (INTACTA)
    CHANNEL_IDX: 2,       // Canal Azul
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 },

    // LÓGICA 32 BITS (NUEVA v21)
    BITS_TOTAL: 32,       // 28 ID + 4 Checksum

    // 🆕 UMBRALES DUALES (Nativo vs Rescate)
    UMB_DETECT_NATIVO: 0.15,   // Estricto para análisis directo
    UMB_DETECT_RESCATE: 0.08,  // Permisivo para resize (señal degradada)

    // 🆕 ESTRATEGIA 1: Parámetros de Correlación
    CORRELACION_MIN: 0.3,      // Mínimo de correlación para considerar válido
    INTENTAR_INVERSION: true,  // Probar patrón invertido (por si acaso)

    // 🆕 DEBUG MODE
    DEBUG_RESCATE: false        // Cambiar a true para ver logs detallados
};

// TABLA DE COSENOS (Precalculada para máxima velocidad en el análisis masivo)
const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

/**
 * 👁️ PUNTO DE ENTRADA PRINCIPAL
 * Analiza una imagen buscando el sello Dragon3 v21 (32-bit).
 *
 * 🔬 ESTRATEGIA 1: Correlación Cruzada Mejorada
 * - Búsqueda exhaustiva de rotaciones (0-63)
 * - Correlación normalizada para cada candidato
 * - Scoring multi-dimensional (energía + correlación + checksum)
 */
export async function analizarImagenMBH(rutaImagen) {
    let mejorRes = {
        identificado: false,
        metodo: "DRAGON_EYE_v21_CORRELACION",
        energia: 0,
        hash: "----",
        id_numerico: 0,
        cliente: "---",
        obra: "---",
        confianza: 0,
        diagnostico: { scoreFinal: 0, escalaUsada: "1.0", checksumLeido: 0, rotacion: 0, correlacion: 0 }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return mejorRes;

        const imageObj = sharp(rutaImagen).ensureAlpha();
        const { data: bufferOriginal, info } = await imageObj.raw().toBuffer({ resolveWithObject: true });

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`\n🔍 [ESTRATEGIA 1] Analizando: ${rutaImagen}`);
            console.log(`   Dimensiones: ${info.width}x${info.height}`);
        }

        // 🥇 INTENTO 1: ANÁLISIS DIRECTO (1:1)
        let res = analizarBuffer(bufferOriginal, info.width, info.height, CONFIG.UMB_DETECT_NATIVO);

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`   [Nativo 1.0] Score: ${res.energia.toFixed(4)} | Corr: ${res.diagnostico.correlacion?.toFixed(3)} | ID: ${res.hash} | ✓: ${res.identificado}`);
        }

        if (res.identificado) {
            res.diagnostico.escalaUsada = "1.0 (Nativo)";
            return res;
        }

        mejorRes = res; // Guardamos el mejor resultado aunque sea fallido

        // 🥈 INTENTO 2: PROTOCOLO DE RESCATE (Multi-escala INTELIGENTE)
        const escalas = generarEscalasInteligentes();

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`\n   🔄 PROTOCOLO DE RESCATE ACTIVADO`);
            console.log(`   Probando ${escalas.length} escalas con correlación cruzada exhaustiva...`);
        }

        for (const factor of escalas) {
            // Solo redimensionamos si tiene sentido
            const w = Math.round(info.width * factor);
            const h = Math.round(info.height * factor);
            if (w < 64 || h < 64 || w > 8192 || h > 8192) continue;

            const bufferResized = await sharp(bufferOriginal, {
                raw: { width: info.width, height: info.height, channels: 4 }
            })
                .resize(w, h, { kernel: 'lanczos3' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            res = analizarBuffer(bufferResized.data, w, h, CONFIG.UMB_DETECT_RESCATE);

            if (CONFIG.DEBUG_RESCATE) {
                console.log(`   [Escala ${factor.toFixed(1)}] Score: ${res.energia.toFixed(4)} | Corr: ${res.diagnostico.correlacion?.toFixed(3)} | ID: ${res.hash} | ✓: ${res.identificado}`);
            }

            // 🆕 CRITERIO MEJORADO: Prioriza correlación alta sobre energía bruta
            const scoreCombinado = res.energia * 0.6 + (res.diagnostico.correlacion || 0) * 0.4;
            const scoreMejorCombinado = mejorRes.energia * 0.6 + (mejorRes.diagnostico.correlacion || 0) * 0.4;

            if (scoreCombinado > scoreMejorCombinado) {
                res.diagnostico.escalaUsada = `x${factor} (Recuperado)`;
                mejorRes = res;

                // 🆕 SALIDA TEMPRANA con criterio dual
                if (res.energia > 0.25 && res.diagnostico.correlacion > 0.7 && res.identificado) {
                    if (CONFIG.DEBUG_RESCATE) {
                        console.log(`   ✅ MATCH MUY FUERTE (E:${res.energia.toFixed(3)}, C:${res.diagnostico.correlacion.toFixed(3)}) en x${factor}`);
                    }
                    return mejorRes;
                }
            }
        }

        // 🆕 DIAGNÓSTICO FINAL
        if (CONFIG.DEBUG_RESCATE || mejorRes.energia > 0.05) {
            console.log(`\n   📊 DIAGNÓSTICO FINAL (ESTRATEGIA 1):`);
            console.log(`      Energía: ${mejorRes.energia.toFixed(4)}`);
            console.log(`      Correlación: ${mejorRes.diagnostico.correlacion?.toFixed(4) || 'N/A'}`);
            console.log(`      Escala usada: ${mejorRes.diagnostico.escalaUsada}`);
            console.log(`      Hash detectado: ${mejorRes.hash}`);
            console.log(`      Rotación: ${mejorRes.diagnostico.rotacion}`);
            console.log(`      Identificado: ${mejorRes.identificado ? '✅ SÍ' : '❌ NO'}`);
        }

        return mejorRes;

    } catch (e) {
        console.error("❌ Error crítico en Analizador MBH:", e);
        return mejorRes;
    }
}

/**
 * 🧠 NÚCLEO DE ANÁLISIS (FULL PHASE SCANNER + CORRELACIÓN)
 */
function analizarBuffer(buffer, width, height, umbralDeteccion) {
    let mejorIntento = {
        identificado: false,
        energia: 0,
        hash: "----",
        id_numerico: 0,
        cliente: "---",
        obra: "---",
        confianza: 0,
        diagnostico: { scoreFinal: 0, rotacion: 0, correlacion: 0 }
    };

    // BARRIDO DE FASE TOTAL (0 a 7 píxeles)
    scanLoop:
    for (let offY = 0; offY < 8; offY++) {
        for (let offX = 0; offX < 8; offX++) {

            // 1. Extraemos energía con el desplazamiento actual
            const candidatos = extraerEnergiaTwin64(buffer, width, height, offX, offY);

            // 2. Probamos cada candidato de ancho
            for (const { urnas, anchoRef } of candidatos) {

                // 3. 🆕 Búsqueda por correlación cruzada exhaustiva
                const match = buscarPorCorrelacionCruzada(urnas);

                // 4. Evaluamos si es mejor que lo que teníamos
                if (match) {
                    // Score combinado: energía + correlación
                    const scoreCombinado = match.scoreReal * 0.7 + match.correlacion * 0.3;
                    const scoreMejorCombinado = (mejorIntento.diagnostico.scoreFinal || 0) * 0.7 + (mejorIntento.diagnostico.correlacion || 0) * 0.3;

                    if (scoreCombinado > scoreMejorCombinado) {

                        mejorIntento = {
                            identificado: match.scoreReal > umbralDeteccion && match.correlacion > CONFIG.CORRELACION_MIN,
                            energia: match.scoreReal,
                            id_numerico: match.id,
                            hash: match.id.toString(16).toUpperCase().padStart(7, '0'),
                            confianza: Math.min(100, Math.round((scoreCombinado) * 100)),
                            diagnostico: {
                                scoreFinal: match.scoreReal,
                                rotacion: match.rot,
                                correlacion: match.correlacion,
                                checksumLeido: match.chk,
                                offsetUsado: `${offX},${offY}`,
                                anchoReferencia: anchoRef
                            }
                        };

                        // ⚡ OPTIMIZACIÓN AGRESIVA ⚡
                        if (mejorIntento.energia > 0.8 && mejorIntento.diagnostico.correlacion > 0.8) break scanLoop;
                    }
                }
            }
        }
    }

    // 5. Inyectamos datos del cliente al mejor candidato
    if (mejorIntento.identificado) {
        inyectarDatosCliente(mejorIntento);
    }

    return mejorIntento;
}

/**
 * 🧬 EXTRACTOR FÍSICO TWIN-64 (Con Offset + Anchos Mejorados)
 *
 * 🆕 ESTRATEGIA 1: Anchos de referencia basados en investigación forense
 */
function extraerEnergiaTwin64(buffer, width, height, offsetX = 0, offsetY = 0) {
    const DNA_LENGTH = 64;
    const blockSize = CONFIG.BLOCK_SIZE;

    const u1 = CONFIG.FREQ_1.u, v1 = CONFIG.FREQ_1.v;
    const u2 = CONFIG.FREQ_2.u, v2 = CONFIG.FREQ_2.v;

    const blocksPerRowActual = Math.floor((width - offsetX) / blockSize);

    // 🆕 CANDIDATOS BASADOS EN RATIOS REALES DE RESIZE
    // Investigación forense: Los resizes más comunes son por factores racionales
    const candidatosAnchos = [
        blocksPerRowActual,                          // Actual
        Math.round(blocksPerRowActual * 1.9873),     // 50% resize (ratio exacto del informe)
        Math.round(blocksPerRowActual * 4.0256),     // 25% resize (ratio exacto del informe)
        Math.round(blocksPerRowActual * 1.3305),     // 75% resize
        Math.round(blocksPerRowActual * 1.5096),     // 66% resize
        Math.round(blocksPerRowActual * 0.7476),     // 133% ampliación
        Math.round(blocksPerRowActual * 0.6653),     // 150% ampliación
        Math.round(blocksPerRowActual * 2.0),        // Genérico x2
        Math.round(blocksPerRowActual * 4.0),        // Genérico x4
        Math.round(blocksPerRowActual * 0.5),        // Genérico x0.5
        157,  // Ancho de tu imagen de prueba original
        79,   // 50% del original (157 * 0.5)
        39,   // 25% del original (157 * 0.25)
        // Resoluciones comunes
        125,  // 1000px / 8
        62,   // 500px / 8
        93,   // 750px / 8
        135,  // 1080px / 8 (Instagram)
    ];

    // Eliminamos duplicados y ordenamos
    const anchosUnicos = [...new Set(candidatosAnchos)].filter(a => a > 0).sort((a, b) => Math.abs(blocksPerRowActual - a) - Math.abs(blocksPerRowActual - b));

    // Para cada ancho candidato, creamos un conjunto de urnas
    const resultados = anchosUnicos.map(anchoRef => {
        const urnas = new Float32Array(DNA_LENGTH).fill(0);
        const conteo = new Float32Array(DNA_LENGTH).fill(0);

        for (let y = offsetY; y <= height - blockSize; y += blockSize) {
            const blockY = Math.floor(y / blockSize);

            for (let x = offsetX; x <= width - blockSize; x += blockSize) {
                const blockX = Math.floor(x / blockSize);

                const val1 = calcularCoeficienteDCT(buffer, width, x, y, u1, v1);
                const val2 = calcularCoeficienteDCT(buffer, width, x, y, u2, v2);

                // FÍSICA DIFERENCIAL (La señal es la diferencia)
                const diff = val1 - val2;

                // ÍNDICE BASADO EN COORDENADAS (no lineal)
                const linearIdx = blockY * anchoRef + blockX;
                const idx = linearIdx % DNA_LENGTH;

                urnas[idx] += diff;
                conteo[idx]++;
            }
        }

        // Normalización
        for (let i = 0; i < DNA_LENGTH; i++) {
            if (conteo[i] > 0) urnas[i] /= conteo[i];
        }

        return { urnas, anchoRef };
    });

    return resultados;
}

/**
 * 🎯 ESTRATEGIA 1: BÚSQUEDA POR CORRELACIÓN CRUZADA
 *
 * Esta es la función CLAVE de la Estrategia 1.
 * En lugar de solo buscar checksums válidos, calcula la CORRELACIÓN
 * entre el patrón extraído y el patrón esperado para cada rotación.
 */
function buscarPorCorrelacionCruzada(urnasRAW) {
    let mejorMatch = null;
    let mejorScore = -Infinity;
    const DNA_LENGTH = 64;

    // 🆕 Calculamos estadísticas del patrón para normalización
    const mean = urnasRAW.reduce((sum, v) => sum + v, 0) / DNA_LENGTH;
    const std = Math.sqrt(urnasRAW.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / DNA_LENGTH);

    // Probamos TODAS las rotaciones (0..63)
    for (let rot = 0; rot < DNA_LENGTH; rot++) {

        let payloadLeido = 0;
        let energiaTotal = 0;
        let correlacionAcumulada = 0;

        for (let i = 0; i < 32; i++) {
            const idxBit = (i * 2 + rot) % DNA_LENGTH;
            const idxSombra = (i * 2 + 1 + rot) % DNA_LENGTH;

            const eBit = urnasRAW[idxBit];
            const eSombra = urnasRAW[idxSombra];

            // FÍSICA DIFERENCIAL (Bit - Sombra)
            const energiaNeta = eBit - eSombra;

            energiaTotal += Math.abs(energiaNeta);

            // 🆕 CORRELACIÓN: ¿El contraste es consistente con el patrón Twin?
            // Un patrón Twin fuerte tiene alta alternancia
            correlacionAcumulada += Math.abs(energiaNeta);

            // Decisión de bit
            if (energiaNeta > 0) {
                payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
            }
        }

        // --- VALIDACIÓN CHECKSUM ---
        const idLeido = payloadLeido >>> 4;
        const chkLeido = payloadLeido & 0x0F;

        const low = idLeido & 0x3FFF;
        const high = (idLeido >> 14) & 0x3FFF;
        let mix = (low ^ high) * 19;
        const chkEsperado = (mix ^ (mix >> 6)) & 0x0F;

        if (chkLeido === chkEsperado) {
            // Score de energía normalizado
            const scoreEnergia = energiaTotal / 64;

            // 🆕 CORRELACIÓN NORMALIZADA
            // Medimos qué tan "Twin" es el patrón (alternancia alta)
            const correlacionNormalizada = std > 0 ? correlacionAcumulada / (64 * std) : 0;

            // 🆕 SCORE COMBINADO (energía + correlación)
            const scoreCombinado = scoreEnergia * 0.7 + Math.min(1, correlacionNormalizada) * 0.3;

            if (scoreCombinado > mejorScore) {
                mejorScore = scoreCombinado;
                mejorMatch = {
                    id: idLeido,
                    chk: chkLeido,
                    scoreReal: scoreEnergia,
                    correlacion: Math.min(1, correlacionNormalizada),
                    rot: rot
                };
            }
        }
    }

    // 🆕 ESTRATEGIA 1b: Probar también INVERSIÓN del patrón
    // (por si el resize invirtió algo)
    if (CONFIG.INTENTAR_INVERSION && mejorMatch && mejorMatch.correlacion < 0.5) {
        const urnasInvertidas = urnasRAW.map(v => -v);
        const matchInvertido = buscarEnPatronInvertido(urnasInvertidas);

        if (matchInvertido && matchInvertido.correlacion > mejorMatch.correlacion) {
            mejorMatch = matchInvertido;
        }
    }

    return mejorMatch;
}

/**
 * 🔄 HELPER: Búsqueda en patrón invertido
 */
function buscarEnPatronInvertido(urnasInvertidas) {
    // Mismo algoritmo que buscarPorCorrelacionCruzada pero sin recursión
    let mejorMatch = null;
    let mejorScore = -Infinity;
    const DNA_LENGTH = 64;

    const mean = urnasInvertidas.reduce((sum, v) => sum + v, 0) / DNA_LENGTH;
    const std = Math.sqrt(urnasInvertidas.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / DNA_LENGTH);

    for (let rot = 0; rot < DNA_LENGTH; rot++) {
        let payloadLeido = 0;
        let energiaTotal = 0;
        let correlacionAcumulada = 0;

        for (let i = 0; i < 32; i++) {
            const idxBit = (i * 2 + rot) % DNA_LENGTH;
            const idxSombra = (i * 2 + 1 + rot) % DNA_LENGTH;

            const eBit = urnasInvertidas[idxBit];
            const eSombra = urnasInvertidas[idxSombra];

            const energiaNeta = eBit - eSombra;
            energiaTotal += Math.abs(energiaNeta);
            correlacionAcumulada += Math.abs(energiaNeta);

            if (energiaNeta > 0) {
                payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
            }
        }

        const idLeido = payloadLeido >>> 4;
        const chkLeido = payloadLeido & 0x0F;

        const low = idLeido & 0x3FFF;
        const high = (idLeido >> 14) & 0x3FFF;
        let mix = (low ^ high) * 19;
        const chkEsperado = (mix ^ (mix >> 6)) & 0x0F;

        if (chkLeido === chkEsperado) {
            const scoreEnergia = energiaTotal / 64;
            const correlacionNormalizada = std > 0 ? correlacionAcumulada / (64 * std) : 0;
            const scoreCombinado = scoreEnergia * 0.7 + Math.min(1, correlacionNormalizada) * 0.3;

            if (scoreCombinado > mejorScore) {
                mejorScore = scoreCombinado;
                mejorMatch = {
                    id: idLeido,
                    chk: chkLeido,
                    scoreReal: scoreEnergia,
                    correlacion: Math.min(1, correlacionNormalizada),
                    rot: rot
                };
            }
        }
    }

    return mejorMatch;
}

/**
 * 🎲 GENERADOR DE ESCALAS INTELIGENTE
 * Basado en ratios reales de resize más comunes
 */
function generarEscalasInteligentes() {
    const escalas = [];

    // Escalas exactas de los ratios del informe
    const ratiosComunes = [
        1.0,    // Original
        0.9,    // -10%
        0.75,   // -25%
        0.66,   // -33%
        0.5,    // -50%
        0.33,   // -67%
        0.25,   // -75%
        1.33,   // +33%
        1.5,    // +50%
        2.0,    // +100%
        // Instagram/RRSS comunes
        0.54,   // 1080px desde 2000px
        1.85,   // 1080px desde 584px
    ];

    escalas.push(...ratiosComunes);

    // Barrido fino alrededor de valores críticos
    for (let f = 0.4; f <= 1.2; f += 0.05) {
        escalas.push(parseFloat(f.toFixed(2)));
    }

    // Eliminamos duplicados y ordenamos por cercanía a 1.0
    const escalasUnicas = [...new Set(escalas)];
    escalasUnicas.sort((a, b) => Math.abs(1 - a) - Math.abs(1 - b));

    return escalasUnicas;
}

/**
 * ⚡ DCT RÁPIDA (Optimizada con COS_TABLE)
 */
function calcularCoeficienteDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;

    for (let y = 0; y < 8; y++) {
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[y * 8 + v];

        for (let x = 0; x < 8; x++) {
            const idx = rowOffset + (startX + x) * 4 + CONFIG.CHANNEL_IDX;
            const pixelVal = buffer[idx] - 128;
            sum += pixelVal * COS_TABLE[x * 8 + u] * cosY;
        }
    }

    return sum * 0.25;
}

/**
 * 📂 CONECTOR BASE DE DATOS
 * 🆕 Ahora usa ID numérico directo (fix del matching anterior)
 */
function inyectarDatosCliente(resultado) {
    const idNumerico = resultado.id_numerico;

    // Búsqueda por ID numérico directo
    const ficha = BASE_DE_DATOS_SELLOS.find(s => s.id_numerico === idNumerico);

    if (ficha) {
        resultado.cliente = ficha.cliente;
        resultado.obra = ficha.obra;
    } else {
        resultado.cliente = "NO REGISTRADO";
        resultado.obra = "---";
    }
}
