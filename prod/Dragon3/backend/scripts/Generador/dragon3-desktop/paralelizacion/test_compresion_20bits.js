// paralelizacion/test_compresion_20bits.js
// 🧪 PRUEBA DE COMPRESIÓN JPEG (100 → 10) CON REUTILIZACIÓN DE IMAGEN DE REFERENCIA
//    - Usa SQLite para el registro y validación.
//    - La imagen de referencia se genera una sola vez y se reutiliza.
//    - Al final, consulta la DB para verificar el registro.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MotorEspacial } from '../src/backend/MotorEspacial.js';
import { DragonDB } from '../src/backend/database.js';

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
    BITS_TOTAL: 24,
    DNA_LENGTH: 48,
    EARLY_DETECTION_THRESHOLD: 5000,
    EARLY_DETECTION_BLOCKS: 100
};

// ================================================================
// 2. BASE DE DATOS (SQLite)
// ================================================================
let db;
try {
    db = new DragonDB();
    await db._ensureOpen();
    console.log('✅ Base de datos SQLite cargada correctamente');
} catch (e) {
    console.warn(`⚠️ No se pudo cargar DB: ${e.message}. Usando memoria.`);
    const BASE_DE_DATOS_20BITS = [];
    db = {
        async registrarSello(...args) { /* no-op */ },
        async buscarPorHash(hash) {
            return BASE_DE_DATOS_20BITS.find(s => s.hash_suffix === hash) || null;
        },
        async all(sql, params) { return []; },
        async get(sql, params) { return null; }
    };
}

// ================================================================
// 3. FUNCIONES DE DCT, EXTRACCIÓN E INYECCIÓN (idénticas al test original)
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

function calcularChecksumMentalista20(id20) {
    const L = id20 & 0x3FF;
    const H = (id20 >> 10) & 0x3FF;
    const X = L ^ H;
    const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
    return V & 0x0F;
}

// ================================================================
// 4. GENERADOR (se usa solo si no existe imagen de referencia)
// ================================================================
async function generarSello20bits(rutaEntrada, rutaSalida, metadatos) {
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

    // Registrar en SQLite (si falla por duplicado, ignorar)
    try {
        await db.registrarSello(
            idNumerico,
            idHex,
            metadatos.proyectoId || 1,
            metadatos.cliente || 'Prueba Compresión',
            metadatos.obra || 'Test 20 bits',
            metadatos.coleccion || null,
            metadatos.derechos || 'Todos los derechos reservados',
            metadatos.email_contacto || '',
            metadatos.compartir_blade || 0
        );
        console.log('📦 Registro en base de datos OK');
    } catch (err) {
        console.log(`ℹ️ No se registró (posible duplicado): ${err.message}`);
    }

    return { ok: true, id: idHex, ruta: rutaSalida };
}

// ================================================================
// 5. EXTRACCIÓN DE DIFERENCIA (para el analizador)
// ================================================================
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
// 6. VALIDACIÓN DE BITS (usa SQLite)
// ================================================================
async function validarBits24(bits) {
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
            const reg = await db.buscarPorHash(idHex);
            if (reg) {
                return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra };
            }
        }
    }
    return null;
}

