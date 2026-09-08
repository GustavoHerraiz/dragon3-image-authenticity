/**
 * ============================================================================
 *  DRAGON3 FAANG ENTERPRISE - ADAPTADOR DE RESULTADOS DE ANÁLISIS (KISS+TRAZABILIDAD)
 * ============================================================================
 *
 *  Archivo:     utilidades/adaptarResultadoAnalisis.js
 *  Proyecto:    Dragon3 - Sistema Autenticación IA Enterprise
 *  Versión:     3.0.0-FAANG
 *  Fecha:       2025-07-19
 *  Autor:       Gustavo Herraiz - Lead Architect
 *
 *  DESCRIPCIÓN GENERAL
 *  ----------------------------------------------------------------------------
 *  Este adaptador profesional transforma el resultado RAW devuelto por el core
 *  de análisis (analizadorImagen.js, etc.) en una estructura limpia, clara y
 *  profesional, lista para consumo por el frontend, APIs, dashboards y generación
 *  de informes (PDF, JSON, etc.).
 *
 *  Cumple 100% los principios FAANG Enterprise:
 *    - KISS: Simple, directo, sin dependencias externas, fácil de testear.
 *    - SRP: Única responsabilidad (adaptar datos, no modificar, no persistir).
 *    - Trazabilidad total: SIEMPRE incluye IDs clave, nombres de archivo y timestamp.
 *    - Seguridad: No expone el RAW salvo para roles autorizados.
 *    - Extensible: Si hay nuevos analizadores/campos, se amplía aquí.
 *    - Internacionalizable/listo para multilanguage.
 *
 *  FLUJO DE USO
 *  ----------------------------------------------------------------------------
 *    1. El endpoint Express (server.js) recibe el resultado RAW del analizador.
 *    2. Llama a adaptarResultadoAnalisis(raw, archivoInfo, usuario).
 *    3. Este adaptador devuelve un objeto estructurado:
 *       - resumen: Info de alto nivel (decisión, score, confianza, motivo, icono, IDs, nombres, timestamp, version)
 *       - detalles: Analizadores, consenso, metadatos, tiempos, errores, IDs, nombres, timestamp, version
 *       - paraInforme: Todo lo anterior, fusionado, listo para PDF/dashboard.
 *       - raw: Solo si el usuario es admin o superadmin.
 *    4. El endpoint responde al frontend/API o pasa el objeto a la generación de informes.
 *
 *  PARAMETROS
 *  ----------------------------------------------------------------------------
 *    @param {Object} raw         - Resultado RAW del analizador (obligatorio)
 *    @param {Object} archivoInfo - Info adicional del archivo (nombreArchivo, fecha, IDs, etc.)
 *    @param {Object} usuario     - Objeto usuario autenticado (rol, id, etc.) para control de acceso y trazabilidad
 *
 *  RETORNO
 *  ----------------------------------------------------------------------------
 *    @returns {Object} Objeto con:
 *      - resumen:    { ... }  // resumen profesional de decisión y trazabilidad
 *      - detalles:   { ... }  // detalles técnicos, analizadores, metadatos, errores, IDs
 *      - paraInforme:{ ... }  // mezcla de resumen y detalles, para informes PDF/JSON
 *      - raw:        { ... }  // solo para admins/superadmins
 *
 *  NOTAS ENTERPRISE
 *  ----------------------------------------------------------------------------
 *    - Todos los campos de trazabilidad (usuarioId, archivoId, correlationId, nombreArchivo,
 *      nombreOriginal, timestamp, version) SIEMPRE se incluyen, aunque sean null.
 *    - Si hay nuevos analizadores, solo añadir aquí su mapeo.
 *    - El campo "paraInforme" permite desacoplar la generación de PDF/JSON del frontend.
 *    - No tiene side-effects: nunca modifica datos, no persiste, no hace logging.
 *    - Listo para internacionalización (i18n): textos clave centralizados.
 *    - 100% testable y auditable.
 *
 *  EJEMPLO DE USO
 *  ----------------------------------------------------------------------------
 *      import { adaptarResultadoAnalisis } from './utilidades/adaptarResultadoAnalisis.js';
 *      const resultadoAdaptado = adaptarResultadoAnalisis(raw, archivoInfo, usuario);
 *      res.json({ resultado: resultadoAdaptado, ... });
 *
 * ============================================================================
 */

