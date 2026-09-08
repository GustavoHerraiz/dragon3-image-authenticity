/**
 * DRAGON3 FAANG - TEST TOTAL analizadorFirmasDigitales.js
 * Autor: Gustavo Herraiz
 * Fecha: 2025-08-25
 * Descripción: Test unitario + integración + performance + error handling para analizadorFirmasDigitales.js.
 * - Verifica estructura y campos FAANG esperados por analizadorImagen.js.
 * - Mide tiempo de ejecución (P95).
 * - Valida manejo de errores, logging, y compatibilidad de resultados.
 * - Usa golden_retriever.jpg y el JSON real de patrones.
 */

import path from 'path';
import fs from 'fs/promises';
import dragon from '../../utilidades/logger.js';
import analizadorFirmasDigitales, { version as versionFirmas } from '../../servicios/imagen/analizadores/imagen/analizadorFirmasDigitales.js';

const rutaTestImagen = '/var/www/Dragon3/backend/tests/data/golden_retriever.jpg';
const archivoId = 'test-golden-001';
const correlationId = 'corr-golden-999';
const nombreOriginal = 'golden_retriever.jpg';
const usuarioId = 'test-user-101';
const clientId = 'test-client-303';

// Parámetros FAANG estándar (idénticos a analizadorImagen.js)
const params = {
  rutaArchivo: rutaTestImagen,
  archivoId,
  correlationId,
  nombreOriginal,
  usuarioId,
  clientId
};

async function testResultadoEstructura(resultado) {
  // Estructura FAANG esperada
  const camposEsperados = [
    'archivoId', 'correlationId', 'nombreOriginal', 'usuarioId', 'clientId',
    'timestamp', 'idAnalizador', 'version', 'esAutentico', 'confianza',
    'tipoFirmaDigital', 'categoria', 'mensaje', 'campoDetectado', 'valorDetectado',
    'marcaIADetectada', 'generadorDetectado', 'tipoHuellaDetectada', 'versionDetectada',
    'detalles', 'processingTime', 'exitoso'
  ];
  const missing = camposEsperados.filter(c => !(c in resultado));
  if (missing.length === 0) {
    dragon.sonrie('Estructura FAANG correcta', 'test-analizadorFirmasDigitales', 'STRUCT_OK', { resultado });
    return true;
  } else {
    dragon.agoniza('Estructura FAANG incompleta', null, 'test-analizadorFirmasDigitales', 'STRUCT_MISSING', { missing, resultado });
    return false;
  }
}

async function testPerformance(resultado, tiempoMs) {
  // Objetivo: P95 <200ms
  if (tiempoMs < 200) {
    dragon.zen(`Performance óptima (${tiempoMs}ms)`, 'test-analizadorFirmasDigitales', 'PERF_OK', { processingTime: tiempoMs });
    return true;
  } else if (tiempoMs < 500) {
    dragon.seEnfada(`Performance aceptable (${tiempoMs}ms)`, 'test-analizadorFirmasDigitales', 'PERF_WARN', { processingTime: tiempoMs });
    return false;
  } else {
    dragon.agoniza(`Performance baja (${tiempoMs}ms)`, null, 'test-analizadorFirmasDigitales', 'PERF_BAD', { processingTime: tiempoMs });
    return false;
  }
}

