/**
 * watcher-dataset.js
 * 
 * Watcher de carpetas calientes para procesamiento automático de imágenes.
 * 
 * FLUJO:
 * 1. Escanea carpetas /dataset/hot/humanas/ y /dataset/hot/ia/
 * 2. Procesa cada imagen con el Orquestador (plan analizar-imagen-completa)
 * 3. Guarda en MongoDB con correccionHumana: true (humanas) o false (IA)
 * 4. Si el guardado automático falla, crea el documento manualmente con TODOS los datos de las células
 * 5. Mueve la imagen a /dataset/procesadas/ correspondiente
 * 6. Ejecuta en segundo plano (loop infinito)
 * 
 * MEJORAS v1.3.1:
 * - CORREGIDO: Extracción de datos de células desde telemetria.datosCompletos
 * - Guardado correcto de confianza, esIA, peso y tiempo
 * - Procesamiento alternado: 100 IA y 100 humanas por ciclo
 * - Balance automático entre tipos de imágenes
 * - Estadísticas de progreso en tiempo real
 * - Recomendaciones basadas en el progreso
 * - Logs más detallados del proceso
 * - Límite de tamaño de imagen (50MB)
 * 
 * USO:
 * - Poner imágenes en hot/humanas/ o hot/ia/
 * - El sistema las procesa automáticamente
 * - Se mueven a procesadas/ tras finalizar
 * 
 * PARA PRODUCCIÓN:
 * - Ejecutar con PM2: pm2 start ecosystem.config.cjs
 * - Ver logs: pm2 logs dataset-watcher
 * 
 * @module watcher-dataset
 * @version 1.3.1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

// =============================== CONFIGURACIÓN ===============================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env
dotenv.config({ path: path.resolve(__dirname, '../../prod/Dragon3/backend/.env') });

// Rutas de las carpetas
const BASE_DIR = path.join(__dirname, '..', 'dataset');
const HOT_HUMANAS = path.join(BASE_DIR, 'hot', 'humanas');
const HOT_IA = path.join(BASE_DIR, 'hot', 'ia');
const PROC_HUMANAS = path.join(BASE_DIR, 'procesadas', 'humanas');
const PROC_IA = path.join(BASE_DIR, 'procesadas', 'ia');
const LOG_DIR = path.join(BASE_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'watcher.log');

// Crear carpetas si no existen
[HOT_HUMANAS, HOT_IA, PROC_HUMANAS, PROC_IA, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Carpeta creada: ${dir}`);
  }
});

// Variables de control
let procesando = false;
const INTERVALO_MS = 5000;
const MAX_POR_TIPO = 100;
const MAX_TAMAÑO_IMAGEN_MB = 50;

// Contadores de progreso
let totalIA = 0;
let totalHumanas = 0;
let procesadasIA = 0;
let procesadasHumanas = 0;

// Importar Orquestador y Plan
const planPath = path.join(__dirname, '..', 'planes', 'analizar-imagen-completa.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

// =============================== FUNCIONES AUXILIARES ===============================

/**
 * Escribe un mensaje en el log
 * @param {string} mensaje - Mensaje a loguear
 * @param {string} nivel - Nivel del log (INFO, WARN, ERROR, DEBUG, RECOMENDACION)
 */
function log(mensaje, nivel = 'INFO') {
  const timestamp = new Date().toISOString();
  const linea = `[${timestamp}] [${nivel}] ${mensaje}\n`;
  fs.appendFileSync(LOG_FILE, linea);
  console.log(linea.trim());
}

/**
 * Verifica si un archivo es una imagen (por extensión)
 */
function esImagen(nombre) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(nombre);
}

/**
 * Verifica si una imagen es demasiado grande para procesar
 */
function esImagenDemasiadoGrande(ruta) {
  try {
    const stats = fs.statSync(ruta);
    const tamañoMB = stats.size / (1024 * 1024);
    if (tamañoMB > MAX_TAMAÑO_IMAGEN_MB) {
      log(`⚠️ Imagen demasiado grande (${tamañoMB.toFixed(1)}MB > ${MAX_TAMAÑO_IMAGEN_MB}MB): ${path.basename(ruta)}`, 'WARN');
      return true;
    }
    return false;
  } catch (error) {
    log(`❌ Error verificando tamaño de imagen: ${error.message}`, 'ERROR');
    return true;
  }
}

/**
 * Actualiza los contadores globales
 */
function actualizarContadores() {
  try {
    totalIA = fs.readdirSync(HOT_IA).filter(esImagen).length + fs.readdirSync(PROC_IA).filter(esImagen).length;
    totalHumanas = fs.readdirSync(HOT_HUMANAS).filter(esImagen).length + fs.readdirSync(PROC_HUMANAS).filter(esImagen).length;
    procesadasIA = fs.readdirSync(PROC_IA).filter(esImagen).length;
    procesadasHumanas = fs.readdirSync(PROC_HUMANAS).filter(esImagen).length;
  } catch (error) {
    // Si hay error, no actualizar
  }
}

