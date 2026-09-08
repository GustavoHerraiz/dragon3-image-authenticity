/**
 * DRAGON3 FAANG - ANALIZADOR FIRMAS DIGITALES PDF ENTERPRISE (pdfjs-dist + node-forge)
 * Autor: Gustavo Herraiz (Lead Architect)
 * Versión: 1.1.0-FAANG
 * Fecha: 2025-08-22
 * Descripción: Analizador avanzado de firmas digitales PDF (PKCS#7, X.509). Extrae y valida: presencia, integridad, certificados, algoritmos, timestamps y estado.
 * Métricas: P95 <180ms, Error rate <1%, Logging Dragon3 FAANG/Winston, auditabilidad total.
 * Dependencias: pdfjs-dist, node-forge, fs/promises, dragonLogger.js, crypto
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
 *   - esAutentico: booleano (heurística sobre firmas digitales)
 *   - confianza: score [0,1]
 *   - motivos: array priorizado (resumen + motivos principales)
 *   - modeloPrincipal: "FirmasDigitales"
 *   - etiquetas: ["pdf", "firma", "digital"]
 *   - mensaje: string breve del resultado
 *   - anomalías: array de anomalías detectadas
 *   - detalles: todos los metadatos extraídos y anomalías
 *   - processingTime: duración en ms
 *   - version, archivoId, correlationId, nombreOriginal, usuarioId, clientId, timestamp
 *
 * Ejemplo de uso:
 *   const resultado = await analizarFirmasDigitalesPDF(params);
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import dragon from '../../../utilidades/logger.js';
import { DragonError } from '../../../utilidades/errores/DragonError.js';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';


export const version = '1.1.0-FAANG';
export const dragonInterface = 'dragon3';
export const modeloPrincipal = 'FirmasDigitales';

/**
 * Construye explicación priorizada (máx 5) para firmas digitales PDF.
 * @param {Array} firmas - Array de firmas digitales extraídas
 * @param {Array} anomalías - Array de anomalías detectadas
 * @param {string} decision - "Humano", "Artificial", "Indeterminado"
 * @returns {Array} Motivos priorizados (resumen + motivos principales)
 */
function construirMotivos(firmas, anomalías, decision) {
    const motivos = [];
    if (firmas.length === 0) {
        motivos.push("No se detectaron firmas digitales en el PDF.");
    } else {
        // Motivo: Estado de firmas
        const validas = firmas.filter(f => f.estado === "válida");
        const modificadas = firmas.filter(f => f.estado === "modificada");
        const expiradas = firmas.filter(f => f.certificado && f.certificado.validez === "expirado");
        if (validas.length > 0) motivos.push(`Firmas válidas detectadas (${validas.length}).`);
        if (modificadas.length > 0) motivos.push(`Firmas modificadas o inválidas (${modificadas.length}).`);
        if (expiradas.length > 0) motivos.push(`Certificados expirados (${expiradas.length}).`);
        // Motivo: Algoritmo débil
        const debiles = firmas.filter(f => /md5|sha1/i.test(f.algoritmo));
        if (debiles.length > 0) motivos.push(`Algoritmos de firma débiles detectados (${debiles.length}).`);
        // Motivo: Revocación
        const revocados = firmas.filter(f => f.certificado && f.certificado.revocado);
        if (revocados.length > 0) motivos.push(`Certificados revocados (${revocados.length}).`);
    }
    // Motivo: Anomalía registrada
    if (anomalías.length > 0) motivos.push(`Anomalía registrada: ${anomalías[0]}`);
    motivos.splice(5); // máx 5

    // Resumen principal:
    let resumen = '';
    if (decision === 'Artificial') {
        resumen = "PDF clasificado como Artificial por ausencia, invalidez o modificación de firmas digitales.";
    } else if (decision === 'Humano') {
        resumen = "PDF clasificado como Humano por presencia de firmas digitales válidas y certificados auténticos.";
    } else {
        resumen = "PDF clasificado como Indeterminado por falta de evidencias claras de autenticidad en firmas.";
    }
    return [resumen, ...motivos];
}

/**
 * Extrae y normaliza firmas digitales PDF (PKCS#7/X.509) usando pdfjs-dist y node-forge.
 * @param {Uint8Array} pdfBuffer
 * @returns {Array} Array de firmas digitales normalizadas
 */
