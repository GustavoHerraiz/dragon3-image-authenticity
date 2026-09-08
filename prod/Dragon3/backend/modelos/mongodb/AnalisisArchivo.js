/**
 * ====================================================================
 * DRAGON3 FAANG ENTERPRISE - MODELO MONGODB ANÁLISIS ARCHIVO
 * ====================================================================
 *
 * Versión: 2025-11-16 — FAANG Enterprise (modificado)
 *
 * Cambios principales:
 * - Añadido almacenamiento del JSON crudo (rawJsonCompressed) GZIP dentro de Mongo
 *   (select: false para evitar cargas innecesarias).
 * - Añadido resultadoResumen indexable para listados/consultas rápidas.
 * - Métodos: saveRawJson(jsonObj), getRawJson() para guardar/recuperar el snapshot.
 * - Retenedores de trazabilidad: rawHash, rawSize, rawTimestamp, rawStored.
 * - Conserva toda la funcionalidad anterior (marcarCompletado, marcarError, actualizarEstadoInforme, etc.).
 *
 * Notas operativas:
 * - rawJsonCompressed usa Buffer y está sujeto al límite BSON (16MB). Si esperas JSON >16MB usa GridFS/S3.
 * - rawJsonCompressed es select:false por defecto; en consultas que lo necesiten usar .select('+rawJsonCompressed').
 * - resultadoResumen almacena campos minimalistas y indexados para búsquedas rápidas y UI de historial.
 *
 * Seguridad & prácticas:
 * - No usar console.log en producción; usar logger del proyecto (dragon.*) en servicios que llamen a estos métodos.
 * - Mantener rawHash (SHA256) para integridad; no modificar rawJson una vez guardado (inmutable por convención).
 *
 * ====================================================================
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import zlib from 'zlib';

const { Schema } = mongoose;

/**
 * Schema principal para análisis de archivos FAANG Enterprise
 * - resultado: mongoose.Schema.Types.Mixed (estructura flexible)
 */
const AnalisisArchivoSchema = new Schema({
  // =================== TRAZABILIDAD Y USUARIO ===================
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
    index: true,
    description: "ID del usuario que solicita el análisis"
  },
  usuarioTipo: {
    type: String,
    enum: ['anonimo', 'registrado', 'admin', 'superadmin', 'enterprise'],
    default: 'registrado',
    index: true,
    description: "Tipo de usuario que originó el análisis"
  },
  nombreArchivo: {
    type: String,
    required: true,
    maxlength: 255,
    description: "Nombre del archivo almacenado (almacenado en FS)"
  },
  nombreOriginal: {
    type: String,
    required: true,
    maxlength: 255,
    description: "Nombre original del archivo subido por el usuario"
  },
  tipo: {
    type: String,
    enum: ['imagen', 'pdf', 'video', 'audio'],
    required: true,
    index: true,
    description: "Tipo de archivo analizado"
  },

  // =================== RESULTADO FLEXIBLE ===================
  // Guarda el resultado resumido/transformado (para uso en UI y compatibilidad)
  resultado: {
    type: Schema.Types.Mixed,
    required: true,
    description: "Resultados del análisis en estructura flexible (puede ser grande)"
  },

  // ====== NUEVOS: resumen indexable para búsquedas y listados rápidos ======
  resultadoResumen: {
    decision: { type: String, index: true, default: null },
    confianza: { type: Number, default: null },             // porcentaje 0-100 (enteros)
    modeloPrincipal: { type: String, default: null },
    archivoId: { type: String, index: true, default: null },
    nombreOriginal: { type: String, default: null },
    timestamp: { type: Date, default: null }
  },

  hashArchivo: {
    type: String,
    required: true,
    index: true,
    description: "Hash único del archivo (SHA-256)"
  },
  imagenId: {
    type: String,
    required: true,
    index: true,
    description: "ID único de la imagen/archivo"
  },

  // =================== RUTAS ===================
  mensaje: {
    type: String,
    maxlength: 1000,
    default: null,
    description: "Mensaje descriptivo de estado/resultado"
  },

  rutas: {
    archivoOriginal: { type: String, required: true },
    archivosTemporales: [String],
    informePDF: String
  },

  // =================== INFORMES ===================
  informeEstado: {
    type: String,
    enum: ['pendiente', 'generando', 'generado', 'error'],
    default: 'pendiente',
    description: "Estado del informe PDF/JSON forense"
  },
  informeIntentos: {
    type: Number,
    default: 0,
    description: "Número de intentos de generación de informe"
  },

  // =================== SESIÓN Y CORRELATION ===================
  correlationId: {
    type: String,
    required: true,
    index: true,
    description: "ID único para tracking de request"
  },

  sesionInfo: {
    timestamp: { type: Date, default: Date.now }
  },

  // =================== RAW JSON STORAGE (EN MONGO, comprimido) ===================
  // Guardamos aquí el JSON final del análisis, comprimido (gzip). select:false para no traerlo por defecto.
  rawStored: {
    type: Boolean,
    default: false,
    description: "Indica si el JSON crudo está persistido en este documento"
  },
  rawJsonCompressed: {
    type: Buffer,
    select: false,
    description: "JSON crudo comprimido (gzip). Use .select('+rawJsonCompressed') para leer"
  },
  rawCompressed: {
    type: Boolean,
    default: false,
    description: "Indica si rawJsonCompressed está comprimido (gzip)"
  },
  rawHash: {
    type: String,
    index: true,
    default: null,
    description: "SHA256 del JSON crudo (para integridad y deduplicación)"
  },
  rawSize: {
    type: Number,
    default: 0,
    description: "Tamaño en bytes del payload almacenado (pos-compress si aplica)"
  },
  rawTimestamp: {
    type: Date,
    default: null,
    description: "Timestamp cuando se guardó el rawJson"
  },

  // =================== RED SUPERIOR / PERFORMANCE / AUDITORÍA ===================
  redSuperior: {
    procesadoEnRed: { type: Boolean, default: false },
    nodosProcesamiento: [String]
  },

  performance: {
    faseAnalisis: { modelosUtilizados: [String] }
  },

  auditoria: {
    nivelSeguridad: {
      type: String,
      enum: ['Bajo', 'Medio', 'Alto', 'Critico'],
      default: 'Medio'
    },
    fechaCreacion: { type: Date, default: Date.now }
  }

}, {
  timestamps: true,  // createdAt, updatedAt automáticos
  collection: 'analisis_archivos'
});

