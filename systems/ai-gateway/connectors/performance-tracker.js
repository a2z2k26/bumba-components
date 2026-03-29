/**
 * Performance Tracker
 * Sprint 2.18: Monitors model performance and reliability
 *
 * Tracks success rates, errors, latency, and identifies problematic models
 */

const fs = require('fs').promises;
const path = require('path');
// [OPTIONAL] const { logger } = require('../core/logging/bumba-logger'); // May need @bumba/* package

/**
 * Error categories
 */
const ErrorType = {
  QUOTA_EXHAUSTED: 'quota_exhausted',
  API_ERROR: 'api_error',
  TIMEOUT: 'timeout',
  NETWORK_ERROR: 'network_error',
  INVALID_RESPONSE: 'invalid_response',
  RATE_LIMIT: 'rate_limit',
  AUTH_ERROR: 'auth_error',
  MODEL_NOT_FOUND: 'model_not_found',
  BUDGET_EXCEEDED: 'budget_exceeded',
  UNKNOWN: 'unknown'
};

/**
 * Performance metrics for a single model
 */
class ModelMetrics {
  constructor(modelName) {
    this.modelName = modelName;
    this.requests = 0;
    this.success = 0;
    this.failures = 0;
    this.errors = {}; // { errorType: { count, lastOccurrence, messages: [] } }
    this.latencies = []; // Last 100 latencies
    this.firstUsed = Date.now();
    this.lastUsed = null;
  }

