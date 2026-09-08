// paralelizacion/test_barrido_completo.js
// 🧪 BARRIDO COMPLETO DE TODA LA IMAGEN (CON TELEMETRÍA AVANZADA)
//    - Guarda evolución de energía por offset, ADN en cada punto, relación bit/sombra.
//    - Al final, genera informe detallado con estadísticas y recomendaciones.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { DragonDB } from '../src/backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// CONFIGURACIÓN
// ================================================================
const CONFIG = {
    IMAGEN: path.join(__dirname, '..', 'test_estres_output', 'blur_medium.jpg'),
    OFFSETS: [0, 1, 2, 3, 4, 5, 6, 7],
    MODOS: [
        { blockSize: 8, twin: false, label: '8x8' },
        { blockSize: 8, twin: true,  label: '8x8 Twin' },
        { blockSize: 4, twin: false, label: '4x4' },
        { blockSize: 4, twin: true,  label: '4x4 Twin' }
    ],
    TIMEOUT_POR_OFFSET: 120000,  // 2 minutos
    TOLERANCIA_HAMMING: 3,
    EARLY_DETECTION_BLOCKS: 200,
    GUARDAR_EVOLUCION: true,     // Guardar evolución de energía y ADN por offset
    GUARDAR_URNAS: true          // Guardar distribución de urnas por offset
};

// ================================================================
// BASE DE DATOS
// ================================================================
let db;
try {
    db = new DragonDB();
    await db._ensureOpen();
    console.log('✅ SQLite cargada');
} catch (e) {
    console.warn(`⚠️ DB en memoria: ${e.message}`);
    const BASE = [];
    db = {
        async buscarPorHash(hash) {
            return BASE.find(s => s.hash_suffix === hash) || null;
        }
    };
}

// ================================================================
// DCT 8×8 Y EXTRACCIÓN DE DIFERENCIA
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

function extraerDiffBloque(data, info, x, y, blockSize = 8) {
    const block = new Array(blockSize).fill(0).map(() => new Array(blockSize).fill(0));
    for (let a = 0; a < blockSize; a++) {
        for (let b = 0; b < blockSize; b++) {
            const idx = ((y + a) * info.width + (x + b)) * 4 + 2;
            block[a][b] = data[idx] - 128;
        }
    }
    const dct = dct8x8(block);
    return dct[1][1] - dct[2][2];
}

// ================================================================
// VALIDACIÓN DE BITS CON TOLERANCIA
// ================================================================
async function validarBits24(bits, tolerancia = 0) {
    for (let i = 0; i < 24; i++) {
        let rot = bits.substring(i) + bits.substring(0, i);
        const idLeido = (parseInt(rot.substring(0, 20), 2)) >>> 0;
        const chkLeido = parseInt(rot.substring(20), 2);
        const low = idLeido & 0x3FF;
        const high = (idLeido >> 10) & 0x3FF;
        const X = low ^ high;
        const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
        const chkEsperado = V & 0x0F;
        if (chkLeido === chkEsperado) {
            const idHex = idLeido.toString(16).toUpperCase().padStart(5, '0');
            const reg = await db.buscarPorHash(idHex);
            if (reg) {
                return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra, distancia: 0 };
            }
        }
        if (tolerancia > 0) {
            const maxMask = 1 << 20;
            for (let mask = 0; mask < maxMask; mask++) {
                if (popCount(mask) > tolerancia) continue;
                const idMod = idLeido ^ mask;
                const low2 = idMod & 0x3FF;
                const high2 = (idMod >> 10) & 0x3FF;
                const X2 = low2 ^ high2;
                const V2 = ((X2 * 19) ^ ((X2 * 19) >> 6)) & 0xFFF;
                const chkCalc = V2 & 0x0F;
                if (chkCalc === chkLeido) {
                    const idHex = idMod.toString(16).toUpperCase().padStart(5, '0');
                    const reg = await db.buscarPorHash(idHex);
                    if (reg) {
                        return { ok: true, id: idHex, cliente: reg.cliente, obra: reg.obra, distancia: popCount(mask) };
                    }
                }
            }
        }
    }
    return null;
}

function popCount(x) {
    let c = 0;
    while (x) { c += x & 1; x >>= 1; }
    return c;
}

