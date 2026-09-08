// barrido_exhaustivo_blur.js
// 🔍 BARRIDO EXHAUSTIVO DE LA IMAGEN BLUR (CON TIEMPO TOTAL AL FINAL)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ================================================================
// CONFIGURACIÓN
// ================================================================
const CONFIG = {
    IMAGEN: path.resolve('referencia_12345_blur.png'),
    ADN_ESPERADO: "000100100011010001010000", // 24 bits para ID 0x12345
    OFFSETS: [0, 1, 2, 3, 4, 5, 6, 7],
    MODOS: [
        { blockSize: 8, twin: false, label: '8x8' },
        { blockSize: 8, twin: true,  label: '8x8 Twin' },
        { blockSize: 4, twin: false, label: '4x4' },
        { blockSize: 4, twin: true,  label: '4x4 Twin' }
    ],
    EARLY_DETECTION_BLOCKS: 100,
    TIMEOUT_POR_OFFSET: 30000
};

// ================================================================
// DCT 8×8 Y 4×4
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

function dct4x4(block) {
    const n = 4;
    let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let x = 0; x < n; x++) {
                for (let y = 0; y < n; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 8) * Math.cos(((2 * y + 1) * v * Math.PI) / 8);
                }
            }
            dct[v][u] = 0.5 * C(u) * C(v) * sum;
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
    if (blockSize === 8) {
        const dct = dct8x8(block);
        return dct[1][1] - dct[2][2];
    } else {
        const dct = dct4x4(block);
        return dct[1][1] - dct[2][2];
    }
}

// ================================================================
// VALIDACIÓN DE CHECKSUM MENTALISTA
// ================================================================
function verificarChecksumMentalista(bits) {
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
            return true;
        }
    }
    return false;
}

// ================================================================
// ANÁLISIS DE UN OFFSET
// ================================================================
async function analizarOffsetCompleto(data, info, offsetX, offsetY, blockSize = 8, twinBlock = false) {
    const startTime = performance.now();
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let resultadoFinal = null;
    let energiaTotal = 0;
    let adn = "";
    let checksumValido = false;
    let isTimeout = false;

    const step = blockSize;
    const stepX = twinBlock ? step * 2 : step;

    for (let y = 0; y <= info.height - step; y += step) {
        for (let x = 0; x <= info.width - step; x += stepX) {
            if (performance.now() - startTime > CONFIG.TIMEOUT_POR_OFFSET) {
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
                const bits = new Array(24);
                for (let i = 0; i < 24; i++) {
                    const bitVal = urnas[i * 2];
                    const sombraVal = urnas[i * 2 + 1];
                    bits[i] = bitVal > sombraVal ? "1" : "0";
                }
                adn = bits.join('');
                checksumValido = verificarChecksumMentalista(adn);
                energiaTotal = 0;
                for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);

                if (!resultadoFinal) {
                    resultadoFinal = { adn, energia: energiaTotal, checksumValido };
                }
                if (checksumValido) {
                    resultadoFinal = { adn, energia: energiaTotal, checksumValido };
                    break;
                }
            }
        }
        if (isTimeout || (resultadoFinal && resultadoFinal.checksumValido)) break;
    }

    if (!resultadoFinal) {
        energiaTotal = 0;
        for (let i = 0; i < 48; i++) energiaTotal += Math.abs(urnas[i]);
        if (adn === "") adn = "000000000000000000000000";
        resultadoFinal = { adn, energia: energiaTotal, checksumValido: verificarChecksumMentalista(adn) };
    }

    let coincidencias = 0;
    for (let i = 0; i < 24; i++) {
        if (resultadoFinal.adn[i] === CONFIG.ADN_ESPERADO[i]) coincidencias++;
    }
    const porcentaje = Math.round((coincidencias / 24) * 100);

    return {
        offsetX,
        offsetY,
        blockSize,
        twinBlock,
        adn: resultadoFinal.adn,
        energia: resultadoFinal.energia,
        checksumValido: resultadoFinal.checksumValido,
        coincidencia: porcentaje,
        timeout: isTimeout,
        bloques: bloquesProcesados
    };
}