  /**
   * Record successful request
   */
  recordSuccess(latency) {
    this.requests++;
    this.success++;
    this.lastUsed = Date.now();

    if (latency) {
      this.latencies.push(latency);
      // Keep only last 100 latencies
      if (this.latencies.length > 100) {
        this.latencies.shift();
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure(errorType, errorMessage, latency) {
    this.requests++;
    this.failures++;
    this.lastUsed = Date.now();

    if (latency) {
      this.latencies.push(latency);
      if (this.latencies.length > 100) {
        this.latencies.shift();
      }
    }

    // Track error details
    if (!this.errors[errorType]) {
      this.errors[errorType] = {
        count: 0,
        lastOccurrence: null,
        messages: []
      };
    }

    this.errors[errorType].count++;
    this.errors[errorType].lastOccurrence = Date.now();

    // Keep last 10 error messages
    this.errors[errorType].messages.push({
      message: errorMessage,
      timestamp: Date.now()
    });

    if (this.errors[errorType].messages.length > 10) {
      this.errors[errorType].messages.shift();
    }
  }

  /**
   * Get success rate percentage
   */
  getSuccessRate() {
    if (this.requests === 0) return 0;
    return (this.success / this.requests) * 100;
  }

  /**
   * Get average latency in milliseconds
   */
  getAverageLatency() {
    if (this.latencies.length === 0) return 0;
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    return sum / this.latencies.length;
  }

  /**
   * Get median latency in milliseconds
   */
  getMedianLatency() {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Get P95 latency in milliseconds
   */
  getP95Latency() {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index];
  }

  /**
   * Check if model is problematic
   */
  isProblematic(successThreshold = 80) {
    return this.requests >= 10 && this.getSuccessRate() < successThreshold;
  }

  /**
   * Get summary object
   */
  toJSON() {
    return {
      modelName: this.modelName,
      requests: this.requests,
      success: this.success,
      failures: this.failures,
      successRate: this.getSuccessRate(),
      latency: {
        average: this.getAverageLatency(),
        median: this.getMedianLatency(),
        p95: this.getP95Latency()
      },
      errors: this.errors,
      firstUsed: this.firstUsed,
      lastUsed: this.lastUsed
    };
  }
}

/**
 * PerformanceTracker - Monitors and analyzes model performance
 */
class PerformanceTracker {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      successThreshold: config.successThreshold || 80, // %
      latencyThreshold: config.latencyThreshold || 5000, // ms
      errorReportingThreshold: config.errorReportingThreshold || 5, // errors before reporting
      storageDir: config.storageDir || path.join(process.cwd(), '.bumba', 'performance'),
      persistInterval: config.persistInterval || 60000, // 1 minute
      ...config
    };

    this.metrics = {}; // { modelName: ModelMetrics }
    this.initialized = false;
    this.persistTimer = null;
  }

  /**
   * Initialize performance tracker
   */
  async initialize() {
    if (!this.config.enabled) {
      logger.info('Performance tracking disabled');
      return;
    }

    logger.info('📊 Initializing performance tracker...');

    try {
      // Ensure storage directory exists
      await fs.mkdir(this.config.storageDir, { recursive: true });

      // Load persisted metrics
      await this.loadMetrics();

      // Start periodic persistence
      this.persistTimer = setInterval(
        () => this.saveMetrics(),
        this.config.persistInterval
      );

      this.initialized = true;
      logger.info('✅ Performance tracker initialized');
    } catch (error) {
      logger.error('Failed to initialize performance tracker:', error.message);
      throw error;
    }
  }

  /**
   * Record successful model request
   */
  async recordSuccess(modelName, latency) {
    if (!this.config.enabled) return;

    if (!this.initialized) {
      await this.initialize();
    }

    this.getOrCreateMetrics(modelName).recordSuccess(latency);
  }

  /**
   * Record failed model request
   */
  async recordFailure(modelName, error, latency) {
    if (!this.config.enabled) return;

    if (!this.initialized) {
      await this.initialize();
    }

    const errorType = this.categorizeError(error);
    const errorMessage = error.message || error.toString();

    this.getOrCreateMetrics(modelName).recordFailure(errorType, errorMessage, latency);

    // Check if we should report problematic model
    const metrics = this.metrics[modelName];
    if (metrics.isProblematic(this.config.successThreshold)) {
      logger.warn(`⚠️  Model ${modelName} is problematic: ${metrics.getSuccessRate().toFixed(1)}% success rate`);
    }

    // Report if error count exceeds threshold
    const errorCount = metrics.errors[errorType]?.count || 0;
    if (errorCount === this.config.errorReportingThreshold) {
      logger.error(`🔴 Model ${modelName} has ${errorCount} ${errorType} errors`);
    }
  }

  /**
   * Categorize error into error type
   */
  categorizeError(error) {
    const message = (error.message || error.toString()).toLowerCase();

    if (message.includes('quota') || message.includes('limit reached')) {
      return ErrorType.QUOTA_EXHAUSTED;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT;
    }
    if (message.includes('rate limit')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('api key')) {
      return ErrorType.AUTH_ERROR;
    }
    if (message.includes('not found') || message.includes('model') && message.includes('does not exist')) {
      return ErrorType.MODEL_NOT_FOUND;
    }
    if (message.includes('budget')) {
      return ErrorType.BUDGET_EXCEEDED;
    }
    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return ErrorType.NETWORK_ERROR;
    }
    if (message.includes('5') && message.includes('0')) { // 500, 502, 503, 504
      return ErrorType.API_ERROR;
    }
    if (message.includes('invalid') || message.includes('parse')) {
      return ErrorType.INVALID_RESPONSE;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Get or create metrics for a model
   */
  getOrCreateMetrics(modelName) {
    if (!this.metrics[modelName]) {
      this.metrics[modelName] = new ModelMetrics(modelName);
    }
    return this.metrics[modelName];
  }

  /**
   * Get metrics for a specific model
   */
  getModelMetrics(modelName) {
    return this.metrics[modelName]?.toJSON() || null;
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {};
    for (const [modelName, metrics] of Object.entries(this.metrics)) {
      result[modelName] = metrics.toJSON();
    }
    return result;
  }

  /**
   * Get problematic models (below success threshold)
   */
  getProblematicModels(threshold = null) {
    const successThreshold = threshold || this.config.successThreshold;
    return Object.values(this.metrics)
      .filter(metrics => metrics.isProblematic(successThreshold))
      .map(metrics => ({
        modelName: metrics.modelName,
        successRate: metrics.getSuccessRate(),
        failures: metrics.failures,
        requests: metrics.requests
      }))
      .sort((a, b) => a.successRate - b.successRate);
  }

  /**
   * Get high-latency models
   */
  getHighLatencyModels(threshold = null) {
    const latencyThreshold = threshold || this.config.latencyThreshold;
    return Object.values(this.metrics)
      .filter(metrics => metrics.getAverageLatency() > latencyThreshold)
      .map(metrics => ({
        modelName: metrics.modelName,
        averageLatency: metrics.getAverageLatency(),
        medianLatency: metrics.getMedianLatency(),
        p95Latency: metrics.getP95Latency()
      }))
      .sort((a, b) => b.averageLatency - a.averageLatency);
  }

  /**
   * Get summary of all tracked models
   */
  getSummary() {
    const models = Object.values(this.metrics);

    if (models.length === 0) {
      return {
        totalModels: 0,
        totalRequests: 0,
        overallSuccessRate: 0,
        problematicModels: [],
        highLatencyModels: []
      };
    }

    const totalRequests = models.reduce((sum, m) => sum + m.requests, 0);
    const totalSuccess = models.reduce((sum, m) => sum + m.success, 0);

    return {
      totalModels: models.length,
      totalRequests,
      totalSuccess,
      totalFailures: totalRequests - totalSuccess,
      overallSuccessRate: totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0,
      problematicModels: this.getProblematicModels(),
      highLatencyModels: this.getHighLatencyModels()
    };
  }

  /**
   * Load metrics from disk
   */
  async loadMetrics() {
    try {
      const metricsPath = path.join(this.config.storageDir, 'metrics.json');
      const data = await fs.readFile(metricsPath, 'utf8');
      const parsed = JSON.parse(data);

      // Reconstruct ModelMetrics objects
      for (const [modelName, metricsData] of Object.entries(parsed)) {
        const metrics = new ModelMetrics(modelName);
        Object.assign(metrics, metricsData);
        this.metrics[modelName] = metrics;
      }

      logger.debug(`Loaded performance metrics for ${Object.keys(this.metrics).length} models`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load performance metrics:', error.message);
      }
      // File doesn't exist yet, use defaults
    }
  }

  /**
   * Save metrics to disk
   */
  async saveMetrics() {
    try {
      const metricsPath = path.join(this.config.storageDir, 'metrics.json');
      const data = {};

      for (const [modelName, metrics] of Object.entries(this.metrics)) {
        data[modelName] = metrics.toJSON();
      }

      await fs.writeFile(metricsPath, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Saved performance metrics to disk');
    } catch (error) {
      logger.error('Failed to save performance metrics:', error.message);
    }
  }

  /**
   * Reset metrics for a specific model
   */
  resetModel(modelName) {
    if (this.metrics[modelName]) {
      delete this.metrics[modelName];
      logger.info(`Reset metrics for ${modelName}`);
    }
  }

  /**
   * Reset all metrics
   */
  resetAll() {
    this.metrics = {};
    logger.warn('⚠️  Reset all performance metrics');
  }

  /**
   * Cleanup - stop periodic persistence
   */
  cleanup() {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }
}

// Singleton instance
let instance = null;

module.exports = {
  PerformanceTracker,
  ErrorType,
  getInstance: (config) => {
    if (!instance) {
      instance = new PerformanceTracker(config);
    }
    return instance;
  }
};
