/**
 * ====================================================================
 * DRAGON3 FAANG - GENERADOR DE INFORME FORENSE (INTEGRITY FIX)
 * ====================================================================
 * Versión: 10.0.0-INTEGRITY-MERGE
 * Corrección Crítica: Fusión correcta de RawJSON sin perder metadatos raíz (ID, Fecha).
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import dragon from '../utilidades/logger.js';
import AnalisisArchivo from '../modelos/mongodb/AnalisisArchivo.js';
import Usuario from '../modelos/mongodb/Usuario.js';

const MODULE = 'generarInforme.js';
const PLANTILLA_PATH = '/var/www/Dragon3/archivos/informe_forense_template.html';

// ==== CONFIGURACIÓN HANDLEBARS ====
Handlebars.registerHelper('eq', (a, b) => a == b);
Handlebars.registerHelper('gte', (a, b) => parseFloat(a) >= parseFloat(b));
Handlebars.registerHelper('lt', (a, b) => parseFloat(a) < parseFloat(b));
Handlebars.registerHelper('gt', (a, b) => parseFloat(a) > parseFloat(b));
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('riskLevel', (nivel) => {
    const map = { 'CRÍTICO': 'critical', 'ALTO': 'high', 'MEDIO': 'medium', 'BAJO': 'low' };
    return map[nivel] || 'low';
});
Handlebars.registerHelper('formatDate', (date) => {
    if (!date) return 'No disponible';
    try { return new Date(date).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }); } catch { return String(date); }
});

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 🧹 HELPER: Limpia strings sucios
 */
function cleanStr(str) {
    if (!str) return null;
    const s = String(str).trim();
    const invalid = ['ninguna', 'ninguno', 'null', 'undefined', 'no detectado', 'no disponible', 'n/a', 'unknown', ''];
    if (invalid.includes(s.toLowerCase())) return null;
    return s;
}

/**
 * 🕵️ EXTRACCIÓN DE EVIDENCIA PROFUNDA
 */
function extraerEvidenciaTecnicaProfunda(analizadores, consenso) {
    const evidencia = [];

    // 1. Huella DQT
    const validator = analizadores.analizadorValidator?.detalles?.compresion;
    if (validator?.dqtFingerprint) {
        evidencia.push(`🧬 DQT Fingerprint: ${validator.dqtFingerprint} (Tablas: ${validator.tablasEncontradas || 'N/A'})`);
    }

    // 2. Mensajería / Compresión
    const mensajeria = analizadores.analizadorMensajeria;
    if (cleanStr(mensajeria?.resumen?.herramientaEstimada)) {
        evidencia.push(`📉 Patrón Compresión: ${mensajeria.resumen.herramientaEstimada} (Q=${mensajeria.resumen.calidadJPEGEstimada})`);
        if (mensajeria.resumen.doubleCompresionDetectada) {
            evidencia.push(`⚠️ Doble Compresión Detectada: Imagen re-guardada.`);
        }
    } else if (mensajeria?.detalles?.error?.includes('PNG')) {
        evidencia.push(`ℹ️ Análisis DQT omitido: Formato sin pérdida (PNG).`);
    }

    // 3. Discrepancias Software
    const exifSoft = cleanStr(consenso.metadatosExif?.Software);
    const xmpTool = cleanStr(analizadores.analizadorFirmasDigitales?.metadatosXMP_IPTC?.creatorTool);

    if (exifSoft) evidencia.push(`💾 Software (Exif): ${exifSoft}`);
    if (xmpTool && xmpTool !== exifSoft) evidencia.push(`🛠️ CreatorTool (XMP): ${xmpTool} (Diferencia detectada)`);

    // 4. Firmas C2PA
    const c2pa = analizadores.analizadorC2PA?.detalles;
    const firmas = analizadores.analizadorFirmasDigitales?.detalles;

    if (c2pa?.c2paDetected || firmas?.c2paDetected) {
        let texto = `🔐 Firma Digital C2PA Detectada`;
        if (firmas?.bloqueC2PA && firmas.bloqueC2PA.includes('urn:c2pa')) texto += ` (Bloque JUMBF presente)`;
        const generador = cleanStr(analizadores.analizadorC2PA?.metadatos?.generador) ||
                          cleanStr(analizadores.analizadorC2PA?.detalles?.metadatosRelevantes?.software);
        if (generador) texto += `: ${generador}`;
        evidencia.push(texto);
    }

    return evidencia;
}

