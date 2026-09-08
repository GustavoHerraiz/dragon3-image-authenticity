#!/bin/bash
cd /opt/dragon3/dev/celulas

# Variables para calcular ritmo
PREV_TOTAL=0
PREV_TIME=$(date +%s)

while true; do
    clear
    echo "=========================================="
    echo "🧬 DRAGON3 - MONITOR DATASET"
    echo "=========================================="
    echo "🕐 $(date '+%H:%M:%S')"
    echo ""
    
    # Archivos físicos
    IA_FS=$(ls dataset/procesadas/ia/ 2>/dev/null | wc -l)
    HUM_FS=$(ls dataset/procesadas/humanas/ 2>/dev/null | wc -l)
    TOTAL_FS=$((IA_FS + HUM_FS))
    
    echo "📂 ARCHIVOS FÍSICOS:"
    echo "   🤖 IA: $IA_FS"
    echo "   ✅ Humanas: $HUM_FS"
    echo "   📊 Total: $TOTAL_FS"
    echo ""
    
    # MongoDB con Node
    TOTAL_DB=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments();
        console.log(count);
        process.exit(0);
    " 2>/dev/null | tail -1)
    
    IA_DB=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments({ correccionHumana: false });
        console.log(count);
        process.exit(0);
    " 2>/dev/null | tail -1)
    
    HUM_DB=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments({ correccionHumana: true });
        console.log(count);
        process.exit(0);
    " 2>/dev/null | tail -1)
    
    echo "💾 MONGODB:"
    echo "   🤖 IA: $IA_DB"
    echo "   ✅ Humanas: $HUM_DB"
    echo "   📊 Total: $TOTAL_DB"
    echo ""
    
    # Calcular ritmo real
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - PREV_TIME))
    
    if [ $PREV_TOTAL -gt 0 ] && [ $TIME_DIFF -gt 0 ]; then
        RITMO=$(( (TOTAL_DB - PREV_TOTAL) * 3600 / TIME_DIFF ))
        echo "⚡ RITMO ACTUAL: ~$RITMO imágenes/hora"
        echo ""
    fi
    
    # Guardar para siguiente iteración
    PREV_TOTAL=$TOTAL_DB
    PREV_TIME=$CURRENT_TIME
    
    TOTAL_OBJETIVO=120000
    if [ "$TOTAL_DB" -gt 0 ] 2>/dev/null; then
        PORCENTAJE=$(echo "scale=2; $TOTAL_DB * 100 / $TOTAL_OBJETIVO" | bc 2>/dev/null || echo "0.00")
        RESTANTES=$((TOTAL_OBJETIVO - TOTAL_DB))
        
        # Usar ritmo real si está disponible, si no usar 9500
        if [ "$RITMO" -gt 0 ] 2>/dev/null; then
            HORAS=$(echo "scale=1; $RESTANTES / $RITMO" | bc 2>/dev/null || echo "0")
        else
            HORAS=$(echo "scale=1; $RESTANTES / 9500" | bc 2>/dev/null || echo "0")
        fi
        
        DIAS=$(echo "scale=1; $HORAS / 24" | bc 2>/dev/null || echo "0")
        echo "📈 PROGRESO: $PORCENTAJE%"
        echo "   Restantes: $RESTANTES imágenes"
        echo "   ⏱️ Estimado: ~$HORAS horas ($DIAS días)"
    fi
    
    echo ""
    echo "=========================================="
    echo "🔄 Actualizando en 60 segundos..."
    sleep 60
done