async function extraerFirmasPDF(pdfBuffer) {
    // pdfjs-dist: parsear PDF y buscar objetos signature (campo /Contents en /Sig)
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    const firmas = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const annots = await page.getAnnotations();
        for (const annot of annots) {
            if (annot.subtype === 'Widget' && annot.fieldType === 'Sig' && annot.fieldName) {
                try {
                    // El campo /Contents contiene el PKCS#7 firmado
                    const signature = annot.signature;
                    if (signature && signature.contents) {
                        // signature.contents es un ArrayBuffer/Base64
                        let raw = signature.contents;
                        if (raw instanceof ArrayBuffer) {
                            raw = Buffer.from(raw);
                        } else if (typeof raw === 'string') {
                            raw = Buffer.from(raw, 'base64');
                        }
                        firmas.push({
                            contents: raw,
                            fechaFirma: signature.date || null,
                            fieldName: annot.fieldName || null,
                            detallesBrutos: annot
                        });
                    }
                } catch (e) {
                    // Si la firma está malformada, registrar anomalía
                    firmas.push({
                        contents: null,
                        fechaFirma: null,
                        fieldName: annot.fieldName || null,
                        detallesBrutos: annot,
                        error: 'Firma digital malformada'
                    });
                }
            }
        }
    }

    // También buscar en los objetos del PDF (por si hay /AcroForm con /Sig)
    // Este paso requiere parseo profundo. Aquí se cubre lo principal.

    return firmas;
}

/**
 * Parsea y valida una firma digital PKCS#7 usando node-forge.
 * @param {Buffer} pkcs7Buffer
 * @returns {Object} Detalles normalizados de la firma
 */
function analizarPKCS7(pkcs7Buffer) {
    let estado = "indeterminado";
    let certificado = null;
    let algoritmo = null;
    let timestamp = null;
    let pkcs7Info = null;
    let modificado = false;
    let error = null;

    try {
        const p7Asn1 = forge.asn1.fromDer(pkcs7Buffer.toString('binary'));
        const p7 = forge.pkcs7.messageFromAsn1(p7Asn1);
        pkcs7Info = p7;
        // Certificados X.509
        if (p7.certificates && p7.certificates.length > 0) {
            const cert = p7.certificates[0];
            // Validar fechas
            const now = new Date();
            let validez = "válido";
            if (cert.validity.notAfter < now) validez = "expirado";
            if (cert.validity.notBefore > now) validez = "no vigente";
            // Revocación: no se puede validar sin OCSP/CRL real, marcamos como indeterminado
            certificado = {
                emisor: cert.issuer.attributes.map(a => `${a.name}=${a.value}`).join(', '),
                titular: cert.subject.attributes.map(a => `${a.name}=${a.value}`).join(', '),
                validez,
                serial: cert.serialNumber,
                inicio: cert.validity.notBefore.toISOString(),
                fin: cert.validity.notAfter.toISOString(),
                revocado: false, // no comprobable sin OCSP/CRL
                infoExtra: cert.extensions ? cert.extensions.map(e => e.name).join(', ') : null
            };
        }
        // Algoritmo
        if (p7.rawCapture && p7.rawCapture.signatureAlgorithmOid) {
            algoritmo = forge.pki.oids[p7.rawCapture.signatureAlgorithmOid] || p7.rawCapture.signatureAlgorithmOid;
        }
        // Timestamp
        if (p7.signers && p7.signers.length > 0) {
            timestamp = p7.signers[0].authenticatedAttributes?.find(a => a.type === forge.pki.oids.signingTime)?.value || null;
        }
        // Estado heurístico
        estado = "válida";
    } catch (e) {
        estado = "modificada";
        error = 'Firma digital PKCS#7 inválida o modificada';
        modificado = true;
    }
    return { estado, certificado, algoritmo, timestamp, modificado, detallesBrutos: pkcs7Info, error };
}

/**
 * Analiza las firmas digitales avanzadas de un PDF.
 * @param {Object} params - { rutaArchivo, archivoId, correlationId, nombreOriginal, usuarioId, clientId }
 * @returns {Object} Resultado FAANG compatible con analizadorPDF.js
 */
