import Redis from 'ioredis';
import { performance } from 'node:perf_hooks';

async function test() {
    // Usamos la config de tu .env
    const redis = new Redis({
        host: '127.0.0.1',
        port: 6379,
        connectTimeout: 2000
    });

    const start = performance.now();
    try {
        console.log("🚀 Iniciando test de Redis...");
        
        // Test de escritura
        await redis.set('dragon_test', 'MBH_VERIFIED');
        
        // Test de lectura
        const val = await redis.get('dragon_test');
        
        const end = performance.now();
        if (val === 'MBH_VERIFIED') {
            console.log(`✅ Redis operativo. Latencia R/W: ${(end - start).toFixed(2)}ms`);
            await redis.del('dragon_test');
        } else {
            throw new Error("Datos corruptos en Redis");
        }
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN REDIS:");
        console.error(err.message);
        process.exit(1);
    }
}
test();
