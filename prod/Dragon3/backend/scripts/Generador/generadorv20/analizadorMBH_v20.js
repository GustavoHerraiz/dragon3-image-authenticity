import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

// 1. CONFIGURACIÓN DE MÁXIMA RESISTENCIA
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    UMBRAL_RESONANCIA: 28,      // Sensibilidad para captar señal rotada (suavizada)
    UMBRAL_ADN: 3.2,            // Energía mínima para bloques tras la compresión
    MAX_BALIZAS: 300
};

function verificarIdentidadADN(dct) {
    const firma_objetivo = "1101011101100000"; // d760
    const pares = [
        [1,2,2,1], [1,3,3,1], [2,3,3,2], [4,1,1,4], [4,2,2,4], [3,3,1,1], [0,4,4,0], [5,1,1,5],
        [1,4,4,1], [2,4,4,2], [3,4,4,3], [0,5,5,0], [1,5,5,1], [2,5,5,2], [3,5,5,3], [4,5,5,4]
    ];
    let bits = "";
    for (const [v1, u1, v2, u2] of pares) {
        bits += (Math.abs(dct[v1][u1]) > Math.abs(dct[v2][u2])) ? "1" : "0";
    }
    // EXIGENCIA TOTAL: 16/16. El ruido nunca acertará esto en serie.
    return bits === firma_objetivo;
}

// --- FUNCIONES DE SOPORTE INTEGRADAS ---

// --- SOPORTE: LUPA DE FASE LOCAL (Sincronización Crítica) ---
function buscarADNLocal_LUPA(buffer, width, x, y) {
    let mejorRes = { encontrado: false, votos: 0, offX: 0, offY: 0 };
    // Barrido de fase 8x8 para encontrar el centro exacto del bloque MBH
    for (let offY = 0; offY < 8; offY++) {
        for (let offX = 0; offX < 8; offX++) {
            const bloque = extraerBloqueCanal(buffer, width, x + offX, y + offY, 2);
            const dct = dct8x8(bloque);
            const diff = Math.abs(dct[1][1] - dct[2][2]);

            // Validación estricta 16/16 bits (ADN d760)
            if (diff > 1.5 && verificarIdentidadADN(dct)) {
                if (diff > mejorRes.votos) {
                    mejorRes = { encontrado: true, votos: diff, offX, offY };
                }
            }
        }
    }
    return mejorRes;
}

// --- SOPORTE: GENERADOR DE EVIDENCIA VISUAL ---
async function guardarMapaHits(balizas, width, height, nombreArchivo) {
    const canvas = Buffer.alloc(width * height, 0);
    for (let b of balizas) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const px = Math.floor(b.realX + dx);
                const py = Math.floor(b.realY + dy);
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    canvas[py * width + px] = 255;
                }
            }
        }
    }
    await sharp(canvas, { raw: { width, height, channels: 1 } }).png().toFile(nombreArchivo);
    console.log(`🖼️  Evidencia visual guardada: ${nombreArchivo}`);
}

// --- FUNCIÓN PRINCIPAL ANALIZADORA V20 GOLD ---
export async function analizadorImagenMBH_v20(ruta) {
    const res = new RespuestaStandard("analizadorMBH_v20", "Dragon3 V20 DNA-Shield", "20.20.Gold.Final");

    try {
        const { data: buffer, info } = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = info;
        const centroX = width / 2;
        const centroY = height / 2;

        const CONFIG_INTERNAL = {
            UMBRAL_RESONANCIA: 60,  // Radar inicial estricto
            UMBRAL_ADN: 7.0,        // Filtro de pureza para Motor 1
            MAX_BALIZAS: 150        // Capacidad de la constelación
        };

        console.log(`[V20 GOLD] 🕵️ Iniciando Peritaje Forense (ADN 16-bit)...`);
        let balizasEncontradas = [];
        let autorIdentificado = null;
        let ultimoADN = null;

        const fases = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 2 }, { x: 6, y: 6 }];

        // --- MOTOR 1: ESCANEO EN ESPIRAL (PASO 7) ---
        for (let fase of fases) {
            let x = 0, y = 0, dx = 0, dy = -1;
            for (let i = 0; i < 40000; i++) {
                const actualX = Math.floor(centroX + x * 7 + fase.x);
                const actualY = Math.floor(centroY + y * 7 + fase.y);

                if (actualX >= 0 && actualX <= width - 8 && actualY >= 0 && actualY <= height - 8) {
                    const resonancia = detectarEnergiaPunto(buffer, width, actualX, actualY);

                    if (resonancia > CONFIG_INTERNAL.UMBRAL_RESONANCIA) {
                        for (let offY = 0; offY < 8; offY++) {
                            for (let offX = 0; offX < 8; offX++) {
                                const bloque = extraerBloqueCanal(buffer, width, actualX + offX, actualY + offY, 2);
                                const dct = dct8x8(bloque);
                                const diff = Math.abs(dct[1][1] - dct[2][2]);

                                if (diff > CONFIG_INTERNAL.UMBRAL_ADN && verificarIdentidadADN(dct)) {
                                    const pReal = { realX: actualX + offX, realY: actualY + offY };
                                    if (!balizasEncontradas.some(b => Math.abs(b.realX - pReal.realX) < 15 && Math.abs(b.realY - pReal.realY) < 15)) {
                                        balizasEncontradas.push(pReal);
                                        ultimoADN = "d760";
                                        if (!autorIdentificado) {
                                            autorIdentificado = { cliente: "Quico Melero" };
                                        }
                                    }
                                }
                            }
                            if (balizasEncontradas.length >= CONFIG_INTERNAL.MAX_BALIZAS) break;
                        }
                    }
                }
                if (balizasEncontradas.length >= CONFIG_INTERNAL.MAX_BALIZAS) break;
                if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) { let t = dx; dx = -dy; dy = t; }
                x += dx; y += dy;
            }
            if (balizasEncontradas.length >= CONFIG_INTERNAL.MAX_BALIZAS) break;
        }

       // --- MOTOR 2: SINTONIZADOR POR RESONANCIA Y MÁXIMA COSECHA ---
