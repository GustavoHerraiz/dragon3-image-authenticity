import sharp from 'sharp';
import fs from 'fs';
import { GeneradorMBH } from './generadorMBH.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const RUTA_ORIGINAL = './input/firma_test.jpg';
const RUTA_SELLADA = './input/firma_test_SELLADA.png';

// TABLA DE COSENOS (Optimización Tier 0)
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

    // 🧬 EXTRACTOR V20 [VERTICAL INVARIANT]: Alineado con el nuevo generador
    static async extraer(data, info, offX, offY) {
        let acumuladores = Array(64).fill(0);

        for (let y = offY; y <= info.height - 8; y += 8) {
            // 🎯 RESET DE FILA: Fundamental para vencer al CROP vertical
            let stepPerRow = 0;
            for (let x = offX; x <= info.width - 8; x += 8) {
                let block = [];
                for (let i = 0; i < 8; i++) {
                    let row = [];
                    for (let j = 0; j < 8; j++) {
                        let idx = ((y + i) * info.width + (x + j)) * 4 + 2; // Canal Azul
                        row.push(data[idx] - 128);
                    }
                    block.push(row);
                }
                const d = this.dct8x8(block);
                // Física diferencial Vogel (D1,1 - D2,2)
                acumuladores[stepPerRow % 64] += (d[1][1] - d[2][2]);
                stepPerRow++;
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

// --- ESTRATEGIA EMBUDO V140: OPTIMIZADA PARA VELOCIDAD ---
async function radar(buffer, label, metaRef) {
    const tStart = process.hrtime.bigint();
    let res = { ok: false };

    const variantesImg = [
        { mod: "NOR", buf: buffer },
        { mod: "MIR", buf: await sharp(buffer).flip().toBuffer() }
    ];

    // CAPA 1 y 2: ATAQUES GLOBALES (Offset 0,0)
    for (let v of variantesImg) {
        for (let deg of [0, 90, 180, 270]) {
            let b = deg === 0 ? v.buf : await sharp(v.buf).rotate(deg).toBuffer();
            const metaCurr = await sharp(b).metadata();
            const modosEscala = [
                { name: "NAT", w: metaCurr.width, h: metaCurr.height },
                { name: "REA", w: (deg % 180 === 0) ? metaRef.width : metaRef.height, h: (deg % 180 === 0) ? metaRef.height : metaRef.width }
            ];

            for (let modo of modosEscala) {
                const { data, info } = await sharp(b).resize(modo.w, modo.h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                let bits = await MotorForense.extraer(data, info, 0, 0);
                let v_res = validar(bits);
                if (v_res.ok) {
                    res = { ...v_res, fase: `${v_res.fase}+${v.mod}+${modo.name}+R${deg}+O(0,0)` };
                    break;
                }
            }
            if (res.ok) break;
        }
        if (res.ok) break;
    }

    // CAPA 3: DEEP SCAN (Barrido de 64 Offsets para Crops)
    if (!res.ok) {
        const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (x === 0 && y === 0) continue;
                let bits = await MotorForense.extraer(data, info, x, y);
                let v_res = validar(bits);
                if (v_res.ok) {
                    res = { ...v_res, fase: `${v_res.fase}+NOR+NAT+R0+O(${x},${y})` };
                    break;
                }
            }
            if (res.ok) break;
        }
    }

    const t = (Number(process.hrtime.bigint() - tStart) / 1e6).toFixed(0);
    console.log(`${res.ok?'✅':'🛡️'} ${label.padEnd(20)} | ID:${res.ok?res.id:'-------'} | ${t.padStart(8)}ms | ${res.ok? (res.fase.padEnd(18) + ' | ' + res.cliente) : 'LIMPIO'}`);
}

async function runFinalJudgment() {
    const gen = new GeneradorMBH();
    const meta = await sharp(RUTA_ORIGINAL).metadata();

    console.log("🚀 Generando Muestra Control...");
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA, { id_numerico: 0x000D760 });
    const imgRaw = fs.readFileSync(RUTA_SELLADA);

    console.log("\n⚖️  DRAGON3 V140 [STRATEGY: VERTICAL INVARIANT]: EL JUICIO FINAL\n");

    // NIVEL 1: COMPRESIÓN
    console.log("--- NIVEL 1: COMPRESIÓN ---");
    for (let q of [80, 50, 10, 5]) {
        await radar(await sharp(imgRaw).jpeg({quality:q}).toBuffer(), `JPEG_Q${q}`, meta);
    }

    // NIVEL 2: ESCALA
    console.log("\n--- NIVEL 2: ESCALA ---");
    for (let s of [0.75, 0.5, 0.3]) {
        await radar(await sharp(imgRaw).resize(Math.round(meta.width*s)).toBuffer(), `RESIZE_${s}x`, meta);
    }

    // NIVEL 3: SEÑAL Y COLOR
    console.log("\n--- NIVEL 3: SEÑAL Y COLOR ---");
    await radar(await sharp(imgRaw).greyscale().toBuffer(), "GREYSCALE", meta);
    await radar(await sharp(imgRaw).blur(1.5).toBuffer(), "GAUSSIAN_BLUR", meta);

    // NIVEL 4: GEOMETRÍA Y CROPS (El Terror del Sector)
    console.log("\n--- NIVEL 4: GEOMETRÍA (FINAL BOSS) ---");
    await radar(await sharp(imgRaw).flip().toBuffer(), "VERTICAL_FLIP", meta);
    await radar(await sharp(imgRaw).flop().toBuffer(), "HORIZONTAL_FLOP", meta);

    // --- BATERÍA DE CROPS ---
    const crops = [
        { l: 50, t: 50, n: "CROP_SYM_50px" },
        { l: 13, t: 27, n: "CROP_ASYM_13x27" },
        { l: 88, t: 5,  n: "CROP_ASYM_88x5" }
    ];
    for (let c of crops) {
        const cropBuf = await sharp(imgRaw).extract({left:c.l, top:c.t, width: meta.width-100, height: meta.height-100}).toBuffer();
        await radar(cropBuf, c.n, meta);
    }

    await radar(await sharp(imgRaw).resize(meta.width, Math.round(meta.height*0.5)).toBuffer(), "SQUASH_50%", meta);
    await radar(await sharp(imgRaw).rotate(90).toBuffer(), "ROTATE_90_DEG", meta);

    // El TILT sigue siendo experimental, pero ahora tiene más posibilidades
    await radar(await sharp(imgRaw).rotate(2).toBuffer(), "TILT_2_DEGREES", meta);

    console.log("\n🏁 JUICIO FINALIZADO. LA FÍSICA HA HABLADO.");
}

runFinalJudgment();
