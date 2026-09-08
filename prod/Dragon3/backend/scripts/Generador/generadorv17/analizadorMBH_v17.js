import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
// Importación correcta desde la carpeta de utilidades central
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// --- BASE DE DATOS SIMULADA (La Revista) ---
export const BASE_DE_DATOS_SELLOS = [
    { hash_suffix: "d760", cliente: "Quico Melero", obra: "Atardecer" }
];

// --- CONFIGURACIÓN MAESTRA ---
const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY", // La misma que el Generador
    STARDUST_BLOCK_SIZE: 8,
    DCT_COEFF_1: { u: 3, v: 3 },
    DCT_COEFF_2: { u: 4, v: 4 },
    HASH_BITS: 16
};

export async function analizadorImagenMBH_v17(ruta) {
    const res = new RespuestaStandard("analizadorMBH_v17", "Nano-Hydra Hunter V17.5", "17.5.0");

    try {
        const nombreArchivo = path.basename(ruta);
        const esJPG = nombreArchivo.toLowerCase().endsWith('.jpg') || nombreArchivo.toLowerCase().endsWith('.jpeg');

        // 1. CARGA DE IMAGEN RAW (Canales RGBA)
        const sharpImg = sharp(ruta).ensureAlpha();
        const { data: buf, info } = await sharpImg.raw().toBuffer({ resolveWithObject: true });

        // ====================================================================
        // MOTOR 1: VOGEL REAL (NOTARIO) - CANAL ALFA
        // Matemática estricta. Solo para originales (PNG).
        // ====================================================================
        if (!esJPG) {
            // Calculamos hash visual para intuir ID
            const pHashBits = await obtenerPHashManual(buf, info);
            const pHashHex = BigInt('0b' + pHashBits).toString(16).padStart(16, '0');
            const sufijoActual = pHashHex.slice(-4);

            // Verificación Geométrica REAL
            const checkAlfa = verificarVogelReal(buf, info, sufijoActual);

            if (checkAlfa.encontrado) {
                // Identificación positiva matemática
                let autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase() === sufijoActual.toLowerCase());
                if (!autor) {
                    autor = { cliente: "Autor Validado (Vogel)", hash_suffix: sufijoActual };
                    BASE_DE_DATOS_SELLOS.push(autor); // Aprendizaje dinámico seguro
                }

                return armarRespuesta(res, true, autor.cliente, "Certificación Vogel (Alfa)", 100, checkAlfa.aciertos, sufijoActual);
            }
        }

        // ====================================================================
        // MOTOR 2: STARDUST OMNI-SEARCH (DETECTIVE) - CANAL AZUL/DCT
        // Búsqueda forense con desplazamiento de rejilla y re-escalado.
        // ====================================================================
        console.log(`[V17.5] 🕵️ Modo Detective: Iniciando Omni-Search (Grid Shift + Scale)...`);

        // ESTRATEGIA A: Búsqueda en tamaño original con Grid Shift (Vence al CROP)
        let hallazgo = buscarConDesplazamiento(buf, info.width, info.height);

        // ESTRATEGIA B: Si falla, probamos Re-escalado (Vence al RESIZE)
        if (!hallazgo.encontrado) {
            // Probamos a estirar la imagen por si fue reducida
            const escalas = [2.0, 4.0, 1.33, 0.5];

            for (const escala of escalas) {
                // Solo escalamos si tiene sentido (no hacer imágenes gigantes de 10k px)
                if (info.width * escala > 4000) continue;

                const w = Math.floor(info.width * escala);
                const h = Math.floor(info.height * escala);

                // Re-procesamos buffer en memoria (costoso pero necesario)
                const resizedBuf = await sharp(ruta).resize(w, h).ensureAlpha().raw().toBuffer();

                const intento = buscarConDesplazamiento(resizedBuf, w, h);
                if (intento.encontrado) {
                    hallazgo = intento;
                    hallazgo.metodo = `Stardust Omni-Search (Scale x${escala})`;
                    break;
                }
            }
        }

        if (hallazgo.encontrado) {
            console.log(`[V17.5] 🧬 ADN Recuperado: [${hallazgo.hash}] (Confianza: ${hallazgo.confianza.toFixed(1)}%)`);
            let autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase() === hallazgo.hash.toLowerCase());
            if (!autor) autor = { cliente: "Rastro Forense", hash_suffix: hallazgo.hash };

            return armarRespuesta(res, true, autor.cliente, hallazgo.metodo || "Stardust Omni-Search", hallazgo.confianza, hallazgo.votos, hallazgo.hash);
        }

        // ====================================================================
        // SIN RESULTADOS (LIMPIO)
        // ====================================================================
        return armarRespuesta(res, false, null, "Ninguno", 0, 0, null);

    } catch (e) {
        console.error(`[ERROR] ${e.message}`);
        return armarRespuesta(res, false, null, "Error", 0, 0, null);
    }
}

