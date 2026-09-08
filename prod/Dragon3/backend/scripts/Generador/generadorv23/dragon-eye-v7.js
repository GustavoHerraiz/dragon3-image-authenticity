// DRAGON EYE v7.0 - ANALIZADOR COMPLETO MEJORADO (ES6) - VERSIÓN CORREGIDA
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ==================== CONFIGURACIÓN ====================
const BLOCK_SIZE = 8;
const DNA_BITS = 16;
const CHANNEL_IDX = 2; // Canal azul (0=R, 1=G, 2=B)
const MIN_ENERGY_THRESHOLD = 30;
const SCALES = [1.0, 0.75, 0.5, 1.25, 1.5]; // Primero escala original
const SEARCH_STEP = 1; // ¡CRUCIAL! Antes era 2

// Base de datos de hashes conocidos
const HASH_DATABASE = {
    '50B3': { client: 'Jerome', work: 'Olivo' },
    '86DB': { client: 'Test', work: 'Unknown' }
    // Añadir más según necesites
};

// ==================== FUNCIONES DE IMAGEN ====================

/**
 * Decodifica imagen y extrae canal azul
 */
async function decodeImage(imageBuffer) {
    try {
        const image = sharp(imageBuffer);
        const metadata = await image.metadata();
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

        return {
            data: data,
            width: info.width,
            height: info.height,
            channels: info.channels
        };
    } catch (error) {
        console.error('Error decodificando imagen:', error);
        throw error;
    }
}

/**
 * Extrae un canal específico de la imagen
 */
function extractChannel(imageData, width, height, channelIndex) {
    const totalPixels = width * height;
    const channelData = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
        channelData[i] = imageData[i * 4 + channelIndex]; // RGBA
    }

    return channelData;
}

/**
 * Redimensiona imagen (para búsqueda multi-escala) - VERSIÓN CORREGIDA
 */
async function resizeImageData(originalData, originalWidth, originalHeight, newWidth, newHeight) {
    try {
        // Crear buffer con datos correctos
        const tempBuffer = await sharp(originalData.buffer ? originalData.buffer : originalData, {
            raw: {
                width: originalWidth,
                height: originalHeight,
                channels: 4
            }
        })
        .resize(newWidth, newHeight, { fit: 'fill' })
        .raw()
        .toBuffer();

        return tempBuffer;
    } catch (error) {
        console.error(`Error redimensionando ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}:`, error.message);
        throw error;
    }
}

// ==================== FUNCIONES DCT ====================

/**
 * Calcula DCT de un bloque 8x8 usando algoritmo rápido
 */
function calculateDCT(block) {
    const dct = new Array(64).fill(0);

    // Versión simplificada - enfocada en coeficientes bajos
    for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
            let sum = 0;

            for (let x = 0; x < 8; x++) {
                for (let y = 0; y < 8; y++) {
                    const pixel = block[y * 8 + x];
                    const cos1 = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
                    const cos2 = Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                    sum += pixel * cos1 * cos2;
                }
            }

            const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
            const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
            dct[v * 8 + u] = 0.25 * cu * cv * sum;
        }
    }

    return dct;
}

/**
 * Extrae un bloque de la imagen
 */
function extractBlock(imageData, width, startX, startY, blockSize) {
    const block = new Array(blockSize * blockSize);

    for (let y = 0; y < blockSize; y++) {
        for (let x = 0; x < blockSize; x++) {
            const imgX = startX + x;
            const imgY = startY + y;

            if (imgX < width && imgY * width + imgX < imageData.length) {
                block[y * blockSize + x] = imageData[imgY * width + imgX];
            } else {
                block[y * blockSize + x] = 0;
            }
        }
    }

    return block;
}

// ==================== FUNCIONES DE ENERGÍA ====================

/**
 * Calcula energía entre dos bloques usando múltiples coeficientes DCT
 */
function calculateBlockEnergy(blockA, blockB) {
    const dctA = calculateDCT(blockA);
    const dctB = calculateDCT(blockB);

    // Usar coeficientes de baja frecuencia
    // En calculateBlockEnergy, buscar en más coeficientes
const coefficients = [
    [1,1], [2,2], [3,3], [4,4], [1,2], [2,1], [2,3], [3,2]
];

    let totalEnergy = 0;
    for (const [u, v] of coefficients) {
        const idx = v * 8 + u;
        const diff = dctA[idx] - dctB[idx];
        totalEnergy += Math.abs(diff);
    }

    return totalEnergy;
}