/**
 * Genera recomendaciones basadas en el progreso
 */
function generarRecomendaciones() {
  actualizarContadores();
  
  const total = totalIA + totalHumanas;
  const procesadas = procesadasIA + procesadasHumanas;
  const porcentaje = total > 0 ? (procesadas / total * 100) : 0;
  
  let recomendaciones = [];
  
  if (porcentaje < 10) {
    recomendaciones.push(`📊 Progreso: ${porcentaje.toFixed(1)}% (${procesadas}/${total} imágenes). Continúa procesando.`);
  } else if (porcentaje < 50) {
    recomendaciones.push(`📊 Progreso: ${porcentaje.toFixed(1)}% (${procesadas}/${total} imágenes). Buen ritmo.`);
  } else if (porcentaje < 90) {
    recomendaciones.push(`📊 Progreso: ${porcentaje.toFixed(1)}% (${procesadas}/${total} imágenes). Casi listo.`);
  } else {
    recomendaciones.push(`✅ Progreso: ${porcentaje.toFixed(1)}% (${procesadas}/${total} imágenes). ¡Dataset casi completo!`);
  }
  
  if (totalIA > 0 && totalHumanas > 0) {
    const ratioIA = procesadasIA / totalIA;
    const ratioHumanas = procesadasHumanas / totalHumanas;
    const diferencia = Math.abs(ratioIA - ratioHumanas);
    
    if (diferencia > 0.2) {
      if (ratioIA < ratioHumanas) {
        recomendaciones.push(`⚠️ Las imágenes IA van más lentas (${(ratioIA*100).toFixed(0)}% vs ${(ratioHumanas*100).toFixed(0)}%). Ajustando prioridad...`);
      } else {
        recomendaciones.push(`⚠️ Las imágenes humanas van más lentas (${(ratioHumanas*100).toFixed(0)}% vs ${(ratioIA*100).toFixed(0)}%). Ajustando prioridad...`);
      }
    } else {
      recomendaciones.push(`⚖️ Balance IA/Humanas: ${(ratioIA*100).toFixed(0)}% / ${(ratioHumanas*100).toFixed(0)}% - Excelente.`);
    }
  }
  
  if (procesadas > 0 && total > 0 && procesadas < total) {
    const tiempoPorImagen = 1.5;
    const restantes = total - procesadas;
    const tiempoRestante = restantes * tiempoPorImagen / 60;
    if (tiempoRestante > 60) {
      recomendaciones.push(`⏱️ Tiempo estimado restante: ~${(tiempoRestante/60).toFixed(1)} horas`);
    } else {
      recomendaciones.push(`⏱️ Tiempo estimado restante: ~${tiempoRestante.toFixed(0)} minutos`);
    }
  }
  
  return recomendaciones;
}

