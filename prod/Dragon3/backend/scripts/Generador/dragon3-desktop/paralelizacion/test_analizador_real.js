// paralelizacion/test_analizador_real.js
// 🔬 TEST: ANALIZADOR REAL DENTRO DEL ENTORNO DEL TEST

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. IMPORTAR EL ANALIZADOR REAL
// ================================================================
const { analizarImagenMBH_20bits } = await import('../src/backend/analizador_v5_20bits.js');

// ================================================================
// 2. CONFIGURACIÓN
// ================================================================
const OUTPUT_DIR = path.join(__dirname, 'test_v5_real');
const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'prueba_20bits.png');
const CALIDADES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

// ================================================================
// 3. DB EN MEMORIA (como el test)
// ================================================================
// Inyectamos la DB en memoria en el analizador real
// Para ello, modificamos el comportamiento de validarBits24 en el analizador real
// Pero como no podemos modificar el código en tiempo de ejecución,
// usamos el mismo enfoque que el test: la DB en memoria se define en el archivo del analizador.
// Si el analizador real usa su propia DB, tendremos que parchearlo.

// En lugar de parchear, vamos a leer el archivo del analizador y modificarlo temporalmente
// para que use la DB en memoria del test.

console.log('\n' + '='.repeat(70));
console.log('🔬 ANALIZADOR REAL DENTRO DEL TEST');
console.log('='.repeat(70) + '\n');

// ================================================================
// 4. FUNCIÓN PARA ANALIZAR UNA IMAGEN CON EL ANALIZADOR REAL
// ================================================================
async function analizarConAnalizadorReal(ruta, label) {
    // Simulamos un objeto db que no se usa (el analizador real usa SQLite)
    // Pero el analizador real tiene su propia DB en memoria (BASE_DE_DATOS_20BITS)
    // que ya debe tener el hash 12345.
    const db = null; // No se usa

    console.log(`\n🔍 Analizando: ${label}...`);
    const start = performance.now();
    const resultado = await analizarImagenMBH_20bits(ruta, db, 60000);
    const elapsed = performance.now() - start;

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
    if (!fs.existsSync(IMAGEN_SELLADA)) {
        console.log(`❌ No existe imagen sellada: ${IMAGEN_SELLADA}`);
        return;
    }

    console.log('📊 PRUEBA DE COMPRESIÓN JPEG (100 → 10)');
    console.log('   🔥 Usando ANALIZADOR REAL (src/backend/analizador_v5_20bits.js)');
    console.log('   📌 DB en memoria (BASE_DE_DATOS_20BITS) debe contener 12345');
    console.log('');

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

            const res = await analizarConAnalizadorReal(rutaSalida, `Calidad ${calidad}`);
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

    const detectados = resultados.filter(r => r.identificado);
    const total = resultados.length;

    console.log('\n📌 RESUMEN:');
    console.log(`   ✅ Detectado en ${detectados.length}/${total} calidades (${(detectados.length/total*100).toFixed(0)}%)`);

    if (detectados.length > 0) {
        const tiempos = detectados.map(r => r.tiempo_ms);
        const media = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
        console.log(`   ⏱️ Tiempo medio de detección: ${media}ms`);
        const ultimo = detectados[detectados.length - 1];
        console.log(`   🔥 Última calidad detectada: ${ultimo.calidad} (${ultimo.tamañoKB} KB)`);
    }

    const fallos = resultados.filter(r => !r.identificado);
    if (fallos.length > 0) {
        console.log(`   ❌ Fallos en calidades: ${fallos.map(r => r.calidad).join(', ')}`);
    }
}

// ================================================================
// 6. EJECUTAR
// ================================================================
testCompresion().catch(console.error);