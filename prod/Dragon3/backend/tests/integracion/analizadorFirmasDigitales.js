/**
 * =============================================================================
 * DRAGON3 FAANG ENTERPRISE - ANALIZADOR DE FIRMAS DIGITALES DE IMÁGENES
 * =============================================================================
 * @file analizadorFirmasDigitales.js
 * @version 5.5.0-FAANG
 * @author Gustavo Herraiz (Lead Architect Dragon Project)
 * @date 2025-08-25
 * @description
 * Analizador robusto y explicable para firmas digitales en imágenes:
 * - Detección avanzada y priorizada de patrones IA en iaGeneradores.
 * - Devuelve array coincidenciasIA en detalles, con toda huella IA detectada.
 * - Detección mejorada de metadatos eliminados o alterados.
 * - Timeout dinámico en ExifTool según tamaño de archivo (performance KISS).
 * - Logging extendido Dragon3/Winston en todos los caminos (inicio, éxito, error, fallback, timeout).
 * - Búsqueda heurística y clasificación avanzada de patrones técnicos sospechosos.
 * - Fallback seguro, nunca rompe el pipeline.
 * - Contrato 100% compatible con analizadorImagen.js.
 * - Performance P95 <200ms en imágenes normales, adaptativo para grandes.
 * =============================================================================
 */
import fs from 'fs/promises';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dragon from '../../../../utilidades/logger.js';
import { exiftool } from 'exiftool-vendored';
import { DragonError } from '../../../../utilidades/errores/DragonError.js';

// ==== Configuración y constantes ====

const ANALYZER_VERSION = '5.5.0-FAANG';
const ANALYZER_ID = 'analizadorFirmasDigitales';
const MODULE_NAME = 'analizadorFirmasDigitales.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PATRONES_PATH = path.join(__dirname, 'analizadorHerramientasSospechosas.json');

const DEFAULT_CONFIG = {
    timeoutMsDefault: 1200,
    timeoutMsLarge: 4000, // Timeout mayor para imágenes grandes
    largeFileThresholdMB: 15,
    ignoreExiftoolErrors: process.env.ANALIZADOR_FIRMAS_IGNORE_EXIFTOOL_ERRORS !== 'false',
    maxPatternLoadAttempts: 3,
    patternRefreshInterval: 60 * 60 * 1000,
    maxFileSizeMB: 20
};

const PATRONES_DEFAULT = {
    softwareEdicion: [],
    softwareGeneracionIA: [],
    softwareGenerico: [],
    sellosVerificacion: [],
    marcasIA: [],
    marcasC2PA: [],
    patronesEdicionAvanzados: [],
    iaGeneradores: {},
    moviles: {}
};

let patronesCache = null;
let lastPatternLoadTimestamp = 0;

// ==== FUNCIONES AUXILIARES ====

function coincideConPatron(valor, patronesArray, patternType) {
    if (!valor || !Array.isArray(patronesArray) || patronesArray.length === 0) return false;
    const cleanValue = valor.toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return patronesArray.some(patron => {
        try {
            return new RegExp(patron, "i").test(cleanValue);
        } catch (regexError) {
            if (dragon) {
                dragon.seEnfada(
                    `Patrón inválido detectado`, MODULE_NAME, 'coincideConPatron',
                    { patron, tipo: patternType, error: regexError.message }
                );
            }
            return false;
        }
    });
}

