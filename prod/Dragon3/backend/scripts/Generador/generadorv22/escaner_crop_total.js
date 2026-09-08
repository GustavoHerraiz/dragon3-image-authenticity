import sharp from 'sharp';
import fs from 'fs';

// CONFIGURACIÓN
const TARGET_ADN = "0101000010110011"; // 50B3
// 🎯 LA RUTA EXACTA DEL ARCHIVO QUE FALLA (CROP 50%):
const RUTA_CROP = "./RESULTADOS_FAUNDEZ_V23_FINAL/F2_01.jpg";

async function escanear() {
    console.log("==================================================");
    console.log("🕵️ ESCÁNER FORENSE DE CROP (F2_01.jpg)");
    console.log("==================================================");

    if (!fs.existsSync(RUTA_CROP)) { console.log("❌ Sigue sin encontrar el archivo. Revisa la ruta."); return; }

    const inputRaw = await sharp(RUTA_CROP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = inputRaw.info;
    const buffer = inputRaw.data;

    console.log(`📏 Dimensiones: ${width}x${height} | Buscando: 50B3`);
    console.log("🚀 Iniciando barrido TOTAL (X:0-15, Y:0-255)...");

    let encontrados = 0;
    let mejor = { adn: "", dist: 16, x: 0, y: 0 };

    // BARRIDO EXHAUSTIVO
    for (let fy = 0; fy < 256; fy++) {
        for (let fx = 0; fx < 16; fx++) {

            const resultado = extraerADNEnFase(buffer, width, height, fx, fy);
            const dist = calcularDistancia(resultado.adn, TARGET_ADN);

            // Guardamos el mejor resultado histórico
            if (dist < mejor.dist) {
                mejor = { ...resultado, dist, x: fx, y: fy };
            }

            // Si encontramos algo decente (<= 2 errores), lo mostramos
            if (dist <= 2) {
                const hex = parseInt(resultado.adn, 2).toString(16).toUpperCase().padStart(4, '0');
                let estado = dist === 0 ? "✅ EXACTO" : `⚠️ Falla ${dist} bits`;
                console.log(`📍 [X:${fx}, Y:${fy}] -> Hash: ${hex} | Energía: ${resultado.energia.toFixed(0)} | ${estado}`);
                encontrados++;
            }
        }
    }

    if (encontrados === 0) {
        console.log("\n💀 INFORME FINAL: No se encontró ninguna coincidencia exacta.");
        const hexMejor = parseInt(mejor.adn, 2).toString(16).toUpperCase().padStart(4, '0');
        console.log(`   Lo más cercano fue: ${hexMejor} (Falla ${mejor.dist} bits) en [X:${mejor.x}, Y:${mejor.y}]`);
    } else {
        console.log(`\n✨ FIN DEL ESCÁNER. ${encontrados} candidatos potenciales.`);
    }
}

// --- MOTOR DE EXTRACCIÓN (Stride 256 + Dy Triple) ---
function extraerADNEnFase(buffer, width, height, fx, fy) {
    let urnas = new Array(16).fill(0);
    const canal = 2;

    for (let y = fy; y < height - 16; y += 256) {
        for (let x = 0; x < width - 16; x += 16) {
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy;
                if (py < 0 || py >= height - 8) continue;
                const tA = getTensionDCT(buffer, width, height, x + fx, py, canal);
                const tB = getTensionDCT(buffer, width, height, x + fx + 8, py, canal);
                t += (tA - tB);
            }
            urnas[(x / 16) % 16] += t;
        }
    }

    let energia = 0;
    let adn = "";
    for (let v of urnas) {
        energia += Math.abs(v);
        adn += (v > 0) ? "1" : "0";
    }
    return { adn, energia };
}

function getTensionDCT(buffer, width, height, x, y, canal) {
    const ix = Math.floor(x); const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix + 8 >= width || iy + 8 >= height) return 0;
    let s1 = 0, s2 = 0;
    const PI_16 = Math.PI / 16;
    for (let bj = 0; bj < 8; bj++) {
        const row = (iy + bj) * width;
        const cosY1 = Math.cos((2 * bj + 1) * PI_16);
        const cosY2 = Math.cos((2 * bj + 1) * 2 * PI_16);
        for (let bi = 0; bi < 8; bi++) {
            const v = buffer[(row + (ix + bi)) * 4 + canal];
            s1 += v * Math.cos((2 * bi + 1) * PI_16) * cosY1;
            s2 += v * Math.cos((2 * bi + 1) * 2 * PI_16) * cosY2;
        }
    }
    return s1 - s2;
}

function calcularDistancia(adn1, adn2) {
    let diff = 0;
    for (let i = 0; i < 16; i++) {
        if (adn1[i] !== adn2[i]) diff++;
    }
    return diff;
}

escanear();
