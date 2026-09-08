// paralelizacion/test_compresion_4x4.js
// 🧪 PRUEBA DE ROBUSTEZ: STARDUST 4x4 vs COMPRESIÓN JPEG (HASTA CALIDAD 3)

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DragonDB } from '../src/backend/database.js';
import { analizarImagenMBH } from '../src/backend/analizador_v5.js';
import { analizarImagenRapido } from '../src/backend/analizador_v6.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// CONFIGURACIÓN
// ================================================================
const IMAGEN_ORIGINAL = path.join(__dirname, 'prueba_sellada_paralelo.png');
// 🔥 AHORA BAJA DE 10 A 3 DE UNO EN UNO
const CALIDADES = [10, 9, 8, 7, 6, 5, 4, 3];
const OUTPUT_DIR = path.join(__dirname, 'test_jpg_extremo');

// ================================================================
// FUNCIÓN PRINCIPAL
// ================================================================
async function testCompresion() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 PRUEBA DE ROBUSTEZ EXTREMA: STARDUST 4x4 vs COMPRESIÓN JPEG');
    console.log('📉 Calidades: 10 → 3 (de uno en uno)');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ No existe: ${IMAGEN_ORIGINAL}`);
        console.log('   Primero genera la imagen con el generador 4x4.');
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const db = new DragonDB();
    await db._ensureOpen();

    const resultados = [];

    for (const calidad of CALIDADES) {
        console.log(`\n📸 Calidad JPEG: ${calidad}`);
        console.log('-'.repeat(50));

        const nombreSalida = `prueba_calidad_${calidad}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);
        let tamañoKB = '0';

        try {
            await sharp(IMAGEN_ORIGINAL)
                .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                .toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            tamañoKB = (stats.size / 1024).toFixed(1);
            console.log(`   📁 Archivo: ${nombreSalida} (${tamañoKB} KB)`);
        } catch (err) {
            console.log(`   ❌ Error al convertir: ${err.message}`);
            continue;
        }

        let v6ok = false;
        let v5ok = false;
        let hashV6 = null;
        let hashV5 = null;

        // ================================================================
        // 2. ANALIZAR CON V6 (RÁPIDO)
        // ================================================================
        try {
            console.log(`   🔍 Analizando con V6...`);
            const resultadoV6 = await analizarImagenRapido(rutaSalida, db, 30000, true);
            
            if (resultadoV6.identificado) {
                v6ok = true;
                hashV6 = resultadoV6.hash;
                console.log(`   ✅ V6: DETECTADO (${resultadoV6.hash})`);
            } else {
                console.log(`   ❌ V6: NO DETECTADO`);
            }
        } catch (err) {
            console.log(`   ❌ V6: Error - ${err.message}`);
        }

        // ================================================================
        // 3. ANALIZAR CON V5 (FORENSE)
        // ================================================================
        try {
            console.log(`   🔍 Analizando con V5...`);
            const resultadoV5 = await analizarImagenMBH(rutaSalida, db, 30000);
            
            if (resultadoV5.identificado) {
                v5ok = true;
                hashV5 = resultadoV5.hash;
                console.log(`   ✅ V5: DETECTADO (${resultadoV5.hash})`);
            } else {
                console.log(`   ❌ V5: NO DETECTADO`);
            }
        } catch (err) {
            console.log(`   ❌ V5: Error - ${err.message}`);
        }

        resultados.push({
            calidad,
            tamañoKB: parseFloat(tamañoKB),
            v6: v6ok,
            v5: v5ok,
            hashV6,
            hashV5
        });
    }

    // ================================================================
    // 4. RESULTADOS
    // ================================================================
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTADOS: STARDUST 4x4 vs COMPRESIÓN JPEG EXTREMA');
    console.log('='.repeat(70) + '\n');

    console.log('| Calidad | Tamaño (KB) | V6 (rápido) | V5 (forense) |');
    console.log('|---------|-------------|-------------|--------------|');

    for (const r of resultados) {
        const v6ok = r.v6 ? '✅' : '❌';
        const v5ok = r.v5 ? '✅' : '❌';
        console.log(`| ${String(r.calidad).padEnd(7)} | ${String(r.tamañoKB).padEnd(11)} | ${v6ok.padEnd(11)} | ${v5ok.padEnd(12)} |`);
    }

    console.log('');

    // ================================================================
    // 5. RESUMEN
    // ================================================================
    const detectadosV6 = resultados.filter(r => r.v6).length;
    const detectadosV5 = resultados.filter(r => r.v5).length;
    const total = resultados.length;

    console.log('📌 RESUMEN:');
    console.log(`   ✅ V6 detectó en ${detectadosV6}/${total} calidades (${(detectadosV6/total*100).toFixed(0)}%)`);
    console.log(`   ✅ V5 detectó en ${detectadosV5}/${total} calidades (${(detectadosV5/total*100).toFixed(0)}%)`);
    console.log('');

    // ================================================================
    // 6. LÍMITE DE RESISTENCIA
    // ================================================================
    const ultimaV6 = resultados.filter(r => r.v6).pop();
    const ultimaV5 = resultados.filter(r => r.v5).pop();

    // Buscar la primera calidad donde falla
    const falloV6 = resultados.find(r => !r.v6);
    const falloV5 = resultados.find(r => !r.v5);

    console.log('📌 LÍMITE DE RESISTENCIA:');
    if (ultimaV6) {
        console.log(`   ✅ V6: Resiste hasta calidad ${ultimaV6.calidad}`);
    }
    if (falloV6) {
        console.log(`   ❌ V6: Falla en calidad ${falloV6.calidad}`);
    } else {
        console.log(`   ✅ V6: ¡Resiste TODAS las calidades probadas (hasta ${CALIDADES[CALIDADES.length-1]})!`);
    }

    if (ultimaV5) {
        console.log(`   ✅ V5: Resiste hasta calidad ${ultimaV5.calidad}`);
    }
    if (falloV5) {
        console.log(`   ❌ V5: Falla en calidad ${falloV5.calidad}`);
    } else {
        console.log(`   ✅ V5: ¡Resiste TODAS las calidades probadas (hasta ${CALIDADES[CALIDADES.length-1]})!`);
    }

    console.log('\n' + '='.repeat(70));

    await db.cerrar();
}

// ================================================================
// EJECUTAR
// ================================================================
testCompresion();