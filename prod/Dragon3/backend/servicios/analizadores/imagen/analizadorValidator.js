/**
 * analizadorValidator.js
 * ======================
 * @file Validador de integridad y autenticidad básica de imágenes
 * @version 4.0.0-FAANG
 * @author Gustavo Herraiz - Lead Architect Dragon Project
 * @path /var/www/Dragon3/backend/servicios/imagen/analizadores/imagen/analizadorValidator.js
 *
 * @description
 * Analizador determinístico que valida la integridad básica de una imagen y
 * extrae sus características fundamentales. Detecta indicadores de:
 * - Formato y dimensiones
 * - Patrones de mensajería (WhatsApp, etc.)
 * - Software de generación IA
 * - Software de edición
 * - Software de dispositivos genuinos
 * - Sellos de verificación
 *
 * Sirve como primera capa de validación para el pipeline de análisis.
 *
 * FAANG Enterprise:
 * - Solo depende de exiftool-vendored para metadatos (más robusto)
 * - Logging estructurado centralizado con Dragon3 logger
 * - Sin dependencias muertas ni código legado (exifr eliminado)
 * - Performance: P95 < 100ms, tolerancia a fallos, SLA estricto
 * - Seguridad y KISS: sin console.log, sin bloqueos inesperados
 * - Documentación profesional, integración 100% pipeline Dragon3
 * ======================
 */

import fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let exiftool;
let dragon;
let dependenciasFaltantes = [];

// Importación robusta dinámica (FAANG)
try {
  exiftool = (await import('exiftool-vendored')).exiftool;
} catch { dependenciasFaltantes.push('exiftool-vendored'); }
try {
  dragon = (await import('../../../../utilidades/logger.js')).default;
} catch { dependenciasFaltantes.push('logger.js'); }

const ANALYZER_VERSION = '4.0.0-FAANG';
const ANALYZER_ID = 'analizadorValidator';
const MODULE_NAME = 'analizadorValidator.js';

/**
 * Configuración del analizador
 * @type {Object}
 */
const CONFIG = {
  nombresMensajeriaPatterns: [
    /^(IMG-\d{4}|WhatsApp Image \d{4}-\d{2}-\d{2})/,
    /^IMG_\d{8}_WA\d+/,
    /^Telegram_/
  ],
  dimensionesMensajeria: [
    "960x1280", "1280x960", "720x1280", "800x600", "864x1152",
    "1080x2340", "2340x1080", "1080x1920", "1920x1080", "768x1366"
  ],
  minimoKeysCriterioCamara: 5,
  pathPatronesHerramientas: path.join(path.dirname(fileURLToPath(import.meta.url)), 'analizadorHerramientasSospechosas.json'),
  timeoutMs: parseInt(process.env.ANALIZADOR_VALIDATOR_TIMEOUT_MS || '1200', 10)
};

/**
 * Compila un array de patrones de texto a expresiones regulares
 * @param {Array<string>} patrones - Lista de patrones como strings
 * @returns {Array<RegExp>} - Lista de expresiones regulares compiladas
 */
function compilarPatrones(patrones) {
  if (!Array.isArray(patrones)) return [];
  return patrones.map(patron => {
    try {
      return new RegExp(patron, 'i');
    } catch (error) {
      if (dragon) {
        dragon.sePreocupa(`Patrón inválido ignorado: ${patron}`, MODULE_NAME, 'compilarPatrones', {
          patron,
          error: error.message
        });
      }
      return null;
    }
  }).filter(Boolean);
}

/**
 * Analizador de validación básica de imágenes (FAANG Enterprise)
 */
class AnalizadorValidator {
  /**
   * Constructor del analizador
   * @param {Object} options - Opciones de configuración
   */
  constructor(options = {}) {
    this.version = ANALYZER_VERSION;
    this.id = ANALYZER_ID;
    this.options = {
      pathPatronesHerramientas: options.pathPatronesHerramientas || CONFIG.pathPatronesHerramientas,
      nombresMensajeriaPatterns: options.nombresMensajeriaPatterns || CONFIG.nombresMensajeriaPatterns,
      dimensionesMensajeria: options.dimensionesMensajeria || CONFIG.dimensionesMensajeria,
      minimoKeysCriterioCamara: options.minimoKeysCriterioCamara || CONFIG.minimoKeysCriterioCamara,
      timeoutMs: options.timeoutMs || CONFIG.timeoutMs
    };
    this.patrones = {
      softwareEdicion: [],
      softwareGeneracionIA: [],
      softwareGenerico: [],
      sellosVerificacion: []
    };
    this._cargarPatrones();

    if (dragon) {
      dragon.respira('Analizador Validator inicializado', MODULE_NAME, 'constructor', {
        version: this.version,
        patronesPath: this.options.pathPatronesHerramientas
      });
    }
  }

