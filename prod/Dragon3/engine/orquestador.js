/**
 * orquestador.js
 *
 * Motor principal que ejecuta un plan de células.
 * Soporta colas para operaciones pesadas (usando Bull) para no bloquear el event loop.
 *
 * VERSIÓN 2.1 - CON PARALELISMO INTELIGENTE Y TELEMETRÍA COMPLETA
 * ================================================================
 *
 * MEJORAS v2.1:
 * - Ahora incluye `datosCompletos` en la telemetría para que el watcher pueda
 *   extraer la confianza y decisión de cada célula correctamente.
 * - Cada entrada de telemetría incluye el objeto completo de la célula.
 * - Mantiene todas las funcionalidades anteriores intactas.
 *
 * MEJORAS v2.0:
 * - Detección automática de células independientes (solo dependen de cargar-imagen)
 * - Ejecución en paralelo de células independientes (Promise.all)
 * - Mantiene orden secuencial para células con dependencias
 * - Telemetría completa con tiempos reales
 *
 * PRINCIPIOS: KISS, secuencial cuando es necesario, paralelo cuando es posible.
 *
 * @module orquestador
 * @version 2.1.0
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { createRequire } from 'module';
import crypto from 'crypto';
import { agregarCelulaAlCatalogo } from './catalogo.js';
import { getCola } from './cola.js';

const require = createRequire(import.meta.url);
const get = require('lodash.get');

class Orquestador {
  /**
   * @param {string|Object} rutaPlanOrObject - Ruta al archivo JSON o objeto plan.
   */
  constructor(rutaPlanOrObject) {
    let plan;
    if (typeof rutaPlanOrObject === 'string') {
      try {
        const planContent = fs.readFileSync(rutaPlanOrObject, 'utf8');
        plan = JSON.parse(planContent);
        console.log(`📄 Plan cargado desde archivo: ${rutaPlanOrObject}`);
      } catch (error) {
        throw new Error(`Error al leer el plan desde "${rutaPlanOrObject}": ${error.message}`);
      }
    } else if (typeof rutaPlanOrObject === 'object' && rutaPlanOrObject !== null) {
      plan = rutaPlanOrObject;
      console.log(`📦 Plan recibido como objeto: "${plan.nombre || 'sin nombre'}"`);
    } else {
      throw new Error('El orquestador debe recibir una ruta (string) o un objeto plan.');
    }

    // Validaciones básicas
    if (!plan || typeof plan !== 'object') throw new Error('El plan debe ser un objeto válido.');
    if (!plan.células || !Array.isArray(plan.células) || plan.células.length === 0) {
      throw new Error('El plan debe contener un array "células" no vacío.');
    }
    if (!plan.salidaFinal) throw new Error('El plan debe tener una propiedad "salidaFinal".');

    this.plan = plan;
    this.contexto = {};
    this.resultados = {};
    this.telemetria = [];
    this.correlationId = crypto.randomUUID();
    this.rutaSalida = path.resolve('./salida');

    // Asegurar que la carpeta de salida existe
    if (!fs.existsSync(this.rutaSalida)) {
      fs.mkdirSync(this.rutaSalida, { recursive: true });
    }

    // Validar rutas de células (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      for (const celula of this.plan.células) {
        if (!celula.ruta) {
          console.warn(`⚠️ La célula "${celula.id}" no tiene ruta definida.`);
          continue;
        }
        const rutaAbsoluta = path.resolve(celula.ruta);
        if (!fs.existsSync(rutaAbsoluta)) {
          console.warn(`⚠️ La ruta de la célula "${celula.id}" no existe: ${rutaAbsoluta}`);
        }
      }
    }

    console.log(`✅ Orquestador inicializado con plan: "${this.plan.nombre || 'sin nombre'}"`);
    console.log(`   Células: ${this.plan.células.map(c => c.id).join(', ')}`);
  }

  /**
   * Ejecuta el plan de forma inteligente:
   * - Fase 1: cargar-imagen (si existe) - SECUENCIAL
   * - Fase 2: células independientes (solo dependen de cargar-imagen) - PARALELO
   * - Fase 3: células con dependencias - SECUENCIAL
   *
   * @param {Object} entradaInicial - Datos de entrada (archivo, agenteId, etc.)
   * @returns {Promise<Object>} Resultado final, telemetría y métricas.
   */
  async ejecutar(entradaInicial) {
    const inicio = performance.now();
    this.contexto = this._clonarProfundo(entradaInicial) || {};
    this.resultados = {};
    this.telemetria = [];

    console.log(`🚀 Iniciando plan "${this.plan.nombre}" (correlationId: ${this.correlationId})`);

    // ============================================================
    // FASE 1: Identificar tipos de células
    // ============================================================

    const celulas = this.plan.células;

    // 1.1. Buscar cargar-imagen (si existe)
    const celulaCargar = celulas.find(c => c.id === 'cargar-imagen');

    // 1.2. Células que dependen SOLO de cargar-imagen (se pueden paralelizar)
    const celulasIndependientes = celulas.filter(c =>
      c.id !== 'cargar-imagen' &&
      c.id !== 'extraer-metadatos-exif' &&
      c.id !== 'detectar-herramienta-ia' &&
      c.id !== 'detectar-consistencia-multimodal' &&
      c.id !== 'generar-veredicto'
    );

    // 1.3. Células que dependen de otras (ejecución secuencial)
    const celulasDependientes = celulas.filter(c =>
      c.id === 'extraer-metadatos-exif' ||
      c.id === 'detectar-herramienta-ia' ||
      c.id === 'detectar-consistencia-multimodal' ||
      c.id === 'generar-veredicto'
    );

    console.log(`📊 Estrategia de ejecución:`);
    console.log(`   📦 cargar-imagen: secuencial (${celulaCargar ? '✅' : '❌ no existe'})`);
    console.log(`   ⚡ Paralelo: ${celulasIndependientes.map(c => c.id).join(', ')}`);
    console.log(`   🔗 Secuencial: ${celulasDependientes.map(c => c.id).join(', ')}`);

    // ============================================================
    // FASE 2: Ejecutar cargar-imagen (si existe)
    // ============================================================

    if (celulaCargar) {
      console.log(`📦 [cargar-imagen] Ejecutando (secuencial)...`);
      await this._ejecutarCelula(celulaCargar);
    }

    // ============================================================
    // FASE 3: Ejecutar células independientes en PARALELO
    // ============================================================

    if (celulasIndependientes.length > 0) {
      console.log(`⚡ Ejecutando ${celulasIndependientes.length} células en PARALELO...`);

      // Crear promesas para todas las células independientes
      const promesas = celulasIndependientes.map(celula =>
        this._ejecutarCelula(celula)
          .catch(error => {
            console.error(`❌ Error en célula paralela "${celula.id}":`, error.message);
            // No propagar el error para que las demás sigan ejecutándose
            // (a menos que el plan indique detenerse en error)
            if (this.plan.detenerseEnError === true) {
              throw error;
            }
            return null;
          })
      );

      // Esperar a que TODAS terminen
      await Promise.all(promesas);
      console.log(`✅ Todas las células paralelas completadas.`);
    }

    // ============================================================
    // FASE 4: Ejecutar células dependientes en SECUENCIA
    // ============================================================

    if (celulasDependientes.length > 0) {
      console.log(`🔗 Ejecutando ${celulasDependientes.length} células en SECUENCIA...`);
      for (const celula of celulasDependientes) {
        await this._ejecutarCelula(celula);
      }
    }

    // ============================================================
    // FASE 5: Resolver salida final y generar telemetría
    // ============================================================

    const salidaFinal = this._resolverReferencias(this.plan.salidaFinal);
    const tiempoTotal = performance.now() - inicio;

    // Generar nueva célula (Fase 2)
    // await this._generarNuevaCelula(tiempoTotal); // DESACTIVADO TEMPORALMENTE

    console.log(`🏁 Plan finalizado en ${tiempoTotal.toFixed(2)}ms`);

    return {
      resultado: salidaFinal,
      telemetria: this.telemetria,
      tiempoTotal,
      correlationId: this.correlationId
    };
  }

  /**
   * Ejecuta una célula individual (con soporte de cola para operaciones pesadas).
   *
   * @param {Object} celula - Definición de la célula del plan.
   * @returns {Promise<void>}
   */
  async _ejecutarCelula(celula) {
    const t0 = performance.now();
    try {
      // 1. Resolver referencias en la entrada
      const entradaResuelta = this._resolverReferencias(celula.entrada);

      // 2. Determinar si esta célula requiere cola (operaciones pesadas con sharp)
      const usaCola = process.env.USE_CELL_QUEUE === 'true';
      console.log(`🔍 [${celula.id}] usaCola: ${usaCola}`);

      let salida;
      if (usaCola) {
        console.log(`🐂 [${celula.id}] ENCOLANDO...`);
        const cola = getCola();
        console.log(`🐂 [${celula.id}] Cola obtenida: ${cola ? 'OK' : 'FALLO'}`);
        const job = await cola.add('procesar-celula', {
          celulaId: celula.id,
          ruta: celula.ruta,
          entrada: entradaResuelta,
          contexto: this.contexto
        });
        console.log(`📨 [${celula.id}] Trabajo encolado (job ID: ${job.id})`);
        salida = await job.finished();
        console.log(`✅ [${celula.id}] Trabajo completado (job ID: ${job.id})`);
      } else {
        console.log(`⚡ [${celula.id}] Ejecutando DIRECTAMENTE (sin cola)`);
        const modulo = await import(path.resolve(celula.ruta));
  const fs = require("fs");
  fs.appendFileSync("/tmp/orquestador_celulas.log", `[${new Date().toISOString()}] Ejecutando célula: ${celula.id}\n`);
        const fn = modulo.default || modulo;
        salida = await fn(entradaResuelta, this.contexto);

      }

      if (!salida || typeof salida !== 'object' || Array.isArray(salida)) {
        throw new Error(`La célula "${celula.id}" no devolvió un objeto de resultado.`);
      }
      if (!Object.prototype.hasOwnProperty.call(salida, 'resultado')) {
        throw new Error(`La célula "${celula.id}" no devuelve el campo "resultado".`);
      }
      if (salida.exito !== undefined && typeof salida.exito !== 'boolean') {
        throw new Error(`La célula "${celula.id}" devuelve "exito" con un tipo inválido.`);
      }
      if (salida.exito === undefined) {
        salida.exito = true;
      }

      // 3. Guardar resultado
      this.resultados[celula.id] = salida;
      if (salida.contexto && typeof salida.contexto === 'object') {
        this.contexto = { ...this.contexto, ...salida.contexto };
      }

      // 4. Registrar telemetría
      const tiempoMs = performance.now() - t0;
      const entradaTelemetria = {
        celulaId: celula.id,
        tiempoMs,
        exito: salida.exito !== false,
        error: salida.error || null,
        metricas: salida.metricas || {},
        datosCompletos: {
          esIA: salida.resultado?.esIA,
          confianza: salida.resultado?.confianza,
          peso: salida.resultado?.peso,
          explicacion: salida.resultado?.explicacion,
          evidencias: salida.resultado?.evidencias,
          varianzaLocalPromedio: salida.resultado?.varianzaLocalPromedio,
          entropia: salida.resultado?.entropia,
          gradientePromedio: salida.resultado?.gradientePromedio,
          varianzaRuido: salida.resultado?.varianzaRuido,
          autocorrelacionNormalizada: salida.resultado?.autocorrelacionNormalizada,
          saturacionAprox: salida.resultado?.saturacionAprox,
          temperatura: salida.resultado?.temperatura,
          dominancia: salida.resultado?.dominancia,
          variacionCromatica: salida.resultado?.variacionCromatica,
          variacionBrillo: salida.resultado?.variacionBrillo,
          contraste: salida.resultado?.contraste,
          gradienteLuz: salida.resultado?.gradienteLuz,
          brilloCuadrantes: salida.resultado?.brilloCuadrantes,
          iluminacionUniforme: salida.resultado?.iluminacionUniforme,
          contrasteAnormal: salida.resultado?.contrasteAnormal,
          sombrasInconsistentes: salida.resultado?.sombrasInconsistentes,
          decision: salida.resultado?.decision,
          puntuacionIA: salida.resultado?.puntuacionIA,
          puntuacionHumano: salida.resultado?.puntuacionHumano,
          tablaCuantizacionAnomala: salida.resultado?.tablaCuantizacionAnomala,
          formato: salida.resultado?.formato,
          ...salida.resultado
        }
      };

      this.telemetria.push(entradaTelemetria);
      console.log(`✅ Célula "${celula.id}" ejecutada (${tiempoMs.toFixed(2)}ms)`);

      if (salida.necesitaAprobacion) {
        const error = new Error('La célula solicita aprobación humana');
        error.code = 'NEED_APPROVAL';
        error.details = { celulaId: celula.id, ...salida };
        throw error;
      }

    } catch (error) {
      const tiempoMs = performance.now() - t0;
      this.telemetria.push({
        celulaId: celula.id,
        tiempoMs,
        exito: false,
        error: error.message,
        metricas: {},
        datosCompletos: null
      });
      console.error(`❌ Error en célula "${celula.id}":`, error.message);
      if (error.code === 'NEED_APPROVAL') {
        console.log(`⏳ Aprobación humana requerida en "${celula.id}"`);
        throw error;
      }
      if (this.plan.detenerseEnError === true) {
        throw error;
      }
    }
  }

  // ==================== MÉTODOS AUXILIARES ====================

  _resolverReferencias(expresion) {
    if (Array.isArray(expresion)) {
      return expresion.map(item => this._resolverReferencias(item));
    }
    if (typeof expresion === 'object' && expresion !== null) {
      const nuevo = {};
      for (const [clave, valor] of Object.entries(expresion)) {
        nuevo[clave] = this._resolverReferencias(valor);
      }
      return nuevo;
    }
    if (typeof expresion === 'string' && expresion.startsWith('$.')) {
      const pathStr = expresion.slice(2);
      const contextoCompleto = {
        ...this.resultados,
        contexto: this.contexto
      };
      const valor = get(contextoCompleto, pathStr);
      if (valor === undefined) {
        console.warn(`⚠️ Referencia no resuelta: "${expresion}"`);
      }
      return valor;
    }
    return expresion;
  }

  /**
   * Genera una nueva célula a partir del plan ejecutado (Fase 2).
   * El código se escribe en un archivo JS dentro de `this.rutaSalida`.
   *
   * @param {number} tiempoTotal - Tiempo total de ejecución del plan (para metadatos).
   */
  async _generarNuevaCelula(tiempoTotal) {
    const nombreBase = this.plan.nombre || 'celulaGenerada';
    const timestamp = Date.now();
    const nombre = `${nombreBase}-${timestamp}`;
    const rutaArchivo = path.join(this.rutaSalida, `${nombre}.js`);

    let codigo = `// Célula generada automáticamente por Orquestador v2.1 (con telemetría completa)\n`;
    codigo += `// Plan original: ${this.plan.nombre}\n`;
    codigo += `// Tiempo de ejecución: ${tiempoTotal}ms\n`;
    codigo += `// Fecha: ${new Date().toISOString()}\n`;
    codigo += `// CorrelationId: ${this.correlationId}\n\n`;
    codigo += `export default async function ${nombre}(entrada, contexto) {\n`;
    codigo += `  const resultados = {};\n`;
    codigo += `  const telemetria = [];\n`;
    codigo += `  const inicio = Date.now();\n`;
    codigo += `  contexto = contexto || {};\n\n`;

    for (const celula of this.plan.células) {
      const id = celula.id;
      codigo += `  // Célula: ${id}\n`;
      codigo += `  try {\n`;
      codigo += `    const t0 = Date.now();\n`;
      const entradaResuelta = this._resolverReferencias(celula.entrada);
      const entradaJson = JSON.stringify(entradaResuelta, null, 2);
      codigo += `    const entrada = ${entradaJson};\n`;
      codigo += `    const modulo = await import('${celula.ruta}');\n`;
      codigo += `    const fn = modulo.default || modulo;\n`;
      codigo += `    const salida = await fn(entrada, contexto);\n`;
      codigo += `    resultados['${id}'] = salida;\n`;
      codigo += `    if (salida.contexto) contexto = { ...contexto, ...salida.contexto };\n`;
      codigo += `    telemetria.push({\n`;
      codigo += `      id: '${id}',\n`;
      codigo += `      tiempo: Date.now() - t0,\n`;
      codigo += `      exito: true,\n`;
      codigo += `      datosCompletos: {\n`;
      codigo += `        esIA: salida.resultado?.esIA,\n`;
      codigo += `        confianza: salida.resultado?.confianza,\n`;
      codigo += `        peso: salida.resultado?.peso,\n`;
      codigo += `        explicacion: salida.resultado?.explicacion,\n`;
      codigo += `        ...salida.resultado\n`;
      codigo += `      }\n`;
      codigo += `    });\n`;
      codigo += `  } catch (error) {\n`;
      codigo += `    telemetria.push({ id: '${id}', error: error.message });\n`;
      codigo += `    throw error;\n`;
      codigo += `  }\n`;
    }

    const salidaFinal = this._resolverReferencias(this.plan.salidaFinal);
    const salidaJson = JSON.stringify(salidaFinal, null, 2);
    codigo += `\n  const resultado = ${salidaJson};\n`;
    codigo += `  return {\n`;
    codigo += `    exito: true,\n`;
    codigo += `    resultado,\n`;
    codigo += `    metricas: { tiempoMs: Date.now() - inicio, telemetria },\n`;
    codigo += `    contexto\n`;
    codigo += `  };\n`;
    codigo += `}\n`;

    fs.writeFileSync(rutaArchivo, codigo, 'utf8');
    console.log(`✅ Nueva célula generada: ${rutaArchivo}`);

    try {
      agregarCelulaAlCatalogo({
        id: nombre,
        ruta: rutaArchivo,
        descripcion: `Célula generada a partir del plan: ${this.plan.nombre}`,
        entradaEsperada: {},
        salidaOfrecida: {},
        version: '1.0.0',
        publica: true,
        generada: true,
        timestamp
      });
    } catch (error) {
      console.error(`❌ Error al actualizar el catálogo: ${error.message}`);
    }
  }

  _clonarProfundo(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this._clonarProfundo(item));
    const nuevo = {};
    for (const [key, value] of Object.entries(obj)) {
      nuevo[key] = this._clonarProfundo(value);
    }
    return nuevo;
  }
}

export default Orquestador;
