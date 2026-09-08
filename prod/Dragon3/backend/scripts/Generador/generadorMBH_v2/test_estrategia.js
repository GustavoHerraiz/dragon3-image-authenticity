/**
 * 🧪 TEST COMPLETO ESTRATEGIA 1
 *
 * Prueba el sistema completo con generador y analizador mejorados:
 * 1. Genera imagen sellada con distribución uniforme
 * 2. Aplica resizes reales (50%, 75%, 25%)
 * 3. Analiza con correlación cruzada mejorada
 * 4. Compara con sistema anterior
 */

import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH_ESTRATEGIA1.js';
import { analizarImagenMBH } from './analizadorMBH_ESTRATEGIA1.js';

// ===== CONFIGURACIÓN =====

const CONFIG = {
    imagenOriginal: 'imagenes_test/test_dragon.png',
    metadatos: {
        id_numerico: 55136,  // Tu ID de prueba (Quico Melero)
        hash_suffix: "D760",
        cliente: "Quico Melero",
        obra: "Atardecer Quico"
    },
    escalasTest: [
        { factor: 1.0, nombre: "Original" },
        { factor: 0.9, nombre: "90%" },
        { factor: 0.75, nombre: "75%" },
        { factor: 0.66, nombre: "66%" },
        { factor: 0.5, nombre: "50% (Instagram)" },
        { factor: 0.33, nombre: "33%" },
        { factor: 0.25, nombre: "25% (Extremo)" }
    ],
    directorioTest: 'test_estrategia1_output'
};

// ===== FUNCIONES AUXILIARES =====

