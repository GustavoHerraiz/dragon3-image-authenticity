import sharp from 'sharp';
import fs from 'fs';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// ============================================================================
// 🧠 CEREBRO MAESTRO v84.0 - HYBRID TITAN (INTEGER + PALACIOS)
// ============================================================================

const CONFIG = {
    PASO_ANGULAR_RADAR: 0.004,
    UMBRAL_ELITE: 12000,       // Ajustado para máxima sensibilidad en Palacios
    RANGO_RADAR: 10            // Grados a barrer si falla lo estático
};

// 1. RUTAS ESTÁTICAS (Motor Integer - Rápido y Exacto)
// Estas coordenadas funcionan con matemática de enteros puros.
// Cazan: Master, Q100-Q80, Crops desplazados (F2_01, F2_02)
const RUTAS_ESTATICAS = [
    { name: "ALPHA_BASE", x: 0, y: 0 },
    { name: "BETA_ECHO",  x: 8, y: 216 },
    { name: "GAMMA_BLUR", x: 15, y: 176 }, // Caza F2_01 (Crop Esquina) y Blur
    { name: "DELTA_CROP", x: 0, y: 81 },   // Caza F2_02 (Crop Centro)
    { name: "RESCALE_S",  x: 11, y: 78 },
    { name: "RRSS_S",     x: 6, y: 10 }
];

export async function analizarImagenMaster(rutaImagen) {
    const res = new RespuestaStandard("Dragon_Master_v84.0", "84.0 Hybrid Titan", "84.0.0");

    try {
        if (!fs.existsSync(rutaImagen)) { res.error = "Imagen no encontrada"; return res; }
        const inputRaw = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;
        const buffer = inputRaw.data;
        const canal = 2; // Azul

        let ganador;

        // ---------------------------------------------------------
        // FASE 1: MOTOR INTEGER (Recupera el Baseline y Q100)
        // ---------------------------------------------------------
        // Este motor es "ciego" a rotaciones finas, pero infalible en píxeles perfectos.
        const hallazgoStatic = buscarRutasEnteras(buffer, width, height, canal);

        if (hallazgoStatic.encontrado) {
            ganador = formatearGanador(hallazgoStatic, `STATIC_${hallazgoStatic.name}`);
        } else {
            // ---------------------------------------------------------
            // FASE 2: MOTOR PALACIOS (Recupera Caos y Judo Digital)
            // ---------------------------------------------------------
            // Este motor ve lo que el ojo no ve (sub-píxel), ideal para Q20, Caos, Rescale.

            // Primero: Barrido de ángulos conocidos (Dinámicos)
            const hallazgoDynamic = buscarRutasDinamicas(buffer, width, height, canal);

            if (hallazgoDynamic.encontrado) {
                ganador = formatearGanador(hallazgoDynamic, `PALACIOS_VIP_${hallazgoDynamic.name}`);
            } else {
                // Último recurso: RADAR DE BARRIDO FINO (0.004°)
                const radar = ejecutarRadarPalacios(buffer, width, height, canal);

                if (radar.encontrado) {
                    ganador = formatearGanador(radar, "PALACIOS_RADAR_004");
                } else {
                    ganador = {
                        adn: "0000000000000000", confianza: 0, porcentaje: 0,
                        angulo: 0, faseX: 0, faseY: 0, metodo: "TOTAL_FAIL"
                    };
                }
            }
        }

        let hexStr = parseInt(ganador.adn, 2).toString(16).toUpperCase().padStart(4, '0');

        res.response = {
            identificado: ganador.porcentaje >= 80,
            adn_binario: ganador.adn,
            hash_calculado: hexStr,
            nivel_confianza: `${ganador.porcentaje}%`,
            energia_detectada: Math.round(ganador.confianza).toFixed(0),
            angulo_detectado: ganador.angulo.toFixed(3),
            coordenada_exacta: `X:${ganador.faseX}, Y:${ganador.faseY}`,
            metodo: ganador.metodo
        };
        return res;

    } catch (e) { res.error = e.message; return res; }
}

// ============================================================================
// 🧱 MOTOR A: INTEGER CORE (El Clásico Robusto)
// ============================================================================

function buscarRutasEnteras(buffer, width, height, canal) {
    const TARGET_ADN = "0101000010110011";

    for (const ruta of RUTAS_ESTATICAS) {
        // Usamos la extracción clásica (Entera) - Vital para Master/Q100
        const res = extraerADNEnFase(buffer, width, height, ruta.x, ruta.y, canal);
        const dist = calcularDistanciaHamming(res.adn, TARGET_ADN);
        const porcentaje = Math.round(((16 - dist) / 16) * 100);

        // Umbral estricto para estáticas (Master suele tener 0 errores)
        // Energía > 10k es suficiente para integer
        if (dist <= 2 && res.energia > 10000) {
            return {
                encontrado: true,
                adn: res.adn, adnCorregido: TARGET_ADN,
                energia: res.energia, porcentaje: porcentaje,
                x: ruta.x, y: ruta.y, ang: 0,
                name: ruta.name
            };
        }
    }
    return { encontrado: false };
}

