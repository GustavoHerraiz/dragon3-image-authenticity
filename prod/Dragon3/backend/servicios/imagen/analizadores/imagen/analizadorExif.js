/**
 * ============================================================================
 * DRAGON3 ENTERPRISE - ANALIZADOR EXIF HÍBRIDO PARALELO (ALTA CONCURRENCIA)
 * ============================================================================
 * @version 5.0.0-HÍBRIDO_PARALELO_CPU_FIXED
 * @description
 * Arquitectura optimizada para alta concurrencia:
 * - Cálculo ÚNICO de features compartidos
 * - Ejecución PARALELA de heurística + NN
 * - Zero duplicación de CPU
 * ============================================================================
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { exec } from 'child_process'; // Añadir esto
import util from 'util';               // Añadir esto
import dragon from '../../../../utilidades/logger.js';
import { nowIso } from '../../../../utilidades/common.js';
import exifr from 'exifr';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

// --- CONFIGURACIÓN NN ---
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const synaptic = require('synaptic');
const { Network } = synaptic;

// Definición de execAsync para evitar el ReferenceError
const execAsync = util.promisify(exec); 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUTA_PESOS_NN = path.join(__dirname, 'pesos.json');
const RUTA_PATRONES = path.join(__dirname, 'analizadorHerramientasSospechosas.json');

const MODULE_NAME = 'analizadorExif.js';
const ANALYZER_VERSION = '5.0.0-HÍBRIDO_PARALELO_CPU_V6.3';
const FEATURE_COUNT = 9;

// ====================================================================
// GESTIÓN DE ESTADO (OPTIMIZADO PARA CONCURRENCIA)
// ====================================================================

let redEspejoNN = null;
let redEspejoPromise = null;
// === NUEVO ESTADO DE RED ENTRENADA V6.3 ===
let redEntrenadaNN = null;
let redEntrenadaPromise = null;
const RUTA_PESOS_ENTRENADOS = path.join(__dirname, 'pesos_entrenados_v6.json');
// ==========================================
let patronesCache = null;

/**
 * @function cargarRedEspejo
 * @description Carga thread-safe del modelo NN
 */
async function cargarRedEspejo() {
    // ... (Mismo contenido de la función)
    if (redEspejoNN) return redEspejoNN;
    if (redEspejoPromise) return redEspejoPromise;

    redEspejoPromise = (async () => {
        try {
            const pesosData = await fs.readFile(RUTA_PESOS_NN, 'utf8');
            const pesos = JSON.parse(pesosData);
            redEspejoNN = Network.fromJSON(pesos);
            dragon.sonrie(`[${MODULE_NAME}] Modelo NN (9-4-1) cargado OK.`, MODULE_NAME, 'NN_LOADED');
            return redEspejoNN;
        } catch (error) {
            redEspejoPromise = null;
            dragon.agoniza(`[${MODULE_NAME}] ERROR cargando Red Espejo.`, error, MODULE_NAME, 'NN_LOAD_FAIL');
            throw error;
        }
    })();

    return redEspejoPromise;
}


// ====================================================================
// UTILIDADES: Carga de Patrones y Helpers de Búsqueda (NUEVO)
// ====================================================================

/** Carga los patrones de herramientas de edición/IA desde el JSON */
async function cargarPatrones() {
    if (patronesCache) return patronesCache;
    try {
        const data = await fs.readFile(RUTA_PATRONES, 'utf8');
        patronesCache = JSON.parse(data);
        return patronesCache;
    } catch (error) {
        dragon.sePreocupa(`[${MODULE_NAME}] No se pudo cargar analizadorHerramientasSospechosas.json.`, MODULE_NAME, 'PATRONES_FALLA', { error: error.message });
        return { softwareGeneracionIA: [], softwareEdicion: [], softwareGenerico: [], iaGeneradores: {} };
    }
}

/** Comprueba si el texto coincide con alguno de los patrones (RegExp) */
const checkMatch = (text, patterns) => {
    if (!text || typeof text !== 'string' || !Array.isArray(patterns)) return false;
    const normalized = text.toLowerCase();
    return patterns.some(pattern => {
        try { return new RegExp(pattern, 'i').test(normalized); }
        catch { return normalized.includes(pattern.toLowerCase().replace(/\\s\*/g, '')); }
    });
};


