// paralelizacion/test_estres_20bits.js
// 🧪 PRUEBA DE ESTRÉS DEL SELLO 20 BITS (VERSIÓN DEFINITIVA CON PRIORIZACIÓN)
//    - Compresión JPEG (100 → 10) con opciones genéricas (sin deep scan)
//    - Ataques: Blur, Crop, Noise, Resize con configuraciones específicas
//    - Tabla final resumida

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { analizarImagenMBH_20bits } from '../src/backend/analizador_v5_20bits.js';
import { DragonDB } from '../src/backend/database.js';
import { GeneradorMBH_20bits } from '../src/backend/generadorMBH_20bits.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'test_estres_output');
const TEST_IMAGES_DIR = path.join(__dirname, '..', 'test_imagenes');
const REFERENCE_IMAGE = path.join(__dirname, '..', 'prueba.jpg');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TEST_IMAGES_DIR)) fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });

// ================================================================
// BASE DE DATOS
// ================================================================
let db;
try {
    db = new DragonDB();
    await db._ensureOpen();
} catch (e) {
    console.warn(`⚠️ DB en memoria: ${e.message}`);
    const BASE = [];
    db = {
        async buscarPorHash(hash) {
            return BASE.find(s => s.hash_suffix === hash) || null;
        }
    };
}

// ================================================================
// OBTENER O GENERAR IMAGEN DE REFERENCIA
// ================================================================
async function obtenerImagenReferencia() {
    const archivos = fs.readdirSync(TEST_IMAGES_DIR).filter(f => f.startsWith('referencia_') && f.endsWith('.png'));
    if (archivos.length > 0) {
        const stats = archivos.map(f => ({ name: f, mtime: fs.statSync(path.join(TEST_IMAGES_DIR, f)).mtime }));
        stats.sort((a, b) => b.mtime - a.mtime);
        return path.join(TEST_IMAGES_DIR, stats[0].name);
    }

    console.log('🔧 Generando imagen de referencia...');
    if (!fs.existsSync(REFERENCE_IMAGE)) {
        console.error(`❌ No existe ${REFERENCE_IMAGE}.`);
        process.exit(1);
    }

    const generador = new GeneradorMBH_20bits(db, null);
    const idNumerico = (Date.now() & 0xFFFFF);
    const idHex = idNumerico.toString(16).toUpperCase().padStart(5, '0');
    const rutaSalida = path.join(TEST_IMAGES_DIR, `referencia_${idHex}.png`);

    const resultado = await generador.sellarImagen(REFERENCE_IMAGE, rutaSalida, {
        cliente: 'Prueba Estrés',
        obra: 'Test 20 bits',
        id_numerico: idNumerico,
        proyectoId: 1
    });

    if (!resultado.ok) {
        console.error(`❌ Error generando referencia: ${resultado.error}`);
        process.exit(1);
    }

    console.log(`✅ Referencia generada: ${path.basename(rutaSalida)}`);
    return rutaSalida;
}

// ================================================================
// GENERAR ATAQUES
// ================================================================
async function generarAtaques(imagenRef) {
    const ataques = [
        { nombre: 'blur_medium.jpg', fn: (img) => img.blur(5) },
        { nombre: 'crop_80percent.jpg', fn: (img) => {
            const { width, height } = img.options;
            const cropW = Math.round(width * 0.8);
            const cropH = Math.round(height * 0.8);
            const left = Math.round((width - cropW) / 2);
            const top = Math.round((height - cropH) / 2);
            return img.extract({ left, top, width: cropW, height: cropH });
        }},
        { nombre: 'noise_5percent.jpg', fn: (img) => img.blur(0.5).modulate({ brightness: 1.05 }) },
        { nombre: 'resize_50percent.jpg', fn: (img) => img.resize({ width: Math.round(img.options.width / 2) }) }
    ];

    for (const ataque of ataques) {
        const rutaSalida = path.join(OUTPUT_DIR, ataque.nombre);
        if (fs.existsSync(rutaSalida)) continue;
        try {
            let pipeline = sharp(imagenRef);
            pipeline = ataque.fn(pipeline);
            await pipeline.png({ compressionLevel: 6 }).toFile(rutaSalida);
        } catch (err) {
            console.log(`❌ Error generando ${ataque.nombre}: ${err.message}`);
        }
    }
}

