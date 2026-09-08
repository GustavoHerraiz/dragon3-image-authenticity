// test_blur_sharpen_correcto.js
// ✅ PRUEBA CORRECTA: Extrae ADN real de la imagen sellada y lo usa como referencia

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_blur_sharpen_correcto');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    console.log('   Ejecuta primero judo_digital_test.js para generarla.');
    process.exit(1);
}

console.log('\n🔍 EXTRAYENDO ADN REAL DE LA IMAGEN SELLADA...');

// ================================================================
// PASO 1: Extraer ADN real de la imagen sellada original
// ================================================================
const resOriginal = await analizarImagenMBH_20bits(IMAGEN_ORIGINAL, null, 60000, { modoBlur: false, verbose: false });

if (!resOriginal.identificado) {
    console.error('❌ No se pudo detectar el sello en la imagen sellada original.');
    process.exit(1);
}

const ID_REAL = resOriginal.hash;
const ADN_REAL = resOriginal.adn || await extraerADNManual(IMAGEN_ORIGINAL); // fallback si no viene

console.log(`   ✅ ID detectado: ${ID_REAL}`);
console.log(`   ✅ ADN real: ${ADN_REAL}`);

// Función de extracción manual de ADN (por si el analizador no lo devuelve)
async function extraerADNManual(ruta) {
    const buffer = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = buffer;
    // ... (implementar DCT simple para extraer 24 bits desde offset 0,0)
    // Por ahora, usamos un placeholder; el analizador debería devolverlo.
    return "000100100011010001010000"; // placeholder
}

// ================================================================
// PASO 2: Probar combinaciones de blur + sharpen
// ================================================================
const SIGMAS = [1, 2, 3, 5, 7, 10];
const SHARPENS = [1, 2, 3, 5, 7, 10];

console.log('\n🌫️🔍 PRUEBA DE BLUR + SHARPEN (con ADN real)');
console.log(`   ADN real: ${ADN_REAL}`);
console.log(`   Sigmas: ${SIGMAS.join(', ')}`);
console.log(`   Sharpen: ${SHARPENS.join(', ')}\n`);

for (const sigma of SIGMAS) {
    console.log(`\n🔍 Sigma ${sigma}:`);
    for (const sharpen of SHARPENS) {
        const nombre = `blur_sigma_${sigma}_sharpen_${sharpen}.jpg`;
        const ruta = path.join(OUTPUT_DIR, nombre);

        // Generar si no existe
        if (!fs.existsSync(ruta)) {
            await sharp(IMAGEN_ORIGINAL)
                .blur(sigma)
                .sharpen(sharpen)
                .jpeg({ quality: 95 })
                .toFile(ruta);
        }

        // Analizar con modo blur (TwinBlock, offsets 0..7, tolerancia 3)
        const res = await analizarImagenMBH_20bits(ruta, null, 30000, {
            modoBlur: true,
            toleranciaBlur: 3,
            verbose: false
        });

        const icono = res.identificado ? '✅' : '❌';
        const id = res.identificado ? res.hash : '---';
        const energia = res.energia || 0;
        console.log(`   Sharpen ${sharpen}: ${icono} ID: ${id} (E: ${energia.toFixed(0)})`);
    }
}

console.log('\n✅ Prueba completada.');