// ================================================================
// 7. ANALIZADOR CON ACUMULACIÓN TEMPRANA
// ================================================================
async function analizarConAcumulacion(rutaImagen, verbose = true) {
    const startTime = performance.now();
    const bufferRadar = await sharp(rutaImagen).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const blockSize = 8;
    const totalBlocks = Math.floor(info.width / blockSize) * Math.floor(info.height / blockSize);

    if (verbose) {
        console.log(`\n📐 Dimensiones: ${info.width}x${info.height}`);
        console.log(`📊 Total de bloques: ${totalBlocks}`);
    }

    const urnas = new Float64Array(48);
    let bloquesProcesados = 0;
    let deteccionTemprana = false;
    let resultadoFinal = null;

    for (let y = 0; y <= info.height - blockSize; y += blockSize) {
        for (let x = 0; x <= info.width - blockSize; x += blockSize) {
            const diff = extraerDiffBloque(data, info, x, y);
            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % CONFIG.EARLY_DETECTION_BLOCKS === 0) {
                let energiaTotal = 0;
                for (let i = 0; i < 48; i++) {
                    energiaTotal += Math.abs(urnas[i]);
                }

                if (energiaTotal > CONFIG.EARLY_DETECTION_THRESHOLD) {
                    const bits = new Array(24);
                    for (let i = 0; i < 24; i++) {
                        const bitVal = urnas[i * 2];
                        const sombraVal = urnas[i * 2 + 1];
                        bits[i] = bitVal > sombraVal ? "1" : "0";
                    }
                    const bitsStr = bits.join('');
                    const valid = await validarBits24(bitsStr);
                    if (valid && valid.ok) {
                        deteccionTemprana = true;
                        resultadoFinal = valid;
                        if (verbose) {
                            console.log(`\n✅ DETECCIÓN TEMPRANA en ${bloquesProcesados} bloques (${((bloquesProcesados/totalBlocks)*100).toFixed(1)}%)`);
                            console.log(`   🔑 ID: ${valid.id}`);
                            console.log(`   ⚡ Energía: ${energiaTotal.toFixed(0)}`);
                            console.log(`   📊 Bits: ${bitsStr}`);
                        }
                        break;
                    }
                }
            }
        }
        if (deteccionTemprana) break;
    }

    const elapsed = performance.now() - startTime;

    if (!deteccionTemprana) {
        if (verbose) {
            console.log(`\n⏳ No se alcanzó el umbral. Ejecutando análisis completo (${totalBlocks} bloques)...`);
        }
        const bits = new Array(24);
        for (let i = 0; i < 24; i++) {
            const bitVal = urnas[i * 2];
            const sombraVal = urnas[i * 2 + 1];
            bits[i] = bitVal > sombraVal ? "1" : "0";
        }
        const bitsStr = bits.join('');
        const valid = await validarBits24(bitsStr);
        if (valid && valid.ok) {
            resultadoFinal = valid;
            if (verbose) {
                console.log(`✅ Análisis completo: ID ${valid.id} (${totalBlocks} bloques)`);
            }
        } else {
            if (verbose) {
                console.log(`❌ No se detectó ningún ID válido.`);
            }
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
            tiempo_ms: Math.round(elapsed)
        };
    }

    return { ok: false };
}

