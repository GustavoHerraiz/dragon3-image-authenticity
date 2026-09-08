/**
 * ====================================================================
 * DRAGON3 FAANG ENTERPRISE - MODELO EJECUCION (NUEVO)
 * ====================================================================
 *
 * Versión: 1.0.0
 * Fecha: 2026-08-24
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Modelo específico para el sistema de análisis actual (Dragon3 FAANG).
 * Almacena ejecuciones completas del Agent Embassy con todas las células.
 *
 * DIFERENCIA CON AnalisisArchivo:
 * - AnalisisArchivo: Guarda resultados finales (estructura antigua)
 * - Ejecucion: Guarda ejecuciones completas (estructura actual con células)
 *
 * PROPÓSITO:
 * - Base de datos para el Meta-Analizador (ML)
 * - Feedback loop con correcciones humanas
 * - Análisis de rendimiento por célula
 * - Detección de patrones de error
 * - Entrenamiento del modelo ML
 *
 * USO PREVISTO:
 * 1. Embassy guarda cada ejecución al finalizar
 * 2. Usuarios corrigen veredictos (feedback)
 * 3. Meta-Analizador consulta datos para ML
 * 4. Recomendaciones generadas basadas en datos reales
 *
 * CAMPOS PRINCIPALES:
 * - correlationId: Trazabilidad end-to-end
 * - timestamp: Cuándo ocurrió la ejecución
 * - veredicto: Decisión final del sistema
 * - correccionHumana: Feedback del usuario (null si no corregido)
 * - datosCelulas: Resultados de TODAS las células (9 actualmente)
 * - contexto: Metadatos de la ejecución (formato, tamaño, etc.)
 *
 * ====================================================================
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Schema para ejecuciones completas del sistema Dragon3 FAANG
 * 
 * Esta es la fuente de datos principal para el Meta-Analizador.
 * Cada documento = 1 ejecución completa del plan "analizar-imagen-completa".
 */
