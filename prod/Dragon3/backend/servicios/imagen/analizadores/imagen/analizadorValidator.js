/**
 * DRAGON3 FAANG - ANALIZADOR VALIDATOR (FINAL PRODUCTION FIX V7.7)
 * ================================================================
 * Cumple estrictamente con el contrato RespuestaStandard V25.
 * Activa flags 'ia' para Prioridad 1.
 * Corrección V7.7: Manejo robusto de NO-JPEG (PNG, WebP) para evitar crashes.
 */

import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dragon from '../../../../utilidades/logger.js';
import { bufferRead } from '../../../../utilidades/bufferTools.js';
import { isJpeg, getJpegQuantizationTables, estimateJpegQuality } from '../../../../utilidades/compressionTools.js';
import { RespuestaStandard } from '../../../../utilidades/RespuestaStandard.js';

const __filename = fileURLToPath(import.meta.url);
const MODULE_NAME = path.basename(__filename);
const ANALYZER_VERSION = '7.7.0-FAANG-FINAL';

// Huella de ejemplo (nanobanana)
const NANOBANANA_DQT_HASH = "8f3a5c1b9d4e7f0a";

const CONFIG = {
  MAX_BUFFER_READ: 64 * 1024,
  THRESHOLDS: { HIGH: 92, SOCIAL_MIN: 75, SOCIAL_MAX: 90, LOW: 65 }
};

// Función auxiliar para hash
function hashDQT(tables) {
    if (!tables || tables.length === 0) return null;
    const flatValues = tables.map(t => t.join(',')).join('|');
    return crypto.createHash('md5').update(flatValues).digest('hex').substring(0, 16);
}

