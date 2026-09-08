#!/bin/bash
# 🐉 DRAGON3 - Script de Orquestación del Servidor

# 1. Encender el Cerebro (Monitor + Analizador)
pm2 start conector.js --name "dragon3-core"

# 2. Encender el Tubo (Cloudflare Tunnel)
# Sustituye [TU_TOKEN] por el token de tu túnel
pm2 start "cloudflared tunnel run --token [TU_TOKEN]" --name "dragon3-tunnel"

# 3. Guardar la configuración para que arranque tras un reinicio
pm2 save