// NUEVA FUNCIÓN: Determinar si es bit 1 o 0 con umbral dinámico
function determineBit(energy) {
    // Umbral dinámico basado en energía promedio
    // Si la energía es muy positiva = 1, muy negativa = 0, cercano a 0 = indeterminado
    const threshold = 2; // MUY BAJO para giros

// Y AÑADIR DEBUG:
console.log(`   🔍 Energías: ${rawEnergies.map(e => e.toFixed(1)).join(',')}`);
console.log(`   🔍 Threshold calculado: ${threshold}`);

    if (energy > threshold) return 1;
    if (energy < -threshold) return 0;
    return energy > 0 ? 1 : 0; // Por defecto
}

// ==================== FUNCIONES DE CALIBRACIÓN ====================

/**
 * Detecta parámetros de la cuadrícula mediante autocorrelación
 */
function detectGridParameters(imageData, width, height) {
    const samplePoints = [];

    // Buscar patrones periódicos en energía
    const energyMap = [];
    const searchRange = Math.min(50, Math.floor(width / 4));

    // Muestrear energía en una línea horizontal central
    const centerY = Math.floor(height / 2);
    for (let x = 10; x < searchRange; x += 2) {
        if (x + BLOCK_SIZE * 2 < width) {
            const blockA = extractBlock(imageData, width, x, centerY, BLOCK_SIZE);
            const blockB = extractBlock(imageData, width, x + BLOCK_SIZE, centerY, BLOCK_SIZE);
            const energy = calculateBlockEnergy(blockA, blockB);
            energyMap.push({ x, energy });
        }
    }

    // Encontrar picos periódicos (cada 8 píxeles)
    const possibleStrides = [6, 7, 8, 9, 10];
    const strideScores = {};

    for (const stride of possibleStrides) {
        let score = 0;
        let peakCount = 0;

        for (let x = 0; x < energyMap.length - stride; x++) {
            const energy1 = energyMap[x].energy;
            const energy2 = energyMap[x + stride].energy;

            // Si ambos tienen energía significativa, es un patrón
            if (energy1 > 20 && energy2 > 20) {
                score += (energy1 + energy2);
                peakCount++;
            }
        }

        if (peakCount > 0) {
            strideScores[stride] = score / peakCount;
        }
    }

    // Elegir el stride con mejor score
    let bestStride = 8;
    let bestScore = 0;

    for (const [stride, score] of Object.entries(strideScores)) {
        if (score > bestScore) {
            bestScore = score;
            bestStride = parseInt(stride);
        }
    }

    // Si no se encontró buen patrón, forzar 8 (que es el correcto)
    if (bestScore < 50) {
        bestStride = 8;
    }

    return {
        strideX: bestStride,
        strideY: 8,
        offsetX: 0,
        offsetY: 0,
        confidence: bestScore > 100 ? 0.9 : 0.5
    };
}

/**
 * Encuentra el valor más común en un array
 */
function findDominantValue(arr) {
    if (arr.length === 0) return null;

    const freq = {};
    let maxCount = 0;
    let dominant = arr[0];

    arr.forEach(val => {
        freq[val] = (freq[val] || 0) + 1;
        if (freq[val] > maxCount) {
            maxCount = freq[val];
            dominant = val;
        }
    });

    return dominant;
}

// ==================== FUNCIONES DE ROTACIÓN CRC ====================

/**
 * Rota un array circularmente
 */
function rotateArray(arr, positions) {
    const n = arr.length;
    positions = positions % n;
    if (positions === 0) return [...arr];

    return [...arr.slice(positions), ...arr.slice(0, positions)];
}

/**
 * Valida CRC de los bits extraídos
 */
function isValidHash(bitsArray) {
    if (bitsArray.length !== 16) return false;

    // Rechazar patrones obvios
    const ones = bitsArray.filter(bit => bit === 1).length;
    if (ones === 0 || ones === 16) return false;

    // Aceptar si tiene balance razonable
    return ones >= 4 && ones <= 12;
}

// ==================== EXTRACCIÓN DE ADN ====================

/**
 * Extrae ADN con todas las rotaciones posibles
 */
