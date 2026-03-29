#!/usr/bin/env node

/**
 * Design Bridge Performance Monitor
 * Sprint 22: Performance Testing & Optimization
 *
 * Features:
 * - Real-time performance monitoring
 * - Memory usage tracking
 * - CPU utilization analysis
 * - Response time measurement
 * - Throughput analysis
 * - Bottleneck detection
 * - Performance alerts
 * - Optimization recommendations
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const os = require('os');

class PerformanceMonitor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      monitoringInterval: config.monitoringInterval || 1000,
      alertThresholds: {
        memory: config.alertThresholds?.memory || 0.8, // 80% of available memory
        cpu: config.alertThresholds?.cpu || 0.7, // 70% CPU usage
        responseTime: config.alertThresholds?.responseTime || 5000, // 5 seconds
        errorRate: config.alertThresholds?.errorRate || 0.05 // 5% error rate
      },
      retentionPeriod: config.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
      enableProfiling: config.enableProfiling !== false,
      enableAlerting: config.enableAlerting !== false,
      ...config
    };

    // Performance data storage
    this.metrics = new Map();
    this.timeSeries = [];
    this.alerts = [];
    this.profiles = new Map();

    // Monitoring state
    this.isMonitoring = false;
    this.monitoringTimer = null;
    this.startTime = Date.now();

    // Performance counters
    this.counters = {
      requests: 0,
      errors: 0,
      successes: 0,
      totalResponseTime: 0,
      operations: new Map()
    };

    // Memory baseline
    this.baselineMemory = process.memoryUsage();
    this.systemInfo = this.gatherSystemInfo();
  }

  async initialize() {
    console.log('📊 Initializing Performance Monitor...');

    this.startMonitoring();
    this.setupEventListeners();

    console.log('✅ Performance Monitor initialized');
    this.emit('monitor-initialized');
  }

  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);

    console.log(`📈 Performance monitoring started (interval: ${this.config.monitoringInterval}ms)`);
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    console.log('📊 Performance monitoring stopped');
  }

  setupEventListeners() {
    // Listen for operation events
    this.on('operation-start', this.handleOperationStart.bind(this));
    this.on('operation-end', this.handleOperationEnd.bind(this));
    this.on('operation-error', this.handleOperationError.bind(this));
  }

  collectMetrics() {
    const timestamp = Date.now();

    // System metrics
    const systemMetrics = {
      timestamp,
      memory: this.getMemoryMetrics(),
      cpu: this.getCpuMetrics(),
      system: this.getSystemMetrics()
    };

    // Application metrics
    const appMetrics = {
      timestamp,
      counters: { ...this.counters },
      uptime: timestamp - this.startTime,
      averageResponseTime: this.counters.requests > 0
        ? this.counters.totalResponseTime / this.counters.requests
        : 0,
      errorRate: this.counters.requests > 0
        ? this.counters.errors / this.counters.requests
        : 0,
      throughput: this.calculateThroughput()
    };

    // Combine metrics
    const metrics = { ...systemMetrics, ...appMetrics };

    // Store metrics
    this.timeSeries.push(metrics);
    this.cleanupOldMetrics();

    // Check for alerts
    if (this.config.enableAlerting) {
      this.checkAlerts(metrics);
    }

    // Emit metrics event
    this.emit('metrics-collected', metrics);
  }

  getMemoryMetrics() {
    const memUsage = process.memoryUsage();
    const systemMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    return {
      process: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      system: {
        ...systemMem,
        usagePercent: systemMem.used / systemMem.total
      },
      baseline: this.baselineMemory
    };
  }

  getCpuMetrics() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return {
      usage: 1 - (totalIdle / totalTick),
      loadAverage: {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2]
      },
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown'
    };
  }

  getSystemMetrics() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      nodeVersion: process.version
    };
  }

  calculateThroughput() {
    // Calculate requests per second over the last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentMetrics = this.timeSeries.filter(m => m.timestamp > oneMinuteAgo);

    if (recentMetrics.length < 2) return 0;

    const oldestMetric = recentMetrics[0];
    const newestMetric = recentMetrics[recentMetrics.length - 1];

    const timeDiff = (newestMetric.timestamp - oldestMetric.timestamp) / 1000; // seconds
    const requestDiff = newestMetric.counters.requests - oldestMetric.counters.requests;

    return timeDiff > 0 ? requestDiff / timeDiff : 0;
  }

  handleOperationStart(data) {
    const { operationId, operation, timestamp } = data;

    if (!this.profiles.has(operationId)) {
      this.profiles.set(operationId, {
        operation,
        startTime: timestamp || performance.now(),
        endTime: null,
        duration: null,
        success: null,
        error: null
      });
    }

    // Update operation counter
    const opCount = this.counters.operations.get(operation) || { count: 0, totalTime: 0 };
    opCount.count++;
    this.counters.operations.set(operation, opCount);
  }

  handleOperationEnd(data) {
    const { operationId, success = true, error = null, timestamp } = data;

    const profile = this.profiles.get(operationId);
    if (profile) {
      profile.endTime = timestamp || performance.now();
      profile.duration = profile.endTime - profile.startTime;
      profile.success = success;
      profile.error = error;

      // Update counters
      this.counters.requests++;
      this.counters.totalResponseTime += profile.duration;

      if (success) {
        this.counters.successes++;
      } else {
        this.counters.errors++;
      }

      // Update operation statistics
      const opCount = this.counters.operations.get(profile.operation);
      if (opCount) {
        opCount.totalTime += profile.duration;
      }

      // Clean up profile after processing
      setTimeout(() => {
        this.profiles.delete(operationId);
      }, 1000);
    }
  }

  handleOperationError(data) {
    this.handleOperationEnd({ ...data, success: false });
  }

  checkAlerts(metrics) {
    const alerts = [];

    // Memory usage alert
    if (metrics.memory.system.usagePercent > this.config.alertThresholds.memory) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${(metrics.memory.system.usagePercent * 100).toFixed(1)}%`,
        value: metrics.memory.system.usagePercent,
        threshold: this.config.alertThresholds.memory,
        timestamp: metrics.timestamp
      });
    }

    // CPU usage alert
    if (metrics.cpu.usage > this.config.alertThresholds.cpu) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${(metrics.cpu.usage * 100).toFixed(1)}%`,
        value: metrics.cpu.usage,
        threshold: this.config.alertThresholds.cpu,
        timestamp: metrics.timestamp
      });
    }

    // Response time alert
    if (metrics.averageResponseTime > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'response-time',
        severity: 'warning',
        message: `High response time: ${metrics.averageResponseTime.toFixed(0)}ms`,
        value: metrics.averageResponseTime,
        threshold: this.config.alertThresholds.responseTime,
        timestamp: metrics.timestamp
      });
    }

    // Error rate alert
    if (metrics.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        type: 'error-rate',
        severity: 'critical',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
        value: metrics.errorRate,
        threshold: this.config.alertThresholds.errorRate,
        timestamp: metrics.timestamp
      });
    }

    // Store and emit alerts
    alerts.forEach(alert => {
      this.alerts.push(alert);
      this.emit('performance-alert', alert);
      console.warn(`⚠️ Performance Alert: ${alert.message}`);
    });
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.timeSeries = this.timeSeries.filter(m => m.timestamp > cutoff);
    this.alerts = this.alerts.filter(a => a.timestamp > cutoff);
  }

  gatherSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      totalMemory: os.totalmem(),
      cpus: os.cpus().length,
      hostname: os.hostname()
    };
  }

  // Public API methods

  startOperation(operation, operationId = null) {
    const id = operationId || this.generateOperationId();
    this.emit('operation-start', {
      operationId: id,
      operation,
      timestamp: performance.now()
    });
    return id;
  }

  endOperation(operationId, success = true, error = null) {
    this.emit('operation-end', {
      operationId,
      success,
      error,
      timestamp: performance.now()
    });
  }

  measureAsync(operation, asyncFunction) {
    return async (...args) => {
      const operationId = this.startOperation(operation);
      try {
        const result = await asyncFunction.apply(this, args);
        this.endOperation(operationId, true);
        return result;
      } catch (error) {
        this.endOperation(operationId, false, error);
        throw error;
      }
    };
  }

  measureSync(operation, syncFunction) {
    return (...args) => {
      const operationId = this.startOperation(operation);
      try {
        const result = syncFunction.apply(this, args);
        this.endOperation(operationId, true);
        return result;
      } catch (error) {
        this.endOperation(operationId, false, error);
        throw error;
      }
    };
  }

  getMetrics(timeRange = 'last-hour') {
    let cutoff;
    switch (timeRange) {
      case 'last-minute':
        cutoff = Date.now() - 60 * 1000;
        break;
      case 'last-hour':
        cutoff = Date.now() - 60 * 60 * 1000;
        break;
      case 'last-day':
        cutoff = Date.now() - 24 * 60 * 60 * 1000;
        break;
      default:
        cutoff = Date.now() - 60 * 60 * 1000; // Default to last hour
    }

    const filteredMetrics = this.timeSeries.filter(m => m.timestamp > cutoff);

    if (filteredMetrics.length === 0) {
      return null;
    }

    const latest = filteredMetrics[filteredMetrics.length - 1];

    // Calculate aggregated statistics
    const stats = this.calculateAggregatedStats(filteredMetrics);

    return {
      current: latest,
      aggregated: stats,
      timeRange,
      dataPoints: filteredMetrics.length
    };
  }

  calculateAggregatedStats(metrics) {
    if (metrics.length === 0) return null;

    const responseTimes = metrics.map(m => m.averageResponseTime).filter(rt => rt > 0);
    const errorRates = metrics.map(m => m.errorRate);
    const memoryUsage = metrics.map(m => m.memory.system.usagePercent);
    const cpuUsage = metrics.map(m => m.cpu.usage);

    return {
      responseTime: {
        avg: this.average(responseTimes),
        min: Math.min(...responseTimes),
        max: Math.max(...responseTimes),
        p95: this.percentile(responseTimes, 0.95)
      },
      errorRate: {
        avg: this.average(errorRates),
        min: Math.min(...errorRates),
        max: Math.max(...errorRates)
      },
      memory: {
        avg: this.average(memoryUsage),
        min: Math.min(...memoryUsage),
        max: Math.max(...memoryUsage)
      },
      cpu: {
        avg: this.average(cpuUsage),
        min: Math.min(...cpuUsage),
        max: Math.max(...cpuUsage)
      }
    };
  }

  getOperationStats() {
    const stats = {};

    for (const [operation, data] of this.counters.operations) {
      stats[operation] = {
        count: data.count,
        totalTime: data.totalTime,
        averageTime: data.count > 0 ? data.totalTime / data.count : 0
      };
    }

    return stats;
  }

  getAlerts(severity = null) {
    if (!severity) {
      return this.alerts;
    }

    return this.alerts.filter(alert => alert.severity === severity);
  }

  generateReport() {
    const metrics = this.getMetrics('last-hour');
    const operationStats = this.getOperationStats();
    const alerts = this.getAlerts();

    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      systemInfo: this.systemInfo,
      metrics,
      operations: operationStats,
      alerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      healthScore: this.calculateHealthScore(metrics)
    };
  }

  calculateHealthScore(metrics) {
    if (!metrics?.current) return 100;

    let score = 100;
    const current = metrics.current;

    // Deduct points for high resource usage
    if (current.memory.system.usagePercent > 0.8) score -= 20;
    else if (current.memory.system.usagePercent > 0.6) score -= 10;

    if (current.cpu.usage > 0.8) score -= 20;
    else if (current.cpu.usage > 0.6) score -= 10;

    // Deduct points for high response time
    if (current.averageResponseTime > 5000) score -= 25;
    else if (current.averageResponseTime > 2000) score -= 15;

    // Deduct points for errors
    if (current.errorRate > 0.05) score -= 30;
    else if (current.errorRate > 0.01) score -= 15;

    return Math.max(0, score);
  }

  // Utility methods

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  average(numbers) {
    return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
  }

  percentile(numbers, p) {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  shutdown() {
    console.log('🛑 Shutting down Performance Monitor...');
    this.stopMonitoring();
    this.emit('monitor-shutdown');
    console.log('✅ Performance Monitor shutdown complete');
  }
}

module.exports = PerformanceMonitor;