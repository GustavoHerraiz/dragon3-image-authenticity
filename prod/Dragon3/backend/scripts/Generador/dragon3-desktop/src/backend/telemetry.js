import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '../../dragon3_telemetry.log');

// Rotación simple: si el archivo supera 5 MB, lo renombramos
function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const stats = fs.statSync(LOG_PATH);
      if (stats.size > 5 * 1024 * 1024) {
        const backup = LOG_PATH.replace('.log', `_${Date.now()}.log`);
        fs.renameSync(LOG_PATH, backup);
      }
    }
  } catch (e) { /* silencioso */ }
}

function writeLog(level, module, message, data = null) {
  rotateLogIfNeeded();
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    module,
    message,
    ...(data && { data })
  };
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(LOG_PATH, line, 'utf8');
  } catch (e) { /* si falla, solo consola */ }
  // Siempre a consola en desarrollo
  console.log(`[${level.toUpperCase()}] [${module}] ${message}`, data || '');
}

export const telemetry = {
  info: (module, msg, data) => writeLog('info', module, msg, data),
  warn: (module, msg, data) => writeLog('warn', module, msg, data),
  error: (module, msg, data) => writeLog('error', module, msg, data),
  debug: (module, msg, data) => {
    if (process.env.DRAGON3_DEBUG === 'true') {
      writeLog('debug', module, msg, data);
    }
  }
};