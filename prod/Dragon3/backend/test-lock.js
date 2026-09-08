import Redis from 'ioredis';
import Redlock from 'redlock';

const redis = new Redis({ db: 0 }); // Usamos DB 0 que es la rápida
const redlock = new Redlock([redis], { retryCount: 0 });

async function checkLock() {
    console.log("🔒 Intentando adquirir lock de prueba...");
    try {
        const lock = await redlock.acquire(["test-lock-resource"], 5000);
        console.log("✅ LOCK ADQUIRIDO: El sistema de Redlock funciona perfectamente.");
        await lock.release();
        console.log("🔓 Lock liberado.");
    } catch (err) {
        console.error("❌ FALLO TOTAL DEL LOCK:");
        console.error(err.message);
        // Aquí pillamos el error real: ¿Connection refused? ¿Wrong password?
    }
    process.exit();
}

checkLock();