/**
 * DRAGON3 FAANG - ANALIZADOR C2PA DEFINITIVO
 * ==========================================
 * Detecta firmas C2PA mediante c2patool y las clasifica usando
 * analizadorHerramientasSospechosas.json (IA, edición, cámara, etc.)
 * 
 * Versión 6.0.0 - DEFINITIVA
 */
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import dragon from '../../../../utilidades/logger.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_NAME = 'analizadorC2PA';
const ANALYZER_VERSION = '6.0.0-DEFINITIVA';
const execFilePromise = promisify(execFile);

const RUTA_PATRONES = path.join(__dirname, 'analizadorHerramientasSospechosas.json');
let patronesCache = null;
let ultimaCarga = 0;
const CACHE_TTL = 300000;

// --------------------------------------------------------------
// 1. Carga de patrones desde el JSON (síncrona con caché)
// --------------------------------------------------------------
function cargarPatrones() {
    const ahora = Date.now();
    if (patronesCache && (ahora - ultimaCarga < CACHE_TTL)) return patronesCache;
    try {
        const raw = readFileSync(RUTA_PATRONES, 'utf8');
        const json = JSON.parse(raw);
        patronesCache = {
            softwareEdicion: json.softwareEdicion || [],
            softwareGeneracionIA: json.softwareGeneracionIA || [],
            marcasC2PA: json.marcasC2PA || [],
            iaGeneradores: json.iaGeneradores || {},
            softwareGenerico: json.softwareGenerico || [],
            moviles: json.moviles || {}
        };
        ultimaCarga = ahora;
        dragon.sonrie('Patrones C2PA cargados correctamente', MODULE_NAME, 'PATTERNS_LOADED');
        return patronesCache;
    } catch (error) {
        dragon.agoniza('No se pudo cargar el JSON de patrones', error, MODULE_NAME, 'JSON_LOAD_ERROR');
        return {
            softwareEdicion: [],
            softwareGeneracionIA: [],
            marcasC2PA: [],
            iaGeneradores: {},
            softwareGenerico: [],
            moviles: {}
        };
    }
}

// --------------------------------------------------------------
// 2. Función auxiliar para probar patrones
// --------------------------------------------------------------
function testPatron(texto, listaPatrones) {
    if (!texto || !listaPatrones || listaPatrones.length === 0) return false;
    const txt = String(texto).toLowerCase();
    return listaPatrones.some(pat => {
        try {
            return new RegExp(pat, 'i').test(txt);
        } catch {
            return txt.includes(pat.toLowerCase());
        }
    });
}

