import connectionManager from '../../utilidades/redis/core/ConnectionManager.js';
import { analizarImagen, gestorStreams } from './analizadorImagen.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Capturar errores no capturados para ver el stack completo
process.on('uncaughtException', (err) => {
    console.error('\n💥 UNCAUGHT EXCEPTION (esto es el error real):');
    console.error(err);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n💥 UNHANDLED REJECTION:');
    console.error(reason);
    if (reason instanceof Error) console.error(reason.stack);
    process.exit(1);
});

async function diagnosticarYProbar() {
    const ARCHIVO_ID = `TEST_${Date.now()}`;
    const CANAL_RESPUESTA = `dragon3:stream:resp:superior:${ARCHIVO_ID}`;
    const CANAL_SOLICITUD = 'dragon3:stream:req:superior';

    console.log('\n🔍 ========== DIAGNÓSTICO AVANZADO ==========\n');

    // 1. Obtener clientes y verificar sus bases de datos
    const clienteDB1 = connectionManager.getRawClientById('analysis-client-db1');
    const clienteImagen = connectionManager.getRawClientById('imagen-analyzer');
    const clienteRaw = connectionManager.getRawClientById('server-streams') || (await import('../../utilidades/redis/core/RedisClient.js')).rawRedisClient;

    if (!clienteDB1) throw new Error('❌ analysis-client-db1 NO existe');
    if (!clienteImagen) throw new Error('❌ imagen-analyzer NO existe');
    if (!clienteRaw) console.warn('⚠️ server-streams no disponible');

    console.log(`📌 analysis-client-db1 DB: ${clienteDB1.options?.db ?? '?'}`);
    console.log(`📌 imagen-analyzer DB: ${clienteImagen.options?.db ?? '?'}`);
    console.log(`📌 server-streams DB: ${clienteRaw?.options?.db ?? '?'}`);

    // 2. Verificar estado del cliente `redisCacheClient` ANTES de ejecutar
    const cacheClient = gestorStreams.redisCacheClient;
    if (!cacheClient) {
        console.error('❌ gestorStreams.redisCacheClient NO está definido');
        process.exit(1);
    }
    console.log(`\n🔧 Estado redisCacheClient:`);
    console.log(`   - degradado: ${cacheClient.isDegradedMode()}`);
    console.log(`   - conectado: ${cacheClient.status?.isConnected}`);
    console.log(`   - DB configurada: ${cacheClient.options?.db ?? '?'}`);
    console.log(`   - cliente nativo tiene xadd? ${typeof cacheClient.client?.xadd === 'function'}`);

    // 3. Limpiar streams residuales
    await clienteDB1.del(CANAL_RESPUESTA);
    if (clienteRaw) await clienteRaw.del(CANAL_RESPUESTA).catch(() => {});
    console.log(`\n🧹 Streams de respuesta limpiados`);

    // 4. Interceptar enviarRequestStream
    const originalEnviar = gestorStreams.enviarRequestStream;
    let solicitudPublicada = false;
    gestorStreams.enviarRequestStream = async function(stream, archivoId, datos, correlationId) {
        console.log(`\n📤 [enviarRequestStream] LLAMADA`);
        console.log(`   → archivoId: ${archivoId}`);
        console.log(`   → stream destino: ${stream}`);
        const redis = this.redisCacheClient?.client;
        console.log(`   → Cliente usado: ${redis?.options?.host}:${redis?.options?.port}, DB: ${redis?.options?.db}`);
        console.log(`   → ¿Cliente tiene xadd? ${typeof redis?.xadd === 'function'}`);
        try {
            const result = await originalEnviar.call(this, stream, archivoId, datos, correlationId);
            solicitudPublicada = true;
            console.log(`   ✅ Mensaje publicado con ID: ${result}`);
            return result;
        } catch (err) {
            console.error(`   ❌ Error en enviarRequestStream: ${err.message}`);
            console.error(err.stack);
            throw err;
        }
    };

    // 5. Interceptar _esperarSuperiorViaStreamOnce
    const originalEsperar = gestorStreams._esperarSuperiorViaStreamOnce;
    gestorStreams._esperarSuperiorViaStreamOnce = async function(archivoId, timeoutMs) {
        console.log(`\n🎯 [_esperarSuperiorViaStreamOnce] LLAMADA`);
        console.log(`   → archivoId: ${archivoId}`);
        const respStream = this._buildSuperiorRespStream(archivoId);
        console.log(`   → Esperando en stream: ${respStream}`);
        const redis = connectionManager.getRawClientById('imagen-analyzer');
        const pending = await redis.xlen(respStream).catch(() => 0);
        console.log(`   → Mensajes ya presentes en el stream: ${pending}`);
        const start = Date.now();
        try {
            const res = await originalEsperar.call(this, archivoId, timeoutMs);
            console.log(`   ✅ Respuesta recibida tras ${Date.now()-start}ms`);
            return res;
        } catch(e) {
            console.log(`   ❌ Fallo tras ${Date.now()-start}ms: ${e.message}`);
            throw e;
        }
    };

    // 6. Monitores de streams (se llamarán después si hay timeout o error)
    const monitorSolicitudes = async () => {
        const redisMon = new Redis({ host: '127.0.0.1', port: 6379, db: 1 });
        try {
            const result = await redisMon.xread('STREAMS', CANAL_SOLICITUD, '0-0');
            if (result && result[0] && result[0][1].length) {
                console.log(`\n📡 MONITOR: Solicitudes pendientes en ${CANAL_SOLICITUD}:`);
                for (const [id, fields] of result[0][1]) {
                    const obj = {};
                    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i+1];
                    console.log(`   ID: ${id}, archivoId: ${obj.archivoId}, correlationId: ${obj.correlationId}`);
                }
            } else {
                console.log(`\n📡 MONITOR: No hay solicitudes en ${CANAL_SOLICITUD} (DB1)`);
            }
        } catch(e) { console.error(`Error monitor solicitudes: ${e.message}`); }
        finally { await redisMon.quit(); }
    };

    const monitorRespuesta = async () => {
        const redisMon = new Redis({ host: '127.0.0.1', port: 6379, db: 1 });
        try {
            const result = await redisMon.xread('STREAMS', CANAL_RESPUESTA, '0-0');
            if (result && result[0] && result[0][1].length) {
                console.log(`\n📡 MONITOR: Respuestas en ${CANAL_RESPUESTA}:`);
                for (const [id, fields] of result[0][1]) {
                    const obj = {};
                    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i+1];
                    console.log(`   ID: ${id}, respuesta: ${obj.respuesta?.substring(0,100)}`);
                }
            } else {
                console.log(`\n📡 MONITOR: No hay respuestas en ${CANAL_RESPUESTA} (DB1)`);
            }
        } catch(e) { console.error(`Error monitor respuesta: ${e.message}`); }
        finally { await redisMon.quit(); }
    };

    // 7. Ejecutar el flujo real
    const rutaPrueba = path.join(__dirname, 'prueba.png');
    if (!fs.existsSync(rutaPrueba)) throw new Error(`No existe ${rutaPrueba}`);

    const datosEntrada = {
        archivoId: ARCHIVO_ID,
        buffer: fs.readFileSync(rutaPrueba),
        mimetype: 'image/png',
        rutaArchivo: rutaPrueba
    };

    console.log('\n🚀 Lanzando analizadorImagen (con monkey-patch)...');
    const timeoutId = setTimeout(async () => {
        console.log('\n⏰ TIMEOUT GLOBAL (35s) - El analizador no respondió.');
        await monitorSolicitudes();
        await monitorRespuesta();
        console.log('\n🧹 Saliendo por timeout.');
        process.exit(1);
    }, 35000);

    try {
        const resultado = await analizarImagen(datosEntrada, `corr-${ARCHIVO_ID}`, ARCHIVO_ID);
        clearTimeout(timeoutId);
        console.log('\n========================================');
        console.log('✅ RESULTADO FINAL DEL ANALIZADOR:');
        console.log('Decisión:', resultado.resumen?.decision);
        console.log('Confianza:', resultado.resumen?.confianza);
        console.log('========================================');
    } catch (err) {
        clearTimeout(timeoutId);
        console.error('\n❌ Excepción en analizarImagen:', err);
console.error('Stack:', err.stack);
        if (err.stack) console.error(err.stack);
        await monitorSolicitudes();
        await monitorRespuesta();
        console.log('\n🔧 Más info:');
        console.log(`   - redisCacheClient degradado: ${cacheClient.isDegradedMode()}`);
        console.log(`   - redisCacheClient conectado: ${cacheClient.status?.isConnected}`);
        console.log(`   - Cliente nativo existe: ${!!cacheClient.client}`);
        console.log(`   - ¿Se publicó la solicitud? ${solicitudPublicada ? 'SÍ' : 'NO'}`);
    } finally {
        // Restaurar métodos originales
        gestorStreams.enviarRequestStream = originalEnviar;
        gestorStreams._esperarSuperiorViaStreamOnce = originalEsperar;
        // Limpiar stream de respuesta
        await clienteDB1.del(CANAL_RESPUESTA);
        console.log('\n🧹 Limpieza completada. Saliendo.');
        process.exit(0); // ← Asegura que el proceso termine
    }
}

diagnosticarYProbar().catch(err => {
    console.error('Error fatal en el test:', err);
    process.exit(1);
});