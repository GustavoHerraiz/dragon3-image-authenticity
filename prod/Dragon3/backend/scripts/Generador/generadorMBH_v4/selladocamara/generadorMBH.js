import sharp from 'sharp';
import fs from 'fs';
import { MotorEspacial } from './matematicas/MotorEspacial.js';

import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

const CONFIG = {
    // --- FÍSICA BÚNKER (INTACTA) ---
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 77,       // La fuerza de la marca
    DCT_COEFF_1: { u: 1, v: 1 },  // Frecuencia baja (Resistencia)
    DCT_COEFF_2: { u: 2, v: 2 },  // Frecuencia media (Invisible)
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",

    // --- LÓGICA 32 BITS (NUEVA) ---
    BITS_ID: 28,            // 268 Millones de IDs únicos
    BITS_CHK: 4,            // Checksum Mentalista
    MAX_ID: 268435455       // Límite matemático (2^28 - 1)
};

export class GeneradorMBH {
    constructor() {
        console.log("🐉 DRAGON3 V20 [MENTALIST CORE]: Faúndez Physics + Mentalist Checksum");
    }

   async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
    try {
        // 1. EXTRACCIÓN (La base del Sándwich)
        // Extraemos los metadatos reales del archivo de origen (EXIF, IPTC, XMP)
        const extractor = sharp(rutaEntrada);
        const metaOriginal = await extractor.metadata();

        // 2. PREPARACIÓN DE PÍXELES
        const { data: bufferBase, info } = await extractor
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // 3. CÁLCULO DEL ID (28 BITS + CHK)
        const idInt = metadatosCliente.id_numerico;
        const selloHex = idInt.toString(16).toUpperCase().padStart(7, '0');
        const chk = this.calcularChecksumMentalista(idInt);
        const payload32 = (idInt << 4) | chk;

        let buffer = bufferBase;

        // 4. INYECCIÓN FORENSE (Píxeles)
        // Paso A: Stardust (Canal Azul)
        buffer = this.inyectarStardust32(buffer, info.width, info.height, payload32);

        // Paso B: Limpieza Alfa
        for (let i = 3; i < buffer.length; i += 4) buffer[i] = buffer[i] & 0xFE;

        // Paso C: Geometría Vogel (Canal Alfa)
        buffer = this.inyectarGeometria(buffer, info.width, info.height, selloHex);

        // 5. REINYECCIÓN Y CIERRE (Sharp para Píxeles + ExifTool para Forense)
        try {
            // --- 💉 1. PERSISTENCIA INTEGRAL (JSON PURO) ---
const nuevaEntrada = {
    hash_suffix: selloHex,
    cliente: metadatosCliente.cliente || "Blade Corporation",
    obra: metadatosCliente.obra || "Obra Protegida"
};

try {
    const rutaBD = './base_datos_sellos.json'; // Cambiamos a .json
    let registros = [];

    if (fs.existsSync(rutaBD)) {
        const contenido = fs.readFileSync(rutaBD, 'utf8');
        registros = JSON.parse(contenido || "[]");
    }

    const existe = registros.some(s => s.hash_suffix === selloHex);
    if (!existe) {
        registros.push(nuevaEntrada);
        fs.writeFileSync(rutaBD, JSON.stringify(registros, null, 4), 'utf8');
        console.log(`[DB FÍSICA] Sello ${selloHex} persistido en JSON.`);
    }
} catch (err) {
    console.error("⚠️ Error en persistencia JSON:", err);
}

            // --- 🖼️ 2. ESCRITURA DE PÍXELES (SÓLO SHARP) ---
            // Creamos el PNG perfecto a partir de nuestro buffer de 4 canales.
            // Esto garantiza que la Espiral de Vogel (Canal Alfa) no se borre.
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            // --- 🕵️ 3. TRASPLANTE FORENSE DE METADATOS (EXIFTOOL) ---
            try {
                // Forzamos el mapeo explícito de los bloques EXIF y XMP de JPG a PNG
               // Eliminamos el -TagsFromFile "${rutaEntrada}" porque rutaEntrada no es un archivo, es un Buffer binario.
// Escribimos los metadatos directamente sobre el archivo de salida ya creado por Sharp.
const cmd = `exiftool -Model="Huawei P40 (Dragon3 System)" -ImageDescription="DRAGON3_ID:${selloHex}" -Copyright="${metadatosCliente.obra || 'Dragon3 Protected'}" -Artist="${metadatosCliente.cliente || 'Blade Corporation'}" -Software="Dragon3 V22 Mentalist Core" -overwrite_original "${rutaSalida}"`;

                const { stdout, stderr } = await execPromise(cmd);

                console.log(`[FORENSE] Resultado ExifTool: ${stdout.trim()}`);
                if (stderr) console.log(`[FORENSE] Advertencias ExifTool: ${stderr.trim()}`);

            } catch (exifErr) {
                console.error("⚠️ Error crítico en ExifTool:", exifErr);
            }

            return { ok: true, id: selloHex };

        } catch (errorGeneracion) {
            console.error("Error en fase final de generación:", errorGeneracion);
            return { ok: false, error: errorGeneracion.message };
        }

    } catch (errorGeneral) {
        console.error("Error crítico en sellarImagen:", errorGeneral);
        return { ok: false, error: errorGeneral.message };
    }
}

    // =========================================================================
    // 🧬 MOTOR FÍSICO: STARDUST TWIN-64 (DOBLE HÉLICE)
    // =========================================================================
    inyectarStardust32(buffer, width, height, payload32) {
    // 1. GENERAMOS LA DOBLE HÉLICE (32 Bits -> 64 Pasos)
    // Por cada bit del ID, creamos un par: [BIT, !BIT]
    const secuenciaDNA = [];
    for (let i = 31; i >= 0; i--) {
        const bit = (payload32 >>> i) & 1;
        secuenciaDNA.push(bit);       // El Bit Real
        secuenciaDNA.push(bit ^ 1);   // El Gemelo Invertido (Sombra)
    }

    const dnaLength = 64;
    const blockSize = CONFIG.STARDUST_BLOCK_SIZE;

    const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
    const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
    const fuerza = CONFIG.STARDUST_INTENSITY;

    // --- BUCLE VERTICAL ---
    for (let y = 0; y <= height - blockSize; y += blockSize) {

        // 🧬 REDUNDANCIA FRACTAL: Reiniciamos el índice en cada fila.
        // Esto blinda el sistema contra recortes verticales (CROP).
        let stepIndex = 0;

        // --- BUCLE HORIZONTAL ---
        for (let x = 0; x <= width - blockSize; x += blockSize) {

            let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2);
            let dctBlock = this.dct8x8(blueBlock);

            // Leemos el paso correspondiente de la hélice (siempre alineado al inicio de fila)
            const bitToInject = secuenciaDNA[stepIndex % dnaLength];
            stepIndex++;

            // FÍSICA DIFERENCIAL (Detección por contraste de energía)
            const valActual1 = dctBlock[v1][u1];
            const valActual2 = dctBlock[v2][u2];
            const promedio = (valActual1 + valActual2) / 2;

            // Anti-Clipping: Ajuste de fuerza dinámico según luminancia (DC)
            let aplicarFuerza = fuerza;
            if (Math.abs(dctBlock) > 1000) aplicarFuerza = fuerza * 0.8;

            if (bitToInject === 1) {
                dctBlock[v1][u1] = promedio + (aplicarFuerza / 2);
                dctBlock[v2][u2] = promedio - (aplicarFuerza / 2);
            } else {
                dctBlock[v1][u1] = promedio - (aplicarFuerza / 2);
                dctBlock[v2][u2] = promedio + (aplicarFuerza / 2);
            }

            let newBlueBlock = this.idct8x8(dctBlock);
            this.escribirBloqueCanal(buffer, width, x, y, 2, newBlueBlock);
        }
    }
    return buffer;
}

    // =========================================================================
