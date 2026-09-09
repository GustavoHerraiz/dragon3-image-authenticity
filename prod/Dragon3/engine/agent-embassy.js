/**
 * ====================================================================
 * AGENT EMBASSY - DRAGON3 FAANG (EDICIÓN PRODUCCIÓN LIMPIA Y OPTIMIZADA)
 * ====================================================================
 *
 * El Agent Embassy es el orquestador principal del ecosistema Dragon3.
 * Administra el ciclo de vida de ejecución de células, colas de procesamiento,
 * telemetría, defensa perimetral y adaptabilidad FAANG.
 *
 * Principios de Diseño:
 * - KISS (Keep It Simple, Stupid)
 * - Anti-OOM: Purga agresiva de buffers y Base64 antes de serialización JSON.
 * - Latencia objetivo: P95 < 200ms.
 * - Sin parches ad-hoc: Adaptación delegada a `adaptadorResultado.js`.
 *
 * Endpoints:
 * - POST /agent/execute  → Ejecuta un plan analítico.
 * - GET  /agent/planes   → Lista de planes de ejecución.
 * - GET  /agent/catalogo → Catálogo de células registradas.
 * - GET  /health         → Verificación de salud del servicio.
 *
 * @module agent-embassy
 * @version 1.1.0
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileTypeFromBuffer } from 'file-type';
import mongoose from 'mongoose';
import Bull from 'bull';

// Módulos del núcleo Dragon3
import Orquestador from './orquestador.js';
import { obtenerCatalogo } from './catalogo.js';
import { generarPlanDesdeCelulas } from './generador-plan.js';
import { planificar } from './planificador.js';
import { guardarTelemetria, calcularHuellaDigital } from './telemetria/almacen.js';
import { crearRateLimiter, getModo, validarMime } from './defensa.js';
import { adaptarYEnriquecerResultado } from './servicios/adaptadorResultado.js';
import { getCola } from './cola.js';

// ============================================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga de variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const app = express();
const PORT = process.env.EMBASSY_PORT || 3002;
let servidorHttp;
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? null
    : 'development-only-secret-change-me-before-production'
);
const ASYNC_QUEUE_NAME = 'analisis:cola:v1';
const ASYNC_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const ASYNC_UPLOAD_ROOT = path.resolve(__dirname, '../backend/uploads/temporal');
const ASYNC_EXECUTE_URL = process.env.ASYNC_EXECUTE_URL || `http://127.0.0.1:${PORT}`;
const asyncQueue = new Bull(ASYNC_QUEUE_NAME, {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
    db: 3,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {})
  },
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    timeout: 300000,
    removeOnComplete: { age: ASYNC_JOB_TTL_MS / 1000 },
    removeOnFail: { age: ASYNC_JOB_TTL_MS / 1000 }
  },
  settings: {
    lockDuration: 600000,
    stalledInterval: 30000,
    maxStalledCount: 1
  }
});

if (process.env.NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET debe estar configurado y tener al menos 32 caracteres en producción.');
}

// La cola de células solo es necesaria para el Embassy HTTP; el worker async
// consume exclusivamente la cola de análisis en Redis DB 3.
if (process.env.ASYNC_WORKER_ONLY !== 'true') {
  getCola();
  console.log('🐂 Workers de Bull inicializados correctamente');
}

// Configurar límite de tamaño de payload entrante
app.use(express.json({ limit: '50mb' }));

// Middleware de rate limit
const rateLimiter = crearRateLimiter();

// ============================================================
// 2. MIDDLEWARES Y FUNCIONES AUXILIARES
// ============================================================

/**
 * Middleware para autenticación mediante JWT.
 */
