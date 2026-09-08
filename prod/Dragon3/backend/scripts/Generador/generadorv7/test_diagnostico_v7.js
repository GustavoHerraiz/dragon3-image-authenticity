/**
 * ============================================================================
 * TEST V9 - VERIFICACIÓN COMPLETA (CORREGIDO PARA NUEVO JSON)
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

const INTENSIDAD_ALPHA = 0.50; // 50% ataque

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
    console.log("    TEST V9 - ESTRATEGIA HÍBRIDA COMPLETA");
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

    // 2. ANALIZAR CONTROL (INTACTO)
    console.log("\n[TEST V9] 2. ANALIZANDO CONTROL (INTACTO)...");
    const control = await analizadorImagenMBH_v9(RUTA_SELLADA_V9);

    console.log(`\n[TEST V9] 📊 CONTROL:`);
    console.log(`   Veredicto: ${control.response.evaluacion.veredicto}`);
    // FIX: Nombres de propiedades actualizados
    console.log(`   Modo: ${control.response.evidencia_visual.Modo}`);
    console.log(`   Puntos centrales: ${control.response.evidencia_visual.Puntos_Centrales}`);

    // 3. APLICAR ATAQUE
    console.log("\n[TEST V9] 3. APLICANDO ATAQUE 50% ALPHA...");
    const ataque = await ejecutarAtaqueAlpha(RUTA_SELLADA_V9, RUTA_ATAQUE_V9);

    // 4. ANALIZAR IMAGEN ATACADA
    console.log("\n[TEST V9] 4. ANALIZANDO IMAGEN ATACADA...");
    const postAtaque = await analizadorImagenMBH_v9(RUTA_ATAQUE_V9);

    // 5. EVALUAR RESULTADOS
    console.log("\n" + "=".repeat(70));
    console.log("📊 EVALUACIÓN FINAL V9");
    console.log("=".repeat(70));

    // FIX: Lectura correcta de propiedades del nuevo JSON
    const modo = postAtaque.response.evidencia_visual.Modo;
    const centrales = postAtaque.response.evidencia_visual.Puntos_Centrales;
    const perifericos = postAtaque.response.evidencia_visual.Puntos_Perifericos;
    const transformacion = postAtaque.response.evidencia_visual.Transformacion;

    console.log(`\n📈 RESULTADOS:`);
    console.log(`   • Modo resultante: ${modo}`);
    console.log(`   • Puntos centrales vivos: ${centrales}/10`);
    console.log(`   • Puntos periféricos vivos: ${perifericos}`);
    console.log(`   • Veredicto final: ${postAtaque.response.evaluacion.veredicto}`);
    console.log(`   • Confianza: ${(postAtaque.response.evaluacion.confianza * 100).toFixed(1)}%`);

    // 6. CONCLUSIÓN INTELIGENTE
    console.log("\n" + "=".repeat(70));
    console.log("🎯 CONCLUSIÓN ESTRATEGIA V9");
    console.log("=".repeat(70));

    // Condición de éxito 1: Sobrevivieron los centrales (Robustez Extrema)
    if (centrales >= 2) {
        console.log("✅ ✅ ✅ ÉXITO TOTAL (MODO NORMAL) ✅ ✅ ✅");
        console.log(`   El sello resistió el ataque DIRECTAMENTE en los puntos centrales.`);
        console.log(`   No fue necesario usar la recuperación geométrica.`);
        console.log(`   Robustez demostrada: 50% Ruido Alpha NO destruyó el núcleo.`);
    }
    // Condición de éxito 2: Recuperación Híbrida
    else if (modo === "recuperacion" && perifericos >= 2) {
        console.log("✅ ✅ ✅ ÉXITO TÁCTICO (MODO RECUPERACIÓN) ✅ ✅ ✅");
        console.log(`   Los puntos centrales cayeron, pero la estrategia híbrida funcionó.`);
        console.log(`   Se recuperó el sello mediante geometría.`);
    }
    else {
        console.log("❌ FALLO DE SISTEMA");
        console.log(`   El ataque destruyó tanto el núcleo como la periferia.`);
    }

    console.log("\n" + "=".repeat(70));
}

testCompletoV9().catch(err => {
    console.error("[TEST V9] ❌ Error:", err.message);
    process.exit(1);
});
