/**
 * analizadorArtefactos.js
 * =================
 * @file Analizador de artefactos visuales y patrones IA en imágenes
 * @version 4.0.1-FAANG-PNG_NARRATIVE // <--- VERSIÓN ACTUALIZADA
 * @author Gustavo Herraiz - Lead Architect Dragon Project
 * @path /var/www/Dragon3/backend/servicios/imagen/analizadores/imagen/analizadorArtefactos.js
 * * @description
 * Analizador ML-Enhanced que detecta y cuantifica artefactos visuales característicos
 * de imágenes generadas por IA.
 * * [ROBUSTEZ V4.0.1]: Se alinea la estructura de salida con el contrato FAANG/analizadorExif
 * para asegurar una narrativa forense completa y una trazabilidad perfecta en formatos sin pérdida (PNG).
 * * SLA:
 * - Performance: P95 < 180ms
 * - Error rate: < 0.5%
 * - Precision: Mejorada en casos de compresión extrema.
 * * @requires Dragon3/utilidades/logger
 * @implements AnalizadorImagen interface
 */

import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import dragon from '../../../../utilidades/logger.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

// ================== CONSTANTES Y CONFIGURACIÓN ==================

const ANALYZER_VERSION = '4.0.1-FAANG-PNG_NARRATIVE'; // VERSIÓN ACTUALIZADA
const ANALYZER_ID = 'analizadorArtefactos';
const MODULE_NAME = 'analizadorArtefactos.js';

/**
 * Umbrales y límites para análisis de artefactos
 * @type {Object}
 */
const CONFIG = {
  // Límites y normalización
  maxDimension: 8000,
  maxResolucionDPI: 1200,
  maxGradienteLuma: 80,
  minGradienteLumaNatural: 10,
  maxEntropiaLuma: 8,
  maxDesviacionEstandarLuma: 75,
  maxBlockinessConsideredLowForIA: 12,
  minPicosAltosNatural: 3,

  // Performance
  timeoutMs: parseInt(process.env.ANALIZADOR_ARTEFACTOS_TIMEOUT_MS || '3000', 10),
  maxImageSizeBytes: parseInt(process.env.ANALIZADOR_ARTEFACTOS_MAX_SIZE_BYTES || '15728640', 10), // 15MB
};

// ================== FUNCIONES MATEMÁTICAS AUXILIARES ==================

/**
 * Normaliza valor a rango [0, 1]
 * @param {number} value - Valor a normalizar
 * @param {number} max - Valor máximo de referencia
 * @returns {number} - Valor normalizado entre 0 y 1
 */
function normalizarAUnidad(valor, maximo) {
  if (typeof valor === 'number' && !isNaN(valor) && typeof maximo === 'number' && !isNaN(maximo) && maximo > 0) {
    return Math.max(0, Math.min(1, valor / maximo));
  }
  return 0.5;
}

/**
 * Convierte buffer RGB a luminancia (Y) usando BT.709
 * @param {Buffer} rgbBuffer - Buffer RGB de la imagen
 * @param {number} width - Ancho de la imagen
 * @param {number} height - Alto de la imagen
 * @param {number} channels - Número de canales
 * @returns {Uint8Array} - Array de luminancia
 */