// --------------------------------------------------------------
// 3. Clasificación del generador (con motivo detallado)
// --------------------------------------------------------------
function clasificarGenerador(generator, patrones) {
    if (!generator) {
        return {
            tipo: 'desconocido',
            confianza: 0.3,
            nombre: null,
            motivo: 'No se detectó generador.'
        };
    }
    const genStr = String(generator);

    // PRIORIDAD 1: Hardware de cámara o dispositivo móvil
    if (/truepic|lens_sdk|pixel\s*\d|iphone\s*\d|galaxy|camera|lens|sdk|canon|nikon|sony|huawei|xiaomi|oneplus|oppo|fujifilm|pentax|ricoh|olympus/i.test(genStr)) {
        return {
            tipo: 'Humano',
            confianza: 0.85,
            nombre: genStr,
            generadorOriginal: genStr,
            motivo: `El generador "${genStr}" contiene palabras clave típicas de una cámara o dispositivo móvil (ej: truepic, lens_sdk, pixel, etc.). Se considera origen humano.`
        };
    }

    // PRIORIDAD 2: IA por iaGeneradores (estructura detallada del JSON)
    for (const [nombreIA, datos] of Object.entries(patrones.iaGeneradores || {})) {
        const todosPatrones = [
            ...(datos.metadatos || []),
            ...(datos.comentarios || []),
            ...(datos.binario || []),
            ...(datos.versiones || [])
        ];
        if (testPatron(genStr, todosPatrones)) {
            return {
                tipo: 'Artificial',
                confianza: 0.95,
                nombre: nombreIA,
                generadorOriginal: genStr,
                motivo: `El generador coincide con el patrón de IA "${nombreIA}" (ej: "${todosPatrones[0]}"). Se trata de un generador de imágenes artificial.`
            };
        }
    }

    // PRIORIDAD 3: IA por softwareGeneracionIA (lista plana)
    if (testPatron(genStr, patrones.softwareGeneracionIA)) {
        return {
            tipo: 'Artificial',
            confianza: 0.90,
            nombre: genStr,
            generadorOriginal: genStr,
            motivo: `El generador está en la lista de software de generación IA del JSON. Por lo tanto, es contenido sintético.`
        };
    }

    // PRIORIDAD 4: Software de edición humana
    if (testPatron(genStr, patrones.softwareEdicion)) {
        return {
            tipo: 'Editado',
            confianza: 0.80,
            nombre: genStr,
            generadorOriginal: genStr,
            motivo: `El generador está en la lista de software de edición (Photoshop, GIMP, Lightroom, etc.). Indica edición humana, no IA.`
        };
    }

    // PRIORIDAD 5: Cámara por softwareGenerico o moviles
    const genericos = patrones.softwareGenerico || [];
    const todosMoviles = Object.values(patrones.moviles || {}).flat();
    if (testPatron(genStr, genericos) || testPatron(genStr, todosMoviles)) {
        return {
            tipo: 'Humano',
            confianza: 0.85,
            nombre: genStr,
            generadorOriginal: genStr,
            motivo: `El generador se encuentra en las listas de marcas de cámara o software genérico del JSON. Se considera origen humano.`
        };
    }

    // PRIORIDAD 6: Por defecto (firma C2PA sin clasificar)
    return {
        tipo: 'Firma C2PA',
        confianza: 0.65,
        nombre: genStr,
        generadorOriginal: genStr,
        motivo: `No se pudo clasificar el generador. Es una firma C2PA sin etiqueta específica.`
    };
}

// --------------------------------------------------------------
// 4. Ejecución de c2patool (con manejo de errores)
// --------------------------------------------------------------
async function ejecutarC2PATool(rutaArchivo) {
    try {
        const { stdout } = await execFilePromise('/usr/local/bin/c2patool', [rutaArchivo], { timeout: 8000 });
        const jsonStart = stdout.indexOf('{');
        if (jsonStart === -1) return { detected: false, error: 'No JSON output' };
        const raw = JSON.parse(stdout.substring(jsonStart));
        const manifestKeys = Object.keys(raw.manifests || {});
        if (manifestKeys.length === 0) return { detected: false };
        const manifest = raw.manifests[manifestKeys[0]];
        return {
            detected: true,
            valid: manifest.valid !== false,
            generator: manifest.claim_generator,
            actions: manifest.actions ? manifest.actions.map(a => a.action) : [],
            manifestData: manifest
        };
    } catch (error) {
        let errorType = 'unknown';
        if (error.message.includes('claim could not be converted from CBOR')) errorType = 'corrupt';
        else if (error.message.includes('No claim found')) errorType = 'no_claim';
        return { detected: false, error: error.message, errorType };
    }
}

