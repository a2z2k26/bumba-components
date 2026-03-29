/**
 * Health Monitoring & Observability System for BUMBA AI Providers
 * Sprint 2.13: Real-time health checks, performance metrics, and cost analytics
 *
 * Provides:
 * - Provider health status monitoring
 * - Performance metrics collection (latency, throughput)
 * - Cost analytics and budget tracking
 * - Alert configuration and notifications
 * - Historical trend analysis
 * - Dashboard-ready data aggregation
 */

const EventEmitter = require('events');

/**
 * Health status levels
 */
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

/**
 * Metric types
 */
const MetricType = {
  LATENCY: 'latency',
  THROUGHPUT: 'throughput',
  ERROR_RATE: 'error_rate',
  SUCCESS_RATE: 'success_rate',
  COST: 'cost',
  TOKENS: 'tokens',
  FREE_TIER_RPM: 'free_tier_rpm',
  FREE_TIER_TPM: 'free_tier_tpm',
  FREE_TIER_RPD: 'free_tier_rpd'
};

/**
 * Alert severity levels
 */
const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Health check result
 *
 * @typedef {Object} HealthCheckResult
 * @property {string} provider - Provider name
 * @property {string} status - Health status (from HealthStatus enum)
 * @property {number} responseTime - Response time in ms
 * @property {string} checkedAt - ISO timestamp
 * @property {string} [error] - Error message if check failed
 * @property {Object} details - Additional check details
 */

/**
 * Performance metric
 *
 * @typedef {Object} PerformanceMetric
 * @property {string} type - Metric type (from MetricType enum)
 * @property {string} provider - Provider name
 * @property {number} value - Metric value
 * @property {string} timestamp - ISO timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Alert configuration
 *
 * @typedef {Object} AlertConfig
 * @property {string} name - Alert name
 * @property {string} metricType - Metric to monitor
 * @property {string} condition - Condition (gt, lt, eq, etc.)
 * @property {number} threshold - Threshold value
 * @property {string} severity - Alert severity
 * @property {number} [duration] - Duration in ms before alert fires
 * @property {boolean} enabled - Whether alert is enabled
 */

/**
 * Health Monitor
 *
 * @class HealthMonitor
 * @extends EventEmitter
 * @description Monitors AI provider health and collects observability metrics
 */
