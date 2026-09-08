import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// RUTA FIJA A LA IMAGEN MASTER GENERADA (Ajusta si es necesario)
const RUTA = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';

async function verLoQueVeLaNena() {
    console.log("🔍 LECTURA DE FRECUENCIAS PURAS (MODO 'LA NENA')");

    if (!fs.existsSync(RUTA)) { console.log("❌ No encuentro la imagen master."); return; }

    const input = await sharp(RUTA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = input.info;
    const canal = 2; // Azul

    // Vamos al centro exacto
    const cX = Math.floor(width / 2);
    const cY = Math.floor(height / 2);

    console.log(`📍 Mirando en el centro (${cX}, ${cY}) - Canal Azul`);
    console.log("---------------------------------------------------------------");
    console.log(" PAR | BLOQUE A (Bit) | BLOQUE B (Sombra) |  RESTA  | ¿ES TWIN?");
    console.log("---------------------------------------------------------------");

    // Leemos 10 pares de bloques (20 bloques en total)
    // El Generador v18 escribe: [Bit] [Inverso] [Bit] [Inverso]...
    // Usamos paso de 8 píxeles.

    for (let i = 0; i < 10; i++) {
        // Coordenadas: Avanzamos de 16 en 16 píxeles (8 para A, 8 para B)
        const xA = cX + (i * 16);
        const xB = xA + 8; // El vecino inmediato

        // Leemos la tensión DCT (1,1) - (2,2)
        const tA = leerTension(input.data, width, xA, cY, canal);
        const tB = leerTension(input.data, width, xB, cY, canal);

        // La magia Twin: A y B deben ser opuestos.
        // Restamos A - B.
        const resta = tA - tB;

        // Verificamos si tienen signos opuestos (multiplicación negativa)
        // y si la fuerza es suficiente.
        let estado = "......";
        const tieneFuerza = Math.abs(resta) > 20; // Umbral de ruido
        const sonOpuestos = (tA * tB) < 0;        // Signos distintos

        if (tieneFuerza && sonOpuestos) {
            estado = "✅ SÍ !!";
        } else if (tieneFuerza && !sonOpuestos) {
            estado = "⚠️ Fuerte pero igual";
        }

        console.log(
            ` #${i} | ` +
            `${tA.toFixed(1).padStart(12)} | ` +
            `${tB.toFixed(1).padStart(15)} | ` +
            `${resta.toFixed(1).padStart(7)} | ` +
            `${estado}`
        );
    }
    console.log("---------------------------------------------------------------");
}

function leerTension(buffer, width, x, y, canal) {
    // Extraer bloque 8x8
    let block = [];
    for (let bj = 0; bj < 8; bj++) {
        let row = [];
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            row.push(buffer[idx]);
        }
        block.push(row);
    }

    // DCT Manual (Coeficientes 1,1 y 2,2)
    // Fórmula estándar DCT-II
    let sum11 = 0, sum22 = 0;
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            // Precalculamos cosenos para u=1, v=1
            const cos11 = Math.cos(((2*u+1)*1*Math.PI)/16) * Math.cos(((2*v+1)*1*Math.PI)/16);
            // Precalculamos cosenos para u=2, v=2
            const cos22 = Math.cos(((2*u+1)*2*Math.PI)/16) * Math.cos(((2*v+1)*2*Math.PI)/16);

            sum11 += block[v][u] * cos11;
            sum22 += block[v][u] * cos22;
        }
    }

    // Normalización aproximada (factor 0.25 suele usarse en JPEG)
    const val1 = sum11 * 0.25;
    const val2 = sum22 * 0.25;

    // Retornamos la diferencia interna del bloque (que es lo que usa v18)
    return val1 - val2;
}

verLoQueVeLaNena();
