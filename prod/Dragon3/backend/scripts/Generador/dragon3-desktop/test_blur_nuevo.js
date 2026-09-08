// test_blur_nuevo.js
// 🧪 PRUEBA DEL NUEVO ANALIZADOR CON BARRIDO EXHAUSTIVO EN BLUR

import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';
import path from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

const IMAGEN_BLUR = path.resolve('test_estres_output/blur_medium.jpg');

if (!fs.existsSync(IMAGEN_BLUR)) {
    console.error(`❌ No existe la imagen blur: ${IMAGEN_BLUR}`);
    console.log('   Generando una con blur desde prueba.jpg...');
    import('sharp').then(async (sharp) => {
        await sharp.default('prueba.jpg').blur(5).toFile(IMAGEN_BLUR);
        console.log('✅ Imagen blur generada.');
        ejecutarPrueba();
    }).catch(() => {
        console.error('❌ No se pudo generar la imagen blur. Asegúrate de que prueba.jpg existe.');
        process.exit(1);
    });
} else {
    ejecutarPrueba();
}

async function ejecutarPrueba() {
    console.log('\n🧪 TEST DEL NUEVO ANALIZADOR (BARRIDO EXHAUSTIVO)');
    console.log(`   Imagen: ${IMAGEN_BLUR}`);
    console.log('   Opciones: modoBlur=true, tolerancia=3, verbose=true\n');

    const inicio = performance.now();
    const resultado = await analizarImagenMBH_20bits(
        IMAGEN_BLUR,
        null,
        120000,
        { modoBlur: true, toleranciaBlur: 3, verbose: true }
    );
    const tiempo = Math.round((performance.now() - inicio) / 1000);

    console.log(`\n⏱️ Tiempo total: ${tiempo}s`);
    console.log('📊 Resultado:');
    console.log(resultado);

    if (resultado.identificado) {
        console.log(`\n✅ DETECTADO: ${resultado.hash} (${resultado.cliente} - "${resultado.obra}")`);
        console.log(`   Método: ${resultado.metodo}`);
    } else {
        console.log('\n❌ No detectado.');
    }
}