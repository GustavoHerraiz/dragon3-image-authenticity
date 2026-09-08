// diagnosticarPerdidaRendimiento.js
import dragon from './utilidades/logger.js';

export async function diagnosticarProblemasRendimiento() {
    const problemas = [];

    // 1. Verificar Redis (tu ping está en 2550ms - ¡MUY ALTO!)
    if (global.redisClient) {
        const start = Date.now();
        try {
            await global.redisClient.ping();
            const tiempoRedis = Date.now() - start;
            if (tiempoRedis > 100) {
                problemas.push({
                    tipo: 'REDIS_LENTO',
                    severidad: 'ALTA',
                    descripcion: `Redis responde en ${tiempoRedis}ms (límite: 100ms)`,
                    solucion: 'Revisar conexión Redis, red, o cambiar a Redis local'
                });
            }
        } catch (error) {
            problemas.push({
                tipo: 'REDIS_ERROR',
                severidad: 'CRITICA',
                descripcion: `Redis no responde: ${error.message}`,
                solucion: 'Revisar configuración Redis y conexión de red'
            });
        }
    }

    // 2. Verificar analizadores más lentos
    const analizadoresLentos = [
        'analizadorC2PA',
        'analizadorFirmasDigitales',
        'analizadorExif',
        'analizadorTextura',
        'analizadorArtefactos'
    ];

    // 3. Verificar carga de CPU/Memoria
    const usoMemoria = process.memoryUsage();
    const heapUsagePercent = (usoMemoria.heapUsed / usoMemoria.heapTotal) * 100;

    if (heapUsagePercent > 70) {
        problemas.push({
            tipo: 'ALTA_MEMORIA',
            severidad: 'MEDIA',
            descripcion: `Uso de heap: ${heapUsagePercent.toFixed(1)}%`,
            solucion: 'Revisar fugas de memoria, optimizar analizadores'
        });
    }

    // 4. Verificar sistema de archivos
    try {
        const fs = await import('fs');
        const start = Date.now();
        await fs.promises.readdir('/tmp');
        const tiempoFS = Date.now() - start;
        if (tiempoFS > 50) {
            problemas.push({
                tipo: 'FILESYSTEM_LENTO',
                severidad: 'MEDIA',
                descripcion: `Sistema de archivos lento: ${tiempoFS}ms`,
                solucion: 'Revisar I/O del servidor, considerar SSD'
            });
        }
    } catch (error) {
        // Ignorar errores de /tmp
    }

    dragon.agoniza('Diagnóstico de rendimiento completado', null, 'DIAGNOSTICO_RENDIMIENTO', {
        problemas: problemas.length,
        detalles: problemas
    });

    return problemas;
}

// Función para modo degradado INTELIGENTE
export function configurarModoDegradadoInteligente(problemas) {
    const configDegradado = {
        // ❌ DESACTIVAR completamente en modo degradado crítico
        analizadoresDesactivados: [],
        // ⚡ MANTENER solo analizadores rápidos
        analizadoresPermitidos: [
            'analizadorMBH',
            'analizadorResolucion',
            'analizadorPantalla'
        ],
        // 🔧 AJUSTES de performance
        timeouts: {
            exiftool: 1000,    // Reducido de 2000ms
            total: 3000,       // Reducido de 8000ms
            redis: 500         // Reducido de 2550ms
        },
        // 📉 LIMITES de procesamiento
        limites: {
            maxAnalisisConcurrentes: 5,    // Reducido de 50
            maxTamanoArchivo: 5 * 1024 * 1024, // 5MB max
            cacheForzado: true             // Usar cache agresivamente
        }
    };

    // Si Redis es el problema, ajustar específicamente
    const tieneProblemaRedis = problemas.some(p => p.tipo.includes('REDIS'));
    if (tieneProblemaRedis) {
        configDegradado.analizadoresDesactivados.push(
            'analizadorC2PA',
            'analizadorExif',
            'analizadorFirmasDigitales'
        );
        configDegradado.cacheForzado = true;
        dragon.seEnfada('Modo degradado CRÍTICO - Redis lento', null, 'DEGRADADO_CRITICO', {
            problemasRedis: problemas.filter(p => p.tipo.includes('REDIS'))
        });
    }

    return configDegradado;
}
