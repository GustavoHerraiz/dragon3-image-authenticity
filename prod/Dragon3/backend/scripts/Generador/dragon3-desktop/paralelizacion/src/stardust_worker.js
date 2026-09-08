// paralelizacion/src/stardust_worker.js
// 🚀 Worker que procesa bloques de 8x8 en paralelo

import { parentPort } from 'worker_threads';

// ================================================================
// 1. TABLAS PRECALCULADAS (DCT)
// ================================================================
const COS_TABLE = new Float64Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// ================================================================
// 2. FUNCIONES DCT / IDCT
// ================================================================
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

// ================================================================
// 3. FUNCIONES DE MANIPULACIÓN DE BLOQUES
// ================================================================
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

// ================================================================
// 4. GENERAR SECUENCIA DNA (64 bits)
// ================================================================
function generarSecuenciaDNA(payload32) {
    const secuencia = [];
    for (let i = 31; i >= 0; i--) {
        const bit = (payload32 >>> i) & 1;
        secuencia.push(bit);
        secuencia.push(bit ^ 1);
    }
    return secuencia;
}

// ================================================================
// 5. INYECTAR BIT EN UN BLOQUE DCT
// ================================================================
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

// ================================================================
// 6. PROCESAR UN BLOQUE COMPLETO
// ================================================================
function procesarBloque(buffer, width, x, y, secuenciaDNA, stepIndex, fuerza) {
    const blueBlock = extraerBloque(buffer, width, x, y);
    const dctBlock = dct8x8(blueBlock);
    
    const bit = secuenciaDNA[stepIndex % 64];
    inyectarBit(dctBlock, bit, fuerza);
    
    const newBlueBlock = idct8x8(dctBlock);
    escribirBloque(buffer, width, x, y, newBlueBlock);
}

// ================================================================
// 7. MENSAJE PRINCIPAL DEL WORKER
// ================================================================
parentPort.on('message', ({ chunk, width, height, payload32, buffer, fuerza = 77 }) => {
    const secuenciaDNA = generarSecuenciaDNA(payload32);
    let bloquesProcesados = 0;
    
    for (const bloque of chunk) {
        const stepIndex = Math.floor(bloque.y / 8) * Math.floor(width / 8) + Math.floor(bloque.x / 8);
        procesarBloque(buffer, width, bloque.x, bloque.y, secuenciaDNA, stepIndex, fuerza);
        bloquesProcesados++;
    }
    
    parentPort.postMessage({ done: true, bloquesProcesados });
});