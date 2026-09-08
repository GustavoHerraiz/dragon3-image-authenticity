/**
 * 🧪 TEST REED-SOLOMON COMPLETO
 *
 * Prueba el sistema DWT-DCT + Reed-Solomon
 * RS puede corregir hasta 3 bits erróneos
 */

import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH_RS.js';
import { analizarImagenMBH } from './analizadorMBH_RS.js';

const CONFIG = {
    imagenOriginal: 'imagenes_test/test_dragon.png',
    directorioOutput: 'test_rs_output',

    metadatos: {
        id_numerico: 55136,  // Se truncará a 20 bits = 55136 & 1048575 = 55136 ✅
        hash_suffix: "D760",
        cliente: "Quico Melero",
        obra: "Test Reed-Solomon"
    },

    escalasTest: [
        { factor: 1.0, nombre: "Original" },
        { factor: 0.9, nombre: "90%" },
        { factor: 0.75, nombre: "75%" },
        { factor: 0.66, nombre: "66%" },
        { factor: 0.5, nombre: "50% (Instagram)" },
        { factor: 0.33, nombre: "33%" },
        { factor: 0.25, nombre: "25% (Extremo)" }
    ]
};

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
            kernel: 'lanczos3',
            fit: 'fill'
        })
        .toFile(imagenSalida);

    return { width: nuevoAncho, height: nuevoAlto };
}

