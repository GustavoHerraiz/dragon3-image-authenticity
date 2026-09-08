// judo_energia.js
// 🥋 JUDO DIGITAL: Extrae energía real del sello para cada calidad (sin umbral)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('judo_test');
const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'referencia_sellada.png');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log('\n🥋 JUDO DIGITAL: Energía real del sello por calidad de compresión');
console.log('   (Extracción sin umbral, acumulando toda la imagen)\n');

// ================================================================
// FUNCIÓN DCT 8×8 (idéntica al analizador)
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

// ================================================================
// EXTRACCIÓN DE ENERGÍA (SIN UMBRAL, EN OFFSET 0,0)
// ================================================================
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
// GENERAR O REUTILIZAR IMAGEN SELLADA
// ================================================================
if (!fs.existsSync(IMAGEN_SELLADA)) {
    console.log('🔧 Generando imagen sellada con ID 12345...');
    const { GeneradorMBH_20bits } = await import('./src/backend/generadorMBH_20bits.js');
    const { DragonDB } = await import('./src/backend/database.js');
    const db = new DragonDB();
    await db._ensureOpen();
    const generador = new GeneradorMBH_20bits(db, null);
    await generador.sellarImagen('prueba.jpg', IMAGEN_SELLADA, {
        id_numerico: 0x12345,
        cliente: 'Judo Test',
        obra: 'Calibración',
        proyectoId: 1
    });
    console.log(`✅ Imagen sellada generada: ${IMAGEN_SELLADA}\n`);
} else {
    console.log(`♻️ Reutilizando imagen sellada: ${IMAGEN_SELLADA}\n`);
}

// ================================================================
// PROBAR CALIDADES Y EXTRAER ENERGÍA
// ================================================================
const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const resultados = [];

console.log('📸 Extrayendo energía en cada calidad...\n');

for (const calidad of calidades) {
    const rutaJPG = path.join(OUTPUT_DIR, `calidad_${calidad}.jpg`);
    if (!fs.existsSync(rutaJPG)) {
        await sharp(IMAGEN_SELLADA)
            .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
            .toFile(rutaJPG);
    }

    const energia = await extraerEnergia(rutaJPG);
    resultados.push({ calidad, energia });
    console.log(`   Calidad ${calidad}: Energía = ${energia.toFixed(0)}`);
}

// ================================================================
// RESUMEN FINAL
// ================================================================
console.log('\n📊 ENERGÍA DEL SELLO POR CALIDAD:');
console.log('| Calidad | Energía |');
console.log('|---------|---------|');
for (const r of resultados) {
    console.log(`| ${String(r.calidad).padEnd(7)} | ${String(r.energia.toFixed(0)).padEnd(7)} |`);
}

const mejor = resultados.reduce((a, b) => a.energia > b.energia ? a : b);
console.log(`\n🏆 Calidad óptima para JUDO DIGITAL: ${mejor.calidad} (Energía: ${mejor.energia.toFixed(0)})`);

console.log('\n✅ Prueba completada.');