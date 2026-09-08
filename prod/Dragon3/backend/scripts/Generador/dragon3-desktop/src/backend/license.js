import crypto from 'crypto';
import { telemetry } from './telemetry.js';

const MODULE = 'License';

const SECRETO = 'DRAGON3_PREMIUM_SECRET_2026'; // Cambiar antes de lanzar producción

export class LicenseManager {
  constructor(db) {
    this.db = db;
    this.licencia = null;
    this._cargada = false;
  }

  // ==========================================================
  // CARGA DE LICENCIA
  // ==========================================================
  async _cargarLicencia() {
    if (this._cargada) return;
    try {
      this.licencia = await this.db.obtenerLicencia();
      this._cargada = true;
      telemetry.info(MODULE, `Licencia cargada: ${this.licencia?.tipo || 'desconocida'}`, { 
        activa: this.licencia?.activa === 1 
      });
    } catch (err) {
      telemetry.error(MODULE, `Error inicializando licencia: ${err.message}`);
      throw err;
    }
  }

  // ==========================================================
  // OBTENER ESTADO DE LICENCIA (para interfaz)
  // ==========================================================
  async obtenerEstado() {
    await this._cargarLicencia();
    if (!this.licencia) {
      return {
        activa: false,
        tipo: 'gratuita',
        sellos_usados: 0,
        limite: 100,
        premium: false,
        mensaje: 'Demo gratuita (100 sellos)'
      };
    }

    const esPremium = this.licencia.activa === 1 && this.licencia.tipo === 'premium';
    const sellosUsados = this.licencia.sellos_usados || 0;
    const limite = 100;
    const restantes = Math.max(0, limite - sellosUsados);

    let mensaje = '';
    if (esPremium) {
      mensaje = '✅ Premium activo';
    } else if (sellosUsados >= limite) {
      mensaje = '❌ Demo agotada. Activa Premium.';
    } else {
      mensaje = `Demo gratuita (${restantes} sellos restantes)`;
    }

    return {
      activa: this.licencia.activa === 1,
      tipo: this.licencia.tipo || 'gratuita',
      sellos_usados: sellosUsados,
      limite: limite,
      premium: esPremium,
      mensaje: mensaje,
      email: this.licencia.email || null,
      prefijo_usuario: this.licencia.prefijo_usuario || null,
      fecha_activacion: this.licencia.fecha_activacion || null
    };
  }

  // ==========================================================
  // OBTENER PREFIJO (para el generador)
  // ==========================================================
  async obtenerPrefijo() {
    await this._cargarLicencia();
    // Primero intentar desde licencia, luego desde configuración
    if (this.licencia?.prefijo_usuario) {
      return this.licencia.prefijo_usuario;
    }
    const config = await this.db.obtenerConfiguracion();
    return config?.prefijo_usuario || null;
  }

  // ==========================================================
  // VERIFICAR CLAVE LOCALMENTE (sin servidor)
  // ==========================================================
  verificarClaveLocal(clave, email) {
    if (!clave || !email) return false;
    const emailLimpio = email.toLowerCase().trim();
    const hash = crypto.createHmac('sha256', SECRETO)
                       .update(emailLimpio)
                       .digest('hex')
                       .toUpperCase()
                       .substring(0, 16);
    return clave.toUpperCase().trim() === hash;
  }

  // ==========================================================
  // ACTIVAR PREMIUM (valida clave y actualiza BD)
  // ==========================================================
  async activarPremium(clave, email) {
    try {
      await this._cargarLicencia();
      
      // 1. Validar clave
      if (!this.verificarClaveLocal(clave, email)) {
        telemetry.warn(MODULE, `Intento de activación con clave inválida para ${email}`);
        return { ok: false, error: 'Clave no válida. Verifica el email y la clave.' };
      }

      // 2. Verificar que no esté ya activa
      if (this.licencia?.activa === 1 && this.licencia?.tipo === 'premium') {
        return { ok: false, error: 'La licencia ya está activa.' };
      }

      // 3. Actualizar licencia en BD
      const ahora = new Date().toISOString();
      await this.db.actualizarLicencia({
        activa: 1,
        tipo: 'premium',
        email: email,
        clave: clave,
        fecha_activacion: ahora,
        servidor_verificado: 0 // Por ahora local
      });

      // 4. Recargar licencia en memoria
      this._cargada = false;
      await this._cargarLicencia();

      telemetry.info(MODULE, `✅ Licencia Premium activada para ${email}`);
      return { ok: true, mensaje: '✅ Licencia Premium activada correctamente.' };
    } catch (err) {
      telemetry.error(MODULE, `Error activando Premium: ${err.message}`);
      return { ok: false, error: `Error activando Premium: ${err.message}` };
    }
  }

  // ==========================================================
  // COMPROBAR LÍMITE DE DEMO (para el generador)
  // ==========================================================
  async comprobarLimite() {
    await this._cargarLicencia();
    if (!this.licencia) return { ok: true }; // Si no hay licencia, permitir (fallback)

    // Si es Premium, sin límite
    if (this.licencia.activa === 1 && this.licencia.tipo === 'premium') {
      return { ok: true };
    }

    // Si es gratuito, comprobar límite de 100 sellos
    const usados = this.licencia.sellos_usados || 0;
    const limite = 100;
    if (usados >= limite) {
      return {
        ok: false,
        error: `Demo agotada (${limite} sellos). Activa Premium para seguir sellando.`
      };
    }
    return { ok: true, restantes: limite - usados };
  }

  // ==========================================================
  // INCREMENTAR CONTADOR DE SELLOS USADOS (después de sellar)
  // ==========================================================
  async incrementarSellosUsados() {
  await this._cargarLicencia();
  if (!this.licencia) return;
  
  if (this.licencia.activa === 0 || this.licencia.tipo !== 'premium') {
    const actual = this.licencia.sellos_usados || 0;
    await this.db.actualizarLicencia({
      sellos_usados: actual + 1
    });
    this.licencia.sellos_usados = actual + 1;
    telemetry.info(MODULE, `📈 Sellos usados incrementados: ${actual + 1}/100`);
  }
}
  // ==========================================================
  // GENERAR CLAVE (para uso del desarrollador)
  // ==========================================================
  generarClave(email) {
    const emailLimpio = email.toLowerCase().trim();
    return crypto.createHmac('sha256', SECRETO)
                 .update(emailLimpio)
                 .digest('hex')
                 .toUpperCase()
                 .substring(0, 16);
  }
}