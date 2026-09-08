/**
 * ============================================================================
 * 🕵️ DRAGON3: AUDITORÍA BIOMÉTRICA (VISOR DE ESPECTRO)
 * ============================================================================
 * Objetivo: Generar una prueba visual de que la marca de agua NO altera
 * la geometría de la firma, sino que se distribuye como ruido estocástico.
 * ============================================================================
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const CONFIG = {
    ORIGINAL: './input/firma_test.jpg',
    FIRMADA: './output_faundez/MASTER_SELLADA.png', // Asegúrate de que este archivo existe del test anterior
    OUTPUT: './output_faundez/EVIDENCIA_BIOMETRICA.png',
    AMPLIFICACION: 50 // Multiplicamos el ruido para que el ojo humano lo vea
};

async function generarAuditoria() {
    console.log(`\n🕵️ INICIANDO AUDITORÍA DE IMPACTO BIOMÉTRICO...`);

    if (!fs.existsSync(CONFIG.ORIGINAL) || !fs.existsSync(CONFIG.FIRMADA)) {
        console.error("❌ Error: No encuentro los archivos. Ejecuta primero el test maestro.");
        return;
    }

    // 1. Cargar imágenes como buffers crudos
    const { data: bufOriginal, info: infoOrg } = await sharp(CONFIG.ORIGINAL)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { data: bufFirmada, info: infoFirm } = await sharp(CONFIG.FIRMADA)
        .resize(infoOrg.width, infoOrg.height) // Asegurar mismo tamaño
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // 2. Crear buffer para el Mapa de Calor
    const bufDiff = Buffer.alloc(bufOriginal.length);

    console.log(`📊 Comparando píxel a píxel (${infoOrg.width}x${infoOrg.height})...`);

    let maxDiff = 0;
    let energiaTotal = 0;

    for (let i = 0; i < bufOriginal.length; i += 4) {
        // Canales RGB (ignoramos Alpha)
        const rDiff = Math.abs(bufOriginal[i] - bufFirmada[i]);
        const gDiff = Math.abs(bufOriginal[i+1] - bufFirmada[i+1]);
        const bDiff = Math.abs(bufOriginal[i+2] - bufFirmada[i+2]);

        const promedioDiff = (rDiff + gDiff + bDiff) / 3;
        energiaTotal += promedioDiff;
        if (promedioDiff > maxDiff) maxDiff = promedioDiff;

        // Visualización: Amplificamos la diferencia para verla
        // Lo pintamos en VERDE MATRIX para que parezca código
        const valVisual = Math.min(255, promedioDiff * CONFIG.AMPLIFICACION);

        bufDiff[i] = 0;           // R
        bufDiff[i+1] = valVisual; // G (Solo verde)
        bufDiff[i+2] = 0;         // B
        bufDiff[i+3] = 255;       // Alpha (Opaco)
    }

    console.log(`\n📉 ESTADÍSTICAS DE INTRUSIÓN:`);
    console.log(`- Diferencia Máxima por Píxel: ${maxDiff}/255`);
    console.log(`- Energía de Inyección Total: ${energiaTotal.toLocaleString()}`);

    // 3. Generar la imagen compuesta (Original | Firmada | Diferencia)
    // Para que se vea bonito, creamos un lienzo 3x ancho

    const visor = await sharp({
        create: {
            width: infoOrg.width * 3,
            height: infoOrg.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
    })
    .composite([
        { input: CONFIG.ORIGINAL, left: 0, top: 0 },
        { input: CONFIG.FIRMADA, left: infoOrg.width, top: 0 },
        { input: bufDiff, raw: { width: infoOrg.width, height: infoOrg.height, channels: 4 }, left: infoOrg.width * 2, top: 0 }
    ])
    .png()
    .toFile(CONFIG.OUTPUT);

    console.log(`\n✅ EVIDENCIA GENERADA: ${CONFIG.OUTPUT}`);
    console.log(`👉 Abre la imagen. A la izquierda la original, al centro la firmada, a la derecha LA MATRIZ (lo que hemos inyectado).`);
    console.log(`👉 Si la imagen de la derecha parece "Nieve de TV", la biometría está a salvo.`);
    console.log(`👉 Si ves trazos de letras claros en la derecha, estamos modificando la firma (Malo).`);
}

generarAuditoria();
