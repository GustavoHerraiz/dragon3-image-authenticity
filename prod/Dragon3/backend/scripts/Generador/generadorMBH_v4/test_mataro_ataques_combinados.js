import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizador_v5.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const DIR_OUT = './output_tests_combinados';
const RUTA_MASTER = path.join(DIR_OUT, 'Mataro_MASTER_COMBO.png');

if (!fs.existsSync(DIR_OUT)) fs.mkdirSync(DIR_OUT);

async function radarForense(buffer, nombre) {
    const ext = nombre.includes('FINAL_JPG') ? 'jpg' : 'png';
    const ruta = path.join(DIR_OUT, `temp_${nombre}.${ext}`);

    if (ext === 'jpg') {
        await sharp(buffer).jpeg({ quality: 30 }).toFile(ruta); // Forzamos un Q30 en los finales JPG
    } else {
        await sharp(buffer).png().toFile(ruta);
    }

    const tStart = process.hrtime.bigint();
    const res = await analizarImagenMBH(ruta);
    const t = (Number(process.hrtime.bigint() - tStart) / 1e6).toFixed(0);

    const icono = res.identificado ? (res.veredicto.includes('Original') ? '🏆' : '✅') : '🛡️';
    console.log(
        `${icono} ${nombre.padEnd(25)} | ` +
        `ID: ${(res.hash || '-------').padEnd(8)} | ` +
        `${t.padStart(6)}ms | ` +
        `${res.veredicto}`
    );
}

async function asedioCombinado() {
    console.log("🚀 GENERANDO MASTER Y COMENZANDO ATAQUES COMBINADOS...");
    const gen = new GeneradorMBH();
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_MASTER, { id_numerico: 0x000D760 });
    const master = fs.readFileSync(RUTA_MASTER);
    const meta = await sharp(master).metadata();

    console.log("\n⚔️  NIVEL 7: ATAQUES DOBLES (FUERZA Y RESILIENCIA)");
    console.log("--------------------------------------------------");

    // 1. Resize 0.5x + Compresión JPEG Destructiva
    const d1 = await sharp(master).resize(Math.round(meta.width * 0.5)).jpeg({quality: 15}).toBuffer();
    await radarForense(d1, "RESIZE_0.5x_JPEG_Q15");

    // 2. Crop Asimétrico + Resize 0.75x
    const d2 = await sharp(master)
        .extract({left: 10, top: 10, width: meta.width - 50, height: meta.height - 50})
        .resize(Math.round(meta.width * 0.75))
        .toBuffer();
    await radarForense(d2, "CROP_RESIZE_0.75x");

    // 3. Vertical Flip + Resize 0.5x
    const d3 = await sharp(master).flip().resize(Math.round(meta.width * 0.5)).toBuffer();
    await radarForense(d3, "FLIP_V_RESIZE_0.5x");

    // 4. Greyscale + Squash 50%
    const d4 = await sharp(master).greyscale().resize(meta.width, Math.round(meta.height * 0.5)).toBuffer();
    await radarForense(d4, "GREY_SQUASH_50%");


    console.log("\n⚔️  NIVEL 8: ATAQUES TRIPLES (EL LÍMITE DE LA FÍSICA)");
    console.log("--------------------------------------------------");

    // 1. Resize 0.5x + Rotación 90 + JPEG Q20
    const t1 = await sharp(master)
        .resize(Math.round(meta.width * 0.5))
        .rotate(90)
        .jpeg({quality: 20})
        .toBuffer();
    await radarForense(t1, "R0.5_ROT90_Q20_FINAL_JPG");

    // 2. Crop 13x27 + Blur + Resize 0.5x
    const t2 = await sharp(master)
        .extract({left: 13, top: 27, width: meta.width - 100, height: meta.height - 100})
        .blur(1.2)
        .resize(Math.round(meta.width * 0.5))
        .toBuffer();
    await radarForense(t2, "CROP_BLUR_RESIZE_0.5x");

    // 3. Flip + Greyscale + JPEG Q40
    const t3 = await sharp(master)
        .flip()
        .greyscale()
        .jpeg({quality: 40})
        .toBuffer();
    await radarForense(t3, "FLIP_GREY_Q40_FINAL_JPG");

    console.log("\n🏁 JUEGOS DE GUERRA FINALIZADOS.");
}

asedioCombinado();
