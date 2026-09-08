import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';
import { GeneradorMBH } from './generadorMBH.js';

const RUTA_SELLADA = './input/firma_test_SELLADA.png';
const RUTA_ORIGINAL = './input/firma_test.jpg';

const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

class DragonSync {
    // 🔍 FÍSICA DIFERENCIAL PURA (D1,1 - D2,2)
    static getDCTDiff(data, info, x, y) {
        if (x < 0 || y < 0 || x + 8 > info.width || y + 8 > info.height) return 0;
        let sum11 = 0, sum22 = 0;
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                let idx = ((y + i) * info.width + (x + j)) * 4 + 2;
                let val = data[idx] - 128;
                sum11 += val * COS_TABLE[1 * 8 + j] * COS_TABLE[1 * 8 + i];
                sum22 += val * COS_TABLE[2 * 8 + j] * COS_TABLE[2 * 8 + i];
            }
        }
        return sum11 - sum22;
    }

    // 🧬 EXTRACTOR ROBUSTO (Usa la redundancia de filas)
    static extraerBits(data, info, offX, offY) {
        let acumuladores = Array(64).fill(0);
        // Promediamos 10 filas de bloques para limpiar ruido
        for (let row = 0; row < 10; row++) {
            let y = offY + (row * 8);
            if (y + 8 > info.height) break;
            let stepIndex = 0;
            for (let x = offX; x <= info.width - 8; x += 8) {
                acumuladores[stepIndex % 64] += this.getDCTDiff(data, info, x, y);
                stepIndex++;
            }
        }
        return Array.from({length: 32}, (_, i) => (acumuladores[i * 2] > acumuladores[i * 2 + 1] ? "1" : "0")).join('');
    }

    static validar(bits) {
        const intentarValidar = (b) => {
            const idInt = (parseInt(b.substring(0, 28), 2)) >>> 0;
            const idHex = idInt.toString(16).toUpperCase().padStart(7, '0');
            const chk = parseInt(b.substring(28), 2);
            const low = idInt & 0x3FFF; const high = (idInt >> 14) & 0x3FFF;
            const calc = ((low ^ high) * 19 ^ ((low ^ high) * 19 >> 6)) & 0x0F;
            const reg = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix === idHex);
            return { ok: chk === calc && !!reg, id: idHex, cliente: reg?.cliente };
        };
        for (let i = 0; i < 32; i++) {
            let rotated = bits.substring(i) + bits.substring(0, i);
            let r = intentarValidar(rotated); if (r.ok) return r;
            let inv = rotated.split('').map(x => x === '1' ? '0' : '1').join('');
            let rI = intentarValidar(inv); if (rI.ok) return rI;
        }
        return { ok: false };
    }

    static async ejecutar(buffer, label) {
        const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const tStart = process.hrtime.bigint();

        // 1. SINCRONIZACIÓN DE REJILLA (Detectamos desfase X e Y)
        let mejoresX = [];
        for (let fx = 0; fx < 8; fx++) {
            let e = 0;
            for (let i = 0; i < 40; i++) e += Math.abs(this.getDCTDiff(data, info, fx + i * 8, 32));
            mejoresX.push({ f: fx, e });
        }
        const bestX = mejoresX.sort((a,b) => b.e - a.e)[0].f;

        let mejoresY = [];
        for (let fy = 0; fy < 8; fy++) {
            let e = 0;
            for (let i = 0; i < 40; i++) e += Math.abs(this.getDCTDiff(data, info, 32, fy + i * 8));
            mejoresY.push({ f: fy, e });
        }
        const bestY = mejoresY.sort((a,b) => b.e - a.e)[0].f;

        // 2. BARRIDO DE BLOQUES (64 posiciones)
        let encontrado = false;
        for (let b = 0; b < 64; b++) {
            const bits = this.extraerBits(data, info, bestX + (b * 8), bestY);
            const res = this.validar(bits);
            if (res.ok) {
                const t = (Number(process.hrtime.bigint() - tStart) / 1e6).toFixed(0);
                console.log(`✅ ${label.padEnd(20)} | ID:${res.id} | ${t.padStart(5)}ms | O:(${bestX},${bestY}) B:${b}`);
                encontrado = true; break;
            }
        }
        if (!encontrado) console.log(`🛡️ ${label.padEnd(20)} | ID:------- | LIMPIO / NO DETECTADO`);
    }
}

async function runStableTest() {
    const gen = new GeneradorMBH();
    await gen.sellarImagen(RUTA_ORIGINAL, RUTA_SELLADA, { id_numerico: 0x000D760 });
    const imgRaw = fs.readFileSync(RUTA_SELLADA);

    console.log("\n🐉 DRAGON-SYNC V3.5 STABLE: RECUPERANDO EL TIER 0\n");

    const c1 = await sharp(imgRaw).extract({left:27, top:27, width:500, height:500}).toBuffer();
    await DragonSync.ejecutar(c1, "CROP_SYM_27px");

    const c2 = await sharp(imgRaw).extract({left:43, top:17, width:500, height:500}).toBuffer();
    await DragonSync.ejecutar(c2, "CROP_ASYM_43x17");

    const tilt = await sharp(imgRaw).rotate(2).toBuffer();
    await DragonSync.ejecutar(tilt, "TILT_2_DEGREES");
}

runStableTest();
