import sharp from 'sharp';
import fs from 'fs';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// ============================================================================
// 🧠 CEREBRO MAESTRO v85.33 - THE ARENA (COMPETENCIA TOTAL DE MOTORES)
// ============================================================================

const CONFIG = {
    // V23 CONSTANTS
    PASO_ANGULAR_RADAR: 0.004,
    UMBRAL_ELITE_PALACIOS: 12000,
    RANGO_RADAR: 10,

    // V85 CONSTANTS
    PASO_GRID_Q20: 8,
    UMBRAL_VIP_Q20: 19.0
};

// RUTAS ESTÁTICAS V23
const RUTAS_ESTATICAS = [
    { name: "ALPHA_BASE", x: 0, y: 0 },
    { name: "BETA_ECHO",  x: 8, y: 216 },
    { name: "GAMMA_BLUR", x: 15, y: 176 },
    { name: "DELTA_CROP", x: 0, y: 81 },
    { name: "RESCALE_S",  x: 11, y: 78 },
    { name: "RRSS_S",     x: 6, y: 10 }
];

export async function analizarImagenCiega(rutaImagen) {
    const res = new RespuestaStandard("Dragon_Blind_v85.33", "The Arena", "85.33.0");

    try {
        if (!fs.existsSync(rutaImagen)) { res.error = "Imagen no encontrada"; return res; }

        const inputRaw = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;
        const buffer = inputRaw.data;
        const canal = 2; // Azul

        console.log(`\n[DEBUG ANALIZADOR] 📏 Dimensiones: ${width}x${height}`);

        // ARRAY DE GLADIADORES (CANDIDATOS)
        let candidatos = [];

        // ====================================================================
        // 🧱 GLADIADOR 1: MOTOR INTEGER (Velocidad y Q100-Q20)
        // ====================================================================
        // Es excelente para Master y Compresión, pero malo rotando.
        // Aún así, lo dejamos competir.
        const hallazgoInteger = buscarRutasEnteras(buffer, width, height, canal);
        if (hallazgoInteger.encontrado) {
            candidatos.push(formatearGanador(hallazgoInteger, `V23_INTEGER_${hallazgoInteger.name}`));
        }

        // ====================================================================
        // 🔬 GLADIADOR 2: MOTOR PALACIOS (El Especialista en Rotación)
        // ====================================================================
        // Siempre le damos oportunidad, porque si acierta el ángulo, su energía
        // superará al ruido del Integer.

        // 2.1 Rutas Dinámicas
        const hallazgoDynamic = buscarRutasDinamicas(buffer, width, height, canal);
        if (hallazgoDynamic.encontrado) {
            candidatos.push(formatearGanador(hallazgoDynamic, `V23_PALACIOS_${hallazgoDynamic.name}`));
        }

        // 2.2 Radar (Solo si nadie ha dado un golpe fuerte aún, para ahorrar CPU)
        // Si ya tenemos un Integer con > 500k de energía, el radar no hace falta.
        // Pero si tenemos dudas (ruido de rotación ~200k), ejecutamos radar.
        const mejorEnergiaHastaAhora = candidatos.length > 0 ? Math.max(...candidatos.map(c => c.confianza)) : 0;

        if (mejorEnergiaHastaAhora < 300000) { // Umbral para activar Radar
            console.log(`[DEBUG ANALIZADOR] 📡 Activando Radar Palacios...`);
            const radar = ejecutarRadarPalacios(buffer, width, height, canal);
            if (radar.encontrado) {
                candidatos.push(formatearGanador(radar, "V23_RADAR_PALACIOS"));
            }
        }

        // ====================================================================
        // 🚑 GLADIADOR 3: MOTOR SURVIVOR (El Rescatista Q20)
        // ====================================================================
        // Solo entra si los grandes han fallado o están débiles.
        // Q20 real suele dar ~140k en Integer.
        // Q10 dañado podría necesitar esto.

        const survivor = ejecutarProtocoloSurvivor(buffer, width, height, canal);
        // Escalamos energía survivor (0-50) a escala Palacios (x3000 aprox) para que pueda competir
        // Nota: En el log anterior, Q20 Integer dio 146k.
        // Survivor dio 25 (en autopsia). 25 * 6000 = 150k.
        const energiaSurvivorNormalizada = survivor.energia * 6000;

        if (survivor.encontrado) {
            candidatos.push({
                adn: survivor.adn,
                confianza: energiaSurvivorNormalizada,
                energiaReal: survivor.energia,
                porcentaje: 90,
                angulo: 0,
                metodo: "V85_SURVIVOR_GRID"
            });
        }

        // ====================================================================
        // 🏆 EL JUICIO FINAL
        // ====================================================================

        // Ordenamos por CONFIANZA (Energía) descendente
        candidatos.sort((a, b) => b.confianza - a.confianza);

        let ganador = candidatos.length > 0 ? candidatos[0] : { adn: "0000000000000000", confianza: 0, metodo: "FAIL" };

        let hexStr = "UNKNOWN";
        if (ganador.adn && ganador.adn.length === 16) {
            hexStr = parseInt(ganador.adn, 2).toString(16).toUpperCase().padStart(4, '0');
        }

        console.log(`[DEBUG FINAL] 🏆 Ganador: ${hexStr} (${ganador.metodo}) | Energía: ${ganador.confianza.toFixed(0)}`);

        res.response = {
            identificado: ganador.confianza > 5000, // Umbral mínimo de dignidad
            adn_detectado: ganador.adn || "NO_SIGNAL",
            hash_calculado: hexStr,
            consenso_nodos: ganador.metodo,
            angulo_estimado: (ganador.angulo || 0).toFixed(3),
            energia_promedio: Math.round(ganador.confianza).toFixed(0),
            metodo: ganador.metodo
        };
        return res;

    } catch (e) { res.error = e.message; return res; }
}