// 🛰️ MOTOR GEOMÉTRICO (VERSIÓN CORREGIDA)
// =========================================================================
inyectarGeometria(buffer, width, height, selloHex) { // <--- Cambiado 'clave' por 'selloHex'
    // Ahora pasamos 'selloHex' al MotorEspacial para que el centro sea único
    const centro = MotorEspacial.calcularCentroUnico(width, height, selloHex, CONFIG.PRIVATE_KEY);
    const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

    let marcados = 0;
    puntos.forEach(p => {
        if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
            const idx = (p.y * width + p.x) * 4;
            buffer[idx + 3] = (buffer[idx + 3] | 1); // Alfa LSB
            buffer[idx + 2] = (buffer[idx + 2] | 1); // Azul LSB
            marcados++;
        }
    });
    return buffer;
}

    // =========================================================================
    // 🧮 UTILIDADES MATEMÁTICAS (COPIA LITERAL)
    // =========================================================================
    calcularChecksumMentalista(id28) {
    const L = id28 & 0x3FFF;            // 14 bits bajos
    const H = (id28 >> 14) & 0x3FFF;    // 14 bits altos
    const X = L ^ H;                    // Mezcla XOR
    const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
    return V & 0x0F;                    // Retornamos 4 bits finales
}
    extraerBloqueCanal(buffer, width, x, y, channel) {
        const block = [];
        for (let i = 0; i < 8; i++) {
            const row = [];
            for (let j = 0; j < 8; j++) {
                const idx = ((y + i) * width + (x + j)) * 4 + channel;
                row.push(buffer[idx] - 128);
            }
            block.push(row);
        }
        return block;
    }

    escribirBloqueCanal(buffer, width, x, y, channel, block) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const idx = ((y + i) * width + (x + j)) * 4 + channel;
                let val = block[i][j] + 128;
                if (val < 0) val = 0; else if (val > 255) val = 255;
                buffer[idx] = Math.round(val);
            }
        }
    }

    dct8x8(block) {
        const n = 8;
        let dct = Array(n).fill(0).map(() => Array(n).fill(0));
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

    idct8x8(dct) {
        const n = 8;
        let block = Array(n).fill(0).map(() => Array(n).fill(0));
        const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                let sum = 0;
                for (let u = 0; u < n; u++) {
                    for (let v = 0; v < n; v++) {
                        sum += C(u) * C(v) * dct[v][u] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                    }
                }
                block[y][x] = 0.25 * sum;
            }
        }
        return block;
    }
}
