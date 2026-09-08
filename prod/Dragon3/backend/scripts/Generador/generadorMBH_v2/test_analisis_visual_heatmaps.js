/**
 * ============================================================================
 * 🔬 DRAGON3 - ANÁLISIS VISUAL DE SEÑAL: Mapas de Calor del Canal Azul
 * ============================================================================
 *
 * OBJETIVO:
 * Generar mapas de calor del canal azul para diferentes reescalados y
 * analizar visualmente cómo se comporta la señal DCT después del resize.
 *
 * SALIDAS:
 * - Mapas de calor de intensidad del canal azul
 * - Mapas de energía DCT por bloques 8x8
 * - Mapas de coeficientes (1,1) y (2,2)
 * - Mapas de diferencia (señal diferencial)
 * - Visualizaciones comparativas
 *
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GeneradorMBH } from './generadorMBH.js';

// =====================================================================
// CONFIGURACIÓN
// =====================================================================
const CONFIG = {
    // Directorios
    INPUT_DIR: './input',
    OUTPUT_DIR: './output_heatmaps',
    IMAGEN_TEST: 'firma_test.jpg',

    // ID para el sello
    METADATOS: {
        id_numerico: 55136,
        hash_suffix: "d760"
    },

    // Factores de reescalado a analizar
    FACTORES_RESIZE: [
        1.0,   // Original (referencia)
        0.9,   // -10%
        0.75,  // -25%
        0.66,  // -33%
        0.5,   // -50%
        0.33,  // -67%
        0.25,  // -75%
        1.33,  // +33%
        1.5,   // +50%
        2.0    // +100%
    ],

    // Configuración DCT
    BLOCK_SIZE: 8,
    DCT_COEFFS: [
        { u: 1, v: 1, label: 'DCT(1,1)' },
        { u: 2, v: 2, label: 'DCT(2,2)' }
    ],

    // Configuración visual
    HEATMAP_SIZE: 800,  // Tamaño de los mapas de calor (px)
    COLOR_SCHEME: 'viridis'  // viridis, plasma, inferno, magma
};

// =====================================================================
// TABLA DE COSENOS PRECALCULADA
// =====================================================================
const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

// =====================================================================
// FUNCIÓN PRINCIPAL
// =====================================================================
async function ejecutarAnalisisVisual() {
    console.log('\n🔬 DRAGON3 - ANÁLISIS VISUAL DE SEÑAL');
    console.log('=' .repeat(70));
    console.log(`📊 Generando mapas de calor para ${CONFIG.FACTORES_RESIZE.length} escalas diferentes`);
    console.log('=' .repeat(70));

    // Crear estructura de directorios
    const dirs = [
        CONFIG.OUTPUT_DIR,
        path.join(CONFIG.OUTPUT_DIR, 'blue_channel'),
        path.join(CONFIG.OUTPUT_DIR, 'dct_energy'),
        path.join(CONFIG.OUTPUT_DIR, 'dct_coeff_1_1'),
        path.join(CONFIG.OUTPUT_DIR, 'dct_coeff_2_2'),
        path.join(CONFIG.OUTPUT_DIR, 'dct_differential'),
        path.join(CONFIG.OUTPUT_DIR, 'images_resized'),
        path.join(CONFIG.OUTPUT_DIR, 'comparison')
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // Buscar imagen de entrada
    const rutasPosibles = [
        path.join(CONFIG.INPUT_DIR, CONFIG.IMAGEN_TEST),
        path.join('./', CONFIG.IMAGEN_TEST)
    ];
    let rutaOrigen = rutasPosibles.find(r => fs.existsSync(r));

    if (!rutaOrigen) {
        console.log('⚠️ No se encontró imagen de prueba. Creando imagen sintética...');
        rutaOrigen = path.join(CONFIG.OUTPUT_DIR, 'sintetica.png');
        await sharp({
            create: {
                width: 1000,
                height: 1000,
                channels: 4,
                background: { r: 200, g: 220, b: 255, alpha: 1 }
            }
        })
        .composite([{
            input: Buffer.from(`
                <svg width="1000" height="1000">
                    <circle cx="500" cy="500" r="400" fill="#4169E1"/>
                    <circle cx="500" cy="500" r="300" fill="#1E90FF"/>
                    <circle cx="500" cy="500" r="200" fill="#87CEEB"/>
                    <text x="500" y="520" font-size="60" text-anchor="middle" fill="white">DRAGON3</text>
                </svg>
            `),
            top: 0,
            left: 0
        }])
        .png()
        .toFile(rutaOrigen);
    }

    // PASO 1: Generar imagen sellada
    console.log('\n📝 PASO 1: Generando imagen sellada...');
    const generador = new GeneradorMBH();
    const rutaSellada = path.join(CONFIG.OUTPUT_DIR, 'MASTER_SELLADO.png');
    await generador.sellarImagen(rutaOrigen, rutaSellada, CONFIG.METADATOS);
    console.log(`   ✅ Imagen sellada guardada: ${rutaSellada}`);

    // Obtener dimensiones originales
    let metadataOriginal = await sharp(rutaSellada).metadata();
    let { width: widthOriginal, height: heightOriginal } = metadataOriginal;
    console.log(`   📐 Dimensiones originales: ${widthOriginal}x${heightOriginal}`);

    // ⚠️ LIMITAR TAMAÑO PARA EVITAR PROBLEMAS DE MEMORIA
    const MAX_DIMENSION = 2000;
    if (widthOriginal > MAX_DIMENSION || heightOriginal > MAX_DIMENSION) {
        console.log(`   ⚙️  Redimensionando imagen a tamaño manejable (max ${MAX_DIMENSION}px)...`);
        const rutaTemporal = path.join(CONFIG.OUTPUT_DIR, 'MASTER_RESIZED_FOR_ANALYSIS.png');

        await sharp(rutaSellada)
            .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toFile(rutaTemporal);

        // Usar la versión redimensionada para el análisis
        const metadataTemp = await sharp(rutaTemporal).metadata();
        widthOriginal = metadataTemp.width;
        heightOriginal = metadataTemp.height;

        // Reemplazar ruta sellada
        fs.renameSync(rutaTemporal, rutaSellada);

        console.log(`   ✅ Imagen ajustada a: ${widthOriginal}x${heightOriginal}`);
    }

    // PASO 2: Generar reescalados y analizar
    console.log('\n🔄 PASO 2: Generando reescalados y mapas de calor...');

    const resultados = [];

    for (const factor of CONFIG.FACTORES_RESIZE) {
        console.log(`\n   🔍 Procesando escala ${(factor * 100).toFixed(0)}% (factor ${factor})...`);

        const widthNew = Math.round(widthOriginal * factor);
        const heightNew = Math.round(heightOriginal * factor);

        // Ruta de la imagen reescalada
        const rutaResize = path.join(
            CONFIG.OUTPUT_DIR,
            'images_resized',
            `resize_${(factor * 100).toFixed(0)}pct.png`
        );

        // Reescalar imagen
        let bufferResized, infoResized;
        if (factor === 1.0) {
            // Usar original
            const data = await sharp(rutaSellada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            bufferResized = data.data;
            infoResized = data.info;
            await sharp(rutaSellada).toFile(rutaResize);
        } else {
            // Resize con Lanczos3 (igual que en el analizador)
            const data = await sharp(rutaSellada)
                .resize(widthNew, heightNew, { kernel: 'lanczos3' })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });
            bufferResized = data.data;
            infoResized = data.info;

            // Guardar imagen reescalada
            await sharp(bufferResized, {
                raw: { width: infoResized.width, height: infoResized.height, channels: 4 }
            }).png().toFile(rutaResize);
        }

        console.log(`      📐 Dimensiones: ${infoResized.width}x${infoResized.height}`);

        // Analizar y generar mapas
        const analisis = await analizarYGenerarMapas(
            bufferResized,
            infoResized.width,
            infoResized.height,
            factor
        );

        resultados.push({
            factor,
            width: infoResized.width,
            height: infoResized.height,
            ...analisis
        });

        console.log(`      ✅ Mapas generados`);
        console.log(`      📊 Energía media: ${analisis.energia_media.toFixed(4)}`);
        console.log(`      📊 Diff media: ${analisis.diff_media.toFixed(4)}`);
    }

    // PASO 3: Generar informe comparativo
    console.log('\n📊 PASO 3: Generando informe comparativo...');
    await generarInformeComparativo(resultados);

    console.log('\n✅ ANÁLISIS COMPLETADO');
    console.log('=' .repeat(70));
    console.log(`📁 Resultados guardados en: ${CONFIG.OUTPUT_DIR}`);
    console.log('   📂 blue_channel/       - Mapas de calor del canal azul');
    console.log('   📂 dct_energy/         - Energía total por bloque');
    console.log('   📂 dct_coeff_1_1/      - Coeficiente DCT(1,1)');
    console.log('   📂 dct_coeff_2_2/      - Coeficiente DCT(2,2)');
    console.log('   📂 dct_differential/   - Diferencia (1,1) - (2,2)');
    console.log('   📂 images_resized/     - Imágenes reescaladas');
    console.log('   📂 comparison/         - Informe comparativo');
    console.log('=' .repeat(70));
}

// =====================================================================
// ANÁLISIS Y GENERACIÓN DE MAPAS
// =====================================================================
async function analizarYGenerarMapas(buffer, width, height, factor) {
    const blockSize = CONFIG.BLOCK_SIZE;
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);

    // Matrices para almacenar datos
    const blueChannel = new Float32Array(width * height);
    const energyMap = new Float32Array(blocksX * blocksY);
    const coeff11Map = new Float32Array(blocksX * blocksY);
    const coeff22Map = new Float32Array(blocksX * blocksY);
    const diffMap = new Float32Array(blocksX * blocksY);

    // Extraer canal azul
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            blueChannel[y * width + x] = buffer[idx + 2]; // Canal B
        }
    }

    // Analizar bloques DCT
    let energiaTotal = 0;
    let diffTotal = 0;
    let numBloques = 0;

    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const x = bx * blockSize;
            const y = by * blockSize;

            // Calcular coeficientes DCT
            const coeff11 = calcularCoeficienteDCT(buffer, width, x, y, 1, 1);
            const coeff22 = calcularCoeficienteDCT(buffer, width, x, y, 2, 2);
            const diff = coeff11 - coeff22;

            const blockIdx = by * blocksX + bx;
            energyMap[blockIdx] = Math.abs(diff);
            coeff11Map[blockIdx] = coeff11;
            coeff22Map[blockIdx] = coeff22;
            diffMap[blockIdx] = diff;

            energiaTotal += Math.abs(diff);
            diffTotal += diff;
            numBloques++;
        }
    }

    // Generar mapas de calor
    const label = `${(factor * 100).toFixed(0)}pct`;

    await generarHeatmap(blueChannel, width, height,
        path.join(CONFIG.OUTPUT_DIR, 'blue_channel', `blue_${label}.png`),
        'Canal Azul', 0, 255);

    await generarHeatmapBloques(energyMap, blocksX, blocksY,
        path.join(CONFIG.OUTPUT_DIR, 'dct_energy', `energy_${label}.png`),
        'Energía DCT |Diff|');

    await generarHeatmapBloques(coeff11Map, blocksX, blocksY,
        path.join(CONFIG.OUTPUT_DIR, 'dct_coeff_1_1', `coeff11_${label}.png`),
        'DCT Coeff (1,1)');

    await generarHeatmapBloques(coeff22Map, blocksX, blocksY,
        path.join(CONFIG.OUTPUT_DIR, 'dct_coeff_2_2', `coeff22_${label}.png`),
        'DCT Coeff (2,2)');

    await generarHeatmapBloques(diffMap, blocksX, blocksY,
        path.join(CONFIG.OUTPUT_DIR, 'dct_differential', `diff_${label}.png`),
        'Diferencial (1,1)-(2,2)', null, null, true);

    return {
        blocksX,
        blocksY,
        energia_media: energiaTotal / numBloques,
        diff_media: diffTotal / numBloques,
        energia_max: findMax(energyMap),
        energia_min: findMin(energyMap.filter(v => v > 0))
    };
}

// Función auxiliar para encontrar máximo sin spread operator
function findMax(arr) {
    if (arr.length === 0) return 0;
    let max = arr[0];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > max) max = arr[i];
    }
    return max;
}

// Función auxiliar para encontrar mínimo sin spread operator
function findMin(arr) {
    if (arr.length === 0) return 0;
    let min = arr[0];
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] < min && arr[i] > 0) min = arr[i];
    }
    return min;
}

// =====================================================================
// GENERACIÓN DE HEATMAPS - PÍXELES
// =====================================================================
async function generarHeatmap(data, width, height, outputPath, title, minVal = null, maxVal = null) {
    // Calcular rango si no se especifica (sin spread operator para arrays grandes)
    if (minVal === null) {
        minVal = data[0];
        for (let i = 1; i < data.length; i++) {
            if (data[i] < minVal) minVal = data[i];
        }
    }
    if (maxVal === null) {
        maxVal = data[0];
        for (let i = 1; i < data.length; i++) {
            if (data[i] > maxVal) maxVal = data[i];
        }
    }

    const range = maxVal - minVal;

    // Crear buffer RGB para el heatmap
    const heatmapBuffer = Buffer.alloc(width * height * 3);

    for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const normalized = range > 0 ? (val - minVal) / range : 0;
        const color = getColorViridis(normalized);

        heatmapBuffer[i * 3 + 0] = color.r;
        heatmapBuffer[i * 3 + 1] = color.g;
        heatmapBuffer[i * 3 + 2] = color.b;
    }

    // Redimensionar a tamaño estándar para comparación
    await sharp(heatmapBuffer, {
        raw: { width, height, channels: 3 }
    })
    .resize(CONFIG.HEATMAP_SIZE, CONFIG.HEATMAP_SIZE, { fit: 'contain', background: '#000' })
    .png()
    .toFile(outputPath);
}

// =====================================================================
// GENERACIÓN DE HEATMAPS - BLOQUES
// =====================================================================
async function generarHeatmapBloques(data, blocksX, blocksY, outputPath, title, minVal = null, maxVal = null, centered = false) {
    // Calcular rango (sin spread operator)
    if (minVal === null) {
        minVal = data[0];
        for (let i = 1; i < data.length; i++) {
            if (data[i] < minVal) minVal = data[i];
        }
    }
    if (maxVal === null) {
        maxVal = data[0];
        for (let i = 1; i < data.length; i++) {
            if (data[i] > maxVal) maxVal = data[i];
        }
    }

    if (centered) {
        // Para mapas diferenciales, centrar en 0
        const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
        minVal = -absMax;
        maxVal = absMax;
    }

    const range = maxVal - minVal;

    // Expandir bloques a píxeles (cada bloque = 8x8 píxeles para visualización)
    const expandFactor = 8;
    const width = blocksX * expandFactor;
    const height = blocksY * expandFactor;

    const heatmapBuffer = Buffer.alloc(width * height * 3);

    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const val = data[by * blocksX + bx];
            const normalized = range > 0 ? (val - minVal) / range : 0.5;
            const color = centered ? getColorRdBu(normalized) : getColorViridis(normalized);

            // Pintar el bloque expandido
            for (let py = 0; py < expandFactor; py++) {
                for (let px = 0; px < expandFactor; px++) {
                    const pixelX = bx * expandFactor + px;
                    const pixelY = by * expandFactor + py;
                    const pixelIdx = (pixelY * width + pixelX) * 3;

                    heatmapBuffer[pixelIdx + 0] = color.r;
                    heatmapBuffer[pixelIdx + 1] = color.g;
                    heatmapBuffer[pixelIdx + 2] = color.b;
                }
            }
        }
    }

    // Redimensionar a tamaño estándar
    await sharp(heatmapBuffer, {
        raw: { width, height, channels: 3 }
    })
    .resize(CONFIG.HEATMAP_SIZE, CONFIG.HEATMAP_SIZE, { fit: 'contain', background: '#000' })
    .png()
    .toFile(outputPath);
}

// =====================================================================
// COLORMAPS
// =====================================================================
function getColorViridis(t) {
    // Viridis colormap (aproximación)
    t = Math.max(0, Math.min(1, t));

    const r = Math.round(255 * (0.267 + t * (0.329 - 0.267 + t * (0.984 - 0.329))));
    const g = Math.round(255 * (0.005 + t * (0.573 - 0.005 + t * (0.906 - 0.573))));
    const b = Math.round(255 * (0.329 + t * (0.565 - 0.329 + t * (0.143 - 0.565))));

    return { r, g, b };
}

function getColorRdBu(t) {
    // Red-Blue diverging colormap (centrado en 0.5)
    t = Math.max(0, Math.min(1, t));

    if (t < 0.5) {
        // Azul a blanco
        const s = t * 2;
        return {
            r: Math.round(5 + s * 250),
            g: Math.round(48 + s * 207),
            b: Math.round(97 + s * 158)
        };
    } else {
        // Blanco a rojo
        const s = (t - 0.5) * 2;
        return {
            r: Math.round(255 - s * 52),
            g: Math.round(255 - s * 122),
            b: Math.round(255 - s * 172)
        };
    }
}

// =====================================================================
// DCT RÁPIDA
// =====================================================================
function calcularCoeficienteDCT(buffer, width, startX, startY, u, v) {
    let sum = 0;

    for (let y = 0; y < 8; y++) {
        const rowOffset = (startY + y) * width * 4;
        const cosY = COS_TABLE[v * 8 + y];

        for (let x = 0; x < 8; x++) {
            const idx = rowOffset + (startX + x) * 4 + 2; // Canal azul
            const pixelVal = buffer[idx] - 128;
            sum += pixelVal * COS_TABLE[u * 8 + x] * cosY;
        }
    }

    return sum * 0.25;
}

// =====================================================================
// INFORME COMPARATIVO
// =====================================================================
async function generarInformeComparativo(resultados) {
    const informe = [];

    informe.push('# 🔬 ANÁLISIS VISUAL DE SEÑAL DCT - Informe Comparativo\n');
    informe.push(`**Generado:** ${new Date().toLocaleString('es-ES')}\n`);
    informe.push(`**ID Sellado:** ${CONFIG.METADATOS.id_numerico} (${CONFIG.METADATOS.hash_suffix})\n`);
    informe.push('---\n\n');

    informe.push('## 📊 Resumen de Escalas Analizadas\n\n');
    informe.push('| Factor | Dimensiones | Bloques | Energía Media | Diff Media | Energía Máx |\n');
    informe.push('|--------|-------------|---------|---------------|------------|-------------|\n');

    resultados.forEach(r => {
        informe.push(`| ${(r.factor * 100).toFixed(0)}% | ${r.width}x${r.height} | ${r.blocksX}x${r.blocksY} | ${r.energia_media.toFixed(4)} | ${r.diff_media.toFixed(4)} | ${r.energia_max.toFixed(4)} |\n`);
    });

    informe.push('\n## 📈 Gráfica de Energía vs Escala\n\n');
    informe.push('```\n');

    let maxEnergia = 0;
    for (const r of resultados) {
        if (r.energia_media > maxEnergia) maxEnergia = r.energia_media;
    }

    resultados.forEach(r => {
        const barLen = Math.round((r.energia_media / maxEnergia) * 40);
        const bar = '█'.repeat(barLen);
        informe.push(`${(r.factor * 100).toFixed(0).padStart(4)}% |${bar} ${r.energia_media.toFixed(4)}\n`);
    });

    informe.push('```\n\n');

    informe.push('## 🔍 Observaciones para Estrategia de Detección\n\n');

    // Calcular cambios relativos
    const original = resultados.find(r => r.factor === 1.0);
    if (original) {
        informe.push('### Cambios Relativos vs Original\n\n');
        informe.push('| Escala | ΔEnergía | ΔDiff | ΔBloques/Fila |\n');
        informe.push('|--------|----------|-------|---------------|\n');

        resultados.forEach(r => {
            if (r.factor !== 1.0) {
                const deltaE = ((r.energia_media - original.energia_media) / original.energia_media * 100).toFixed(1);
                const deltaD = ((r.diff_media - original.diff_media) / original.diff_media * 100).toFixed(1);
                const deltaB = ((r.blocksX - original.blocksX) / original.blocksX * 100).toFixed(1);
                informe.push(`| ${(r.factor * 100).toFixed(0)}% | ${deltaE}% | ${deltaD}% | ${deltaB}% |\n`);
            }
        });

        informe.push('\n### Ratio de Bloques (para sincronización)\n\n');
        informe.push('| Escala | Bloques/Fila Original | Bloques/Fila Resize | Ratio Inverso |\n');
        informe.push('|--------|-----------------------|---------------------|---------------|\n');

        resultados.forEach(r => {
            if (r.factor !== 1.0) {
                const ratio = original.blocksX / r.blocksX;
                informe.push(`| ${(r.factor * 100).toFixed(0)}% | ${original.blocksX} | ${r.blocksX} | ${ratio.toFixed(4)} |\n`);
            }
        });
    }

    informe.push('\n## 🎯 Recomendaciones\n\n');
    informe.push('1. **Analizar mapas de calor** en `dct_differential/` para ver patrones de señal\n');
    informe.push('2. **Comparar distribución de energía** entre escalas para identificar invariantes\n');
    informe.push('3. **Verificar ratio de bloques** para ajustar algoritmo de sincronización\n');
    informe.push('4. **Buscar frecuencias alternativas** si (1,1) y (2,2) se degradan mucho\n\n');

    informe.push('## 📁 Archivos Generados\n\n');
    informe.push('- `blue_channel/`: Mapas del canal azul completo\n');
    informe.push('- `dct_energy/`: Energía total por bloque (|diff|)\n');
    informe.push('- `dct_coeff_1_1/`: Coeficiente DCT(1,1)\n');
    informe.push('- `dct_coeff_2_2/`: Coeficiente DCT(2,2)\n');
    informe.push('- `dct_differential/`: **SEÑAL DIFERENCIAL** (1,1)-(2,2) ← CLAVE\n');
    informe.push('- `images_resized/`: Imágenes reescaladas para referencia\n');

    const pathInforme = path.join(CONFIG.OUTPUT_DIR, 'comparison', 'INFORME_ANALISIS_VISUAL.md');
    fs.writeFileSync(pathInforme, informe.join(''));

    console.log(`   ✅ Informe guardado: ${pathInforme}`);
}

// =====================================================================
// EJECUTAR
// =====================================================================
ejecutarAnalisisVisual().catch(e => {
    console.error('❌ Error en análisis visual:', e);
    process.exit(1);
});
