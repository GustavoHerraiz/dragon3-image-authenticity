/**
 * ====================================================================
 * DRAGON3 - SERVIDOR CON EMBASSY (VERSIÓN PRODUCCIÓN)
 * ====================================================================
 *
 * Este servidor Express actúa como punto de entrada HTTP para el frontend.
 * Delega todo el análisis de imágenes al Agent Embassy (puerto 3002),
 * que gestiona colas, orquestador, sistema de defensa, evolución y adaptador FAANG.
 *
 * Funcionalidades:
 * - Autenticación JWT para rutas privadas.
 * - Subida de archivos con Multer (validación MIME, límite 100MB).
 * - Selección dinámica del plan según el tipo de archivo (mimetype).
 * - Proxy hacia /agent/execute del Embassy.
 * - Health check y frontend estático.
 * - Trazabilidad con correlationId y archivoId.
 *
 * Dependencias:
 * - Express, Multer, JWT, MongoDB (opcional), UUID, node-fetch.
 *
 * @module server
 * @version 2.0.0
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import fetch from 'node-fetch';

// ============================================================
// 1. CONFIGURACIÓN INICIAL
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno (usando .env en producción)
dotenv.config({ path: path.resolve(__dirname, './.env') });

const MODULE_NAME = 'server-embassy';
const VERSION = '2.0.0';
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mi-secreto-temporal-123';
const EMBASSY_URL = process.env.EMBASSY_URL || 'http://localhost:3002';
const EMBASSY_EXECUTE_ENDPOINT = `${EMBASSY_URL}/agent/execute`;

console.log(`🔧 [${MODULE_NAME}] Variables de entorno cargadas`);
console.log(`🤖 Embassy URL: ${EMBASSY_URL}`);

// ============================================================
// 2. CONEXIÓN A MONGODB (OPCIONAL)
// ============================================================
// Solo se usa para mantener sesión o guardar análisis, pero no es crítico.
let mongoConnection = null;

async function conectarMongoDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    mongoConnection = mongoose.connection;
    console.log(`✅ [${MODULE_NAME}] MongoDB conectado`);
  } catch (error) {
    console.error(`❌ [${MODULE_NAME}] Error conectando MongoDB:`, error.message);
    // No detenemos el servidor si MongoDB falla (opcional)
  }
}

// ============================================================
// 3. EXPRESS - CONFIGURACIÓN
// ============================================================

const app = express();

// Middlewares de seguridad y rendimiento
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Correlation ID para trazabilidad
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.startTime = Date.now();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// ============================================================
// 4. MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================================

/**
 * Middleware que verifica el token JWT en el header Authorization.
 * Si es válido, añade `req.usuario` con los datos decodificados.
 * Si no, devuelve 401 o 403.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido', correlationId: req.correlationId });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido', correlationId: req.correlationId });
  }
}

// ============================================================
// 5. MULTER - CONFIGURACIÓN DE SUBIDA
// ============================================================

const uploadPath = path.resolve(__dirname, 'uploads/temporal');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${base}-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'video/mp4'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});

// ============================================================
// 6. FUNCIÓN PARA LLAMAR AL EMBASSY
// ============================================================

/**
 * Lee el archivo subido, lo convierte a base64, genera un token JWT
 * para el Embassy y envía la petición a /agent/execute.
 *
 * @param {string} filePath - Ruta del archivo temporal.
 * @param {string} nombreOriginal - Nombre original del archivo.
 * @param {string} correlationId - ID de correlación.
 * @param {string} archivoId - ID único del análisis.
 * @param {string|null} usuarioId - ID del usuario (si autenticado).
 * @param {string} planId - ID del plan a ejecutar (por defecto 'analizar-imagen-completa').
 * @returns {Promise<Object>} Respuesta del Embassy en formato FAANG.
 */
