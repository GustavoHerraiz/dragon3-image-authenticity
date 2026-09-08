import sharp from 'sharp';
import fs from 'fs';

const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';

async function debugRadar() {
    console.log("==========================================================================");
    console.log("📡 DEBUG RADAR: PERFIL DE ENERGÍA VERTICAL");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log("==========================================================================\n");

    const input = await sharp(RUTA_MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = input.info;
    const canal = 2;

    const cX = width / 2;
    const cY = height / 2;
    const angulo = 0; // Asumimos imagen recta para este debug

    console.log("   Y (Offset) |   ENERGÍA ACUMULADA   | GRÁFICA");
    console.log("--------------|-----------------------|------------------------------------");

    // Escaneamos milimétricamente de -64 a +64
    // Deberíamos ver un PICO GIGANTE en Y=0

    let maxEnergia = 0;
    let mejorY = -999;

    for (let fy = -64; fy <= 64; fy += 1) { // Paso de 1px

        // Usamos la misma lógica que el V39 (medirEnergiaRejilla)
        const energia = medirEnergiaRejilla(input.data, width, height, cX, cY, angulo, fy, canal, 16);

        // Visualización
        const barras = Math.floor(energia / 20000); // Ajustar escala visual
        const grafica = "█".repeat(Math.min(barras, 50));

        let marcador = "";
        if (fy === 0) marcador = " <--- REJILLA REAL";
        if (fy === -30) marcador = " <--- EL FALSO POSITIVO";

        console.log(`   ${fy.toString().padStart(4)}       |   ${energia.toString().padStart(8)}            | ${grafica}${marcador}`);

        if (energia > maxEnergia) {
            maxEnergia = energia;
            mejorY = fy;
        }
    }

    console.log("--------------------------------------------------------------------------");
    console.log(`🏆 GANADOR MATEMÁTICO: Y=${mejorY} con Energía ${maxEnergia}`);
}

// COPIA EXACTA DE LA FUNCIÓN DEL V39
function medirEnergiaRejilla(buffer, width, height, cX, cY, angulo, faseY, canal, pasoX) {
    let energiaTotal = 0;
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const limitesY = Math.min(height, width) / 2;

    for (let k = -4; k <= 4; k++) {
        const yRel = faseY + (k * 256);
        if (Math.abs(yRel) > limitesY) continue;

        for (let xRel = -limitesY; xRel < limitesY; xRel += pasoX) {
            const ax = cos * xRel - sin * yRel + cX;
            const ay = sin * xRel + cos * yRel + cY;
            const bx = cos * (xRel + 8) - sin * yRel + cX;
            const by = sin * (xRel + 8) + cos * yRel + cY;

            const tA = getTensionSubpixel(buffer, width, height, ax, ay, canal);
            const tB = getTensionSubpixel(buffer, width, height, bx, by, canal);

            if (Math.abs(tA - tB) > 5 && (tA * tB < 0)) {
                energiaTotal += Math.abs(tA - tB);
            }
        }
    }
    return energiaTotal;
}

function getTensionSubpixel(buffer, width, height, x, y, canal) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    return getTension(buffer, width, height, ix, iy, canal);
}

function getTension(buffer, width, height, x, y, canal) {
    let sum11 = 0, sum22 = 0;
    if (x < 0 || y < 0 || x + 8 >= width || y + 8 >= height) return 0;

    for (let bj = 0; bj < 8; bj++) {
        const rowOffset = (y + bj) * width;
        for (let bi = 0; bi < 8; bi++) {
            const idx = (rowOffset + (x + bi)) * 4 + canal;
            const val = buffer[idx];
            sum11 += val * Math.cos(((2*bi+1)*Math.PI)/16) * Math.cos(((2*bj+1)*Math.PI)/16);
            sum22 += val * Math.cos(((2*bi+1)*2*Math.PI)/16) * Math.cos(((2*bj+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

debugRadar();