const EjecucionSchema = new Schema({

  // =================== TRAZABILIDAD ===================
  
  /**
   * Correlation ID único para tracking end-to-end
   * Generado por el Embassy al inicio de cada ejecución
   */
  correlationId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: "ID único de la ejecución (generado por Embassy)"
  },

  /**
   * ID del usuario que solicitó el análisis
   * Puede ser null si es anónimo
   */
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    index: true,
    default: null,
    description: "ID del usuario (null si anónimo)"
  },

  /**
   * Timestamp de la ejecución
   * Se establece automáticamente al guardar
   */
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    description: "Fecha y hora de la ejecución"
  },

  // =================== METADATOS DE LA IMAGEN ===================

  /**
   * Formato del archivo (jpeg, png, webp, etc.)
   * Extraído por cargar-imagen
   */
  formato: {
    type: String,
    required: true,
    index: true,
    description: "Formato del archivo (jpeg, png, webp, etc.)"
  },

  /**
   * Tamaño del archivo en bytes
   * Extraído por cargar-imagen
   */
  tamañoBytes: {
    type: Number,
    required: true,
    description: "Tamaño del archivo en bytes"
  },

  /**
   * Hash SHA-256 del archivo
   * Para deduplicación y verificación de integridad
   */
  hashArchivo: {
    type: String,
    index: true,
    description: "Hash SHA-256 del archivo para deduplicación"
  },

  /**
   * Dimensiones originales de la imagen
   * Extraído por cargar-imagen
   */
  dimensiones: {
    ancho: { type: Number, default: 0 },
    alto: { type: Number, default: 0 }
  },

  // =================== VEREDICTO FINAL ===================

  /**
   * Veredicto final del sistema
   * Generado por generar-veredicto
   */
  veredicto: {
    esIA: {
      type: Boolean,
      required: true,
      index: true,
      description: "true = IA, false = Humano"
    },
    confianza: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      description: "Confianza del veredicto (0-1)"
    },
    explicacion: {
      type: String,
      default: '',
      description: "Explicación en lenguaje natural"
    }
  },

  /**
   * Score calculado por el adaptador (0-100)
   * Para UI y compatibilidad con frontend
   */
  scoreHumano: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    description: "Score humano (0-100) para UI"
  },

  // =================== FEEDBACK DEL USUARIO ===================

  /**
   * Corrección del usuario (feedback)
   * null = no corregido, true = era IA, false = era humano
   */
  correccionHumana: {
    type: Boolean,
    default: null,
    index: true,
    description: "Corrección del usuario: null=sin corregir, true=IA, false=Humano"
  },

  /**
   * Comentario del usuario sobre la corrección
   * Opcional, para mejorar el sistema
   */
  comentarioFeedback: {
    type: String,
    default: null,
    maxlength: 500,
    description: "Comentario del usuario sobre su corrección"
  },

  /**
   * Timestamp del feedback
   * Para saber cuándo se corrigió
   */
  feedbackTimestamp: {
    type: Date,
    default: null,
    description: "Fecha y hora del feedback del usuario"
  },

  // =================== RESULTADOS DE LAS CÉLULAS ===================

  /**
   * Datos completos de todas las células
   * Estructura: { "id-celula": { esIA, confianza, peso, ... } }
   * 
   * Células actuales (9):
   * - detectar-herramienta-ia
   * - detectar-sellos-autenticidad
   * - detectar-patrones-forenses
   * - detectar-artefactos-ia
   * - detectar-textura-ruido
   * - detectar-colores
   * - detectar-sombreado
   * - extraer-metadatos-exif
   * - cargar-imagen (solo metadatos)
   */
  datosCelulas: {
    type: Schema.Types.Mixed,
    required: true,
    description: "Resultados completos de todas las células (estructura flexible)"
  },

  // =================== MÉTRICAS DE RENDIMIENTO ===================

  /**
   * Tiempo total de ejecución en milisegundos
   */
  tiempoTotalMs: {
    type: Number,
    required: true,
    description: "Tiempo total de ejecución en ms"
  },

  /**
   * Telemetría detallada por célula
   * Para análisis de rendimiento individual
   */
  telemetria: {
    type: [{
      celulaId: { type: String, required: true },
      tiempoMs: { type: Number, required: true },
      exito: { type: Boolean, default: true },
      error: { type: String, default: null }
    }],
    default: [],
    description: "Telemetría detallada por célula"
  },

  // =================== CONTEXTO DE EJECUCIÓN ===================

  /**
   * Contexto adicional de la ejecución
   * Para segmentar análisis por diferentes factores
   */
  contexto: {
    agenteId: {
      type: String,
      default: 'desconocido',
      description: "ID del agente que solicitó el análisis"
    },
    planId: {
      type: String,
      default: 'analizar-imagen-completa',
      description: "ID del plan ejecutado"
    },
    origen: {
      type: String,
      enum: ['web', 'api', 'agente', 'test'],
      default: 'web',
      description: "Origen de la solicitud"
    },
    ipHash: {
      type: String,
      default: null,
      description: "Hash de la IP del usuario (anonimizado)"
    }
  },

  // =================== META-ANALIZADOR (Futuro) ===================

  /**
   * Resultado del Meta-Analizador (cuando esté implementado)
   * Almacena el análisis inteligente de los datos de las células
   */
  metaAnalisis: {
    patron: {
      type: String,
      default: null,
      description: "Patrón detectado por el Meta-Analizador"
    },
    confianzaMeta: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
      description: "Confianza del Meta-Analizador"
    },
    recomendacion: {
      type: String,
      default: null,
      description: "Recomendación del Meta-Analizador"
    }
  },

  /**
   * Etiqueta final (para entrenamiento de ML)
   * Combina veredicto y corrección humana
   */
  etiquetaFinal: {
    type: String,
    enum: ['IA', 'Humano', 'NoEtiq'],
    default: 'NoEtiq',
    index: true,
    description: "Etiqueta final para entrenamiento: IA, Humano, NoEtiq"
  }

}, {
  // =================== CONFIGURACIÓN DEL SCHEMA ===================
  timestamps: true,
  collection: 'ejecuciones',
  versionKey: '__v'
});

// =================== ÍNDICES OPTIMIZADOS ===================

// Índice compuesto para consultas de ML
EjecucionSchema.index({
  correccionHumana: 1,
  timestamp: -1
}, {
  name: 'idx_feedback_timestamp'
});

