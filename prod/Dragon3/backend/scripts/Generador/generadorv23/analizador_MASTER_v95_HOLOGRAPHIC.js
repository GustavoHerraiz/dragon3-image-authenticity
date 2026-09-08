/**
 * ============================================================================
 * 🏆 DRAGON DECODER V125 - THE HYDRA [PURE HOLOGRAPHIC EDITION] + CROP DETECTOR
 * ============================================================================
 * MEJORA: DETECTOR DE RECORTES INTELIGENTE
 * - Mantiene 11/11 en JPEG puro
 * - Detecta recortes sin falsos positivos
 * - Búsqueda limitada solo cuando es necesario
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';
import { radarHolograficoOptimo, extraerConRotacionHolografica } from './radar_holografico.js';


const CONFIG = {
    CHANNEL_IDX: 2,          // Canal Azul (donde vive el holograma)
    FREQ_A: { u: 1, v: 1 },  // Frecuencia Baja
    FREQ_B: { u: 2, v: 2 }   // Frecuencia Media
};

// UMBRALES CONFIGURABLES
const UMBRALES = {
    SCORE_BAJO: 5.0,         // Score mínimo para considerar señal válida
    DIM_MINIMA: 64,          // Dimensión mínima esperada (ancho/alto)
    MEJORA_MINIMA: 1.5       // Mejora mínima para cambiar offset
};
export async function analizarImagenCiega(rutaImagen) {
    const res = new RespuestaStandard("Dragon_Master_v125", "The Hydra (Scale Aware)", "125.5.0");

    try {
        if (!fs.existsSync(rutaImagen)) {
            res.error = "Imagen no encontrada";
            return res;
        }

        const imageObj = sharp(rutaImagen);
        const inputRaw = await imageObj.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        // 🚨 CAMBIO CRÍTICO: 'let' para permitir que el Motor 0 repare la imagen
        let { width, height } = inputRaw.info;
        let buffer = inputRaw.data;

        const UMBRAL_MINIMO = 2.0;

       // ====================================================================
        // 📏 MOTOR 0: ESCÁNER DE ESCALA (SCIENTIFIC + EARLY EXIT)
        // ====================================================================
        console.log(`\n📏 MOTOR 0: ESCÁNER DE ESCALA`);

        // 1. Ejecutamos el motor científico (Autocorrelación)
        const resultadoEscala = await ejecutarMotorEscala(buffer, width, height);

        if (resultadoEscala.encontrado) {
            console.log(`   ✅ REESCALADO DETECTADO: ${resultadoEscala.escala}x`);
            console.log(`   🔄 Restaurando dimensiones originales: ${width}x${height} -> ${resultadoEscala.width}x${resultadoEscala.height}`);
            console.log(`   🔓 Sello recuperado tras restauración: ${resultadoEscala.adn} (Score: ${resultadoEscala.score.toFixed(2)})`);

            // 2. Verificamos quién es el dueño en la BD
            const hashFinal = parseInt(resultadoEscala.adn, 2).toString(16).toUpperCase().padStart(4, '0');
            const consultaFinal = consultarBaseDeDatos(hashFinal);

            if (consultaFinal.encontrado) {
                 console.log(`   🏆 VICTORIA TEMPRANA (Motor 0): ${consultaFinal.registro.cliente} - ${consultaFinal.registro.obra}`);

                 // CÁLCULO DE ENERGÍA TOTAL (Densidad x Área)
                 // Replicamos la física del Motor 1 para ser consistentes
                 const bloquesEscala = Math.floor(resultadoEscala.width / 8) * Math.floor(resultadoEscala.height / 8);
                 const energiaTotalEscala = resultadoEscala.score * (bloquesEscala / 32) * 16;

                 res.response = {
                    identificado: true,
                    adn_binario: resultadoEscala.adn,
                    hash_calculado: hashFinal,
                    energia_detectada: energiaTotalEscala.toFixed(0), // Energía Real
                    angulo_estimado: 0,
                    metodo: "SCALE_RECOVERY_SCIENTIFIC",
                    offset_x: 0,
                    offset_y: 0,
                    base_datos: {
                        encontrado: true,
                        hash_suffix: consultaFinal.registro.hash_suffix,
                        cliente: consultaFinal.registro.cliente,
                        obra: consultaFinal.registro.obra
                    },
                    dimensiones: { ancho: resultadoEscala.width, alto: resultadoEscala.height }
                };
                return res;
            }

            buffer = resultadoEscala.buffer;
            width = resultadoEscala.width;
            height = resultadoEscala.height;
        } else {
            console.log(`   ⏭️ No se detectó reescalado obvio. Continuando análisis estándar...`);
        }

       // ====================================================================
       // 🎯 MOTOR 1: OMNI-LOCK (JPEG puro, offset 0,0)
       // ====================================================================
       console.log(`\n🎯 MOTOR 1: OMNI-LOCK (W:${width} H:${height})`);
       const canalBaliza = buffer.length / (width * height * 4) > 3 ? 3 : 2;
       const omni = extraerADN_OmniLock_ConCrop(buffer, width, height, canalBaliza);
       const hash1 = parseInt(omni.adn, 2).toString(16).toUpperCase().padStart(4, '0');
       const consulta1 = consultarBaseDeDatos(hash1);
       const esScoreValido = omni.score > UMBRAL_MINIMO || (omni.score > 1.0 && consulta1.encontrado);

       if (esScoreValido && consulta1.encontrado) {
            console.log(`   ADN detectado: ${omni.adn} → ${hash1} (Score: ${omni.score.toFixed(2)})`);
            console.log(`   ✅ COINCIDENCIA EN BD (Indulto por Hash): ${consulta1.registro.cliente} - ${consulta1.registro.obra}`);

            // 🧮 FÍSICA PURA: Deshacemos la normalización para obtener la suma total de diferencias
            const bloquesTotales = omni.bloquesUsados || Math.floor(width / 8) * Math.floor(height / 8);
            const energiaTotal = omni.media * (bloquesTotales / 32) * 16;

            res.response = {
                identificado: true,
                adn_binario: omni.adn,
                hash_calculado: hash1,
                energia_detectada: energiaTotal.toFixed(0), // Energía Real Sumada
                angulo_estimado: 0,
                metodo: resultadoEscala.encontrado ? "SCALE_RECOVERY" : "OMNI_LOCK_SYNCHRONIZED",
                offset_x: omni.offsetX || 0,
                offset_y: omni.offsetY || 0,
                base_datos: {
                    encontrado: true,
                    hash_suffix: consulta1.registro.hash_suffix,
                    cliente: consulta1.registro.cliente,
                    obra: consulta1.registro.obra
                },
                dimensiones: { ancho: width, alto: height }
            };
            return res;
       } else {
            console.log(`   ADN detectado: ${omni.adn} → ${hash1} (Score: ${omni.score.toFixed(2)})`);
            console.log(`   ⚠️ Score bajo o sin coincidencia en BD. Pasando al Motor 2...`);
       }

        // ====================================================================
        // 🌀 MOTOR 2: RADAR HOLOGRÁFICO
        // ====================================================================
        console.log(`\n🌀 MOTOR 2: RADAR HOLOGRÁFICO`);

        const v38 = extraerADN_V38_Integers(buffer, width, height, CONFIG.CHANNEL_IDX);
        const radar = radarHolograficoOptimo(buffer, width, height, CONFIG.CHANNEL_IDX);

        console.log(`   🧮 GESTIÓN DE CENTRO DE ROTACIÓN:`);

        let centroUsado = null;
        let esCentroBaliza = false;

        if (radar.centro) {
            console.log(`      💎 RADAR: Usando centro de BALIZAS V19 (${radar.centro.x.toFixed(1)}, ${radar.centro.y.toFixed(1)})`);
            centroUsado = radar.centro;
            esCentroBaliza = true;
        } else {
            const centroXReal = width / 2;
            const centroYReal = height / 2;
            centroUsado = { x: centroXReal, y: centroYReal };
            console.log(`      📐 RADAR: Usando centro GEOMÉTRICO (${centroXReal.toFixed(1)}, ${centroYReal.toFixed(1)})`);
        }

        let factorCorreccionCentro = 1.0;
        let offsetCentroX = 0;

        if (!esCentroBaliza) {
            const centroX8 = Math.round(centroUsado.x / 8) * 8;
            const centroY8 = Math.round(centroUsado.y / 8) * 8;
            const esCentroMultiplo8 = (centroX8 % 8 === 0) && (centroY8 % 8 === 0);
            offsetCentroX = centroX8 - centroUsado.x;
            const offsetCentroY = centroY8 - centroUsado.y;

            console.log(`      Centro geométrico múltiplo de 8: (${centroX8}, ${centroY8})`);
            console.log(`      ¿Centro válido?: ${esCentroMultiplo8 ? '✅ SÍ' : '⚠️  NO (Penalizable)'}`);

            if (!esCentroMultiplo8) {
                const magnitudOffset = Math.sqrt(offsetCentroX * offsetCentroX + offsetCentroY * offsetCentroY);
                if (magnitudOffset > 2.0) {
                    factorCorreccionCentro = 0.7;
                    console.log(`      ⚠️  Offset grande (${magnitudOffset.toFixed(1)}px), aplicando factor ${factorCorreccionCentro}`);
                }
            }
        } else {
            console.log(`      ✅ Centro de Baliza: EXENTO DE PENALIZACIÓN GEOMÉTRICA`);
        }

        console.log(`   📊 VALORES: Radar=${radar.score.toFixed(2)}, V38=${v38.confianza.toFixed(2)}, Omni=${omni.score.toFixed(2)}`);

        const UMBRAL_ANGULO = 2.0;
        const UMBRAL_VIP = 500;
        let umbralRelativo = 1.25;
        const confianzaV38 = Math.max(v38.confianza || 1000, 500);

        if (confianzaV38 > 50000) umbralRelativo = 0.05;
        else if (confianzaV38 > 5000) umbralRelativo = 1.25;
        else umbralRelativo = 2.0;

        const radarScoreCorregido = radar.score * factorCorreccionCentro;
        const esScoreRadarValido = radarScoreCorregido > 500 && radarScoreCorregido < 1000000;
        const esGiroSignificativo = Math.abs(radar.angulo) > UMBRAL_ANGULO;
        const esMejoraSobreV38 = radarScoreCorregido > (confianzaV38 * umbralRelativo);
        const esScoreBrutal = radarScoreCorregido > UMBRAL_VIP;
        const esMultiplo90 = Math.abs(radar.angulo % 90) < 5;
        const esJPEGBajaCalidad = confianzaV38 > 100000;
        const penalizarMultiplo90 = esMultiplo90 && esJPEGBajaCalidad;
        const esRotacionPrecisa = esCentroBaliza || (Math.abs(offsetCentroX) < 4);

        const activarRadar = esGiroSignificativo &&
                            esScoreRadarValido &&
                            (esMejoraSobreV38 || esScoreBrutal) &&
                            !penalizarMultiplo90 &&
                            esRotacionPrecisa;

        console.log(`   🎯 DECISIÓN RADAR:`);
        console.log(`      ACTIVAR RADAR: ${activarRadar ? '✅ SÍ' : '❌ NO'}`);

        if (activarRadar) {
            console.log(`\n🔄 EXTRACCIÓN AUTOMÁTICA CON ROTACIÓN ${radar.angulo.toFixed(2)}°`);
            const resultadoRadar = extraerConRotacionHolografica(
                buffer, width, height, radar.angulo, CONFIG.CHANNEL_IDX, centroUsado
            );

            console.log(`   🔍 VERIFICACIÓN RESULTADO ROTADO:`);
            console.log(`      Confianza: ${resultadoRadar.confianza.toFixed(2)}`);
            console.log(`      ADN válido: ${resultadoRadar.adn.length === 16 && /^[01]+$/.test(resultadoRadar.adn) ? '✅' : '❌'}`);

            if (resultadoRadar.confianza < 1.0 || resultadoRadar.adn === "0000000000000000") {
                console.log(`   ⚠️  Señal débil o nula después de rotación. Pasando a Motor 3...`);
            } else {
                const hash2 = parseInt(resultadoRadar.adn, 2).toString(16).toUpperCase().padStart(4, '0');
                console.log(`   🔢 Hash calculado: ${hash2}`);
                const consulta2 = consultarBaseDeDatos(hash2);

                if (consulta2.encontrado) {
                    console.log(`   ✅ RADAR DETECTÓ: ${resultadoRadar.adn} → ${hash2}`);
                    console.log(`   📍 COINCIDENCIA EN BD: ${consulta2.registro.cliente} - ${consulta2.registro.obra}`);

                    res.response = {
                        identificado: true,
                        adn_binario: resultadoRadar.adn,
                        hash_calculado: hash2,
                        energia_detectada: resultadoRadar.confianza.toFixed(0),
                        angulo_estimado: radar.angulo,
                        metodo: esCentroBaliza ? "RADAR_BEACON_V19" : "RADAR_HOLOGRAPHIC",
                        offset_x: 0,
                        offset_y: 0,
                        base_datos: {
                            encontrado: true,
                            hash_suffix: consulta2.registro.hash_suffix,
                            cliente: consulta2.registro.cliente,
                            obra: consulta2.registro.obra
                        },
                        dimensiones: { ancho: width, alto: height }
                    };
                    return res;
                } else {
                    console.log(`   ⚠️ Radar activado pero sin coincidencia en BD: ${hash2}`);
                }
            }
        } else {
            console.log(`   ⏭️ Radar no activado, continuando con Motor 3...`);
        }

        // ====================================================================
        // ✂️ MOTOR 3: CROP DETECTOR (CORREGIDO: FÍSICA REAL, SIN MULTIPLICADOR)
        // ====================================================================
        console.log(`\n✂️ MOTOR 3: CROP DETECTOR`);
        const mejorOffset = buscarOffsetOptimo(buffer, width, height);
        const UMBRAL_CROP = UMBRAL_MINIMO * 0.3;

        if (mejorOffset.score > UMBRAL_CROP) {
             const hash3 = parseInt(mejorOffset.adn, 2).toString(16).toUpperCase().padStart(4, '0');
             console.log(`   OFFSET DETECTADO: (${mejorOffset.offsetX}, ${mejorOffset.offsetY})`);
             console.log(`   ADN detectado: ${mejorOffset.adn} → ${hash3} (Score: ${mejorOffset.score.toFixed(2)})`);

             const consulta3 = consultarBaseDeDatos(hash3);
             if (consulta3.encontrado) {
                  console.log(`   ✅ COINCIDENCIA EN BD: ${consulta3.registro.cliente}`);

                  // 🧮 CORRECCIÓN CIENTÍFICA:
                  // Antes: mejorOffset.score * 1000 (Falso)
                  // Ahora: mejorOffset.score * Bloques (Energía Total Real)
                  const bloquesCrop = Math.floor((width - mejorOffset.offsetX) / 8) * Math.floor((height - mejorOffset.offsetY) / 8);
                  const energiaRealCrop = mejorOffset.score * (bloquesCrop / 32) * 16;

                  res.response = {
                      identificado: true,
                      adn_binario: mejorOffset.adn,
                      hash_calculado: hash3,
                      energia_detectada: energiaRealCrop.toFixed(0), // Energía Real calculada
                      angulo_estimado: 0,
                      metodo: "CROP_DETECTOR",
                      offset_x: mejorOffset.offsetX,
                      offset_y: mejorOffset.offsetY,
                      base_datos: {
                          encontrado: true,
                          hash_suffix: consulta3.registro.hash_suffix,
                          cliente: consulta3.registro.cliente,
                          obra: consulta3.registro.obra
                      },
                      dimensiones: { ancho: width, alto: height }
                  };
                  return res;
             }
        }

        // ====================================================================
        // ❌ NINGÚN MOTOR
        // ====================================================================
        console.log(`\n❌ NINGÚN MOTOR ENCONTRÓ COINCIDENCIA EN BD`);
        res.response = {
            identificado: false,
            adn_binario: null,
            hash_calculado: null,
            energia_detectada: 0,
            angulo_estimado: 0,
            metodo: "NO_DETECTADO",
            base_datos: { encontrado: false },
            dimensiones: { ancho: width, alto: height },
            mensaje: "No se encontró coincidencia"
        };
        return res;

    } catch (e) {
        res.error = e.message;
        return res;
    }
}

// ============================================================================
// 📏 MOTOR 0: ESCÁNER ESPECTRAL (AUTOCORRELACIÓN REAL / CIENTÍFICO)
// ============================================================================
async function ejecutarMotorEscala(bufferOriginal, widthOriginal, heightOriginal) {
    const canalPrueba = bufferOriginal.length / (widthOriginal * heightOriginal * 4) > 3 ? 3 : 2;
    const MAX_DIMENSION = 8192;

    // 1. ANÁLISIS ESPECTRAL: ¿Cuál es el "latido" de esta imagen?
    // Buscamos la periodicidad dominante en los píxeles.
    const periodoDetectado = detectarPeriodoEspectral(bufferOriginal, widthOriginal, heightOriginal, canalPrueba);

    console.log(`   📏 ANÁLISIS ESPECTRAL: Periodo detectado = ${periodoDetectado.toFixed(3)} px`);

    // Generamos candidatos basados en la ciencia, no en listas fijas
    const candidatos = [];

    if (periodoDetectado > 0) {
        // La escala estimada es: Periodo_Detectado / 8.0 (Periodo Original)
        // Invertimos para obtener el factor de restauración.
        // Ej: Si detecta periodo 2.18px -> Factor = 8 / 2.18 = 3.66x
        const factorMatematico = 8.0 / periodoDetectado;

        console.log(`      🧪 Escala calculada: ${(periodoDetectado/8.0).toFixed(3)}x (Factor restauración: ${factorMatematico.toFixed(3)})`);

        // Añadimos el candidato científico y variaciones finas por si hay error de redondeo
        candidatos.push({ factor: factorMatematico, nombre: `Auto-Detect (${(factorMatematico*100).toFixed(1)}%)` });
        candidatos.push({ factor: factorMatematico * 1.05, nombre: `Auto-Detect +5%` }); // Un poco más grande
        candidatos.push({ factor: factorMatematico * 0.95, nombre: `Auto-Detect -5%` }); // Un poco más pequeño
    } else {
        console.log(`      ⚠️ No se detectó periodicidad clara. Usando red de seguridad.`);
    }

    // Añadimos "Sospechosos Habituales" como red de seguridad (Backup)
    const COMUNES = [
        { factor: 2.0, nombre: "Fallback 50%" },
        { factor: 4.0, nombre: "Fallback 25%" },
        { factor: 3.66, nombre: "Fallback Web Fit (~27%)" },
        { factor: 0.5, nombre: "Fallback 200%" },
        { factor: 1.333, nombre: "Fallback 75%" }
    ];
    candidatos.push(...COMUNES);

    // --- FASE DE EJECUCIÓN ---
    // Eliminamos duplicados de factores muy cercanos para no repetir trabajo
    const candidatosUnicos = candidatos.filter((c, index, self) =>
        index === self.findIndex((t) => Math.abs(t.factor - c.factor) < 0.1)
    );

    console.log(`   🔍 Probando ${candidatosUnicos.length} factores de restauración...`);

    for (const escala of candidatosUnicos) {
        const wObjetivo = Math.round(widthOriginal * escala.factor);
        const hObjetivo = Math.round(heightOriginal * escala.factor);

        if (wObjetivo > MAX_DIMENSION || hObjetivo > MAX_DIMENSION || wObjetivo < 64 || hObjetivo < 64) continue;

        // Redimensionar (Lanczos3 para recuperar frecuencias perdidas)
        const bufferResized = await sharp(bufferOriginal, {
            raw: { width: widthOriginal, height: heightOriginal, channels: 4 }
        })
        .resize(wObjetivo, hObjetivo, { kernel: 'lanczos3' })
        .ensureAlpha()
        .raw()
        .toBuffer();

        // Cata Potente con Crop (para ajustar el offset si el decimal no fue perfecto)
        const omni = extraerADN_OmniLock_ConCrop(bufferResized, wObjetivo, hObjetivo, canalPrueba);
        const hash = parseInt(omni.adn, 2).toString(16).toUpperCase().padStart(4, '0');
        const consulta = consultarBaseDeDatos(hash);

        console.log(`      👉 Prueba ${escala.nombre} [Factor ${escala.factor.toFixed(2)}]: Score=${omni.score.toFixed(2)} | Hash=${hash} (${consulta.encontrado ? 'MATCH' : '---'})`);

        // VALIDACIÓN: HASH SUPREMACY (Score > 0.1 si hay Match)
        if (consulta.encontrado && omni.score > 0.1) {
             return {
                encontrado: true,
                escala: (1 / escala.factor).toFixed(2),
                buffer: bufferResized,
                width: wObjetivo,
                height: hObjetivo,
                adn: omni.adn,
                score: omni.score
            };
        }
    }

    return { encontrado: false };
}

// ----------------------------------------------------------------------------
// 🧮 FUNCIÓN MATEMÁTICA: DETECTOR DE PERIODICIDAD (AUTOCORRELACIÓN 1D)
// ----------------------------------------------------------------------------
function detectarPeriodoEspectral(buffer, width, height, canal) {
    // 1. Extraemos una "señal compuesta" promediando las filas centrales
    // Esto reduce el ruido y resalta el patrón vertical de la marca de agua (la rejilla)
    const filasAnalisis = Math.min(64, height);
    const startY = Math.floor((height - filasAnalisis) / 2);
    const signal = new Float32Array(width).fill(0);

    // Sumamos verticalmente para obtener el perfil horizontal
    for (let y = startY; y < startY + filasAnalisis; y++) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
            signal[x] += buffer[rowOffset + (x * 4) + canal];
        }
    }

    // 2. Normalizamos la señal (Restamos la media para centrar en 0)
    let media = 0;
    for (let i = 0; i < width; i++) media += signal[i];
    media /= width;
    for (let i = 0; i < width; i++) signal[i] -= media;

    // 3. Autocorrelación para encontrar picos de repetición
    // No necesitamos toda la longitud, solo los primeros 32 píxeles
    // (suficiente para detectar zoom desde macro hasta mini)
    const maxLag = Math.min(32, width / 2);
    let bestLag = 0;
    let maxCorrelation = -Infinity;

    // Empezamos en Lag 2 para ignorar el pico trivial en 0 (autocorelación perfecta)
    // y el ruido adyacente en 1.
    for (let lag = 2; lag < maxLag; lag++) {
        let sum = 0;
        // Correlación simple (Desplazar y multiplicar)
        for (let i = 0; i < width - lag; i++) {
            sum += signal[i] * signal[i + lag];
        }

        if (sum > maxCorrelation) {
            maxCorrelation = sum;
            bestLag = lag;
        }
    }

    // Si la correlación es muy débil o negativa, devolvemos 0 (fallo)
    if (maxCorrelation <= 0) return 0;

    return bestLag;
}

function consultarBaseDeDatos(hashCalculado) {
    // Buscar en todos los registros
    for (const registro of BASE_DE_DATOS_SELLOS) {
        // Comparar con el hash_suffix principal
        if (registro.hash_suffix.toLowerCase() === hashCalculado.toLowerCase()) {
            return {
                encontrado: true,
                registro: registro
            };
        }

        // OPCIONAL: También buscar en las balizas individuales
        for (const baliza of registro.balizas) {
            if (baliza.hex.toLowerCase() === hashCalculado.toLowerCase()) {
                return {
                    encontrado: true,
                    registro: registro,
                    baliza: baliza
                };
            }
        }
    }

    return {
        encontrado: false,
        registro: null
    };
}

function binarioAHex(binario) {
    return parseInt(binario, 2).toString(16).toUpperCase().padStart(4, '0');
}


// ============================================================================
// 🛡️ CABEZA 3 MEJORADA: OMNI-LOCK CON DETECTOR DE RECORTES
// ============================================================================
function extraerADN_OmniLock_ConCrop(buffer, width, height, canalBaliza) {
    // Intento inicial con offset (0,0)
    const resultadoOriginal = extraerADN_OmniLock_Offset(buffer, width, height, 0, 0, canalBaliza);

    // Evaluamos si necesitamos buscar un offset adicional
    const necesitaBuscarOffset = evaluarNecesidadOffset(resultadoOriginal, width, height);

    if (!necesitaBuscarOffset) {
        return {
            ...resultadoOriginal,
            metodoUsado: "ORIGINAL",
            offsetX: 0,
            offsetY: 0
        };
    }

    console.log(`🔍 BUSCANDO OFFSET (W:${width} H:${height}) - Score bajo: ${resultadoOriginal.score.toFixed(2)}`);

    // Búsqueda limitada de offset (máximo 64 combinaciones)
    let mejorResultado = resultadoOriginal;
    let mejorOffsetX = 0;
    let mejorOffsetY = 0;

    if (width >= UMBRALES.DIM_MINIMA && height >= UMBRALES.DIM_MINIMA) {
        for (let oy = 0; oy < 8; oy++) {
            for (let ox = 0; ox < 8; ox++) {
                if (ox === 0 && oy === 0) continue;

                const resultado = extraerADN_OmniLock_Offset(buffer, width, height, ox, oy, canalBaliza);

                if (resultado.score > mejorResultado.score * UMBRALES.MEJORA_MINIMA) {
                    mejorResultado = resultado;
                    mejorOffsetX = ox;
                    mejorOffsetY = oy;
                }
            }
        }
    }

    return {
        ...mejorResultado,
        metodoUsado: mejorOffsetX === 0 && mejorOffsetY === 0 ? "ORIGINAL" : "CROP_ADAPTIVE",
        offsetX: mejorOffsetX,
        offsetY: mejorOffsetY,
        bloquesUsados: calcularBloquesUsados(width, height, mejorOffsetX, mejorOffsetY)
    };
}

// ============================================================================
// 🎯 FUNCIÓN DE EVALUACIÓN PARA ACTIVAR BÚSQUEDA DE OFFSET
// ============================================================================
function evaluarNecesidadOffset(resultado, width, height) {
    // Condición 1: Score muy bajo (señal débil)
    const scoreBajo = resultado.score < UMBRALES.SCORE_BAJO;

    // Condición 2: Dimensiones no múltiplo de 8 (recorte evidente)
    const dimensionesIrregulares = (width % 8 !== 0) || (height % 8 !== 0);

    // Condición 3: Ruido muy alto comparado con señal
    const ruidoAlto = resultado.ruido > resultado.media * 0.5;

    // Solo activamos si hay fuerte evidencia
    return (scoreBajo && dimensionesIrregulares) || (scoreBajo && ruidoAlto);
}

// ============================================================================
// 🛡️ OMNI-LOCK CON DISCRIMINADOR DE FASE TWINBLOCK (JUDO AZUL)
// ============================================================================
function extraerADN_OmniLock_Offset(buffer, width, height, offsetX, offsetY, canalBaliza) {
    const urnas = new Array(16).fill(0);

    const bloquesAncho = Math.floor((width - offsetX) / 8);
    const bloquesAlto = Math.floor((height - offsetY) / 8);

    if (bloquesAncho <= 0 || bloquesAlto <= 0) {
        return {
            adn: "0000000000000000",
            score: -1000,
            media: 0,
            ruido: 1000,
            rawDiffs: new Array(16).fill(0)
        };
    }

    // Contadores para métricas de "Salud del TwinBlock"
    let votosCoherentes = 0;
    let votosContaminados = 0;

    for (let by = 0; by < bloquesAlto; by++) {
        for (let bx = 0; bx < bloquesAncho; bx++) {
            const x = offsetX + bx * 8;
            const y = offsetY + by * 8;

            // 1. Extraemos los valores individuales (Física Pura)
            const valA = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_A.u, CONFIG.FREQ_A.v, canalBaliza);
            const valB = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_B.u, CONFIG.FREQ_B.v, canalBaliza);

            // 2. Cálculo Diferencial Básico
            let diff = valA - valB;

            // 3. 🥋 DISCRIMINADOR DE FASE TWINBLOCK (JUDO)
            // Lógica: Si es un TwinBlock real (+1, -1), los valores deberían estar en "Contrafase".
            // Si tienen el mismo signo, significa que la "Luminancia de la Imagen" (Modo Común)
            // es más fuerte que nuestro sello. Eso es ruido.

            const signoA = Math.sign(valA);
            const signoB = Math.sign(valB);

            // Evitamos comparar ceros perfectos
            if (signoA !== 0 && signoB !== 0) {
                if (signoA === signoB) {
                    // ⛔ MODO COMÚN (AMBOS SUBEN O BAJAN) -> CONTAMINACIÓN
                    // La imagen domina. Castigamos severamente este voto para que no ensucie la urna.
                    // No lo eliminamos del todo (por si la señal es muy fuerte pero desplazada),
                    // pero le bajamos el volumen al 20%.
                    diff *= 0.2;
                    votosContaminados++;
                } else {
                    // ✅ MODO DIFERENCIAL (UNO SUBE, OTRO BAJA) -> SEÑAL PURA
                    // Esto es comportamiento TwinBlock de libro.
                    // Le damos un pequeño empujón de confianza (Bonus 20%).
                    diff *= 1.2;
                    votosCoherentes++;
                }
            }

            const indexSecuencia = (by * bloquesAncho + bx) % 32;
            const esReal = (indexSecuencia % 2 === 0);
            const bitAsociado = Math.floor(indexSecuencia / 2);

            if (esReal) urnas[bitAsociado] += diff;
            else urnas[bitAsociado] -= diff;
        }
    }

    const repeticionesPorBit = (bloquesAncho * bloquesAlto) / 32;
    const diferenciales = urnas.map(u => u / repeticionesPorBit);
    const bits = diferenciales.map(d => (d > 0 ? "1" : "0"));

    const absDiffs = diferenciales.map(d => Math.abs(d));
    const media = absDiffs.reduce((a, b) => a + b, 0) / 16;
    const varianza = absDiffs.reduce((sum, d) => sum + Math.pow(d - media, 2), 0) / 16;
    const ruido = Math.sqrt(varianza);

    // Logging de salud espectral (Solo para depuración interna si quieres verlo)
    // const ratioSalud = (votosCoherentes / (votosCoherentes + votosContaminados + 1)) * 100;
    // console.log(`Salud TwinBlock: ${ratioSalud.toFixed(1)}%`);

    return {
        adn: bits.join(""),
        score: media - ruido,
        media: media,
        ruido: ruido,
        rawDiffs: diferenciales
    };
}

// ============================================================================
// 🧮 FUNCIONES AUXILIARES
// ============================================================================
function calcularBloquesUsados(width, height, offsetX, offsetY) {
    const bloquesAncho = Math.floor((width - offsetX) / 8);
    const bloquesAlto = Math.floor((height - offsetY) / 8);
    return bloquesAncho * bloquesAlto;
}

// ============================================================================
// ⚙️ CABEZA 2: RADAR DOMINATOR (V23 FRACTAL - Intacto)
// ============================================================================
function buscarConfiguracionUltra(buffer, width, height, canal) {
    console.log(`\n🎯 RADAR DOMINATOR V23.5 (PASO 0.005°)`);
    console.log(`   Dimensiones: ${width}x${height}, Canal: ${canal}`);

    // PRIMERO: Detectar si es ángulo recto (0°, 90°, 180°, 270°)
    const anguloRecto = detectarAngulosRectos(buffer, width, height, canal);

    // Si encontramos un ángulo recto con buen score, lo priorizamos
    if (anguloRecto.score > 1000) {  // Umbral empírico
        console.log(`   ⚡ DETECTADO ÁNGULO RECTO: ${anguloRecto.angulo}° (score: ${anguloRecto.score.toFixed(2)})`);
        return { angulo: anguloRecto.angulo, faseY: 0, score: anguloRecto.score };
    }

    console.log(`   🔍 BUSCANDO ÁNGULO NO RECTO (0.005° paso)...`);

    let mejor = { angulo: 0, faseY: 0, score: -1 };
    const cX = width / 2;
    const cY = height / 2;

    // FASE GRUESA EXTREMADAMENTE FINA: 0.005°
    for (let ang = -45; ang <= 45; ang += 0.005) {
        const rad = ang * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Solo fases clave para no sobrecargar
        for (let fy = -64; fy <= 64; fy += 64) {
            const score = probarConfiguracion(buffer, width, height, cX, cY, cos, sin, fy, 0, canal, 96);
            if (score > mejor.score) {
                mejor = { angulo: ang, faseY: fy, score: score };
            }
        }
    }

    console.log(`   📊 FASE GRUESA: Ángulo=${mejor.angulo.toFixed(4)}°, Score=${mejor.score.toFixed(2)}`);

    // Si el score es muy bajo, podría ser una rotación >45°
    if (mejor.score < 500) {
        console.log(`   ⚠️ Score bajo (${mejor.score.toFixed(2)}), probando rango extendido (-90° a 90°)...`);

        for (let ang = -90; ang <= 90; ang += 0.01) {
            if (Math.abs(ang) <= 45) continue; // Ya buscado

            const rad = ang * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const score = probarConfiguracion(buffer, width, height, cX, cY, cos, sin, 0, 0, canal, 128);
            if (score > mejor.score) {
                mejor = { angulo: ang, faseY: 0, score: score };
            }
        }
    }

    // FASE FINA: 0.001° alrededor del mejor
    let fino = { ...mejor };
    const rangoFino = 0.01; // ±0.01°

    for (let ang = mejor.angulo - rangoFino; ang <= mejor.angulo + rangoFino; ang += 0.001) {
        const rad = ang * (Math.PI / 180);

        // Variar fase Y para ajuste fino
        for (let fy = mejor.faseY - 16; fy <= mejor.faseY + 16; fy += 8) {
            const score = probarConfiguracion(buffer, width, height, cX, cY, Math.cos(rad), Math.sin(rad), fy, 0, canal, 48);
            if (score > fino.score) {
                fino = { angulo: ang, faseY: fy, score: score };
            }
        }
    }

    console.log(`   🎯 FASE FINA: Ángulo final=${fino.angulo.toFixed(4)}°, Score=${fino.score.toFixed(2)}`);

    return fino;
}

function probarConfiguracion(buffer, width, height, cX, cY, cos, sin, fY, fX, canal, pX) {
    let s = 0;
    let puntosMuestreados = 0;

    // Muestreo más denso pero optimizado
    for (let yG = fY; yG < height + 256; yG += 128) {  // Menos líneas verticales
        const yR = yG - cY;
        for (let xG = 0; xG < width; xG += pX) {
            const xR = xG - cX;

            // Aplicar rotación
            const ax = Math.round(cos * xR - sin * yR) + cX;
            const ay = Math.round(sin * xR + cos * yR) + cY;
            const bx = Math.round(cos * (xR + 8) - sin * yR) + cX;
            const by = Math.round(sin * (xR + 8) + cos * yR) + cY;

            // Solo procesar si ambos puntos están dentro de la imagen
            if (ax >= 0 && ax < width && ay >= 0 && ay < height &&
                bx >= 0 && bx < width && by >= 0 && by < height) {
                const tensionA = getTension(buffer, width, height, ax, ay, canal);
                const tensionB = getTension(buffer, width, height, bx, by, canal);
                s += Math.abs(tensionA - tensionB);
                puntosMuestreados++;
            }
        }
    }

    // Normalizar por número de puntos muestreados
    return puntosMuestreados > 0 ? s / puntosMuestreados : 0;
}

function detectarAngulosRectos(buffer, width, height, canal) {
    console.log(`🔧 DETECTANDO ÁNGULOS RECTOS...`);

    const angulos = [0, 90, 180, 270, -90, -180, -270];
    let mejor = { angulo: 0, score: -1 };
    const cX = width / 2;
    const cY = height / 2;

    for (const ang of angulos) {
        const rad = ang * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Probar con fase 0
        const score = probarConfiguracion(buffer, width, height, cX, cY, cos, sin, 0, 0, canal, 64);

        console.log(`   Ángulo ${ang}°: score=${score.toFixed(2)}`);

        if (score > mejor.score) {
            mejor = { angulo: ang, score: score };
        }
    }

    return mejor;
}

function extraerADNBestPhase(buffer, width, height, angulo, faseY, canal) {
    const cX = width / 2; const cY = height / 2;
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    let mejor = { adn: "", confianza: -1 };
    for (let fx = 0; fx < 16; fx++) {
        let urnas = new Array(16).fill(0);
        for (let yG = faseY; yG < height + 256; yG += 256) {
            const yR = yG - cY;
            for (let xG = -width; xG < width * 1.5; xG += 16) {
                const xR = xG - cX;
                let t = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const ay = Math.round(sin * xR + cos * (yR + dy)) + cY;
                    const ax = Math.round(cos * xR - sin * (yR + dy)) + cX;
                    const by = Math.round(sin * (xR + 8) + cos * (yR + dy)) + cY;
                    const bx = Math.round(cos * (xR + 8) - sin * (yR + dy)) + cX;
                    t += (getTension(buffer, width, height, ax, ay, canal) - getTension(buffer, width, height, bx, by, canal));
                }
                let idx = Math.floor((xG + fx) / 16) % 16;
                urnas[idx < 0 ? idx + 16 : idx] += t;
            }
        }
        let p = 0; let adn = "";
        for (let i = 0; i < 16; i++) { p += Math.abs(urnas[i]); adn += (urnas[i] > 0) ? "1" : "0"; }
        if (p > mejor.confianza) mejor = { adn, confianza: p };
    }
    return mejor;
}

// ============================================================================
// 🎯 CABEZA 1: TIRO FIJO V38 (Línea Base con FILTRO ANTI-NEGRO)
// Ignora los triángulos negros generados al rotar la imagen.
// ============================================================================

function extraerADN_V38_Integers(buffer, width, height, canal) {
    let urnas = new Array(16).fill(0);
    let bloquesValidos = 0;

    for (let y = 0; y < height; y += 256) {
        for (let x = 0; x < width; x += 16) {
            // Calcular tensión básica
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy;
                if (py < 0 || py >= height) continue;

                // Intentar calcular la tensión
                try {
                    const tensionActual = getTension(buffer, width, height, x, py, canal);
                    const tensionSiguiente = getTension(buffer, width, height, x + 8, py, canal);
                    t += (tensionActual - tensionSiguiente);
                } catch (e) {
                    // Ignorar errores en bordes
                }
            }
            urnas[Math.floor(x / 16) % 16] += t;
            bloquesValidos++;
        }
    }

    let e = 0;
    let adn = "";
    for (let i = 0; i < 16; i++) {
        e += Math.abs(urnas[i]);
        adn += (urnas[i] > 0) ? "1" : "0";
    }

    return { adn, confianza: e };
}

// ============================================================================
// 🛠️ MATEMÁTICAS COMPARTIDAS DE ALTA PRECISIÓN
// ============================================================================
function extractFrequency(buffer, width, height, x, y, u, v, canal) {
    let sum = 0;
    const Cu = (u === 0) ? 1/Math.sqrt(2) : 1;
    const Cv = (v === 0) ? 1/Math.sqrt(2) : 1;

    for (let py = 0; py < 8; py++) {
        const cosY = Math.cos(((2 * py + 1) * v * Math.PI) / 16);
        const row = (y + py) * width;
        for (let px = 0; px < 8; px++) {
            const val = buffer[(row + (x + px)) * 4 + canal];
            const cosX = Math.cos(((2 * px + 1) * u * Math.PI) / 16);
            sum += val * cosX * cosY;
        }
    }
    return 0.25 * Cu * Cv * sum;
}

function getTension(buffer, width, height, x, y, canal) {
    const ix = Math.floor(x); const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix + 8 >= width || iy + 8 >= height) return 0;
    let s1 = 0, s2 = 0;
    for (let bj = 0; bj < 8; bj++) {
        const row = (iy + bj) * width;
        for (let bi = 0; bi < 8; bi++) {
            const v = buffer[(row + (ix + bi)) * 4 + canal];
            s1 += v * Math.cos(((2 * bi + 1) * Math.PI) / 16) * Math.cos(((2 * bj + 1) * Math.PI) / 16);
            s2 += v * Math.cos(((2 * bi + 1) * 2 * Math.PI) / 16) * Math.cos(((2 * bj + 1) * 2 * Math.PI) / 16);
        }
    }
    return s1 - s2;
}

function crearRespuestaExitosa(resultado, hash, metodo, registroBD) {
    return {
        identificado: true,
        adn_binario: resultado.adn,
        hash_calculado: hash,
        energia_detectada: resultado.confianza || resultado.score,
        metodo: metodo,
        base_datos: {
            encontrado: true,
            hash_suffix: registroBD.hash_suffix,
            cliente: registroBD.cliente,
            obra: registroBD.obra
        }
    };
}

function crearRespuestaNoEncontrado() {
    return {
        identificado: false,
        mensaje: "No se encontró coincidencia en base de datos",
        hash_calculado: null,
        base_datos: { encontrado: false }
    };
}

// AÑADIR validación de rotación real:
function esRotacionReal(angulo, scoreRadar, scoreV38) {
    // Ángulos exactos (0, 90, 180, 270) son sospechosos
    const angulosExactos = [0, 90, 180, 270, -90, -180, -270];
    const esAnguloExacto = angulosExactos.some(a => Math.abs(angulo - a) < 1);

    if (esAnguloExacto && scoreRadar < 1000) {
        return false; // Probable falso positivo
    }

    // Si V38 es muy alto y radar muy bajo, probablemente no hay rotación
    if (scoreV38 > 50000 && scoreRadar < 800) {
        return false;
    }

    return Math.abs(angulo) > 2.0; // Mínimo 2° de rotación
}

// ============================================================================
// 🧭 BUSCADOR 2D ESTRICTO: "LEY DEL CERO + AMORTIGUADOR JPEG"
// Bloquea nubes (signos iguales) y perdona la asimetría del JPEG en signos opuestos.
// ============================================================================
function buscarOffsetOptimo(buffer, width, height) {
    console.log(`   🔍 Iniciando autolocalización 2D (Ley de Simetría + Amortiguador JPEG)...`);

    const resultadoCero = extraerADN_OmniLock_Offset(buffer, width, height, 0, 0, 0, 0);
    if (resultadoCero.score >= 2.0) {
        console.log(`   ✅ Offset (0,0) perfecto: Score=${resultadoCero.score.toFixed(2)}`);
        return { offsetX: 0, offsetY: 0, adn: resultadoCero.adn, score: resultadoCero.score };
    }

    // --- PASO 1: LA REJILLA FÍSICA (0 a 7 píxeles) ---
    let mejorRejilla = { dx: 0, dy: 0, resonancia: -Infinity };
    const scanW = Math.min(width, 512); const scanH = Math.min(height, 512);
    const startX = Math.floor((width - scanW) / 2); const startY = Math.floor((height - scanH) / 2);

    for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
            const bAncho = Math.floor((scanW - dx) / 8); const bAlto = Math.floor((scanH - dy) / 8);
            const tensiones = [];

            for (let by = 0; by < bAlto; by++) {
                for (let bx = 0; bx < bAncho; bx++) {
                    const x = startX + dx + (bx * 8); const y = startY + dy + (by * 8);
                    const fA = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_A.u, CONFIG.FREQ_A.v, CONFIG.CHANNEL_IDX);
                    const fB = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_B.u, CONFIG.FREQ_B.v, CONFIG.CHANNEL_IDX);
                    tensiones.push(fA - fB);
                }
            }

            for (let paridad = 0; paridad < 2; paridad++) {
                let energiaEstricta = 0;

                for (let i = paridad; i < tensiones.length - 1; i += 2) {
                    const A = tensiones[i];
                    const B = tensiones[i + 1];

                    // 🛑 LEY 1 (INQUEBRANTABLE): Deben tener signos opuestos (+ y -). Cero nubes.
                    if (Math.sign(A) !== Math.sign(B)) {

                        // 🟢 LEY 2 (AMORTIGUADOR JPEG): Permitimos hasta un 75% de deformación
                        // en la simetría para que el holograma sobreviva al JPEG extremo.
                        const asimetria = Math.abs(A + B);
                        const senal_pura = Math.abs(A - B);

                        if (asimetria < senal_pura * 0.75) {
                            energiaEstricta += senal_pura;
                        }
                    }
                }
                if (energiaEstricta > mejorRejilla.resonancia) mejorRejilla = { dx, dy, resonancia: energiaEstricta };
            }
        }
    }

    console.log(`   📍 Rejilla física fijada en: (${mejorRejilla.dx}, ${mejorRejilla.dy}) (Tolerancia JPEG)`);

    // --- PASO 2: EL METRÓNOMO 2D (Shift_X y Shift_Y) ---
    let mejorReloj = { score: -Infinity, shiftX: 0, shiftY: 0, resultado: null };

    const bloquesAncho = Math.floor((width - mejorRejilla.dx) / 8);
    const bloquesAlto = Math.floor((height - mejorRejilla.dy) / 8);
    const tensionesTotales = new Float32Array(bloquesAncho * bloquesAlto);

    for (let by = 0; by < bloquesAlto; by++) {
        for (let bx = 0; bx < bloquesAncho; bx++) {
            const x = mejorRejilla.dx + (bx * 8); const y = mejorRejilla.dy + (by * 8);
            const fA = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_A.u, CONFIG.FREQ_A.v, CONFIG.CHANNEL_IDX);
            const fB = extractFrequency(buffer, width, height, x, y, CONFIG.FREQ_B.u, CONFIG.FREQ_B.v, CONFIG.CHANNEL_IDX);
            tensionesTotales[(by * bloquesAncho) + bx] = fA - fB;
        }
    }

    for (let shiftY = 0; shiftY < 32; shiftY++) {
        for (let shiftX = 0; shiftX < 32; shiftX++) {
            const urnas = new Array(16).fill(0);

            for (let by = 0; by < bloquesAlto; by++) {
                for (let bx = 0; bx < bloquesAncho; bx++) {
                    const indexSecuencia = (shiftX + bx + (by * shiftY)) % 32;
                    const esReal = (indexSecuencia % 2 === 0);
                    const bitAsociado = Math.floor(indexSecuencia / 2);
                    const diff = tensionesTotales[(by * bloquesAncho) + bx];

                    if (esReal) urnas[bitAsociado] += diff;
                    else urnas[bitAsociado] -= diff;
                }
            }

            const repeticionesPorBit = (bloquesAncho * bloquesAlto) / 32;
            const diferenciales = urnas.map(u => u / repeticionesPorBit);
            const absDiffs = diferenciales.map(d => Math.abs(d));
            const media = absDiffs.reduce((a, b) => a + b, 0) / 16;
            const varianza = absDiffs.reduce((sum, d) => sum + Math.pow(d - media, 2), 0) / 16;
            const score = media - Math.sqrt(varianza);

            if (score > mejorReloj.score) {
                mejorReloj = {
                    score: score, shiftX: shiftX, shiftY: shiftY,
                    resultado: { adn: diferenciales.map(d => d > 0 ? "1" : "0").join(""), score: score }
                };
            }
        }
    }

    console.log(`   ⏱️ Reloj 2D fijado: Inicio X=+${mejorReloj.shiftX}, Salto Y=+${mejorReloj.shiftY}. Score: ${mejorReloj.score.toFixed(2)}`);

    return {
        offsetX: mejorRejilla.dx, offsetY: mejorRejilla.dy, adn: mejorReloj.resultado.adn, score: mejorReloj.score
    };
}


