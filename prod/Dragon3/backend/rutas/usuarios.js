/**
 * ====================================================================
 * DRAGON3 FAANG ENTERPRISE - RUTAS DE USUARIOS (AVANZADO, COMPLETO)
 * ====================================================================
 *
 * Archivo: rutas/usuarios.js
 * Proyecto: Dragon3 - Sistema de Autentificación de Imágenes con IA
 * Versión: 3.0.0 FAANG Enterprise
 * Fecha: 2025-07-18
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Rutas REST FAANG Enterprise para gestión de usuarios:
 * - Registro
 * - Login
 * - Perfil (GET)
 * - Actualización de datos/contraseña (PUT)
 * - Borrado de usuario (DELETE)
 * - Healthcheck (GET)
 *
 * Características:
 * - Logging Dragon ZEN API
 * - Correlation ID FAANG (end-to-end)
 * - JWT Auth profesional (middleware)
 * - Password hashing seguro (bcrypt)
 * - Validaciones robustas y unicidad
 * - Performance monitoring P95/metrics
 * - Seguridad y audit logging
 * - Documentación exhaustiva Enterprise
 *
 * COMPATIBILIDAD:
 * ✅ Dragon2/Dragon3
 * ✅ JWT/Bcrypt/Express
 * ✅ Estructura extensible y desacoplada
 *
 * ====================================================================
 */

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usuario from "../modelos/mongodb/Usuario.js";
import dragon from "../utilidades/logger.js";
import authMiddleware from "../middlewares/autentificacion.js"; // JWT Professional
import { requireRole } from "../middlewares/autorizacion.js";
import mongoose from "mongoose";

/**
 * ================================
 * CONFIGURACIÓN FAANG DRAGON3
 * ================================
 */
const USER_CONFIG = {
    TARGET_REGISTER_MS: 200,
    TARGET_LOGIN_MS: 100,
    TARGET_UPDATE_MS: 150,
    PASSWORD_MIN_LENGTH: 8,
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 32,
    JWT_EXPIRES_IN: "24h",
    BCRYPT_SALT_ROUNDS: 10,
    EMAIL_REGEX: /.+\@.+\..+/,
};

/**
 * ================================
 * MIDDLEWARES AUXILIARES FAANG
 * ================================
 */

/**
 * Middleware: Correlation ID Enterprise
 * Añade correlationId único a cada request para trazabilidad.
 */
const ensureCorrelationId = (req, res, next) => {
    req.correlationId = req.correlationId || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.set('X-Correlation-ID', req.correlationId);
    next();
};

/**
 * Middleware: Performance Tracking FAANG
 * Marca inicio de operación para métricas P95.
 */
const performanceTracker = (operationType) => (req, res, next) => {
    req.startTime = Date.now();
    req.operationType = operationType;
    next();
};

/**
 * Finalizar Performance Tracking + logging
 */
const finishPerformanceTracking = (req, target) => {
    if (req.startTime) {
        const duration = Date.now() - req.startTime;
        dragon.mideRendimiento(`usuarios_${req.operationType}`, duration, 'usuarios.js');
        const performance = duration < target ? 'optimal' : (duration < target * 2 ? 'acceptable' : 'slow');
        return { duration, performance };
    }
    return { duration: 0, performance: 'unknown' };
};

/**
 * ================================
 * EXPRESS ROUTER FAANG
 * ================================
 */
const router = express.Router();

/**
 * ====================================================================
 * POST /api/usuarios/registro - Registro de usuario (FAANG Standard)
 * ====================================================================
 * @body {string} username - Nombre de usuario único (3-32 chars)
 * @body {string} email - Email válido y único
 * @body {string} password - Contraseña segura (min 8 chars)
 * @returns {Object} Confirmación de registro
 * @performance Target: <200ms P95
 */
