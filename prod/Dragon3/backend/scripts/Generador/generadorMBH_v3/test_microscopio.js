import sharp from 'sharp';

async function microscopio_avanzado() {
    const sizeOri = 1000;
    const sizeRes = 600;

    // 1. Lienzo neutro
    const bufferOriginal = Buffer.alloc(sizeOri * sizeOri * 4, 128);
    for (let i = 3; i < bufferOriginal.length; i += 4) bufferOriginal[i] = 255;

    // 2. Inyectar onda cuadrada (Aristas Reales cada 8px) en toda la fila 0
    for (let x = 0; x < sizeOri; x++) {
        const bloqueX = Math.floor(x / 8);
        bufferOriginal[x * 4 + 2] = (bloqueX % 2 === 0) ? 178 : 78; // Alternamos polaridad
    }

    // 3. Resize con Lanczos3
    const { data: dataRes } = await sharp(bufferOriginal, { raw: { width: sizeOri, height: sizeOri, channels: 4 } })
        .resize(sizeRes, sizeRes, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });

    console.log("--- ESCÁNER DE ONDAS: GEOMETRÍA DE LA INFORMACIÓN ---");

    let cruces = [];

    // 4. Buscar costuras por el plano neutro (128) con precisión subpíxel [cite: 2026-01-02]
    for (let x = 0; x < sizeRes - 1; x++) {
        const val1 = dataRes[x * 4 + 2];
        const val2 = dataRes[(x + 1) * 4 + 2];

        // Detectar el cambio de polaridad (atravesando 128)
        if ((val1 >= 128 && val2 < 128) || (val1 <= 128 && val2 > 128)) {
            // Cálculo matemático exacto de la intersección geométrica
            const fraccion = (128 - val1) / (val2 - val1);
            const cruceExacto = x + fraccion;
            cruces.push(cruceExacto);
        }
    }

    // 5. Medir la longitud de onda de la interpolación (El ritmo del rescate)
    let distancias = [];
    for (let i = 1; i < cruces.length; i++) {
        distancias.push(cruces[i] - cruces[i-1]);
    }

    const mediaDistancia = distancias.reduce((a, b) => a + b, 0) / distancias.length;
    const factorEscala = mediaDistancia / 8;

    console.log(`\n--- REPORTE 'LOCURAS' (DATOS SUBPÍXEL) ---`);
    console.log(`1. Primeras costuras detectadas en píxeles: ${cruces.slice(0, 5).map(n => n.toFixed(3)).join(' | ')}...`);
    console.log(`2. Longitud de onda media (Distancia real entre bloques): ${mediaDistancia.toFixed(6)} px`);
    console.log(`3. Regla de Compresión Calculada: ${mediaDistancia.toFixed(6)} / 8 = ${factorEscala.toFixed(6)}`);
    console.log(`4. Escala Real del Resize: ${sizeRes / sizeOri}`);
}

microscopio_avanzado();