if (balizasEncontradas.length >= 3) {
    // 1. Calculamos el ángulo de partida (brújula inicial)
    let anguloDetectado = calcularGiroEstructural(balizasEncontradas, width, height);

    // 2. Creamos el abanico dinámico basado en tu idea de redondeo a 5°
    let angBase5 = Math.round(anguloDetectado / 5) * 5;
    let abanico = [...new Set([anguloDetectado, angBase5, angBase5 - 5, angBase5 + 5])];

    // MEJORA CRÍTICA: Si hay poca fiabilidad (<20 hits), probamos ángulos estándar
    // Esto evita que el sistema se "emborrache" con una detección inicial desviada.
    if (balizasEncontradas.length < 20) {
        [0, 15, 30, 45].forEach(a => abanico.push(a));
        abanico = [...new Set(abanico)]; // Limpiar duplicados de nuevo
    }

    let mejorCosecha = { angulo: anguloDetectado, puntosNuevos: [] };

    console.log(`🔍 SINTONIZANDO: Probando resonancia en [${abanico.map(a => a.toFixed(1)).join('°, ')}°]...`);

    // 3. Evaluamos cada ángulo del abanico para ver cuál "resuena" mejor
    for (let ang of abanico) {
        let puntosEsteAngulo = [];
        const rad = ang * (Math.PI / 180);

        // Saltamos desde las balizas ya confirmadas (anclas)
        for (let a of balizasEncontradas) {
            // Distancias estándar de la rejilla MBH (V18/V19/V20)
            for (let d of [32, 64, 96, 128]) {
                const targets = [
                    { x: a.realX + d * Math.cos(rad), y: a.realY + d * Math.sin(rad) },
                    { x: a.realX - d * Math.sin(rad), y: a.realY + d * Math.cos(rad) },
                    { x: a.realX - d * Math.cos(rad), y: a.realY - d * Math.sin(rad) },
                    { x: a.realX + d * Math.sin(rad), y: a.realY - d * Math.cos(rad) }
                ];

                for (let t of targets) {
                    // Seguridad: No buscar fuera de los límites del buffer
                    if (t.x < 0 || t.x > width - 8 || t.y < 0 || t.y > height - 8) continue;

                    // Lupa de fase 8x8 con umbral de rescate 1.5 y validación ADN 16-bit
                    const detect = buscarADNLocal_LUPA(buffer, width, Math.floor(t.x - 4), Math.floor(t.y - 4));

                    if (detect.encontrado) {
                        const pN = {
                            realX: Math.floor(t.x - 4) + detect.offX,
                            realY: Math.floor(t.y - 4) + detect.offY
                        };

                        // Verificamos unicidad: que no exista en la lista original ni en la cosecha actual
                        const yaExiste = balizasEncontradas.some(b => Math.abs(b.realX - pN.realX) < 10 && Math.abs(b.realY - pN.realY) < 10) ||
                                         puntosEsteAngulo.some(b => Math.abs(b.realX - pN.realX) < 10 && Math.abs(b.realY - pN.realY) < 10);

                        if (!yaExiste) {
                            puntosEsteAngulo.push(pN);
                        }
                    }
                }
            }
        }

        // Si este ángulo encuentra un dibujo más sólido de la constelación, lo elegimos
        if (puntosEsteAngulo.length > mejorCosecha.puntosNuevos.length) {
            mejorCosecha = { angulo: ang, puntosNuevos: puntosEsteAngulo };
        }
    }

    // 4. Incorporamos la mejor cosecha a la constelación final
    if (mejorCosecha.puntosNuevos.length > 0) {
        console.log(`🎯 RESONANCIA GANADORA: ${mejorCosecha.angulo.toFixed(2)}° (+${mejorCosecha.puntosNuevos.length} hits)`);
        balizasEncontradas.push(...mejorCosecha.puntosNuevos);
    }
}

        // --- VEREDICTO FINAL Y EVIDENCIA ---
        if (balizasEncontradas.length >= 3) {
            const gradosFinales = calcularGiroEstructural(balizasEncontradas, width, height);
            const calidadTag = ruta.includes('Q') ? `Q${ruta.split('Q')[1].split('.')[0]}` : 'Final';

            // Guardamos la constelación para el peritaje visual
            await guardarMapaHits(balizasEncontradas, width, height, `evidencia_${calidadTag}_hits${balizasEncontradas.length}.png`);

            console.log(`   🎯 ÉXITO REAL: ${autorIdentificado.cliente} | Hits Finales: ${balizasEncontradas.length} | Ángulo: ${gradosFinales.toFixed(2)}°`);

            const finalRes = armarRespuesta(res, true, autorIdentificado.cliente, "V20 DNA-Shield + Dynamic Focus", 99, balizasEncontradas.length, ultimoADN);
            finalRes.response.rotacion_detectada = `${gradosFinales.toFixed(2)}°`;
            return finalRes;
        }

        return armarRespuesta(res, false, null, "Ninguno", 0, 0, null);

    } catch (e) {
        console.error(`[CRITICAL V20] ${e.message}`);
        return armarRespuesta(res, false, null, "Error", 0, 0, null);
    }
}

