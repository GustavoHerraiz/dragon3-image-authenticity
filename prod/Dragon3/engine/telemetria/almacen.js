/**
 * telemetria/almacen.js
 *
 * Almacena y consulta el historial de ejecuciones (éxitos y fallos).
 * Usa un archivo JSON como base de datos simple.
 *
 * Telemetría enriquecida para el agente de decisión:
 * - groundTruth: permite calcular precisión real.
 * - tiemposPorCelula: detalle individual para optimización.
 * - pesosUsados: para saber cómo influyen en el veredicto.
 * - metadatosExtra: contexto adicional (tamaño, resolución, etc.).
 * - huellaDigital: hash del archivo para caché y detección de duplicados.
 *
 * Principios: KISS, extensible, documentado.
 *
 * @module telemetria/almacen
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORIAL_PATH = path.join(__dirname, 'historial.json');
const HISTORIAL_MAX_BYTES = 25 * 1024 * 1024;
const HISTORIAL_MAX_ENTRADAS = 500;

// ============================================================
//  FUNCIONES DE GESTIÓN DEL HISTORIAL
// ============================================================

/**
 * Asegura que el archivo de historial existe.
 * Si no existe, lo crea con un array vacío.
 */
function asegurarHistorial() {
  if (fs.existsSync(HISTORIAL_PATH) && fs.statSync(HISTORIAL_PATH).size > HISTORIAL_MAX_BYTES) {
    const archivoArchivado = `${HISTORIAL_PATH}.archive-${Date.now()}`;
    fs.renameSync(HISTORIAL_PATH, archivoArchivado);
    console.warn(`⚠️ Historial grande archivado en ${archivoArchivado}`);
  }
  if (!fs.existsSync(HISTORIAL_PATH)) {
    fs.writeFileSync(HISTORIAL_PATH, JSON.stringify([], null, 2));
  }
}

/**
 * Guarda una entrada de telemetría en el historial.
 *
 * @param {Object} entrada - Datos de la ejecución.
 * @param {string} entrada.planId - ID del plan ejecutado.
 * @param {string[]} entrada.celulasIds - IDs de las células usadas.
 * @param {number} entrada.tiempoTotal - Tiempo total en ms.
 * @param {boolean} [entrada.exito=true] - Si fue exitosa (por defecto true).
 * @param {string} entrada.correlationId - ID de correlación.
 * @param {Array} entrada.telemetria - Detalle de cada célula (con celulaId, tiempoMs, exito, etc.).
 * @param {string} entrada.agenteId - ID del agente que ejecutó.
 * @param {string} [entrada.tipoArchivo] - Tipo de archivo ('imagen', 'pdf', 'video', etc.).
 * @param {Object} [entrada.planConfig] - Configuración del plan (parámetros enviados).
 * @param {boolean} [entrada.groundTruth] - Si se conoce el ground truth (true=IA, false=humana).
 * @param {Object} [entrada.metadatosExtra] - Información adicional (tamaño, resolución, etc.).
 * @param {string} [entrada.huellaDigital] - Hash SHA-256 del archivo (para caché).
 */
export function guardarTelemetria(entrada) {
  asegurarHistorial();
  const data = fs.readFileSync(HISTORIAL_PATH, 'utf8');
  const historial = JSON.parse(data);

  // Extraer tiempos por célula de la telemetría
  const tiemposPorCelula = (entrada.telemetria || []).map(c => ({
    celulaId: c.celulaId,
    tiempoMs: c.tiempoMs || 0
  }));

  // Extraer pesos de las células (si están disponibles en el plan)
  // Se pueden pasar explícitamente o inferir de la telemetría si incluye 'peso'
  const pesosCelulas = (entrada.telemetria || [])
    .filter(c => c.peso !== undefined)
    .map(c => ({ celulaId: c.celulaId, peso: c.peso }));

  // Calcular precisión global si hay groundTruth
  let precisionGlobal = null;
  if (entrada.groundTruth !== undefined) {
    const acierto = entrada.exito === (entrada.groundTruth === true);
    precisionGlobal = acierto ? 1 : 0;
  }

  const entradaCompleta = {
    planId: entrada.planId,
    celulasIds: entrada.celulasIds || [],
    tiempoTotal: entrada.tiempoTotal || 0,
    exito: entrada.exito !== undefined ? entrada.exito : true,
    correlationId: entrada.correlationId || '',
    agenteId: entrada.agenteId || '',
    tipoArchivo: entrada.tipoArchivo || null,
    planConfig: entrada.planConfig || null,
    groundTruth: entrada.groundTruth !== undefined ? entrada.groundTruth : null,
    precisionGlobal,
    tiemposPorCelula,
    pesosCelulas: pesosCelulas.length > 0 ? pesosCelulas : null,
    metadatosExtra: entrada.metadatosExtra || null,
    huellaDigital: entrada.huellaDigital || null,
    telemetria: (entrada.telemetria || []).map(c => ({
      celulaId: c.celulaId,
      tiempoMs: c.tiempoMs || 0,
      exito: c.exito !== false,
      error: c.error || null
    })),
    timestamp: new Date().toISOString()
  };

  historial.push(entradaCompleta);
  const historialReciente = historial.slice(-HISTORIAL_MAX_ENTRADAS);
  fs.writeFileSync(HISTORIAL_PATH, JSON.stringify(historialReciente, null, 2));
  console.log(`📊 Telemetría guardada para plan "${entrada.planId}" (exito: ${entradaCompleta.exito})`);
}