  /**
   * Carga patrones de herramientas sospechosas desde archivo JSON
   * @private
   */
  _cargarPatrones() {
    try {
      if (existsSync(this.options.pathPatronesHerramientas)) {
        const rawConfig = readFileSync(this.options.pathPatronesHerramientas, 'utf8');
        const configHerramientas = JSON.parse(rawConfig);
        this.patrones.softwareEdicion = compilarPatrones(configHerramientas.softwareEdicion || []);
        this.patrones.softwareGeneracionIA = compilarPatrones(configHerramientas.softwareGeneracionIA || []);
        this.patrones.softwareGenerico = compilarPatrones(configHerramientas.softwareGenerico || []);
        this.patrones.sellosVerificacion = compilarPatrones(configHerramientas.sellosVerificacion || []);

        if (dragon) {
          dragon.respira('Patrones de herramientas cargados', MODULE_NAME, '_cargarPatrones', {
            edicion: this.patrones.softwareEdicion.length,
            ia: this.patrones.softwareGeneracionIA.length,
            generico: this.patrones.softwareGenerico.length,
            sellos: this.patrones.sellosVerificacion.length
          });
        }
      } else {
        if (dragon) {
          dragon.sePreocupa(`Archivo de patrones no encontrado: ${this.options.pathPatronesHerramientas}`,
            MODULE_NAME, '_cargarPatrones');
        }
      }
    } catch (error) {
      if (dragon) {
        dragon.agoniza('Error al cargar patrones de herramientas', error, MODULE_NAME, '_cargarPatrones', {
          ruta: this.options.pathPatronesHerramientas
        });
      }
      this.patrones = {
        softwareEdicion: [],
        softwareGeneracionIA: [],
        softwareGenerico: [],
        sellosVerificacion: []
      };
    }
  }

  /**
   * Detecta si un string coincide con algún patrón de la lista
   * @private
   * @param {string} texto - Texto a analizar
   * @param {Array<RegExp>} listaPatrones - Lista de expresiones regulares
   * @returns {boolean} - true si hay coincidencia
   */
  _coincideConPatrones(texto, listaPatrones) {
    if (!texto || typeof texto !== 'string' || !Array.isArray(listaPatrones)) return false;
    return listaPatrones.some(patron => patron.test(texto));
  }

  /**
   * Analiza y valida una imagen, extrayendo sus características principales
   * @param {Object} parametros - Parámetros del análisis
   * @param {string} parametros.rutaArchivo - Ruta del archivo a analizar
   * @param {string} parametros.archivoId - ID único del archivo
   * @param {string} parametros.correlationId - ID de correlación para trazabilidad
   * @param {string} [parametros.nombreOriginal] - Nombre original del archivo
   * @param {string} [parametros.usuarioId] - ID del usuario que solicita el análisis
   * @param {string} [parametros.clientId] - ID del cliente que realiza la solicitud
   * @returns {Promise<Object>} Resultado del análisis con formato para analizadorImagen.js
   */
  async analizarImagen(parametros) {
    const tiempoInicio = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!parametros || !parametros.rutaArchivo || !parametros.archivoId) {
      if (dragon) {
        dragon.agoniza('Parámetros incompletos', new Error('rutaArchivo y archivoId son obligatorios'),
          MODULE_NAME, 'analizarImagen');
      }
      throw new Error('Parámetros incompletos: rutaArchivo y archivoId son obligatorios');
    }

    const { rutaArchivo, archivoId, correlationId, nombreOriginal } = parametros;
    const nombreArchivo = nombreOriginal || path.basename(rutaArchivo);

    if (dragon) {
      dragon.respira(`Iniciando validación básica para ${archivoId}`, MODULE_NAME, 'analizarImagen', {
        archivoId,
        correlationId,
        nombreArchivo
      });
    }

    // Resultado inicial
    const resultado = {
      esAutentico: true,
      confianza: 0.5,
      idAnalizador: ANALYZER_ID,
      version: ANALYZER_VERSION,
      detalles: {
        formato: "No disponible",
        dimensiones: "No disponible",
        resolucion: "No disponible",
        mensaje: "Análisis no procesado correctamente."
      },
      metadatos: {}
    };

