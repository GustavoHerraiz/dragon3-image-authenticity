/**
 * ============================================================================
 * DRAGON3 ENTERPRISE - BUFFER TOOLS (FIX FINAL: EXPORTACIÓN ÚNICA)
 * ============================================================================
 * @file bufferTools.js
 * @version 1.0.2-FINAL_EXPORT_FIX
 * @description
 * Colección de utilidades para manejo de Buffers.
 * * **FIX CRÍTICO:** Se eliminó la exportación duplicada de 'bufferRead'.
 */

import fs from 'fs/promises';
// La ruta es relativa a utilidades/
import dragon from './logger.js';

const MODULE_NAME = 'bufferTools.js';

/**
 * Lee un fragmento específico de un archivo en un Buffer.
 * @param {string} filePath - La ruta del archivo.
 * @param {number} [start=0] - Byte inicial.
 * @param {number} [end] - Byte final (exclusivo).
 * @returns {Promise<Buffer>}
 */
export async function bufferRead(filePath, start = 0, end) {
  if (!filePath) {
    throw new Error("ERR_MISSING_PATH: Se requiere la ruta del archivo (filePath) para la lectura.");
  }

  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, 'r');
    const stats = await fileHandle.stat();
    const fileSize = stats.size;

    const readStart = Math.max(0, start);
    let readLength = (end !== undefined) ? Math.max(0, end - readStart) : (fileSize - readStart);
    const actualReadLength = Math.min(readLength, fileSize - readStart);

    if (actualReadLength <= 0) {
        dragon.warn(`Lectura fuera de límites (start=${start}, end=${end}). Tamaño real: ${fileSize} bytes.`, MODULE_NAME, 'READ_RANGE_WARN', { filePath, fileSize });
        return Buffer.alloc(0);
    }

    const buffer = Buffer.alloc(actualReadLength);

    const { bytesRead } = await fileHandle.read(buffer, 0, actualReadLength, readStart);

    if (bytesRead < actualReadLength) {
        dragon.warn(`Lectura incompleta. Se esperaban ${actualReadLength} bytes, se leyeron ${bytesRead}.`, MODULE_NAME, 'READ_INCOMPLETE_WARN', { filePath, readStart, actualReadLength, bytesRead });
        return buffer.subarray(0, bytesRead);
    }

    return buffer;

  } catch (error) {
    dragon.error(`Error de I/O al acceder a la ruta.`, MODULE_NAME, 'FILE_READ_ERROR', { filePath, errorCode: error.code || 'UNKNOWN_IO' });
    throw new Error(`FILE_IO_FAILURE: Error al leer el archivo ${filePath}.`);
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

// ATENCIÓN: Se eliminaron 'export default { bufferRead };' y 'export { bufferRead };'
// para evitar el error 'Duplicate export'. La función ya está exportada arriba.
