import sharp from 'sharp';
import fs from 'fs';

// ============================================================================
// 🔬 AUTOPSIA FORENSE - DIAGNÓSTICO PROFUNDO Q20
// ============================================================================

const CONFIG = {
    RUTA_MASTER: './Atardecer_DRAGON_MASTER_V19.png',
    RUTA_TEST: './temp_test_q20_autopsia.jpg', // Generaremos una nueva para estar seguros
    CALIDAD_JPEG: 20,
    ADN_HEX: "50B3",
    ADN_BIN: "0101000010110011", // 16 bits
    PASO_SCAN: 8, // Escaneamos cada 8 píxeles (bloque a bloque)
    CANAL: 2 // Canal Azul
};

async function iniciarAutopsia() {
    console.log(`\n=====================================================================`);
    console.log(`💀 INICIANDO AUTOPSIA FORENSE - DETECTIVE CIEGO`);
    console.log(`🎯 Objetivo: ${CONFIG.ADN_HEX} (${CONFIG.ADN_BIN})`);
    console.log(`📉 Calidad JPEG: ${CONFIG.CALIDAD_JPEG}%`);
    console.log(`=====================================================================\n`);

    // 1. GENERACIÓN DE LA MUESTRA
    if (!fs.existsSync(CONFIG.RUTA_MASTER)) {
        console.error("❌ ERROR CRÍTICO: No encuentro la imagen Master.");
        return;
    }

    console.log("🔨 Generando muestra fresca Q20...");
    await sharp(CONFIG.RUTA_MASTER)
        .jpeg({ quality: CONFIG.CALIDAD_JPEG })
        .toFile(CONFIG.RUTA_TEST);

    // 2. CARGA DE DATOS
    const inputRaw = await sharp(CONFIG.RUTA_TEST).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = inputRaw.info;
    const buffer = inputRaw.data;

    console.log(`📏 Dimensiones: ${width}x${height}`);
    console.log(`🔍 Iniciando Escaneo Profundo (Paso ${CONFIG.PASO_SCAN}px)... esto puede tardar unos segundos.`);

    // 3. VARIABLES DE TELEMETRÍA
    let stats = {
        totalIntentos: 0,
        histogramaErrores: new Array(17).fill(0), // De 0 a 16 errores
        energiaPorErrores: new Array(17).fill(0),
        fallosPorBit: new Array(16).fill(0), // Qué bit falla más (0-15)
        coordenadasPerfectas: [] // Guardaremos las primeras 5
    };

    // 4. BARRIDO COMPLETO
    // Usamos la lógica Secuencial (V85.16+) que sabemos que arregló la geometría
    const bloquesPorFila = Math.floor((width - 8) / 8) + 1;

    for (let y = 0; y < height - 8; y += CONFIG.PASO_SCAN) {
        for (let x = 0; x < width - 260; x += CONFIG.PASO_SCAN) { // -260 para tener espacio para los 16 bits

            stats.totalIntentos++;

            // Leemos la secuencia de 16 bits que EMPIEZA en (x,y)
            const lectura = leerSecuencia(buffer, width, x, y, CONFIG.CANAL, bloquesPorFila);

            if (!lectura.valido) continue;

            // Análisis de Errores
            const errores = calcularErrores(lectura.adn, CONFIG.ADN_BIN);
            const distanciaHamming = errores.count;

            // Registrar datos
            stats.histogramaErrores[distanciaHamming]++;
            stats.energiaPorErrores[distanciaHamming] += lectura.energiaMedia;

            // Registrar qué bits fallaron
            errores.indices.forEach(idx => {
                stats.fallosPorBit[idx]++;
            });

            // Guardar coordenadas de héroes
            if (distanciaHamming === 0 && stats.coordenadasPerfectas.length < 5) {
                stats.coordenadasPerfectas.push({ x, y, energia: lectura.energiaMedia });
            }
        }
    }

    // 5. INFORME DE RESULTADOS
    imprimirInforme(stats, CONFIG.ADN_BIN.length);
}

// ============================================================================
// 🧠 LÓGICA DE LECTURA (MOTOR SECUENCIAL V85.24)
// ============================================================================

function leerSecuencia(buffer, width, x, y, canal, bloquesPorFila) {
    let adnLeido = "";
    let energiaTotal = 0;

    // Cálculo de fase inicial para el primer bloque
    let ix = Math.floor(x / 8) * 8;
    let iy = Math.floor(y / 8) * 8;

    // Necesitamos determinar el bitOffset GLOBAL para alinear la lectura
    const bx = ix / 8;
    const by = iy / 8;
    const indiceGlobal = (by * bloquesPorFila) + bx;
    const fase = indiceGlobal % 32;
    // Ajuste de fase Twin-Key
    if (fase % 2 !== 0) ix += 8;

    const bitOffset = Math.floor(((indiceGlobal + (fase % 2 !== 0 ? 1 : 0)) % 32) / 2);

    // Array para guardar las fuerzas crudas antes de rotar
    let fuerzas = [];

    for (let i = 0; i < 16; i++) {
        // Leemos 16 pares consecutivos
        // El targetX avanza 16px (2 bloques) por cada bit
        const targetX = ix + (i * 16);

        const valA = obtenerDiffBloque(buffer, width, targetX, iy, canal);
        const valB = obtenerDiffBloque(buffer, width, targetX + 8, iy, canal);

        let diff = valA - valB;
        fuerzas.push(diff);
        energiaTotal += Math.abs(diff);
    }

    // Rotamos el array para alinearlo con el ADN real
    // (Simulamos lo que hace el generador)
    const fuerzasAlineadas = rotarArrayDerecha(fuerzas, bitOffset);

    // Convertimos fuerza a bits
    for (let f of fuerzasAlineadas) {
        adnLeido += (f > 0) ? "1" : "0";
    }

    return {
        valido: true,
        adn: adnLeido,
        energiaMedia: energiaTotal / 16
    };
}

