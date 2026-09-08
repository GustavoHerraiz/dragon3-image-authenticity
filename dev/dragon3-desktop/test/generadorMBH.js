import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { MotorEspacial } from './MotorEspacial.js';
import { exec } from 'child_process';
import util from 'util';
import { telemetry } from './telemetry.js';
const execPromise = util.promisify(exec);

const MODULE = 'GeneradorMBH';

const CONFIG = {
    TILE_SIZE: 256,
    STARDUST_BLOCK_SIZE: 8,
    STARDUST_INTENSITY: 77,
    DCT_COEFF_1: { u: 1, v: 1 },
    DCT_COEFF_2: { u: 2, v: 2 },
    PRIVATE_KEY: "DRAGON3_SECRET_KEY",
    BITS_ID: 28,
    BITS_CHK: 4,
    MAX_ID: 268435455
};

export class GeneradorMBH {
    constructor(db, licenseManager) {
        this.db = db;
        this.licenseManager = licenseManager;
        telemetry.info(MODULE, 'Generador inicializado con inyección DB y LicenseManager');
    }

    async sellarImagen(rutaEntrada, rutaSalida, metadatosCliente) {
        const startTime = performance.now();

        // ==========================================================
        // 1. COMPROBAR LÍMITE DE DEMO (NUEVO)
        // ==========================================================
        const limite = await this.licenseManager.comprobarLimite();
        if (!limite.ok) {
            telemetry.warn(MODULE, `Intento de sellado bloqueado: ${limite.error}`);
            return { ok: false, error: limite.error };
        }

        // ==========================================================
        // 2. OBTENER PREFIJO (desde configuración)
        // ==========================================================
        let prefijo = await this.db.obtenerPrefijo();
        if (!prefijo) {
            const config = await this.db.obtenerConfiguracion();
            prefijo = config?.prefijo_usuario || 'DEM';
            telemetry.warn(MODULE, `Prefijo no encontrado, usando: ${prefijo}`);
        }

        // ==========================================================
        // 3. OBTENER SIGUIENTE ID NUMÉRICO
        // ==========================================================
        let idNumerico = metadatosCliente.id_numerico || 0;
        if (idNumerico === 0) {
            idNumerico = await this.db.obtenerSiguienteId();
        }

        // ==========================================================
        // 4. CONSTRUIR ID COMPLETO
        // ==========================================================
        const idHex = idNumerico.toString(16).toUpperCase().padStart(7, '0');
        const idCompleto = `${prefijo}_${idHex}`;

        // ==========================================================
        // 5. DIRECTORIO DE SALIDA
        // ==========================================================
        const outputDir = metadatosCliente.outputDir || path.dirname(rutaEntrada);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            telemetry.info(MODULE, `📁 Directorio de salida creado: ${outputDir}`);
        }