router.post("/registro", ensureCorrelationId, performanceTracker('register'), async (req, res) => {
    const correlationId = req.correlationId;
    try {
        const { username, email, password } = req.body;

        dragon.respira("Intento de registro de usuario", "usuarios.js", "REGISTER_START", {
            correlationId, username, email, ip: req.ip, userAgent: req.get('User-Agent')
        });

        // Validaciones FAANG
        if (!username || !email || !password) {
            dragon.sePreocupa("Registro fallido: campos incompletos", "usuarios.js", "REGISTER_INCOMPLETE_FIELDS", { correlationId, username, email });
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }
        if (typeof username !== "string" || username.length < USER_CONFIG.USERNAME_MIN_LENGTH || username.length > USER_CONFIG.USERNAME_MAX_LENGTH) {
            dragon.sePreocupa("Username inválido", "usuarios.js", "REGISTER_USERNAME_INVALID", { correlationId, username });
            return res.status(400).json({ error: `El nombre de usuario debe tener entre ${USER_CONFIG.USERNAME_MIN_LENGTH} y ${USER_CONFIG.USERNAME_MAX_LENGTH} caracteres.` });
        }
        if (!USER_CONFIG.EMAIL_REGEX.test(email)) {
            dragon.sePreocupa("Email inválido", "usuarios.js", "REGISTER_INVALID_EMAIL", { correlationId, email });
            return res.status(400).json({ error: "El email no es válido." });
        }
        if (typeof password !== "string" || password.length < USER_CONFIG.PASSWORD_MIN_LENGTH) {
            dragon.sePreocupa("Password corta", "usuarios.js", "REGISTER_SHORT_PASSWORD", { correlationId, username, email });
            return res.status(400).json({ error: `La contraseña debe tener al menos ${USER_CONFIG.PASSWORD_MIN_LENGTH} caracteres.` });
        }

        // Unicidad email/username
        const existe = await Usuario.findOne({ $or: [ { email: email.toLowerCase().trim() }, { username: username.trim() } ] });
        if (existe) {
            dragon.sePreocupa("Usuario/email ya existe", "usuarios.js", "REGISTER_USER_EXISTS", { correlationId, username, email });
            return res.status(409).json({ error: "El email o nombre de usuario ya está registrado." });
        }

        // Hash password y guardar usuario
        const salt = await bcrypt.genSalt(USER_CONFIG.BCRYPT_SALT_ROUNDS);
        const hashedPassword = await bcrypt.hash(password, salt);

        const nuevoUsuario = new Usuario({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: "normal",
            credits: 5,
            accountStatus: "active",
            audit: {
                createdBy: "usuarios_api",
                createdAt: new Date(),
                ipAddress: req.ip
            }
        });
        await nuevoUsuario.save();

        const perf = finishPerformanceTracking(req, USER_CONFIG.TARGET_REGISTER_MS);
        dragon.zen("Usuario registrado correctamente", "usuarios.js", "REGISTER_SUCCESS", {
            correlationId, userId: nuevoUsuario._id, username, email, duration: perf.duration, performance: perf.performance
        });

        res.status(201).json({ message: "Usuario registrado correctamente" });

    } catch (error) {
        const perf = finishPerformanceTracking(req, USER_CONFIG.TARGET_REGISTER_MS);
        dragon.agoniza("Error crítico en registro usuario", error, "usuarios.js", "REGISTER_ERROR", {
            correlationId, duration: perf.duration, errorName: error.name, stack: error.stack
        });
        res.status(500).json({ error: "Error en el servidor" });
    }
});

/**
 * ====================================================================
 * POST /api/usuarios/login - Login de usuario (FAANG Standard)
 * ====================================================================
 * @body {string} username - Nombre de usuario o email
 * @body {string} password - Contraseña
 * @returns {Object} JWT token y confirmación
 * @performance Target: <100ms P95
 */
