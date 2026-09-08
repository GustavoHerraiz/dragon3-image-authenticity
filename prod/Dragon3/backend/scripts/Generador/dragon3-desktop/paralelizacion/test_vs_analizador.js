// paralelizacion/test_vs_analizador.js
// 🔬 COMPARATIVA: TEST vs ANALIZADOR REAL (misma extracción)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from '../src/backend/MotorEspacial.js';
import { DragonDB } from '../src/backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. IMPORTAR LA EXTRACCIÓN DEL ANALIZADOR REAL
// ================================================================
// Extraemos las funciones del analizador real
const analizadorPath = path.join(__dirname, '../src/backend/analizador_v5_20bits.js');
const analizadorContent = fs.readFileSync(analizadorPath, 'utf8');

// Buscamos la función extraerDiffBloque y la copiamos
// Como no podemos importar fácilmente, la redefinimos aquí (copiada del analizador real)
const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
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

function extraerDiffBloque(data, info, x, y) {
    const block = new Array(8).fill(0).map(() => new Array(8).fill(0));
    for (let a = 0; a < 8; a++) {
        for (let b = 0; b < 8; b++) {
            const idx = ((y + a) * info.width + (x + b)) * 4 + 2;
            block[a][b] = data[idx] - 128;
        }
    }
    const dct = dct8x8(block);
    return dct[1][1] - dct[2][2];
}

// ================================================================
// 2. CONFIGURACIÓN DEL TEST (CON DB REAL)
// ================================================================
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    BITS_ID: 20,
    BITS_CHK: 4,
    BITS_TOTAL: 24,
    EARLY_DETECTION_THRESHOLD: 5000,
    EARLY_DETECTION_BLOCKS: 100
};

// DB en memoria para referencia
const BASE_DE_DATOS_20BITS = [];

// ================================================================
// 3. FUNCIÓN DE ANÁLISIS IDÉNTICA AL TEST PERO CON DB REAL
// ================================================================
async function validarBits24(bits, db) {
    const opciones = [bits, bits.split('').map(b => b === '1' ? '0' : '1').join('')];
    for (const b of opciones) {
        for (let i = 0; i < 24; i++) {
            let rot = b.substring(i) + b.substring(0, i);
            const idInt = (parseInt(rot.substring(0, 20), 2)) >>> 0;
            const chk = parseInt(rot.substring(20), 2);
            const low = idInt & 0x3FF;
            const high = (idInt >> 10) & 0x3FF;
            const X = low ^ high;
            const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
            const calc = V & 0x0F;
            if (chk === calc) {
                const idHex = idInt.toString(16).toUpperCase().padStart(5, '0');
                if (db) {
                    const reg = await db.buscarPorHash(idHex);
                    if (reg) {
                        return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra };
                    }
                } else {
                    const reg = BASE_DE_DATOS_20BITS.find(s => s.hash_suffix === idHex);
                    if (reg) {
                        return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra };
                    }
                }
            }
        }
    }
    return null;
}

async function analizarConAcumulacion(rutaImagen, db = null, verbose = true) {
    const startTime = performance.now();
    const { data, info } = await sharp(rutaImagen)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const blockSize = 8;
    const totalBlocks = Math.floor(info.width / blockSize) * Math.floor(info.height / blockSize);
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let deteccionTemprana = false;
    let resultadoFinal = null;

    if (verbose) {
        console.log(`📐 Dimensiones: ${info.width}x${info.height}`);
        console.log(`📊 Total bloques: ${totalBlocks}`);
        console.log(`🔍 DB: ${db ? 'SQLite' : 'Memoria'}`);
    }

    for (let y = 0; y <= info.height - blockSize; y += blockSize) {
        for (let x = 0; x <= info.width - blockSize; x += blockSize) {
            const diff = extraerDiffBloque(data, info, x, y);
            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % CONFIG.EARLY_DETECTION_BLOCKS === 0) {
                let energiaTotal = 0;
                for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);

                if (verbose && bloquesProcesados <= 1000) {
                    console.log(`[${bloquesProcesados}] Energía: ${energiaTotal.toFixed(0)}`);
                }

                if (energiaTotal > CONFIG.EARLY_DETECTION_THRESHOLD) {
                    const bits = new Array(24);
                    for (let i = 0; i < 24; i++) {
                        const bitVal = urnas[i * 2];
                        const sombraVal = urnas[i * 2 + 1];
                        bits[i] = bitVal > sombraVal ? "1" : "0";
                    }
                    const bitsStr = bits.join('');
                    if (verbose) {
                        console.log(`⚡ Umbral superado en ${bloquesProcesados} bloques`);
                        console.log(`   Bits: ${bitsStr}`);
                    }
                    const valid = await validarBits24(bitsStr, db);
                    if (valid && valid.ok) {
                        deteccionTemprana = true;
                        resultadoFinal = valid;
                        if (verbose) {
                            console.log(`✅ DETECCIÓN TEMPRANA: ${valid.id}`);
                        }
                        break;
                    } else {
                        if (verbose) {
                            console.log(`❌ Validación falló (bits no válidos)`);
                        }
                    }
                }
            }
        }
        if (deteccionTemprana) break;
    }

    // FALLBACK: extraer bits finales (sin reiniciar urnas)
    if (!deteccionTemprana) {
        if (verbose) console.log(`⏳ Fallback: extrayendo bits finales...`);
        const bits = new Array(24);
        for (let i = 0; i < 24; i++) {
            const bitVal = urnas[i * 2];
            const sombraVal = urnas[i * 2 + 1];
            bits[i] = bitVal > sombraVal ? "1" : "0";
        }
        const bitsStr = bits.join('');
        if (verbose) console.log(`   Bits finales: ${bitsStr}`);
        const valid = await validarBits24(bitsStr, db);
        if (valid && valid.ok) {
            resultadoFinal = valid;
            if (verbose) console.log(`✅ FALLBACK: ${valid.id}`);
        } else {
            if (verbose) console.log(`❌ Fallback falló`);
            return { ok: false };
        }
    }

    if (resultadoFinal && resultadoFinal.ok) {
        return {
            ok: true,
            id: resultadoFinal.id,
            cliente: resultadoFinal.cliente,
            obra: resultadoFinal.obra,
            metodo: deteccionTemprana ? 'temprano' : 'completo',
            bloques: bloquesProcesados,
            tiempo_ms: Math.round(performance.now() - startTime)
        };
    }

    return { ok: false };
}

