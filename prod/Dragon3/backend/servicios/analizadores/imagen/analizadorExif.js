/**
 * ================================================================================
 * DRAGON3 FAANG ENTERPRISE - ANALIZADOR EXIF/XMP/IPTC PARA IMÁGENES
 * ================================================================================
 * @file analizadorExif.js
 * @version 3.4.0-FAANG
 * @author Gustavo Herraiz (Lead Architect)
 * @date 2025-10-21
 * @description
 * Analizador robusto y auditable de metadatos EXIF, XMP e IPTC compatible con Dragon3.
 * - Entrada/salida estandar FAANG { rutaArchivo, archivoId, correlationId, ... }
 * - Logging estructurado Dragon (logger.js + winston.js) en todos los caminos (inicio, éxito, error, penalización)
 * - Error handling ultra-robusto (DragonError)
 * - Timeout defensivo de parsing configurable (default 250ms)
 * - Trazabilidad máxima: logging, hash, metadatos, razonamiento detallado
 * - Documentación exhaustiva y ejemplo de uso
 * - Test unitario recomendado en /tests/unitarios/test-analizadorExif.js
 *
 * Dependencias: exifr, dragonLogger, crypto, fs/promises
 *
 * Ejemplo de uso:
 *   const resultado = await analizarExif({
 *     rutaArchivo: '/var/www/Dragon3/uploads/imagenes/abc.jpg',
 *     archivoId: 'img123',
 *     correlationId: 'corr456',
 *     nombreOriginal: 'abc.jpg',
 *     usuarioId: 'user1',
 *     clientId: 'web'
 *   });
 *
 * Logs: /var/www/Dragon3/logs/*.log (buscar por archivoId/correlationId)
 *
 * SLA: P95 <250ms, error rate <1%, coverage >99% de casos reales
 * ================================================================================
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import dragon from '../../../../utilidades/logger.js';
import { DragonError } from '../../../../utilidades/errores/DragonError.js';

const ANALYZER_VERSION = '3.4.0-FAANG';
const MODULE_NAME = 'analizadorExif.js';
const TIMEOUT_MS = 250;

// Listas FAANG (ampliables según necesidades reales)
const softwareEdicion = [
    "photoshop","lightroom","gimp","affinity","paintshop","pixlr","luminar","capture one",
    "corel","photopea","canva","darktable","on1","photodirector"
];
const softwareIA = [
    "midjourney","dall-e","stable diffusion","dreamstudio","nightcafe","artbreeder","runwayml",
    "deepai","starryai","craiyon","bing image creator"
];
const camarasConocidas = [
    "canon","nikon","sony","fujifilm","olympus","panasonic","leica","pentax","apple",
    "samsung","google","huawei","xiaomi","oneplus","lg","motorola"
];

// Helpers KISS
const normalizeString = v => (v || '').toString().trim().toLowerCase();
const safe = (v, d='No disponible') => v !== undefined && v !== null ? v : d;
const formatISO = v => (v instanceof Date ? v.toISOString() : (v||'No disponible'));

/**
 * Analiza los metadatos EXIF/XMP/IPTC de una imagen.
 * @param {Object} params - { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId }
 * @returns {Promise<Object>} Resultado FAANG compatible
 */
