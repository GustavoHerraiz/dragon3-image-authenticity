// src/backend/actualizarMetadatos.js
// 🔧 ACTUALITZAR METADATS SENSE RE-SELLAR (TÈCNICA DEL SÀNDWICH)

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { telemetry } from './telemetry.js';

const execPromise = util.promisify(exec);
const MODULE = 'ActualizarMetadatos';

// ================================================================
// 🔧 FUNCIÓ PER TROBAR EXIFTOOL (REUTILITZADA DEL GENERADOR)
// ================================================================
function getExifToolPath() {
    const baseDir = process.cwd();
    const rutasPosibles = [
        path.join(baseDir, 'resources', 'exiftool', 'exiftool-13.59_64', 'exiftool_win.exe'),
        path.join(baseDir, 'resources', 'exiftool', 'exiftool_win.exe'),
        path.join(baseDir, 'exiftool', 'exiftool_win.exe'),
        path.join(process.resourcesPath || '', 'exiftool', 'exiftool_win.exe'),
        'exiftool'
    ];
    for (const ruta of rutasPosibles) {
        if (fs.existsSync(ruta)) return ruta;
    }
    return null;
}

// ================================================================
// 🔧 FUNCIÓ PER EXTREURE L'ID COMPLET D'UNA RUTA
// ================================================================
function extraerIdCompletoDeRuta(ruta) {
    const nombre = path.basename(ruta, path.extname(ruta));
    // Busca patró: _GHL_000001F
    const match = nombre.match(/_([A-Z0-9]{3,4})_([0-9A-F]{7})$/i);
    if (match) {
        return {
            prefijo: match[1].toUpperCase(),
            hash: match[2].toUpperCase(),
            idCompleto: `${match[1].toUpperCase()}_${match[2].toUpperCase()}`
        };
    }
    return null;
}

