import sharp from 'sharp';
import crypto from 'crypto';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    DISTANCIA: 32.3,                
    UMBRAL_ELITE: 30.0,             
    PASO_FINO: 0.1,
    PASO_ANGULAR: 0.005,
    quicoTarget: "1101011101100000",
    PUNTOS_ORO: [48, 154, 63, 134, 144, 180, 225, 271, 316, 37, 107, 129, 159, 202, 247, 293, 338]
};

// --- [A] FUNCIONES MATEMÁTICAS ---
function rotarPunto(x, y, cX, cY, angulo) {
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    return { x: cos * (x - cX) - sin * (y - cY) + cX, y: sin * (x - cX) + cos * (y - cY) + cY };
}

function getVogelPoint(n, cX, cY, escala) {
    const r = escala * Math.sqrt(n);
    const theta = n * 137.50776405 * (Math.PI / 180);
    return { x: cX + r * Math.cos(theta), y: cY + r * Math.sin(theta) };
}

function getValBilineal(buffer, width, x, y, canal) {
    const x1 = Math.floor(x); const y1 = Math.floor(y);
    const fx = x - x1; const fy = y - y1;
    if (x1 < 0 || x1 >= width - 1 || y1 < 0 || (y1 + 1) * width * 4 >= buffer.length) return 0;
    const idx = (yy, xx) => (yy * width + xx) * 4 + canal;
    return (buffer[idx(y1, x1)] * (1 - fx) * (1 - fy)) +
           (buffer[idx(y1, x1 + 1)] * fx * (1 - fy)) +
           (buffer[idx(y1 + 1, x1)] * (1 - fx) * fy) +
           (buffer[idx(y1 + 1, x1 + 1)] * fx * fy);
}

function dct8x8(block) {
    let dct = Array(8).fill(0).map(() => Array(8).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;
            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

function extraerBits(d) {
    const pares = [[1,2,2,1], [1,3,3,1], [2,3,3,2], [4,1,1,4], [4,2,2,4], [3,3,1,1], [0,4,4,0], [5,1,1,5],
                   [1,4,4,1], [2,4,4,2], [3,4,4,3], [0,5,5,0], [1,5,5,1], [2,5,5,2], [3,5,5,3], [4,5,5,4]];
    let bits = "";
    for (const [v, u, v2, u2] of pares) bits += (Math.abs(d[v][u]) > Math.abs(d[v2][u2])) ? "1" : "0";
    return bits;
}

// --- [B] EL GADGET DE IDENTIDAD (Ingeniería Inversa) ---
function analizarBodaForense(eliteNodes, hashAutor = "d760") {
    const rawData = eliteNodes.join("|");
    const dniObra = crypto.createHash('md5').update(rawData).digest('hex').slice(0, 10).toUpperCase();
    
    const sumaAutor = [...hashAutor].reduce((acc, curr) => acc + parseInt(curr, 16), 0);
    const sumaObra = [...dniObra].reduce((acc, curr) => acc + parseInt(curr, 16), 0);
    const ratio = (sumaObra / sumaAutor).toFixed(2);
    const deriva = (ratio - 2.50).toFixed(2);
    
    return { dniObra, ratio, deriva, bodaOk: Math.abs(ratio - 2.5) < 0.15 };
}

// --- [C] EJECUCIÓN ---
export async function analizadorImagenMBH_v22(ruta, anguloReferencia = 0) {
    const res = new RespuestaStandard("analizadorMBH_v22_Scalpel", "v22.2", "22.2");
    try {
        const inputRaw = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;
        const buffer = inputRaw.data;
        const cX = width / 2; const cY = height / 2;

        let bestResult = { dH: 16, eliteNodes: [], dx: 0, dy: 0, ang: 0, energia: 0 };

        // Radar agresivo optimizado
        for (let dy = -10; dy <= 10; dy += 1) {
            for (let dx = -10; dx <= 10; dx += 1) {
                let currentNodes = [];
                let sumaEnergia = 0;

                for (const n of CONFIG.PUNTOS_ORO) {
                    const pV = getVogelPoint(n, cX + dx, cY + dy, CONFIG.DISTANCIA);
                    const p = rotarPunto(pV.x, pV.y, cX, cY, anguloReferencia);

                    if (p.x < 8 || p.x > width - 16 || p.y < 8 || p.y > height - 16) continue;

                    let block = [];
                    for (let bj = 0; bj < 8; bj++) {
                        let row = [];
                        for (let bi = 0; bi < 8; bi++) row.push(getValBilineal(buffer, width, p.x + bi, p.y + bj, 2));
                        block.push(row);
                    }

                    const d = dct8x8(block);
                    const potencia = Math.abs(d[1][1] - d[2][2]);
                    sumaEnergia += potencia;
                    if (potencia >= CONFIG.UMBRAL_ELITE) currentNodes.push(extraerBits(d));
                }

                if (currentNodes.length > 0) {
                    let adnTemp = "";
                    for (let i = 0; i < 16; i++) {
                        let unos = currentNodes.filter(raw => raw[i] === "1").length;
                        adnTemp += (unos > currentNodes.length / 2) ? "1" : "0";
                    }
                    let dH = 0;
                    for(let i=0; i<16; i++) if(adnTemp[i] !== CONFIG.quicoTarget[i]) dH++;

                    if (dH < bestResult.dH) {
                        bestResult = { dH, eliteNodes: currentNodes, dx, dy, ang: anguloReferencia, energia: (sumaEnergia/17).toFixed(2) };
                    }
                }
            }
        }

        if (bestResult.dH <= 4) {
            const boda = analizarBodaForense(bestResult.eliteNodes);
            res.response.identificado = true;
            res.response.dni_obra = boda.dniObra;
            res.response.resonancia = boda.ratio;
            res.response.deriva = boda.deriva;
            res.response.energia_bulto = bestResult.energia;
            res.response.hits = bestResult.eliteNodes.length;
            res.response.veredicto = boda.bodaOk ? "ORIGINAL CERTIFICADO + BODA 5/2" : "IDENTIDAD COMPROMETIDA (RUIDO)";
        }
        return res;
    } catch (e) { return res; }
}