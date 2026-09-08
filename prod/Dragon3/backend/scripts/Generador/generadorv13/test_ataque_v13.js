/**
 * ============================================================================
 * TEST MAESTRO V13 - AUDITORÍA DIFERENCIAL (TWIN-BLOCKS)
 * ============================================================================
 * Verifica:
 * 1. Integridad Alpha (Vogel) - Geometría y Resistencia a Recortes.
 * 2. Supervivencia JPG (Diferencial Twin-Blocks) - Resistencia a Compresión.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { analizadorImagenMBH_v13 } from './analizadorMBH_v13.js';
import { GeneradorMBH_v13 } from './generadorMBH_v13.js';

const BASE_DIR = process.cwd();
const RUTA_ORIGINAL = path.join(BASE_DIR, 'Atardecer.jpg');
const RUTA_SELLADA = path.join(BASE_DIR, 'Atardecer_Sellada_V13.png');

// Rutas de ataque
const RUTA_RUIDO = path.join(BASE_DIR, 'Atardecer_V13_Ruido30.png');
const RUTA_CROP = path.join(BASE_DIR, 'Atardecer_V13_CropCorner.png');
const RUTA_JPG_HQ = path.join(BASE_DIR, 'Atardecer_V13_Compressed_HQ.jpg');
const RUTA_JPG_MED = path.join(BASE_DIR, 'Atardecer_V13_Compressed_MED.jpg');

const INFORME_FINAL = [];

// --- GENERADORES DE ATAQUES ---

async function ataqueRuidoAlpha(i, o, int) {
    const {data, info} = await sharp(i).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let k=0; k<data.length; k+=4) if(Math.random()<int) data[k+3]^=1;
    await sharp(data, {raw:info}).png().toFile(o);
}

async function ataqueCrop(i, o) {
    const m = await sharp(i).metadata();
    await sharp(i).extract({left:0, top:0, width:Math.floor(m.width/2), height:Math.floor(m.height/2)}).png().toFile(o);
}

async function ataqueJPG(i, o, q) {
    // Aplanamos transparencia (Alpha muere aquí) y comprimimos a JPG
    await sharp(i).flatten({background:'#fff'}).jpeg({quality:q, mozjpeg:true}).toFile(o);
}

// --- LÓGICA DE REPORTE Y ANÁLISIS ---

async function analizarYRegistrar(ruta, escenario) {
    console.log(`\n🔍 ANALIZANDO: ${escenario}...`);
    const res = await analizadorImagenMBH_v13(ruta);

    const ev = res.response?.evidencia_visual || {};
    const eva = res.response?.evaluacion || {};

    // Determinamos qué capa sobrevivió con lógica robusta
    // (Compatible con V13 antigua y V13 Diferencial nueva)
    let capa = "NINGUNA";
    if (ev.Capa_Alpha_Detectada || ev.Alpha_Ok) {
        capa = "🛡️ ALPHA (Vogel)";
    }
    // Si la capa diferencial detecta algo, tiene prioridad de rescate (JPG Survival)
    if (ev.Capa_Diferencial_Detectada) {
        capa = "⚖️ DIFERENCIAL (Twin-Blocks)";
    }

    // Normalización del nombre del cliente para el reporte (evita [object Object])
    const rawCliente = ev.Cliente_Identificado || ev.Cliente;
    const nombreCliente = (rawCliente && typeof rawCliente === 'object') ? rawCliente.cliente : (rawCliente || "Desconocido");

    INFORME_FINAL.push({
        Test: escenario,
        Veredicto: eva.veredicto,
        Capa_Activa: capa,
        Confianza: (eva.confianza*100).toFixed(0)+"%",
        Resultado: (eva.confianza > 0.5) ? "✅ ÉXITO" : "❌ FALLO",
        Cliente: nombreCliente
    });

    console.log(`   > Detectado: ${capa}`);
    console.log(`   > Cliente: ${nombreCliente}`);
    console.log(`   > Veredicto: ${eva.veredicto}`);
}

// --- EJECUCIÓN MAESTRA ---

async function ejecutarAuditoria() {
    console.log("\n" + "=".repeat(80));
    console.log("    🐉 TEST AUDITORÍA V13 - ESTRATEGIA DIFERENCIAL (TWIN-BLOCKS)");
    console.log("=".repeat(80));

    // 1. GENERAR
    console.log("\n[FASE 1] GENERANDO SÉLLO DIFERENCIAL...");
    const gen = new GeneradorMBH_v13();
    const sello = await gen.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA);
    console.log(`✅ Sello generado. Hash Corto: ${sello.hash_end}`);

    // 2. CONTROL
    await analizarYRegistrar(RUTA_SELLADA, "1. Control (Original)");

    // 3. ATAQUES
    console.log(`\n[FASE 2] ATAQUES DESTRUCTIVOS...`);

    console.log(`\n   ⚔️ Generando Ataque Ruido (30%)...`);
    await ataqueRuidoAlpha(RUTA_SELLADA, RUTA_RUIDO, 0.30);
    await analizarYRegistrar(RUTA_RUIDO, "2. Ruido Alpha 30%");

    console.log(`\n   ⚔️ Generando Ataque Crop (Esquina 25%)...`);
    await ataqueCrop(RUTA_SELLADA, RUTA_CROP);
    await analizarYRegistrar(RUTA_CROP, "3. Crop Esquina (Geometría)");

    // EL MOMENTO DE LA VERDAD PARA TWIN-BLOCKS
    console.log(`\n   ⚔️ Generando Ataque JPG (Calidad 90) - ELIMINA ALPHA...`);
    await ataqueJPG(RUTA_SELLADA, RUTA_JPG_HQ, 90);
    await analizarYRegistrar(RUTA_JPG_HQ, "4. JPG Calidad 90 (HQ)");

    console.log(`\n   ⚔️ Generando Ataque JPG (Calidad 70) - ESTRÉS DIFERENCIAL...`);
    await ataqueJPG(RUTA_SELLADA, RUTA_JPG_MED, 70);
    await analizarYRegistrar(RUTA_JPG_MED, "5. JPG Calidad 70 (Med)");

    // 4. INFORME
    console.log("\n\n" + "=".repeat(90));
    console.log("📊 INFORME FINAL DE ROBUSTEZ (TWIN-BLOCKS)");
    console.log("=".repeat(90));
    console.table(INFORME_FINAL);

    // Conclusión automática
    const fallos = INFORME_FINAL.filter(i => i.Resultado.includes("FALLO")).length;
    console.log("=".repeat(90));
    if (fallos === 0) {
        console.log("\n🏆 CONCLUSIÓN: EL SISTEMA V13 ES INVENCIBLE. La capa diferencial resiste JPG.");
    } else {
        console.log(`\n⚠️ CONCLUSIÓN: Se detectaron ${fallos} fallos. Ajustar intensidad diferencial.`);
    }
    console.log("\n");
}

ejecutarAuditoria().catch(e => console.error("Error crítico en test:", e));
