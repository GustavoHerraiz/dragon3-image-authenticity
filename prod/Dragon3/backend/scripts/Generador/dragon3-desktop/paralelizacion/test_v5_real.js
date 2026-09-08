// paralelizacion/test_v5_real.js
// 🧪 PRUEBA DEL ANALIZADOR V5 20 BITS REAL (src/backend/analizador_v5_20bits.js)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { DragonDB } from '../src/backend/database.js';
import { LicenseManager } from '../src/backend/license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. IMPORTAR GENERADOR Y ANALIZADOR REALES
// ================================================================
const { GeneradorMBH_20bits } = await import('../src/backend/generadorMBH_20bits.js');
const { analizarImagenMBH_20bits } = await import('../src/backend/analizador_v5_20bits.js');

// ================================================================
// 2. CONFIGURACIÓN
// ================================================================
const IMAGEN_ORIGINAL = path.join(__dirname, '../prueba.jpg');
const OUTPUT_DIR = path.join(__dirname, 'test_v5_real');
const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'prueba_20bits.png');

const CALIDADES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

// ================================================================
// 3. GENERAR IMAGEN SELLADA (USANDO GENERADOR REAL)
// ================================================================
async function generarSello() {
    console.log('\n' + '='.repeat(70));
    console.log('🔧 GENERANDO SELLO CON GENERADOR REAL');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ No existe imagen original: ${IMAGEN_ORIGINAL}`);
        return false;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Si ya existe, no regenerar
    if (fs.existsSync(IMAGEN_SELLADA)) {
        console.log(`✅ Imagen ya existe: ${path.basename(IMAGEN_SELLADA)}`);
        return true;
    }

    const db = new DragonDB();
    await db._ensureOpen();
    const licenseManager = new LicenseManager(db);
    const generador = new GeneradorMBH_20bits(db, licenseManager);

    const resultado = await generador.sellarImagen(IMAGEN_ORIGINAL, IMAGEN_SELLADA, {
        cliente: 'Prueba V5 Real',
        obra: 'Test Analizador Real',
        proyecto_nombre: 'Proyecto_Prueba_Real',
        id_numerico: 0x12345
    });

    await db.cerrar();

    if (!resultado.ok) {
        console.log(`❌ Error generando: ${resultado.error}`);
        return false;
    }

    console.log(`✅ Sello generado: ${resultado.id}`);
    return true;
}

// ================================================================
// 4. ANALIZAR CON V5 REAL
// ================================================================
async function analizarConV5Real(ruta, label) {
    const db = new DragonDB();
    await db._ensureOpen();

    console.log(`\n🔍 Analizando: ${label}...`);
    const start = performance.now();
    const resultado = await analizarImagenMBH_20bits(ruta, db, 120000);
    const elapsed = performance.now() - start;

    await db.cerrar();

    return {
        ...resultado,
        tiempo_ms: Math.round(elapsed),
        label
    };
}

// ================================================================
// 5. PRUEBA DE COMPRESIÓN
// ================================================================
async function testCompresion() {
    console.log('\n' + '='.repeat(70));
    console.log('💥 PRUEBA DE COMPRESIÓN JPEG (100 → 10)');
    console.log('   🔥 ANALIZADOR REAL: src/backend/analizador_v5_20bits.js');
    console.log('='.repeat(70) + '\n');

    const resultados = [];

    console.log('| Calidad | Tamaño (KB) | Detección | Hash | Tiempo (ms) | Método |');
    console.log('|---------|-------------|-----------|------|-------------|--------|');

    for (const calidad of CALIDADES) {
        const nombreSalida = `prueba_q${calidad}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);

        try {
            await sharp(IMAGEN_SELLADA)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);

            const res = await analizarConV5Real(rutaSalida, `Calidad ${calidad}`);
            const ok = res.identificado ? '✅' : '❌';
            const hash = res.identificado ? res.hash : '-';
            const metodo = res.metodo || (res.identificado ? 'temprano' : '-');

            console.log(`| ${String(calidad).padEnd(7)} | ${String(tamañoKB).padEnd(11)} | ${ok.padEnd(9)} | ${hash.padEnd(4)} | ${String(res.tiempo_ms).padEnd(11)} | ${metodo.padEnd(6)} |`);

            resultados.push({
                calidad,
                tamañoKB: parseFloat(tamañoKB),
                identificado: res.identificado,
                hash: res.hash,
                tiempo_ms: res.tiempo_ms,
                metodo: metodo
            });

        } catch (err) {
            console.log(`| ${calidad} | ERROR | ❌ | - | - | - |`);
        }
    }

    return resultados;
}

// ================================================================
// 6. RESUMEN FINAL
// ================================================================
function mostrarResumen(resultados) {
    const detectados = resultados.filter(r => r.identificado);
    const total = resultados.length;

    console.log('\n📌 RESUMEN FINAL:');
    console.log(`   ✅ Detectado en ${detectados.length}/${total} calidades (${(detectados.length/total*100).toFixed(0)}%)`);

    if (detectados.length > 0) {
        const tiempos = detectados.map(r => r.tiempo_ms);
        const media = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
        console.log(`   ⏱️ Tiempo medio de detección: ${media}ms`);
        console.log(`   ⚡ Tiempo mínimo: ${Math.min(...tiempos)}ms`);
        console.log(`   🐢 Tiempo máximo: ${Math.max(...tiempos)}ms`);

        const ultimo = detectados[detectados.length - 1];
        console.log(`   🔥 Última calidad detectada: ${ultimo.calidad} (${ultimo.tamañoKB} KB)`);

        const tempranos = detectados.filter(r => r.metodo === 'temprano' || r.metodo === 'temprano_rotado');
        console.log(`   🚀 Detecciones tempranas: ${tempranos.length}/${detectados.length}`);
    }

    const fallos = resultados.filter(r => !r.identificado);
    if (fallos.length > 0) {
        console.log(`   ❌ Fallos en calidades: ${fallos.map(r => r.calidad).join(', ')}`);
    }
}

// ================================================================
// 7. MAIN
// ================================================================
async function main() {
    console.log('\n' + '🐉'.repeat(40));
    console.log('   DRAGON3 - TEST V5 REAL (src/backend/)');
    console.log('🐉'.repeat(40) + '\n');

    const generado = await generarSello();
    if (!generado) {
        console.log('❌ No se pudo generar la imagen.');
        return;
    }

    const resultados = await testCompresion();

    console.log('\n' + '='.repeat(70));
    mostrarResumen(resultados);
    console.log('='.repeat(70));

    console.log('\n✅ TEST COMPLETADO');
}

// ================================================================
// 8. EJECUTAR
// ================================================================
main().catch(console.error);