function buscaCoincidenciasIAEnCampos(metadatos, metadatosXMP_IPTC, patronesIA, generadorPrioridad) {
    // Recorre todos los generadores IA en orden de prioridad, devuelve array de coincidencias encontradas
    const coincidencias = [];
    // Campos a revisar de metadatos + XMP/IPTC
    const camposFuente = [
        { nombre: 'Software', valor: metadatos.Software },
        { nombre: 'CreatorTool', valor: metadatos.CreatorTool || metadatosXMP_IPTC.creatorTool },
        { nombre: 'Model', valor: metadatos.Model },
        { nombre: 'Make', valor: metadatos.Make },
        { nombre: 'HistorySoftwareAgent', valor: metadatosXMP_IPTC.history },
        { nombre: 'Artist', valor: metadatos.Artist || metadatosXMP_IPTC.byline },
        { nombre: 'DocumentName', valor: metadatos.DocumentName },
        { nombre: 'UserComment', valor: metadatos.UserComment },
        { nombre: 'Description', valor: metadatos.ImageDescription || metadatosXMP_IPTC.description },
        { nombre: 'Copyright', valor: metadatos.Copyright || metadatosXMP_IPTC.copyrightNotice },
        { nombre: 'ProcessingSoftware', valor: metadatos.ProcessingSoftware },
        { nombre: 'Generator', valor: metadatos.Generator },
        { nombre: 'CameraModelName', valor: metadatos.CameraModelName },
        { nombre: 'UniqueCameraModel', valor: metadatos.UniqueCameraModel },
        // campos avanzados
        { nombre: 'AIparams', valor: metadatos.AIparams },
        { nombre: 'ClaimGenerator', valor: metadatos.ClaimGenerator },
        { nombre: 'ContentCredentials', valor: metadatos.ContentCredentials },
        { nombre: 'creatorTool', valor: metadatosXMP_IPTC.creatorTool }
    ];

    // Reviso también todos los valores string del objeto por si hay campos no estándar
    const allValues = Object.entries({ ...metadatos, ...metadatosXMP_IPTC });
    for (const [campo, valor] of allValues) {
        if (typeof valor === "string" && !camposFuente.some(c => c.nombre === campo)) {
            camposFuente.push({ nombre: campo, valor });
        }
    }

    // Orden de prioridad de búsqueda por generador
    const ordenGeneradores = generadorPrioridad || [
        'Midjourney', 'ChatGPT_DALLE', 'StableDiffusion', 'Bing', 'Firefly', 'LeonardoAI', 'Perplexity'
    ];

    for (const nombreGen of ordenGeneradores) {
        const generador = patronesIA[nombreGen];
        if (!generador) continue;
        // Para cada subcampo: metadatos, comentarios, binario, versiones
        for (const tipoHuella of ['metadatos', 'comentarios', 'binario', 'versiones']) {
            const patrones = generador[tipoHuella] || [];
            for (const patron of patrones) {
                for (const campoObj of camposFuente) {
                    const valorCampo = campoObj.valor;
                    if (!valorCampo || typeof valorCampo !== "string") continue;
                    if (coincideConPatron(valorCampo, [patron], tipoHuella)) {
                        // intentamos extraer versionDetectada si está en la huella
                        let versionDetectada = null;
                        if (tipoHuella === 'versiones') versionDetectada = patron;
                        // Confianza heurística (más alta si tipoHuella=binario/versiones, menos en comentarios)
                        let confianza = 0.95;
                        if (tipoHuella === 'comentarios') confianza = 0.85;
                        if (tipoHuella === 'metadatos') confianza = 0.9;
                        if (tipoHuella === 'binario') confianza = 0.98;

                        coincidencias.push({
                            generador: nombreGen,
                            tipoHuella,
                            campo: campoObj.nombre,
                            valor: valorCampo,
                            versionDetectada,
                            confianza,
                            patronCoincidente: patron
                        });
                        if (dragon) {
                            dragon.sonrie(
                                `Patrón IA detectado (${nombreGen}) en campo ${campoObj.nombre}: ${valorCampo}`,
                                MODULE_NAME, 'buscaCoincidenciasIAEnCampos',
                                {
                                    generador: nombreGen,
                                    tipoHuella,
                                    campo: campoObj.nombre,
                                    valor: valorCampo,
                                    versionDetectada,
                                    patronCoincidente: patron
                                }
                            );
                        }
                    }
                }
            }
        }
    }
    return coincidencias;
}

const scoreAConfianza = (score) => {
    if (score === null || score === undefined) return 0.5;
    return parseFloat((Math.min(10, Math.max(0, score)) / 10).toFixed(2));
};

function esEstructuraPatronesValida(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = [
        'softwareEdicion', 'softwareGeneracionIA', 'softwareGenerico',
        'sellosVerificacion', 'marcasIA', 'marcasC2PA',
        'patronesEdicionAvanzados', 'iaGeneradores', 'moviles'
    ];
    return keys.every(k => Array.isArray(obj[k]) || typeof obj[k] === 'object');
}

