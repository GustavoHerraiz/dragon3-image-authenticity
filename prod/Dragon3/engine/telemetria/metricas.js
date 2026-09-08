/**
 * telemetria/metricas.js
 *
 * Módulo de métricas para el agente de decisión.
 * Calcula métricas agregadas a partir del historial de telemetría:
 * - Precisión global, por plan, por célula.
 * - Falsos positivos y negativos.
 * - Contribución de cada célula al veredicto.
 * - Combinaciones exitosas para evolución.
 * - Cuellos de botella (rendimiento).
 * - Alertas de células/planes poco precisos o poco usados.
 *
 * Principios: KISS (funciones puras, cada una hace una cosa),
 *             extensible, documentado.
 *
 * @module telemetria/metricas
 */

import { obtenerTodas } from './almacen.js';

// ============================================================
//  PRECISIÓN Y RENDIMIENTO
// ============================================================

/**
 * Calcula la precisión global del sistema (si hay groundTruth).
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional, por defecto usa todas).
 * @returns {Object} { total, aciertos, precision, falsosPositivos, falsosNegativos }
 */
export function calcularPrecisionGlobal(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const conGroundTruth = todas.filter(e => e.groundTruth !== null && e.groundTruth !== undefined);
  if (conGroundTruth.length === 0) {
    return { total: 0, aciertos: 0, precision: 0, falsosPositivos: 0, falsosNegativos: 0 };
  }
  let aciertos = 0;
  let falsosPositivos = 0; // humanas clasificadas como IA
  let falsosNegativos = 0; // IA clasificadas como humanas
  for (const exec of conGroundTruth) {
    const esIA = exec.groundTruth === true;
    const veredictoIA = exec.telemetria?.some(t => t.esIA === true) || false;
    if (esIA && veredictoIA) aciertos++;
    else if (!esIA && !veredictoIA) aciertos++;
    else if (!esIA && veredictoIA) falsosPositivos++;
    else if (esIA && !veredictoIA) falsosNegativos++;
  }
  return {
    total: conGroundTruth.length,
    aciertos,
    precision: aciertos / conGroundTruth.length,
    falsosPositivos,
    falsosNegativos
  };
}

/**
 * Calcula métricas de rendimiento (tiempos) por célula.
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object} Mapa de celulaId -> { total, tiempoPromedio, tiempoMin, tiempoMax, p95 }
 */
export function calcularTiemposPorCelula(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const tiempos = {};
  for (const exec of todas) {
    if (!exec.tiemposPorCelula) continue;
    for (const t of exec.tiemposPorCelula) {
      if (!tiempos[t.celulaId]) {
        tiempos[t.celulaId] = { tiempos: [] };
      }
      tiempos[t.celulaId].tiempos.push(t.tiempoMs);
    }
  }
  const resultado = {};
  for (const [celulaId, data] of Object.entries(tiempos)) {
    const sorted = data.tiempos.sort((a, b) => a - b);
    const total = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const p95Idx = Math.floor(total * 0.95);
    resultado[celulaId] = {
      total,
      tiempoPromedio: sum / total,
      tiempoMin: sorted[0],
      tiempoMax: sorted[sorted.length - 1],
      p95: sorted[p95Idx] || sorted[sorted.length - 1]
    };
  }
  return resultado;
}

/**
 * Calcula métricas de rendimiento por plan.
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object} Mapa de planId -> { total, tiempoPromedio, tiempoMin, tiempoMax }
 */
export function calcularTiemposPorPlan(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const tiempos = {};
  for (const exec of todas) {
    if (!exec.planId || !exec.tiempoTotal) continue;
    if (!tiempos[exec.planId]) {
      tiempos[exec.planId] = { tiempos: [] };
    }
    tiempos[exec.planId].tiempos.push(exec.tiempoTotal);
  }
  const resultado = {};
  for (const [planId, data] of Object.entries(tiempos)) {
    const sorted = data.tiempos.sort((a, b) => a - b);
    const total = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    resultado[planId] = {
      total,
      tiempoPromedio: sum / total,
      tiempoMin: sorted[0],
      tiempoMax: sorted[sorted.length - 1]
    };
  }
  return resultado;
}

// ============================================================
//  CONTRIBUCIÓN Y EFECTIVIDAD
// ============================================================

/**
 * Calcula la contribución de cada célula al veredicto final.
 * Para cada ejecución con groundTruth, se calcula si la célula acertó o no.
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object} Mapa de celulaId -> { total, aciertos, contribucion, precision }
 */
