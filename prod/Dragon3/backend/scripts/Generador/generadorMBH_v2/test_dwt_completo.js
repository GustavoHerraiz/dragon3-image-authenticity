/**
 * 🧪 TEST DWT-DCT COMPLETO
 *
 * Prueba el sistema DWT-DCT resistente a resize
 */

import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH_DWT.js';
import { analizarImagenMBH } from './analizadorMBH_DWT.js';

const CONFIG = {
    imagenOriginal: 'imagenes_test/test_dragon.png',
    directorioOutput: 'test_dwt_output',

    metadatos: {
        id_numerico: 55136,
        hash_suffix: "D760",
        cliente: "Quico Melero",
        obra: "Test DWT-DCT"
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

async function testDWTDCT() {
    console.log('\n🐉 DRAGON3 - TEST DWT-DCT: RESISTENCIA A RESIZE\n');

    try {
        if (!fs.existsSync(CONFIG.imagenOriginal)) {
            console.error(`❌ No se encontró: ${CONFIG.imagenOriginal}`);
            return;
        }

        crearDirectorio(CONFIG.directorioOutput);

        // ===== PASO 1: GENERAR CON DWT-DCT =====
        console.log('📝 PASO 1: Generando imagen sellada con DWT-DCT...\n');

        const imagenSellada = `${CONFIG.directorioOutput}/imagen_sellada_dwt.png`;

        const generador = new GeneradorMBH();
        const selloHex = await generador.sellarImagen(
            CONFIG.imagenOriginal,
            imagenSellada,
            CONFIG.metadatos
        );

        console.log(`\n✅ Imagen sellada: ${imagenSellada}`);
        console.log(`   Sello: ${selloHex}\n`);

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

        // ===== PASO 3: ANALIZAR CON DWT-DCT =====
        console.log('\n🔬 PASO 3: Analizando con DWT-DCT...\n');

        const resultados = [];
        const IDEsperado = '000D760';

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

            console.log(`   ${status} Energía: ${energia} | Correlación: ${corr} | ID: ${resultado.hash}\n`);
        }

        // ===== PASO 4: TABLA FINAL =====
        console.log('='.repeat(100));
        console.log('📊 TABLA DE RESULTADOS - DWT-DCT');
        console.log('='.repeat(100));
        console.log(`${'Escala'.padEnd(20)} | ${'ID Correcto'.padEnd(12)} | ${'Energía'.padEnd(10)} | ${'Correlación'.padEnd(12)} | ${'ID'.padEnd(8)}`);
        console.log('-'.repeat(100));

        let detectadosConIDCorrecto = 0;
        let detectadosTotal = 0;

        resultados.forEach(r => {
            const idCorrecto = r.resultado.hash === IDEsperado ? '✅ SÍ' : '❌ NO';
            const ener = r.resultado.energia.toFixed(4);
            const corr = (r.resultado.diagnostico.correlacion || 0).toFixed(4);
            const id = r.resultado.hash;

            console.log(`${r.nombre.padEnd(20)} | ${idCorrecto.padEnd(12)} | ${ener.padEnd(10)} | ${corr.padEnd(12)} | ${id}`);

            if (r.resultado.identificado) detectadosTotal++;
            if (r.resultado.hash === IDEsperado) detectadosConIDCorrecto++;
        });

        console.log('='.repeat(100));

        const totalResize = resultados.filter(r => r.factor < 1.0).length;
        const resizeCorrectos = resultados.filter(r => r.factor < 1.0 && r.resultado.hash === IDEsperado).length;

        const tasaTotal = (detectadosConIDCorrecto / resultados.length * 100).toFixed(1);
        const tasaResize = totalResize > 0 ? (resizeCorrectos / totalResize * 100).toFixed(1) : 0;

        console.log(`\n📈 MÉTRICAS DWT-DCT:`);
        console.log(`   IDs correctos (total): ${detectadosConIDCorrecto}/${resultados.length} (${tasaTotal}%)`);
        console.log(`   IDs correctos (resize): ${resizeCorrectos}/${totalResize} (${tasaResize}%)`);

        // ===== DIAGNÓSTICO =====
        console.log(`\n💡 DIAGNÓSTICO:\n`);

        if (tasaResize >= 80) {
            console.log(`   🎉 EXCELENTE: DWT-DCT funciona perfectamente (${tasaResize}% ≥ 80%)`);
            console.log(`      → IDs sobreviven a resize`);
        } else if (tasaResize >= 50) {
            console.log(`   ✅ BUENO: DWT-DCT mejora significativa (${tasaResize}% ≥ 50%)`);
            console.log(`      → Mucho mejor que DCT directo (0%)`);
        } else if (tasaResize >= 20) {
            console.log(`   ⚠️  MEJORA PARCIAL: Algunos IDs correctos (${tasaResize}%)`);
            console.log(`      → Ajustar intensidad o probar DWT nivel 2`);
        } else {
            console.log(`   ❌ SIN MEJORA: DWT-DCT no resuelve el problema`);
            console.log(`      → Necesita código de corrección de errores`);
        }

        // ===== COMPARATIVA =====
        console.log(`\n📊 COMPARATIVA:\n`);
        console.log(`   DCT DIRECTO (Estrategia 1):`);
        console.log(`      → Detección técnica: 100%`);
        console.log(`      → IDs correctos en resize: 0%`);
        console.log(`\n   DWT-DCT (Estrategia 2):`);
        console.log(`      → Detección técnica: ${(detectadosTotal/resultados.length*100).toFixed(1)}%`);
        console.log(`      → IDs correctos en resize: ${tasaResize}%`);
        console.log(`\n   🎯 Mejora en IDs correctos: +${tasaResize} puntos porcentuales\n`);

        console.log('✅ TEST COMPLETADO\n');
        console.log(`📁 Archivos generados en: ${CONFIG.directorioOutput}/\n`);

    } catch (error) {
        console.error('\n❌ ERROR EN TEST:', error);
        throw error;
    }
}

testDWTDCT().catch(console.error);