// ====================================================================
// CÁLCULO COMPARTIDO DE FEATURES (UNA SOLA VEZ)
// ====================================================================

/**
 * @function calcularFeaturesCompartidos
 * @description Calcula TODAS las features UNA vez para compartir entre heurística y NN
 */
// ACEPTAR EL OBJETO 'patrones'
function calcularFeaturesCompartidos(flatExif, xmpData, softwareStd, hallazgos, patrones) {
    const features = new Array(FEATURE_COUNT).fill(0.5);
    if (!flatExif) return features;

    // Feature 0: C2PA/ClaimId
    features[0] = (xmpData['xmp:C2PA'] || flatExif.ClaimId) ? 1 : 0;

    // Feature 1: Prompt IA (invertido)
    const tienePromptIA = hallazgos.some(h => h.tipo.startsWith('IA')) ? 1 : 0;
    features[1] = 1 - tienePromptIA;

    // Feature 2: Camera Raw
    const rawFormats = ['nef', 'cr2', 'dng', 'raf', 'arw', 'dcr'];
    let isRaw = 0;
    if (flatExif.MIMEType) {
        isRaw = rawFormats.some(ext => flatExif.MIMEType.toLowerCase().includes(ext)) ? 1 : 0;
    }
    features[2] = isRaw;

    // Feature 3: MakerNote Consistency
    let makerNoteConsistencia = 0.5;
    if (flatExif.Make && flatExif.Model) {
        makerNoteConsistencia = flatExif.MakerNote ? 1 : 0;
    }
    features[3] = makerNoteConsistencia;

    // Feature 4: Time Difference
    let tiempoDiffScore = 0.5;
    try {
        const originalDate = flatExif.DateTimeOriginal ? new Date(flatExif.DateTimeOriginal).getTime() : null;
        const modifyDate = flatExif.ModifyDate ? new Date(flatExif.ModifyDate).getTime() : null;
        if (originalDate && modifyDate && modifyDate > originalDate) {
            const diffHours = (modifyDate - originalDate) / (1000 * 60 * 60);
            tiempoDiffScore = 1 - Math.max(0, Math.min(1, diffHours / 720));
        } else if (originalDate) {
            tiempoDiffScore = 1;
        }
    } catch (e) {
        tiempoDiffScore = 0.5;
    }
    features[4] = tiempoDiffScore;

    // Feature 5: Suspicious Metadata
    let sospechosos = 0;
    if (xmpData.History || xmpData['xmpMM:History']) sospechosos += 2;
    if (hallazgos.length > 0) sospechosos += 3;
    features[5] = 1 - Math.max(0, Math.min(1, sospechosos / 5));

    // Feature 6: Software Type (CORRECCIÓN CRÍTICA)
    let esSoftwareGenIA = 0.5;
    if (softwareStd && patrones) {
        const software = String(softwareStd).toLowerCase();
        const esSoftwareDeCamara = flatExif.Make && software.includes(String(flatExif.Make).toLowerCase());

        if (esSoftwareDeCamara) {
            esSoftwareGenIA = 1; // Software del fabricante (Máxima Autenticidad)
        }
        // 🚨 CAMBIO CLAVE: CERO solo para IA
        else if (checkMatch(softwareStd, patrones.softwareGeneracionIA || [])) {
            esSoftwareGenIA = 0; // Firma de IA (Máxima Sospecha)
        }
        // 🚨 CAMBIO CLAVE: 0.75 para Edición Humana (no activa el "Artificial" automático)
        else if (checkMatch(softwareStd, patrones.softwareEdicion || [])) {
             esSoftwareGenIA = 0.75; // Edición Humana (Sospecha Media)
        }
    }
    features[6] = esSoftwareGenIA;

    // Feature 7: GPS
    const tieneGPS = (flatExif.GPSLatitude || flatExif.GPSLongitude || flatExif.GPSAltitude) ? 1 : 0;
    features[7] = tieneGPS;

    // Feature 8: Serial Number
    let serialPresente = 0.5;
    const serial = flatExif.CameraSerialNumber || flatExif.SerialNumber;
    if (serial) {
        if (String(serial).length > 5 && !String(serial).match(/^[0]+$/)) {
            serialPresente = 1;
        } else {
            serialPresente = 0;
        }
    }
    features[8] = serialPresente;

    return features;
}

