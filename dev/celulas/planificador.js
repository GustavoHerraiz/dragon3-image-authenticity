/**
 * planificador.js
 * 
 * Módulo que genera planes dinámicamente en función del tipo de archivo.
 * Construye el plan manualmente para que `generar-veredicto` reciba TODAS las referencias.
 * 
 * Principios: KISS, extensible, robusto.
 * 
 * @module planificador
 */

import { obtenerCatalogoCompleto } from './generador-plan.js';

/**
 * Mapeo de tipos de archivo a las células que se deben ejecutar.
 * El orden es el de ejecución secuencial.
 */
const MAPEO_TIPOS = {
  'image': {
    descripcion: 'Análisis completo de imagen (EXIF, herramientas IA, sellos, patrones forenses, doble compresión, artefactos)',
    celulas: [
      'cargar-imagen',
      'extraer-metadatos-exif',
      'detectar-herramienta-ia',
      'detectar-sellos-autenticidad',
      'detectar-patrones-forenses',
      'detectar-doble-compresion-sharp',
      'detectar-artefactos-ia',
      'generar-veredicto'
    ]
  },
  'video': {
    descripcion: 'Análisis de vídeo (extracción de fotogramas, metadatos, detección de deepfakes)',
    celulas: [
      'cargar-video',      // Pendiente de implementar
      'extraer-fotogramas',
      'analizar-metadatos-video',
      'detectar-deepfake'
    ]
  },
  'application/pdf': {
    descripcion: 'Análisis de PDF (extracción de texto, metadatos, detección de manipulación)',
    celulas: [
      'cargar-pdf',        // Pendiente de implementar
      'extraer-texto-pdf',
      'analizar-metadatos-pdf',
      'detectar-manipulacion-pdf'
    ]
  },
  'desconocido': {
    descripcion: 'Tipo de archivo desconocido. Solo se ejecutan células básicas.',
    celulas: [
      'cargar-generico',
      'extraer-metadatos-genericos'
    ]
  }
};

/**
 * Alias para mapear tipos MIME a claves del mapa.
 */
const ALIAS_TIPOS = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'application/pdf'
};

/**
 * Normaliza el tipo de archivo a una clave del mapa.
 * @param {string} tipo - Tipo MIME o descripción (ej. 'image', 'pdf', 'image/jpeg').
 * @returns {string} Clave normalizada ('image', 'video', 'application/pdf', 'desconocido').
 */
function normalizarTipo(tipo) {
  if (!tipo) return 'desconocido';
  const t = tipo.toLowerCase().trim();
  if (MAPEO_TIPOS[t]) return t;
  if (ALIAS_TIPOS[t]) return ALIAS_TIPOS[t];
  if (t.includes('image')) return 'image';
  if (t.includes('video')) return 'video';
  if (t.includes('pdf')) return 'application/pdf';
  return 'desconocido';
}

/**
 * Planifica un plan dinámico según el tipo de archivo.
 * 
 * Para las células de análisis (excepto `cargar-imagen` y `generar-veredicto`),
 * la entrada es `$.contexto.archivo` (el buffer original en base64).
 * Esto evita dependencias de `cargar-imagen` y asegura que siempre tengan el payload.
 * 
 * @param {string} tipoArchivo - El tipo de archivo (MIME, 'image', 'pdf', etc.).
 * @param {Object} opciones - Opciones adicionales (reservado para futura extensión).
 * @returns {Object} Plan JSON listo para ejecutar por el orquestador.
 * @throws {Error} Si no hay células disponibles para el tipo.
 */
export function planificar(tipoArchivo, opciones = {}) {
  // 1. Normalizar tipo
  const tipo = normalizarTipo(tipoArchivo);

  // 2. Obtener mapeo para este tipo
  const mapeo = MAPEO_TIPOS[tipo] || MAPEO_TIPOS['desconocido'];
  if (!mapeo || !mapeo.celulas || mapeo.celulas.length === 0) {
    throw new Error(`No hay células definidas para el tipo de archivo "${tipoArchivo}" (normalizado a "${tipo}").`);
  }

  // 3. Obtener el catálogo completo para validar que las células existen
  const catalogo = obtenerCatalogoCompleto();
  const idsCelulas = mapeo.celulas;
  const celulasExistentes = idsCelulas.filter(id => 
    catalogo.células.some(c => c.id === id)
  );

  if (celulasExistentes.length === 0) {
    throw new Error(`Ninguna de las células para el tipo "${tipo}" existe en el catálogo.`);
  }

  if (celulasExistentes.length < idsCelulas.length) {
    const faltantes = idsCelulas.filter(id => !catalogo.células.some(c => c.id === id));
    console.warn(`⚠️ Algunas células para el tipo "${tipo}" no existen en el catálogo: ${faltantes.join(', ')}. Se omitirán.`);
  }

  // 4. Construir el plan manualmente
  const nombre = `plan-auto-${tipo}-${Date.now()}`;
  const plan = {
    version: '1.0',
    nombre,
    descripcion: mapeo.descripcion,
    células: [],
    salidaFinal: '',
    detenerseEnError: false
  };

  const idCargarImagen = 'cargar-imagen';
  const idGenerarVeredicto = 'generar-veredicto';

  // Recorrer las células existentes en orden
  let idAnterior = null;

  for (const id of celulasExistentes) {
    const celulaCatalogo = catalogo.células.find(c => c.id === id);
    if (!celulaCatalogo) continue;

    let entrada = {};

    // Caso especial: cargar-imagen recibe del contexto
    if (id === idCargarImagen) {
      entrada = { payload: '$.contexto.archivo' };
    }
    // Caso especial: generar-veredicto recibe TODAS las referencias
    else if (id === idGenerarVeredicto) {
      const idsAnalisis = celulasExistentes.filter(c => c !== idGenerarVeredicto);
      const referencias = {};
      for (const analisisId of idsAnalisis) {
        referencias[analisisId] = `$.${analisisId}.resultado`;
      }
      entrada = { payload: referencias };
    }
    // Resto de células de análisis: reciben el buffer original desde el contexto
    else {
      entrada = { payload: '$.contexto.archivo' };
    }

    // Añadir la célula al plan
    plan.células.push({
      id: id,
      ruta: celulaCatalogo.ruta,
      entrada: entrada
    });

    idAnterior = id;
  }

  // 5. Salida final: resultado de la última célula (generar-veredicto)
  if (idAnterior) {
    plan.salidaFinal = `$.${idAnterior}.resultado`;
  } else {
    plan.salidaFinal = '$.contexto.archivo';
  }

  // 6. Añadir metadatos del tipo al plan (para trazabilidad)
  plan._tipo = tipo;
  plan._descripcion = mapeo.descripcion;

  return plan;
}

/**
 * Devuelve la lista de tipos de archivo soportados (claves del mapa).
 * @returns {string[]} Array con los tipos soportados.
 */
export function tiposSoportados() {
  return Object.keys(MAPEO_TIPOS);
}

/**
 * Devuelve la descripción de un tipo de archivo.
 * @param {string} tipo - El tipo de archivo (MIME o clave).
 * @returns {string} Descripción del tipo.
 */
export function descripcionTipo(tipo) {
  const t = normalizarTipo(tipo);
  const mapeo = MAPEO_TIPOS[t] || MAPEO_TIPOS['desconocido'];
  return mapeo.descripcion || 'Tipo desconocido';
}