// ============================================================================
// 📊 UTILIDADES DE ANÁLISIS
// ============================================================================

function imprimirInforme(stats, longitudADN) {
    console.log(`\n📊 REPORTE DE TELEMETRÍA:`);
    console.log(`---------------------------------------------------------------------`);
    console.log(`🧱 Secuencias Analizadas: ${stats.totalIntentos.toLocaleString()}`);

    // Cálculo de supervivientes
    const perfectos = stats.histogramaErrores[0];
    const buenos = stats.histogramaErrores[1] + stats.histogramaErrores[2]; // Hasta 2 errores
    const recuperables = stats.histogramaErrores[3] + stats.histogramaErrores[4]; // Hasta 4 errores
    const ruido = stats.totalIntentos - perfectos - buenos - recuperables;

    console.log(`\n💎 CLASIFICACIÓN DE INTEGRIDAD:`);
    console.log(`   ✅ PERFECTOS (0 err):    ${perfectos.toLocaleString().padEnd(8)} (${pct(perfectos, stats.totalIntentos)}%)`);
    console.log(`   ⚠️ BUENOS (1-2 err):     ${buenos.toLocaleString().padEnd(8)} (${pct(buenos, stats.totalIntentos)}%)`);
    console.log(`   🤕 DAÑADOS (3-4 err):    ${recuperables.toLocaleString().padEnd(8)} (${pct(recuperables, stats.totalIntentos)}%)`);
    console.log(`   💀 RUIDO (>4 err):       ${ruido.toLocaleString().padEnd(8)} (${pct(ruido, stats.totalIntentos)}%)`);

    console.log(`\n🔋 ANÁLISIS DE ENERGÍA (Fuerza de la señal):`);
    const energiaPerf = perfectos > 0 ? stats.energiaPorErrores[0] / perfectos : 0;
    const energiaRuido = ruido > 0 ? stats.energiaPorErrores[8] / stats.histogramaErrores[8] : 0; // Muestra de 8 errores (aleatorio puro)

    console.log(`   ⚡ Energía en Perfectos: ${energiaPerf.toFixed(2)}`);
    console.log(`   ⚡ Energía en Ruido (8e): ${energiaRuido.toFixed(2)}`);
    console.log(`   ⚖️  Ratio Señal/Ruido:    ${(energiaPerf/energiaRuido).toFixed(2)}x`);

    console.log(`\n📍 EJEMPLOS DE SUPERVIVENCIA (Coordenadas X,Y):`);
    if (stats.coordenadasPerfectas.length > 0) {
        stats.coordenadasPerfectas.forEach((c, i) => {
            console.log(`   ${i+1}. [${c.x}, ${c.y}] - Energía: ${c.energia.toFixed(1)}`);
        });
    } else {
        console.log(`   ❌ Ninguna secuencia perfecta encontrada.`);
    }

    console.log(`\n🧬 DIAGNÓSTICO POR BIT (¿Qué parte del ADN falla más?):`);
    let lineaBits = "   ";
    for(let i=0; i<16; i++) {
        let falloPct = Math.round((stats.fallosPorBit[i] / stats.totalIntentos) * 100);
        let barra = falloPct > 50 ? "🔴" : (falloPct > 20 ? "⚠️" : "✅");
        console.log(`   Bit ${i.toString().padStart(2)}: ${barra} ${falloPct}% Fallo`);
    }

    console.log(`---------------------------------------------------------------------`);

    if (perfectos === 0 && buenos === 0) {
        console.log(`❌ CONCLUSIÓN FINAL: MUERTE CEREBRAL.`);
        console.log(`   No hay rastro estadístico de la señal en Q20. La compresión ha borrado la información.`);
    } else {
        console.log(`✅ CONCLUSIÓN FINAL: HAY ESPERANZA.`);
        console.log(`   La señal existe en el ${(pct(perfectos+buenos, stats.totalIntentos))}% de la imagen.`);
        console.log(`   Estrategia recomendada: Filtrar solo los nodos con perfil de energía similar a ${energiaPerf.toFixed(1)}.`);
    }
}

function pct(val, total) {
    return ((val / total) * 100).toFixed(2);
}

function calcularErrores(adn1, adn2) {
    let count = 0;
    let indices = [];
    for(let i=0; i<adn1.length; i++) {
        if(adn1[i] !== adn2[i]) {
            count++;
            indices.push(i);
        }
    }
    return { count, indices };
}

function rotarArrayDerecha(arr, amount) {
    if (amount === 0) return arr;
    const len = arr.length;
    const split = len - amount;
    return arr.slice(split).concat(arr.slice(0, split));
}

function obtenerDiffBloque(buffer, width, startX, startY, canal) {
    let subBlock = [];
    // Comprobación de límites básica
    if (startY + 8 > buffer.length / (width * 4) || startX + 8 > width) return 0;

    for (let r = 0; r < 8; r++) {
        let sRow = [];
        for (let c = 0; c < 8; c++) {
            const sIdx = ((startY + r) * width + (startX + c)) * 4 + canal;
            sRow.push(buffer[sIdx]);
        }
        subBlock.push(sRow);
    }
    const subDct = dct8x8(subBlock);
    // Usamos Frecuencia (1,1) vs (2,2) - La firma del Dragón
    return subDct[1][1] - subDct[2][2];
}

function dct8x8(block) {
    const n = 8; let dct = Array(n).fill(0).map(() => Array(n).fill(0));
    const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
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

iniciarAutopsia();
