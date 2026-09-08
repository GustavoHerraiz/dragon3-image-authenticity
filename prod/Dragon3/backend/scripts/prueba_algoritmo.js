import sharp from 'sharp';
import fs from 'fs';

async function probarLogica() {
    // 1. Cargar imagen (Asegúrate de que es la que tiene los marcadores RGB creados por el generador nuevo)
    const rutaImagen = './imagen_sellada.jpg';

    if (!fs.existsSync(rutaImagen)) {
        console.log("❌ No encuentro la imagen.");
        return;
    }

    console.log(`🔬 Probando lógica de detección sobre: ${rutaImagen}`);

    const { data, info } = await sharp(rutaImagen)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // --- PASO 1: BÚSQUEDA DE MARCADORES (Copiado de verificar_sello.js) ---
    console.log("1️⃣ Buscando patrones RGB (Diferencias 2, 4, 6)...");
    const marcadores = buscarMarcadores(data, width, height, channels);
    console.log(`   👉 Marcadores brutos encontrados: ${marcadores.length}`);

    if (marcadores.length < 12) {
        console.log("   ❌ FALLO: Muy pocos marcadores. La lógica no ve nada.");
        return;
    }

    // --- PASO 2: TRIANGULACIÓN (Copiado de verificar_sello.js) ---
    console.log("2️⃣ Agrupando puntos centrales...");
    const puntos = encontrarPuntosCentrales(marcadores);
    console.log(`   👉 Centros geométricos detectados: ${puntos.length}`);

    puntos.forEach((p, i) => console.log(`      Punto ${i+1}: x=${p.x}, y=${p.y} (Basado en ${p.marcadores} marcadores)`));

    if (puntos.length < 3) {
        console.log("   ❌ FALLO: No se pueden formar 3 puntos coherentes.");
        return;
    }

    // --- PASO 3: VALIDACIÓN GEOMÉTRICA (Copiado de verificar_sello.js) ---
    console.log("3️⃣ Verificando Geometría Áurea...");
    const esValido = verificarGeometria(puntos);

    if (esValido) {
        console.log("\n✅ ÉXITO: La lógica aprueba esta imagen. El método funciona.");
        console.log("   Conclusión: Este algoritmo es viable para producción.");
    } else {
        console.log("\n❌ RECHAZADO: Se encontraron puntos, pero no cumplen la geometría.");
    }
}

// ==========================================
// FUNCIONES EXTRAÍDAS DE TU ARCHIVO ORIGINAL
// ==========================================

function buscarMarcadores(data, width, height, channels) {
    const marcadores = [];
    // Stride de 4 píxeles para velocidad, según tu archivo
    for (let y = 50; y < height - 50; y += 4) {
        for (let x = 50; x < width - 50; x += 4) {
            const idx = (y * width + x) * channels;
            if (idx + 2 >= data.length) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const difRG = Math.abs(r - g);
            const difGB = Math.abs(g - b);
            const difBR = Math.abs(b - r);

            // La lógica estricta de tu archivo: diferencias exactas de 2, 4 o 6
            if ((difRG === 2 || difRG === 4 || difRG === 6) &&
                (difGB === 2 || difGB === 4 || difGB === 6) &&
                (difBR === 2 || difBR === 4 || difBR === 6)) {

                // Verificación de vecindad (filtro de ruido)
                let confirmaciones = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nidx = ((y + dy) * width + (x + dx)) * channels;
                        if (nidx + 2 < data.length) {
                            const nr = data[nidx]; const ng = data[nidx + 1]; const nb = data[nidx + 2];
                            if (Math.abs(nr-ng) === difRG && Math.abs(ng-nb) === difGB) confirmaciones++;
                        }
                    }
                }
                if (confirmaciones >= 5) {
                    marcadores.push({ x, y });
                }
            }
        }
    }
    return marcadores;
}

function encontrarPuntosCentrales(marcadores) {
    const grupos = {};
    // Clustering simple por proximidad (25px)
    marcadores.forEach(marcador => {
        const grupoX = Math.round(marcador.x / 25) * 25;
        const grupoY = Math.round(marcador.y / 25) * 25;
        const clave = `${grupoX},${grupoY}`;
        if (!grupos[clave]) grupos[clave] = [];
        grupos[clave].push(marcador);
    });

    const puntos = [];
    Object.values(grupos).forEach(grupo => {
        if (grupo.length >= 3) {
            const centroX = Math.round(grupo.reduce((sum, m) => sum + m.x, 0) / grupo.length);
            const centroY = Math.round(grupo.reduce((sum, m) => sum + m.y, 0) / grupo.length);
            puntos.push({ x: centroX, y: centroY, marcadores: grupo.length });
        }
    });
    // Ordenar por "calidad" (número de marcadores)
    return puntos.sort((a, b) => b.marcadores - a.marcadores).slice(0, 10);
}

function verificarGeometria(puntos) {
    if (puntos.length < 3) return false;
    // Ordenar verticalmente
    const sorted = [...puntos].sort((a, b) => a.y - b.y);

    // 1. Verificar alineación vertical (Desviación X < 10px)
    const xAvg = sorted.reduce((sum, p) => sum + p.x, 0) / sorted.length;
    const desviacionX = Math.max(...sorted.map(p => Math.abs(p.x - xAvg)));
    console.log(`   ⚖️ Desviación vertical: ${desviacionX.toFixed(2)}px (Máx permitido: 10px)`);

    if (desviacionX > 10) return false;

    // 2. Verificar Ratio Áureo (PHI)
    const d1 = sorted[1].y - sorted[0].y;
    const d2 = sorted[2].y - sorted[1].y;
    const ratio = d1 > 0 ? d2 / d1 : 0;
    const PHI = 1.618033988749895;

    console.log(`   📐 Ratio detectado: ${ratio.toFixed(4)} (Objetivo: 1.618)`);

    return Math.abs(ratio - PHI) < 0.15; // Tolerancia 15%
}

probarLogica();