router.post("/login", ensureCorrelationId, performanceTracker('login'), async (req, res) => {
    const correlationId = req.correlationId;
    try {
        const { username, password } = req.body;

        dragon.respira("Intento de login de usuario", "usuarios.js", "LOGIN_START", {
            correlationId, username, ip: req.ip, userAgent: req.get('User-Agent')
        });

        if (!username || !password) {
            dragon.sePreocupa("Campos incompletos en login", "usuarios.js", "LOGIN_INCOMPLETE_FIELDS", { correlationId, username });
            return res.status(400).json({ error: "Todos los campos son obligatorios." });
        }

        // Permite login por username o email
        const usuario = await Usuario.findOne({
            $or: [
                { username: username.trim() },
                { email: username.toLowerCase().trim() }
            ]
        });
        if (!usuario) {
            dragon.sePreocupa("Usuario no encontrado en login", "usuarios.js", "LOGIN_USER_NOT_FOUND", { correlationId, username });
            return res.status(400).json({ error: "Usuario o contraseña incorrectos." });
        }

        if (usuario.accountStatus && usuario.accountStatus !== 'active') {
            dragon.sePreocupa("Cuenta inactiva", "usuarios.js", "LOGIN_ACCOUNT_INACTIVE", { correlationId, userId: usuario._id, username, status: usuario.accountStatus });
            return res.status(403).json({ error: "Cuenta no activa." });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            dragon.sePreocupa("Password incorrecta en login", "usuarios.js", "LOGIN_INVALID_PASSWORD", { correlationId, userId: usuario._id });
            return res.status(400).json({ error: "Usuario o contraseña incorrectos." });
        }

        const token = jwt.sign(
            { id: usuario._id, role: usuario.role || "user" },
            process.env.JWT_SECRET || 'dragon3_jwt_fallback_secret',
            { expiresIn: USER_CONFIG.JWT_EXPIRES_IN }
        );

        const perf = finishPerformanceTracking(req, USER_CONFIG.TARGET_LOGIN_MS);
        dragon.zen("Login exitoso", "usuarios.js", "LOGIN_SUCCESS", { correlationId, userId: usuario._id, username, duration: perf.duration, performance: perf.performance });

        res.json({ message: "Login correcto", token });

    } catch (error) {
        const perf = finishPerformanceTracking(req, USER_CONFIG.TARGET_LOGIN_MS);
        dragon.agoniza("Error crítico en login", error, "usuarios.js", "LOGIN_ERROR", { correlationId, duration: perf.duration, errorName: error.name, stack: error.stack });
        res.status(500).json({ error: "Error en el servidor" });
    }
});

/**
 * ====================================================================
 * GET /api/usuarios/:id/perfil - Ver perfil de cualquier usuario (solo superadmin)
 * ====================================================================
 * Permite al superadmin consultar el perfil de cualquier usuario del sistema.
 * @header {string} Authorization - Bearer JWT token (superadmin)
 * @param {string} id - ID del usuario a consultar
 * @returns {Object} Perfil del usuario (sin password)
 * @audit Logging Dragon3, correlationId, requestedBy
 * @security requireRole(['superadmin'])
 */
router.get(
  "/:id/perfil",
  ensureCorrelationId,
  authMiddleware,
  requireRole(['superadmin']),
  async (req, res) => {
    const correlationId = req.correlationId;
    const userId = req.params.id;

    // Validación ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      dragon.sePreocupa("ID de usuario inválido", "usuarios.js", "INVALID_USER_ID", { correlationId, userId });
      return res.status(400).json({ error: "ID de usuario no válido." });
    }

    try {
      const usuario = await Usuario.findById(userId).select("-password");
      if (!usuario) {
        dragon.sePreocupa(
          "Perfil no encontrado (superadmin)",
          "usuarios.js",
          "PROFILE_SUPERADMIN_NOT_FOUND",
          { correlationId, userId }
        );
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      dragon.sonrie(
        "Perfil consultado por superadmin",
        "usuarios.js",
        "PROFILE_SUPERADMIN_SUCCESS",
        { correlationId, userId, requestedBy: req.usuario?.id }
      );
      res.json(usuario);
    } catch (error) {
      dragon.agoniza(
        "Error en consulta de perfil (superadmin)",
        error,
        "usuarios.js",
        "PROFILE_SUPERADMIN_ERROR",
        { correlationId }
      );
      res.status(500).json({ error: "Error en el servidor" });
    }
  }
);

