/**
 * evolucion/analizador.js
 * 
 * Analiza el historial de ejecuciones (éxitos y fallos) para encontrar
 * combinaciones de células que aparecen juntas con frecuencia y con alto ratio de éxito.
 * Genera nuevos planes a partir de las combinaciones más robustas.
 * 
 * @module evolucion/analizador
 */

import { obtenerTodas } from '../telemetria/almacen.js';
import { generarPlanDesdeCelulas, guardarPlan } from '../generador-plan.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera todas las combinaciones de un array de tamaño `k`.
 * @param {Array} arr - Array de elementos.
 * @param {number} k - Tamaño de las combinaciones.
 * @returns {Array<Array>} Lista de combinaciones.
 */
function combinaciones(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = combinaciones(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinaciones(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Encuentra combinaciones de células frecuentes con alto ratio de éxito.
 * 
 * Analiza todas las ejecuciones almacenadas (incluidas fallidas) y calcula
 * para cada combinación de células:
 * - Frecuencia total (número de ejecuciones en las que aparece).
 * - Número de éxitos.
 * - Ratio de éxito (éxitos / total).
 * 
 * Solo retorna combinaciones que cumplan:
 * - Frecuencia total >= minFrecuencia.
 * - Ratio de éxito >= minExitoRatio.
 * - Tamaño de la combinación >= minTamanio.
 * 
 * @param {number} minFrecuencia - Número mínimo de veces que debe aparecer la combinación.
 * @param {number} minTamanio - Tamaño mínimo de la combinación (2 por defecto).
 * @param {number} minExitoRatio - Ratio mínimo de éxito (0.7 = 70%).
 * @returns {Object[]} Lista de combinaciones con: celulas[], frecuencia, exitos, ratio.
 */
function encontrarCombinacionesFrecuentes(minFrecuencia = 2, minTamanio = 2, minExitoRatio = 0.7) {
  // Obtener TODAS las ejecuciones (éxitos y fallos)
  const todas = obtenerTodas();
  const agrupadas = new Map();

  // Agrupar por combinación de IDs de células (ordenadas alfabéticamente)
  for (const entry of todas) {
    const ids = entry.celulasIds || [];
    if (ids.length < minTamanio) continue;
    // Ordenar para tener clave única independientemente del orden
    const key = ids.slice().sort().join(',');
    if (!agrupadas.has(key)) {
      agrupadas.set(key, { total: 0, exitos: 0, celulas: ids.slice().sort() });
    }
    const grupo = agrupadas.get(key);
    grupo.total++;
    if (entry.exito !== false) grupo.exitos++;
  }

  // Filtrar y formatear resultados
  const resultados = [];
  for (const [key, stats] of agrupadas.entries()) {
    const ratio = stats.exitos / stats.total;
    if (stats.total >= minFrecuencia && ratio >= minExitoRatio) {
      resultados.push({
        celulas: stats.celulas,
        frecuencia: stats.total,
        exitos: stats.exitos,
        ratio: ratio
      });
    }
  }

  // Ordenar por ratio (descendente) y luego por frecuencia (descendente)
  resultados.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    return b.frecuencia - a.frecuencia;
  });

  return resultados;
}

/**
 * Genera un nuevo plan a partir de una combinación de células.
 * @param {string[]} celulasIds - IDs de las células en orden (se respetará el orden dado).
 * @param {string} nombreBase - Base para el nombre del plan.
 * @returns {Object} Plan generado.
 */
function generarPlanDesdeCombinacion(celulasIds, nombreBase = 'evolucion') {
  const nombre = `${nombreBase}-${Date.now()}`;
  // La entrada inicial usará '$.contexto.entrada' para que el agente pueda pasar datos
  const plan = generarPlanDesdeCelulas(celulasIds, nombre, { payload: '$.contexto.entrada' });
  return plan;
}

/**
 * Ejecuta la evolución automática: analiza combinaciones frecuentes con alto éxito
 * y genera nuevos planes en la carpeta 'planes'.
 * 
 * @param {number} minFrecuencia - Frecuencia mínima para considerar una combinación (default 3).
 * @param {number} minTamanio - Tamaño mínimo de la combinación (default 2).
 * @param {number} minExitoRatio - Ratio mínimo de éxito (default 0.8 = 80%).
 * @returns {string[]} Rutas de los planes generados.
 */
export function evolucionar(minFrecuencia = 3, minTamanio = 2, minExitoRatio = 0.8) {
  console.log(`🧬 Iniciando evolución automática...`);
  console.log(`   Parámetros: frecuencia≥${minFrecuencia}, tamaño≥${minTamanio}, ratio≥${minExitoRatio}`);

  const combinaciones = encontrarCombinacionesFrecuentes(minFrecuencia, minTamanio, minExitoRatio);
  console.log(`🔍 Encontradas ${combinaciones.length} combinaciones que cumplen los criterios.`);

  if (combinaciones.length === 0) {
    console.log('⚠️ No se encontraron combinaciones suficientes para generar planes.');
    return [];
  }

  // Mostrar las mejores combinaciones
  combinaciones.slice(0, 5).forEach((combo, idx) => {
    console.log(`   ${idx+1}. [${combo.celulas.join(', ')}] freq: ${combo.frecuencia}, ratio: ${(combo.ratio * 100).toFixed(0)}%`);
  });

  const planesGenerados = [];
  for (const combo of combinaciones) {
    // Generar nombre de plan basado en las células
    const nombrePlan = `evolucion-${combo.celulas.join('-')}`;
    const plan = generarPlanDesdeCombinacion(combo.celulas, nombrePlan);

    // Guardar el plan en la carpeta 'planes'
    const ruta = guardarPlan(plan, nombrePlan);
    planesGenerados.push(ruta);

    console.log(`🧬 Nuevo plan generado: ${path.basename(ruta)} (freq: ${combo.frecuencia}, ratio: ${(combo.ratio * 100).toFixed(0)}%)`);
  }

  console.log(`✅ Evolución completada. ${planesGenerados.length} planes generados.`);
  return planesGenerados;
}

// Si se ejecuta directamente, lanza la evolución con parámetros por defecto
if (import.meta.url === `file://${process.argv[1]}`) {
  // Permitir pasar argumentos desde línea de comandos: node analizador.js [minFrecuencia] [minTamanio] [minExitoRatio]
  const args = process.argv.slice(2);
  const minFrecuencia = parseInt(args[0]) || 3;
  const minTamanio = parseInt(args[1]) || 2;
  const minExitoRatio = parseFloat(args[2]) || 0.8;
  evolucionar(minFrecuencia, minTamanio, minExitoRatio);
}