async function llamarEmbassy(
  filePath,
  nombreOriginal,
  correlationId,
  archivoId,
  usuarioId = null,
  planId = 'analizar-imagen-completa'
) {
  // Leer archivo y convertirlo a base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');

  // Generar token JWT para el Embassy (usamos el mismo secret, pero podríamos usar otro)
  const token = jwt.sign(
    {
      agentId: 'dragon3-internal',
      nivel: 'confianza' // Puede ser 'publico', 'habitual', 'confianza'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Construir payload según lo que espera el Embassy
  const payload = {
    token,
    agentId: 'dragon3-internal',
    peticion: {
      archivo: base64,
      params: {}, // Parámetros adicionales si se necesitan
      extra: {
        archivoId,
        nombreOriginal,
        usuarioId,
        correlationId
      }
    },
    configuracion: {
      planId, // Usar el plan que ya está corregido con rutas absolutas
      // También podríamos usar tipoArchivo para auto-detección:
      // tipoArchivo: 'imagen'
    }
  };

  console.log(`📡 [${MODULE_NAME}] Llamando al Embassy con plan: ${planId}`);

  const response = await fetch(EMBASSY_EXECUTE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embassy error ${response.status}: ${errorText}`);
  }

  // El Embassy ya devuelve el formato FAANG completo (con resultado, imagenId, etc.)
  return await response.json();
}

// ============================================================
// 7. RUTAS
// ============================================================

// 7.1 Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
    services: {
      mongodb: mongoConnection?.readyState === 1 ? 'connected' : 'disconnected',
      embassy: EMBASSY_URL
    }
  });
});

/**
 * Determina el plan a ejecutar según el tipo MIME del archivo subido.
 * @param {string} mimetype - Tipo MIME del archivo.
 * @returns {string} ID del plan.
 */
function seleccionarPlanPorMimetype(mimetype) {
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    return 'analizar-imagen-completa';   // Plan con ML (XGBoost)
  } else if (mimetype === 'image/png') {
    return 'analizar-imagen-sin-ml';     // Plan sin ML (para PNG)
  } else {
    // Para otros formatos (webp, pdf, etc.) usamos el plan sin ML por defecto
    return 'analizar-imagen-sin-ml';
  }
}

// 7.2 Análisis público (sin autenticación)
app.post('/analizar-imagen-publico', upload.single('archivo'), async (req, res) => {
  const correlationId = req.correlationId;
  const archivoId = uuidv4();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo', correlationId });
    }

    // Seleccionar plan según el tipo MIME
    const planId = seleccionarPlanPorMimetype(req.file.mimetype);

    console.log(`📤 [${MODULE_NAME}] Análisis público iniciado: ${req.file.originalname} (${correlationId}) - Plan: ${planId}`);

    const resultado = await llamarEmbassy(
      req.file.path,
      req.file.originalname,
      correlationId,
      archivoId,
      null, // usuarioId
      planId
    );

    // Limpiar archivo temporal
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignorar */ }

    // El resultado ya es el FAANG completo
    res.json(resultado);
  } catch (error) {
    console.error(`❌ [${MODULE_NAME}] Error en análisis público:`, error.message);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({
      error: 'Error en el servidor',
      correlationId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 7.3 Análisis autenticado
app.post('/api/analizar-imagen', authMiddleware, upload.single('archivo'), async (req, res) => {
  const correlationId = req.correlationId;
  const archivoId = uuidv4();
  const usuarioId = req.usuario?.id || req.usuario?.userId || null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo', correlationId });
    }

    // Seleccionar plan según el tipo MIME
    const planId = seleccionarPlanPorMimetype(req.file.mimetype);

    console.log(`📤 [${MODULE_NAME}] Análisis autenticado: ${req.file.originalname} (${correlationId}, usuario: ${usuarioId}) - Plan: ${planId}`);

    const resultado = await llamarEmbassy(
      req.file.path,
      req.file.originalname,
      correlationId,
      archivoId,
      usuarioId,
      planId
    );

    // Limpiar archivo temporal
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    // Aquí podrías guardar en MongoDB si lo necesitas
    // const analisis = new AnalisisArchivo({ ... });
    // await analisis.save();

    res.json(resultado);
  } catch (error) {
    console.error(`❌ [${MODULE_NAME}] Error en análisis autenticado:`, error.message);
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({
      error: 'Error en el servidor',
      correlationId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 7.4 Frontend estático (opcional)
const frontendPath = path.resolve(__dirname, '../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
  app.get('/analizar-imagen-publico.html', (req, res) => {
    res.sendFile(path.join(frontendPath, 'analizar-imagen-publico.html'));
  });
  console.log(`🌐 [${MODULE_NAME}] Frontend servido desde: ${frontendPath}`);
} else {
  console.warn(`⚠️ [${MODULE_NAME}] Frontend no encontrado en: ${frontendPath}`);
}

// ============================================================
// 8. INICIAR SERVIDOR
// ============================================================

async function startServer() {
  // Conectar MongoDB (opcional, no crítico)
  await conectarMongoDB();

  // Iniciar Express
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 [${MODULE_NAME}] Servidor Dragon3 (con Embassy) en http://localhost:${PORT}`);
    console.log(`📚 Health: http://localhost:${PORT}/health`);
    console.log(`🔍 Análisis público: http://localhost:${PORT}/analizar-imagen-publico`);
    console.log(`🔒 Análisis autenticado: http://localhost:${PORT}/api/analizar-imagen`);
    console.log(`🤖 Embassy en: ${EMBASSY_URL}`);
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal) => {
    console.log(`🛑 [${MODULE_NAME}] Recibido ${signal}, cerrando...`);
    server.close(() => {
      console.log('✅ Servidor HTTP cerrado');
    });
    if (mongoConnection) {
      await mongoose.disconnect();
      console.log('✅ MongoDB desconectado');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

// ============================================================
// 9. EJECUCIÓN
// ============================================================

startServer().catch(error => {
  console.error(`❌ [${MODULE_NAME}] Error al iniciar:`, error);
  process.exit(1);
});

// ============================================================
// 10. EXPORTACIÓN (por si se necesita en pruebas)
// ============================================================

export default app;
