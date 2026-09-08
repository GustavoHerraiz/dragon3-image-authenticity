/**
 * AUDITORÍA INTEGRAL DE COMBATE (RS/DB3/ME)
 * No simplificada. Diagnóstico profundo sobre velocidad.
 */
import redisModule from './utilidades/redis/index.js';
import { getAllStreamConfigs } from './utilidades/redis/StreamManager.js';
import dragonLogger from './utilidades/logger.js';

async function executeFullDeepAudit() {
    const stats = { start: Date.now() };
    
    // Espera necesaria para asegurar el enlace del main-client
    await new Promise(r => setTimeout(r, 1000));

    const { rawRedisClient } = redisModule;
    const target = rawRedisClient?.client || 
                   (typeof rawRedisClient?.getRawClient === 'function' ? rawRedisClient.getRawClient() : rawRedisClient);

    if (!target) {
        console.error("❌ ERROR: El Motor Espacial no responde. Enlace roto.");
        process.exit(1);
    }

    const recommendations = [];

    try {
        console.log("🐉 [SISTEMA] INICIANDO AUDITORÍA COMPLETA DE RED SUPERIOR (RS)...");

        // --- 1. INFO GENERAL ---
        const serverInfo = await target.info('server');
        console.log("\n--- 1. INFORMACIÓN GENERAL ---");
        console.log(`📦 Redis v${serverInfo.match(/redis_version:(\S+)/)?.[1]} | Uptime: ${serverInfo.match(/uptime_in_days:(\d+)/)?.[1]}d`);

        // --- 2. TOPOLOGÍA Y STREAMS (EL CORAZÓN DEL DB3) ---
        console.log("\n--- 2. TOPOLOGÍA DE STREAMS Y GRUPOS ---");
        const configs = getAllStreamConfigs();
        for (const cfg of configs) {
            try {
                const sInfo = await target.xinfo('STREAM', cfg.streamKey);
                const len = sInfo[sInfo.indexOf('length') + 1];
                const groups = await target.xinfo('GROUPS', cfg.streamKey);
                
                let totalPending = 0;
                for (const g of groups) {
                    const gName = g[g.indexOf('name') + 1];
                    const pData = await target.xpending(cfg.streamKey, gName);
                    totalPending += pData[0];
                }
                console.log(`🔹 ${cfg.streamKey.padEnd(30)} | len: ${String(len).padEnd(5)} | pending: ${totalPending}`);
                if (totalPending > 50) recommendations.push(`Mensajes atascados en ${cfg.streamKey}: ${totalPending} sin ACK.`);
            } catch (e) {
                console.log(`🔹 ${cfg.streamKey.padEnd(30)} | VACÍO / NO INICIALIZADO`);
            }
        }

        // --- 3. MEMORIA Y FRAGMENTACIÓN (EL CÁNCER DEL BIT) ---
        console.log("\n--- 3. MEMORIA Y FRAGMENTACIÓN ---");
        const memInfo = await target.info('memory');
        const fragRatio = parseFloat(memInfo.match(/mem_fragmentation_ratio:(\S+)/)?.[1]);
        console.log(`🧠 Usada: ${memInfo.match(/used_memory_human:(\S+)/)?.[1]} | Ratio: ${fragRatio} ${fragRatio > 1.5 ? '⚠️' : '✅'}`);
        if (fragRatio > 5) recommendations.push("Fragmentación crítica (Moiré). Requiere MEMORY PURGE.");

        // --- 5. CLIENTES Y BLOQUEOS ---
        console.log("\n--- 5. CLIENTES Y BLOQUEOS ---");
        const clients = await target.info('clients');
        const blocked = clients.match(/blocked_clients:(\d+)/)?.[1];
        console.log(`👥 Conectados: ${clients.match(/connected_clients:(\d+)/)?.[1]} | Bloqueados: ${blocked}`);
        if (parseInt(blocked) > 0) recommendations.push(`${blocked} clientes bloqueados. Posible cuello de botella en streams.`);

        // --- 6. SLOWLOG (DETECCIÓN DE REPLICANTES LENTOS) ---
        console.log("\n--- 6. COMANDOS LENTOS (SLOWLOG) ---");
        const slowlog = await target.slowlog('get', 5);
        if (slowlog.length === 0) console.log("✅ Sin comandos lentos.");
        else slowlog.forEach(log => console.log(`🐢 ${log[3][0]} tomó ${log[2]}µs`));

        // --- 7. LATENCIA P95 (ESTÁNDAR MBH) ---
        console.log("\n--- 7. LATENCIA PING (500 muestras) ---");
        const latencies = [];
        for (let i = 0; i < 500; i++) {
            const t0 = process.hrtime.bigint();
            await target.ping();
            latencies.push(Number(process.hrtime.bigint() - t0) / 1_000_000);
        }
        latencies.sort((a, b) => a - b);
        const p95 = latencies[Math.floor(500 * 0.95)];
        console.log(`⏱️ P50: ${latencies[250].toFixed(2)}ms | P95: ${p95.toFixed(2)}ms`);
        if (p95 > 200) recommendations.push("P95 fuera de estándar MBH (<200ms).");

        // --- 11. PRUEBA DE DATOS GRANDES (1MB) ---
        console.log("\n--- 11. PRUEBA DE CARGA (1MB) ---");
        const tB = process.hrtime.bigint();
        await target.set('audit:big', 'x'.repeat(1024 * 1024), 'PX', 1000);
        console.log(`📦 Escritura 1MB: ${(Number(process.hrtime.bigint() - tB) / 1_000_000).toFixed(3)}ms`);

        // --- RESUMEN FINAL ---
        console.log("\n--- RECOMENDACIONES TÉCNICAS ---");
        recommendations.length ? recommendations.forEach((r, i) => console.log(`${i+1}. ${r}`)) : console.log("✅ Sistema nominal.");

        console.log(`\n✅ AUDITORÍA COMPLETADA EN ${Date.now() - stats.start}ms`);
        process.exit(0);

    } catch (err) {
        dragonLogger.agoniza("Fallo crítico en Auditoría", err);[cite: 2]
        process.exit(1);
    }
}

executeFullDeepAudit();