import sharpLock from './sharp-redis-lock.js';

const TOTAL_TAREAS = 15;
const DURACION_TRABAJO_MS = 500;
const stats = [];

async function ejecutarConTelemetria(id) {
    const inicioAbsoluto = Date.now();
    console.log(`🚀 [ID:${id}] Encolando...`);

    try {
        await sharpLock.executeSharpOperation(
            `op_ultra_${id}`, 
            `test_${id}.png`, 
            async () => {
                const tiempoEnCola = Date.now() - inicioAbsoluto;
                console.log(`\x1b[32m[LOCK_ADQUIRIDO]\x1b[0m Tarea:${id} | Espera:${tiempoEnCola}ms`);
                
                await new Promise(r => setTimeout(r, DURACION_TRABAJO_MS));
                
                stats.push({ id, espera: tiempoEnCola });
                return `OK_${id}`;
            }
        );
    } catch (e) {
        console.error(`❌ [ID:${id}] Error: ${e.message}`);
    }
}

async function run() {
    console.log("🧹 Limpiando colas viejas en Redis...");
    // IMPORTANTE: Limpiamos para evitar el bloqueo que estás viendo
    await sharpLock.redis.del(sharpLock.lockKey);
    await sharpLock.redis.del(sharpLock.queueKey);

    console.log(`🔥 Lanzando ráfaga de ${TOTAL_TAREAS} tareas...`);
    const promesas = Array.from({ length: TOTAL_TAREAS }, (_, i) => ejecutarConTelemetria(i + 1));
    
    await Promise.all(promesas);
    
    console.log("\n📊 RESULTADOS FINALES:");
    console.table(stats.sort((a,b) => a.espera - b.espera));
    await sharpLock.destroy();
}

run();