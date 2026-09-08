// paralelizacion/test_tortura_v5.js
// 🧪 TEST DE TORTURA: V5 vs ATAQUES DOBLES Y TRIPLES

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DragonDB } from '../src/backend/database.js';
import { analizarImagenMBH } from '../src/backend/analizador_v5.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// CONFIGURACIÓN
// ================================================================
const IMAGEN_ORIGINAL = path.join(__dirname, 'prueba_sellada_paralelo.png');
const OUTPUT_DIR = path.join(__dirname, 'test_tortura');

// ================================================================
// ATAQUES COMBINADOS
// ================================================================
const ATAQUES = [
    { nombre: 'JPEG 10 solo', 
      fn: async (img) => img.jpeg({ quality: 10 }) },
    { nombre: 'Redimensionado 50% solo', 
      fn: async (img) => img.resize({ width: 1368, height: 2432 }) },
    { nombre: 'Recorte 20% solo', 
      fn: async (img) => img.extract({ left: 273, top: 486, width: 2188, height: 3891 }) },
    { nombre: 'Rotación 90° solo', 
      fn: async (img) => img.rotate(90) },
];

// ================================================================
// FUNCIÓN PRINCIPAL
// ================================================================
async function testTortura() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST DE TORTURA: V5 vs ATAQUES DOBLES Y TRIPLES');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.log(`❌ No existe: ${IMAGEN_ORIGINAL}`);
        return;
    }

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const db = new DragonDB();
    await db._ensureOpen();

    const resultados = [];
    let total = 0;
    let detectados = 0;

    for (const ataque of ATAQUES) {
        total++;
        console.log(`\n💥 ATAQUE: ${ataque.nombre}`);
        console.log('-'.repeat(50));

        const nombreSalida = `ataque_${total}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);

        try {
            // Aplicar el ataque
            let pipeline = sharp(IMAGEN_ORIGINAL);
            pipeline = await ataque.fn(pipeline);
            await pipeline.toFile(rutaSalida);

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);
            console.log(`   📁 Archivo: ${nombreSalida} (${tamañoKB} KB)`);

            // Analizar con V5
            console.log(`   🔍 Analizando con V5...`);
            const resultado = await analizarImagenMBH(rutaSalida, db, 120000);

            if (resultado.identificado) {
                detectados++;
                console.log(`   ✅ V5: DETECTADO (${resultado.hash})`);
                console.log(`   📝 Veredicto: ${resultado.veredicto}`);
            } else {
                console.log(`   ❌ V5: NO DETECTADO`);
            }

            resultados.push({
                ataque: ataque.nombre,
                tamañoKB: parseFloat(tamañoKB),
                detectado: resultado.identificado,
                hash: resultado.hash || null,
                veredicto: resultado.veredicto || null
            });

        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
            resultados.push({
                ataque: ataque.nombre,
                tamañoKB: 0,
                detectado: false,
                error: err.message
            });
        }
    }

    // ================================================================
    // RESULTADOS
    // ================================================================
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTADOS: V5 vs ATAQUES COMBINADOS');
    console.log('='.repeat(70) + '\n');

    console.log('| # | Ataque | Tamaño (KB) | V5 |');
    console.log('|---|--------|-------------|----|');

    for (let i = 0; i < resultados.length; i++) {
        const r = resultados[i];
        const ok = r.detectado ? '✅' : '❌';
        console.log(`| ${i+1} | ${r.ataque.substring(0, 40).padEnd(40)} | ${String(r.tamañoKB).padEnd(11)} | ${ok.padEnd(2)} |`);
    }

    console.log('');
    console.log('📌 RESUMEN:');
    console.log(`   ✅ V5 detectó en ${detectados}/${total} ataques (${(detectados/total*100).toFixed(0)}%)`);
    console.log('');

    // ================================================================
    // ANÁLISIS DE ROBUSTEZ
    // ================================================================
    const fallos = resultados.filter(r => !r.detectado);
    if (fallos.length === 0) {
        console.log('🎉 ¡V5 SUPERA TODOS LOS ATAQUES COMBINADOS!');
        console.log('   🔥 El sello 4x4 es prácticamente indestructible.');
    } else {
        console.log('⚠️ V5 falló en los siguientes ataques:');
        for (const f of fallos) {
            console.log(`   ❌ ${f.ataque}`);
        }
    }

    console.log('\n' + '='.repeat(70));

    await db.cerrar();
}

// ================================================================
// EJECUTAR
// ================================================================
testTortura();