export function calcularContribucionPorCelula(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const contribuciones = {};
  for (const exec of todas) {
    if (exec.groundTruth === null || exec.groundTruth === undefined) continue;
    if (!exec.telemetria) continue;
    for (const cel of exec.telemetria) {
      if (cel.esIA === undefined) continue;
      if (!contribuciones[cel.celulaId]) {
        contribuciones[cel.celulaId] = { total: 0, aciertos: 0 };
      }
      contribuciones[cel.celulaId].total++;
      // La célula acierta si su esIA coincide con groundTruth
      if (cel.esIA === exec.groundTruth) {
        contribuciones[cel.celulaId].aciertos++;
      }
    }
  }
  const resultado = {};
  for (const [celulaId, data] of Object.entries(contribuciones)) {
    resultado[celulaId] = {
      total: data.total,
      aciertos: data.aciertos,
      contribucion: data.aciertos / data.total,
      precision: data.aciertos / data.total
    };
  }
  return resultado;
}

/**
 * Calcula la efectividad de cada plan (ratio de acierto con groundTruth).
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object} Mapa de planId -> { total, aciertos, precision }
 */
export function calcularEfectividadPorPlan(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const planes = {};
  for (const exec of todas) {
    if (exec.groundTruth === null || exec.groundTruth === undefined) continue;
    if (!exec.planId) continue;
    if (!planes[exec.planId]) {
      planes[exec.planId] = { total: 0, aciertos: 0 };
    }
    planes[exec.planId].total++;
    // Determinar si el plan acertó: usar el veredicto final de la ejecución
    const veredictoIA = exec.telemetria?.some(t => t.esIA === true) || false;
    if (veredictoIA === exec.groundTruth) {
      planes[exec.planId].aciertos++;
    }
  }
  const resultado = {};
  for (const [planId, data] of Object.entries(planes)) {
    resultado[planId] = {
      total: data.total,
      aciertos: data.aciertos,
      precision: data.aciertos / data.total
    };
  }
  return resultado;
}

// ============================================================
//  EVOLUCIÓN Y COMBINACIONES GANADORAS
// ============================================================

/**
 * Encuentra combinaciones de células que funcionan bien juntas.
 * Similar a obtenerCombinacionesExitosas pero con más métricas.
 * @param {number} minFrecuencia - Frecuencia mínima de aparición.
 * @param {number} minExitoRatio - Ratio mínimo de éxito (0.7 = 70%).
 * @param {string} [tipoArchivo] - Filtrar por tipo (opcional).
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object[]} Lista de combinaciones con métricas.
 */
export function encontrarCombinacionesGanadoras(
  minFrecuencia = 3,
  minExitoRatio = 0.8,
  tipoArchivo = null,
  ejecuciones = null
) {
  const todas = ejecuciones || obtenerTodas();
  let filtradas = todas;
  if (tipoArchivo) {
    filtradas = filtradas.filter(e => e.tipoArchivo === tipoArchivo);
  }
  // Agrupar por combinación de IDs (ordenados)
  const combinaciones = new Map();
  for (const exec of filtradas) {
    const ids = exec.celulasIds ? [...exec.celulasIds].sort() : [];
    if (ids.length === 0) continue;
    const key = ids.join(',');
    if (!combinaciones.has(key)) {
      combinaciones.set(key, { ids, total: 0, exitos: 0, tiempos: [], aciertosGroundTruth: 0, totalGroundTruth: 0 });
    }
    const grupo = combinaciones.get(key);
    grupo.total++;
    if (exec.exito) grupo.exitos++;
    if (exec.tiempoTotal) grupo.tiempos.push(exec.tiempoTotal);
    if (exec.groundTruth !== null && exec.groundTruth !== undefined) {
      grupo.totalGroundTruth++;
      const veredictoIA = exec.telemetria?.some(t => t.esIA === true) || false;
      if (veredictoIA === exec.groundTruth) grupo.aciertosGroundTruth++;
    }
  }
  // Filtrar y calcular métricas
  const resultados = [];
  for (const [key, grupo] of combinaciones.entries()) {
    if (grupo.total < minFrecuencia) continue;
    const ratioExito = grupo.exitos / grupo.total;
    if (ratioExito < minExitoRatio) continue;
    const tiempoPromedio = grupo.tiempos.length > 0
      ? grupo.tiempos.reduce((a, b) => a + b, 0) / grupo.tiempos.length
      : 0;
    const precisionGroundTruth = grupo.totalGroundTruth > 0
      ? grupo.aciertosGroundTruth / grupo.totalGroundTruth
      : null;
    resultados.push({
      celulas: grupo.ids,
      frecuencia: grupo.total,
      ratioExito,
      tiempoPromedio,
      precisionGroundTruth,
      totalGroundTruth: grupo.totalGroundTruth
    });
  }
  // Ordenar por precisión (si existe) o ratio de éxito
  resultados.sort((a, b) => {
    if (a.precisionGroundTruth !== null && b.precisionGroundTruth !== null) {
      return b.precisionGroundTruth - a.precisionGroundTruth || b.ratioExito - a.ratioExito;
    }
    return b.ratioExito - a.ratioExito || b.frecuencia - a.frecuencia;
  });
  return resultados;
}

