/**
 * 🚀 SIMULACIÓN DE API DRAGON3
 * Muestra cómo usar HydraCore en un entorno de producción.
 */

import { HydraCore } from './HydraCore.js';
import path from 'path';

// 1. INICIALIZACIÓN (Hacer esto UNA VEZ al arrancar el servidor)
// La clave debe ser variable de entorno
const SECRET_KEY = process.env.HYDRA_KEY || "CLAVE_PRIVADA_QUICO_MELERO_2025";
const hydra = new HydraCore(SECRET_KEY);

console.log("✅ SISTEMA HYDRA ONLINE. Motor Espacial en Memoria.\n");

// --- MOCK DB ---
const DB_CLIENTES = {
    "d760": "Quico Melero",
    "a1b2": "Cliente Test"
};

async function testProduccion() {
    const imagenInput = 'Atardecer.jpg';
    const imagenProtegida = 'Atardecer_Protected.png';
    const idCliente = 'd760'; // Hash de Quico

    // -----------------------------------------------------------------------
    // CASO A: PROTEGER IMAGEN (Upload)
    // -----------------------------------------------------------------------
    console.log(`📤 [API] Solicitud de Protección para: ${imagenInput}`);
    const tStart = performance.now();

    await hydra.sellar(imagenInput, imagenProtegida, idCliente);

    const tEnd = performance.now();
    console.log(`   ✨ Imagen protegida en ${(tEnd - tStart).toFixed(0)}ms`);
    console.log(`   💾 Guardado en: ${imagenProtegida}\n`);

    // -----------------------------------------------------------------------
    // CASO B: DETECTAR IMAGEN (Scanner)
    // Usamos la imagen que acabamos de crear
    // -----------------------------------------------------------------------
    console.log(`🔎 [API] Escaneando sospechoso: ${imagenProtegida}`);
    const tScanStart = performance.now();

    const resultado = await hydra.detectar(imagenProtegida);

    const tScanEnd = performance.now();
    console.log(`   ⏱️  Tiempo de Escaneo: ${(tScanEnd - tScanStart).toFixed(0)}ms`);

    if (resultado.detectado) {
        const cliente = DB_CLIENTES[resultado.hash] || "Desconocido";
        console.log(`   🚨 DETECTADO! ID: ${resultado.hash} (${cliente})`);
        console.log(`   📊 Confianza: ${(resultado.confianza * 100).toFixed(1)}%`);
    } else {
        console.log(`   🟢 Limpio. No se detectó firma.`);
    }
}

// Ejecutar simulación
testProduccion().catch(console.error);
