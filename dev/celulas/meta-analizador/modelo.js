/**
 * modelo.js
 * 
 * Modelo heurístico del Meta-Analizador.
 * Analiza los datos de ejecuciones y genera recomendaciones basadas en reglas.
 * 
 * FASE 1: Heurístico (reglas simples)
 * FASE 2: ML (cuando tengamos suficientes datos)
 */

import { obtenerEjecuciones, extraerFeatures } from './extractor.js';

// ============================================================
// 1. ANÁLISIS DE PRECISIÓN POR CÉLULA
// ============================================================

export async function analizarPrecision(limite = 0) {  // ✅ 0 = sin límite
  const ejecuciones = await obtenerEjecuciones({}, limite);
  
  const stats = {
    total: 0,
    porCelula: {},
    porContexto: {}
  };
  
  for (const ejecucion of ejecuciones) {
    const veredicto = ejecucion.veredicto?.esIA;
    if (veredicto === undefined) continue;
    
    stats.total++;
    const formato = ejecucion.formato || 'desconocido';
    
    // Inicializar contexto
    if (!stats.porContexto[formato]) {
      stats.porContexto[formato] = { total: 0, aciertos: 0 };
    }
    stats.porContexto[formato].total++;
    
    // Analizar cada célula
    for (const [celulaId, datos] of Object.entries(ejecucion.datosCelulas || {})) {
      if (!stats.porCelula[celulaId]) {
        stats.porCelula[celulaId] = { total: 0, aciertos: 0 };
      }
      stats.porCelula[celulaId].total++;
      if (datos.esIA === veredicto) {
        stats.porCelula[celulaId].aciertos++;
        stats.porContexto[formato].aciertos++;
      }
    }
  }
  
  // Calcular porcentajes
  for (const [celulaId, data] of Object.entries(stats.porCelula)) {
    data.precision = data.total > 0 ? (data.aciertos / data.total) : 0;
    data.estado = data.precision >= 0.8 ? 'buena' : 
                  data.precision >= 0.6 ? 'media' : 'mala';
  }
  
  for (const [formato, data] of Object.entries(stats.porContexto)) {
    data.precision = data.total > 0 ? (data.aciertos / data.total) : 0;
  }
  
  return stats;
}

// ============================================================
// 2. GENERACIÓN DE RECOMENDACIONES
// ============================================================

export function generarRecomendaciones(stats) {
  const recomendaciones = [];
  
  // 2.1. Células con baja precisión
  for (const [celulaId, data] of Object.entries(stats.porCelula)) {
    if (data.precision < 0.6 && data.total > 5) {
      recomendaciones.push({
        tipo: 'AJUSTAR_PESO',
        celula: celulaId,
        prioridad: 'alta',
        mensaje: `La célula "${celulaId}" tiene precisión baja (${(data.precision * 100).toFixed(0)}%). Considerar reducir su peso.`,
        sugerencia: `Reducir peso de ${celulaId} de ${data.peso || 1} a ${Math.max(0.3, (data.precision * 0.8)).toFixed(1)}`
      });
    }
  }
  
  // 2.2. Células con alta precisión
  for (const [celulaId, data] of Object.entries(stats.porCelula)) {
    if (data.precision > 0.9 && data.total > 5) {
      recomendaciones.push({
        tipo: 'AUMENTAR_PESO',
        celula: celulaId,
        prioridad: 'media',
        mensaje: `La célula "${celulaId}" tiene precisión alta (${(data.precision * 100).toFixed(0)}%). Considerar aumentar su peso.`,
        sugerencia: `Aumentar peso de ${celulaId} de ${data.peso || 1} a ${Math.min(1.5, (data.precision * 1.2)).toFixed(1)}`
      });
    }
  }
  
  // 2.3. Contextos con baja precisión
  for (const [formato, data] of Object.entries(stats.porContexto)) {
    if (data.precision < 0.6 && data.total > 5) {
      recomendaciones.push({
        tipo: 'CONTEXTO_ESPECIFICO',
        contexto: formato,
        prioridad: 'media',
        mensaje: `El formato "${formato}" tiene precisión baja (${(data.precision * 100).toFixed(0)}%). Considerar ajustar células para este contexto.`,
        sugerencia: `Añadir célula específica para formato ${formato} o ajustar umbrales existentes`
      });
    }
  }
  
  // 2.4. Recomendación general si hay pocos datos
  if (stats.total < 50) {
    recomendaciones.push({
      tipo: 'MÁS_DATOS',
      prioridad: 'alta',
      mensaje: `Solo hay ${stats.total} ejecuciones con datos. Se necesitan más datos para generar recomendaciones confiables.`,
      sugerencia: 'Seguir usando el sistema para recoger más datos (objetivo: 100+ ejecuciones)'
    });
  }
  
  return recomendaciones;
}

// ============================================================
// 3. FUNCIÓN PRINCIPAL
// ============================================================

export async function analizarYRecomendar(limite = 0) {  // 0 = sin límite
  console.log('🧠 [Meta-Analizador] Analizando datos...');
  const stats = await analizarPrecision(limite);
  const recomendaciones = generarRecomendaciones(stats);
  
  console.log(`📊 Total ejecuciones: ${stats.total}`);
  console.log(`📊 Células analizadas: ${Object.keys(stats.porCelula).length}`);
  console.log(`📊 Recomendaciones generadas: ${recomendaciones.length}`);
  
  return { stats, recomendaciones };
}

// ============================================================
// 4. EXPORTAR FUNCIONES ÚTILES
// ============================================================

export default {
  analizarPrecision,
  generarRecomendaciones,
  analizarYRecomendar
};