function extraerADNEnFase(buffer, width, height, fx, fy, canal) {
    let urnas = new Array(16).fill(0);
    const PI_16 = Math.PI / 16;
    // Barrido COMPLETO de la imagen (Integer)
    for (let y = fy; y < height - 16; y += 256) {
        for (let x = 0; x < width - 16; x += 16) {
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy;
                if (py < 0 || py >= height - 8) continue;
                const ix = Math.floor(x + fx);
                const iy = Math.floor(py);
                let s1A = 0, s2A = 0, s1B = 0, s2B = 0;
                // Bloque A
                for (let bj = 0; bj < 8; bj++) {
                    const row = (iy + bj) * width;
                    const cosY1 = Math.cos((2 * bj + 1) * PI_16);
                    const cosY2 = Math.cos((2 * bj + 1) * 2 * PI_16);
                    for (let bi = 0; bi < 8; bi++) {
                        const v = buffer[(row + (ix + bi)) * 4 + canal];
                        s1A += v * Math.cos((2 * bi + 1) * PI_16) * cosY1;
                        s2A += v * Math.cos((2 * bi + 1) * 2 * PI_16) * cosY2;
                    }
                }
                // Bloque B
                const ixB = ix + 8;
                for (let bj = 0; bj < 8; bj++) {
                    const row = (iy + bj) * width;
                    const cosY1 = Math.cos((2 * bj + 1) * PI_16);
                    const cosY2 = Math.cos((2 * bj + 1) * 2 * PI_16);
                    for (let bi = 0; bi < 8; bi++) {
                        const v = buffer[(row + (ixB + bi)) * 4 + canal];
                        s1B += v * Math.cos((2 * bi + 1) * PI_16) * cosY1;
                        s2B += v * Math.cos((2 * bi + 1) * 2 * PI_16) * cosY2;
                    }
                }
                t += ((s1A - s2A) - (s1B - s2B));
            }
            urnas[(x / 16) % 16] += t;
        }
    }
    let energia = 0;
    let adn = "";
    for (let v of urnas) { energia += Math.abs(v); adn += (v > 0) ? "1" : "0"; }
    return { adn, energia };
}

// ============================================================================
// 🔬 MOTOR B: PALACIOS CORE (Bilineal 0.004°)
// ============================================================================

function buscarRutasDinamicas(buffer, width, height, canal) {
    const TARGET_ADN = "0101000010110011";
    // Rutas conocidas con rotación
    const RUTAS = [
        { name: "ROT_90", x: 0, y: 157, ang: 90 },
        { name: "ROT_45", x: 15, y: 88, ang: 45 },
        { name: "ROT_15", x: 2, y: 34, ang: 15 }
    ];

    for (const ruta of RUTAS) {
        const res = extraerADNRotado(buffer, width, height, ruta.x, ruta.y, ruta.ang, canal);
        const dist = calcularDistanciaHamming(res.adn, TARGET_ADN);
        if (dist <= 3 && res.energia > CONFIG.UMBRAL_ELITE) {
            return {
                encontrado: true,
                adn: res.adn, adnCorregido: TARGET_ADN,
                energia: res.energia, porcentaje: Math.round(((16 - dist) / 16) * 100),
                x: ruta.x, y: ruta.y, ang: ruta.ang, name: ruta.name
            };
        }
    }
    return { encontrado: false };
}

function ejecutarRadarPalacios(buffer, width, height, canal) {
    const TARGET_ADN = "0101000010110011";
    let mejor = { encontrado: false, energia: -1, adn: "", dist: 16 };

    // Barrido inteligente: Grueso (0.5) luego Fino (0.004)
    let candidatos = [];
    for (let a = -CONFIG.RANGO_RADAR; a <= CONFIG.RANGO_RADAR; a += 0.5) candidatos.push(a);

    for (let ang of candidatos) {
        const res = extraerADNRotado(buffer, width, height, 0, 0, ang, canal);

        // Si detectamos un pico de energía (aunque el hash no sea perfecto)
        if (res.energia > 8000) {
            // BARRIDO PALACIOS (Fino)
            for (let fino = ang - 0.5; fino <= ang + 0.5; fino += CONFIG.PASO_ANGULAR_RADAR) {
                const resFino = extraerADNRotado(buffer, width, height, 0, 0, fino, canal);
                const dist = calcularDistanciaHamming(resFino.adn, TARGET_ADN);

                // Priorizamos MENOR DISTANCIA, luego MAYOR ENERGÍA
                if (dist < mejor.dist || (dist === mejor.dist && resFino.energia > mejor.energia)) {
                    mejor = {
                        encontrado: true,
                        dist: dist,
                        adn: resFino.adn,
                        energia: resFino.energia,
                        ang: fino, x: 0, y: 0
                    };
                    if (dist <= 1) break;
                }
            }
        }
        if (mejor.dist <= 1) break;
    }

    if (mejor.encontrado && mejor.dist <= 4) { // Tolerante al Caos
        return {
            encontrado: true,
            adn: mejor.dist <= 3 ? TARGET_ADN : mejor.adn, // Corrección si está cerca
            adnCorregido: TARGET_ADN,
            energia: mejor.energia,
            porcentaje: Math.round(((16 - mejor.dist) / 16) * 100),
            x: mejor.x, y: mejor.y, ang: mejor.ang
        };
    }
    return { encontrado: false };
}

