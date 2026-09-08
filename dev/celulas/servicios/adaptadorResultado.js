/**
 * ====================================================================
 * adaptadorResultado.js - VERSIÓN HÍBRIDA COMPLETA (CORREGIDA)
 * ====================================================================
 *
 * Módulo de adaptación que transforma la salida del orquestador (células)
 * al formato FAANG que espera el frontend.
 *
 * OBJETIVOS:
 *   1. Mantener compatibilidad con el frontend actual.
 *   2. Preservar trazabilidad (correlationId, archivoId, usuarioId).
 *   3. Generar estructura resumen/detalles/paraInforme con TODOS los campos.
 *   4. Incluir analizadores y consenso en el formato exacto que espera el frontend.
 *   5. Propagación de TIEMPOS REALES de cada célula desde la telemetría.
 *   6. Propagación de TODOS los datos extra de cada célula (EXIF, métricas, etc.)
 *      en forense.raw_data (estructura híbrida: resumen + expandible).
 *   7. No modificar server.js ni el orquestador.
 *
 * @module adaptadorResultado
 * @version 2.0.0
 */

/**
 * Convierte un resultado del orquestador al formato FAANG esperado por el frontend.
 *
 * @param {Object} resultadoBruto - Resultado del orquestador { resultado, telemetria, tiempoTotal, correlationId }
 * @param {Object} metadata - Metadatos de trazabilidad y contexto.
 * @param {string} metadata.archivoId - ID del archivo.
 * @param {string} metadata.correlationId - ID de correlación.
 * @param {string|null} metadata.usuarioId - ID del usuario.
 * @param {string} metadata.nombreOriginal - Nombre original del archivo.
 * @param {string} metadata.analyzerType - Tipo de análisis ('imagen', 'pdf', etc.)
 * @param {string} metadata.version - Versión del sistema.
 * @param {number} metadata.tiempoProcesamiento - Tiempo total de procesamiento.
 * @param {Array} metadata.telemetria - Array de telemetría con tiempos reales por célula.
 * @returns {Object} Objeto en formato FAANG completo.
 */
