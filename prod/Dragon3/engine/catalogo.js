/**
 * catalogo.js
 *
 * Gestión del catálogo de células.
 * Proporciona funciones para obtener el catálogo completo, con filtros,
 * añadir células y obtener una célula por ID.
 *
 * @module catalogo
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOGO_PATH = path.join(__dirname, 'celulas', 'index.json');

/**
 * Obtiene el catálogo de células, opcionalmente filtrado por públicas.
 * @param {boolean} filtroPublico - Si es true, solo devuelve células con publica: true.
 * @returns {Object} Catálogo con array 'células'.
 */
export function obtenerCatalogo(filtroPublico = false) {
  const data = fs.readFileSync(CATALOGO_PATH, 'utf8');
  const contenido = JSON.parse(data);
  const catalogo = Array.isArray(contenido) ? { células: contenido } : contenido;
  if (!Array.isArray(catalogo.células)) {
    throw new Error('El catálogo debe contener un array "células".');
  }
  if (filtroPublico) {
    catalogo.células = catalogo.células.filter(c => c.publica !== false);
  }
  return catalogo;
}

/**
 * Obtiene el catálogo completo (sin filtros).
 * @returns {Object} Catálogo completo.
 */
export function obtenerCatalogoCompleto() {
  const data = fs.readFileSync(CATALOGO_PATH, 'utf8');
  const contenido = JSON.parse(data);
  return Array.isArray(contenido) ? { células: contenido } : contenido;
}

/**
 * Añade una nueva célula al catálogo, o la actualiza si ya existe.
 * @param {Object} nuevaCelula - Datos de la nueva célula (debe tener id).
 */
export function agregarCelulaAlCatalogo(nuevaCelula) {
  const catalogo = obtenerCatalogoCompleto();
  const existing = catalogo.células.find(c => c.id === nuevaCelula.id);
  if (existing) {
    Object.assign(existing, nuevaCelula);
  } else {
    catalogo.células.push(nuevaCelula);
  }
  fs.writeFileSync(CATALOGO_PATH, JSON.stringify(catalogo, null, 2));
  console.log(`✅ Catálogo actualizado con célula: ${nuevaCelula.id}`);
}

/**
 * Obtiene una célula por su ID.
 * @param {string} id - ID de la célula.
 * @returns {Object|null} La célula encontrada o null si no existe.
 */
export function obtenerCelulaPorId(id) {
  const catalogo = obtenerCatalogoCompleto();
  return catalogo.células.find(c => c.id === id) || null;
}