/**
 * servicios/workers/generarPdfWorker.js
 *
 * Worker simple para generar PDF desde el raw JSON almacenado en Mongo.
 * - Flujo:
 *    1) Carga documento AnalisisArchivo (incluyendo +rawJsonCompressed)
 *    2) Comprueba permisos/estado y aplica lock (informeEstado = 'generando')
 *    3) Extrae raw JSON (doc.getRawJson())
 *    4) Llama a generarInforme(analisisId, usuarioId, { datosInformeOverride, correlationId })
 *    5) Actualiza estado del documento (rutas.informePDF, informeEstado, informeGeneradoAt, informeIntentos)
 *
 * Diseño:
 * - No usa colas (modo A: función invocable desde endpoints o CRON).
 * - Idempotente: si informeEstado === 'generando' retorna sin duplicar trabajo.
 * - Manejo de errores robusto y logging estructurado con dragon.
 *
 * Recomendación: en producción encolar con Bull/Redis (opcional, no incluido aquí).
 */

import path from 'path';
import crypto from 'crypto';
import AnalisisArchivo from '../../modelos/mongodb/AnalisisArchivo.js';
import generarInforme from '../generarinforme.js';
import dragon from '../../utilidades/logger.js';

const MODULE = 'generarPdfWorker.js';
const RAW_SIZE_LIMIT_BYTES = 14 * 1024 * 1024; // 14 MB - safety margin under BSON 16MB

/**
 * Genera PDF leyendo raw JSON desde Mongo y actualiza el documento.
 * - analisisId: string/ObjectId
 * - usuarioId: string/ObjectId (owner)
 * - correlationId: optional string
 *
 * Retorna: { ok: true, result } o { ok: false, error }
 */
