import express from 'express';
import path from 'path';
import fs from 'fs';
import dragon from '../utilidades/logger.js';
import authMiddleware from '../middlewares/autentificacion.js';
import { requireRole } from '../middlewares/autorizacion.js';
import AnalisisArchivo from '../modelos/mongodb/AnalisisArchivo.js';
import generarInforme from '../utilidades/generarInforme.js';

const router = express.Router();

// Middleware mínimo: correlationId
router.use((req, res, next) => {
  req.correlationId = req.get('X-Correlation-ID') || `forensic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.set('X-Correlation-ID', req.correlationId);
  next();
});

// POST /api/forensic/report -> genera PDF+JSON y devuelve metadata
router.post('/report', authMiddleware, requireRole(['enterprise','admin','superadmin']), async (req, res) => {
  const { analisisId, userId } = req.body || {};
  const correlationId = req.correlationId;
  try {
    if (!analisisId || !userId) {
      return res.status(400).json({ error: 'analisisId y userId son obligatorios' });
    }

    const analisis = await AnalisisArchivo.findById(analisisId).populate('usuarioId');
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }

    dragon.respira('Generando informe forense', 'forensic.js', 'FORENSIC_REPORT_START', { correlationId, analisisId, userId });

    const pdfName = await generarInforme(analisis, userId);

    const informesDir = path.join('/var/www/Dragon3/archivos', userId.toString(), 'informes');
    const pdfPath = path.join(informesDir, pdfName);
    const jsonPath = path.join(informesDir, `Informe_${userId}_${analisisId}.json`);

    dragon.sonrie('Informe forense generado', 'forensic.js', 'FORENSIC_REPORT_OK', { correlationId, analisisId, userId, pdfName });

    return res.json({
      ok: true,
      analisisId,
      userId,
      pdf: {
        nombre: pdfName,
        ruta: pdfPath,
        urlDescarga: `/descargas/analisis/${analisisId}`
      },
      json: fs.existsSync(jsonPath) ? { ruta: jsonPath } : null,
      correlationId
    });
  } catch (error) {
    dragon.agoniza('Error generando informe forense', error, 'forensic.js', 'FORENSIC_REPORT_ERROR', { correlationId, analisisId, userId });
    return res.status(500).json({ error: 'Error generando informe forense', correlationId });
  }
});

// GET /api/forensic/evidence/:id -> devuelve JSON de evidencia (auditable)
router.get('/evidence/:id', authMiddleware, requireRole(['enterprise','admin','superadmin']), async (req, res) => {
  const analisisId = req.params.id;
  const correlationId = req.correlationId;
  try {
    const analisis = await AnalisisArchivo.findById(analisisId).populate('usuarioId');
    if (!analisis) {
      return res.status(404).json({ error: 'Análisis no encontrado' });
    }

    // Estructura forense resumida (no incluye datos sensibles ni binarios)
    const evidencia = {
      analisisId: analisis._id?.toString(),
      archivoId: analisis.archivoId || analisis._id?.toString(),
      usuarioId: analisis.usuarioId?._id?.toString() || analisis.usuarioId?.toString(),
      resumen: analisis.resumen || analisis.resultado?.resumen || {},
      detalles: {
        analizadores: analisis.detalles?.analizadores?.resultados ? Object.keys(analisis.detalles.analizadores.resultados) : [],
        seguridad: analisis.seguridad || {},
        metadata: analisis.metadata || {}
      },
      consenso: analisis.consenso || analisis.resultado?.consenso || {},
      timestamps: {
        creado: analisis.createdAt,
        actualizado: analisis.updatedAt
      },
      correlationId
    };

    dragon.zen('Evidencia forense preparada', 'forensic.js', 'FORENSIC_EVIDENCE_OK', { correlationId, analisisId });
    return res.json(evidencia);
  } catch (error) {
    dragon.agoniza('Error obteniendo evidencia forense', error, 'forensic.js', 'FORENSIC_EVIDENCE_ERROR', { correlationId, analisisId });
    return res.status(500).json({ error: 'Error obteniendo evidencia', correlationId });
  }
});

export default router;


