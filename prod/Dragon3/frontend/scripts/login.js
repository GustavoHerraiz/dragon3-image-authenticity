/**
 * ====================================================================
 * Dragon3 - scripts/login.js (FAANG Enterprise, métricas frontend)
 * ====================================================================
 * Login seguro y FAANG/KISS, perfectamente alineado a backend (server.js, auth.js).
 * - Cumple con endpoint y payload exactos de la API.
 * - UX robusta, errores claros y navegación fluida.
 * - Sin console.log, solo reporting estructurado si se requiere.
 * - Integra métricas frontend: visitas, intentos, éxito, fallos.
 * ====================================================================
 */

/**
 * Helper FAANG Enterprise para enviar métricas frontend al backend
 * @param {string} evento - Tipo de evento (ej: 'visita_login', 'login_exito', 'login_fallo')
 * @param {object} detalle - Detalles adicionales (email, error, etc)
 */
function enviarMetricaFrontend(evento, detalle = {}) {
  try {
    fetch('/api/metricas-frontend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evento,
        detalle,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.pathname
      })
    });
  } catch(e) {
    // Sin console.log, solo protección
  }
}

document.addEventListener('DOMContentLoaded', function() {
  /**
   * Helper FAANG para obtener elementos por ID.
   * @param {string} id
   * @returns {HTMLElement}
   */
  const $ = (id) => document.getElementById(id);

  // Elementos clave del DOM
  const form = $('loginForm');
  const errorDiv = $('loginError');
  const btnGoRegister = $('btnGoRegister');

  // --- Métrica: visita página login ---
  enviarMetricaFrontend('visita_login', { pagina: 'login.html' });

  /**
   * Limpia y oculta los mensajes de error.
   */
  function limpiarError() {
    errorDiv.textContent = '';
    errorDiv.classList.add('oculto');
  }

  /**
   * Muestra un mensaje de error claro y accesible.
   * @param {string} mensaje
   * @param {string} [email] - Email usado en el intento (opcional, para métricas)
   */
  function mostrarError(mensaje, email) {
    errorDiv.textContent = mensaje;
    errorDiv.classList.remove('oculto');
    // Reporta a métricas frontend
    enviarMetricaFrontend('login_fallo', { mensaje, email });
  }

  /**
   * Maneja el login correctamente, UX y storage.
   * @param {string} token - JWT entregado por el backend
   * @param {string} email - Email usado en el login (para métricas)
   */
  function loginExitoso(token, email) {
    localStorage.setItem('token', token);
    // Reporta a métricas frontend
    enviarMetricaFrontend('login_exito', { email });
    window.location.href = 'mi-espacio.html';
  }

  /**
   * Evento principal de login FAANG/KISS.
   */
  form.onsubmit = async function(ev) {
    ev.preventDefault();
    limpiarError();

    // El input del usuario es "usuario o email" pero el backend espera "email"
    const email = this.email.value.trim();
    const password = this.password.value;

    // Validación mínima FAANG antes de enviar
    if (!email || !password) {
      mostrarError('Debes introducir usuario/email y contraseña.', email);
      return;
    }

    // Métrica: intento de login
    enviarMetricaFrontend('login_intento', { email });

    // Construcción segura del payload
    const payload = { email, password };

    try {
      // Envío al endpoint backend exacto
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Respuesta siempre en JSON
      const data = await res.json();

      // Manejo de errores backend o red
      if (!res.ok || !data.token) {
        mostrarError(data.error || 'Login incorrecto. Verifica tus datos.', email);
        return;
      }

      // Login exitoso
      loginExitoso(data.token, email);

    } catch(e) {
      mostrarError('No se pudo conectar con el servidor. Inténtalo de nuevo más tarde.', email);
      // Métrica de error de red
      enviarMetricaFrontend('login_error_red', { error: e.message, email });
    }
  };

  /**
   * Navegación UX: botón para ir a registro.
   */
  btnGoRegister.onclick = () => {
    enviarMetricaFrontend('click', { elemento: 'btnGoRegister', pagina: 'login.html' });
    window.location.href = 'registro.html';
  };
});

/**
 * ====================================================================
 * DRAGON3 scripts/login.js - Notas de implementación FAANG Enterprise
 * ====================================================================
 * - Cumple con endpoint /auth/login y payload { email, password }
 * - El input "usuario" del formulario se mapea a "email" esperado por backend.
 * - Almacena JWT en localStorage y navega a "mi_espacio.html" tras login OK.
 * - Manejo de errores amigable y UX robusta.
 * - Sin console.log, sin fugas de errores JS.
 * - Integra métricas frontend: visitas, intentos, éxito, fallos, error de red.
 * - Documentado y alineado con arquitectura FAANG.
 * ====================================================================
 */