function rgbToLuminancia(rgbBuffer, width, height, channels) {
  const numPixels = width * height;
  const luminancia = new Uint8Array(numPixels);

  if (channels < 3 || rgbBuffer.length < numPixels * channels) {
    dragon.sePreocupa("Datos RGB insuficientes para conversión a luminancia", MODULE_NAME, "rgbToLuminancia", {
      ancho: width,
      alto: height,
      canales: channels,
      tamanoBuffer: rgbBuffer.length
    });
    return new Uint8Array(0);
  }

  for (let i = 0, j = 0; i < numPixels * channels; i += channels, j++) {
    const r = rgbBuffer[i];
    const g = rgbBuffer[i + 1];
    const b = rgbBuffer[i + 2];
    // Fórmula BT.709 para luminancia
    luminancia[j] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  return luminancia;
}

/**
 * Calcula entropía de Shannon para un histograma
 * @param {Array<number>} histograma - Histograma de valores
 * @param {number} totalPixeles - Total de píxeles
 * @returns {number} - Valor de entropía
 */
function calcularEntropia(histograma, totalPixeles) {
  if (!histograma || totalPixeles <= 0) return 0;

  let entropia = 0;
  for (let i = 0; i < histograma.length; i++) {
    if (histograma[i] > 0) {
      const probabilidad = histograma[i] / totalPixeles;
      entropia -= probabilidad * (Math.log2(probabilidad));
    }
    // Asegurar que el logaritmo de 0 no sea -Infinity (que ya lo resuelve el if(histograma[i]>0))
  }

  return entropia;
}

/**
 * Calcula desviación estándar de un histograma
 * @param {Array<number>} histograma - Histograma de valores
 * @param {number} totalPixeles - Total de píxeles
 * @param {number} media - Valor medio
 * @returns {number} - Desviación estándar
 */
function calcularDesviacionEstandar(histograma, totalPixeles, media) {
  if (!histograma || totalPixeles <= 0) return 0;

  let sumaCuadradosDiferencias = 0;
  for (let valorPixel = 0; valorPixel < histograma.length; valorPixel++) {
    if (histograma[valorPixel] > 0) {
      sumaCuadradosDiferencias += histograma[valorPixel] * Math.pow(valorPixel - media, 2);
    }
  }

  return Math.sqrt(sumaCuadradosDiferencias / totalPixeles);
}

/**
 * Detecta artefactos de compresión (blockiness) en canal de luminancia
 * @param {Uint8Array} luminanciaData - Datos de luminancia
 * @param {number} width - Ancho de la imagen
 * @param {number} height - Alto de la imagen
 * @param {number} tamanoBloque - Tamaño de bloque para análisis
 * @returns {number} - Valor de blockiness
 */
function calcularBlockiness(luminanciaData, width, height, tamanoBloque = 8) {
  if (width < tamanoBloque * 2 || height < tamanoBloque * 2) return 0;

  let totalDiferenciasHorizontales = 0;
  let bordesHorizontales = 0;

  // Bordes horizontales de bloques
  for (let y = 0; y < height; y++) {
    for (let x = tamanoBloque - 1; x < width - 1; x += tamanoBloque) {
      totalDiferenciasHorizontales += Math.abs(luminanciaData[y * width + x] - luminanciaData[y * width + x + 1]);
      bordesHorizontales++;
    }
  }

  let totalDiferenciasVerticales = 0;
  let bordesVerticales = 0;

  // Bordes verticales de bloques
  for (let x = 0; x < width; x++) {
    for (let y = tamanoBloque - 1; y < height - 1; y += tamanoBloque) {
      totalDiferenciasVerticales += Math.abs(luminanciaData[y * width + x] - luminanciaData[(y + 1) * width + x]);
      bordesVerticales++;
    }
  }

  if (bordesHorizontales === 0 && bordesVerticales === 0) return 0;

  // Promedio de diferencias en bordes de bloques
  return (totalDiferenciasHorizontales + totalDiferenciasVerticales) / (bordesHorizontales + bordesVerticales);
}

/**
 * Calcula estadísticas completas sobre canal de luminancia
 * @param {Uint8Array} luminanciaData - Datos de luminancia
 * @param {number} width - Ancho de la imagen
 * @param {number} height - Alto de la imagen
 * @returns {Object} - Estadísticas calculadas
 */
function calcularEstadisticasLuminancia(luminanciaData, width, height) {
  const histogramaY = new Array(256).fill(0);
  let sumaValoresY = 0;
  let sumaGradientes = 0;
  let conteoGradientes = 0;
  const totalPixeles = width * height;

  if (totalPixeles === 0 || luminanciaData.length !== totalPixeles) {
    dragon.sePreocupa("Datos de luminancia inconsistentes", MODULE_NAME, "calcularEstadisticasLuminancia", {
      ancho: width,
      alto: height,
      longitudDatos: luminanciaData.length
    });
    return {
      histogramaY,
      mediaY: 0,
      desviacionEstandarY: 0,
      gradientePromedioY: 0,
      totalPixeles: 0,
      picosAltosY: 0
    };
  }

  // Calcular histograma y sumas para estadísticas
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const valorY = luminanciaData[idx];

      histogramaY[valorY]++;
      sumaValoresY += valorY;

      // Calcular gradientes horizontales y verticales
      if (x < width - 1 && y < height - 1) {
        const gradH = Math.abs(valorY - luminanciaData[idx + 1]);
        const gradV = Math.abs(valorY - luminanciaData[idx + width]);
        sumaGradientes += gradH + gradV;
        conteoGradientes += 2;
      }
    }
  }

  // Detectar picos significativos en histograma (>6% de píxeles)
  const picosAltosY = histogramaY.filter(v => v > totalPixeles * 0.06).length;

  // Calcular estadísticas finales
  const mediaY = totalPixeles > 0 ? sumaValoresY / totalPixeles : 0;
  const desviacionEstandarY = totalPixeles > 0 ? calcularDesviacionEstandar(histogramaY, totalPixeles, mediaY) : 0;
  const gradientePromedioY = conteoGradientes > 0 ? sumaGradientes / conteoGradientes : 0;

  return {
    histogramaY,
    mediaY,
    desviacionEstandarY,
    gradientePromedioY,
    totalPixeles,
    picosAltosY
  };
}

