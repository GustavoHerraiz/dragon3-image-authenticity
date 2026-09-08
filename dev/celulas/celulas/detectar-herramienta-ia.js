/**
 * detectar-herramienta-ia.js
 * 
 * INTERPRETA los metadatos extraídos por extraer-metadatos-exif
 * para detectar si la imagen fue generada por una herramienta IA
 * o si es una imagen real con metadatos legítimos.
 * 
 * MEJORAS (v3):
 *   - Detección de GPS (evidencia humana fuerte)
 *   - Detección de falta de metadatos (sospechoso)
 *   - Detección de fechas inconsistentes
 *   - Detección de cámaras profesionales (más confianza humana)
 *   - Interpretación de metadatos para aumentar confianza humana
 * 
 * @module detectar-herramienta-ia
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function detectarHerramientaIA(entrada, contexto) {
  const payload = entrada.payload || {};
  const exif = payload.exif || {};
  const iptc = payload.iptc || {};
  const xmp = payload.xmp || {};
  const metadatosCompletos = payload.metadatosCompletos || {};
  const hasExif = payload.hasExif || false;
  const hasIPTC = payload.hasIPTC || false;
  const hasXMP = payload.hasXMP || false;
  const hasGPS = payload.hasGPS || false;

  const nombreOriginal = payload.nombreOriginal || contexto?.nombreOriginal || '';
  const dimensiones = payload.dimensiones || {};

  try {
    // ============================================================
    //  1. CARGAR JSON DE PATRONES
    // ============================================================
    const patronesPath = path.join(__dirname, 'analizadorHerramientasSospechosas.json');
    let patronesJSON = {};
    try {
      const contenido = fs.readFileSync(patronesPath, 'utf8');
      patronesJSON = JSON.parse(contenido);
    } catch (e) {
      console.warn('⚠️ No se pudo cargar analizadorHerramientasSospechosas.json:', e.message);
      patronesJSON = { softwareGeneracionIA: [], marcasIA: [], iaGeneradores: {} };
    }

    // ============================================================
    //  2. RECOPILAR TEXTOS DE METADATOS
    // ============================================================
    const textos = [
      exif.Software, exif.UserComment, exif.ImageDescription,
      exif.Artist, exif.Copyright, exif.XMPToolkit,
      exif.Generator, exif.Producer, exif.Comment,
      exif.makerNote, exif.DocumentName, exif.HostComputer,
      xmp.CreatorTool, xmp.Description, xmp.Label,
      iptc.Keywords?.join(' '), iptc.Caption, iptc.Credit,
      iptc.Source, iptc.CopyrightNotice,
      metadatosCompletos?.XMP?.CreatorTool,
      metadatosCompletos?.XMP?.MetadataDate,
      metadatosCompletos?.XMP?.Description,
      metadatosCompletos?.Software,
      metadatosCompletos?.Comment,
      metadatosCompletos?.ImageDescription,
    ];

    const textoCompleto = textos
      .filter(val => val && typeof val === 'string')
      .join(' ');

    // ============================================================
    //  3. DETECCIÓN DE IA POR PATRONES
    // ============================================================
    let puntuacionIA = 0;
    const herramientasEncontradas = new Set();

    const softwareIA = patronesJSON.softwareGeneracionIA || [];
    for (const patron of softwareIA) {
      try {
        const regex = new RegExp(patron, 'i');
        if (regex.test(textoCompleto)) {
          herramientasEncontradas.add(patron);
          puntuacionIA += 0.08;
        }
      } catch (e) { /* regex inválido */ }
    }

    const marcasIA = patronesJSON.marcasIA || [];
    for (const patron of marcasIA) {
      try {
        const regex = new RegExp(patron, 'i');
        if (regex.test(textoCompleto)) {
          herramientasEncontradas.add(patron);
          puntuacionIA += 0.08;
        }
      } catch (e) { /* regex inválido */ }
    }

    const generadores = patronesJSON.iaGeneradores || {};
    for (const [nombre, datos] of Object.entries(generadores)) {
      const patrones = datos.metadatos || datos.comentarios || datos.binario || [];
      for (const patron of patrones) {
        try {
          const regex = new RegExp(patron, 'i');
          if (regex.test(textoCompleto)) {
            herramientasEncontradas.add(nombre);
            puntuacionIA += 0.1;
            break;
          }
        } catch (e) { /* regex inválido */ }
      }
    }

    // ============================================================
    //  🔥 4. NUEVAS DETECCIONES
    // ============================================================

    // 4.1 Detección de GPS (evidencia humana fuerte)
    if (hasGPS || exif.GPSLatitude || exif.GPSLongitude || metadatosCompletos?.latitude) {
      herramientasEncontradas.add('gps-detectado');
      puntuacionIA = Math.max(0, puntuacionIA - 0.3);
      console.log('✅ [detectar-herramienta-ia] GPS detectado → fuerte evidencia humana');
    }

    // 4.2 Detección de falta de metadatos (sospechoso)
    const tieneMetadatos = hasExif || hasIPTC || hasXMP;
    if (!tieneMetadatos) {
      herramientasEncontradas.add('sin-metadatos');
      puntuacionIA += 0.2;
      console.log('⚠️ [detectar-herramienta-ia] Sin metadatos → sospechoso');
    }

    // 4.3 Detección de fechas inconsistentes
    const fechaOriginal = exif.DateTimeOriginal || exif.CreateDate || metadatosCompletos?.DateTimeOriginal;
    if (fechaOriginal) {
      try {
        const fecha = new Date(fechaOriginal);
        const ahora = new Date();
        const diffAnios = (ahora - fecha) / (1000 * 60 * 60 * 24 * 365);
        if (diffAnios > 10) {
          herramientasEncontradas.add('fecha-antigua');
          puntuacionIA += 0.1;
          console.log(`⚠️ [detectar-herramienta-ia] Fecha muy antigua (${diffAnios.toFixed(0)} años)`);
        }
        if (fecha > ahora) {
          herramientasEncontradas.add('fecha-futura');
          puntuacionIA += 0.2;
          console.log('⚠️ [detectar-herramienta-ia] Fecha futura → posible manipulación');
        }
      } catch (e) { /* fecha inválida */ }
    }

    // 4.4 Detección de cámaras profesionales (evidencia humana fuerte)
    const camarasProfesionales = [
      /canon/i, /nikon/i, /sony/i, /fujifilm/i, /ricoh/i,
      /pentax/i, /olympus/i, /leica/i, /hasselblad/i,
      /phase\s*one/i, /panasonic/i, /lumix/i
    ];
    const marca = exif.Make || metadatosCompletos?.Make || '';
    const modelo = exif.Model || metadatosCompletos?.Model || '';
    const camaraTexto = `${marca} ${modelo}`;
    let esCamaraProfesional = false;

    for (const regex of camarasProfesionales) {
      if (regex.test(camaraTexto)) {
        esCamaraProfesional = true;
        herramientasEncontradas.add('camara-profesional');
        puntuacionIA = Math.max(0, puntuacionIA - 0.2);
        console.log(`✅ [detectar-herramienta-ia] Cámara profesional detectada: ${camaraTexto}`);
        break;
      }
    }

    // 4.5 Cámara real (genérica) → evidencia humana
    if (hasExif && exif.Make && exif.Model) {
      herramientasEncontradas.add('camara-real');
      // Si es profesional, ya hemos restado; si no, restamos un poco
      if (!esCamaraProfesional) {
        puntuacionIA = Math.max(0, puntuacionIA - 0.1);
      }
    }

    // ============================================================
    //  🔥 5. INTERPRETACIÓN DE METADATOS (confianza humana)
    // ============================================================
    let confianzaHumana = 0;

    // 5.1 Cámara real → +0.3
    if (hasExif && exif.Make && exif.Model) {
      confianzaHumana += 0.3;
    }

    // 5.2 Cámara profesional → +0.2 extra
    if (esCamaraProfesional) {
      confianzaHumana += 0.2;
    }

    // 5.3 Autor y copyright → +0.2
    if (exif.Artist || exif.Copyright || iptc.CopyrightNotice || xmp.CreatorTool) {
      confianzaHumana += 0.2;
    }

    // 5.4 GPS → +0.2
    if (hasGPS || exif.GPSLatitude || exif.GPSLongitude) {
      confianzaHumana += 0.2;
    }

    // 5.5 Software legítimo → +0.2
    const softwareLegitimo = [
      /adobe\s*photoshop/i, /adobe\s*lightroom/i, /adobe\s*camera\s*raw/i,
      /gimp/i, /corel/i, /affinity\s*photo/i, /capture\s*one/i,
      /darktable/i, /rawtherapee/i
    ];
    const software = exif.Software || xmp.CreatorTool || metadatosCompletos?.Software || '';
    for (const regex of softwareLegitimo) {
      if (regex.test(software)) {
        confianzaHumana += 0.2;
        break;
      }
    }

    // 5.6 Historial de edición → +0.2
    const history = metadatosCompletos?.History || [];
    if (Array.isArray(history) && history.length > 0) {
      confianzaHumana += 0.2;
    }

    // 5.7 ICC profesional → +0.1
    if (metadatosCompletos?.ICCProfile || metadatosCompletos?.ProfileDescription) {
      const icc = metadatosCompletos.ICCProfile || metadatosCompletos.ProfileDescription || '';
      if (/adobe\s*rgb|sRGB|display\s*p3/i.test(icc)) {
        confianzaHumana += 0.1;
      }
    }

    // 🔥 Confianza humana máxima 0.95
    confianzaHumana = Math.min(confianzaHumana, 0.95);

    // ============================================================
    //  6. DETECCIÓN POR NOMBRE DE ARCHIVO
    // ============================================================
    const nombreLower = nombreOriginal.toLowerCase();
    const patronesNombre = [
      /dalle/i, /midjourney/i, /stable[-_]diffusion/i, /sdxl/i,
      /firefly/i, /leonardo/i, /krea/i, /ideogram/i, /playground/i,
      /ai[-_]generated/i, /generated[-_]by[-_]ai/i, /chatgpt/i,
      /openai/i, /mj_/i, /sd_/i, /ai_/i,
      /dall[-_]e/i, /bing\s*image/i, /perplexity/i, /runway/i
    ];
    for (const regex of patronesNombre) {
      if (regex.test(nombreLower)) {
        herramientasEncontradas.add('nombre-sospechoso');
        puntuacionIA += 0.1;
        break;
      }
    }

    // ============================================================
    //  7. DETECCIÓN POR DIMENSIONES
    // ============================================================
    const ancho = dimensiones.width || exif.ImageWidth || 0;
    const alto = dimensiones.height || exif.ImageHeight || 0;
    if (ancho > 0 && alto > 0) {
      const dimensionesIA = [
        [1024, 1024], [512, 512], [768, 768], [2048, 2048],
        [1024, 1792], [1792, 1024], [1024, 1536], [1536, 1024]
      ];
      const esDimensionIA = dimensionesIA.some(([w, h]) => w === ancho && h === alto);
      if (esDimensionIA && !(hasExif && exif.Make && exif.Model)) {
        herramientasEncontradas.add('dimension-ia');
        puntuacionIA += 0.15;
      }
    }

    // ============================================================
    //  8. DECISIÓN FINAL
    // ============================================================
    puntuacionIA = Math.min(puntuacionIA, 0.7);

    let confianzaFinal = puntuacionIA;
    if (confianzaHumana > 0.5) {
      confianzaFinal = 0;
      herramientasEncontradas.add('evidencia-humana-fuerte');
    } else {
      confianzaFinal = Math.max(0, puntuacionIA - confianzaHumana * 0.5);
    }

    const esIA = confianzaFinal > 0.2;
    const peso = 0.6;

    // 🔥 Evidencias enriquecidas para el frontend
    const evidencias = [];
    if (esCamaraProfesional) evidencias.push(`📷 Cámara profesional: ${camaraTexto}`);
    if (hasGPS) evidencias.push('📍 GPS detectado');
    if (exif.Artist) evidencias.push(`🖌️ Autor: ${exif.Artist}`);
    if (exif.Copyright) evidencias.push(`© Copyright: ${exif.Copyright}`);
    if (software && softwareLegitimo.some(r => r.test(software))) {
      evidencias.push(`💻 Software: ${software}`);
    }
    if (confianzaHumana > 0.5) evidencias.push('✅ Múltiples evidencias humanas');

    if (herramientasEncontradas.size > 0 && evidencias.length === 0) {
      evidencias.push(`Patrones IA detectados: ${Array.from(herramientasEncontradas).join(', ')}`);
    }
    if (evidencias.length === 0) {
      evidencias.push('No se encontraron herramientas de generación IA en los metadatos.');
    }

    const explicacion = esIA
      ? `Se detectaron patrones de IA (confianza: ${(confianzaFinal * 100).toFixed(0)}%). ${evidencias.join(' ')}`
      : `No se detectaron herramientas de generación IA (confianza: ${(confianzaFinal * 100).toFixed(0)}%). ${evidencias.join(' ')}`;

    return {
      exito: true,
      resultado: {
        esIA,
        confianza: confianzaFinal,
        explicacion,
        evidencias,
        peso,
        herramientasEncontradas: Array.from(herramientasEncontradas),
        contexto: {
          tieneExifCompleto: hasExif && exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : false,
          esCamaraProfesional,
          tieneGPS: hasGPS,
          software: exif.Software || xmp.CreatorTool || null,
          autor: exif.Artist || iptc.CopyrightNotice || null,
          tieneHistorial: Array.isArray(metadatosCompletos?.History) && metadatosCompletos.History.length > 0,
          icc: metadatosCompletos?.ICCProfile || metadatosCompletos?.ProfileDescription || null,
          confianzaHumana,
          puntuacionIA,
          confianzaFinal,
          dimensiones: { ancho, alto }
        }
      },
      metricas: { tiempoMs: 3 }
    };

  } catch (error) {
    console.error('❌ [detectar-herramienta-ia] Error:', error);
    return {
      exito: false,
      error: `Error en detección de herramientas IA: ${error.message}`,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: `Error al analizar herramientas IA: ${error.message}`,
        evidencias: ['Error durante el análisis'],
        peso: 0.5
      },
      metricas: { tiempoMs: 0 }
    };
  }
}