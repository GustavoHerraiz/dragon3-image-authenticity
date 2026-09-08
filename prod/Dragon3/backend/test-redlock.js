// Crea un archivo temporal test-redlock.js
import Redlock from 'redlock';
import Redis from 'ioredis';

const redis = new Redis({ port: 6379 });
const redlock = new Redlock([redis]);

try {
    console.log("⏳ Probando adquisición...");
    const lock = await redlock.acquire(["test-key"], 5000);
    console.log("✅ LOCK FUNCIONANDO EN REDIS");
    await lock.release();
    process.exit(0);
} catch (e) {
    console.error("❌ ERROR DE CONEXIÓN:", e.message);
    process.exit(1);
}