/**
 * ===============================================================================
 * DRAGON3 FAANG ENTERPRISE - ANALIZADOR DE FIRMAS DIGITALES Y HUELLAS AI
 * ===============================================================================
 * @file analizadorFirmasDigitales.js
 * @version 3.4.0-FAANG
 * @author Gustavo Herraiz - Lead Architect Dragon Project
 * @date 2025-10-21
 * @path /var/www/Dragon3/backend/servicios/imagen/analizadores/imagen/analizadorFirmasDigitales.js
 *
 * @description
 * Analizador determinístico y forense que detecta y clasifica firmas digitales en imágenes:
 * - Huellas de generadores de IA (Midjourney, DALL-E, Stable Diffusion, Firefly, etc.)
 * - Content Credentials (C2PA/CAI): distingue origen humano vs. IA
 * - Sellos de verificación (MBH, Dragon, Truepic, etc.)
 * - Firmas de software de edición
 *
 * Cumple los estándares FAANG Enterprise:
 * - Entrada/salida estandar FAANG (params, output auditable)
 * - Logging estructurado (logger.js + winston.js) en todos los caminos
 * - Error handling robusto (DragonError)
 * - Performance: P95 <200ms (timeout defensivo en Exiftool)
 * - Documentación exhaustiva y ejemplo de uso
 *
 * @requires dragon (logger.js), exifr, exiftool-vendored
 * @implements AnalizadorImagen interface
 *
 * Ejemplo de uso:
 *   const resultado = await analizarFirmasDigitales({
 *     rutaArchivo: '/var/www/Dragon3/uploads/imagenes/ai.png',
 *     archivoId: 'imgAI',
 *     correlationId: 'corr789',
 *     nombreOriginal: 'ai.png',
 *     usuarioId: 'user1',
 *     clientId: 'web'
 *   });
 * Logs: /var/www/Dragon3/logs/dragon.log (buscar por archivoId/correlationId)
 * ===============================================================================
 */

import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dragon from '../../../../utilidades/logger.js';
import { DragonError } from '../../../../utilidades/errores/DragonError.js';
import exifr from 'exifr';
import { exiftool } from 'exiftool-vendored';

const ANALYZER_VERSION = '3.4.0-FAANG';
const MODULE_NAME = 'analizadorFirmasDigitales.js';
const TIMEOUT_EXIFTOOL_MS = 1500;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PATRONES_PATH = path.join(__dirname, 'analizadorHerramientasSospechosas.json');

let patrones = {
    softwareEdicion: [],
    softwareGeneracionIA: [],
    softwareGenerico: [],
    sellosVerificacion: [],
    marcasIA: [],
    marcasC2PA: []
};

function cargarPatrones() {
    try {
        if (existsSync(PATRONES_PATH)) {
            const patronesRaw = readFileSync(PATRONES_PATH, 'utf8');
            patrones = JSON.parse(patronesRaw);
            dragon.respira('Patrones de firmas digitales cargados', MODULE_NAME, 'CARGA_PATRONES', {
                edicion: patrones.softwareEdicion.length,
                ia: patrones.softwareGeneracionIA.length,
                generico: patrones.softwareGenerico.length,
                sellos: patrones.sellosVerificacion.length,
                marcasIA: patrones.marcasIA?.length || 0,
                marcasC2PA: patrones.marcasC2PA?.length || 0
            });
        } else {
            dragon.sePreocupa('Archivo de patrones no encontrado', MODULE_NAME, 'CARGA_PATRONES', { ruta: PATRONES_PATH });
        }
    } catch (error) {
        dragon.agoniza('Error al cargar patrones', error, MODULE_NAME, 'CARGA_PATRONES', { ruta: PATRONES_PATH });
    }
}
cargarPatrones();

/**
 * Verifica si un texto coincide con algún patrón de la lista (regex).
 */
function coincideConPatron(valor, patronesArray, patternType) {
    if (!valor || !Array.isArray(patronesArray) || patronesArray.length === 0) return false;
    return patronesArray.some(patron => {
        try {
            return new RegExp(patron, "i").test(valor);
        } catch (regexError) {
            dragon.sePreocupa(`Patrón inválido: "${patron}"`, MODULE_NAME, 'coincideConPatron', {
                patron, tipo: patternType, error: regexError.message
            });
            return false;
        }
    });
}