// =================== ÍNDICES OPTIMIZADOS ===================

AnalisisArchivoSchema.index({ usuarioId: 1, createdAt: -1 });
AnalisisArchivoSchema.index({ hashArchivo: 1 });
AnalisisArchivoSchema.index({ correlationId: 1 });
AnalisisArchivoSchema.index({ imagenId: 1 });
AnalisisArchivoSchema.index({ tipo: 1, createdAt: -1 });
AnalisisArchivoSchema.index({ informeEstado: 1, createdAt: -1 });
AnalisisArchivoSchema.index({ "resultadoResumen.decision": 1, "resultadoResumen.confianza": -1 });

// =================== MÉTODOS DE INSTANCIA ===================

/**
 * Marcar análisis como completado (FAANG)
 * - resultadoCompleto: objeto con la estructura final devuelta por los analizadores
 * - mensaje: texto opcional
 */
AnalisisArchivoSchema.methods.marcarCompletado = async function (resultadoCompleto, mensaje = "Análisis completado") {
  // combinar prudente: mantener resultado existente y mezclar
  this.resultado = Object.assign({}, this.resultado || {}, resultadoCompleto || {});
  this.mensaje = mensaje;

  if (!this.resultado.estado) {
    this.resultado.estado = "completado";
  }

  // actualizar resultadoResumen si hay resumen en el payload
  try {
    if (resultadoCompleto && resultadoCompleto.resumen) {
  this.resultadoResumen = {
    decision: resultadoCompleto.resumen.decision || this.resultadoResumen?.decision || "Indeterminado",
    confianza: typeof resultadoCompleto.resumen.confianza === 'number' ?
      Math.round((resultadoCompleto.resumen.confianza || 0) * 100) : this.resultadoResumen?.confianza || 0,
    modeloPrincipal: resultadoCompleto.resumen.modeloPrincipal || this.resultadoResumen?.modeloPrincipal || "Dragon3_FAANG",
    archivoId: this.imagenId, // ← USA imagenId DEL DOCUMENTO
    nombreOriginal: this.nombreOriginal, // ← USA nombreOriginal DEL DOCUMENTO
    timestamp: this.createdAt // ← USA createdAt DEL DOCUMENTO
  };
}
  } catch (e) {
    // No interrumpir el guardado por fallo al rellenar resumen
  }

  return this.save();
};

/**
 * Marcar análisis con error (FAANG)
 */
AnalisisArchivoSchema.methods.marcarError = function (errorInfo, mensaje = "Error en análisis") {
  this.resultado = Object.assign({}, this.resultado || {}, {
    estado: "error",
    error: errorInfo
  });
  this.mensaje = mensaje;
  return this.save();
};

/**
 * Actualizar estado del informe (PDF)
 */
AnalisisArchivoSchema.methods.actualizarEstadoInforme = function (estado, error = null) {
  this.informeEstado = estado;
  if (error) {
    this.informeUltimoError = error;
    this.informeIntentos = (this.informeIntentos || 0) + 1;
  }
  return this.save();
};

/**
 * Marcar procesamiento en Red Superior
 */
