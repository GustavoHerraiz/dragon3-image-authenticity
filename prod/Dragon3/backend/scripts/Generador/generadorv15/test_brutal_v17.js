/**
 * ============================================================================
 * 💀 DRAGON3 - TEST BRUTAL V17 (EL CAOS TOTAL)
 * ============================================================================
 * Objetivo: Destruir a Nano-Hydra mediante:
 * 1. ROTACIÓN (Giros arbitrarios que rompen la rejilla de píxeles).
 * 2. DEFORMACIÓN (Cambios de aspecto que simulan perspectiva).
 * 3. COMBO FINAL: Recorte + Giro + Deformación + JPG.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH_v15 } from './generadorMBH_v15.js';
import { analizadorImagenMBH_v15 } from './analizadorMBH_v15.js';

// --- CONFIGURACIÓN ---
const BASE_DIR = process.cwd();
const IMAGEN_ENTRADA = path.join(BASE_DIR, 'Atardecer.jpg');
const IMAGEN_MASTER = path.join(BASE_DIR, 'Atardecer_Hydra_Final.png');
const DIR_SALIDA = path.join(BASE_DIR, 'pruebas_v17_caos');

if (!fs.existsSync(DIR_SALIDA)) fs.mkdirSync(DIR_SALIDA);

// --- MOTOR DE CAOS ---
async function generarCaos(nombre, params) {
    const output = path.join(DIR_SALIDA, nombre);
    let pipeline = sharp(IMAGEN_MASTER);

    // 1. ROTACIÓN (El gran enemigo de las rejillas)
    if (params.rotacion) {
        // Rotamos y rellenamos el fondo de blanco para no confundir con negro=null
        pipeline = pipeline.rotate(params.rotacion, { background: '#ffffff' });
    }

    // 2. DEFORMACIÓN / PERSPECTIVA SIMULADA
    // Forzamos un cambio de Aspect Ratio (aplastamos la imagen)
    if (params.deformacion) {
        const meta = await pipeline.metadata();
        const newW = Math.floor(meta.width * params.deformacion.x);
        const newH = Math.floor(meta.height * params.deformacion.y);
        pipeline = pipeline.resize(newW, newH, { fit: 'fill' });
    }

    // 3. RECORTE (Siempre presente)
    // Recortamos el centro resultante para quitar bordes generados
    const metaBuffer = await pipeline.toBuffer({ resolveWithObject: true });
    const w = metaBuffer.info.width;
    const h = metaBuffer.info.height;

    const cropW = params.cropSize || 800;
    const cropH = params.cropSize || 800;

    // Aseguramos que el crop cabe
    if (w > cropW && h > cropH) {
        pipeline = sharp(metaBuffer.data).extract({
            left: Math.floor((w - cropW) / 2),
            top: Math.floor((h - cropH) / 2),
            width: cropW,
            height: cropH
        });
    }

    // 4. COMPRESIÓN FINAL
    await pipeline
        .jpeg({ quality: params.calidadJPG || 80 })
        .toFile(output);

    return output;
}

async function ejecutarTestCaos() {
    console.log("\n============================================================");
    console.log("🌪️ DRAGON3 - TEST V17: ROTACIÓN Y DEFORMACIÓN");
    console.log("============================================================");

    // FASE 0: Asegurar Master
    if (!fs.existsSync(IMAGEN_MASTER)) {
        console.log("⚡ Generando Master...");
        const gen = new GeneradorMBH_v15();
        await gen.sellarImagen(IMAGEN_ENTRADA, IMAGEN_MASTER);
    }

    // FASE 1: LOS ESCENARIOS DEL INFIERNO
    const escenarios = [
        {
            nombre: "01_Giro_Leve.jpg",
            desc: "📐 Giro 5° + Recorte + JPG 90",
            params: { rotacion: 5, calidadJPG: 90, cropSize: 1000 }
        },
        {
            nombre: "02_Giro_Letal.jpg",
            desc: "🔄 Giro 45° (Rompe-Rejillas) + JPG 80",
            params: { rotacion: 45, calidadJPG: 80, cropSize: 800 }
        },
        {
            nombre: "03_Perspectiva.jpg",
            desc: "🥴 Deformación (Aplastado 0.8x) + JPG 70",
            params: { deformacion: { x: 0.8, y: 1.0 }, calidadJPG: 70, cropSize: 800 }
        },
        {
            nombre: "04_Caos_Total.jpg",
            desc: "💀 Giro 15° + Aplastado + JPG 50",
            params: { rotacion: 15, deformacion: { x: 0.9, y: 1.1 }, calidadJPG: 50, cropSize: 600 }
        }
    ];

    const informe = [];

    for (const test of escenarios) {
        process.stdout.write(`⚔️  Atacando: ${test.desc}... `);

        // A. Generar
        const ruta = await generarCaos(test.nombre, test.params);

        // B. Analizar (Usando el Hunter V15.4 actual)
        // Nota: El Hunter actual escanea XY, pero NO escanea ángulos.
        // Es muy probable que falle en giros grandes. Es lo esperado.
        const resultado = await analizadorImagenMBH_v15(ruta);
        const ev = resultado.response.evidencia_visual;
        const exito = ev.Cliente_Identificado && ev.Cliente_Identificado.hash_suffix === 'd760';

        if (exito) console.log("✅ VIVO");
        else console.log("❌ MUERTO");

        informe.push({
            Prueba: test.nombre,
            Ataque: test.desc,
            Resultado: exito ? "EXITO" : "FALLO",
            Confianza: ((ev.Mejor_Confianza || 0) * 100).toFixed(1) + "%",
            Hits: ev.Hits_Totales || 0
        });
    }

    console.log("\n============================================================");
    console.log("📊 RESULTADOS DE LA TORTURA GEOMÉTRICA");
    console.log("============================================================");
    console.table(informe);
}

ejecutarTestCaos().catch(console.error);
