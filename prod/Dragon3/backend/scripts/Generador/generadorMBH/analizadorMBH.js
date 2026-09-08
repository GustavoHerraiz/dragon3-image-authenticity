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
 * Soporta análisis nativo y recuperación por redimensionado (Rescate).
 *
 * 🆕 MEJORAS v2.0:
 * - Barrido inteligente de escalas (0.3 a 4.0)
 * - Guarda siempre el mejor score (no solo identificados)
 * - Umbrales adaptativos según método
 * - Debug logging completo
 */
export async function analizarImagenMBH(rutaImagen) {
    let mejorRes = {
        identificado: false,
        metodo: "DRAGON_EYE_v21_32BIT",
        energia: 0,
        hash: "----",
        id_numerico: 0,
        cliente: "---",
        obra: "---",
        confianza: 0,
        diagnostico: { scoreFinal: 0, escalaUsada: "1.0", checksumLeido: 0, rotacion: 0 }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return mejorRes;

        const imageObj = sharp(rutaImagen).ensureAlpha();
        const { data: bufferOriginal, info } = await imageObj.raw().toBuffer({ resolveWithObject: true });

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`\n🔍 Analizando: ${rutaImagen}`);
            console.log(`   Dimensiones: ${info.width}x${info.height}`);
        }

        // 🥇 INTENTO 1: ANÁLISIS DIRECTO (1:1)
        let res = analizarBuffer(bufferOriginal, info.width, info.height, CONFIG.UMB_DETECT_NATIVO);

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`   [Nativo 1.0] Score: ${res.energia.toFixed(4)} | ID: ${res.hash} | ✓: ${res.identificado}`);
        }

        if (res.identificado) {
            res.diagnostico.escalaUsada = "1.0 (Nativo)";
            return res;
        }

        mejorRes = res; // Guardamos el mejor resultado aunque sea fallido

        // 🥈 INTENTO 2: PROTOCOLO DE RESCATE (Multi-escala INTELIGENTE)
        // 🆕 Barrido exhaustivo de escalas con paso fino
        const escalas = [];
        for (let f = 0.3; f <= 4.0; f += 0.1) {
            escalas.push(parseFloat(f.toFixed(1)));
        }

        // 🆕 Ordenamos por cercanía a 1.0 (escalas más probables primero)
        escalas.sort((a, b) => Math.abs(1 - a) - Math.abs(1 - b));

        if (CONFIG.DEBUG_RESCATE) {
            console.log(`\n   🔄 PROTOCOLO DE RESCATE ACTIVADO`);
            console.log(`   Probando ${escalas.length} escalas...`);
        }

        for (const factor of escalas) {
            // Solo redimensionamos si tiene sentido (evitar imágenes minúsculas o gigantes)
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
                console.log(`   [Escala ${factor.toFixed(1)}] Score: ${res.energia.toFixed(4)} | ID: ${res.hash} | ✓: ${res.identificado}`);
            }

            // 🆕 ACTUALIZA SIEMPRE SI ES MEJOR (no solo si identificado)
            if (res.energia > mejorRes.energia) {
                res.diagnostico.escalaUsada = `x${factor} (Recuperado)`;
                mejorRes = res;

                // 🆕 SALIDA TEMPRANA solo si muy confiable
                if (res.energia > 0.25 && res.identificado) {
                    if (CONFIG.DEBUG_RESCATE) {
                        console.log(`   ✅ MATCH FUERTE en escala x${factor} - Deteniendo búsqueda`);
                    }
                    return mejorRes;
                }
            }
        }

        // 🆕 DIAGNÓSTICO FINAL
        if (CONFIG.DEBUG_RESCATE || mejorRes.energia > 0.05) {
            console.log(`\n   📊 DIAGNÓSTICO FINAL:`);
            console.log(`      Mejor score: ${mejorRes.energia.toFixed(4)}`);
            console.log(`      Escala usada: ${mejorRes.diagnostico.escalaUsada}`);
            console.log(`      Hash detectado: ${mejorRes.hash}`);
            console.log(`      Identificado: ${mejorRes.identificado ? '✅ SÍ' : '❌ NO'}`);
            console.log(`      Umbral requerido: ${mejorRes.diagnostico.escalaUsada.includes('Nativo') ? CONFIG.UMB_DETECT_NATIVO : CONFIG.UMB_DETECT_RESCATE}`);
        }

        return mejorRes;

    } catch (e) {
        console.error("❌ Error crítico en Analizador MBH:", e);
        return mejorRes;
    }
}

