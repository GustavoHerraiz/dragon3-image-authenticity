/**
 * 🏭 DRAGON3 - STANDARD RESPONSE BUILDER (V25 - FINAL PRODUCTION)
 * ------------------------------------------------------------------
 * Clase maestra para estandarizar la comunicación entre:
 * Analizadores -> analizadorImagen.js -> server.js -> Frontend
 */

export class RespuestaStandard {
    constructor(idAnalizador, nombreUI, versionAnalizador) {
        this.response = {
            // METADATOS SISTEMA
            meta: {
                id: idAnalizador,
                nombre: nombreUI,
                version: versionAnalizador || '1.0.0',
                ts_start: Date.now(),
                ts_end: null,
                ms: 0
            },

            // EL VOTO DEL JURADO (Para el Consenso)
            evaluacion: {
                veredicto: "Indeterminado", // Humano, IA, Editado, Incierto, Error
                confianza: 0.0,             // 0.0 a 1.0 (Probabilidad)
                score_logico: 0,            // 0 a 100 (Fuerza de la evidencia técnica)
                peso: "Bajo",               // Crítico, Alto, Medio, Bajo
                modo_fallo: null
            },

            // INTELIGENCIA DE NEGOCIO (Flags)
            flags: {
                es_ia: false,
                tiene_edicion: false,
                tiene_manipulacion: false,
                es_autentico: false,
                origen_camara: false,
                traza_mensajeria: false
            },

            // NARRATIVA (Frontend)
            narrativa: {
                estado: "skipped", // success, warning, danger, info, skipped
                icono: "⚪",
                titulo: "Pendiente",
                explicacion_humana: "Análisis no realizado.",
                explicacion_tecnica: "Init state."
            },

            // FICHA TÉCNICA (Datos Visuales)
            evidencia_visual: {},

            // CAJA NEGRA (Datos Crudos)
            forense: {
                herramientas: [],
                compresion: [],
                raw_data: null
            }
        };
    }

    /**
     * ⚖️ DEFINIR EL VOTO FORENSE
     */
    definirVoto(veredicto, confianza, score, peso) {
        this.response.evaluacion.veredicto = veredicto;
        this.response.evaluacion.confianza = confianza;
        this.response.evaluacion.score_logico = score;
        this.response.evaluacion.peso = peso;
        return this; // Permite encadenar (chaining)
    }

    /**
     * 🗣️ NARRATIVA PARA EL USUARIO
     */
    concluir(estado, icono, titulo, humano, tecnico) {
        this.response.narrativa = {
            estado, icono, titulo,
            explicacion_humana: humano,
            explicacion_tecnica: tecnico
        };
        return this;
    }

    /**
     * ❌ REGISTRAR ERROR (CRÍTICO: Faltaba este método)
     * Permite a los analizadores reportar fallos sin romper la ejecución.
     */
    error(mensajeHumano, errorTecnico = null) {
        this.response.evaluacion.veredicto = "Error";
        this.response.evaluacion.confianza = 0.0;
        this.response.evaluacion.score_logico = 0;
        this.response.evaluacion.peso = "Bajo";

        this.response.narrativa = {
            estado: "danger",
            icono: "💥",
            titulo: "Error Interno",
            explicacion_humana: mensajeHumano || "Ha ocurrido un error técnico.",
            explicacion_tecnica: errorTecnico || mensajeHumano
        };
        // CRÍTICO: Retornamos 'this' para que se pueda hacer .error(...).cerrar()
        return this;
    }

    /**
     * ⏭️ SALTAR ANÁLISIS (CRÍTICO: Arreglado chaining)
     */
    skip(razon, veredicto = "No Aplica") {
        this.response.narrativa.estado = "skipped";
        this.response.narrativa.titulo = "Omitido";
        this.response.narrativa.explicacion_humana = razon;
        this.response.evaluacion.veredicto = veredicto;
        this.response.evaluacion.peso = "Bajo";
        // CRÍTICO: Retornamos 'this' para que se pueda hacer .skip(...).cerrar()
        return this;
    }

    /**
     * 🚩 ACTIVAR FLAGS DE NEGOCIO
     */
    activarFlag(tipo) {
        const f = this.response.flags;
        if (tipo === 'ia') f.es_ia = true;
        if (tipo === 'edicion') f.tiene_edicion = true;
        if (tipo === 'manipulacion') f.tiene_manipulacion = true;
        if (tipo === 'autentico') f.es_autentico = true;
        if (tipo === 'camara') f.origen_camara = true;
        if (tipo === 'mensajeria') f.traza_mensajeria = true;
        return this;
    }

