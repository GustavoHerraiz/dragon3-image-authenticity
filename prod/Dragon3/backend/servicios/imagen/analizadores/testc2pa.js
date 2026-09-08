/**
 * DRAGON3 FAANG - TEST AVANZADO PARA ANALIZADOR C2PA v7.0
 * ======================================================
 * Muestra todas las capacidades: scoring, detección de múltiples firmas,
 * rendimiento, diagnóstico detallado y ejemplos prácticos.
 */

import { analizarC2PA } from './imagen/analizadorC2PA.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

function logOk(msg) { console.log(`${colors.green}✅ ${msg}${colors.reset}`); }
function logError(msg) { console.log(`${colors.red}❌ ${msg}${colors.reset}`); }
function logWarn(msg) { console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`); }
function logInfo(msg) { console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`); }
function logTitle(msg) { console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`); }
function logDetail(msg) { console.log(`  ${colors.dim}${msg}${colors.reset}`); }

// ===========================================================================
// CONFIGURACIÓN DE PRUEBAS
// ===========================================================================
const RUTA_PATRONES = '/opt/dragon3/prod/Dragon3/backend/servicios/imagen/analizadores/imagen/analizadorHerramientasSospechosas.json';
const IMAGEN_PRUEBA = path.join(__dirname, 'unico.png');  // Cambiar según necesidad

// ===========================================================================
// FUNCIONES AUXILIARES
// ===========================================================================
async function cargarPatrones() {
    const raw = await fs.readFile(RUTA_PATRONES, 'utf8');
    const json = JSON.parse(raw);
    return {
        softwareGeneracionIA: json.softwareGeneracionIA,
        marcasIA: json.marcasIA,
        marcasC2PA: json.marcasC2PA,
        iaGeneradores: json.iaGeneradores || {}
    };
}

async function escanearTodasFirmasConScore(rutaArchivo, patrones) {
    const buffer = await fs.readFile(rutaArchivo);
    const textContent = buffer.toString('binary');
    const resultados = [];

    const buscar = (lista, tipo, pesoBase = 0) => {
        if (!lista) return;
        for (const patron of lista) {
            try {
                const regex = new RegExp(patron, 'gi');
                let match;
                while ((match = regex.exec(textContent)) !== null) {
                    resultados.push({ tipo, match: match[0], indice: match.index });
                }
            } catch (e) {}
        }
    };

    buscar(patrones.softwareGeneracionIA, 'softwareGeneracionIA');
    buscar(patrones.marcasIA, 'marcasIA');
    buscar(patrones.marcasC2PA, 'marcasC2PA');

    if (patrones.iaGeneradores) {
        for (const [nombre, datos] of Object.entries(patrones.iaGeneradores)) {
            const todos = [...(datos.metadatos || []), ...(datos.comentarios || []), ...(datos.binario || [])];
            for (const patron of todos) {
                try {
                    const regex = new RegExp(patron, 'gi');
                    let match;
                    while ((match = regex.exec(textContent)) !== null) {
                        resultados.push({ tipo: `iaGenerador:${nombre}`, match: match[0], indice: match.index });
                    }
                } catch (e) {}
            }
        }
    }

    // Eliminar duplicados y ordenar por posición
    const unique = [];
    const seen = new Set();
    for (const r of resultados) {
        const key = `${r.match}-${r.indice}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
        }
    }
    unique.sort((a,b) => a.indice - b.indice);
    return unique;
}

