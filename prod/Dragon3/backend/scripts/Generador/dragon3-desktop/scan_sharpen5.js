// scan_sharpen5_corregido.js
// 🔍 ESCANEO COMPLETO DE blur_sigma_5_sharpen_5.jpg (CORREGIDO)
//    - Barrido completo offsets 0..15 con TwinBlock.
//    - Calcula distancia Hamming al ADN esperado.
//    - El mejor offset es el de menor distancia.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const IMAGEN = path.resolve('test_sharpen_optimo/blur_sigma_5_sharpen_5.jpg');
const ADN_ESPERADO = "000100100011010001010000";
const OUTPUT_DIR = path.resolve('scan_sharpen5_corregido');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(IMAGEN)) {
    console.error(`❌ No existe la imagen: ${IMAGEN}`);
    process.exit(1);
}

console.log('\n🔍 ESCANEO CORREGIDO (por distancia Hamming)');
console.log(`   ADN esperado: ${ADN_ESPERADO}`);
console.log(`   Offsets: 0..15 (256 combinaciones)\n`);

// ================================================================
// DCT Y EXTRACCIÓN (idénticas al script anterior)
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

function calcularDistanciaHamming(a, b) {
    let d = 0;
    for (let i = 0; i < 24; i++) if (a[i] !== b[i]) d++;
    return d;
}

// ================================================================
// ANÁLISIS DE UN OFFSET (sin validación de checksum)
// ================================================================
async function analizarOffset(data, info, offsetX, offsetY, timeoutMs = 2000) {
    const startTime = performance.now();
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;
    let adn = "";

    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 16) {
            if (performance.now() - startTime > timeoutMs) {
                // Timeout: devolvemos lo que tenemos
                if (adn === "") {
                    const bits = new Array(24);
                    for (let i = 0; i < 24; i++) {
                        const bitVal = urnas[i * 2];
                        const sombraVal = urnas[i * 2 + 1];
                        bits[i] = bitVal > sombraVal ? "1" : "0";
                    }
                    adn = bits.join('');
                }
                const energia = urnas.reduce((a, b) => a + Math.abs(b), 0);
                const dist = calcularDistanciaHamming(adn, ADN_ESPERADO);
                return { offsetX, offsetY, energia, adn, distancia: dist, timeout: true };
            }

            const readX = x + offsetX;
            const readY = y + offsetY;
            if (readX + 16 > info.width || readY + 8 > info.height) continue;

            const diffA = extraerDiffBloque(data, info, readX, readY);
            const diffB = extraerDiffBloque(data, info, readX + 8, readY);
            const diff = diffA - diffB;

            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;

            if (bloquesProcesados % 100 === 0) {
                const bits = new Array(24);
                for (let i = 0; i < 24; i++) {
                    const bitVal = urnas[i * 2];
                    const sombraVal = urnas[i * 2 + 1];
                    bits[i] = bitVal > sombraVal ? "1" : "0";
                }
                adn = bits.join('');
                const dist = calcularDistanciaHamming(adn, ADN_ESPERADO);
                if (dist <= 3) {
                    // Si encuentra una distancia muy baja, podemos salir antes
                    const energia = urnas.reduce((a, b) => a + Math.abs(b), 0);
                    return { offsetX, offsetY, energia, adn, distancia: dist, timeout: false };
                }
            }
        }
    }

    const energia = urnas.reduce((a, b) => a + Math.abs(b), 0);
    if (adn === "") {
        const bits = new Array(24);
        for (let i = 0; i < 24; i++) {
            const bitVal = urnas[i * 2];
            const sombraVal = urnas[i * 2 + 1];
            bits[i] = bitVal > sombraVal ? "1" : "0";
        }
        adn = bits.join('');
    }
    const dist = calcularDistanciaHamming(adn, ADN_ESPERADO);
    return { offsetX, offsetY, energia, adn, distancia: dist, timeout: false };
}

// ================================================================
// ESCANEO COMPLETO
// ================================================================
async function escanear() {
    const bufferRadar = await sharp(IMAGEN).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log(`📐 Dimensiones: ${info.width}x${info.height}`);

    const offsets = Array.from({ length: 16 }, (_, i) => i);
    const resultados = [];

    console.log('🔍 Barriendo offsets...');
    for (const offX of offsets) {
        for (const offY of offsets) {
            const res = await analizarOffset(data, info, offX, offY, 1500);
            resultados.push(res);
            process.stdout.write(`\r   Progreso: ${resultados.length}/256 (mejor distancia: ${Math.min(...resultados.map(r => r.distancia))})`);
        }
    }
    console.log('\n   ✅ Barrido completado.');

    // Ordenar por distancia (menor primero)
    const sorted = resultados.sort((a, b) => a.distancia - b.distancia);
    const top = sorted.slice(0, 10);

    // ============================================================
    // RESUMEN FINAL
    // ============================================================
    console.log('\n📊 TOP 10 OFFSETS POR DISTANCIA HAMMING');
    console.log('| Offset | Energía | ADN | Distancia |');
    console.log('|--------|---------|-----|-----------|');
    for (const r of top) {
        console.log(`| (${r.offsetX},${r.offsetY}) | ${r.energia.toFixed(0)} | ${r.adn} | ${r.distancia} |`);
    }

    const mejor = sorted[0];
    console.log(`\n🏆 MEJOR OFFSET: (${mejor.offsetX},${mejor.offsetY})`);
    console.log(`   Energía: ${mejor.energia.toFixed(0)}`);
    console.log(`   ADN: ${mejor.adn}`);
    console.log(`   Distancia Hamming: ${mejor.distancia}`);

    console.log(`\n🧭 VECTOR DE DESPLAZAMIENTO (blur5 vs original):`);
    console.log(`   Original: (0,0)`);
    console.log(`   Blur5+Sharpen5: (${mejor.offsetX},${mejor.offsetY})`);

    // Extraer secuencia de 48 elementos desde el mejor offset
    const urnasSeq = new Float64Array(48).fill(0);
    let count = 0;
    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 8) {
            const readX = x + mejor.offsetX;
            const readY = y + mejor.offsetY;
            if (readX + 8 > info.width || readY + 8 > info.height) continue;
            const diff = extraerDiffBloque(data, info, readX, readY);
            const pos = count % 48;
            urnasSeq[pos] += diff;
            count++;
        }
    }
    let secuenciaCompleta = '';
    for (let i = 0; i < 48; i++) {
        const val = urnasSeq[i];
        secuenciaCompleta += val > 0 ? '1' : (val < 0 ? '0' : '?');
    }
    console.log(`\n🔤 SECUENCIA DE 48 ELEMENTOS:`);
    console.log(`   ${secuenciaCompleta}`);

    // Guardar reporte
    const reporte = {
        imagen: IMAGEN,
        mejor_offset: { x: mejor.offsetX, y: mejor.offsetY, energia: mejor.energia, adn: mejor.adn, distancia: mejor.distancia },
        vector_desplazamiento: { dx: mejor.offsetX, dy: mejor.offsetY },
        secuencia_completa: secuenciaCompleta,
        top_offsets: top.map(r => ({ offset: `(${r.offsetX},${r.offsetY})`, energia: r.energia, adn: r.adn, distancia: r.distancia }))
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'reporte.json'), JSON.stringify(reporte, null, 2));
    console.log(`\n📄 Reporte guardado en: ${path.join(OUTPUT_DIR, 'reporte.json')}`);
}

escanear().catch(console.error);