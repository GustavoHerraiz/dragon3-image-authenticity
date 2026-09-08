import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// 1. IMPORTA LA DB GENERADA (Asegúrate de haber corrido node crear_db.js primero)
import { BASE_DE_DATOS_SELLOS } from './base_datos_sellos.js';

const CONFIG = {
    TILE_SIZE: 256,
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    STARDUST_BLOCK_SIZE: 8,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    HASH_BITS: 32
};

export async function analizadorImagenMBH_v18(ruta) {
    const res = new RespuestaStandard("analizadorMBH_v18", "Nano-Hydra Hunter V18 (Raw + Brute)", "18.5.0");

    try {
        const nombreArchivo = path.basename(ruta);
        const esJPG = nombreArchivo.toLowerCase().endsWith('.jpg') || nombreArchivo.toLowerCase().endsWith('.jpeg');

        const sharpImg = sharp(ruta).ensureAlpha();
        const { data: bufOriginal, info } = await sharpImg.raw().toBuffer({ resolveWithObject: true });

        // --- MOTOR 1: VOGEL (Integridad) ---
        if (!esJPG) {
            const pHashBits = await obtenerPHashManual(bufOriginal, info);
            const pHashHex = BigInt('0b' + pHashBits).toString(16).padStart(16, '0');
            const sufijoActual = pHashHex.slice(-4);
            const checkAlfa = verificarVogelReal(bufOriginal, info, sufijoActual);

            if (checkAlfa.encontrado) {
                let autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase() === sufijoActual.toLowerCase());
                return armarRespuesta(res, true, autor ? autor.cliente : "Autor Validado", "Vogel (Alfa)", 100, checkAlfa.aciertos, sufijoActual);
            }
        }

        // --- MOTOR 2: STARDUST TWIN-KEY (Fuerza Bruta) ---
        console.log(`[V18] 🕵️ Escaneando Píxel a Píxel (Búsqueda de ADN)...`);

        // 1. Búsqueda Inicial (Raw)
        let candidatos = buscarTodosLosOffsets(bufOriginal, info.width, info.height);
        let mejorMatch = candidatos[0] || null;

        // 2. Búsqueda con Re-escalado (Si no hay confianza > 92%)
        if (!mejorMatch || mejorMatch.confianza < 92) {
            console.log(`[V18] 🔄 Señal débil (${mejorMatch?.confianza || 0}%). Iniciando re-escalado defensivo...`);
            const escalas = [1.33, 0.5, 2.0];

            for (const escala of escalas) {
                const w = Math.floor(info.width * escala);
                const h = Math.floor(info.height * escala);
                if (w > 5000) continue;

                const resizedBuf = await sharp(ruta).resize(w, h).ensureAlpha().raw().toBuffer();
                const intentoEscalado = buscarTodosLosOffsets(resizedBuf, w, h);

                if (intentoEscalado[0] && intentoEscalado[0].confianza > (mejorMatch?.confianza || 0)) {
                    candidatos = intentoEscalado;
                    mejorMatch = candidatos[0];
                    mejorMatch.metodo = `Stardust Scale x${escala}`;
                    console.log(`[V18] 📈 Mejora encontrada con escala x${escala}: ${mejorMatch.confianza.toFixed(1)}%`);
                }
                if (mejorMatch?.confianza > 96) break; // Si ya es excelente, paramos
            }
        }

        // 3. Verificación final contra Base de Datos
        if (mejorMatch && mejorMatch.encontrado) {
            let autor = BASE_DE_DATOS_SELLOS.find(s => s.hash_suffix.toLowerCase() === mejorMatch.hash.toLowerCase());

            if (autor) {
                console.log(`[V18] ✅ ADN DETECTADO: [${mejorMatch.hash}] Identificado: ${autor.cliente}`);
                return armarRespuesta(
                    res,
                    true,
                    autor.cliente,
                    mejorMatch.metodo || "Stardust Twin-Key",
                    mejorMatch.confianza,
                    mejorMatch.votos,
                    mejorMatch.hash,
                    candidatos // <--- Esto genera la tabla del informe
                );
            } else {
                console.log(`[V18] ⚠️ ADN detectado [${mejorMatch.hash}] pero NO está en la DB.`);
            }
        }

        // 4. Si llegamos aquí, es un fallo de detección
        console.log(`[V18] ❌ Señal no encontrada en DB.`);
        return armarRespuesta(res, false, null, "Ninguno", 0, 0, null, candidatos);

    } catch (e) {
        console.error(`[ERROR V18] ${e.message}`);
        return armarRespuesta(res, false, null, "Error", 0, 0, null);
    }
}



