// paralelizacion/test_compresion_20bits.js
// 🧪 PRUEBA DE COMPRESIÓN JPEG (100 → 10) CON ANALIZADOR 20 BITS

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from '../src/backend/MotorEspacial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. CONFIGURACIÓN
// ================================================================
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_INTENSITY: 77,
    STARDUST_BLOCK_SIZE: 8,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    BITS_ID: 20,
    BITS_CHK: 4,
    BITS_TOTAL: 24
};

const BASE_DE_DATOS_20BITS = [];
const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// ================================================================
// 2. GENERADOR 20 BITS
// ================================================================
function calcularChecksumMentalista20(id20) {
    const L = id20 & 0x3FF;
    const H = (id20 >> 10) & 0x3FF;
    const X = L ^ H;
    const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
    return V & 0x0F;
}

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

function idct8x8(dct) {
    const n = 8;
    let block = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            let sum = 0;
            for (let u = 0; u < n; u++) {
                for (let v = 0; v < n; v++) {
                    sum += C(u) * C(v) * dct[v][u] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            block[y][x] = 0.25 * sum;
        }
    }
    return block;
}

function extraerBloqueCanal(buffer, width, x, y, channel) {
    const block = [];
    for (let i = 0; i < 8; i++) {
        const row = [];
        for (let j = 0; j < 8; j++) {
            const idx = ((y + i) * width + (x + j)) * 4 + channel;
            row.push(buffer[idx] - 128);
        }
        block.push(row);
    }
    return block;
}

function escribirBloqueCanal(buffer, width, x, y, channel, block) {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const idx = ((y + i) * width + (x + j)) * 4 + channel;
            let val = block[i][j] + 128;
            if (val < 0) val = 0;
            if (val > 255) val = 255;
            buffer[idx] = Math.round(val);
        }
    }
}

function inyectarStardust24(buffer, width, height, payload24) {
    const secuenciaDNA = [];
    for (let i = 23; i >= 0; i--) {
        const bit = (payload24 >>> i) & 1;
        secuenciaDNA.push(bit);
        secuenciaDNA.push(bit ^ 1);
    }

    const dnaLength = 48;
    const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
    const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
    const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
    const fuerza = CONFIG.STARDUST_INTENSITY;

    let stepIndex = 0;
    for (let y = 0; y <= height - blockSize; y += blockSize) {
        for (let x = 0; x <= width - blockSize; x += blockSize) {
            let blueBlock = extraerBloqueCanal(buffer, width, x, y, 2);
            let dctBlock = dct8x8(blueBlock);
            const bitToInject = secuenciaDNA[stepIndex % dnaLength];
            stepIndex++;

            const valActual1 = dctBlock[v1][u1];
            const valActual2 = dctBlock[v2][u2];
            const promedio = (valActual1 + valActual2) / 2;
            let aplicarFuerza = fuerza;
            if (Math.abs(dctBlock) > 1000) aplicarFuerza = fuerza * 0.8;

            if (bitToInject === 1) {
                dctBlock[v1][u1] = promedio + (aplicarFuerza / 2);
                dctBlock[v2][u2] = promedio - (aplicarFuerza / 2);
            } else {
                dctBlock[v1][u1] = promedio - (aplicarFuerza / 2);
                dctBlock[v2][u2] = promedio + (aplicarFuerza / 2);
            }

            let newBlueBlock = idct8x8(dctBlock);
            escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
        }
    }
    return buffer;
}

function inyectarGeometria20(buffer, width, height, idHex) {
    const centro = MotorEspacial.calcularCentroUnico(width, height, idHex, CONFIG.PRIVATE_KEY);
    const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);
    puntos.forEach(p => {
        if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
            const idx = (p.y * width + p.x) * 4;
            buffer[idx + 3] = (buffer[idx + 3] | 1);
            buffer[idx + 2] = (buffer[idx + 2] | 1);
        }
    });
    return buffer;
}

async function generarSello20bits(rutaEntrada, rutaSalida, metadatos) {
    const idNumerico = metadatos.id_numerico || 1;
    const idHex = idNumerico.toString(16).toUpperCase().padStart(5, '0');
    const chk = calcularChecksumMentalista20(idNumerico);
    const payload24 = (idNumerico << 4) | chk;

    const extractor = sharp(rutaEntrada);
    const { data: bufferBase, info } = await extractor
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    let buffer = bufferBase;
    buffer = inyectarStardust24(buffer, info.width, info.height, payload24);

    for (let i = 3; i < buffer.length; i += 4) {
        buffer[i] = buffer[i] & 0xFE;
    }

    buffer = inyectarGeometria20(buffer, info.width, info.height, idHex);

    await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(rutaSalida);

    BASE_DE_DATOS_20BITS.push({
        hash_suffix: idHex,
        cliente: metadatos.cliente || 'Prueba 20 bits',
        obra: metadatos.obra || 'Test 20 bits'
    });

    return { ok: true, id: idHex, ruta: rutaSalida };
}

