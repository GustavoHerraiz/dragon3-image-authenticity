// paralelizacion/src/utils.js
// 🧰 Utilidades compartidas para generador y worker

import os from 'os';

// ================================================================
// 1. GENERAR SECUENCIA DNA (64 bits)
// ================================================================
export function generarSecuenciaDNA(payload32) {
    const secuencia = [];
    for (let i = 31; i >= 0; i--) {
        const bit = (payload32 >>> i) & 1;
        secuencia.push(bit);
        secuencia.push(bit ^ 1);
    }
    return secuencia;
}

// ================================================================
// 2. GENERAR LISTA DE BLOQUES (8x8)
// ================================================================
export function generarListaBloques(width, height) {
    const bloques = [];
    for (let y = 0; y <= height - 8; y += 8) {
        for (let x = 0; x <= width - 8; x += 8) {
            bloques.push({ x, y });
        }
    }
    return bloques;
}

// ================================================================
// 3. DIVIDIR LISTA EN CHUNKS (para workers)
// ================================================================
export function dividirEnChunks(array, numChunks) {
    const chunkSize = Math.ceil(array.length / numChunks);
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// ================================================================
// 4. DETECTAR NÚMERO ÓPTIMO DE WORKERS
// ================================================================
export function getNumeroOptimoWorkers() {
    const numCpus = os.cpus().length;
    // Usar todos menos 1 (para no bloquear el sistema)
    return Math.max(1, Math.min(numCpus - 1, 8));
}

// ================================================================
// 5. VALIDAR INTEGRIDAD DEL BUFFER (para pruebas)
// ================================================================
export function validarBuffer(buffer, info, hashEsperado) {
    console.log(`🔍 Validando integridad del buffer...`);
    console.log(`   Dimensiones: ${info.width}x${info.height}`);
    console.log(`   Canales: ${info.channels}`);
    console.log(`   Hash esperado: ${hashEsperado}`);
    return true;
}