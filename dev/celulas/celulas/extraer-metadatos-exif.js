/**
 * extraer-metadatos-exif.js
 * 
 * Extrae TODOS los metadatos de la imagen (EXIF, IPTC, XMP, ICC, etc.) usando exifr.
 * Soporta JPEG, PNG, WebP, HEIC, AVIF, TIFF y más.
 * 
 * Entrada: { payload: "base64..." } o { payload: { buffer: "base64..." } }
 * Salida: { esIA, confianza, explicacion, evidencias, peso, ... }
 * 
 * Contrato: cumple con el formato esperado por generar-veredicto
 * 
 * Principios: KISS, real, rápido, compatible con múltiples formatos y metadatos.
 * 
 * @module extraer-metadatos-exif
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import exifr from 'exifr';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function extraerMetadatosExif(entrada, contexto) {
  let buffer;

  try {
    // 1. Obtener buffer
    if (typeof entrada.payload === 'string') {
      const base64Limpia = entrada.payload.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else if (entrada.payload && entrada.payload.buffer) {
      const base64Limpia = entrada.payload.buffer.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Limpia, 'base64');
    } else {
      throw new Error('No se pudo obtener el buffer');
    }

    // ============================================================
    // 2. LECTURA DE CONFIGURACIÓN
    // ============================================================
    const configPath = path.join(__dirname, '..', 'configuracion.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = { optimizacion: { cacheActivado: false } };
    }
    const CACHE_ACTIVADO = config.optimizacion?.cacheActivado || false;

    if (CACHE_ACTIVADO) {
      console.log('🔍 [extraer-metadatos-exif] Caché de metadatos activado (no implementado aún)');
    }

    // ============================================================
    // 3. EXTRAER TODOS LOS METADATOS CON exifr
    // ============================================================
    let metadatos = null;
    let tieneMetadatos = false;

    try {
      // 🔥 exifr.parse() con opciones para extraer TODOS los metadatos
      metadatos = await exifr.parse(buffer, {
        // EXIF estándar (siempre activo por defecto)
        exif: true,
        // Metadatos adicionales
        iptc: true,      // IPTC (usado en fotografía periodística)
        xmp: true,       // XMP (metadatos de Adobe)
        icc: true,       // Perfiles de color ICC
        jfif: true,      // JFIF (formato JPEG)
        // Para PNG
        ihdr: true,      // Cabecera PNG
        // Para HEIC/AVIF
        exif: true,      // exifr ya soporta estos formatos nativamente
        // Opciones de salida
        mergeOutput: true // Combina todos los metadatos en un solo objeto
      });

      tieneMetadatos = metadatos !== null && typeof metadatos === 'object' && Object.keys(metadatos).length > 0;
    } catch (error) {
      console.warn(`⚠️ [extraer-metadatos-exif] Error parseando metadatos: ${error.message}`);
      tieneMetadatos = false;
    }

    // Si no hay metadatos, devolver resultado con confianza baja
    if (!tieneMetadatos) {
      return {
        exito: true,
        resultado: {
          esIA: false,
          confianza: 0.1,
          explicacion: 'La imagen no contiene metadatos (EXIF, IPTC, XMP, ICC, etc.) o no se pudieron leer.',
          evidencias: ['Sin metadatos detectados'],
          peso: 0.5,
          metadatos: {},
          tieneMetadatos: false,
          hasExif: false,
          hasGPS: false,
          hasDate: false,
          hasIPTC: false,
          hasXMP: false,
          hasICC: false,
          cacheActivado: CACHE_ACTIVADO
        },
        metricas: { tiempoMs: 2 }
      };
    }

    // ============================================================
    // 4. EXTRAER CAMPOS RELEVANTES (EXIF estándar)
    // ============================================================
    const exif = {
      Make: metadatos.Make,
      Model: metadatos.Model,
      DateTimeOriginal: metadatos.DateTimeOriginal || metadatos.CreateDate,
      CreateDate: metadatos.CreateDate,
      ModifyDate: metadatos.ModifyDate,
      ExposureTime: metadatos.ExposureTime,
      FNumber: metadatos.FNumber,
      ISO: metadatos.ISO,
      FocalLength: metadatos.FocalLength,
      GPSLatitude: metadatos.GPSLatitude || metadatos.latitude,
      GPSLongitude: metadatos.GPSLongitude || metadatos.longitude,
      GPSAltitude: metadatos.GPSAltitude || metadatos.altitude,
      Software: metadatos.Software,
      Copyright: metadatos.Copyright,
      Artist: metadatos.Artist,
      ImageWidth: metadatos.ImageWidth || metadatos.Width,
      ImageHeight: metadatos.ImageHeight || metadatos.Height,
      Orientation: metadatos.Orientation,
      Flash: metadatos.Flash,
      WhiteBalance: metadatos.WhiteBalance,
      ExposureProgram: metadatos.ExposureProgram,
      MeteringMode: metadatos.MeteringMode,
      LensModel: metadatos.LensModel,
      LensMake: metadatos.LensMake
    };

    // ============================================================
    // 5. EXTRAER OTROS METADATOS (IPTC, XMP, ICC, etc.)
    // ============================================================
    // 🔥 IPTC: Palabras clave, descripciones, etc.
    const iptc = {
      Keywords: metadatos.Keywords || metadatos.IPTCKeywords || [],
      Caption: metadatos.Caption || metadatos.IPTCDescription || '',
      Credit: metadatos.Credit || metadatos.IPTCCredit || '',
      Source: metadatos.Source || metadatos.IPTCSource || '',
      CopyrightNotice: metadatos.CopyrightNotice || metadatos.IPTCCopyright || '',
      City: metadatos.City || metadatos.IPTCCity || '',
      State: metadatos.State || metadatos.IPTCState || '',
      Country: metadatos.Country || metadatos.IPTCCountry || ''
    };

    // 🔥 XMP: Metadatos de Adobe (herramientas de edición, etc.)
    const xmp = {
      CreatorTool: metadatos.CreatorTool || metadatos.XMPCreatorTool || '',
      CreateDate: metadatos.XMPCreateDate || metadatos.CreateDate || '',
      MetadataDate: metadatos.MetadataDate || metadatos.XMPMetadataDate || '',
      Rating: metadatos.Rating || metadatos.XMPRating || 0,
      Label: metadatos.Label || metadatos.XMPLabel || '',
      Description: metadatos.Description || metadatos.XMPDescription || ''
    };

    // 🔥 ICC: Perfiles de color
    const icc = {
      ProfileName: metadatos.ICCProfileName || metadatos.ICCName || '',
      ColorSpace: metadatos.ColorSpace || metadatos.ICCColorSpace || '',
      Description: metadatos.ICCDescription || metadatos.ProfileDescription || ''
    };

    // ============================================================
    // 6. EVALUAR CONSISTENCIA CON TODOS LOS METADATOS
    // ============================================================
    const hasExif = Object.values(exif).some(v => v !== undefined && v !== null);
    const hasIPTC = Object.values(iptc).some(v => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
    const hasXMP = Object.values(xmp).some(v => v !== undefined && v !== null && v !== '');
    const hasICC = Object.values(icc).some(v => v !== undefined && v !== null && v !== '');
    const hasGPS = !!exif.GPSLatitude && !!exif.GPSLongitude;
    const hasDate = !!exif.DateTimeOriginal || !!exif.CreateDate;
    const hasMake = !!exif.Make;
    const hasModel = !!exif.Model;

    let esIA = false;
    let confianza = 0;
    const evidencias = [];

    // Evaluar según todos los metadatos disponibles
    if (hasMake && hasModel) {
      esIA = false;
      confianza = 0.85;
      evidencias.push(`EXIF completo: ${exif.Make} ${exif.Model}`);
      if (hasGPS) {
        confianza = 0.95;
        evidencias.push('Datos GPS presentes');
      }
      if (hasDate) {
        evidencias.push(`Fecha original: ${exif.DateTimeOriginal || exif.CreateDate}`);
      }
    } else if (hasExif && (hasMake || hasModel)) {
      esIA = false;
      confianza = 0.5;
      evidencias.push('EXIF parcial (sin Make/Model completo)');
    } else if (hasXMP && xmp.CreatorTool) {
      // Si tiene XMP con CreatorTool, puede ser de IA o de edición
      const herramientasIA = ['ChatGPT', 'DALL-E', 'Midjourney', 'Stable Diffusion', 'Adobe Firefly', 'Canva AI'];
      const esHerramientaIA = herramientasIA.some(h => xmp.CreatorTool.includes(h));
      if (esHerramientaIA) {
        esIA = true;
        confianza = 0.9;
        evidencias.push(`Herramienta IA detectada en XMP: ${xmp.CreatorTool}`);
      } else {
        esIA = false;
        confianza = 0.6;
        evidencias.push(`Herramienta de edición: ${xmp.CreatorTool}`);
      }
    } else if (hasIPTC && iptc.Keywords && iptc.Keywords.length > 0) {
      // Palabras clave en IPTC pueden indicar IA
      const keywordsIA = ['AI', 'AI generated', 'artificial', 'generated by AI', 'DALL-E', 'Midjourney'];
      const tieneKeywordIA = iptc.Keywords.some(k => keywordsIA.some(ia => k.includes(ia)));
      if (tieneKeywordIA) {
        esIA = true;
        confianza = 0.8;
        evidencias.push(`Palabras clave IPTC sospechosas: ${iptc.Keywords.join(', ')}`);
      } else {
        esIA = false;
        confianza = 0.4;
        evidencias.push(`Palabras clave IPTC: ${iptc.Keywords.join(', ')}`);
      }
    } else if (hasExif) {
      esIA = false;
      confianza = 0.3;
      evidencias.push('EXIF sin información de cámara');
    } else if (hasXMP) {
      esIA = false;
      confianza = 0.2;
      evidencias.push('Metadatos XMP sin información relevante');
    } else {
      esIA = false;
      confianza = 0.1;
      evidencias.push('Sin metadatos relevantes');
    }

    // ============================================================
    // 7. GENERAR EXPLICACIÓN
    // ============================================================
    let explicacion = '';
    if (confianza > 0.7) {
      explicacion = `La imagen contiene metadatos completos (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`;
    } else if (confianza > 0.3) {
      explicacion = `La imagen contiene metadatos parciales (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`;
    } else {
      explicacion = `La imagen contiene metadatos limitados o ninguno (confianza: ${(confianza * 100).toFixed(0)}%). ${evidencias.join(' ')}`;
    }

    // ============================================================
    // 8. RETORNO CON EL CONTRATO
    // ============================================================
    return {
      exito: true,
      resultado: {
        esIA,
        confianza,
        explicacion,
        evidencias,
        peso: 0.9,
        // 🔥 TODOS LOS METADATOS EXTRAÍDOS
        exif,
        iptc,
        xmp,
        icc,
        metadatosCompletos: metadatos, // Para depuración / datos extra
        hasExif,
        hasIPTC,
        hasXMP,
        hasICC,
        hasGPS,
        hasDate,
        cacheActivado: CACHE_ACTIVADO
      },
      metricas: { tiempoMs: 4 }
    };

  } catch (error) {
    return {
      exito: false,
      error: `Error al procesar metadatos: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar metadatos: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.5
      },
      metricas: { tiempoMs: 0 }
    };
  }
}