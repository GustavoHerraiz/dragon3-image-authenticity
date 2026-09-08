import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizador_v5.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const DIR_OUT = './output_test_completo';
const RUTA_MASTER = path.join(DIR_OUT, 'master_test.png');
const ID_NUMERICO = 0x000D760;  // Ajusta según tu ID real
const CLIENTE_TEST = { id_numerico: ID_NUMERICO, cliente: "Blade Corporation", obra: "Test Completo V6" };

if (!fs.existsSync(DIR_OUT)) fs.mkdirSync(DIR_OUT);

// =================================================================
// DEFINICIÓN DE ATAQUES (incluye control negativo, master PNG y compresión completa)
// =================================================================
const ataques = [];

// 0. Control negativo: imagen original sin sello
ataques.push({
    nombre: "ORIGINAL_SIN_SELLO",
    categoria: "Control",
    dificultad: "Negativo",
    fn: null,  // no se aplica transformación
    esOriginal: true
});

// 1. Master PNG (original sellado)
ataques.push({
    nombre: "MASTER_PNG",
    categoria: "Referencia",
    dificultad: "Base",
    fn: null,
    esMaster: true
});

// 2. Compresión JPEG desde Q100 hasta Q4
const calidades = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4];
for (let q of calidades) {
    ataques.push({
        nombre: `JPEG_Q${q}`,
        categoria: "Compresión",
        dificultad: q <= 10 ? "Extrema" : (q <= 40 ? "Alta" : "Media"),
        fn: (sharpObj) => sharpObj.jpeg({ quality: q })
    });
}

// 3. Escalado
const escalas = [0.75, 0.5, 0.3, 0.2];
for (let s of escalas) {
    ataques.push({
        nombre: `Resize_${s*100}%`,
        categoria: "Escalado",
        dificultad: s <= 0.3 ? "Alta" : "Media",
        fn: (sharpObj, meta) => sharpObj.resize(Math.round(meta.width * s))
    });
}

// 4. Procesado de señal
ataques.push({ nombre: "Grayscale", categoria: "Señal", dificultad: "Media", fn: (s) => s.greyscale() });
ataques.push({ nombre: "Gaussian_Blur_1.5", categoria: "Señal", dificultad: "Media", fn: (s) => s.blur(1.5) });
ataques.push({ nombre: "Gaussian_Blur_3.0", categoria: "Señal", dificultad: "Alta", fn: (s) => s.blur(3) });

// 5. Geometría
ataques.push({ nombre: "Vertical_Flip", categoria: "Geometría", dificultad: "Media", fn: (s) => s.flip() });
ataques.push({ nombre: "Horizontal_Flip", categoria: "Geometría", dificultad: "Media", fn: (s) => s.flop() });
ataques.push({ nombre: "Rotate_90", categoria: "Geometría", dificultad: "Media", fn: (s) => s.rotate(90) });
ataques.push({ nombre: "Rotate_2deg", categoria: "Geometría", dificultad: "Alta", fn: (s) => s.rotate(2) });

// 6. Crops
ataques.push({ nombre: "Crop_Sym_50px", categoria: "Crop", dificultad: "Media",
    fn: (s, meta) => s.extract({ left: 50, top: 50, width: meta.width-100, height: meta.height-100 }) });
ataques.push({ nombre: "Crop_Asym_13_27", categoria: "Crop", dificultad: "Alta",
    fn: (s, meta) => s.extract({ left: 13, top: 27, width: meta.width-100, height: meta.height-100 }) });
ataques.push({ nombre: "Crop_Asym_88_5", categoria: "Crop", dificultad: "Alta",
    fn: (s, meta) => s.extract({ left: 88, top: 5, width: meta.width-100, height: meta.height-100 }) });

// 7. Squash (distorsión de aspecto)
ataques.push({ nombre: "Squash_50%_ancho", categoria: "Escalado", dificultad: "Alta",
    fn: (s, meta) => s.resize(meta.width, Math.round(meta.height * 0.5)) });

// 8. Combos (dos o más transformaciones)
ataques.push({ nombre: "Resize_50%_JPEG_Q20", categoria: "Combo", dificultad: "Alta",
    fn: (s, meta) => s.resize(Math.round(meta.width*0.5)).jpeg({ quality: 20 }) });
ataques.push({ nombre: "Crop_Asym_Resize_75%", categoria: "Combo", dificultad: "Alta",
    fn: (s, meta) => s.extract({ left: 13, top: 27, width: meta.width-100, height: meta.height-100 }).resize(Math.round(meta.width*0.75)) });
ataques.push({ nombre: "Flip_Resize_50%", categoria: "Combo", dificultad: "Alta",
    fn: (s, meta) => s.flip().resize(Math.round(meta.width*0.5)) });
ataques.push({ nombre: "Grayscale_Squash", categoria: "Combo", dificultad: "Alta",
    fn: (s, meta) => s.greyscale().resize(meta.width, Math.round(meta.height*0.5)) });