async function cargarPatronesConReintentos() {
    const ahora = Date.now();
    if (patronesCache && (ahora - lastPatternLoadTimestamp) < DEFAULT_CONFIG.patternRefreshInterval) {
        return patronesCache;
    }
    let intentos = 0;
    let ultimoExito = patronesCache || PATRONES_DEFAULT;

    while (intentos < DEFAULT_CONFIG.maxPatternLoadAttempts) {
        intentos++;
        try {
            if (!existsSync(PATRONES_PATH)) {
                if (dragon) {
                    dragon.sePreocupa(
                        `Archivo de patrones no encontrado: ${PATRONES_PATH}`,
                        MODULE_NAME, 'cargarPatronesConReintentos', { intentos }
                    );
                }
                throw new Error(`Archivo de patrones no encontrado: ${PATRONES_PATH}`);
            }
            const patronesRaw = readFileSync(PATRONES_PATH, 'utf8');
            const patronesParsed = JSON.parse(patronesRaw);

            if (!esEstructuraPatronesValida(patronesParsed)) {
                if (dragon) {
                    dragon.seEnfada(
                        'Estructura inválida en archivo de patrones',
                        MODULE_NAME, 'cargarPatronesConReintentos', { intentos }
                    );
                }
                throw new Error('Estructura de patrones inválida');
            }
            patronesCache = patronesParsed;
            lastPatternLoadTimestamp = ahora;

            if (dragon) {
                dragon.respira(
                    'Patrones actualizados correctamente',
                    MODULE_NAME, 'cargarPatronesConReintentos',
                    { totalPatrones: Object.values(patronesCache).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : Object.keys(arr).length), 0) }
                );
            }
            return patronesCache;
        } catch (error) {
            if (intentos >= DEFAULT_CONFIG.maxPatternLoadAttempts) {
                if (dragon) {
                    dragon.agoniza(
                        'Error crítico al cargar patrones',
                        error, MODULE_NAME, 'cargarPatronesConReintentos', { intentos }
                    );
                }
                patronesCache = ultimoExito;
                return ultimoExito;
            }
            if (dragon) {
                dragon.sePreocupa(
                    `Error cargando patrones (intento ${intentos})`,
                    error, MODULE_NAME, 'cargarPatronesConReintentos'
                );
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, intentos)));
        }
    }
    patronesCache = ultimoExito;
    return ultimoExito;
}

function ahoraNs() {
    return typeof process !== "undefined" && process.hrtime ? process.hrtime.bigint() : BigInt(Date.now() * 1e6);
}
function msEntre(t0, t1) { return Number(t1 - t0) / 1e6; }
function detectarMetadatosEliminados(metadatos) {
    const camposEsperados = [
        'Make', 'Model', 'Software', 'DateTimeOriginal',
        'ExifImageWidth', 'ExifImageHeight', 'Orientation',
        'GPSLatitude', 'GPSLongitude', 'LensModel'
    ];
    return camposEsperados.filter(
        campo => metadatos[campo] === undefined || metadatos[campo] === null
    );
}

// ==== CLASIFICACIÓN DE SOFTWARE ====

