import sharp from 'sharp';

// Eliminamos el import de base_datos_sellos.js para evitar el error circular
const CONFIG = {
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 }
};

// Asegúrate de que este archivo esté en la misma carpeta o usa la ruta completa
const MASTER_VIRGEN = 'Atardecer_MASTER_VIRGEN_V18.png';

const MALLA_TRON = [
    { name: "Sancho_0", x: 0, y: 0 }, { name: "Sancho_1", x: 0, y: 1 },
    { name: "Maestro_N", x: 2, y: 0 }, { name: "Everest", x: 3, y: 4 },
    { name: "Faro", x: 4, y: 4 },      { name: "W_Pilar_A", x: 4, y: 3 },
    { name: "W_Pilar_B", x: 6, y: 3 }, { name: "Nucleo_Base", x: 3, y: 3 },
    { name: "Vertebral", x: 3, y: 5 }, { name: "Esquina_NE", x: 7, y: 0 },
    { name: "Singularidad", x: 7, y: 7 }
];

async function capturarMoldeMaestro() {
    console.log(`\n[V19] 🧬 EXTRACCIÓN DE MOLDE MAESTRO (0° VIRGEN)`);
    console.log(`============================================================`);

    try {
        const { data: buf, info } = await sharp(MASTER_VIRGEN).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const reporteBalizas = [];

        for (const b of MALLA_TRON) {
            const r = analizarBloquesTwin(buf, info.width, info.height, b.x, b.y);

            if (r.encontrado) {
                console.log(`✅ BALIZA [${b.name.padEnd(12)}] | Z: ${r.votos.toString().padEnd(3)} | ADN: ${r.hash}`);
                reporteBalizas.push({ ...b, z: r.votos, hex: r.hash });
            } else {
                console.log(`⚠️ BALIZA [${b.name.padEnd(12)}] | SEÑAL DÉBIL`);
            }
        }

        console.log(`\n[V19] ✅ BARRIDO COMPLETADO.`);
        return reporteBalizas;

    } catch (e) {
        console.error(`[ERROR FASE 0] ¿Está el archivo ${MASTER_VIRGEN} en la carpeta? -> ${e.message}`);
    }
}

// --- FUNCIONES CORE V18 ---
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
            if (Math.abs(val1 - val2) > 1) {
                if (val1 > val2) bitVotes[bitIndex]++;
                else bitVotes[bitIndex]--;
            }
            bloquesLeidos++;
        }
    }

    const bitsRecuperados = bitVotes.map(v => v > 0 ? '1' : '0');
    for (let shift = 0; shift < 32; shift++) {
        const secuencia = [...bitsRecuperados.slice(shift), ...bitsRecuperados.slice(0, shift)];
        let bitsNormales = "";
        for (let i = 0; i < 32; i += 2) bitsNormales += secuencia[i];
        const hashHex = BigInt('0b' + bitsNormales).toString(16).padStart(4, '0');
        return { encontrado: true, hash: hashHex, votos: Math.max(...bitVotes.map(Math.abs)) };
    }
    return { encontrado: false };
}

function extraerBloqueCanal(buffer, width, startX, startY, channelOffset) {
    let block = [];
    for (let y = 0; y < 8; y++) {
        let row = [];
        for (let x = 0; x < 8; x++) {
            const idx = ((startY + y) * width + (startX + x)) * 4;
            row.push(buffer[idx + channelOffset] || 0);
        }
        block.push(row);
    }
    return block;
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

capturarMoldeMaestro();
