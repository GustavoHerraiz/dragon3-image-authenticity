import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizador_v5.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const DIR_OUTPUT = './output_tests';
const RUTA_MASTER = path.join(DIR_OUTPUT, 'Mataro_MASTER.png');

if (!fs.existsSync(DIR_OUTPUT)) fs.mkdirSync(DIR_OUTPUT);

async function ejecutarPrueba(buffer, nombrePrueba) {
    const ext = nombrePrueba.includes('JPEG') ? 'jpg' : 'png';
    const rutaFinal = path.join(DIR_OUTPUT, `temp_${nombrePrueba}.${ext}`);

    // Aplicar formato según la prueba
    if (ext === 'jpg') {
        const q = parseInt(nombrePrueba.split('_Q')[1]);
        await sharp(buffer).jpeg({ quality: q }).toFile(rutaFinal);
    } else {
        await sharp(buffer).png().toFile(rutaFinal);
    }

    const tStart = process.hrtime.bigint();

    // --- EL JUICIO DEL ANALIZADOR V5 ---
    const res = await analizarImagenMBH(rutaFinal);

    const tEnd = process.hrtime.bigint();
    const tiempo = (Number(tEnd - tStart) / 1e6).toFixed(0);

    const icono = res.identificado ? (res.veredicto.includes('Original') ? '🏆' : '✅') : '🛡️';
    const idDisplay = res.identificado ? res.hash : '-------';

    console.log(
        `${icono} ${nombrePrueba.padEnd(20)} | ` +
        `ID: ${idDisplay.padEnd(8)} | ` +
        `${tiempo.padStart(6)}ms | ` +
        `${res.veredicto.padEnd(22)} | ` +
        `${res.cliente || '---'}`
    );
}

async function runFullTest() {
    const gen = new GeneradorMBH();
    const meta = await sharp(RUTA_ORIGINAL).metadata();

    // 🔍 FASE 0: PRUEBA CIEGA (ESENCIAL PARA VALIDEZ FORENSE)
    console.log("🔍 FASE 0: PRUEBA CIEGA (VALIDACIÓN DE FALSOS POSITIVOS)");
    console.log("-------------------------------------------------------");
    // Analizamos el archivo original ANTES de sellarlo para asegurar que está limpio
    const resCiega = await analizarImagenMBH(RUTA_ORIGINAL);

    if (resCiega.identificado) {
        console.log(`❌ ERROR CRÍTICO: Se ha detectado un sello fantasma en el original.`);
        console.log(`   ID: ${resCiega.hash} | Veredicto: ${resCiega.veredicto}`);
        console.log("El sistema no es fiable para análisis ciego. Abortando test.");
        return;
    }
    console.log("✅ ÉXITO: La imagen original está limpia. Procediendo al sellado...");
    console.log("-------------------------------------------------------\n");

    // 🚀 FASE 1: GENERACIÓN DE MUESTRA CONTROL
    console.log("🚀 FASE 1: GENERANDO ORIGINAL ATÓMICO CERTIFICADO...");
    // ID de control según BD: 000D760 (55136 decimal)
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_MASTER, { id_numerico: 0x000D760 });
    const imgRaw = fs.readFileSync(RUTA_MASTER);
    console.log("✅ Master generado en: " + RUTA_MASTER);

    console.log("\n⚖️  DRAGON3 V22 [MATARÓ FULL EDITION]: EL JUICIO FINAL\n");

    // --- NIVEL 1: COMPRESIÓN (RESILIENCIA EN JPG) ---
    console.log("--- NIVEL 1: COMPRESIÓN ---");
    for (let q of [80, 50, 10, 5]) {
        const buf = await sharp(imgRaw).jpeg({quality: q}).toBuffer();
        await ejecutarPrueba(buf, `JPEG_Q${q}`);
    }

    // --- NIVEL 2: ESCALA (EL RADAR DE ARMÓNICOS) ---
    console.log("\n--- NIVEL 2: ESCALA ---");
    for (let s of [0.75, 0.5, 0.3]) {
        const buf = await sharp(imgRaw).resize(Math.round(meta.width * s)).toBuffer();
        await ejecutarPrueba(buf, `RESIZE_${s}x`);
    }

    // --- NIVEL 3: SEÑAL Y COLOR ---
    console.log("\n--- NIVEL 3: SEÑAL Y COLOR ---");
    const grey = await sharp(imgRaw).greyscale().toBuffer();
    await ejecutarPrueba(grey, "GREYSCALE");

    const blur = await sharp(imgRaw).blur(1.5).toBuffer();
    await ejecutarPrueba(blur, "GAUSSIAN_BLUR");

    // --- NIVEL 4: GEOMETRÍA (INVARIANZA) ---
    console.log("\n--- NIVEL 4: GEOMETRÍA (FINAL BOSS) ---");

    const vFlip = await sharp(imgRaw).flip().toBuffer();
    await ejecutarPrueba(vFlip, "VERTICAL_FLIP");

    const hFlop = await sharp(imgRaw).flop().toBuffer();
    await ejecutarPrueba(hFlop, "HORIZONTAL_FLOP");

    // --- NIVEL 5: BATERÍA DE CROPS (DEEP SCAN) ---
    console.log("\n--- NIVEL 5: BATERÍA DE CROPS ---");
    const crops = [
        { l: 50, t: 50, n: "CROP_SYM_50px" },
        { l: 13, t: 27, n: "CROP_ASYM_13x27" },
        { l: 88, t: 5,  n: "CROP_ASYM_88x5" }
    ];
    for (let c of crops) {
        const cropBuf = await sharp(imgRaw).extract({
            left: c.l, top: c.t,
            width: meta.width - 100, height: meta.height - 100
        }).toBuffer();
        await ejecutarPrueba(cropBuf, c.n);
    }

    // --- NIVEL 6: ATAQUES ESPECIALES (DEFORMACIÓN) ---
    console.log("\n--- NIVEL 6: ATAQUES ESPECIALES ---");
    const squash = await sharp(imgRaw).resize(meta.width, Math.round(meta.height * 0.5)).toBuffer();
    await ejecutarPrueba(squash, "SQUASH_50%");

    const rotate90 = await sharp(imgRaw).rotate(90).toBuffer();
    await ejecutarPrueba(rotate90, "ROTATE_90_DEG");

    const tilt2 = await sharp(imgRaw).rotate(2).toBuffer();
    await ejecutarPrueba(tilt2, "TILT_2_DEGREES");

    console.log("\n🏁 JUICIO FINALIZADO. LA FÍSICA HA HABLADO.");
}

runFullTest().catch(console.error);
