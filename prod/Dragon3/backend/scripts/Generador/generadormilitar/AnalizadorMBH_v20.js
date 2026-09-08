import sharp from 'sharp';
import fs from 'fs';
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },
    FREQ_2: { u: 2, v: 2 }
};

// TABLA DE COSENOS (Precalculada)
const COS_TABLE = new Float32Array(8 * 8);
for (let i = 0; i < 8; i++) {
    for (let u = 0; u < 8; u++) {
        COS_TABLE[i * 8 + u] = Math.cos(((2 * i + 1) * u * Math.PI) / 16);
    }
}

export async function analizarImagenMBH_v20(rutaImagen) {
    let mejorRes = {
        identificado: false,
        metodo: "DRAGON_EYE_v20_SMART",
        energia: 0,
        hash: "----",
        cliente: "---",
        obra: "---",
        confianza: 0,
        diagnostico: { scoreFinal: 0, escalaUsada: "1.0" }
    };

    try {
        if (!fs.existsSync(rutaImagen)) return mejorRes;

        const imageObj = sharp(rutaImagen).ensureAlpha();
        const { data: bufferOriginal, info } = await imageObj.raw().toBuffer({ resolveWithObject: true });

        // 🥇 INTENTO 1: DIRECTO (Aceptamos Checksum Matemático aunque sea Test/No Registrado)
        let res = analizarBuffer(bufferOriginal, info.width, info.height);

        if (res.identificado) {
            res.diagnostico.escalaUsada = "1.0 (Nativo)";
            return res;
        }

        mejorRes = res;

        // 🥈 INTENTO 2: RESCATE (Solo si Intento 1 falló)
        // AQUI ESTABA EL ERROR: Aceptábamos cualquier ruido.
        // AHORA: Solo aceptamos si está en la Base de Datos.

        const escalas = [2.0, 4.0, 0.5];

        for (const factor of escalas) {
            const w = Math.round(info.width * factor);
            const h = Math.round(info.height * factor);

            const bufferResized = await sharp(bufferOriginal, { raw: { width: info.width, height: info.height, channels: 4 } })
                .resize(w, h, { kernel: 'lanczos3' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            res = analizarBuffer(bufferResized.data, w, h);

            // CORRECCIÓN: Filtro estricto. Solo devolvemos si es un Cliente Real.
            // Si es ruido (c57), lo ignoramos y seguimos buscando.
            if (res.identificado && res.cliente !== "NO REGISTRADO") {
                res.diagnostico.escalaUsada = `x${factor} (Recuperado)`;
                return res;
            }
        }

        return mejorRes;

    } catch (e) {
        console.error("Error crítico en analizador v20:", e);
        return mejorRes;
    }
}

/**
 * 🧠 NÚCLEO DE ANÁLISIS (Helper)
 * Ejecuta la física y matemáticas sobre un buffer dado.
 */
function analizarBuffer(buffer, width, height) {
    const res = {
        identificado: false,
        energia: 0,
        hash: "----",
        cliente: "---",
        obra: "---",
        confianza: 0,
        diagnostico: { scoreFinal: 0 }
    };

    // 1. Extracción Física
    // Usamos los argumentos estándar de tu versión v20 (buffer, w, h, offX, offY, escala, angulo)
    const senal = extraerSenalLineal(buffer, width, height, 0, 0, 1.0, 0);

    const stride = Math.floor(width / CONFIG.BLOCK_SIZE);
    const urnas = proyectarUrnas(senal, stride);

    // 2. Validación Matemática (Mentalista)
    const match = buscarPatronMentalista(urnas);

    // Si el Checksum valida la estructura, damos por bueno el análisis
    if (match && match.scoreReal > 1200) {
        res.identificado = true;
        res.hash = match.id.toString(16).toLowerCase();
        res.confianza = match.confianza;
        res.energia = match.scoreReal;
        res.diagnostico.scoreFinal = match.scoreReal;
        res.diagnostico.checksumLeido = match.chk;

        // 3. Consulta Base de Datos (Solo informativo, no bloqueante)
        inyectarDatosCliente(res);
    }

    return res;
}

/**
 * 🧠 MOTOR DE IDENTIDAD MENTALISTA (CORREGIDO: LECTURA MSB)
 * Corrige el orden de lectura de bits para coincidir con el Generador.
 */
function buscarPatronMentalista(urnasEnergia) {
    let mejorMatch = null;
    let mejorScore = -Infinity;

    // Probamos las 16 rotaciones posibles
    for (let r = 0; r < 16; r++) {
        const urnasRotadas = rotarArray(urnasEnergia, r);

        let idLeido = 0;
        let chkLeido = 0;
        let energiaTotal = 0;

        // --- CORRECCIÓN CRÍTICA: ORDEN DE BITS ---
        // El Generador escribe MSB primero (índice 0).
        // Antes leíamos LSB primero (1 << i). Ahora leemos (1 << (11-i)).

        // Bits 0-11: ID (12 bits)
        for (let i = 0; i < 12; i++) {
            const val = urnasRotadas[i];
            if (val > 0) {
                // Escribimos en el bit correspondiente (Invertido)
                idLeido |= (1 << (11 - i));
            }
            energiaTotal += Math.abs(val);
        }

        // Bits 12-15: Checksum (4 bits)
        for (let i = 0; i < 4; i++) {
            const val = urnasRotadas[12 + i];
            if (val > 0) {
                chkLeido |= (1 << (3 - i));
            }
            energiaTotal += Math.abs(val);
        }

        // 🧠 VALIDACIÓN MATEMÁTICA
        // Fórmula: ((ID * 19) XOR (ID >> 6)) AND 15
        const chkEsperado = ((idLeido * 19) ^ (idLeido >> 6)) & 0x0F;

        if (chkLeido === chkEsperado) {
            // ¡Match Matemático!
            const score = energiaTotal / 16;

            if (score > mejorScore) {
                mejorScore = score;
                mejorMatch = {
                    id: idLeido,
                    chk: chkLeido,
                    scoreReal: score,
                    confianza: energiaTotal,
                    rot: r
                };
            }
        }
    }
    return mejorMatch;
}

// --- UTILIDADES DEL DEFINITIVE (INTACTAS) ---

function extraerSenalLineal(buffer, width, height, offsetX, offsetY, escala, angulo) {
    const votos = [];
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * escala);
    const bloquesAncho = Math.floor((width - offsetX) / blockSize);
    const bloquesAlto = Math.floor((height - offsetY) / blockSize);

    for (let y = 0; y < bloquesAlto; y++) {
        for (let x = 0; x < bloquesAncho - 1; x += 2) { // Salto de 2 para TwinBlock
            const pxA = offsetX + x * blockSize;
            const pyA = offsetY + y * blockSize;
            const pxB = offsetX + (x + 1) * blockSize; // Bloque vecino (Sombra)
            const pyB = offsetY + y * blockSize;

            // Diferencial A - B (TwinBlock)
            // Usamos FREQ_1 y FREQ_2 como en GeneradorFaundez
            const sigA = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);

            const sigB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);

            // Stardust Logic: Si Bit=1 -> A>B. Si Bit=0 -> B>A.
            // La señal es A - B.
            // GeneradorFaundez: Bit 1 -> A = Prom+F, B = Prom-F -> A-B = +2F
            // GeneradorFaundez: Bit 0 -> A = Prom-F, B = Prom+F -> A-B = -2F
            // Por tanto, solo necesitamos (ValA - ValB) del bloque par actual?
            // Espera, Faundez inyecta en cada bloque.
            // inyectarStardustTwin itera x += blockSize.
            // Bit 0: Bloque (0,0) -> Twin interno (1,1 vs 2,2).
            // ¡OJO! Faundez usa Twin Interno (Frecuencias), no Bloques vecinos.
            // "dctBlock[v1][u1] = ... dctBlock[v2][u2] = ..."

            // CORRECCIÓN CRÍTICA PARA ANALIZADOR V20:
            // Faundez usa Twin Interno.
            // Debemos leer (Coeff1 - Coeff2) de CADA bloque.

            const valBlock = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                             calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);

            votos.push({ y, x, valor: valBlock });

            // Leemos también el vecino para duplicar datos
            const valBlockB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                              calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);
            votos.push({ y, x: x+1, valor: valBlockB });
        }
    }
    return votos;
}

