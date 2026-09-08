import connectionManager from '../../utilidades/redis/core/ConnectionManager.js';

async function testLecturaDirecta() {
    console.log("🕵️ Probando si el cliente ve los mensajes inyectados...");
    await new Promise(r => setTimeout(r, 1000));

    const redis = connectionManager.getRawClientById('imagen-analyzer');
    const canal = 'dragon3:stream:resp:superior'; // Canal oficial del README

    try {
        const data = await redis.xread('COUNT', 1, 'STREAMS', canal, '0');
        if (data) {
            console.log("✅ ¡SINTONÍA CONFIRMADA!");
            console.log("Mensaje encontrado:", JSON.stringify(data, null, 2));
        } else {
            console.log("❌ El canal está vacío. Revisa en qué DB estás inyectando.");
        }
    } catch (e) {
        console.error("❌ Error de lectura:", e.message);
    }
    process.exit(0);
}
testLecturaDirecta();