/**
 * analizadorMensajeria.js - DRAGON3 FAANG Enterprise
 * Version: 2.0.0-STD-NATIVE
 * Detección de patrones de compresión de apps de mensajería usando RespuestaStandard.
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp'; // Necesario para metadatos básicos
import dragon from '../../../../utilidades/logger.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';
import { isJpeg, getJpegQuantizationTables, estimateJpegQuality } from '../../../../utilidades/compressionTools.js';

const ANALYZER_ID = 'analizadorMensajeria';
const ANALYZER_VERSION = '2.0.0-STD-NATIVE';
const MODULE_NAME = 'analizadorMensajeria.js';

const CONFIG = {
  MAX_BUFFER_READ: 64 * 1024,
  // Rango de calidad típico de plataformas
  PLATFORMS: {
    WHATSAPP: { minQ: 78, maxQ: 87, name: "WhatsApp" }, // Ampliado
    TELEGRAM: { minQ: 85, maxQ: 92, name: "Telegram" },
    FACEBOOK: { minQ: 70, maxQ: 75, name: "Facebook" },
    INSTAGRAM: { minQ: 78, maxQ: 84, name: "Instagram" },
    TWITTER: { minQ: 65, maxQ: 69, name: "Twitter" }
  }
};

class AnalizadorMensajeria {
    constructor() { this.version = ANALYZER_VERSION; }

    async analizarImagen(params) {
        const t0 = Date.now();
        const { rutaArchivo, archivoId } = params;

        // 1. Inicializar Reporte
        const reporte = new RespuestaStandard(ANALYZER_ID, "Patrones de Mensajería", ANALYZER_VERSION);

        try {
            // Lectura segura del buffer
            let buffer;
            try {
                buffer = await fs.readFile(rutaArchivo);
            } catch (e) {
                return reporte.error("Error leyendo archivo", e.message).cerrar();
            }

            // Detección de Formato (Sharp para metadatos generales)
            let metadata;
            try {
                metadata = await sharp(buffer).metadata();
            } catch (e) {
                return reporte.error("Error leyendo metadatos de imagen", e.message).cerrar();
            }

            // SKIPPED si no es JPEG (Compresión DQT solo aplica a JPEG)
            if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
                // Usamos .skip() correctamente
                reporte.skip(
                    `Análisis DQT solo válido para JPEG. Archivo es ${metadata.format.toUpperCase()}.`,
                    "Indeterminado"
                );
                return reporte.cerrar();
            }

            // Análisis de Tablas DQT
            let tables = null;
            try { tables = getJpegQuantizationTables(buffer); } catch(e) {}

            if (!tables || tables.length === 0) {
                // Si es JPEG pero no tiene tablas, es raro/corrupto
                reporte.definirVoto("Indeterminado", 0.4, 40, "Bajo");
                reporte.concluir(
                    "warning", "⚠️", "Tablas DQT Ausentes",
                    "No se pudieron extraer tablas de cuantificación.",
                    "DQT parsing failed."
                );
                return reporte.cerrar();
            }

            const calidad = estimateJpegQuality(tables);

            // Llenar Datos Visuales
            reporte.agregarDato("Calidad Estimada", `${Math.round(calidad)}%`);
            reporte.setDatosCrudos({ calidad, tablesCount: tables.length, format: metadata.format });

            // --- LÓGICA DE DETECCIÓN DE PLATAFORMA ---
            let plataformaDetectada = null;

            for (const [key, rules] of Object.entries(CONFIG.PLATFORMS)) {
                if (calidad >= rules.minQ && calidad <= rules.maxQ) {
                    plataformaDetectada = rules.name;
                    // No hacemos break para permitir coincidencias múltiples (la última suele ser la más específica)
                    // O si prefieres la primera: break;
                }
            }

            if (plataformaDetectada) {
                // Patrón de mensajería -> Humano (Recomprimido)
                // Se considera "Humano" porque las IAs suelen generar PNGs o JPEGs de alta calidad (95+)
                // y no con la compresión agresiva de WhatsApp.
                reporte.definirVoto("Humano", 0.85, 85, "Alto");
                reporte.activarFlag('autentico');
                reporte.activarFlag('traza_mensajeria');
                reporte.registrarHerramienta(plataformaDetectada, "Mensajería");

                reporte.concluir(
                    "success", "📱", `Patrón ${plataformaDetectada}`,
                    `La compresión (Q=${Math.round(calidad)}) coincide con el estándar de ${plataformaDetectada}.`,
                    `Match Q-Range [${CONFIG.PLATFORMS[plataformaDetectada.toUpperCase()]?.minQ}-${CONFIG.PLATFORMS[plataformaDetectada.toUpperCase()]?.maxQ}]`
                );
            } else {
                // No coincide con patrones conocidos -> Indeterminado/Genérico
                // Calidad muy alta (>95) podría ser IA o Original -> Indeterminado
                // Calidad muy baja (<60) podría ser thumbnail -> Indeterminado

                let explicacion = `Calidad Q=${Math.round(calidad)}. No coincide con firmas específicas de mensajería.`;
                let icono = "📉";

                if (calidad > 95) {
                    explicacion = `Calidad muy alta (Q=${Math.round(calidad)}). Posible original o generación directa.`;
                    icono = "💎";
                }

                reporte.definirVoto("Indeterminado", 0.5, 50, "Bajo");
                reporte.concluir(
                    "info", icono, "Compresión Genérica",
                    explicacion,
                    "Generic Compression"
                );
            }

            dragon.mideRendimiento('analizadorMensajeria_STD', Date.now() - t0, MODULE_NAME, { archivoId });
            return reporte.cerrar();

        } catch (error) {
            dragon.error('Error fatal en Mensajería', MODULE_NAME, 'FATAL_ERROR', { error: error.message });
            return reporte.error("Error analizando mensajería", error.message).cerrar();
        }
    }
}

export default AnalizadorMensajeria;
export const analizadorMensajeriaInstance = new AnalizadorMensajeria();
export const analizarImagen = analizadorMensajeriaInstance.analizarImagen.bind(analizadorMensajeriaInstance);
