// test_blur_judo.js
// 🌫️🌊 PRUEBA DE BLUR + JUDO DIGITAL
//    - Para cada sigma (1,2,3,5,7,10):
//      - Genera imagen con blur.
//      - Extrae energía del sello.
//      - Aplica compresión JPEG calidad 50.
//      - Extrae energía del sello en la imagen comprimida.
//      - Analiza con Motor 1 y modo blur.
//    - Muestra tabla comparativa de energías y detección.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_blur_judo');
const JUDO_QUALITY = 50;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    console.log('   Ejecuta primero judo_digital_test.js para generarla.');
    process.exit(1);
}

console.log('\n🌫️🌊 PRUEBA DE BLUR + JUDO DIGITAL');
console.log(`   JUDO QUALITY: ${JUDO_QUALITY}`);
console.log(`   Sigmas: 1, 2, 3, 5, 7, 10\n`);

// ================================================================
// FUNCIÓN DCT 8×8 Y EXTRACCIÓN DE ENERGÍA (SIN UMBRAL)
// ================================================================
function dct8x8(block) {
    const n = 8;
    let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let x = 0; x < n; x++) {
                for (let y = 0; y < n; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

function extraerDiffBloque(data, info, x, y, offsetX = 0, offsetY = 0) {
    const block = new Array(8).fill(0).map(() => new Array(8).fill(0));
    const startX = x + offsetX;
    const startY = y + offsetY;
    for (let a = 0; a < 8; a++) {
        for (let b = 0; b < 8; b++) {
            const idx = ((startY + a) * info.width + (startX + b)) * 4 + 2;
            block[a][b] = data[idx] - 128;
        }
    }
    const dct = dct8x8(block);
    return dct[1][1] - dct[2][2];
}

async function extraerEnergia(rutaImagen) {
    const bufferRadar = await sharp(rutaImagen).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;

    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 8) {
            const diff = extraerDiffBloque(data, info, x, y, 0, 0);
            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;
        }
    }

    let energiaTotal = 0;
    for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);
    return energiaTotal;
}

// ================================================================
// FUNCIÓN PARA ANALIZAR DETECCIÓN (MOTOR 1 Y MODO BLUR)
// ================================================================
async function analizarDeteccion(ruta) {
    // Motor 1 (umbral)
    const res1 = await analizarImagenMBH_20bits(ruta, null, 30000, { modoBlur: false, verbose: false });
    let motor1 = res1.identificado ? `✅ ${res1.hash}` : '❌';
    if (res1.identificado) return { motor1, motor2: '-', detectado: true, id: res1.hash };

    // Modo blur (TwinBlock)
    const res2 = await analizarImagenMBH_20bits(ruta, null, 30000, { modoBlur: true, toleranciaBlur: 3, verbose: false });
    let motor2 = res2.identificado ? `✅ ${res2.hash}` : '❌';
    return {
        motor1,
        motor2,
        detectado: res2.identificado,
        id: res2.identificado ? res2.hash : null
    };
}

// ================================================================
// PRUEBA POR CADA SIGMA
// ================================================================
const SIGMAS = [1, 2, 3, 5, 7, 10];
const resultados = [];

for (const sigma of SIGMAS) {
    console.log(`🔍 Sigma ${sigma}:`);

    const nombreBlur = `blur_sigma_${sigma}.png`;
    const nombreJudo = `blur_sigma_${sigma}_judo_${JUDO_QUALITY}.jpg`;
    const rutaBlur = path.join(OUTPUT_DIR, nombreBlur);
    const rutaJudo = path.join(OUTPUT_DIR, nombreJudo);

    // 1. Generar blur
    if (!fs.existsSync(rutaBlur)) {
        await sharp(IMAGEN_ORIGINAL).blur(sigma).toFile(rutaBlur);
    }

    // 2. Energía del blur
    const energiaBlur = await extraerEnergia(rutaBlur);
    console.log(`   Energía blur: ${energiaBlur.toFixed(0)}`);

    // 3. Generar JUDO (JPG calidad 50)
    if (!fs.existsSync(rutaJudo)) {
        await sharp(rutaBlur)
            .jpeg({ quality: JUDO_QUALITY, chromaSubsampling: '4:2:0' })
            .toFile(rutaJudo);
    }

    // 4. Energía del JUDO
    const energiaJudo = await extraerEnergia(rutaJudo);
    console.log(`   Energía JUDO: ${energiaJudo.toFixed(0)}`);

    // 5. Analizar detección en JUDO
    const deteccion = await analizarDeteccion(rutaJudo);
    console.log(`   Detección: ${deteccion.motor1} / ${deteccion.motor2}`);

    resultados.push({
        sigma,
        energiaBlur,
        energiaJudo,
        deteccion
    });

    console.log('');
}

// ================================================================
// RESUMEN FINAL
// ================================================================
console.log('\n📊 RESUMEN COMPARATIVO BLUR + JUDO DIGITAL');
console.log('| Sigma | Energía Blur | Energía Judo | Δ Energía | Detección |');
console.log('|-------|--------------|--------------|-----------|-----------|');

for (const r of resultados) {
    const delta = r.energiaJudo - r.energiaBlur;
    const det = r.deteccion.detectado ? `✅ ${r.deteccion.id}` : '❌';
    console.log(`| ${String(r.sigma).padEnd(5)} | ${String(r.energiaBlur.toFixed(0)).padEnd(12)} | ${String(r.energiaJudo.toFixed(0)).padEnd(12)} | ${String(delta.toFixed(0)).padEnd(9)} | ${det.padEnd(9)} |`);
}

// Límite de detección
const detectados = resultados.filter(r => r.deteccion.detectado);
if (detectados.length > 0) {
    const maxSigma = detectados.reduce((a, b) => a.sigma > b.sigma ? a : b);
    console.log(`\n🏆 Límite de detección con JUDO: sigma=${maxSigma.sigma} (${maxSigma.deteccion.id})`);
} else {
    console.log('\n❌ No se detectó en ningún sigma con JUDO.');
}

console.log('\n✅ Prueba completada.');