        // ==========================================================
        // 6. NOMBRE DE ARCHIVO DE SALIDA (original_ID.png)
        // ==========================================================
        const baseName = path.basename(rutaEntrada, path.extname(rutaEntrada));
        if (!rutaSalida) {
            rutaSalida = path.join(outputDir, `${baseName}_${idCompleto}.png`);
        } else {
            const dir = path.dirname(rutaSalida);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        telemetry.info(MODULE, `Ruta de salida final: ${rutaSalida}`);

        // ==========================================================
        // 7. METADATOS DEL CLIENTE
        // ==========================================================
        const cliente = metadatosCliente.cliente || "Cliente sin nombre";
        const obra = metadatosCliente.obra || "Obra sin título";
        const proyectoNombre = metadatosCliente.proyecto_nombre || null;
        const coleccion = metadatosCliente.coleccion || null;
        const derechos = metadatosCliente.derechos || "Todos los derechos reservados";
        const emailContacto = metadatosCliente.email_contacto || "";
        const compartirBlade = metadatosCliente.compartir_blade ? 1 : 0;
        const proyectoId = metadatosCliente.proyectoId;

        telemetry.debug(MODULE, `📌 proyectoId recibido: ${proyectoId} (tipo: ${typeof proyectoId})`);

        try {
            // ==========================================================
            // 8. EXTRAER METADATOS ORIGINALES
            // ==========================================================
            const extractor = sharp(rutaEntrada);
            const metaOriginal = await extractor.metadata();

            // ==========================================================
            // 9. PREPARAR PÍXELES
            // ==========================================================
            const { data: bufferBase, info } = await extractor
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            // ==========================================================
            // 10. CALCULAR CHECKSUM
            // ==========================================================
            const chk = this.calcularChecksumMentalista(idNumerico);
            const payload32 = (idNumerico << 4) | chk;

            let buffer = bufferBase;

            // ==========================================================
            // 11. INYECCIÓN FORENSE (Stardust + Vogel)
            // ==========================================================
            buffer = this.inyectarStardust32(buffer, info.width, info.height, payload32);
            for (let i = 3; i < buffer.length; i += 4) buffer[i] = buffer[i] & 0xFE;
            buffer = this.inyectarGeometria(buffer, info.width, info.height, idCompleto);

            // ==========================================================
            // 12. PERSISTENCIA EN BASE DE DATOS (sellos)
            // ==========================================================
            try {
                if (proyectoId) {
                    const proyectoExistente = await this.db.buscarPorId(proyectoId);
                    if (proyectoExistente) {
                        await this.db.registrarSello(
                            idNumerico,
                            idHex,
                            proyectoId,
                            cliente,
                            obra,
                            coleccion,
                            derechos,
                            emailContacto,
                            compartirBlade
                        );
                        telemetry.info(MODULE, `Sello ${idCompleto} registrado en proyecto existente (ID ${proyectoExistente.id})`);
                    } else {
                        const mensaje = `Proyecto con ID ${proyectoId} no encontrado.`;
                        telemetry.error(MODULE, mensaje);
                        throw new Error(mensaje);
                    }
                } else {
                    // Sin proyectoId: buscar o crear proyecto
                    let proyectoExistente = null;
                    if (proyectoNombre) {
                        const todos = await this.db.obtenerTodos();
                        proyectoExistente = todos.find(p => p.proyecto_nombre === proyectoNombre);
                    }

                    let proyectoFinalId = proyectoExistente?.id;

                    if (!proyectoFinalId) {
                        const nuevoProyecto = await this.db.crearProyecto(
                            idNumerico,
                            cliente,
                            obra,
                            proyectoNombre,
                            coleccion,
                            derechos,
                            emailContacto,
                            compartirBlade,
                            false,
                            null
                        );
                        proyectoFinalId = nuevoProyecto.id;
                        telemetry.info(MODULE, `Proyecto creado: ${proyectoNombre} (ID: ${proyectoFinalId})`);
                    }

                    await this.db.registrarSello(
                        idNumerico,
                        idHex,
                        proyectoFinalId,
                        cliente,
                        obra,
                        coleccion,
                        derechos,
                        emailContacto,
                        compartirBlade
                    );
                    telemetry.info(MODULE, `Sello ${idCompleto} registrado en proyecto ${proyectoFinalId}`);
                }
            } catch (dbErr) {
                telemetry.error(MODULE, `Error en DB al guardar sello: ${dbErr.message}`);
                // Continuamos (la imagen ya está sellada)
            }

            // ==========================================================
            // 13. ESCRIBIR IMAGEN PNG
            // ==========================================================
            await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(rutaSalida);

            // ==========================================================
            // 14. INYECCIÓN DE METADATOS (ExifTool)
            // ==========================================================
            try {
                let exifPath;
                const resourcesPath = process.resourcesPath || process.cwd();
                if (process.platform === 'win32') {
                    exifPath = path.join(resourcesPath, 'exiftool', 'exiftool_win.exe');
                } else if (process.platform === 'darwin') {
                    exifPath = path.join(resourcesPath, 'exiftool', 'exiftool_mac');
                } else {
                    exifPath = path.join(resourcesPath, 'exiftool', 'exiftool_linux');
                }
                if (!fs.existsSync(exifPath)) {
                    exifPath = path.join(process.cwd(), 'resources', 'exiftool',
                        process.platform === 'win32' ? 'exiftool_win.exe' :
                        process.platform === 'darwin' ? 'exiftool_mac' : 'exiftool_linux');
                }
                if (process.platform === 'linux' && !fs.existsSync(exifPath)) {
                    exifPath = 'exiftool';
                }

                const cmd = `"${exifPath}" -TagsFromFile "${rutaEntrada}" "-exif:all<exif:all" "-xmp:all<xmp:all" ` +
                    `-ImageDescription="DRAGON3_ID:${idCompleto} | ${obra} - ${cliente}" ` +
                    `-Copyright="Protected by Dragon3 - ${derechos}" ` +
                    `-Artist="${cliente}" ` +
                    `-xmp:Rights="Protected by Dragon3" ` +
                    `-xmp:Creator="${cliente}" ` +
                    `-xmp:Description="DRAGON3_ID:${idCompleto} | ${obra}" ` +
                    `-xmp:Title="${obra}" ` +
                    `-xmp:Source="Dragon3 Verificado" ` +
                    `-Software="Dragon3 V22 Mentalist Core" ` +
                    `-overwrite_original "${rutaSalida}"`;

                const { stdout, stderr } = await execPromise(cmd);
                telemetry.debug(MODULE, `ExifTool OK`, { stdout: stdout.trim() });
                if (stderr) telemetry.warn(MODULE, `ExifTool warnings: ${stderr.trim()}`);
            } catch (exifErr) {
                telemetry.error(MODULE, `ExifTool falló: ${exifErr.message}`);
            }

            // ==========================================================
            // 15. INCREMENTAR CONTADOR DE SELLOS USADOS (NUEVO)
            // ==========================================================
            // Solo si el sellado fue exitoso y es modo demo
            await this.licenseManager.incrementarSellosUsados();

            const elapsed = performance.now() - startTime;
            telemetry.info(MODULE, `Imagen sellada con éxito: ${idCompleto}`, {
                rutaSalida,
                tiempo_ms: Math.round(elapsed),
                cliente,
                obra
            });

            return { ok: true, id: idCompleto, ruta: rutaSalida };

        } catch (errorGeneral) {
            telemetry.error(MODULE, `Error crítico en sellarImagen: ${errorGeneral.message}`, { stack: errorGeneral.stack });
            return { ok: false, error: errorGeneral.message };
        }
    }

    // =========================================================================
    // 🧬 MOTOR FÍSICO: STARDUST TWIN-64 (DOBLE HÉLICE)
    // =========================================================================
    inyectarStardust32(buffer, width, height, payload32) {
        const secuenciaDNA = [];
        for (let i = 31; i >= 0; i--) {
            const bit = (payload32 >>> i) & 1;
            secuenciaDNA.push(bit);
            secuenciaDNA.push(bit ^ 1);
        }

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

    // =========================================================================
    // 🛰️ MOTOR GEOMÉTRICO (Vogel)
    // =========================================================================
    inyectarGeometria(buffer, width, height, idCompleto) {
        const centro = MotorEspacial.calcularCentroUnico(width, height, idCompleto, CONFIG.PRIVATE_KEY);
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

    // =========================================================================
    // 🧮 UTILIDADES
    // =========================================================================
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