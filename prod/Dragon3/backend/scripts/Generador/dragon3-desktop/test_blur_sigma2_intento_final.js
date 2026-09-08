// test_blur_sigma2_intento_final.js
// 🎯 ÚLTIMO INTENTO: sigma=2 con tolerancia 5 y offsets 0..15

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_blur_sigma2_final');
const SIGMA = 2;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    process.exit(1);
}

console.log(`\n🎯 ÚLTIMO INTENTO: Blur sigma=${SIGMA}`);
console.log(`   Tolerancia Hamming: 5`);
console.log(`   Offsets: 0..15\n`);

// 1. Generar imagen con blur sigma=2
const rutaBlur = path.join(OUTPUT_DIR, `blur_sigma_${SIGMA}.png`);
if (!fs.existsSync(rutaBlur)) {
    console.log(`   Generando blur sigma=${SIGMA}...`);
    await sharp(IMAGEN_ORIGINAL).blur(SIGMA).toFile(rutaBlur);
}

// 2. Analizar con modo blur usando tolerancia 5 y offsets 0..15
// Modificamos temporalmente la configuración del analizador
// Para ello, pasamos opciones personalizadas (si el analizador lo permite)
// o modificamos el archivo directamente.

console.log(`   Analizando con tolerancia Hamming=5 y offsets 0..15...`);

// Como el analizador no acepta opciones para offsets y tolerancia directamente,
// usamos el modo blur con los parámetros por defecto (que ya hemos ajustado en el archivo)
// pero sobreescribimos temporalmente las constantes.

// Para esta prueba, vamos a modificar el archivo analizador_v5_20bits.js
// y luego ejecutar el análisis.

// Alternativa: llamamos al analizador con modoBlur: true y confiamos en que
// los cambios en el archivo (offsets 0..15 y tolerancia 5) estén activos.

const res = await analizarImagenMBH_20bits(rutaBlur, null, 120000, {
    modoBlur: true,
    toleranciaBlur: 5,
    verbose: true
});

console.log(`\n📊 Resultado:`);
if (res.identificado) {
    console.log(`✅ DETECTADO: ${res.hash} (${res.cliente} - "${res.obra}")`);
    console.log(`   Método: ${res.metodo}`);
} else {
    console.log(`❌ No detectado.`);
    console.log(`   Veredicto: ${res.veredicto}`);
}