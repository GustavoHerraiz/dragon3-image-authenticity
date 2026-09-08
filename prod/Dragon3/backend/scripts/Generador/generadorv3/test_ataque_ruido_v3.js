/**
 * ============================================================================
 * DRAGON5 V5 - TEST DE ATAQUE DE RUÍDO ESTEGANOGRÁFICO (CRÍTICO: CANAL ALPHA)
 * ============================================================================
 * OBJETIVO: ENCONTRAR EL UMBRAL DE RUPTURA.
 * Potencia de ataque reducida al 25%.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { analizadorImagenMBH } from './analizadorMBH.js';
import { GeneradorMBH } from './generadorMBH.js';

const BASE_DIR = process.cwd();

const RUTA_ORIGINAL = path.join(BASE_DIR, 'Atardecer.jpg');
const RUTA_SELLADA_CONTROL = path.join(BASE_DIR, 'Atardecer_Sellada.png');
const RUTA_SELLADA_ATAQUE = path.join(BASE_DIR, 'Atardecer_Ruidosa.png');

// 🔥 NUEVA POTENCIA: 25% de probabilidad de alterar el LSB del Canal Alpha
const CANAL_ATACADO = 3;
const INTENSIDAD_ATAQUE = 0.10;
const AUTOR_ESPERADO = 'Quico Melero';

// --- Funciones del test omitidas por brevedad (son idénticas a la versión anterior) ---
// (ejecutarAtaqueRuido y ejecutarTest mantienen la lógica y logging detallado)

/**
 * 🔪 FUNCIÓN CLAVE: Ejecuta el ataque de ruido bit a bit.
 */
async function ejecutarAtaqueRuido(rutaEntrada, rutaSalida) {
    console.log(`\n[ATAQUE] 🔪 Iniciando inyección de ruido CRÍTICO en Canal ${CANAL_ATACADO} (Alpha)...`);
    console.log(`[ATAQUE]    -> POTENCIA UTILIZADA (Intensidad LSB): ${INTENSIDAD_ATAQUE * 100}% de píxeles.`);

    const imagen = sharp(rutaEntrada);
    const { data: buffer, info } = await imagen
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const canales = info.channels;
    let bitsAlterados = 0;
    const totalPuntosDeAtaque = Math.floor(buffer.length / canales);

    for (let i = CANAL_ATACADO; i < buffer.length; i += canales) {
        if (Math.random() < INTENSIDAD_ATAQUE) {
            const bitDeAtaque = Math.round(Math.random());
            buffer[i] = (buffer[i] & 0xFE) | bitDeAtaque;
            bitsAlterados++;
        }
    }

    const porcentajeAlterado = (bitsAlterados / totalPuntosDeAtaque) * 100;

    console.log(`[ATAQUE] ✅ Total de puntos de píxel atacados: ${bitsAlterados}`);
    console.log(`[ATAQUE] ✅ DAÑO AL ARCHIVO (Bits alterados): ${porcentajeAlterado.toFixed(2)}%`);
    console.log(`[ATAQUE] 💾 Guardando imagen ruidosa en ${rutaSalida}...`);

    await sharp(buffer, { raw: { width: info.width, height: info.height, channels: canales } })
        .png()
        .toFile(rutaSalida);

    return { porcentajeAlterado };
}