export function adaptarResultadoNuevoDragon(resultadoBruto, metadata) {
  console.log('[adaptador] Entrada recibida:', {
    correlationId: resultadoBruto?.correlationId || null,
    tiempoTotal: resultadoBruto?.tiempoTotal || 0,
    telemetria: Array.isArray(resultadoBruto?.telemetria) ? resultadoBruto.telemetria.length : 0,
    resultadoKeys: resultadoBruto?.resultado && typeof resultadoBruto.resultado === 'object'
      ? Object.keys(resultadoBruto.resultado)
      : []
  });
  console.log('🔍 [ADAPTADOR] resultadoBruto.tiempoTotal:', resultadoBruto?.tiempoTotal);
  console.log('🔍 [ADAPTADOR] metadata.tiempoProcesamiento:', metadata?.tiempoProcesamiento);
  console.log('🔍 [ADAPTADOR] metadata.telemetria length:', metadata?.telemetria?.length || 0);

  try {
    // ============================================================
    // 1. VALIDAR Y NORMALIZAR ENTRADA
    // ============================================================
    const entradaValida = validarEntrada(resultadoBruto);
    const meta = normalizarMetadata(metadata);

    // ============================================================
    // 2. EXTRAER TIEMPO TOTAL REAL DESDE EL ORQUESTADOR
    // ============================================================
    // 🔥 CRÍTICO: meta.tiempoProcesamiento ahora contiene el tiempo real
    // porque adaptarYEnriquecerResultado lo forzó en el metadata
    const tiempoTotalReal = meta.tiempoProcesamiento ||  // ✅ PRIORIDAD MÁXIMA
                            resultadoBruto?.tiempoTotal || 
                            entradaValida.metricas?.tiempoMs || 0;

    console.log('🚨🚨🚨 [ADAPTADOR] tiempoTotalReal FINAL:', tiempoTotalReal);

    // ============================================================
    // 3. EXTRAER TELEMETRÍA PARA TIEMPOS DE CADA CÉLULA
    // ============================================================
    const telemetria = meta.telemetria || resultadoBruto?.telemetria || [];

    // ============================================================
    // 4. DETERMINAR DECISIÓN FINAL
    // ============================================================
    const esIA = entradaValida.esIA;
    const decision = esIA ? 'IA' : 'humano';
    const confianzaReal = entradaValida.confianza || 0.5;
    const score = esIA ? (1 - confianzaReal) : confianzaReal;

    // ============================================================
    // 5. CONSTRUIR RESUMEN CON TIEMPO REAL
    // ============================================================
    const resumen = {
      decision,
      confianza: confianzaReal,
      score,
      archivoId: meta.archivoId,
      usuarioId: meta.usuarioId || null,
      correlationId: meta.correlationId,
      timestamp: new Date().toISOString(),
      nombreOriginal: meta.nombreOriginal || 'archivo_desconocido',
      tiempoTotal: Math.round(tiempoTotalReal),  // 🔥 TIEMPO REAL
      etiquetas: entradaValida.etiquetas || [],
      modeloPrincipal: meta.version || 'Dragon3_FAANG_V25',
      explicacion: entradaValida.explicacion || 'Sin explicación disponible.'
    };

    // ============================================================
    // 6. CONSTRUIR DETALLES (ANALIZADORES + CONSENSO)
    // ============================================================
    const detalles = {
      evidencias: entradaValida.evidencias || [],
      explicacion: entradaValida.explicacion || 'Sin explicación disponible.',
      herramientasEncontradas: entradaValida.herramientasEncontradas || [],
      sellosEncontrados: entradaValida.sellosEncontrados || [],
      analizadores: construirAnalizadores(entradaValida, resultadoBruto, telemetria),
      consenso: construirConsenso(entradaValida, resultadoBruto)
    };

    // ============================================================
    // 7. METADATA FINAL CON TIEMPO REAL
    // ============================================================
    const metadataFinal = {
      analyzerType: meta.analyzerType || 'imagen',
      processingTime: Math.round(tiempoTotalReal * 100) / 100,  // 🔥 TIEMPO REAL
      version: meta.version || '1.0.0',
      analizadoresExitosos: Object.keys(detalles.analizadores).filter(k => detalles.analizadores[k]?.exitoso).length
    };

    // ============================================================
    // 8. PARA INFORME (ESTRUCTURA PARA EL FRONTEND)
    // ============================================================
    const paraInforme = {
      titulo: `Análisis forense de imagen (${decision})`,
      secciones: [
        { titulo: 'Veredicto', contenido: `${decision} (confianza: ${(confianzaReal * 100).toFixed(1)}%)` },
        { titulo: 'Score Humano', contenido: `${(score * 100).toFixed(1)}%` },
        { titulo: 'Tiempo Total', contenido: `${Math.round(tiempoTotalReal)}ms` },
        { titulo: 'Explicación', contenido: resumen.explicacion }
      ]
    };

    // Añadir secciones adicionales si hay evidencias o herramientas
    if (entradaValida.evidencias?.length > 0) {
      paraInforme.secciones.push({
        titulo: 'Evidencias',
        contenido: entradaValida.evidencias.join('\n- ')
      });
    }
    if (entradaValida.herramientasEncontradas?.length > 0) {
      paraInforme.secciones.push({
        titulo: 'Herramientas IA detectadas',
        contenido: entradaValida.herramientasEncontradas.join(', ')
      });
    }

    // ============================================================
    // 9. ARMADO FINAL
    // ============================================================
    const resultadoFAANG = {
      resumen,
      detalles,
      metadata: metadataFinal,
      paraInforme,
      estado: 'completado',
      mensaje: 'Análisis completado con éxito.'
    };

    // Log de transformación
    console.log(`[adaptador] Transformación completada para correlationId: ${meta.correlationId}`);
    console.log(`[adaptador] Decisión: ${decision}, Confianza: ${confianzaReal}, Score: ${score}`);
    console.log(`[adaptador] Tiempo total: ${Math.round(tiempoTotalReal)}ms`);
    console.log(`[adaptador] Células con telemetría: ${telemetria.length}`);

    // ============================================================
    // 10. DEVOLVER EL OBJETO COMPLETO
    // ============================================================
    return {
      resultado: resultadoFAANG,
      imagenId: meta.archivoId,
      correlationId: meta.correlationId,
      analysisTimestamp: new Date().toISOString(),
      metadata: {
        processingTime: metadataFinal.processingTime,
        version: metadataFinal.version
      }
    };
  } catch (error) {
    console.error('[adaptador] Error adaptando resultado:', error);
    return {
      error: true,
      mensaje: error.message,
      resultado: {
        resumen: { decision: 'Error', confianza: 0, score: 0, explicacion: 'Error en el adaptador' },
        detalles: { evidencias: [], explicacion: 'Error interno', analizadores: {}, consenso: {} },
        estado: 'error'
      },
      correlationId: metadata?.correlationId || 'unknown'
    };
  }
}

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Construye el objeto de analizadores a partir de los resultados de las células.
 * 
 * Esta función es el núcleo de la adaptación de datos: toma los resultados
 * brutos de cada célula, extrae los tiempos reales desde la telemetría,
 * y estructura toda la información en el formato que espera el frontend.
 *
 * CARACTERÍSTICAS PRINCIPALES:
 * 1. **Tiempos reales**: Extrae `tiempoMs` desde la telemetría del orquestador.
 * 2. **Datos híbridos**: Guarda TODOS los campos extra en `forense.raw_data`
 *    para que el frontend pueda mostrar tanto el resumen como los detalles completos.
 * 3. **Robustez**: Si no hay células, crea un analizador principal de fallback.
 * 4. **Trazabilidad**: Preserva `correlationId`, `archivoId`, `usuarioId` desde el contexto.
 *
 * @param {Object} entrada - Entrada validada (contiene `esIA`, `confianza`, etc.).
 * @param {Object} resultadoBruto - Resultado completo del orquestador.
 * @param {Array} telemetria - Array de telemetría con tiempos reales por célula.
 * @returns {Object} Objeto de analizadores con datos completos para el frontend.
 */
