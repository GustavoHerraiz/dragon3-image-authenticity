// test_blur_sharpen.js
// 🌫️🔍 PRUEBA DE BLUR + ENFOQUE (SHARPEN) PARA RECUPERAR FASE
//    - Para cada sigma (1,2,3,5,7,10):
//      - Genera imagen con blur.
//      - Extrae energía del sello.
//      - Aplica filtro de enfoque (sharpen) con diferentes intensidades.
//      - Extrae energía y analiza detección.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizarImagenMBH_20bits } from './src/backend/analizador_v5_20bits.js';

const IMAGEN_ORIGINAL = path.resolve('judo_test/referencia_sellada.png');
const OUTPUT_DIR = path.resolve('test_blur_sharpen');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN_ORIGINAL)) {
    console.error(`❌ No existe la imagen sellada: ${IMAGEN_ORIGINAL}`);
    console.log('   Ejecuta primero judo_digital_test.js para generarla.');
    process.exit(1);
}

console.log('\n🌫️🔍 PRUEBA DE BLUR + ENFOQUE (SHARPEN)');
console.log(`   Sigmas: 1, 2, 3, 5, 7, 10`);
console.log(`   Intensidades de sharpen: 1, 2, 3, 5\n`);

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
    const res1 = await analizarImagenMBH_20bits(ruta, null, 30000, { modoBlur: false, verbose: false });
    if (res1.identificado) return { motor1: `✅ ${res1.hash}`, motor2: '-', detectado: true, id: res1.hash };

    const res2 = await analizarImagenMBH_20bits(ruta, null, 30000, { modoBlur: true, toleranciaBlur: 3, verbose: false });
    return {
        motor1: '❌',
        motor2: res2.identificado ? `✅ ${res2.hash}` : '❌',
        detectado: res2.identificado,
        id: res2.identificado ? res2.hash : null
    };
}

// ================================================================
// PRUEBA POR CADA SIGMA Y SHARPEN
// ================================================================
const SIGMAS = [1, 2, 3, 5, 7, 10];
const SHARPENS = [1, 2, 3, 5];
const resultados = [];

for (const sigma of SIGMAS) {
    console.log(`\n🔍 Sigma ${sigma}:`);
    const nombreBlur = `blur_sigma_${sigma}.png`;
    const rutaBlur = path.join(OUTPUT_DIR, nombreBlur);

    if (!fs.existsSync(rutaBlur)) {
        await sharp(IMAGEN_ORIGINAL).blur(sigma).toFile(rutaBlur);
    }

    const energiaBlur = await extraerEnergia(rutaBlur);
    console.log(`   Energía blur: ${energiaBlur.toFixed(0)}`);

    // Probar diferentes intensidades de sharpen
    for (const sh of SHARPENS) {
        const nombreSh = `blur_sigma_${sigma}_sharpen_${sh}.jpg`;
        const rutaSh = path.join(OUTPUT_DIR, nombreSh);

        if (!fs.existsSync(rutaSh)) {
            await sharp(rutaBlur)
                .sharpen({ sigma: sh, flat: 0.5, jagged: 0.5 })
                .jpeg({ quality: 95, chromaSubsampling: '4:2:0' })
                .toFile(rutaSh);
        }

        const energiaSh = await extraerEnergia(rutaSh);
        const deteccion = await analizarDeteccion(rutaSh);
        const icono = deteccion.detectado ? '✅' : '❌';

        console.log(`   Sharpen ${sh}: Energía=${energiaSh.toFixed(0)} | Detección=${icono} ${deteccion.id || ''}`);
    }
}

console.log('\n✅ Prueba completada.');