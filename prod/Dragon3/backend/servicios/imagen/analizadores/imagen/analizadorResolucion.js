/**
 * DRAGON3 FAANG - ANALIZADOR RESOLUCIÓN (FINAL FIX V3.9)
 * ======================================================
 * - Fallback a Sharp si EXIF falla.
 * - Flag 'exitoso: true' explícito.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import exifr from 'exifr';
import sharp from 'sharp'; // 🛠️ CRÍTICO: Fallback robusto
import dragon from '../../../../utilidades/logger.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ANALYZER_VERSION = '3.9.0-FAANG-FINAL';
const MODULE_NAME = 'analizadorResolucion';

const CONFIG = {
  resolucionBuena: 2000 * 1500,     // ~3MP
  resolucionExcelente: 4000 * 3000, // ~12MP
  tolerancia: 0.05,
  timeoutMs: 2000
};

function clasificarProporcion(proporcion) {
  if (!proporcion) return "Desconocida";
  
  // [ME] Cálculo de ratios decimales (ancho/alto o alto/ancho)
  const p = proporcion > 1 ? proporcion : 1 / proporcion; 

  if (Math.abs(p - 1) <= CONFIG.tolerancia) return "Cuadrada (1:1)";
  if (Math.abs(p - 1.77) <= CONFIG.tolerancia) return "Panorámica (16:9)";
  if (Math.abs(p - 1.33) <= CONFIG.tolerancia) return "Clásica (4:3)";
  if (Math.abs(p - 1.5) <= CONFIG.tolerancia) return "Fotográfica (3:2)";
  
  // [FIX] Soporte para 946x2048 (Ratio ~2.16) y Ultra-Wide
  if (Math.abs(p - 2.16) <= CONFIG.tolerancia) return "Smartphone Full (19.5:9)";
  if (Math.abs(p - 2.33) <= CONFIG.tolerancia) return "Ultra-Wide (21:9)";

  return "Proporción atípica";
}

export const version = ANALYZER_VERSION;

export async function analizarImagen(params) {
  const t0 = Date.now();
  const { rutaArchivo, archivoId } = params;
  const reporte = new RespuestaStandard("analizadorResolucion", "Resolución y Aspecto", ANALYZER_VERSION);

  if (!rutaArchivo || !existsSync(rutaArchivo)) return reporte.error("Archivo no encontrado").cerrar();

  try {
    const buffer = await fs.readFile(rutaArchivo);

    // 1. INTENTO 1: EXIFR (Metadatos)
    let metadatos = {};
    try {
        metadatos = await Promise.race([
            exifr.parse(buffer, true),
            new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), CONFIG.timeoutMs))
        ]);
    } catch (e) { /* Ignorar fallo EXIF */ }

    // 2. INTENTO 2: SHARP (Estructura real)
    let ancho = metadatos?.ImageWidth || metadatos?.ExifImageWidth;
    let alto = metadatos?.ImageHeight || metadatos?.ExifImageHeight;

    if (!ancho || !alto) {
        try {
            const metaSharp = await sharp(buffer).metadata();
            ancho = metaSharp.width;
            alto = metaSharp.height;
        } catch (e) { /* Falló todo */ }
    }

    if (!ancho || !alto) {
        reporte.definirVoto("Indeterminado", 0.2, 20, "Bajo");
        reporte.concluir("warning", "⚠️", "Dimensiones Desconocidas", "Imposible leer dimensiones.");
        const result = reporte.cerrar();
        result.exitoso = true; // Para que no cuente como crash
        return result;
    }

    // --- LÓGICA DE NEGOCIO ---
    const area = ancho * alto;
    const megapixeles = (area / 1000000).toFixed(1);
    const proporcion = ancho / alto;
    const tipoProporcion = clasificarProporcion(proporcion);

    reporte.agregarDato("Resolución", `${ancho}x${alto} px`);
    reporte.agregarDato("Megapíxeles", `${megapixeles} MP`);
    reporte.agregarDato("Relación de Aspecto", tipoProporcion);

    if (metadatos?.Make) reporte.agregarDato("Fabricante", metadatos.Make);

    let veredicto = "Indeterminado";
    let score = 50;
    let confianza = 0.5;
    let explicacion = `Imagen de ${megapixeles} MP (${tipoProporcion}).`;

    if (area >= CONFIG.resolucionExcelente) {
        veredicto = "Humano"; score = 85; confianza = 0.85; reporte.activarFlag('autentico');
        explicacion += " Resolución excelente, consistente con captura de cámara moderna.";
    } else if (area >= CONFIG.resolucionBuena) {
        veredicto = "Humano"; score = 65; confianza = 0.65;
        explicacion += " Resolución estándar aceptable.";
    } else {
        veredicto = "Indeterminado"; score = 40; confianza = 0.4;
        explicacion += " Baja resolución, posible miniatura o recorte.";
    }

    // --- AJUSTE DE PENALIZACIÓN DB3 ---
    // Solo penaliza si es realmente atípica, no si es un ratio de smartphone conocido.
    if (tipoProporcion === "Proporción atípica") {
        score -= 15;
        reporte.activarFlag('tiene_edicion');
        reporte.activarFlag('tiene_manipulacion');
        explicacion += " Proporción no estándar detectada (posible recorte manual).";
    } else if (tipoProporcion.includes("Smartphone")) {
        // [RS] Si es smartphone, subimos confianza aunque la resolución sea vertical
        score += 5; 
        explicacion += " Proporción nativa de dispositivo móvil detectada.";
    }
    reporte.definirVoto(veredicto, confianza, score, "Medio");

    const icono = score > 60 ? "📏" : "⚠️";
    const estado = score > 60 ? "success" : "warning";

    reporte.concluir(estado, icono, `${megapixeles} MP (${tipoProporcion})`, explicacion);
    reporte.setDatosCrudos({ ancho, alto, proporcion, make: metadatos?.Make });

    dragon.mideRendimiento('analizadorResolucion_FIX', Date.now() - t0, MODULE_NAME, { archivoId });

    const final = reporte.cerrar();
    final.exitoso = true; // 🔥 CRÍTICO
    return final;

  } catch (error) {
    dragon.agoniza('Error en Resolución', error, MODULE_NAME, 'ERROR_FATAL');
    return reporte.error("Error técnico", error.message).cerrar();
  }
}

export default analizarImagen;