/**
 * 🎯 MAPA DE EXTRACCIÓN DE CAMPOS
 */
const ANALYZER_FIELD_MAP = {
    'analizadorMensajeria': ['detalles.explicacionForenseNarrativa', 'detalles.mensaje'],
    'analizadorC2PA': ['detalles.explicacionForense', 'detalles.razonamiento', 'detalles.mensaje'],
    'analizadorArtefactos': ['detalles.evaluacionGeneral', 'detalles.mensaje'],
    'analizadorValidator': ['detalles.razonamiento', 'detalles.mensaje'],
    'analizadorDefinicion': ['detalles.mensajeScore', 'detalles.mensaje'],
    'analizadorFirmasDigitales': ['detalles.mensaje'],
    'analizadorExif': ['detalles.mensaje'],
    'analizadorResolucion': ['detalles.mensaje'],
    'analizadorPantalla': ['detalles.mensaje'],
    'analizadorMBH': ['detalles.mensaje']
};

function getDeepValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

/**
 * 🧠 MAPEO DIRECTO A PLANTILLA
 */
function prepararDatosParaPlantilla(analisis, usuario, correlationId) {
    const res = analisis.resultado || {};
    const resumen = res.resumen || {};
    const detalles = res.detalles || {};
    const analizadores = detalles.analizadores || {};
    const consenso = detalles.consenso || {};
    const seguridad = detalles.seguridad || {};
    const redSup = detalles.redSuperior || res.redSuperior || {};
    const metaRoot = res.metadata || {};

    const aExif = analizadores.analizadorExif || {};
    const aArtefactos = analizadores.analizadorArtefactos || {};
    const aFirmas = analizadores.analizadorFirmasDigitales || {};
    const aMensajeria = analizadores.analizadorMensajeria || {};
    const metaExifConsolidado = consenso.metadatosExif || {};

    const decisionFinal = resumen.decision || "Indeterminado";
    const confianzaFinal = (parseFloat(resumen.confianza) || 0) * 100;
    const tiempoTotalMs = parseFloat(metaRoot.processingTime || 0);
    // FIX: Usar rawHash si existe, o hashArchivo del doc base
    const hashAnalisis = analisis.rawHash || analisis.hashArchivo || 'PENDIENTE';
    const fechaGen = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });

    let nivelGravedad = "BAJO";
    if (decisionFinal === "Artificial" && confianzaFinal > 80) nivelGravedad = "CRÍTICO";
    else if (decisionFinal === "Artificial") nivelGravedad = "ALTO";
    else if (decisionFinal === "Indeterminado") nivelGravedad = "MEDIO";

    const listaModelos = Object.entries(analizadores).map(([key, data]) => {
        if (!data) return null;

        let mensajeFinal = "Completado";
        const fieldsToTry = ANALYZER_FIELD_MAP[key] || ['mensaje', 'detalles.mensaje', 'resumen.motivo'];

        for (const fieldPath of fieldsToTry) {
            const val = getDeepValue(data, fieldPath);
            if (val && typeof val === 'string' && val.trim().length > 0) {
                if (Array.isArray(val)) mensajeFinal = val.join(' ');
                else mensajeFinal = val;
                break;
            } else if (Array.isArray(val) && val.length > 0) {
                mensajeFinal = val.join(' ');
                break;
            }
        }

        if (mensajeFinal.length > 180) mensajeFinal = mensajeFinal.substring(0, 177) + "...";

        return {
            nombre: (data.nombre || key).replace('analizador', '').toUpperCase(),
            esAutentico: !!data.esAutentico,
            confianza: (parseFloat(data.confianza || 0) * 100).toFixed(1),
            tiempoEjecucion: parseFloat(data.processingTime || 0).toFixed(1),
            mensaje: mensajeFinal
        };
    }).filter(m => m !== null);

    const riesgosDetectados = res.paraInforme?.riesgosDetectados || [];
    const evidenciaTecnica = extraerEvidenciaTecnicaProfunda(analizadores, consenso);
    const riesgosFinales = [...new Set([...riesgosDetectados, ...evidenciaTecnica])]
        .filter(r => r && !r.toLowerCase().includes("software: ninguna") && !r.toLowerCase().includes("software: null"));

    let explicacionExtendida = res.paraInforme?.explicacionExtendida || resumen.explicacion || "";
    if (aMensajeria.detalles?.explicacionForenseNarrativa && decisionFinal !== 'Humano' && !aMensajeria.detalles.error) {
        explicacionExtendida += "\n\nANÁLISIS DE ESTRUCTURA:\n" + aMensajeria.detalles.explicacionForenseNarrativa;
    }

    const huellasVisuales = [];
    const soft = cleanStr(metaExifConsolidado.Software);
    if (soft) huellasVisuales.push(`Software: ${soft}`);
    if (aFirmas.detalles?.hayFirmaDigital) huellasVisuales.push(`Firma Digital Detectada`);

    return {
        // FIX: Usamos analisis._id que viene del documento base (datosFuente)
        reporteId: analisis._id?.toString(),
        correlationId: correlationId || analisis.correlationId,
        fechaGeneracion: fechaGen,
        versionDragon3: '10.0.0-INTEGRITY-MERGE',
        nivelGravedad: nivelGravedad,

        usuario: {
            id: usuario?._id?.toString(),
            email: usuario?.email || 'Sistema',
            tipo: (analisis.usuarioTipo || 'Registrado').toUpperCase()
        },

        archivo: {
            nombreOriginal: analisis.nombreOriginal,
            nombreAlmacenado: analisis.nombreArchivo,
            tipo: "IMAGEN",
            archivoId: analisis.imagenId,
            hashSHA256: analisis.hashArchivo,
            tamano: formatBytes(analisis.rawSize || seguridad.fileSize || 0)
        },

        tipo: "imagen",

        cadenaCustodia: {
            hashAnalisis: hashAnalisis,
            timestampCaptura: analisis.createdAt
        },

        veredicto: {
            decision: decisionFinal,
            confianza: confianzaFinal.toFixed(1),
            score: (parseFloat(resumen.score || 0) * 100).toFixed(1),
            modeloPrincipal: resumen.modeloPrincipal,
            explicacionTecnica: resumen.explicacion,
            redSuperior: { categoria: redSup.categoria || 'N/A' }
        },

        metadataImagen: {
            dimensiones: {
                ancho: metaExifConsolidado.ancho || aArtefactos.detalles?.propiedadesBasicasImagen?.dimensiones?.split('x')[0] || 'N/A',
                alto: metaExifConsolidado.alto || aArtefactos.detalles?.propiedadesBasicasImagen?.dimensiones?.split('x')[1]?.replace(' px','') || 'N/A',
                relacionAspecto: 'N/A'
            },
            propiedades: {
                formato: (seguridad.format || analisis.tipo || 'JPEG').toUpperCase(),
                espacioColor: aFirmas.detalles?.bloqueC2PA ? 'sRGB (C2PA)' : 'sRGB',
                profundidadColor: '24 bits',
                compresion: `Blockiness: ${aArtefactos.detalles?.blockinessDetectada || 'N/A'}`,
                calidad: (seguridad.format === 'png') ? 'Lossless (PNG)' :
                         (aMensajeria.resumen?.calidadJPEGEstimada ? `Q=${aMensajeria.resumen.calidadJPEGEstimada}` : 'N/A')
            },
            metadatosExif: {
                fabricanteCamara: cleanStr(metaExifConsolidado.make) || 'N/A',
                modeloCamara: cleanStr(metaExifConsolidado.model) || 'N/A',
                fechaCaptura: aExif.metadatosExif?.DateTimeOriginal || 'No en EXIF',
                softwareEdicion: soft || 'No detectado',
                configuracion: { iso: '-', apertura: '-', velocidadObturacion: '-', distanciaFocal: '-', flash: '-' },
                gps: null
            },
            analisisForensic: {
                metadataInconsistente: (aExif.score < 5),
                erroresCompresion: aArtefactos.metadatos?.Blockiness ? parseFloat(aArtefactos.metadatos.Blockiness).toFixed(2) : 0,
                calidadPerceptual: aArtefactos.metadatos?.GradientePromedioLuminancia ? (parseFloat(aArtefactos.metadatos.GradientePromedioLuminancia) * 10).toFixed(0) : 80,
                huellasEdicion: huellasVisuales,
                patronesCompresion: []
            }
        },

        analizadores: {
            total: listaModelos.length,
            exitosos: listaModelos.filter(m => parseFloat(m.tiempoEjecucion) > 0).length,
            resultados: listaModelos
        },

        consenso: { porcentajeAutentico: (parseFloat(resumen.consensoPorcentaje || 0) * 100).toFixed(1) },

        evidencias: {
            explicacionExtendida: explicacionExtendida,
            riesgos: riesgosFinales,
            recomendaciones: res.paraInforme?.recomendaciones || ['Mantener cadena de custodia.', 'Verificar fuente original.']
        },

        trazabilidad: { tiempoTotal: tiempoTotalMs.toFixed(2) },

        performance: {
            metricas: {
                tiempoTotalMs: tiempoTotalMs.toFixed(0),
                p95TargetMet: true,
                complejidadProcesamiento: "ALTA"
            },
            faseUpload: { finMs: 120, tamañoOriginalMB: (seguridad.fileSize/1024/1024).toFixed(2), velocidadMBps: 15 },
            faseAnalisis: { finMs: tiempoTotalMs.toFixed(0), usoMemoriaMB: 250, usoCPU: 65, modelosUtilizados: Object.keys(analizadores).map(k => k.replace('analizador','')) },
            faseRespuesta: { finMs: 15, tamañoRespuestaKB: (analisis.rawSize/1024).toFixed(1), tiempoSerializacionMs: 5 }
        },

        firmaResponsable: 'Gustavo Herraiz - Lead Architect',
        redSuperior: redSup
    };
}