// ============================================================
//  CONSULTAS BÁSICAS
// ============================================================

/**
 * Obtiene todas las ejecuciones exitosas del historial.
 * @param {number} [limite=100] - Número máximo de registros a devolver (los más recientes).
 * @returns {Object[]} Lista de ejecuciones con exito === true.
 */
export function obtenerExitosas(limite = 100) {
  asegurarHistorial();
  const data = fs.readFileSync(HISTORIAL_PATH, 'utf8');
  const historial = JSON.parse(data);
  return historial
    .filter(entry => entry.exito === true)
    .slice(-limite);
}

/**
 * Obtiene todas las ejecuciones (incluidas fallidas) para análisis completo.
 * @returns {Object[]} Lista completa de ejecuciones.
 */
export function obtenerTodas() {
  asegurarHistorial();
  const data = fs.readFileSync(HISTORIAL_PATH, 'utf8');
  return JSON.parse(data);
}

/**
 * Alias de obtenerTodas() para compatibilidad con versiones anteriores.
 * @returns {Object[]} Lista completa de ejecuciones.
 */
export function obtenerTodo() {
  return obtenerTodas();
}

// ============================================================
//  CONSULTAS AGREGADAS (para el agente de decisión)
// ============================================================

/**
 * Obtiene métricas agregadas por tipo de archivo.
 * @param {string} [tipoArchivo] - Filtrar por tipo de archivo (opcional).
 * @returns {Object} Métricas: total, exitos, ratio, tiempoPromedio, precisionPromedio (si hay groundTruth).
 */
export function obtenerMetricasPorTipo(tipoArchivo = null) {
  const todas = obtenerTodas();
  let filtradas = todas;
  if (tipoArchivo) {
    filtradas = filtradas.filter(e => e.tipoArchivo === tipoArchivo);
  }
  if (filtradas.length === 0) {
    return { total: 0, exitos: 0, ratio: 0, tiempoPromedio: 0, precisionPromedio: null };
  }
  const total = filtradas.length;
  const exitos = filtradas.filter(e => e.exito).length;
  const ratio = exitos / total;
  const tiempoTotal = filtradas.reduce((sum, e) => sum + (e.tiempoTotal || 0), 0);
  const tiempoPromedio = tiempoTotal / total;
  // Calcular precisión promedio solo si hay groundTruth
  const conGroundTruth = filtradas.filter(e => e.groundTruth !== null && e.groundTruth !== undefined);
  let precisionPromedio = null;
  if (conGroundTruth.length > 0) {
    const aciertos = conGroundTruth.filter(e => e.precisionGlobal === 1).length;
    precisionPromedio = aciertos / conGroundTruth.length;
  }
  return { total, exitos, ratio, tiempoPromedio, precisionPromedio };
}

/**
 * Obtiene métricas agregadas para un plan específico.
 * @param {string} planId - ID del plan.
 * @returns {Object} Métricas: total, exitos, ratio, tiempoPromedio, precisionPromedio.
 */
export function obtenerMetricasPorPlan(planId) {
  const todas = obtenerTodas();
  const filtradas = todas.filter(e => e.planId === planId);
  if (filtradas.length === 0) {
    return { total: 0, exitos: 0, ratio: 0, tiempoPromedio: 0, precisionPromedio: null };
  }
  const total = filtradas.length;
  const exitos = filtradas.filter(e => e.exito).length;
  const ratio = exitos / total;
  const tiempoTotal = filtradas.reduce((sum, e) => sum + (e.tiempoTotal || 0), 0);
  const tiempoPromedio = tiempoTotal / total;
  const conGroundTruth = filtradas.filter(e => e.groundTruth !== null && e.groundTruth !== undefined);
  let precisionPromedio = null;
  if (conGroundTruth.length > 0) {
    const aciertos = conGroundTruth.filter(e => e.precisionGlobal === 1).length;
    precisionPromedio = aciertos / conGroundTruth.length;
  }
  return { total, exitos, ratio, tiempoPromedio, precisionPromedio };
}

/**
 * Obtiene métricas agregadas para una célula específica.
 * @param {string} celulaId - ID de la célula.
 * @returns {Object} Métricas: total, exitos, ratio, tiempoPromedio, contribucion (veces que acertó en veredictos).
 */
