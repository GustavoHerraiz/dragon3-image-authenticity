import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto'; // Vital para el TOTP
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    CHANNEL_IDX: 2,          // Canal Azul (Resistencia JPG)
    BLOCK_SIZE: 8,
    FREQ_1: { u: 1, v: 1 },  // Frecuencia Búnker
    FREQ_2: { u: 2, v: 2 }   // Frecuencia Búnker
};

// TABLA DE COSENOS (Precalculada)
const COS_TABLE = new Float32Array(8 * 8);
for (let i = 0; i < 8; i++) {
    for (let u = 0; u < 8; u++) {
        COS_TABLE[i * 8 + u] = Math.cos(((2 * i + 1) * u * Math.PI) / 16);
    }
}

export async function analizarImagenFaundez(rutaImagen) {
    const res = {
        identificado: false,
        metodo: "DRAGON_EYE_TOTP_16BIT",
        energia: 0,
        hash: "----",
        timestamp_val: 0,
        timestamp_fecha: "----",
        estado_tiempo: "UNK",
        cliente: "Desconocido",
        obra: "Desconocida",
        confianza: 0,
        geometria: { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: 0 },
        diagnostico: {}
    };

    try {
        if (!fs.existsSync(rutaImagen)) return res;

        const imageObj = sharp(rutaImagen);
        const { data: buffer, info } = await imageObj
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const { width, height } = info;

        // -------------------------------------------------------------------
        // PASO 0: OMNI-LOCK DIRECTO (Intento rápido sin rotación)
        // -------------------------------------------------------------------
        const senalDirecta = extraerSenalLineal(buffer, width, height, 0, 0, 1.0, 0);
        const strideDirecto = Math.floor(width / CONFIG.BLOCK_SIZE);

        // Proyectamos (TwinBlock usa ciclos de 32, pero proyectarUrnas ya lo maneja)
        const urnasDirectas = proyectarUrnas(senalDirecta, strideDirecto);

        let energiaDirecta = 0;
        for(let u of urnasDirectas) energiaDirecta += Math.abs(u);

        // 🧠 BÚSQUEDA TOTP DIRECTA
        const matchDirecto = buscarEnBDCiegoTOTP(urnasDirectas, energiaDirecta);

        if (matchDirecto && matchDirecto.scoreReal > 1200) {
             res.identificado = true;
             res.hash = matchDirecto.hash;
             res.cliente = matchDirecto.cliente;
             res.obra = matchDirecto.obra;
             res.confianza = matchDirecto.confianza;
             res.energia = matchDirecto.scoreReal;
             res.metodo = "OMNI_LOCK_TOTP";

             // DATOS TEMPORALES RECUPERADOS
             res.timestamp_val = matchDirecto.deltaMinutos;
             res.timestamp_fecha = matchDirecto.fechaDetectada;
             res.estado_tiempo = matchDirecto.estadoTiempo;

             res.geometria = { escala: 1.0, centroX: 0, centroY: 0, angulo: 0, strideOriginal: strideDirecto };

             res.diagnostico = {
                scoreFinal: matchDirecto.scoreReal,
                energiaBruta: matchDirecto.confianza,
                coherencia: matchDirecto.debugCoherencia || 0,
                flatness: matchDirecto.flatness || 0,
                ratio: matchDirecto.ratio || 0,
                angulo: 0
             };
             return res;
        }

        // -------------------------------------------------------------------
        // PASO 1: BÚSQUEDA FÍSICA (Si falla el directo)
        // -------------------------------------------------------------------
        let mejorSincro = { score: 0, faseX: 0, faseY: 0, escala: 1.0, angulo: 0 };
        const angulosFast = [0, 5, -5, 15, -15, 14, 16, 30, -30, 45, -45, 90];

        for (let angulo of angulosFast) {
            const factorGravedad = (angulo === 0) ? 1.0 : 0.6;
            for (let escala of [1.0, 0.5]) {
                for (let dy = 0; dy < 8; dy += 2) {
                    for (let dx = 0; dx < 8; dx += 2) {
                        const rawScore = muestreoRapidoEnergia(buffer, width, height, dx, dy, escala, angulo);
                        const scorePonderado = rawScore * factorGravedad;
                        if (scorePonderado > mejorSincro.score) {
                            mejorSincro = { score: scorePonderado, faseX: dx, faseY: dy, escala: escala, angulo: angulo };
                        }
                    }
                }
            }
        }

        if (mejorSincro.score < 5.0) {
            res.energia = mejorSincro.score;
            return res;
        }

        // FASE 2: EXTRACCIÓN FINA
        const senalLineal = extraerSenalLineal(buffer, width, height, mejorSincro.faseX, mejorSincro.faseY, mejorSincro.escala, mejorSincro.angulo);

        // FASE 3: STRIDE & IDENTIDAD (TOTP)
        const bSizeFinal = Math.round(CONFIG.BLOCK_SIZE * mejorSincro.escala);
        const bloquesAnchoRecorte = Math.floor((width - mejorSincro.faseX) / bSizeFinal);

        // Probamos holgura de stride para encontrar la alineación perfecta
        for (let sOffset = 0; sOffset < 64; sOffset++) {
            const strideHipotesis = bloquesAnchoRecorte + sOffset;
            const urnasProyectadas = proyectarUrnas(senalLineal, strideHipotesis);

            let energiaTotal = 0;
            for(let u of urnasProyectadas) energiaTotal += Math.abs(u);

            // 🧠 BÚSQUEDA TOTP
            const match = buscarEnBDCiegoTOTP(urnasProyectadas, energiaTotal);

            if (match) {
                let factorFinal = (mejorSincro.angulo === 0) ? 1.0 : 0.6;
                if (match.debugCoherencia >= 7) factorFinal = 1.0;
                const scorePenalizado = match.scoreReal * factorFinal;

                if (scorePenalizado > 15) {
                    const geoParaValidar = {
                        escala: mejorSincro.escala,
                        centroX: mejorSincro.faseX,
                        centroY: mejorSincro.faseY,
                        angulo: mejorSincro.angulo
                    };

                    // Validación Geométrica (Balizas)
                    if (validarConsensoVectorialSmart(buffer, width, height, geoParaValidar, match)) {
                         res.identificado = true;
                         res.hash = match.hash;
                         res.cliente = match.cliente;
                         res.obra = match.obra;
                         res.confianza = match.confianza;
                         res.energia = scorePenalizado;

                         res.timestamp_val = match.deltaMinutos;
                         res.timestamp_fecha = match.fechaDetectada;
                         res.estado_tiempo = match.estadoTiempo;

                         res.geometria = {
                            escala: mejorSincro.escala,
                            centroX: mejorSincro.faseX,
                            centroY: mejorSincro.faseY,
                            angulo: mejorSincro.angulo,
                            strideOriginal: strideHipotesis
                         };

                         res.diagnostico = {
                            scoreFinal: scorePenalizado,
                            energiaBruta: match.confianza,
                            coherencia: match.debugCoherencia || 0,
                            flatness: match.flatness || 0,
                            ratio: match.ratio || 0,
                            angulo: mejorSincro.angulo
                         };
                         return res;
                    }
                }
            }
        }
        res.energia = mejorSincro.score;
        return res;

    } catch (e) {
        console.error("Error crítico en Analizador Faúndez:", e);
        return res;
    }
}

