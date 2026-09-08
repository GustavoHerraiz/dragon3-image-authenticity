import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO_HEX = "50B3";
const BINARIO_ESPERADO = parseInt(HASH_ESPERADO_HEX, 16).toString(2).padStart(16, '0');

async function investigarVerticalidad() {
    console.log("==========================================================================");
    console.log("🔬 INVESTIGACIÓN FORENSE VERTICAL (¿SE ROMPE EL PATRÓN ABAJO?)");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Patrón Esperado: ${BINARIO_ESPERADO} (${HASH_ESPERADO_HEX})`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) { console.error("❌ Falta imagen."); return; }

    const input = await sharp(RUTA_MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = input.info;
    const canal = 2; // Azul

    // Vamos a leer el PRIMER BLOQUE (0..15 bits) pero bajando filas
    // El patrón debería repetirse idéntico en todas las filas Y.

    // Muestreamos cada 8 líneas verticalmente
    for (let y = 0; y < height; y += 32) {
        let streamBinario = "";

        // Leemos los primeros 16 bits de esa fila (x=0 hasta x=256)
        for (let i = 0; i < 16; i++) {
            const xA = i * 16;
            const xB = xA + 8;

            const tA = getTension(input.data, width, height, xA, y, canal);
            const tB = getTension(input.data, width, height, xB, y, canal);
            const diff = tA - tB;

            // Umbral mínimo de ruido
            let bit = ".";
            if (Math.abs(diff) > 5) {
                bit = (diff > 0) ? "1" : "0";
            }
            streamBinario += bit;
        }

        // Chequeo
        let estado = "❌ ROTO";
        if (streamBinario === BINARIO_ESPERADO) estado = "✅ OK";
        else if (streamBinario.includes(".")) estado = "⚠️ DÉBIL";

        console.log(`Fila Y=${y.toString().padStart(4)}: [${streamBinario}] ${estado}`);

        // Si detectamos un cambio de patrón, paramos y avisamos
        if (estado === "❌ ROTO" && y < 500) {
            console.log("   └─ ¡CUIDADO! El patrón cambia aquí. El generador no es uniforme verticalmente.");
        }
    }
}

function getTension(buffer, width, height, x, y, canal) {
    let block = [];
    for (let bj = 0; bj < 8; bj++) {
        let row = [];
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            const val = (idx < buffer.length) ? buffer[idx] : 0;
            row.push(val);
        }
        block.push(row);
    }
    let sum11 = 0, sum22 = 0;
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            const val = block[y][x];
            sum11 += val * Math.cos(((2*x+1)*Math.PI)/16) * Math.cos(((2*y+1)*Math.PI)/16);
            sum22 += val * Math.cos(((2*x+1)*2*Math.PI)/16) * Math.cos(((2*y+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

investigarVerticalidad();