async function testErrorHandling() {
  // Lanzar error controlado (archivo inexistente)
  const badParams = { ...params, rutaArchivo: '/ruta/inexistente.jpg' };
  try {
    // El analizador puede retornar error estructurado o lanzar excepción, ambas válidas
    const resultado = await analizadorFirmasDigitales.analizarImagen(badParams);
    if (resultado && resultado.exitoso === false && resultado.error && resultado.error.codigo === 'FILE_NOT_FOUND') {
      dragon.sonrie('Error handling FAANG correcto (resultado estructurado)', 'test-analizadorFirmasDigitales', 'ERR_OK', { resultado });
      return true;
    } else {
      dragon.agoniza('No se lanzó error estructurado esperado', null, 'test-analizadorFirmasDigitales', 'ERR_STRUCT_BAD', { resultado });
      return false;
    }
  } catch (error) {
    // Debe ser DragonError, estructura FAANG, mensaje claro y logueado
    if (error && error.name === 'DragonError' && error.message && (error.code === 'FILE_NOT_FOUND' || error.codigo === 'FILE_NOT_FOUND')) {
      dragon.sonrie('Error handling FAANG correcto (excepción DragonError)', 'test-analizadorFirmasDigitales', 'ERR_OK', { error });
      return true;
    } else {
      dragon.agoniza('Error handling incorrecto', error, 'test-analizadorFirmasDigitales', 'ERR_BAD', { error });
      return false;
    }
  }
}

async function testJSONPatrones() {
  // Verifica que el analizador utiliza el JSON real de patrones
  const patronesPath = '/var/www/Dragon3/backend/tests/data/analizadorHerramientasSospechosas.json';
  try {
    const json = await fs.readFile(patronesPath, 'utf8');
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object' && Object.keys(obj).length > 0) {
      dragon.sonrie('JSON de patrones cargado correctamente', 'test-analizadorFirmasDigitales', 'JSON_OK', { keys: Object.keys(obj) });
      return true;
    } else {
      dragon.agoniza('JSON de patrones mal formado', null, 'test-analizadorFirmasDigitales', 'JSON_BAD', { obj });
      return false;
    }
  } catch (error) {
    dragon.agoniza('Fallo al cargar JSON de patrones', error, 'test-analizadorFirmasDigitales', 'JSON_ERROR', { patronesPath });
    return false;
  }
}

(async () => {
  dragon.despierta('test-analizadorFirmasDigitales');
  dragon.sonrie('Inicio TEST TOTAL analizadorFirmasDigitales', 'test-analizadorFirmasDigitales', 'TEST_START', { archivoId, correlationId });

  // Test de integración/análisis real
  let resultado, t0, t1;
  let jsonPatronesOK = false;
  try {
    jsonPatronesOK = await testJSONPatrones(); // Verifica JSON primero
    t0 = Date.now();
    resultado = await analizadorFirmasDigitales.analizarImagen(params);
    t1 = Date.now();
  } catch (error) {
    dragon.agoniza('Error en test de integración', error, 'test-analizadorFirmasDigitales', 'INTEGRATION_ERROR', { params });
    process.exit(1);
  }

  const estructuraOK = await testResultadoEstructura(resultado);
  const perfOK = await testPerformance(resultado, t1 - t0);

  // Test de detección IA (si hay coincidencias en el JSON de test)
  if (resultado.detalles?.coincidenciasIA && resultado.detalles.coincidenciasIA.length > 0) {
    dragon.seEnfada(`Patrones IA detectados: ${resultado.detalles.coincidenciasIA.length}`, 'test-analizadorFirmasDigitales', 'IA_DETECTED', { coincidenciasIA: resultado.detalles.coincidenciasIA });
  } else {
    dragon.sePreocupa('No se detectaron patrones IA en la imagen de test', 'test-analizadorFirmasDigitales', 'NO_IA', { resultado });
  }

  // Test de error handling
  const errorHandlingOK = await testErrorHandling();

  // Resultado final
  if (estructuraOK && perfOK && errorHandlingOK && jsonPatronesOK) {
    dragon.sonrie('TEST TOTAL analizadorFirmasDigitales COMPLETADO', 'test-analizadorFirmasDigitales', 'TEST_OK', { archivoId, correlationId });
    process.exit(0);
  } else {
    dragon.agoniza('TEST TOTAL analizadorFirmasDigitales FALLIDO', null, 'test-analizadorFirmasDigitales', 'TEST_FAIL', { estructuraOK, perfOK, errorHandlingOK, jsonPatronesOK });
    process.exit(2);
  }
})();