import sharp from 'sharp';
import fs from 'fs';
import { analizadorImagenMBH_v18 } from './analizadorMBH_v18.js';

async function pruebaDelAcido() {
    console.log("🧪 INICIANDO PRUEBA DEL ÁCIDO (CONTROL NEGATIVO)");
    console.log("================================================");

    // 1. Crear una imagen de RUIDO puro (sin sello)
    // Simulamos una foto de internet que NO es nuestra
    const rutaFake = './falso_positivo.jpg';

    console.log("Generando imagen 'inocente' (Ruido aleatorio)...");
    await sharp({
        create: {
            width: 1000,
            height: 1000,
            channels: 4,
            background: { r: 128, g: 128, b: 128, alpha: 255 },
            noise: {
                type: 'gaussian',
                mean: 128,
                sigma: 30
            }
        }
    })
    .sharpen() // Filtro para simular bordes
    .jpeg({ quality: 50 }) // Compresión para generar artefactos
    .toFile(rutaFake);

    // 2. Pasarle el Analizador V17
    console.log("🕵️  Pasando el Analizador V17...");
    const resultado = await analizadorImagenMBH_v18(rutaFake);

    console.log("\n--- RESULTADOS ---");
    if (resultado.response.exito) {
        console.log("❌ DESASTRE: FALSO POSITIVO DETECTADO");
        console.log("   El analizador ha 'visto' un sello donde no hay nada.");
        console.log("   ADN Alucinado:", resultado.response.evidencia_visual.ADN_Detectado);
        console.log("   Confianza:", resultado.response.evidencia_visual.Mejor_Confianza + "%");
    } else {
        console.log("✅ CORRECTO: El sistema no ve fantasmas.");
        console.log("   Imagen limpia identificada como limpia.");
    }
}

pruebaDelAcido();