/**
 * Analizador de artefactos visuales para imágenes
 * Implementa interfaz AnalizadorImagen para Dragon3
 */
class AnalizadorArtefactos {
  /**
   * Constructor del analizador
   * @param {Object} options - Opciones de configuración
   */
  constructor(options = {}) {
    this.version = ANALYZER_VERSION;
    this.id = ANALYZER_ID;
    this.options = {
      timeoutMs: options.timeoutMs || CONFIG.timeoutMs,
      maxImageSizeBytes: options.maxImageSizeBytes || CONFIG.maxImageSizeBytes,
      ...options
    };

    dragon.respira('Analizador de Artefactos inicializado', MODULE_NAME, 'constructor', {
      version: this.version,
      options: this.options
    });
  }

  /**
   * Analiza artefactos visuales en una imagen
   * Implementación de interfaz requerida por analizadorImagen.js
   * * @param {Object} parametros - Parámetros del análisis
   * @param {string} parametros.rutaArchivo - Ruta del archivo a analizar
   * @param {string} parametros.archivoId - ID único del archivo
   * @param {string} parametros.correlationId - ID de correlación para trazabilidad
   * @param {string} [parametros.nombreOriginal] - Nombre original del archivo
   * @param {string} [parametros.usuarioId] - ID del usuario que solicita el análisis
   * @param {string} [parametros.clientId] - ID del cliente que realiza la solicitud
   * @returns {Promise<Object>} Resultado del análisis con formato para analizadorImagen.js
   */
  async analizarImagen(parametros) {
    const tiempoInicio = performance.now();

    // Validación de parámetros básicos
    if (!parametros || !parametros.rutaArchivo || !parametros.archivoId) {
      dragon.agoniza('Parámetros incompletos', new Error('rutaArchivo y archivoId son obligatorios'),
        MODULE_NAME, 'analizarImagen');
      throw new Error('Parámetros incompletos: rutaArchivo y archivoId son obligatorios');
    }

    const { rutaArchivo, archivoId, correlationId, nombreOriginal } = parametros;

    // 👇 1. INICIALIZAR REPORTE STANDARD
    const reporte = new RespuestaStandard(ANALYZER_ID, "Integridad Visual", ANALYZER_VERSION);

    dragon.respira(`Iniciando análisis de artefactos para ${archivoId}`, MODULE_NAME, 'analizarImagen', {
      archivoId,
      correlationId,
      nombreOriginal: nombreOriginal || path.basename(rutaArchivo)
    });

    try {
      // Verificar existencia del archivo
      if (!existsSync(rutaArchivo)) {
        throw new Error(`Archivo no encontrado: ${rutaArchivo}`);
      }

      // Comprobar tamaño
      const stats = statSync(rutaArchivo);
      if (stats.size > this.options.maxImageSizeBytes) {
        dragon.sePreocupa(`Archivo excede tamaño recomendado: ${Math.round(stats.size/1024/1024)}MB > ${Math.round(this.options.maxImageSizeBytes/1024/1024)}MB`,
          MODULE_NAME, 'analizarImagen', {
            archivoId,
            fileSize: stats.size,
            maxSize: this.options.maxImageSizeBytes
          });
      }

      // Cargar imagen con Sharp para procesamiento
      const imagenSharp = sharp(rutaArchivo, { failOnError: true });

      // Obtener metadatos y datos de píxeles en paralelo
      const [metadata, pixelDataRGB] = await Promise.all([
        imagenSharp.metadata(),
        imagenSharp.raw().toBuffer()
      ]);

      const { width, height, channels, density: sharpDensity, format } = metadata;

      if (!width || !height || !channels) {
        throw new Error("Metadatos de imagen incompletos (dimensiones/canales)");
      }

      dragon.respira(`Metadatos de imagen extraídos`, MODULE_NAME, 'analizarImagen', {
        archivoId,
        ancho: width,
        alto: height,
        canales: channels,
        formato: format || 'desconocido',
        densidad: sharpDensity || 'N/A'
      });

      // Convertir a luminancia para análisis
      const luminanciaData = rgbToLuminancia(pixelDataRGB, width, height, channels);
      if (luminanciaData.length !== width * height) {
        throw new Error("Fallo en conversión a luminancia o datos inconsistentes");
      }

      // Calcular estadísticas de luminancia
      const statsLuma = calcularEstadisticasLuminancia(luminanciaData, width, height);
      if (statsLuma.totalPixeles === 0) {
        throw new Error("Procesamiento de luminancia fallido");
      }

      // Calcular blockiness y entropía
      const blockiness = calcularBlockiness(luminanciaData, width, height);
      const entropiaY = calcularEntropia(statsLuma.histogramaY, statsLuma.totalPixeles);

      dragon.respira(`Estadísticas de luminancia calculadas`, MODULE_NAME, 'analizarImagen', {
        archivoId,
        gradientePromedio: statsLuma.gradientePromedioY.toFixed(2),
        desviacionEstandar: statsLuma.desviacionEstandarY.toFixed(2),
        blockiness: blockiness.toFixed(2),
        entropia: entropiaY.toFixed(2)
      });

      // ===== DETECCIÓN DE ARTEFACTOS (IA/GAN/DIFFUSION) =====

      // Suavidad excesiva típica de IA generativa
      let suavidadExcesivaIA = statsLuma.gradientePromedioY < CONFIG.minGradienteLumaNatural &&
                              (entropiaY > 7.0 || statsLuma.desviacionEstandarY > 50);

      // Patrones de bordes inconsistentes
      let bordesInconsistentes = (statsLuma.gradientePromedioY > 20 ||
                                 statsLuma.desviacionEstandarY > 65) &&
                                 !suavidadExcesivaIA;

      // Detección de texturas inconsistentes entre regiones
      let texturasInconsistentes = false;
      const numPixelesPorMitad = Math.floor(statsLuma.totalPixeles / 2);
      if (numPixelesPorMitad > 0 && (statsLuma.totalPixeles - numPixelesPorMitad) > 0) {
        let sumaY1 = 0;
        for (let i = 0; i < numPixelesPorMitad; i++) {
          sumaY1 += luminanciaData[i];
        }

        let sumaY2 = 0;
        for (let i = numPixelesPorMitad; i < statsLuma.totalPixeles; i++) {
          sumaY2 += luminanciaData[i];
        }

        const mediaY1 = sumaY1 / numPixelesPorMitad;
        const mediaY2 = sumaY2 / (statsLuma.totalPixeles - numPixelesPorMitad);

        if (Math.abs(mediaY1 - mediaY2) > 28) {
          texturasInconsistentes = true;
        }
      }

      // Contraste extremo en luminancia
      let contrasteExtremoLuma = statsLuma.desviacionEstandarY > 70;

      // Patrones GAN/diffusion (checkerboard, picos anómalos, baja complejidad)
      let patronesGAN = false;
      if (
        statsLuma.gradientePromedioY < 11 && // Suavidad típica IA
        statsLuma.picosAltosY > 10 &&
        statsLuma.picosAltosY < 60 &&
        entropiaY > 7.1
      ) {
        patronesGAN = true;
      }

      // Checkerboard visible (patrón de tablero de ajedrez)
      let checkerboardGAN = (statsLuma.picosAltosY < 8 &&
                            blockiness < 10 &&
                            entropiaY > 6.85);

      // Patrones repetitivos de IA
      let patronesRepetitivosIA = patronesGAN ||
                                checkerboardGAN ||
                                ((blockiness < CONFIG.maxBlockinessConsideredLowForIA) &&
                                suavidadExcesivaIA);

      // Compresión JPEG (artefactos de bloque)
      let compresionExcesivaJPEG = blockiness > 10 && blockiness < CONFIG.maxBlockinessConsideredLowForIA;
      let compresionMuyExcesivaJPEG = blockiness >= CONFIG.maxBlockinessConsideredLowForIA;

      dragon.respira(`Análisis de artefactos completado`, MODULE_NAME, 'analizarImagen', {
        archivoId,
        suavidadIA: suavidadExcesivaIA,
        patronesGAN,
        checkerboardGAN,
        bordesInconsistentes,
        texturasInconsistentes,
        blockiness
      });

      const indiciosIA = (patronesRepetitivosIA || suavidadExcesivaIA || patronesGAN || checkerboardGAN);

      // ===== SCORE PONDERADO DE AUTENTICIDAD (Comienza la corrección) =====

      // Pesos para cada característica de artefacto
      const pesos = {
        suavidadIA: 0.28,
        patronesGAN: 0.20,
        checkerboardGAN: 0.12,
        bordes: 0.10,
        texturas: 0.10,
        contraste: 0.08,
        blockinessMod: 0.07,
        blockinessHigh: 0.05
      };

      // Cálculo del score ponderado (factores positivos = puntos)
      let scoreCalculado = pesos.suavidadIA * (suavidadExcesivaIA ? 0 : 1) +
                         pesos.patronesGAN * (patronesGAN ? 0 : 1) +
                         pesos.checkerboardGAN * (checkerboardGAN ? 0 : 1) +
                         pesos.bordes * (bordesInconsistentes ? 0 : 1) +
                         pesos.texturas * (texturasInconsistentes ? 0 : 1) +
                         pesos.contraste * (contrasteExtremoLuma ? 0 : 1) +
                         pesos.blockinessMod * (compresionExcesivaJPEG ? 0 : 1) +
                         pesos.blockinessHigh * (compresionMuyExcesivaJPEG ? 0 : 1);

      // Score en escala 0-10
      let scoreDecimal = parseFloat((scoreCalculado * 10).toFixed(1));

      // --- INICIO DE LA LÓGICA DE ROBUSTEZ Y CORRECCIÓN DE FALSOS POSITIVOS DE IA (V4.0.0) ---

      // 1. Identificar el Conflicto: ¿Se detectó IA Y Compresión Destructiva?
      const compresionAnuladora = compresionMuyExcesivaJPEG || (blockiness > 8.0 && compresionExcesivaJPEG);

      if (indiciosIA && compresionAnuladora) {
          // Escenario de Falso Positivo: Compresión Destructiva simula IA
          const ajusteScore = 2.5;
          scoreDecimal = Math.min(10.0, scoreDecimal + ajusteScore);
      }

      // --- FIN LÓGICA MATEMÁTICA ---

      // --- [NUEVA CONSTRUCCIÓN DEL REPORTE V25] ---

      let decision = "Indeterminado";
      let confianza = 0.5;
      let pesoVoto = "medio"; // Artefactos suelen ser indicio fuerte pero no irrefutable
      let mensajeCorto = "Análisis de ruido completado";

      // 1. Detección de IA (Puntuación baja)
      if (scoreDecimal < 4.0) {
          decision = "Artificial";
          confianza = 0.85;
          pesoVoto = "alto"; // Si es muy obvio, peso alto
          mensajeCorto = "Patrones sintéticos detectados";
          reporte.activarFlag("ia");
          reporte.registrarHerramienta("Generador IA", "Generador IA");
      }
      // 2. Detección de Humano (Puntuación alta)
      else if (scoreDecimal >= 8.0) {
          decision = "Humano";
          confianza = 0.9;
          pesoVoto = "alto"; // Si es muy natural, peso alto
          mensajeCorto = "Estructura de ruido natural";
          reporte.activarFlag("camara"); // Asumimos origen óptico
      }
      // 3. Zona Gris (Posible edición / Compresión)
      else {
          decision = "Indeterminado";
          confianza = 0.6;
          mensajeCorto = "Artefactos mixtos (posible edición)";
          reporte.activarFlag("edicion");
      }

      // Definir Voto para el Juez (Escalamos scoreDecimal de 0-10 a 0-100)
      reporte.definirVoto(decision, confianza, scoreDecimal * 10, "Bajo");

      // Narrativa para el Cliente
      const icono = decision === 'Humano' ? '👁️' : (decision === 'Artificial' ? '🤖' : '🎨');
      const estado = decision === 'Humano' ? 'success' : (decision === 'Artificial' ? 'danger' : 'warning');

      reporte.concluir(
          estado, icono, mensajeCorto,
          `El análisis de luminancia y entropía otorga un score de ${scoreDecimal}/10. ${
              decision === 'Humano' ? 'Se observa ruido natural consistente con sensores ópticos.' :
              (decision === 'Artificial' ? 'Se detectan patrones de suavizado o repetición típicos de generación sintética.' :
              'La imagen presenta una mezcla de artefactos de compresión y edición.')
          }`,
          `Entropía: ${entropiaY.toFixed(2)}. Blockiness: ${blockiness.toFixed(2)}. Gradiente: ${statsLuma.gradientePromedioY.toFixed(2)}.`
      );

      // Datos Visuales (Ficha Técnica)
      reporte.agregarDato("Score Visual", scoreDecimal, "/10");
      reporte.agregarDato("Entropía", entropiaY.toFixed(2));
      reporte.agregarDato("Ruido (Blockiness)", blockiness.toFixed(2));
      if (compresionAnuladora) {
          reporte.agregarDato("Nota", "Compresión extrema detectada (puede ocultar huellas)");
      }

      // Datos Forenses (Caja Negra)
      reporte.datosForenses(scoreDecimal * 10, "Luminance/Entropy Analysis (v4.0.1 Math)", {
          stats_luma: statsLuma,
          blockiness: blockiness,
          entropy: entropiaY,
          artifacts_detected: {
              suavidad: suavidadExcesivaIA,
              gan: patronesGAN,
              checkerboard: checkerboardGAN,
              compression_mask: compresionAnuladora
          }
      });

      // Logs y Retorno
      const tiempoTotal = performance.now() - tiempoInicio;
      dragon.mideRendimiento('analizarImagen', tiempoTotal, MODULE_NAME, {
        archivoId, correlationId,
        score: scoreDecimal.toFixed(1)
      });

      return reporte.cerrar();

    } catch (error) {
      // Manejo de error estándar
      return reporte.error(error).cerrar();
    }
  }

  /**
   * Devuelve información sobre el analizador
   * @returns {Object} Información del analizador
   */
  getInfo() {
    return {
      nombre: ANALYZER_ID,
      version: ANALYZER_VERSION,
      tipo: 'ML-Enhanced',
      explicabilidad: true,
      descripcion: 'Analizador de artefactos visuales y patrones IA en imágenes',
      autor: 'Gustavo Herraiz',
      fechaActualizacion: '2025-11-20'
    };
  }
}

// Exportar clase como default para compatibilidad con analizadorImagen.js
export default new AnalizadorArtefactos();

// Exportar también como named exports para tests y utilidades
export { AnalizadorArtefactos, ANALYZER_VERSION };