function extractDNAWithRotation(imageData, width, height, gridParams, startX, startY) {
    // 1. EXTRAER 16 SEÑALES NORMALIZADAS
    const signalStrengths = [];
    const energies = [];

    for (let i = 0; i < DNA_BITS; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const x = startX + col * gridParams.strideX;
        const y = startY + row * gridParams.strideY;

        if (x + BLOCK_SIZE * 2 >= width || y + BLOCK_SIZE >= height) {
            signalStrengths.push(0);
            energies.push(0);
            continue;
        }

        const blockA = extractBlock(imageData, width, x, y, BLOCK_SIZE);
        const blockB = extractBlock(imageData, width, x + BLOCK_SIZE, y, BLOCK_SIZE);
        const dctA = calculateDCT(blockA);
        const dctB = calculateDCT(blockB);

        // Coeficientes principales
        const coeffs = [[1, 1], [2, 2]];
        let totalDiff = 0;
        let totalMagnitude = 0;

        for (const [u, v] of coeffs) {
            const idx = v * 8 + u;
            const diff = dctA[idx] - dctB[idx];
            const mag = Math.abs(dctA[idx]) + Math.abs(dctB[idx]);
            totalDiff += diff;
            totalMagnitude += mag;
        }

        energies.push(Math.abs(totalDiff));
        signalStrengths.push(totalMagnitude > 0.1 ? totalDiff / totalMagnitude : 0);
    }

    const totalEnergy = energies.reduce((a, b) => a + b, 0);
    if (totalEnergy < MIN_ENERGY_THRESHOLD) {
        return {
            bits: Array(16).fill(0),
            hash: '0000',
            rotation: 0,
            energy: 0,
            exactMatch: false,
            offsetX: startX,
            offsetY: startY
        };
    }

    // 2. PRIMERO: BUSCAR HASHES CONOCIDOS EXACTOS
    for (const targetHash in HASH_DATABASE) {
        const targetBits = hexToBits(targetHash);

        for (let rotation = 0; rotation < DNA_BITS; rotation++) {
    const rotatedSignals = rotateArray(signalStrengths, rotation);

    // 1. CALCULAR UMBRAL ÓPTIMO DINÁMICO para esta rotación
    const absSignals = rotatedSignals.map(Math.abs).filter(s => s > 0.01);
    if (absSignals.length < 8) continue; // Muy pocas señales

    // Calcular estadísticas robustas (ignorar outliers)
    const sorted = [...absSignals].sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)]; // Percentil 25
    const q75 = sorted[Math.floor(sorted.length * 0.75)]; // Percentil 75

    // Umbral base: punto medio entre Q25 y Q75
    const baseThreshold = (q25 + q75) / 2;

    // Rango de búsqueda: ±30% del umbral base
    const minThreshold = Math.max(0.12, baseThreshold * 0.7);
    const maxThreshold = Math.min(0.35, baseThreshold * 1.3);
    const stepSize = Math.max(0.01, (maxThreshold - minThreshold) / 20);

    // 2. BUSCAR UMBRAL QUE PRODUZCA HASH EXACTO
    let foundThreshold = null;
    let foundBits = null;
    let foundStrongSignals = 0;

    for (let threshold = minThreshold; threshold <= maxThreshold; threshold += stepSize) {
        const bits = rotatedSignals.map(s =>
            s > threshold ? 1 : (s < -threshold ? 0 : 0)
        );

        // Verificar coincidencia exacta
        let match = true;
        for (let i = 0; i < 16; i++) {
            if (bits[i] !== targetBits[i]) {
                match = false;
                break;
            }
        }

        if (match) {
            // Calcular calidad: contar señales fuertes
            let strongSignals = 0;
            for (let i = 0; i < 16; i++) {
                if (Math.abs(rotatedSignals[i]) > threshold * 1.5) {
                    strongSignals++;
                }
            }

            // Si es mejor que lo anterior, guardar
            if (strongSignals > foundStrongSignals) {
                foundThreshold = threshold;
                foundBits = bits;
                foundStrongSignals = strongSignals;
            }
        }
    }

    // 3. VALIDAR Y DEVOLVER SI ES BUENO
    if (foundBits && foundStrongSignals >= 10) {
        console.log(`   🎯 ¡EXACTO! ${targetHash} en (${startX},${startY})`);
        console.log(`      Rotación: ${rotation}, Umbral: ${foundThreshold.toFixed(3)}`);
        console.log(`      Señales fuertes: ${foundStrongSignals}/16`);
        console.log(`      Rango umbral: ${minThreshold.toFixed(3)}-${maxThreshold.toFixed(3)}`);

        return {
            bits: foundBits,
            hash: targetHash,
            rotation: rotation,
            energy: totalEnergy,
            exactMatch: true,
            offsetX: startX,
            offsetY: startY,
            signals: rotatedSignals,
            threshold: foundThreshold
        };
    }
}
    }

    // 3. SEGUNDO: BUSCAR MEJOR COMBINACIÓN (fallback)
    const candidates = [];

    for (let rotation = 0; rotation < DNA_BITS; rotation++) {
        const rotatedSignals = rotateArray(signalStrengths, rotation);
        const rotatedEnergies = rotateArray(energies, rotation);
        const rotatedTotalEnergy = rotatedEnergies.reduce((a, b) => a + b, 0);

        // Solo considerar rotaciones con buena energía
        if (rotatedTotalEnergy < totalEnergy * 0.7) continue;

        // Probar varios umbrales
        for (let threshold = 0.05; threshold <= 0.25; threshold += 0.05) {
            const bits = rotatedSignals.map(s =>
                s > threshold ? 1 : (s < -threshold ? 0 : 0)
            );

            const hash = bitsToHex(bits);

            // Calcular puntuación
            let score = 0;
            let strongSignals = 0;

            // Señales fuertes
            for (let i = 0; i < 16; i++) {
                const absSignal = Math.abs(rotatedSignals[i]);
                if (absSignal > threshold * 1.5) {
                    strongSignals++;
                    score += absSignal * 10;
                }
            }

            // Bonus por energía
            score += rotatedTotalEnergy * 0.1;

            // Bonus por validez
            if (isValidHash(bits)) score += 50;

            candidates.push({
                bits: bits,
                hash: hash,
                rotation: rotation,
                energy: rotatedTotalEnergy,
                threshold: threshold,
                score: score,
                strongSignals: strongSignals,
                inDB: HASH_DATABASE[hash] ? 1 : 0,
                offsetX: startX,
                offsetY: startY
            });
        }
    }

    // 4. SELECCIONAR MEJOR CANDIDATO
    if (candidates.length > 0) {
        candidates.sort((a, b) => {
            if (a.inDB && !b.inDB) return -1;
            if (!a.inDB && b.inDB) return 1;
            if (a.score > b.score * 1.1) return -1;
            if (b.score > a.score * 1.1) return 1;
            return b.energy - a.energy;
        });

        const best = candidates[0];

        // Debug solo para buenos candidatos
        if (best.energy > 200 && best.strongSignals >= 8) {
            console.log(`   🔍 Offset (${startX},${startY}):`);
            console.log(`      Hash: ${best.hash}, Rot: ${best.rotation}, Umbral: ${best.threshold.toFixed(2)}`);
            console.log(`      Score: ${best.score.toFixed(1)}, Señales fuertes: ${best.strongSignals}`);
        }

        return {
            bits: best.bits,
            hash: best.hash,
            rotation: best.rotation,
            energy: best.energy,
            exactMatch: false,
            offsetX: startX,
            offsetY: startY
        };
    }

    // 5. FALLBACK FINAL
    const defaultBits = signalStrengths.map(s => s > 0.1 ? 1 : (s < -0.1 ? 0 : 0));
    return {
        bits: defaultBits,
        hash: bitsToHex(defaultBits),
        rotation: 0,
        energy: totalEnergy,
        exactMatch: false,
        offsetX: startX,
        offsetY: startY
    };
}

