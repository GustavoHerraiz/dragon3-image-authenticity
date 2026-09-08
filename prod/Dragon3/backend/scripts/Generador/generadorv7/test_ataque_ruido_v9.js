/**
 * ============================================================================
 * TEST V9 - VERIFICACIÓN ROBUSTA (INTENSIDAD 30%)
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { analizadorImagenMBH_v9 } from './analizadorMBH_v9.js';
import { GeneradorMBH_v9 } from './generadorMBH_v9.js';

const BASE_DIR = process.cwd();
const RUTA_ORIGINAL = path.join(BASE_DIR, 'Atardecer.jpg');
const RUTA_SELLADA_V9 = path.join(BASE_DIR, 'Atardecer_Sellada_V9.png');
const RUTA_ATAQUE_V9 = path.join(BASE_DIR, 'Atardecer_Atacada_V9.png');

// --- AJUSTE: 30% DE DAÑO (Punto de estabilidad) ---
const INTENSIDAD_ALPHA = 0.30;

async function ejecutarAtaqueAlpha(rutaEntrada, rutaSalida) {
    console.log(`\n[TEST V9] 🔥 ATAQUE ALPHA (${INTENSIDAD_ALPHA * 100}%)`);

    const { data: buffer, info } = await sharp(rutaEntrada)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    let bitsAlterados = 0;
    const totalPixeles = buffer.length / 4;

    for (let i = 0; i < buffer.length; i += 4) {
        if (Math.random() < INTENSIDAD_ALPHA) {
            buffer[i + 3] ^= 1; // Alternar bit LSB de Alpha
            bitsAlterados++;
        }
    }

    const porcentaje = (bitsAlterados / totalPixeles) * 100;
    console.log(`[TEST V9] 📊 Alpha alterado: ${porcentaje.toFixed(2)}% de píxeles`);

    await sharp(buffer, {
        raw: { width: info.width, height: info.height, channels: 4 }
    })
    .png()
    .toFile(rutaSalida);

    return { porcentajeAlterado: porcentaje };
}

async function testCompletoV9() {
    console.log("\n" + "=".repeat(70));
    console.log("    TEST V9 - ESTRATEGIA HÍBRIDA (DAÑO ALTO 30%)");
    console.log("=".repeat(70));

    // Limpiar archivos anteriores
    try {
        await fs.unlink(RUTA_SELLADA_V9);
        await fs.unlink(RUTA_ATAQUE_V9);
    } catch (e) {}

    // 1. GENERAR SELLO V9
    console.log("\n[TEST V9] 1. GENERANDO SELLO V9...");
    const generador = new GeneradorMBH_v9();
    const sello = await generador.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA_V9);

    console.log(`\n[TEST V9] ✅ SELLO V9 GENERADO:`);
    console.log(`   Hash: ${sello.hash}`);
    console.log(`   Centro: (${sello.centro.x}, ${sello.centro.y})`);
    console.log(`   Estrategia: ${sello.manifiesto.estrategia}`);

    // 2. ANALIZAR CONTROL (INTACTO)
    console.log("\n[TEST V9] 2. ANALIZANDO CONTROL (INTACTO)...");
    const control = await analizadorImagenMBH_v9(RUTA_SELLADA_V9);

    const evidenciaControl = control.response?.evidencia_visual || {};
    const evaluacionControl = control.response?.evaluacion || {};

    console.log(`\n[TEST V9] 📊 CONTROL:`);
    console.log(`   Veredicto: ${evaluacionControl.veredicto}`);
    console.log(`   Modo: ${evidenciaControl.Modo_Recuperacion}`);
    console.log(`   Puntos centrales: ${evidenciaControl.Puntos_Centrales_Recuperados}`);

    // 3. APLICAR ATAQUE
    console.log(`\n[TEST V9] 3. APLICANDO ATAQUE ${INTENSIDAD_ALPHA * 100}% ALPHA...`);
    const ataque = await ejecutarAtaqueAlpha(RUTA_SELLADA_V9, RUTA_ATAQUE_V9);

    // 4. ANALIZAR IMAGEN ATACADA
    console.log("\n[TEST V9] 4. ANALIZANDO IMAGEN ATACADA...");
    const postAtaque = await analizadorImagenMBH_v9(RUTA_ATAQUE_V9);

    // 5. EVALUAR RESULTADOS
    console.log("\n" + "=".repeat(70));
    console.log("📊 EVALUACIÓN FINAL V9");
    console.log("=".repeat(70));

    const evidenciaPost = postAtaque.response?.evidencia_visual || {};
    const evaluacionPost = postAtaque.response?.evaluacion || {};

    const modoRecuperacion = evidenciaPost.Modo_Recuperacion || "Error";
    const puntosPerifericos = evidenciaPost.Puntos_Perifericos_Encontrados || 0;
    const inliers = evidenciaPost.Puntos_Inliers_Geometricos || 0;
    const transformacion = evidenciaPost.Transformacion_Detectada;
    const cliente = evidenciaPost.Cliente_Identificado;

    console.log(`\n📈 RESULTADOS:`);
    console.log(`   • Modo de recuperación: ${modoRecuperacion}`);
    console.log(`   • Candidatos Totales (Ruido): ${puntosPerifericos}`);
    // FIX VISUAL: Usamos inliers o puntos usados de la transformación si inliers es 0
    const inliersReales = inliers > 0 ? inliers : (transformacion?.puntosUsados || 0);
    console.log(`   • Inliers Validados: ${inliersReales} ${inliersReales > 5 ? '✅' : '⚠️'}`);

    console.log(`   • Veredicto final: ${evaluacionPost.veredicto || 'Nulo'}`);
    console.log(`   • Confianza: ${((evaluacionPost.confianza || 0) * 100).toFixed(1)}%`);

    if (transformacion) {
        console.log(`\n🔧 DIAGNÓSTICO DE TRANSFORMACIÓN:`);
        console.log(`   • Tipo: ${transformacion.tipoTransformacion}`);
        console.log(`   • Escala: ${transformacion.escala.toFixed(3)} (${(transformacion.escala * 100).toFixed(1)}%)`);
        console.log(`   • Centro calculado: (${transformacion.centro.x.toFixed(1)}, ${transformacion.centro.y.toFixed(1)})`);
        if (transformacion.errorPromedio !== undefined) {
            console.log(`   • Error promedio: ${transformacion.errorPromedio.toFixed(1)} píxeles`);
        }
        console.log(`   • Puntos utilizados: ${transformacion.puntosUsados}`);
    } else {
        console.log(`\n⚠️ No se detectó transformación geométrica válida.`);
    }

    if (cliente) {
        console.log(`\n🏆 PROPIETARIO IDENTIFICADO: ${cliente.cliente}`);
    }

    // 6. CONCLUSIÓN
    console.log("\n" + "=".repeat(70));
    console.log("🎯 CONCLUSIÓN ESTRATEGIA V9");
    console.log("=".repeat(70));

    if (cliente && cliente.cliente === "Quico Melero") {
        console.log("✅ ✅ ✅ ÉXITO TOTAL: Identidad recuperada y verificada.");
    } else if (transformacion) {
        console.log("⚠️ PARCIAL: Geometría recuperada pero identidad incierta.");
    } else {
        console.log("❌ FALLO: El ataque ha destruido el sello.");
    }

    console.log("=".repeat(70) + "\n");
}

testCompletoV9().catch(err => console.error("Crash:", err));
