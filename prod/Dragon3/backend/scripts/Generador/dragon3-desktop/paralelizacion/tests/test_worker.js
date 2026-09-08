// paralelizacion/tests/test_worker.js
// 🧪 Prueba unitaria: Worker vs Secuencial (un solo bloque)

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { generarListaBloques } from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 2. FUNCIÓN SECUENCIAL (referencia)
// ================================================================
function inyectarStardustSecuencial(buffer, width, height, payload32) {
    // Simulamos procesamiento (solo para comparar tiempos)
    const bloques = generarListaBloques(width, height);
    return bloques.length;
}

// ================================================================
// 3. FUNCIÓN PARALELA (usa worker)
// ================================================================
function inyectarStardustParalelo(buffer, width, height, payload32) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, '../src/stardust_worker.js'));
        const bloques = generarListaBloques(width, height);
        const chunk = bloques.slice(0, 1); // Solo un bloque para prueba
        
        worker.on('message', (result) => {
            resolve(result);
            worker.terminate();
        });
        
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker exit code ${code}`));
        });
        
        worker.postMessage({
            chunk,
            width,
            height,
            payload32,
            buffer: buffer.buffer, // SharedArrayBuffer
            fuerza: 77
        });
    });
}

// ================================================================
// 4. PRUEBA
// ================================================================
async function testWorker() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST UNITARIO: WORKER VS SECUENCIAL');
    console.log('='.repeat(60) + '\n');

    try {
        // Crear imagen de prueba (10x10 píxeles, para tener al menos un bloque 8x8)
        const width = 10;
        const height = 10;
        const channels = 4;
        const buffer = new Uint8Array(width * height * channels);
        
        // Rellenar con datos de prueba (píxeles aleatorios)
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256);
        }
        
        const payload32 = 0x12345678; // ID de prueba
        const bloques = generarListaBloques(width, height);
        
        console.log(`📐 Imagen de prueba: ${width}x${height}`);
        console.log(`📊 Bloques 8x8: ${bloques.length}`);
        console.log(`🔑 Payload: 0x${payload32.toString(16).toUpperCase()}`);
        console.log('');

        // ================================================================
        // 5. EJECUTAR SECUENCIAL
        // ================================================================
        console.log('⏳ Ejecutando secuencial...');
        const startSec = Date.now();
        const resultSec = inyectarStardustSecuencial(buffer, width, height, payload32);
        const timeSec = Date.now() - startSec;
        console.log(`✅ Secuencial: ${timeSec}ms (${resultSec} bloques procesados)`);

        // ================================================================
        // 6. EJECUTAR PARALELO (worker)
        // ================================================================
        console.log('⏳ Ejecutando worker...');
        const startPar = Date.now();
        const resultPar = await inyectarStardustParalelo(buffer, width, height, payload32);
        const timePar = Date.now() - startPar;
        console.log(`✅ Worker: ${timePar}ms (${resultPar.bloquesProcesados} bloques procesados)`);

        // ================================================================
        // 7. COMPARACIÓN
        // ================================================================
        console.log('\n' + '='.repeat(60));
        console.log('📊 COMPARACIÓN');
        console.log('='.repeat(60));
        console.log(`   Secuencial: ${timeSec}ms`);
        console.log(`   Worker:     ${timePar}ms`);
        console.log(`   Mejora:     ${(timeSec / timePar).toFixed(2)}x`);
        console.log(`   Resultado:  ${resultPar.bloquesProcesados === resultSec ? '✅ COINCIDE' : '❌ NO COINCIDE'}`);
        console.log('');

        if (resultPar.bloquesProcesados === resultSec) {
            console.log('🎉 ¡PRUEBA SUPERADA! El worker procesa correctamente los bloques.');
        } else {
            console.log('❌ PRUEBA FALLIDA: El número de bloques procesados no coincide.');
        }

    } catch (err) {
        console.error('❌ Error en la prueba:', err);
    }
}

// ================================================================
// 8. EJECUTAR PRUEBA
// ================================================================
testWorker();

// ================================================================
// 9. EXPORTAR (para usar desde otros scripts)
// ================================================================
export { testWorker };