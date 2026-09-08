/**
 * DRAGON3 FAANG - ANALIZADOR PDF MULTICAPA ENTERPRISE + CABECERA BINARIA + CAPA2 DINÁMICA
 * Autor: Gustavo Herraiz (Lead Architect)
 * Versión: 3.3.0-FAANG
 * Fecha: 2025-08-22
 * Propósito: Análisis forense multicapa de PDFs (EXIF + FirmasDigitales + CabeceraBinaria + Capa 2 dinámica).
 * Fusiona resultados, pondera adaptativamente según relevancia forense, llama a Capa 2 si la decisión de Capa 1 es Artificial/Indeterminado/confianza baja.
 * Genera salida FAANG-compatible con server.js. Logging y trazabilidad FAANG/KISS. Entrada/salida estándar, auditabilidad total.
 * Dependencias: logger.js, winston.js, analizadores PDF (modular), DragonError.
 * Ejemplo de uso: const resultado = await analizarPDF(params);
 */

import dragon from '../../utilidades/logger.js';
import { DragonError } from '../../utilidades/errores/DragonError.js';

import { analizarPdfExif } from './analizadores/analizadorPdfExif.js';
import { analizarFirmasDigitalesPDF } from './analizadores/analizadorFirmasDigitalesPDF.js';
import { analizarCabecerasPdf } from './analizadores/analizadorCabecerasPdf.js';

// Importar Capa 2 (analizadores en /pdf/capa2/)
import { analizarTextoIA } from './capa2/analizadorTextoIA.js';
// Si hay más analizadores de Capa 2, importarlos aquí

export const version = '3.3.0-FAANG';
export const dragonInterface = 'dragon3';

/**
 * Fusión e inferencia explicable de resultados de analizadores PDF (EXIF, FirmasDigitales, CabeceraBinaria).
 * Algoritmo adaptativo: pondera según relevancia forense real.
 * @param {Object} resultados - { metadata, firmas, cabeceras }
 * @returns {Object} Resultado fusionado FAANG
 */
function fusionarResultadosPDF(resultados) {
  let pesoEXIF = 0.4, pesoFirmas = 0.4, pesoCabeceras = 0.2;
  let motivos = [];
  let tags = [];

  if (
    resultados.cabeceras &&
    resultados.cabeceras.decision === "Artificial" &&
    resultados.cabeceras.confianza < 0.5
  ) {
    pesoCabeceras = 0.5; pesoEXIF = 0.25; pesoFirmas = 0.25;
    motivos.push(`CabeceraBinaria: ${resultados.cabeceras.motivos?.[0] || resultados.cabeceras.explicacionExtendida?.[0] || ''}`);
    if (resultados.cabeceras.etiquetas) tags.push(...resultados.cabeceras.etiquetas);
  }
  if (resultados.metadata?.confianza) {
    motivos.push(`Metadatos: ${resultados.metadata.motivos?.[0] || resultados.metadata.explicacion || ''}`);
    if (resultados.metadata.etiquetas) tags.push(...resultados.metadata.etiquetas);
  }
  if (resultados.firmas?.confianza) {
    motivos.push(`Firmas: ${resultados.firmas.motivos?.[0] || resultados.firmas.explicacion || ''}`);
    if (resultados.firmas.etiquetas) tags.push(...resultados.firmas.etiquetas);
  }
  if (pesoCabeceras === 0.2 && resultados.cabeceras?.confianza !== undefined) {
    motivos.push(`CabeceraBinaria: ${resultados.cabeceras.motivos?.[0] || resultados.cabeceras.explicacionExtendida?.[0] || ''}`);
    if (resultados.cabeceras.etiquetas) tags.push(...resultados.cabeceras.etiquetas);
  }
  const scoreFusionado =
    (resultados.metadata?.confianza || 0) * pesoEXIF +
    (resultados.firmas?.confianza || 0) * pesoFirmas +
    (resultados.cabeceras?.confianza || 0) * pesoCabeceras;
  const confianza = Math.max(0, Math.min(1, scoreFusionado));
  let decision = "Indeterminado";
  let modeloPrincipal = "EXIF";
  if (pesoCabeceras >= 0.5 && resultados.cabeceras?.decision === "Artificial") {
    decision = "Artificial";
    modeloPrincipal = "CabecerasPDF";
  } else if (
    resultados.metadata?.decision === "Humano" &&
    resultados.firmas?.decision === "Humano" &&
    resultados.cabeceras?.decision === "Humano" &&
    confianza >= 0.85
  ) {
    decision = "Humano";
    modeloPrincipal = "EXIF";
  } else if (confianza < 0.6) {
    decision = "Artificial";
    if (
      resultados.firmas?.confianza > resultados.metadata?.confianza &&
      resultados.firmas?.confianza > resultados.cabeceras?.confianza
    ) {
      modeloPrincipal = "FirmasDigitales";
    } else if (resultados.cabeceras?.confianza > resultados.metadata?.confianza && resultados.cabeceras?.confianza > resultados.firmas?.confianza) {
      modeloPrincipal = "CabecerasPDF";
    }
  }
  return {
    decision,
    confianza,
    modeloPrincipal,
    explicacion: motivos.join(' | '),
    score: confianza,
    etiquetas: Array.from(new Set(tags)),
    motivos,
    fusionScore: scoreFusionado
  };
}