// ============================================================================
// 🧠 CEREBRO TOTP: EL "VIAJERO DEL TIEMPO" (CALIBRACIÓN FINAL)
// ============================================================================
function buscarEnBDCiegoTOTP(urnas32, energiaTotal) {
    // 🛡️ CORRECCIÓN DE UMBRAL (NOISE FLOOR):
    // La imagen virgen dio 233k. Ponemos el corte en 250k para margen de seguridad.
    // La señal válida más débil (Q15) es de 350k, así que entra sobrada.
    if (energiaTotal < 250000) return null;

    let mejorMatch = null;
    let mejorScore = -Infinity;

    // 1. BUCLE FÍSICO: 32 rotaciones
    for (let r = 0; r < 32; r++) {
        const urnasAlineadas = rotarArray32(urnas32, r);

        let lecturaCruda = 0;
        let energiaLectura = 0;

        // ⚠️ LOGICA TWINBLOCK 16-BIT:
        // Los datos están codificados en PARES (Dato vs Sombra).
        for (let i = 0; i < 16; i++) {
            const valDato = urnasAlineadas[2 * i];
            const valSombra = urnasAlineadas[2 * i + 1];

            // Refuerzo de señal diferencial: (Dato - Sombra)
            const valCombinado = valDato - valSombra;

            const bit = valCombinado > 0 ? 1 : 0;
            lecturaCruda = (lecturaCruda << 1) | bit;
            energiaLectura += Math.abs(valCombinado);
        }

        // 2. BUCLE TEMPORAL (TOTP)
        const ahoraMinutos = Math.floor(Date.now() / 60000);
        const ventanaBusqueda = 1440; // 24 Horas hacia atrás

        for (let delta = 0; delta <= ventanaBusqueda; delta++) {
            const tiempoPrueba = ahoraMinutos - delta;
            const mascaraTiempo = calcularMascaraTiempoAnalizador(tiempoPrueba);
            const candidato = lecturaCruda ^ mascaraTiempo; // DESENMASCARAR (XOR)

            const idDetectado = candidato >> 4;     // Primeros 12 bits = ID
            const checksumDetectado = candidato & 0xF; // Últimos 4 bits = Checksum

            // VALIDACIÓN MATEMÁTICA
            if (verificarChecksum(idDetectado, checksumDetectado)) {

                const scoreFinal = energiaLectura;

                // 🛡️ CORRECCIÓN DE UMBRAL DE VALIDACIÓN:
                // Solo aceptamos el match si supera el corte de ruido (250k)
                if (scoreFinal > mejorScore && scoreFinal > 250000) {
                    const infoCliente = buscarClientePorIdNumerico(idDetectado);

                    const fechaDeteccion = new Date(tiempoPrueba * 60000);
                    let estado = "OK";
                    if (delta > 1440) estado = "CADUCADO (>24h)";
                    else if (delta > 60) estado = `OK (Hace ${Math.round(delta/60)}h)`;
                    else estado = `OK (Hace ${delta} min)`;

                    mejorMatch = {
                        cliente: infoCliente.cliente,
                        obra: infoCliente.obra,
                        balizasReferencia: infoCliente.balizas,
                        hash: idDetectado.toString(16),
                        rot: r,
                        confianza: energiaLectura,
                        scoreReal: scoreFinal,
                        deltaMinutos: delta,
                        fechaDetectada: fechaDeteccion.toISOString(),
                        estadoTiempo: estado,
                        debugCoherencia: 10,
                        flatness: 0.5,
                        ratio: 2.0
                    };
                    mejorScore = scoreFinal;
                }
            }
        }
    }
    return mejorMatch;
}
// ============================================================================
// 🛠️ FUNCIONES AUXILIARES (FÍSICA + HELPERS)
// ============================================================================