// Índice compuesto para filtrar por usuario y tiempo
EjecucionSchema.index({
  usuarioId: 1,
  timestamp: -1
}, {
  name: 'idx_usuario_timestamp'
});

// Índice compuesto para veredicto y corrección
EjecucionSchema.index({
  'veredicto.esIA': 1,
  correccionHumana: 1
}, {
  name: 'idx_veredicto_correccion'
});

// Índice para búsquedas por hash
EjecucionSchema.index({
  hashArchivo: 1
}, {
  name: 'idx_hashArchivo'
});

// Índice para segmentar por formato
EjecucionSchema.index({
  formato: 1,
  timestamp: -1
}, {
  name: 'idx_formato_timestamp'
});

// =================== HOOKS (MIDDLEWARE) ===================

/**
 * Pre-save: Calcular score y etiqueta final
 */
EjecucionSchema.pre('save', function(next) {
  // Calcular score para UI (0-100)
  if (this.veredicto && this.veredicto.confianza !== undefined) {
    this.scoreHumano = Math.round(this.veredicto.confianza * 100);
  }

  // Calcular etiqueta final para entrenamiento
  if (this.correccionHumana !== null) {
    // Si el usuario corrigió, usar su corrección
    this.etiquetaFinal = this.correccionHumana ? 'IA' : 'Humano';
  } else if (this.veredicto && this.veredicto.esIA !== undefined) {
    // Si no hay corrección, usar el veredicto del sistema
    this.etiquetaFinal = this.veredicto.esIA ? 'IA' : 'Humano';
  } else {
    this.etiquetaFinal = 'NoEtiq';
  }

  // Asegurar que datosCelulas existe
  if (!this.datosCelulas) {
    this.datosCelulas = {};
  }

  next();
});

/**
 * Post-save: Logging
 */
EjecucionSchema.post('save', function(doc) {
  console.log(`📊 Ejecución guardada: ${doc.correlationId} | Veredicto: ${doc.veredicto.esIA ? 'IA' : 'Humano'} (${doc.veredicto.confianza})`);
});

// =================== MÉTODOS DE INSTANCIA ===================

/**
 * Registrar feedback del usuario
 * @param {boolean} correccion - true=IA, false=Humano
 * @param {string} comentario - Comentario opcional
 * @returns {Promise<Document>}
 */
EjecucionSchema.methods.registrarFeedback = async function(correccion, comentario = null) {
  this.correccionHumana = correccion;
  this.comentarioFeedback = comentario;
  this.feedbackTimestamp = new Date();
  
  // Actualizar etiqueta final
  this.etiquetaFinal = correccion ? 'IA' : 'Humano';
  
  return this.save();
};

/**
 * Obtener vector de características para ML
 * @returns {Object} Features para el Meta-Analizador
 */
EjecucionSchema.methods.obtenerFeatures = function() {
  const features = {};
  
  // Extraer confianza y decisión de cada célula
  for (const [celulaId, datos] of Object.entries(this.datosCelulas)) {
    features[`${celulaId}_confianza`] = datos.confianza || 0;
    features[`${celulaId}_decision`] = datos.esIA ? 1 : 0;
    features[`${celulaId}_peso`] = datos.peso || 0;
  }
  
  // Añadir context
  features.formato = this.formato;
  features.tamañoBytes = this.tamañoBytes;
  features.tiempoTotalMs = this.tiempoTotalMs;
  
  return features;
};

/**
 * Verificar si es útil para entrenamiento
 * @returns {boolean} true si tiene feedback y es válido
 */
EjecucionSchema.methods.esUtilParaEntrenamiento = function() {
  // Necesita corrección humana y confianza > 0.3 (evitar casos muy dudosos)
  return this.correccionHumana !== null && 
         this.veredicto && 
         this.veredicto.confianza > 0.3;
};

// =================== MÉTODOS ESTÁTICOS ===================

/**
 * Obtener ejecuciones con feedback para entrenamiento
 * @param {number} limite - Número máximo de documentos
 * @param {Date} desde - Fecha desde (opcional)
 * @returns {Promise<Array>}
 */
