import sharp from 'sharp';

async function radar_de_fase_real() {
    const sizeOri = 1000;
    const sizeRes = 600;
    const targetID = 0x000D760;

    // 1. LIENZO Y CHECKSUM REAL [cite: 2026-01-02]
    const bufferOriginal = Buffer.alloc(sizeOri * sizeOri * 4, 128);
    for (let i = 3; i < bufferOriginal.length; i += 4) bufferOriginal[i] = 255;

    const low = targetID & 0x3FFF;
    const high = (targetID >> 14) & 0x3FFF;
    let mix = (low ^ high) * 19;
    const checksum = (mix ^ (mix >> 6)) & 0x0F;
    const payload = (targetID << 4) | checksum;

    // 2. INYECCIÓN TWIN-64 REAL (Tu sello de verdad)
    const bloquesAncho = sizeOri / 8;
    for (let by = 0; by < (sizeOri / 8); by++) {
        for (let bx = 0; bx < bloquesAncho; bx++) {
            const idx = (by * bloquesAncho + bx) % 64;
            const bit = (payload >>> (31 - Math.floor(idx / 2))) & 1;
            const valor = (idx % 2 === 0) ? (bit ? 50 : -50) : (bit ? -50 : 50);

            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    bufferOriginal[((by * 8 + i) * sizeOri + (bx * 8 + j)) * 4 + 2] = 128 + valor;
                }
            }
        }
    }

    // 3. MUTILACIÓN (Resize Lanczos3)
    const { data: dataRes } = await sharp(bufferOriginal, { raw: { width: sizeOri, height: sizeOri, channels: 4 } })
        .resize(sizeRes, sizeRes, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });

    console.log("--- RADAR DE FASE (ADN REAL) ---");

    // 4. DETECCIÓN SUBPÍXEL DE ARISTAS [cite: 2026-01-02]
    let cruces = [];
    // Escaneamos la fila Y=4 (mitad del primer bloque para evitar bordes)
    const offsetFila = 4 * sizeRes;

    for (let x = 0; x < sizeRes - 1; x++) {
        const val1 = dataRes[(offsetFila + x) * 4 + 2];
        const val2 = dataRes[(offsetFila + x + 1) * 4 + 2];

        // Detectar cambio de polaridad cruzando el plano 128
        if ((val1 >= 128 && val2 < 128) || (val1 <= 128 && val2 > 128)) {
            const fraccion = (128 - val1) / (val2 - val1);
            cruces.push(x + fraccion);
        }
    }

    // 5. CÁLCULO DE LA MESETA BASE
    let distancias = [];
    for (let i = 1; i < cruces.length; i++) {
        distancias.push(cruces[i] - cruces[i-1]);
    }

    // Ordenar para encontrar la distancia base (1 bloque)
    distancias.sort((a, b) => a - b);

    // Filtramos solo las distancias que corresponden a 1 solo bloque (descartamos los saltos largos donde el bit no cambió de polaridad)
    const distanciaBase = distancias[0];
    const distanciasValidas = distancias.filter(d => d < distanciaBase * 1.5);

    const mediaDistancia = distanciasValidas.reduce((a, b) => a + b, 0) / distanciasValidas.length;
    const factorEscala = mediaDistancia / 8;

    console.log(`\n--- TOPOGRAFÍA DEL SELLO MBH ---`);
    console.log(`1. Distancias detectadas entre costuras: ${distancias.slice(0, 5).map(n => n.toFixed(2)).join(' | ')}...`);
    console.log(`2. Longitud de onda base (Filtro anti-saltos): ${mediaDistancia.toFixed(6)} px`);
    console.log(`3. Regla de Compresión Inversa: ${mediaDistancia.toFixed(6)} / 8 = ${factorEscala.toFixed(6)}`);
    console.log(`4. Escala Matemática del Resize: ${sizeRes / sizeOri}`);
}

radar_de_fase_real();