function construirAnalizadores(entrada, resultadoBruto, telemetria) {
  const analizadores = {};

  // ============================================================
  // 1. EXTRAER RESULTADOS DE CÉLULAS
  // ============================================================
  let resultadosCelulas = [];

  // 🔥 PRIORIDAD 1: Buscar en todosLosResultados (datos COMPLETOS con EXIF, etc.)
  if (resultadoBruto?.todosLosResultados) {
    // Convertir objeto a array de resultados, preservando la clave como celula
    resultadosCelulas = Object.entries(resultadoBruto.todosLosResultados).map(([key, value]) => ({
      ...value,
      celula: key,
      id: key
    }));
    console.log('🚨🚨🚨 [ADAPTADOR] usando todosLosResultados:', resultadosCelulas.length);
  } 
  // 🔥 PRIORIDAD 2: Buscar en resultadoBruto.resultados
  else if (resultadoBruto?.resultados) {
    resultadosCelulas = resultadoBruto.resultados;
    console.log('🚨🚨🚨 [ADAPTADOR] encontrados en resultadoBruto.resultados:', resultadosCelulas.length);
  } 
  // 🔥 PRIORIDAD 3: Buscar en resultadoBruto.detalles.resultados
  else if (resultadoBruto?.detalles?.resultados) {
    resultadosCelulas = resultadoBruto.detalles.resultados;
    console.log('🚨🚨🚨 [ADAPTADOR] encontrados en resultadoBruto.detalles.resultados:', resultadosCelulas.length);
  } 
  // 🔥 PRIORIDAD 4: Buscar en resultadoBruto.resultado.detalles.resultados
  else if (resultadoBruto?.resultado?.detalles?.resultados) {
    resultadosCelulas = resultadoBruto.resultado.detalles.resultados;
    console.log('🚨🚨🚨 [ADAPTADOR] encontrados en resultadoBruto.resultado.detalles.resultados:', resultadosCelulas.length);
  }

  console.log('🚨🚨🚨 [ADAPTADOR] resultadosCelulas FINAL:', resultadosCelulas.length);

  // ============================================================
  // 2. SI HAY CÉLULAS, CONSTRUIR UN ANALIZADOR POR CADA UNA
  // ============================================================
  if (resultadosCelulas.length > 0) {
    resultadosCelulas.forEach((celda, index) => {
      const id = celda.celula || celda.id || `celula-${index}`;
      const nombre = celda.celula || celda.nombre || `Célula ${index + 1}`;
      const esIA = celda.esIA === true;
      const veredicto = esIA ? 'Artificial' : 'Humano';
      const confianza = typeof celda.confianza === 'number' ? celda.confianza : 0.5;

      const telemetriaCelula = telemetria.find(t => t.celulaId === id);
      const tiempoReal = telemetriaCelula?.tiempoMs || celda.processingTime || 0;

      // ============================================================
      // 3. EXTRAER TODOS LOS DATOS EXTRA
      // ============================================================
      const rawData = {};

      const camposEstandar = [
        'celula', 'id', 'nombre', 'version',
        'esIA', 'confianza', 'explicacion', 'evidencias', 'peso',
        'processingTime', 'exito', 'detalle',
        'raw_data', 'metricas', '_id', '__v'
      ];

      // Copiar todos los campos no estándar
      for (const [key, value] of Object.entries(celda)) {
        if (!key.startsWith('_') && !camposEstandar.includes(key)) {
          rawData[key] = value;
        }
      }

      // Si rawData está vacío, FORZAR todos los campos (excepto los estándar)
      if (Object.keys(rawData).length === 0) {
        for (const [key, value] of Object.entries(celda)) {
          if (!key.startsWith('_')) {
            rawData[key] = value;
          }
        }
        // Eliminar campos estándar manualmente
        delete rawData.celula;
        delete rawData.id;
        delete rawData.nombre;
        delete rawData.esIA;
        delete rawData.confianza;
        delete rawData.explicacion;
        delete rawData.evidencias;
        delete rawData.peso;
        delete rawData.processingTime;
        delete rawData.exito;
        delete rawData.detalle;
        delete rawData.raw_data;
        delete rawData.metricas;
        delete rawData._id;
        delete rawData.__v;
        console.log('🚨🚨🚨 [ADAPTADOR] rawData FORZADO para', id, ':', Object.keys(rawData));
      }

      // ============================================================
// 4. CONSTRUIR EL ANALIZADOR
// ============================================================
analizadores[id] = {
  meta: {
    id,
    nombre,
    version: celda.version || '1.0.0',
    ts_start: Date.now() - tiempoReal,
    ts_end: Date.now(),
    ms: tiempoReal
  },
  evaluacion: {
    veredicto,
    confianza,
    peso: celda.peso || 'medio'
  },
  narrativa: {
    titulo: celda.titulo || '',
    explicacion_humana: celda.narrativa?.explicacion_humana || celda.explicacion || '',
    explicacion_tecnica: celda.detalle || ''
  },
  forense: {
    herramientas: celda.herramientasEncontradas || celda.herramientas || [],
    compresion: celda.compresion || [],
    raw_data: rawData
  },
  exitoso: veredicto !== 'Error',
  processingTime: tiempoReal,
  version: celda.version || '1.0.0',
  // 🔥 AÑADIR ESTO:
  c2pa: celda.c2pa || null   // Propaga los datos C2PA
};
    });
  } else {
    // ============================================================
    // 5. FALLBACK: CREAR UN ANALIZADOR PRINCIPAL
    // ============================================================
    const nombre = 'analizadorPrincipal';
    const veredicto = entrada.esIA ? 'Artificial' : 'Humano';
    const tiempoReal = entrada.tiempoMs || 0;

    analizadores[nombre] = {
      meta: {
        id: nombre,
        nombre: 'Analizador Principal',
        version: '1.0.0',
        ts_start: Date.now() - tiempoReal,
        ts_end: Date.now(),
        ms: tiempoReal
      },
      evaluacion: {
        veredicto,
        confianza: entrada.confianza || 0.5,
        peso: 'alto'
      },
      narrativa: {
        titulo: '',
        explicacion_humana: entrada.explicacion || '',
        explicacion_tecnica: ''
      },
      forense: {
        herramientas: entrada.herramientasEncontradas || [],
        compresion: [],
        raw_data: {}
      },
      exitoso: true,
      processingTime: tiempoReal,
      version: '1.0.0'
    };
  }

  // 🔥 Si existe generar_veredicto en el resultado del orquestador, añadirlo manualmente
  if (resultadoBruto?.resultado?.generar_veredicto) {
    const gen = resultadoBruto.resultado.generar_veredicto;
    if (gen.resultado && !analizadores["generar-veredicto"]) {
      analizadores["generar-veredicto"] = {
        meta: {
          id: "generar-veredicto",
          nombre: "generar-veredicto",
          version: "1.0.0",
          ts_start: Date.now() - 2,
          ts_end: Date.now(),
          ms: 2
        },
        evaluacion: {
          veredicto: gen.resultado.esIA ? "Artificial" : "Humano",
          confianza: gen.resultado.confianza ?? 0.5,
          peso: gen.resultado.peso ?? 0.5
        },
        narrativa: {
          titulo: "",
          explicacion_humana: gen.resultado.explicacion || "Veredicto final",
          explicacion_tecnica: ""
        },
        forense: {
          herramientas: [],
          compresion: [],
          raw_data: gen.resultado
        },
        exitoso: true,
        processingTime: 2,
        version: "1.0.0",
        c2pa: null
      };
      console.log("🔥🔥🔥 [ADAPTADOR] generar_veredicto añadido manualmente a analizadores");
    }
  }
  return analizadores;
}