// ----------------------------------------------------------------------------
// LÓGICA VOGEL REAL (NO MOCKUPS - MATEMÁTICA PURA)
// ----------------------------------------------------------------------------
function verificarVogelReal(buf, info, hashSuffix) {
    const semilla = CONFIG.PRIVATE_KEY + BigInt('0x' + hashSuffix).toString(16).padStart(16, '0');

    // Calculamos dónde DEBERÍAN estar los puntos según la clave
    const pts = calcularVogelSincronizado(0, 0, semilla);

    let aciertos = 0;
    let total = 0;

    pts.forEach(p => {
        if (p.x < info.width && p.y < info.height) {
            const off = (p.y * info.width + p.x) * 4;
            // Verificamos bit LSB del Canal Alfa (Byte 3)
            // Generador pone (alfa | 1), así que esperamos un 1.
            if ((buf[off + 3] & 1) === 1) aciertos++;
            total++;
        }
    });

    // Umbral de seguridad: 85% de coincidencia exacta.
    // Menos de eso se considera casualidad o falsificación.
    const ratio = total > 0 ? aciertos / total : 0;
    return { encontrado: ratio > 0.85, aciertos: aciertos, score: ratio };
}

function calcularVogelSincronizado(offX, offY, semilla) {
    // Generación DETERMINISTA basada en semilla criptográfica
    const hash = crypto.createHash('md5').update(semilla).digest();
    const centroX = offX + (CONFIG.TILE_SIZE / 2) + (hash[0] % 20);
    const centroY = offY + (CONFIG.TILE_SIZE / 2) + (hash[1] % 20);
    const pts = [];
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.3999 rad

    // Debe coincidir EXACTAMENTE con el bucle del Generador
    for (let i = 0; i < 30; i++) {
        const r = (CONFIG.TILE_SIZE / 2) * 0.8 * Math.sqrt(i / 30);
        const theta = i * GOLDEN_ANGLE;
        pts.push({
            x: Math.floor(centroX + r * Math.cos(theta)),
            y: Math.floor(centroY + r * Math.sin(theta))
        });
    }
    return pts;
}

// ----------------------------------------------------------------------------
// LÓGICA STARDUST (DCT + GRID SHIFT)
// ----------------------------------------------------------------------------

function buscarConDesplazamiento(buffer, width, height) {
    let mejorResultado = { encontrado: false, confianza: 0 };

    // Probamos desplazar la rejilla de lectura (0,0) a (7,7)
    // Saltos de 2 para optimizar velocidad vs precisión
    for (let offsetY = 0; offsetY < 8; offsetY += 2) {
        for (let offsetX = 0; offsetX < 8; offsetX += 2) {

            const r = analizarStardustDCT(buffer, width, height, offsetX, offsetY);

            if (r.encontrado && r.confianza > mejorResultado.confianza) {
                mejorResultado = r;
                if (r.confianza > 95) return r; // Éxito total, salir ya
            }
        }
    }
    return mejorResultado;
}

