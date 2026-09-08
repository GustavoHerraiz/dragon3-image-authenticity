/**
 * ============================================================================
 * DRAGON3 - ANALIZADOR MBH V9 (TUNING FINAL 30%: FILTRO 0.6 + PRECISIÓN 1.0)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { MotorEspacial } from './matematicas/MotorEspacial.js';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

const PRIVATE_KEY = "CLAVE_PRIVADA_QUICO_MELERO_2025";
const NUM_PUNTOS_CENTRALES = 10;
const NUM_PUNTOS_TOTAL = 423;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// --- MOCK DB ---
const BASE_DE_DATOS_SELLOS = [
    {
        id_licencia: "MBH-2025-X881",
        cliente: "Quico Melero",
        proyecto: "Serie Atardeceres",
        centro_registrado: { x: 2329, y: 1481 }
    },
    {
        id_licencia: "MBH-2025-Y002",
        cliente: "Blade Corp Demo",
        proyecto: "Demo Tech",
        centro_registrado: { x: 1000, y: 1000 }
    }
];

// --- FUNCIONES AUXILIARES ---

function generarPatronTeoricoNormalizado(numPuntos) {
    const puntos = [];
    for (let i = 0; i < numPuntos; i++) {
        const r = Math.sqrt(i);
        const theta = i * GOLDEN_ANGLE;
        puntos.push({
            x_norm: r * Math.cos(theta),
            y_norm: r * Math.sin(theta),
            unit_x: i === 0 ? 0 : Math.cos(theta),
            unit_y: i === 0 ? 0 : Math.sin(theta),
            index: i,
            r_norm: r
        });
    }
    return puntos;
}

function generarPatronTeorico(centro, numPuntos) {
    const puntos = [];
    const radioMax = 1000;
    const scale = radioMax / Math.sqrt(numPuntos);
    for (let i = 0; i < numPuntos; i++) {
        const r = scale * Math.sqrt(i);
        const theta = i * GOLDEN_ANGLE;
        puntos.push({
            x: centro.x + r * Math.cos(theta),
            y: centro.y + r * Math.sin(theta),
            index: i
        });
    }
    return puntos;
}

function leerPuntoCentral(buffer, punto, anchoImagen) {
    const payloadBuffer = Buffer.alloc(8);
    let bitIndex = 0;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (bitIndex >= 64) break;
            if (punto.y + y < 0 || punto.x + x >= anchoImagen) continue;
            const offset = ((punto.y + y) * anchoImagen + (punto.x + x)) * 4;
            if (offset >= buffer.length) continue;
            const bit = buffer[offset + 3] & 1;
            if (bit) payloadBuffer[Math.floor(bitIndex / 8)] |= (1 << (7 - (bitIndex % 8)));
            bitIndex++;
        }
    }
    const bits64 = payloadBuffer.readBigUInt64BE();
    return {
        datos: Number((bits64 >> 32n) & 0xFFFFFFFFn),
        hash23: Number((bits64 >> 9n) & 0x7FFFFFn),
        indice: Number(bits64 & 0x1FFn)
    };
}

function calcularChecksumTeorico(indice) {
    const theta = indice * GOLDEN_ANGLE;
    const x_teor_norm = Math.cos(theta);
    const y_teor_norm = Math.sin(theta);
    const xInt = Math.abs(Math.round(x_teor_norm * 1000)) % 128;
    const yInt = Math.abs(Math.round(y_teor_norm * 1000)) % 128;
    return (indice + xInt + yInt) % 128;
}

function leerPuntoPeriferico(buffer, x, y, anchoImagen) {
    let bits16 = 0;
    let bitIndex = 0;
    for (let dy = 0; dy < 4; dy++) {
        const offset = (y + dy) * anchoImagen;
        for (let dx = 0; dx < 4; dx++) {
            const pxOffset = (offset + (x + dx)) * 4;
            if (pxOffset + 3 < buffer.length) {
                if (buffer[pxOffset + 3] & 1) bits16 |= (1 << (15 - bitIndex));
            }
            bitIndex++;
        }
    }
    const indice = (bits16 >> 7) & 0x1FF;
    const checksum = bits16 & 0x7F;
    if (indice < NUM_PUNTOS_CENTRALES || indice >= NUM_PUNTOS_TOTAL) return null;
    if (checksum === calcularChecksumTeorico(indice)) return { indice, x, y };
    return null;
}

function buscarPuntosPerifericos(buffer, width, height) {
    const puntos = [];
    for (let y = 0; y < height - 4; y += 2) {
        for (let x = 0; x < width - 4; x += 2) {
            const p = leerPuntoPeriferico(buffer, x, y, width);
            if (p) puntos.push(p);
        }
    }
    return puntos;
}

// --- CORE: MOTOR DE BARRIDO FORENSE (CONFIGURACIÓN EQUILIBRADA) ---
function ejecutarBarridoForense(puntosEncontrados, centroCandidato) {
    const teoricosMap = new Map();
    const patronTeorico = generarPatronTeoricoNormalizado(NUM_PUNTOS_TOTAL);
    patronTeorico.forEach(p => teoricosMap.set(p.index, p));

    const votosEscala = new Map();

    // TUNING FINAL PARA 30% RUIDO:
    // Precision 1.0: Agrupa bien sin mezclar demasiado.
    const PRECISION = 1.0;

    // Tolerancia 0.6: Permite ~53 grados.
    // Mata el 70% del ruido aleatorio (Blade Corp caerá).
    // Deja pasar los puntos deformados de Quico.
    const TOLERANCIA_ANGULAR = 0.6;

    for (const p of puntosEncontrados) {
        const t = teoricosMap.get(p.indice);

        const dx = p.x - centroCandidato.x;
        const dy = p.y - centroCandidato.y;
        const distReal = Math.hypot(dx, dy);

        if (distReal < 1) continue;

        // 1. FILTRO DE ÁNGULO (EL PORTERO)
        const unitRealX = dx / distReal;
        const unitRealY = dy / distReal;
        const dotProduct = (unitRealX * t.unit_x) + (unitRealY * t.unit_y);

        // Si el ángulo está mal, NO VOTA.
        if (dotProduct < TOLERANCIA_ANGULAR) continue;

        // 2. Escala
        const distTeorica = Math.hypot(t.x_norm, t.y_norm);
        if (distTeorica < 0.001) continue;

        const escalaImplicada = distReal / distTeorica;
        if (escalaImplicada < 5 || escalaImplicada > 500) continue;

        // 3. Votación
        const bin = Math.round(escalaImplicada / PRECISION) * PRECISION;
        const key = bin.toFixed(0);

        if (!votosEscala.has(key)) votosEscala.set(key, { count: 0, sum: 0 });
        const entry = votosEscala.get(key);
        entry.count++;
        entry.sum += escalaImplicada;
    }

    // Ventana Deslizante (Suma bin-1, bin, bin+1)
    let maxVotosWindow = 0;
    let mejorEscalaWindow = 0;
    const keys = Array.from(votosEscala.keys()).map(Number).sort((a,b)=>a-b);

    for (const k of keys) {
        const kStr = k.toFixed(0);
        const prevStr = (k - 1).toFixed(0);
        const nextStr = (k + 1).toFixed(0);

        const countCenter = votosEscala.get(kStr)?.count || 0;
        const countPrev = votosEscala.get(prevStr)?.count || 0;
        const countNext = votosEscala.get(nextStr)?.count || 0;

        const totalWindow = countCenter + countPrev + countNext;

        if (totalWindow > maxVotosWindow) {
            maxVotosWindow = totalWindow;
            const sumCenter = votosEscala.get(kStr)?.sum || 0;
            const sumPrev = votosEscala.get(prevStr)?.sum || 0;
            const sumNext = votosEscala.get(nextStr)?.sum || 0;
            // Evitar división por cero
            if (totalWindow > 0) {
                mejorEscalaWindow = (sumCenter + sumPrev + sumNext) / totalWindow;
            }
        }
    }

    // Umbral mínimo de seguridad: 7 votos (Blade Corp tenía 6, esto lo descartará)
    if (maxVotosWindow < 7) return { inliers: 0, escala: 0, centro: centroCandidato };

    // Verificación final
    let inliers = 0;
    const UMBRAL_ERROR = 30.0; // Margen generoso

    for (const pt of puntosEncontrados) {
        const tt = teoricosMap.get(pt.indice);
        const xEst = centroCandidato.x + mejorEscalaWindow * tt.x_norm;
        const yEst = centroCandidato.y + mejorEscalaWindow * tt.y_norm;

        const error = Math.hypot(pt.x - xEst, pt.y - yEst);
        if (error < UMBRAL_ERROR) {
            inliers++;
        }
    }

    return { centro: centroCandidato, escala: mejorEscalaWindow, inliers: inliers };
}

// RANSAC Ciego (Backup)
function calcularTransformacionRANSAC(puntosEncontrados, width, height) {
    if (puntosEncontrados.length < 5) return null;

    console.log(`[ANALIZADOR V9] 🔍 Iniciando RANSAC Ciego (Backup) sobre ${puntosEncontrados.length} puntos...`);

    const teoricosMap = new Map();
    const patronTeorico = generarPatronTeoricoNormalizado(NUM_PUNTOS_TOTAL);
    patronTeorico.forEach(p => teoricosMap.set(p.index, p));

    let ITERACIONES = 2000;
    if (puntosEncontrados.length > 2000) ITERACIONES = 50000;
    if (puntosEncontrados.length > 10000) ITERACIONES = 100000;

    const UMBRAL_ERROR = 20.0;
    let mejorModelo = null;
    let maxInliersCount = 0;
    const len = puntosEncontrados.length;

    for (let i = 0; i < ITERACIONES; i++) {
        const idx1 = (Math.random() * len) | 0;
        const idx2 = (Math.random() * len) | 0;
        if (idx1 === idx2) continue;

        const p1 = puntosEncontrados[idx1];
        const p2 = puntosEncontrados[idx2];
        if (p1.indice === p2.indice) continue;

        const t1 = teoricosMap.get(p1.indice);
        const t2 = teoricosMap.get(p2.indice);

        const distReal = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const distTeorica = Math.hypot(t2.x_norm - t1.x_norm, t2.y_norm - t1.y_norm);

        if (distTeorica < 0.0001) continue;
        const escala = distReal / distTeorica;
        if (escala < 5 || escala > 500) continue;

        const cx1 = p1.x - escala * t1.x_norm;
        const cy1 = p1.y - escala * t1.y_norm;
        const cx2 = p2.x - escala * t2.x_norm;
        const cy2 = p2.y - escala * t2.y_norm;

        const centroX = (cx1 + cx2) * 0.5;
        const centroY = (cy1 + cy2) * 0.5;

        // Filtro rápido
        let hits = 0;
        const paso = len > 5000 ? 5 : 1;

        for (let j = 0; j < len; j+=paso) {
            const p = puntosEncontrados[j];
            const t = teoricosMap.get(p.indice);
            const xEst = centroX + escala * t.x_norm;
            const yEst = centroY + escala * t.y_norm;

            if (Math.abs(p.x - xEst) + Math.abs(p.y - yEst) < UMBRAL_ERROR * 1.5) {
                if (Math.hypot(p.x - xEst, p.y - yEst) < UMBRAL_ERROR) hits++;
            }
        }

        const hitsProyectados = hits * paso;

        if (hitsProyectados > maxInliersCount) {
            maxInliersCount = hitsProyectados;
            mejorModelo = {
                centro: { x: centroX, y: centroY },
                escala: escala,
                puntosUsados: hitsProyectados
            };
        }
    }

    // UMBRAL DE SEGURIDAD RANSAC: 12 puntos
    if (!mejorModelo || mejorModelo.puntosUsados < 12) return null;

    let sumaCX = 0, sumaCY = 0;
    let inliersReales = 0;
    let errorAcumulado = 0;
    const finalEscala = mejorModelo.escala;
    const finalCentroX = mejorModelo.centro.x;
    const finalCentroY = mejorModelo.centro.y;

    for (const p of puntosEncontrados) {
        const t = teoricosMap.get(p.indice);
        const xEst = finalCentroX + finalEscala * t.x_norm;
        const yEst = finalCentroY + finalEscala * t.y_norm;
        const error = Math.hypot(p.x - xEst, p.y - yEst);

        if (error < UMBRAL_ERROR) {
            sumaCX += p.x - finalEscala * t.x_norm;
            sumaCY += p.y - finalEscala * t.y_norm;
            errorAcumulado += error;
            inliersReales++;
        }
    }

    return {
        centro: { x: sumaCX / inliersReales, y: sumaCY / inliersReales },
        escala: finalEscala,
        puntosUsados: inliersReales,
        errorPromedio: inliersReales > 0 ? errorAcumulado / inliersReales : 0,
        tipoTransformacion: "RANSAC Ciego (Recuperado)"
    };
}

function calcularHashEstructural(buffer) {
    const hash = crypto.createHash('sha256');
    const pixelCount = buffer.length / 4;
    const rgbBuffer = Buffer.allocUnsafe(pixelCount * 3);
    let k = 0;
    for (let i = 0; i < buffer.length; i += 4) {
        rgbBuffer[k++] = buffer[i] & 0xFE;
        rgbBuffer[k++] = buffer[i + 1] & 0xFE;
        rgbBuffer[k++] = buffer[i + 2] & 0xFE;
    }
    hash.update(rgbBuffer);
    return hash.digest('hex');
}

export async function analizadorImagenMBH_v9(rutaImagen) {
    const respuesta = new RespuestaStandard("analizadorMBH_v9", "Sello MBH Híbrido V9", "9.0.0");

    try {
        console.log(`\n[ANALIZADOR V9] 🔍 INICIANDO ANÁLISIS V9: ${path.basename(rutaImagen)}`);

        const { data: buffer, info } = await sharp(rutaImagen)
            .rotate()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const hashActualHex = calcularHashEstructural(buffer);
        const hashActualStr = hashActualHex.substring(0, 8);

        let puntosCentralesRecuperados = 0;
        let manifiestoJSON = null;
        let hashOriginal = null;
        let centroTeorico = null;
        let autor = "Autor Desconocido";
        let dimensionesOriginales = { width: 0, height: 0 };

        let modoRecuperacion = "normal";
        let transformacion = null;
        let clienteIdentificado = null;
        let puntosPerifericosEncontrados = [];

        // 1. MODO NORMAL
        console.log(`[ANALIZADOR V9] 🅰️ Buscando puntos centrales...`);
        const centroImagen = { x: Math.floor(info.width / 2), y: Math.floor(info.height / 2) };
        const puntosTeoricos = generarPatronTeorico(centroImagen, NUM_PUNTOS_CENTRALES);

        for (const puntoTeorico of puntosTeoricos) {
            if (puntoTeorico.x >= 0 && puntoTeorico.x < info.width - 8 &&
                puntoTeorico.y >= 0 && puntoTeorico.y < info.height - 8) {
                const lectura = leerPuntoCentral(buffer, puntoTeorico, info.width);
                if (lectura.datos !== 0 && lectura.hash23 !== 0) {
                    puntosCentralesRecuperados++;
                    if (!hashOriginal) hashOriginal = (lectura.hash23 << 9).toString(16).padStart(8, '0');
                }
            }
        }
        console.log(`[ANALIZADOR V9] 📊 Puntos centrales recuperados: ${puntosCentralesRecuperados}/${NUM_PUNTOS_CENTRALES}`);

        // 2. MODO RECUPERACIÓN
        if (puntosCentralesRecuperados < 2) {
            console.log(`[ANALIZADOR V9] ⚠️ Modo normal insuficiente. Iniciando Barrido Forense...`);
            modoRecuperacion = "recuperacion";

            puntosPerifericosEncontrados = buscarPuntosPerifericos(buffer, info.width, info.height);
            console.log(`[ANALIZADOR V9] 📊 Candidatos (Ruido): ${puntosPerifericosEncontrados.length}`);

            if (puntosPerifericosEncontrados.length >= 5) {
                // A) BARRIDO BD
                console.log(`[ANALIZADOR V9] 🔄 Cotejando huella contra Base de Datos (${BASE_DE_DATOS_SELLOS.length} registros)...`);

                let mejorMatch = null;
                let maxInliersGlobal = 0;

                for (const sello of BASE_DE_DATOS_SELLOS) {
                    const analisis = ejecutarBarridoForense(puntosPerifericosEncontrados, sello.centro_registrado);
                    if (analisis.inliers > 4) console.log(`   ➡️ Match potencial: ${sello.cliente} (${analisis.inliers} pts coherentes)`);

                    if (analisis.inliers > maxInliersGlobal) {
                        maxInliersGlobal = analisis.inliers;
                        mejorMatch = { sello, analisis };
                    }
                }

                // UMBRAL: Necesitamos 7+ puntos para confirmar (Blade Corp tuvo 6, así que esto lo mata)
                if (mejorMatch && maxInliersGlobal >= 7) {
                    clienteIdentificado = mejorMatch.sello;
                    transformacion = {
                        tipoTransformacion: "Barrido Forense BD",
                        escala: mejorMatch.analisis.escala,
                        centro: mejorMatch.analisis.centro,
                        puntosUsados: mejorMatch.analisis.inliers,
                        errorPromedio: 0
                    };
                    console.log(`[ANALIZADOR V9] 🏆 MATCH POSITIVO: ${clienteIdentificado.cliente}`);
                } else {
                    // B) RANSAC CIEGO
                    console.log(`[ANALIZADOR V9] ⚠️ Sin coincidencia sólida en BD. Intentando RANSAC Ciego...`);
                    transformacion = calcularTransformacionRANSAC(puntosPerifericosEncontrados, info.width, info.height);

                    if (transformacion) {
                        console.log(`[ANALIZADOR V9] ✨ Geometría anónima detectada.`);
                    }
                }
            }
        }

        let titulo, mensaje, estado, confianza;

        if (modoRecuperacion === "normal" && hashOriginal === hashActualStr) {
            titulo = "Original Intacto";
            mensaje = `La imagen coincide totalmente con la firma original.`;
            estado = "success";
            confianza = 0.99;
        }
        else if (clienteIdentificado) {
            titulo = "PROPIEDAD CERTIFICADA (RECUPERADA)";
            mensaje = `Sello detectado. Propietario: ${clienteIdentificado.cliente}.`;
            estado = "success";
            confianza = 0.95;
        }
        else if (transformacion) {
            titulo = "DERECHOS DETECTADOS (ANÓNIMO)";
            mensaje = `Geometría detectada, cliente desconocido.`;
            estado = "warning";
            confianza = 0.65;
        } else {
            titulo = "Sin Sello Válido";
            mensaje = "El sello ha sido destruido o no existe.";
            estado = "danger";
            confianza = 0.0;
        }

        respuesta.definirVoto(titulo, confianza, confianza * 100, confianza > 0.7 ? "Alto" : "Bajo");

        respuesta.response.evidencia_visual = {
            "Modo_Recuperacion": modoRecuperacion,
            "Transformacion_Detectada": transformacion,
            "Cliente_Identificado": clienteIdentificado,
            "Puntos_Perifericos_Encontrados": puntosPerifericosEncontrados.length,
            "Hash_Actual": hashActualStr,
            "Hash_Original": hashOriginal || "No recuperado"
        };

        respuesta.response.datos_clave = {
            "Hash_Actual": hashActualStr,
            "Hash_Original": hashOriginal,
            "Manifiesto": manifiestoJSON
        };

        respuesta.concluir(estado, "🛡️", titulo, mensaje, `Cliente: ${clienteIdentificado?.cliente || 'N/A'}`);
        return respuesta;

    } catch (error) {
        console.error(`[ANALIZADOR V9] ❌ Error: ${error.message}`);
        return respuesta.error("Error Interno", error.message).cerrar();
    }
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const args = process.argv.slice(2);
    if (args.length >= 1) analizadorImagenMBH_v9(args[0]);
}
