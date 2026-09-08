import * as StreamManager from './utilidades/redis/StreamManager.js';
import StreamConsumer from './utilidades/redis/streams/StreamConsumer.js';
import { redisManager } from './utilidades/redis/core/ConnectionManager.js';

async function executeAuditoria() {
    const STRESS_COUNT = 100;
    const results = [];
    
    console.log("🐉 AUDITORÍA DE ESTRÉS: PROYECTO DRAGON");

    try {
        // 1. Obtener cliente activo para evitar modo degradado
        const redisClient = redisManager.getClient('main-client');

        const consumer = new StreamConsumer({
            redis: redisClient, // Inyección necesaria para el Sello MBH
            streamKey: 'audit:core:v2',
            groupName: 'auditors',
            consumerName: 'breaker-01',
            messageHandler: async (id, data) => {
                if (data && data.ts) results.push(Date.now() - data.ts);
                return true;
            }
        });

        await consumer.start();
        console.log("✅ ME (Motor Espacial) ONLINE y CONECTADO.");

        // 2. Identificar función de envío
        // Probamos las variantes comunes en tu arquitectura
        const publishFn = StreamManager.publish || StreamManager.sendToStream || StreamManager.addToStream;

        if (!publishFn) {
            console.log("🔍 Funciones disponibles:", Object.keys(StreamManager));
            throw new Error("No se detecta función de publicación.");
        }

        console.log(`🚀 Inyectando ${STRESS_COUNT} eventos...`);
        for (let i = 0; i < STRESS_COUNT; i++) {
            await publishFn('audit:core:v2', { n: i, ts: Date.now() });
        }

        setTimeout(() => {
            if (results.length === 0) {
                console.log("⚠️  0 mensajes procesados. Revisa si el grupo 'auditors' existe.");
            } else {
                const sorted = results.sort((a, b) => a - b);
                const p95 = sorted[Math.floor(results.length * 0.95)] || 0;
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                console.log(`📊 P95: ${p95.toFixed(2)}ms | Total: ${results.length}`);
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            }
            process.exit(0);
        }, 2000);

    } catch (e) {
        console.error("💥 FALLO:", e.message);
        process.exit(1);
    }
}

executeAuditoria();