/**
 * ============================================================================
 * 🧬 DRAGON3 - ANÁLISIS AVANZADO: Patrón Twin-64 y Sincronización
 * ============================================================================
 *
 * Este script complementa el análisis visual generando:
 * - Visualización del patrón Twin-64 (bit + sombra)
 * - Mapas de sincronización de rejilla
 * - Análisis de phase-shift en diferentes escalas
 * - Histogramas de energía DCT
 *
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const CONFIG = {
    OUTPUT_DIR: './output_heatmaps',
    HEATMAP_SIZE: 1200,
    DNA_LENGTH: 64,
    BLOCK_SIZE: 8
};

// Tabla de cosenos
const COS_TABLE = new Float32Array(8 * 8);
for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
        COS_TABLE[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
}

/**
 * Genera visualización del patrón Twin-64 extraído de una imagen
 */
async function visualizarPatronTwin64(rutaImagen, outputPath, label) {
    const { data: buffer, info } = await sharp(rutaImagen)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height } = info;

    // Extraer patrón Twin-64 con diferentes anchos de referencia
    const blocksPerRow = Math.floor(width / CONFIG.BLOCK_SIZE);
    const anchosRef = [
        blocksPerRow,
        Math.round(blocksPerRow * 0.5),
        Math.round(blocksPerRow * 0.75),
        Math.round(blocksPerRow * 1.33),
        Math.round(blocksPerRow * 2.0)
    ];

    const patrones = [];

    for (const anchoRef of anchosRef) {
        const urnas = extraerPatronTwin64(buffer, width, height, anchoRef);
        patrones.push({
            anchoRef,
            urnas,
            label: `${blocksPerRow} → ${anchoRef}`
        });
    }

    // Generar visualización comparativa
    await generarVisualizacionPatrones(patrones, outputPath, label);

    return patrones;
}

/**
 * Extrae el patrón Twin-64 usando un ancho de referencia específico
 */
function extraerPatronTwin64(buffer, width, height, anchoRef) {
    const urnas = new Float32Array(CONFIG.DNA_LENGTH).fill(0);
    const conteo = new Float32Array(CONFIG.DNA_LENGTH).fill(0);

    for (let y = 0; y <= height - CONFIG.BLOCK_SIZE; y += CONFIG.BLOCK_SIZE) {
        const blockY = Math.floor(y / CONFIG.BLOCK_SIZE);

        for (let x = 0; x <= width - CONFIG.BLOCK_SIZE; x += CONFIG.BLOCK_SIZE) {
            const blockX = Math.floor(x / CONFIG.BLOCK_SIZE);

            const val1 = calcularCoeficienteDCT(buffer, width, x, y, 1, 1);
            const val2 = calcularCoeficienteDCT(buffer, width, x, y, 2, 2);
            const diff = val1 - val2;

            const linearIdx = blockY * anchoRef + blockX;
            const idx = linearIdx % CONFIG.DNA_LENGTH;

            urnas[idx] += diff;
            conteo[idx]++;
        }
    }

    // Normalizar
    for (let i = 0; i < CONFIG.DNA_LENGTH; i++) {
        if (conteo[i] > 0) urnas[i] /= conteo[i];
    }

    return urnas;
}

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

/**
 * Genera visualización de múltiples patrones Twin-64
 */
async function generarVisualizacionPatrones(patrones, outputPath, label) {
    const cellSize = 15;
    const padding = 40;
    const width = CONFIG.DNA_LENGTH * cellSize + padding * 2;
    const height = patrones.length * (cellSize * 2 + 30) + padding * 2;

    // Crear SVG
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${width}" height="${height}" fill="#1a1a1a"/>`;
    svg += `<text x="${width/2}" y="25" font-size="16" fill="white" text-anchor="middle" font-weight="bold">${label}</text>`;

    let yOffset = padding + 30;

    patrones.forEach((patron, pIdx) => {
        const urnas = patron.urnas;

        // Encontrar rango
        const maxVal = Math.max(...urnas.map(Math.abs));

        // Dibujar etiqueta
        svg += `<text x="10" y="${yOffset + cellSize}" font-size="12" fill="#aaa">${patron.label}</text>`;

        // Dibujar patrón Twin-64
        for (let i = 0; i < CONFIG.DNA_LENGTH; i++) {
            const x = padding + i * cellSize;
            const y = yOffset;

            const val = urnas[i];
            const normalized = maxVal > 0 ? Math.abs(val) / maxVal : 0;
            const color = val >= 0
                ? `rgb(${Math.round(normalized * 255)}, ${Math.round(normalized * 100)}, 50)`
                : `rgb(50, ${Math.round(normalized * 100)}, ${Math.round(normalized * 255)})`;

            svg += `<rect x="${x}" y="${y}" width="${cellSize-1}" height="${cellSize-1}" fill="${color}"/>`;

            // Marcar pares (bit + sombra)
            if (i % 2 === 0 && i < 63) {
                svg += `<line x1="${x}" y1="${y + cellSize}" x2="${x + cellSize * 2 - 1}" y2="${y + cellSize}" stroke="yellow" stroke-width="2" opacity="0.5"/>`;
            }
        }

        // Gráfica de valores
        const graphY = yOffset + cellSize + 5;
        const graphHeight = cellSize;

        svg += `<line x1="${padding}" y1="${graphY + graphHeight/2}" x2="${padding + CONFIG.DNA_LENGTH * cellSize}" y2="${graphY + graphHeight/2}" stroke="#444" stroke-width="1"/>`;

        for (let i = 0; i < CONFIG.DNA_LENGTH - 1; i++) {
            const x1 = padding + i * cellSize + cellSize/2;
            const x2 = padding + (i+1) * cellSize + cellSize/2;
            const y1 = graphY + graphHeight/2 - (urnas[i] / maxVal) * (graphHeight/2);
            const y2 = graphY + graphHeight/2 - (urnas[i+1] / maxVal) * (graphHeight/2);

            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0ff" stroke-width="2"/>`;
        }

        yOffset += cellSize * 2 + 30;
    });

    svg += `</svg>`;

    // Convertir SVG a PNG
    await sharp(Buffer.from(svg))
        .png()
        .toFile(outputPath);
}

/**
 * Analiza todas las imágenes reescaladas
 */
async function ejecutarAnalisisTwin64() {
    console.log('\n🧬 ANÁLISIS AVANZADO: Patrón Twin-64\n');

    const dirResized = path.join(CONFIG.OUTPUT_DIR, 'images_resized');
    const dirTwin = path.join(CONFIG.OUTPUT_DIR, 'twin64_patterns');

    if (!fs.existsSync(dirTwin)) fs.mkdirSync(dirTwin, { recursive: true });

    if (!fs.existsSync(dirResized)) {
        console.log('⚠️ Ejecuta primero test_analisis_visual_heatmaps.js');
        return;
    }

    const archivos = fs.readdirSync(dirResized).filter(f => f.endsWith('.png')).sort();

    for (const archivo of archivos) {
        const rutaImagen = path.join(dirResized, archivo);
        const label = archivo.replace('.png', '');
        const outputPath = path.join(dirTwin, `twin64_${label}.png`);

        console.log(`   🔍 Analizando ${label}...`);
        await visualizarPatronTwin64(rutaImagen, outputPath, label);
    }

    console.log('\n✅ Análisis Twin-64 completado');
    console.log(`📁 Visualizaciones en: ${dirTwin}`);
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    ejecutarAnalisisTwin64().catch(e => {
        console.error('❌ Error:', e);
        process.exit(1);
    });
}

export { visualizarPatronTwin64, extraerPatronTwin64 };