// ============================================================================
// 🧱 BLOQUE 1: FUNCIONES DEL MOTOR V23 (INTEGER & PALACIOS)
// ============================================================================

function buscarRutasEnteras(buffer, width, height, canal) {
    let mejor = { encontrado: false, energia: 0 };
    for (const ruta of RUTAS_ESTATICAS) {
        const res = extraerADNEnFase(buffer, width, height, ruta.x, ruta.y, canal);
        if (res.energia > mejor.energia) {
            mejor = {
                encontrado: res.energia > 8000,
                adn: res.adn,
                energia: res.energia,
                x: ruta.x, y: ruta.y,
                name: ruta.name
            };
        }
    }
    return mejor;
}

function buscarRutasDinamicas(buffer, width, height, canal) {
    const RUTAS = [
        { name: "ROT_90", x: 0, y: 157, ang: 90 },
        { name: "ROT_45", x: 15, y: 88, ang: 45 },
        { name: "ROT_15", x: 2, y: 34, ang: 15 }
    ];
    let mejor = { encontrado: false, energia: 0 };

    for (const ruta of RUTAS) {
        const res = extraerADNRotado(buffer, width, height, ruta.x, ruta.y, ruta.ang, canal);
        if (res.energia > mejor.energia) {
            mejor = {
                encontrado: res.energia > CONFIG.UMBRAL_ELITE_PALACIOS,
                adn: res.adn, energia: res.energia,
                x: ruta.x, y: ruta.y, ang: ruta.ang, name: ruta.name
            };
        }
    }
    return mejor;
}

function ejecutarRadarPalacios(buffer, width, height, canal) {
    let mejor = { encontrado: false, energia: 0 };
    for (let ang = -CONFIG.RANGO_RADAR; ang <= CONFIG.RANGO_RADAR; ang += 0.5) {
        const res = extraerADNRotado(buffer, width, height, 0, 0, ang, canal);
        if (res.energia > mejor.energia) {
            mejor = {
                encontrado: res.energia > 8000,
                adn: res.adn, energia: res.energia, ang: ang
            };
        }
    }
    return mejor;
}

// --- MATEMÁTICA V23 ---