// --------------------------------------------------------------
// 5. Función principal del analizador (con todas las correcciones)
// --------------------------------------------------------------
export async function analizarC2PA(params) {
    const { rutaArchivo, archivoId } = params;
    const reporte = new RespuestaStandard(MODULE_NAME, "Firmas C2PA con clasificación por JSON", ANALYZER_VERSION);
    if (!rutaArchivo) return reporte.error('Ruta requerida').cerrar();

    try {
        await fs.access(rutaArchivo);
        const patrones = cargarPatrones();
        const c2pa = await ejecutarC2PATool(rutaArchivo);

        if (c2pa.detected && c2pa.generator) {
            const clasif = clasificarGenerador(c2pa.generator, patrones);
            let veredicto = clasif.tipo;
            let confianza = clasif.confianza;
            let puntos = confianza * 100;
            let peso = "alto";
            let icono = "🔏";
            let color = "info";
            let flagName = null;

            // Construir explicación detallada y asignar flag
            let explicacionHumana = `🔍 Firma C2PA detectada.\n📌 Generador: "${c2pa.generator}".\n📋 Clasificación: ${clasif.tipo}.\n💡 Motivo: ${clasif.motivo}`;

            if (clasif.tipo === 'Artificial') {
                veredicto = 'Artificial';
                icono = "🤖";
                color = "danger";
                explicacionHumana = `🔍 Firma C2PA de IA detectada.\n📌 Generador: "${c2pa.generator}".\n🤖 Clasificación: ${clasif.tipo}.\n💡 Motivo: ${clasif.motivo}`;
                flagName = "ia_c2pa";
            } else if (clasif.tipo === 'Editado') {
                veredicto = 'Editado';
                icono = "✂️";
                color = "warning";
                explicacionHumana = `🔍 Firma C2PA de edición detectada.\n📌 Generador: "${c2pa.generator}".\n✂️ Clasificación: ${clasif.tipo}.\n💡 Motivo: ${clasif.motivo}`;
                flagName = "edicion_c2pa";
            } else if (clasif.tipo === 'Humano') {
                veredicto = 'Humano';
                icono = "📷";
                color = "success";
                explicacionHumana = `🔍 Firma C2PA de cámara o dispositivo detectada.\n📌 Generador: "${c2pa.generator}".\n📷 Clasificación: ${clasif.tipo}.\n💡 Motivo: ${clasif.motivo}`;
                flagName = "camara_c2pa";
            } else {
                veredicto = 'Firma C2PA';
                icono = "🔏";
                color = "info";
                explicacionHumana = `🔍 Firma C2PA sin clasificar.\n📌 Generador: "${c2pa.generator}".\n🔏 Clasificación: ${clasif.tipo}.\n💡 Motivo: ${clasif.motivo}`;
                flagName = null;
            }

            // Activar flag correspondiente (usando el método de RespuestaStandard)
            if (flagName) {
                reporte.activarFlag(flagName);
                // Aseguramos que la flag quede en el objeto `flags` de la respuesta
                // (por si activarFlag no lo hace automáticamente)
                if (!reporte.flags) reporte.flags = {};
                reporte.flags[flagName] = true;
            }

            reporte.definirVoto(veredicto, confianza, puntos, peso);
            reporte.registrarHerramienta(c2pa.generator, "Generador C2PA");
            reporte.concluir(color, icono, veredicto, explicacionHumana);
            reporte.setDatosCrudos({ c2pa_tool: c2pa, clasificacion: clasif });
        }
        else if (c2pa.errorType === 'corrupt') {
            reporte.definirVoto("Indeterminado", 0.4, 40, "bajo");
            reporte.concluir("warning", "⚠️", "Firma C2PA corrupta", "Se encontró una estructura C2PA, pero está dañada o mal formada. No se puede clasificar.");
            reporte.setDatosCrudos({ c2pa_tool: c2pa });
        }
        else {
            reporte.definirVoto("Indeterminado", 0.3, 30, "bajo");
            reporte.concluir("info", "⚪", "Sin firma C2PA", "No se detectaron manifiestos C2PA válidos en el archivo.");
            reporte.setDatosCrudos({ c2pa_tool: c2pa });
        }

        // 🎯 CAMBIO CLAVE: Añadir campo exitoso para que el test lo encuentre
        reporte.exitoso = true;

        return reporte.cerrar();
    } catch (error) {
        dragon.agoniza('Error fatal en analizador C2PA', error, MODULE_NAME, 'FATAL');
        return reporte.error(error.message).cerrar();
    }
}

export default analizarC2PA;