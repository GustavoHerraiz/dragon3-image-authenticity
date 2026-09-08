#!/bin/bash
# ====================================================================
# DRAGON3 - REINICIO COMPLETO DEL SISTEMA
# ====================================================================

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================================${NC}"
echo -e "${BLUE}         DRAGON3 - REINICIO COMPLETO DEL SISTEMA        ${NC}"
echo -e "${BLUE}=========================================================${NC}"

# Encontrar servicios Dragon3
echo -e "${YELLOW}[1/5] Identificando servicios de Dragon3...${NC}"
SERVICIOS=$(pm2 list | grep dragon | awk '{print $2}')

if [ -z "$SERVICIOS" ]; then
  echo -e "${YELLOW}No se encontraron servicios PM2 con 'dragon' en el nombre${NC}"
  # Intentar buscar en systemd
  SERVICIOS=$(systemctl list-units | grep dragon | awk '{print $1}')
fi

echo -e "${GREEN}Servicios encontrados: ${SERVICIOS}${NC}"

# Detener servicios
echo -e "${YELLOW}[2/5] Deteniendo servicios...${NC}"
if command -v pm2 &> /dev/null; then
  pm2 stop all || echo "No se pudieron detener servicios PM2"
else
  for servicio in $SERVICIOS; do
    systemctl stop $servicio || echo "No se pudo detener $servicio"
  done
fi
echo -e "${GREEN}✓ Servicios detenidos${NC}"

# Backup
echo -e "${YELLOW}[3/5] Creando backup...${NC}"
BACKUP_DIR="/var/www/Dragon3/backend/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
cp redis.js $BACKUP_DIR/redis.js.bak 2>/dev/null || echo "No existe redis.js para hacer backup"
echo -e "${GREEN}✓ Backup creado en $BACKUP_DIR${NC}"

# Crear redis.js si no existe
echo -e "${YELLOW}[4/5] Desplegando nuevo redis.js...${NC}"
cat > redis.js << 'EOL'
/**
 * ====================================================================
 * DRAGON3 FAANG - REDIS OPTIMIZADO - "MONSTRUO TRANQUILO"
 * ====================================================================
 *
 * Archivo: utilidades/redis.js
 * Proyecto: Dragon3 - AI Image Auth System
 * Versión: 1.0.1
 * Fecha: 2025-04-15
 * Autor: Gustavo Herráiz - Lead Architect
 *
 * DESCRIPCIÓN:
 * Cliente Redis optimizado para alta disponibilidad, bajo consumo
 * de recursos y respuesta rápida bajo carga. Implementa patrones 
 * FAANG como connection pooling, optimización de streams, pipeline 
 * y monitoreo de recursos.
 * ====================================================================
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import os from 'os';
import dragon from './logger.js';

// Configuración mediante variables de entorno o valores por defecto
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
  retryStrategy: (times) => {
    // Estrategia de reintento exponencial con jitter para evitar tormentas de conexiones
    const delay = Math.min*