/**
 * =================================================================================================
 * DRAGON3 FAANG ENTERPRISE
 * Función: analizarPDF
 * Versión: 3.3.1-FAANG (patch estado enum + modoAnalisis + robustez y explicabilidad frontend)
 * Autor: Gustavo Herraiz (Lead Architect) / Ajustes Enterprise
 * -------------------------------------------------------------------------------------------------
 * PROPÓSITO:
 *   Análisis forense multicapa de archivos PDF:
 *     - Capa 1 paralela: Metadatos / Firmas Digitales / Cabecera Binaria
 *     - Fusión adaptativa con ponderación contextual
 *     - Escalado a Capa 2 (Texto IA u otros) sólo si:
 *         * decisión inicial Artificial, o
 *         * Indeterminado, o
 *         * confianza < umbral (0.7)
 *
 * CAMBIO CRÍTICO (Root Cause Fix):
 *   Antes: se devolvía resultado.estado = 'solo-capa1' | 'multicapa'
 *   El schema AnalisisArchivo sólo admite: ["procesando","completado","error","timeout","cancelado"]
 *   Esto generaba ValidationError al guardar PDFs.
 *   Ahora:
 *     - Se introduce 'modoAnalisis' (solo-capa1 / multicapa) en:
 *         resumen.modoAnalisis
 *         detalles.ensemble.modoAnalisis
 *         paraInforme.contextoAnalisis.modoAnalisis
 *     - El campo resultado.estado SIEMPRE = "completado" (enum válido)
 *
 * SALIDA ESTÁNDAR FAANG:
 * {
 *   resumen: {
 *     decision: "Humano" | "Artificial" | "Indeterminado",
 *     confianza: Number(0..1),
 *     modeloPrincipal: String,
 *     explicacion: String,
 *     score: Number,
 *     etiquetas: [String],
 *     archivoId, usuarioId, correlationId, nombreOriginal,
 *     timestamp, modoAnalisis
 *   },
 *   detalles: {
 *     modelos: [ ... ],
 *     ensemble: { metodo, decisiones[], confianzaGlobal, scoreGlobal, modoAnalisis },
 *     ...
 *   },
 *   paraInforme: {...},
 *   estado: "completado",
 *   tipo: "pdf",
 *   imagenId: archivoId,
 *   metadata: { analyzerType:"pdf", processingTime, correlationId, timestamp, version },
 *   firmaDigital: (normalizado para frontend),
 *   exif: { completitud, modelo }
 * }
 *
 * COMPATIBILIDAD FRONTEND:
 *   - Se añaden campos resultado.firmaDigital y resultado.exif para que la lógica
 *     de generarExplicabilidad (mi-espacio.js) no quede vacía en PDFs.
 *
 * ROBUSTEZ:
 *   - Validaciones exhaustivas de parámetros
 *   - Manejo de errores por capa con DragonError
 *   - Trazabilidad total (correlationId, archivoId)
 *   - Logs estructurados (respira / sePreocupa / agoniza / mideRendimiento)
 *
 * RENDIMIENTO:
 *   - Ejecución paralela Capa 1 (Promise.all)
 *   - Capa 2 sólo bajo condición
 *
 * @param {Object} params
 * @param {string} params.rutaArchivo     Ruta absoluta al PDF en disco
 * @param {string} params.archivoId       ID interno único asignado al archivo
 * @param {string} params.correlationId   ID de correlación para trazabilidad end-to-end
 * @param {string} [params.nombreOriginal] Nombre original subido
 * @param {string} [params.usuarioId]     ID usuario (si autenticado)
 * @param {string} [params.clientId]      Identificador lógico cliente/proceso
 *
 * @returns {Promise<Object>} Resultado FAANG PDF normalizado (ver estructura arriba)
 *
 * =================================================================================================
 */