// ================================================================
// PRUEBA DE COMPRESIÓN JPEG (con opciones genéricas)
// ================================================================
async function pruebasCompresion(imagenRef) {
    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const resultados = [];

    for (const calidad of calidades) {
        const nombre = `jpeg_q${calidad}.jpg`;
        const ruta = path.join(OUTPUT_DIR, nombre);
        if (!fs.existsSync(ruta)) {
            await sharp(imagenRef)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(ruta);
        }

        const stats = fs.statSync(ruta);
        const tamañoKB = (stats.size / 1024).toFixed(1);

        const inicio = performance.now();
        // Opciones genéricas: sin deep scan, priorización por defecto
        const resultado = await analizarImagenMBH_20bits(ruta, null, 120000, {
            verbose: false,
            deepScan: false,
            fastMode: true,
            fullMode: true
        });
        const tiempo = Math.round(performance.now() - inicio);

        resultados.push({
            tipo: 'Compresión',
            calidad,
            tamañoKB: parseFloat(tamañoKB),
            detectado: resultado.identificado,
            hash: resultado.identificado ? resultado.hash : '-',
            metodo: resultado.identificado ? resultado.metodo : '-',
            tiempo,
            bloques: resultado.bloques || '-',
            error: resultado.error || (resultado.identificado ? '' : 'No detectado')
        });
    }
    return resultados;
}

// ================================================================
// PRUEBAS DE ATAQUES (con configuraciones específicas)
// ================================================================
async function pruebasAtaques() {
    const ataques = [
        {
            nombre: 'Blur (sigma=5)',
            archivo: 'blur_medium.jpg',
            opts: {
                escalas: [1.0],
                modos: ['NOR'],
                rotaciones: [0],
                fastMode: true,
                fullMode: false,
                fastIterTimeout: 20000,
                deepScan: false,
                verbose: false
            }
        },
        {
            nombre: 'Crop (80%)',
            archivo: 'crop_80percent.jpg',
            opts: {
                escalas: [0.8, 1.0, 1.2],
                modos: ['NOR'],
                rotaciones: [0],
                fastMode: true,
                fullMode: true,
                fastIterTimeout: 20000,
                fullIterTimeout: 60000,
                deepScan: true,
                deepScanOffsets: 63,
                verbose: false
            }
        },
        {
            nombre: 'Noise (5%)',
            archivo: 'noise_5percent.jpg',
            opts: {
                escalas: [1.0],
                modos: ['NOR'],
                rotaciones: [0],
                fastMode: true,
                fullMode: true,
                deepScan: false,
                verbose: false
            }
        },
        {
            nombre: 'Resize (50%)',
            archivo: 'resize_50percent.jpg',
            opts: {
                escalas: [0.45, 0.5, 0.55, 0.6],
                modos: ['NOR'],
                rotaciones: [0],
                fastMode: true,
                fullMode: true,
                deepScan: false,
                verbose: false
            }
        }
    ];

    const resultados = [];

    for (const ataque of ataques) {
        const ruta = path.join(OUTPUT_DIR, ataque.archivo);
        if (!fs.existsSync(ruta)) {
            resultados.push({
                tipo: 'Ataque',
                nombre: ataque.nombre,
                tamañoKB: 'ERROR',
                detectado: false,
                hash: '-',
                metodo: '-',
                tiempo: '-',
                bloques: '-',
                error: 'Archivo no existe'
            });
            continue;
        }

        const stats = fs.statSync(ruta);
        const tamañoKB = (stats.size / 1024).toFixed(1);

        const inicio = performance.now();
        const resultado = await analizarImagenMBH_20bits(ruta, null, 120000, ataque.opts);
        const tiempo = Math.round(performance.now() - inicio);

        resultados.push({
            tipo: 'Ataque',
            nombre: ataque.nombre,
            tamañoKB: parseFloat(tamañoKB),
            detectado: resultado.identificado,
            hash: resultado.identificado ? resultado.hash : '-',
            metodo: resultado.identificado ? resultado.metodo : '-',
            tiempo,
            bloques: resultado.bloques || '-',
            error: resultado.error || (resultado.identificado ? '' : 'No detectado')
        });
    }
    return resultados;
}