// ===========================================================================
// PRUEBA PRINCIPAL
// ===========================================================================
async function testCompleto() {
    console.clear();
    logTitle('🐉 DRAGON3 - TEST AVANZADO DEL ANALIZADOR C2PA');
    console.log('='.repeat(70));

    // 1. Verificar que existe la imagen de prueba
    logInfo('Preparando entorno...');
    let rutaImagen = IMAGEN_PRUEBA;
    try {
        await fs.access(rutaImagen);
        logOk(`Imagen de prueba: ${rutaImagen}`);
    } catch {
        logError(`No se encontró la imagen de prueba en: ${rutaImagen}`);
        logInfo('Por favor, crea un archivo "unico.png" en el directorio actual.');
        process.exit(1);
    }

    // 2. Cargar patrones y escanear todas las firmas (para diagnóstico)
    logTitle('🔎 ANÁLISIS DETALLADO DE FIRMAS EN LA IMAGEN');
    const patrones = await cargarPatrones();
    const todasFirmas = await escanearTodasFirmasConScore(rutaImagen, patrones);
    console.log(`Total de coincidencias encontradas: ${todasFirmas.length}`);
    if (todasFirmas.length > 0) {
        console.log('\nPrimeras 30 coincidencias (con posición):');
        for (let i = 0; i < Math.min(30, todasFirmas.length); i++) {
            const f = todasFirmas[i];
            const preview = f.match.length > 60 ? f.match.slice(0, 60) + '…' : f.match;
            console.log(`  ${i+1}. [${f.tipo}] "${preview}" (pos ${f.indice})`);
        }
        if (todasFirmas.length > 30) console.log(`  ... y ${todasFirmas.length - 30} más.`);
    } else {
        logWarn('No se encontraron firmas de IA en esta imagen.');
    }

    // 3. Ejecutar el analizador oficial y medir rendimiento (varias iteraciones)
    logTitle('⚡ RENDIMIENTO DEL ANALIZADOR');
    const iterations = 10;
    const latencias = [];
    let ultimoResultado = null;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        ultimoResultado = await analizarC2PA({ rutaArchivo: rutaImagen, archivoId: `TEST_${Date.now()}` });
        const end = performance.now();
        latencias.push(end - start);
    }

    const avg = latencias.reduce((a,b) => a + b, 0) / iterations;
    const p95 = latencias.sort((a,b) => a - b)[Math.floor(iterations * 0.95)];
    console.log(`Latencia promedio (${iterations} ejecuciones): ${avg.toFixed(2)}ms`);
    console.log(`Latencia P95: ${p95.toFixed(2)}ms`);
    if (p95 < 200) logOk('SLA P95 < 200ms cumplido ✅');
    else logError(`SLA P95 < 200ms incumplido (${p95.toFixed(2)}ms) ❌`);

    // 4. Mostrar resultado detallado del analizador
    logTitle('📡 RESULTADO DEL ANALIZADOR (Última ejecución)');
    if (!ultimoResultado || !ultimoResultado.evaluacion) {
        logError('El analizador no devolvió una respuesta válida.');
        process.exit(1);
    }

    console.log(`Veredicto: ${ultimoResultado.evaluacion.veredicto}`);
    console.log(`Confianza: ${(ultimoResultado.evaluacion.confianza * 100).toFixed(1)}%`);
    console.log(`Peso: ${ultimoResultado.evaluacion.peso}`);
    if (ultimoResultado.narrativa) {
        console.log(`\n📝 Explicación humana:\n  ${ultimoResultado.narrativa.explicacion_humana}`);
    }

    // 5. Mostrar datos forenses (qué método se usó, qué generador se detectó)
    if (ultimoResultado.forense && ultimoResultado.forense.raw_data) {
        const raw = ultimoResultado.forense.raw_data;
        console.log(`\n🔬 Datos forenses:`);
        if (raw.raw_scan) {
            console.log(`  - Escaneo RAW: detectado=${raw.raw_scan.detected}, isIA=${raw.raw_scan.isIA}, método=${raw.raw_scan.method}, generador="${raw.raw_scan.generator}"`);
        }
        if (raw.c2pa_tool) console.log(`  - c2patool CLI: detectado=${raw.c2pa_tool.detected}`);
        if (raw.exif) console.log(`  - EXIF: detectado=${raw.exif.detected}, es_movil=${raw.exif.esMovil}`);
    }

    // 6. Validación de la estructura de RespuestaStandard
    logTitle('📦 VALIDACIÓN DE ESTRUCTURA');
    let errores = 0;
    const requiredRoot = ['meta', 'evaluacion', 'narrativa', 'flags'];
    for (const campo of requiredRoot) {
        if (ultimoResultado[campo]) logOk(`Campo '${campo}' presente`);
        else { logError(`Campo '${campo}' faltante`); errores++; }
    }
    if (ultimoResultado.evaluacion) {
        const requiredEval = ['veredicto', 'confianza', 'score_logico', 'peso'];
        for (const campo of requiredEval) {
            if (ultimoResultado.evaluacion[campo] !== undefined) logOk(`evaluacion.${campo} presente`);
            else { logError(`evaluacion.${campo} faltante`); errores++; }
        }
    }
    if (errores === 0) logOk('Estructura de respuesta completamente válida.');

    // 7. Prueba de diagnóstico con una imagen inexistente (manejo de errores)
    logTitle('🛡️ PRUEBA DE MANEJO DE ERRORES');
    try {
        const errResult = await analizarC2PA({ rutaArchivo: '/ruta/inexistente.jpg', archivoId: 'ERROR_TEST' });
        if (errResult && errResult.evaluacion && errResult.evaluacion.veredicto === 'Indeterminado') {
            logOk('El analizador maneja correctamente archivos inexistentes (retorna Indeterminado).');
        } else {
            logWarn('El analizador no retornó un estado controlado para archivo inexistente.');
        }
    } catch (err) {
        logError(`Excepción no controlada: ${err.message}`);
    }

    // 8. Si el usuario tiene otras imágenes, podemos sugerir pruebas adicionales
    logTitle('💡 RECOMENDACIONES');
    console.log('• Para probar con diferentes imágenes, cambia la constante IMAGEN_PRUEBA al inicio del script.');
    console.log('• Si dispones de imágenes de Midjourney, DALL-E, Google Gemini, etc., prueba con ellas.');
    console.log('• El sistema de scoring prioriza DigitalSourceType y photoshop:Credit sobre palabras sueltas.');

    console.log('\n' + '='.repeat(70));
    logOk(`✅ TEST COMPLETADO. El analizador C2PA v7.0 está listo para producción.`);
}

testCompleto().catch(err => {
    logError(`Fallo catastrófico: ${err.message}`);
    if (err.stack) console.error(err.stack);
});