// ============================================================
//  DIAGNÓSTICO Y ALERTAS
// ============================================================

/**
 * Identifica células que son cuellos de botella (lentas).
 * @param {number} percentil - Percentil para considerar "lento" (ej. 90 = top 10% más lentos).
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object[]} Lista de células con tiempos altos.
 */
export function identificarCuellosDeBotella(percentil = 90, ejecuciones = null) {
  const tiemposPorCelula = calcularTiemposPorCelula(ejecuciones);
  const resultado = [];
  for (const [celulaId, data] of Object.entries(tiemposPorCelula)) {
    // Usar p95 como indicador de lentitud
    const p95 = data.p95 || data.tiempoMax;
    const promedio = data.tiempoPromedio;
    // Si p95 es mucho mayor que el promedio, es un cuello de botella
    if (p95 > promedio * 1.5) {
      resultado.push({
        celulaId,
        p95,
        promedio,
        total: data.total,
        ratio: p95 / promedio
      });
    }
  }
  // Ordenar por ratio descendente (mayor cuello de botella)
  resultado.sort((a, b) => b.ratio - a.ratio);
  return resultado;
}

/**
 * Identifica células con baja precisión (para posible reducción de peso o poda).
 * @param {number} umbralPrecision - Umbral de precisión (0.6 = 60%).
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object[]} Lista de células con precisión baja.
 */
export function identificarCelulasPocoPrecisas(umbralPrecision = 0.6, ejecuciones = null) {
  const contribucion = calcularContribucionPorCelula(ejecuciones);
  const resultado = [];
  for (const [celulaId, data] of Object.entries(contribucion)) {
    if (data.precision < umbralPrecision) {
      resultado.push({
        celulaId,
        precision: data.precision,
        total: data.total,
        aciertos: data.aciertos
      });
    }
  }
  resultado.sort((a, b) => a.precision - b.precision);
  return resultado;
}

/**
 * Identifica planes con poco uso (para posible deprecación).
 * @param {number} minUso - Número mínimo de usos para considerar activo.
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object[]} Lista de planes con poco uso.
 */
export function identificarPlanesPocoUsados(minUso = 5, ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  const uso = {};
  for (const exec of todas) {
    if (!exec.planId) continue;
    if (!uso[exec.planId]) uso[exec.planId] = 0;
    uso[exec.planId]++;
  }
  const resultado = [];
  for (const [planId, count] of Object.entries(uso)) {
    if (count < minUso) {
      resultado.push({ planId, usos: count });
    }
  }
  resultado.sort((a, b) => a.usos - b.usos);
  return resultado;
}

// ============================================================
//  RESUMEN GLOBAL PARA EL AGENTE
// ============================================================

/**
 * Genera un informe completo de métricas para el agente de decisión.
 * @param {Array} [ejecuciones] - Array de ejecuciones (opcional).
 * @returns {Object} Informe con todas las métricas agregadas.
 */
export function generarInformeMetricas(ejecuciones = null) {
  const todas = ejecuciones || obtenerTodas();
  if (todas.length === 0) {
    return {
      totalEjecuciones: 0,
      totalEjecucionesConGroundTruth: 0,
      precisionGlobal: null,
      falsosPositivos: null,
      falsosNegativos: null,
      metricasPorCelula: {},
      metricasPorPlan: {},
      combinacionesGanadoras: [],
      cuellosDeBotella: [],
      celulasPocoPrecisas: [],
      planesPocoUsados: []
    };
  }

  const precisionGlobal = calcularPrecisionGlobal(todas);
  const tiemposCelula = calcularTiemposPorCelula(todas);
  const contribucionCelula = calcularContribucionPorCelula(todas);
  const efectividadPlan = calcularEfectividadPorPlan(todas);
  const combinaciones = encontrarCombinacionesGanadoras(3, 0.8, null, todas);
  const cuellos = identificarCuellosDeBotella(90, todas);
  const pocoPrecisas = identificarCelulasPocoPrecisas(0.6, todas);
  const pocoUsados = identificarPlanesPocoUsados(5, todas);

  // Calcular total de ejecuciones con groundTruth
  const totalEjecucionesConGroundTruth = todas.filter(e => e.groundTruth !== null && e.groundTruth !== undefined).length;

  return {
    totalEjecuciones: todas.length,
    totalEjecucionesConGroundTruth,
    precisionGlobal: precisionGlobal.precision,
    falsosPositivos: precisionGlobal.falsosPositivos,
    falsosNegativos: precisionGlobal.falsosNegativos,
    metricasPorCelula: contribucionCelula,
    tiemposPorCelula: tiemposCelula,
    metricasPorPlan: efectividadPlan,
    combinacionesGanadoras: combinaciones,
    cuellosDeBotella: cuellos,
    celulasPocoPrecisas: pocoPrecisas,
    planesPocoUsados: pocoUsados
  };
}