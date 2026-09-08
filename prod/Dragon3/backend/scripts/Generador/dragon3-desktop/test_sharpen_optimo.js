// test_sharpen_optimo.js
// 🎯 Verificar detección en sigma=5 con sharpen=5 y variaciones

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_sharpen_optimo');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    console.log('   Ejecuta primero judo_digital_test.js para generarla.');
    process.exit(1);
}

// ================================================================
// CONFIGURACIÓN DE PRUEBAS
// ================================================================
const pruebas = [
    { sigma: 5, sharpen: 5 },
    { sigma: 5, sharpen: 6 },
    { sigma: 5, sharpen: 7 },
    { sigma: 5, sharpen: 8 },
    { sigma: 7, sharpen: 7 },
    { sigma: 7, sharpen: 8 },
    { sigma: 7, sharpen: 10 }
];

console.log('\n🎯 VERIFICANDO SHARPEN ÓPTIMO PARA BLUR');
console.log(`   Imagen original: ${IMAGEN_ORIGINAL}`);
console.log(`   Combinaciones a probar: ${pruebas.length}\n`);

// ================================================================
// FUNCIÓN PARA GENERAR Y ANALIZAR
// ================================================================
async function probarCombinacion(sigma, sharpen) {
    const nombre = `blur_sigma_${sigma}_sharpen_${sharpen}.jpg`;
    const ruta = path.join(OUTPUT_DIR, nombre);

    // Generar imagen (blur + sharpen) si no existe
    if (!fs.existsSync(ruta)) {
        await sharp(IMAGEN_ORIGINAL)
            .blur(sigma)
            .sharpen(sharpen)
            .jpeg({ quality: 95 })
            .toFile(ruta);
    }

    // Analizar con modo blur (TwinBlock, offsets 0..7, tolerancia 3)
    const res = await analizarImagenMBH_20bits(ruta, null, 60000, {
        modoBlur: true,
        toleranciaBlur: 3,
        verbose: false
    });

    return {
        sigma,
        sharpen,
        detectado: res.identificado,
        hash: res.identificado ? res.hash : null,
        metodo: res.identificado ? res.metodo : null,
        energia: res.energia || 0
    };
}

// ================================================================
// EJECUTAR PRUEBAS
// ================================================================
const resultados = [];

for (const p of pruebas) {
    console.log(`🔍 Probando sigma=${p.sigma}, sharpen=${p.sharpen}...`);
    const res = await probarCombinacion(p.sigma, p.sharpen);
    resultados.push(res);
    console.log(`   ${res.detectado ? '✅' : '❌'} ${res.detectado ? `ID: ${res.hash} (${res.metodo})` : 'No detectado'}`);
}

// ================================================================
// RESUMEN FINAL
// ================================================================
console.log('\n📊 RESUMEN DE DETECCIÓN');
console.log('| Sigma | Sharpen | Detectado | ID |');
console.log('|-------|---------|-----------|----|');
for (const r of resultados) {
    console.log(`| ${String(r.sigma).padEnd(5)} | ${String(r.sharpen).padEnd(7)} | ${r.detectado ? '✅' : '❌'}     | ${r.detectado ? r.hash.padEnd(4) : '----'} |`);
}

const detectados = resultados.filter(r => r.detectado);
if (detectados.length > 0) {
    console.log(`\n✅ Combinaciones que funcionan:`);
    for (const r of detectados) {
        console.log(`   - sigma=${r.sigma}, sharpen=${r.sharpen} -> ID: ${r.hash}`);
    }
} else {
    console.log('\n❌ Ninguna combinación funcionó.');
}

console.log('\n✅ Prueba completada.');