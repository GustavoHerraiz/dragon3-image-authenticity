/**
 * ============================================================================
 * 🐲 DRAGON3 - TEST DEFINITIVO V18 (AUDITORÍA TOTAL "END-TO-END")
 * ============================================================================
 * El examen final. Ejecuta todas las fases de ataque conocidas:
 * 1. GENERACIÓN: Inyección fresca del sello Nano-Hydra.
 * 2. CONTROL: Verificación de línea base.
 * 3. NIVEL 1 (V16): Guerra Híbrida (Recorte + Compresión JPG).
 * 4. NIVEL 2 (V17): Tortura Geométrica (Rotación + Deformación).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v15 } from './generadorMBH_v15.js';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

// --- CONFIGURACIÓN ---
const BASE_DIR = process.cwd();
const IMAGEN_ENTRADA = path.join(BASE_DIR, 'Atardecer.jpg'); // Tu imagen original
const IMAGEN_MASTER = path.join(BASE_DIR, 'Atardecer_Hydra_Master.png');
const DIR_SALIDA = path.join(BASE_DIR, 'pruebas_v18_total');

if (!fs.existsSync(DIR_SALIDA)) fs.mkdirSync(DIR_SALIDA);

// --- UTILIDAD DE ATAQUE UNIVERSAL ---
async function generarAtaque(nombre, params) {
    const output = path.join(DIR_SALIDA, nombre);
    let pipeline = sharp(IMAGEN_MASTER);

    // 1. ROTACIÓN (Si aplica)
    if (params.rotacion) {
        pipeline = pipeline.rotate(params.rotacion, { background: '#ffffff' });
    }

    // 2. DEFORMACIÓN (Si aplica)
    if (params.deformacion) {
        const meta = await pipeline.metadata();
        const newW = Math.floor(meta.width * params.deformacion.x);
        const newH = Math.floor(meta.height * params.deformacion.y);
        pipeline = pipeline.resize(newW, newH, { fit: 'fill' });
    }

    // 3. RECORTE (Calculado dinámicamente)
    const metaBuffer = await pipeline.toBuffer({ resolveWithObject: true });
    const w = metaBuffer.info.width;
    const h = metaBuffer.info.height;

    let left, top, width, height;

    if (params.cropType === 'centro') {
        width = Math.floor(w * 0.5); height = Math.floor(h * 0.5);
        left = Math.floor((w - width) / 2); top = Math.floor((h - height) / 2);
    } else if (params.cropType === 'esquina') {
        width = 800; height = 800; left = 0; top = 0;
    } else if (params.cropType === 'vertical') {
        width = 600; height = h; left = Math.floor(w / 2) - 300; top = 0;
    } else if (params.cropType === 'mini') {
        width = 600; height = 600; left = Math.floor(w * 0.6); top = Math.floor(h * 0.6);
    } else if (params.cropSize) { // Para ataques V17 custom
        width = params.cropSize; height = params.cropSize;
        left = Math.floor((w - width) / 2); top = Math.floor((h - height) / 2);
    } else { // Default fallback
        width = w; height = h; left = 0; top = 0;
    }

    // Asegurar límites
    if (width > w) width = w; if (height > h) height = h;
    if (left + width > w) left = w - width; if (top + height > h) top = h - height;

    // 4. COMPRESIÓN FINAL
    await sharp(metaBuffer.data).extract({ left, top, width, height })
        .jpeg({ quality: params.calidadJPG || 80 })
        .toFile(output);

    return output;
}

async function ejecutarAuditoriaTotal() {
    console.log("\n============================================================");
    console.log("🐉 DRAGON3 - AUDITORÍA DEFINITIVA V18 (TOTAL WAR)");
    console.log("============================================================");

    // -------------------------------------------------------------------------
    // FASE 1: GENERACIÓN (Factory)
    // -------------------------------------------------------------------------
    console.log("\n[FASE 1] 🧬 Generando Master Nano-Hydra...");
    try {
        const generador = new GeneradorMBH_v15();
        await generador.sellarImagen(IMAGEN_ENTRADA, IMAGEN_MASTER);
    } catch (e) {
        console.error("❌ Error Fatal Generación:", e.message); return;
    }

    // -------------------------------------------------------------------------
    // FASE 2: CONTROL DE CALIDAD
    // -------------------------------------------------------------------------
    console.log("\n[FASE 2] 🔍 Verificando Master...");
    // console.log = () => {}; // Silenciar logs internos
    const control = await analizadorImagenMBH_v15(IMAGEN_MASTER);
    // console.log = process.stdout.write.bind(process.stdout); // Restaurar

    if (!control.response.evidencia_visual.Cliente_Identificado) {
        console.error("❌ EL MASTER NO ES LEGIBLE. ABORTANDO."); return;
    }
    console.log(`   ✅ CONTROL OK. Confianza: ${(control.response.evidencia_visual.Mejor_Confianza*100).toFixed(1)}%`);

    // -------------------------------------------------------------------------
    // DEFINICIÓN DE ESCENARIOS (V16 + V17)
    // -------------------------------------------------------------------------
    const escenarios = [
        // --- NIVEL 1: GUERRA HÍBRIDA (Recorte + JPG) ---
        { id: "V16_01", desc: "🟢 Recorte 50% + JPG 80", params: { cropType: 'centro', calidadJPG: 80 } },
        { id: "V16_02", desc: "🟡 Esquina 800px + JPG 60", params: { cropType: 'esquina', calidadJPG: 60 } },
        { id: "V16_03", desc: "🟠 Tira Vertical + JPG 40", params: { cropType: 'vertical', calidadJPG: 40 } },
        { id: "V16_04", desc: "🔴 Mini Fragmento + JPG 30", params: { cropType: 'mini', calidadJPG: 30 } },

        // --- NIVEL 2: TORTURA GEOMÉTRICA (Giros + Deformación) ---
        { id: "V17_01", desc: "📐 Giro 5° + Recorte + JPG 90", params: { rotacion: 5, cropSize: 1000, calidadJPG: 90 } },
        { id: "V17_02", desc: "🔄 Giro 45° + JPG 80", params: { rotacion: 45, cropSize: 800, calidadJPG: 80 } },
        { id: "V17_03", desc: "🥴 Deformación (0.8x) + JPG 70", params: { deformacion: { x: 0.8, y: 1.0 }, cropSize: 800, calidadJPG: 70 } },
        { id: "V17_04", desc: "💀 CAOS (Giro+Deform+JPG)", params: { rotacion: 15, deformacion: { x: 0.9, y: 1.1 }, cropSize: 600, calidadJPG: 50 } }
    ];

    // -------------------------------------------------------------------------
    // FASE 3: EJECUCIÓN DEL TEST
    // -------------------------------------------------------------------------
    console.log("\n[FASE 3] ⚔️  Ejecutando Batería de Pruebas...");
    const informe = [];

    for (const test of escenarios) {
        process.stdout.write(`   [${test.id}] ${test.desc}... `);

        // Generar
        const ruta = await generarAtaque(`${test.id}.jpg`, test.params);

        // Analizar
        // console.log = () => {};
        const resultado = await analizadorImagenMBH_v15(ruta);
        // console.log = process.stdout.write.bind(process.stdout);

        const ev = resultado.response.evidencia_visual;
        const exito = ev.Cliente_Identificado && ev.Cliente_Identificado.hash_suffix === 'd760';

        if (exito) console.log("✅ VIVO");
        else console.log("❌ MUERTO");

        informe.push({
            ID: test.id,
            Prueba: test.desc,
            Resultado: exito ? "EXITO" : "FALLO",
            Confianza: ((ev.Mejor_Confianza || 0) * 100).toFixed(1) + "%",
            Hits: ev.Hits_Totales || 0
        });
    }

    // -------------------------------------------------------------------------
    // FASE 4: INFORME FINAL
    // -------------------------------------------------------------------------
    console.log("\n============================================================");
    console.log("📊 INFORME DE POTENCIA REAL (NANO-HYDRA V15.4)");
    console.log("============================================================");
    console.table(informe);

    // Resumen Ejecutivo
    const total = escenarios.length;
    const exitos = informe.filter(i => i.Resultado === "EXITO").length;
    const tasa = (exitos / total) * 100;

    console.log(`\n📈 TASA DE SUPERVIVENCIA GLOBAL: ${tasa.toFixed(1)}% (${exitos}/${total})`);

    console.log("\n🔍 ANÁLISIS DE DEBILIDADES:");
    if (informe.find(i => i.ID === "V17_02" && i.Resultado === "EXITO")) {
        console.log("   ✅ SORPRESA: Resiste giros de 45° (Probablemente por alineación diagonal de bloques).");
    }
    if (informe.find(i => i.ID === "V17_03" && i.Resultado === "FALLO")) {
        console.log("   ⚠️ PUNTO DÉBIL CONFIRMADO: Deformación de Aspect Ratio (Aplastamiento).");
        console.log("      -> El sistema Twin-Blocks depende de que un cuadrado sea cuadrado.");
    }

    console.log("\n🏁 CONCLUSIÓN DEL INGENIERO:");
    if (tasa >= 75) console.log("   El sistema es EXCELENTE para uso real (Web, Redes, Móvil).");
    else if (tasa >= 50) console.log("   El sistema es BUENO pero vulnerable a edición maliciosa avanzada.");
    else console.log("   El sistema necesita revisión profunda en geometría.");
    console.log("============================================================\n");
}

ejecutarAuditoriaTotal().catch(console.error);