// ================================================================
// ANÁLISIS DE UN OFFSET (CON TELEMETRÍA AVANZADA)
// ================================================================
async function analizarOffsetCompleto(data, info, offsetX, offsetY, blockSize = 8, twinBlock = false, tolerancia = 0, timeoutMs = CONFIG.TIMEOUT_POR_OFFSET) {
    const startTime = performance.now();
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let energiaTotal = 0;
    let adn = "";
    let resultadoFinal = null;
    let distanciaHamming = -1;
    let isTimeout = false;

    // Telemetría de evolución
    let evolucion = [];

    const step = blockSize;
    const stepX = twinBlock ? step * 2 : step;

    for (let y = 0; y <= info.height - step; y += step) {
        for (let x = 0; x <= info.width - step; x += stepX) {
            if (performance.now() - startTime > timeoutMs) {
                isTimeout = true;
                break;
            }

            const readX = x + offsetX;
            const readY = y + offsetY;
            if (readX + step > info.width || readY + step > info.height) continue;

            let diff;
            if (twinBlock) {
                const diffA = extraerDiffBloque(data, info, readX, readY, blockSize);
                const diffB = extraerDiffBloque(data, info, readX + step, readY, blockSize);
                diff = diffA - diffB;
            } else {
                diff = extraerDiffBloque(data, info, readX, readY, blockSize);
            }

            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % CONFIG.EARLY_DETECTION_BLOCKS === 0) {
                // Reconstruir bits
                const bits = new Array(24);
                for (let i = 0; i < 24; i++) {
                    const bitVal = urnas[i * 2];
                    const sombraVal = urnas[i * 2 + 1];
                    bits[i] = bitVal > sombraVal ? "1" : "0";
                }
                adn = bits.join('');

                // Calcular energía total y relación bit/sombra
                energiaTotal = 0;
                let energiaBits = 0, energiaSombras = 0;
                for (let i = 0; i < 48; i++) {
                    const val = Math.abs(urnas[i]);
                    energiaTotal += val;
                    if (i % 2 === 0) energiaBits += val;
                    else energiaSombras += val;
                }
                const relacionBitSombra = energiaSombras > 0 ? energiaBits / energiaSombras : 0;

                // Guardar evolución
                if (CONFIG.GUARDAR_EVOLUCION) {
                    evolucion.push({
                        bloques: bloquesProcesados,
                        energiaTotal: energiaTotal,
                        adn: adn,
                        relacionBitSombra: relacionBitSombra
                    });
                }

                // Validar checksum
                const valid = await validarBits24(adn, tolerancia);
                if (valid && valid.ok) {
                    resultadoFinal = valid;
                    distanciaHamming = valid.distancia;
                    // No salimos, seguimos para recolectar más datos
                }
            }
        }
        if (isTimeout) break;
    }

    // Calcular energía final y distribución de urnas
    energiaTotal = 0;
    for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);

    let urnasDistribucion = null;
    if (CONFIG.GUARDAR_URNAS) {
        urnasDistribucion = Array.from(urnas).map((v, i) => ({ urna: i, valor: v }));
    }

    return {
        ok: !!resultadoFinal,
        id: resultadoFinal?.id || null,
        cliente: resultadoFinal?.cliente || null,
        obra: resultadoFinal?.obra || null,
        energia: energiaTotal,
        adn: adn,
        checksumValido: !!resultadoFinal,
        distanciaHamming: distanciaHamming,
        bloques: bloquesProcesados,
        timeout: isTimeout,
        offsetX,
        offsetY,
        blockSize,
        twinBlock,
        evolucion: evolucion,
        urnasDistribucion: urnasDistribucion
    };
}