    /**
     * 🔧 REGISTRAR HERRAMIENTA DETECTADA
     */
    registrarHerramienta(nombre, categoria, confianza = "Alta") {
        if (!nombre) return this;
        this.response.forense.herramientas.push({ nombre, categoria, confianza });

        if (categoria !== 'Desconocido') {
            const mapKey = { 'Cámara': 'Dispositivo', 'Mensajería': 'Plataforma' };
            const key = mapKey[categoria] || 'Software';
            const actual = this.response.evidencia_visual[key];
            this.response.evidencia_visual[key] = actual ? `${actual} + ${nombre}` : nombre;
        }
        return this;
    }

    /**
     * 🔢 AGREGAR DATO VISUAL
     */
    agregarDato(clave, valor, unidad = "") {
        if (valor !== null && valor !== undefined) {
            this.response.evidencia_visual[clave] = `${valor}${unidad}`;
        }
        return this;
    }

    /**
     * 💾 GUARDAR DATOS CRUDOS (Alias setDatosCrudos)
     */
    setDatosCrudos(data) {
        try {
            this.response.forense.raw_data = JSON.parse(JSON.stringify(data));
        } catch(e) { this.response.forense.raw_data = "Error serializando datos crudos"; }
        return this;
    }

    /**
     * 💾 ALIAS COMPATIBILIDAD MBH (datosForenses -> setDatosCrudos)
     */
    datosForenses(score, msg, data) {
        // MBH usa datosForenses(score, msg, data)
        // Lo adaptamos para no romper MBH
        if (score) this.response.evaluacion.score_logico = score;
        if (msg) this.response.narrativa.explicacion_tecnica = msg;
        if (data) this.setDatosCrudos(data);
        return this;
    }

    /**
     * 🏁 CERRAR Y ENTREGAR
     */
    cerrar() {
        this.response.meta.ts_end = Date.now();
        this.response.meta.ms = this.response.meta.ts_end - this.response.meta.ts_start;
        return this.response;
    }

    /**
     * 🔄 STATIC: NORMALIZADOR UNIVERSAL
     * Transforma cualquier respuesta (Standard, Legacy, Error) para que el Frontend la entienda.
     */
    static normalizar(nombreAnalizador, data) {
        // 1. Caso de Error o Null
        if (!data || data.error || data.exitoso === false) {
            return {
                id: nombreAnalizador,
                nombre_ui: nombreAnalizador.replace('analizador', '').toUpperCase(),
                status: "error",
                score: 0,
                decision: "Error",
                confianza: 0,
                explicacion: data?.error || "Error interno del analizador",
                icono: "❌",
                detalles: null
            };
        }

        // 2. Extracción Inteligente (Busca en formato Nuevo y Viejo)
        let score = 0;
        if (data.evaluacion?.score_logico !== undefined) score = data.evaluacion.score_logico;
        else if (data.score !== undefined) score = data.score;
        else if (data.resultado?.score !== undefined) score = data.resultado.score;

        let decision = "Indeterminado";
        if (data.evaluacion?.veredicto) decision = data.evaluacion.veredicto;
        else if (data.resumen?.decision) decision = data.resumen.decision;
        else if (data.resultado?.veredicto) decision = data.resultado.veredicto;
        else if (data.esAutentico === false) decision = "Posible Edición";
        else if (data.esAutentico === true) decision = "Humano";

        let explicacion = "Sin detalles.";
        if (data.narrativa?.explicacion_humana) explicacion = data.narrativa.explicacion_humana;
        else if (data.resumen?.motivo) explicacion = data.resumen.motivo;
        else if (data.mensaje) explicacion = data.mensaje;

        // 3. Retorno Estandarizado para Frontend
        return {
            id: nombreAnalizador,
            nombre_ui: data.meta?.nombre || nombreAnalizador.replace('analizador', ''),
            status: "success",
            score: Number(score),
            decision: decision,
            confianza: data.evaluacion?.confianza || data.confianza || 0.5,
            explicacion: explicacion,
            icono: data.narrativa?.icono || (score > 80 ? "✅" : "⚠️"),
            raw: data // Mantiene datos originales
        };
    }
}
