import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO_HEX = "50B3";
const BINARIO_ESPERADO = parseInt(HASH_ESPERADO_HEX, 16).toString(2).padStart(16, '0');

async function testSupervivencia() {
    console.log("==========================================================================");
    console.log("🛡️ TEST DE SUPERVIVENCIA DE REJILLA (SEÑAL VS RUIDO)");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Hash Objetivo: ${HASH_ESPERADO_HEX}`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) { console.error("❌ Falta imagen."); return; }

    console.log("| CALIDAD | LÍNEA (Y) | TIPO  |  ADN LEÍDO (16b) | ESTADO | ENERGÍA |");
    console.log("|---------|-----------|-------|------------------|--------|---------|");

    // Iteramos bajando la calidad
    const calidades = [100, 80, 60, 40, 20, 10];

    for (let q of calidades) {
        const rutaTemp = `./temp_surv_q${q}.jpg`;
        await sharp(RUTA_MASTER).jpeg({ quality: q }).toFile(rutaTemp);
        const input = await sharp(rutaTemp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        // Vamos a analizar 3 puntos clave:
        // 1. Y=0   (Debería ser SEÑAL PURA)
        // 2. Y=256 (Debería ser SEÑAL PURA)
        // 3. Y=128 (Debería ser RUIDO / VACÍO)

        const lineasInteres = [
            { y: 0, tipo: "SEÑAL" },
            { y: 256, tipo: "SEÑAL" },
            { y: 128, tipo: "RUIDO" }
        ];

        for (let punto of lineasInteres) {
            const res = leerLinea(input.data, input.info.width, input.info.height, punto.y);

            let estado = "❌";
            if (res.binario === BINARIO_ESPERADO) estado = "✅ OK";
            else if (esParecido(res.binario, BINARIO_ESPERADO)) estado = "⚠️ OK";
            else if (punto.tipo === "RUIDO") estado = "---"; // En ruido esperamos fallo

            // Formateo visual
            let colorEnergia = res.energia.toString().padStart(5);

            // Marcamos contraste de energía
            // Si es SEÑAL y tiene poca energía -> MALO
            // Si es RUIDO y tiene mucha energía -> MALO

            console.log(
                `|   ${q.toString().padStart(3)}%  |    ${punto.y.toString().padStart(3)}    | ${punto.tipo} | ${res.binario} |  ${estado}  |  ${colorEnergia}  |`
            );
        }
        console.log("|---------|-----------|-------|------------------|--------|---------|");

        if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
    }
}

// --- LECTURA SIMPLE (SIN ROTACIÓN NI ACUMULACIÓN COMPLEJA) ---
function leerLinea(buffer, width, height, y) {
    const canal = 2; // Azul
    let binario = "";
    let energiaTotal = 0;

    // Leemos los primeros 16 bits (primer bloque horizontal)
    for (let i = 0; i < 16; i++) {
        const xA = i * 16;
        const xB = xA + 8;

        // Leemos Y, pero también Y+1 y Y-1 para captar "bleeding" del JPEG
        // Sumamos la energía de 3 píxeles verticales
        let valA = 0, valB = 0;

        for (let dy = -1; dy <= 1; dy++) {
             valA += getTensionPixel(buffer, width, height, xA, y + dy, canal);
             valB += getTensionPixel(buffer, width, height, xB, y + dy, canal);
        }

        const diff = valA - valB;
        energiaTotal += Math.abs(diff);

        binario += (diff > 0) ? "1" : "0";
    }

    return { binario, energia: energiaTotal };
}

function esParecido(leido, esperado) {
    let hits = 0;
    for(let i=0; i<16; i++) if(leido[i]===esperado[i]) hits++;
    return hits >= 14;
}

// Tensión simple pixel a pixel (DCT simplificada para velocidad en test)
function getTensionPixel(buffer, width, height, x, y, canal) {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;

    // Leemos el bloque 8x8 desde (x,y)
    let sum11 = 0, sum22 = 0;
    for (let bj = 0; bj < 8; bj++) {
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            const val = (idx < buffer.length) ? buffer[idx] : 0;

            // DCT Coeffs
            sum11 += val * Math.cos(((2*bi+1)*Math.PI)/16) * Math.cos(((2*bj+1)*Math.PI)/16);
            sum22 += val * Math.cos(((2*bi+1)*2*Math.PI)/16) * Math.cos(((2*bj+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

testSupervivencia();