/**
 * ====================================================================
 * PUT /api/usuarios/:id/actualizar - Actualizar cualquier usuario (solo superadmin)
 * ====================================================================
 * Permite al superadmin actualizar cualquier campo relevante de cualquier usuario.
 * Valida unicidad de username/email y formato de email.
 * @header {string} Authorization - Bearer JWT token (superadmin)
 * @param {string} id - ID del usuario a actualizar
 * @body {string} [username] - Nuevo username (opcional)
 * @body {string} [email] - Nuevo email (opcional)
 * @body {string} [password] - Nueva contraseña (opcional)
 * @body {string} [role] - Nuevo rol (opcional)
 * @body {number} [credits] - Créditos (opcional)
 * @body {string} [accountStatus] - Estado de cuenta (opcional)
 * @returns {Object} Usuario actualizado
 * @audit Logging Dragon3, correlationId, updatedBy
 * @security requireRole(['superadmin'])
 */
router.put(
  "/:id/actualizar",
  ensureCorrelationId,
  authMiddleware,
  requireRole(['superadmin']),
  async (req, res) => {
    const correlationId = req.correlationId;
    const userId = req.params.id;

    // Validación ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      dragon.sePreocupa("ID de usuario inválido", "usuarios.js", "INVALID_USER_ID", { correlationId, userId });
      return res.status(400).json({ error: "ID de usuario no válido." });
    }

    // Evita que el superadmin se automodifique aquí (opcional, recomendado)
    if (userId === req.usuario?.id) {
      dragon.sePreocupa("Intento de auto-actualización superadmin", "usuarios.js", "SUPERADMIN_SELF_UPDATE", { correlationId, userId });
      return res.status(400).json({ error: "No puedes modificar tu propio usuario desde esta ruta." });
    }

    const { username, email, password, role, credits, accountStatus } = req.body;
    const updateData = {};

    // Validación y unicidad
    if (username) {
      const existe = await Usuario.findOne({ username: username.trim(), _id: { $ne: userId } });
      if (existe) {
        dragon.sePreocupa("Username ya existe", "usuarios.js", "UPDATE_SUPERADMIN_USERNAME_EXISTS", { correlationId, username });
        return res.status(409).json({ error: "El nombre de usuario ya está en uso." });
      }
      updateData.username = username.trim();
    }
    if (email) {
      if (!USER_CONFIG.EMAIL_REGEX.test(email)) {
        dragon.sePreocupa("Email inválido en actualización", "usuarios.js", "UPDATE_SUPERADMIN_INVALID_EMAIL", { correlationId, email });
        return res.status(400).json({ error: "El email no es válido." });
      }
      const existe = await Usuario.findOne({ email: email.toLowerCase().trim(), _id: { $ne: userId } });
      if (existe) {
        dragon.sePreocupa("Email ya existe", "usuarios.js", "UPDATE_SUPERADMIN_EMAIL_EXISTS", { correlationId, email });
        return res.status(409).json({ error: "El email ya está en uso." });
      }
      updateData.email = email.toLowerCase().trim();
    }
    if (password) {
      if (typeof password !== "string" || password.length < USER_CONFIG.PASSWORD_MIN_LENGTH) {
        dragon.sePreocupa("Password corta en actualización", "usuarios.js", "UPDATE_SUPERADMIN_SHORT_PASSWORD", { correlationId });
        return res.status(400).json({ error: `La contraseña debe tener al menos ${USER_CONFIG.PASSWORD_MIN_LENGTH} caracteres.` });
      }
      const salt = await bcrypt.genSalt(USER_CONFIG.BCRYPT_SALT_ROUNDS);
      updateData.password = await bcrypt.hash(password, salt);
    }
    if (role) {
      // Validar que el rol es uno de los permitidos en Dragon3
      const ROLES_VALIDOS = ['normal', 'enterprise', 'admin', 'superadmin'];
      if (!ROLES_VALIDOS.includes(role)) {
        dragon.sePreocupa("Rol no válido en actualización", "usuarios.js", "UPDATE_SUPERADMIN_INVALID_ROLE", { correlationId, role });
        return res.status(400).json({ error: "Rol no válido." });
      }
      updateData.role = role;
      // Recarga usuario para obtener tokenVersion actual y invalidar tokens previos
      const usuario = await Usuario.findById(userId).select("tokenVersion");
      updateData.tokenVersion = (usuario?.tokenVersion || 0) + 1;
    }
    if (credits !== undefined) updateData.credits = credits;
    if (accountStatus) updateData.accountStatus = accountStatus;
    updateData['audit.modifiedAt'] = new Date();
    updateData['audit.modifiedBy'] = req.usuario?.id;

    try {
      const usuarioActualizado = await Usuario.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true, context: 'query' }
      ).select("-password");
      if (!usuarioActualizado) {
        dragon.sePreocupa(
          "No se encontró usuario para actualizar (superadmin)",
          "usuarios.js",
          "UPDATE_SUPERADMIN_USER_NOT_FOUND",
          { correlationId, userId }
        );
        return res.status(404).json({ error: "Usuario no encontrado." });
      }
      dragon.zen(
        "Usuario actualizado por superadmin",
        "usuarios.js",
        "UPDATE_SUPERADMIN_SUCCESS",
        { correlationId, userId, updatedBy: req.usuario?.id }
      );
      res.json({ message: "Usuario actualizado correctamente", usuario: usuarioActualizado });
    } catch (error) {
      dragon.agoniza(
        "Error crítico en actualización usuario (superadmin)",
        error,
        "usuarios.js",
        "UPDATE_SUPERADMIN_ERROR",
        { correlationId }
      );
      res.status(500).json({ error: "Error en el servidor" });
    }
  }
);