// ================================================================
// 4. GENERADOR PARA CREAR SELLO
// ================================================================
async function generarSello20bits(rutaEntrada, rutaSalida, metadatos, db) {
    // ... (código del generador del test, omitido por brevedad, pero igual que antes)
    // Asumimos que ya existe prueba_20bits.png
    console.log(`✅ Usando imagen existente: ${rutaSalida}`);
    return { ok: true, id: '12345', ruta: rutaSalida };
}

// ================================================================
// 5. PRUEBA COMPARATIVA
// ================================================================
async function testComparativa() {
    console.log('\n' + '='.repeat(80));
    console.log('🔬 COMPARATIVA: TEST vs ANALIZADOR REAL (misma extracción)');
    console.log('='.repeat(80) + '\n');

    const OUTPUT_DIR = path.join(__dirname, 'test_v5_real');
    const IMAGEN_SELLADA = path.join(OUTPUT_DIR, 'prueba_20bits.png');

    if (!fs.existsSync(IMAGEN_SELLADA)) {
        console.log(`❌ No existe: ${IMAGEN_SELLADA}`);
        return;
    }

    const dbReal = new DragonDB();
    await dbReal._ensureOpen();

    // Guardar en memoria para referencia
    BASE_DE_DATOS_20BITS.push({
        hash_suffix: '12345',
        cliente: 'Prueba Test',
        obra: 'Test 20 bits'
    });

    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const resultados = [];

    console.log('| Calidad | Memoria | SQLite | Hash | Tiempo(ms) |');
    console.log('|---------|---------|--------|------|------------|');

    for (const calidad of calidades) {
        const rutaSalida = path.join(OUTPUT_DIR, `prueba_q${calidad}.jpg`);

        try {
            await sharp(IMAGEN_SELLADA)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);

            // Con memoria
            const resMem = await analizarConAcumulacion(rutaSalida, null, false);
            const okMem = resMem.ok ? '✅' : '❌';

            // Con SQLite
            const resSQL = await analizarConAcumulacion(rutaSalida, dbReal, false);
            const okSQL = resSQL.ok ? '✅' : '❌';
            const hash = resSQL.ok ? resSQL.id : '-';
            const tiempo = resSQL.ok ? resSQL.tiempo_ms : '-';

            console.log(`| ${String(calidad).padEnd(7)} | ${okMem.padEnd(7)} | ${okSQL.padEnd(6)} | ${hash.padEnd(4)} | ${String(tiempo).padEnd(10)} |`);

            resultados.push({
                calidad,
                tamañoKB: parseFloat(tamañoKB),
                memoria: resMem.ok,
                sqlite: resSQL.ok,
                hash: resSQL.ok ? resSQL.id : null
            });

            // Si falla en SQLite, hacemos verbose para ver qué pasa
            if (resMem.ok && !resSQL.ok) {
                console.log(`\n🔍 Depurando calidad ${calidad} (SQLite falla)...`);
                await analizarConAcumulacion(rutaSalida, dbReal, true);
            }

        } catch (err) {
            console.log(`| ${calidad} | ERROR | ERROR | - | - |`);
        }
    }

    const memOk = resultados.filter(r => r.memoria).length;
    const sqlOk = resultados.filter(r => r.sqlite).length;
    console.log(`\n📌 Resumen: Memoria ${memOk}/10, SQLite ${sqlOk}/10`);
    if (memOk === sqlOk) {
        console.log('✅ AMBAS DETECTAN IGUAL');
    } else {
        console.log(`❌ DIFERENCIA: SQLite falla en ${memOk - sqlOk} calidades más`);
    }

    await dbReal.cerrar();
}

testComparativa().catch(console.error);