// ================================================================
// FUNCIÓN PRINCIPAL CON TIEMPOS
// ================================================================
async function barridoExhaustivo() {
    console.log('\n🔍 BARRIDO EXHAUSTIVO DE LA IMAGEN BLUR');
    console.log(`   ADN esperado: ${CONFIG.ADN_ESPERADO}`);
    console.log(`   Offsets a barrer: ${CONFIG.OFFSETS.join(', ')}`);
    console.log(`   Modos: ${CONFIG.MODOS.map(m => m.label).join(', ')}`);
    console.log(`   Imagen: ${CONFIG.IMAGEN}\n`);

    if (!fs.existsSync(CONFIG.IMAGEN)) {
        console.error(`❌ No existe la imagen: ${CONFIG.IMAGEN}`);
        process.exit(1);
    }

    const bufferRadar = await sharp(CONFIG.IMAGEN).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log(`📐 Dimensiones: ${info.width}x${info.height}`);

    const resultados = [];
    const inicioTotal = Date.now();

    for (const modo of CONFIG.MODOS) {
        console.log(`\n🔍 [${modo.label}] Barriendo offsets...`);
        const inicioModo = Date.now();

        for (const offX of CONFIG.OFFSETS) {
            for (const offY of CONFIG.OFFSETS) {
                const res = await analizarOffsetCompleto(data, info, offX, offY, modo.blockSize, modo.twin);
                resultados.push({
                    modo: modo.label,
                    offsetX: offX,
                    offsetY: offY,
                    adn: res.adn,
                    energia: res.energia,
                    checksumValido: res.checksumValido,
                    coincidencia: res.coincidencia,
                    timeout: res.timeout,
                    bloques: res.bloques
                });
                const icono = res.checksumValido ? '✅' : (res.timeout ? '⏱️' : '❌');
                console.log(`   off(${offX},${offY}) | E=${res.energia.toFixed(0)} | ${icono} | ADN=${res.adn} | Coinc=${res.coincidencia}%`);
            }
        }

        const duracionModo = (Date.now() - inicioModo) / 1000;
        console.log(`   ⏱️ ${modo.label} completado en ${duracionModo.toFixed(1)}s`);
    }

    const tiempoTotal = (Date.now() - inicioTotal) / 1000;

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(80));

    const checksumValidos = resultados.filter(r => r.checksumValido);
    const altaCoincidencia = resultados.filter(r => r.coincidencia >= 80 && !r.checksumValido);

    console.log(`\n✅ CHECKSUM VÁLIDO en ${checksumValidos.length} offset(s):`);
    if (checksumValidos.length > 0) {
        console.log('| Modo | Offset | ADN | Energía | Coincidencia |');
        console.log('|------|--------|-----|---------|--------------|');
        for (const r of checksumValidos.slice(0, 10)) {
            console.log(`| ${r.modo.padEnd(4)} | (${r.offsetX},${r.offsetY}) | ${r.adn} | ${r.energia.toFixed(0)} | ${r.coincidencia}% |`);
        }
        if (checksumValidos.length > 10) console.log(`   ... y ${checksumValidos.length - 10} más`);
    } else {
        console.log('   ❌ Ningún offset produjo checksum válido.');
    }

    console.log(`\n📈 ALTA COINCIDENCIA (≥80%) sin checksum en ${altaCoincidencia.length} offset(s):`);
    if (altaCoincidencia.length > 0) {
        console.log('| Modo | Offset | ADN | Energía | Coincidencia |');
        console.log('|------|--------|-----|---------|--------------|');
        for (const r of altaCoincidencia) {
            console.log(`| ${r.modo.padEnd(4)} | (${r.offsetX},${r.offsetY}) | ${r.adn} | ${r.energia.toFixed(0)} | ${r.coincidencia}% |`);
        }
    } else {
        console.log('   ❌ Ningún offset con alta coincidencia.');
    }

    const energias = resultados.map(r => r.energia);
    const energiasValidas = energias.filter(e => !isNaN(e) && e > 0);
    const energiaMedia = energiasValidas.length > 0 ? energiasValidas.reduce((a, b) => a + b, 0) / energiasValidas.length : 0;
    const coincidencias = resultados.map(r => r.coincidencia);
    const coincidenciaMedia = coincidencias.reduce((a, b) => a + b, 0) / coincidencias.length;

    console.log(`\n📊 ESTADÍSTICAS GLOBALES:`);
    console.log(`   Energía media: ${energiaMedia.toFixed(0)}`);
    console.log(`   Coincidencia media: ${coincidenciaMedia.toFixed(1)}%`);
    console.log(`   Total de offsets analizados: ${resultados.length}`);

    console.log(`\n🌡️ MEJOR COINCIDENCIA POR MODO:`);
    for (const modo of CONFIG.MODOS) {
        const modoResultados = resultados.filter(r => r.modo === modo.label);
        const mejor = modoResultados.reduce((a, b) => a.coincidencia > b.coincidencia ? a : b);
        console.log(`   ${modo.label}: offset (${mejor.offsetX},${mejor.offsetY}) -> ${mejor.coincidencia}% (checksum: ${mejor.checksumValido ? '✅' : '❌'})`);
    }

    console.log(`\n⏱️ TIEMPO TOTAL: ${tiempoTotal.toFixed(1)} segundos (${(tiempoTotal/60).toFixed(1)} minutos)`);
    console.log('='.repeat(80));
    console.log('✅ BARRIDO COMPLETADO');
}

barridoExhaustivo().catch(console.error);