/**
 * Construye el objeto de consenso basado en los votos de las células.
 *
 * @param {Object} entrada - Entrada validada.
 * @param {Object} resultadoBruto - Resultado completo del orquestador.
 * @returns {Object} Objeto de consenso con votos y decisión.
 */
function construirConsenso(entrada, resultadoBruto) {
  // Intentar extraer resultados de células
  let resultadosCelulas = [];
  if (resultadoBruto?.resultado?.detalles?.resultados) {
    resultadosCelulas = resultadoBruto.resultado.detalles.resultados;
  } else if (resultadoBruto?.detalles?.resultados) {
    resultadosCelulas = resultadoBruto.detalles.resultados;
  } else if (resultadoBruto?.resultados) {
    resultadosCelulas = resultadoBruto.resultados;
  }

  const totalVotos = resultadosCelulas.length;

  if (totalVotos === 0) {
    return {
      totalAnalizadores: 0,
      totalOmitidos: 0,
      porcentajeAutentico: entrada.esIA ? 0.4 : 0.6,
      totalVotos: 0,
      analizadoresIncluidos: [],
      analizadoresOmitidos: [],
      decision: entrada.esIA ? 'Artificial' : 'Humano'
    };
  }

  // Contar votos
  let votosIA = 0;
  let votosHumanos = 0;
  const analizadoresIncluidos = [];
  const analizadoresOmitidos = [];

  resultadosCelulas.forEach(celda => {
    const esIA = celda.esIA === true;
    const nombre = celda.celula || celda.nombre || 'desconocido';
    if (esIA) {
      votosIA++;
    } else {
      votosHumanos++;
    }
    analizadoresIncluidos.push({ nombre, veredicto: esIA ? 'Artificial' : 'Humano' });
  });

  const porcentajeAutentico = totalVotos > 0 ? (votosHumanos / totalVotos) : 0.5;
  const decision = votosIA > votosHumanos ? 'Artificial' : 'Humano';

  return {
    totalAnalizadores: totalVotos,
    totalOmitidos: analizadoresOmitidos.length,
    porcentajeAutentico,
    totalVotos,
    analizadoresIncluidos,
    analizadoresOmitidos,
    decision
  };
}

