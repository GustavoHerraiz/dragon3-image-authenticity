import sharp from 'sharp';
import fs from 'fs';

// 🛠️ AJUSTES
const RUTA_MASTER = './RESULTADOS_FAUNDEZ_V23_FINAL/Jerome_Master_V23_Fractal.png';
const HASH_ESPERADO_HEX = "50B3";
const BINARIO_ESPERADO = parseInt(HASH_ESPERADO_HEX, 16).toString(2).padStart(16, '0');

async function radiografiaTotal() {
    console.log("==========================================================================");
    console.log("🩻 RADIOGRAFÍA TOTAL (VERTICAL + HORIZONTAL)");
    console.log(`📂 Imagen: ${RUTA_MASTER}`);
    console.log(`🎯 Buscando: ${BINARIO_ESPERADO} (${HASH_ESPERADO_HEX})`);
    console.log("==========================================================================\n");

    if (!fs.existsSync(RUTA_MASTER)) { console.error("❌ Falta imagen."); return; }

    const input = await sharp(RUTA_MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = input.info;
    const canal = 2; // Azul

    // ========================================================================
    // 1. ESCANEO VERTICAL (Buscando las líneas maestras)
    // ========================================================================
    console.log("⬇️  1. ANÁLISIS VERTICAL (Primeros 600px de alto en X=0)");
    console.log("    (Buscamos franjas horizontales de señal)");
    console.log("--------------------------------------------------------------------------");
    console.log("   Y   |      LECTURA BINARIA      |   ESTADO   | SEÑAL");
    console.log("-------|---------------------------|------------|----------");

    const limiteY = Math.min(height, 600);
    let rachaBuena = 0;
    let rachaMala = 0;

    for (let y = 0; y < limiteY; y++) {
        const resultado = leer16Bits(input.data, width, height, 0, y, canal); // Leemos en X=0

        let estado = "❌ RUIDO   ";
        let icono = " ";

        if (resultado.binario === BINARIO_ESPERADO) {
            estado = "✅ PERFECTO";
            icono = "█";
        } else if (esParecido(resultado.binario, BINARIO_ESPERADO)) {
            estado = "⚠️ DÉBIL   ";
            icono = "▒";
        }

        // Agrupación de logs para no saturar
        if (estado.includes("PERFECTO") || estado.includes("DÉBIL")) {
            if (rachaMala > 0) {
                console.log(`  ...  | (Basura durante ${rachaMala} líneas)  |            |`);
                rachaMala = 0;
            }
            console.log(`  ${y.toString().padStart(3)}  | [${resultado.binario}] | ${estado} | ${icono.repeat(10)}`);
            rachaBuena++;
        } else {
            rachaMala++;
            rachaBuena = 0;
        }
    }
    if (rachaMala > 0) console.log(`  ...  | (Basura hasta el final)   |            |`);
    console.log("--------------------------------------------------------------------------\n");


    // ========================================================================
    // 2. ESCANEO HORIZONTAL (Buscando continuidad lateral)
    // ========================================================================
    console.log("➡️  2. ANÁLISIS HORIZONTAL (Toda la anchura en Y=0)");
    console.log("    (Buscamos si el patrón es continuo o tiene huecos)");
    console.log("--------------------------------------------------------------------------");
    console.log("   X   |      LECTURA BINARIA      |   ESTADO   | CONTINUIDAD");
    console.log("-------|---------------------------|------------|-------------");

    // Vamos a saltar de 16 en 16 píxeles (tamaño de un par Bit+Sombra)
    // Se supone que el patrón se repite.
    // Si el generador escribe: [HASH][HASH][HASH], siempre deberíamos leer el mismo binario.

    rachaMala = 0;
    rachaBuena = 0;

    // Leemos hasta el final de la imagen
    const totalBloquesX = Math.floor(width / 16);

    for (let i = 0; i < totalBloquesX; i++) {
        const x = i * 16;

        // En Y=0 (que sabemos que es buena)
        // OJO: Al avanzar 16px, avanzamos UN BIT en la secuencia del generador.
        // Pero aquí estamos leyendo "16 bits de golpe" desde esa posición.
        // Si el generador es continuo, al movernos 16px a la derecha,
        // deberíamos leer el hash ROTADO 1 posición a la izquierda.

        // PERO: Si el generador repite el bloque de 256px...
        // Vamos a verificar si encontramos el HASH EXACTO cada 256px.

        // Para simplificar la visualización: Leemos 16 bits.
        // Si sale el hash exacto, es un inicio de bloque.
        // Si sale ruido, es un hueco.

        const resultado = leer16Bits(input.data, width, height, x, 0, canal);

        let estado = "❌ RUIDO   ";
        let barra = " ";

        // Chequeo exacto
        if (resultado.binario === BINARIO_ESPERADO) {
            estado = "✅ INICIO  "; // Inicio de patrón
            barra = "██";
        }
        // Chequeo de señal fuerte (aunque no sea el hash exacto por rotación)
        else if (resultado.energia > 1000) {
            estado = "⚡ SEÑAL   "; // Hay datos fuertes (probablemente el hash rotado)
            barra = "==";
        } else {
            estado = "❌ HUECO   "; // Silencio
            barra = "  ";
        }

        // Logica de visualización compacta
        // Solo mostramos cambios de estado o hitos importantes (cada 256px = 16 bloques)
        const esHito = (x % 256 === 0);

        if (esHito || estado.includes("HUECO")) {
             console.log(`  ${x.toString().padStart(4)} | [${resultado.binario}] | ${estado} | ${barra.repeat(5)}`);
        } else if (i < 5) {
             // Mostramos los primeros pocos para ver qué pasa
             console.log(`  ${x.toString().padStart(4)} | [${resultado.binario}] | ${estado} | ${barra.repeat(5)}`);
        } else if (i === 5) {
             console.log(`  ...  | (Señal continua...)       |            |`);
        }
    }
    console.log("--------------------------------------------------------------------------");
}

// --- FUNCIONES AUXILIARES ---

function leer16Bits(buffer, width, height, startX, startY, canal) {
    let binario = "";
    let energia = 0;

    for (let i = 0; i < 16; i++) {
        const xA = startX + (i * 16);
        const xB = xA + 8;

        const tA = getTension(buffer, width, height, xA, startY, canal);
        const tB = getTension(buffer, width, height, xB, startY, canal);
        const diff = tA - tB;

        energia += Math.abs(diff);

        let bit = ".";
        if (Math.abs(diff) > 2) {
            bit = (diff > 0) ? "1" : "0";
        }
        binario += bit;
    }
    return { binario, energia };
}

function esParecido(leido, esperado) {
    return leido.replace(/\./g, '0') === esperado || leido.replace(/\./g, '1') === esperado;
}

function getTension(buffer, width, height, x, y, canal) {
    // Protección de bordes
    if (x + 8 >= width || y + 8 >= height) return 0;

    let block = [];
    for (let bj = 0; bj < 8; bj++) {
        let row = [];
        for (let bi = 0; bi < 8; bi++) {
            const idx = ((y + bj) * width + (x + bi)) * 4 + canal;
            row.push(buffer[idx]);
        }
        block.push(row);
    }
    let sum11 = 0, sum22 = 0;
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            const val = block[y][x];
            sum11 += val * Math.cos(((2*x+1)*1*Math.PI)/16) * Math.cos(((2*y+1)*1*Math.PI)/16);
            sum22 += val * Math.cos(((2*x+1)*2*Math.PI)/16) * Math.cos(((2*y+1)*2*Math.PI)/16);
        }
    }
    return sum11 - sum22;
}

radiografiaTotal();
