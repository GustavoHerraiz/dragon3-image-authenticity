/**
 * DRAGON3 FAANG - ANALIZADOR PDF EXIF ENTERPRISE (Solo metadatos PDF estándar)
 * Autor: Gustavo Herraiz (Lead Architect)
 * Versión: 1.2.1-FAANG
 * Fecha: 2025-08-22
 * Descripción: Analizador de metadatos PDF estándar (EXIF) ultra eficiente. NO extrae XMP avanzado ni custom.
 * Métricas: P95 <180ms, Error rate <1%, Logging Dragon3 FAANG/Winston, auditabilidad total.
 * Dependencias: pdf-parse, fs/promises, dragonLogger.js, crypto
 * 
 * Parámetros de entrada (params):
 *   - rutaArchivo: Ruta absoluta al PDF a analizar
 *   - archivoId: ID único de archivo para trazabilidad
 *   - correlationId: ID para tracing end-to-end
 *   - nombreOriginal: Nombre original del archivo
 *   - usuarioId: ID del usuario (null si análisis público)
 *   - clientId: ID del cliente que solicita el análisis
 * 
 * Retorno (FAANG contract):
 *   - esAutentico: booleano (heurística sobre EXIF estándar)
 *   - confianza: score [0,1]
 *   - motivos: array priorizado (resumen + motivos principales)
 *   - modeloPrincipal: "EXIF"
 *   - etiquetas: ["pdf", "exif"]
 *   - mensaje: string breve del resultado
 *   - anomalías: array de anomalías detectadas
 *   - detalles: todos los metadatos extraídos y anomalías
 *   - processingTime: duración en ms
 *   - version, archivoId, correlationId, nombreOriginal, usuarioId, clientId, timestamp
 * 
 * Ejemplo de uso:
 *   const resultado = await analizarPdfExif(params);
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import dragon from '../../../utilidades/logger.js';

export const version = '1.2.1-FAANG';
export const dragonInterface = 'dragon3';
export const modeloPrincipal = 'EXIF';

/**
 * Construye explicación priorizada (máx 5) para metadatos PDF estándar.
 * @param {Object} info - Metadatos PDF infoDict
 * @param {Array} anomalías - Array de anomalías detectadas
 * @param {string} decision - "Humano", "Artificial", "Indeterminado"
 * @returns {Array} Motivos priorizados (resumen + motivos principales)
 */
function construirMotivos(info, anomalías, decision) {
    const motivos = [];

    // Motivo 1: Producer/Creator sospechoso
    if (info.Producer && /skia|chromium|midjourney|stable diffusion|firefly|leonardo|playground|dall.?e|diffusion/i.test(info.Producer + ' ' + (info.Creator || ''))) {
        motivos.push(`Producer ('${info.Producer}') y Creator ('${info.Creator || '-'}') típicos en generadores IA/web.`);
    }
    // Motivo 2: Campos clave vacíos
    if (!info.Author && !info.Title && !info.Keywords && !info.Subject) {
        motivos.push("Campos clave vacíos: Author, Title, Subject, Keywords; posible origen sintético.");
    }
    // Motivo 3: Fechas CreationDate/ModDate idénticas y recientes
    if (info.CreationDate && info.ModDate && info.CreationDate === info.ModDate) {
        motivos.push("Fechas CreationDate y ModDate idénticas; típico en generación automática.");
    }
    // Motivo 4: Anomalía registrada
    if (anomalías.length > 0) {
        motivos.push(`Anomalía registrada: ${anomalías[0]}`);
    }
    // Motivo 5: Sin fonts relevantes (débil, solo si no hay ya 5)
    if (motivos.length < 5 && (!info.fonts || info.fonts.length === 0)) {
        motivos.push("Sin fonts relevantes; posible generación sintética.");
    }

    motivos.splice(5); // máx 5

    // Resumen principal:
    let resumen = '';
    if (decision === 'Artificial') {
        resumen = "PDF clasificado como Artificial por productor/creador sospechosos y ausencia de autor.";
    } else if (decision === 'Humano') {
        resumen = "PDF clasificado como Humano por presencia de autor y editor humano.";
    } else {
        resumen = "PDF clasificado como Indeterminado por falta de evidencias claras de origen.";
    }
    return [resumen, ...motivos];
}

/**
 * Analiza los metadatos EXIF estándar de un PDF.
 * @param {Object} params - { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId }
 * @returns {Object} Resultado FAANG compatible con analizadorPDF.js
 */
