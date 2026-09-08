// ================================================================
// test_v5.js - CON DIAGNÓSTICO DE FALLOS EN JPEG (sin modificar el analizador)
// ================================================================

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { performance } from 'perf_hooks';

import { DragonDB } from '../src/backend/database.js';
import { GeneradorMBH } from '../src/backend/generadorMBH.js';
import { analizarImagenMBH } from '../src/backend/analizador_v5.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// CONFIGURACIÓN
// ================================================================
const TEST_DIR = __dirname;
const OUTPUT_DIR = path.join(TEST_DIR, 'test_output');
const IMAGE_BASE = path.join(TEST_DIR, 'prueba.jpg');

const CLIENTE = 'Cliente de Prueba';
const OBRA = 'Obra de Prueba';
const PROYECTO_NOMBRE = 'Proyecto Test V5';
const DERECHOS = 'Todos los derechos reservados';

// ================================================================
// 1. CAMBIAR DIRECTORIO DE TRABAJO (para que generador encuentre ExifTool)
// ================================================================
function cambiarDirectorioRaiz() {
    const projectRoot = path.resolve(__dirname, '..');
    process.chdir(projectRoot);
    const exifToolDir = path.join(projectRoot, 'resources', 'exiftool');
    if (fs.existsSync(path.join(exifToolDir, 'exiftool_win.exe'))) {
        process.env.PATH = exifToolDir + path.delimiter + process.env.PATH;
        console.log(`✅ ExifTool listo`);
    } else {
        console.warn(`⚠️ ExifTool no encontrado`);
    }
}

// ================================================================
// 2. INICIALIZACIÓN
// ================================================================
let db = null;
let generador = null;

async function init() {
    console.log('🚀 Inicializando pruebas...');
    cambiarDirectorioRaiz();
    db = new DragonDB();
    await db._ensureOpen();

    let prefijo = await db.obtenerPrefijo();
    if (!prefijo) {
        prefijo = 'TST';
        await db.establecerPrefijo(prefijo);
    }

    const licenseManagerMock = {
        comprobarLimite: async () => ({ ok: true }),
        incrementarSellosUsados: async () => {}
    };

    generador = new GeneradorMBH(db, licenseManagerMock);
    console.log('✅ Generador y DB listos.');
}

// ================================================================
// 3. OBTENER O CREAR IMAGEN SELLADA
// ================================================================
async function obtenerOCrearSellado() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const files = fs.readdirSync(OUTPUT_DIR);
    const pngFiles = files.filter(f => f.endsWith('.png') && (f.includes('_GHL_') || f.includes('_TST_')));

    if (pngFiles.length > 0) {
        const rutaPng = path.join(OUTPUT_DIR, pngFiles[0]);
        const idCompleto = pngFiles[0].split('_').slice(-1)[0].replace('.png', '');
        const hash = idCompleto.split('_')[1] || idCompleto;
        let tieneMetadatos = false;
        try {
            const meta = await sharp(rutaPng).metadata();
            if (meta.imageDescription && meta.imageDescription.includes('DRAGON3_ID:')) tieneMetadatos = true;
        } catch (_) {}
        if (tieneMetadatos) {
            console.log(`♻️ Reutilizando: ${path.basename(rutaPng)} (ID: ${hash})`);
            return { ruta: rutaPng, id: idCompleto, hash };
        } else {
            fs.unlinkSync(rutaPng);
        }
    }

    console.log('🔒 Generando nueva imagen sellada...');
    const idNumerico = await db.obtenerSiguienteId();
    console.log(`🔢 ID: ${idNumerico}`);
    const metadatos = {
        cliente: CLIENTE,
        obra: OBRA,
        proyecto_nombre: PROYECTO_NOMBRE,
        derechos: DERECHOS,
        id_numerico: idNumerico,
        outputDir: OUTPUT_DIR
    };
    const resultado = await generador.sellarImagen(IMAGE_BASE, null, metadatos);
    if (!resultado.ok) throw new Error(`Error al sellar: ${resultado.error}`);
    const hash = resultado.id.split('_')[1];
    const reg = await db.buscarPorHash(hash);
    if (!reg) throw new Error(`El sello ${hash} no se registró.`);
    console.log(`✅ Imagen sellada: ${path.basename(resultado.ruta)} (ID: ${resultado.id})`);
    return { ruta: resultado.ruta, id: resultado.id, hash };
}

