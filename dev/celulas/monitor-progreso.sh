#!/bin/bash

cd /opt/dragon3/dev/celulas

# Variables para calcular velocidad
PREV_TOTAL=0
PREV_TIME=$(date +%s)

while true; do
    clear
    echo "=========================================="
    echo "🧬 DRAGON3 - MONITOR REPROCESAMIENTO"
    echo "=========================================="
    echo "🕐 $(date '+%H:%M:%S')"
    echo ""
    
    # Total en MongoDB
    TOTAL=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments();
        console.log(count);
        process.exit(0);
    " 2>/dev/null | tail -1)
    
    # Si no hay número, usar 0
    if ! [[ "$TOTAL" =~ ^[0-9]+$ ]]; then
        TOTAL=0
    fi
    
    # Archivos procesados físicamente
    IA=$(ls dataset/procesadas/ia/ 2>/dev/null | wc -l)
    HUM=$(ls dataset/procesadas/humanas/ 2>/dev/null | wc -l)
    TOTAL_FS=$((IA + HUM))
    
    echo "📊 PROCESADO:"
    echo "   💾 MongoDB: $TOTAL ejecuciones"
    echo "   📂 IA: $IA | Humanas: $HUM | Total: $TOTAL_FS"
    echo ""
    
    # Calcular velocidad (cada 20 segundos)
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - PREV_TIME))
    
    if [ $PREV_TOTAL -gt 0 ] && [ $TIME_DIFF -gt 0 ]; then
        DIF=$((TOTAL - PREV_TOTAL))
        VELOCIDAD=$((DIF * 3600 / TIME_DIFF))
        echo "⚡ VELOCIDAD: ~$VELOCIDAD imágenes/hora"
        echo ""
        
        # Estimar tiempo restante
        OBJETIVO=111819
        RESTANTES=$((OBJETIVO - TOTAL))
        if [ $VELOCIDAD -gt 0 ] && [ $RESTANTES -gt 0 ]; then
            HORAS=$(echo "scale=1; $RESTANTES / $VELOCIDAD" | bc 2>/dev/null)
            if [ ! -z "$HORAS" ] && [ "$HORAS" != "0" ] && [ "$HORAS" != "0.0" ]; then
                echo "⏱️ ESTIMADO: ~$HORAS horas restantes"
                if (( $(echo "$HORAS > 24" | bc -l 2>/dev/null) )); then
                    DIAS=$(echo "scale=1; $HORAS / 24" | bc 2>/dev/null)
                    echo "   ($DIAS días)"
                fi
            fi
        fi
    fi
    
    # Guardar para próxima iteración
    PREV_TOTAL=$TOTAL
    PREV_TIME=$CURRENT_TIME
    
    echo ""
    echo "=========================================="
    echo "🔄 Actualizando en 20 segundos..."
    sleep 20
done
