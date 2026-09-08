/**
 * ====================================================================
 * DRAGON3 - RED ESPEJO AUTENTICIDAD - HANDLER WEBSOCKET DE AJUSTE
 * ====================================================================
 * Archivo: backend/servicios/imagen/redesEspejo/autenticidad/ws.js
 * Proyecto: Dragon3 - Sistema Autentificación IA Enterprise
 * Descripción: Handler WebSocket FAANG/KISS para ajuste de pesos en caliente,
 *              plug & play, para registrar en servidorCentral.js.
 * Versión: 3.0.0-FAANG
 * Autor: Gustavo Herráiz - Lead Architect
 * ====================================================================
 */

import dragonLogger from '../../../../utilidades/logger.js';
import { ajustarPesos, obtenerHashPesos } from './modelo.js';

// Handler estándar para registrar en wsManager/servidorCentral.js
export default function wsAutenticidadHandler(ws, req) {
  // Seguridad: sólo conexiones locales del servidor central (opcional, puedes relajar si proxy)
  const ip = req.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1') {
    ws.close(4001, 'Conexión no autorizada');
    dragonLogger.seEnfada('Intento de conexión WS no autorizada', 'ws.js', 'WEBSOCKET_FORBIDDEN', { ip });
    return;
  }
  dragonLogger.sonrie('Conexión WebSocket autenticidad aceptada', 'ws.js', 'WEBSOCKET_CONNECTED', { ip });

  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      // Validación estricta del contrato
      if (
        data.tipo !== 'ajuste_pesos' ||
        !data.idAnalisis ||
        !data.correlationId ||
        !data.parametrosAjuste
      ) {
        ws.send(JSON.stringify({
          tipo: "ack_ajuste",
          idAnalisis: data.idAnalisis,
          correlationId: data.correlationId,
          resultado: "error",
          detalles: { errores: ["Contrato de mensaje inválido"], timestamp: new Date().toISOString() }
        }));
        dragonLogger.seEnfada('Contrato de ajuste_pesos inválido', 'ws.js', 'WEBSOCKET_CONTRACT_ERROR', { data });
        return;
      }

      const hashAntes = await obtenerHashPesos();
      const cambios = await ajustarPesos(data.parametrosAjuste);
      const hashDespues = await obtenerHashPesos();

      ws.send(JSON.stringify({
        tipo: "ack_ajuste",
        idAnalisis: data.idAnalisis,
        correlationId: data.correlationId,
        resultado: "ok",
        detalles: {
          hashPesosAntes: hashAntes,
          hashPesosDespues: hashDespues,
          cambios,
          errores: [],
          timestamp: new Date().toISOString()
        }
      }));

      dragonLogger.sePreocupa('Ajuste de pesos autenticidad realizado', 'ws.js', 'WEIGHTS_UPDATED', {
        idAnalisis: data.idAnalisis,
        correlationId: data.correlationId,
        cambios, hashAntes, hashDespues
      });

    } catch (err) {
      ws.send(JSON.stringify({
        tipo: "ack_ajuste",
        idAnalisis: null,
        correlationId: null,
        resultado: "error",
        detalles: { errores: [err.message], timestamp: new Date().toISOString() }
      }));
      dragonLogger.agoniza('Error procesando ajuste de pesos autenticidad', err, 'ws.js', 'WEBSOCKET_ADJUST_ERROR');
    }
  });
}

/**
 * 100% FAANG Enterprise.
 * - Contrato y logging alineados a ReadmeRedesEspejo.md.
 * - Plug & play, sin dependencias externas.
 * - Prohibido console.log, sólo dragonLogger.
 */