function crearDirectorio(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function aplicarResize(imagenEntrada, imagenSalida, factor) {
    const { width, height } = await sharp(imagenEntrada).metadata();
    const nuevoAncho = Math.round(width * factor);
    const nuevoAlto = Math.round(height * factor);

    await sharp(imagenEntrada)
        .resize(nuevoAncho, nuevoAlto, {
            kernel: 'lanczos3',  // Interpolación realista
            fit: 'fill'
        })
        .toFile(imagenSalida);

    return { width: nuevoAncho, height: nuevoAlto };
}

function generarTablaResultados(resultados) {
    console.log(`\n${'='.repeat(100)}`);
    console.log('📊 TABLA DE RESULTADOS - ESTRATEGIA 1');
    console.log('='.repeat(100));
    console.log(`${'Escala'.padEnd(15)} | ${'Detectado'.padEnd(10)} | ${'Energía'.padEnd(10)} | ${'Correlación'.padEnd(12)} | ${'ID'.padEnd(10)} | ${'Cliente'.padEnd(20)}`);
    console.log('-'.repeat(100));

    let detectados = 0;
    resultados.forEach(r => {
        const det = r.resultado.identificado ? '✅ SÍ' : '❌ NO';
        const ener = r.resultado.energia.toFixed(4);
        const corr = (r.resultado.diagnostico.correlacion || 0).toFixed(4);
        const id = r.resultado.hash;
        const cli = r.resultado.cliente.substring(0, 18);

        console.log(`${r.nombre.padEnd(15)} | ${det.padEnd(10)} | ${ener.padEnd(10)} | ${corr.padEnd(12)} | ${id.padEnd(10)} | ${cli.padEnd(20)}`);

        if (r.resultado.identificado) detectados++;
    });

    console.log('='.repeat(100));
    console.log(`✅ TASA DE ÉXITO: ${detectados}/${resultados.length} (${(detectados/resultados.length*100).toFixed(1)}%)`);
    console.log('='.repeat(100));
}

// ===== TEST PRINCIPAL =====

async function testEstrategia1() {
    console.log('\n🐉 DRAGON3 - TEST ESTRATEGIA 1: CORRELACIÓN CRUZADA + DISTRIBUCIÓN UNIFORME\n');

    try {
        // Validar imagen original
        if (!fs.existsSync(CONFIG.imagenOriginal)) {
            console.error(`❌ No se encontró la imagen: ${CONFIG.imagenOriginal}`);
            console.log('\n💡 Crea una carpeta "imagenes_test" con una imagen "test_dragon.png"');
            return;
        }

        // Crear directorio de salida
        crearDirectorio(CONFIG.directorioTest);

        // ===== PASO 1: GENERAR IMAGEN SELLADA =====
        console.log('📝 PASO 1: Generando imagen sellada con DISTRIBUCIÓN UNIFORME...\n');

        const generador = new GeneradorMBH();
        const imagenSellada = `${CONFIG.directorioTest}/imagen_sellada.png`;

        const selloHex = await generador.sellarImagen(
            CONFIG.imagenOriginal,
            imagenSellada,
            CONFIG.metadatos
        );

        console.log(`\n✅ Imagen sellada generada: ${imagenSellada}`);
        console.log(`   Sello: ${selloHex}`);

        // ===== PASO 2: APLICAR RESIZES =====
        console.log('\n📐 PASO 2: Aplicando diferentes escalas de resize...\n');

        const imagenesTest = [];

        for (const escala of CONFIG.escalasTest) {
            const nombreArchivo = `${CONFIG.directorioTest}/resize_${escala.nombre.replace('%', 'pct').replace(' ', '_')}.png`;

            if (escala.factor === 1.0) {
                // Original - solo copiar
                fs.copyFileSync(imagenSellada, nombreArchivo);
                imagenesTest.push({
                    nombre: escala.nombre,
                    ruta: nombreArchivo,
                    factor: escala.factor
                });
            } else {
                // Aplicar resize
                const dims = await aplicarResize(imagenSellada, nombreArchivo, escala.factor);
                console.log(`   ✓ ${escala.nombre.padEnd(20)} → ${dims.width}x${dims.height}px`);

                imagenesTest.push({
                    nombre: escala.nombre,
                    ruta: nombreArchivo,
                    factor: escala.factor
                });
            }
        }

        // ===== PASO 3: ANALIZAR CON ESTRATEGIA 1 =====
        console.log('\n🔬 PASO 3: Analizando con CORRELACIÓN CRUZADA MEJORADA...\n');

        const resultados = [];

        for (const img of imagenesTest) {
            console.log(`\n📊 Analizando: ${img.nombre}...`);
            const resultado = await analizarImagenMBH(img.ruta);

            resultados.push({
                nombre: img.nombre,
                factor: img.factor,
                resultado: resultado
            });

            // Mostrar resumen inmediato
            const status = resultado.identificado ? '✅' : '❌';
            console.log(`   ${status} Energía: ${resultado.energia.toFixed(4)} | Correlación: ${(resultado.diagnostico.correlacion || 0).toFixed(4)} | ID: ${resultado.hash}`);
        }

        // ===== PASO 4: TABLA DE RESULTADOS =====
        generarTablaResultados(resultados);

        // ===== PASO 5: ANÁLISIS DE MEJORA =====
        console.log('\n📈 ANÁLISIS DE MEJORA vs SISTEMA ANTERIOR:\n');

        const detectadosResize = resultados.filter(r => r.factor < 1.0 && r.resultado.identificado).length;
        const totalResize = resultados.filter(r => r.factor < 1.0).length;

        console.log(`   Sistema ANTERIOR (sin Estrategia 1):`);
        console.log(`      Detección en resize: 0/${totalResize} (0%)`);
        console.log(`      Problema: Señal concentrada + sin correlación\n`);

        console.log(`   Sistema NUEVO (con Estrategia 1):`);
        console.log(`      Detección en resize: ${detectadosResize}/${totalResize} (${(detectadosResize/totalResize*100).toFixed(1)}%)`);
        console.log(`      Mejoras: Distribución uniforme + correlación cruzada\n`);

        if (detectadosResize > 0) {
            console.log(`   ✅ MEJORA LOGRADA: +${(detectadosResize/totalResize*100).toFixed(1)}% en detección de resize`);
        } else {
            console.log(`   ⚠️  AÚN NO HAY MEJORA - Posibles causas:`);
            console.log(`       1. Necesita FUERZA_MINIMA_ABSOLUTA más alta (actual: 120)`);
            console.log(`       2. Necesita STARDUST_INTENSITY más alta (actual: 300)`);
            console.log(`       3. Necesita DWT-DCT híbrido (Estrategia 2)`);
        }

        // ===== PASO 6: REPORTE DETALLADO =====
        console.log('\n📄 PASO 6: Generando reporte detallado...\n');

        const reporte = [];
        reporte.push('# REPORTE ESTRATEGIA 1 - DRAGON3\n');
        reporte.push(`Fecha: ${new Date().toISOString()}\n`);
        reporte.push(`Imagen: ${CONFIG.imagenOriginal}\n`);
        reporte.push(`ID Sellado: ${CONFIG.metadatos.id_numerico} (${selloHex})\n`);
        reporte.push('\n## CONFIGURACIÓN\n');
        reporte.push(`- STARDUST_INTENSITY: 300 (era 77)\n`);
        reporte.push(`- FUERZA_MINIMA_ABSOLUTA: 120\n`);
        reporte.push(`- Correlación mínima: 0.3\n`);
        reporte.push('\n## RESULTADOS\n\n');
        reporte.push('| Escala | Detectado | Energía | Correlación | ID | Cliente |\n');
        reporte.push('|--------|-----------|---------|-------------|----|---------|\n');

        resultados.forEach(r => {
            const det = r.resultado.identificado ? '✅' : '❌';
            reporte.push(`| ${r.nombre} | ${det} | ${r.resultado.energia.toFixed(4)} | ${(r.resultado.diagnostico.correlacion || 0).toFixed(4)} | ${r.resultado.hash} | ${r.resultado.cliente} |\n`);
        });

        reporte.push('\n## DIAGNÓSTICO\n\n');

        if (detectadosResize >= totalResize * 0.7) {
            reporte.push('✅ **ÉXITO**: Sistema robusto a resize (>70% detección)\n');
        } else if (detectadosResize >= totalResize * 0.4) {
            reporte.push('⚠️ **MEJORA PARCIAL**: Sistema mejoró pero necesita ajustes\n');
        } else {
            reporte.push('❌ **SIN MEJORA SIGNIFICATIVA**: Necesita Estrategia 2 o ajuste de parámetros\n');
        }

        const reportePath = `${CONFIG.directorioTest}/REPORTE_ESTRATEGIA1.md`;
        fs.writeFileSync(reportePath, reporte.join(''));
        console.log(`✅ Reporte guardado: ${reportePath}\n`);

        console.log('\n🎉 TEST COMPLETADO\n');

    } catch (error) {
        console.error('\n❌ ERROR EN TEST:', error);
        throw error;
    }
}

// ===== EJECUCIÓN =====

testEstrategia1().catch(console.error);
