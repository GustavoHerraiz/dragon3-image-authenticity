import sharp from 'sharp';
import fs from 'fs';

const RUTA_SELLADA = './input/firma_test_SELLADA.png';
const TILE_SIZE = 256; // Tu tamaño de baldosa

async function buscarCostura(buffer) {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    let mejorX = 0, mejorY = 0;
    let maxSimilitud = -1;

    console.log(`🧐 Analizando baldosa de ${TILE_SIZE}x${TILE_SIZE}...`);

    // Escaneamos el desplazamiento 0-255 para encontrar el origen de la baldosa
    // Usamos una muestra de la zona central para comparar
    for (let offY = 0; offY < TILE_SIZE; offY += 8) {
        for (let offX = 0; offX < TILE_SIZE; offX += 8) {
            let similitud = 0;

            // Comparamos puntos separados por TILE_SIZE
            // Si estamos en la "costura" correcta, los valores del canal azul deben correlar
            for (let y = 100; y < 200; y++) {
                for (let x = 100; x < 200; x++) {
                    let idx1 = ((y + offY) * info.width + (x + offX)) * 4 + 2;
                    let idx2 = ((y + offY + TILE_SIZE) * info.width + (x + offX)) * 4 + 2;

                    // Diferencia absoluta (menor es mejor, por eso restamos)
                    similitud -= Math.abs(data[idx1] - data[idx2]);
                }
            }

            if (similitud > maxSimilitud || maxSimilitud === -1) {
                maxSimilitud = similitud;
                mejorX = offX; mejorY = offY;
            }
        }
    }

    return { x: mejorX, y: mejorY, confianza: maxSimilitud };
}

async function run() {
    const imgRaw = fs.readFileSync(RUTA_SELLADA);

    // Simulamos un CROP hostil
    const margin = 50;
    const crop = await sharp(imgRaw).extract({left: margin, top: margin, width: 500, height: 500}).toBuffer();

    const seam = await buscarCostura(crop);

    console.log("\n🎯 RESULTADO DEL BUSCADOR DE COSTURAS:");
    console.log(`Desplazamiento detectado: X=${seam.x}, Y=${seam.y}`);

    // La prueba de fuego: ¿El desplazamiento + el margen suman un múltiplo de TILE_SIZE?
    const realX = (seam.x + margin) % TILE_SIZE;
    console.log(`Ajuste Geométrico: ${realX === 0 ? "✅ BALDOSA SINCRONIZADA" : "❌ SEGUIMOS DESFASADOS"}`);
}

run();
