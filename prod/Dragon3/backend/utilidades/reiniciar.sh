#!/bin/bash
# ====================================================================
# DRAGON PROJECT - REINICIO COMPLETO DEL SISTEMA
# ====================================================================
# Autor: Gustavo Herráiz - Lead Architect
# Fecha: 2025-04-15
# ====================================================================

# Definir colores para la salida
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # Sin Color

echo -e "${BLUE}=========================================================${NC}"
echo -e "${BLUE}      DRAGON PROJECT - REINICIO COMPLETO DEL SISTEMA     ${NC}"
echo -e "${BLUE}=========================================================${NC}"

# Paso 1: Detener todos los servicios
echo -e "${YELLOW}[1/5] Deteniendo todos los servicios Dragon...${NC}"
systemctl stop dragon-server dragon-analizadorImagen dragon-servidorCentral dragon-monitor
echo -e "${GREEN}✓ Todos los servicios detenidos${NC}"

# Paso 2: Hacer backup de archivos críticos
echo -e "${YELLOW}[2/5] Creando backup de configuración...${NC}"
BACKUP_DIR="/var/www/ProyectoDragon/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
cp /var/www/ProyectoDragon/utilidades/redis.js $BACKUP_DIR/
echo -e "${GREEN}✓ Backup creado en $BACKUP_DIR${NC}"

# Paso 3: Implementar el nuevo redis.js
echo -e "${YELLOW}[3/5] Implementando nuevo redis.js optimizado...${NC}"
cp redis.js /var/www/ProyectoDragon/utilidades/
echo -e "${GREEN}✓ Redis.js actualizado${NC}"

# Paso 4: Reiniciar servicios
echo -e "${YELLOW}[4/5] Reiniciando servicios Dragon...${NC}"
# Reiniciar en orden específico (empezando por servicios internos)
systemctl start dragon-servidorCentral
sleep 5
systemctl start dragon-analizadorImagen
sleep 5
systemctl start dragon-server
sleep 5
systemctl start dragon-monitor
echo -e "${GREEN}✓ Todos los servicios reiniciados${NC}"

# Paso 5: Verificar estado
echo -e "${YELLOW}[5/5] Verificando estado de los servicios...${NC}"
echo ""
echo -e "${BLUE}Estado de dragon-servidorCentral:${NC}"
systemctl status dragon-servidorCentral --no-pager | head -n 5
echo ""
echo -e "${BLUE}Estado de dragon-analizadorImagen:${NC}"
systemctl status dragon-analizadorImagen --no-pager | head -n 5
echo ""
echo -e "${BLUE}Estado de dragon-server:${NC}"
systemctl status dragon-server --no-pager | head -n 5
echo ""
echo -e "${BLUE}Estado de dragon-monitor:${NC}"
systemctl status dragon-monitor --no-pager | head -n 5

echo ""
echo -e "${BLUE}=========================================================${NC}"
echo -e "${GREEN}✓ DRAGON PROJECT REINICIADO COMPLETAMENTE${NC}"
echo -e "${BLUE}=========================================================${NC}"
echo -e "Para verificar logs: tail -f /var/log/dragon/*.log"