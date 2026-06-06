/**
 * MCP Server Health Monitor
 * Monitors health and performance of MCP servers
 */

const { EventEmitter } = require('events');

class MCPHealthMonitor extends EventEmitter {
  constructor(dynamicLoader, sessionState) {
    super();
    this.loader = dynamicLoader;
    this.sessionState = sessionState;

    // Health tracking
    this.healthData = new Map();
    this.healthCheckInterval = null;
    this.checkFrequency = 30000; // 30 seconds

    // Performance metrics
    this.metrics = new Map();

    // Alert thresholds
    this.thresholds = {
      memoryUsage: 500 * 1024 * 1024, // 500MB
      cpuUsage: 80, // 80%
      responseTime: 5000, // 5 seconds
      errorRate: 0.1, // 10% error rate
      restartCount: 3 // Max restarts before alert
    };

    // Circuit breaker states
    this.circuitBreakers = new Map();
  }

  /**
   * Start health monitoring
   */
  start() {
    console.log('Starting MCP health monitor...');

    // Initial health check
    this.performHealthCheck();

    // Set up periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.checkFrequency);

    // Listen for server events
    this.setupEventListeners();

    this.emit('monitor:started');
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.emit('monitor:stopped');
  }

  /**
   * Perform health check on all active servers
   */
  async performHealthCheck() {
    const status = this.loader.getServerStatus();
    const timestamp = Date.now();

    for (const server of status.active) {
      const health = await this.checkServerHealth(server);

      // Update health data
      this.healthData.set(server.name, {
        ...health,
        timestamp,
        uptime: server.uptime
      });

      // Check thresholds
      this.checkThresholds(server.name, health);

      // Update metrics
      this.updateMetrics(server.name, health);
    }

    this.emit('health:checked', this.getHealthSummary());
  }

  /**
   * Check individual server health
   */
  async checkServerHealth(server) {
    const health = {
      status: 'healthy',
      responsive: true,
      memoryUsage: 0,
      cpuUsage: 0,
      errorCount: 0,
      warningCount: 0,
      lastError: null,
      restartCount: this.getRestartCount(server.name)
    };

    try {
      // Check if process is still running
      if (server.pid) {
        const processInfo = await this.getProcessInfo(server.pid);
        if (processInfo) {
          health.memoryUsage = processInfo.memory;
          health.cpuUsage = processInfo.cpu;
        } else {
          health.status = 'unhealthy';
          health.responsive = false;
        }
      }

      // Get error metrics from session state
      const serverState = this.sessionState.getServerState(server.name);
      if (serverState) {
        health.errorCount = serverState.errorCount || 0;
        health.warningCount = serverState.warningCount || 0;
        health.lastError = serverState.lastError || null;
      }

      // Determine overall health status
      if (!health.responsive) {
        health.status = 'critical';
      } else if (health.errorCount > 10) {
        health.status = 'unhealthy';
      } else if (health.warningCount > 5) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'error';
      health.lastError = error.message;
    }

    return health;
  }

