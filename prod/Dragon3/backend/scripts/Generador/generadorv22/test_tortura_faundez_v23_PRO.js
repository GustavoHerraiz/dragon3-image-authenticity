import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ⚠️ IMPORTANTE: Motor V84 Hybrid Titan
import { analizarImagenMaster } from './analizador_MASTER_v84_HYBRID.js';
import { NotarioDigital } from './utilidades/NotarioDigital.js';

const RUTA_MASTER_EXISTENTE = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const CARPETA_SALIDA = './RESULTADOS_FAUNDEZ_V23_FINAL/TORTURA';

// Utilidad simple de Hamming
function calcularHamming(hex1, hex2) {
    let n1 = parseInt(hex1, 16); let n2 = parseInt(hex2, 16);
    let xor = n1 ^ n2; let dist = 0;
    while (xor > 0) { dist += xor & 1; xor >>= 1; }
    return dist;
}

console.log("\n=================================================================================================================================");
console.log("🏰 DRAGON3 v84 - GENERACIÓN DE EVIDENCIA HÍBRIDA");
console.log("=================================================================================================================================\n");

async function iniciarProtocolo() {
    const notario = new NotarioDigital(
        "TEST DE TORTURA - ARQUITECTURA HÍBRIDA",
        "./DOSSIER_FAUNDEZ_TORTURA.md"
    );

    notario.agregarSeccion("1. ARQUITECTURA HÍBRIDA (TITAN)",
        "Evaluación de la conmutación automática entre el 'Motor Integer' (Estático, velocidad máxima) y el 'Motor Palacios' (Bilineal 0.004°, precisión máxima).");

    if (!fs.existsSync(CARPETA_SALIDA)) fs.mkdirSync(CARPETA_SALIDA, { recursive: true });

    // Definición de ataques con ÁNGULO REAL para que el Notario juzgue
    const ataques = [
        { id: "F1_01", desc: "🟢 Rescale 50% + JPG 80", anguloReal: 0, fn: (s) => s.resize({ width: Math.floor(800) }).jpeg({ quality: 80 }) },
        { id: "F1_02", desc: "🟢 Sharpen + JPG 60", anguloReal: 0, fn: (s) => s.sharpen().jpeg({ quality: 60 }) },
        { id: "F1_03", desc: "🟢 Blur Gaussiano + JPG 70", anguloReal: 0, fn: (s) => s.blur(2).jpeg({ quality: 70 }) },
        { id: "F1_04", desc: "📉 JUDO DIGITAL (JPEG Q20)", anguloReal: 0, fn: (s) => s.jpeg({ quality: 20 }) },

        { id: "F2_01", desc: "🟡 Crop 50% (Esquina Sup)", anguloReal: 0, fn: (s) => s.extract({ left: 0, top: 0, width: 500, height: 500 }).jpeg({ quality: 80 }) },
        { id: "F2_02", desc: "🟡 Crop Centro 800px", anguloReal: 0, fn: (s) => s.extract({ left: 200, top: 200, width: 800, height: 800 }).jpeg({ quality: 80 }) },

        { id: "F3_01", desc: "📐 Giro 15° + JPG 80", anguloReal: 15, fn: (s) => s.rotate(15).jpeg({ quality: 80 }) },
        { id: "F3_02", desc: "🔄 Giro 45° + JPG 80", anguloReal: 45, fn: (s) => s.rotate(45).jpeg({ quality: 80 }) },
        { id: "F3_03", desc: "🔄 Giro 90° + JPG 70", anguloReal: 90, fn: (s) => s.rotate(90).jpeg({ quality: 70 }) },

        { id: "F4_01", desc: "💀 CAOS (Giro 5° + Crop)", anguloReal: 5, fn: (s) => s.rotate(5).extract({ left: 100, top: 100, width: 600, height: 600 }).jpeg({ quality: 50 }) },
        { id: "F5_01", desc: "📲 SIMULACIÓN RRSS 1080", anguloReal: 0, fn: (s) => s.resize(1080).jpeg({ quality: 50 }) },
    ];

    const filasTabla = [];

    // CABECERA CONSOLA
    console.log("| ID    | RES | ENERGÍA  | HASH | ERR | ÁNGULO | MÉTODO           | PRUEBA                                   |");
    console.log("|-------|-----|----------|------|-----|--------|------------------|------------------------------------------|");

    for (const ataque of ataques) {
        const rutaAtaque = path.join(CARPETA_SALIDA, `${ataque.id}.jpg`);
        await ataque.fn(sharp(RUTA_MASTER_EXISTENTE)).toFile(rutaAtaque);

        // Silenciar log
        const logOriginal = console.log; console.log = () => {};
        const res = await analizarImagenMaster(rutaAtaque);
        console.log = logOriginal;

        // Extracción de Datos
        const hash = res.response.hash_calculado;
        const energia = parseInt(res.response.energia_detectada);
        const anguloDet = parseFloat(res.response.angulo_detectado);
        // Limpiamos el nombre del método para que quepa en tabla
        const metodoRaw = res.response.metodo;
        const metodoCorto = metodoRaw.replace("STATIC_", "ST_").replace("PALACIOS_", "PL_").substr(0,16);

        const exito = (hash === "50B3");
        const energiaStr = energia > 100000 ? `${(energia/1000).toFixed(0)}k` : energia.toString();

        // Output Consola
        console.log(
            `| ${ataque.id} | ${exito ? "✅ " : "❌ "}| ${energiaStr.padStart(8)} | ${hash} | OK  | ${anguloDet.toFixed(1).padStart(5)}° | ${metodoCorto.padEnd(16)} | ${ataque.desc.padEnd(40)} |`
        );

        // Análisis del Notario
        const explicacion = notario.analizarAngulo(anguloDet, ataque.anguloReal, metodoRaw);

        // Agregar a Informe
        filasTabla.push([
            ataque.id,
            ataque.desc,
            exito ? "✅" : "❌",
            hash,
            energia.toLocaleString(),
            `${anguloDet}°`,
            metodoRaw,
            explicacion // Aquí va la magia explicativa
        ]);
    }

    notario.agregarTabla(
        ["ID", "Ataque", "Estado", "ADN", "Energía", "Ángulo Det.", "Motor", "Análisis Técnico"],
        filasTabla
    );

    notario.cerrarInforme();
    console.log("\n📊 ESTADÍSTICAS: Finalizadas. Informe generado.");
    console.log("=================================================================================================================================");
}

iniciarProtocolo();