/**
 * ====================================================================
 * DELETE /api/usuarios/:id/borrar - Eliminar cualquier usuario (solo superadmin)
 * ====================================================================
 * Permite al superadmin eliminar cualquier usuario del sistema.
 * @header {string} Authorization - Bearer JWT token (superadmin)
 * @param {string} id - ID del usuario a eliminar
 * @returns {Object} Confirmación de borrado
 * @audit Logging Dragon3, correlationId, deletedBy
 * @security requireRole(['superadmin'])
 */
router.delete(
  "/:id/borrar",
  ensureCorrelationId,
  authMiddleware,
  requireRole(['superadmin']),
  async (req, res) => {
    const correlationId = req.correlationId;
    const userId = req.params.id;

    // Validación ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      dragon.sePreocupa("ID de usuario inválido", "usuarios.js", "INVALID_USER_ID", { correlationId, userId });
      return res.status(400).json({ error: "ID de usuario no válido." });
    }

    // Evita que el superadmin se borre a sí mismo
    if (userId === req.usuario?.id) {
      dragon.sePreocupa("Intento de auto-eliminación superadmin", "usuarios.js", "SUPERADMIN_SELF_DELETE", { correlationId, userId });
      return res.status(400).json({ error: "No puedes borrar tu propio usuario desde esta ruta." });
    }

    try {
      const usuario = await Usuario.findByIdAndDelete(userId);
      if (!usuario) {
        dragon.sePreocupa(
          "No se encontró usuario para borrar (superadmin)",
          "usuarios.js",
          "DELETE_SUPERADMIN_USER_NOT_FOUND",
          { correlationId, userId }
        );
        return res.status(404).json({ error: "Usuario no encontrado." });
      }
      dragon.zen(
        "Usuario eliminado por superadmin",
        "usuarios.js",
        "DELETE_SUPERADMIN_SUCCESS",
        { correlationId, userId, deletedBy: req.usuario?.id }
      );
      res.json({ message: `Usuario ${userId} eliminado correctamente` });
    } catch (error) {
      dragon.agoniza(
        "Error crítico borrando usuario (superadmin)",
        error,
        "usuarios.js",
        "DELETE_SUPERADMIN_ERROR",
        { correlationId }
      );
      res.status(500).json({ error: "Error en el servidor" });
    }
  }
);
/**
 * ====================================================================
 * GET /api/usuarios/perfil - Obtener perfil FAANG (requiere JWT)
 * ====================================================================
 * @header {string} Authorization - Bearer JWT token
 * @returns {Object} Perfil del usuario autenticado (sin password)
 */