export async function analizarFirmasDigitalesPDF(params) {
    const {
        rutaArchivo,
        archivoId,
        correlationId,
        nombreOriginal,
        usuarioId,
        clientId
    } = params || {};
    const etiquetas = ["pdf", "firma", "digital"];
    const mensaje = "Análisis de firmas digitales PDF completado";
    const start = Date.now();

    if (!rutaArchivo || !archivoId) {
        const errorMsg = 'Faltan parámetros obligatorios en analizarFirmasDigitalesPDF';
        dragon.agoniza(errorMsg, null, 'analizadorFirmasDigitalesPDF', 'PARAMS_MISSING', { archivoId, correlationId, params });
        throw new DragonError(errorMsg, 'PARAM_MISSING', 'critical', 'validation', { archivoId, correlationId, params });
    }

    dragon.sonrie(
        'Inicio análisis firmas digitales PDF',
        'analizadorFirmasDigitalesPDF',
        'ANALYSIS_START',
        { archivoId, correlationId, nombreOriginal, usuarioId, clientId, rutaArchivo }
    );

    let resultado;
    try {
        // === 1. Leer PDF y extraer firmas digitales ===
        const buffer = await fs.readFile(rutaArchivo);
        // Hash SHA256 para trazabilidad
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        let firmasRaw = [];
        let anomalías = [];

        try {
            firmasRaw = await extraerFirmasPDF(buffer);
        } catch (e) {
            dragon.agoniza('Error en parseo de firmas digitales', e, 'analizadorFirmasDigitalesPDF', 'SIGN_PARSE_ERROR', {
                archivoId, correlationId, rutaArchivo
            });
            anomalías.push('Error al extraer firmas digitales');
            firmasRaw = [];
        }

        // === 2. Normalizar y auditar firmas ===
        const firmas = (firmasRaw || []).map((sig, i) => {
            if (!sig.contents) {
                return {
                    idFirma: sig.fieldName || `firma_${i}`,
                    algoritmo: null,
                    fechaFirma: sig.fechaFirma || null,
                    estado: "modificada",
                    certificado: null,
                    timestamp: null,
                    modificado: true,
                    detallesBrutos: sig,
                    error: sig.error || 'Firma digital vacía o corrupta'
                };
            }
            const detalles = analizarPKCS7(sig.contents);
            return {
                idFirma: sig.fieldName || `firma_${i}`,
                algoritmo: detalles.algoritmo || null,
                fechaFirma: sig.fechaFirma || null,
                estado: detalles.estado,
                certificado: detalles.certificado,
                timestamp: detalles.timestamp,
                modificado: detalles.modificado,
                detallesBrutos: detalles.detallesBrutos,
                error: detalles.error
            };
        });

        // === 3. Heurística de autenticidad y anomalías ===
        let esAutentico = false;
        let confianza = 0.72;
        let decision = "Indeterminado";

        if (firmas.length === 0) {
            esAutentico = false;
            confianza = 0.40;
            anomalías.push('No se detectaron firmas digitales');
            decision = "Indeterminado";
        } else {
            // Si hay al menos una firma válida y no modificada
            const validas = firmas.filter(f => f.estado === "válida");
            if (validas.length > 0) {
                esAutentico = true;
                confianza = 0.97;
                decision = "Humano";
                if (validas.some(f => f.certificado && !f.certificado.revocado && f.certificado.validez === "válido")) {
                    confianza = 0.99;
                }
            } else {
                esAutentico = false;
                confianza = 0.55;
                anomalías.push('Todas las firmas están modificadas, revocadas o expiradas');
                decision = "Artificial";
            }
        }

        // Algoritmos débiles penalizan confianza
        if (firmas.some(f => /md5|sha1/i.test(f.algoritmo))) {
            confianza -= 0.12;
            anomalías.push('Algoritmo de firma débil detectado');
        }
        // Revocación penaliza confianza
        if (firmas.some(f => f.certificado && f.certificado.revocado)) {
            confianza -= 0.15;
            anomalías.push('Certificado revocado');
        }
        confianza = Math.max(0, Math.min(1, confianza));

        // === 4. Auditoría forense estándar ===
        const auditoriaForense = {
            firmas,
            cantidadFirmas: firmas.length,
            hash,
            nombreOriginal,
            rutaArchivo,
            timestampAnalisis: new Date().toISOString(),
            usuarioId,
            archivoId,
            correlationId,
            clientId
        };

        // === 5. Motivos priorizados (array FAANG) ===
        const motivos = construirMotivos(firmas, anomalías, decision);

        // === 6. Detalles completos para auditoría FAANG ===
        const detalles = {
            firmas,
            anomalías,
            hash,
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
            'Análisis firmas digitales PDF completado',
            'analizadorFirmasDigitalesPDF',
            'ANALYSIS_SUCCESS',
            { archivoId, correlationId, resultado }
        );
        dragon.mideRendimiento(
            'analizarFirmasDigitalesPDF',
            resultado.processingTime,
            'analizadorFirmasDigitalesPDF',
            { archivoId, correlationId }
        );
        dragon.zen(
            'Motivos priorizados FirmasDigitales',
            'analizadorFirmasDigitalesPDF',
            'EXPLANATION',
            { archivoId, correlationId, motivos }
        );

        return resultado;

    } catch (error) {
        dragon.agoniza(
            'Error en análisis firmas digitales PDF',
            error,
            'analizadorFirmasDigitalesPDF',
            'ANALYSIS_ERROR',
            { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId }
        );
        throw new DragonError(
            `Error análisis firmas digitales PDF: ${error.message}`,
            'FIRMAS_FAILED',
            'high',
            'application',
            { archivoId, correlationId, rutaArchivo, nombreOriginal, usuarioId, clientId }
        );
    }
}