function extraerADNEnFase(buffer, width, height, fx, fy, canal) {
    let urnas = new Array(16).fill(0);
    const PI_16 = Math.PI / 16;
    for (let y = fy; y < height - 16; y += 256) {
        for (let x = 0; x < width - 16; x += 16) {
            let t = 0;
            for (let dy = -1; dy <= 1; dy++) {
                let py = y + dy;
                if (py < 0 || py >= height - 8) continue;
                const ix = Math.floor(x + fx);
                const iy = Math.floor(py);
                let s1A = 0, s2A = 0, s1B = 0, s2B = 0;

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
    let energia = 0; let adn = "";
    for (let v of urnas) { energia += Math.abs(v); adn += (v > 0) ? "1" : "0"; }
    return { adn, energia };
}

function extraerADNRotado(buffer, width, height, fx, fy, angulo, canal) {
    const cX = width / 2; const cY = height / 2;
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    let urnas = new Array(16).fill(0);
    const PI_16 = Math.PI / 16;
    const RANGO_ESC = 150;

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

// ============================================================================
// 🚑 BLOQUE 2: FUNCIONES DEL MOTOR V85 (SURVIVOR Q20)
// ============================================================================

function ejecutarProtocoloSurvivor(buffer, width, height, canal) {
    const puntos = generarPuntosRejilla(width, height, CONFIG.PASO_GRID_Q20);
    const bloquesPorFila = Math.floor((width - 8) / 8) + 1;

    let urnas = new Array(16).fill(0);
    let nodosVIP = 0;

    for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        const resultado = extraerParejasSecuenciales(buffer, width, height, p.x, p.y, canal, bloquesPorFila);

        if (resultado.valido) {
            let energiaBloque = 0;
            let diffs = [];
            for(let b=0; b<16; b++) {
                let d = resultado.parejas[b].a - resultado.parejas[b].b;
                diffs.push(d);
                energiaBloque += Math.abs(d);
            }
            energiaBloque /= 16;

            if (energiaBloque < CONFIG.UMBRAL_VIP_Q20) continue;

            nodosVIP++;

            for(let b=0; b<16; b++) {
                const diff = diffs[b];
                const valA = resultado.parejas[b].a;
                const valB = resultado.parejas[b].b;
                const direction = Math.sign(diff);
                const tienenSignosOpuestos = (valA > 0 && valB < 0) || (valA < 0 && valB > 0);

                let peso = tienenSignosOpuestos ? 5 : 1;
                urnas[b] += (direction * peso);
            }
        }
    }

    let adnFinal = "";
    let margenPromedio = 0;
    for(let b=0; b<16; b++) {
        const votosNetos = urnas[b];
        adnFinal += (votosNetos > 0) ? "1" : "0";
        margenPromedio += Math.abs(votosNetos);
    }

    return {
        encontrado: nodosVIP > 20,
        adn: adnFinal,
        energia: margenPromedio / 16,
        votos: nodosVIP
    };
}

function generarPuntosRejilla(width, height, paso) {
    let puntos = [];
    for (let y = 0; y < height - 16; y += paso) {
        for (let x = 0; x < width - 260; x += paso) {
            puntos.push({ x, y });
        }
    }
    return puntos;
}

function extraerParejasSecuenciales(buffer, width, height, x, y, canal, bloquesPorFila) {
    let ix = Math.floor(x / 8) * 8;
    let iy = Math.floor(y / 8) * 8;
    if (ix < 0 || iy < 0 || ix > width - 260 || iy > height - 8) return { valido: false };

    const bx = ix / 8;
    const by = iy / 8;
    const indiceGlobal = (by * bloquesPorFila) + bx;
    const fase = indiceGlobal % 32;
    if (fase % 2 !== 0) ix += 8;
    const bitOffset = Math.floor(((indiceGlobal + (fase % 2 !== 0 ? 1 : 0)) % 32) / 2);

    let parejas = [];
    for (let i = 0; i < 16; i++) {
        const valA = obtenerDiffBloqueSimple(buffer, width, ix + (i * 16), iy, canal);
        const valB = obtenerDiffBloqueSimple(buffer, width, ix + (i * 16) + 8, iy, canal);
        parejas.push({ a: valA, b: valB });
    }
    return { valido: true, parejas: rotarArrayDerecha(parejas, bitOffset) };
}

// ============================================================================
// 🔧 UTILIDADES COMUNES
// ============================================================================

function formatearGanador(data, metodo) {
    return {
        adn: data.adn,
        confianza: data.energia,
        angulo: data.ang || 0,
        metodo: metodo
    };
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

function obtenerDiffBloqueSimple(buffer, width, startX, startY, canal) {
    let s1 = 0, s2 = 0;
    const PI_16 = Math.PI / 16;
    for (let r = 0; r < 8; r++) {
        const row = (startY + r) * width;
        const cosY1 = Math.cos((2 * r + 1) * PI_16);
        const cosY2 = Math.cos((2 * r + 1) * 2 * PI_16);
        for (let c = 0; c < 8; c++) {
            const v = buffer[(row + (startX + c)) * 4 + canal];
            s1 += v * Math.cos((2 * c + 1) * PI_16) * cosY1;
            s2 += v * Math.cos((2 * c + 1) * 2 * PI_16) * cosY2;
        }
    }
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    const dct11 = 0.25 * C(1) * C(1) * s1;
    const dct22 = 0.25 * C(2) * C(2) * s2;
    return dct11 - dct22;
}

function rotarArrayDerecha(arr, amount) {
    if (amount === 0) return arr;
    const len = arr.length;
    const split = len - amount;
    return arr.slice(split).concat(arr.slice(0, split));
}
