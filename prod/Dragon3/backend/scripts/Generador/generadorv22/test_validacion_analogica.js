import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO = "50B3";

async function validarSumaAnalogica() {
    console.log("==========================================================================");
    console.log("🧮 VALIDACIÓN MATEMÁTICA: SUMA ANALÓGICA vs COMPRESIÓN JPEG");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Objetivo: ${HASH_ESPERADO}`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) { console.error("❌ Falta imagen."); return; }

    console.log("| CALIDAD |  HASH LEÍDO  | POTENCIA ACUMULADA | ESTADO |");
    console.log("|---------|--------------|--------------------|--------|");

    // Iteramos bajando la calidad
    for (let q = 100; q >= 10; q -= 10) {
        const rutaTemp = `./temp_analog_q${q}.jpg`;
        await sharp(RUTA_MASTER).jpeg({ quality: q }).toFile(rutaTemp);
        const input = await sharp(rutaTemp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const { width, height } = input.info;
        const canal = 2; // Azul

        // ====================================================================
        // ALGORITMO DE SUMA ANALÓGICA (SIMPLIFICADO PARA VALIDACIÓN)
        // ====================================================================

        // 16 Urnas para acumular la tensión de cada bit del hash
        let urnas = new Array(16).fill(0);
        let filasLeidas = 0;

        // 1. ITERAMOS SOLO LAS LÍNEAS DE LA REJILLA (0, 256, 512...)
        // Sabemos que ahí está la señal. No buscamos, vamos a tiro fijo.
        for (let y = 0; y < height; y += 256) {

            // 2. ESCANEO HORIZONTAL
            // Leemos toda la fila
            for (let x = 0; x < width - 16; x += 16) { // Bloques de 16px (Bit+Sombra)

                // Leemos con grosor 3px (Y-1, Y, Y+1) para pillar bleeding del JPEG
                let tensionBloque = 0;
                for (let dy = -1; dy <= 1; dy++) {
                     // Protección de bordes
                     let py = y + dy;
                     if (py < 0) py = 0;
                     if (py >= height) py = height - 1;

                     const tA = getTension(input.data, width, height, x, py, canal);
                     const tB = getTension(input.data, width, height, x + 8, py, canal);

                     // ACUMULACIÓN RAW (Sin decisión binaria)
                     tensionBloque += (tA - tB);
                }

                // 3. ASIGNACIÓN AL BIT CORRESPONDIENTE
                // El patrón se repite cada 256px horizontalmente (16 bloques de 16px)
                // blockIndex 0 -> Bit 0
                // blockIndex 1 -> Bit 1
                const blockIndex = (x / 16) % 16;

                urnas[blockIndex] += tensionBloque;
            }
            filasLeidas++;
        }

        // 4. DECODIFICACIÓN FINAL
        let adn = "";
        let potenciaTotal = 0;
        for (let i = 0; i < 16; i++) {
            potenciaTotal += Math.abs(urnas[i]);
            // Si la urna acumula positivo -> 1, negativo -> 0
            adn += (urnas[i] > 0) ? "1" : "0";
        }

        const hashLeido = parseInt(adn, 2).toString(16).toUpperCase().padStart(4, '0');

        // RESULTADOS
        const exito = (hashLeido === HASH_ESPERADO);
        const icono = exito ? "✅" : "❌";
        const colorHash = exito ? hashLeido : `⚠️ ${hashLeido}`;
        const potenciaStr = potenciaTotal.toFixed(0).padStart(10);

        console.log(`|   ${q}%   |     ${colorHash}     |    ${potenciaStr}      |   ${icono}   |`);

        if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
    }
    console.log("--------------------------------------------------------------");
    console.log("Nota: Si esto funciona, la matemática es correcta y el fallo del V36 era el 'Targeting' (apuntar mal).");
}

// --- MATH HELPERS ---
function getTension(buffer, width, height, x, y, canal) {
    let sum11 = 0, sum22 = 0;
    // DCT simple
    for (let bj = 0; bj < 8; bj++) {
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            const val = buffer[idx]; // Asumimos dentro de rango por el loop controlado
            sum11 += val * Math.cos(((2*bi+1)*Math.PI)/16) * Math.cos(((2*bj+1)*Math.PI)/16);
            sum22 += val * Math.cos(((2*bi+1)*2*Math.PI)/16) * Math.cos(((2*bj+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

validarSumaAnalogica();