// ====================================================================
// UTILIDAD V6.3: Carga de la Red Entrenada
// ====================================================================

/**
 * @function cargarRedEntrenada
 * @description Carga thread-safe del modelo NN ENTRENADA (pesos_entrenados_v6.json)
 */
async function cargarRedEntrenada() {
    if (redEntrenadaNN) return redEntrenadaNN;
    if (redEntrenadaPromise) return redEntrenadaPromise;

    redEntrenadaPromise = (async () => {
        try {
            // Nota: RUTA_PESOS_ENTRENADOS debe estar definido en el scope global
            const pesosData = await fs.readFile(RUTA_PESOS_ENTRENADOS, 'utf8');
            const pesos = JSON.parse(pesosData);
            redEntrenadaNN = Network.fromJSON(pesos);
            dragon.sonrie(`[${MODULE_NAME}] Modelo NN ENTRENADA (V6.3) cargado OK.`, MODULE_NAME, 'NN_ENTRENADA_LOADED');
            return redEntrenadaNN;
        } catch (error) {
            redEntrenadaPromise = null;
            dragon.agoniza(`[${MODULE_NAME}] ERROR cargando Red ENTRENADA.`, error, MODULE_NAME, 'NN_ENTRENADA_FAIL');
            // Devolver un objeto nulo para que el flujo principal continúe sin romperse
            return null;
        }
    })();
    return redEntrenadaPromise;
}

// ====================================================================
// UTILIDAD V6.3: Fusión de Tres Votos
// ====================================================================

/**
 * @function fusionarTresVotos (ARQUITECTURA MONARQUÍA PARLAMENTARIA)
 * @description
 * La Heurística es el REY. Si detecta hardware físico (autenticidad fuerte),
 * las Redes Neuronales (Parlamento) solo pueden matizar la confianza, no cambiar el veredicto.
 */
function fusionarTresVotos(heuristica, nnOriginal, nnEntrenadaScore) {
    // 1. Normalización de inputs (Sanity Check)
    let hScore = Number(heuristica.score) / 10; // De 0-10 a 0-1
    if (isNaN(hScore)) hScore = 0.5;

    let nn1Score = Number(nnOriginal.nn_score);
    if (isNaN(nn1Score)) nn1Score = 0.5;

    let nn2Score = Number(nnEntrenadaScore);
    if (isNaN(nn2Score)) nn2Score = 0.5;

    let scoreFinal;
    let metodoUsado;
    let confianzaFinal;

    // 👑 EL REY HABLA: Detección de Hardware Físico
    // Si la heurística ve una cámara real y le da una nota alta (>= 8.0/10)
    const elReyConfirmaCamara = heuristica.esAutentico && hScore >= 0.80;

    if (elReyConfirmaCamara) {
        // --- MODO MONARQUÍA ---
        // El veredicto ES Humano. Las NNs no pueden bajarlo a Indeterminado.

        // Calculamos el promedio de las NNs (El Parlamento)
        const consensoParlamento = (nn1Score + nn2Score) / 2;

        if (consensoParlamento >= 0.70) {
            // El Parlamento apoya al Rey -> Subimos el score casi al máximo
            scoreFinal = Math.min(0.99, hScore + 0.05);
            confianzaFinal = 0.95; // Confianza casi absoluta
        } else {
            // El Parlamento duda -> El Rey impone su criterio, pero con leve cautela
            // Nunca bajamos del 0.82 (Humano sólido)
            scoreFinal = Math.max(0.82, hScore * 0.95);
            confianzaFinal = 0.85; // Confianza alta obligatoria
        }

        metodoUsado = 'monarquia_heuristica_absoluta';

    } else {
        // --- MODO DEMOCRACIA (Caso sin hardware claro) ---
        // Si no hay cámara física clara, entonces sí votamos proporcionalmente
        const pesos = { heuristica: 0.45, nnEntrenada: 0.35, nnOriginal: 0.20 };

        scoreFinal = (hScore * pesos.heuristica) +
                     (nn2Score * pesos.nnEntrenada) +
                     (nn1Score * pesos.nnOriginal);

        // Cálculo estadístico de confianza para el modo democrático
        const votos = [hScore, nn2Score, nn1Score];
        const promedio = votos.reduce((a, b) => a + b) / 3;
        const desviacion = Math.sqrt(votos.reduce((acc, v) => acc + Math.pow(v - promedio, 2), 0) / 3);

        confianzaFinal = Math.max(0, 1 - (desviacion * 2.0));
        metodoUsado = 'democracia_ponderada';
    }

    // Sanity check final
    return {
        score: Math.min(Math.max(scoreFinal, 0), 1),
        confianza: Number(confianzaFinal.toFixed(2)),
        metodo: metodoUsado,
        // Concordancia decorativa
        concordancia: elReyConfirmaCamara ? 'impuesta_por_rey' : 'calculada'
    };
}