function clasificaSoftware(valor, metadatos) {
    const patrones = patronesCache || PATRONES_DEFAULT;
    const camposFaltantes = detectarMetadatosEliminados(metadatos);
    if (camposFaltantes.length > 3) {
        return {
            categoria: "edicion", tipoFirmaDigital: "edicion",
            score: 3.8, mensaje: `Metadatos críticos eliminados (${camposFaltantes.length} campos faltantes)`,
            camposFaltantes
        };
    }
    if (metadatos) {
        const valoresSospechosos = [
            metadatos.JFIFVersion === 257 ? "JFIFVersion:257" : null,
            metadatos.ResolutionUnit === 0 ? "ResolutionUnit:0" : null,
            metadatos.XResolution === 1 ? "XResolution:1" : null,
            metadatos.YResolution === 1 ? "YResolution:1" : null
        ].filter(Boolean).join('; ');
        if (valoresSospechosos && coincideConPatron(valoresSospechosos, patrones.patronesEdicionAvanzados, "patronesEdicionAvanzados")) {
            return {
                categoria: "edicion", tipoFirmaDigital: "edicion",
                score: 7.0, mensaje: `Patrón técnico de edición detectado: ${valoresSospechosos}`
            };
        }
    }
    if (!valor) return {
        categoria: "desconocido", tipoFirmaDigital: "desconocida",
        score: 4.0, mensaje: "Software desconocido o no detectado."
    };
    const v = valor.toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (coincideConPatron(v, patrones.softwareGeneracionIA, "softwareGeneracionIA")) {
        return {
            categoria: "ia", tipoFirmaDigital: "ia",
            score: 1.0, mensaje: `Creada con ${valor} (IA generativa)`
        };
    }
    if (coincideConPatron(v, patrones.softwareEdicion, "softwareEdicion")) {
        return {
            categoria: "edicion", tipoFirmaDigital: "edicion",
            score: 5.2, mensaje: `Editada con ${valor} (software de edición)`
        };
    }
    if (coincideConPatron(v, patrones.patronesEdicionAvanzados, "patronesEdicionAvanzados")) {
        return {
            categoria: "edicion", tipoFirmaDigital: "edicion",
            score: 7.0, mensaje: `Patrón técnico de edición detectado: ${valor}`
        };
    }
    if (coincideConPatron(v, patrones.softwareGenerico, "softwareGenerico")) {
        return {
            categoria: "permitido", tipoFirmaDigital: "permitido",
            score: 8.5, mensaje: `Capturada con ${valor} (dispositivo genuino)`
        };
    }
    if (coincideConPatron(v, patrones.sellosVerificacion, "sellosVerificacion")) {
        return {
            categoria: "sello", tipoFirmaDigital: "sello",
            score: 9.5, mensaje: `Sello de verificación: ${valor}`
        };
    }
    if (coincideConPatron(v, patrones.marcasIA, "marcasIA")) {
        return {
            categoria: "ia", tipoFirmaDigital: "ia",
            score: 1.0, mensaje: `Marca IA detectada: ${valor}`
        };
    }
    if (coincideConPatron(v, patrones.marcasC2PA, "marcasC2PA")) {
        return {
            categoria: "c2pa", tipoFirmaDigital: "c2pa",
            score: 9.8, mensaje: `Firma C2PA/CAI: ${valor}`
        };
    }
    return {
        categoria: "desconocido", tipoFirmaDigital: "desconocida",
        score: 4.0, mensaje: `Software desconocido: ${valor}`
    };
}

// ==== EXTRACCIÓN DE CAMPO Y VALOR RELEVANTE ====

function extraerCampoYValor(metadatos, metadatosXMP_IPTC) {
    if (!metadatos || typeof metadatos !== 'object') metadatos = {};
    if (!metadatosXMP_IPTC || typeof metadatosXMP_IPTC !== 'object') metadatosXMP_IPTC = {};
    const camposRelevantes = [
        ["Software", metadatos.Software],
        ["CreatorTool", metadatos.CreatorTool || metadatosXMP_IPTC.creatorTool],
        ["Model", metadatos.Model], ["Make", metadatos.Make],
        ["HistorySoftwareAgent", metadatosXMP_IPTC.history],
        ["Artist", metadatos.Artist || metadatosXMP_IPTC.byline],
        ["DocumentName", metadatos.DocumentName],
        ["Copyright", metadatos.Copyright || metadatosXMP_IPTC.copyrightNotice],
        ["Description", metadatos.ImageDescription || metadatosXMP_IPTC.description],
        ["ProcessingSoftware", metadatos.ProcessingSoftware],
        ["Creator", metadatos.Creator], ["Generator", metadatos.Generator],
        ["CameraModelName", metadatos.CameraModelName],
        ["UniqueCameraModel", metadatos.UniqueCameraModel],
        ["UserComment", metadatos.UserComment]
    ];
    for (const [campo, valor] of camposRelevantes) {
        if (valor && typeof valor === "string" && valor.trim().length > 0) {
            return { campoDetectado: campo, valorDetectado: valor.toString().trim() };
        }
    }
    const allMetadata = { ...metadatos, ...metadatosXMP_IPTC };
    const suspiciousKeys = Object.keys(allMetadata).filter(key =>
        key.toLowerCase().includes('software') ||
        key.toLowerCase().includes('tool') ||
        key.toLowerCase().includes('creator') ||
        key.toLowerCase().includes('generate') ||
        key.toLowerCase().includes('model') ||
        key.toLowerCase().includes('make')
    );
    for (const key of suspiciousKeys) {
        const value = allMetadata[key];
        if (value && typeof value === "string" && value.trim().length > 0) {
            return { campoDetectado: key, valorDetectado: value.toString().trim() };
        }
    }
    return { campoDetectado: null, valorDetectado: null };
}

// ==== PROCESADO DE METADATOS XMP/IPTC ====