async function testReedSolomon() {
    console.log('\n🐉 DRAGON3 - TEST REED-SOLOMON: CORRECCIÓN DE ERRORES\n');

    try {
        if (!fs.existsSync(CONFIG.imagenOriginal)) {
            console.error(`❌ No se encontró: ${CONFIG.imagenOriginal}`);
            return;
        }

        crearDirectorio(CONFIG.directorioOutput);

        // ===== PASO 1: GENERAR CON REED-SOLOMON =====
        console.log('📝 PASO 1: Generando imagen sellada con DWT-DCT + REED-SOLOMON...\n');

        const imagenSellada = `${CONFIG.directorioOutput}/imagen_sellada_rs.png`;

        const generador = new GeneradorMBH();
        const selloHex = await generador.sellarImagen(
            CONFIG.imagenOriginal,
            imagenSellada,
            CONFIG.metadatos
        );

        console.log(`\n✅ Imagen sellada: ${imagenSellada}`);
        console.log(`   Sello RS: ${selloHex}`);

        // Calcular ID esperado (20 bits)
        const IDEsperado = (CONFIG.metadatos.id_numerico & 0xFFFFF).toString(16).toUpperCase().padStart(5, '0');
        console.log(`   ID esperado (20 bits): ${IDEsperado}\n`);

        // ===== PASO 2: APLICAR RESIZES =====
        console.log('📐 PASO 2: Aplicando diferentes escalas de resize...\n');

        const imagenesTest = [];

        for (const escala of CONFIG.escalasTest) {
            const nombreArchivo = `${CONFIG.directorioOutput}/${escala.nombre.replace('%', 'pct').replace(' ', '_').replace('(', '').replace(')', '')}.png`;

            if (escala.factor === 1.0) {
                fs.copyFileSync(imagenSellada, nombreArchivo);
                console.log(`   ✓ ${escala.nombre.padEnd(20)} → Original copiado`);
            } else {
                const dims = await aplicarResize(imagenSellada, nombreArchivo, escala.factor);
                console.log(`   ✓ ${escala.nombre.padEnd(20)} → ${dims.width}x${dims.height}px`);
            }

            imagenesTest.push({
                nombre: escala.nombre,
                ruta: nombreArchivo,
                factor: escala.factor
            });
        }

        // ===== PASO 3: ANALIZAR CON REED-SOLOMON =====
        console.log('\n🔬 PASO 3: Analizando con REED-SOLOMON (corrige hasta 3 errores)...\n');

        const resultados = [];

        for (const img of imagenesTest) {
            console.log(`📊 Analizando: ${img.nombre}...`);

            const resultado = await analizarImagenMBH(img.ruta);

            resultados.push({
                nombre: img.nombre,
                factor: img.factor,
                resultado: resultado
            });

            const status = resultado.hash === IDEsperado ? '✅' : '❌';
            const energia = resultado.energia.toFixed(4);
            const corr = (resultado.diagnostico.correlacion || 0).toFixed(4);
            const errores = resultado.diagnostico.erroresCorregidos || 0;

            console.log(`   ${status} Energía: ${energia} | Correlación: ${corr} | ID: ${resultado.hash} | Errores corregidos: ${errores}\n`);
        }

        // ===== PASO 4: TABLA FINAL =====
        console.log('='.repeat(110));
        console.log('📊 TABLA DE RESULTADOS - REED-SOLOMON');
        console.log('='.repeat(110));
        console.log(`${'Escala'.padEnd(20)} | ${'ID Correcto'.padEnd(12)} | ${'Energía'.padEnd(10)} | ${'Correlación'.padEnd(12)} | ${'ID'.padEnd(8)} | ${'Errores'}`);
        console.log('-'.repeat(110));

        let detectadosConIDCorrecto = 0;
        let detectadosTotal = 0;

        resultados.forEach(r => {
            const idCorrecto = r.resultado.hash === IDEsperado ? '✅ SÍ' : '❌ NO';
            const ener = r.resultado.energia.toFixed(4);
            const corr = (r.resultado.diagnostico.correlacion || 0).toFixed(4);
            const id = r.resultado.hash;
            const errores = r.resultado.diagnostico.erroresCorregidos || 0;

            console.log(`${r.nombre.padEnd(20)} | ${idCorrecto.padEnd(12)} | ${ener.padEnd(10)} | ${corr.padEnd(12)} | ${id.padEnd(8)} | ${errores}`);

            if (r.resultado.identificado) detectadosTotal++;
            if (r.resultado.hash === IDEsperado) detectadosConIDCorrecto++;
        });

        console.log('='.repeat(110));

        const totalResize = resultados.filter(r => r.factor < 1.0).length;
        const resizeCorrectos = resultados.filter(r => r.factor < 1.0 && r.resultado.hash === IDEsperado).length;

        const tasaTotal = (detectadosConIDCorrecto / resultados.length * 100).toFixed(1);
        const tasaResize = totalResize > 0 ? (resizeCorrectos / totalResize * 100).toFixed(1) : 0;

        console.log(`\n📈 MÉTRICAS REED-SOLOMON:`);
        console.log(`   IDs correctos (total): ${detectadosConIDCorrecto}/${resultados.length} (${tasaTotal}%)`);
        console.log(`   IDs correctos (resize): ${resizeCorrectos}/${totalResize} (${tasaResize}%)`);

        // ===== DIAGNÓSTICO =====
        console.log(`\n💡 DIAGNÓSTICO FINAL:\n`);

        if (tasaResize >= 80) {
            console.log(`   🎉 EXCELENTE: Reed-Solomon funciona perfectamente (${tasaResize}% ≥ 80%)`);
            console.log(`      → Sistema ROBUSTO A RESIZE conseguido`);
            console.log(`      → La corrección de errores funciona`);
        } else if (tasaResize >= 50) {
            console.log(`   ✅ ÉXITO: Reed-Solomon funciona bien (${tasaResize}% ≥ 50%)`);
            console.log(`      → Mejora SIGNIFICATIVA vs sistemas anteriores`);
            console.log(`      → Algunos errores exceden capacidad de RS (>3 bits)`);
        } else if (tasaResize >= 20) {
            console.log(`   ⚠️  MEJORA PARCIAL: RS ayuda pero insuficiente (${tasaResize}%)`);
            console.log(`      → Interpolación corrompe >3 bits por payload`);
            console.log(`      → Considerar RS más fuerte o reducir más IDs`);
        } else {
            console.log(`   ❌ FALLO: RS no puede corregir tantos errores`);
            console.log(`      → Interpolación muy agresiva (>6 bits corruptos)`);
            console.log(`      → No hay solución técnica viable`);
        }

        // ===== COMPARATIVA COMPLETA =====
        console.log(`\n📊 COMPARATIVA DE TODAS LAS ESTRATEGIAS:\n`);
        console.log(`   DCT DIRECTO (Estrategia 1):`);
        console.log(`      → Detección técnica: 100%`);
        console.log(`      → IDs correctos resize: 0%`);
        console.log(`      → Conclusión: Patrón sobrevive, bits NO`);
        console.log(`\n   DWT-DCT (Estrategia 2):`);
        console.log(`      → Detección técnica: 100%`);
        console.log(`      → IDs correctos resize: 0%`);
        console.log(`      → Conclusión: LL subband no suficiente`);
        console.log(`\n   REED-SOLOMON (Estrategia 3):`);
        console.log(`      → Detección técnica: ${(detectadosTotal/resultados.length*100).toFixed(1)}%`);
        console.log(`      → IDs correctos resize: ${tasaResize}%`);
        console.log(`      → Conclusión: ${tasaResize >= 50 ? 'SOLUCIÓN ENCONTRADA ✅' : 'Mejora insuficiente ❌'}`);

        console.log(`\n   🎯 Mejora vs DCT directo: +${tasaResize} puntos porcentuales\n`);

        // ===== ANÁLISIS DE ERRORES =====
        console.log(`📉 ANÁLISIS DE ERRORES CORREGIDOS:\n`);
        resultados.forEach(r => {
            const errores = r.resultado.diagnostico.erroresCorregidos || 0;
            if (errores > 0) {
                console.log(`   ${r.nombre.padEnd(20)}: ${errores} bytes corregidos`);
            }
        });

        console.log('\n✅ TEST COMPLETADO\n');
        console.log(`📁 Archivos generados en: ${CONFIG.directorioOutput}/\n`);

    } catch (error) {
        console.error('\n❌ ERROR EN TEST:', error);
        throw error;
    }
}

testReedSolomon().catch(console.error);
