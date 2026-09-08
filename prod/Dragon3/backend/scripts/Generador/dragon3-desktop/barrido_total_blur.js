// barrido_total_blur.js
// 🔍 BARRIDO EXHAUSTIVO DE TODA LA IMAGEN BLUR (SIN DETENERSE)
//    - Recorre offsets 0..7 en X e Y.
//    - Lee el ADN de 24 bits (ignorando sombras) desde el inicio de la imagen.
//    - Calcula checksum, energía y coincidencia con el ADN esperado.
//    - No se detiene al primer hallazgo; barre todos los offsets.
//    - Genera resumen final con el mejor offset (por checksum o coincidencia).

import sharp from 'sharp';
import fs from 'fs';

// ================================================================
// CONFIGURACIÓN
// ================================================================
const RUTA_IMAGEN = 'test_estres_output/blur_medium.jpg'; // o referencia_12345_blur.png si la generaste
const ADN_ESPERADO = '000100100011010001010000'; // Para ID 0x12345
const TOLERANCIA_CHECKSUM = 0; // 0 = exacto, 3 = tolerancia
const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7];

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

function extraerDiff(data, info, x, y, offsetX = 0, offsetY = 0) {
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
// VALIDACIÓN DE CHECKSUM MENTALISTA
// ================================================================
function validarChecksum(bits) {
    // bits: string de 24 bits (20 ID + 4 checksum)
    const idInt = parseInt(bits.substring(0, 20), 2) >>> 0;
    const chkLeido = parseInt(bits.substring(20), 2);
    const low = idInt & 0x3FF;
    const high = (idInt >> 10) & 0x3FF;
    const X = low ^ high;
    const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
    const chkEsperado = V & 0x0F;
    return chkLeido === chkEsperado;
}

// ================================================================
// LECTURA DE ADN DESDE UN OFFSET
// ================================================================
function leerADNDesdeOffset(data, info, offsetX, offsetY, anchoBloques) {
    let bits = '';
    let energiaTotal = 0;
    let valores = [];
    let count = 0;

    // Recorremos la imagen en bloques de 8×8, saltando sombras (cada 2 bloques)
    // Para simplificar, recorremos toda la imagen y acumulamos urnas de 48 posiciones.
    const urnas = new Float64Array(48).fill(0);
    let bloquesProcesados = 0;

    for (let y = 0; y <= info.height - 8; y += 8) {
        for (let x = 0; x <= info.width - 8; x += 8) {
            const diff = extraerDiff(data, info, x, y, offsetX, offsetY);
            const pos = bloquesProcesados % 48;
            urnas[pos] += diff;
            bloquesProcesados++;
        }
    }

    // Extraer bits de las urnas pares (bits, ignorando sombras en impares)
    for (let i = 0; i < 24; i++) {
        const bitVal = urnas[i * 2];
        const sombraVal = urnas[i * 2 + 1];
        const bit = bitVal > sombraVal ? '1' : '0';
        bits += bit;
        energiaTotal += Math.abs(bitVal) + Math.abs(sombraVal);
    }

    return { bits, energia: energiaTotal };
}

// ================================================================
// FUNCIÓN PRINCIPAL
// ================================================================
async function barridoTotal() {
    console.log('\n🔍 BARRIDO EXHAUSTIVO DE LA IMAGEN BLUR');
    console.log(`   ADN esperado: ${ADN_ESPERADO}`);
    console.log(`   Offsets a barrer: ${OFFSETS.join(', ')}`);
    console.log(`   Imagen: ${RUTA_IMAGEN}\n`);

    if (!fs.existsSync(RUTA_IMAGEN)) {
        console.error(`❌ No existe la imagen: ${RUTA_IMAGEN}`);
        process.exit(1);
    }

    // Cargar imagen
    const buffer = await sharp(RUTA_IMAGEN).jpeg({ quality: 95 }).toBuffer();
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    console.log(`📐 Dimensiones: ${info.width}x${info.height}`);
    const anchoBloques = Math.floor(info.width / 8);

    let mejoresPorChecksum = [];
    let mejoresPorCoincidencia = [];

    // Barrido de offsets
    for (const offX of OFFSETS) {
        for (const offY of OFFSETS) {
            const { bits, energia } = leerADNDesdeOffset(data, info, offX, offY, anchoBloques);

            // Calcular coincidencias
            let coincidencias = 0;
            for (let i = 0; i < 24; i++) {
                if (bits[i] === ADN_ESPERADO[i]) coincidencias++;
            }
            const porcentaje = Math.round((coincidencias / 24) * 100);

            // Validar checksum (con tolerancia)
            const checksumOk = validarChecksum(bits);

            // Guardar resultado
            const resultado = { offX, offY, bits, energia, coincidencias, porcentaje, checksumOk };

            if (checksumOk) {
                mejoresPorChecksum.push(resultado);
            }
            mejoresPorCoincidencia.push(resultado);
        }
    }

    // ================================================================
    // RESUMEN FINAL
    // ================================================================
    console.log('\n📊 RESUMEN DE RESULTADOS');
    console.log('==================================================');

    // Mejor por checksum
    if (mejoresPorChecksum.length > 0) {
        console.log(`\n✅ CHECKSUM VÁLIDO EN ${mejoresPorChecksum.length} offset(s):`);
        for (const r of mejoresPorChecksum) {
            console.log(`   Offset (${r.offX},${r.offY}): ADN=${r.bits} | Energía=${r.energia.toFixed(0)} | Coincidencia=${r.porcentaje}%`);
        }
    } else {
        console.log('\n❌ No se encontró ningún offset con checksum válido.');
    }

    // Mejor por coincidencia (top 5)
    mejoresPorCoincidencia.sort((a, b) => b.porcentaje - a.porcentaje);
    const topCoincidencia = mejoresPorCoincidencia.slice(0, 5);

    console.log(`\n🏆 TOP 5 OFFSETS POR COINCIDENCIA (sin checksum):`);
    for (const r of topCoincidencia) {
        console.log(`   Offset (${r.offX},${r.offY}): ADN=${r.bits} | Coincidencia=${r.porcentaje}% | Energía=${r.energia.toFixed(0)}`);
    }

    // Resumen estadístico
    console.log('\n📈 ESTADÍSTICAS GLOBALES:');
    const avgEnergia = mejoresPorCoincidencia.reduce((a, b) => a + b.energia, 0) / mejoresPorCoincidencia.length;
    const avgCoincidencia = mejoresPorCoincidencia.reduce((a, b) => a + b.porcentaje, 0) / mejoresPorCoincidencia.length;
    console.log(`   Energía media: ${avgEnergia.toFixed(0)}`);
    console.log(`   Coincidencia media: ${avgCoincidencia.toFixed(1)}%`);
    console.log(`   Total de offsets analizados: ${mejoresPorCoincidencia.length}`);

    // Mapa de calor simplificado (solo para visualizar)
    console.log('\n🌡️ MAPA DE COINCIDENCIAS (%):');
    const mapa = Array.from({ length: OFFSETS.length }, () => Array(OFFSETS.length).fill(0));
    for (const r of mejoresPorCoincidencia) {
        const i = OFFSETS.indexOf(r.offX);
        const j = OFFSETS.indexOf(r.offY);
        mapa[j][i] = r.porcentaje;
    }
    console.log('   X\\Y ' + OFFSETS.map(o => o.toString().padStart(3)).join(''));
    for (let j = 0; j < OFFSETS.length; j++) {
        const row = OFFSETS[j].toString().padStart(4) + ' ';
        for (let i = 0; i < OFFSETS.length; i++) {
            const val = mapa[j][i];
            const sym = val >= 80 ? '█' : (val >= 60 ? '▓' : (val >= 40 ? '▒' : '░'));
            row += sym + ' ';
        }
        console.log(row);
    }

    console.log('\n✅ BARRIDO COMPLETADO');
}

barridoTotal().catch(console.error);