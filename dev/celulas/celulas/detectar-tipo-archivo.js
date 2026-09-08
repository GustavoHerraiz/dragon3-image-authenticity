/**
 * detectar-tipo-archivo.js
 * 
 * Detecta el tipo de archivo a partir del buffer (imagen, PDF, vídeo, etc.)
 * usando la librería file-type (magic numbers).
 * 
 * Entrada: { payload: "base64..." } o { payload: { buffer: "base64..." } }
 * Salida: { esIA, confianza, explicacion, evidencias, peso, tipo, formato, extension, mimeType }
 * 
 * Contrato: cumple con el formato esperado por generar-veredicto
 * Principios: KISS, rápido (< 5ms), sin dependencias pesadas.
 */

import { fileTypeFromBuffer } from 'file-type';

export default async function detectarTipoArchivo(entrada, contexto) {
  let buffer;

  try {
    // 1. Obtener buffer desde diferentes formatos de entrada
    if (typeof entrada.payload === 'string') {
      // Si es base64, limpiar y convertir
      const base64Limpia = entrada.payload.replace(/^data:.*?;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else if (Buffer.isBuffer(entrada.payload)) {
      buffer = entrada.payload;
    } else if (entrada.payload && entrada.payload.buffer) {
      // Si viene de cargar-imagen (buffer en base64)
      const base64Limpia = entrada.payload.buffer.replace(/^data:.*?;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else {
      throw new Error('No se pudo obtener el buffer para analizar el tipo.');
    }

    // 2. Detectar tipo usando file-type
    const tipo = await fileTypeFromBuffer(buffer);

    if (tipo) {
      // Tipo detectado correctamente
      const evidencias = [`formato: ${tipo.ext}`, `mime: ${tipo.mime}`];
      return {
        exito: true,
        resultado: {
          esIA: false,               // No es IA, solo informativo
          confianza: 1,              // Confianza total en la detección
          explicacion: `Tipo de archivo detectado: ${tipo.mime}`,
          evidencias,
          peso: 1,                   // Peso neutro (no influye en veredicto)
          tipo: tipo.mime,
          formato: tipo.ext,
          extension: tipo.ext,
          mimeType: tipo.mime
        },
        metricas: { tiempoMs: 2 }
      };
    } else {
      // No se pudo detectar (archivo desconocido)
      return {
        exito: true,
        resultado: {
          esIA: false,
          confianza: 0.5,            // Confianza media (no sabemos)
          explicacion: 'No se pudo determinar el tipo de archivo.',
          evidencias: ['Tipo desconocido'],
          peso: 1,
          tipo: 'unknown',
          formato: 'unknown',
          extension: 'unknown',
          mimeType: 'application/octet-stream'
        },
        metricas: { tiempoMs: 2 }
      };
    }
  } catch (error) {
    return {
      exito: false,
      error: `Error al detectar tipo de archivo: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 1
      },
      metricas: { tiempoMs: 0 }
    };
  }
}