/**
 * 🧠 NÚCLEO DE ANÁLISIS (FULL PHASE SCANNER)
 * Prueba CADA alineación posible (0..7 en X e Y) para encontrar la rejilla perdida.
 * Es más lento, pero infalible contra el reescalado.
 *
 * 🆕 Ahora recibe umbral como parámetro (dual threshold)
 * 🆕 Prueba múltiples anchos de referencia para compensar resize
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
        diagnostico: { scoreFinal: 0, rotacion: 0 }
    };

    // BARRIDO DE FASE TOTAL (0 a 7 píxeles)
    // Probamos todas las combinaciones posibles de desplazamiento de la rejilla 8x8.
    scanLoop:
    for (let offY = 0; offY < 8; offY++) {
        for (let offX = 0; offX < 8; offX++) {

            // 1. Extraemos energía con el desplazamiento actual
            // 🆕 Ahora retorna MÚLTIPLES candidatos (diferentes anchos de referencia)
            const candidatos = extraerEnergiaTwin64(buffer, width, height, offX, offY);

            // 2. Probamos cada candidato de ancho
            for (const { urnas, anchoRef } of candidatos) {

                // 3. Buscamos el patrón en este candidato
                const match = buscarPatronMentalistaTwin(urnas);

                // 4. Evaluamos si es mejor que lo que teníamos
                if (match) {
                    if (match.scoreReal > (mejorIntento.diagnostico.scoreFinal || 0)) {

                        mejorIntento = {
                            identificado: match.scoreReal > umbralDeteccion,
                            energia: match.scoreReal,
                            id_numerico: match.id,
                            hash: match.id.toString(16).toUpperCase().padStart(7, '0'),
                            confianza: Math.min(100, Math.round(match.scoreReal * 100)),
                            diagnostico: {
                                scoreFinal: match.scoreReal,
                                rotacion: match.rot,
                                checksumLeido: match.chk,
                                offsetUsado: `${offX},${offY}`,
                                anchoReferencia: anchoRef  // 🆕 Guardamos el ancho que funcionó
                            }
                        };

                        // ⚡ OPTIMIZACIÓN AGRESIVA ⚡
                        // Si encontramos una señal fuerte y clara (>0.8), paramos.
                        if (mejorIntento.energia > 0.8) break scanLoop;
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
 * 🧬 EXTRACTOR FÍSICO TWIN-64 (Con Offset - VERSIÓN RESIZE-ROBUST)
 *
 * 🆕 CAMBIO CRÍTICO: Usa coordenadas absolutas de bloque en vez de índice lineal.
 * Esto hace que el patrón DNA sea independiente del ancho de la imagen.
 *
 * PROBLEMA ANTERIOR:
 * - Imagen 1000x1000: 125 bloques/fila → después de fila 1: idx=125, DNA[125%64=61]
 * - Resize 750x750:   93 bloques/fila  → después de fila 1: idx=93,  DNA[93%64=29]
 * ¡Desincronización total!
 *
 * SOLUCIÓN:
 * - Calculamos blockX = x / 8, blockY = y / 8 (coordenadas de bloque)
 * - DNA_index = (blockY * blockX_original + blockX) % 64
 * - Probamos múltiples anchos de referencia para encontrar el correcto
 */
function extraerEnergiaTwin64(buffer, width, height, offsetX = 0, offsetY = 0) {
    const DNA_LENGTH = 64;
    const blockSize = CONFIG.BLOCK_SIZE;

    const u1 = CONFIG.FREQ_1.u, v1 = CONFIG.FREQ_1.v;
    const u2 = CONFIG.FREQ_2.u, v2 = CONFIG.FREQ_2.v;

    // 🆕 MULTI-FASE: Probamos diferentes "anchos de referencia"
    // Esto compensa el cambio de geometría causado por el resize
    const blocksPerRowActual = Math.floor((width - offsetX) / blockSize);

    // Candidatos: ancho actual ± variaciones comunes
    const candidatosAnchos = [
        blocksPerRowActual,           // Ancho actual
        blocksPerRowActual + 1,       // +1 (redondeo)
        blocksPerRowActual - 1,       // -1 (redondeo)
        Math.round(blocksPerRowActual * 1.33),  // Si fue resize 75%
        Math.round(blocksPerRowActual * 2.0),   // Si fue resize 50%
        Math.round(blocksPerRowActual * 0.75),  // Si fue ampliación 133%
        Math.round(blocksPerRowActual * 1.5),   // Si fue resize 66%
        125,  // Referencia común (1000px / 8)
        62,   // Referencia común (500px / 8)
        93    // Referencia común (750px / 8)
    ];

    // Eliminamos duplicados
    const anchosUnicos = [...new Set(candidatosAnchos)];

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

                // 🆕 ÍNDICE BASADO EN COORDENADAS (no lineal)
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

    // 🆕 Retornamos el conjunto completo de candidatos
    // buscarPatronMentalistaTwin probará todos
    return resultados;
}

