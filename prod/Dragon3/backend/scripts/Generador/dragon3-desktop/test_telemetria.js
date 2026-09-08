// test_telemetria.js
// 🧪 TEST DE TELEMETRÍA EXACTA (TILES CENTRALES) + COMPARATIVA ORIGINAL vs BLUR

import { analizarImagenMBH_20bits, compararOriginalYBlur } from './src/backend/analizador_v5_20bits.js';
import path from 'path';
import fs from 'fs';

const IMAGEN_BLUR = path.resolve('test_estres_output/blur_medium.jpg');
const IMAGEN_ORIGINAL = path.resolve('prueba.jpg');

if (!fs.existsSync(IMAGEN_BLUR)) {
    console.error('❌ No existe la imagen blur_medium.jpg');
    process.exit(1);
}

// ADN esperado para el ID 83A4F (de la base de datos)
const ADN_ESPERADO = "100000111010010011110000"; // 24 bits

console.log('\n🧪 PRUEBA DE TELEMETRÍA EXACTA');
console.log('   Opciones:');
console.log('   1. Diagnóstico de tiles centrales (6,7,10,11) en blur');
console.log('   2. Comparativa Original vs Blur\n');

// ---- 1. Diagnóstico en blur ----
console.log('🔍 [DIAGNÓSTICO EN BLUR]');
const resultadoBlur = await analizarImagenMBH_20bits(
    IMAGEN_BLUR,
    null,
    120000,
    {
        diagnosticoParidad: true,
        verbose: false
    }
);

// ---- 2. Comparativa Original vs Blur (si existe la imagen original) ----
if (fs.existsSync(IMAGEN_ORIGINAL)) {
    console.log('\n🔍 [COMPARATIVA ORIGINAL vs BLUR]');
    await compararOriginalYBlur(IMAGEN_ORIGINAL, IMAGEN_BLUR, ADN_ESPERADO);
} else {
    console.log('\n⚠️ No se encontró la imagen original (prueba.jpg) para comparar.');
}

console.log('\n✅ PRUEBA COMPLETADA');