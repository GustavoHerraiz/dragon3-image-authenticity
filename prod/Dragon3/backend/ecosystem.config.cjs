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
 * - Las variables de entorno incluyen la contraseña de Redis explícitamente
 *   (evitamos REDIS_URL con caracteres especiales que puedan fallar).
 * - El server usa EMBASSY_URL para comunicarse con el Embassy.
 * - Prometheus deshabilitado temporalmente (no se usa en producción actual).
 * - El watcher se ejecuta en segundo plano sin intervención manual.
 * - El watcher incluye MONGO_URI explícitamente para garantizar la conexión.
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
        REDIS_PASSWORD: 'REDIS_PASSWORD_FROM_ENV',
        REDIS_DB: 1,
        JWT_SECRET: 'DrAgOn3_2025_S3cUr3_K3y_9f8d7a6b5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0',
        MONGO_URI: 'MONGO_URI_FROM_ENV'
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
      script: '/opt/dragon3/dev/celulas/agent-embassy.js',
      cwd: '/opt/dragon3/dev/celulas',
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
        JWT_SECRET: 'DrAgOn3_2025_S3cUr3_K3y_9f8d7a6b5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'REDIS_PASSWORD_FROM_ENV',
        REDIS_DB: 1,
        MONGO_URI: 'MONGO_URI_FROM_ENV',
        LOG_LEVEL: 'info',
        NODE_PATH: '/opt/dragon3/dev/celulas'
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
      script: '/opt/dragon3/dev/celulas/scripts/watcher-dataset.js',
      cwd: '/opt/dragon3/dev/celulas',
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
        MONGO_URI: 'MONGO_URI_FROM_ENV'
      },
      log_file: '/opt/dragon3/dev/celulas/dataset/logs/pm2-watcher.log',
      error_file: '/opt/dragon3/dev/celulas/dataset/logs/pm2-watcher-error.log',
      out_file: '/opt/dragon3/dev/celulas/dataset/logs/pm2-watcher-out.log',
      merge_logs: true,
      time: true
    }
  ]
};