function calcularCoeficienteDCT(buffer, width, height, startX, startY, u, v, size, angulo = 0) {
    let sum = 0;
    const rad = (angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const rx = (x - 4) * (size / 8);
            const ry = (y - 4) * (size / 8);
            const rotX = rx * cosA - ry * sinA;
            const rotY = rx * sinA + ry * cosA;
            let px = Math.floor(startX + 4 + rotX);
            let py = Math.floor(startY + 4 + rotY);
            if (px < 0) px = 0; else if (px >= width) px = width - 1;
            if (py < 0) py = 0; else if (py >= height) py = height - 1;
            const idx = (py * width + px) * 4 + CONFIG.CHANNEL_IDX;
            const val = buffer[idx] - 128;
            const cosX = COS_TABLE[x * 8 + u];
            const cosY = COS_TABLE[y * 8 + v];
            sum += val * cosX * cosY;
        }
    }
    return sum;
}

function muestreoRapidoEnergia(buffer, width, height, offsetX, offsetY, escala, angulo) {
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * escala);
    if (blockSize < 4) return 0;
    const bloquesAncho = Math.floor((width - offsetX) / blockSize);
    const bloquesAlto = Math.floor((height - offsetY) / blockSize);
    let energiaDiferencial = 0;
    let bloquesLeidos = 0;

    // Muestreo esparcido (Sparse) para velocidad
    for (let y = 0; y < bloquesAlto; y += 4) {
        for (let x = 0; x < bloquesAncho - 1; x += 4) {
            const pxA = offsetX + x * blockSize;
            const pyA = offsetY + y * blockSize;
            const pxB = offsetX + (x + 1) * blockSize;
            const pyB = offsetY + y * blockSize;
            const sigA = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo);
            const sigB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo);
            energiaDiferencial += Math.abs(sigA - sigB);
            bloquesLeidos++;
        }
    }
    return bloquesLeidos > 0 ? (energiaDiferencial / bloquesLeidos) : 0;
}