function proyectarUrnas(votos, stride) {
    const urnas = new Float32Array(16).fill(0);
    for (const v of votos) {
        // Mapeo lineal idéntico al Generador
        // bitIndex % 32.
        // Faundez usa TwinBits (Bit, Sombra).
        // Secuencia: B0, S0, B1, S1...
        // Nosotros queremos reconstruir B0, B1...

        const bloqueIndex = (v.y * stride + v.x);
        const ciclo = bloqueIndex % 32;

        // Ciclo 0: Bit 0. Ciclo 1: Sombra 0 (Inverso).
        if (ciclo % 2 === 0) {
            // Bit Normal
            const bitIdx = Math.floor(ciclo / 2); // 0..15
            urnas[bitIdx] += v.valor;
        } else {
            // Sombra (Debe ser inverso)
            const bitIdx = Math.floor(ciclo / 2); // 0..15
            urnas[bitIdx] -= v.valor; // Restamos porque es sombra
        }
    }
    return urnas;
}

function calcularCoeficienteDCT(buffer, width, height, startX, startY, u, v, size, angulo) {
    let sum = 0;
    // Simplificación: Asumimos angulo 0 para test rápido (definitive tiene rotación, aquí la fijamos a 0 por ahora para validar física)
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const idx = ((startY + y) * width + (startX + x)) * 4 + CONFIG.CHANNEL_IDX;
            const val = buffer[idx] - 128;
            sum += val * COS_TABLE[x * 8 + u] * COS_TABLE[y * 8 + v];
        }
    }
    return sum; // Falta factor normalización pero para energía relativa sirve
}

function rotarArray(arr, n) {
    const l = arr.length;
    const res = new Float32Array(l);
    for (let i = 0; i < l; i++) res[(i + n) % l] = arr[i];
    return res;
}

/**
 * 📂 BUSCADOR DE BASE DE DATOS
 * Se ejecuta SOLO si el Checksum matemático ya ha validado el sello.
 */
function inyectarDatosCliente(resultado) {
    const idDetectado = resultado.hash;

    // Buscamos en la base de datos importada
    // Usamos 'endsWith' para que detecte 'd760' aunque el scanner lea '00d760'
    const ficha = BASE_DE_DATOS_SELLOS.find(s =>
        s.hash_suffix.toLowerCase().endsWith(idDetectado) ||
        idDetectado.endsWith(s.hash_suffix.toLowerCase())
    );

    if (ficha) {
        resultado.cliente = ficha.cliente;
        resultado.obra = ficha.obra;
    } else {
        resultado.cliente = "NO REGISTRADO";
        resultado.obra = "---";
    }
}