/**
 * 🧠 DECODIFICADOR DIFERENCIAL (Twin-64)
 * Reconstruye los 32 bits comparando Bit vs Sombra.
 */
function buscarPatronMentalistaTwin(urnasRAW) {
    let mejorMatch = null;
    let mejorScore = -Infinity;
    const DNA_LENGTH = 64; // Twin-64 standard

    // Probamos rotaciones para sincronizar (0..63)
    for (let rot = 0; rot < DNA_LENGTH; rot++) {

        let payloadLeido = 0;
        let energiaTotal = 0;

        for (let i = 0; i < 32; i++) {
            // El bit 'i' está en la posición '2*i' y su sombra en '2*i + 1'
            // Aplicamos la rotación global 'rot'
            const idxBit = (i * 2 + rot) % DNA_LENGTH;
            const idxSombra = (i * 2 + 1 + rot) % DNA_LENGTH;

            const eBit = urnasRAW[idxBit];
            const eSombra = urnasRAW[idxSombra];

            // LA CLAVE: FÍSICA DIFERENCIAL (Bit - Sombra)
            // Esto cancela el ruido del JPEG y del Resize
            const energiaNeta = eBit - eSombra;

            energiaTotal += Math.abs(energiaNeta);

            // Decisión de bit (Si neta > 0 es un 1, si < 0 es un 0)
            if (energiaNeta > 0) {
                payloadLeido = (payloadLeido | (1 << (31 - i))) >>> 0;
            }
        }

        // --- VALIDACIÓN MATEMÁTICA (Mentalist v21 Checksum) ---
        const idLeido = payloadLeido >>> 4;      // 28 bits ID
        const chkLeido = payloadLeido & 0x0F;    // 4 bits Checksum

        const low = idLeido & 0x3FFF;
        const high = (idLeido >> 14) & 0x3FFF;
        let mix = (low ^ high) * 19;
        const chkEsperado = (mix ^ (mix >> 6)) & 0x0F;

        if (chkLeido === chkEsperado) {
            // Normalizamos score (energía promedio por paso)
            const score = energiaTotal / 64;

            if (score > mejorScore) {
                mejorScore = score;
                mejorMatch = {
                    id: idLeido,
                    chk: chkLeido,
                    scoreReal: score,
                    rot: rot
                };
            }
        }
    }

    return mejorMatch;
}

/**
 * ⚡ DCT RÁPIDA (Optimizada con COS_TABLE)
 * Calcula un solo coeficiente espectral de un bloque 8x8.
 */
function calcularCoeficienteDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;

    for (let y = 0; y < 8; y++) {
        // Puntero a la fila
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[y * 8 + v];

        for (let x = 0; x < 8; x++) {
            const idx = rowOffset + (startX + x) * 4 + CONFIG.CHANNEL_IDX;
            // Restamos 128 (Centrado en cero)
            const pixelVal = buffer[idx] - 128;

            sum += pixelVal * COS_TABLE[x * 8 + u] * cosY;
        }
    }

    // Factor de normalización DCT
    return sum * 0.25;
}

/**
 * 📂 CONECTOR BASE DE DATOS
 */
function inyectarDatosCliente(resultado) {
    const idHex = resultado.hash; // Ej: "000D760"

    // Buscamos coincidencia parcial (Suffix)
    const ficha = BASE_DE_DATOS_SELLOS.find(s =>
        idHex.endsWith(s.hash_suffix.toUpperCase()) ||
        s.hash_suffix.toUpperCase().endsWith(idHex)
    );

    if (ficha) {
        resultado.cliente = ficha.cliente;
        resultado.obra = ficha.obra;
    } else {
        resultado.cliente = "NO REGISTRADO";
        resultado.obra = "---";
    }
}