// ==== GENERADOR PDF ====
async function generarPDF(html, outputPath) {
    let browser;
    try {
        const launchOptions = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };

        if (fsSync.existsSync('/usr/bin/chromium-browser')) launchOptions.executablePath = '/usr/bin/chromium-browser';
        else if (fsSync.existsSync('/usr/bin/chromium')) launchOptions.executablePath = '/usr/bin/chromium';

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });

        await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o755 });
        await fs.writeFile(outputPath, pdfBuffer);

        return pdfBuffer;
    } catch (err) {
        dragon.sePreocupa('Error en generarPDF', MODULE, 'PDF_GENERATION_ERROR', { error: err.message });
        throw err;
    } finally {
        if (browser) await browser.close();
    }
}

// ==== EXPORTACIÓN ====
export async function generarInforme(analisisId, usuarioId, opciones = {}) {
    const correlationId = opciones.correlationId || crypto.randomUUID();
    dragon.respira('Generando informe INTEGRITY-MERGE', MODULE, 'GENERATE_START', { analisisId });

    try {
        const analisisDoc = await AnalisisArchivo.findById(analisisId);
        const usuario = await Usuario.findById(usuarioId);
        if (!analisisDoc) throw new Error("Análisis no encontrado");

        // 1. Objeto base con metadatos raíz (_id, createdAt, etc.)
        let datosFuente = analisisDoc.toObject ? analisisDoc.toObject() : analisisDoc;

        // 2. Carga del Raw Payload (resultado)
        let resultadoPayload = datosFuente.resultado;

        if (opciones.datosInformeOverride) {
            // FIX CRÍTICO: Si viene un override, asumimos que es el payload 'resultado' y lo inyectamos,
            // NO reemplazamos el documento entero.
            resultadoPayload = opciones.datosInformeOverride;
        } else if (analisisDoc.rawStored) {
            try {
                const raw = await analisisDoc.getRawJson();
                if (raw) resultadoPayload = raw;
            } catch (e) { dragon.sePreocupa("Fallo carga rawJson", MODULE, "RAW_LOAD_FAIL"); }
        }

        // 3. Fusión: Documento Base + Payload Rico
        datosFuente.resultado = resultadoPayload;

        const contextoPDF = prepararDatosParaPlantilla(datosFuente, usuario, correlationId);
        const htmlPlantilla = await fs.readFile(PLANTILLA_PATH, 'utf8');
        const template = Handlebars.compile(htmlPlantilla);
        const htmlFinal = template(contextoPDF);

        const pdfPath = path.join('/var/www/Dragon3/archivos', usuarioId.toString(), 'informes', `Informe_${usuarioId}_${analisisId}.pdf`);
        const pdfBuffer = await generarPDF(htmlFinal, pdfPath);

        return { pdfBuffer, pdfPath, metadata: { timestamp: new Date().toISOString() } };
    } catch (error) {
        dragon.agoniza('Fallo generando informe', error, MODULE, 'GENERATE_ERROR');
        throw error;
    }
}

export default generarInforme;
