// paralelizacion/generador_test.js
// 🔧 GENERA SELLO Y COMPRESIONES, LUEGO LLAMA AL ANÁLISIS

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from '../src/backend/MotorEspacial.js';
import { DragonDB } from '../src/backend/database.js';
import { LicenseManager } from '../src/backend/license.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// CONFIGURACIÓN (exportada para el test)
// ================================================================
export const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_INTENSITY: 77,
    STARDUST_BLOCK_SIZE: 8,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    BITS_ID: 20,
    BITS_CHK: 4,
    BITS_TOTAL: 24,
    DNA_LENGTH: 48,
    EARLY_DETECTION_THRESHOLD: 5000,
    EARLY_DETECTION_BLOCKS: 100
};

export const BASE_DE_DATOS_20BITS = [];

const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// ================================================================
// GENERADOR 20 BITS
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

async function generarSello20bits(rutaEntrada, rutaSalida, metadatos, db) {
    const idNumerico = metadatos.id_numerico || 1;
    const idHex = idNumerico.toString(16).toUpperCase().padStart(5, '0');
    const chk = calcularChecksumMentalista20(idNumerico);
    const payload24 = (idNumerico << 4) | chk;

    console.log(`🔑 ID: ${idNumerico} (0x${idHex}), CHK: ${chk}, PAYLOAD: 0x${payload24.toString(16).padStart(6,'0')}`);

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

    // Guardar en memoria para el test
    BASE_DE_DATOS_20BITS.push({
        hash_suffix: idHex,
        cliente: metadatos.cliente || 'Prueba Completa',
        obra: metadatos.obra || 'Test 20 bits'
    });

    if (db) {
        try {
            const proyectoId = 1;
            let proyecto = await db.buscarPorId(proyectoId);
            if (!proyecto) {
                await db.crearProyecto(
                    idNumerico,
                    metadatos.cliente || 'Prueba Completa',
                    metadatos.obra || 'Test 20 bits',
                    'Proyecto_Test_20bits',
                    null,
                    'Todos los derechos reservados',
                    '',
                    0,
                    false,
                    'Proyecto automático para test'
                );
                proyecto = await db.buscarPorId(proyectoId);
            }
            await db.registrarSello(
                idNumerico,
                idHex,
                proyectoId,
                metadatos.cliente || 'Prueba Completa',
                metadatos.obra || 'Test 20 bits',
                null,
                'Todos los derechos reservados',
                '',
                0
            );
            console.log(`📦 Sello guardado en SQLite: ${idHex}`);
        } catch (err) {
            console.log(`Error guardando en SQLite: ${err.message}`);
        }
    }

    console.log('📦 DB en memoria:', BASE_DE_DATOS_20BITS);

    return { ok: true, id: idHex, ruta: rutaSalida };
}

// ================================================================
// GENERAR COMPRESIONES
// ================================================================
async function generarCompresiones() {
    console.log('\n' + '='.repeat(80));
    console.log('🔧 GENERANDO SELLO Y COMPRESIONES');
    console.log('='.repeat(80) + '\n');

    const IMAGEN_ORIGINAL = path.join(__dirname, '../prueba.jpg');
    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ No existe: ${IMAGEN_ORIGINAL}`);
        return;
    }

    const OUTPUT_DIR = path.join(__dirname, 'test_20bits_completo');
    const CALIDADES_DIR = path.join(OUTPUT_DIR, 'calidades');
    if (!fs.existsSync(CALIDADES_DIR)) {
        fs.mkdirSync(CALIDADES_DIR, { recursive: true });
    }

    const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'prueba_20bits.png');

    const dbReal = new DragonDB();
    await dbReal._ensureOpen();

    // Generar sello si no existe
    if (!fs.existsSync(IMAGEN_SELLADA)) {
        console.log('🔧 Generando sello 20 bits...');
        const resultadoGen = await generarSello20bits(IMAGEN_ORIGINAL, IMAGEN_SELLADA, {
            cliente: 'Prueba Completa',
            obra: 'Test 20 bits',
            id_numerico: 0x12345
        }, dbReal);

        if (!resultadoGen.ok) {
            console.log('❌ Error al generar');
            return;
        }
        console.log(`✅ Sello generado: ${resultadoGen.id}`);
    } else {
        console.log(`✅ Sello ya existe: ${path.basename(IMAGEN_SELLADA)}`);
    }

    // Generar compresiones
    console.log('\n📸 Generando compresiones JPEG...');
    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const calidadesExistentes = fs.readdirSync(CALIDADES_DIR);

    for (const calidad of calidades) {
        const nombre = `prueba_q${calidad}.jpg`;
        const rutaSalida = path.join(CALIDADES_DIR, nombre);

        if (calidadesExistentes.includes(nombre)) {
            console.log(`   ⏭️ Calidad ${calidad}: ya existe`);
            continue;
        }

        await sharp(IMAGEN_SELLADA)
            .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
            .toFile(rutaSalida);

        const stats = fs.statSync(rutaSalida);
        console.log(`   ✅ Calidad ${calidad}: ${(stats.size / 1024).toFixed(1)} KB`);
    }

    console.log('\n✅ Compresiones listas en:');
    console.log(`   📁 ${CALIDADES_DIR}`);

    await dbReal.cerrar();
}

// ================================================================
// IMPORTAR Y LLAMAR AL TEST DESPUÉS DE GENERAR
// ================================================================
async function main() {
    await generarCompresiones();

    console.log('\n' + '='.repeat(80));
    console.log('🔬 ANALIZANDO COMPRESIONES');
    console.log('='.repeat(80));

    // Importar dinámicamente el test y ejecutarlo
    const { testCompresion20bits } = await import('./test_compresion_20bits.js');
    await testCompresion20bits();
}

main().catch(console.error);