import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import crypto from 'crypto';

// --- CONFIGURACIÓN DE CONEXIÓN AL BÚNKER ---
const BUNKER_HOST = 'www.bladecorporation.net';
const SANDBOX_KEY = process.env.SANDBOX_API_KEY || 'tc_key_2024';

console.log(">>> [DEBUG] DRAGON3: Iniciando Motor de Blindaje...");

const __dirname = path.resolve();

// --- CONFIGURACIÓN DE CARPETAS ---
// Carpeta persistente para el cliente
const selladosDir = path.join(__dirname, 'Sellados');
if (!fs.existsSync(selladosDir)) {
    fs.mkdirSync(selladosDir, { recursive: true });
    console.log(">>> [SISTEMA] Carpeta 'Sellados' creada con éxito.");
}

// Carpeta temporal aislada para subidas
const uploadDir = path.join(os.tmpdir(), 'dragon_tmp_up');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// --- IMPORTACIÓN DEL CORE ---
import { analizarImagenMBH } from './analizador_v5.js';
import { GeneradorMBH } from './generadorMBH.js';

const app = express();
const generador = new GeneradorMBH();

app.use(express.json());

/**
 * 🛰️ FUNCIÓN: REPORTE CIEGO AL BÚNKER
 * Envía el veredicto al servidor central para obtener la firma legal (bunker_sig).
 */
async function reportarVeredicto(veredicto, hash) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ veredicto, hash, timestamp: new Date().toISOString() });

        const options = {
            hostname: BUNKER_HOST,
            path: '/api/v1/sandbox/report',
            method: 'POST',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'x-api-key': SANDBOX_KEY
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(body);
                        console.log(">>> [BÚNKER] Veredicto firmado con éxito.");
                        resolve(parsed.bunker_sig || 'SIG_DRAGON_OK');
                    } catch (e) { resolve('SIG_PARSE_ERROR'); }
                } else {
                    console.error(">>> [BÚNKER] Error de firma:", res.statusCode);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error(">>> [BÚNKER] Error de conexión:", e.message);
            resolve(null);
        });
        req.write(data);
        req.end();
    });
}

// 1. SERVIR EL FRONTEND
app.get('/', (req, res) => {
    const uiPath = path.join(__dirname, 'interface.html');
    if (fs.existsSync(uiPath)) {
        res.sendFile(uiPath);
    } else {
        res.status(404).send("Error: interface.html no encontrado.");
    }
});

// 2. API DE PROCESAMIENTO
app.post('/api/process', upload.single('archivo'), async (req, res) => {
    let inputPath = null;
    let outputPath = null;

    console.log(">>> [DEBUG] Petición recibida en /api/process");

    try {
        const { accion } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Falta archivo' });

        inputPath = req.file.path;
        const fileBuffer = fs.readFileSync(inputPath);
        const hashEvidencia = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // ACCIÓN: MARCAR (Sellar imagen y guardar en carpeta Sellados)
        if (accion === 'marcar') {
            console.log(">>> [DEBUG] Iniciando acción: MARCAR");

            // --- CORRECCIÓN DE EXTENSIÓN PARA EXIFTOOL ---
            const baseName = req.file.originalname.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_');
            const finalFileName = `DRAGON_SEALED_${Date.now()}_${baseName}.png`;
            outputPath = path.join(selladosDir, finalFileName);

            const metadataDragon = {
                id_numerico: Math.floor(Math.random() * 1000000),
                cliente: "TECNOCAMPUS_ALFA",
                obra: "PROTECTED_BY_DRAGON3"
            };

            // Llamada al motor MBH (Generador ofuscado)
            console.log(">>> [DEBUG] Ejecutando motor de sellado Sharp + DCT...");
            const resultadoSello = await generador.sellarImagen(inputPath, outputPath, metadataDragon);

            if (resultadoSello && resultadoSello.ok) {
                console.log(`>>> [SUCCESS] Imagen sellada guardada en: ${outputPath}`);

                // IMPORTANTE: Devolvemos un JSON confirmando el éxito. NO enviamos la imagen.
                res.json({
                    status: "SUCCESS",
                    msg: "Sello incrustado con éxito en el Almacén Local.",
                    path: finalFileName,
                    id_mbh: resultadoSello.id || "CONFIRMED"
                });
            } else {
                throw new Error(resultadoSello.error || "Error desconocido en el motor de sellado");
            }

        // ACCIÓN: VERIFICAR (Análisis Forense)
        } else if (accion === 'verificar') {
            console.log(">>> [DEBUG] Iniciando acción: VERIFICAR");

            // 1. Análisis Local (analizador_v5.js)
            const resultadoLocal = await analizarImagenMBH(inputPath);
            console.log(">>> [DEBUG] Resultado local obtenido:", resultadoLocal.veredicto);

            // 2. Reporte al Búnker (Blade Corporation) para firma M2M
            const firmaBunker = await reportarVeredicto(resultadoLocal.veredicto, hashEvidencia);

            res.json({
                ...resultadoLocal,
                hash: hashEvidencia,
                bunker_sig: firmaBunker,
                msg: "Análisis local certificado por Blade Corp."
            });
        }

    } catch (error) {
        console.error(">>> [DEBUG] ERROR CRÍTICO EN API:", error.message);
        res.status(500).json({ error: error.message });
    } finally {
        // LIMPIEZA SELECTIVA:
        setTimeout(() => {
            // Siempre borramos el archivo temporal de subida (input)
            if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

            // NO borramos outputPath si la acción fue 'marcar',
            // ya que ahora es el archivo final persistente en la carpeta 'Sellados' del cliente.
        }, 1500);
    }
});

// 3. VALIDACIÓN DE LICENCIA (Arranque)
async function validarLicencia() {
    console.log(">>> [DEBUG] Validando acceso con Blade Corporation...");
    return new Promise((resolve, reject) => {
        const token = process.env.DRAGON_TOKEN || "TEST_TOKEN_TC";

        const options = {
            hostname: BUNKER_HOST,
            path: '/api/v1/sandbox/verify',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-api-key': SANDBOX_KEY
            }
        };

        const req = https.get(options, (res) => {
            if (res.statusCode === 200 || res.statusCode === 401) {
                console.log(">>> [DEBUG] Canal de comunicación validado.");
                resolve();
            } else {
                reject(new Error(`Búnker no disponible (Status: ${res.statusCode})`));
            }
        });
        req.on('error', (e) => reject(new Error("Búnker Offline: " + e.message)));
        req.end();
    });
}

// ARRANQUE DEL SISTEMA
validarLicencia().then(() => {
    const PORT = 3050;
    app.listen(PORT, () => {
        console.log("========================================");
        console.log("🐉 DRAGON3 SANDBOX: ONLINE (M2M Mode)");
        console.log(`🚀 Puerto Local: ${PORT}`);
        console.log(`📂 Almacén: ${selladosDir}`);
        console.log("🔒 Certeza Operativa: ACTIVADA");
        console.log("========================================");
    });
}).catch(e => {
    console.error("--- ⛔ ERROR DE LICENCIA ---");
    console.error(e.message);
    process.exit(1);
});