// ================================================================
// TABLA FINAL RESUMEN
// ================================================================
function mostrarTablaFinal(resultadosCompresion, resultadosAtaques) {
    const todos = [...resultadosCompresion, ...resultadosAtaques];

    console.log('\n' + '='.repeat(130));
    console.log('📊 TABLA FINAL DE RESULTADOS');
    console.log('='.repeat(130));

    console.log('| Tipo       | Prueba            | Tamaño(KB) | Detección | Hash   | Método               | Tiempo(ms) | Bloques | Observación       |');
    console.log('|------------|-------------------|------------|-----------|--------|----------------------|------------|---------|-------------------|');

    for (const r of todos) {
        const tipo = r.tipo === 'Compresión' ? `Compresión` : 'Ataque';
        const prueba = r.tipo === 'Compresión' ? `q${r.calidad}` : r.nombre;
        const deteccion = r.detectado ? '✅' : (r.error === 'timeout' ? '⏱️' : '❌');
        const hash = r.hash.padEnd(6);
        const metodo = (r.metodo || '-').padEnd(20);
        const tiempo = String(r.tiempo).padEnd(10);
        const bloques = String(r.bloques).padEnd(7);
        const observacion = r.error || (r.detectado ? 'OK' : 'Fallo');

        console.log(`| ${tipo.padEnd(10)} | ${prueba.padEnd(17)} | ${String(r.tamañoKB).padEnd(10)} | ${deteccion.padEnd(9)} | ${hash} | ${metodo} | ${tiempo} | ${bloques} | ${observacion.padEnd(17)} |`);
    }

    console.log('='.repeat(130));

    const total = todos.length;
    const detectados = todos.filter(r => r.detectado).length;
    const timeouts = todos.filter(r => r.error === 'timeout').length;
    const fallos = todos.filter(r => !r.detectado && r.error !== 'timeout').length;
    const avgTime = Math.round(todos.reduce((a, b) => a + (typeof b.tiempo === 'number' ? b.tiempo : 0), 0) / total);

    console.log(`\n📌 RESUMEN:`);
    console.log(`   ✅ Detectados: ${detectados}/${total} (${(detectados/total*100).toFixed(0)}%)`);
    console.log(`   ⏱️ Timeouts: ${timeouts}`);
    console.log(`   ❌ Fallos: ${fallos}`);
    console.log(`   ⏱️ Tiempo medio: ${avgTime}ms`);
    console.log('='.repeat(130));
}

// ================================================================
// MAIN
// ================================================================
async function main() {
    console.log('\n🧪 PRUEBA DE ESTRÉS DEL SELLO 20 BITS (VERSIÓN DEFINITIVA CON PRIORIZACIÓN)');
    console.log('   Compresión JPEG + Ataques (Blur, Crop, Noise, Resize)');

    const imagenRef = await obtenerImagenReferencia();
    await generarAtaques(imagenRef);

    const resultadosCompresion = await pruebasCompresion(imagenRef);
    const resultadosAtaques = await pruebasAtaques();

    mostrarTablaFinal(resultadosCompresion, resultadosAtaques);

    console.log('\n✅ PRUEBA COMPLETADA');
}

main().catch(console.error);