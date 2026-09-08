import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO_HEX = "50B3";
const BINARIO_ESPERADO = parseInt(HASH_ESPERADO_HEX, 16).toString(2).padStart(16, '0');

async function radiografiaCompresion() {
    console.log("==========================================================================");
    console.log("📉 RADIOGRAFÍA EVOLUTIVA (DEGRADACIÓN POR COMPRESIÓN)");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Buscando: ${BINARIO_ESPERADO} (50B3)`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) { console.error("❌ Falta imagen."); return; }

    // Iteramos bajando la calidad de 10 en 10
    for (let q = 100; q >= 10; q -= 10) {
        const rutaTemp = `./temp_radio_q${q}.jpg`;

        // 1. Generar la versión degradada
        await sharp(RUTA_MASTER).jpeg({ quality: q }).toFile(rutaTemp);
        const input = await sharp(rutaTemp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = input.info;
        const canal = 2; // Azul

        console.log(`\n📸 CALIDAD JPEG: ${q}%`);
        console.log("==========================================================================");

        // --------------------------------------------------------------------
        // A. ESCANEO VERTICAL (Buscando supervivencia de las líneas maestras)
        // --------------------------------------------------------------------
        console.log("  ⬇️  ANÁLISIS VERTICAL (X=0)");
        console.log("  --------------------------------------------------");
        console.log("   Y   |      LECTURA BINARIA      |   ESTADO   ");
        console.log("-------|---------------------------|------------");

        const limiteY = Math.min(height, 600);
        let rachaBuena = 0;
        let rachaMala = 0;

        for (let y = 0; y < limiteY; y++) {
            const resultado = leer16Bits(input.data, width, height, 0, y, canal);

            let estado = "❌";

            if (resultado.binario === BINARIO_ESPERADO) {
                estado = "✅ PERFECTO";
            } else if (esParecido(resultado.binario, BINARIO_ESPERADO)) {
                estado = "⚠️ DÉBIL";
            } else if (resultado.energia > 500 && resultado.binario !== "0000000000000000") {
                 // Detectamos si hay señal fuerte aunque sea errónea (aliasing/ruido fuerte)
                 estado = "⚡ RUIDO ALTO";
            } else {
                 estado = "❌";
            }

            // Lógica de agrupación para no spamear
            if (estado.includes("PERFECTO") || estado.includes("DÉBIL")) {
                if (rachaMala > 0) {
                    console.log(`  ...  | (Basura x ${rachaMala} líneas)       |`);
                    rachaMala = 0;
                }
                console.log(`  ${y.toString().padStart(3)}  | [${resultado.binario}] | ${estado}`);
                rachaBuena++;
            } else {
                rachaMala++;
                rachaBuena = 0;
            }
        }
        if (rachaMala > 0) console.log(`  ...  | (Basura hasta el final)   |`);

        // --------------------------------------------------------------------
        // B. ESCANEO HORIZONTAL (Buscando continuidad en la Línea 0)
        // --------------------------------------------------------------------
        console.log("\n  ➡️  ANÁLISIS HORIZONTAL (Y=0)");
        console.log("  --------------------------------------------------");

        // Muestreo rápido horizontal cada 32 píxeles para ver si se rompe
        let lineaHorizontal = "";
        const totalBloquesX = Math.floor(width / 32);

        for (let i = 0; i < Math.min(totalBloquesX, 30); i++) {
            const x = i * 32;
            const res = leer16Bits(input.data, width, height, x, 0, canal);

            if (res.binario === BINARIO_ESPERADO) lineaHorizontal += "█";
            else if (res.energia > 500) lineaHorizontal += "▒";
            else lineaHorizontal += "_";
        }
        console.log(`  Continuidad Visual: [${lineaHorizontal}]`);

        // Limpieza
        if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
    }

    console.log("\n==========================================================================");
}

// --- FUNCIONES AUXILIARES (Ligeramente ajustadas para velocidad) ---

function leer16Bits(buffer, width, height, startX, startY, canal) {
    let binario = "";
    let energia = 0;

    for (let i = 0; i < 16; i++) {
        const xA = startX + (i * 16);
        const xB = xA + 8;

        const tA = getTension(buffer, width, height, xA, startY, canal);
        const tB = getTension(buffer, width, height, xB, startY, canal);
        const diff = tA - tB;

        energia += Math.abs(diff);

        let bit = ".";
        if (Math.abs(diff) > 2) {
            bit = (diff > 0) ? "1" : "0";
        }
        binario += bit;
    }
    return { binario, energia };
}

function esParecido(leido, esperado) {
    // Tolerancia simple: si reemplazando los puntos por 0 o 1 coincide
    if (leido === esperado) return true;
    const variante0 = leido.replace(/\./g, '0');
    const variante1 = leido.replace(/\./g, '1');

    // Ojo: Esto es un chequeo laxo, cuenta cuántos bits coinciden
    let coincidencias = 0;
    for(let i=0; i<16; i++) {
        if(leido[i] === esperado[i]) coincidencias++;
    }
    return coincidencias >= 14; // Si coinciden 14 de 16, lo damos por bueno (DÉBIL)
}

function getTension(buffer, width, height, x, y, canal) {
    if (x + 8 >= width || y + 8 >= height) return 0;
    let block = [];
    for (let bj = 0; bj < 8; bj++) {
        let row = [];
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            row.push(buffer[idx]);
        }
        block.push(row);
    }
    let sum11 = 0, sum22 = 0;
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            const val = block[y][x];
            sum11 += val * Math.cos(((2*x+1)*1*Math.PI)/16) * Math.cos(((2*y+1)*1*Math.PI)/16);
            sum22 += val * Math.cos(((2*x+1)*2*Math.PI)/16) * Math.cos(((2*y+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

radiografiaCompresion();