router.get("/perfil", ensureCorrelationId, authMiddleware, async (req, res) => {
    const correlationId = req.correlationId;
    try {
        const userId = req.usuario?.id || req.usuario?._id;
        const usuario = await Usuario.findById(userId).select("-password");
        if (!usuario) {
            dragon.sePreocupa("Perfil no encontrado", "usuarios.js", "PROFILE_NOT_FOUND", { correlationId, userId });
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        dragon.sonrie("Perfil consultado correctamente", "usuarios.js", "PROFILE_SUCCESS", { correlationId, userId });
        res.json(usuario);
    } catch (error) {
        dragon.agoniza("Error en consulta de perfil", error, "usuarios.js", "PROFILE_ERROR", { correlationId });
        res.status(500).json({ error: "Error en el servidor" });
    }
});

/**
 * ====================================================================
 * GET /api/usuarios/ - Listado global de usuarios (solo superadmin)
 * ====================================================================
 * Devuelve la lista de todos los usuarios (sin contraseñas).
 * @header {string} Authorization - Bearer JWT token (superadmin)
 * @returns {Object[]} Array de usuarios
 * @audit Logging Dragon3, correlationId, requestedBy
 * @security requireRole(['superadmin'])
 */
router.get(
  "/",
  ensureCorrelationId,
  authMiddleware,
  requireRole(['superadmin']),
  async (req, res) => {
    const correlationId = req.correlationId;
    try {
      const usuarios = await Usuario.find().select("-password");
      dragon.sonrie(
        "Listado global de usuarios consultado por superadmin",
        "usuarios.js",
        "LIST_USERS_SUPERADMIN_SUCCESS",
        { correlationId, requestedBy: req.usuario?.id, count: usuarios.length }
      );
      res.json({ usuarios });
    } catch (error) {
      dragon.agoniza(
        "Error crítico en listado global de usuarios (superadmin)",
        error,
        "usuarios.js",
        "LIST_USERS_SUPERADMIN_ERROR",
        { correlationId }
      );
      res.status(500).json({ error: "Error en el servidor" });
    }
  }
);

/**
 * ====================================================================
 * PUT /api/usuarios/actualizar - Actualizar perfil/contraseña FAANG
 * ====================================================================
 * @header {string} Authorization - Bearer JWT token
 * @body {string} username - Nuevo nombre (opcional)
 * @body {string} email - Nuevo email (opcional)
 * @body {string} password - Nueva contraseña (opcional)
 * @returns {Object} Usuario actualizado
 */
router.put("/actualizar", ensureCorrelationId, authMiddleware, async (req, res) => {
    const correlationId = req.correlationId;
    try {
        const userId = req.usuario?.id || req.usuario?._id;
        const { username, email, password } = req.body;
        const updateData = {};

        // Validaciones y construcción del update
        if (username) {
            if (typeof username !== "string" || username.length < USER_CONFIG.USERNAME_MIN_LENGTH || username.length > USER_CONFIG.USERNAME_MAX_LENGTH) {
                dragon.sePreocupa("Username inválido en actualización", "usuarios.js", "UPDATE_INVALID_USERNAME", { correlationId, username });
                return res.status(400).json({ error: `El nombre de usuario debe tener entre ${USER_CONFIG.USERNAME_MIN_LENGTH} y ${USER_CONFIG.USERNAME_MAX_LENGTH} caracteres.` });
            }
            const existe = await Usuario.findOne({ username: username.trim(), _id: { $ne: userId } });
            if (existe) {
                dragon.sePreocupa("Username ya existe", "usuarios.js", "UPDATE_USERNAME_EXISTS", { correlationId, username });
                return res.status(409).json({ error: "El nombre de usuario ya está en uso." });
            }
            updateData.username = username.trim();
        }
        if (email) {
            if (!USER_CONFIG.EMAIL_REGEX.test(email)) {
                dragon.sePreocupa("Email inválido en actualización", "usuarios.js", "UPDATE_INVALID_EMAIL", { correlationId, email });
                return res.status(400).json({ error: "El email no es válido." });
            }
            const existe = await Usuario.findOne({ email: email.toLowerCase().trim(), _id: { $ne: userId } });
            if (existe) {
                dragon.sePreocupa("Email ya existe", "usuarios.js", "UPDATE_EMAIL_EXISTS", { correlationId, email });
                return res.status(409).json({ error: "El email ya está en uso." });
            }
            updateData.email = email.toLowerCase().trim();
        }
        if (password) {
            if (typeof password !== "string" || password.length < USER_CONFIG.PASSWORD_MIN_LENGTH) {
                dragon.sePreocupa("Password corta en actualización", "usuarios.js", "UPDATE_SHORT_PASSWORD", { correlationId });
                return res.status(400).json({ error: `La contraseña debe tener al menos ${USER_CONFIG.PASSWORD_MIN_LENGTH} caracteres.` });
            }
            const salt = await bcrypt.genSalt(USER_CONFIG.BCRYPT_SALT_ROUNDS);
            updateData.password = await bcrypt.hash(password, salt);
        }

        // Audit info
        updateData['audit.modifiedAt'] = new Date();
        updateData['audit.modifiedBy'] = userId;

        const usuarioActualizado = await Usuario.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true, context: 'query' }
        ).select("-password");
        if (!usuarioActualizado) {
            dragon.sePreocupa("No se encontró usuario para actualizar", "usuarios.js", "UPDATE_USER_NOT_FOUND", { correlationId, userId });
            return res.status(404).json({ error: "Usuario no encontrado." });
        }
        dragon.zen("Usuario actualizado correctamente", "usuarios.js", "UPDATE_SUCCESS", { correlationId, userId });
        res.json({ message: "Usuario actualizado correctamente", usuario: usuarioActualizado });

    } catch (error) {
        dragon.agoniza("Error crítico en actualización usuario", error, "usuarios.js", "UPDATE_ERROR", { correlationId });
        res.status(500).json({ error: "Error en el servidor" });
    }
});

