// paralelizacion/generadorMBH.js
// 🚀 GENERADOR CON PARALELIZACIÓN - Versión de pruebas
// Copia del generador original con inyección Stardust paralelizada

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { MotorEspacial } from './MotorEspacial.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================================
// 1. IMPORTAR UTILIDADES DE PARALELIZACIÓN
// ================================================================
import { 
    generarListaBloques, 
    dividirEnChunks, 
    getNumeroOptimoWorkers,
    generarSecuenciaDNA
} from './src/utils.js';

// ================================================================
// 2. CONFIGURACIÓN
// ================================================================
const CONFIG = {
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 77,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    BITS_ID: 28,
    BITS_CHK: 4,
    MAX_ID: 268435455,
    // 🔥 NUEVO: Configuración de paralelización
    PARALELIZACION: {
        ACTIVADO: true,
        MAX_WORKERS: 4, // Límite máximo de workers
        MIN_BLOQUES_POR_WORKER: 10 // Mínimo para justificar un worker
    }
};

// ================================================================
// 3. CLASE GENERADOR
// ================================================================
export class GeneradorMBH {
    constructor(db, licenseManager) {
        this.db = db;
        this.licenseManager = licenseManager;
        console.log('🐉 GeneradorMBH (versión con paralelización) inicializado');
    }

    // ================================================================
    // 4. MÉTODO PRINCIPAL (adaptado para usar paralelización)
    // ================================================================
    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        const startTime = performance.now();

