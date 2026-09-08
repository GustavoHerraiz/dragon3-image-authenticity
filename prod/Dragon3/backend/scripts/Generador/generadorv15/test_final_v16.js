/**
 * ============================================================================
 * 💀 DRAGON3 - TEST FINAL V16 (AUDITORÍA COMPLETA "END-TO-END")
 * ============================================================================
 * Flujo de Trabajo:
 * 1. GENERACIÓN: Inyecta el sello Nano-Hydra (Tiles 256px) en una imagen limpia.
 * 2. CONTROL: Verifica que la imagen generada es detectable (PNG Original).
 * 3. ATAQUE: Aplica combinaciones letales de Recorte Geométrico + Compresión JPG.
 * 4. INFORME: Diagnóstico detallado de supervivencia.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeneradorMBH_v15 } from './generadorMBH_v15.js';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

// --- CONFIGURACIÓN ---
const BASE_DIR = process.cwd();
const IMAGEN_ENTRADA = path.join(BASE_DIR, 'Atardecer.jpg'); // Imagen virgen
const IMAGEN_MASTER = path.join(BASE_DIR, 'Atardecer_Hydra_Final.png'); // Imagen sellada
const DIR_SALIDA = path.join(BASE_DIR, 'pruebas_v16_final');

if (!fs.existsSync(DIR_SALIDA)) fs.mkdirSync(DIR_SALIDA);

// --- UTILIDADES ---
async function generarEscenario(nombre, crop, calidadJPG) {
    const output = path.join(DIR_SALIDA, nombre);
    const image = sharp(IMAGEN_MASTER);
    const meta = await image.metadata();

    // 1. Geometría (Tijeras)
    let left, top, width, height;

    if (crop.tipo === 'centro') {
        width = Math.floor(meta.width * 0.5);
        height = Math.floor(meta.height * 0.5);
        left = Math.floor((meta.width - width) / 2);
        top = Math.floor((meta.height - height) / 2);
    } else if (crop.tipo === 'esquina') {
        width = 800; height = 800;
        left = 0; top = 0;
    } else if (crop.tipo === 'vertical') {
        width = 600; height = meta.height;
        left = Math.floor(meta.width / 2) - 300; top = 0;
    } else if (crop.tipo === 'mini') {
        width = 600; height = 600;
        left = Math.floor(meta.width * 0.6); top = Math.floor(meta.height * 0.6);
    }

    // 2. Compresión (Prensa Hidráulica)
    await image
        .extract({ left, top, width, height })
        .jpeg({ quality: calidadJPG, chromaSubsampling: '4:2:0' }) // Destrucción de color
        .toFile(output);

    return { path: output, meta: { w: width, h: height } };
}

async function ejecutarAuditoria() {
    console.log("\n============================================================");
    console.log("🐉 DRAGON3 - AUDITORÍA FINAL DE SISTEMAS V16");
    console.log("============================================================");

    // -------------------------------------------------------------------------
    // FASE 1: GENERACIÓN (Factory)
    // -------------------------------------------------------------------------
    console.log("\n[FASE 1] 🧬 Generando Sello Nano-Hydra (256px)...");
    try {
        const generador = new GeneradorMBH_v15();
        await generador.sellarImagen(IMAGEN_ENTRADA, IMAGEN_MASTER);
    } catch (e) {
        console.error("❌ Error Fatal en Generación:", e.message);
        return;
    }

    // -------------------------------------------------------------------------
    // FASE 2: CONTROL DE CALIDAD (Baseline)
    // -------------------------------------------------------------------------
    console.log("\n[FASE 2] 🔍 Verificación de Control (Imagen Master)...");
    // Silenciamos logs internos para el control
    const logBackup = console.log;
    // console.log = () => {};

    const control = await analizadorImagenMBH_v15(IMAGEN_MASTER);
    // console.log = logBackup;

    const evControl = control.response.evidencia_visual;
    if (!evControl.Cliente_Identificado) {
        console.error("❌ ALERTA CRÍTICA: La imagen Master NO es detectable. Abortando.");
        console.log("   Causa:", control.response.mensaje);
        return;
    }
    console.log(`   ✅ CONTROL PASADO: ${evControl.Cliente_Identificado.cliente}`);
    console.log(`   📊 Confianza Base: ${(evControl.Mejor_Confianza*100).toFixed(1)}% | Hits: ${evControl.Hits_Totales}`);

    // -------------------------------------------------------------------------
    // FASE 3: TORTURA (Hybrid Warfare)
    // -------------------------------------------------------------------------
    console.log("\n[FASE 3] ⚔️  Iniciando Protocolo de Guerra Híbrida...");

    const escenarios = [
        {
            nombre: "01_Estandar.jpg",
            desc: "🟢 Recorte 50% + JPG 80",
            crop: { tipo: 'centro' }, calidad: 80
        },
        {
            nombre: "02_RedesSociales.jpg",
            desc: "🟡 Esquina 800px + JPG 60",
            crop: { tipo: 'esquina' }, calidad: 60
        },
        {
            nombre: "03_AltaPresion.jpg",
            desc: "🟠 Tira Vertical + JPG 40",
            crop: { tipo: 'vertical' }, calidad: 40
        },
        {
            nombre: "04_Pesadilla.jpg",
            desc: "🔴 Mini Fragmento + JPG 30",
            crop: { tipo: 'mini' }, calidad: 30
        }
    ];

    const informe = [];

    for (const test of escenarios) {
        process.stdout.write(`   Testing: ${test.desc}... `);

        // A. Atacar
        const ataque = await generarEscenario(test.nombre, test.crop, test.calidad);

        // B. Analizar (Hunter V15.4)
        // console.log = () => {}; // Silencio táctico
        const resultado = await analizadorImagenMBH_v15(ataque.path);
        // console.log = logBackup;

        // C. Evaluar
        const ev = resultado.response.evidencia_visual;
        const identificado = ev.Cliente_Identificado && ev.Cliente_Identificado.hash_suffix === 'd760';

        // Diagnóstico rápido en línea
        if (identificado) console.log("✅ VIVO");
        else console.log("❌ MUERTO");

        informe.push({
            Escenario: test.desc,
            "Geometria": `${ataque.meta.w}x${ataque.meta.h}px`,
            "Compresion": `JPG Q${test.calidad}`,
            Resultado: identificado ? "EXITO" : "FALLO",
            Confianza: ((ev.Mejor_Confianza || 0) * 100).toFixed(1) + "%",
            Hits: ev.Hits_Totales || 0
        });
    }

    // -------------------------------------------------------------------------
    // FASE 4: CONCLUSIONES
    // -------------------------------------------------------------------------
    console.log("\n============================================================");
    console.log("📊 INFORME FINAL DE RESISTENCIA HÍBRIDA (V16)");
    console.log("============================================================");
    console.table(informe);

    // Análisis automático
    const fallos = informe.filter(i => i.Resultado === "FALLO").length;
    console.log("\n📋 DIAGNÓSTICO DEL SISTEMA:");

    if (fallos === 0) {
        console.log("🏆 GRADO MILITAR: El sistema es invulnerable en los escenarios probados.");
        console.log("   La combinación de Nano-Tiles (256px) y Hunter Scan ha funcionado.");
    } else if (fallos <= 1) {
        console.log("✨ GRADO COMERCIAL EXCELENTE: Resistencia muy alta.");
        console.log("   Solo ha fallado en condiciones extremas de destrucción.");
    } else {
        console.log("⚠️ GRADO ESTÁNDAR: Se detectan vulnerabilidades.");
        console.log("   La reducción del Tile Size puede haber debilitado la resistencia al JPG.");
    }
    console.log("============================================================\n");
}

ejecutarAuditoria().catch(console.error);
