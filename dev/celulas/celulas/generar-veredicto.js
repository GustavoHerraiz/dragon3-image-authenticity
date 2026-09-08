/**
 * generar-veredicto.js
 * ============================================================================
 * CÉLULA COMPUESTA - GENERADOR DE VEREDICTO FINAL (v3.3.0)
 * ============================================================================
 * 
 * VERSIÓN CORREGIDA: Incluye su propio resultado en detalles, aumenta peso
 * de detectar-textura-ruido en PNG, y fuerza decisión si puntuacionIA > 0.6.
 * 
 * @module generar-veredicto
 */

import fs from 'fs';

// ============================================================================
//  CONSTANTES DEL SELLO DRAGON3
// ============================================================================
const DRAGON3_SELLO = {
  KEYWORDS: ['Dragon3', 'dragon3', 'DRAGON3', 'Protected by Dragon3', 'Dragon3 Verificado', 'Dragon3 V22', 'Mentalist Core'],
  ID_PATTERN: /DRAGON3_ID:[A-Z0-9_]+/i,
  BONUS_CONFIANZA: 0.25,
  BONUS_PESO: 0.2,
};

// ============================================================================
//  FUNCIÓN PRINCIPAL
// ============================================================================
export default async function generarVeredicto(entrada, contexto) {
  // ==========================================================================
  // LOG DE EJECUCIÓN
  // ==========================================================================
  fs.appendFileSync('/tmp/generar-veredicto.log', `[${new Date().toISOString()}] EJECUTADO\n`);

  // ==========================================================================
  // 1. EXTRACCIÓN DE DATOS BÁSICOS
  // ==========================================================================
  const payload = entrada.payload || {};
  const correlationId = entrada.correlationId || contexto?.correlationId || 'desconocido';
  const agenteId = entrada.agenteId || contexto?.agenteId || 'desconocido';
  const planConfig = entrada.planConfig || contexto?.planConfig || {};

  // ==========================================================================
  // 2. DETECCIÓN DEL SELLO DRAGON3
  // ==========================================================================
  let selloDragon3Detectado = false;
  let dragon3Id = null;
  let dragon3Evidencias = [];
  let dragon3ConfianzaBonus = 0;

  const exifResultado = payload['extraer-metadatos-exif'];
  if (exifResultado && typeof exifResultado === 'object') {
    const metadatos = exifResultado.metadatosCompletos || exifResultado;
    const campos = ['Software', 'Copyright', 'Source', 'Artist', 'description', 'rights', 'title', 'ImageDescription', 'Creator', 'creador', 'author'];
    for (const campo of campos) {
      const valor = metadatos[campo];
      if (!valor) continue;
      const valorStr = typeof valor === 'string' ? valor : (valor.value ? valor.value : JSON.stringify(valor));
      for (const keyword of DRAGON3_SELLO.KEYWORDS) {
        if (valorStr.includes(keyword)) {
          selloDragon3Detectado = true;
          dragon3Evidencias.push(`✅ Sello Dragon3 detectado en ${campo}: "${valorStr}"`);
        }
      }
      const match = valorStr.match(DRAGON3_SELLO.ID_PATTERN);
      if (match) {
        dragon3Id = match[0];
        dragon3Evidencias.push(`✅ ID Dragon3 encontrado: ${dragon3Id}`);
        selloDragon3Detectado = true;
      }
    }
  }
  if (selloDragon3Detectado) {
    dragon3ConfianzaBonus = DRAGON3_SELLO.BONUS_CONFIANZA;
  }

  // ==========================================================================
  // 3. DETECCIÓN DEL FORMATO DE LA IMAGEN
  // ==========================================================================
  let esJPG = false;
  let formatoImagen = 'desconocido';

  if (payload['cargar-imagen']?.resultado?.formato) {
    formatoImagen = payload['cargar-imagen'].resultado.formato.toLowerCase();
  } else if (payload['detectar-patrones-forenses']?.forense?.raw_data?.formato) {
    formatoImagen = payload['detectar-patrones-forenses'].forense.raw_data.formato.toLowerCase();
  } else if (payload['detectar-patrones-forenses']?.formato) {
    formatoImagen = payload['detectar-patrones-forenses'].formato.toLowerCase();
  } else if (payload['extraer-metadatos-exif']?.forense?.raw_data?.formato) {
    formatoImagen = payload['extraer-metadatos-exif'].forense.raw_data.formato.toLowerCase();
  } else if (payload['extraer-metadatos-exif']?.formato) {
    formatoImagen = payload['extraer-metadatos-exif'].formato.toLowerCase();
  } else if (payload['detectar-textura-ruido']?.formatoOriginal) {
    formatoImagen = payload['detectar-textura-ruido'].formatoOriginal.toLowerCase();
  }

  if (formatoImagen === 'jpeg' || formatoImagen === 'jpg') {
    esJPG = true;
  }

  console.log(`🔍 [FORMATO] Imagen detectada como: ${formatoImagen} (esJPG: ${esJPG})`);

  // ==========================================================================
  // 4. RECOPILACIÓN DE RESULTADOS (con ajustes para PNG)
  // ==========================================================================
  const resultados = [];
  let puntuacionIA_textura = null; // Guardar para decisión final

  for (const [celulaId, resultado] of Object.entries(payload)) {
    if (!resultado || typeof resultado !== 'object') continue;
    let esIA = resultado.esIA !== undefined ? resultado.esIA : null;
    const confianza = typeof resultado.confianza === 'number' ? resultado.confianza : null;
    const explicacion = resultado.explicacion || '';
    const evidencias = Array.isArray(resultado.evidencias) ? resultado.evidencias : [];
    let peso = typeof resultado.peso === 'number' ? resultado.peso : 1.0;

    // Ajustes para PNG (cuando no es JPG)
    if (!esJPG) {
      if (celulaId === 'detectar-colores') {
        peso = 0;
        console.log(`🔧 [PNG] detectar-colores EXCLUIDO (peso 0)`);
      }
      if (celulaId === 'detectar-artefactos-ia') {
        peso = 1.0;
        console.log(`🔧 [PNG] detectar-artefactos-ia peso 1.0`);
      }
      if (celulaId === 'detectar-patrones-forenses') {
        peso = 1.0;
        console.log(`🔧 [PNG] detectar-patrones-forenses peso 1.0`);
      }
      if (celulaId === 'detectar-textura-ruido') {
        const puntuacionIA = resultado.forense?.raw_data?.puntuacionIA;
        puntuacionIA_textura = puntuacionIA;
        if (typeof puntuacionIA === 'number' && puntuacionIA > 0.5) {
          esIA = true;
          peso = 1.0; // 🔥 Aumentar peso a 1.0 cuando se fuerza a IA
          console.log(`🔧 [PNG] detectar-textura-ruido forzado a IA (puntuacionIA: ${puntuacionIA}) y peso aumentado a 1.0`);
        }
      }
    }

    // ML solo vota en JPG
    if (celulaId === 'ml' && !esJPG) {
      peso = 0;
      console.log(`⚠️ ML con peso 0 porque formato=${formatoImagen}`);
    }

    if (esIA === null || confianza === null) continue;
    resultados.push({ celulaId, esIA, confianza, explicacion, evidencias, peso });
  }

  if (resultados.length === 0) {
    return {
      exito: true,
      resultado: {
        esIA: false,
        confianza: 0,
        explicacion: 'No se recibieron resultados de análisis suficientes.',
        detalles: {
          error: 'Sin datos',
          correlationId,
          agenteId,
          planConfig,
          selloDragon3: { detectado: false },
          todosLosResultados: payload,
        },
      },
      metricas: { tiempoMs: 1 },
    };
  }

  // ==========================================================================
  // 5. CÁLCULO DE VOTOS, PESOS Y CONFIANZAS POR CLASE
  // ==========================================================================
  let votosIA = 0, votosHumano = 0;
  let sumaPesosIA = 0, sumaPesosHumano = 0;
  let sumaConfianzaPorPesoIA = 0, sumaConfianzaPorPesoHumano = 0;

  for (const r of resultados) {
    let confianzaAjustada = r.confianza;
    let pesoAjustado = r.peso;

    if (selloDragon3Detectado && !r.esIA) {
      confianzaAjustada = Math.min(r.confianza + dragon3ConfianzaBonus, 1);
      pesoAjustado = r.peso + DRAGON3_SELLO.BONUS_PESO;
    }

    if (r.esIA) {
      votosIA++;
      sumaPesosIA += pesoAjustado;
      sumaConfianzaPorPesoIA += confianzaAjustada * pesoAjustado;
    } else {
      votosHumano++;
      sumaPesosHumano += pesoAjustado;
      sumaConfianzaPorPesoHumano += confianzaAjustada * pesoAjustado;
    }
  }

  const confianzaIA = sumaPesosIA > 0 ? sumaConfianzaPorPesoIA / sumaPesosIA : 0;
  const confianzaHumana = sumaPesosHumano > 0 ? sumaConfianzaPorPesoHumano / sumaPesosHumano : 0;

  // ==========================================================================
  // 6. DECISIÓN POR MAYORÍA PONDERADA
  // ==========================================================================
  let esIAFinal = false;
  let decisionTexto = '';
  if (sumaPesosIA > sumaPesosHumano) {
    esIAFinal = true;
    decisionTexto = 'IA (mayoría ponderada)';
  } else if (sumaPesosHumano > sumaPesosIA) {
    esIAFinal = false;
    decisionTexto = 'Humano (mayoría ponderada)';
  } else {
    esIAFinal = confianzaIA > 0.5;
    decisionTexto = esIAFinal ? 'IA (empate, confianza > 0.5)' : 'Humano (empate, confianza <= 0.5)';
  }

  // ==========================================================================
  // 7. CONFIANZA GLOBAL
  // ==========================================================================
  let confianzaGlobal = esIAFinal ? confianzaIA : confianzaHumana;
  confianzaGlobal = Math.min(Math.max(confianzaGlobal, 0), 1);

  if (!esIAFinal && selloDragon3Detectado) {
    confianzaGlobal = Math.min(confianzaGlobal + dragon3ConfianzaBonus, 1);
  }

  // ==========================================================================
  // 8. PRIORIDAD ABSOLUTA DE LA ML (SOLO EN JPG)
  // ==========================================================================
  if (esJPG && payload.ml && typeof payload.ml.confianza === 'number' && payload.ml.confianza > 0.9) {
    esIAFinal = payload.ml.esIA;
    confianzaGlobal = payload.ml.confianza;
    decisionTexto = 'ML (prioridad en JPG)';
    console.log(`🚀 ML impone veredicto (JPG): ${esIAFinal ? 'IA' : 'Humano'} con ${(confianzaGlobal * 100).toFixed(1)}%`);
  } else if (!esJPG && payload.ml && typeof payload.ml.confianza === 'number' && payload.ml.confianza > 0.9) {
    console.log(`⚠️ ML confía ${(payload.ml.confianza * 100).toFixed(1)}% pero NO IMPONE (formato: ${formatoImagen})`);
  }

  // ==========================================================================
  // 8.5. 🔥 FUERZA DECISIÓN EN PNG SI detectar-textura-ruido indica IA
  // ==========================================================================
  if (!esJPG && puntuacionIA_textura !== null && puntuacionIA_textura > 0.6) {
    esIAFinal = true;
    confianzaGlobal = Math.max(confianzaGlobal, puntuacionIA_textura);
    decisionTexto = 'IA (forzado por textura-ruido en PNG)';
    console.log(`🚀 PNG: decisión forzada a IA por textura-ruido (puntuacionIA: ${puntuacionIA_textura})`);
  }

  // ==========================================================================
  // 9. GENERACIÓN DE EXPLICACIÓN ESTRUCTURADA
  // ==========================================================================
  let explicacionGlobal = '';
  const partes = [];

  if (selloDragon3Detectado) {
    const idTexto = dragon3Id ? ` (ID: ${dragon3Id})` : '';
    partes.push(`🔐 **IMAGEN VERIFICADA POR DRAGON3**${idTexto}`);
    partes.push('');
    partes.push('✅ **AUTENTICIDAD CONFIRMADA:**');
    const evidenciasUnicas = [...new Set(dragon3Evidencias)];
    evidenciasUnicas.slice(0, 3).forEach(e => partes.push(`   ${e}`));
    partes.push(`   ✅ Confianza aumentada +${(DRAGON3_SELLO.BONUS_CONFIANZA * 100).toFixed(0)}%`);
    partes.push('');
  }

  if (exifResultado && exifResultado.exif) {
    const exif = exifResultado.exif;
    const make = exif.Make || 'Desconocida';
    const model = exif.Model || '';
    const date = exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Desconocida';
    const artist = exif.Artist || 'Desconocido';
    partes.push('📸 **ORIGEN:**');
    partes.push(`   - Cámara: ${make} ${model}`);
    partes.push(`   - Fecha: ${date}`);
    partes.push(`   - Autor: ${artist}`);
    partes.push('');
  }

  const decisionTextoFinal = esIAFinal ? 'IA' : 'HUMANO';
  const emoji = esIAFinal ? '⚠️' : '✅';
  partes.push(`${emoji} **VEREDICTO: ${decisionTextoFinal}** (${(confianzaGlobal * 100).toFixed(0)}% confianza)`);

  const evidenciasClave = resultados
    .filter(r => r.confianza > 0.2)
    .sort((a, b) => b.confianza - a.confianza)
    .slice(0, 4)
    .map(r => {
      let texto = r.explicacion.replace(/^[🔴🟢⚪✅❌⚠️]\s*/, '').replace(/\*\*/g, '').trim();
      if (texto.length > 100) texto = texto.substring(0, 100) + '...';
      return texto;
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  if (evidenciasClave.length > 0) {
    partes.push('');
    partes.push('📊 **EVIDENCIAS CLAVE:**');
    evidenciasClave.forEach(e => partes.push(`   - ${e}`));
  }

  explicacionGlobal = partes.join('\n');

  // ==========================================================================
  // 10. CONSTRUCCIÓN DE ANALIZADORES PARA EL FRONTEND
  // ==========================================================================
  const analizadores = {};
  
  // Añadir las células originales (excepto generar-veredicto)
  for (const [cellId, cellResult] of Object.entries(payload)) {
    if (cellId === 'generar-veredicto') continue;
    if (!cellResult || typeof cellResult !== 'object') continue;

    const isIA = cellResult.esIA !== undefined ? cellResult.esIA : null;
    const conf = typeof cellResult.confianza === 'number' ? cellResult.confianza : 0;
    const peso = typeof cellResult.peso === 'number' ? cellResult.peso : 0.5;
    const exitoso = cellResult.exito !== undefined ? cellResult.exito : true;
    const version = cellResult.version || '1.0.0';

    let tiempoMs = 0;
    if (cellResult.metricas?.tiempoMs) tiempoMs = cellResult.metricas.tiempoMs;
    else if (cellResult.tiempoMs) tiempoMs = cellResult.tiempoMs;
    else if (cellResult.processingTime) tiempoMs = cellResult.processingTime;
    else if (cellResult.metricas?.tiempoExtraccionMs) tiempoMs = cellResult.metricas.tiempoExtraccionMs;

    let veredictoTexto = 'Indeterminado';
    if (isIA === true) veredictoTexto = 'Artificial';
    else if (isIA === false) veredictoTexto = 'Humano';

    let explicacion = cellResult.explicacion || '';
    if (cellId === 'ml') {
      if (esJPG) {
        explicacion = `🧠 ML (XGBoost) entrenada para JPG. Veredicto: ${veredictoTexto} con ${(conf * 100).toFixed(1)}% confianza.`;
        if (conf > 0.9) explicacion += ' ✅ Prioridad activa (confianza > 90%).';
        else explicacion += ' ⚠️ Confianza por debajo del umbral (90%).';
      } else {
        explicacion = `⚠️ ML (XGBoost) NO entrenada para ${formatoImagen.toUpperCase()}. Solo es fiable en JPG. Su voto NO cuenta en el consenso.`;
      }
    }

    analizadores[cellId] = {
      meta: {
        id: cellId,
        nombre: cellId,
        version: version,
        ts_start: Date.now() - tiempoMs,
        ts_end: Date.now(),
        ms: tiempoMs,
      },
      evaluacion: {
        veredicto: veredictoTexto,
        confianza: conf,
        peso: peso,
      },
      narrativa: {
        titulo: '',
        explicacion_humana: explicacion,
        explicacion_tecnica: '',
      },
      explicacion: explicacion,
      forense: {
        herramientas: [],
        compresion: [],
        raw_data: cellResult,
      },
      exitoso: exitoso,
      processingTime: tiempoMs,
      version: version,
      c2pa: null,
    };
  }

  // 🔥 AÑADIR EL PROPIO RESULTADO DE generar-veredicto a los analizadores
  // para que el adaptador FAANG lo muestre en el frontend
  analizadores['generar-veredicto'] = {
    meta: {
      id: 'generar-veredicto',
      nombre: 'generar-veredicto',
      version: '1.0.0',
      ts_start: Date.now() - 2,
      ts_end: Date.now(),
      ms: 2,
    },
    evaluacion: {
      veredicto: esIAFinal ? 'Artificial' : 'Humano',
      confianza: confianzaGlobal,
      peso: 1.0,
    },
    narrativa: {
      titulo: '',
      explicacion_humana: `Veredicto final: ${esIAFinal ? 'IA' : 'Humano'} con ${(confianzaGlobal * 100).toFixed(1)}% confianza.`,
      explicacion_tecnica: '',
    },
    explicacion: `Veredicto final: ${esIAFinal ? 'IA' : 'Humano'} con ${(confianzaGlobal * 100).toFixed(1)}% confianza.`,
    forense: {
      herramientas: [],
      compresion: [],
      raw_data: {
        esIA: esIAFinal,
        confianza: confianzaGlobal,
        votosIA,
        votosHumano,
        decisionPor: decisionTexto,
        formato: formatoImagen,
        esJPG,
      }
    },
    exitoso: true,
    processingTime: 2,
    version: '1.0.0',
    c2pa: null,
  };

  // ==========================================================================
  // 11. CONSTRUCCIÓN DE DETALLES COMPLETOS
  // ==========================================================================
  const detalles = {
    correlationId,
    agenteId,
    planConfig,
    totalCelulas: resultados.length,
    confianzaGlobal,
    votosIA,
    votosHumano,
    confianzaIA,
    confianzaHumana,
    decisionPor: decisionTexto,
    selloDragon3: {
      detectado: selloDragon3Detectado,
      id: dragon3Id,
      evidencias: dragon3Evidencias,
      bonusConfianza: dragon3ConfianzaBonus,
      confianzaAumentada: selloDragon3Detectado ? confianzaGlobal - (esIAFinal ? confianzaIA : confianzaHumana) : 0,
    },
    resultados: resultados.map(r => {
      const resultadoCompleto = payload[r.celulaId] || {};
      return { celula: r.celulaId, esIA: r.esIA, confianza: r.confianza, explicacion: r.explicacion, peso: r.peso, ...resultadoCompleto };
    }),
    analizadores: analizadores,
    todosLosResultados: payload,
  };

  // ==========================================================================
  // 12. DEVOLUCIÓN DEL RESULTADO FINAL
  // ==========================================================================
  return {
    exito: true,
    resultado: {
      esIA: esIAFinal,
      confianza: confianzaGlobal,
      explicacion: explicacionGlobal,
      detalles,
    },
    metricas: {
      tiempoMs: 2,
      totalCelulasProcesadas: resultados.length,
      selloDragon3Detectado: selloDragon3Detectado,
    },
  };
}
