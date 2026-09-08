import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizador_v5.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const DIR_OUT = './output_ultimate';
const RUTA_MASTER = path.join(DIR_OUT, 'Mataro_MASTER_ULTIMATE.png');
const CLIENTE_TEST = { id_numerico: 0x000D760, cliente: "Blade Corporation", obra: "Ultimate Mataró Test" };

if (!fs.existsSync(DIR_OUT)) fs.mkdirSync(DIR_OUT);

async function ejecutarAuditoria() {
    console.log("🐉 DRAGON3 V22: INICIANDO AUDITORÍA TOTAL (25 PRUEBAS)");
    const gen = new GeneradorMBH();
    const resultados = [];

    // --- FASE 0: PRUEBA CIEGA ---
    const resCiega = await analizarImagenMBH(RUTA_ORIGINAL);
    resultados.push({ Prueba: "0. PRUEBA CIEGA", Res: !resCiega.identificado ? "✅ LIMPIO" : "❌ FALSO POS", ID: resCiega.hash || "---", T: "N/A" });

    // --- FASE 1: GENERACIÓN ---
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_MASTER, CLIENTE_TEST);
    const master = fs.readFileSync(RUTA_MASTER);
    const meta = await sharp(master).metadata();

    // --- DEFINICIÓN DE LA BATERÍA DE ATAQUES ---
    const bateria = [
        // NIVEL 1: COMPRESIÓN
        { n: "1. JPEG_Q80", f: s => s.jpeg({quality: 80}) },
        { n: "1. JPEG_Q50", f: s => s.jpeg({quality: 50}) },
        { n: "1. JPEG_Q10", f: s => s.jpeg({quality: 10}) },
        { n: "1. JPEG_Q5",  f: s => s.jpeg({quality: 5}) },
        // NIVEL 2: ESCALA
        { n: "2. RESIZE_0.75x", f: s => s.resize(Math.round(meta.width * 0.75)) },
        { n: "2. RESIZE_0.5x",  f: s => s.resize(Math.round(meta.width * 0.5)) },
        { n: "2. RESIZE_0.3x",  f: s => s.resize(Math.round(meta.width * 0.3)) },
        // NIVEL 3: SEÑAL
        { n: "3. GREYSCALE", f: s => s.greyscale() },
        { n: "3. GAUSSIAN_BLUR", f: s => s.blur(1.5) },
        // NIVEL 4: GEOMETRÍA
        { n: "4. VERTICAL_FLIP", f: s => s.flip() },
        { n: "4. HORIZONTAL_FLOP", f: s => s.flop() },
        // NIVEL 5: CROPS
        { n: "5. CROP_SYM_50", f: s => s.extract({left: 50, top: 50, width: meta.width-100, height: meta.height-100}) },
        { n: "5. CROP_ASYM_1", f: s => s.extract({left: 13, top: 27, width: meta.width-100, height: meta.height-100}) },
        { n: "5. CROP_ASYM_2", f: s => s.extract({left: 88, top: 5, width: meta.width-100, height: meta.height-100}) },
        // NIVEL 6: ESPECIALES
        { n: "6. SQUASH_50%", f: s => s.resize(meta.width, Math.round(meta.height * 0.5)) },
        { n: "6. ROTATE_90", f: s => s.rotate(90) },
        { n: "6. TILT_2_DEG", f: s => s.rotate(2) },
        // NIVEL 7: COMBOS DOBLES
        { n: "7. R0.5 + Q15", f: s => s.resize(Math.round(meta.width * 0.5)).jpeg({quality: 15}) },
        { n: "7. CROP + R0.75", f: s => s.extract({left: 10, top: 10, width: meta.width-50, height: meta.height-50}).resize(Math.round(meta.width * 0.75)) },
        { n: "7. FLIP + R0.5", f: s => s.flip().resize(Math.round(meta.width * 0.5)) },
        { n: "7. GREY + SQUASH", f: s => s.greyscale().resize(meta.width, Math.round(meta.height * 0.5)) },
        // NIVEL 8: COMBOS TRIPLES
        { n: "8. R0.5+ROT90+Q20", f: s => s.resize(Math.round(meta.width * 0.5)).rotate(90).jpeg({quality: 20}) },
        { n: "8. CROP+BLUR+R0.5", f: s => s.extract({left: 13, top: 27, width: meta.width-100, height: meta.height-100}).blur(1.2).resize(Math.round(meta.width * 0.5)) },
        { n: "8. FLIP+GREY+Q40", f: s => s.flip().greyscale().jpeg({quality: 40}) }
    ];

    // --- EJECUCIÓN ---
    for (let atk of bateria) {
        const ext = atk.n.includes('JPEG') || atk.n.includes('Q') ? 'jpg' : 'png';
        const rutaAtk = path.join(DIR_OUT, `temp_${atk.n}.${ext}`);

        await atk.f(sharp(master)).toFile(rutaAtk);

        const tS = process.hrtime.bigint();
        const res = await analizarImagenMBH(rutaAtk);
        const tE = process.hrtime.bigint();

        const tiempo = (Number(tE - tS) / 1e6).toFixed(0);
        resultados.push({
            Prueba: atk.n,
            Res: res.identificado ? "✅ ÉXITO" : "🛡️ FALLO",
            ID: res.hash || "-------",
            T: `${tiempo}ms`,
            Veredicto: res.veredicto?.split('-')[0].trim() || "---"
        });
        console.log(`${res.identificado ? '✅' : '🛡️'} Analizado: ${atk.n}`);
    }

    // --- INFORME FINAL ---
    console.log("\n" + "=".repeat(90));
    console.log("📊 INFORME DE GUERRA: DRAGON3 V22 - MATARÓ EDITION");
    console.log("=".repeat(90));
    console.table(resultados);

    const exitos = resultados.filter(r => r.Res.includes("ÉXITO")).length;
    console.log(`\n🏆 RENDIMIENTO FINAL: ${exitos}/${resultados.length} (${((exitos/resultados.length)*100).toFixed(1)}%)`);
    console.log("=".repeat(90));
}

ejecutarAuditoria().catch(console.error);