// ================================================================
// 8. PRUEBA DE COMPRESIÓN (usa imagen de referencia pregenerada)
// ================================================================
async function testCompresion20bits() {
    console.log('\n' + '='.repeat(70));
    console.log('💥 PRUEBA DE COMPRESIÓN JPEG (100 → 10)');
    console.log('   🔥 CON IMAGEN DE REFERENCIA PRECARGADA');
    console.log('='.repeat(70) + '\n');

    const TEST_IMAGES_DIR = path.join(__dirname, '..', 'test_imagenes');
    if (!fs.existsSync(TEST_IMAGES_DIR)) fs.mkdirSync(TEST_IMAGES_DIR, { recursive: true });

    const OUTPUT_DIR = path.join(__dirname, '..', 'test_compresiones');
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Buscar imagen de referencia
    const archivos = fs.readdirSync(TEST_IMAGES_DIR).filter(f => f.startsWith('referencia_') && f.endsWith('.png'));
    let imagenReferencia = null;
    if (archivos.length > 0) {
        const stats = archivos.map(f => ({ name: f, mtime: fs.statSync(path.join(TEST_IMAGES_DIR, f)).mtime }));
        stats.sort((a, b) => b.mtime - a.mtime);
        imagenReferencia = path.join(TEST_IMAGES_DIR, stats[0].name);
        console.log(`📁 Usando imagen de referencia: ${stats[0].name}`);
    }

    // Si no existe, generarla
    if (!imagenReferencia) {
        console.log('🔧 No se encontró imagen de referencia. Generando una...');
        const IMAGEN_ORIGINAL = path.join(__dirname, '..', 'prueba.jpg');
        if (!fs.existsSync(IMAGEN_ORIGINAL)) {
            console.log(`❌ No existe prueba.jpg para generar referencia.`);
            return;
        }
        const idNumerico = (Date.now() & 0xFFFFF);
        const idHex = idNumerico.toString(16).toUpperCase().padStart(5, '0');
        const rutaSalida = path.join(TEST_IMAGES_DIR, `referencia_${idHex}.png`);
        await generarSello20bits(IMAGEN_ORIGINAL, rutaSalida, {
            cliente: 'Prueba Compresión',
            obra: 'Test 20 bits',
            id_numerico: idNumerico,
            proyectoId: 1
        });
        imagenReferencia = rutaSalida;
        console.log(`✅ Imagen generada: ${path.basename(imagenReferencia)}`);
    }

    console.log(`🖼️ Imagen de prueba: ${path.basename(imagenReferencia)}`);

    // Verificar que se detecta correctamente
    console.log('\n🔍 Verificando sello en imagen de referencia...');
    const resultadoVerif = await analizarConAcumulacion(imagenReferencia, true);
    if (!resultadoVerif.ok) {
        console.log('❌ La imagen de referencia NO contiene un sello válido. Abortando.');
        return;
    }
    console.log(`✅ Sello verificado: ${resultadoVerif.id} (${resultadoVerif.metodo})`);

    // PRUEBAS DE COMPRESIÓN
    console.log('\n' + '='.repeat(70));
    console.log('📊 PRUEBA DE COMPRESIÓN JPEG (100 → 10)');
    console.log('='.repeat(70) + '\n');

    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const resultados = [];

    console.log('| Calidad | Tamaño (KB) | Detección | Hash | Método | Bloques | Tiempo(ms) |');
    console.log('|---------|-------------|-----------|------|--------|---------|------------|');

    for (const calidad of calidades) {
        const nombreSalida = `compresion_q${calidad}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);

        try {
            await sharp(imagenReferencia)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);

            const resultado = await analizarConAcumulacion(rutaSalida, false);
            const ok = resultado.ok ? '✅' : '❌';
            const hash = resultado.ok ? resultado.id : '-';
            const metodo = resultado.ok ? resultado.metodo : '-';
            const bloques = resultado.ok ? resultado.bloques : '-';
            const tiempo = resultado.ok ? resultado.tiempo_ms : '-';

            console.log(`| ${String(calidad).padEnd(7)} | ${String(tamañoKB).padEnd(11)} | ${ok.padEnd(9)} | ${hash.padEnd(4)} | ${metodo.padEnd(6)} | ${String(bloques).padEnd(7)} | ${String(tiempo).padEnd(10)} |`);

            resultados.push({
                calidad,
                tamañoKB: parseFloat(tamañoKB),
                detectado: resultado.ok,
                hash: resultado.id || null,
                metodo: resultado.metodo || null,
                bloques: resultado.bloques || 0,
                tiempo: resultado.tiempo_ms || 0
            });

        } catch (err) {
            console.log(`| ${calidad} | ERROR | ❌ | - | - | - | - |`);
        }
    }

    const detectados = resultados.filter(r => r.detectado).length;
    const total = resultados.length;
    console.log('\n📌 RESUMEN DE COMPRESIÓN:');
    console.log(`   ✅ Detectado en ${detectados}/${total} calidades (${(detectados/total*100).toFixed(0)}%)`);

    const ultima = resultados.filter(r => r.detectado).pop();
    if (ultima) {
        console.log(`   🔥 Última calidad detectada: ${ultima.calidad} (${ultima.tamañoKB} KB)`);
        console.log(`   ⏱️ Tiempo medio de detección: ${Math.round(resultados.filter(r=>r.detectado).reduce((a,b)=>a+b.tiempo,0)/detectados)}ms`);
        console.log(`   📊 Bloques medios: ${Math.round(resultados.filter(r=>r.detectado).reduce((a,b)=>a+b.bloques,0)/detectados)}`);
    }

    const fallos = resultados.filter(r => !r.detectado);
    if (fallos.length > 0) {
        console.log(`   ❌ Fallos en calidades: ${fallos.map(r => r.calidad).join(', ')}`);
    }

    // ================================================================
    //  VERIFICACIÓN EN BASE DE DATOS
    // ================================================================
    console.log('\n📋 VERIFICANDO REGISTRO EN BASE DE DATOS...');
    try {
        // Obtener los últimos 5 sellos
        const sellos = await db.all('SELECT * FROM sellos ORDER BY id DESC LIMIT 5');
        if (sellos.length > 0) {
            console.log('✅ Últimos sellos registrados:');
            sellos.forEach(s => {
                console.log(`  ID: ${s.id_numerico} | Hash: ${s.hash_suffix} | Cliente: ${s.cliente} | Obra: ${s.obra} | Proyecto: ${s.proyecto_id} | Fecha: ${s.fecha_creacion}`);
            });
            // También verificar el proyecto asociado
            if (sellos.length > 0) {
                const proyecto = await db.get('SELECT * FROM proyectos WHERE id = ?', sellos[0].proyecto_id);
                if (proyecto) {
                    console.log(`📁 Proyecto asociado: ${proyecto.proyecto_nombre || 'Sin nombre'} (ID: ${proyecto.id})`);
                }
            }
        } else {
            console.log('⚠️ No hay sellos en la tabla.');
        }
    } catch (err) {
        console.log(`⚠️ Error consultando DB: ${err.message}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ PRUEBA COMPLETADA');
    console.log('='.repeat(70));
}

// ================================================================
// 9. EJECUTAR
// ================================================================
testCompresion20bits().catch(console.error);