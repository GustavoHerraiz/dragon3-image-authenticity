// diagnostico_v19.js
import sharp from 'sharp';
import { analizadorImagenMBH_v19 } from './analizadorMBH_v19.js';

async function diagnostico() {
    console.log("🔍 DIAGNÓSTICO V19 - Análisis Paso a Paso");

    // 1. Probar PNG sin rotar
    console.log("\n1. PNG ORIGINAL (sin rotar):");
    const resPNG = await analizadorImagenMBH_v19('maestra_sellada_quico.png');
    console.log("Resultado:", resPNG.response.evidencia_visual);

    // 2. Probar PNG rotado 45°
    await sharp('maestra_sellada_quico.png').rotate(45).png().toFile('test_45.png');
    console.log("\n2. PNG ROTADO 45°:");
    const resPNG45 = await analizadorImagenMBH_v19('test_45.png');
    console.log("Resultado:", resPNG45.response.evidencia_visual);

    // 3. Probar JPG sin rotar
    await sharp('maestra_sellada_quico.png').jpeg({ quality: 100 }).toFile('test.jpg');
    console.log("\n3. JPG SIN ROTAR (calidad 100):");
    const resJPG = await analizadorImagenMBH_v19('test.jpg');
    console.log("Resultado:", resJPG.response.evidencia_visual);

    // 4. Probar JPG rotado 45°
    await sharp('maestra_sellada_quico.png').rotate(45).jpeg({ quality: 100 }).toFile('test_45.jpg');
    console.log("\n4. JPG ROTADO 45° (calidad 100):");
    const resJPG45 = await analizadorImagenMBH_v19('test_45.jpg');
    console.log("Resultado:", resJPG45.response.evidencia_visual);
}

diagnostico();