function procesarMetadatosAvanzados(metadatos) {
    if (!metadatos || typeof metadatos !== 'object') {
        return {
            creatorTool: null, history: null, rights: null,
            description: null, byline: null, copyrightNotice: null
        };
    }
    const pickFirst = (obj, keys) => {
        for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null) { return obj[k]; }
        }
        return null;
    };
    return {
        creatorTool: pickFirst(metadatos, ["XMP:CreatorTool", "CreatorTool", "creatorTool"]),
        history: pickFirst(metadatos, ["XMP:HistorySoftwareAgent", "HistorySoftwareAgent", "history"]),
        rights: pickFirst(metadatos, ["XMP:Rights", "XMPRights", "rights", "XMP:Copyright", "Copyright"]),
        description: pickFirst(metadatos, ["XMP:Description", "Description", "description", "ImageDescription"]),
        byline: pickFirst(metadatos, ["IPTC:By-line", "Byline", "byline", "Artist"]),
        copyrightNotice: pickFirst(metadatos, ["IPTC:CopyrightNotice", "CopyrightNotice", "copyrightNotice", "Copyright"])
    };
}

// ==== CLASE ANALIZADOR PRINCIPAL FAANG ====

class AnalizadorFirmasDigitales {
    constructor(options = {}) {
        this.version = ANALYZER_VERSION;
        this.id = ANALYZER_ID;
        this.options = { ...DEFAULT_CONFIG, ...options };
        cargarPatronesConReintentos().catch(error => {
            if (dragon) {
                dragon.sePreocupa('Error cargando patrones', error, MODULE_NAME, 'constructor');
            }
        });
        if (dragon) {
            dragon.respira('Analizador inicializado', MODULE_NAME, 'constructor', { version: this.version });
        }
    }

