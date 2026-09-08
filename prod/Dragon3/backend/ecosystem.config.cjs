/**
 * ====================================================================
 * DRAGON3 - ECOSYSTEM PM2 CONFIGURATION (PRODUCCIÓN)
 * ====================================================================
 *
 * Archivo: ecosystem.config.cjs
 * Ubicación: /opt/dragon3/prod/Dragon3/backend/ecosystem.config.cjs
 * Proyecto: Dragon3 - Sistema Autentificación IA Enterprise
 * Versión: 3.1.0-FAANG-EMBASSY-WATCHER
 * Fecha: 2026-08-25
 *
 * ====================================================================
 * ARQUITECTURA:
 *
 * 1. dragon3-server    : Servidor HTTP (proxy) que recibe peticiones del frontend
 *                        y las delega al Agent Embassy. (Puerto 3000)
 *                        Modo: cluster (2 instancias)
 *
 * 2. dragon3-embassy   : Cerebro del sistema. Orquestador de células,
 *                        colas Bull, sistema de defensa, evolución automática
 *                        y adaptador FAANG. (Puerto 3002)
 *                        Modo: fork (1 instancia)
 *
 * 3. dataset-watcher   : Procesamiento en segundo plano de imágenes para el dataset.
 *                        Escanea carpetas calientes y etiqueta automáticamente.
 *                        Modo: fork (1 instancia)
 *
 * ====================================================================
 * NOTAS IMPORTANTES:
 * - El Embassy DEBE arrancar antes que el server, pero PM2 gestiona el orden.
 * - Todas las rutas son absolutas para evitar problemas.
 * - Las credenciales se cargan desde el .env local y nunca se guardan aquí.
 * - El server usa EMBASSY_URL para comunicarse con el Embassy.
 * - Prometheus deshabilitado temporalmente (no se usa en producción actual).
 * - El watcher se ejecuta en segundo plano sin intervención manual.
 * - El watcher usa el mismo MONGO_URI cargado desde el .env local.
 *
 * ====================================================================
 * USO:
 *   pm2 start ecosystem.config.cjs      # Iniciar todos los procesos
 *   pm2 list                             # Ver estado
 *   pm2 logs                             # Ver logs en tiempo real
 *   pm2 stop dragon3-embassy             # Detener un proceso específico
 *   pm2 restart ecosystem.config.cjs     # Reiniciar todos
 *   pm2 save                             # Guardar configuración
 *   pm2 startup                          # Iniciar automáticamente al reiniciar servidor
 * ====================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [
    // =================================================================
    // 1. SERVIDOR HTTP (PROXY HACIA EL EMBASSY)
    // =================================================================
    // Puerto: 3000
    // Modo: cluster (2 instancias para balanceo)
    // Función: Recibe peticiones del frontend y las delega al Embassy
    // =================================================================
    {
      name: 'dragon3-server',
      script: 'server.js',
      cwd: '/opt/dragon3/prod/Dragon3/backend',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 8000,
      node_args: [
        '--expose-gc',
        '--max-old-space-size=2048',
        '--enable-source-maps',
        '--optimize-for-size'
      ],
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        EMBASSY_URL: 'http://localhost:3002',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        REDIS_DB: 1,
        JWT_SECRET: process.env.JWT_SECRET,
        MONGO_URI: process.env.MONGO_URI
      },
      log_file: '/opt/dragon3/prod/Dragon3/logs/server.log',
      error_file: '/opt/dragon3/prod/Dragon3/logs/server-error.log',
      merge_logs: true
    },

    // =================================================================
    // 2. AGENT EMBASSY (CEREBRO DEL SISTEMA)
    // =================================================================
    // Puerto: 3002
    // Modo: fork (1 instancia)
    // Función: Orquestador de células, colas Bull, defensa, evolución
    // Dependencias: Redis, MongoDB
    // =================================================================
    {
      name: 'dragon3-embassy',
      script: '/opt/dragon3/prod/Dragon3/engine/agent-embassy.js',
      cwd: '/opt/dragon3/prod/Dragon3/engine',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 5000,
      kill_timeout: 10000,
      node_args: [
        '--expose-gc',
        '--max-old-space-size=1024',
        '--enable-source-maps'
      ],
      env: {
        NODE_ENV: 'production',
        EMBASSY_PORT: 3002,
        JWT_SECRET: process.env.JWT_SECRET,
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        REDIS_DB: 1,
        MONGO_URI: process.env.MONGO_URI,
        LOG_LEVEL: 'info',
        NODE_PATH: '/opt/dragon3/prod/Dragon3/engine'
      },
      log_file: '/opt/dragon3/prod/Dragon3/logs/embassy.log',
      error_file: '/opt/dragon3/prod/Dragon3/logs/embassy-error.log',
      merge_logs: true
    },

    // =================================================================
    // 3. DATASET WATCHER (PROCESAMIENTO EN SEGUNDO PLANO)
    // =================================================================
    // Modo: fork (1 instancia)
    // Función: Escanea carpetas calientes y procesa imágenes automáticamente
    // Carpetas:
    //   - /opt/dragon3/dev/celulas/dataset/hot/humanas/  → imágenes humanas
    //   - /opt/dragon3/dev/celulas/dataset/hot/ia/       → imágenes IA
    //   - /opt/dragon3/dev/celulas/dataset/procesadas/   → imágenes procesadas
    // Logs: /opt/dragon3/dev/celulas/dataset/logs/
    // =================================================================
    {
      name: 'dataset-watcher',
      script: '/opt/dragon3/prod/Dragon3/engine/scripts/watcher-dataset.js',
      cwd: '/opt/dragon3/prod/Dragon3/engine',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 5000,
      kill_timeout: 30000,
      node_args: [
        '--expose-gc',
        '--max-old-space-size=4096',
        '--enable-source-maps'
      ],
      env: {
        NODE_ENV: 'production',
        MONGO_URI: process.env.MONGO_URI,
        DRAGON3_DATASET_DIR: '/opt/dragon3/prod/Dragon3/data/dataset'
      },
      log_file: '/opt/dragon3/prod/Dragon3/logs/pm2-watcher.log',
      error_file: '/opt/dragon3/prod/Dragon3/logs/pm2-watcher-error.log',
      out_file: '/opt/dragon3/prod/Dragon3/logs/pm2-watcher-out.log',
      merge_logs: true,
      time: true
    }
  ]
};