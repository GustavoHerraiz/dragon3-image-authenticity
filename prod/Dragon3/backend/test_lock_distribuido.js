import Redis from 'ioredis';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import process from 'process';

/**
 * 🎯 TEST ESTRÉS: LOCK DISTRIBUIDO SHARP EN PM2 CLUSTER (ESM VERSION)
 */

class SharpLockTester {
  constructor() {
    this.redis = new Redis({ port: 6379, host: 'localhost' });
    this.results = {
      totalOps: 0,
      concurrentViolations: 0,
      lockFailures: 0,
      deadlocks: 0,
      timeouts: 0,
      maxConcurrent: 0,
      operationTimestamps: []
    };

    this.currentConcurrent = 0;
    this.maxConcurrent = 0;
    this.operationLog = [];
  }

  async testConcurrentSharpOperations(numInstances = 4, totalOperations = 200) {
    console.log(`🔥 INICIANDO TEST ESTRÉS: ${numInstances} instancias, ${totalOperations} operaciones`);

    // 1. LIMPIAR REDIS COMPLETAMENTE
    await this.redis.flushall();

    // 2. SIMULAR 4 INSTANCIAS PM2 (workers)
    const instances = [];
    for (let i = 0; i < numInstances; i++) {
      instances.push(this.simulatePM2Instance(i, Math.floor(totalOperations / numInstances)));
    }

    // 3. EJECUTAR CONCURRENCIA MASIVA
    const startTime = performance.now();
    await Promise.allSettled(instances);
    const totalDuration = performance.now() - startTime;

    // 4. ANÁLISIS FORENSE DETALLADO
    await this.analyzeResults(totalDuration);
  }

