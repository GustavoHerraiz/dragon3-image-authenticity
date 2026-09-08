/**
 * ====================================================================
 * DRAGON3 - MIDDLEWARE DE AUTORIZACIÓN POR ROL (FAANG Enterprise)
 * ====================================================================
 * Permite restringir acceso a rutas según rol de usuario.
 * Uso: requireRole(['admin','superadmin'])
 * Gustavo Herraiz © 2025
 * ====================================================================
 */

export function requireRole(roles = []) {
  return (req, res, next) => {
    const userRole = req.usuario?.role || 'normal';
    if (!roles.includes(userRole)) {
      // Logging profesional (puedes cambiar por dragon.sePreocupa si tienes logging)
      if (req.correlationId && typeof dragon !== 'undefined') {
        dragon.sePreocupa(
          `Intento de acceso no autorizado: rol=${userRole}, requiere=${roles.join(',')}`,
          "autorizacion.js",
          "ROLE_FORBIDDEN",
          { correlationId: req.correlationId, userId: req.usuario?.id }
        );
      }
      return res.status(403).json({ error: "No autorizado", requiredRoles: roles, userRole });
    }
    next();
  };
}