    try {
      // Verificar archivo
      if (!existsSync(rutaArchivo)) {
        throw new Error(`Archivo no encontrado: ${rutaArchivo}`);
      }

      if (dragon) {
        const stats = await fs.stat(rutaArchivo);
        dragon.respira(`Archivo validado`, MODULE_NAME, 'analizarImagen', {
          archivoId,
          tamano: stats.size
        });
      }

      resultado.detalles.formato = path.extname(rutaArchivo).substring(1).toUpperCase() || "No disponible";

      // ==== EXTRACCIÓN DE METADATOS (SOLO EXIFTOOL, FAANG) ====
      let metadatosCompletos = {};
      try {
        metadatosCompletos = await Promise.race([
          exiftool.read(rutaArchivo),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout en exiftool después de ${this.options.timeoutMs}ms`)), this.options.timeoutMs)
          )
        ]) || {};
        if (dragon) {
          dragon.respira(`Metadatos EXIF extraídos`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            keyCount: Object.keys(metadatosCompletos).length
          });
        }
      } catch (error) {
        if (dragon) {
          dragon.sePreocupa(`Error/Timeout en exiftool: ${error.message}`, MODULE_NAME, 'analizarImagen', { archivoId });
        }
        metadatosCompletos = {};
      }

      // ===== PROCESAR METADATOS BÁSICOS =====
      resultado.detalles.dimensiones = metadatosCompletos.ImageWidth && metadatosCompletos.ImageHeight
        ? `${metadatosCompletos.ImageWidth}x${metadatosCompletos.ImageHeight}`
        : "No disponible";
      resultado.detalles.resolucion = metadatosCompletos.XResolution && metadatosCompletos.YResolution
        ? `${metadatosCompletos.XResolution}x${metadatosCompletos.YResolution} ppi`
        : "No disponible";

      // Extraer metadatos relevantes para el resultado
      const metadatosRelevantes = {};
      if (metadatosCompletos.Make) metadatosRelevantes.camara = metadatosCompletos.Make;
      if (metadatosCompletos.Model) metadatosRelevantes.modelo = metadatosCompletos.Model;
      if (metadatosCompletos.DateTimeOriginal) metadatosRelevantes.fechaCaptura = metadatosCompletos.DateTimeOriginal;
      if (metadatosCompletos.Software) metadatosRelevantes.software = metadatosCompletos.Software;

      resultado.metadatos = {
        formato: resultado.detalles.formato || "No disponible",
        dimensiones: resultado.detalles.dimensiones || "No disponible",
        resolucion: resultado.detalles.resolucion || "No disponible",
        ...metadatosRelevantes
      };

      // ===== DETECCIÓN DE PATRONES =====
      const esNombreMensajeria = this.options.nombresMensajeriaPatterns.some(
        patron => patron.test(nombreArchivo)
      );
      const esDimensionMensajeria = this.options.dimensionesMensajeria.includes(resultado.detalles.dimensiones);
      const softwareEsMensajeria = metadatosCompletos.Software &&
        /whatsapp|telegram|signal|messenger/i.test(metadatosCompletos.Software);

      const exifKeys = Object.keys(metadatosCompletos);
      const exifEscarso = exifKeys.length < this.options.minimoKeysCriterioCamara;

      const softwareDetectado = metadatosCompletos.Software || "";

      const esIA = this._coincideConPatrones(softwareDetectado, this.patrones.softwareGeneracionIA);
      const esEdicion = this._coincideConPatrones(softwareDetectado, this.patrones.softwareEdicion);
      const esGenerico = this._coincideConPatrones(softwareDetectado, this.patrones.softwareGenerico);
      const tieneSello = this._coincideConPatrones(softwareDetectado, this.patrones.sellosVerificacion);

      // ===== LÓGICA DE SCORE Y MENSAJES =====
      let scoreCalculado = 5;
      let confianzaCalculada = 0.5;
      let esAutenticoCalculado = true;

      if (esNombreMensajeria || esDimensionMensajeria || softwareEsMensajeria || exifEscarso) {
        scoreCalculado = 6;
        confianzaCalculada = 0.6;
        esAutenticoCalculado = true;
        resultado.detalles.mensaje = "Se ha detectado que la imagen ha sido enviada por mensajería. El resultado NO puede ser concluyente y no se puede analizar la autenticidad de esta imagen.";
        if (dragon) {
          dragon.respira(`Patrón de mensajería detectado`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            nombreMatch: esNombreMensajeria,
            dimensionMatch: esDimensionMensajeria,
            softwareMatch: softwareEsMensajeria,
            exifEscarso
          });
        }
      } else if (esIA) {
        scoreCalculado = 2;
        confianzaCalculada = 0.85;
        esAutenticoCalculado = false;
        resultado.detalles.mensaje = `Software de generación IA detectado (${softwareDetectado}). Probable imagen generada sintéticamente.`;
        if (dragon) {
          dragon.respira(`Software IA detectado`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            software: softwareDetectado
          });
        }
      } else if (esEdicion) {
        scoreCalculado = 4;
        confianzaCalculada = 0.7;
        esAutenticoCalculado = false;
        resultado.detalles.mensaje = `Software de edición detectado (${softwareDetectado}). Imagen probablemente editada.`;
        if (dragon) {
          dragon.respira(`Software de edición detectado`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            software: softwareDetectado
          });
        }
      } else if (esGenerico) {
        scoreCalculado = 8;
        confianzaCalculada = 0.8;
        esAutenticoCalculado = true;
        resultado.detalles.mensaje = `Software de cámara o genérico detectado (${softwareDetectado}). Imagen probablemente directa de dispositivo.`;
        if (dragon) {
          dragon.respira(`Software de cámara/dispositivo detectado`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            software: softwareDetectado
          });
        }
      } else if (tieneSello) {
        scoreCalculado = 9;
        confianzaCalculada = 0.9;
        esAutenticoCalculado = true;
        resultado.detalles.mensaje = `Sello de verificación detectado (${softwareDetectado}). Imagen verificada por herramienta reconocida.`;
        if (dragon) {
          dragon.respira(`Sello de verificación detectado`, MODULE_NAME, 'analizarImagen', {
            archivoId,
            software: softwareDetectado
          });
        }
      } else {
        scoreCalculado = 5;
        confianzaCalculada = 0.5;
        esAutenticoCalculado = true;
        resultado.detalles.mensaje = "La imagen parece ser auténtica con datos consistentes, pero sin identificación clara de origen.";
      }

      resultado.esAutentico = esAutenticoCalculado;
      resultado.confianza = confianzaCalculada;

      // Calcular tiempo análisis
      const tiempoFin = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tiempoTotal = tiempoFin - tiempoInicio;
      resultado.metadatos.tiempoAnalisisMs = parseFloat(tiempoTotal.toFixed(2));

      if (dragon) {
        dragon.mideRendimiento('analizarImagen', tiempoTotal, MODULE_NAME, {
          archivoId,
          correlationId,
          esAutentico: resultado.esAutentico,
          confianza: resultado.confianza,
          score: scoreCalculado
        });
        dragon.sonrie(`Validación básica completada para ${archivoId}`, MODULE_NAME, 'analizarImagen', {
          archivoId,
          correlationId,
          tiempoMs: tiempoTotal.toFixed(2),
          formato: resultado.detalles.formato,
          dimensiones: resultado.detalles.dimensiones,
          clasificacion: esIA ? 'IA' : (esEdicion ? 'Editada' : (esGenerico ? 'Dispositivo' : (tieneSello ? 'Verificada' : 'Desconocida')))
        });
      }
      return resultado;

    } catch (error) {
      const tiempoError = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tiempoInicio;
      if (dragon) {
        dragon.agoniza('Error en validación básica', error, MODULE_NAME, 'analizarImagen', {
          archivoId,
          correlationId,
          rutaArchivo,
          tiempoMs: tiempoError.toFixed(2)
        });
      }
      // Resultado mínimo en caso de error
      return {
        esAutentico: false,
        confianza: 0.2,
        idAnalizador: ANALYZER_ID,
        version: ANALYZER_VERSION,
        error: error.message,
        detalles: {
          formato: path.extname(rutaArchivo || '').substring(1).toUpperCase() || "No disponible",
          dimensiones: "Error",
          resolucion: "Error",
          mensaje: `Error en validación básica: ${error.message}`
        },
        metadatos: {
          error: error.message,
          tiempoAnalisisMs: parseFloat(tiempoError.toFixed(2))
        }
      };
    }
  }

  /**
   * Devuelve información sobre el analizador (FAANG compliance)
   * @returns {Object}
   */
  getInfo() {
    return {
      nombre: ANALYZER_ID,
      version: ANALYZER_VERSION,
      tipo: 'Deterministic',
      explicabilidad: true,
      descripcion: 'Validador de integridad y autenticidad básica de imágenes',
      autor: 'Gustavo Herraiz',
      fechaActualizacion: '2025-07-30'
    };
  }
}

// Exportación estándar para Dragon3 pipeline y tests
export default new AnalizadorValidator();
export { AnalizadorValidator, ANALYZER_VERSION };
