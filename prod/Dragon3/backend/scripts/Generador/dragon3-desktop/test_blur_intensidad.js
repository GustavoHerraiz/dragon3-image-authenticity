// test_blur_intensidad.js
// 🌫️ PRUEBA DE INTENSIDAD DE BLUR: Encuentra el límite de detección
//    - Aplica blur con sigma: 1, 2, 3, 5, 7, 10
//    - Analiza cada una con Motor 1 (umbral) y modo blur (TwinBlock)
//    - Muestra tabla de resultados y límite

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_blur_intensidad');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    console.log('   Ejecuta primero judo_digital_test.js para generarla.');
    process.exit(1);
}

console.log('\n🌫️ PRUEBA DE INTENSIDAD DE BLUR');
console.log('   Buscando el límite de detección (sigma 1 a 10)');
console.log('   Imagen original: ${IMAGEN_ORIGINAL}\n');

// ================================================================
// CONFIGURACIÓN
// ================================================================
const SIGMAS = [1, 2, 3, 5, 7, 10];
const resultados = [];

// ================================================================
// FUNCIÓN PARA APLICAR BLUR Y ANALIZAR
// ================================================================
async function probarBlur(sigma) {
    const nombre = `blur_sigma_${sigma}.png`;
    const rutaBlur = path.join(OUTPUT_DIR, nombre);

    console.log(`\n🔍 Probando sigma=${sigma}...`);

    // Generar imagen con blur (solo si no existe)
    if (!fs.existsSync(rutaBlur)) {
        await sharp(IMAGEN_ORIGINAL)
            .blur(sigma)
            .toFile(rutaBlur);
    }

    // 1. Motor 1 (umbral) en (0,0)
    const res1 = await analizarImagenMBH_20bits(rutaBlur, null, 60000, { modoBlur: false, verbose: false });
    let motor1 = res1.identificado ? '✅' : '❌';
    let id1 = res1.identificado ? res1.hash : '-';

    // 2. Modo blur (TwinBlock con offsets) si Motor 1 falla
    let motor2 = '❌';
    let id2 = '-';
    if (!res1.identificado) {
        const res2 = await analizarImagenMBH_20bits(rutaBlur, null, 60000, { modoBlur: true, toleranciaBlur: 3, verbose: false });
        motor2 = res2.identificado ? '✅' : '❌';
        id2 = res2.identificado ? res2.hash : '-';
    } else {
        motor2 = '-';
    }

    const detectado = res1.identificado || (motor2 === '✅');
    const idDetectado = res1.identificado ? id1 : id2;

    resultados.push({
        sigma,
        motor1,
        motor2,
        detectado,
        id: idDetectado
    });

    console.log(`   Motor 1: ${motor1}${res1.identificado ? ' (ID: '+res1.hash+')' : ''}`);
    console.log(`   Modo blur: ${motor2}${motor2 === '✅' ? ' (ID: '+res2.hash+')' : ''}`);
}

// ================================================================
// EJECUTAR PRUEBAS
// ================================================================
for (const sigma of SIGMAS) {
    await probarBlur(sigma);
}

// ================================================================
// TABLA DE RESULTADOS
// ================================================================
console.log('\n📊 RESUMEN DE DETECCIÓN POR INTENSIDAD DE BLUR');
console.log('| Sigma | Motor 1 | Modo Blur | Detectado | ID |');
console.log('|-------|---------|-----------|-----------|----|');
for (const r of resultados) {
    console.log(`| ${String(r.sigma).padEnd(5)} | ${r.motor1.padEnd(7)} | ${r.motor2.padEnd(9)} | ${r.detectado ? '✅' : '❌'}     | ${r.id.padEnd(4)} |`);
}

// Límite: el sigma más alto donde detecta (usando cualquiera de los dos motores)
const detectados = resultados.filter(r => r.detectado);
if (detectados.length > 0) {
    const maxSigma = detectados.reduce((a, b) => a.sigma > b.sigma ? a : b);
    console.log(`\n🏆 Límite de detección: sigma=${maxSigma.sigma} (${maxSigma.id})`);
} else {
    console.log('\n❌ No se detectó en ninguna intensidad de blur.');
}

// Analizar el primer fallo
const fallos = resultados.filter(r => !r.detectado);
if (fallos.length > 0) {
    const primerFallo = fallos[0];
    console.log(`\n⚠️ Primer fallo en sigma=${primerFallo.sigma}`);
    console.log(`   Motor 1: ${primerFallo.motor1}`);
    console.log(`   Modo blur: ${primerFallo.motor2}`);
}

console.log('\n✅ Prueba completada.');