function extraerSenalLineal(buffer, width, height, offsetX, offsetY, escala, angulo) {
    const votos = [];
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * escala);
    const bloquesAncho = Math.floor((width - offsetX) / blockSize);
    const bloquesAlto = Math.floor((height - offsetY) / blockSize);
    for (let y = 0; y < bloquesAlto; y++) {
        for (let x = 0; x < bloquesAncho - 1; x += 2) {
            const pxA = offsetX + x * blockSize;
            const pyA = offsetY + y * blockSize;
            const pxB = offsetX + (x + 1) * blockSize;
            const pyB = offsetY + y * blockSize;

            // Diferencial simple entre bloque A y B
            const sigA = calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxA, pyA, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);
            const sigB = calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, angulo) -
                         calcularCoeficienteDCT(buffer, width, height, pxB, pyB, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, angulo);
            votos.push({ y, x, valor: sigA - sigB });
        }
    }
    return votos;
}

function proyectarUrnas(votos, stride) {
    const urnas = new Float32Array(32).fill(0);
    for (const v of votos) {
        const bloqueLinealIndex = (v.y * stride + v.x);
        // Ciclo de 32 pasos (TwinBlock 16-bit)
        const ciclo = bloqueLinealIndex % 32;
        urnas[ciclo] += v.valor;
    }
    return urnas;
}

function rotarArray32(arr, n) {
    const l = 32;
    const res = new Float32Array(l);
    for (let i = 0; i < l; i++) res[(i + n) % l] = arr[i];
    return res;
}

function validarConsensoVectorialSmart(buffer, width, height, geo, match) {
    if (!match.balizasReferencia || match.balizasReferencia.length === 0) return true;

    let aciertos = 0;
    let totalVisibles = 0;
    const blockSize = Math.round(CONFIG.BLOCK_SIZE * geo.escala);
    const rad = (geo.angulo * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const balizas = match.balizasReferencia.slice(0, 5);
    for (const b of balizas) {
        const relX = b.x * blockSize;
        const relY = b.y * blockSize;
        const rotX = relX * cosA - relY * sinA;
        const rotY = relX * sinA + relY * cosA;
        const px = Math.floor(geo.centroX + rotX);
        const py = Math.floor(geo.centroY + rotY);

        if (px < 0 || px + blockSize > width || py < 0 || py + blockSize > height) continue;
        totalVisibles++;

        const sigA = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_1.u, CONFIG.FREQ_1.v, blockSize, geo.angulo);
        const sigB = calcularCoeficienteDCT(buffer, width, height, px, py, CONFIG.FREQ_2.u, CONFIG.FREQ_2.v, blockSize, geo.angulo);
        const dif = sigA - sigB;
        let signoEsperado = (b.valor === undefined || b.valor === 1) ? 1.0 : -1.0;
        if (Math.abs(dif) > 2.0) {
            if (Math.sign(dif) === Math.sign(signoEsperado)) aciertos++;
        }
    }
    if (totalVisibles === 0) return false;
    return (aciertos / totalVisibles) >= 0.6;
}

// ----------------------------------------------------------------------------
// HELPERS TOTP
// ----------------------------------------------------------------------------
function calcularMascaraTiempoAnalizador(minutosEpoch) {
    const hash = crypto.createHash('sha256').update(String(minutosEpoch)).digest('hex');
    return parseInt(hash.substring(0, 4), 16);
}

function verificarChecksum(idNum, checksumLeido) {
    const nib1 = (idNum >> 8) & 0xF;
    const nib2 = (idNum >> 4) & 0xF;
    const nib3 = idNum & 0xF;
    const checksumCalculado = (nib1 + nib2 + nib3) % 16;
    return checksumLeido === checksumCalculado;
}

function buscarClientePorIdNumerico(idNum) {
    const idHex = idNum.toString(16).toLowerCase();
    const suffix = idHex.padStart(3, '0');
    // Busca en tu base de datos si existe el cliente
    const encontrado = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase().endsWith(suffix));
    if (encontrado) return encontrado;
    return { cliente: `ID-${idHex.toUpperCase()}`, obra: "Desconocida", balizasReferencia: [] };
}
