#!/bin/bash
# scripts/ejecutar-agente.sh
# Ejecuta el agente de decisión en modo auto y registra la salida en un log.

cd /opt/dragon3/dev/celulas || exit 1

# Crear carpeta de logs si no existe
mkdir -p logs

# Ejecutar agente en modo auto
node agente-decision.js --auto >> logs/agente-cron.log 2>&1

# Opcional: ejecutar diagnóstico después de aplicar cambios
# node agente-decision.js --diagnostico >> logs/agente-cron.log 2>&1

echo "Agente ejecutado el $(date)" >> logs/agente-cron.log