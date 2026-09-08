/**
 * monitorMemoria.js - Watcher de memoria FAANG Dragon3
 * Propósito: Monitoriza el heap y ejecuta limpieza proactiva
 * Autor: GustavoHerraiz
 * Versión: 1.0.0-FAANG
 * Fecha: 2025-10-27
 */

import { v4 as uuidv4 } from 'uuid';
import dragonLogger from './logger.js';

/**
 * Inicia el watcher de memoria.
 * Llama redSuperior._ejecutarLimpiezaMemoria() si el heap supera el umbral.
 * Loguea el estado de memoria antes y después con dragonLogger.
 *
 * @param {Object} options
 *   - redSuperior: instancia real de RedSuperior (obligatorio)
 *   - intervaloMs: intervalo en ms (opcional, default 30000)
 *   - heapThreshold: porcentaje de heapUsed/heapTotal (opcional, default 85)
 */
export function iniciarWatcherMemoria({ redSuperior, intervaloMs = 30000, heapThreshold = 85 }) {
  if (!redSuperior || typeof redSuperior._ejecutarLimpiezaMemoria !== 'function') {
    dragonLogger.agoniza('RedSuperior inválida para watcher de memoria', null, 'monitorMemoria.js', 'WATCHER_INIT_ERROR', { redSuperior });
    return;
  }

  // Verificación de GC disponible
  if (!global.gc) {
    dragonLogger.sePreocupa('GC no disponible, watcher funcionará sin GC forzado', 'monitorMemoria.js', 'GC_NOT_AVAILABLE');
  } else {
    dragonLogger.sonrie('GC disponible, watcher puede forzar limpieza', 'monitorMemoria.js', 'GC_AVAILABLE');
  }

  dragonLogger.zen('Watcher de memoria FAANG iniciado', 'monitorMemoria.js', 'WATCHER_STARTED', {
    intervaloMs,
    heapThreshold
  });

  setInterval(() => {
    const correlationId = uuidv4();
    const memBefore = process.memoryUsage();
    const heapUsedPct = (memBefore.heapUsed / memBefore.heapTotal) * 100;

    dragonLogger.zen('Estado de memoria antes de limpieza', 'monitorMemoria.js', 'MEMORY_BEFORE_CLEAN', {
      correlationId,
      heapUsedMB: Math.round(memBefore.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memBefore.heapTotal / 1024 / 1024),
      heapUsedPct: heapUsedPct.toFixed(2),
      rssMB: Math.round(memBefore.rss / 1024 / 1024),
      externalMB: Math.round(memBefore.external / 1024 / 1024),
      timestamp: new Date().toISOString()
    });

    if (heapUsedPct >= heapThreshold) {
      dragonLogger.seEnfada('Heap usage supera umbral, ejecutando limpieza proactiva', 'monitorMemoria.js', 'HEAP_THRESHOLD_EXCEEDED', {
        correlationId,
        heapUsedPct: heapUsedPct.toFixed(2),
        heapThreshold
      });

      try {
        redSuperior._ejecutarLimpiezaMemoria();
      } catch (error) {
        dragonLogger.agoniza('Error ejecutando limpieza de memoria en RedSuperior', error, 'monitorMemoria.js', 'CLEANUP_ERROR', { correlationId });
      }

      // Forzar GC si está disponible
      if (global.gc) {
        try {
          global.gc();
          dragonLogger.sonrie('GC forzado tras limpieza proactiva', 'monitorMemoria.js', 'GC_FORCED', { correlationId });
        } catch (gcError) {
          dragonLogger.sePreocupa('Error forzando GC', 'monitorMemoria.js', 'GC_FORCE_ERROR', { correlationId, error: gcError.message });
        }
      }

      const memAfter = process.memoryUsage();
      const heapUsedPctAfter = (memAfter.heapUsed / memAfter.heapTotal) * 100;

      dragonLogger.sonrie('Estado de memoria después de limpieza', 'monitorMemoria.js', 'MEMORY_AFTER_CLEAN', {
        correlationId,
        heapUsedMB: Math.round(memAfter.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memAfter.heapTotal / 1024 / 1024),
        heapUsedPct: heapUsedPctAfter.toFixed(2),
        rssMB: Math.round(memAfter.rss / 1024 / 1024),
        externalMB: Math.round(memAfter.external / 1024 / 1024),
        freedMB: Math.max(0, Math.round((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024)),
        timestamp: new Date().toISOString()
      });
    } else {
      dragonLogger.zen('Memoria en rango seguro, no se ejecuta limpieza', 'monitorMemoria.js', 'MEMORY_OK', {
        correlationId,
        heapUsedPct: heapUsedPct.toFixed(2),
        heapThreshold
      });
    }
  }, intervaloMs);
}