function calcularGiroEstructural(balizas, width, height) {
    if (balizas.length < 5) return 0;

    // Ancla central sincronizada con la imagen
    const ancla = { realX: width / 2, realY: height / 2 };
    let mejorAngulo = 0;
    let mejorScore = -Infinity;

    // Fase 1: Búsqueda de alta resolución
    for (let a = 0; a <= 45; a += 0.1) {
        let s = calcularScoreGaussian(balizas, a, ancla, 0.5);
        if (s > mejorScore) { mejorScore = s; mejorAngulo = a; }
    }

    // Fase 2: Micro-ajuste sub-píxel
    let anguloFinal = mejorAngulo;
    mejorScore = -Infinity;
    for (let a = mejorAngulo - 0.2; a <= mejorAngulo + 0.2; a += 0.005) {
        let s = calcularScoreGaussian(balizas, a, ancla, 0.02);
        if (s > mejorScore) { mejorScore = s; anguloFinal = a; }
    }
    return anguloFinal;
}

function calcularScoreGaussian(balizas, angulo, ancla, sigma) {
    let rad = angulo * (Math.PI / 180), score = 0;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    // Usamos hasta 60 balizas para la estadística de giro
    const maxB = Math.min(balizas.length, 60);

    for (let i = 1; i < maxB; i++) {
        let dx = balizas[i].realX - ancla.realX, dy = balizas[i].realY - ancla.realY;
        let nx = dx * cosA + dy * sinA, ny = -dx * sinA + dy * cosA;
        let ex = Math.abs(nx % 8); if (ex > 4) ex = 8 - ex;
        let ey = Math.abs(ny % 8); if (ey > 4) ey = 8 - ey;
        score += Math.exp(-(ex * ex + ey * ey) / sigma);
    }
    return score;
}

function detectarEnergiaPunto(buffer, width, x, y) {
    const dct = dct8x8(extraerBloqueCanal(buffer, width, x, y, 2));
    return Math.abs(dct[1][1] - dct[2][2]);
}

function extraerBloqueCanal(buffer, width, startX, startY, channel) {
    let block = [];
    for (let y = 0; y < 8; y++) {
        let row = [];
        for (let x = 0; x < 8; x++) {
            const idx = (Math.floor(startY + y) * width + Math.floor(startX + x)) * 4 + channel;
            row.push(buffer[idx] || 0);
        }
        block.push(row);
    }
    return block;
}

function dct8x8(block) {
    let dct = Array(8).fill(0).map(() => Array(8).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

function armarRespuesta(res, exito, cliente, metodo, confianza, hits, adn) {
    res.evaluacion = { veredicto: exito ? "EXITO" : "FALLO" };
    res.response.identificado = exito;
    res.response.evidencia_visual = { Cliente_Identificado: cliente || "Ninguno", Hits_Totales: hits, Metodo: metodo, ADN_Detectado: adn };
    return res;
}