// ====================================================================
// LÓGICA DE DECISIÓN PARALELA
// ====================================================================

/**
 * @function ejecutarHeuristica
 * @description Ejecuta análisis heurístico basado en features compartidos (CORRECCIÓN CRÍTICA)
 */
// ACEPTAR EL OBJETO 'patrones'
function ejecutarHeuristica(features, flatExif, hallazgos, softwareStd, patrones) {
    let decision = 'Indeterminado';
    let confianza = 0.5;
    let score = 5.0;
    let mensajeCorto = "🟠 ORIGEN INDETERMINADO";
    let esAutentico = false;
    let herramientaIdentificada = softwareStd || 'Desconocida';

    const make = flatExif.Make;
    const model = flatExif.Model;
    const tieneCamaraOrigen = (make || model);
    const softwareEsEdicion = patrones && checkMatch(softwareStd, patrones.softwareEdicion || []);

    // 1. VOTO MÁXIMA SOSPECHA (IA/FRAUDE)
    if (hallazgos.length > 0 || features[1] < 0.5) {
        decision = 'Artificial';
        confianza = 0.95;
        score = 1.0;
        mensajeCorto = "🔴 Firma de generación IA o manipulación detectada.";
        esAutentico = false;
    }
    // 2. VOTO MÁXIMA AUTENTICIDAD (Humano con Trazabilidad Completa)
    else if (features[8] > 0.8 && features[7] > 0.5 && features[2] > 0.5) {
        decision = 'Humano';
        confianza = 0.90;
        score = 9.0;
        mensajeCorto = "🟢 Trazabilidad de cámara y serial válida.";
        esAutentico = true;
    }
    // 3. VOTO EDICIÓN HUMANA
    else if (softwareEsEdicion) {
        herramientaIdentificada = softwareStd;
        if (tieneCamaraOrigen) {
            decision = 'Humano';
            confianza = 0.80;
            score = 8.0;
            mensajeCorto = `🟡 Edición humana con ${herramientaIdentificada}, origen de cámara detectado.`;
            esAutentico = true;
        } else {
            decision = 'Indeterminado';
            confianza = 0.60;
            score = 6.0;
            mensajeCorto = `🟠 Edición humana con ${herramientaIdentificada}, origen de cámara eliminado.`;
            esAutentico = false;
        }
    }
    // 4. ORIGEN DE CÁMARA SIN EDICIÓN
    else if (tieneCamaraOrigen) {
        decision = 'Humano';
        confianza = 0.85;
        score = 8.5;
        mensajeCorto = `🟢 Origen de cámara confirmado (${make} ${model}).`;
        esAutentico = true;
        herramientaIdentificada = `Cámara (${make} ${model})`;
    }
    // 5. METADATOS LIMPIADOS/AUSENTES
    else if (!flatExif || Object.keys(flatExif).length < 5) {
        decision = 'Indeterminado';
        confianza = 0.40;
        score = 4.0;
        mensajeCorto = "⚠️ Metadatos eliminados o ausentes (Stripped).";
        herramientaIdentificada = "Stripped";
        esAutentico = false;
    }

    // NUEVAS PROPIEDADES
    let esIA = (decision === 'Artificial');
    let esEdicion = softwareEsEdicion;

    return { decision, confianza, score, mensajeCorto, esAutentico, herramientaIdentificada, esIA, esEdicion };
}

/**
 * @function ejecutarInferenciaNN
 * @description Ejecuta inferencia NN basada en features compartidos
 */