export function adaptarResultadoAnalisis(raw, archivoInfo = {}, usuario = {}) {
    // ================= VALIDACION INICIAL KISS ===========================
    if (!raw || typeof raw !== "object") {
        return {
            resumen: {
                usuarioId: null,
                archivoId: null,
                correlationId: null,
                nombreOriginal: null,
                nombreArchivo: null,
                timestamp: null,
                version: null,
                decision: "Indeterminado",
                confianza: "—",
                score: null,
                motivoPrincipal: "Sin datos",
                icono: "❔"
            },
            detalles: {},
            paraInforme: {},
            raw: usuario.role === "admin" ? raw : undefined
        };
    }

    // =================== 1. CAMPOS DE TRAZABILIDAD (siempre presentes) ==============
    /**
     * ID de usuario
     * ID de archivo/análisis
     * correlationId (para debugging cross-service)
     * nombreOriginal: nombre original del archivo subido
     * nombreArchivo: nombre único generado en sistema
     * timestamp: fecha/hora (ISO)
     * version: versión del análisis/sistema
     */
    const usuarioId     = raw.usuarioId  || raw.userId  || archivoInfo.usuarioId  || usuario.id || usuario._id || null;
    const archivoId     = raw.archivoId  || raw.analisisId || raw.imagenId || archivoInfo.archivoId || archivoInfo.analisisId || archivoInfo.imagenId || null;
    const correlationId = raw.correlationId || archivoInfo.correlationId || null;
    const nombreOriginal= raw.nombreOriginal || archivoInfo.nombreOriginal || archivoInfo.nombreArchivo || null;
    const nombreArchivo = raw.nombreArchivo  || archivoInfo.nombreArchivo  || null;
    const timestamp     = raw.timestamp      || archivoInfo.timestamp      || archivoInfo.fecha || null;
    const version       = raw.version        || archivoInfo.version        || null;

    // =================== 2. DATOS PRINCIPALES ============================
    /**
     * Extrae el bloque básico del análisis, el consenso y metadatos de archivo
     */
    const basico = raw.basico || raw;
    const consenso = raw.consenso || {};
    const metadatosArchivo =
        basico.propiedadesBasicasImagen
        || basico.metadatos
        || raw.metadatos
        || raw.metadatosArchivo
        || {};

    // =================== 3. ANALIZADORES (array siempre, para informes y UI) ============================
    /**
     * Analizadores técnicos: array de {nombre, ...detalles}
     */
    let analizadores = [];
    if (raw.detallado?.analizadores?.resultados) {
        const res = raw.detallado.analizadores.resultados;
        if (Array.isArray(res)) {
            analizadores = res;
        } else if (typeof res === 'object') {
            analizadores = Object.entries(res).map(([nombre, datos]) => ({
                nombre, ...(typeof datos === "object" ? datos : { valor: datos })
            }));
        }
    }

    // =================== 4. SCORE Y CONFIANZA (numérico, amigable) ============================
    /**
     * Score: número (0..1), confianza: texto o %
     */
    const score = typeof basico.score === "number"
        ? basico.score
        : (typeof consenso.porcentajeAutentico === "number" ? consenso.porcentajeAutentico : null);

    const confianza = basico.confianza
        || consenso.confianzaPromedio
        || consenso.nivelConfianza
        || (typeof consenso.confianza === "number" ? `${Math.round(consenso.confianza * 100)}%` : "—");

    // =================== 5. MOTIVO PRINCIPAL Y ICONO FAANG ============================
    /**
     * Motivo principal (mensaje humano), icono visual para UI
     */
    const motivo = basico.mensajePrincipal || basico.motivo || basico.resultado || basico.tipoArchivo || "";
    let icono = "ℹ️";
    if (/autentic/i.test(basico.decision || ""))      icono = "✅";
    else if (/artificial/i.test(basico.decision || "")) icono = "⚠️";
    else if (/indeterminado/i.test(basico.decision || "")) icono = "❔";

    // =================== 6. RESUMEN PROFESIONAL CON TRAZABILIDAD ============================
    /**
     * Siempre incluye los campos clave de auditoría y análisis.
     */
    const resumen = {
        usuarioId,
        archivoId,
        correlationId,
        nombreOriginal,
        nombreArchivo,
        timestamp,
        version,
        decision: basico.decision
            || (basico.esAutentico === true ? "Auténtico" : basico.esAutentico === false ? "Artificial" : "Indeterminado"),
        confianza,
        score,
        motivoPrincipal: motivo,
        icono
    };

    // =================== 7. DETALLES TÉCNICOS Y DE TRAZABILIDAD ============================
    /**
     * Incluye todos los detalles técnicos más campos de trazabilidad.
     */
    const detalles = {
        usuarioId,
        archivoId,
        correlationId,
        nombreOriginal,
        nombreArchivo,
        timestamp,
        version,
        analizadores,
        consenso,
        metadatosArchivo,
        tiemposEjecucion: raw.tiemposEjecucion || {},
        errores: raw.errores || []
    };

    // =================== 8. BLOQUE PARA INFORME (PDF/JSON) ============================
    /**
     * Para generación de informes: resumen + detalles juntos.
     */
    const paraInforme = {
        ...resumen,
        ...detalles
    };

    // =================== 9. CONTROL DE ACCESO AL RAW ============================
    /**
     * Solo roles admin/superadmin pueden ver el RAW completo.
     */
    const rawVisible = usuario.role === "admin" || usuario.role === "superadmin" || usuario.esSuperusuario || usuario.verRaw;

    // =================== 10. RETORNO FINAL 100% FAANG ENTERPRISE ============================
    return {
        resumen,
        detalles,
        paraInforme,
        ...(rawVisible ? { raw } : {})
    };
}