        try {
            // ==========================================================
            // 4.1. OBTENER DATOS BÁSICOS
            // ==========================================================
            let prefijo = await this.db.obtenerPrefijo();
            if (!prefijo) {
                const config = await this.db.obtenerConfiguracion();
                prefijo = config?.prefijo_usuario || 'DEM';
            }

            let idNumerico = metadatosCliente.id_numerico || 0;
            if (idNumerico === 0) {
                idNumerico = await this.db.obtenerSiguienteId();
            }

            const idHex = idNumerico.toString(16).toUpperCase().padStart(7, '0');
            const idCompleto = `${prefijo}_${idHex}`;

            // ==========================================================
            // 4.2. PREPARAR DIRECTORIO DE SALIDA
            // ==========================================================
            const outputDir = metadatosCliente.outputDir || path.dirname(rutaEntrada);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const baseName = path.basename(rutaEntrada, path.extname(rutaEntrada));
            if (!rutaSalida) {
                rutaSalida = path.join(outputDir, `${baseName}_${idCompleto}.png`);
            }

            // ==========================================================
            // 4.3. EXTRAER METADATOS Y PREPARAR PÍXELES
            // ==========================================================
            const extractor = sharp(rutaEntrada);
            const { data: bufferBase, info } = await extractor
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const chk = this.calcularChecksumMentalista(idNumerico);
            const payload32 = (idNumerico << 4) | chk;

            let buffer = bufferBase;

            // ==========================================================
            // 4.4. 🔥 INYECCIÓN STARDUST PARALELIZADA
            // ==========================================================
            console.log(`🚀 Inyectando Stardust con paralelización...`);
            buffer = await this.inyectarStardust32Paralelo(buffer, info.width, info.height, payload32);

            // ==========================================================
            // 4.5. LIMPIEZA ALFA E INYECCIÓN VOGEL
            // ==========================================================
            for (let i = 3; i < buffer.length; i += 4) {
                buffer[i] = buffer[i] & 0xFE;
            }
            buffer = this.inyectarGeometria(buffer, info.width, info.height, idCompleto);

            // ==========================================================
            // 4.6. ESCRIBIR IMAGEN
            // ==========================================================
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            // ==========================================================
            // 4.7. REGISTRAR EN DB (simplificado para pruebas)
            // ==========================================================
            try {
                await this.db.registrarSello(
                    idNumerico,
                    idHex,
                    metadatosCliente.proyectoId || 1,
                    metadatosCliente.cliente || 'Prueba',
                    metadatosCliente.obra || 'Prueba',
                    metadatosCliente.coleccion || null,
                    metadatosCliente.derechos || 'Todos los derechos reservados',
                    metadatosCliente.email_contacto || '',
                    metadatosCliente.compartir_blade || 0
                );
            } catch (dbErr) {
                console.log(`⚠️ Error en DB: ${dbErr.message}`);
            }

            const elapsed = performance.now() - startTime;
            console.log(`✅ Sellado completado en ${Math.round(elapsed)}ms`);

            return { ok: true, id: idCompleto, ruta: rutaSalida };

        } catch (errorGeneral) {
            console.error(`❌ Error: ${errorGeneral.message}`);
            return { ok: false, error: errorGeneral.message };
        }
    }

    // ================================================================
    // 5. 🔥 STARDUST PARALELIZADO (NUEVO)
    // ================================================================
    async inyectarStardust32Paralelo(buffer, width, height, payload32) {
        const bloques = generarListaBloques(width, height);
        const totalBloques = bloques.length;

        // Detectar número óptimo de workers
        let numWorkers = CONFIG.PARALELIZACION.MAX_WORKERS;
        const nucleos = os.cpus().length;
        
        // Ajustar según núcleos disponibles
        numWorkers = Math.min(numWorkers, Math.max(1, nucleos - 1));
        
        // Si hay pocos bloques, no usar paralelización
        if (totalBloques < CONFIG.PARALELIZACION.MIN_BLOQUES_POR_WORKER * 2) {
            console.log(`   ⏭️ Pocos bloques (${totalBloques}), usando secuencial`);
            return this.inyectarStardust32Secuencial(buffer, width, height, payload32);
        }

        // Si solo hay 2 núcleos o menos, usar secuencial
        if (nucleos <= 2) {
            console.log(`   ⏭️ ${nucleos} núcleos, usando secuencial (paralelización no beneficia)`);
            return this.inyectarStardust32Secuencial(buffer, width, height, payload32);
        }

        console.log(`   🧠 ${nucleos} núcleos, usando ${numWorkers} workers (${totalBloques} bloques)`);

        // Dividir bloques entre workers
        const chunks = dividirEnChunks(bloques, numWorkers);
        const workers = [];
        const promises = [];

        // Crear un buffer compartido (usamos copia para evitar problemas de SharedArrayBuffer)
        const bufferCopy = new Uint8Array(buffer);

        for (let i = 0; i < chunks.length; i++) {
            const worker = new Worker(path.join(__dirname, 'src/stardust_worker.js'));
            workers.push(worker);
            
            const promise = new Promise((resolve, reject) => {
                worker.on('message', (result) => {
                    resolve(result);
                });
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) reject(new Error(`Worker exit code ${code}`));
                });
            });
            
            promises.push(promise);
            
            worker.postMessage({
                chunk: chunks[i],
                width,
                height,
                payload32,
                buffer: bufferCopy.buffer,
                fuerza: CONFIG.STARDUST_INTENSITY
            });
        }

        // Esperar a que todos los workers terminen
        await Promise.all(promises);
        
        // Copiar los datos modificados de vuelta al buffer original
        buffer.set(bufferCopy);
        
        // Terminar workers
        workers.forEach(w => w.terminate());

        return buffer;
    }

    // ================================================================
    // 6. STARDUST SECUENCIAL (VERSIÓN ORIGINAL)
    // ================================================================
    inyectarStardust32Secuencial(buffer, width, height, payload32) {
        const secuenciaDNA = generarSecuenciaDNA(payload32);
        const dnaLength = 64;
        const blockSize = CONFIG.STARDUST_BLOCK_SIZE;
        const u1 = CONFIG.DCT_COEFF_1.u, v1 = CONFIG.DCT_COEFF_1.v;
        const u2 = CONFIG.DCT_COEFF_2.u, v2 = CONFIG.DCT_COEFF_2.v;
        const fuerza = CONFIG.STARDUST_INTENSITY;

        for (let y = 0; y <= height - blockSize; y += blockSize) {
            let stepIndex = 0;
            for (let x = 0; x <= width - blockSize; x += blockSize) {
                let blueBlock = this.extraerBloqueCanal(buffer, width, x, y, 2);
                let dctBlock = this.dct8x8(blueBlock);
                const bitToInject = secuenciaDNA[stepIndex % dnaLength];
                stepIndex++;

                const valActual1 = dctBlock[v1][u1];
                const valActual2 = dctBlock[v2][u2];
                const promedio = (valActual1 + valActual2) / 2;
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

    // ================================================================
    // 7. INYECCIÓN VOGEL (ORIGINAL)
    // ================================================================
    inyectarGeometria(buffer, width, height, idCompleto) {
        const hashLimpio = idCompleto.split('_')[1] || idCompleto;
        const centro = MotorEspacial.calcularCentroUnico(
            width, 
            height, 
            hashLimpio,
            CONFIG.PRIVATE_KEY
        );
        const puntos = MotorEspacial.obtenerPuntosEspiral(width, height, centro);

        puntos.forEach(p => {
            if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
                const idx = (p.y * width + p.x) * 4;
                buffer[idx + 3] = (buffer[idx + 3] | 1);
                buffer[idx + 2] = (buffer[idx + 2] | 1);
            }
        });
        return buffer;
    }

    // ================================================================
    // 8. FUNCIONES DCT (ORIGINALES)
    // ================================================================
    dct8x8(block) {
        const n = 8;
        let dct = Array(n).fill(0).map(() => Array(n).fill(0));
        const C = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);
        for (let u = 0; u < n; u++) {
            for (let v = 0; v < n; v++) {
                let sum = 0;
                for (let x = 0; x < n; x++) {
                    for (let y = 0; y < n; y++) {
                        sum += block[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * 
                               Math.cos(((2 * y + 1) * v * Math.PI) / 16);
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
                        sum += C(u) * C(v) * dct[v][u] * 
                               Math.cos(((2 * x + 1) * u * Math.PI) / 16) * 
                               Math.cos(((2 * y + 1) * v * Math.PI) / 16);
                    }
                }
                block[y][x] = 0.25 * sum;
            }
        }
        return block;
    }

    // ================================================================
    // 9. UTILIDADES
    // ================================================================
    calcularChecksumMentalista(id28) {
        const L = id28 & 0x3FFF;
        const H = (id28 >> 14) & 0x3FFF;
        const X = L ^ H;
        const V = ((X * 19) ^ ((X * 19) >> 6)) & 0xFFF;
        return V & 0x0F;
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
                if (val < 0) val = 0;
                if (val > 255) val = 255;
                buffer[idx] = Math.round(val);
            }
        }
    }
}