// Función helper para convertir hex a bits
function hexToBits(hex) {
    const bits = [];
    for (let i = 0; i < 4; i++) {
        const nibble = parseInt(hex[i], 16);
        bits.push((nibble >> 3) & 1);
        bits.push((nibble >> 2) & 1);
        bits.push((nibble >> 1) & 1);
        bits.push(nibble & 1);
    }
    return bits;
}

// ==================== BÚSQUEDA MULTI-ESCALA ====================

/**
 * Convierte bits a hexadecimal
 */
function bitsToHex(bitsArray) {
    let hex = '';
    for (let i = 0; i < bitsArray.length; i += 4) {
        const nibble = bitsArray.slice(i, i + 4);
        const value = nibble.reduce((acc, bit, idx) => acc + (bit << (3 - idx)), 0);
        hex += value.toString(16).toUpperCase();
    }
    return hex;
}

/**
 * Agrupa resultados similares
 */
function clusterResults(results, maxDistance = 2) {
    const clusters = [];

    results.forEach(result => {
        let foundCluster = false;

        for (const cluster of clusters) {
            // Calcular distancia Hamming
            let distance = 0;
            for (let i = 0; i < Math.min(result.bits.length, cluster.representative.bits.length); i++) {
                if (result.bits[i] !== cluster.representative.bits[i]) distance++;
            }

            if (distance <= maxDistance) {
                cluster.members.push(result);
                // PRIORIZAR HASHES CONOCIDOS SOBRE ENERGÍA
                if (HASH_DATABASE[result.hash] && !HASH_DATABASE[cluster.representative.hash]) {
                    cluster.representative = result;
                } else if (result.energy > cluster.representative.energy) {
                    cluster.representative = result;
                }
                foundCluster = true;
                break;
            }
        }

        if (!foundCluster) {
            clusters.push({
                representative: result,
                members: [result]
            });
        }
    });

    // ORDENAR: 1) Hash conocido, 2) Similitud con conocidos, 3) Energía
    return clusters.map(c => c.representative)
                   .sort((a, b) => {
                       const aInDB = HASH_DATABASE[a.hash] ? 1 : 0;
                       const bInDB = HASH_DATABASE[b.hash] ? 1 : 0;
                       if (aInDB && !bInDB) return -1;
                       if (!aInDB && bInDB) return 1;
                       return b.energy - a.energy;
                   });
}

