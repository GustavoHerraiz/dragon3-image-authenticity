import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO_HEX = "50B3";

// Convertimos el Hex esperado a Binario para comparar visualmente
const BINARIO_ESPERADO = parseInt(HASH_ESPERADO_HEX, 16).toString(2).padStart(16, '0');

async function investigarLinea0() {
    console.log("==========================================================================");
    console.log("🔬 INVESTIGACIÓN FORENSE DE LA LÍNEA 0 (TOPOLOGÍA DE SEÑAL)");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Patrón Esperado (50B3): ${BINARIO_ESPERADO}`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) {
        console.error("❌ No encuentro la imagen Master.");
        return;
    }

    // Probamos con 3 niveles de degradación para ver cómo se comporta la señal
    const calidades = [100, 50, 10];

    for (let q of calidades) {
        console.log(`\n📸 ANALIZANDO JPEG CALIDAD ${q}%...`);
        const rutaTemp = `./temp_debug_linea0_q${q}.jpg`;

        try {
            // Generamos el JPG
            await sharp(RUTA_MASTER).jpeg({ quality: q }).toFile(rutaTemp);

            // Leemos el buffer
            const input = await sharp(rutaTemp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const { width, height } = input.info;
            const canal = 2; // Azul

            let streamBinario = "";
            let bloquesLeidos = 0;
            let salidaFormateada = "";

            // BARRIDO COMPLETO DE LA LÍNEA 0
            // Avanzamos de 16 en 16 píxeles (Par Bit+Sombra)
            const totalPares = Math.floor(width / 16);

            for (let i = 0; i < totalPares; i++) {
                const xA = i * 16;
                const xB = xA + 8;
                const y = 0;

                const tA = getTension(input.data, width, height, xA, y, canal);
                const tB = getTension(input.data, width, height, xB, y, canal);
                const diff = tA - tB;

                // Determinamos el bit (sin filtros, queremos ver todo, incluso el ruido)
                let bit = (diff > 0) ? "1" : "0";

                // Si la señal es muy débil (zona muerta), ponemos un punto "."
                if (Math.abs(diff) < 2) bit = ".";

                streamBinario += bit;
                bloquesLeidos++;
            }

            // Formateamos la salida en grupos de 16 bits para ver si encajan con el patrón
            for (let i = 0; i < streamBinario.length; i += 16) {
                const chunk = streamBinario.substring(i, i + 16);

                // Comparamos con el esperado
                let marcador = "";
                if (chunk === BINARIO_ESPERADO) marcador = "✅ EXACTO";
                else if (chunk.replace(/\./g, '0') === BINARIO_ESPERADO) marcador = "⚠️ Débil";
                else marcador = "❌ Roto";

                console.log(`   Bloque ${Math.floor(i/16).toString().padStart(2)}: [${chunk}]  ${marcador}`);
            }

        } catch (e) {
            console.error(e);
        } finally {
            if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);
        }
    }
}

// --- MATH HELPERS (Tus ojos de siempre) ---
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
            sum11 += val * Math.cos(((2*x+1)*1*Math.PI)/16) * Math.cos(((2*y+1)*1*Math.PI)/16);
            sum22 += val * Math.cos(((2*x+1)*2*Math.PI)/16) * Math.cos(((2*y+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

investigarLinea0();
