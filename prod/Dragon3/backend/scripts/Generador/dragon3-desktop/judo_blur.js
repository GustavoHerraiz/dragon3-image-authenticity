// judo_blur.js
// 🥋 JUDO DIGITAL: Aplica compresión JPEG 50 a una imagen con blur y la analiza

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_BLUR = path.resolve('test_estres_output/blur_medium.jpg');
const IMAGEN_BLUR_JUDO = path.resolve('test_estres_output/blur_medium_judo50.jpg');

if (!fs.existsSync(IMAGEN_BLUR)) {
    console.error(`❌ No existe la imagen blur: ${IMAGEN_BLUR}`);
    process.exit(1);
}

console.log('\n🥋 JUDO DIGITAL: Aplicando compresión JPEG 50 a la imagen con blur');
console.log(`   Imagen original: ${IMAGEN_BLUR}`);
console.log(`   Comprimiendo a calidad 50...`);

// Comprimir a calidad 50 (sobrescribir si existe)
await sharp(IMAGEN_BLUR)
    .jpeg({ quality: 50, chromaSubsampling: '4:2:0' })
    .toFile(IMAGEN_BLUR_JUDO);

console.log(`✅ Imagen comprimida guardada: ${IMAGEN_BLUR_JUDO}\n`);

console.log('🔍 Analizando imagen con Judo Digital (calidad 50)...');
const resultado = await analizarImagenMBH_20bits(
    IMAGEN_BLUR_JUDO,
    null,
    120000,
    { modoBlur: true, toleranciaBlur: 3, verbose: true }
);

console.log('\n📊 Resultado:');
console.log(resultado);

if (resultado.identificado) {
    console.log(`\n✅ DETECTADO: ${resultado.hash} (${resultado.cliente} - "${resultado.obra}")`);
    console.log(`   Método: ${resultado.metodo}`);
} else {
    console.log('\n❌ No detectado.');
}