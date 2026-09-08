import sharp from 'sharp';
import fs from 'fs';
import { performance } from 'perf_hooks';
import { GeneradorMBH } from './generadorMBH.js';

const RUTA_INPUT = './input/firma_test.jpg';
const RUTA_TEMP_SELLADA = './input/firma_test_SELLADA.png';
const ID_A_GENERAR = 0x000D760;

async function ejecutarPruebaReina() {
    console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║      DRAGON3 V97 — TEST REAL: EL MURO DEL Q1 (SUB-ZERO)          ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝`);

    const generador = new GeneradorMBH();
    await generador.sellarImagen(RUTA_INPUT, RUTA_TEMP_SELLADA, { id_numerico: ID_A_GENERAR });

    const idDec = ID_A_GENERAR;
    const low = idDec & 0x3FFF;
    const high = (idDec >> 14) & 0x3FFF;
    let mix = (low ^ high) * 19;
    const chkReal = (mix ^ (mix >> 6)) & 0x0F;
    const payload32 = ((idDec << 4) | chkReal) >>> 0;
    const BIN_OBJETIVO = payload32.toString(2).padStart(32, '0');
    const HEX_ID_OBJETIVO = idDec.toString(16).toUpperCase().padStart(7, '0');
    const DB_REGISTRO = [HEX_ID_OBJETIVO];

    const COS = Array(3).fill(0).map((_, u) => {
        let t = new Float32Array(8);
        for (let x = 0; x < 8; x++) t[x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
        return t;
    });

    function getDiffEnergy(buf, w, x, y) {
        let d11 = 0, d22 = 0;
        for (let i = 0; i < 8; i++) {
            const row = (y + i) * w * 4;
            for (let j = 0; j < 8; j++) {
                const p = buf[row + (x + j) * 4 + 2] - 128;
                d11 += p * COS[1][j] * COS[1][i];
                d22 += p * COS[2][j] * COS[2][i];
            }
        }
        return (d11 * 0.25) - (d22 * 0.25);
    }

    async function scan(bufferRaw, info, q) {
        const start = performance.now();
        let mejor = { aciertos: -1, adn: "", hexID: "", chkL: 0, chkC: 0, bd: "NO_EXISTE", off: "", inv: false };

        for (let offY = 0; offY < 8; offY++) {
            for (let offX = 0; offX < 8; offX++) {
                let urnas = new Float32Array(64).fill(0);
                let count = new Float32Array(64).fill(0);
                let step = 0;
                for (let y = offY; y <= info.height - 8; y += 8) {
                    for (let x = offX; x <= info.width - 8; x += 8) {
                        urnas[step % 64] += getDiffEnergy(bufferRaw, info.width, x, y);
                        count[step % 64]++;
                        step++;
                    }
                }
                for (let i = 0; i < 64; i++) urnas[i] /= (count[i] || 1);

                for (let inv of [false, true]) {
                    let adn = "";
                    let aciertos = 0;
                    for (let b = 0; b < 32; b++) {
                        const bit = (urnas[b * 2] > urnas[b * 2 + 1] ? "1" : "0");
                        const finalBit = inv ? (bit === "1" ? "0" : "1") : bit;
                        adn += finalBit;
                        if (finalBit === BIN_OBJETIVO[b]) aciertos++;
                    }

                    const idDecL = parseInt(adn.slice(0, 28), 2);
                    const hexL = idDecL.toString(16).toUpperCase().padStart(7, '0');
                    const chkL = parseInt(adn.slice(28, 32), 2);
                    const l = idDecL & 0x3FFF; const h = (idDecL >> 14) & 0x3FFF;
                    let m = (l ^ h) * 19; const chkC = (m ^ (m >> 6)) & 0x0F;
                    const bdOk = DB_REGISTRO.includes(hexL);

                    if (aciertos > mejor.aciertos) {
                        mejor = { aciertos, hexID: hexL, chkL, chkC, bd: bdOk ? "ENCUENTRA" : "NO_EXISTE", off: `[${offX},${offY}]`, inv, adn };
                    }
                    if (bdOk && chkL === chkC && hexL === HEX_ID_OBJETIVO) {
                        console.log(`✅ Q=${q.toString().padEnd(4)} | ID:${hexL} | CHK:${chkL}==${chkC} | BD:ENCUENTRA | Off:${offX},${offY} | Fase:${inv?'INV':'NOR'} | ${(performance.now()-start).toFixed(0)}ms`);
                        return true;
                    }
                }
            }
        }
        const mapa = mejor.adn.split('').map((b, i) => b === BIN_OBJETIVO[i] ? '.' : 'X').join('');
        console.log(`❌ Q=${q.toString().padEnd(4)} | Mejor:${mejor.aciertos}/32 | ID:${mejor.hexID} | CHK:${mejor.chkL} vs ${mejor.chkC} | BD:${mejor.bd} | Off:${mejor.off} | Fase:${mejor.inv?'INV':'NOR'}`);
        console.log(`   └─ Mapa: ${mapa}`);
        return false;
    }

    const bufferSellado = fs.readFileSync(RUTA_TEMP_SELLADA);

    console.log(`\n--- FASE 1: DESCENSO RÁPIDO (100 -> 10) ---`);
    for (let q = 100; q >= 10; q -= 10) {
        const attack = await sharp(bufferSellado).jpeg({ quality: q }).toBuffer();
        const { data, info } = await sharp(attack).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        await scan(data, info, q);
    }

    console.log(`\n--- FASE 2: ZONA SUB-ZERO (9 -> 1) ---`);
    for (let q = 9; q >= 1; q--) {
        const attack = await sharp(bufferSellado).jpeg({ quality: q }).toBuffer();
        const { data, info } = await sharp(attack).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        await scan(data, info, q);
    }
}

ejecutarPruebaReina();