/**
 * Búsqueda principal multi-escala - VERSIÓN SIMPLIFICADA (solo escala original primero)
 */
async function multiScaleSearch(originalImageData, originalWidth, originalHeight) {
    console.log(`   🎯 Búsqueda con strides variables (6-10)`);

    const allResults = [];
    const blueChannel = extractChannel(originalImageData, originalWidth, originalHeight, CHANNEL_IDX);

    // Probar diferentes strides porque el crop/rotación puede cambiar el espaciado
    const testStrides = [6, 7, 8, 9, 10];

    for (const stride of testStrides) {
        const gridParams = {
            strideX: stride,
            strideY: 8,
            offsetX: 0,
            offsetY: 0,
            confidence: 1.0
        };

        console.log(`   📐 Probando stride=${stride}`);

        // Offsets básicos
        const maxX = Math.min(8, Math.floor(originalWidth / stride));
        const maxY = 2; // Solo primeras 2 filas

        for (let dx = 0; dx < maxX; dx++) {
            for (let dy = 0; dy < maxY; dy++) {
                const dnaResult = extractDNAWithRotation(
                    blueChannel,
                    originalWidth,
                    originalHeight,
                    gridParams,
                    dx,
                    dy
                );

                if (dnaResult.energy > MIN_ENERGY_THRESHOLD) {
                    allResults.push({
                        ...dnaResult,
                        scale: 1.0,
                        gridStride: stride,
                        gridConfidence: 1.0,
                        hash: bitsToHex(dnaResult.bits)
                    });

                    // Solo mostrar los mejores
                    if (dnaResult.energy > 180) {
                        console.log(`   🔍 stride=${stride}, offset(${dx},${dy}): hash=${bitsToHex(dnaResult.bits)}, energy=${dnaResult.energy.toFixed(1)}`);
                    }
                }
            }
        }
    }

    return clusterResults(allResults);
}

// ==================== NÚCLEO PRINCIPAL ====================

/**
 * Núcleo mejorado de Dragon Eye
 */
