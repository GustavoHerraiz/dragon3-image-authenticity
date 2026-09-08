import sharp from 'sharp';
import fs from 'fs';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// ... (Motores de cálculo V55 se mantienen igual) ...

export async function analizarImagenMaster(rutaImagen) {
    const res = new RespuestaStandard("Dragon_Master_v56", "56.0 Truth Seeker", "56.0.0");
    try {
        if (!fs.existsSync(rutaImagen)) { res.error = "Imagen no encontrada"; return res; }
        const inputRaw = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;
        const canal = 2;

        // 1. TIRO FIJO (La Verdad Absoluta en imágenes rectas)
        const v38 = extraerADN_V38_Integers(inputRaw.data, width, height, canal);

        // 2. RADAR AGRESIVO
        const radar = buscarConfiguracionUltra(inputRaw.data, width, height, canal);

        // 3. ARBITRAJE "TRUTH SEEKER"
        let ganador;

        // Solo cambiamos a RADAR si la mejora es SUSTANCIAL (>25%)
        // y el ángulo detectado es lo suficientemente grande para no ser ruido (~2°)
        const esGiroSignificativo = Math.abs(radar.angulo) > 2.0;
        const esMejoraAplastante = radar.score > v38.confianza * 1.25;

        if (esGiroSignificativo && esMejoraAplastante) {
            // El radar ha encontrado una señal rotada real
            const final = extraerADNBestPhase(inputRaw.data, width, height, radar.angulo, radar.faseY, canal);
            ganador = { adn: final.adn, confianza: final.confianza, angulo: radar.angulo, metodo: "RADAR_DOMINATOR" };
        } else {
            // Es una imagen recta (o el radar está viendo fantasmas en el ruido)
            ganador = { adn: v38.adn, confianza: v38.confianza, angulo: 0, metodo: "TIRO_FIJO_WIN" };
        }

        let hexStr = parseInt(ganador.adn, 2).toString(16).toUpperCase().padStart(4, '0');
        res.response = {
            identificado: true,
            adn_binario: ganador.adn,
            hash_calculado: hexStr,
            energia_detectada: ganador.confianza.toFixed(0),
            angulo_detectado: ganador.angulo,
            metodo: ganador.metodo
        };
        return res;
    } catch (e) { res.error = e.message; return res; }
}

function buscarConfiguracionUltra(buffer, width, height, canal) {
    let mejor = { angulo: 0, faseY: 0, score: -1 };
    const cX = width / 2; const cY = height / 2;
    // Barrido grueso pero denso
    for (let ang = -45; ang <= 45; ang += 1.5) {
        const rad = ang * (Math.PI / 180);
        const cos = Math.cos(rad); const sin = Math.sin(rad);
        for (let fy = -128; fy < 128; fy += 16) {
            // PROBAMOS 4 FASES X PARA QUE EL RADAR NO SEA CIEGO AL CROP
            for (let fx = 0; fx < 16; fx += 4) {
                const score = probarConfiguracion(buffer, width, height, cX, cY, cos, sin, fy, fx, canal, 48);
                if (score > mejor.score) mejor = { angulo: ang, faseY: fy, score: score };
            }
        }
    }
    // Ajuste Fino
    let fino = { ...mejor };
    for (let ang = mejor.angulo - 2; ang <= mejor.angulo + 2; ang += 0.25) {
        const rad = ang * (Math.PI / 180);
        for (let fy = mejor.faseY - 12; fy <= mejor.faseY + 12; fy += 4) {
            const score = probarConfiguracion(buffer, width, height, cX, cY, Math.cos(rad), Math.sin(rad), fy, 0, canal, 24);
            if (score > fino.score) fino = { angulo: ang, faseY: fy, score: score };
        }
    }
    return fino;
}

function extraerADNBestPhase(buffer, width, height, angulo, faseY, canal) {
    const cX = width / 2; const cY = height / 2;
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    let mejor = { adn: "", confianza: -1 };
    for (let fx = 0; fx < 16; fx++) {
        let urnas = new Array(16).fill(0);
        for (let yG = faseY; yG < height + 256; yG += 256) {
            const yR = yG - cY;
            for (let xG = -width; xG < width * 1.5; xG += 16) {
                const xR = xG - cX;
                let t = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const ay = Math.round(sin * xR + cos * (yR + dy)) + cY;
                    const ax = Math.round(cos * xR - sin * (yR + dy)) + cX;
                    const by = Math.round(sin * (xR + 8) + cos * (yR + dy)) + cY;
                    const bx = Math.round(cos * (xR + 8) - sin * (yR + dy)) + cX;
                    t += (getTension(buffer, width, height, ax, ay, canal) - getTension(buffer, width, height, bx, by, canal));
                }
                let idx = Math.floor((xG + fx) / 16) % 16;
                urnas[idx < 0 ? idx + 16 : idx] += t;
            }
        }
        let p = 0; let adn = "";
        for (let i = 0; i < 16; i++) { p += Math.abs(urnas[i]); adn += (urnas[i] > 0) ? "1" : "0"; }
        if (p > mejor.confianza) mejor = { adn, confianza: p };
    }
    return mejor;
}

function probarConfiguracion(buffer, width, height, cX, cY, cos, sin, fY, fX, canal, pX) {
    let s = 0;
    for (let yG = fY; yG < height + 256; yG += 256) {
        const yR = yG - cY;
        for (let xG = 0; xG < width; xG += pX) {
            const xR = xG - cX;
            const ax = Math.round(cos * xR - sin * yR) + cX;
            const ay = Math.round(sin * xR + cos * yR) + cY;
            const bx = Math.round(cos * (xR + 8) - sin * yR) + cX;
            const by = Math.round(sin * (xR + 8) + cos * yR) + cY;
            s += Math.abs(getTension(buffer, width, height, ax, ay, canal) - getTension(buffer, width, height, bx, by, canal));
        }
    }
    return s;
}

function extraerADN_V38_Integers(buffer, width, height, canal) {
    let urnas = new Array(16).fill(0);
    for (let y = 0; y < height + 256; y += 256) {
        for (let x = 0; x < width; x += 16) {
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy; if (py < 0 || py >= height) continue;
                t += (getTension(buffer, width, height, x, py, canal) - getTension(buffer, width, height, x + 8, py, canal));
            }
            urnas[Math.floor(x / 16) % 16] += t;
        }
    }
    let e = 0; let adn = "";
    for (let i = 0; i < 16; i++) { e += Math.abs(urnas[i]); adn += (urnas[i] > 0) ? "1" : "0"; }
    return { adn, confianza: e };
}

function getTension(buffer, width, height, x, y, canal) {
    const ix = Math.floor(x); const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix + 8 >= width || iy + 8 >= height) return 0;
    let s1 = 0, s2 = 0;
    for (let bj = 0; bj < 8; bj++) {
        const row = (iy + bj) * width;
        for (let bi = 0; bi < 8; bi++) {
            const v = buffer[(row + (ix + bi)) * 4 + canal];
            s1 += v * Math.cos(((2 * bi + 1) * Math.PI) / 16) * Math.cos(((2 * bj + 1) * Math.PI) / 16);
            s2 += v * Math.cos(((2 * bi + 1) * 2 * Math.PI) / 16) * Math.cos(((2 * bj + 1) * 2 * Math.PI) / 16);
        }
    }
    return s1 - s2;
}