/**
 * Convierte score (0-10) a confianza (0-1)
 */
const scoreAConfianza = score => {
    if (score === null || score === undefined) return 0.5;
    return parseFloat((Math.min(10, Math.max(0, score)) / 10).toFixed(2));
};

/**
 * Analiza firmas digitales y huellas AI en una imagen.
 * @param {Object} params - { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId }
 * @returns {Promise<Object>} Resultado FAANG estructurado
 */
export async function analizarFirmasDigitales(params) {
    const {
        rutaArchivo, archivoId, correlationId,
        nombreOriginal = null, usuarioId = null, clientId = null
    } = params || {};
    const start = Date.now();

    if (!rutaArchivo || !archivoId || !correlationId) {
        const error = new DragonError(
            'Faltan parámetros obligatorios',
            'PARAM_MISSING',
            'critical',
            'validation',
            { params }
        );
        dragon.agoniza('Faltan parámetros', error, MODULE_NAME, 'ANALYSIS_ERROR', { archivoId, correlationId });
        throw error;
    }

    dragon.sonrie('Inicio análisis firmas digitales', MODULE_NAME, 'ANALYSIS_START', { archivoId, correlationId, nombreOriginal, usuarioId, clientId, rutaArchivo });

    try {
        if (!existsSync(rutaArchivo)) {
            throw new DragonError(
                `Archivo no encontrado: ${rutaArchivo}`,
                'FILE_NOT_FOUND',
                'critical',
                'io',
                { rutaArchivo, archivoId, correlationId }
            );
        }

        // Inicializar resultado
        let resultado = {
            esAutentico: false,
            confianza: 0.5,
            idAnalizador: MODULE_NAME,
            version: ANALYZER_VERSION,
            detalles: {
                hayFirmaDigital: false,
                tipoFirmaDigital: "desconocida",
                esConfiable: null,
                mensaje: "Análisis en proceso..."
            },
            metadatos: {},
            metadatosXMP_IPTC: {},
            contentCredentials: null,
            archivoId,
            correlationId,
            nombreOriginal,
            usuarioId,
            clientId,
            timestamp: new Date().toISOString()
        };

        // --- Extracción de metadatos (parallel) ---
        const exifPromise = exifr.parse(rutaArchivo).catch(err => {
            dragon.sePreocupa('Error en exifr.parse', MODULE_NAME, 'EXIFR_PARSE_ERROR', { archivoId, error: err.message });
            return {};
        });
        const exiftoolPromise = Promise.race([
            exiftool.read(rutaArchivo).catch(err => {
                dragon.sePreocupa('Error en exiftool.read', MODULE_NAME, 'EXIFTOOL_ERROR', { archivoId, error: err.message });
                return {};
            }),
            new Promise((_, reject) => setTimeout(() => reject(new DragonError(
                `Timeout en exiftool tras ${TIMEOUT_EXIFTOOL_MS}ms`,
                'EXIFTOOL_TIMEOUT',
                'high',
                'performance',
                { archivoId, correlationId }
            )), TIMEOUT_EXIFTOOL_MS)
            ).catch(err => {
                dragon.sePreocupa('Timeout exiftool', MODULE_NAME, 'EXIFTOOL_TIMEOUT', { archivoId, timeoutMs: TIMEOUT_EXIFTOOL_MS });
                return {};
            })
        ]);
        const [exif, metadatosAvanzados] = await Promise.all([exifPromise, exiftoolPromise]);

        // --- Metadatos XMP/IPTC ---
        resultado.metadatosXMP_IPTC = {
            creatorTool: metadatosAvanzados.CreatorTool || metadatosAvanzados['XMP:CreatorTool'] || null,
            history: metadatosAvanzados.HistorySoftwareAgent || metadatosAvanzados['XMP:HistorySoftwareAgent'] || null,
            rights: metadatosAvanzados.XMPRights || metadatosAvanzados['XMP:Rights'] || null,
            description: metadatosAvanzados.Description || metadatosAvanzados['XMP:Description'] || null,
            byline: metadatosAvanzados.Byline || metadatosAvanzados['IPTC:By-line'] || null,
            copyrightNotice: metadatosAvanzados.CopyrightNotice || metadatosAvanzados['IPTC:CopyrightNotice'] || null
        };

        // --- Content Credentials (C2PA/CAI) ---
        const contentCredentialsFields = [
            'XMP-xmpMM:ContentCredentials', 'XMP:ContentCredentials', 'ContentCredentials', 'XMP-xmp:Manifest', 'Manifest'
        ];
        for (const field of contentCredentialsFields) {
            if (metadatosAvanzados[field]) {
                resultado.contentCredentials = metadatosAvanzados[field];
                dragon.respira('Content Credentials detectados', MODULE_NAME, 'CONTENT_CREDENTIALS_DETECTED', { archivoId, field });
                break;
            }
        }

        // --- Huellas AI y marcas C2PA ---
        let huellaAIEncontrada = false;
        let patronAIDetectado = '';
        let marcasAI = [];
        let c2paDetected = false;
        let c2paField = '';

        // Buscar marcas AI/C2PA en todos los campos
        for (const campo in metadatosAvanzados) {
            if (coincideConPatron(metadatosAvanzados[campo], patrones.marcasC2PA, "marcasC2PA")) {
                c2paDetected = true; c2paField = campo;
            }
            if (coincideConPatron(metadatosAvanzados[campo], patrones.marcasIA, "marcasIA")) {
                huellaAIEncontrada = true;
                marcasAI.push(metadatosAvanzados[campo]);
                patronAIDetectado = marcasAI[0] || '';
            }
        }

        // Concatenar campos para patrón de IA/software
        const camposConcatenados = [
            exif?.Software, exif?.Make, exif?.Model, exif?.Artist, exif?.DocumentName, exif?.ImageDescription, exif?.Copyright,
            resultado.metadatosXMP_IPTC.creatorTool, resultado.metadatosXMP_IPTC.history,
            resultado.metadatosXMP_IPTC.rights, resultado.metadatosXMP_IPTC.description,
            resultado.metadatosXMP_IPTC.byline, resultado.metadatosXMP_IPTC.copyrightNotice
        ].filter(Boolean).join(" | ").toLowerCase();

        // Detectar marcas AI por software/firmas
        if (!huellaAIEncontrada && coincideConPatron(camposConcatenados, patrones.softwareGeneracionIA, "softwareGeneracionIA")) {
            huellaAIEncontrada = true;
            patronAIDetectado = camposConcatenados;
        }
        if (!huellaAIEncontrada && coincideConPatron(camposConcatenados, patrones.marcasIA, "marcasIA")) {
            huellaAIEncontrada = true;
            patronAIDetectado = camposConcatenados;
        }

        // --- SNIPPET FAANG: DISTINCIÓN C2PA HUMANA VS IA ---
        let c2paOrigen = null;
        let c2paEsIA = false;

        if (resultado.contentCredentials) {
            let cred = resultado.contentCredentials;
            if (typeof cred === 'string') {
                try { cred = JSON.parse(cred); } catch {}
            }
            c2paOrigen =
                cred?.issuer ||
                cred?.generator ||
                cred?.software ||
                cred?.signedBy ||
                cred?.Producer ||
                cred?.ProducerAgent ||
                null;
            const c2paOrigenNorm = (c2paOrigen || '').toString().toLowerCase();
            const patronesC2PA_IA = [
                "dall-e", "dalle", "dall·e", "openai", "firefly", "adobe", "stable diffusion", "midjourney", "runway", "leonardo", "playground", "ai", "diffusion"
            ];
            c2paEsIA = patronesC2PA_IA.some(pat => c2paOrigenNorm.includes(pat));
        }

        // ================== BLOQUE DE DECISIÓN ORDENADO ==================
        let tipoFirma = "desconocida";
        let esConfiable = null;
        let mensaje = "";
        let score = 5;

        // ---- PRIORIDAD 1: C2PA (Humana o IA) ----
        if (c2paDetected || resultado.contentCredentials) {
            tipoFirma = c2paEsIA ? "ia-c2pa" : "c2pa";
            esConfiable = !c2paEsIA;
            if (c2paEsIA) {
                mensaje = `Imagen generada por IA. Content Credentials (C2PA) detectadas: origen IA (${c2paOrigen || "desconocido"}).`;
                score = 0;
                resultado.detalles.hayFirmaDigital = true;
                dragon.seEnfada(
                    `C2PA IA detectada (${c2paOrigen || "desconocido"})`,
                    MODULE_NAME,
                    'C2PA_IA_DETECTED',
                    { archivoId, c2paOrigen, contentCredentials: resultado.contentCredentials }
                );
            } else {
                mensaje = "C2PA/CAI Content Credentials detectadas. Alta probabilidad de autenticidad humana.";
                score = 10;
                resultado.detalles.hayFirmaDigital = true;
                dragon.sonrie('C2PA humana detectada', MODULE_NAME, 'C2PA_HUMAN_DETECTED', { archivoId, c2paOrigen });
            }
            resultado.detalles.c2paOrigen = c2paOrigen;
            resultado.detalles.c2paEsIA = c2paEsIA;
        }
        // ---- PRIORIDAD 2: Huella AI ----
        else if (huellaAIEncontrada) {
            tipoFirma = "ia";
            esConfiable = false;
            mensaje = "Imagen generada por IA. Huella AI detectada en metadatos/firma digital.";
            score = 0;
            resultado.detalles.hayFirmaDigital = true;
            resultado.detalles.patronAI = patronAIDetectado;
            resultado.detalles.marcasAI = marcasAI;
            dragon.seEnfada(`Huella AI detectada: ${patronAIDetectado}`, MODULE_NAME, 'AI_SIGNATURE_DETECTED', { archivoId, patronAIDetectado, marcasAI });
        }
        // ---- PRIORIDAD 3: Marcas IA por patrones generales ----
        else if (coincideConPatron(camposConcatenados, patrones.marcasIA, "marcasIA")) {
            tipoFirma = "ia";
            esConfiable = false;
            mensaje = "Imagen generada por IA. Marca AI detectada en software o metadatos.";
            score = 0;
            resultado.detalles.hayFirmaDigital = true;
            resultado.detalles.patronAI = patronAIDetectado;
            dragon.seEnfada(`Marca IA detectada en software/metadatos`, MODULE_NAME, 'AI_MARK_DETECTED', { archivoId, patronAIDetectado });
        }
        // ---- PRIORIDAD 4: Sellos de verificación ----
        else if (coincideConPatron(camposConcatenados, patrones.sellosVerificacion, "sellosVerificacion")) {
            tipoFirma = "sello";
            esConfiable = true;
            mensaje = "Sello de verificación reconocido (MBH, Dragon, Truepic, etc).";
            score = 10;
            resultado.detalles.hayFirmaDigital = true;
            dragon.sonrie('Sello verificación reconocido', MODULE_NAME, 'SEAL_DETECTED', { archivoId });
        }
        // ---- PRIORIDAD 5: Firma "generica" de dispositivo ----
        else if (coincideConPatron(camposConcatenados, patrones.softwareGenerico, "softwareGenerico")) {
            tipoFirma = "generica";
            esConfiable = true;
            mensaje = "Firma digital compatible con dispositivo de captura genuino.";
            score = 8;
            resultado.detalles.hayFirmaDigital = true;
            dragon.sonrie('Firma digital de dispositivo genuino', MODULE_NAME, 'GENERIC_SIGNATURE_DETECTED', { archivoId });
        }
        // ---- PRIORIDAD 6: Software de edición ----
        else if (coincideConPatron(camposConcatenados, patrones.softwareEdicion, "softwareEdicion")) {
            tipoFirma = "edicion";
            esConfiable = null;
            mensaje = "Imagen editada con software profesional. No implica IA, pero ha sido modificada.";
            score = 5;
            resultado.detalles.hayFirmaDigital = true;
            dragon.sePreocupa('Software de edición detectado', MODULE_NAME, 'EDIT_SOFTWARE_DETECTED', { archivoId });
        }
        // ---- PRIORIDAD 7: No hay firma digital reconocible ----
        else {
            tipoFirma = "desconocida";
            esConfiable = null;
            mensaje = "No se detecta firma digital reconocible. No se puede determinar origen.";
            score = 4;
            dragon.sePreocupa('No se detecta firma digital reconocible', MODULE_NAME, 'NO_SIGNATURE_DETECTED', { archivoId });
        }

        // ================== CONSTRUIR RESULTADO FINAL ==================
        resultado.detalles.tipoFirmaDigital = tipoFirma;
        resultado.detalles.esConfiable = esConfiable;
        resultado.detalles.mensaje = mensaje;
        resultado.detalles.c2paDetected = c2paDetected;
        resultado.detalles.c2paField = c2paField;

        resultado.confianza = scoreAConfianza(score);
        resultado.esAutentico = esConfiable === true;

        resultado.metadatos = {
            software: exif?.Software || resultado.metadatosXMP_IPTC.creatorTool || null,
            make: exif?.Make || null,
            model: exif?.Model || null,
            copyright: exif?.Copyright || resultado.metadatosXMP_IPTC.copyrightNotice || null,
            artist: exif?.Artist || resultado.metadatosXMP_IPTC.byline || null,
            documentName: exif?.DocumentName || null,
            selloDetectado: tipoFirma === "sello",
            creatorToolXMP: resultado.metadatosXMP_IPTC.creatorTool || null,
            historySoftwareAgentXMP: resultado.metadatosXMP_IPTC.history || null,
            c2paDetected,
            c2paField,
            huellaAIEncontrada,
            patronAIDetectado,
            marcasAI,
            c2paOrigen,
            c2paEsIA,
            scoreOriginal: score
        };

        const processingTime = Date.now() - start;
        resultado.processingTime = processingTime;
        resultado.timestamp = new Date().toISOString();

        dragon.mideRendimiento('analizarFirmasDigitales', processingTime, MODULE_NAME, { archivoId, correlationId, tipoFirma, esConfiable, huellaAIEncontrada });

        dragon.sonrie('Análisis firmas digitales completado', MODULE_NAME, 'ANALYSIS_SUCCESS', {
            archivoId, correlationId, processingTime, tipoFirma, esConfiable, huellaAIEncontrada
        });

        return resultado;

    } catch (error) {
        dragon.agoniza('Error en análisis firmas digitales', error, MODULE_NAME, 'ANALYSIS_ERROR', { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId });
        throw new DragonError(
            `Error análisis firmas digitales: ${error.message}`,
            'FIRMAS_ANALYSIS_FAILED',
            'high',
            'application',
            { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId }
        );
    }
}