  async simulatePM2Instance(instanceId, operationsCount) {
    const instanceResults = {
      instanceId,
      operationsCompleted: 0,
      operationsFailed: 0,
      lockWaitTimes: [],
      operationDurations: []
    };

    // Simular carga de trabajo variable por instancia
    const operations = Array(operationsCount).fill().map((_, i) =>
      this.simulateSharpOperation(instanceId, i)
    );

    // Ejecutar con cierto paralelismo interno (10 concurrentes por instancia)
    const concurrency = 10;
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map(op => op()));

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          instanceResults.operationsCompleted++;
          instanceResults.lockWaitTimes.push(result.value.lockWaitTime);
          instanceResults.operationDurations.push(result.value.totalDuration);
        } else {
          instanceResults.operationsFailed++;
          // console.error(`Instancia ${instanceId} falló:`, result.reason); // Ruido
        }
      });
    }

    return instanceResults;
  }

  simulateSharpOperation(instanceId, operationId) {
    return async () => {
      const opStartTime = performance.now();
      const lockKey = 'sharp:global:distributed:lock';
      const queueKey = 'sharp:global:operation:queue';
      const lockId = `lock_${instanceId}_${operationId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 🎯 FASE 1: ENCOLAR OPERACIÓN
      await this.redis.lpush(queueKey, JSON.stringify({
        lockId,
        operation: `sharp_op_${operationId}`,
        instance: instanceId,
        timestamp: Date.now()
      }));

      // 🎯 FASE 2: ADQUIRIR LOCK DISTRIBUIDO
      const lockStartTime = performance.now();
      let lockAcquired = false;
      const lockTimeout = 10000; // 10s timeout
      const lockExpiry = 5000; // 5s expiry

      while (!lockAcquired && (performance.now() - lockStartTime) < lockTimeout) {
        // Intentar SET con NX PX (atomic)
        const result = await this.redis.set(lockKey, lockId, 'NX', 'PX', lockExpiry);

        if (result === 'OK') {
          lockAcquired = true;

          this.currentConcurrent++;
          this.maxConcurrent = Math.max(this.maxConcurrent, this.currentConcurrent);

          this.operationLog.push({
            timestamp: Date.now(),
            instanceId,
            operationId,
            action: 'LOCK_ACQUIRED',
            concurrentCount: this.currentConcurrent
          });

          if (this.currentConcurrent > 1) {
            this.results.concurrentViolations++;
            console.error(`🚨 VIOLACIÓN: ${this.currentConcurrent} operaciones concurrentes!`);
          }
        } else {
          // Esperar (backoff simple)
          await new Promise(r => setTimeout(r, 50));
        }
      }

      const lockWaitTime = performance.now() - lockStartTime;

      if (!lockAcquired) {
        this.results.timeouts++;
        throw new Error(`Timeout lock ${operationId} instancia ${instanceId}`);
      }

      // 🎯 FASE 3: SIMULAR OPERACIÓN SHARP (100-300ms)
      const sharpOpDuration = 100 + Math.random() * 200;
      await new Promise(r => setTimeout(r, sharpOpDuration));

      // 🎯 FASE 4: VERIFICAR LOCK
      const currentLockId = await this.redis.get(lockKey);
      if (currentLockId !== lockId) {
        this.results.lockFailures++;
        // No lanzamos error para no parar el flujo, pero contamos el fallo
      }

      // 🎯 FASE 5: LIBERAR LOCK (Script Lua para atomicidad)
      const unlockScript = 'if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end';
      await this.redis.eval(unlockScript, 1, lockKey, lockId);

      this.currentConcurrent--;

      this.operationLog.push({
        timestamp: Date.now(),
        instanceId,
        operationId,
        action: 'LOCK_RELEASED',
        concurrentCount: this.currentConcurrent
      });

      const totalDuration = performance.now() - opStartTime;
      this.results.totalOps++;
      this.results.operationTimestamps.push({
        instanceId,
        operationId,
        totalDuration,
        lockWaitTime
      });

      return { lockWaitTime, totalDuration };
    };
  }

  async analyzeResults(totalDuration) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 ANÁLISIS FORENSE DEL LOCK DISTRIBUIDO');
    console.log('='.repeat(80));

    // 1. CONCURRENCIA
    console.log(`\n🔍 CONCURRENCIA SHARP:`);
    console.log(`   Máximo concurrente: ${this.maxConcurrent} (Debe ser 1)`);
    console.log(`   Violaciones: ${this.results.concurrentViolations}`);

    if (this.maxConcurrent > 1) console.error(`   ❌ FALLO: Serialización rota`);
    else console.log(`   ✅ ÉXITO: Serialización perfecta`);

    // 2. ESTADÍSTICAS
    console.log(`\n🔒 ESTADÍSTICAS:`);
    console.log(`   Operaciones: ${this.results.totalOps}`);
    console.log(`   Fallos Lock: ${this.results.lockFailures}`);
    console.log(`   Timeouts: ${this.results.timeouts}`);
    console.log(`   Tasa éxito: ${((this.results.totalOps - this.results.lockFailures - this.results.timeouts) / this.results.totalOps * 100).toFixed(2)}%`);

    // 3. RENDIMIENTO
    console.log(`\n⚡ RENDIMIENTO:`);
    console.log(`   Duración total: ${totalDuration.toFixed(0)}ms`);
    console.log(`   Throughput: ${(this.results.totalOps / (totalDuration / 1000)).toFixed(2)} ops/sec`);

    const waitTimes = this.results.operationTimestamps.map(op => op.lockWaitTime);
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    console.log(`   Espera media lock: ${avgWait.toFixed(2)}ms`);

    // 4. ATOMICIDAD
    await this.verifyAtomicity();

    // VEREDICTO
    console.log('\n' + '='.repeat(80));
    if (this.maxConcurrent === 1 && this.results.concurrentViolations === 0) {
      console.log('✅ ✅ ✅ CERTIFICADO: LOCK DISTRIBUIDO SEGURO');
    } else {
      console.error('❌ ❌ ❌ FALLO DE CERTIFICACIÓN');
    }
    console.log('='.repeat(80));
  }

  async verifyAtomicity() {
    console.log(`\n🔬 VERIFICACIÓN ATOMICIDAD (SET NX):`);
    const testKey = 'atomicity_test';
    await this.redis.del(testKey);

    let successes = 0;
    const promises = Array(50).fill().map(async () => {
      const res = await this.redis.set(testKey, 'val', 'NX', 'PX', 1000);
      if (res === 'OK') successes++;
    });

    await Promise.all(promises);
    console.log(`   Intentos simultáneos: 50 | Éxitos: ${successes}`);
    if (successes === 1) console.log(`   ✅ Atomicidad confirmada (Solo 1 ganó)`);
    else console.error(`   ❌ FALLO: ${successes} procesos ganaron el lock (Race Condition)`);
  }
}

// EJECUCIÓN (Fix ESM)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tester = new SharpLockTester();
  // Test con 4 instancias y 200 operaciones
  tester.testConcurrentSharpOperations(4, 200)
    .then(() => tester.redis.quit())
    .catch(console.error);
}

export { SharpLockTester };
