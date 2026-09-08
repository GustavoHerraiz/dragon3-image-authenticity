/**
 * ============================================================================
 * DRAGON3 - TEST 0 (LÍNEA DE BASE / VERIFICACIÓN NEGATIVA)
 * ============================================================================
 * Objetivo: Asegurar que las imágenes SIN SELLAR den 0 hits en todos los escenarios.
 * - NO implanta el sello.
 * - Ejecuta ataques sobre la imagen virgen.
 * - Detecta si el ruido natural engaña al analizador.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

const IMAGEN_ORIGINAL = 'Atardecer.jpg'; // Imagen de Quico Melero original
const DIRECTORIO_SALIDA = './test0_results_basal';
const MASTER_VIRGEN = IMAGEN_ORIGINAL;

// ============================================================================
// UTILIDADES
// ============================================================================

function crearDirectorio(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// ============================================================================
// ESCENARIOS (Mismos que V20 pero aplicados a imagen virgen)
// ============================================================================

const ESCENARIOS = [
    {
        id: 'BASE_01',
        nombre: '🟢 Original (Control Negativo)',
        categoria: 'control',
        async ejecutar(original, salida) {
            await sharp(original).toFile(salida);
        }
    },
    {
        id: 'V16_01',
        nombre: '🟢 Recorte 50% + JPG 80 (Virgen)',
        categoria: 'crop',
        async ejecutar(original, salida) {
            const { width, height } = await sharp(original).metadata();
            await sharp(original)
                .extract({ left: 0, top: 0, width: Math.floor(width/2), height: Math.floor(height/2) })
                .jpeg({ quality: 80 })
                .toFile(salida);
        }
    },
    {
        id: 'V17_01',
        nombre: '📐 Giro 5° + Recorte + JPG 90 (Virgen)',
        categoria: 'rotacion',
        async ejecutar(original, salida) {
            const { width, height } = await sharp(original).metadata();
            await sharp(original)
                .rotate(5, { background: { r: 255, g: 255, b: 255 } })
                .extract({ left: 100, top: 100, width: Math.floor(width*0.7), height: Math.floor(height*0.7) })
                .jpeg({ quality: 90 })
                .toFile(salida);
        }
    },
    {
        id: 'V17_04',
        nombre: '💀 CAOS (Giro+Deform+JPG) (Virgen)',
        categoria: 'caos',
        async ejecutar(original, salida) {
            const { width, height } = await sharp(original).metadata();
            await sharp(original)
                .rotate(15, { background: { r: 255, g: 255, b: 255 } })
                .resize(Math.floor(width * 0.9), Math.floor(height * 0.75), { fit: 'fill' })
                .jpeg({ quality: 50 })
                .toFile(salida);
        }
    },
    {
        id: 'V18_02',
        nombre: '🔍 Sharpen + JPG 60 (Virgen)',
        categoria: 'filtros',
        async ejecutar(original, salida) {
            await sharp(original)
                .sharpen()
                .jpeg({ quality: 60 })
                .toFile(salida);
        }
    }
];

// ============================================================================
// MAIN
// ============================================================================

async function ejecutarTestCero() {
    console.log('\n============================================================');
    console.log('🐉 DRAGON3 - TEST 0 (VERIFICACIÓN NEGATIVA BASAL)');
    console.log('============================================================\n');

    crearDirectorio(DIRECTORIO_SALIDA);

    const resultados = [];
    let falsosPositivosTotales = 0;

    console.log(`[FASE 1] 📸 Preparando imagen original: ${IMAGEN_ORIGINAL}`);
    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.error(`❌ ERROR: No se encuentra ${IMAGEN_ORIGINAL}`);
        return;
    }

    console.log('\n[FASE 2] ⚔️ Ejecutando Batería de Pruebas sobre imagen SIN SELLAR...\n');

    for (const escenario of ESCENARIOS) {
        const rutaSalida = path.join(DIRECTORIO_SALIDA, `${escenario.id}_VIRGEN.jpg`);
        process.stdout.write(`   [${escenario.id}] ${escenario.nombre}... `);

        try {
            await escenario.ejecutar(MASTER_VIRGEN, rutaSalida);

            // ANALIZAR LA IMAGEN QUE NO TIENE SELLO
            const resultado = await analizadorImagenMBH_v15(rutaSalida);
            const ev = resultado.response.evidencia_visual;

            // Aquí el éxito es que NO detecte nada (ev.Hits_Totales === 0)
            const esFalsoPositivo = ev.Hits_Totales > 0;

            if (esFalsoPositivo) falsosPositivosTotales++;

            resultados.push({
                id: escenario.id,
                nombre: escenario.nombre,
                hits: ev.Hits_Totales,
                confianza: (ev.Mejor_Confianza * 100).toFixed(1),
                resultado: esFalsoPositivo ? '❌ FALSO POSITIVO' : '✅ LIMPIO'
            });

            console.log(esFalsoPositivo ? `❌ ALERTA (${ev.Hits_Totales} HITS!)` : '✅ LIMPIO');

        } catch (error) {
            console.log(`❌ ERROR TÉCNICO: ${error.message}`);
        }
    }

    // --- RESUMEN ---
    console.log('\n============================================================');
    console.log('📊 RESUMEN DE SEGURIDAD (TEST 0)');
    console.log('============================================================');
    console.table(resultados);

    if (falsosPositivosTotales === 0) {
        console.log('\n🔥 EXCELENTE: El analizador es 100% inmune al ruido de esta imagen.');
        console.log('Todos los hits detectados en tests reales serán SEÑAL REAL.');
    } else {
        console.log(`\n⚠️ CRÍTICO: Se han detectado ${falsosPositivosTotales} falsos positivos.`);
        console.log('El ruido natural de la imagen está imitando la espiral de Fibonacci.');
    }
    console.log('============================================================\n');
}

ejecutarTestCero().catch(console.error);
