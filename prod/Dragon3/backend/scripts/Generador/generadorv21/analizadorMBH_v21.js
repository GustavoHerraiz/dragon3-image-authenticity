import sharp from 'sharp';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    DISTANCIA: 32.3,                // Bloqueado a tu malla soberana
    UMBRAL_ELITE: 30.0,             // 🔍 SENSIBILIDAD TOTAL: Bajamos a 30 para ver en la oscuridad de Q30
    PASO_FINO: 0.1,
    PASO_ANGULAR: 0.005,
    quicoTarget: "1101011101100000" // ADN d760
};

// --- [A] FUNCIONES MATEMÁTICAS ---
function rotarPunto(x, y, cX, cY, angulo) {
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    return { x: cos * (x - cX) - sin * (y - cY) + cX, y: sin * (x - cX) + cos * (y - cY) + cY };
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

function evaluarFase(buffer, width, height, cX, cY, dx, dy, angulo) {
    let eliteNodes = [];
    for (let iy = -3; iy <= 3; iy++) {
        for (let ix = -3; ix <= 3; ix++) {
            const p = rotarPunto(cX + dx + (ix * CONFIG.DISTANCIA), cY + dy + (iy * CONFIG.DISTANCIA), cX, cY, angulo);
            if (p.x < 8 || p.x > width - 16 || p.y < 8 || p.y > height - 16) continue;
            let block = [];
            for (let bj = 0; bj < 8; bj++) {
                let row = [];
                for (let bi = 0; bi < 8; bi++) row.push(getValBilineal(buffer, width, p.x + bi, p.y + bj, 2));
                block.push(row);
            }
            const d = dct8x8(block);
            if (Math.abs(d[1][1] - d[2][2]) >= CONFIG.UMBRAL_ELITE) eliteNodes.push(extraerBits(d));
        }
    }
    if (eliteNodes.length < 2) return null; // Solo 2 nodos para disparar el radar

    let adnConsolidado = "";
    for (let i = 0; i < 16; i++) {
        let unos = eliteNodes.filter(raw => raw[i] === "1").length;
        adnConsolidado += (unos > eliteNodes.length / 2) ? "1" : "0";
    }
    let dH = 0;
    for(let i=0; i<16; i++) if(adnConsolidado[i] !== CONFIG.quicoTarget[i]) dH++;
    return { dH, adn: adnConsolidado, n: eliteNodes.length };
}

// --- [B] EJECUCIÓN ---

export async function analizadorImagenMBH_v21(ruta, anguloReferencia = 0) {
    const res = new RespuestaStandard("analizadorMBH_v21", "v21.200", "21.200");
    try {
        const inputRaw = await sharp(ruta).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;
        const buffer = inputRaw.data;
        const cX = width / 2; const cY = height / 2;

        let globalBest = { dH: 16, angulo: anguloReferencia, dx: 0, dy: 0, n: 0 };

        // RADAR AGRESIVO: ±25px, paso 1px
        for (let dy = -25; dy <= 25; dy++) {
            for (let dx = -25; dx <= 25; dx++) {
                const r = evaluarFase(buffer, width, height, cX, cY, dx, dy, anguloReferencia);

                // Si hay rastro de Quico (dH <= 4), refinamos
                if (r && r.dH <= 4) {
                    for (let fdy = dy - 0.5; fdy <= dy + 0.5; fdy += 0.2) {
                        for (let fdx = dx - 0.5; fdx <= dx + 0.5; fdx += 0.2) {
                            for (let dA = -0.5; dA <= 0.5; dA += 0.02) {
                                const a = anguloReferencia + dA;
                                const f = evaluarFase(buffer, width, height, cX, cY, fdx, fdy, a);
                                if (f && f.dH < globalBest.dH) {
                                    globalBest = { ...f, dx: fdx, dy: fdy, angulo: a };
                                    if (f.dH === 0) {
                                        res.response.identificado = true;
                                        res.response.rotacion_detectada = `${a}`;
                                        res.response.evidencia_visual = { Cliente: "Quico Melero", Hits: f.n };
                                        return res;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (globalBest.dH <= 2) {
            res.response.identificado = true;
            res.response.rotacion_detectada = `${globalBest.angulo}`;
            res.response.evidencia_visual = { Cliente: "Quico Melero", Hits: globalBest.n };
        }
        return res;
    } catch (e) { return res; }
}
