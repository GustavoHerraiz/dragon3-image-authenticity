// paralelizacion/tests/test_paralelo.js
// 🚀 Prueba de rendimiento: Secuencial REAL vs Paralelo

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import fs from 'fs';
import os from 'os';

import { 
    generarListaBloques, 
    dividirEnChunks, 
    generarSecuenciaDNA
} from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. IMPORTAR FUNCIONES DCT DEL WORKER (REUTILIZAR)
// ================================================================
// Como el worker usa DCT real, importamos las mismas funciones
// para que el secuencial haga el mismo trabajo real

// Leemos el worker y extraemos las funciones DCT
// (o simplemente las copiamos aquí para evitar dependencias)
const COS_TABLE = new Float64Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

function dct8x8(block) {
    const C = (u) => (u === 0 ? 0.7071 : 1);
    const result = new Float64Array(64);
    
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            const cosU = COS_TABLE.subarray(u * 8, u * 8 + 8);
            const cosV = COS_TABLE.subarray(v * 8, v * 8 + 8);
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    sum += block[y][x] * cosU[x] * cosV[y];
                }
            }
            result[v * 8 + u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return result;
}

function idct8x8(dct) {
    const C = (u) => (u === 0 ? 0.7071 : 1);
    const result = new Float64Array(64);
    
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let sum = 0;
            for (let u = 0; u < 8; u++) {
                for (let v = 0; v < 8; v++) {
                    sum += C(u) * C(v) * dct[v * 8 + u] * 
                           Math.cos(((2 * x + 1) * u * Math.PI) / 16) * 
                           Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            result[y * 8 + x] = 0.25 * sum;
        }
    }
    return result;
}

function extraerBloque(buffer, width, x, y) {
    const block = [];
    for (let i = 0; i < 8; i++) {
        const row = [];
        for (let j = 0; j < 8; j++) {
            const idx = ((y + i) * width + (x + j)) * 4 + 2;
            row.push(buffer[idx] - 128);
        }
        block.push(row);
    }
    return block;
}

function escribirBloque(buffer, width, x, y, block) {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const idx = ((y + i) * width + (x + j)) * 4 + 2;
            let val = block[i][j] + 128;
            if (val < 0) val = 0;
            if (val > 255) val = 255;
            buffer[idx] = Math.round(val);
        }
    }
}

function inyectarBit(dctBlock, bit, fuerza) {
    const u1 = 1, v1 = 1;
    const u2 = 2, v2 = 2;
    
    const val1 = dctBlock[v1 * 8 + u1];
    const val2 = dctBlock[v2 * 8 + u2];
    const promedio = (val1 + val2) / 2;
    
    let aplicarFuerza = fuerza;
    if (Math.abs(dctBlock) > 1000) aplicarFuerza = fuerza * 0.8;
    
    if (bit === 1) {
        dctBlock[v1 * 8 + u1] = promedio + (aplicarFuerza / 2);
        dctBlock[v2 * 8 + u2] = promedio - (aplicarFuerza / 2);
    } else {
        dctBlock[v1 * 8 + u1] = promedio - (aplicarFuerza / 2);
        dctBlock[v2 * 8 + u2] = promedio + (aplicarFuerza / 2);
    }
}

function procesarBloque(buffer, width, x, y, secuenciaDNA, stepIndex, fuerza) {
    const blueBlock = extraerBloque(buffer, width, x, y);
    const dctBlock = dct8x8(blueBlock);
    
    const bit = secuenciaDNA[stepIndex % 64];
    inyectarBit(dctBlock, bit, fuerza);
    
    const newBlueBlock = idct8x8(dctBlock);
    escribirBloque(buffer, width, x, y, newBlueBlock);
}

// ================================================================
// 2. FUNCIÓN SECUENCIAL (CON DCT REAL)
// ================================================================
function inyectarStardustSecuencialReal(buffer, width, height, payload32, fuerza = 77) {
    const secuenciaDNA = generarSecuenciaDNA(payload32);
    const bloques = generarListaBloques(width, height);
    let procesados = 0;
    
    for (const bloque of bloques) {
        const stepIndex = Math.floor(bloque.y / 8) * Math.floor(width / 8) + Math.floor(bloque.x / 8);
        procesarBloque(buffer, width, bloque.x, bloque.y, secuenciaDNA, stepIndex, fuerza);
        procesados++;
    }
    
    return procesados;
}

// ================================================================
// 3. FUNCIÓN PARALELA (usa workers)
// ================================================================
function inyectarStardustParalelo(buffer, width, height, payload32, numWorkers) {
    return new Promise((resolve, reject) => {
        const bloques = generarListaBloques(width, height);
        const chunks = dividirEnChunks(bloques, numWorkers);
        const workers = [];
        const promises = [];
        let completados = 0;
        let totalProcesados = 0;

        for (let i = 0; i < chunks.length; i++) {
            const worker = new Worker(path.join(__dirname, '../src/stardust_worker.js'));
            workers.push(worker);
            
            const promise = new Promise((resolveWorker, rejectWorker) => {
                worker.on('message', (result) => {
                    completados++;
                    totalProcesados += result.bloquesProcesados;
                    resolveWorker(result);
                });
                
                worker.on('error', rejectWorker);
                worker.on('exit', (code) => {
                    if (code !== 0) rejectWorker(new Error(`Worker exit code ${code}`));
                });
            });
            
            promises.push(promise);
            
            worker.postMessage({
                chunk: chunks[i],
                width,
                height,
                payload32,
                buffer: buffer.buffer,
                fuerza: 77
            });
        }

        Promise.all(promises)
            .then(() => {
                resolve({ totalProcesados, numWorkers: workers.length });
            })
            .catch(reject)
            .finally(() => {
                workers.forEach(w => w.terminate());
            });
    });
}