/**
 * ====================================================================
 * DELETE /api/usuarios/borrar - Eliminar usuario FAANG (requiere JWT)
 * ====================================================================
 * @header {string} Authorization - Bearer JWT token
 * @returns {Object} Confirmación de borrado
 */
router.delete("/borrar", ensureCorrelationId, authMiddleware, async (req, res) => {
    const correlationId = req.correlationId;
    try {
        const userId = req.usuario?.id || req.usuario?._id;
        await Usuario.findByIdAndDelete(userId);
        dragon.zen("Usuario borrado correctamente", "usuarios.js", "DELETE_SUCCESS", { correlationId, userId });
        res.json({ message: "Usuario borrado correctamente" });
    } catch (error) {
        dragon.agoniza("Error crítico borrando usuario", error, "usuarios.js", "DELETE_ERROR", { correlationId });
        res.status(500).json({ error: "Error en el servidor" });
    }
});

/**
 * ====================================================================
 * GET /api/usuarios/health - Health check FAANG Enterprise
 * ====================================================================
 * @returns {Object} Estado del sistema de usuarios
 */
router.get("/health", ensureCorrelationId, (req, res) => {
    const correlationId = req.correlationId;
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        correlationId,
        metrics: {
            registerMs: USER_CONFIG.TARGET_REGISTER_MS,
            loginMs: USER_CONFIG.TARGET_LOGIN_MS,
            updateMs: USER_CONFIG.TARGET_UPDATE_MS
        }
    });
});

/**
 * ====================================================================
 * NOTAS DE IMPLEMENTACIÓN DRAGON3 FAANG:
 * - Estructura Express Router estandarizada para Enterprise
 * - Logging Dragon3 (respira, sePreocupa, zen, agoniza, sonrie)
 * - Correlation ID y performance métrics para trazabilidad total
 * - Validación avanzada y mensajes de error claros
 * - Seguridad FAANG: hash, JWT, unicidad, status de cuenta
 * - Preparado para extensión a endpoints de perfil, actualización y auditoría
 * ====================================================================
 */

export default router;