  /**
   * Get process information
   */
  async getProcessInfo(pid) {
    try {
      // This is a simplified version - in production, use proper process monitoring
      const { exec } = require('child_process').promise || require('util').promisify(require('child_process').exec);

      // Get memory and CPU usage (platform-specific)
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await exec(`ps -o %mem,rss,vsz,cpu -p ${pid}`);
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const [mem, rss, vsz, cpu] = lines[1].trim().split(/\s+/);
          return {
            memory: parseInt(rss) * 1024, // RSS in bytes
            cpu: parseFloat(cpu)
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check health thresholds
   */
  checkThresholds(serverName, health) {
    const alerts = [];

    if (health.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage: ${Math.round(health.memoryUsage / 1024 / 1024)}MB`
      });
    }

    if (health.cpuUsage > this.thresholds.cpuUsage) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU usage: ${health.cpuUsage}%`
      });
    }

    if (health.restartCount >= this.thresholds.restartCount) {
      alerts.push({
        type: 'stability',
        severity: 'critical',
        message: `Server restarted ${health.restartCount} times`
      });
    }

    if (health.status === 'critical' || health.status === 'error') {
      alerts.push({
        type: 'health',
        severity: 'critical',
        message: `Server is ${health.status}`
      });
    }

    if (alerts.length > 0) {
      this.emit('health:alert', { serverName, alerts, health });
      this.handleAlerts(serverName, alerts);
    }
  }

  /**
   * Handle health alerts
   */
  async handleAlerts(serverName, alerts) {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');

    if (criticalAlerts.length > 0) {
      // Check circuit breaker
      const breaker = this.getCircuitBreaker(serverName);

      if (breaker.state === 'open') {
        console.log(`Circuit breaker open for ${serverName}, skipping restart`);
        return;
      }

      // Attempt recovery
      console.log(`Attempting recovery for ${serverName}...`);
      const result = await this.loader.restartServer(serverName);

      if (result.success) {
        console.log(` ${serverName} recovered successfully`);
        breaker.successCount++;
        if (breaker.successCount > 3) {
          breaker.state = 'closed';
        }
      } else {
        console.error(` Failed to recover ${serverName}`);
        breaker.failureCount++;
        if (breaker.failureCount > 3) {
          breaker.state = 'open';
          setTimeout(() => {
            breaker.state = 'half-open';
          }, 60000); // Try again in 1 minute
        }
      }
    }
  }

  /**
   * Get circuit breaker for server
   */
  getCircuitBreaker(serverName) {
    if (!this.circuitBreakers.has(serverName)) {
      this.circuitBreakers.set(serverName, {
        state: 'closed', // closed, open, half-open
        failureCount: 0,
        successCount: 0,
        lastFailure: null
      });
    }
    return this.circuitBreakers.get(serverName);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(serverName, health) {
    if (!this.metrics.has(serverName)) {
      this.metrics.set(serverName, {
        samples: [],
        avgMemory: 0,
        avgCpu: 0,
        maxMemory: 0,
        maxCpu: 0,
        availability: 100
      });
    }

    const metrics = this.metrics.get(serverName);
    const sample = {
      timestamp: Date.now(),
      memory: health.memoryUsage,
      cpu: health.cpuUsage,
      status: health.status
    };

    // Add sample (keep last 100)
    metrics.samples.push(sample);
    if (metrics.samples.length > 100) {
      metrics.samples.shift();
    }

    // Calculate averages
    const validSamples = metrics.samples.filter(s => s.memory && s.cpu);
    if (validSamples.length > 0) {
      metrics.avgMemory = validSamples.reduce((sum, s) => sum + s.memory, 0) / validSamples.length;
      metrics.avgCpu = validSamples.reduce((sum, s) => sum + s.cpu, 0) / validSamples.length;
      metrics.maxMemory = Math.max(...validSamples.map(s => s.memory));
      metrics.maxCpu = Math.max(...validSamples.map(s => s.cpu));
    }

    // Calculate availability
    const healthySamples = metrics.samples.filter(s => s.status === 'healthy' || s.status === 'degraded');
    metrics.availability = (healthySamples.length / metrics.samples.length) * 100;
  }

  /**
   * Get restart count for server
   */
  getRestartCount(serverName) {
    const serverState = this.sessionState.getServerState(serverName);
    return serverState?.restartCount || 0;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.loader.on('server:started', (serverName) => {
      // Reset circuit breaker on successful start
      const breaker = this.getCircuitBreaker(serverName);
      breaker.successCount++;
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
      }
    });

    this.loader.on('server:failed', ({ serverName, error }) => {
      // Update circuit breaker on failure
      const breaker = this.getCircuitBreaker(serverName);
      breaker.failureCount++;
      breaker.lastFailure = Date.now();
    });

    this.loader.on('server:error', ({ server, data }) => {
      // Track errors
      const serverState = this.sessionState.getServerState(server) || {};
      this.sessionState.updateServerState(server, {
        errorCount: (serverState.errorCount || 0) + 1,
        lastError: data
      });
    });
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const summary = {
      timestamp: Date.now(),
      servers: {},
      overall: 'healthy',
      alerts: []
    };

    let unhealthyCount = 0;
    let degradedCount = 0;

    for (const [name, health] of this.healthData) {
      summary.servers[name] = health;

      if (health.status === 'critical' || health.status === 'error') {
        unhealthyCount++;
      } else if (health.status === 'unhealthy' || health.status === 'degraded') {
        degradedCount++;
      }
    }

    // Determine overall status
    if (unhealthyCount > 0) {
      summary.overall = 'critical';
    } else if (degradedCount > 0) {
      summary.overall = 'degraded';
    }

    return summary;
  }

  /**
   * Get detailed metrics for a server
   */
  getServerMetrics(serverName) {
    return {
      health: this.healthData.get(serverName),
      metrics: this.metrics.get(serverName),
      circuitBreaker: this.circuitBreakers.get(serverName)
    };
  }

  /**
   * Reset metrics for a server
   */
  resetServerMetrics(serverName) {
    this.metrics.delete(serverName);
    this.circuitBreakers.delete(serverName);
    this.emit('metrics:reset', serverName);
  }

  /**
   * Export health report
   */
  exportHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.getHealthSummary(),
      metrics: {},
      circuitBreakers: {}
    };

    for (const [name, metrics] of this.metrics) {
      report.metrics[name] = {
        avgMemory: Math.round(metrics.avgMemory / 1024 / 1024), // MB
        avgCpu: Math.round(metrics.avgCpu * 10) / 10, // 1 decimal
        maxMemory: Math.round(metrics.maxMemory / 1024 / 1024), // MB
        maxCpu: Math.round(metrics.maxCpu * 10) / 10, // 1 decimal
        availability: Math.round(metrics.availability * 10) / 10 // 1 decimal
      };
    }

    for (const [name, breaker] of this.circuitBreakers) {
      report.circuitBreakers[name] = breaker;
    }

    return report;
  }
}

// Export singleton
let instance = null;

function getInstance(dynamicLoader, sessionState) {
  if (!instance) {
    instance = new MCPHealthMonitor(dynamicLoader, sessionState);
  }
  return instance;
}

module.exports = {
  MCPHealthMonitor,
  getInstance
};