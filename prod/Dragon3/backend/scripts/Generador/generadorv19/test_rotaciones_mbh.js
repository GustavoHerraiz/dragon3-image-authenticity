// test_diagnostico_rotacion.js
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v19 } from './analizadorMBH_v19.js';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDiagnosticoRotacion() {
    console.log('🔍 TEST DIAGNÓSTICO - PROBLEMA ROTACIÓN 90°');
    console.log('='.repeat(60));

    // 1. CREAR IMAGEN PEQUEÑA DE PRUEBA
    const imagenPrueba = path.join(__dirname, 'diag_prueba.jpg');
    console.log('\n📐 Creando imagen de diagnóstico pequeña (800x600px)...');

    // Imagen sintética con patrón simple
    await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 100, g: 150, b: 200 }
        }
    })
    .jpeg({ quality: 95 })
    .toFile(imagenPrueba);

    console.log('✅ Imagen de diagnóstico creada');

    // 2. APLICAR SELLO
    const pngSellado = path.join(__dirname, 'diag_sellado.png');
    const jpgSinAlfa = path.join(__dirname, 'diag_jpg.jpg');

    console.log('\n🔐 Aplicando sello V18 (hash: d760)...');
    const generador = new GeneradorMBH_v18();
    await generador.sellarImagen(
        imagenPrueba,
        pngSellado,
        { hash_suffix: 'd760', cliente: 'Test' }
    );

    // 3. CONVERTIR A JPG (SIN ALFA)
    console.log('\n🔄 Convirtiendo a JPG (sin canal alfa)...');
    await sharp(pngSellado)
        .removeAlpha()
        .jpeg({ quality: 100 })
        .toFile(jpgSinAlfa);

    // 4. ANALIZAR Y VER OFFSETS
    console.log('\n📊 Analizando para ver offsets y cálculo de rotación...');

    try {
        const resultado = await analizadorImagenMBH_v19(jpgSinAlfa);

        console.log('\n🔬 DIAGNÓSTICO DETALLADO:');
        console.log('='.repeat(60));

        if (resultado.response.exito) {
            const ev = resultado.response.evidencia_visual || {};

            console.log(`✅ DETECCIÓN: ${ev.Metodo || 'N/A'}`);
            console.log(`🔢 HASH: ${ev.ADN_Detectado || 'N/A'}`);
            console.log(`📈 CONFIANZA: ${ev.Mejor_Confianza?.toFixed(1) || 0}%`);
            console.log(`📐 ROTACIÓN REPORTADA: ${resultado.response.rotacion_detectada || 'N/A'}`);

            // MOSTRAR TOP CANDIDATOS (PARA VER OFFSETS)
            if (ev.Top_Candidatos && ev.Top_Candidatos.length > 0) {
                console.log('\n📍 TOP OFFSETS DETECTADOS:');
                console.log('Index | offX | offY | Hash  | Confianza | Votos  ');
                console.log('------|------|------|-------|-----------|--------');

                ev.Top_Candidatos.slice(0, 10).forEach((cand, idx) => {
                    console.log(
                        `${(idx + 1).toString().padStart(5)} | ` +
                        `${cand.offX.toString().padStart(4)} | ` +
                        `${cand.offY.toString().padStart(4)} | ` +
                        `${(cand.hash || 'N/A').padStart(5)} | ` +
                        `${cand.confianza?.toFixed(1).padStart(8)}% | ` +
                        `${cand.votos?.toString().padStart(6)}`
                    );

                    // CALCULAR ROTACIÓN PARA ESTE OFFSET
                    if (cand.offX !== undefined && cand.offY !== undefined) {
                        const anguloRad = Math.atan2(cand.offY - 3.5, cand.offX - 3.5) - Math.atan2(4 - 3.5, 3 - 3.5);
                        let grados = anguloRad * (180 / Math.PI);
                        if (grados < 0) grados += 360;

                        console.log(`      → Cálculo rotación para offset (${cand.offX},${cand.offY}): ${grados.toFixed(2)}°`);
                    }
                });

                // CÁLCULO DETALLADO PARA EL MEJOR OFFSET
                const mejor = ev.Top_Candidatos[0];
                if (mejor.offX !== undefined && mejor.offY !== undefined) {
                    console.log('\n🧮 CÁLCULO DETALLADO DE ROTACIÓN:');
                    console.log(`Mejor offset: (${mejor.offX}, ${mejor.offY})`);

                    const atan2_actual = Math.atan2(mejor.offY - 3.5, mejor.offX - 3.5);
                    const atan2_everest = Math.atan2(4 - 3.5, 3 - 3.5);
                    const anguloRad = atan2_actual - atan2_everest;
                    let grados = anguloRad * (180 / Math.PI);
                    if (grados < 0) grados += 360;

                    console.log(`atan2(actual) = atan2(${mejor.offY - 3.5}, ${mejor.offX - 3.5}) = ${atan2_actual.toFixed(4)} rad`);
                    console.log(`atan2(everest) = atan2(${4 - 3.5}, ${3 - 3.5}) = ${atan2_everest.toFixed(4)} rad`);
                    console.log(`Diferencia: ${anguloRad.toFixed(4)} rad = ${grados.toFixed(2)}°`);

                    console.log('\n🎯 PUNTOS DE REFERENCIA:');
                    console.log(`- Pivote central: (3.5, 3.5)`);
                    console.log(`- Punto "Everest": (3, 4)`);
                    console.log(`- Offset detectado: (${mejor.offX}, ${mejor.offY})`);
                }
            }

            // VERIFICAR SI EL CÁLCULO DE ROTACIÓN ES CORRECTO
            const rotacionReportada = resultado.response.rotacion_detectada;
            if (rotacionReportada) {
                const valor = parseFloat(rotacionReportada.replace('°', ''));

                console.log('\n📐 ANÁLISIS DE ROTACIÓN REPORTADA:');
                console.log(`Rotación reportada: ${valor.toFixed(2)}°`);

                if (Math.abs(valor - 0) < 5) {
                    console.log('✅ ROTACIÓN CORRECTA: Cerca de 0° (imagen no rotada)');
                } else if (Math.abs(valor - 90) < 5) {
                    console.log('❌ PROBLEMA: Reporta ~90° pero imagen NO está rotada');
                    console.log('   Posibles causas:');
                    console.log('   1. Offset dominante en posición que da 90°');
                    console.log('   2. Cálculo de atan2 con signos invertidos');
                    console.log('   3. Punto "Everest" (3,4) incorrecto para referencia 0°');
                } else {
                    console.log(`⚠️  ROTACIÓN INESPERADA: ${valor.toFixed(2)}° (debería ser ~0°)`);
                }
            }
        } else {
            console.log('❌ NO SE DETECTÓ EL SELLO');
        }

    } catch (error) {
        console.error(`❌ ERROR EN ANÁLISIS: ${error.message}`);
    }

    // 5. PRUEBA CON IMAGEN ROTADA 90° REAL
    console.log('\n🌀 PRUEBA COMPARATIVA: Creando imagen rotada 90° REAL...');

    const jpgRotado90 = path.join(__dirname, 'diag_rotado90.jpg');
    await sharp(jpgSinAlfa)
        .rotate(90, { background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 100 })
        .toFile(jpgRotado90);

    console.log('✅ Imagen rotada 90° real creada');
    console.log('🔍 Analizando imagen rotada 90° real...');

    try {
        const resultadoRotado = await analizadorImagenMBH_v19(jpgRotado90);

        if (resultadoRotado.response.exito) {
            const rotReal = resultadoRotado.response.rotacion_detectada;
            console.log(`📐 ROTACIÓN DETECTADA en imagen 90° real: ${rotReal || 'N/A'}`);

            if (rotReal) {
                const valor = parseFloat(rotReal.replace('°', ''));
                console.log(`⚖️  Diferencia vs 90° real: ${Math.abs(valor - 90).toFixed(2)}°`);
            }
        }

        await fs.unlink(jpgRotado90);
    } catch (error) {
        console.log(`❌ Error analizando imagen rotada: ${error.message}`);
    }

    // 6. LIMPIAR
    console.log('\n🧹 Limpiando archivos de diagnóstico...');
    const archivos = [imagenPrueba, pngSellado, jpgSinAlfa];
    for (const archivo of archivos) {
        try {
            await fs.unlink(archivo);
            console.log(`   Eliminado: ${path.basename(archivo)}`);
        } catch (error) {
            // Ignorar
        }
    }

    console.log('\n🏁 DIAGNÓSTICO COMPLETADO');
    console.log('='.repeat(60));
}

// Ejecutar
testDiagnosticoRotacion().catch(console.error);