    async analizarImagen(parametros) {
        const t0 = ahoraNs();
        const contextoLog = {
            archivoId: parametros.archivoId,
            correlationId: parametros.correlationId,
            usuarioId: parametros.usuarioId || null,
            clientId: parametros.clientId || null,
            nombreOriginal: parametros.nombreOriginal || (parametros.rutaArchivo ? path.basename(parametros.rutaArchivo) : 'desconocido')
        };

        if (dragon) {
            dragon.respira(`Iniciando análisis`, MODULE_NAME, 'analizarImagen', contextoLog);
        }
        if (dependenciasFaltantes.length > 0) {
            const errorMsg = `Dependencias faltantes: ${dependenciasFaltantes.join(', ')}`;
            if (dragon) {
                dragon.agoniza(errorMsg, null, MODULE_NAME, 'DEPENDENCY_MISSING', contextoLog);
            }
            return this.construirResultadoError(new Error(errorMsg), contextoLog, msEntre(t0, ahoraNs()));
        }

        try {
            if (!parametros?.rutaArchivo || !parametros.archivoId) {
                throw new DragonError('Parámetros obligatorios faltantes', 'PARAM_MISSING', 'critical', 'validation', contextoLog);
            }
            const { rutaArchivo } = parametros;
            if (!existsSync(rutaArchivo)) {
                throw new DragonError(`Archivo no encontrado: ${rutaArchivo}`, 'FILE_NOT_FOUND', 'high', 'io', contextoLog);
            }
            await cargarPatronesConReintentos();

            let fileSizeMB = 0;
            try {
                const stats = statSync(rutaArchivo);
                fileSizeMB = stats.size / (1024 * 1024);
                if (fileSizeMB > this.options.maxFileSizeMB && dragon) {
                    dragon.sePreocupa(
                        `Archivo grande (${fileSizeMB.toFixed(2)} MB)`, MODULE_NAME, 'analizarImagen',
                        { ...contextoLog, fileSizeMB }
                    );
                }
            } catch (error) {
                if (dragon) {
                    dragon.seEnfada(
                        'Error obteniendo tamaño de archivo', error, MODULE_NAME, 'analizarImagen', contextoLog
                    );
                }
            }

            // Timeout dinámico según tamaño
            const timeoutMs =
                fileSizeMB > this.options.largeFileThresholdMB
                    ? this.options.timeoutMsLarge
                    : this.options.timeoutMsDefault;
            if (dragon) {
                dragon.sePreocupa(
                    `Timeout ExifTool ajustado: ${timeoutMs}ms para archivo de ${fileSizeMB.toFixed(2)}MB`,
                    MODULE_NAME, 'analizarImagen',
                    { ...contextoLog, fileSizeMB, timeoutMs }
                );
            }

            let metadatos = {};
            let exiftoolError = null;
            let exiftoolTimedOut = false;
            let tiempoExiftool = null;
            try {
                const tExifStart = ahoraNs();
                metadatos = await Promise.race([
                    exiftool.read(rutaArchivo),
                    new Promise((_, reject) =>
                        setTimeout(() => {
                            exiftoolTimedOut = true;
                            reject(new Error(`Timeout ExifTool (${timeoutMs}ms)`));
                        }, timeoutMs)
                    )
                ]);
                tiempoExiftool = msEntre(tExifStart, ahoraNs());
                if (dragon) {
                    dragon.sonrie(
                        `ExifTool completado en ${tiempoExiftool.toFixed(2)}ms`,
                        MODULE_NAME, 'analizarImagen',
                        { ...contextoLog, tiempoExiftool, fileSizeMB }
                    );
                }
            } catch (error) {
                exiftoolError = error;
                tiempoExiftool = msEntre(t0, ahoraNs());
                if (!this.options.ignoreExiftoolErrors) {
                    throw error;
                }
                if (dragon) {
                    dragon.agoniza(
                        exiftoolTimedOut
                            ? `Timeout en ExifTool tras ${timeoutMs}ms, fallback seguro.`
                            : `ExifTool falló, usando metadatos vacíos`,
                        error, MODULE_NAME, 'analizarImagen',
                        { ...contextoLog, fileSizeMB, timeoutMs, tiempoExiftool }
                    );
                }
                metadatos = {}; // Fallback seguro
            }

            const metadatosXMP_IPTC = procesarMetadatosAvanzados(metadatos);
            const { campoDetectado, valorDetectado } = extraerCampoYValor(metadatos, metadatosXMP_IPTC);
            const clasificacion = clasificaSoftware(valorDetectado, metadatos);

            // === NUEVO: Detección prioritaria de patrones IA en iaGeneradores ===
            const patrones = patronesCache || PATRONES_DEFAULT;
            const generadorPrioridad = [
                'Midjourney', 'ChatGPT_DALLE', 'StableDiffusion', 'Bing', 'Firefly', 'LeonardoAI', 'Perplexity'
            ];
            const coincidenciasIA = buscaCoincidenciasIAEnCampos(
                metadatos,
                metadatosXMP_IPTC,
                patrones.iaGeneradores || {},
                generadorPrioridad
            );

            // El resultado principal da prioridad a la detección IA si existe
            let marcaIADetectada = false;
            let generadorDetectado = null;
            let tipoHuellaDetectada = null;
            let versionDetectada = null;
            let confianzaIA = null;
            if (coincidenciasIA.length > 0) {
                marcaIADetectada = true;
                generadorDetectado = coincidenciasIA[0].generador;
                tipoHuellaDetectada = coincidenciasIA[0].tipoHuella;
                versionDetectada = coincidenciasIA[0].versionDetectada;
                confianzaIA = coincidenciasIA[0].confianza;
            }

            const esAutentico = marcaIADetectada
                ? false
                : ["permitido", "sello", "c2pa"].includes(clasificacion.categoria);

            const confianza = marcaIADetectada
                ? (confianzaIA || 0.8)
                : scoreAConfianza(clasificacion.score);

            const resultado = {
                archivoId: parametros.archivoId,
                correlationId: parametros.correlationId,
                nombreOriginal: contextoLog.nombreOriginal,
                usuarioId: parametros.usuarioId || null,
                clientId: parametros.clientId || null,
                timestamp: new Date().toISOString(),
                idAnalizador: ANALYZER_ID,
                version: ANALYZER_VERSION,
                esAutentico,
                confianza,
                tipoFirmaDigital: marcaIADetectada ? 'ia' : clasificacion.tipoFirmaDigital,
                categoria: marcaIADetectada ? 'ia' : clasificacion.categoria,
                mensaje: marcaIADetectada
                    ? `Patrón IA detectado: ${generadorDetectado} (${tipoHuellaDetectada || ''}${versionDetectada ? ', versión ' + versionDetectada : ''})`
                    : clasificacion.mensaje,
                campoDetectado: marcaIADetectada ? coincidenciasIA[0].campo : campoDetectado,
                valorDetectado: marcaIADetectada ? coincidenciasIA[0].valor : valorDetectado,
                marcaIADetectada,
                generadorDetectado,
                tipoHuellaDetectada,
                versionDetectada,
                detalles: {
                    metadatosXMP_IPTC,
                    metadatos: this.construirMetadatosCompletos(
                        metadatos,
                        metadatosXMP_IPTC,
                        marcaIADetectada ? 'ia' : clasificacion.tipoFirmaDigital,
                        esAutentico,
                        marcaIADetectada ? confianzaIA : clasificacion.score,
                        fileSizeMB,
                        timeoutMs,
                        tiempoExiftool,
                        exiftoolTimedOut
                    ),
                    coincidenciasIA,
                    metadatosEliminados: clasificacion.camposFaltantes || null,
                    timeoutExifToolMs: timeoutMs,
                    exiftoolTimedOut,
                    tiempoExiftool
                }
            };

            const t1 = ahoraNs();
            resultado.processingTime = parseFloat(msEntre(t0, t1).toFixed(2));
            resultado.detalles.metadatos.tiempoAnalisisMs = resultado.processingTime;
            resultado.exitoso = true;

            if (dragon) {
                const logData = {
                    ...contextoLog,
                    autenticidad: resultado.esAutentico,
                    confianza: resultado.confianza,
                    categoria: resultado.categoria,
                    campoDetectado: resultado.campoDetectado,
                    valorDetectado: resultado.valorDetectado,
                    timeoutMs,
                    fileSizeMB,
                    tiempoExiftool,
                    exiftoolTimedOut,
                    generadorDetectado,
                    coincidenciasIA
                };
                if (marcaIADetectada && coincidenciasIA.length > 0) {
                    dragon.seEnfada(
                        `Patrón IA detectado (${generadorDetectado}) con ${coincidenciasIA.length} coincidencias`,
                        MODULE_NAME, 'analizarImagen',
                        logData
                    );
                } else if (clasificacion.camposFaltantes) {
                    dragon.sePreocupa(
                        `Metadatos críticos eliminados (${clasificacion.camposFaltantes.length} campos)`,
                        MODULE_NAME, 'analizarImagen',
                        { ...logData, camposFaltantes: clasificacion.camposFaltantes }
                    );
                } else {
                    dragon.sonrie(
                        `Clasificación: ${clasificacion.mensaje}`,
                        MODULE_NAME, 'analizarImagen',
                        logData
                    );
                }
            }

            return resultado;

        } catch (error) {
            const tiempoError = msEntre(t0, ahoraNs());
            if (dragon) {
                dragon.agoniza('Error en análisis', error, MODULE_NAME, 'analizarImagen', contextoLog);
            }
            return this.construirResultadoError(error, contextoLog, tiempoError);
        }
    }