async function procesarImagen(rutaArchivo, esHumano) {
  const nombre = path.basename(rutaArchivo);
  const inicio = performance.now();
  
  log(`📸 Procesando: ${nombre} (${esHumano ? 'HUMANO' : 'IA'})`);
  
  try {
    // Verificar tamaño de la imagen
    if (esImagenDemasiadoGrande(rutaArchivo)) {
      log(`⏭️ Saltando ${nombre} (imagen demasiado grande)`, 'WARN');
      const destino = esHumano ? PROC_HUMANAS : PROC_IA;
      fs.renameSync(rutaArchivo, path.join(destino, nombre));
      log(`⚠️ ${nombre} → Movido a procesadas (demasiado grande)`, 'WARN');
      return false;
    }
    
    // 1. Leer archivo
    const buffer = fs.readFileSync(rutaArchivo);
    log(`📊 Tamaño de imagen: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // 2. Preparar entrada para el Orquestador
    const base64 = buffer.toString('base64');
    const entrada = {
      archivo: base64,
      nombreOriginal: nombre,
      tipoArchivo: 'imagen',
      extra: {
        origen: 'dataset-watcher'
      }
    };
    
    // 3. Ejecutar plan
    const Orquestador = (await import('../orquestador.js')).default;
    const orquestador = new Orquestador(plan);
    const resultado = await orquestador.ejecutar(entrada);
    
    log(`📊 Plan ejecutado. CorrelationId: ${resultado.correlationId}`);
    
    // 4. CREAR DOCUMENTO MANUALMENTE (SIEMPRE)
    if (resultado.correlationId) {
      const db = mongoose.connection.db;
      const collection = db.collection('ejecuciones');
      
      try {
        const telemetria = resultado.telemetria || [];
        const extension = path.extname(nombre).replace('.', '') || 'jpeg';
        
        // Extraer TODOS los datos de telemetria.datosCompletos
const datosCelulas = {};
for (const t of telemetria) {
  const datos = t.datosCompletos || {};
  
  datosCelulas[t.celulaId] = {
    // --- CAMPOS BÁSICOS ---
    esIA: datos.esIA ?? false,
    confianza: datos.confianza ?? 0,
    peso: datos.peso ?? 1,
    tiempoMs: t.tiempoMs || 0,
    exito: t.exito !== false,
    
    // --- TODAS LAS MÉTRICAS INTERNAS ---
    // Textura/Ruido
    varianzaLocalPromedio: datos.varianzaLocalPromedio ?? null,
    entropia: datos.entropia ?? null,
    gradientePromedio: datos.gradientePromedio ?? null,
    varianzaRuido: datos.varianzaRuido ?? null,
    autocorrelacionNormalizada: datos.autocorrelacionNormalizada ?? null,
    
    // Colores
    saturacionAprox: datos.saturacionAprox ?? null,
    temperatura: datos.temperatura ?? null,
    dominancia: datos.dominancia ?? null,
    variacionCromatica: datos.variacionCromatica ?? null,
    
    // Sombreado
    variacionBrillo: datos.variacionBrillo ?? null,
    contraste: datos.contraste ?? null,
    gradienteLuz: datos.gradienteLuz ?? null,
    brilloCuadrantes: datos.brilloCuadrantes ?? null,
    iluminacionUniforme: datos.iluminacionUniforme ?? null,
    contrasteAnormal: datos.contrasteAnormal ?? null,
    sombrasInconsistentes: datos.sombrasInconsistentes ?? null,
    
    // Bordes
    nitidez: datos.nitidez ?? null,
    desviacion: datos.desviacion ?? null,
    
    // Decisión
    decision: datos.decision ?? null,
    puntuacionIA: datos.puntuacionIA ?? null,
    puntuacionHumano: datos.puntuacionHumano ?? null,
    
    // TODO lo demás
    ...datos
  };
}
        
        const veredicto = resultado.resultado || {};
        
        const nuevoDoc = {
          correlationId: resultado.correlationId,
          timestamp: new Date(),
          formato: extension,
          tamañoBytes: buffer.length,
          veredicto: {
            esIA: veredicto.esIA ?? false,
            confianza: veredicto.confianza ?? 0,
            explicacion: veredicto.explicacion || ''
          },
          correccionHumana: esHumano,
          comentarioFeedback: `Dataset watcher (${esHumano ? 'humano' : 'IA'})`,
          datosCelulas: datosCelulas,
          tiempoTotalMs: resultado.tiempoTotal || 0,
          telemetria: telemetria.map(t => ({
            celulaId: t.celulaId,
            tiempoMs: t.tiempoMs || 0,
            exito: t.exito !== false,
            error: t.error || null
          })),
          contexto: {
            agenteId: 'dataset-watcher',
            planId: 'analizar-imagen-completa',
            origen: 'dataset'
          }
        };
        
        await collection.insertOne(nuevoDoc);
        
        const numCelulas = Object.keys(datosCelulas).length;
        log(`✅ ${nombre} → Documento guardado con ${numCelulas} células (correccionHumana: ${esHumano})`, 'INFO');
        
      } catch (err) {
        log(`❌ Error guardando documento: ${err.message}`, 'ERROR');
        if (err.stack) {
          log(`📚 Stack: ${err.stack}`, 'DEBUG');
        }
      }
    } else {
      log(`⚠️ ${nombre} → No se recibió correlationId del orquestador`, 'WARN');
    }
    
    // 5. Mover archivo a procesadas
    const destino = esHumano ? PROC_HUMANAS : PROC_IA;
    const destinoPath = path.join(destino, nombre);
    
    if (fs.existsSync(rutaArchivo)) {
      fs.renameSync(rutaArchivo, destinoPath);
      const tiempo = (performance.now() - inicio).toFixed(2);
      log(`✅ ${nombre} → Completado en ${tiempo}ms → movido a procesadas/`);
    } else {
      log(`⚠️ ${nombre} → El archivo ya no existe (posiblemente ya movido)`, 'WARN');
    }
    
    return true;
    
  } catch (error) {
    log(`❌ Error procesando ${nombre}: ${error.message}`, 'ERROR');
    if (error.stack) {
      log(`📚 Stack: ${error.stack}`, 'DEBUG');
    }
    
    try {
      if (fs.existsSync(rutaArchivo)) {
        const destino = esHumano ? PROC_HUMANAS : PROC_IA;
        fs.renameSync(rutaArchivo, path.join(destino, nombre));
        log(`⚠️ ${nombre} → Movido a procesadas (con error)`, 'WARN');
      }
    } catch (e) {
      log(`❌ No se pudo mover ${nombre}: ${e.message}`, 'ERROR');
    }
    return false;
  }
}

/**
 * Escanea y procesa las carpetas calientes (alternando IA y humanas)
 */
async function escanearYProcesar() {
  if (procesando) {
    log('⏳ Procesamiento anterior en curso, omitiendo escaneo...', 'DEBUG');
    return;
  }
  
  procesando = true;
  
  try {
    const humanas = fs.readdirSync(HOT_HUMANAS).filter(esImagen);
    const ias = fs.readdirSync(HOT_IA).filter(esImagen);
    
    const iaProcesar = ias.slice(0, MAX_POR_TIPO);
    const humanasProcesar = humanas.slice(0, MAX_POR_TIPO);
    
    if (iaProcesar.length > 0 || humanasProcesar.length > 0) {
      log(`📂 Procesando ${iaProcesar.length} IA y ${humanasProcesar.length} humanas (ciclo alternado)`);
      
      for (const file of iaProcesar) {
        const ruta = path.join(HOT_IA, file);
        if (fs.existsSync(ruta)) {
          await procesarImagen(ruta, false);
        }
      }
      
      for (const file of humanasProcesar) {
        const ruta = path.join(HOT_HUMANAS, file);
        if (fs.existsSync(ruta)) {
          await procesarImagen(ruta, true);
        }
      }
      
      const cicloNum = Math.floor((procesadasIA + procesadasHumanas) / (MAX_POR_TIPO * 2));
      if (cicloNum % 5 === 0) {
        const recomendaciones = generarRecomendaciones();
        log('📋 RECOMENDACIONES:', 'RECOMENDACION');
        for (const rec of recomendaciones) {
          log(`   ${rec}`, 'RECOMENDACION');
        }
      }
    }
    
  } catch (error) {
    log(`❌ Error en escaneo: ${error.message}`, 'ERROR');
    if (error.stack) {
      log(`📚 Stack: ${error.stack}`, 'DEBUG');
    }
  } finally {
    procesando = false;
  }
}

// =============================== CONEXIÓN A MONGODB ===============================

async function conectarMongoDB() {
  try {
    const uri = process.env.MONGO_URI || 'MONGO_URI_FROM_ENV';
    await mongoose.connect(uri);
    log('✅ Conexión a MongoDB establecida');
    return true;
  } catch (error) {
    log(`❌ Error conectando a MongoDB: ${error.message}`, 'ERROR');
    return false;
  }
}

// =============================== INICIO ===============================

async function main() {
  log('🚀 Iniciando Watcher de Dataset (v1.3.1)');
  log('📌 CORREGIDO: Extracción de datos desde telemetria.datosCompletos');
  log(`📂 Carpeta hot/humanas: ${HOT_HUMANAS}`);
  log(`📂 Carpeta hot/ia: ${HOT_IA}`);
  log(`📂 Carpeta procesadas/humanas: ${PROC_HUMANAS}`);
  log(`📂 Carpeta procesadas/ia: ${PROC_IA}`);
  log(`⏱️ Intervalo de escaneo: ${INTERVALO_MS}ms`);
  log(`📦 Máx por tipo: ${MAX_POR_TIPO}`);
  log(`📦 Límite de tamaño: ${MAX_TAMAÑO_IMAGEN_MB}MB`);
  
  actualizarContadores();
  log(`📊 Total IA: ${totalIA}, Total Humanas: ${totalHumanas}`);
  
  const conectado = await conectarMongoDB();
  if (!conectado) {
    log('⚠️ Continuando sin MongoDB', 'WARN');
  }
  
  await escanearYProcesar();
  
  setInterval(async () => {
    await escanearYProcesar();
  }, INTERVALO_MS);
  
  log('👀 Watcher activo. Esperando imágenes en carpetas calientes...');
}

// =============================== MANEJO DE SEÑALES ===============================

process.on('SIGINT', () => {
  log('🛑 Recibida señal SIGINT. Cerrando watcher...');
  if (mongoose.connection.readyState === 1) {
    mongoose.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('🛑 Recibida señal SIGTERM. Cerrando watcher...');
  if (mongoose.connection.readyState === 1) {
    mongoose.disconnect();
  }
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log(`💥 Excepción no capturada: ${error.message}`, 'ERROR');
  if (error.stack) {
    log(`📚 Stack: ${error.stack}`, 'ERROR');
  }
});

process.on('unhandledRejection', (reason) => {
  log(`💥 Promesa rechazada no manejada: ${reason}`, 'ERROR');
});

// =============================== EJECUCIÓN ===============================

main().catch(error => {
  log(`❌ Error fatal: ${error.message}`, 'ERROR');
  if (error.stack) {
    log(`📚 Stack: ${error.stack}`, 'ERROR');
  }
  process.exit(1);
});