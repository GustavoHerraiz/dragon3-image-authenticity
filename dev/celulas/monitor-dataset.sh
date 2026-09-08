#!/bin/bash
while true; do
    clear
    echo "=========================================="
    echo "🧬 DRAGON3 - MONITOR DATASET"
    echo "=========================================="
    echo "🕐 $(date '+%H:%M:%S')"
    echo ""
    
    # Contar archivos físicos
    IA_FS=$(ls /opt/dragon3/dev/celulas/dataset/procesadas/ia/ 2>/dev/null | wc -l)
    HUM_FS=$(ls /opt/dragon3/dev/celulas/dataset/procesadas/humanas/ 2>/dev/null | wc -l)
    TOTAL_FS=$((IA_FS + HUM_FS))
    
    # Contar en MongoDB
    IA_DB=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments({ correccionHumana: false });
        console.log(count);
        process.exit(0);
    " 2>/dev/null)
    
    HUM_DB=$(node -e "
        import mongoose from 'mongoose';
        import dotenv from 'dotenv';
        dotenv.config({ path: '../../prod/Dragon3/backend/.env' });
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;
        const count = await db.collection('ejecuciones').countDocuments({ correccionHumana: true });
        console.log(count);
        process.exit(0);
    " 2>/dev/null)
    
    TOTAL_DB=$((IA_DB + HUM_DB))
    
    echo "📂 ARCHIVOS FÍSICOS:"
    echo "   🤖 IA: $IA_FS"
    echo "   ✅ Humanas: $HUM_FS"
    echo "   📊 Total: $TOTAL_FS"
    echo ""
    echo "💾 MONGODB:"
    echo "   🤖 IA: $IA_DB"
    echo "   ✅ Humanas: $HUM_DB"
    echo "   📊 Total: $TOTAL_DB"
    echo ""
    
    # Progreso y tiempo estimado (120,000 total)
    TOTAL_OBJETIVO=120000
    if [ $TOTAL_DB -gt 0 ]; then
        PORCENTAJE=$(echo "scale=2; $TOTAL_DB * 100 / $TOTAL_OBJETIVO" | bc)
        RESTANTES=$((TOTAL_OBJETIVO - TOTAL_DB))
        
        # Estimar tiempo (asumiendo 2400/hora)
        HORAS=$(echo "scale=1; $RESTANTES / 2400" | bc)
        DIAS=$(echo "scale=1; $HORAS / 24" | bc)
        
        echo "📈 PROGRESO: $PORCENTAJE%"
        echo "   Restantes: $RESTANTES imágenes"
        echo "   ⏱️ Estimado: ~$HORAS horas ($DIAS días)"
    fi
    
    echo ""
    echo "=========================================="
    echo "🔄 Actualizando en 60 segundos..."
    sleep 60
done
