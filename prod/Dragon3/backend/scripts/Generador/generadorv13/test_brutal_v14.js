/**
 * ============================================================================
 * 💀 DRAGON3 - TEST BRUTAL V14 (STRESS TEST & LIMIT FINDER)
 * ============================================================================
 * Objetivo: Encontrar el punto de ruptura exacto de las capas Alpha y Diferencial.
 * Estrategia: "In Crescendo" de destrucción.
 */

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
// Importamos los módulos V13 que ya contienen la lógica V14 (Twin-Blocks)
import { analizadorImagenMBH_v13 } from './analizadorMBH_v13.js';
import { GeneradorMBH_v13 } from './generadorMBH_v13.js';

const BASE_DIR = process.cwd();
const RUTA_ORIGINAL = path.join(BASE_DIR, 'Atardecer.jpg');
const RUTA_SELLADA = path.join(BASE_DIR, 'Atardecer_Sellada_V14.png');
const DIR_RESULTADOS = path.join(BASE_DIR, 'resultados_brutal');

// Aseguramos directorio de resultados
try { await fs.mkdir(DIR_RESULTADOS); } catch (e) {}

const INFORME = [];

// ============================================================================
// 🛠️ GENERADORES DE ATAQUES
// ============================================================================

async function ataqueJPG(input, nombre, calidad) {
    const salida = path.join(DIR_RESULTADOS, `${nombre}.jpg`);
    await sharp(input)
        .flatten({ background: '#ffffff' }) // Alpha muere aquí
        .jpeg({ quality: calidad, mozjpeg: true })
        .toFile(salida);
    return salida;
}

async function ataqueWebP(input, nombre, calidad) {
    const salida = path.join(DIR_RESULTADOS, `${nombre}.webp`);
    await sharp(input)
        .webp({ quality: calidad })
        .toFile(salida);
    return salida;
}

async function ataqueCrop(input, nombre, porcentajeRecorte) {
    // porcentajeRecorte 0.25 significa que quitamos el 25%, queda el 75%
    const salida = path.join(DIR_RESULTADOS, `${nombre}.png`);
    const m = await sharp(input).metadata();

    // Recorte central
    const anchoNuevo = Math.floor(m.width * (1 - porcentajeRecorte));
    const altoNuevo = Math.floor(m.height * (1 - porcentajeRecorte));
    const left = Math.floor((m.width - anchoNuevo) / 2);
    const top = Math.floor((m.height - altoNuevo) / 2);

    await sharp(input)
        .extract({ left, top, width: anchoNuevo, height: altoNuevo })
        .png()
        .toFile(salida);
    return salida;
}

async function ataqueHibrido(input, nombre, cropPct, jpgQual) {
    // Recorte + Compresión (El asesino de sellos)
    const salida = path.join(DIR_RESULTADOS, `${nombre}.jpg`);
    const m = await sharp(input).metadata();

    const anchoNuevo = Math.floor(m.width * (1 - cropPct));
    const altoNuevo = Math.floor(m.height * (1 - cropPct));

    await sharp(input)
        .extract({ left: 0, top: 0, width: anchoNuevo, height: altoNuevo }) // Esquina
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: jpgQual })
        .toFile(salida);
    return salida;
}

async function ataqueResize(input, nombre, escala) {
    // Escalar la imagen (ej: 0.5 es 50% del tamaño)
    const salida = path.join(DIR_RESULTADOS, `${nombre}.jpg`);
    const m = await sharp(input).metadata();
    await sharp(input)
        .resize(Math.round(m.width * escala))
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toFile(salida);
    return salida;
}

// ============================================================================
// 🕵️ MOTOR DE ANÁLISIS
// ============================================================================

async function ejecutarPrueba(ruta, nombreTest, tipoAtaque) {
    process.stdout.write(`running: ${nombreTest.padEnd(40)} `);

    try {
        const res = await analizadorImagenMBH_v13(ruta);
        const ev = res.response?.evidencia_visual || {};
        const eva = res.response?.evaluacion || {};

        // Identificación REAL de la capa que salvó el día
        let capa = "❌ NINGUNA";

        // Prioridad: ¿Quién dio la identidad?
        if (ev.Cliente_Identificado) {
            // Si hay diferencial detectado y NO hay Alpha central fuerte, fue Diferencial
            if (ev.Capa_Diferencial_Detectada && !ev.Capa_Alpha_Detectada) {
                capa = "⚖️ DIFERENCIAL";
            }
            // Si el Modo NASA está activo (Alpha ayudó a Diferencial)
            else if (ev.Modo_NASA_Activado) {
                capa = "🚀 NASA (Alpha+Diff)";
            }
            // Si solo Alpha detectó
            else if (ev.Capa_Alpha_Detectada) {
                capa = "🛡️ ALPHA (Vogel)";
            }
            // Caso híbrido
            else if (ev.Capa_Diferencial_Detectada) {
                capa = "⚖️ DIFERENCIAL";
            }
        }
        // Si no hay cliente, pero hay geometría
        else if (ev.Capa_Alpha_Detectada) {
             capa = "⚠️ ALPHA (Anon)";
        }

        const exito = eva.veredicto === "EXITO";
        const confPct = (eva.confianza * 100).toFixed(0) + "%";

        if (exito) console.log(`✅ [${confPct}] ${capa}`);
        else console.log(`❌ [FAILED]`);

        INFORME.push({
            Categoria: tipoAtaque,
            Test: nombreTest,
            Resultado: exito ? "EXITO" : "FALLO",
            Capa: capa,
            Confianza: confPct,
            Cliente: ev.Cliente_Identificado?.cliente || "N/A"
        });

    } catch (e) { console.log(`❌ ERROR: ${e.message}`); }
}