export async function analizarPDF(params) {
  const start = Date.now();

  // ========================= 1. VALIDACIÓN DE ENTRADA =========================
  if (!params || typeof params !== 'object') {
    const error = new DragonError(
      'Parámetros ausentes o inválidos (esperado objeto)',
      'PARAM_INVALID',
      'critical',
      'validation',
      { recibido: typeof params }
    );
    dragon.agoniza('Parámetros PDF inválidos', error, 'analizadorPDF', 'VALIDATION_ERROR_ROOT', { paramsType: typeof params });
    throw error;
  }

  const {
    rutaArchivo,
    archivoId,
    correlationId,
    nombreOriginal = null,
    usuarioId = null,
    clientId = 'pdf_analyzer'
  } = params;

  if (!rutaArchivo || !archivoId || !correlationId) {
    const error = new DragonError(
      'Faltan parámetros obligatorios (rutaArchivo, archivoId, correlationId)',
      'PARAM_MISSING',
      'critical',
      'validation',
      { rutaArchivo: !!rutaArchivo, archivoId: !!archivoId, correlationId: !!correlationId }
    );
    dragon.agoniza('Faltan parámetros PDF', error, 'analizadorPDF', 'VALIDATION_MISSING', { archivoId, correlationId });
    throw error;
  }

  dragon.sonrie(
    'Inicio análisis PDF multicapa (EXIF + FirmasDigitales + CabeceraBinaria)',
    'analizadorPDF',
    'ANALYSIS_START',
    { archivoId, correlationId, nombreOriginal, usuarioId, clientId, rutaArchivo }
  );

  // ========================= 2. CAPA 1 (ANÁLISIS PARALELO) =========================
  let metadataRes, firmasRes, cabecerasRes;
  const erroresModelos = [];
  let modoAnalisis = 'solo-capa1'; // (antes "estado" inválido para el schema)

  try {
    [metadataRes, firmasRes, cabecerasRes] = await Promise.all([
      analizarPdfExif(params),
      analizarFirmasDigitalesPDF(params),
      analizarCabecerasPdf(params)
    ]);
  } catch (error) {
    dragon.agoniza(
      'Error en análisis PDF multicapa (capa 1)',
      error,
      'analizadorPDF',
      'MULTICAPA_ERROR',
      { archivoId, correlationId, rutaArchivo }
    );
    throw new DragonError(
      'Error en análisis PDF multicapa: ' + error.message,
      'MULTICAPA_FAILED',
      'high',
      'application',
      { archivoId, correlationId, rutaArchivo }
    );
  }

  // ========================= 3. FUSIÓN CAPA 1 =========================
  const fusion = fusionarResultadosPDF({
    metadata: metadataRes,
    firmas: firmasRes,
    cabeceras: cabecerasRes
  });

  // ========================= 4. CRITERIO CAPA 2 (TEXTO IA) =========================
  if (
    fusion.decision === 'Artificial' ||
    fusion.decision === 'Indeterminado' ||
    fusion.confianza < 0.7
  ) {
    modoAnalisis = 'multicapa';
    dragon.sePreocupa(
      'Capa 1 no concluyente, ejecutando Capa 2 PDF',
      'analizadorPDF',
      'MULTICAPA_TRIGGER',
      { archivoId, correlationId, decision: fusion.decision, confianza: fusion.confianza }
    );

    let textoIARes;
    try {
      textoIARes = await analizarTextoIA(params);
    } catch (error) {
      dragon.agoniza(
        'Error en análisis de texto IA (Capa 2)',
        error,
        'analizadorPDF',
        'CAPA2_ERROR',
        { archivoId, correlationId, rutaArchivo }
      );
      erroresModelos.push({ modelo: 'analizadorTextoIA', error: error.message });
    }

    if (textoIARes) {
      // Prevalece si IA detecta Artificial de forma fuerte
      if (textoIARes.decision === 'Artificial' && textoIARes.confianza > 0.7) {
        fusion.decision = 'Artificial';
        fusion.confianza = Math.max(fusion.confianza, textoIARes.confianza);
        fusion.modeloPrincipal = 'TextoIA';
        fusion.explicacion += ` | Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`;
        fusion.motivos.push(`Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`);
      }
      // Prevalece si IA dice Humano con alta confianza
      else if (textoIARes.decision === 'Humano' && textoIARes.confianza > 0.85) {
        fusion.decision = 'Humano';
        fusion.confianza = Math.max(fusion.confianza, textoIARes.confianza);
        fusion.modeloPrincipal = 'TextoIA';
        fusion.explicacion += ` | Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`;
        fusion.motivos.push(`Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`);
      }
      // Ajuste promedio si no definió claro
      else {
        fusion.confianza = (fusion.confianza + textoIARes.confianza) / 2;
        fusion.explicacion += ` | Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`;
        fusion.motivos.push(`Capa2-TextoIA: ${textoIARes.explicacionExtendida?.[0] || ''}`);
      }
    }
  }

  // ========================= 5. BLOQUE RESUMEN =========================
  const resumen = {
    decision: fusion.decision,
    confianza: fusion.confianza,
    modeloPrincipal: fusion.modeloPrincipal,
    explicacion: fusion.explicacion,
    score: fusion.score,
    etiquetas: fusion.etiquetas,
    archivoId,
    usuarioId,
    correlationId,
    nombreOriginal,
    timestamp:
      metadataRes.timestamp ||
      firmasRes.timestamp ||
      cabecerasRes.timestamp ||
      new Date().toISOString(),
    modoAnalisis // NUEVO: describe pipeline real
  };

  // ========================= 6. LISTA MODELOS INDIVIDUALES =========================
  const modelos = [
    {
      nombre: 'EXIF',
      version: metadataRes.version || version,
      decision: metadataRes.esAutentico
        ? 'Humano'
        : (metadataRes.esAutentico === false ? 'Artificial' : 'Indeterminado'),
      confianza: metadataRes.confianza,
      score: metadataRes.confianza,
      tiempoMs: metadataRes.processingTime,
      explicacion: metadataRes.motivos?.join(' | ') || metadataRes.mensaje,
      detalles: metadataRes.detalles || metadataRes
    },
    {
      nombre: 'FirmasDigitales',
      version: firmasRes.version || version,
      decision: firmasRes.esAutentico
        ? 'Humano'
        : (firmasRes.esAutentico === false ? 'Artificial' : 'Indeterminado'),
      confianza: firmasRes.confianza,
      score: firmasRes.confianza,
      tiempoMs: firmasRes.processingTime,
      explicacion: firmasRes.motivos?.join(' | ') || firmasRes.mensaje,
      detalles: firmasRes.detalles || firmasRes
    },
    {
      nombre: 'CabecerasPDF',
      version: cabecerasRes.version || version,
      decision: cabecerasRes.esAutentico
        ? 'Humano'
        : (cabecerasRes.esAutentico === false ? 'Artificial' : 'Indeterminado'),
      confianza: cabecerasRes.confianza,
      score: cabecerasRes.confianza,
      tiempoMs: cabecerasRes.processingTime,
      explicacion: cabecerasRes.motivos?.join(' | ') || cabecerasRes.mensaje,
      detalles: cabecerasRes.detalles || cabecerasRes
    }
  ];

  if (modoAnalisis === 'multicapa') {
    // Filtra motivos de capa 2
    const capa2Explicacion = fusion.motivos
      ?.filter(m => m.startsWith('Capa2-TextoIA'))
      .join(' | ') || '';
    modelos.push({
      nombre: 'TextoIA',
      version,
      decision: fusion.modeloPrincipal === 'TextoIA' ? fusion.decision : 'Indeterminado',
      confianza: fusion.modeloPrincipal === 'TextoIA' ? fusion.confianza : null,
      tiempoMs: undefined,
      explicacion: capa2Explicacion,
      detalles: {}
    });
  }

  // ========================= 7. DETALLES / ENSEMBLE =========================
  const detalles = {
    modelos,
    ensemble: {
      metodo: modoAnalisis === 'multicapa' ? 'fusion-multicapa' : 'fusion',
      decisiones: modelos.map(m => m.decision),
      confianzaGlobal: fusion.confianza,
      scoreGlobal: fusion.score,
      modoAnalisis
    },
    patronesDetectados: [
      ...(metadataRes.patronesDetectados || []),
      ...(firmasRes.patronesDetectados || []),
      ...(cabecerasRes.patronesDetectados || [])
    ],
    activacionesRed: [],
    vectorCaracteristicas: [],
    erroresModelos
  };

  // ========================= 8. PARA INFORME =========================
  const paraInforme = {
    explicacionExtendida: fusion.explicacion,
    riesgosDetectados: [
      ...(metadataRes.anomalías || []),
      ...(firmasRes.anomalías || []),
      ...(cabecerasRes.anomalías || [])
    ],
    recomendaciones: [],
    contextoAnalisis: {
      archivoId,
      nombreOriginal,
      usuarioId,
      correlationId,
      modoAnalisis
    },
    metadatosArchivo: {
      exif: metadataRes.detalles || metadataRes,
      firmasDigitales: firmasRes.detalles || firmasRes,
      cabeceraBinaria: cabecerasRes.detalles || cabecerasRes
    }
  };

  // ========================= 9. RESULTADO FINAL (estado COMPLIANT) =========================
  const processingTime = Date.now() - start;

  const resultado = {
    resumen,
    detalles,
    paraInforme,
    estado: 'completado',       // <-- ENUM VÁLIDO PARA EL SCHEMA
    error: undefined,
    tipo: 'pdf',
    imagenId: archivoId,
    mensaje: fusion.explicacion,
    version,
    timestamp: resumen.timestamp,
    processingTime,
    metadata: {
      analyzerType: 'pdf',
      processingTime,
      correlationId,
      timestamp: resumen.timestamp,
      version
    }
  };

  // ========================= 10. CAMPOS EXTRA PARA FRONTEND EXPLICABILIDAD =========================
  // (Evita que mi-espacio.js muestre explicabilidad vacía en PDFs)
  try {
    const meta = paraInforme.metadatosArchivo;
    resultado.firmaDigital =
      meta?.firmasDigitales?.estado ||
      meta?.firmasDigitales?.validez ||
      meta?.firmasDigitales?.status ||
      'desconocida';

    resultado.exif = {
      completitud:
        meta?.exif?.completitud ||
        meta?.exif?.completeness ||
        meta?.exif?.ratio ||
        0,
      modelo:
        meta?.exif?.modelo ||
        meta?.exif?.model ||
        meta?.exif?.cameraModel ||
        null
    };
  } catch (e) {
    // No interrumpir; sólo log
    dragon.sePreocupa(
      'No se pudieron mapear campos explicativos para frontend PDF',
      'analizadorPDF',
      'EXPLICABILIDAD_MAPPING_WARN',
      { archivoId, correlationId, error: e.message }
    );
  }

  // ========================= 11. LOGGING & MÉTRICAS =========================
  dragon.sonrie(
    `Análisis PDF completado (${modoAnalisis === 'multicapa' ? 'Capa1+Capa2' : 'solo Capa1'})`,
    'analizadorPDF',
    'ANALYSIS_SUCCESS',
    {
      archivoId,
      correlationId,
      modoAnalisis,
      decision: resumen.decision,
      confianza: resumen.confianza,
      processingTime
    }
  );
  dragon.mideRendimiento('analizarPDF', processingTime, 'analizadorPDF', {
    archivoId,
    modoAnalisis
  });

  return resultado;
}
