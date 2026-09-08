import express from 'express';
import { GeneradorMBH } from './generadorMBH.js';
import { analizarImagenMBH } from './analizador_v5.js';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import http from 'http'; // Solo añadimos este import nativo para el vídeo

const app = express();
const port = 3005;
const generador = new GeneradorMBH();

// --- ⚙️ CONFIGURACIÓN DE CONEXIÓN REAL (IPv6 CÁMARA DIRECTA) ---
const config = {
    url_camara: 'http://[2a0c:5a86:103:100:a873:b9ec:4d6c:1c1f]:8080/shot.jpg',
    url_video: 'http://[2a0c:5a86:103:100:a873:b9ec:4d6c:1c1f]:8080/video', 
    auth: { user: 'admin', pass: 'dragon3' },
    cliente: 'Monitor Forense Mataró'
};

// 🔥 NUEVO: Permitir CORS y conexiones desde el panel
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// 🔥 NUEVO: Exponer la carpeta estática para que el navegador pueda ver las imágenes
app.use('/capturas', express.static(path.join(process.cwd(), 'capturas')));

// --- 🛡️ GESTIÓN DE BASE DE DATOS (Formato JSON Puro) ---
function podarBaseDeDatos() {
    const rutaDB = './base_datos_sellos.json';
    const MAX_REGISTROS = 1000;

    try {
        if (!fs.existsSync(rutaDB)) return;
        const contenido = fs.readFileSync(rutaDB, 'utf8');
        let registros = JSON.parse(contenido || "[]");

        if (registros.length > MAX_REGISTROS) {
            registros = registros.slice(-MAX_REGISTROS);
            fs.writeFileSync(rutaDB, JSON.stringify(registros, null, 4), 'utf8');
            console.log(`🧹 DB Purgada: Manteniendo los últimos ${MAX_REGISTROS} sellos.`);
        }
    } catch (e) {
        console.error("❌ Error al podar la DB JSON:", e.message);
        fs.writeFileSync(rutaDB, "[]");
    }
}

// --- 🗑️ LIMPIEZA DE IMÁGENES SEGURA ---
function limpiarCapturasAntiguas() {
    const directorio = './capturas';
    if (!fs.existsSync(directorio)) {
        fs.mkdirSync(directorio);
        return;
    }

    const MAX_ARCHIVOS = 50;
    fs.readdir(directorio, (err, archivos) => {
        if (err) return;

        const pngs = archivos
            .filter(f => f.startsWith('latido_') && f.endsWith('.png'))
            .map(f => {
                const fullPath = path.join(directorio, f);
                try {
                    if (fs.existsSync(fullPath)) {
                        return { name: f, path: fullPath, time: fs.statSync(fullPath).mtime.getTime() };
                    }
                } catch (e) { return null; }
                return null;
            })
            .filter(f => f !== null)
            .sort((a, b) => b.time - a.time);

        if (pngs.length > MAX_ARCHIVOS) {
            pngs.slice(MAX_ARCHIVOS).forEach(archivo => {
                fs.unlink(archivo.path, (err) => {});
            });
        }
    });
}

// --- 🌐 INTERFAZ HTML PRINCIPAL ---
app.get('/', (req, res) => {
    const rutaIndex = path.join(process.cwd(), 'index.html');
    if (fs.existsSync(rutaIndex)) res.sendFile(rutaIndex);
    else res.status(404).send("❌ Error: index.html no encontrado.");
});

// --- 📸 NÚCLEO CORREGIDO: LATIDO FORENSE Y SELLADO ---
app.get('/validar-latido', async (req, res) => {
    let timeoutId;
    try {
        const user = config.auth?.user || '';
        const pass = config.auth?.pass || '';
        const authBuffer = Buffer.from(`${user}:${pass}`).toString('base64');

        const response = await axios({
            method: 'get',
            url: config.url_camara,
            responseType: 'arraybuffer',
            headers: { 'Authorization': `Basic ${authBuffer}` },
            timeout: 10000 
        });

        const timestamp = Date.now();
        const nombreArchivo = `./capturas/latido_${timestamp}.png`;
        const idAleatorio = Math.floor(Math.random() * 268435455);

        await generador.sellarImagen(response.data, nombreArchivo, {
            id_numerico: idAleatorio,
            cliente: config.cliente || 'Monitor Forense Mataró',
            obra: 'Sistema Dragon3 v4.1'
        });

        const ejecutarAnalisis = () => {
    return new Promise((resolve) => {
        timeoutId = setTimeout(async () => {
            try {
                const veredicto = await analizarImagenMBH(nombreArchivo);
                resolve(veredicto);
            } catch (e) {
                resolve({ hash: "ERROR_ANALISIS" });
            }
        }, 150); // <--- AHORA A 150ms (Velocidad SSD)
    });
};
        const veredicto = await ejecutarAnalisis();

        if (!res.headersSent) {
            res.json({
                identificado: true,
                hash: veredicto.hash || "ERROR_HASH",
                imageUrl: `/capturas/latido_${timestamp}.png`,
                meta_id: idAleatorio,
                meta_cliente: config.cliente || 'DRAGON3',
                timestamp: Math.floor(Date.now() / 1000)
            });
        }

        limpiarCapturasAntiguas();
        podarBaseDeDatos();

    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        console.error("🚨 Fallo en el flujo Dragon3:", error.message);
        if (!res.headersSent) {
            res.status(500).json({ identificado: false, error: error.message });
        }
    }
});

// --- 🎥 TÚNEL DE VÍDEO (SOLUCIÓN HTTP NATIVA) ---
app.get('/video-stream', (req, res) => {
    const user = config.auth?.user || '';
    const pass = config.auth?.pass || '';
    const authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    // Aquí usamos http.get en lugar de axios para evitar que el stream se corte
    const request = http.get(config.url_video, {
        headers: { 'Authorization': authHeader }
    }, (camRes) => {
        // Reenviamos las cabeceras de la cámara para que el navegador reconozca el flujo MJPEG
        res.writeHead(camRes.statusCode, camRes.headers);
        camRes.pipe(res);
        
        // Si el cliente cierra la pestaña, cerramos la conexión con la cámara
        req.on('close', () => {
            camRes.destroy();
        });
    });

    request.on('error', (e) => {
        console.error("🚨 Error en video-stream:", e.message);
        if (!res.headersSent) res.status(500).send("Error de flujo de vídeo");
    });
});

// --- 🚀 ARRANQUE BLINDADO CONTRA CRASHES SILENCIOSOS ---
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n==============================================`);
    console.log(`🐉 DRAGON3: SISTEMA PERICIAL ACTIVO (JSON MODE)`);
    console.log(`🌐 ACCESO PANEL: https://monitor.bladecorporation.net`);
    console.log(`🏠 ORIGEN VÍDEO: ${config.url_camara}`);
    console.log(`📍 NODO LOCAL: http://localhost:${port}`);
    console.log(`🛡️ PROTECCIÓN DE DISCO: ON (Max: 50 capturas | DB: 1000)`);
    console.log(`==============================================\n`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ ERROR CRÍTICO: El puerto ${port} ya está siendo usado por otro proceso.`);
    } else {
        console.error(`❌ ERROR AL INICIAR EL SERVIDOR:`, err.message);
    }
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('🚨 EXCEPCIÓN NO CONTROLADA (El servidor sigue vivo):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 PROMESA RECHAZADA Y NO CONTROLADA:', reason);
});