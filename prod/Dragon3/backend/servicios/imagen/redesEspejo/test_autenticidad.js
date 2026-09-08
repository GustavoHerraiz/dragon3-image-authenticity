/**
 * ====================================================================
 * DRAGON3 - TEST E2E RED ESPEJO AUTENTICIDAD
 * ====================================================================
 *
 * Archivo: backend/servicios/imagen/redesEspejo/test_autenticidad.js
 * Descripción: Test mínimo FAANG/KISS para validar discovery, contrato
 *              y logging de la red autenticidad vía entry point global.
 * Versión: 3.0.0-FAANG
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * Instrucciones:
 * - Ejecuta: node test_autenticidad.js
 * - Comprueba que el resultado cumple el contrato (README).
 * - Verifica que el log dragon.log contiene la entrada MIRRORNET_RESULTS.
 * ====================================================================
 */

import { analizarConRedesEspejo } from './redesEspejo.js';

async function main() {
  const input = {
    idImagen: "img-test-e2e-001",
    datos: {
      campo1: 42,
      campo2: "valor",
      campo3: [1,2,3]
    }
  };

  try {
    const resultados = await analizarConRedesEspejo(input);

    console.log("=== Resultado red autenticidad (plug & play) ===");
    console.log(JSON.stringify(resultados, null, 2));

    // Validación mínima del contrato (KISS)
    if (!resultados.autenticidad) {
      throw new Error("No se encontró resultado autenticidad (plug & play fallido)");
    }
    const out = resultados.autenticidad;
    if (
      typeof out.resultado !== "boolean" ||
      typeof out.score !== "number" ||
      !out.idImagen ||
      !out.timestamp ||
      !out.inputHash ||
      !out.detalles
    ) {
      throw new Error("El resultado de autenticidad no cumple el contrato");
    }

    console.log("✅ Test PASADO: contrato y plug & play OK.");
    console.log("Verifica dragon.log para el evento MIRRORNET_RESULTS.");

  } catch (err) {
    console.error("❌ Test FALLIDO:", err.message);
    process.exit(1);
  }
}

main();