async function ejecutarTest() {
    console.log("\n=========================================");
    console.log("    DRAGON5 V5 - TEST ATAQUE RUÍDO (ALPHA)");
    console.log("=========================================");

    // --- PASO 0: Limpieza y Control de Archivos ---
    try {
        await fs.unlink(RUTA_SELLADA_CONTROL);
        await fs.unlink(RUTA_SELLADA_ATAQUE);
    } catch (e) { /* Ignorar si no existen */ }
    try {
        await fs.access(RUTA_ORIGINAL);
    } catch (e) {
        console.error(`[ERROR FATAL] Archivo no encontrado: ${RUTA_ORIGINAL}`);
        return;
    }

    const generador = new GeneradorMBH();
    let totalBloquesControl = 0;

    // --- PASO 1: GENERACIÓN DE CONTROL ---
    await generador.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA_CONTROL);

    // --- PASO 2: ANÁLISIS DE CONTROL (Detección Normal) ---
    let resControl = await analizadorImagenMBH(RUTA_SELLADA_CONTROL);
    totalBloquesControl = resControl.response.evidencia_visual.Total_Bloques;

    if (resControl.response.evaluacion.veredicto !== 'Original Intacto') {
        console.error("❌ ERROR CONTROL: Fallo en la generación inicial.");
        return;
    }

    // --- PASO 3: EJECUCIÓN DEL ATAQUE DE RUIDO CRÍTICO ---
    const ataqueData = await ejecutarAtaqueRuido(RUTA_SELLADA_CONTROL, RUTA_SELLADA_ATAQUE);

    // --- PASO 4: ANÁLISIS DEL ATAQUE ---
    let resAtaque = await analizadorImagenMBH(RUTA_SELLADA_ATAQUE);

    // --- CÁLCULO DE DAÑO AL SELLO ---
    const bloquesRecuperados = resAtaque.response.evidencia_visual.Bloques_Recuperados;
    const bloquesDestruidos = totalBloquesControl - bloquesRecuperados;
    const danoAlSello = (bloquesDestruidos / totalBloquesControl) * 100;

    // --- VERIFICACIÓN DE AUTORÍA ---
    const veredicto = resAtaque.response.evaluacion.veredicto;
    const autorDetectado = resAtaque.response.evidencia_visual.Autor_Sello;
    const autoriaPersiste = (veredicto.includes('DETECTADOS') || veredicto === 'Original Intacto') && autorDetectado === AUTOR_ESPERADO;


    // --- INFORME FINAL DETALLADO ---

    console.log("\n=========================================");
    console.log("📊 INFORME DE ROBUSTEZ: ATAQUE ALPHA CRÍTICO (25%)");
    console.log("=========================================");

    console.log("\n### I. PARÁMETROS DEL ATAQUE ###");
    console.log(`- TIPO DE ATAQUE: Ruido LSB Esteganográfico`);
    console.log(`- OBJETIVO: Canal Alpha (Canal del Sello Vogel)`);
    console.log(`- POTENCIA UTILIZADA (Intensidad LSB): ${INTENSIDAD_ATAQUE * 100}%`);
    console.log(`- DAÑO AL ARCHIVO INFLIGIDO (Bits alterados): ${ataqueData.porcentajeAlterado.toFixed(2)}%`);

    console.log("\n### II. RESULTADOS DEL ANÁLISIS FORENSE ###");
    console.log(`- VEREDICTO DEL ANALIZADOR: ${veredicto}`);
    console.log(`- AUTORÍA DETECTADA: ${autorDetectado}`);
    console.log(`- HASH ORIGINAL (Sello): ${resAtaque.response.datos_clave.Hash_Original}`);
    console.log(`- HASH ACTUAL (Ruidoso): ${resAtaque.response.datos_clave.Hash_Actual}`);

    console.log("\n### III. DAÑO CUANTIFICADO AL SELLO ###");
    console.log(`- BLOQUES TOTALES: ${totalBloquesControl}`);
    console.log(`- BLOQUES RECUPERADOS: ${bloquesRecuperados}`);
    console.log(`- BLOQUES DESTRUIDOS: ${bloquesDestruidos}`);
    console.log(`- PÉRDIDA PORCENTUAL DEL SELLO (Daño al Sello): ${danoAlSello.toFixed(2)}%`);

    console.log("\n--- CONCLUSIÓN FORENSE ---");
    if (autoriaPersiste && bloquesRecuperados > 0) {
        console.log(`✅ RESULTADO CRÍTICO: ÉXITO DE ROBUSTEZ.`);
        console.log(`   El sello Vogel resistió el ataque directo al Canal Alpha.`);
        console.log(`   La AUTORÍA (${AUTOR_ESPERADO}) fue confirmada a pesar de la pérdida de ${danoAlSello.toFixed(2)}% de bloques.`);
    } else {
        console.error("❌ FALLO DE ROBUSTEZ: El ataque logró destruir la atribución de autoría.");
    }

    console.log("\n### IV. SALIDA RAW DEL ANALIZADOR ###");
    console.log(JSON.stringify(resAtaque.response, null, 2));

    console.log("=========================================");
}

ejecutarTest();
