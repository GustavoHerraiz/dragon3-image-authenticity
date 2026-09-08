// sharp-redis-lock.js - VERSIÓN ENTERPRISE CORREGIDA
import Redis from 'ioredis';

class SharpRedisLock {
    constructor() {
        this.redis = new Redis({
host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            enableReadyCheck: true
        });
        this.lockKey = 'sharp:global:lock';
        this.queueKey = 'sharp:operation:queue';
        this.acquireTimeout = 30000;
        this.lockTTL = 15000;
        this.retryDelay = 50;
    }

    // Helper delay definido como flecha para no perder el 'this'
    delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async executeSharpOperation(operationId, imagePath, operation) {
        if (!operationId || !imagePath || typeof operation !== 'function') {
            throw new Error('Invalid parameters for executeSharpOperation');
        }

        const startTime = Date.now();
        const queueItem = {
            operationId,
            imagePath: imagePath.split('/').pop(),
            timestamp: startTime,
            instance: process.pid
        };
        const queueItemStr = JSON.stringify(queueItem);

        await this.redis.rpush(this.queueKey, queueItemStr);

        try {
            const lockAcquired = await this.acquireLock(operationId, startTime);
            
            if (!lockAcquired) {
                throw new Error(`Lock timeout: ${operationId}`);
            }

            const isFirst = await this.isFirstInQueue(operationId);
            if (!isFirst) {
                await this.releaseLock(operationId);
                // Pequeña espera antes de reintentar para no saturar
                await this.delay(this.retryDelay);
                return this.executeSharpOperation(operationId, imagePath, operation);
            }

            // CORRECCIÓN: Pasamos la función sin ejecutarla aún
            return await this.executeWithTimeout(operation, 10000);

        } finally {
            await this.cleanup(operationId);
        }
    }

    async acquireLock(operationId, startTime) {
        const endTime = startTime + this.acquireTimeout;
        while (Date.now() < endTime) {
            const acquired = await this.redis.set(this.lockKey, operationId, 'NX', 'PX', this.lockTTL);
            if (acquired === 'OK') return true;
            
            await this.delay(this.retryDelay);
        }
        return false;
    }

    async isFirstInQueue(operationId) {
        const firstInQueue = await this.redis.lindex(this.queueKey, 0);
        if (!firstInQueue) return false;
        try {
            return JSON.parse(firstInQueue).operationId === operationId;
        } catch { return false; }
    }

    async executeWithTimeout(operationFn, timeoutMs) {
        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms`)), timeoutMs);
        });
        
        try {
            // Aquí es donde realmente ejecutamos la operación
            return await Promise.race([operationFn(), timeoutPromise]);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    async releaseLock(operationId) {
        const luaScript = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end`;
        await this.redis.eval(luaScript, 1, this.lockKey, operationId);
    }

    async cleanup(operationId) {
        const queueItems = await this.redis.lrange(this.queueKey, 0, -1);
        const itemToRemove = queueItems.find(itemStr => {
            try { return JSON.parse(itemStr).operationId === operationId; }
            catch { return false; }
        });

        const promises = [this.releaseLock(operationId)];
        if (itemToRemove) {
            promises.push(this.redis.lrem(this.queueKey, 1, itemToRemove));
        }
        await Promise.allSettled(promises);
    }
}

export default new SharpRedisLock();