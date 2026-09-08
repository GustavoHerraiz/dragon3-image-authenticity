import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { GeneradorMBH_v19 } from './generadorMBH_v19.js';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

// ============================================================================
// 🏛️ PROTOCOLO GÉNESIS: SELLADO + DOCUMENTACIÓN TOTAL
// ============================================================================

const IMAGEN_ORIGINAL = 'Atardecer.jpg';
const IMAGEN_SALIDA = 'Atardecer_DRAGON_MASTER_V19.png';
const REPORTE_SALIDA = 'MANIFIESTO_GENESIS_V19.md';

const METADATOS_GENESIS = {
    id: "DRAGON_GENESIS_001",
    hash_suffix: "50B3", // Nuestro ADN de prueba
    cliente: "Dragon3 Internal Labs",
    nivel_seguridad: "MAXIMUM_STARDUST_V19"
};

async function iniciarRitual() {
    console.log("=================================================================");
    console.log("🐲 INICIANDO RITUAL DE GÉNESIS (FULL AUDIT)");
    console.log("=================================================================");

    const tInicio = performance.now();
    let logMarkdown = `# 📜 MANIFIESTO DE GÉNESIS TECNOLÓGICA (V19)\n\n`;
    logMarkdown += `**Fecha:** ${new Date().toISOString()}\n`;
    logMarkdown += `**Operador:** Founder Dragon3\n`;
    logMarkdown += `**Motor de Inyección:** GeneradorMBH_v19 (Hybrid Geometry)\n\n`;

    // -----------------------------------------------------------------------
    // PASO 1: EL SELLADO
    // -----------------------------------------------------------------------
    console.log(`\n[PASO 1] 🔨 Forjando el Sello en ${IMAGEN_ORIGINAL}...`);

    if (!fs.existsSync(IMAGEN_ORIGINAL)) {
        console.error("❌ ERROR: No encuentro la imagen original Atardecer.jpg");
        process.exit(1);
    }

    const generador = new GeneradorMBH_v19();

    const firmaInyectada = await generador.sellarImagen(
        IMAGEN_ORIGINAL,
        IMAGEN_SALIDA,
        METADATOS_GENESIS
    );

    const tSellado = performance.now();
    console.log(`✅ IMAGEN SELLADA CREADA: ${IMAGEN_SALIDA}`);

    const bufferSalida = fs.readFileSync(IMAGEN_SALIDA);
    const hashFisico = crypto.createHash('sha256').update(bufferSalida).digest('hex');

    logMarkdown += `## 1. Fase de Inyección\n`;
    logMarkdown += `- **Imagen Base:** ${IMAGEN_ORIGINAL}\n`;
    logMarkdown += `- **Imagen Maestra Creada:** ${IMAGEN_SALIDA}\n`;
    logMarkdown += `- **ADN Inyectado (Hex):** \`${firmaInyectada}\`\n`;
    logMarkdown += `- **Huella Digital Archivo (SHA256):** \`${hashFisico}\`\n`;
    logMarkdown += `- **Tiempo de Procesado:** ${Math.round(tSellado - tInicio)}ms\n`;

    // -----------------------------------------------------------------------
    // PASO 2: DOCUMENTACIÓN DE GEOMETRÍA (COMPLETA)
    // -----------------------------------------------------------------------
    console.log(`\n[PASO 2] 📝 Calculando geometría teórica COMPLETA...`);

    const inputRaw = await import('sharp').then(s => s.default(IMAGEN_SALIDA).metadata());
    const centro = MotorEspacial.calcularCentroUnico(inputRaw.width, inputRaw.height, null, "DRAGON3_SECRET_KEY");
    const puntos = MotorEspacial.obtenerPuntosEspiral(inputRaw.width, inputRaw.height, centro);

    logMarkdown += `\n## 2. Auditoría de Geometría Espacial (Datos Técnicos)\n`;
    logMarkdown += `Configuración geométrica aplicada para resolución ${inputRaw.width}x${inputRaw.height}:\n`;
    logMarkdown += `- **Centro Fantasma:** X=${centro.x}, Y=${centro.y}\n`;
    logMarkdown += `- **Total Balizas Inyectadas:** ${puntos.length}\n`;

    // 👇 CAMBIO: AHORA IMPRIMIMOS TODAS LAS BALIZAS
    logMarkdown += `- **Listado Completo de Balizas:**\n`;
    puntos.forEach((p, i) => {
        logMarkdown += `  - Nodo ${i}: [X: ${p.x}, Y: ${p.y}]\n`;
    });

    // -----------------------------------------------------------------------
    // GUARDADO FINAL
    // -----------------------------------------------------------------------
    fs.writeFileSync(REPORTE_SALIDA, logMarkdown);
    console.log(`✅ MANIFIESTO CREADO: ${REPORTE_SALIDA} (Con ${puntos.length} puntos documentados)`);
    console.log("\n🐉 PROCESO FINALIZADO CORRECTAMENTE.");
}

iniciarRitual().catch(err => console.error("FATAL ERROR:", err));
