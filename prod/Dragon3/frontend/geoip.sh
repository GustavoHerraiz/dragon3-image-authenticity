#!/bin/bash
# geoip.sh - Geolocalización con ipinfo.io
# Uso: ./geoip.sh IP

IP="$1"

if [ -z "$IP" ]; then
    echo "Uso: $0 <IP>"
    exit 1
fi

# Consultar ipinfo.io (formato JSON)
RESP=$(curl -s "https://ipinfo.io/$IP")

# Extraer ciudad, región y país
CITY=$(echo "$RESP" | grep -o '"city": "[^"]*"' | cut -d'"' -f4)
REGION=$(echo "$RESP" | grep -o '"region": "[^"]*"' | cut -d'"' -f4)
COUNTRY=$(echo "$RESP" | grep -o '"country": "[^"]*"' | cut -d'"' -f4)

if [ -z "$CITY" ] && [ -z "$REGION" ] && [ -z "$COUNTRY" ]; then
    echo "Desconocida"
else
    # Construir salida
    if [ -n "$CITY" ] && [ -n "$REGION" ]; then
        echo "$CITY, $REGION, $COUNTRY"
    elif [ -n "$CITY" ]; then
        echo "$CITY, $COUNTRY"
    else
        echo "$REGION, $COUNTRY"
    fi
fi
