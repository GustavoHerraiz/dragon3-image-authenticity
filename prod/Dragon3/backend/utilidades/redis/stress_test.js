import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configuración
const STREAM_KEY = 'imagenes:pendientes';
const TOTAL_JOBS = 100; // 100 análisis de golpe
// Usamos una imagen que sabemos que existe para que trabajen de verdad
const IMAGEN_TEST = path.resolve('/var/www/Dragon3/backend/scripts/Generador/final.png');

const redis = new Redis({
    host: 'localhost',
    port: 6379
});

async function lanzarAtaque() {
    console.log(`🔥 DRAGON3 STRESS TEST: Lanzando ${TOTAL_JOBS} misiles...`);
    console.log(`   Objetivo: ${STREAM_KEY}`);
    console.log(`   Imagen: ${IMAGEN_TEST}`);

    const start = Date.now();
    const promesas = [];

    for (let i = 0; i < TOTAL_JOBS; i++) {
        const archivoId = uuidv4();
        const correlationId = `stress-${Date.now()}-${i}`;

        const payload = JSON.stringify({
            archivoId: archivoId,
            correlationId: correlationId,
            rutaArchivo: IMAGEN_TEST, // Ruta absoluta
            nombreOriginal: `stress_test_${i}.png`,
            usuarioId: 'admin_test',
            clientId: 'stress_script'
        });

        // Inyección directa en Redis (simulando al Servidor Central)
        promesas.push(redis.xadd(STREAM_KEY, '*', 'payload', payload, 'ts', Date.now()));
    }

    await Promise.all(promesas);
    const duration = Date.now() - start;

    console.log(`✅ Inyección completada en ${duration}ms`);
    console.log(`🚀 Velocidad de inyección: ${(TOTAL_JOBS / (duration/1000)).toFixed(1)} req/sec`);
    console.log(`\n👀 CORRE AHORA MISMO: pm2 logs dragon3-server`);
    console.log(`   Deberías ver a los 4 nodos (93-96) despertarse y procesar en paralelo.`);

    process.exit(0);
}

lanzarAtaque().catch(console.error);
