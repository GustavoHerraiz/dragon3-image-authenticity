// test_verificacion_rotacion.js
import { GeneradorMBH_v18 } from './generadorMBH_v18.js';
import { analizadorImagenMBH_v19 } from './analizadorMBH_v19.js';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testVerificacionRotacion() {
    console.log('🔍 TEST DE VERIFICACIÓN - DIAGNÓSTICO ROTACIÓN 90°');
    console.log('='.repeat(70));
    console.log('OBJETIVO: Entender por qué V19 reporta 90° en imagen no rotada');
    console.log('='.repeat(70));

    // 1. CREAR IMAGEN DE PRUEBA PEQUEÑA
    const imagenPrueba = path.join(__dirname, 'verif_original.jpg');
    console.log('\n📐 PASO 1: Creando imagen de prueba (600x400px para velocidad)...');

    await sharp({
        create: {
            width: 600,
            height: 400,
            channels: 3,
            background: { r: 80, g: 120, b: 200 }
        }
    })
    .jpeg({ quality: 95 })
    .toFile(imagenPrueba);

    console.log('✅ Imagen de prueba creada: 600x400px');

    // 2. APLICAR SELLO V18
    const pngConSello = path.join(__dirname, 'verif_sellado.png');
    console.log('\n🔐 PASO 2: Aplicando sello V18 (hash: d760)...');

    try {
        const generador = new GeneradorMBH_v18();
        await generador.sellarImagen(
            imagenPrueba,
            pngConSello,
            {
                hash_suffix: 'd760',
                cliente: 'Autor de Prueba'
            }
        );
        console.log('✅ Sello aplicado correctamente');
    } catch (error) {
        console.error(`❌ Error aplicando sello: ${error.message}`);
        return;
    }

    // 3. CONVERTIR A JPG (SIN CANAL ALFA)
    const jpgSinAlfa = path.join(__dirname, 'verif_sin_alfa.jpg');
    console.log('\n🔄 PASO 3: Convirtiendo a JPG (eliminando canal alfa)...');

    try {
        await sharp(pngConSello)
            .removeAlpha()
            .jpeg({ quality: 100 })
            .toFile(jpgSinAlfa);

        console.log('✅ JPG creado sin canal alfa');
    } catch (error) {
        console.error(`❌ Error convirtiendo a JPG: ${error.message}`);
        return;
    }

    // 4. ANALIZAR IMAGEN NO ROTADA (DEBERÍA SER 0°)
    console.log('\n🔍 PASO 4: Analizando imagen NO ROTADA (debería reportar ~0°)...');
    console.log('   Iniciando análisis V19...');

    try {
        const inicio = Date.now();
        const resultado = await analizadorImagenMBH_v19(jpgSinAlfa);
        const duracion = Date.now() - inicio;

        console.log(`⏱️  Duración análisis: ${duracion}ms`);
        console.log('\n📊 RESULTADOS IMAGEN NO ROTADA:');
        console.log('-'.repeat(50));

        if (resultado && resultado.response) {
            console.log(`✅ Éxito: ${resultado.response.exito ? 'SÍ' : 'NO'}`);

            if (resultado.response.exito) {
                const ev = resultado.response.evidencia_visual || {};

                console.log(`🔑 Hash detectado: ${ev.ADN_Detectado || 'N/A'}`);
                console.log(`🎯 Método: ${ev.Metodo || 'N/A'}`);
                console.log(`📈 Confianza: ${ev.Mejor_Confianza?.toFixed(1) || 0}%`);
                console.log(`📐 Rotación reportada: ${resultado.response.rotacion_detectada || 'N/A'}`);

                // ANALIZAR EL CÁLCULO DE ROTACIÓN
                if (resultado.response.rotacion_detectada) {
                    const rotacionValor = parseFloat(resultado.response.rotacion_detectada.replace('°', ''));

                    console.log('\n🧮 ANÁLISIS DEL CÁLCULO DE ROTACIÓN:');
                    console.log(`   Valor reportado: ${rotacionValor.toFixed(2)}°`);

                    if (Math.abs(rotacionValor - 0) < 1) {
                        console.log('   ✅ PERFECTO: Reporta 0° (correcto para imagen no rotada)');
                    } else if (Math.abs(rotacionValor - 90) < 1) {
                        console.log('   ❌ PROBLEMA: Reporta ~90° pero imagen NO está rotada');
                        console.log('   🔍 Esto indica un error en el cálculo de rotación');

                        // Mostrar cálculo detallado
                        console.log('\n   📐 Fórmula actual en V19:');
                        console.log('      anguloRad = Math.atan2(offY - 3.5, offX - 3.5) - Math.atan2(4 - 3.5, 3 - 3.5)');
                        console.log('      grados = anguloRad * (180 / Math.PI)');
                        console.log('      if (grados < 0) grados += 360');
                    } else {
                        console.log(`   ⚠️  INESPERADO: Reporta ${rotacionValor.toFixed(2)}° (debería ser ~0°)`);
                    }
                }

                // MOSTRAR OFFSETS DETECTADOS (CRÍTICO PARA DIAGNÓSTICO)
                if (ev.Top_Candidatos && ev.Top_Candidatos.length > 0) {
                    console.log('\n📍 OFFSETS DETECTADOS (Top 10):');
                    console.log('Idx │ offX │ offY │ Hash  │ Confianza │ Votos  │ Rotación');
                    console.log('────┼──────┼──────┼───────┼───────────┼────────┼─────────');

                    const top10 = ev.Top_Candidatos.slice(0, 10);
                    top10.forEach((cand, idx) => {
                        // Calcular rotación para este offset específico
                        let rotacionCalc = 'N/A';
                        if (cand.offX !== undefined && cand.offY !== undefined) {
                            const anguloRad = Math.atan2(cand.offY - 3.5, cand.offX - 3.5) - Math.atan2(4 - 3.5, 3 - 3.5);
                            let grados = anguloRad * (180 / Math.PI);
                            if (grados < 0) grados += 360;
                            rotacionCalc = `${grados.toFixed(1)}°`;
                        }

                        console.log(
                            `${(idx + 1).toString().padStart(3)} │ ` +
                            `${cand.offX?.toString().padStart(4) || 'N/A'} │ ` +
                            `${cand.offY?.toString().padStart(4) || 'N/A'} │ ` +
                            `${(cand.hash || 'N/A').padStart(5)} │ ` +
                            `${cand.confianza?.toFixed(1).padStart(8)}% │ ` +
                            `${cand.votos?.toString().padStart(6)} │ ` +
                            `${rotacionCalc}`
                        );
                    });

                    // CÁLCULO DETALLADO PARA EL MEJOR OFFSET
                    const mejor = ev.Top_Candidatos[0];
                    if (mejor.offX !== undefined && mejor.offY !== undefined) {
                        console.log('\n🔬 CÁLCULO DETALLADO PARA MEJOR OFFSET:');
                        console.log(`Offset detectado: (${mejor.offX}, ${mejor.offY})`);

                        // Valores específicos
                        const dx_actual = mejor.offX - 3.5;
                        const dy_actual = mejor.offY - 3.5;
                        const dx_everest = 3 - 3.5;  // = -0.5
                        const dy_everest = 4 - 3.5;  // = 0.5

                        const atan2_actual = Math.atan2(dy_actual, dx_actual);
                        const atan2_everest = Math.atan2(dy_everest, dx_everest);
                        const anguloRad = atan2_actual - atan2_everest;
                        let grados = anguloRad * (180 / Math.PI);
                        if (grados < 0) grados += 360;

                        console.log(`\n1. Cálculo de atan2 para offset actual:`);
                        console.log(`   atan2(${dy_actual.toFixed(2)}, ${dx_actual.toFixed(2)})`);
                        console.log(`   = atan2(${mejor.offY} - 3.5, ${mejor.offX} - 3.5)`);
                        console.log(`   = ${atan2_actual.toFixed(4)} rad (${(atan2_actual * 180/Math.PI).toFixed(2)}°)`);

                        console.log(`\n2. Cálculo de atan2 para punto Everest (3,4):`);
                        console.log(`   atan2(${dy_everest.toFixed(2)}, ${dx_everest.toFixed(2)})`);
                        console.log(`   = atan2(4 - 3.5, 3 - 3.5)`);
                        console.log(`   = atan2(0.5, -0.5)`);
                        console.log(`   = ${atan2_everest.toFixed(4)} rad (${(atan2_everest * 180/Math.PI).toFixed(2)}°)`);

                        console.log(`\n3. Diferencia (actual - Everest):`);
                        console.log(`   ${atan2_actual.toFixed(4)} - ${atan2_everest.toFixed(4)} = ${anguloRad.toFixed(4)} rad`);
                        console.log(`   ${anguloRad.toFixed(4)} rad × (180/π) = ${grados.toFixed(2)}°`);

                        console.log(`\n🎯 INTERPRETACIÓN:`);
                        console.log(`   • atan2(0.5, -0.5) ≈ 2.3562 rad (135°)`);
                        console.log(`   • Para obtener 0°, necesitaríamos atan2_actual ≈ 2.3562 rad`);
                        console.log(`   • Para obtener 90°, necesitaríamos atan2_actual ≈ 3.92699 rad (225°)`);

                        console.log(`\n🔍 ¿Qué offset daría 90°?`);
                        console.log(`   atan2(y-3.5, x-3.5) = 3.92699 rad (225°)`);
                        console.log(`   Esto ocurre cuando (x-3.5) y (y-3.5) son negativos e iguales`);
                        console.log(`   Por ejemplo: x=3, y=3 → atan2(-0.5, -0.5) = -2.356 rad = 3.927 rad (225°)`);
                        console.log(`   Entonces: offset (3,3) daría 90°`);
                        console.log(`   Tu offset: (${mejor.offX}, ${mejor.offY})`);
                    }
                }
            } else {
                console.log('❌ No se detectó el sello en imagen no rotada');
            }
        } else {
            console.log('❌ Respuesta inválida del analizador');
        }

    } catch (error) {
        console.error(`❌ Error en análisis: ${error.message}`);
    }

    // 5. PRUEBA CON ROTACIÓN 90° REAL
    console.log('\n🌀 PASO 5: Verificando con imagen ROTADA 90° REAL...');

    const jpgRotado90 = path.join(__dirname, 'verif_rotado90.jpg');

    try {
        console.log('   Creando versión rotada 90° exactos...');
        await sharp(jpgSinAlfa)
            .rotate(90, {
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 100 })
            .toFile(jpgRotado90);

        console.log('   Analizando imagen rotada 90°...');
        const resultadoRotado = await analizadorImagenMBH_v19(jpgRotado90);

        if (resultadoRotado && resultadoRotado.response && resultadoRotado.response.exito) {
            const rotReportada = resultadoRotado.response.rotacion_detectada;
            console.log(`📐 Rotación detectada en imagen 90° real: ${rotReportada || 'N/A'}`);

            if (rotReportada) {
                const valor = parseFloat(rotReportada.replace('°', ''));
                console.log(`   Valor numérico: ${valor.toFixed(2)}°`);
                console.log(`   Diferencia vs 90° real: ${Math.abs(valor - 90).toFixed(2)}°`);
            }
        }

        // Limpiar archivo
        await fs.unlink(jpgRotado90);

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
    }

    // 6. DIAGNÓSTICO DEL PROBLEMA
    console.log('\n📋 DIAGNÓSTICO DEL PROBLEMA DE ROTACIÓN 90°');
    console.log('='.repeat(70));

    console.log('\n🎯 PROBLEMA IDENTIFICADO:');
    console.log('   V19 reporta 90° en imágenes NO rotadas');

    console.log('\n🔍 CAUSA PROBABLE:');
    console.log('   El offset dominante detectado está cerca de (3,3) o similar');
    console.log('   que matemáticamente produce ~90° con la fórmula actual');

    console.log('\n📐 FÓRMULA ACTUAL (de analizadorMBH_v19.js):');
    console.log('   anguloRad = Math.atan2(offY - 3.5, offX - 3.5) - Math.atan2(4 - 3.5, 3 - 3.5)');
    console.log('   grados = anguloRad * (180 / Math.PI)');
    console.log('   if (grados < 0) grados += 360');

    console.log('\n💡 POSIBLES SOLUCIONES:');
    console.log('   1. Cambiar punto de referencia "Everest" de (3,4) a otro');
    console.log('   2. Ajustar fórmula para que offset (3,3) dé 0°, no 90°');
    console.log('   3. Normalizar offsets de 0-7 a otro sistema de coordenadas');
    console.log('   4. Restar 90° al resultado final si es necesario');

    console.log('\n⚙️  SOLUCIÓN SUGERIDA:');
    console.log('   Si el offset dominante suele ser (3,3), podemos ajustar:');
    console.log('   grados = (anguloRad * (180 / Math.PI) + 90) % 360');
    console.log('   Esto compensaría el desfase de 90°');

    // 7. LIMPIAR
    console.log('\n🧹 Limpiando archivos temporales...');
    const archivosTemp = [
        imagenPrueba,
        pngConSello,
        jpgSinAlfa
    ];

    for (const archivo of archivosTemp) {
        try {
            await fs.unlink(archivo);
            console.log(`   Eliminado: ${path.basename(archivo)}`);
        } catch (error) {
            // Ignorar
        }
    }

    console.log('\n🏁 TEST DE VERIFICACIÓN COMPLETADO');
    console.log('='.repeat(70));
    console.log('\n🎯 PRÓXIMOS PASOS RECOMENDADOS:');
    console.log('   1. Revisar qué offset se detecta como mejor (ver en resultados)');
    console.log('   2. Si es (3,3), ajustar fórmula restando 90°');
    console.log('   3. Probar con varias imágenes para confirmar el patrón');
    console.log('   4. Si el problema persiste, reconsiderar el cálculo de rotación');
}

// Configurar timeout
async function ejecutarConTimeout() {
    const TIMEOUT = 3 * 60 * 1000; // 3 minutos

    console.log('🔄 Iniciando test de verificación...');
    console.log(`   Timeout: ${TIMEOUT/60000} minutos`);
    console.log('   Imagen: 600x400px (análisis rápido)\n');

    const testPromise = testVerificacionRotacion();
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(`⏰ Timeout: Test excedió ${TIMEOUT/60000} minutos`));
        }, TIMEOUT);
    });

    try {
        await Promise.race([testPromise, timeoutPromise]);
    } catch (error) {
        console.error(`\n${error.message}`);
    }
}

// Ejecutar
ejecutarConTimeout().catch(console.error);