function ejecutarInferenciaNN(features, redEspejoNN) {
    // ... (Mismo contenido de la función)
    let nn_score = 0.5;
    let nn_decision = "Indeterminado";
    let nn_confianza = 0.0;
    let nn_warning = "Red Espejo no disponible";

    try {
        if (redEspejoNN) {
            const nn_output = redEspejoNN.activate(features);
            nn_score = Number(nn_output[0]) || 0.5;

            const confianzaNN = Math.max(0, Math.min(1, Math.abs(nn_score - 0.5) * 2));
            if (nn_score > 0.8) {
                nn_decision = 'Humano';
                nn_confianza = parseFloat(confianzaNN.toFixed(2));
            } else if (nn_score < 0.2) {
                nn_decision = 'Artificial';
                nn_confianza = parseFloat(confianzaNN.toFixed(2));
            } else {
                nn_decision = 'Indeterminado';
                nn_confianza = parseFloat(confianzaNN.toFixed(2));
            }

            nn_warning = `Inferencia ML OK. Votó ${nn_decision} con ${nn_confianza*100}% de confianza.`;
        }
    } catch (e) {
        dragon.sePreocupa(`[${MODULE_NAME}] Fallo en inferencia NN.`, MODULE_NAME, 'NN_ACTIVATE_FAIL', { error: e.message });
        nn_warning = "Error en inferencia ML. Voto degradado a neutro (0.5).";
    }

    return { nn_score, nn_decision, nn_confianza, nn_warning };
}

// --------------------------------------------------------------------
// FUNCIÓN PRINCIPAL OPTIMIZADA (MODIFICADA V6.3)
// --------------------------------------------------------------------