// ================================================================
// 4. ANÁLISIS DE IMAGEN (con timeout)
// ================================================================
async function analizarImagen(ruta, timeout = 60000) {
    const start = performance.now();
    let resultado = null;
    let error = null;
    try {
        resultado = await analizarImagenMBH(ruta, db, timeout);
    } catch (err) {
        error = err.message;
    }
    const elapsed = performance.now() - start;
    return {
        ruta,
        success: resultado?.identificado || false,
        hash: resultado?.hash || null,
        cliente: resultado?.cliente || null,
        obra: resultado?.obra || null,
        metodo: resultado?.metodo || 'N/A',
        tiempo_ms: elapsed,
        error
    };
}

// ================================================================
// 5. DIAGNÓSTICO DE FALLO EN JPEG (extrae energía y bits)
// ================================================================
async function diagnosticarJPEG(ruta, db, idEsperado) {
    console.log(`\n🔬 DIAGNÓSTICO para: ${path.basename(ruta)}`);
    try {
        const bufferRadar = await sharp(ruta).jpeg({ quality: 95 }).toBuffer();
        const { data, info } = await sharp(bufferRadar).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const acumuladores = new Float32Array(64).fill(0);
        let bloques = 0;
        let energiaTotal = 0;
        const intentos = [];

        // Función para calcular distancia de Hamming (número de bits diferentes)
        function hammingDistance(hex1, hex2) {
            const bin1 = parseInt(hex1, 16).toString(2).padStart(28, '0');
            const bin2 = parseInt(hex2, 16).toString(2).padStart(28, '0');
            let diff = 0;
            for (let i = 0; i < 28; i++) {
                if (bin1[i] !== bin2[i]) diff++;
            }
            return diff;
        }

        for (let y = 0; y <= info.height - 8; y += 8) {
            for (let x = 0; x <= info.width - 8; x += 8) {
                let block = Array(8).fill(0).map(() => Array(8).fill(0));
                for (let i = 0; i < 8; i++) {
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                        block[i][j] = data[idx] - 128;
                    }
                }
                const d = dct8x8(block);
                const diff = d[1][1] - d[2][2];
                acumuladores[bloques % 64] += diff;
                energiaTotal += Math.abs(diff);
                bloques++;

                if (bloques % 100 === 0) {
                    let bits = '';
                    for (let i = 0; i < 32; i++) {
                        bits += (acumuladores[2*i] > acumuladores[2*i+1]) ? '1' : '0';
                    }
                    const idInt = parseInt(bits.substring(0, 28), 2);
                    const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
                    const chkLeido = parseInt(bits.substring(28), 2);
                    const low = parseInt(idEsperado, 16) & 0x3FFF;
                    const high = (parseInt(idEsperado, 16) >> 14) & 0x3FFF;
                    const chkEsperado = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;

                    // Verificar si el ID extraído existe en DB
                    const reg = await db.buscarPorHash(idHex);
                    const existe = !!reg;
                    const distancia = hammingDistance(idHex, idEsperado);

                    intentos.push({ bloques, chkEsperado, chkLeido, idHex, existe, distancia, energia: energiaTotal });

                    // Si checksum coincide Y (ID existe O distancia ≤ 2), lo consideramos detección válida
                    if (chkLeido === chkEsperado && (existe || distancia <= 2)) {
                        console.log(`   ✅ ¡DETECCIÓN VÁLIDA! en ${bloques} bloques (ID: ${idHex}, checksum: ${chkLeido}, distancia: ${distancia}, energía: ${energiaTotal.toFixed(0)})`);
                        return { exito: true };
                    }
                }
            }
        }

        console.log(`   ❌ No se encontró ID válido en ${bloques} bloques.`);
        console.log(`   📊 Energía total: ${energiaTotal.toFixed(0)}`);
        // Mostrar los últimos 5 intentos
        const ultimos = intentos.slice(-5);
        console.log(`   Últimos intentos (bloques, checksum esperado/leído, ID extraído, existe, distancia, energía):`);
        for (const c of ultimos) {
            const ok = c.existe ? '✅' : '❌';
            console.log(`      ${c.bloques} bloques | esperado: ${c.chkEsperado} | leído: ${c.chkLeido} | ID: ${c.idHex} | existe: ${ok} | dist: ${c.distancia} | energía: ${c.energia.toFixed(0)}`);
        }
        return { exito: false };
    } catch (e) {
        console.log(`   ❌ Error en diagnóstico: ${e.message}`);
        return { exito: false, error: e.message };
    }
}