export async function analizarPdfExif(params) {
    const {
        rutaArchivo,
        archivoId,
        correlationId,
        nombreOriginal,
        usuarioId,
        clientId
    } = params || {};
    const etiquetas = ["pdf", "exif"];
    const mensaje = "Análisis EXIF PDF estándar completado";
    const start = Date.now();

    if (!rutaArchivo || !archivoId) {
        const errorMsg = 'Faltan parámetros obligatorios en analizarPdfExif';
        dragon.agoniza(errorMsg, null, 'analizadorPdfExif', 'PARAMS_MISSING', { archivoId, correlationId, params });
        throw new Error(errorMsg);
    }

    dragon.sonrie(
        'Inicio análisis metadatos PDF estándar',
        'analizadorPdfExif',
        'ANALYSIS_START',
        { archivoId, correlationId, nombreOriginal, usuarioId, clientId, rutaArchivo }
    );

    let resultado;
    try {
        // === 1. Leer PDF y extraer metadatos estándar ===
        const buffer = await fs.readFile(rutaArchivo);
        const pdfData = await pdfParse(buffer);

        // === 2. Extraer SOLO metadatos PDF estándar ===
        const info = pdfData.info || {};
        const pageCount = pdfData.numpages || pdfData.numPages || null;
        const isEncrypted = pdfData.isEncrypted || false;
        const fonts = pdfData.fonts || [];
        const fileSize = buffer.length;

        // Hash SHA256 para trazabilidad
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');

        // === 3. Heurística de autenticidad y anomalías SOLO con metadatos estándar ===
        let esAutentico = true;
        let confianza = 0.92;
        let anomalías = [];
        let decision = "Indeterminado";

        // Heurísticas FAANG/KISS
        if (!info.Author || !info.CreationDate) {
            esAutentico = false;
            confianza -= 0.15;
            anomalías.push('Falta Author o CreationDate');
        }
        if (info.Producer && /AI|midjourney|stable diffusion|firefly|leonardo/i.test(info.Producer)) {
            esAutentico = false;
            confianza -= 0.35;
            anomalías.push('Producer IA detectado');
        }
        if (info.Keywords && /AI|Generated|Diffusion|Prompt|Seed/i.test(info.Keywords)) {
            esAutentico = false;
            confianza -= 0.10;
            anomalías.push('Keywords IA detectadas');
        }
        if (info.CreationDate) {
            const now = Date.now();
            const creationDate = Date.parse(info.CreationDate.replace('D:', ''));
            if (!isNaN(creationDate) && (now - creationDate < 60000)) {
                esAutentico = false;
                confianza -= 0.07;
                anomalías.push('CreationDate < 1min');
            }
        }
        if (
            info.Author && info.Author.length > 2 &&
            info.Creator && /(adobe|word|canon|acrobat)/i.test(info.Creator)
        ) {
            esAutentico = true;
            confianza = Math.max(confianza, 0.97);
            decision = "Humano";
        } else if (!esAutentico) {
            decision = "Artificial";
        }

        confianza = Math.max(0, Math.min(1, confianza));

        // === 4. Auditoría forense estándar ===
        const auditoriaForense = {
            title: info.Title || null,
            author: info.Author || null,
            subject: info.Subject || null,
            keywords: info.Keywords || null,
            creator: info.Creator || null,
            producer: info.Producer || null,
            creationDate: info.CreationDate || null,
            modDate: info.ModDate || null,
            trapped: info.Trapped || null,
            pdfFormatVersion: info.PDFFormatVersion || null,
            pageCount,
            isEncrypted,
            fonts: Array.isArray(fonts) ? fonts.map(f => f.name || f) : [],
            hash,
            fileSize,
            nombreOriginal,
            rutaArchivo,
            timestampAnalisis: new Date().toISOString(),
            usuarioId,
            archivoId,
            correlationId,
            clientId
        };

        // === 5. Motivos priorizados (array FAANG) ===
        const motivos = construirMotivos(info, anomalías, decision);

        // === 6. Detalles completos para auditoría FAANG ===
        const detalles = {
            info,
            anomalías,
            hash,
            fileSize,
            nombreOriginal,
            rutaArchivo,
            auditoriaForense,
            motivos
        };

        resultado = {
            esAutentico,
            confianza,
            motivos,                 // array
            modeloPrincipal,
            etiquetas,
            mensaje,
            anomalías,
            detalles,
            processingTime: Date.now() - start,
            version,
            archivoId,
            correlationId,
            nombreOriginal,
            usuarioId,
            clientId,
            timestamp: auditoriaForense.timestampAnalisis
        };

        // Logging FAANG Enterprise
        dragon.sonrie(
            'Análisis metadatos PDF estándar completado',
            'analizadorPdfExif',
            'ANALYSIS_SUCCESS',
            { archivoId, correlationId, resultado }
        );
        dragon.mideRendimiento(
            'analizarPdfExif',
            resultado.processingTime,
            'analizadorPdfExif',
            { archivoId, correlationId }
        );
        dragon.zen(
            'Motivos priorizados EXIF',
            'analizadorPdfExif',
            'EXPLANATION',
            { archivoId, correlationId, motivos }
        );

        return resultado;

    } catch (error) {
        dragon.agoniza(
            'Error en análisis PDF EXIF estándar',
            error,
            'analizadorPdfExif',
            'ANALYSIS_ERROR',
            { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId }
        );
        throw new Error(
            `Error análisis PDF EXIF: ${error.message}`,
            { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId }
        );
    }
}
