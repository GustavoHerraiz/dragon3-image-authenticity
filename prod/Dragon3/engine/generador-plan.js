/**
 * generador-plan.js
 *
 * Módulo para generar planes dinámicamente a partir de listas de IDs de células.
 * Consulta el catálogo de células, valida que existan y construye un plan
 * secuencial con referencias automáticas entre células.
 *
 * @module generador-plan
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOGO_PATH = path.join(__dirname, 'celulas', 'index.json');

/**
 * Obtiene el catálogo completo de células.
 * @returns {Object} Catálogo con array 'células'.
 * @throws {Error} Si no se puede leer o parsear el catálogo.
 */
function obtenerCatalogoCompleto() {
  try {
    const data = fs.readFileSync(CATALOGO_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`No se pudo leer el catálogo de células: ${error.message}`);
  }
}

/**
 * Obtiene los metadatos de una célula por su ID.
 * @param {string} id - ID de la célula.
 * @returns {Object|null} Metadatos de la célula o null si no existe.
 */
function obtenerCelulaPorId(id) {
  const catalogo = obtenerCatalogoCompleto();
  return catalogo.células.find(c => c.id === id) || null;
}

/**
 * Genera un plan dinámico a partir de una lista de IDs de células.
 *
 * El plan generado ejecuta las células en el orden dado, y cada célula
 * recibe como entrada el resultado de la célula anterior mediante referencias
 * "$.<id-anterior>.resultado". La primera célula recibe la entrada del contexto
 * bajo la clave "payload" (por defecto) o un objeto personalizado.
 *
 * El plan siempre tiene `detenerseEnError: false`, lo que permite que el
 * orquestador continúe aunque una célula falle (retornando exito: false).
 *
 * @param {string[]} ids - Lista de IDs de células (en orden de ejecución).
 * @param {string} [nombre='plan-dinamico'] - Nombre descriptivo para el plan.
 * @param {Object} [entradaInicial=null] - Entrada para la primera célula.
 *   Por defecto: `{ payload: '$.entrada' }`.
 * @returns {Object} Plan en formato JSON.
 * @throws {Error} Si algún ID no existe en el catálogo o si la célula no tiene ruta.
 */
function generarPlanDesdeCelulas(ids, nombre = 'plan-dinamico', entradaInicial = null) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error('La lista de IDs de células debe ser un array no vacío.');
  }

  const catalogo = obtenerCatalogoCompleto();
  const celulasMeta = ids.map(id => {
    const meta = catalogo.células.find(c => c.id === id);
    if (!meta) {
      throw new Error(`Célula con ID "${id}" no encontrada en el catálogo.`);
    }
    if (!meta.ruta) {
      throw new Error(`La célula con ID "${id}" no tiene ruta definida en el catálogo.`);
    }
    return meta;
  });

  // Construir el array de células del plan
  const planCelulas = [];
  let idAnterior = null;

  celulasMeta.forEach((meta, index) => {
    const id = meta.id;
    let entrada = {};

    if (index === 0) {
      // Primera célula: usar entrada inicial o el valor por defecto
      entrada = entradaInicial || { payload: '$.contexto.archivo' };
      // Nota: usamos '$.contexto.entrada' para que el agente pueda pasar datos
      // en el campo 'entrada' del contexto.
    } else {
      // Células siguientes: tomar el resultado de la anterior
      entrada = { payload: `$.${idAnterior}.resultado` };
    }

    planCelulas.push({
      id: id,
      ruta: meta.ruta,
      entrada: entrada
    });

    idAnterior = id;
  });

  // Salida final: resultado de la última célula
  const salidaFinal = `$.${idAnterior}.resultado`;

  // Construir el plan completo, siempre con detenerseEnError: false
  return {
    version: '1.0',
    nombre: nombre,
    descripcion: `Plan generado automáticamente a partir de células: ${ids.join(', ')}`,
    células: planCelulas,
    salidaFinal: salidaFinal,
    detenerseEnError: false, // ← CLAVE: nunca detener el plan ante errores de células
    telemetria: { enabled: true }
  };
}

/**
 * Guarda un plan en la carpeta 'planes' con un nombre único.
 * Crea la carpeta si no existe.
 *
 * @param {Object} plan - Objeto plan (en formato JSON).
 * @param {string} [nombreBase='plan-generado'] - Base para el nombre del archivo.
 * @returns {string} Ruta absoluta del archivo guardado.
 * @throws {Error} Si no se puede escribir el archivo.
 */
function guardarPlan(plan, nombreBase = 'plan-generado') {
  const timestamp = Date.now();
  const nombre = `${nombreBase}-${timestamp}`;
  const ruta = path.join(__dirname, 'planes', `${nombre}.json`);

  // Asegurar que la carpeta planes existe
  const dir = path.dirname(ruta);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Escribir el archivo con formato legible
  try {
    fs.writeFileSync(ruta, JSON.stringify(plan, null, 2), 'utf8');
  } catch (error) {
    throw new Error(`No se pudo guardar el plan en "${ruta}": ${error.message}`);
  }

  return ruta;
}

export {
  obtenerCatalogoCompleto,
  obtenerCelulaPorId,
  generarPlanDesdeCelulas,
  guardarPlan
};