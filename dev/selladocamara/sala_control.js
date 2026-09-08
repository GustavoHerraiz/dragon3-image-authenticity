import express from 'express';
import { analizarImagenMBH } from './analizador_v5.js';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import http from 'http'; // 🛡️ CRÍTICO: Necesario para el túnel de vídeo

const app = express();
const port = 3005; 

const EDGE_NODE_URL = 'http://localhost:3000'; 

// Servir archivos estáticos (tu index.html debe estar en la carpeta /public)
app.use(express.static(path.join(process.cwd(), 'public')));

function podarBaseDeDatos() {
    const rutaDB = './base_datos_sellos.json';
    const MAX_REGISTROS = 1000;
    try {
        if (!fs.existsSync(rutaDB)) return;
        let registros = JSON.parse(fs.readFileSync(rutaDB, 'utf8') || "[]");
        if (registros.length > MAX_REGISTROS) {
            fs.writeFileSync(rutaDB, JSON.stringify(registros.slice(-MAX_REGISTROS), null, 4), 'utf8');
        }
    } catch (e) { fs.writeFileSync(rutaDB, "[]"); }
}

// 🕵️ NÚCLEO AUDITOR: Sincronizado con la lógica del HTML (Calibración: 3.5s)
app.get('/validar-latido', async (req, res) => {
    try {
        // 1. Llamada al Edge para iniciar el sellado
        const edgeResponse = await axios.get(`${EDGE_NODE_URL}/generar-latido`, { timeout: 15000 });
        const datosEdge = edgeResponse.data;

        if (!datosEdge.sellado && datosEdge.sellado !== "en_proceso") {
            throw new Error("El Edge no pudo iniciar el proceso de sellado.");
        }

        // 🟢 AJUSTE DE PRECISIÓN: Tus logs marcan ~3500ms de procesado.
        // Esperamos 3800ms para que el archivo esté cerrado y disponible en disco.
        await new Promise(resolve => setTimeout(resolve, 3800));

        const urlImagenEnEdge = `${EDGE_NODE_URL}${datosEdge.imageUrl}`;
        let imgDownload;

        // 🔄 REINTENTO INTELIGENTE
        try {
            imgDownload = await axios.get(urlImagenEnEdge, { 
                responseType: 'arraybuffer',
                timeout: 5000 
            });
        } catch (e) {
            // Si el ExifTool se ha quedado pillado, le damos un último respiro
            console.log("⚠️ Petición precoz o disco ocupado, aplicando reintento final...");
            await new Promise(r => setTimeout(r, 2000)); 
            imgDownload = await axios.get(urlImagenEnEdge, { 
                responseType: 'arraybuffer',
                timeout: 5000 
            });
        }
        
        // 2. Persistencia temporal para análisis forense
        const tempPath = `./temp_audit_${Date.now()}.png`;
        fs.writeFileSync(tempPath, imgDownload.data);

        // 3. Análisis de integridad MBH
        const veredicto = await new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    const resultado = await analizarImagenMBH(tempPath);
                    resolve(resultado);
                } catch (e) { 
                    console.error("🚨 Error en analizador_v5:", e.message);
                    resolve({ hash: "ERROR_FORENSE" }); 
                }
            }, 100);
        });

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        // 4. Respuesta para el index.html
        res.json({
            identificado: true,
            hash: veredicto.hash || "HASH_PENDIENTE",
            imageUrl: urlImagenEnEdge, 
            meta_id: datosEdge.meta_id,
            timestamp: datosEdge.timestamp,
            meta_cliente: "Monitor Forense Mataró"
        });

        podarBaseDeDatos();

    } catch (error) {
        console.error(`🚨 [AUDITORÍA] ${error.message}`);
        res.status(200).json({ 
            identificado: false, 
            error: "Sincronizando flujo...",
            hash: "ESPERANDO_SELLADO...",
            timestamp: Math.floor(Date.now() / 1000)
        });
    }
});

// --- 🎥 TÚNEL DE VÍDEO (PIPE REAL) ---
app.get('/video-stream', (req, res) => {
    const request = http.get(`${EDGE_NODE_URL}/video-stream`, (edgeRes) => {
        // Mantenemos las cabeceras originales del stream MJPEG
        res.writeHead(edgeRes.statusCode, edgeRes.headers);
        edgeRes.pipe(res);
        req.on('close', () => edgeRes.destroy());
    });

    request.on('error', (e) => {
        console.error("🚨 Error en túnel de vídeo Sala Control:", e.message);
        if (!res.headersSent) res.status(500).send("Error de flujo");
    });
});

// --- 🖼️ TÚNEL DE IMÁGENES (Para que el navegador vea las capturas del Edge) ---
app.get('/capturas/:nombre', (req, res) => {
    const urlImagen = `${EDGE_NODE_URL}/capturas/${req.params.nombre}`;
    http.get(urlImagen, (edgeRes) => {
        res.writeHead(edgeRes.statusCode, edgeRes.headers);
        edgeRes.pipe(res);
    }).on('error', () => res.status(404).send("Imagen no encontrada"));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`\n==============================================`);
    console.log(`🐉 SALA DE CONTROL DRAGON3 ACTIVA`);
    console.log(`🌐 ACCESO: http://localhost:${port}`);
    console.log(`🔗 CONECTADO A EDGE: ${EDGE_NODE_URL}`);
    console.log(`==============================================\n`);
});