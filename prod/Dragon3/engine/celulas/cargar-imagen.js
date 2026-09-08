/**
 * cargar-imagen.js
 *
 * ====================================================================
 * CARGA DE IMAGEN Y EXTRACCIÓN DE METADATOS (VERSIÓN BASE64)
 * ====================================================================
 *
 * Convierte una imagen en base64 a buffer, extrae metadatos básicos
 * (formato, dimensiones, profundidad de color, etc.) y devuelve el
 * buffer en formato base64 para que sea compatible con el resto de células.
 *
 * ENTRADA:
 *   - payload: string base64 de la imagen (con o sin prefijo data:image/...)
 *
 * SALIDA:
 *   - buffer: string base64 (para serialización y compatibilidad)
 *   - formato: string (jpeg, png, webp, etc.)
 *   - ancho: number
 *   - alto: number
 *   - canales: number
 *   - profundidad: number
 *   - tamaño: number (bytes)
 *   - configLeida: boolean (trazabilidad)
 *
 * RAZÓN DE LA CONVERSIÓN A BASE64:
 *   - Todas las células (EXIF, patrones, artefactos, etc.) esperan un string
 *     base64 para poder usar .replace() y limpiar prefijos.
 *   - El buffer binario no puede ser serializado directamente en JSON.
 *   - La conversión a base64 mantiene la compatibilidad con todo el sistema.
 *
 * @module cargar-imagen
 */

import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function cargarImagen(entrada, contexto) {
  // ============================================================
  // 1. VALIDACIÓN DE ENTRADA
  // ============================================================
  const base64 = entrada.payload;
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Se requiere una cadena base64 en payload');
  }

  // ============================================================
  // 2. LECTURA DE CONFIGURACIÓN (trazabilidad)
  // ============================================================
  const configPath = path.join(__dirname, '..', 'configuracion.json');
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    config = { optimizacion: {} };
  }
  const configLeida = config.optimizacion?.cacheActivado || false;

  // ============================================================
  // 3. CONVERSIÓN DE BASE64 A BUFFER
  // ============================================================
  // Limpiar base64 (quitar prefijo "data:image/...;base64," si existe)
  const base64Limpia = base64.replace(/^data:image\/\w+;base64,/, '');

  // Buffer binario para procesar con Sharp
  const bufferBinario = Buffer.from(base64Limpia, 'base64');

  // ============================================================
  // 4. EXTRACCIÓN DE METADATOS CON SHARP
  // ============================================================
  const metadata = await sharp(bufferBinario).metadata();

  // ============================================================
  // 5. RETORNO CON BUFFER EN BASE64 (COMPATIBILIDAD)
  // ============================================================
  return {
    exito: true,
    resultado: {
      // 🔥 IMPORTANTE: Se devuelve el buffer en base64 para que sea
      // compatible con todas las células del sistema (EXIF, patrones,
      // artefactos, doble compresión, etc.) que esperan un string base64
      buffer: bufferBinario.toString('base64'), // Base64 para compatibilidad
      hash: crypto.createHash('sha256').update(bufferBinario).digest('hex'),

      // Metadatos de la imagen
      formato: metadata.format,
      ancho: metadata.width,
      alto: metadata.height,
      canales: metadata.channels,
      profundidad: metadata.bitDepth || 8,
      tamaño: bufferBinario.length, // Tamaño en bytes del buffer original

      // Trazabilidad de configuración
      configLeida: configLeida
    },
    metricas: { tiempoMs: 10 }
  };
}