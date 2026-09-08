// paralelizacion/test_analizador.js
// 🧪 PRUEBA COMPLETA DEL ANALIZADOR V5 20 BITS
//    - Verificación sobre imagen de referencia
//    - Pruebas de compresión JPEG desde calidad 100 hasta 5 (buscando el límite)

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';
import { analizarImagenMBH_20bits } from '../src/backend/analizador_v5_20bits.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testAnalizadorCompleto() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 PRUEBA COMPLETA DEL ANALIZADOR V5 20 BITS');
    console.log('   🔍 Verificación + pruebas de compresión (100 → 5) buscando el límite');
    console.log('='.repeat(70) + '\n');

    // Buscar la imagen de referencia en test_imagenes/
    const TEST_IMAGES_DIR = path.join(__dirname, '..', 'test_imagenes');
    if (!fs.existsSync(TEST_IMAGES_DIR)) {
        console.error('❌ No existe la carpeta test_imagenes. Ejecuta primero el test de compresión.');
        return;
    }

    const archivos = fs.readdirSync(TEST_IMAGES_DIR).filter(f => f.startsWith('referencia_') && f.endsWith('.png'));
    if (archivos.length === 0) {
        console.error('❌ No se encontró ninguna imagen de referencia.');
        return;
    }

    // Tomar la más reciente
    const stats = archivos.map(f => ({ name: f, mtime: fs.statSync(path.join(TEST_IMAGES_DIR, f)).mtime }));
    stats.sort((a, b) => b.mtime - a.mtime);
    const imagenRef = path.join(TEST_IMAGES_DIR, stats[0].name);
    console.log(`📁 Usando imagen de referencia: ${stats[0].name}`);

    // ================================================================
    // PASO 1: Verificar que el analizador detecta la imagen de referencia
    // ================================================================
    console.log('\n🔍 PASO 1: Verificando analizador sobre la imagen de referencia...');
    const resultadoRef = await analizarImagenMBH_20bits(imagenRef, null, 60000);

    console.log('\n📊 RESULTADO DE VERIFICACIÓN:');
    if (resultadoRef.identificado) {
        console.log(`✅ IDENTIFICADO: ${resultadoRef.hash}`);
        console.log(`   Cliente: ${resultadoRef.cliente}`);
        console.log(`   Obra: ${resultadoRef.obra}`);
        console.log(`   Método: ${resultadoRef.metodo}`);
        console.log(`   Escala: ${resultadoRef.escala}, Modo: ${resultadoRef.modo}, Rot: ${resultadoRef.rot}`);
        console.log(`   Verificado: ${resultadoRef.veredicto}`);
    } else {
        console.log('❌ No identificado');
        if (resultadoRef.error) console.log(`   Error: ${resultadoRef.error}`);
        return;
    }

    // ================================================================
    // PASO 2: Pruebas de compresión JPEG con calidades extendidas (100 → 5)
    // ================================================================
    console.log('\n' + '='.repeat(70));
    console.log('📊 PASO 2: PRUEBA DE COMPRESIÓN JPEG (100 → 5) BUSCANDO EL LÍMITE');
    console.log('='.repeat(70) + '\n');

    const OUTPUT_DIR = path.join(__dirname, '..', 'test_compresiones_analizador');
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Calidades: 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5
    const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5];
    const resultados = [];

    console.log('| Calidad | Tamaño (KB) | Detección | Hash | Método | Tiempo(ms) |');
    console.log('|---------|-------------|-----------|------|--------|------------|');

    for (const calidad of calidades) {
        const nombreSalida = `compresion_q${calidad}.jpg`;
        const rutaSalida = path.join(OUTPUT_DIR, nombreSalida);

        try {
            // Comprimir solo si no existe (para ahorrar tiempo en futuras ejecuciones)
            if (!fs.existsSync(rutaSalida)) {
                await sharp(imagenRef)
                    .jpeg({ quality: calidad, chromaSubsampling: '4:2:0' })
                    .toFile(rutaSalida);
            }

            const stats = fs.statSync(rutaSalida);
            const tamañoKB = (stats.size / 1024).toFixed(1);

            const resultado = await analizarImagenMBH_20bits(rutaSalida, null, 60000);
            const ok = resultado.identificado ? '✅' : '❌';
            const hash = resultado.identificado ? resultado.hash : '-';
            const metodo = resultado.identificado ? resultado.metodo : '-';
            const tiempo = resultado.identificado ? resultado.tiempo_ms || '-' : '-';

            console.log(`| ${String(calidad).padEnd(7)} | ${String(tamañoKB).padEnd(11)} | ${ok.padEnd(9)} | ${hash.padEnd(4)} | ${metodo.padEnd(6)} | ${String(tiempo).padEnd(10)} |`);

            resultados.push({
                calidad,
                tamañoKB: parseFloat(tamañoKB),
                detectado: resultado.identificado,
                hash: resultado.hash || null,
                metodo: resultado.metodo || null,
                tiempo: resultado.tiempo_ms || 0
            });

        } catch (err) {
            console.log(`| ${calidad} | ERROR | ❌ | - | - | - |`);
        }
    }

    const detectados = resultados.filter(r => r.detectado).length;
    const total = resultados.length;
    console.log('\n📌 RESUMEN DE COMPRESIÓN:');
    console.log(`   ✅ Detectado en ${detectados}/${total} calidades (${(detectados/total*100).toFixed(0)}%)`);

    // Encontrar la calidad más baja donde se detecta
    const detectadosList = resultados.filter(r => r.detectado);
    if (detectadosList.length > 0) {
        const ultima = detectadosList.reduce((min, r) => r.calidad < min.calidad ? r : min);
        console.log(`   🔥 Calidad más baja detectada: ${ultima.calidad} (${ultima.tamañoKB} KB)`);
        const tiempos = detectadosList.map(r => r.tiempo);
        const avgTime = Math.round(tiempos.reduce((a,b) => a+b, 0) / tiempos.length);
        console.log(`   ⏱️ Tiempo medio de detección: ${avgTime}ms`);
    }

    const fallos = resultados.filter(r => !r.detectado);
    if (fallos.length > 0) {
        console.log(`   ❌ Fallos en calidades: ${fallos.map(r => r.calidad).join(', ')}`);
    } else {
        console.log('   🎉 ¡No hubo fallos! El analizador detecta en todas las calidades probadas.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ PRUEBA COMPLETADA');
    console.log('='.repeat(70));
}

testAnalizadorCompleto().catch(console.error);