AnalisisArchivoSchema.methods.marcarRedSuperior = function (nodos) {
  this.redSuperior.procesadoEnRed = true;
  this.redSuperior.nodosProcesamiento = nodos;
  return this.save();
};

/**
 * Obtener datos para informe PDF (FAANG)
 * - Mantiene compatibilidad con generarInforme.js que espera ciertas claves
 */
AnalisisArchivoSchema.methods.obtenerDatosParaInforme = function () {
  return {
    id: this._id,
    correlationId: this.correlationId,
    tipo: this.tipo,
    nombreOriginal: this.nombreOriginal,
    fechaAnalisis: this.createdAt,
    resultado: this.resultado,
    performance: this.performance,
    auditoria: this.auditoria,
    redSuperior: this.redSuperior,
    rutas: this.rutas
  };
};

// =================== MÉTODOS RAW JSON: GUARDAR Y RECUPERAR ===================

/**
 * Guarda JSON crudo comprimido (gzip) en el documento.
 * - jsonObj: objeto JSON completo de análisis
 * - options: { compress: true } (por defecto true)
 *
 * Comportamiento:
 * - Calcula SHA256 del JSON sin comprimir y lo guarda en rawHash.
 * - Comprime con gzip si options.compress === true y guarda en rawJsonCompressed.
 * - Rellena rawSize, rawTimestamp, rawStored.
 * - Actualiza resultadoResumen si jsonObj.resumen está presente.
 *
 * Nota: este método persiste el documento (this.save()).
 */
AnalisisArchivoSchema.methods.saveRawJson = async function (jsonObj, options = { compress: true }) {
  if (!jsonObj) throw new Error('jsonObj es requerido para saveRawJson');

  const jsonStr = JSON.stringify(jsonObj);
  const hash = crypto.createHash('sha256').update(jsonStr).digest('hex');

  let buffer = Buffer.from(jsonStr, 'utf8');
  let compressed = false;

  if (options.compress) {
    buffer = zlib.gzipSync(buffer);
    compressed = true;
  }

  this.rawJsonCompressed = buffer;
  this.rawCompressed = compressed;
  this.rawHash = hash;
  this.rawSize = buffer.length;
  this.rawTimestamp = new Date();
  this.rawStored = true;

  // Rellenar resultadoResumen de forma segura
  try {
    if (jsonObj && jsonObj.resumen) {
      this.resultadoResumen = {
        decision: jsonObj.resumen.decision || this.resultadoResumen.decision,
        confianza: typeof jsonObj.resumen.confianza === 'number' ? Math.round((jsonObj.resumen.confianza || 0) * 100) : this.resultadoResumen.confianza,
        modeloPrincipal: jsonObj.resumen.modeloPrincipal || this.resultadoResumen.modeloPrincipal,
        archivoId: jsonObj.resumen.archivoId || this.resultadoResumen.archivoId,
        nombreOriginal: jsonObj.resumen.nombreOriginal || this.resultadoResumen.nombreOriginal,
        timestamp: jsonObj.resumen.timestamp ? new Date(jsonObj.resumen.timestamp) : (this.resultadoResumen.timestamp || new Date())
      };
    }
  } catch (err) {
    // No interrumpir el guardado por fallo al rellenar resumen
  }

  return this.save();
};

/**
 * Lee y devuelve el JSON crudo (descomprime si es necesario).
 * - Si rawJsonCompressed no fue cargado (select:false), recarga sólo ese campo.
 * - Retorna el objeto JSON completo (parsed).
 */
AnalisisArchivoSchema.methods.getRawJson = async function () {
  if (!this.rawStored) return null;

  let buf = this.rawJsonCompressed;

  if (!buf) {
    // recargar campo comprimido sólo
    const doc = await this.constructor.findById(this._id).select('+rawJsonCompressed rawCompressed');
    if (!doc || !doc.rawJsonCompressed) return null;
    buf = doc.rawJsonCompressed;
    // mantener estado de rawCompressed
    this.rawCompressed = doc.rawCompressed;
  }

  if (this.rawCompressed) {
    try {
      const un = zlib.gunzipSync(buf);
      return JSON.parse(un.toString('utf8'));
    } catch (err) {
      // Error de descompresión: propagar para que caller lo registre
      throw new Error('Error descomprimiendo rawJson: ' + err.message);
    }
  } else {
    return JSON.parse(buf.toString('utf8'));
  }
};

// =================== HOOKS (MIDDLEWARE) ===================

AnalisisArchivoSchema.pre('save', function (next) {
  // Generar correlationId si no existe
  if (!this.correlationId) {
    this.correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  // Generar imagenId si no existe
  if (!this.imagenId) {
    this.imagenId = `${this.tipo}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

// =================== EXPORTACIÓN FINAL ===================

const AnalisisArchivo = mongoose.model('AnalisisArchivo', AnalisisArchivoSchema);

export default AnalisisArchivo;