// ============================================================================
// 🚀 ORQUESTADOR
// ============================================================================

async function iniciarTortura() {
    console.log("\n" + "=".repeat(80));
    console.log("💀 DRAGON3 - TEST BRUTAL V14 (TWIN-BLOCKS + VOGEL)");
    console.log("=".repeat(80));

    // 1. GENERACIÓN
    console.log("\n[FASE 1] Generando Sello Máster...");
    const gen = new GeneradorMBH_v13();
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA);

    // 2. VERIFICACIÓN BASE
    console.log("\n[FASE 2] Verificación Inicial...");
    await ejecutarPrueba(RUTA_SELLADA, "00. Control Original", "CONTROL");

    // 3. LA TORTURA (JPG - Presión sobre Twin-Blocks)
    console.log("\n[FASE 3] Serie Compresión JPG (Busca el límite Diferencial)...");
    const nivelesJPG = [95, 80, 70, 60, 50, 40, 30, 10];
    for (const q of nivelesJPG) {
        const path = await ataqueJPG(RUTA_SELLADA, `jpg_q${q}`, q);
        await ejecutarPrueba(path, `01. JPG Calidad ${q}`, "COMPRESION");
    }

    // 4. LA GUILLOTINA (Crop - Presión sobre Vogel)
    console.log("\n[FASE 4] Serie Recorte (Busca el límite Geométrico)...");
    const recortes = [0.10, 0.25, 0.50, 0.75, 0.90]; // 90% recortado = queda 10%
    for (const r of recortes) {
        const path = await ataqueCrop(RUTA_SELLADA, `crop_${r*100}`, r);
        await ejecutarPrueba(path, `02. Crop -${r*100}% (Queda ${(1-r)*100}%)`, "RECORTE");
    }

    // 5. FORMATOS EXÓTICOS
    console.log("\n[FASE 5] Serie Formatos...");
    const pWebP = await ataqueWebP(RUTA_SELLADA, "fmt_webp", 75);
    await ejecutarPrueba(pWebP, "03. WebP Calidad 75", "FORMATO");

    // 6. ESCALADO (El talón de Aquiles de Stardust actual)
    // Nota: Esperamos que Stardust falle aquí porque usa coordenadas absolutas.
    // Alpha debería sobrevivir si es lo suficientemente grande.
    console.log("\n[FASE 6] Serie Escalado (Resize)...");
    const pResize = await ataqueResize(RUTA_SELLADA, "resize_50", 0.5);
    await ejecutarPrueba(pResize, "04. Resize 50%", "ESCALADO");

    // 7. HÍBRIDO FINAL
    console.log("\n[FASE 7] Ataque Híbrido (Crop 50% + JPG 60)...");
    const pHybrid = await ataqueHibrido(RUTA_SELLADA, "hybrid_death", 0.50, 60);
    await ejecutarPrueba(pHybrid, "05. Crop 50% + JPG 60", "HIBRIDO");

    // REPORTE
    console.log("\n\n" + "=".repeat(90));
    console.log("📊 INFORME FINAL DE RESISTENCIA");
    console.log("=".repeat(90));
    console.table(INFORME);

    // Análisis de límites
    const failJPG = INFORME.filter(i => i.Categoria === "COMPRESION" && i.Resultado === "FALLO")[0];
    const failCrop = INFORME.filter(i => i.Categoria === "RECORTE" && i.Resultado === "FALLO")[0];

    console.log("\n📉 LÍMITES ENCONTRADOS:");
    console.log(`   ► Compresión JPG rompe al: ${failJPG ? failJPG.Test : "NUNCA (Invencible)"}`);
    console.log(`   ► Recorte rompe al:        ${failCrop ? failCrop.Test : "NUNCA (Invencible)"}`);
    console.log("=".repeat(90) + "\n");
}

iniciarTortura().catch(console.error);