export function obtenerMetricasPorCelula(celulaId) {
  const todas = obtenerTodas();
  // Buscar ejecuciones donde esta célula aparezca
  const filtradas = todas.filter(e =>
    e.celulasIds && e.celulasIds.includes(celulaId)
  );
  if (filtradas.length === 0) {
    return { total: 0, exitos: 0, ratio: 0, tiempoPromedio: 0, contribucion: 0 };
  }
  const total = filtradas.length;
  // Éxito de la célula: para cada ejecución, buscar su telemetría y ver si exito de esa célula es true
  let exitosCelula = 0;
  let tiempos = [];
  let aciertosVeredicto = 0; // contribución: cuántas veces acertó el veredicto cuando esta célula votó IA
  for (const exec of filtradas) {
    // Buscar la célula en la telemetría
    const celInfo = exec.telemetria?.find(c => c.celulaId === celulaId);
    if (celInfo) {
      if (celInfo.exito !== false) exitosCelula++;
      if (celInfo.tiempoMs) tiempos.push(celInfo.tiempoMs);
      // Contribución: si la célula votó IA y el veredicto fue correcto (o viceversa)
      if (celInfo.esIA !== undefined && exec.groundTruth !== null) {
        if (celInfo.esIA === exec.groundTruth) aciertosVeredicto++;
      }
    }
  }
  const ratio = total > 0 ? exitosCelula / total : 0;
  const tiempoPromedio = tiempos.length > 0 ? tiempos.reduce((a,b) => a+b, 0) / tiempos.length : 0;
  const contribucion = filtradas.length > 0 ? aciertosVeredicto / filtradas.length : 0;
  return { total, exitos: exitosCelula, ratio, tiempoPromedio, contribucion };
}

/**
 * Encuentra combinaciones de células que aparecen juntas con éxito.
 * @param {number} minFrecuencia - Frecuencia mínima de aparición.
 * @param {number} minExitoRatio - Ratio mínimo de éxito (0.7 = 70%).
 * @param {string} [tipoArchivo] - Filtrar por tipo (opcional).
 * @returns {Object[]} Lista de combinaciones con: celulas, frecuencia, ratio, tiempoPromedio.
 */
export function obtenerCombinacionesExitosas(minFrecuencia = 2, minExitoRatio = 0.7, tipoArchivo = null) {
  const todas = obtenerTodas();
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
      combinaciones.set(key, { ids, total: 0, exitos: 0, tiempos: [] });
    }
    const grupo = combinaciones.get(key);
    grupo.total++;
    if (exec.exito) grupo.exitos++;
    if (exec.tiempoTotal) grupo.tiempos.push(exec.tiempoTotal);
  }
  // Filtrar y calcular métricas
  const resultados = [];
  for (const [key, grupo] of combinaciones.entries()) {
    if (grupo.total < minFrecuencia) continue;
    const ratio = grupo.exitos / grupo.total;
    if (ratio < minExitoRatio) continue;
    const tiempoPromedio = grupo.tiempos.length > 0
      ? grupo.tiempos.reduce((a,b) => a+b, 0) / grupo.tiempos.length
      : 0;
    resultados.push({
      celulas: grupo.ids,
      frecuencia: grupo.total,
      ratio,
      tiempoPromedio
    });
  }
  // Ordenar por ratio descendente
  resultados.sort((a, b) => b.ratio - a.ratio || b.frecuencia - a.frecuencia);
  return resultados;
}

/**
 * Obtiene métricas globales del sistema: total ejecuciones, ratio general, tiempos, precisión global.
 * @returns {Object} Métricas globales.
 */
export function obtenerMetricasGlobales() {
  const todas = obtenerTodas();
  if (todas.length === 0) {
    return { total: 0, exitos: 0, ratio: 0, tiempoPromedio: 0, precisionPromedio: null };
  }
  const total = todas.length;
  const exitos = todas.filter(e => e.exito).length;
  const ratio = exitos / total;
  const tiempoTotal = todas.reduce((sum, e) => sum + (e.tiempoTotal || 0), 0);
  const tiempoPromedio = tiempoTotal / total;
  const conGroundTruth = todas.filter(e => e.groundTruth !== null && e.groundTruth !== undefined);
  let precisionPromedio = null;
  if (conGroundTruth.length > 0) {
    const aciertos = conGroundTruth.filter(e => e.precisionGlobal === 1).length;
    precisionPromedio = aciertos / conGroundTruth.length;
  }
  return { total, exitos, ratio, tiempoPromedio, precisionPromedio };
}

// ============================================================
//  UTILIDADES ADICIONALES
// ============================================================

/**
 * Calcula el hash SHA-256 de un buffer o string.
 * @param {Buffer|string} data - Datos a hashear.
 * @returns {string} Hash hexadecimal.
 */
export function calcularHuellaDigital(data) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}

// ============================================================
//  EXPORTACIONES
// ============================================================

export default {
  guardarTelemetria,
  obtenerExitosas,
  obtenerTodas,
  obtenerTodo,
  obtenerMetricasPorTipo,
  obtenerMetricasPorPlan,
  obtenerMetricasPorCelula,
  obtenerCombinacionesExitosas,
  obtenerMetricasGlobales,
  calcularHuellaDigital
};