export async function analizarImagen(params) {
    const t0 = Date.now();
    const { rutaArchivo, archivoId } = params;

    // 1. Instanciar Reporte
    const reporte = new RespuestaStandard("analizadorValidator", "Estructura de Compresión", ANALYZER_VERSION);

    try {
        const buffer = await bufferRead(rutaArchivo, 0, CONFIG.MAX_BUFFER_READ);

        // --- DETECCIÓN DE FORMATO ROBUSTA ---
        // Si NO es JPEG, no podemos analizar tablas de cuantización.
        // Salimos limpiamente (Omitido) sin error.
        if (!isJpeg(buffer)) {
            reporte.definirVoto("Indeterminado", 0.5, 0, "Bajo"); // Peso 0 para no diluir

            // Detectar si es PNG por cabecera
            const isPng = buffer.toString('hex', 0, 8) === '89504e470d0a1a0a';
            const formato = isPng ? "PNG" : "No-JPEG";

            reporte.concluir(
                "info", "ℹ️", "Omitido",
                `Análisis DQT solo válido para JPEG. Archivo es ${formato}.`,
                "Init state."
            );

            const result = reporte.cerrar();
            result.exitoso = true; // ✅ Exitoso porque completó su lógica (decidir no analizar)
            return result;
        }

        // --- ANÁLISIS JPEG ---
        let tables = null;
        try { tables = getJpegQuantizationTables(buffer); } catch(e) {}

        if (!tables || tables.length === 0) {
            // FIX V6.1: Peso ALTO para estructura rota (indicio de manipulación/IA)
            reporte.definirVoto("Artificial", 0.6, 40, "Alto");
            reporte.activarFlag('tiene_edicion');
            reporte.activarFlag('tiene_manipulacion');
            reporte.concluir(
                "warning", "💔", "Estructura Rota",
                "El archivo JPEG tiene una estructura de compresión anómala o ilegible.",
                "Tablas DQT no encontradas."
            );
            const result = reporte.cerrar();
            result.exitoso = true;
            return result;
        }

        const calidad = estimateJpegQuality(tables);
        const dqtHash = hashDQT(tables);
        const hexHead = buffer.toString('hex', 0, 4096);
        const isAdobe = hexHead.includes('3c3f7877') || hexHead.includes('Adobe');

        // 2. Llenar Datos Visuales Standard
        reporte.agregarDato("Calidad Estimada", `${Math.round(calidad)}%`);
        reporte.agregarDato("Firma DQT", dqtHash);

        reporte.setDatosCrudos({ calidad, dqtHash, isAdobe, tablesCount: tables.length });

        // --- ÁRBOL DE DECISIÓN (AJUSTADO A V6.1) ---

        if (dqtHash === NANOBANANA_DQT_HASH) {
            reporte.definirVoto("Artificial", 0.99, 100, "Critico");
            reporte.activarFlag('ia');
            reporte.registrarHerramienta("nanobanana", "Generador IA");

            reporte.concluir(
                "danger", "🤖", "Firma IA Detectada",
                "La estructura de compresión coincide exactamente con un generador de IA conocido.",
                `Match DQT: ${dqtHash} (nanobanana)`
            );
        }
        else if (isAdobe) {
            // FIX V6.1: Adobe es Humano/Editado con peso ALTO
            reporte.definirVoto("Editado", 0.85, 70, "Alto");
            reporte.activarFlag('tiene_edicion');
            reporte.registrarHerramienta("Adobe Photoshop/Lightroom", "Editor");

            reporte.concluir(
                "info", "🎨", "Edición Adobe",
                "Se detectaron marcadores de edición de Adobe en la cabecera.",
                "Hex signature: Adobe/Ducky"
            );
        }
        else if (calidad >= CONFIG.THRESHOLDS.HIGH) {
            // Alta calidad -> Compatible con cámara, peso ALTO hacia humano
            reporte.definirVoto("Humano", 0.90, 90, "Alto");
            reporte.activarFlag('autentico');
            reporte.activarFlag('camara');

            reporte.concluir(
                "success", "📸", "Alta Fidelidad",
                `Compresión mínima (Q=${Math.round(calidad)}), consistente con originales de cámara.`,
                "High Quality DQT Table"
            );
        }
        else if (calidad >= CONFIG.THRESHOLDS.SOCIAL_MIN && calidad < CONFIG.THRESHOLDS.SOCIAL_MAX) {
            // Redes sociales -> Humano, peso ALTO (difícil de imitar perfecto por IA)
            reporte.definirVoto("Humano", 0.85, 75, "Alto");
            reporte.activarFlag('autentico');
            reporte.activarFlag('traza_mensajeria');

            reporte.concluir(
                "success", "📱", "Recompresión Social",
                "Patrón de compresión típico de redes sociales o mensajería.",
                `Social Range Q=${Math.round(calidad)}`
            );
        }
        else {
            // Calidad baja genérica -> Indeterminado/Bajo
            reporte.definirVoto("Indeterminado", 0.5, 50, "Bajo");
            reporte.concluir(
                "warning", "📉", "Calidad Baja",
                "Compresión genérica o de baja calidad. Origen ambiguo.",
                `Low Quality Q=${Math.round(calidad)}`
            );
        }

        dragon.mideRendimiento('analizadorValidator_FINAL', Date.now() - t0, MODULE_NAME, { archivoId });

        const final = reporte.cerrar();
        final.exitoso = true; // 🔥 CRÍTICO: Para el conteo
        return final;

    } catch (error) {
        // FIX: Usar agoniza en lugar de error y devolver resultado neutro seguro
        const mensajeError = error.message || "Error desconocido";
        dragon.agoniza(`[${MODULE_NAME}] Error controlado: ${mensajeError}`, error, MODULE_NAME, "VALIDATOR_ERROR");

        // Devolvemos un reporte de error "suave" para no romper la cadena de fusión
        return reporte
            .definirVoto("Indeterminado", 0.5, 0, "Bajo") // Peso nulo
            .concluir("warning", "⚠️", "Error Interno", `Fallo técnico en validator: ${mensajeError}`)
            .cerrar();
    }
}

export default { analizarImagen };