EjecucionSchema.statics.obtenerParaEntrenamiento = function(limite = 1000, desde = null) {
  const query = {
    correccionHumana: { $ne: null },
    'veredicto.confianza': { $gt: 0.3 }
  };
  
  if (desde) {
    query.timestamp = { $gte: desde };
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limite)
    .select('datosCelulas veredicto correccionHumana formato timestamp')
    .lean();
};

/**
 * Obtener precisión por célula
 * @param {Date} desde - Fecha desde (opcional)
 * @returns {Promise<Object>} Precisión por célula
 */
EjecucionSchema.statics.obtenerPrecisionPorCelula = async function(desde = null) {
  const query = {
    correccionHumana: { $ne: null }
  };
  
  if (desde) {
    query.timestamp = { $gte: desde };
  }
  
  const ejecuciones = await this.find(query)
    .select('datosCelulas correccionHumana')
    .lean();
  
  const precision = {};
  
  for (const ejecucion of ejecuciones) {
    for (const [celulaId, datos] of Object.entries(ejecucion.datosCelulas)) {
      if (!precision[celulaId]) {
        precision[celulaId] = { aciertos: 0, total: 0 };
      }
      
      precision[celulaId].total++;
      
      // Comparar decisión de la célula con la corrección humana
      const decisionCelula = datos.esIA;
      const correccion = ejecucion.correccionHumana;
      
      if (decisionCelula === correccion) {
        precision[celulaId].aciertos++;
      }
    }
  }
  
  // Calcular porcentajes
  for (const [celulaId, datos] of Object.entries(precision)) {
    datos.precision = datos.total > 0 ? datos.aciertos / datos.total : 0;
  }
  
  return precision;
};

/**
 * Obtener estadísticas generales
 * @returns {Promise<Object>}
 */
EjecucionSchema.statics.obtenerEstadisticas = function() {
  return this.aggregate([
    {
      $facet: {
        // Totales
        total: [{ $count: 'count' }],
        
        // Con feedback
        conFeedback: [
          { $match: { correccionHumana: { $ne: null } } },
          { $count: 'count' }
        ],
        
        // Por formato
        porFormato: [
          { $group: { _id: '$formato', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ],
        
        // Por veredicto
        porVeredicto: [
          { $group: { _id: '$veredicto.esIA', count: { $sum: 1 } } }
        ],
        
        // Tiempo promedio
        tiempoPromedio: [
          { $group: { _id: null, avg: { $avg: '$tiempoTotalMs' } } }
        ]
      }
    }
  ]);
};

// =================== EXPORTACIÓN ===================

const Ejecucion = mongoose.model('Ejecucion', EjecucionSchema);

export default Ejecucion;

/**
 * ====================================================================
 * EJEMPLOS DE USO:
 *
 * // Guardar una ejecución (desde Embassy)
 * import Ejecucion from './modelos/mongodb/Ejecucion.js';
 *
 * const ejecucion = new Ejecucion({
 *   correlationId: 'abc-123-def',
 *   usuarioId: usuario._id,
 *   formato: 'jpeg',
 *   tamañoBytes: 194077,
 *   hashArchivo: 'a1b2c3...',
 *   dimensiones: { ancho: 1024, alto: 1024 },
 *   veredicto: { esIA: false, confianza: 0.65, explicacion: '...' },
 *   datosCelulas: {
 *     'detectar-textura-ruido': { esIA: false, confianza: 0.85, peso: 0.8 },
 *     // ... todas las células
 *   },
 *   tiempoTotalMs: 1264,
 *   telemetria: [
 *     { celulaId: 'cargar-imagen', tiempoMs: 72, exito: true },
 *     // ...
 *   ],
 *   contexto: {
 *     agenteId: 'agente-001',
 *     planId: 'analizar-imagen-completa',
 *     origen: 'web'
 *   }
 * });
 *
 * await ejecucion.save();
 *
 * // Registrar feedback del usuario
 * await ejecucion.registrarFeedback(true, 'Esto es claramente IA');
 *
 * // Obtener datos para entrenamiento
 * const datos = await Ejecucion.obtenerParaEntrenamiento(500);
 *
 * // Obtener precisión por célula
 * const precision = await Ejecucion.obtenerPrecisionPorCelula();
 * console.log(precision);
 *
 * ====================================================================
 */