function autenticarToken(req, res, next) {
  const token = req.body?.token || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }
  try {
    req.agente = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Purga recursiva de buffers, cadenas base64 pesadas y arrays excesivos
 * antes de la serialización JSON. Previene fallos de memoria Heap (OOM).
 *
 * @param {Object} obj Objeto a limpiar
 * @param {number} depth Profundidad máxima de recursión
 * @returns {Object} Objeto saneado
 */
function purgarObjetosPesados(obj, depth = 0, vistos = new WeakSet()) {
  if (!obj || depth > 8) return obj;
  if (typeof obj !== 'object') return obj;

  if (Buffer.isBuffer(obj)) return undefined;
  if (vistos.has(obj)) return undefined;
  vistos.add(obj);

  if (Array.isArray(obj)) {
    if (obj.length > 50) return obj.slice(0, 10);
    const resultado = obj.map(item => purgarObjetosPesados(item, depth + 1, vistos));
    vistos.delete(obj);
    return resultado;
  }

  const copia = {};
  for (const key of Object.keys(obj)) {
    // Omisión explícita de campos binarios o voluminosos
    if (['archivo', 'base64', 'buffer', 'rawBuffer', 'matrizCompleta'].includes(key)) {
      continue;
    }
    const val = obj[key];
    if (typeof val === 'string' && val.length > 5000 && val.startsWith('data:image')) {
      continue;
    }
    copia[key] = purgarObjetosPesados(val, depth + 1, vistos);
  }
  vistos.delete(obj);
  return copia;
}

/**
 * Genera un UUID v4 para la trazabilidad de peticiones.
 */
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function validarRutaAsync(ruta) {
  const rutaAbsoluta = path.resolve(ruta);
  return rutaAbsoluta.startsWith(`${ASYNC_UPLOAD_ROOT}${path.sep}`) ? rutaAbsoluta : null;
}

const asyncWorkerEnabled = process.env.ASYNC_WORKER_ENABLED !== 'false';

if (asyncWorkerEnabled) {
  asyncQueue.process('analisis-completo', Number.parseInt(process.env.ASYNC_QUEUE_CONCURRENCY || '2', 10), async (job) => {
  const ruta = validarRutaAsync(job.data.filePath);
  if (!ruta || !fs.existsSync(ruta)) {
    throw new Error('Archivo temporal de análisis no disponible');
  }

  try {
    await job.progress(10);
    const archivo = fs.readFileSync(ruta).toString('base64');
    const token = jwt.sign({ agentId: 'dragon3-async-worker', nivel: 'confianza' }, JWT_SECRET, { expiresIn: '10m' });
    const response = await fetch(`${ASYNC_EXECUTE_URL}/agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': job.data.correlationId },
      body: JSON.stringify({
        token,
        agentId: 'dragon3-async-worker',
        peticion: {
          archivo,
          params: {},
          extra: {
            archivoId: job.data.archivoId,
            nombreOriginal: job.data.nombreOriginal,
            usuarioId: job.data.ownerId,
            correlationId: job.data.correlationId
          }
        },
        configuracion: { planId: job.data.planId }
      }),
      signal: AbortSignal.timeout(300000)
    });
    if (!response.ok) throw new Error(`Error de ejecución: ${response.status}`);
    await job.progress(100);
    return await response.json();
  } finally {
    try { fs.unlinkSync(ruta); } catch (error) { /* limpieza best effort */ }
  }
  });
}

// ============================================================
// 3. RUTAS / ENDPOINTS
// ============================================================

/**
 * GET /agent/planes
 * Retorna el catálogo de planes JSON disponibles en disco.
 */
app.get('/agent/planes', (req, res) => {
  try {
    const planesDir = path.join(__dirname, 'planes');
    const files = fs.readdirSync(planesDir).filter(f => f.endsWith('.json'));
    const planes = files.map(f => {
      const ruta = path.join(planesDir, f);
      const contenido = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      return {
        id: f.replace('.json', ''),
        nombre: contenido.nombre || f,
        descripcion: contenido.descripcion || '',
        ruta: ruta
      };
    });
    res.json({ planes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /agent/catalogo
 * Retorna el catálogo completo de células registradas.
 */
app.get('/agent/catalogo', (req, res) => {
  try {
    const catalogo = obtenerCatalogo(true);
    res.json(catalogo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health
 * Verificación básica del estado del servicio.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Agent Embassy', timestamp: new Date().toISOString() });
});

app.post('/agent/analysis-jobs', autenticarToken, async (req, res) => {
  const { filePath, ownerId, nombreOriginal, archivoId, correlationId, planId, idempotencyKey } = req.body || {};
  const ruta = validarRutaAsync(filePath);
  if (!ruta || !fs.existsSync(ruta)) {
    return res.status(400).json({ error: 'Archivo temporal no válido', correlationId });
  }
  if (!ownerId || !correlationId || !planId) {
    return res.status(400).json({ error: 'Faltan datos obligatorios', correlationId });
  }

  try {
    const jobId = idempotencyKey
      ? `analysis-${crypto.createHash('sha256').update(`${ownerId}:${idempotencyKey}`).digest('hex').slice(0, 48)}`
      : undefined;
    if (jobId) {
      const existingJob = await asyncQueue.getJob(jobId);
      if (existingJob) {
        try { fs.unlinkSync(ruta); } catch (error) { /* limpiar temporal duplicado */ }
        return res.status(202).json({
          jobId: String(existingJob.id),
          statusUrl: `/agent/analysis-jobs/${existingJob.id}`,
          correlationId: existingJob.data.correlationId
        });
      }
    }
    const job = await asyncQueue.add('analisis-completo', {
      filePath: ruta,
      ownerId,
      nombreOriginal: nombreOriginal || 'archivo_desconocido',
      archivoId: archivoId || generarUUID(),
      correlationId,
      planId
    }, jobId ? { jobId } : undefined);
    res.status(202).json({
      jobId: String(job.id),
      statusUrl: `/agent/analysis-jobs/${job.id}`,
      correlationId
    });
  } catch (error) {
    try { fs.unlinkSync(ruta); } catch (cleanupError) { /* ignorar */ }
    res.status(500).json({ error: 'No se pudo crear el trabajo', correlationId });
  }
});

app.get('/agent/analysis-jobs/:jobId', autenticarToken, async (req, res) => {
  const job = await asyncQueue.getJob(req.params.jobId);
  if (!job || job.data.ownerId !== req.agente?.ownerId) {
    return res.status(404).json({ error: 'Trabajo no encontrado' });
  }
  const estado = await job.getState();
  res.json({
    jobId: String(job.id),
    estado,
    progreso: job.progress(),
    resultado: estado === 'completed' ? job.returnvalue : undefined,
    error: stateIsFailed(estado) ? job.failedReason : undefined
  });
});

app.delete('/agent/analysis-jobs/:jobId', autenticarToken, async (req, res) => {
  const job = await asyncQueue.getJob(req.params.jobId);
  if (!job || job.data.ownerId !== req.agente?.ownerId) {
    return res.status(404).json({ error: 'Trabajo no encontrado' });
  }
  await job.remove();
  res.status(202).json({ jobId: String(job.id), estado: 'cancelled' });
});

function stateIsFailed(state) {
  return state === 'failed';
}

/**
 * POST /agent/execute
 * Endpoint principal para procesar análisis forense mediante células orquestadas.
 */
app.post('/agent/execute', rateLimiter, autenticarToken, async (req, res) => {
  let archivoBase64 = req.body.peticion?.archivo || null;

  try {
    const { agentId, peticion, configuracion } = req.body;
    let plan;
    let planId = 'fallback';

    // 1. Validación prematura del tipo MIME si hay archivo presente
    if (archivoBase64) {
      try {
        const buffer = Buffer.from(archivoBase64, 'base64');
        const tipo = await fileTypeFromBuffer(buffer);
        if (tipo && !validarMime(tipo.mime)) {
          return res.status(415).json({ error: `Tipo MIME no soportado: ${tipo.mime}` });
        }
      } catch (e) {
        console.warn('⚠️ No se pudo validar el MIME:', e.message);
      }
    }

    // 2. Determinación del Plan de Ejecución
    const modo = getModo();
    const configGlobal = JSON.parse(fs.readFileSync(path.join(__dirname, 'configuracion.json'), 'utf8'));
    const planIdPorDefecto = modo === 'limitado'
      ? configGlobal.defensa.segundaLinea.modoLimitadoPlanId
      : configGlobal.defensa.segundaLinea.modoNormalPlanId;

    if (configuracion?.plan) {
      plan = configuracion.plan;
      planId = plan.nombre || 'plan-literal';
    } else if (configuracion?.planId) {
      const planPath = path.join(__dirname, 'planes', `${configuracion.planId}.json`);
      if (!fs.existsSync(planPath)) {
        return res.status(404).json({ error: `Plan "${configuracion.planId}" no encontrado.` });
      }
      plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      planId = configuracion.planId;
    } else if (configuracion?.celulasIds && Array.isArray(configuracion.celulasIds)) {
      plan = generarPlanDesdeCelulas(configuracion.celulasIds, `plan-${agentId}-${Date.now()}`);
      planId = plan.nombre;
    } else if (configuracion?.tipoArchivo) {
      plan = planificar(configuracion.tipoArchivo, { agentId, archivo: archivoBase64, params: peticion?.params || {} });
      planId = plan.nombre || 'plan-auto';
    } else {
      const planPath = path.join(__dirname, 'planes', `${planIdPorDefecto}.json`);
      plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      planId = plan.nombre || 'default';
    }

    if (!plan) {
      return res.status(500).json({ error: 'No se pudo estructurar un plan de ejecución válido.' });
    }

    // 3. Preparación de la Entrada y Ejecución del Orquestador
    const entrada = {
      archivo: archivoBase64,
      params: peticion?.params || {},
      agentId: agentId,
      ...(peticion?.extra || {})
    };

    const orquestador = new Orquestador(plan);
    const resultado = await orquestador.ejecutar(entrada);

    // 4. Liberación inmediata de memoria de la solicitud entrante
    entrada.archivo = null;
    if (req.body.peticion) req.body.peticion.archivo = null;

    // 5. Identificadores de Trazabilidad
    const correlationId = resultado.correlationId || peticion?.extra?.correlationId || generarUUID();
    const archivoId = peticion?.extra?.archivoId || generarUUID();
    const usuarioId = peticion?.extra?.usuarioId || null;
    const nombreOriginal = peticion?.extra?.nombreOriginal || 'archivo_desconocido';
    const tipoArchivo = configuracion?.tipoArchivo || 'imagen';

    // 6. Transformación limpia en formato FAANG mediante Adaptador
    const resultadoFAANG = adaptarYEnriquecerResultado(
      resultado.resultado,
      {
        nombreOriginal,
        tipoArchivo,
        tiempoTotal: resultado.tiempoTotal,
        telemetria: resultado.telemetria
      },
      correlationId,
      archivoId,
      usuarioId
    );

    // 7. Purga de Memoria sobre la estructura de respuesta antes de enviar por HTTP
    const respuestaLimpia = purgarObjetosPesados(resultadoFAANG);

    // 8. Registro de Telemetría
    guardarTelemetria({
      planId: planId,
      celulasIds: plan.células.map(c => c.id),
      tiempoTotal: resultado.tiempoTotal,
      exito: true,
      correlationId: correlationId,
      telemetria: resultado.telemetria,
      agentId: agentId,
      tipoArchivo: tipoArchivo,
      planConfig: configuracion || null,
      groundTruth: peticion?.groundTruth || null,
      metadatosExtra: null,
      huellaDigital: archivoBase64 ? calcularHuellaDigital(archivoBase64) : null,
      tiemposPorCelula: resultado.telemetria.map(c => ({ celulaId: c.celulaId, tiempoMs: c.tiempoMs || 0 })),
      pesosCelulas: plan.células.map(c => ({ celulaId: c.id, peso: c.peso || 1 }))
    });

    // 9. Persistencia asíncrona en MongoDB (No bloqueante)
    if (mongoose.connection.readyState === 1) {
      setImmediate(async () => {
        try {
          let tamañoBytes = 0;
          let hashArchivo = null;
          if (archivoBase64) {
            const buf = Buffer.from(archivoBase64, 'base64');
            tamañoBytes = buf.length;
            hashArchivo = crypto.createHash('sha256').update(buf).digest('hex');
          }

          const db = mongoose.connection.db;
          await db.collection('ejecuciones').insertOne({
            correlationId,
            timestamp: new Date(),
            usuarioId,
            formato: tipoArchivo,
            tamañoBytes,
            hashArchivo,
            veredicto: {
              esIA: resultado.resultado?.esIA ?? false,
              confianza: resultado.resultado?.confianza ?? 0,
              explicacion: resultado.resultado?.explicacion || ''
            },
            scoreHumano: resultado.resultado?.confianza ? Math.round(resultado.resultado.confianza * 100) : 0,
            tiempoTotalMs: resultado.tiempoTotal || 0,
            resultadoCompleto: respuestaLimpia
          });
        } catch (e) {
          console.error('❌ Error registrando ejecución en MongoDB:', e.message);
        } finally {
          archivoBase64 = null;
        }
      });
    }

    // 10. Envío de Respuesta HTTP
    res.json(respuestaLimpia);

  } catch (error) {
    console.error('❌ Error en /agent/execute:', error.message);
    res.status(500).json({ status: 'error', error: error.message });
  } finally {
    archivoBase64 = null;
  }
});

// ============================================================
// 4. INICIALIZACIÓN DEL SERVIDOR
// ============================================================

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI no está configurado.');
    }
    if (process.env.ASYNC_WORKER_ONLY !== 'true') {
      await mongoose.connect(uri);
      console.log('✅ MongoDB conectado correctamente');
    }
  } catch (e) {
    console.error('❌ Error al conectar con MongoDB:', e.message);
  }

  if (process.env.ASYNC_WORKER_ONLY === 'true') {
    console.log(`👷 Worker async dedicado activo con concurrencia ${process.env.ASYNC_QUEUE_CONCURRENCY || '2'}`);
  } else {
    servidorHttp = app.listen(PORT, () => {
      console.log(`🤖 Agent Embassy escuchando en http://localhost:${PORT}`);
      console.log(`📚 Catálogo disponible en /agent/catalogo`);
      console.log(`🗂️ Planes disponibles en /agent/planes`);
      console.log(`🚀 Ejecución de agentes activa en /agent/execute`);
    });
  }
})();

async function apagarEmbassy(signal) {
  console.log(`🛑 Recibida señal ${signal}. Cerrando Embassy...`);
  if (servidorHttp) {
    await new Promise(resolve => servidorHttp.close(resolve));
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await Promise.race([
    asyncQueue.close(),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
}

process.once('SIGTERM', async () => {
  await apagarEmbassy('SIGTERM');
  process.exit(0);
});

process.once('SIGINT', async () => {
  await apagarEmbassy('SIGINT');
  process.exit(0);
});

export default app;