// ================================================================
// 3. ANALIZADOR 20 BITS (EL QUE DETECTA TODAS LAS CALIDADES)
// ================================================================
function extraerBits24(data, info, offX, offY) {
    const blockSize = 8;
    const acumuladores = new Array(48).fill(0);
    const totalBlocksX = Math.floor((info.width - offX) / blockSize);
    
    let globalIndex = 0;
    for (let y = offY; y <= info.height - blockSize; y += blockSize) {
        for (let x = offX; x <= info.width - blockSize; x += blockSize) {
            const block = new Array(blockSize).fill(0).map(() => new Array(blockSize).fill(0));
            for (let i = 0; i < blockSize; i++) {
                for (let j = 0; j < blockSize; j++) {
                    const idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                    block[i][j] = data[idx] - 128;
                }
            }
            const dct = dct8x8(block);
            const diff = dct[1][1] - dct[2][2];
            const pos = globalIndex % 48;
            acumuladores[pos] += diff;
            globalIndex++;
        }
    }
    
    const bits = new Array(24);
    for (let i = 0; i < 24; i++) {
        const bitVal = acumuladores[i * 2];
        const sombraVal = acumuladores[i * 2 + 1];
        bits[i] = bitVal > sombraVal ? "1" : "0";
    }
    return bits.join('');
}

function validarBits24(bits) {
    for (let i = 0; i < 24; i++) {
        let rot = bits.substring(i) + bits.substring(0, i);
        const idInt = (parseInt(rot.substring(0, 20), 2)) >>> 0;
        const chk = parseInt(rot.substring(20), 2);
        const low = idInt & 0x3FF;
        const high = (idInt >> 10) & 0x3FF;
        const X = low ^ high;
        const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
        const calc = V & 0x0F;
        if (chk === calc) {
            const idHex = idInt.toString(16).toUpperCase().padStart(5, '0');
            const reg = BASE_DE_DATOS_20BITS.find(s => s.hash_suffix === idHex);
            if (reg) {
                return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra };
            }
        }
    }
    return { ok: false };
}

async function analizarSello20bits(rutaImagen) {
    const bufferRadar = await sharp(rutaImagen).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const bits = extraerBits24(data, info, 0, 0);
    return validarBits24(bits);
}

// ================================================================
// 4. PRUEBA DE COMPRESIÓN JPEG
// ================================================================
async function testCompresion20bits() {
    console.log('\n' + '='.repeat(70));
    console.log('💥 PRUEBA DE COMPRESIÓN JPEG (100 → 10)');
    console.log('='.repeat(70) + '\n');

    const IMAGEN_ORIGINAL = path.join(__dirname, '../prueba.jpg');
    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ No existe: ${IMAGEN_ORIGINAL}`);
        return;
    }

    const OUTPUT_DIR = path.join(__dirname, 'test_20bits_compresion');
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'prueba_20bits.png');

    console.log('🔧 Generando sello 20 bits...');
    const resultadoGen = await generarSello20bits(IMAGEN_ORIGINAL, IMAGEN_SELLADA, {
        cliente: 'Prueba Compresión',
        obra: 'Test 20 bits',
        id_numerico: 0x12345
    });

    if (!resultadoGen.ok) {
        console.log('❌ Error al generar');
        return;
    }
    console.log(`✅ Sello generado: ${resultadoGen.id}`);

    console.log('\n🔍 Verificando sello generado...');
    const resultadoVerif = await analizarSello20bits(IMAGEN_SELLADA);
    if (resultadoVerif.ok) {
        console.log(`✅ Sello verificado: ${resultadoVerif.id}`);
    } else {
        console.log('❌ Sello NO verificado');
        return;
    }

    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const resultados = [];

    console.log('\n| Calidad | Tamaño (KB) | Detección | Hash |');
    console.log('|---------|-------------|-----------|------|');

    for (const calidad of calidades) {
        const nombreSalida = `prueba_20bits_q${calidad}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);

        try {
            await sharp(IMAGEN_SELLADA)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);

            const resultado = await analizarSello20bits(rutaSalida);
            const ok = resultado.ok ? '✅' : '❌';
            const hash = resultado.ok ? resultado.id : '-';

            console.log(`| ${String(calidad).padEnd(7)} | ${String(tamañoKB).padEnd(11)} | ${ok.padEnd(9)} | ${hash.padEnd(4)} |`);

            resultados.push({
                calidad,
                tamañoKB: parseFloat(tamañoKB),
                detectado: resultado.ok,
                hash: resultado.id || null
            });

        } catch (err) {
            console.log(`| ${calidad} | ERROR | ❌ | - |`);
            resultados.push({ calidad, tamañoKB: 0, detectado: false, error: err.message });
        }
    }

    const detectados = resultados.filter(r => r.detectado).length;
    const total = resultados.length;

    console.log('\n📌 RESUMEN DE COMPRESIÓN:');
    console.log(`   ✅ Detectado en ${detectados}/${total} calidades (${(detectados/total*100).toFixed(0)}%)`);

    const ultima = resultados.filter(r => r.detectado).pop();
    if (ultima) {
        console.log(`   🔥 Última calidad detectada: ${ultima.calidad} (${ultima.tamañoKB} KB)`);
    }

    const fallos = resultados.filter(r => !r.detectado);
    if (fallos.length > 0) {
        console.log(`   ❌ Fallos en calidades: ${fallos.map(r => r.calidad).join(', ')}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ PRUEBA COMPLETADA');
    console.log('='.repeat(70));
}

// ================================================================
// 5. EJECUTAR
// ================================================================
testCompresion20bits().catch(console.error);