    construirMetadatosCompletos(metadatos, metadatosXMP, tipoFirma, esAutentico, score, fileSizeMB, timeoutMs, tiempoExiftool, exiftoolTimedOut) {
        const camposFaltantes = detectarMetadatosEliminados(metadatos);
        return {
            software: metadatos?.Software || metadatosXMP?.creatorTool || null,
            make: metadatos?.Make || null,
            model: metadatos?.Model || null,
            tipoFirmaDigital: tipoFirma,
            esAutentico,
            scoreOriginal: score,
            fileSize: fileSizeMB ? `${fileSizeMB.toFixed(2)} MB` : null,
            timeoutMs,
            tiempoExiftool,
            exiftoolTimedOut,
            camposFaltantes
        };
    }

    construirResultadoError(error, contextoLog, tiempoError) {
        return {
            archivoId: contextoLog.archivoId,
            correlationId: contextoLog.correlationId,
            nombreOriginal: contextoLog.nombreOriginal,
            usuarioId: contextoLog.usuarioId,
            clientId: contextoLog.clientId,
            timestamp: new Date().toISOString(),
            idAnalizador: ANALYZER_ID,
            version: ANALYZER_VERSION,
            esAutentico: null,
            confianza: null,
            tipoFirmaDigital: null,
            categoria: null,
            mensaje: `Error en analizador: ${error?.message || 'desconocido'}`,
            error: {
                mensaje: error?.message,
                stack: error?.stack,
                tipo: error?.name || typeof error,
                codigo: error?.codigo || error?.code || null
            },
            detalles: {
                tiempoError,
                contextoLog
            },
            exitoso: false
        };
    }
}

// ==== EXPORT PRINCIPAL FAANG ====

export const version = ANALYZER_VERSION;
export const interface = 'dragon3';
export default new AnalizadorFirmasDigitales();
export { AnalizadorFirmasDigitales };