class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      checkInterval: options.checkInterval || 60000, // 1 minute
      metricsRetention: options.metricsRetention || 86400000, // 24 hours
      alertCooldown: options.alertCooldown || 300000, // 5 minutes
      enableAutoChecks: options.enableAutoChecks !== false,
      ...options
    };

    // Health check results by provider
    this.healthChecks = new Map(); // provider -> HealthCheckResult[]

    // Performance metrics
    this.metrics = new Map(); // metricType -> PerformanceMetric[]

    // Alert configurations
    this.alerts = new Map(); // alertName -> AlertConfig

    // Alert firing state
    this.alertState = new Map(); // alertName -> { firedAt, cooldownUntil }

    // Provider endpoints for health checks
    this.providerEndpoints = new Map(); // provider -> { url, method, headers }

    // Start automatic health checks
    if (this.options.enableAutoChecks) {
      this.startHealthChecks();
    }

    // Start metrics cleanup
    this.startMetricsCleanup();
  }

  /**
   * Start automatic health checks
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.checkAllProviders().catch(error => {
        this.emit('error', {
          type: 'health_check_failed',
          error: error.message
        });
      });
    }, this.options.checkInterval);

    // Run initial check
    this.checkAllProviders().catch(() => {});
  }

  /**
   * Stop automatic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Start metrics cleanup timer
   */
  startMetricsCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Clean up every hour
  }

  /**
   * Stop metrics cleanup timer
   */
  stopMetricsCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Register provider endpoint for health checks
   * @param {string} provider - Provider name
   * @param {Object} endpoint - Endpoint configuration
   * @param {string} endpoint.url - Health check URL
   * @param {string} [endpoint.method] - HTTP method
   * @param {Object} [endpoint.headers] - Request headers
   */
  registerProvider(provider, endpoint) {
    this.providerEndpoints.set(provider, {
      url: endpoint.url,
      method: endpoint.method || 'GET',
      headers: endpoint.headers || {}
    });

    this.emit('provider:registered', { provider });
  }

  /**
   * Check health of a single provider
   * @param {string} provider - Provider name
   * @returns {Promise<HealthCheckResult>}
   */
  async checkProvider(provider) {
    const endpoint = this.providerEndpoints.get(provider);

    if (!endpoint) {
      return {
        provider,
        status: HealthStatus.UNKNOWN,
        responseTime: 0,
        checkedAt: new Date().toISOString(),
        error: 'Provider endpoint not registered',
        details: {}
      };
    }

    const startTime = Date.now();
    let result;

    try {
      // Simulate health check (in production, would make actual HTTP request)
      const response = await this._makeHealthCheckRequest(endpoint);
      const responseTime = Date.now() - startTime;

      result = {
        provider,
        status: response.ok ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        responseTime,
        checkedAt: new Date().toISOString(),
        details: response.details || {}
      };

      if (!response.ok && response.error) {
        result.error = response.error;
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      result = {
        provider,
        status: HealthStatus.UNHEALTHY,
        responseTime,
        checkedAt: new Date().toISOString(),
        error: error.message,
        details: {}
      };
    }

    // Store result
    if (!this.healthChecks.has(provider)) {
      this.healthChecks.set(provider, []);
    }
    this.healthChecks.get(provider).push(result);

    // Keep only recent checks (last 100)
    const checks = this.healthChecks.get(provider);
    if (checks.length > 100) {
      checks.splice(0, checks.length - 100);
    }

    // Emit event
    this.emit('health:checked', result);

    // Check for alerts
    this._checkAlerts(result);

    return result;
  }

  /**
   * Check health of all registered providers
   * @returns {Promise<HealthCheckResult[]>}
   */
  async checkAllProviders() {
    const providers = Array.from(this.providerEndpoints.keys());
    const results = await Promise.all(
      providers.map(provider => this.checkProvider(provider))
    );

    this.emit('health:all_checked', {
      timestamp: new Date().toISOString(),
      results
    });

    return results;
  }

  /**
   * Make health check request (stub for testing)
   * @private
   */
  async _makeHealthCheckRequest(endpoint) {
    // In production, this would make an actual HTTP request
    // For now, simulate a successful response
    return {
      ok: true,
      details: {
        uptime: Math.random() * 1000000,
        version: '1.0.0'
      }
    };
  }

  /**
   * Record performance metric
   * @param {Object} metric - Metric data
   * @param {string} metric.type - Metric type
   * @param {string} metric.provider - Provider name
   * @param {number} metric.value - Metric value
   * @param {Object} [metric.metadata] - Additional metadata
   */
  recordMetric(metric) {
    const metricData = {
      type: metric.type,
      provider: metric.provider,
      value: metric.value,
      timestamp: new Date().toISOString(),
      metadata: metric.metadata || {}
    };

    if (!this.metrics.has(metric.type)) {
      this.metrics.set(metric.type, []);
    }

    this.metrics.get(metric.type).push(metricData);

    this.emit('metric:recorded', metricData);

    // Check for metric-based alerts
    this._checkMetricAlerts(metricData);
  }

  /**
   * Get metrics for a specific type and provider
   * @param {string} type - Metric type
   * @param {string} [provider] - Provider name (optional)
   * @param {Object} [options] - Query options
   * @param {number} [options.since] - Timestamp to filter from
   * @param {number} [options.limit] - Max number of metrics
   * @returns {PerformanceMetric[]}
   */
  getMetrics(type, provider, options = {}) {
    const metrics = this.metrics.get(type) || [];

    let filtered = metrics;

    // Filter by provider
    if (provider) {
      filtered = filtered.filter(m => m.provider === provider);
    }

    // Filter by time
    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      filtered = filtered.filter(m => new Date(m.timestamp).getTime() >= sinceTime);
    }

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Get aggregated metrics
   * @param {string} type - Metric type
   * @param {string} [provider] - Provider name (optional)
   * @param {Object} [options] - Query options
   * @returns {Object} Aggregated statistics
   */
  getAggregatedMetrics(type, provider, options = {}) {
    const metrics = this.getMetrics(type, provider, options);

    if (metrics.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        sum: 0
      };
    }

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      sum,
      p50: this._percentile(values, 50),
      p95: this._percentile(values, 95),
      p99: this._percentile(values, 99)
    };
  }

  /**
   * Calculate percentile
   * @private
   */
  _percentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get latest health status for provider
   * @param {string} provider - Provider name
   * @returns {HealthCheckResult|null}
   */
  getProviderHealth(provider) {
    const checks = this.healthChecks.get(provider);
    if (!checks || checks.length === 0) {
      return null;
    }
    return checks[checks.length - 1];
  }

  /**
   * Get overall system health
   * @returns {Object} System health summary
   */
  getSystemHealth() {
    const providers = Array.from(this.providerEndpoints.keys());
    const health = {
      status: HealthStatus.HEALTHY,
      timestamp: new Date().toISOString(),
      providers: {},
      summary: {
        total: providers.length,
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        unknown: 0
      }
    };

    for (const provider of providers) {
      const providerHealth = this.getProviderHealth(provider);

      if (providerHealth) {
        health.providers[provider] = {
          status: providerHealth.status,
          responseTime: providerHealth.responseTime,
          lastCheck: providerHealth.checkedAt
        };

        // Update summary
        switch (providerHealth.status) {
          case HealthStatus.HEALTHY:
            health.summary.healthy++;
            break;
          case HealthStatus.DEGRADED:
            health.summary.degraded++;
            if (health.status === HealthStatus.HEALTHY) {
              health.status = HealthStatus.DEGRADED;
            }
            break;
          case HealthStatus.UNHEALTHY:
            health.summary.unhealthy++;
            health.status = HealthStatus.UNHEALTHY;
            break;
          default:
            health.summary.unknown++;
        }
      } else {
        health.providers[provider] = {
          status: HealthStatus.UNKNOWN,
          lastCheck: null
        };
        health.summary.unknown++;
      }
    }

    return health;
  }

  /**
   * Configure alert
   * @param {AlertConfig} config - Alert configuration
   * @returns {string} Alert name
   */
  configureAlert(config) {
    const alertConfig = {
      name: config.name,
      metricType: config.metricType,
      condition: config.condition || 'gt',
      threshold: config.threshold,
      severity: config.severity || AlertSeverity.WARNING,
      duration: config.duration || 0,
      enabled: config.enabled !== false,
      provider: config.provider || null
    };

    this.alerts.set(config.name, alertConfig);

    this.emit('alert:configured', { name: config.name });

    return config.name;
  }

  /**
   * Check alerts for health check result
   * @private
   */
  _checkAlerts(healthCheck) {
    for (const [name, alert] of this.alerts.entries()) {
      if (!alert.enabled) continue;
      if (alert.provider && alert.provider !== healthCheck.provider) continue;

      // Check response time alerts
      if (alert.metricType === 'response_time') {
        this._evaluateAlert(name, alert, healthCheck.responseTime);
      }

      // Check status alerts
      if (alert.metricType === 'health_status') {
        const statusValue = this._healthStatusToValue(healthCheck.status);
        const thresholdValue = this._healthStatusToValue(alert.threshold);
        this._evaluateAlert(name, alert, statusValue, thresholdValue);
      }
    }
  }

  /**
   * Check alerts for metric
   * @private
   */
  _checkMetricAlerts(metric) {
    for (const [name, alert] of this.alerts.entries()) {
      if (!alert.enabled) continue;
      if (alert.metricType !== metric.type) continue;
      if (alert.provider && alert.provider !== metric.provider) continue;

      this._evaluateAlert(name, alert, metric.value);
    }
  }

  /**
   * Evaluate alert condition
   * @private
   */
  _evaluateAlert(name, alert, value, threshold = alert.threshold) {
    let triggered = false;

    switch (alert.condition) {
      case 'gt':
        triggered = value > threshold;
        break;
      case 'gte':
        triggered = value >= threshold;
        break;
      case 'lt':
        triggered = value < threshold;
        break;
      case 'lte':
        triggered = value <= threshold;
        break;
      case 'eq':
        triggered = value === threshold;
        break;
    }

    if (triggered) {
      this._fireAlert(name, alert, value);
    }
  }

  /**
   * Fire alert
   * @private
   */
  _fireAlert(name, alert, value) {
    const now = Date.now();
    const state = this.alertState.get(name);

    // Check cooldown
    if (state && state.cooldownUntil > now) {
      return;
    }

    // Fire alert
    const alertEvent = {
      name,
      severity: alert.severity,
      metricType: alert.metricType,
      condition: alert.condition,
      threshold: alert.threshold,
      actualValue: value,
      firedAt: new Date().toISOString(),
      provider: alert.provider
    };

    this.emit('alert:fired', alertEvent);

    // Update alert state
    this.alertState.set(name, {
      firedAt: now,
      cooldownUntil: now + this.options.alertCooldown
    });
  }

  /**
   * Convert health status to numeric value for comparison
   * @private
   */
  _healthStatusToValue(status) {
    switch (status) {
      case HealthStatus.HEALTHY: return 3;
      case HealthStatus.DEGRADED: return 2;
      case HealthStatus.UNHEALTHY: return 1;
      default: return 0;
    }
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - this.options.metricsRetention;
    let cleanedCount = 0;

    for (const [type, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => {
        return new Date(m.timestamp).getTime() >= cutoffTime;
      });

      cleanedCount += metrics.length - filtered.length;
      this.metrics.set(type, filtered);
    }

    if (cleanedCount > 0) {
      this.emit('metrics:cleaned', { count: cleanedCount });
    }
  }

  /**
   * Get cost analytics
   * @param {Object} [options] - Query options
   * @param {string} [options.provider] - Provider to filter by
   * @param {number} [options.since] - Timestamp to filter from
   * @returns {Object} Cost analytics
   */
  getCostAnalytics(options = {}) {
    const costMetrics = this.getMetrics(MetricType.COST, options.provider, options);
    const tokenMetrics = this.getMetrics(MetricType.TOKENS, options.provider, options);

    const totalCost = costMetrics.reduce((sum, m) => sum + m.value, 0);
    const totalTokens = tokenMetrics.reduce((sum, m) => sum + m.value, 0);

    // Group by provider
    const byProvider = {};
    for (const metric of costMetrics) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = { cost: 0, requests: 0 };
      }
      byProvider[metric.provider].cost += metric.value;
      byProvider[metric.provider].requests += 1;
    }

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalTokens,
      requestCount: costMetrics.length,
      averageCostPerRequest: costMetrics.length > 0
        ? Math.round((totalCost / costMetrics.length) * 100) / 100
        : 0,
      costPerToken: totalTokens > 0
        ? Math.round((totalCost / totalTokens) * 1000000) / 1000000
        : 0,
      byProvider,
      period: {
        start: costMetrics.length > 0 ? costMetrics[0].timestamp : null,
        end: costMetrics.length > 0 ? costMetrics[costMetrics.length - 1].timestamp : null
      }
    };
  }

  /**
   * Get performance dashboard data
   * @returns {Object} Dashboard data
   */
  getDashboardData() {
    const systemHealth = this.getSystemHealth();
    const providers = Array.from(this.providerEndpoints.keys());

    const dashboard = {
      health: systemHealth,
      metrics: {},
      costs: this.getCostAnalytics(),
      freeTier: this.getFreeTierAnalytics(),
      alerts: {
        configured: this.alerts.size,
        active: Array.from(this.alertState.values()).filter(
          state => state.cooldownUntil > Date.now()
        ).length
      }
    };

    // Get aggregated metrics for each provider
    for (const provider of providers) {
      dashboard.metrics[provider] = {
        latency: this.getAggregatedMetrics(MetricType.LATENCY, provider, { limit: 100 }),
        throughput: this.getAggregatedMetrics(MetricType.THROUGHPUT, provider, { limit: 100 }),
        errorRate: this.getAggregatedMetrics(MetricType.ERROR_RATE, provider, { limit: 100 }),
        successRate: this.getAggregatedMetrics(MetricType.SUCCESS_RATE, provider, { limit: 100 })
      };
    }

    return dashboard;
  }

  /**
   * Record free tier usage metric
   * @param {Object} data - Free tier usage data
   * @param {string} data.provider - Provider name
   * @param {string} data.keyId - Key ID
   * @param {number} data.requestsThisMinute - Current minute requests
   * @param {number} data.tokensThisMinute - Current minute tokens
   * @param {number} data.requestsToday - Today's requests
   * @param {Object} data.limits - Free tier limits
   */
  recordFreeTierUsage(data) {
    const timestamp = new Date().toISOString();

    // Record RPM metric
    if (data.limits.requestsPerMinute) {
      this.recordMetric({
        type: MetricType.FREE_TIER_RPM,
        provider: data.provider,
        value: (data.requestsThisMinute / data.limits.requestsPerMinute) * 100, // % of limit
        timestamp,
        metadata: {
          keyId: data.keyId,
          current: data.requestsThisMinute,
          limit: data.limits.requestsPerMinute
        }
      });
    }

    // Record TPM metric
    if (data.limits.tokensPerMinute) {
      this.recordMetric({
        type: MetricType.FREE_TIER_TPM,
        provider: data.provider,
        value: (data.tokensThisMinute / data.limits.tokensPerMinute) * 100, // % of limit
        timestamp,
        metadata: {
          keyId: data.keyId,
          current: data.tokensThisMinute,
          limit: data.limits.tokensPerMinute
        }
      });
    }

    // Record RPD metric
    if (data.limits.requestsPerDay) {
      this.recordMetric({
        type: MetricType.FREE_TIER_RPD,
        provider: data.provider,
        value: (data.requestsToday / data.limits.requestsPerDay) * 100, // % of limit
        timestamp,
        metadata: {
          keyId: data.keyId,
          current: data.requestsToday,
          limit: data.limits.requestsPerDay
        }
      });
    }

    this.emit('freetier:usage_recorded', {
      provider: data.provider,
      keyId: data.keyId,
      usage: {
        rpm: data.requestsThisMinute,
        tpm: data.tokensThisMinute,
        rpd: data.requestsToday
      }
    });
  }

  /**
   * Get free tier analytics
   * @param {Object} [options] - Query options
   * @param {string} [options.provider] - Provider to filter by
   * @param {number} [options.since] - Timestamp to filter from
   * @returns {Object} Free tier analytics
   */
  getFreeTierAnalytics(options = {}) {
    const rpmMetrics = this.getMetrics(MetricType.FREE_TIER_RPM, options.provider, options);
    const tpmMetrics = this.getMetrics(MetricType.FREE_TIER_TPM, options.provider, options);
    const rpdMetrics = this.getMetrics(MetricType.FREE_TIER_RPD, options.provider, options);

    // Calculate averages
    const avgRpmUtilization = rpmMetrics.length > 0
      ? rpmMetrics.reduce((sum, m) => sum + m.value, 0) / rpmMetrics.length
      : 0;

    const avgTpmUtilization = tpmMetrics.length > 0
      ? tpmMetrics.reduce((sum, m) => sum + m.value, 0) / tpmMetrics.length
      : 0;

    const avgRpdUtilization = rpdMetrics.length > 0
      ? rpdMetrics.reduce((sum, m) => sum + m.value, 0) / rpdMetrics.length
      : 0;

    // Group by provider
    const byProvider = {};

    for (const metric of rpmMetrics) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = {
          rpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          tpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          rpd: { samples: 0, avgUtilization: 0, peakUtilization: 0 }
        };
      }
      byProvider[metric.provider].rpm.samples++;
      byProvider[metric.provider].rpm.avgUtilization += metric.value;
      byProvider[metric.provider].rpm.peakUtilization = Math.max(
        byProvider[metric.provider].rpm.peakUtilization,
        metric.value
      );
    }

    for (const metric of tpmMetrics) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = {
          rpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          tpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          rpd: { samples: 0, avgUtilization: 0, peakUtilization: 0 }
        };
      }
      byProvider[metric.provider].tpm.samples++;
      byProvider[metric.provider].tpm.avgUtilization += metric.value;
      byProvider[metric.provider].tpm.peakUtilization = Math.max(
        byProvider[metric.provider].tpm.peakUtilization,
        metric.value
      );
    }

    for (const metric of rpdMetrics) {
      if (!byProvider[metric.provider]) {
        byProvider[metric.provider] = {
          rpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          tpm: { samples: 0, avgUtilization: 0, peakUtilization: 0 },
          rpd: { samples: 0, avgUtilization: 0, peakUtilization: 0 }
        };
      }
      byProvider[metric.provider].rpd.samples++;
      byProvider[metric.provider].rpd.avgUtilization += metric.value;
      byProvider[metric.provider].rpd.peakUtilization = Math.max(
        byProvider[metric.provider].rpd.peakUtilization,
        metric.value
      );
    }

    // Calculate averages per provider
    for (const provider in byProvider) {
      const data = byProvider[provider];

      if (data.rpm.samples > 0) {
        data.rpm.avgUtilization = Math.round(data.rpm.avgUtilization / data.rpm.samples * 100) / 100;
        data.rpm.peakUtilization = Math.round(data.rpm.peakUtilization * 100) / 100;
      }

      if (data.tpm.samples > 0) {
        data.tpm.avgUtilization = Math.round(data.tpm.avgUtilization / data.tpm.samples * 100) / 100;
        data.tpm.peakUtilization = Math.round(data.tpm.peakUtilization * 100) / 100;
      }

      if (data.rpd.samples > 0) {
        data.rpd.avgUtilization = Math.round(data.rpd.avgUtilization / data.rpd.samples * 100) / 100;
        data.rpd.peakUtilization = Math.round(data.rpd.peakUtilization * 100) / 100;
      }
    }

    return {
      overall: {
        rpm: {
          avgUtilization: Math.round(avgRpmUtilization * 100) / 100,
          samples: rpmMetrics.length
        },
        tpm: {
          avgUtilization: Math.round(avgTpmUtilization * 100) / 100,
          samples: tpmMetrics.length
        },
        rpd: {
          avgUtilization: Math.round(avgRpdUtilization * 100) / 100,
          samples: rpdMetrics.length
        }
      },
      byProvider,
      period: {
        start: rpmMetrics.length > 0 ? rpmMetrics[0].timestamp : null,
        end: rpmMetrics.length > 0 ? rpmMetrics[rpmMetrics.length - 1].timestamp : null
      }
    };
  }

  /**
   * Shutdown health monitor
   */
  shutdown() {
    this.stopHealthChecks();
    this.stopMetricsCleanup();
    this.emit('shutdown');
  }
}

module.exports = {
  HealthMonitor,
  HealthStatus,
  MetricType,
  AlertSeverity
};
