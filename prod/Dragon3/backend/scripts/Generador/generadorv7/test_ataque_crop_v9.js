/**
 * ============================================================================
 * TEST V9 - RESISTENCIA AL RECORTE (CROP) - VERSIÓN LOSSLESS
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { analizadorImagenMBH_v9 } from './analizadorMBH_v9.js';
import { GeneradorMBH_v9 } from './generadorMBH_v9.js';

const BASE_DIR = process.cwd();
const RUTA_ORIGINAL = path.join(BASE_DIR, 'Atardecer.jpg');
const RUTA_SELLADA = path.join(BASE_DIR, 'Atardecer_Sellada_V9.png');

// Rutas para los diferentes ataques
const RUTA_CROP_CENTRO = path.join(BASE_DIR, 'Atardecer_Crop_Centro50.png');
const RUTA_CROP_ESQUINA = path.join(BASE_DIR, 'Atardecer_Crop_Esquina25.png');
const RUTA_CROP_TIRA = path.join(BASE_DIR, 'Atardecer_Crop_Tira15.png');

function mostrarResultado(analisis, nombrePrueba) {
    console.log(`\n🔍 --- RESULTADOS: ${nombrePrueba} ---`);
    const ev = analisis.response?.evidencia_visual || {};
    const eva = analisis.response?.evaluacion || {};

    const cliente = ev.Cliente_Identificado?.cliente || "Desconocido (Anónimo)";
    const perifericos = ev.Puntos_Perifericos_Encontrados || 0;
    // FIX: Leemos los inliers correctos (si hay transformación RANSAC, usamos sus puntos)
    const inliers = ev.Transformacion_Detectada ? ev.Transformacion_Detectada.puntosUsados : (ev.Puntos_Inliers_Geometricos || 0);
    const veredicto = eva.veredicto;

    console.log(`   • Veredicto: ${veredicto}`);
    console.log(`   • Confianza: ${(eva.confianza*100).toFixed(0)}%`);
    console.log(`   • Cliente: ${cliente}`);
    console.log(`   • Puntos Leídos: ${perifericos}`);
    console.log(`   • Geometría Recuperada (Inliers): ${inliers} ${inliers >= 5 ? '✅' : '❌'}`);

    if (ev.Transformacion_Detectada) {
        const t = ev.Transformacion_Detectada;
        console.log(`   • Transformación: ${t.tipoTransformacion}`);
        console.log(`   • Centro Relativo al Crop: (${t.centro.x.toFixed(0)}, ${t.centro.y.toFixed(0)})`);
    } else {
        console.log(`   • Transformación: Ninguna detectada`);
    }
    console.log("--------------------------------------------------");
}

// Función de recorte que respeta el LSB (Bit Menos Significativo)
async function ejecutarCropPerfecto(rutaEntrada, rutaSalida, configCrop, descripcion) {
    console.log(`\n[TEST V9] ✂️ EJECUTANDO CROP LOSSLESS: ${descripcion}`);

    // 1. Leemos en RAW para no perder ni un bit
    const { data, info } = await sharp(rutaEntrada)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const left = Math.round(info.width * configCrop.leftPct);
    const top = Math.round(info.height * configCrop.topPct);
    const width = Math.round(info.width * configCrop.widthPct);
    const height = Math.round(info.height * configCrop.heightPct);

    console.log(`   📐 Zona: Left:${left}, Top:${top}, W:${width}, H:${height}`);

    // 2. Extraemos usando sharp pipeline configurado para PNG sin compresión destructiva
    await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 }
    })
    .extract({ left, top, width, height })
    .png({
        compressionLevel: 0, // Sin compresión para evitar artefactos
        force: true
    })
    .toFile(rutaSalida);

    console.log(`   💾 Guardado en: ${path.basename(rutaSalida)}`);
}

async function testCropV9() {
    console.log("\n" + "=".repeat(70));
    console.log("    TEST V9 - RESISTENCIA A RECORTES (CROP)");
    console.log("=".repeat(70));

    // 1. GENERAR IMAGEN SELLADA ORIGINAL
    console.log("\n[TEST V9] 1️⃣ GENERANDO IMAGEN BASE...");
    const generador = new GeneradorMBH_v9();
    const selloInfo = await generador.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA);
    console.log(`   ✅ Imagen sellada. Centro Real: (${selloInfo.centro.x}, ${selloInfo.centro.y})`);

    // 2. ESCENARIO 1: CROP CENTRAL (50% ÁREA)
    await ejecutarCropPerfecto(RUTA_SELLADA, RUTA_CROP_CENTRO, {
        leftPct: 0.25, topPct: 0.25, widthPct: 0.50, heightPct: 0.50
    }, "Centro 50%");

    console.log(`\n[TEST V9] 🧠 ANALIZANDO CROP CENTRAL...`);
    const resCentro = await analizadorImagenMBH_v9(RUTA_CROP_CENTRO);
    mostrarResultado(resCentro, "CROP CENTRAL 50%");


    // 3. ESCENARIO 2: CROP ESQUINA SUPERIOR IZQUIERDA (25% ÁREA)
    await ejecutarCropPerfecto(RUTA_SELLADA, RUTA_CROP_ESQUINA, {
        leftPct: 0.0, topPct: 0.0, widthPct: 0.50, heightPct: 0.50
    }, "Esquina Sup-Izq 25%");

    console.log(`\n[TEST V9] 🧠 ANALIZANDO CROP ESQUINA...`);
    const resEsquina = await analizadorImagenMBH_v9(RUTA_CROP_ESQUINA);
    mostrarResultado(resEsquina, "CROP ESQUINA 25%");


    // 4. ESCENARIO 3: CROP TIRA HORIZONTAL (15% ÁREA)
    await ejecutarCropPerfecto(RUTA_SELLADA, RUTA_CROP_TIRA, {
        leftPct: 0.0, topPct: 0.40, widthPct: 1.0, heightPct: 0.15
    }, "Tira Horizontal Media 15%");

    console.log(`\n[TEST V9] 🧠 ANALIZANDO CROP TIRA...`);
    const resTira = await analizadorImagenMBH_v9(RUTA_CROP_TIRA);
    mostrarResultado(resTira, "CROP TIRA 15%");

    console.log("\n" + "=".repeat(70));
    console.log("🏁 TEST DE CROP FINALIZADO");
    console.log("=".repeat(70) + "\n");
}

testCropV9().catch(e => console.error(e));