// ============================================================================
// VERSIÓN DIAGNÓSTICO: IMPRIME LA RADIOGRAFÍA DE LA SEÑAL
// ============================================================================
function analizarBloquesTwin(buffer, width, height, offX, offY) {
    const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
    const bitVotes = new Array(32).fill(0);
    let bloquesLeidos = 0;

    for (let y = offY; y <= height - blockSize; y += blockSize) {
        for (let x = offX; x <= width - blockSize; x += blockSize) {
            const blueBlock = extraerBloqueCanal(buffer, width, x, y, 2);
            const dct = dct8x8(blueBlock);

            const val1 = dct[CONFIG.DCT_COEFF_1.v][CONFIG.DCT_COEFF_1.u];
            const val2 = dct[CONFIG.DCT_COEFF_2.v][CONFIG.DCT_COEFF_2.u];

            const bitIndex = bloquesLeidos % 32;
            const fuerza = Math.abs(val1 - val2);

            if (fuerza > 1) {
                if (val1 > val2) bitVotes[bitIndex]++;
                else bitVotes[bitIndex]--;
            }
            bloquesLeidos++;
        }
    }

    // --- CORRECCIÓN DE SCOPE ---
    // Calculamos la tira visual aquí para que esté disponible en toda la función
    const visual = bitVotes.map(v => v > 20 ? '1' : (v < -20 ? '0' : '.')).join('');
    const maxVoto = Math.max(...bitVotes.map(Math.abs));

    // Bloque de diagnóstico (Radiografía)
    if (maxVoto > 50) {
        console.log(`\n[RADIOGRAFÍA offX:${offX} offY:${offY}] Fuerza Máx: ${maxVoto}`);
        console.log(`TIRA DE BITS: [ ${visual} ]`);
        const bitsRecuperadosStr = bitVotes.map(v => v > 0 ? '1' : '0').join('');
        const hex = BigInt('0b' + bitsRecuperadosStr).toString(16);
        console.log(`HEX RAW: ${hex}`);
    }

    const bitsRecuperados = bitVotes.map(v => v > 0 ? '1' : '0');

    for (let shift = 0; shift < 32; shift++) {
        const secuencia = [...bitsRecuperados.slice(shift), ...bitsRecuperados.slice(0, shift)];
        let bitsNormales = "", bitsSombra = "";
        for (let i = 0; i < 32; i += 2) {
            bitsNormales += secuencia[i];
            bitsSombra += secuencia[i + 1];
        }

        let coincidencias = 0;
        for (let i = 0; i < 16; i++) {
            if (bitsNormales[i] !== bitsSombra[i]) coincidencias++;
        }

        if (coincidencias >= 12) {
            const hashHex = BigInt('0b' + bitsNormales).toString(16).padStart(4, '0');
            const probRuido = calcularProbabilidadRuido(coincidencias);

            return {
                encontrado: true,
                hash: hashHex,
                confianza: (coincidencias / 16) * 100,
                votos: maxVoto,
                coincidencias: coincidencias,
                p_value: probRuido, // Enviamos el valor para el Dossier
                visual: visual     // Ahora la variable sí existe aquí
            };
        }
    }
    return { encontrado: false };
}