export async function generarPdfDesdeRaw(analisisId, usuarioId, correlationId = null) {
  const corr = correlationId || `worker_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const startedAt = Date.now();

  dragon.respira('generarPdfDesdeRaw start', MODULE, 'WORKER_START', { analisisId, usuarioId, corr });

  let doc;
  try {
    // Cargar documento COMO documento (no lean) para usar métodos de instancia
    doc = await AnalisisArchivo.findById(analisisId).select('+rawJsonCompressed rawStored rawHash rawSize rutas informeEstado informeIntentos usuarioId imagenId');
    if (!doc) {
      dragon.sePreocupa('Analisis no encontrado en worker', MODULE, 'WORKER_ANALYSIS_NOT_FOUND', { analisisId, usuarioId, corr });
      return { ok: false, error: 'Analisis no encontrado' };
    }

    // Comprobación básica de propietario (si usuarioId provisto)
    try {
      if (usuarioId && String(doc.usuarioId) !== String(usuarioId)) {
        dragon.sePreocupa('Access denied: usuario no propietario', MODULE, 'WORKER_ACCESS_DENIED', { analisisId, usuarioId, owner: String(doc.usuarioId), corr });
        return { ok: false, error: 'Permisos insuficientes' };
      }
    } catch (e) {
      // ignore casting issues, log for tracing
      dragon.sePreocupa('Owner check failed (continuando)', MODULE, 'WORKER_OWNER_CHECK_ERROR', { analisisId, usuarioId, error: e.message, corr });
    }

    // Evitar concurrencia: si ya está generando, salir limpio (idempotente)
    if (doc.informeEstado === 'generando') {
      dragon.respira('Informe ya en generación - skipping', MODULE, 'WORKER_ALREADY_GENERATING', { analisisId, corr });
      return { ok: false, error: 'Informe ya en generación' };
    }

    // Si no hay rawStored, nada que hacer (posible fallback: usar resultado, pero worker es raw-first)
    if (!doc.rawStored) {
      dragon.sePreocupa('No rawJson almacenado - worker no puede generar desde raw', MODULE, 'WORKER_NO_RAW', { analisisId, corr });
      return { ok: false, error: 'No hay rawJson almacenado' };
    }

    // Comprobar tamaño para evitar problemas BSON / mem
    if (doc.rawSize && doc.rawSize > RAW_SIZE_LIMIT_BYTES) {
      dragon.sePreocupa('Raw JSON demasiado grande para almacenar en documento (sugerir GridFS/S3)', MODULE, 'WORKER_RAW_TOO_LARGE', {
        analisisId, rawSize: doc.rawSize, limit: RAW_SIZE_LIMIT_BYTES, corr
      });
      // Marcar error en documento de forma segura
      doc.informeEstado = 'error';
      doc.informeIntentos = (doc.informeIntentos || 0) + 1;
      doc.informeUltimoError = `rawJson too large (${doc.rawSize} bytes) - use GridFS/S3`;
      await doc.save().catch(() => {});
      return { ok: false, error: 'Raw JSON demasiado grande, use GridFS/S3' };
    }

    // Mark generating (short lock)
    doc.informeEstado = 'generando';
    doc.informeIntentos = (doc.informeIntentos || 0) + 1;
    await doc.save();

    // Obtener rawJson con ayuda del método (maneja descompresión y recargas)
    let rawJson;
    try {
      rawJson = await doc.getRawJson();
      if (!rawJson) {
        throw new Error('rawJson vacío o no recuperable');
      }
      dragon.sonrie('rawJson loaded for worker generation', MODULE, 'WORKER_RAW_LOADED', { analisisId, rawHash: doc.rawHash, size: doc.rawSize, corr });
    } catch (errRaw) {
      // Registrar y marcar error
      dragon.sePreocupa('Error cargando rawJson en worker', MODULE, 'WORKER_RAW_LOAD_ERROR', { analisisId, error: errRaw.message, corr });
      doc.informeEstado = 'error';
      doc.informeUltimoError = `raw_load_error: ${String(errRaw.message).substring(0, 200)}`;
      await doc.save().catch(() => {});
      return { ok: false, error: 'Error cargando rawJson: ' + errRaw.message };
    }

    // Llamar a generarInforme con override (idempotente)
    let resultadoInforme;
    try {
      resultadoInforme = await generarInforme(analisisId, String(doc.usuarioId), { correlationId: corr, datosInformeOverride: rawJson });
      dragon.sonrie('generarInforme worker result', MODULE, 'WORKER_GENERAR_INFORME_OK', { analisisId, pdfPath: resultadoInforme?.pdfPath, corr });
    } catch (genErr) {
      dragon.agoniza('generarInforme falló en worker', genErr, MODULE, 'WORKER_GENERAR_INFORME_ERROR', { analisisId, error: genErr.message, corr });
      // Actualizar doc con fallo
      doc.informeEstado = 'error';
      doc.informeUltimoError = String(genErr.message).substring(0, 1000);
      await doc.save().catch(() => {});
      return { ok: false, error: 'Error generando informe: ' + genErr.message };
    }

    // Actualizar documento con ruta PDF y estado 'generado'
    try {
      doc.rutas = { ...(doc.rutas || {}), informePDF: resultadoInforme.pdfPath || (doc.rutas || {}).informePDF };
      doc.informeEstado = 'generado';
      doc.informeGeneradoAt = new Date();
      // reset error field
      if (doc.informeUltimoError) doc.informeUltimoError = null;
      await doc.save();
      const durationMs = Date.now() - startedAt;
      dragon.sonrie('Worker complete - PDF generated and doc updated', MODULE, 'WORKER_COMPLETE', {
        analisisId, pdfPath: resultadoInforme.pdfPath, durationMs, corr
      });
    } catch (updateErr) {
      dragon.sePreocupa('No se pudo actualizar documento tras generar PDF (pero PDF existe)', MODULE, 'WORKER_UPDATE_DOC_ERROR', {
        analisisId, error: updateErr.message, corr
      });
      // We still return success because PDF generation succeeded
    }

    return { ok: true, result: { pdfPath: resultadoInforme.pdfPath } };

  } catch (error) {
    dragon.agoniza('Worker fatal error', error, MODULE, 'WORKER_FATAL', { analisisId, usuarioId, corr });
    // Best-effort attempt to mark document as error
    try {
      if (doc) {
        doc.informeEstado = 'error';
        doc.informeUltimoError = String(error.message).substring(0, 1000);
        await doc.save().catch(() => {});
      }
    } catch (_) { /* ignore */ }
    return { ok: false, error: error.message || 'unknown' };
  }
}

// Export default convenience wrapper
export default generarPdfDesdeRaw;