export async function analizarExif(params) {
    const t0 = Date.now();
    const { rutaArchivo, archivoId, correlationId, usuarioId, clientId } = params || {};

    // 👇 INICIALIZAR REPORTE
    const reporte = new RespuestaStandard(MODULE_NAME, "Metadatos & Origen", ANALYZER_VERSION);

    if (!rutaArchivo) {
        return reporte.error(new Error('Ruta de archivo requerida')).cerrar();
    }

    try {
        // Carga de patrones (NUEVO V6.1)
        const patrones = await cargarPatrones();

        // 1. EXTRACCIÓN ÚNICA de metadatos (Resto del código de buffer y hash)
        const buffer = await fs.readFile(rutaArchivo);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const exifData = await exifr.parse(buffer, { tiff: true, xmp: true, iptc: true, gps: true, mergeOutput: true });

        // ... (FlatExif, XMPData, SoftwareStd se mantienen igual) ...
        const flatExif = exifData || {};
        const xmpData = flatExif.xmp || {};
        const softwareStd = flatExif.Software || 'Desconocido';
        const hallazgos = [];

        // 2. CÁLCULO ÚNICO de features compartidos
        const t_features = Date.now();
        const featuresCompartidos = calcularFeaturesCompartidos(flatExif, xmpData, softwareStd, hallazgos, patrones);
        const featuresTime = Date.now() - t_features;

        // 3. CARGA PARALELA de NNs (ORIGINAL + ENTRENADA)
        const nnOriginalPromise = cargarRedEspejo().catch(() => null);
        const nnEntrenadaPromise = cargarRedEntrenada().catch(() => null); // NUEVA CARGA

        // 4. EJECUCIÓN PARALELA de heurística + 2 NNs
        const t_parallel = Date.now();

        // Heurística (síncrona) - PENDIENTE DE CORRECCIÓN (no necesita await)
        const resultadoHeuristica = ejecutarHeuristica(featuresCompartidos, flatExif, hallazgos, softwareStd, patrones);

        // NNs (espera ambas cargas y ejecuta inferencia)
        const [redEspejoNN, redEntrenadaNN] = await Promise.all([
            nnOriginalPromise,
            nnEntrenadaPromise // Espera aquí la nueva red
        ]);

        const resultadoNNOriginal = ejecutarInferenciaNN(featuresCompartidos, redEspejoNN);

        let resultadoNNEntrenadaScore = 0.5;
        if (redEntrenadaNN) {
            resultadoNNEntrenadaScore = redEntrenadaNN.activate(featuresCompartidos)[0] || 0.5;
        }

        const parallelTime = Date.now() - t_parallel;

        // 6. FUSIÓN DE TRES VOTOS (NUEVO PASO V6.3)
        const resultadoFusion = fusionarTresVotos(
            resultadoHeuristica,
            resultadoNNOriginal,
            resultadoNNEntrenadaScore
        );

        // 5. CONSOLIDACIÓN DE RESULTADOS (STANDARD V25)
        const processingTime = Date.now() - t0;

        // -----------------------------------------------------------------------
        // AJUSTE DE PESOS V6.1 (Jerarquía Forense)
        // Usamos el resultado de la Heurística para definir el peso,
        // pero usamos el resultado de la Fusión para el score final.
        // -----------------------------------------------------------------------
        let pesoVoto = "bajo"; // Por defecto (Inercia)

        // ... (El cálculo de pesoVoto basado en resultadoHeuristica se mantiene igual) ...
        // CASO 1: EVIDENCIA DE IA (VETO)
        if ((resultadoHeuristica.decision === "Artificial" && resultadoHeuristica.esIA) || resultadoHeuristica.score <= 1) {
            pesoVoto = "critico";
        }
        // CASO 2: EVIDENCIA DE EDICIÓN (ALTO)
        else if (resultadoHeuristica.esEdicion) {
            pesoVoto = "alto";
        }
        // CASO 3: DATOS DE SENSOR/CÁMARA (MEDIO)
        else if (resultadoHeuristica.score >= 8) {
            pesoVoto = "medio";
        }
        // CASO 4: SIN DATOS (BAJO)
        else {
            pesoVoto = "bajo";
        }
        // -----------------------------------------------------------------------

        // B. Configurar el Reporte Estándar
        reporte.definirVoto(
            // La decisión y el mensaje corto siguen siendo los de la Heurística (tu expertise)
            resultadoHeuristica.decision,
            resultadoFusion.confianza, // USAR CONFIANZA DE FUSIÓN V6.3
            resultadoFusion.score * 100, // USAR SCORE DE FUSIÓN V6.3 (0-100)
            pesoVoto
        );

        // C. Narrativa (Actualizar con la nueva NN)
        const iconoEstado = resultadoHeuristica.decision === 'Humano' ? '📷' :
                            (resultadoHeuristica.decision === 'Artificial' ? '🤖' : '⚠️');

        const estadoFinal = resultadoHeuristica.decision === 'Humano' ? 'success' :
                            (resultadoHeuristica.decision === 'Artificial' ? 'danger' : 'warning');

        reporte.concluir(
            estadoFinal,
            iconoEstado,
            resultadoHeuristica.mensajeCorto,
            // Explicación humana detallada:
            `El análisis de metadatos sugiere: ${resultadoHeuristica.mensajeCorto}. Concordancia: ${resultadoFusion.concordancia}.`,
            // Explicación técnica:
            `Heurística: ${resultadoHeuristica.score}/10. NN Original: ${resultadoNNOriginal.nn_decision} (${resultadoNNOriginal.nn_confianza.toFixed(2)}). NN Entrenada: ${resultadoNNEntrenadaScore.toFixed(2)}.`
        );

        // ... (El resto del código de reporte (D, E, F, G) se mantiene igual) ...

        // F. Datos Forenses Crudos
        reporte.datosForenses(resultadoFusion.score * 100, "Exif/XMP Analysis + Hybrid V6.3", {
            flat_exif: flatExif,
            features_nn: featuresCompartidos,
            nn_output_original: resultadoNNOriginal,
            nn_output_entrenada: resultadoNNEntrenadaScore // Nuevo output para debug
        });

        // ... (Retorno final) ...
        dragon.mideRendimiento('analisis_exif_hibrido_paralelo', processingTime, MODULE_NAME, {
            archivoId,
            decision: resultadoHeuristica.decision
        });

        return reporte.cerrar();

    } catch (error) {
        // Manejo de errores con el Builder (Seguro ante fallos)
        return reporte
            .definirVoto("Indeterminado", 0, 0, "bajo")
            .concluir("danger", "💥", "Error Exif", "No se pudieron leer los metadatos.", error.message)
            .cerrar();
    }
}


// Inicialización en background
cargarRedEspejo().catch(() => {});


export { analizarExif as analizarImagen };
export default analizarExif;