// Función auxiliar para leer canal específico de buffer RGBA
function extraerBloqueCanal(buffer, width, startX, startY, channelOffset) {
    let block = [];
    for (let y = 0; y < 8; y++) {
        let row = [];
        for (let x = 0; x < 8; x++) {
            const idx = ((startY + y) * width + (startX + x)) * 4;
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

// ... (El resto de funciones Vogel, DCT, etc. siguen igual) ...
function verificarVogelReal(buf, info, hashSuffix) {
    const semilla = CONFIG.PRIVATE_KEY + BigInt('0x' + hashSuffix).toString(16).padStart(16, '0');
    const pts = calcularVogelSincronizado(0, 0, semilla);
    let aciertos = 0, total = 0;
    pts.forEach(p => {
        if (p.x < info.width && p.y < info.height) {
            const off = (p.y * info.width + p.x) * 4;
            if ((buf[off + 3] & 1) === 1) aciertos++;
            total++;
        }
    });
    return { encontrado: (total > 0 && aciertos/total > 0.85), aciertos: aciertos };
}

function calcularVogelSincronizado(offX, offY, semilla) {
    const hash = crypto.createHash('md5').update(semilla).digest();
    const centroX = offX + (CONFIG.TILE_SIZE / 2) + (hash[0] % 20);
    const centroY = offY + (CONFIG.TILE_SIZE / 2) + (hash[1] % 20);
    const pts = [];
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 30; i++) {
        const r = (CONFIG.TILE_SIZE / 2) * 0.8 * Math.sqrt(i / 30);
        const theta = i * GOLDEN_ANGLE;
        pts.push({ x: Math.floor(centroX + r * Math.cos(theta)), y: Math.floor(centroY + r * Math.sin(theta)) });
    }
    return pts;
}

function dct8x8(block) {
    const n = 8;
    let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
    for (let u = 0; u < n; u++) {
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let x = 0; x < n; x++) {
                for (let y = 0; y < n; y++) sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
            }
            dct[v][u] = 0.25 * C(u) * C(v) * sum;
        }
    }
    return dct;
}

function armarRespuesta(res, exito, cliente, metodo, confianza, hits, adn, topCandidatos = []) {
    res.evaluacion = { veredicto: exito ? "EXITO" : "FALLO" };
    res.response.exito = exito;
    res.response.identificado = exito;
    res.response.evidencia_visual = {
        Cliente_Identificado: cliente || "Desconocido",
        Hits_Totales: hits,
        Mejor_Confianza: confianza,
        Metodo: metodo,
        ADN_Detectado: adn,
        Top_Candidatos: topCandidatos // <--- AÑADIMOS ESTO
    };
    return res;
}
function buscarTodosLosOffsets(buffer, width, height) {
    let candidatos = [];
    // Escaneo exhaustivo de la rejilla 8x8
    for (let offY = 0; offY < 8; offY++) {
        for (let offX = 0; offX < 8; offX++) {
            const r = analizarBloquesTwin(buffer, width, height, offX, offY);

            if (r.encontrado) {
                candidatos.push({
                    offX,
                    offY,
                    hash: r.hash,
                    confianza: r.confianza,
                    votos: r.votos,
                    probRuido: r.p_value, // Valor estadístico real para Alfons
                    tiraBits: r.visual    // Evidencia visual de la huella
                });
            }
        }
    }
    // Devolvemos el Top 10 basado en la energía de la señal
    return candidatos.sort((a, b) => b.votos - a.votos).slice(0, 10);
}


/**
 * CALCULADOR REAL DE P-VALUE (Distribución Binomial)
 * No es una tabla: es matemática pura para n=16, p=0.5
 */
function calcularProbabilidadRuido(k) {
    const n = 16; // Total de pares materia/antimateria
    const p = 0.5; // Probabilidad de acierto por azar

    // Función interna para calcular combinaciones (n sobre k)
    const combinacion = (n, k) => {
        if (k < 0 || k > n) return 0;
        if (k === 0 || k === n) return 1;
        let res = 1;
        for (let i = 1; i <= k; i++) {
            res = res * (n - i + 1) / i;
        }
        return res;
    };

    // Calculamos la probabilidad acumulada P(X >= k)
    // Es decir: ¿Qué probabilidad hay de tener k aciertos O MÁS por azar?
    let probabilidadAcumulada = 0;
    for (let i = k; i <= n; i++) {
        probabilidadAcumulada += combinacion(n, i) * Math.pow(p, n);
    }

    return probabilidadAcumulada;
}

async function obtenerPHashManual(buf, info) {
    return BigInt('0x' + crypto.createHash('md5').update(buf.slice(0, 1000)).digest('hex').slice(0, 16)).toString(2).padStart(64, '0');
}
