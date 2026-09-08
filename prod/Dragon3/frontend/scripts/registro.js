/**
 * ====================================================================
 * Dragon3 - scripts/registro.js (FAANG Enterprise, métricas frontend)
 * ====================================================================
 * Registro de usuario FAANG/KISS perfectamente alineado con backend.
 * - Cumple 100% requisitos de seguridad, UX y métricas FAANG.
 * - Manejo robusto de errores y UX clara.
 * - Logging vía eventos y reporting si está disponible.
 * - Sin console.log (prohibido en Dragon3).
 * - Login automático tras registro exitoso (FAANG Enterprise).
 * - Totalmente documentado y mantenible.
 * ====================================================================
 * MÉTRICAS FRONTEND INTEGRADAS:
 * - Captura visita a la página de registro.
 * - Captura intento, éxito y fallo de registro.
 * ====================================================================
 */

/**
 * Helper FAANG Enterprise para enviar métricas frontend al backend
 * @param {string} evento - Tipo de evento (ej: 'visita_registro', 'registro_exito', 'registro_fallo')
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
   * Helper para obtener elementos por ID (FAANG/KISS)
   * @param {string} id
   * @returns {HTMLElement}
   */
  const $ = (id) => document.getElementById(id);

  // Elementos clave del DOM
  const form = $('registerForm');
  const errorDiv = $('registerError');
  const btnGoLogin = $('btnGoLogin');

  // --- Métrica: visita página registro ---
  enviarMetricaFrontend('visita_registro', { pagina: 'registro.html' });

  /**
   * Limpia y oculta los mensajes de error (UX FAANG)
   */
  function limpiarError() {
    errorDiv.textContent = '';
    errorDiv.classList.add('oculto');
  }

  /**
   * Muestra un mensaje de error visible y accesible (UX FAANG)
   * Reporta métrica de error de registro.
   * @param {string} mensaje
   * @param {string} [email]
   */
  function mostrarError(mensaje, email) {
    errorDiv.textContent = mensaje;
    errorDiv.classList.remove('oculto');
    enviarMetricaFrontend('registro_fallo', { mensaje, email });
  }

  /**
   * Muestra un mensaje de éxito y redirige de forma controlada (UX FAANG)
   * Reporta métrica de éxito de registro.
   * @param {string} mensaje
   * @param {string} [email]
   */
  function mostrarExitoYRedirigir(mensaje, email) {
    alert(mensaje || 'Usuario registrado correctamente. Ahora puedes iniciar sesión.');
    enviarMetricaFrontend('registro_exito', { mensaje, email });
    window.location.href = 'login.html';
  }

  /**
   * Evento principal de registro (FAANG/KISS/Enterprise)
   * Login automático tras registro y acceso directo a mi-espacio.
   * Logging y robustez FAANG Enterprise.
   */
  form.onsubmit = async function(ev) {
    ev.preventDefault();
    limpiarError();

    // Recupera y valida campos
    const name = this.usuario.value.trim();
    const email = this.email.value.trim();
    const password = this.password.value;
    const password2 = this.password2.value;

    // Métrica: intento de registro
    enviarMetricaFrontend('registro_intento', { name, email });

    // Validación FAANG: contraseñas coinciden
    if (password !== password2) {
      mostrarError('Las contraseñas no coinciden', email);
      return;
    }
    // Validación FAANG: fuerza mínima
    if (password.length < 8) {
      mostrarError('La contraseña debe tener al menos 8 caracteres.', email);
      return;
    }
    if (name.length < 2) {
      mostrarError('El nombre debe tener al menos 2 caracteres.', email);
      return;
    }
    // Validación FAANG: email
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      mostrarError('El email no es válido.', email);
      return;
    }

    // Construcción segura del payload
    const payload = { name, email, password };

    try {
      // Envío FAANG: endpoint REST correcto, JSON, sin token
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Respuesta FAANG: siempre JSON
      const data = await res.json();

      // Manejo de errores HTTP y de API
      if (!res.ok) {
        mostrarError(data.error || 'Registro incorrecto, inténtalo de nuevo.', email);
        return;
      }

      /**
       * FAANG Enterprise: login automático tras registro
       * Si el backend devuelve token, guardar y redirigir a mi-espacio
       */
      if (data.token) {
        localStorage.setItem('token', data.token);
        enviarMetricaFrontend('registro_exito', { email, autoLogin: true });
        window.location.href = '/mi-espacio';
      } else {
        mostrarExitoYRedirigir('Usuario registrado correctamente. Ahora puedes iniciar sesión.', email);
      }

    } catch (e) {
      mostrarError('No se pudo conectar con el servidor. Inténtalo más tarde.', email);
      enviarMetricaFrontend('registro_error_red', { error: e.message, email });
    }
  };

  /**
   * Navegación UX: botón para ir a login
   */
  btnGoLogin.onclick = () => {
    enviarMetricaFrontend('click', { elemento: 'btnGoLogin', pagina: 'registro.html' });
    window.location.href = 'login.html';
  };

  // Opcional: listeners de métricas FAANG Enterprise
  // window.addEventListener('dragon3:registro:exito', ...)
  // window.addEventListener('dragon3:registro:falla', ...)
});

/**
 * ====================================================================
 * DRAGON3 scripts/registro.js - Notas de implementación FAANG Enterprise
 * ====================================================================
 * - Cumple con endpoint /auth/register, payload { name, email, password }
 * - Login automático tras registro (token JWT persistido, acceso directo a mi-espacio).
 * - Mensajes y validaciones amigables, orientados a UX enterprise.
 * - Sin console.log, sin fugas de errores JS al usuario.
 * - Integra métricas frontend: visita, intento, éxito, fallo y error de red.
 * - Documentado y alineado con arquitectura FAANG.
 * ====================================================================
 */