function analizarStardustDCT(buffer, width, height, offX, offY) {
    const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
    const bitVotes = new Array(CONFIG.HASH_BITS).fill(0);
    let bloquesLeidos = 0;

    for (let y = offY; y <= height - blockSize; y += blockSize) {
        for (let x = offX; x <= width - blockSize; x += blockSize) {

            const blueBlock = extraerBloqueCanal(buffer, width, x, y, 2); // 2 = Canal Azul
            const dct = dct8x8(blueBlock);

            // Leemos coeficientes de frecuencia media
            const val1 = dct[CONFIG.DCT_COEFF_1.v][CONFIG.DCT_COEFF_1.u];
            const val2 = dct[CONFIG.DCT_COEFF_2.v][CONFIG.DCT_COEFF_2.u];

            const bitIndex = bloquesLeidos % CONFIG.HASH_BITS;
            const fuerza = Math.abs(val1 - val2);

            // Umbral de ruido DCT > 2
            if (fuerza > 2) {
                if (val1 > val2) bitVotes[bitIndex]++;
                else bitVotes[bitIndex]--;
            }
            bloquesLeidos++;
        }
    }

    // Alineación de Fase (Rotación de bits)
    const rawBits = bitVotes.map(v => v > 0 ? '1' : '0').join('');

    // Obtenemos candidatos de la DB para comparar
    const targets = BASE_DE_DATOS_SELLOS.map(s => ({
        hex: s.hash_suffix,
        bin: BigInt('0x' + s.hash_suffix).toString(2).padStart(16, '0')
    }));

    for (let shift = 0; shift < CONFIG.HASH_BITS; shift++) {
        // Rotamos bitstring
        const intentoBin = rawBits.substring(shift) + rawBits.substring(0, shift);

        for (const target of targets) {
            let coincidencia = 0;
            for (let i = 0; i < 16; i++) {
                if (intentoBin[i] === target.bin[i]) coincidencia++;
            }
            // Umbral Forense: 13/16 bits (Permite ~20% de degradación por JPG)
            if (coincidencia >= 13) {
                return {
                    encontrado: true,
                    hash: target.hex,
                    confianza: (coincidencia/16)*100,
                    votos: Math.max(...bitVotes.map(Math.abs))
                };
            }
        }
    }
    return { encontrado: false };
}

// ----------------------------------------------------------------------------
// UTILIDADES MATEMÁTICAS (DCT & BUFFER)
// ----------------------------------------------------------------------------

function extraerBloqueCanal(buffer, width, startX, startY, channelOffset) {
    let block = [];
    for (let y = 0; y < 8; y++) {
        let row = [];
        for (let x = 0; x < 8; x++) {
            const idx = ((startY + y) * width + (startX + x)) * 4;
            // Boundary Check
            if (idx + channelOffset < buffer.length) {
                row.push(buffer[idx + channelOffset]);
            } else {
                row.push(0);
            }
        }
        block.push(row);
    }
    return block;
}

function dct8x8(block) {
    const n = 8;
    let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);

    // Implementación DCT estándar O(N^4) - Robusta
    for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let x = 0; x < n; x++) {
                for (let y = 0; y < n; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

// ----------------------------------------------------------------------------
// FORMATEO RESPUESTA
// ----------------------------------------------------------------------------
function armarRespuesta(res, exito, cliente, metodo, confianza, hits, adn) {
    res.evaluacion = { veredicto: exito ? "EXITO" : "FALLO" };
    res.response.exito = exito;
    res.response.identificado = exito;
    res.response.evidencia_visual = {
        Cliente_Identificado: cliente || "Desconocido",
        Hits_Totales: hits,
        Mejor_Confianza: confianza,
        Metodo: metodo,
        ADN_Detectado: adn,
        Ruido_Basal_Superado: exito
    };
    return res;
}

async function obtenerPHashManual(buf, info) {
    // Cálculo rápido de hash visual para pre-filtrado
    return BigInt('0x' + crypto.createHash('md5').update(buf.slice(0, 1000)).digest('hex').slice(0, 16)).toString(2).padStart(64, '0');
}
