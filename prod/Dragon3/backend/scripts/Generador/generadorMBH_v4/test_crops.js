import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const RUTA_SELLADA = './input/firma_test_SELLADA.png';

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

class MotorForense {
    static dct8x8(block) {
        let dct = Array(8).fill(0).map(() => Array(8).fill(0));
        const C = (u) => (u === 0 ? 0.7071 : 1);
        for (let u = 0; u < 8; u++) {
            for (let v = 0; v < 8; v++) {
                let sum = 0;
                for (let x = 0; x < 8; x++) {
                    for (let y = 0; y < 8; y++) sum += block[y][x] * COS_TABLE[u * 8 + x] * COS_TABLE[v * 8 + y];
                }
                dct[v][u] = 0.25 * C(u) * C(v) * sum;
            }
        }
        return dct;
    }

    // 🎯 MOTOR DE PARIDAD DIFERENCIAL (Caza-Crops)
    static predecirOffset(data, info) {
        let mejorX = 0, mejorY = 0, maxContraste = -1e10;

        const centerX = Math.floor(info.width / 4); // Escaneamos una franja más amplia
        const centerY = Math.floor(info.height / 4);

        for (let oy = 0; oy < 8; oy++) {
            for (let ox = 0; ox < 8; ox++) {
                let contrasteTotal = 0;
                let prevDiff = 0;

                // Analizamos 32 pares de bloques (la secuencia completa de 64)
                for (let k = 0; k < 64; k++) {
                    let bx = centerX + ox + k * 8;
                    let by = centerY + oy;

                    let block = [];
                    for (let i = 0; i < 8; i++) {
                        let row = [];
                        for (let j = 0; j < 8; j++) {
                            let idx = ((by + i) * info.width + (bx + j)) * 4 + 2;
                            row.push(data[idx] - 128);
                        }
                        block.push(row);
                    }
                    const d = this.dct8x8(block);
                    const currentDiff = d[1][1] - d[2][2];

                    // Si estamos alineados, los pares (k par e impar) deben ser OPUESTOS
                    if (k % 2 === 1) {
                        // El contraste es máximo si currentDiff y prevDiff tienen signos distintos
                        contrasteTotal += Math.abs(currentDiff - prevDiff);
                    }
                    prevDiff = currentDiff;
                }

                if (contrasteTotal > maxContraste) {
                    maxContraste = contrasteTotal;
                    mejorX = ox; mejorY = oy;
                }
            }
        }
        return { x: mejorX, y: mejorY, score: maxContraste };
    }

    static async extraer(data, info, offX, offY) {
        let acumuladores = Array(64).fill(0);
        let step = 0;
        for (let y = offY; y <= info.height - 8; y += 8) {
            for (let x = offX; x <= info.width - 8; x += 8) {
                let block = [];
                for (let i = 0; i < 8; i++) {
                    let row = [];
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                        row.push(data[idx] - 128);
                    }
                    block.push(row);
                }
                const d = this.dct8x8(block);
                acumuladores[step % 64] += (d[1][1] - d[2][2]);
                step++;
            }
        }
        return Array.from({length: 32}, (_, i) => (acumuladores[i*2] > acumuladores[i*2+1] ? "1" : "0")).join('');
    }
}

function validar(bits) {
    const intentarValidar = (b) => {
        const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
        const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
        const chk = parseInt(b.substring(28), 2);
        const low = idInt & 0x3FFF; const high = (idInt >> 14) & 0x3FFF;
        const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
        const reg = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === idHex);
        return { ok: chk === calc && !!reg, id: idHex, chk, cliente: reg?.cliente };
    };

    for (let i = 0; i < 32; i++) {
        let rotated = bits.substring(i) + bits.substring(0, i);
        let r = intentarValidar(rotated);
        if (r.ok) return { ...r, fase: "NOR" };
        let inv = rotated.split('').map(x => x === '1' ? '0' : '1').join('');
        let rI = intentarValidar(inv);
        if (rI.ok) return { ...rI, fase: "INV" };
    }
    return { ok: false };
}

async function radarCrops(buffer, label) {
    const tStart = process.hrtime.bigint();
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // 🔬 ESCÁNER DE DOBLE HÉLICE
    const prediccion = MotorForense.predecirOffset(data, info);

    // 💥 INTENTO ÚNICO DE PRECISIÓN
    let bits = await MotorForense.extraer(data, info, prediccion.x, prediccion.y);
    let res = validar(bits);

    const t = (Number(process.hrtime.bigint() - tStart) / 1e6).toFixed(0);

    if (res.ok) {
        console.log(`✅ ${label.padEnd(20)} | ID:${res.id} | ${t.padStart(8)}ms | O(${prediccion.x},${prediccion.y}) | SCORE: ${prediccion.score.toFixed(0)}`);
    } else {
        console.log(`🛡️ ${label.padEnd(20)} | ID:------- | ${t.padStart(8)}ms | SCORE: ${prediccion.score.toFixed(0)} (FALLO)`);
    }
}

async function runCropTest() {
    const gen = new GeneradorMBH();
    const meta = await sharp(RUTA_ORIGINAL).metadata();

    console.log("🚀 Generando Muestra Control...");
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA, { id_numerico: 0x000D760 });
    const imgRaw = fs.readFileSync(RUTA_SELLADA);

    console.log("\n⚖️  RADAR DE DOBLE HÉLICE V140: CAZANDO EL RECORTE\n");

    for (let margin of [10, 25, 50]) {
        const crop = await sharp(imgRaw).extract({
            left: margin, top: margin,
            width: meta.width - (margin * 2), height: meta.height - (margin * 2)
        }).toBuffer();
        await radarCrops(crop, `CROP_MARGIN_${margin}px`);
    }
}

runCropTest();
