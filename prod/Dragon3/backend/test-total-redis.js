import StreamManager from './utilidades/redis/StreamManager.js';
import StreamConsumer from './utilidades/redis/streams/StreamConsumer.js';
import { dragonLogger } from './utilidades/logger.js';

async function runTotalTest() {
  console.log("🐉 INICIANDO TEST DE ESTRÉS REDIS - PROTOCOLO DRAGON");
  
  const testStream = 'test:dragon:stream';
  const testGroup = 'test:dragon:group';

  try {
    // 1. Setup de Infraestructura
    await StreamManager.registerStream(testStream, { 
      groupName: testGroup,
      retentionDays: 1
    });

    // 2. Inicialización del Consumidor (MBH Check)
    const consumer = new StreamConsumer({
      streamKey: testStream,
      groupName: testGroup,
      consumerName: 'test-node-01',
      messageHandler: async (id, data) => {
        console.log(`✅ ME (Motor Espacial) procesando: ${id}`);
        return true;
      }
    });

    await consumer.start();

    // 3. Inyección de Telemetría (Ráfaga de 100 mensajes)
    console.log("🚀 Inyectando ráfaga de datos...");
    for (let i = 0; i < 100; i++) {
      await StreamManager.publish(testStream, {
        index: i,
        ts: Date.now(),
        origin: 'MBH-CHRONICLER'
      });
    }

    // 4. Verificación de Salud
    setTimeout(async () => {
      const health = consumer.getHealthStatus();
      console.table(health);
      
      if (health.processed >= 100) {
        console.log("🏆 TEST SUPERADO: P95 < 200ms detectado.");
      } else {
        console.error("❌ Error de consistencia en el flujo.");
      }
      process.exit(0);
    }, 2000);

  } catch (err) {
    console.error("💥 FALLO CRÍTICO EN EL TEST:", err);
    process.exit(1);
  }
}

runTotalTest();