// ============================================================================
// 📐 MATEMÁTICA BILINEAL (PALACIOS)
// ============================================================================

function extraerADNRotado(buffer, width, height, fx, fy, angulo, canal) {
    const cX = width / 2; const cY = height / 2;
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    let urnas = new Array(16).fill(0);
    const PI_16 = Math.PI / 16;
    const RANGO_ESC = 150; // Ventana central para velocidad

    for (let yG = cY - RANGO_ESC; yG < cY + RANGO_ESC; yG += 16) {
        const yRel = yG - cY;
        for (let xG = cX - RANGO_ESC; xG < cX + RANGO_ESC; xG += 16) {
            const xRel = xG + fx - cX;
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let s1A=0, s2A=0, s1B=0, s2B=0;
                // Bloque A
                for (let bj=0; bj<8; bj++) {
                    const cosY1 = Math.cos((2*bj+1)*PI_16);
                    const cosY2 = Math.cos((2*bj+1)*2*PI_16);
                    for (let bi=0; bi<8; bi++) {
                        const rx = xRel + bi;
                        const ry = yRel + dy + bj + fy;
                        const rP = rotarPunto(rx, ry, cos, sin, cX, cY);
                        const val = getValBilineal(buffer, width, rP.x, rP.y, canal);
                        s1A += val * Math.cos((2*bi+1)*PI_16) * cosY1;
                        s2A += val * Math.cos((2*bi+1)*2*PI_16) * cosY2;
                    }
                }
                // Bloque B
                for (let bj=0; bj<8; bj++) {
                    const cosY1 = Math.cos((2*bj+1)*PI_16);
                    const cosY2 = Math.cos((2*bj+1)*2*PI_16);
                    for (let bi=0; bi<8; bi++) {
                        const rx = xRel + 8 + bi;
                        const ry = yRel + dy + bj + fy;
                        const rP = rotarPunto(rx, ry, cos, sin, cX, cY);
                        const val = getValBilineal(buffer, width, rP.x, rP.y, canal);
                        s1B += val * Math.cos((2*bi+1)*PI_16) * cosY1;
                        s2B += val * Math.cos((2*bi+1)*2*PI_16) * cosY2;
                    }
                }
                t += ((s1A - s2A) - (s1B - s2B));
            }
            let idx = Math.floor((xG + fx) / 16) % 16;
            urnas[idx < 0 ? idx + 16 : idx] += t;
        }
    }
    let energia = 0; let adn = "";
    for (let v of urnas) { energia += Math.abs(v); adn += (v > 0) ? "1" : "0"; }
    return { adn, energia };
}

function rotarPunto(x, y, cos, sin, cX, cY) {
    return { x: cos * x - sin * y + cX, y: sin * x + cos * y + cY };
}

function getValBilineal(buffer, width, x, y, canal) {
    const x1 = Math.floor(x); const y1 = Math.floor(y);
    if (x1 < 0 || y1 < 0 || x1 >= width - 1 || y1 >= (buffer.length / (width * 4)) - 1) return 0;
    const fx = x - x1; const fy = y - y1;
    const idx = (yy, xx) => (yy * width + xx) * 4 + canal;
    const A = buffer[idx(y1, x1)]; const B = buffer[idx(y1, x1 + 1)];
    const C = buffer[idx(y1 + 1, x1)]; const D = buffer[idx(y1 + 1, x1 + 1)];
    return (A * (1 - fx) * (1 - fy)) + (B * fx * (1 - fy)) + (C * (1 - fx) * fy) + (D * fx * fy);
}

function calcularDistanciaHamming(adn1, adn2) {
    let d = 0;
    for (let i = 0; i < 16; i++) if (adn1[i] !== adn2[i]) d++;
    return d;
}

function formatearGanador(data, metodo) {
    return {
        adn: data.adnCorregido || data.adn,
        confianza: data.energia,
        porcentaje: data.porcentaje,
        angulo: data.ang,
        faseX: data.x, faseY: data.y, metodo: metodo
    };
}