// ================================================================
// FUNCIÓN PRINCIPAL
// ================================================================
async function testBarridoCompleto() {
    console.log('\n🧪 BARRIDO COMPLETO CON TELEMETRÍA AVANZADA');
    console.log(`   Tolerancia Hamming: ${CONFIG.TOLERANCIA_HAMMING} bits`);
    console.log(`   Timeout por offset: ${CONFIG.TIMEOUT_POR_OFFSET/1000}s`);
    console.log('   Modos: 8x8, 8x8 Twin, 4x4, 4x4 Twin\n');

    const ruta = CONFIG.IMAGEN;
    if (!fs.existsSync(ruta)) {
        console.error(`❌ No existe la imagen: ${ruta}`);
        process.exit(1);
    }

    const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log(`📐 Dimensiones: ${info.width}x${info.height}`);

    const offsets = CONFIG.OFFSETS;
    const modos = CONFIG.MODOS;
    const resultadosValidos = [];
    const telemetriaCompleta = [];

    for (const modo of modos) {
        console.log(`\n🔍 [${modo.label}] Probando offsets...`);
        for (const offX of offsets) {
            for (const offY of offsets) {
                const inicio = performance.now();
                const res = await analizarOffsetCompleto(data, info, offX, offY, modo.blockSize, modo.twin, CONFIG.TOLERANCIA_HAMMING, CONFIG.TIMEOUT_POR_OFFSET);
                const tiempo = Math.round((performance.now() - inicio) / 1000);

                const icono = res.checksumValido ? '✅' : (res.timeout ? '⏱️' : '❌');
                console.log(`   off(${offX},${offY}) | E=${res.energia.toFixed(0)} | ${icono} | ADN=${res.adn} | t=${tiempo}s`);

                // Guardar telemetría
                const registro = {
                    modo: modo.label,
                    offsetX: offX,
                    offsetY: offY,
                    energia: res.energia,
                    adn: res.adn,
                    checksumValido: res.checksumValido,
                    distancia: res.distanciaHamming,
                    id: res.id,
                    cliente: res.cliente,
                    obra: res.obra,
                    tiempo: tiempo,
                    bloques: res.bloques,
                    timeout: res.timeout,
                    evolucion: res.evolucion,
                    urnasDistribucion: res.urnasDistribucion
                };
                telemetriaCompleta.push(registro);

                if (res.checksumValido) {
                    resultadosValidos.push(registro);
                }
            }
        }
    }

    // ============================================================
    // GUARDAR TELEMETRÍA EN JSON
    // ============================================================
    const telemetriaPath = path.join(__dirname, '..', 'telemetria_blur.json');
    fs.writeFileSync(telemetriaPath, JSON.stringify(telemetriaCompleta, null, 2));
    console.log(`\n📁 Telemetría guardada en: ${telemetriaPath}`);

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN DE OFFSETS VÁLIDOS');
    console.log('='.repeat(80));

    if (resultadosValidos.length === 0) {
        console.log('❌ No se encontró ningún offset con checksum válido.');
    } else {
        console.log(`✅ Se encontraron ${resultadosValidos.length} offsets válidos:`);
        console.log('| Modo | Offset | Energía | Distancia | ID | ADN |');
        console.log('|------|--------|---------|-----------|----|-----|');
        for (const r of resultadosValidos) {
            console.log(`| ${r.modo.padEnd(4)} | (${r.offsetX},${r.offsetY}) | ${r.energia.toFixed(0)} | ${r.distancia} | ${r.id} | ${r.adn} |`);
        }

        // Estadísticas
        const energias = resultadosValidos.map(r => r.energia);
        const energiaMedia = energias.reduce((a, b) => a + b, 0) / energias.length;
        const offsetMasComun = resultadosValidos.reduce((acc, r) => {
            const key = `(${r.offsetX},${r.offsetY})`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const masComun = Object.entries(offsetMasComun).sort((a, b) => b[1] - a[1])[0];

        // Evolución de energía en el offset válido (primer hallazgo)
        const primerValido = resultadosValidos[0];
        console.log(`\n📈 EVOLUCIÓN DE ENERGÍA EN EL PRIMER OFFSET VÁLIDO (${primerValido.offsetX},${primerValido.offsetY}):`);
        if (primerValido.evolucion && primerValido.evolucion.length > 0) {
            console.log('   Bloques | Energía | ADN');
            primerValido.evolucion.slice(0, 10).forEach(e => {
                console.log(`   ${e.bloques.toString().padEnd(8)} | ${e.energiaTotal.toFixed(0).padEnd(7)} | ${e.adn}`);
            });
            if (primerValido.evolucion.length > 10) {
                console.log(`   ... (${primerValido.evolucion.length - 10} puntos más)`);
            }
        }

        // Relación bit/sombra
        console.log(`\n📊 RELACIÓN BIT/SOMBRA EN OFFSET VÁLIDO:`);
        if (primerValido.evolucion && primerValido.evolucion.length > 0) {
            const ultimaRelacion = primerValido.evolucion[primerValido.evolucion.length - 1].relacionBitSombra;
            console.log(`   Relación final bits/sombras: ${ultimaRelacion.toFixed(2)} (ideal ≈1.0)`);
        }

        console.log('\n📌 ESTADÍSTICAS:');
        console.log(`   Total válidos: ${resultadosValidos.length}`);
        console.log(`   Energía media: ${energiaMedia.toFixed(0)}`);
        console.log(`   Energía máxima: ${Math.max(...energias).toFixed(0)}`);
        console.log(`   Energía mínima: ${Math.min(...energias).toFixed(0)}`);
        console.log(`   Offset más común: ${masComun[0]} (${masComun[1]} veces)`);
        console.log(`   Modos: ${[...new Set(resultadosValidos.map(r => r.modo))].join(', ')}`);

        // Distribución de urnas del offset válido
        if (primerValido.urnasDistribucion) {
            console.log(`\n📊 DISTRIBUCIÓN DE URNAS EN OFFSET VÁLIDO (primeras 10 urnas):`);
            primerValido.urnasDistribucion.slice(0, 10).forEach(u => {
                console.log(`   Urna ${u.urna}: ${u.valor.toFixed(2)}`);
            });
        }
    }

    console.log('='.repeat(80));
    console.log('✅ PRUEBA COMPLETADA');
}

testBarridoCompleto().catch(console.error);