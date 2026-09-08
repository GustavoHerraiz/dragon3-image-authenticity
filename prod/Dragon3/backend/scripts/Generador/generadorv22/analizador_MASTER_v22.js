import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { RespuestaStandard } from '../../../utilidades/RespuestaStandard.js';

// --- CONFIGURACIÓN DE LA FÁBRICA ---
const CONFIG = {
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    TILE_SIZE: 256,
    // Umbral: Ahora es un "Score de Coherencia".
    // Si leemos 32 pares, y cada uno aporta algo, buscamos un acumulado decente.
    UMBRAL_DETECCION_TWIN: 1000.0,
    UMBRAL_DETECCION_ALFA: 15,
    PUNTOS_ORO: [486, 116, 420, 52, 171, 149, 256, 373, 139, 87, 76, 345, 333, 58, 374, 84, 502, 418, 1, 78]
};

// ============================================================================
// 🧠 CEREBRO MAESTRO v23 (MODO ESTRUCTURAL BIT-A-BIT)
// ============================================================================
export async function analizarImagenMaster(rutaImagen) {
    const res = new RespuestaStandard("Dragon_Master_v23", "23.0 Fractal PRO", "23.0.5");

    try {
        if (!fs.existsSync(rutaImagen)) {
            res.error = "Imagen no encontrada";
            return res;
        }

        const metadata = await sharp(rutaImagen).metadata();
        const tieneAlfa = metadata.channels === 4;
        const canalPrimario = tieneAlfa ? 3 : 2;
        const canalRespaldo = 2;

        // Leer imagen cruda
        const inputRaw = await sharp(rutaImagen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const { width, height } = inputRaw.info;

        // Validar dimensiones
        if (width < 32 || height < 32) throw new Error("Imagen demasiado pequeña");

        let mejorScore = 0;
        let mejorTile = { x: 0, y: 0 };
        let mejorAngulo = 0;
        let ADN_Recuperado = "";
        let sellosEncontrados = 0;
        let canalDetectado = canalPrimario;

        // --- BARRIDO ESTRUCTURAL ---
        // No buscamos "energía", buscamos el patrón Twin (Bit-Sombra).
        // Escaneamos con paso fino para no saltarnos el alineamiento.

        const paso = 64; // Paso de barrido (ajustable según rendimiento vs precisión)
        let canales = [canalPrimario];
        if (canalPrimario !== canalRespaldo) canales.push(canalRespaldo);

        for (const canal of canales) {
            if (mejorScore > CONFIG.UMBRAL_DETECCION_TWIN * 2) break;

            // Barrido por la imagen
            for (let y = 0; y < height - 64; y += paso) {
                for (let x = 0; x < width - 64; x += paso) {

                    const cX = x + 32;
                    const cY = y + 32;

                    // El Radar ahora verifica la estructura de la cadena completa
                    const radar = faseRadarTwin(inputRaw.data, width, height, cX, cY, canal);

                    if (radar.maxScore > CONFIG.UMBRAL_DETECCION_TWIN) {
                        sellosEncontrados++;
                        if (radar.maxScore > mejorScore) {
                            mejorScore = radar.maxScore;
                            mejorTile = { x: cX, y: cY };
                            mejorAngulo = radar.mejorAngulo;
                            canalDetectado = canal;
                        }
                    }
                }
            }
        }

        if (mejorScore === 0) {
            console.log(`❌ [ANALIZADOR] Sin coherencia estructural.`);
            res.response.identificado = false;
            res.response.energia_detectada = "0.00";
            res.response.nodos_activos = 0;
            return res;
        }

        // --- EXTRACCIÓN CONFIRMADA ---
        // Usamos los parámetros del mejor match estructural
        ADN_Recuperado = extraerADNTwin(inputRaw.data, width, height, mejorTile.x, mejorTile.y, mejorAngulo, canalDetectado);

        // Reconstrucción de Hash Hex (32 bits leídos -> 16 bits de datos)
        let hexStr = "---";
        if (ADN_Recuperado.length >= 16) {
             let bitsReales = ADN_Recuperado; // extraerADNTwin ya devuelve solo los bits decodificados (1 o 0)
             // Ajuste: Si leemos 32 bits decodificados (que vienen de 32 pares), cogemos los primeros 16
             if (bitsReales.length > 16) bitsReales = bitsReales.substring(0, 16);

             hexStr = parseInt(bitsReales, 2).toString(16).toUpperCase().padStart(4, '0');
        }

        console.log(`🧬 [ANALIZADOR] ADN Binario: ${ADN_Recuperado}`);
        console.log(`🔑 [ANALIZADOR] Hash Hex: ${hexStr}`);
        console.log(`⚡ [ANALIZADOR] Score Coherencia: ${mejorScore.toFixed(2)} | Ángulo: ${mejorAngulo}°`);

        res.response.identificado = true;
        res.response.adn_binario = ADN_Recuperado;
        res.response.hash_calculado = hexStr;
        res.response.energia_detectada = mejorScore.toFixed(2);
        res.response.angulo_detectado = mejorAngulo;
        res.response.nodos_activos = sellosEncontrados;

        return res;

    } catch (e) {
        console.log(`💥 [ANALIZADOR] ERROR: ${e.message}`);
        res.error = e.message;
        return res;
    }
}

// ============================================================================
// ⚔️ MOTORES DE BÚSQUEDA (CORREGIDOS)
// ============================================================================

function faseRadarTwin(buffer, width, height, cX, cY, canal) {
    // Canal Alfa: Lógica Vogel original
    if (canal === 3) {
        let energia = 0;
        for (let n = 0; n < 20; n++) {
            const pV = getVogelPoint30(n, cX, cY, 100);
            if (pV.x>=0 && pV.x<width && pV.y>=0 && pV.y<height) {
                const idx = (Math.floor(pV.y)*width + Math.floor(pV.x))*4 + 3;
                if (buffer[idx] & 1) energia += 100;
            }
        }
        return { mejorAngulo: 0, maxScore: energia };
    }

    // MODO AZUL: ESCÁNER DE COHERENCIA TWIN
    // No busca picos de energía. Busca correlación inversa entre vecinos.
    // Escaneamos una cadena larga (16 pares) para asegurar que no es ruido.

    let maxScore = 0;
    let mejorAngulo = 0;
    const blockSize = 8;
    const paresAChequear = 16; // Chequeamos 16 bits (32 bloques) para velocidad/precisión en radar

    // Barrido de ángulos
    for (let angulo = 0; angulo < 360; angulo += 15) {
        let score = 0;

        // Empezamos un poco atrás para centrar el escaneo
        const startX = - (paresAChequear * blockSize) / 2;
        const startY = 0; // Solo una línea horizontal para el radar rápido

        for (let i = 0; i < paresAChequear; i++) {
            // Coordenadas relativas del PAR (Bit y Sombra)
            // Bit en X, Sombra en X+8
            const relXA = startX + (i * 2 * blockSize);
            const relXB = relXA + blockSize;

            // Rotamos
            const pA = rotarPunto(cX + relXA, cY + startY, cX, cY, angulo);
            const pB = rotarPunto(cX + relXB, cY + startY, cX, cY, angulo);

            // Medimos tensión con signo (height añadido correctamente)
            const tA = calcularTensionConSigno(buffer, width, height, pA.x, pA.y, canal);
            const tB = calcularTensionConSigno(buffer, width, height, pB.x, pB.y, canal);

            // LÓGICA CLAVE:
            // Si es señal real, tA y tB deben ser opuestos.
            // (tA - tB) debe ser grande (positivo o negativo, depende del bit).
            // Sumamos el VALOR ABSOLUTO de la diferencia.
            // Si hay ruido correlacionado (ambos suben), la resta es pequeña.
            // Si hay señal (uno sube, otro baja), la resta es grande.

            score += Math.abs(tA - tB);
        }

        if (score > maxScore) {
            maxScore = score;
            mejorAngulo = angulo;
        }
    }

    return { mejorAngulo, maxScore };
}

function calcularTensionConSigno(buffer, width, height, x, y, canal) {
    let block = [];
    // Extraer bloque 8x8
    for (let bj = 0; bj < 8; bj++) {
        let row = [];
        for (let bi = 0; bi < 8; bi++) {
            // Pasamos height correctamente
            row.push(getValBilineal(buffer, width, height, x + bi, y + bj, canal));
        }
        block.push(row);
    }
    const d = dct8x8(block);
    // Diferencia (1,1) - (2,2)
    return d[1][1] - d[2][2];
}

function extraerADNTwin(buffer, width, height, cX, cY, anguloOptimo, canal) {
    let adn = "";

    if (canal === 3) return "1111111111111111"; // Placeholder Alfa

    // MODO AZUL: LECTURA DE PARES (DECODIFICACIÓN)
    // Leemos 32 pares (para sacar los 16 bits repetidos 2 veces o la secuencia completa)
    const blockSize = 8;
    const bitsALeer = 32;

    // Centrado
    const startX = - (bitsALeer * 2 * blockSize) / 2;
    const startY = 0;

    for (let i = 0; i < bitsALeer; i++) {
        // Bloque A (Bit) y Bloque B (Sombra)
        const relXA = startX + (i * 2 * blockSize);
        const relXB = relXA + blockSize;

        const pA = rotarPunto(cX + relXA, cY + startY, cX, cY, anguloOptimo);
        const pB = rotarPunto(cX + relXB, cY + startY, cX, cY, anguloOptimo);

        const tA = calcularTensionConSigno(buffer, width, height, pA.x, pA.y, canal);
        const tB = calcularTensionConSigno(buffer, width, height, pB.x, pB.y, canal);

        // DECODIFICACIÓN:
        // Diferencia = (Señal - Sombra)
        // > 0  => Bit 1
        // <= 0 => Bit 0
        const diff = tA - tB;
        adn += (diff > 0) ? "1" : "0";
    }
    return adn;
}

// --- UTILIDADES (SIN ERRORES) ---

function getValBilineal(buffer, width, height, x, y, canal) {
    const x1 = Math.floor(x);
    const y1 = Math.floor(y);

    // Protección de bordes segura
    if (x1 < 0 || x1 >= width - 1 || y1 < 0 || y1 >= height - 1) return 0;

    const fx = x - x1;
    const fy = y - y1;
    const idx = (yy, xx) => (yy * width + xx) * 4 + canal;

    const v00 = buffer[idx(y1, x1)];
    const v10 = buffer[idx(y1, x1 + 1)];
    const v01 = buffer[idx(y1 + 1, x1)];
    const v11 = buffer[idx(y1 + 1, x1 + 1)];

    return (v00 * (1 - fx) * (1 - fy)) + (v10 * fx * (1 - fy)) + (v01 * (1 - fx) * fy) + (v11 * fx * fy);
}

function dct8x8(block) {
    const n = 8;
    let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    // Calculamos solo coeficientes bajos relevantes
    for (let u = 1; u <= 2; u++) {
        for (let v = 1; v <= 2; v++) {
            if (u!==v) continue;
            let sum = 0;
            for (let x = 0; x < n; x++) {
                for (let y = 0; y < n; y++) {
                    sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                }
            }
            dct[v][u] = 0.25 * sum;
        }
    }
    return dct;
}

function rotarPunto(x, y, cX, cY, angulo) {
    if (angulo === 0) return { x, y };
    const rad = angulo * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: cos * (x - cX) - sin * (y - cY) + cX,
        y: sin * (x - cX) + cos * (y - cY) + cY
    };
}

function getVogelPoint30(n, cX, cY, escala) {
    const r = escala * Math.sqrt(n / 30);
    const theta = n * 2.39996322972865332;
    return { x: cX + r * Math.cos(theta), y: cY + r * Math.sin(theta) };
}
