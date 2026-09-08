// test_final_v24.js
import { analizarImagenMaster } from './analizador_MASTER_v23_FRACTAL.js';
import path from 'path';

// Ajusta la ruta si es necesario
const IMAGEN = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';

async function testRapido() {
    console.log("🚀 INICIANDO TEST FINAL V24 (QUIRÚRGICO)");
    console.log(`📂 Imagen: ${IMAGEN}`);

    try {
        const inicio = Date.now();
        const resultado = await analizarImagenMaster(IMAGEN);
        const tiempo = Date.now() - inicio;

        console.log("\n📊 RESULTADOS DEL ANÁLISIS:");
        console.log("---------------------------------------------------");
        console.log(`🧬 ADN BINARIO:   ${resultado.response.adn_binario}`);
        console.log(`🔑 HASH HEX:      ${resultado.response.hash_calculado}`);
        console.log(`⚡ VOTOS TWIN:    ${resultado.response.energia_detectada}`);
        console.log(`📐 ÁNGULO:        ${resultado.response.angulo_detectado}°`);
        console.log(`⏱️ TIEMPO:        ${tiempo}ms`);
        console.log("---------------------------------------------------");

        // Verificación visual rápida
        const esperado = "50B3"; // El que inyectaste antes
        if (resultado.response.hash_calculado === esperado) {
            console.log("✅ ¡¡ÉXITO TOTAL!! EL HASH COINCIDE EXACTAMENTE.");
        } else {
            console.log(`⚠️ Hash distinto (Esperado: ${esperado}). Revisa la imagen.`);
        }

    } catch (error) {
        console.error("💥 ERROR FATAL:", error);
    }
}

testRapido();