// ================================================================
// 4. CONFIGURACIÓN
// ================================================================
const CONFIG = {
    IMAGEN_PRUEBA: path.join(__dirname, '../../prueba.jpg'),
    RESIZE_WIDTH: 200,
    RESIZE_HEIGHT: 200,
    WORKERS_TO_TEST: [1, 2, 4],
    FUERZA: 77
};

// ================================================================
// 5. PRUEBA DE RENDIMIENTO
// ================================================================
async function testRendimiento() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 PRUEBA DE RENDIMIENTO: SECUENCIAL REAL VS PARALELO');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(CONFIG.IMAGEN_PRUEBA)) {
        console.log(`❌ No existe imagen de prueba: ${CONFIG.IMAGEN_PRUEBA}`);
        return;
    }

    // Cargar y redimensionar
    console.log(`📸 Cargando y redimensionando imagen: ${path.basename(CONFIG.IMAGEN_PRUEBA)}`);
    console.log(`   🔥 Tamaño redimensionado: ${CONFIG.RESIZE_WIDTH}x${CONFIG.RESIZE_HEIGHT}`);
    
    const { data, info } = await sharp(CONFIG.IMAGEN_PRUEBA)
        .resize(CONFIG.RESIZE_WIDTH, CONFIG.RESIZE_HEIGHT)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    console.log(`📐 Dimensiones: ${info.width}x${info.height}`);
    console.log(`📊 Bloques 8x8: ${generarListaBloques(info.width, info.height).length}`);
    console.log(`📦 Tamaño buffer: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🧠 Núcleos disponibles: ${os.cpus().length}`);
    console.log('');

    const payload32 = 0x12345678;
    const resultados = [];

    // ================================================================
    // 5.1. SECUENCIAL (CON DCT REAL)
    // ================================================================
    console.log('⏳ Ejecutando secuencial (DCT real)...');
    const bufferSec = new Uint8Array(data);
    const startSec = Date.now();
    const resultSec = inyectarStardustSecuencialReal(bufferSec, info.width, info.height, payload32);
    const timeSec = Date.now() - startSec;
    console.log(`✅ Secuencial: ${timeSec}ms (${resultSec} bloques procesados)`);
    resultados.push({
        nombre: 'Secuencial (real)',
        tiempo: timeSec,
        bloques: resultSec
    });
    console.log('');

    // ================================================================
    // 5.2. PARALELO
    // ================================================================
    for (const numWorkers of CONFIG.WORKERS_TO_TEST) {
        console.log(`⏳ Ejecutando paralelo con ${numWorkers} workers...`);
        const bufferPar = new Uint8Array(data);
        const startPar = Date.now();
        const resultPar = await inyectarStardustParalelo(bufferPar, info.width, info.height, payload32, numWorkers);
        const timePar = Date.now() - startPar;
        
        const mejora = timeSec > 0 ? (timeSec / timePar).toFixed(2) : 'N/A';
        console.log(`✅ Paralelo (${numWorkers}): ${timePar}ms (${resultPar.totalProcesados} bloques) -> Mejora: ${mejora}x`);
        resultados.push({
            nombre: `${numWorkers} workers`,
            tiempo: timePar,
            bloques: resultPar.totalProcesados,
            mejora: parseFloat(mejora)
        });
        console.log('');
    }

    // ================================================================
    // 6. RESULTADOS
    // ================================================================
    console.log('='.repeat(70));
    console.log('📊 RESULTADOS COMPARATIVOS (DCT REAL)');
    console.log('='.repeat(70));
    console.log('');
    console.log('| Configuración      | Tiempo (ms) | Mejora (x) |');
    console.log('|--------------------|-------------|------------|');
    
    for (const r of resultados) {
        const mejora = r.mejora ? r.mejora.toFixed(2) : '1.00';
        console.log(`| ${r.nombre.padEnd(18)} | ${String(r.tiempo).padEnd(11)} | ${mejora.padEnd(10)} |`);
    }
    console.log('');

    // ================================================================
    // 7. RECOMENDACIÓN
    // ================================================================
    console.log('📌 RECOMENDACIÓN:');
    const paralelos = resultados.filter(r => r.nombre.includes('workers'));
    if (paralelos.length > 0) {
        const mejor = paralelos.reduce((a, b) => a.tiempo < b.tiempo ? a : b);
        console.log(`   ✅ Mejor rendimiento: ${mejor.nombre} (${mejor.tiempo}ms)`);
        console.log(`   💡 Mejora sobre secuencial: ${(timeSec / mejor.tiempo).toFixed(2)}x`);
    }

    console.log('\n' + '='.repeat(70));
}

// ================================================================
// 8. EJECUTAR PRUEBA
// ================================================================
testRendimiento();

export { testRendimiento };