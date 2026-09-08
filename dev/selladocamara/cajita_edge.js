import express from 'express';
import { GeneradorMBH } from './generadorMBH.js';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import http from 'http';

const app = express();
const port = 3000; // La Cajita corre en el 3000
const generador = new GeneradorMBH();

// --- ⚙️ CONFIGURACIÓN DE CONEXIÓN (VOLVIENDO A IPv4 ESTABLE) ---
const config = {
    url_camara: 'http://192.168.1.135:8080/shot.jpg',
    url_video: 'http://192.168.1.135:8080/video', 
    auth: { user: 'admin', pass: 'dragon3' },
    cliente: 'Cámara 01 - Búnker Origen'
};

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use('/capturas', express.static(path.join(process.cwd(), 'capturas')));

function limpiarCapturasAntiguas() {
    const directorio = './capturas';
    if (!fs.existsSync(directorio)) { fs.mkdirSync(directorio); return; }
    const MAX_ARCHIVOS = 50;
    fs.readdir(directorio, (err, archivos) => {
        if (err) return;
        const pngs = archivos.filter(f => f.startsWith('latido_') && f.endsWith('.png'))
            .map(f => {
                const fullPath = path.join(directorio, f);
                try { if (fs.existsSync(fullPath)) return { name: f, path: fullPath, time: fs.statSync(fullPath).mtime.getTime() }; } catch (e) { return null; }
                return null;
            }).filter(f => f !== null).sort((a, b) => b.time - a.time);

        if (pngs.length > MAX_ARCHIVOS) {
            pngs.slice(MAX_ARCHIVOS).forEach(archivo => fs.unlink(archivo.path, () => {}));
        }
    });
}

// 🛡️ NÚCLEO EDGE: Solo sella, no analiza.
app.get('/generar-latido', async (req, res) => {
    // 1. Respondemos inmediatamente que hemos recibido la orden
    const timestamp = Date.now();
    const idAleatorio = Math.floor(Math.random() * 268435455);
    const nombreArchivo = `./capturas/latido_${timestamp}.png`;

    res.json({
        sellado: "en_proceso", // No bloqueamos la respuesta
        imageUrl: `/capturas/latido_${timestamp}.png`,
        meta_id: idAleatorio,
        timestamp: Math.floor(timestamp / 1000)
    });

    // 2. El sellado ocurre "detrás", sin detener el servidor (Asincronía Total)
    setImmediate(async () => {
        const t_inicio = Date.now(); // ⏱️ Inicio del cronómetro
        
        try {
            const authBuffer = Buffer.from(`${config.auth.user}:${config.auth.pass}`).toString('base64');
            
            // Descarga del frame desde el Huawei
            const response = await axios({
                method: 'get', 
                url: config.url_camara, 
                responseType: 'arraybuffer',
                headers: { 'Authorization': `Basic ${authBuffer}` }, 
                timeout: 5000 
            });

            const t_descarga = Date.now(); // ⏱️ Tiempo tras descargar imagen

            // Sellado forense MBH + ExifTool
            await generador.sellarImagen(response.data, nombreArchivo, {
                id_numerico: idAleatorio,
                cliente: config.cliente,
                obra: 'Sistema Dragon3'
            });

            const t_final = Date.now(); // ⏱️ Tiempo final
            
            // LOGS DE RENDIMIENTO PARA AJUSTE FINO:
            console.log(`\n--------------------------------------------`);
            console.log(`✅ SELLO GENERADO: ${idAleatorio}`);
            console.log(`📦 Descarga: ${t_descarga - t_inicio}ms`);
            console.log(`🛠️ Procesado/Sello: ${t_final - t_descarga}ms`);
            console.log(`🚀 TOTAL PROCESO: ${t_final - t_inicio}ms`);
            console.log(`--------------------------------------------\n`);

            limpiarCapturasAntiguas();

        } catch (e) {
            console.error("🚨 Error en sellado de fondo:", e.message);
        }
    });});

// Túnel de vídeo directo desde el Edge
app.get('/video-stream', (req, res) => {
    const authHeader = 'Basic ' + Buffer.from(`${config.auth.user}:${config.auth.pass}`).toString('base64');
    const request = http.get(config.url_video, { headers: { 'Authorization': authHeader } }, (camRes) => {
        res.writeHead(camRes.statusCode, camRes.headers);
        camRes.pipe(res);
        req.on('close', () => camRes.destroy());
    });
    request.on('error', (e) => res.status(500).send("Error de flujo de vídeo"));
});

app.listen(port, '0.0.0.0', () => console.log(`📦 EDGE NODE ACTIVO en puerto ${port}`));