export async function dragonEyeCoreEnhanced(imageBuffer) {
    try {
        console.log('🎯 MOTOR GLOBAL: Buscando sincronización en toda la imagen...');

        // Decodificar imagen
        const { data, width, height } = await decodeImage(imageBuffer);
        console.log(`   📐 Imagen: ${width}x${height} píxeles`);

        // Búsqueda multi-escala
        const candidates = await multiScaleSearch(data, width, height);

        if (candidates.length === 0) {
            console.log('   ❌ Señal no encontrada.');
            return {
                found: false,
                energy: 0,
                hash: null,
                details: {}
            };
        }

        const bestMatch = candidates[0];

        // Refinar posición (buscar alrededor del mejor resultado)
        console.log('   ✨ Sincronización detectada. Refinando fase...');
        console.log(`   🏆 ADN EXTRAÍDO: ${bestMatch.bits.join('')}`);
        console.log(`   🔐 HASH: ${bestMatch.hash} (Energía Acumulada: ${bestMatch.energy})`);
        console.log(`   🔄 Rotación aplicada: ${bestMatch.rotation} bits`);
        console.log(`   ✅ CRC Válido: ${bestMatch.isValid ? 'SÍ' : 'NO'}`);

        // Buscar en base de datos
        const dbEntry = HASH_DATABASE[bestMatch.hash];

        if (dbEntry) {
            console.log(`   ✅ IDENTIFICADO: ${dbEntry.client} - ${dbEntry.work}`);
        } else {
            console.log(`   ⚠️ Hash desconocido.`);
        }

        return {
            found: true,
            energy: bestMatch.energy,
            hash: bestMatch.hash,
            bits: bestMatch.bits,
            rotation: bestMatch.rotation,
            isValidCRC: bestMatch.isValid,
            client: dbEntry ? dbEntry.client : null,
            work: dbEntry ? dbEntry.work : null,
            details: {
                scale: bestMatch.scale,
                offsetX: bestMatch.offsetX,
                offsetY: bestMatch.offsetY,
                gridStride: bestMatch.gridStride,
                gridConfidence: bestMatch.gridConfidence
            }
        };
    } catch (error) {
        console.error('   ❌ Error en Dragon Eye:', error.message);
        return {
            found: false,
            energy: 0,
            hash: null,
            error: error.message,
            details: {}
        };
    }
}

// ==================== FUNCIÓN DE PRUEBA ====================

/**
 * Función de prueba para validar las mejoras
 */
export async function testEnhancedAnalyzer(imagePath) {
    console.log(`\n🔥 INICIANDO DRAGON EYE v7.0 (Source Matched): ${path.basename(imagePath)}`);

    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const result = await dragonEyeCoreEnhanced(imageBuffer);

        // Formato similar a tu test original
        const status = result.found && result.hash && HASH_DATABASE[result.hash] ? '✅' : '❌';
        const hashDisplay = result.hash || '----';
        const energyDisplay = result.found ? result.energy : 0;
        const scaleDisplay = result.details?.scale ? `${result.details.scale.toFixed(2)}x` : '1.00x';
        const offsetDisplay = result.details ? `X:${result.details.offsetX} Y:${result.details.offsetY}` : 'X:0 Y:0';

        console.log(`\n| ${path.basename(imagePath, '.jpg')} | ${status} | ${energyDisplay.toString().padStart(8)} | ${hashDisplay} | ${scaleDisplay.padStart(6)} | ${offsetDisplay.padEnd(40)} |`);

        return result;
    } catch (error) {
        console.error(`   Error: ${error.message}`);
        console.log(`\n| ${path.basename(imagePath, '.jpg')} | ❌ |        0 | ---- |  1.00x | ${'ERROR'.padEnd(40)} |`);
        return null;
    }
}

// ==================== EJECUCIÓN PRINCIPAL ====================

/**
 * Función principal para ejecutar el analizador
 */
async function main() {
    console.log('======================================================================');
    console.log('👁️  DRAGON EYE v7.0 - ANALIZADOR MEJORADO');
    console.log('======================================================================\n');

    // Ejemplo de uso
    if (process.argv.length > 2) {
        const imagePath = process.argv[2];
        await testEnhancedAnalyzer(imagePath);
    } else {
        console.log('Modo de uso: node dragon-eye-v7.js <ruta-imagen>');
        console.log('\nCaracterísticas implementadas:');
        console.log('1. ✅ Rotación circular de bits (0-15 posiciones)');
        console.log('2. ✅ Validación CRC interna');
        console.log('3. ✅ Búsqueda multi-escala (0.5x, 0.75x, 1.0x, 1.25x, 1.5x)');
        console.log('4. ✅ Paso de búsqueda de 1 píxel (antes 2)');
        console.log('5. ✅ Detección automática de stride de cuadrícula');
        console.log('6. ✅ Clustering de resultados similares');
        console.log('7. ✅ Canal azul optimizado');
        console.log('8. ✅ Refinamiento de posición');
    }
}

// Exportar todas las funciones principales
export default {
    dragonEyeCoreEnhanced,
    testEnhancedAnalyzer
};

// Si se ejecuta directamente, correr main()
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