// Exportar para integración Dragon3
export { analizarFirmasDigitales as analizarImagen };
export default analizarFirmasDigitales;

/**
 * ===================== EJEMPLO DE USO Y LOGS ==========================
 * const resultado = await analizarFirmasDigitales({
 *   rutaArchivo: '/var/www/Dragon3/uploads/imagenes/ai.png',
 *   archivoId: 'imgAI',
 *   correlationId: 'corr789',
 *   nombreOriginal: 'ai.png',
 *   usuarioId: 'user1',
 *   clientId: 'web'
 * });
 * // Logs en: /var/www/Dragon3/logs/dragon.log (buscar por archivoId/correlationId)
 *
 * // Ejemplo de resultado con huella AI detectada:
 * {
 *   esAutentico: false,
 *   confianza: 0.0,
 *   detalles: {
 *     hayFirmaDigital: true,
 *     tipoFirmaDigital: "ia-c2pa" | "ia",
 *     esConfiable: false,
 *     mensaje: "Imagen generada por IA. Content Credentials (C2PA) detectadas: origen IA (DALL-E 3, Firefly, etc.).",
 *     patronAI: "stable diffusion xl"
 *   },
 *   metadatos: {
 *     software: "Stable Diffusion XL",
 *     make: null,
 *     model: null,
 *     huellaAIEncontrada: true,
 *     patronAIDetectado: "stable diffusion xl",
 *     c2paOrigen: "DALL-E 3",
 *     c2paEsIA: true
 *   },
 *   archivoId: "imgAI",
 *   correlationId: "corr789",
 *   processingTime: 144,
 *   version: "3.4.0-FAANG",
 *   timestamp: "2025-10-21T08:03:49.000Z"
 * }
 * ============================================================================
 */