// ================================================================
// 🔧 FUNCIÓ PRINCIPAL PER ACTUALITZAR METADATS
// ================================================================
export async function actualizarMetadatos(rutaImagen, nuevosMetadatos, db) {
    telemetry.info(MODULE, `📝 Actualitzant metadats de: ${path.basename(rutaImagen)}`);

    try {
        // ============================================================
        // 1. VERIFICAR QUE LA IMATGE EXISTEIX
        // ============================================================
        if (!fs.existsSync(rutaImagen)) {
            throw new Error(`La imatge no existeix: ${rutaImagen}`);
        }

        // ============================================================
        // 2. EXTREURE ID COMPLET DE LA RUTA
        // ============================================================
        const idInfo = extraerIdCompletoDeRuta(rutaImagen);
        if (!idInfo) {
            throw new Error(`No s'ha pogut extreure l'ID de la ruta: ${rutaImagen}`);
        }
        const { prefijo, hash, idCompleto } = idInfo;
        telemetry.debug(MODULE, `🔑 ID detectat: ${idCompleto}`);

        // ============================================================
        // 3. VERIFICAR QUE EL SELLO EXISTEIX A LA DB
        // ============================================================
        const selloExistente = await db.get('SELECT * FROM sellos WHERE hash_suffix = ?', hash);
        if (!selloExistente) {
            throw new Error(`No s'ha trobat el sello ${hash} a la base de dades`);
        }
        telemetry.debug(MODULE, `🔒 Sello trobat a la DB: ${hash}`);

        // ============================================================
        // 4. TROBAR EXIFTOOL
        // ============================================================
        const exifPath = getExifToolPath();
        if (!exifPath) {
            throw new Error('ExifTool no trobat. No es poden actualitzar els metadats.');
        }
        telemetry.debug(MODULE, `🔧 ExifTool trobat: ${exifPath}`);

        // ============================================================
        // 5. EXTREURE METADATS ORIGINALS DE LA IMATGE
        // ============================================================
        telemetry.debug(MODULE, `📤 Llegint metadats actuals de la imatge...`);
        const extractCmd = `"${exifPath}" -j -a -G1 "${rutaImagen}"`;
        const { stdout: extractStdout } = await execPromise(extractCmd);
        const metadatosOriginales = JSON.parse(extractStdout)[0] || {};

        // ============================================================
        // 6. CONSTRUIR ELS NOUS METADATS (SÀNDWICH)
        // ============================================================
        // Camps que es poden escriure
        const camposPermitidos = [
            'ImageDescription', 'Copyright', 'Artist',
            'Make', 'Model', 'Orientation',
            'XResolution', 'YResolution', 'ResolutionUnit',
            'ExposureTime', 'FNumber', 'ISO',
            'ExposureProgram', 'DateTimeOriginal', 'CreateDate',
            'ModifyDate', 'ExposureCompensation', 'MeteringMode',
            'LightSource', 'Flash', 'FocalLength',
            'ColorSpace', 'ExposureMode', 'WhiteBalance',
            'DigitalZoomRatio', 'SceneCaptureType',
            'XMP:Rights', 'XMP:Creator', 'XMP:Description',
            'XMP:Title', 'XMP:Source', 'XMP:MetadataDate'
        ];

        // Filtrar metadats originals (només camps vàlids)
        const metadatosFiltrados = {};
        for (const [key, value] of Object.entries(metadatosOriginales)) {
            if (camposPermitidos.includes(key) && value !== undefined && value !== '') {
                metadatosFiltrados[key] = value;
            }
        }

        // Metadats del sello (actualitzats amb els nous valors)
        const metadatosSello = {
            'ImageDescription': `DRAGON3_ID:${idCompleto} | ${nuevosMetadatos.obra || selloExistente.obra} - ${nuevosMetadatos.cliente || selloExistente.cliente}`,
            'Copyright': `Protected by Dragon3 - ${nuevosMetadatos.derechos || selloExistente.derechos}`,
            'Artist': nuevosMetadatos.cliente || selloExistente.cliente,
            'XMP:Rights': 'Protected by Dragon3',
            'XMP:Creator': nuevosMetadatos.cliente || selloExistente.cliente,
            'XMP:Description': `DRAGON3_ID:${idCompleto} | ${nuevosMetadatos.obra || selloExistente.obra}`,
            'XMP:Title': nuevosMetadatos.obra || selloExistente.obra,
            'XMP:Source': 'Dragon3 Verificado',
            'Software': 'Dragon3 V22 Mentalist Core'
        };

        // Combinar (sándwich): originals + sello (el sello sobrescriu)
        const metadatosFinales = { ...metadatosFiltrados, ...metadatosSello };

        // ============================================================
        // 7. CONSTRUIR I EXECUTAR COMANDO EXIFTOOL
        // ============================================================
        let cmd = `"${exifPath}" -overwrite_original`;

        for (const [key, value] of Object.entries(metadatosFinales)) {
            if (value !== undefined && value !== null && value !== '') {
                const escapedValue = String(value).replace(/"/g, '\\"');
                cmd += ` -${key}="${escapedValue}"`;
            }
        }

        cmd += ` "${rutaImagen}"`;

        telemetry.debug(MODULE, `🔧 Executant ExifTool amb ${Object.keys(metadatosFinales).length} camps...`);

        const { stdout, stderr } = await execPromise(cmd);
        telemetry.debug(MODULE, `ExifTool OK`, { stdout: stdout.trim() });
        if (stderr) telemetry.warn(MODULE, `ExifTool warnings: ${stderr.trim()}`);

        // ============================================================
        // 8. ACTUALITZAR LA BASE DE DADES
        // ============================================================
        const updateData = {
            cliente: nuevosMetadatos.cliente || selloExistente.cliente,
            obra: nuevosMetadatos.obra || selloExistente.obra,
            coleccion: nuevosMetadatos.coleccion || selloExistente.coleccion,
            derechos: nuevosMetadatos.derechos || selloExistente.derechos,
            email_contacto: nuevosMetadatos.email_contacto || selloExistente.email_contacto,
            compartir_blade: nuevosMetadatos.compartir_blade !== undefined ? nuevosMetadatos.compartir_blade : selloExistente.compartir_blade
        };

        await db.run(
            `UPDATE sellos SET 
                cliente = ?, 
                obra = ?, 
                coleccion = ?, 
                derechos = ?, 
                email_contacto = ?, 
                compartir_blade = ? 
             WHERE hash_suffix = ?`,
            [
                updateData.cliente,
                updateData.obra,
                updateData.coleccion,
                updateData.derechos,
                updateData.email_contacto,
                updateData.compartir_blade,
                hash
            ]
        );

        // ============================================================
        // 9. VERIFICAR QUE ELS METADATS S'HAN APLICAT
        // ============================================================
        const verifyCmd = `"${exifPath}" -j -ImageDescription -Artist -Copyright -Software "${rutaImagen}"`;
        const { stdout: verifyStdout } = await execPromise(verifyCmd);
        const verifyData = JSON.parse(verifyStdout)[0] || {};

        if (verifyData.ImageDescription && verifyData.ImageDescription.includes('DRAGON3_ID')) {
            telemetry.info(MODULE, `✅ Metadats actualitzats correctament: ${idCompleto}`);
            return {
                ok: true,
                mensaje: `Metadats actualitzats correctament per ${idCompleto}`,
                hash: hash,
                idCompleto: idCompleto,
                metadatos: updateData
            };
        } else {
            telemetry.warn(MODULE, `⚠️ No s'han pogut verificar els metadats actualitzats`);
            return {
                ok: false,
                mensaje: 'No s\'han pogut verificar els metadats actualitzats',
                hash: hash
            };
        }

    } catch (err) {
        telemetry.error(MODULE, `❌ Error actualitzant metadats: ${err.message}`, { stack: err.stack });
        return {
            ok: false,
            mensaje: `Error: ${err.message}`
        };
    }
}

// ================================================================
// 🔧 FUNCIÓ PER LLEGIR METADATS D'UNA IMATGE (PER PRE-CARREGAR)
// ================================================================
export async function leerMetadatosImagen(rutaImagen) {
    try {
        const exifPath = getExifToolPath();
        if (!exifPath) {
            return { ok: false, mensaje: 'ExifTool no trobat' };
        }

        const cmd = `"${exifPath}" -j -ImageDescription -Artist -Copyright -XMP:Title -XMP:Creator "${rutaImagen}"`;
        const { stdout } = await execPromise(cmd);
        const data = JSON.parse(stdout)[0] || {};

        // Extreure informació del sello
        const idInfo = extraerIdCompletoDeRuta(rutaImagen);

        return {
            ok: true,
            metadatos: {
                imageDescription: data.ImageDescription || null,
                artist: data.Artist || null,
                copyright: data.Copyright || null,
                title: data['XMP:Title'] || data.Title || null,
                creator: data['XMP:Creator'] || null
            },
            idInfo: idInfo
        };
    } catch (err) {
        return {
            ok: false,
            mensaje: `Error llegint metadats: ${err.message}`
        };
    }
}

export { getExifToolPath };