/**
 * Valida y normaliza la entrada del orquestador.
 *
 * @param {Object} input - Entrada bruta del orquestador.
 * @returns {Object} Objeto normalizado con campos clave.
 */
function validarEntrada(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('La entrada del adaptador debe ser un objeto válido.');
  }

  const datos = input.resultado || input;

  const esIA = datos.esIA === true;
  let confianza = typeof datos.confianza === 'number'
    ? Math.min(Math.max(datos.confianza, 0), 1)
    : 0.5;

  let explicacion = datos.explicacion ||
                    datos.narrativa?.explicacion_humana ||
                    (esIA ? 'La imagen parece generada por IA.' : 'La imagen parece humana.');

  let evidencias = [];
  let herramientasEncontradas = [];
  let sellosEncontrados = [];

  let resultadosCelulas = [];
  if (datos.detalles?.resultados) {
    resultadosCelulas = datos.detalles.resultados;
  } else if (datos.resultados) {
    resultadosCelulas = datos.resultados;
  }

  if (resultadosCelulas.length > 0) {
    resultadosCelulas.forEach(celda => {
      if (celda.explicacion) {
        evidencias.push(celda.explicacion);
      }
      if (celda.esIA === true && celda.confianza > 0.3) {
        herramientasEncontradas.push(celda.celula || 'herramienta desconocida');
      }
    });
  }

  if (evidencias.length === 0 && explicacion) {
    evidencias.push(explicacion);
  }

  const metricas = datos.metricas || {};
  const tiempoMs = datos.tiempoMs || metricas.tiempoMs || 0;
  const etiquetas = datos.etiquetas || [];

  return {
    esIA,
    confianza,
    explicacion,
    evidencias,
    herramientasEncontradas,
    sellosEncontrados,
    metricas,
    tiempoMs,
    etiquetas
  };
}