// ================================================================
// 6. FUNCIÓN DCT (copiada del analizador para diagnóstico)
// ================================================================
const COS_TABLE = new Float32Array(64);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

function dct8x8(block) {
    let dct = Array(8).fill(0).map(() => Array(8).fill(0));
    const C = (u) => (u === 0 ? 0.7071 : 1);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    sum += block[y][x] * COS_TABLE[u * 8 + x] * COS_TABLE[v * 8 + y];
                }
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

// ================================================================
// 7. CONVERTIR PNG A JPEG
// ================================================================
async function convertirAJpeg(rutaPng, calidad) {
    const nombre = path.basename(rutaPng, '.png');
    const rutaJpg = path.join(OUTPUT_DIR, `${nombre}_q${calidad}.jpg`);
    await sharp(rutaPng)
        .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
        .toFile(rutaJpg);
    return rutaJpg;
}

// ================================================================
// 8. PRUEBAS PRINCIPALES
// ================================================================
async function runTests() {
    await init();

    if (!fs.existsSync(IMAGE_BASE)) {
        console.error(`❌ Imagen base no encontrada: ${IMAGE_BASE}`);
        process.exit(1);
    }

    const sellado = await obtenerOCrearSellado();
    const rutaPng = sellado.ruta;
    const idEsperado = sellado.hash;

    console.log('\n🔍 Analizando PNG (Vogel)...');
    const resultadoPng = await analizarImagen(rutaPng);
    console.log(`   ${resultadoPng.success ? '✅' : '❌'} ${resultadoPng.hash || 'N/A'} (${resultadoPng.metodo}) ${resultadoPng.tiempo_ms.toFixed(0)}ms`);

    console.log('\n📊 Pruebas de compresión JPEG:');
    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const resultados = [];

    for (const q of calidades) {
        console.log(`\n🔄 Calidad ${q}%...`);
        const rutaJpg = await convertirAJpeg(rutaPng, q);
        const res = await analizarImagen(rutaJpg);
        resultados.push({ calidad: q, ...res });
        if (res.success) {
            console.log(`   ✅ ${res.hash} (${res.metodo}) ${res.tiempo_ms.toFixed(0)}ms`);
        } else {
            console.log(`   ❌ Falló (${res.tiempo_ms.toFixed(0)}ms)`);
            // Ejecutar diagnóstico detallado
            await diagnosticarJPEG(rutaJpg, db, idEsperado);
        }
    }

    // Resumen final
    console.log('\n📋 ===== RESUMEN =====');
    console.log(`ID esperado: ${idEsperado}`);
    console.log(`PNG: ${resultadoPng.success ? '✅' : '❌'} ${resultadoPng.hash || 'N/A'} (${resultadoPng.metodo})`);
    console.log('\nCalidad | Resultado | Hash     | Método');
    console.log('--------|-----------|----------|-------------');
    for (const r of resultados) {
        const ok = r.success ? '✅' : '❌';
        const hash = r.hash || '--------';
        const metodo = (r.metodo || 'N/A').padEnd(11);
        console.log(`${String(r.calidad).padEnd(7)} | ${ok}        | ${hash} | ${metodo}`);
    }

    // Guardar JSON
    const resumen = {
        id_esperado: idEsperado,
        png: resultadoPng,
        jpeg: resultados,
        fecha: new Date().toISOString()
    };
    const jsonPath = path.join(OUTPUT_DIR, 'resultados_test.json');
    fs.writeFileSync(jsonPath, JSON.stringify(resumen, null, 2));
    console.log(`\n📁 Resultados guardados en: ${jsonPath}`);

    await new Promise(resolve => setTimeout(resolve, 1000));
    await db.cerrar();
    console.log('\n✅ Pruebas finalizadas.');
}

// ================================================================
// 9. EJECUCIÓN
// ================================================================
runTests().catch(async err => {
    console.error('❌ Error en pruebas:', err);
    if (db) {
        try { await db.cerrar(); } catch (_) {}
    }
    process.exit(1);
});