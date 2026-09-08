/**
 * ==============================================================================
 * DRAGON3 - RUTAS DE DESCARGA (FIXED - TYPO CORREGIDO)
 * ==============================================================================
 */
import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import dragon from "../utilidades/logger.js";
import addCorrelationId from "../middlewares/addCorrelationId.js";
import AnalisisArchivo from "../modelos/mongodb/AnalisisArchivo.js";
import generarInforme from "../servicios/generarinforme.js";

const router = express.Router();

/**
 * Middleware Híbrido: Token en Header O en URL
 */
const authDownloadMiddleware = async (req, res, next) => {
    let token = req.headers.authorization?.split(" ")[1];
    if (!token && req.query.token) {
        token = req.query.token;
        req.headers.authorization = `Bearer ${token}`;
    }

    if (!token) {
        return res.status(401).send("Acceso denegado: Token no proporcionado");
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dragon3_jwt_fallback_secret');
        req.usuario = decoded;
        next();
    } catch (error) {
        dragon.sePreocupa("Token inválido en descarga", "descargas.js", "AUTH_FAIL", { error: error.message });
        return res.status(403).send("Acceso denegado: Token inválido o expirado");
    }
};

/**
 * GET /archivos/descargas/analisis/:id
 */
router.get('/archivos/descargas/analisis/:id', addCorrelationId, authDownloadMiddleware, async (req, res) => {
    const correlationId = req.correlationId;
    const analisisId = req.params.id;
    const userId = req.usuario.id;

    try {
        dragon.respira(`Descarga PDF solicitada`, "descargas.js", "DOWNLOAD_START", { analisisId, userId });

        const analisis = await AnalisisArchivo.findOne({ _id: analisisId, usuarioId: userId }).select('+rawJsonCompressed rawStored rutas');

        if (!analisis) {
            return res.status(404).send("Análisis no encontrado o no te pertenece.");
        }

        const informesDir = `/var/www/Dragon3/archivos/${userId}/informes`;
        const pdfFileName = `Informe_${userId}_${analisisId}.pdf`;
        const pdfFilePath = path.join(informesDir, pdfFileName);

        // --- GENERACIÓN ON-DEMAND ---
        if (!fs.existsSync(pdfFilePath)) {
            dragon.respira(`PDF no existe, generando...`, "descargas.js", "PDF_GEN", { analisisId });

            // 🎯 FIX: Nombre de variable unificado
            let datosInformeOverride = null;
            if (analisis.rawStored) {
                try { datosInformeOverride = await analisis.getRawJson(); } catch (e) {}
            }

            // Ahora la variable coincide con la propiedad
            const resultado = await generarInforme(analisisId, userId, { correlationId, datosInformeOverride });

            if (!resultado || !resultado.pdfBuffer) {
                throw new Error("El generador no devolvió un buffer PDF válido.");
            }

            if (!fs.existsSync(informesDir)) fs.mkdirSync(informesDir, { recursive: true, mode: 0o755 });
            fs.writeFileSync(pdfFilePath, resultado.pdfBuffer);

            analisis.rutas = { ...(analisis.rutas || {}), informePDF: pdfFilePath };
            analisis.informeEstado = 'generado';
            await analisis.save();
        }

        res.download(pdfFilePath, pdfFileName, (err) => {
            if (err && err.code !== 'ECONNABORTED') {
                dragon.agoniza("Error enviando archivo", err, "descargas.js", "SEND_ERROR");
            } else {
                dragon.sonrie("PDF descargado correctamente", "descargas.js", "DOWNLOAD_OK", { analisisId });
            }
        });

    } catch (error) {
        // Log en consola para debug rápido si falla otra vez
        console.error("🔥 ERROR FINAL DESCARGA:", error);
        dragon.agoniza("Error crítico descarga", error, "descargas.js", "FATAL", { correlationId });
        res.status(500).send(`Error del servidor: ${error.message}`);
    }
});

/**
 * GET /mis-analisis
 */
router.get('/mis-analisis', addCorrelationId, authDownloadMiddleware, async (req, res) => {
    // Nota: Reutilizo authDownloadMiddleware porque también valida JWT estándar
    try {
        const lista = await AnalisisArchivo.find({ usuarioId: req.usuario.id })
            .sort({ createdAt: -1 })
            .select('filename createdAt estado resultados nombreOriginal tipo resultado.resumen');

        const listaProcesada = lista.map(item => {
            const obj = item.toObject();
            obj.pdfUrl = `/api/archivos/descargas/analisis/${item._id}`;
            return obj;
        });

        res.json(listaProcesada);
    } catch (e) {
        res.status(500).json({ error: "Error listando análisis" });
    }
});

export default router;
