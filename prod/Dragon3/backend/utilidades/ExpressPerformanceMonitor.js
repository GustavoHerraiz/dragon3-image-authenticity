/**
 * ExpressPerformanceMonitor.js - FAANG-level monitoring for Dragon Project
 * Versión: 3.0.0
 * Compatible con la arquitectura ESM de Dragon3
 */

import os from 'os';
import { EventEmitter } from 'events';

export default class ExpressPerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            sampleRate: 0.1,
            maxResponseTime: 1000,
            thresholds: {
                p95: 200, // milliseconds
                errorRate: 0.01, // 1%
            },
            ...options
        };
        
        this.metrics = {
            requests: 0,
            errors: 0,
            responseTimes: [],
            startTime: Date.now(),
            lastReport: Date.now()
        };
        
        this.errorCounts = {};
        this.metricCounts = {};
        
        // Report interval (default 1 minute)
        this.reportInterval = setInterval(() => this.generateReport(), 
            options.reportIntervalMs || 60000);
            
        this.moduleType = 'FAANG_PERFORMANCE_MONITOR';
        
        // Track system metrics for resource usage correlation
        this.systemInfo = {
            platform: os.platform(),
            cpuCores: os.cpus().length,
            totalMemory: os.totalmem(),
            hostname: os.hostname()
        };
    }

    /**
     * Track request performance
     * @param {Object} req - Express request object 
     * @param {Object} res - Express response object
     * @param {number} time - Response time in milliseconds
     */
    trackRequest(req, res, time) {
        this.metrics.requests++;
        this.metrics.responseTimes.push(time);
        
        // Keep last 1000 response times for P95 calculation
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes.shift();
        }
        
        // Emit event if response time exceeds threshold
        if (time > this.options.maxResponseTime) {
            this.emit('slowRequest', { 
                path: req.path, 
                method: req.method, 
                time,
                timestamp: new Date().toISOString()
            });
        }
        
        return time;
    }

    /**
     * Track custom metrics
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     */
    trackMetric(name, value = 1) {
        this.metricCounts[name] = (this.metricCounts[name] || 0) + value;
        return this.metricCounts[name];
    }

    /**
     * Increment error counter
     * @param {string} type - Error type
     */
    incrementErrorCount(type = 'general') {
        this.metrics.errors++;
        this.errorCounts[type] = (this.errorCounts[type] || 0) + 1;
        
        // Calculate current error rate
        const errorRate = this.metrics.errors / this.metrics.requests;
        
        // Emit event if error rate exceeds threshold
        if (errorRate > this.options.thresholds.errorRate) {
            this.emit('highErrorRate', { 
                errorRate,
                errors: this.errorCounts,
                timestamp: new Date().toISOString()
            });
        }
        
        return this.errorCounts[type];
    }

    /**
     * Calculate P95 response time
     * @returns {number} P95 response time in milliseconds
     */
    calculateP95() {
        if (this.metrics.responseTimes.length === 0) return 0;
        
        const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.95);
        return sorted[idx];
    }

    /**
     * Generate performance report
     * @returns {Object} Performance report
     */
    generateReport() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;
        const intervalMs = now - this.metrics.lastReport;
        
        const p95 = this.calculateP95();
        const errorRate = this.metrics.requests > 0 ? 
            this.metrics.errors / this.metrics.requests : 0;
        
        const report = {
            timestamp: new Date().toISOString(),
            uptime: uptime / 1000, // seconds
            p95,
            errorRate,
            requestCount: this.metrics.requests,
            errorCount: this.metrics.errors,
            metrics: { ...this.metricCounts },
            errors: { ...this.errorCounts },
            memory: {
                free: os.freemem(),
                total: os.totalmem(),
                usedPercent: (1 - (os.freemem() / os.totalmem())) * 100
            },
            cpuLoad: os.loadavg()
        };
        
        this.emit('report', report);
        this.metrics.lastReport = now;
        
        return report;
    }
    
    /**
     * Clean up resources when shutting down
     */
    shutdown() {
        clearInterval(this.reportInterval);
        this.emit('shutdown', this.generateReport());
        this.removeAllListeners();
    }
}