/**
 * Normaliza los metadatos recibidos.
 * 
 * 🔥 CORREGIDO: Incluye `telemetria` en el objeto retornado.
 *
 * @param {Object} metadata - Metadatos de trazabilidad y contexto.
 * @returns {Object} Metadatos normalizados.
 */
function normalizarMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Los metadatos son requeridos y deben ser un objeto.');
  }

  return {
    archivoId: metadata.archivoId || generarUUID(),
    correlationId: metadata.correlationId || generarUUID(),
    usuarioId: metadata.usuarioId || null,
    nombreOriginal: metadata.nombreOriginal || 'archivo_desconocido',
    analyzerType: metadata.analyzerType || 'imagen',
    version: metadata.version || '1.0.0',
    tiempoProcesamiento: metadata.tiempoProcesamiento || 0,
    telemetria: metadata.telemetria || []  // 🔥 AÑADIDO: Propaga telemetría
  };
}

/**
 * Genera un UUID v4 simple para trazabilidad.
 *
 * @returns {string} UUID v4.
 */
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Función de entrada principal que envuelve adaptarResultadoNuevoDragon.
 *
 * @param {Object} resultadoBruto - Resultado del orquestador.
 * @param {Object} contexto - Contexto adicional (nombreOriginal, tipoArchivo, tiempoTotal, telemetria).
 * @param {string} correlationId - ID de correlación.
 * @param {string} archivoId - ID del archivo.
 * @param {string|null} usuarioId - ID del usuario.
 * @returns {Object} Objeto en formato FAANG completo.
 */
export function adaptarYEnriquecerResultado(resultadoBruto, contexto = {}, correlationId, archivoId, usuarioId) {
  // 🔥 FORZAR tiempoTotal desde el contexto o desde el resultado
  const tiempoTotal = contexto?.tiempoTotal || resultadoBruto?.tiempoTotal || 0;
  
  console.log('🚨🚨🚨 [ADAPTADOR] adaptarYEnriquecerResultado - tiempoTotal FORZADO:', tiempoTotal);
  console.log('🚨🚨🚨 [ADAPTADOR] contexto recibido:', {
    nombreOriginal: contexto?.nombreOriginal || null,
    tipoArchivo: contexto?.tipoArchivo || null,
    tiempoTotal,
    telemetria: Array.isArray(contexto?.telemetria) ? contexto.telemetria.length : 0
  });
  
  const metadata = {
    archivoId,
    correlationId,
    usuarioId: usuarioId || null,
    nombreOriginal: contexto?.nombreOriginal || 'archivo_desconocido',
    analyzerType: contexto?.tipoArchivo || 'imagen',
    version: '1.0.0',
    tiempoProcesamiento: tiempoTotal,  // 🔥 FORZADO
    telemetria: contexto?.telemetria || []
  };

  // 🔥 LLAMAR AL ADAPTADOR Y LUEGO FORZAR EL TIEMPO EN LA RESPUESTA
  const resultado = adaptarResultadoNuevoDragon(resultadoBruto, metadata);
  
  // 🔥 SI EL TIEMPO SIGUE EN 0, FORZARLO DIRECTAMENTE EN LA RESPUESTA
  if (resultado?.resultado?.metadata?.processingTime === 0 && tiempoTotal > 0) {
    console.log('🚨🚨🚨 [ADAPTADOR] FORZANDO TIEMPO EN RESPUESTA:', tiempoTotal);
    resultado.resultado.metadata.processingTime = Math.round(tiempoTotal * 100) / 100;
    resultado.resultado.resumen.tiempoTotal = Math.round(tiempoTotal);
    resultado.metadata.processingTime = Math.round(tiempoTotal * 100) / 100;
  }
  
  return resultado;
}

export default {
  adaptarResultadoNuevoDragon,
  adaptarYEnriquecerResultado,
  validarEntrada,
  normalizarMetadata,
  generarUUID
};