ataques.push({ nombre: "Resize_50%_Rotate_90_JPEG_Q20", categoria: "Combo", dificultad: "Extrema",
    fn: (s, meta) => s.resize(Math.round(meta.width*0.5)).rotate(90).jpeg({ quality: 20 }) });
ataques.push({ nombre: "Crop_Asym_Blur_Resize_50%", categoria: "Combo", dificultad: "Extrema",
    fn: (s, meta) => s.extract({ left: 13, top: 27, width: meta.width-100, height: meta.height-100 }).blur(1.2).resize(Math.round(meta.width*0.5)) });
ataques.push({ nombre: "Flip_Grayscale_JPEG_Q40", categoria: "Combo", dificultad: "Extrema",
    fn: (s, meta) => s.flip().greyscale().jpeg({ quality: 40 }) });

// =================================================================
// FUNCIÓN PRINCIPAL
// =================================================================
async function ejecutarTest() {
    console.log("🐉 DRAGON3 V6: TEST COMPLETO DE RESILIENCIA\n");
    console.log("Generando imagen máster sellada...");
    const gen = new GeneradorMBH();
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_MASTER, CLIENTE_TEST);
    const masterBuffer = fs.readFileSync(RUTA_MASTER);
    const metaMaster = await sharp(masterBuffer).metadata();
    console.log(`✅ Máster generado: ${metaMaster.width}x${metaMaster.height}\n`);

    const resultados = [];

    // Procesar cada ataque
    let index = 0;
    for (let ataque of ataques) {
        let rutaTemp;
        let pipeline;

        if (ataque.esOriginal) {
            // Imagen original sin sello
            rutaTemp = RUTA_ORIGINAL;
        } else if (ataque.esMaster) {
            // Máster PNG original sellado
            rutaTemp = RUTA_MASTER;
        } else {
            // Aplicar transformación
            const ext = ataque.nombre.includes('JPEG') ? 'jpg' : 'png';
            rutaTemp = path.join(DIR_OUT, `temp_${index}_${ataque.nombre}.${ext}`);
            pipeline = sharp(masterBuffer);
            if (ataque.fn.length === 2) {
                pipeline = await ataque.fn(pipeline, metaMaster);
            } else {
                pipeline = await ataque.fn(pipeline);
            }
            await pipeline.toFile(rutaTemp);
        }

        // Analizar
        const tStart = process.hrtime.bigint();
        const res = await analizarImagenMBH(rutaTemp);
        const tEnd = process.hrtime.bigint();
        const tiempo = (Number(tEnd - tStart) / 1e6).toFixed(0);

        // Determinar éxito
        let success = false;
        if (ataque.esOriginal) {
            success = !res.identificado;   // debe ser negativo
        } else {
            success = res.identificado && (res.hash === CLIENTE_TEST.id_numerico.toString(16).toUpperCase().padStart(7, '0') || res.hash === '000D760');
        }

        const estado = success ? "✅ ÉXITO" : "🛡️ FALLO";
        const hash = res.hash || "---";
        const cliente = res.cliente || "---";
        const obra = res.obra || "---";

        resultados.push({
            Orden: index,
            Ataque: ataque.nombre,
            Categoria: ataque.categoria,
            Dificultad: ataque.dificultad,
            Resultado: estado,
            Hash: hash,
            Cliente: cliente,
            Obra: obra,
            Tiempo_ms: tiempo
        });

        // Salida en tiempo real
        console.log(`${estado} | ${ataque.categoria} | ${ataque.nombre} (${ataque.dificultad}) | Hash: ${hash} | ${tiempo}ms`);
        index++;
    }

    // Resumen final
    console.log("\n" + "=".repeat(120));
    console.log("📊 RESUMEN FINAL DEL TEST COMPLETO V6");
    console.log("=".repeat(120));
    console.table(resultados);

    const total = resultados.length;
    const exitos = resultados.filter(r => r.Resultado === "✅ ÉXITO").length;
    const porcentaje = (exitos / total * 100).toFixed(1);
    console.log(`\n🏆 TASA DE ÉXITO: ${exitos}/${total} (${porcentaje}%)`);

    // Desglose por categoría
    const categorias = [...new Set(resultados.map(r => r.Categoria))];
    console.log("\n📈 DESGLOSE POR CATEGORÍA:");
    for (let cat of categorias) {
        const sub = resultados.filter(r => r.Categoria === cat);
        const okSub = sub.filter(r => r.Resultado === "✅ ÉXITO").length;
        console.log(`  ${cat}: ${okSub}/${sub.length} (${(okSub/sub.length*100).toFixed(1)}%)`);
    }

    console.log("=".repeat(120));
    console.log("Test completado. Los archivos temporales se conservan en", DIR_OUT);
}

ejecutarTest().catch(console.error);