export async function analizarExif(params) {
    const t0 = Date.now();
    const {
        rutaArchivo, archivoId, correlationId,
        nombreOriginal = null, usuarioId = null, clientId = null
    } = params || {};

    // Validación de entrada FAANG
    if (!rutaArchivo || !archivoId || !correlationId) {
        const error = new DragonError(
            'Parámetros obligatorios faltantes en analizadorExif',
            'PARAM_MISSING',
            'critical',
            'validation',
            { params }
        );
        dragon.agoniza('Faltan parámetros', error, MODULE_NAME, 'PARAM_MISSING', { archivoId, correlationId, nombreOriginal, usuarioId, clientId });
        throw error;
    }

    // Lectura segura del archivo
    let buffer;
    try {
        buffer = await fs.readFile(rutaArchivo);
    } catch (err) {
        const error = new DragonError(
            `No se puede leer el archivo: ${rutaArchivo}`,
            'FILE_READ_ERROR',
            'critical',
            'io',
            { rutaArchivo, archivoId, correlationId }
        );
        dragon.agoniza('No se puede leer el archivo', error, MODULE_NAME, 'FILE_READ_ERROR', { rutaArchivo, archivoId, correlationId });
        throw error;
    }

    dragon.sonrie('EXIF: Inicio análisis', MODULE_NAME, 'ANALYSIS_START', { archivoId, correlationId, nombreOriginal, usuarioId, clientId, rutaArchivo });

    // Importación defensiva de exifr (on-demand)
    let exifr;
    try {
        const imported = await import('exifr');
        exifr = imported.parse ? imported : imported.default && imported.default.parse ? imported.default : null;
        if (!exifr || typeof exifr.parse !== 'function') throw new Error('No se pudo importar exifr.parse');
        dragon.zen('EXIF: exifr importado correctamente', MODULE_NAME, 'DEPENDENCY_OK', { archivoId, correlationId });
    } catch (err) {
        // Logging y resultado parcial
        dragon.agoniza('Dependencia exifr no disponible', err, MODULE_NAME, 'DEPENDENCY_MISSING', { archivoId, correlationId, rutaArchivo });
        return {
            esAutentico: false,
            confianza: 0.1,
            detalles: {
                mensaje: 'No se pudo importar exifr. Resultado parcial.',
                error: 'DEPENDENCY_MISSING',
                rutaArchivo,
                archivoId,
                correlationId,
                nombreOriginal,
                usuarioId,
                clientId
            },
            processingTime: Date.now() - t0,
            version: ANALYZER_VERSION,
            archivoId,
            correlationId,
            nombreOriginal,
            usuarioId,
            clientId,
            timestamp: new Date().toISOString()
        };
    }

    // Hash SHA256 para trazabilidad
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Timeout defensivo para parsing EXIF
    let exifData = null;
    let exifParseTimedOut = false;
    let tiempoParseo = null;

    try {
        const exifParsePromise = (async () => {
            const tParseo = Date.now();
            const data = await exifr.parse(buffer, {
                xmp: true, iptc: true, jfif: true, gps: true, multiSegment: true
            });
            tiempoParseo = Date.now() - tParseo;
            return data;
        })();

        exifData = await Promise.race([
            exifParsePromise,
            new Promise((_, reject) => setTimeout(() => {
                exifParseTimedOut = true;
                reject(new DragonError(
                    `Timeout parsing EXIF (>${TIMEOUT_MS}ms)`,
                    'EXIF_TIMEOUT',
                    'high',
                    'performance',
                    { archivoId, correlationId }
                ));
            }, TIMEOUT_MS))
        ]);

    } catch (err) {
        dragon.agoniza('EXIF: Error parseando metadatos', err, MODULE_NAME, exifParseTimedOut ? 'EXIF_TIMEOUT' : 'PARSE_ERROR', { archivoId, correlationId, rutaArchivo });
        return {
            esAutentico: false,
            confianza: 0.15,
            detalles: {
                mensaje: exifParseTimedOut ? `Timeout parsing EXIF tras ${TIMEOUT_MS}ms, resultado parcial.` : 'Error crítico parseando EXIF, resultado parcial.',
                error: err?.message || (exifParseTimedOut ? 'EXIF_TIMEOUT' : 'PARSE_ERROR'),
                rutaArchivo,
                archivoId,
                correlationId,
                nombreOriginal,
                usuarioId,
                clientId
            },
            processingTime: Date.now() - t0,
            version: ANALYZER_VERSION,
            archivoId,
            correlationId,
            nombreOriginal,
            usuarioId,
            clientId,
            timestamp: new Date().toISOString()
        };
    }

    // === Lógica de análisis y score ===
    let detalles = {};
    let score = 0, confianza = 0.2;
    let esAutentico = false;
    let mensaje = 'Metadatos analizados.';
    let razonamiento = [];
    let tipoSoftware = "Desconocido";
    let camaraDetectada = "No disponible";
    let softwareDetectado = "No disponible";
    let dimensionesEXIF = "No disponible";
    let resolucion = "No disponible";

    if (!exifData || Object.keys(exifData).length === 0) {
        mensaje = 'No se encontraron metadatos relevantes';
        detalles = { mensaje, razonamiento: ['Sin metadatos EXIF/XMP/IPTC'] };
        esAutentico = false;
        confianza = 0.2;
        dragon.sePreocupa('EXIF: Sin metadatos relevantes', MODULE_NAME, 'ANALYSIS_EMPTY', { archivoId, correlationId, rutaArchivo });
    } else {
        // Normalización y heurística
        const make = normalizeString(exifData.Make);
        const model = normalizeString(exifData.Model);
        const camara = (make||model)?`${make} ${model}`.trim():'';
        const software = normalizeString(exifData.CreatorTool || exifData.Software);
        tipoSoftware =
            softwareIA.some(sw => software.includes(sw)) ? 'IA' :
            softwareEdicion.some(sw => software.includes(sw)) ? 'Edicion' :
            (software ? 'Otro' : 'Desconocido');
        camaraDetectada =
            camarasConocidas.some(c => camara.includes(c)) ? camara : (camara.length>2 ? camara : 'No disponible');
        softwareDetectado = software || "No disponible";
        dimensionesEXIF = (exifData.ExifImageWidth && exifData.ExifImageHeight)
            ? `${exifData.ExifImageWidth}x${exifData.ExifImageHeight}`
            : (exifData.ImageWidth && exifData.ImageHeight ? `${exifData.ImageWidth}x${exifData.ImageHeight}` : "No disponible");
        resolucion = (exifData.XResolution && exifData.YResolution)
            ? `${exifData.XResolution}x${exifData.YResolution}`
            : 'No disponible';

        // Lógica de score y confianza
        let currentScore = 6;
        let muchosMetadatos = Object.keys(exifData).length >= 18;
        let tieneCámara = camaraDetectada && camaraDetectada !== 'No disponible';
        let tieneFecha = !!(exifData.DateTimeOriginal || exifData.CreateDate || exifData.DateCreated);

        if (tieneCámara) { currentScore += 2; razonamiento.push("Cámara conocida detectada."); }
        if (muchosMetadatos) { currentScore += 1.5; razonamiento.push("Abundancia de metadatos EXIF."); }
        if (tieneFecha) { currentScore += 0.5; razonamiento.push("Fecha de captura disponible."); }
        if (tipoSoftware === "Edicion") {
            if (tieneCámara) {
                razonamiento.push("Edición detectada, pero cámara presente. No se penaliza.");
            } else {
                currentScore -= 1;
                razonamiento.push("Edición detectada SIN cámara. Penalización aplicada.");
            }
        }
        if (tipoSoftware === "IA") {
            currentScore -= 4;
            razonamiento.push("Software de IA detectado. Penalización fuerte aplicada.");
        }
        if (!tieneCámara && !tieneFecha && Object.keys(exifData).length < 8) {
            currentScore -= 2;
            razonamiento.push("Faltan datos clave en EXIF. Penalización aplicada.");
        }

        score = Math.max(0, Math.min(10, Math.round(currentScore * 10) / 10));
        confianza = Math.max(0.1, Math.min(1, score / 10));

        if (tipoSoftware === "IA") {
            mensaje = 'Metadatos sugieren posible generación por IA.';
            esAutentico = false;
        } else if (tieneCámara && (muchosMetadatos)) {
            mensaje = 'EXIF y estructura compatibles con captura humana.';
            esAutentico = true;
        } else if (tipoSoftware === "Edicion") {
            mensaje = 'Metadatos indican edición, pero no hay pruebas de manipulación significativa.';
            esAutentico = (confianza > 0.6);
        } else if (muchosMetadatos) {
            mensaje = 'EXIF plausible y abundante, sin señales de IA ni edición sospechosa.';
            esAutentico = true;
        } else {
            mensaje = 'EXIF insuficiente o ambiguo.';
            esAutentico = false;
        }

        detalles = {
            mensaje,
            razonamiento,
            softwareDetectado,
            camaraDetectada,
            tipoSoftware,
            dimensionesEXIF,
            resolucion,
            hash,
            fechaCaptura: formatISO(exifData.DateTimeOriginal),
            todosLosMetadatosExifParseados: exifData,
            score,
            confianza,
            tiempoParseo
        };

        // Penalización explícita logueada
        if (confianza < 0.5) {
            dragon.seEnfada(`EXIF penalizado: ${mensaje}`, MODULE_NAME, 'PENALIZATION', {
                archivoId, correlationId, score, confianza, razonamiento, tipoSoftware
            });
        } else {
            dragon.sonrie('EXIF: Metadatos procesados correctamente', MODULE_NAME, 'ANALYSIS_SUCCESS', { archivoId, correlationId });
        }
    }

    // Resultado FAANG estándar
    const processingTime = Date.now() - t0;
    const timestamp = new Date().toISOString();

    const resultado = {
        esAutentico,
        confianza,
        detalles,
        processingTime,
        version: ANALYZER_VERSION,
        archivoId,
        correlationId,
        nombreOriginal,
        usuarioId,
        clientId,
        timestamp
    };

    dragon.sonrie(
        `EXIF: Fin análisis. esAutentico: ${String(esAutentico)}, confianza: ${confianza}, tiempo: ${processingTime}ms.`,
        MODULE_NAME, 'ANALYSIS_END',
        { archivoId, correlationId, nombreOriginal, usuarioId, clientId, resultado }
    );
    dragon.mideRendimiento('analizarExif', processingTime, MODULE_NAME, { archivoId, correlationId });

    return resultado;
}

// Mantener export para analizadorImagen.js
export { analizarExif as analizarImagen };
export default analizarExif;
