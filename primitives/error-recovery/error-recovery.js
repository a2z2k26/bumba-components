/**
 * MCP Error Recovery System
 * Handles error recovery and resilience for MCP servers
 */

const { EventEmitter } = require('events');

class MCPErrorRecovery extends EventEmitter {
  constructor(dynamicLoader, sessionState, healthMonitor) {
    super();
    this.loader = dynamicLoader;
    this.sessionState = sessionState;
    this.healthMonitor = healthMonitor;

    // Recovery strategies
    this.strategies = {
      restart: this.strategyRestart.bind(this),
      reload: this.strategyReload.bind(this),
      reset: this.strategyReset.bind(this),
      fallback: this.strategyFallback.bind(this),
      isolate: this.strategyIsolate.bind(this)
    };

    // Error tracking
    this.errorHistory = new Map();
    this.recoveryAttempts = new Map();

    // Recovery configuration
    this.config = {
      maxRetries: 3,
      retryDelay: 5000,
      backoffMultiplier: 2,
      isolationDuration: 300000, // 5 minutes
      errorThreshold: 5,
      timeWindow: 60000 // 1 minute
    };

    // Isolated servers
    this.isolatedServers = new Set();
  }

  /**
   * Start error recovery monitoring
   */
  start() {
    // Error recovery is passive, starts monitoring on error events
    this.emit('started');
  }

  /**
   * Stop error recovery monitoring
   */
  stop() {
    // Clean up any recovery attempts
    this.recoveryAttempts.clear();
    this.emit('stopped');
  }

  /**
   * Handle server error
   */
  async handleError(serverName, error) {
    console.log(`Handling error for ${serverName}: ${error.message}`);

    // Track error
    this.trackError(serverName, error);

    // Determine recovery strategy
    const strategy = this.determineStrategy(serverName, error);

    // Execute recovery
    const result = await this.executeRecovery(serverName, strategy, error);

    // Update session state
    this.sessionState.updateServerState(serverName, {
      lastError: error.message,
      lastRecovery: Date.now(),
      recoveryStrategy: strategy,
      recoverySuccess: result.success
    });

    this.emit('recovery:complete', {
      serverName,
      strategy,
      success: result.success,
      error: error.message
    });

    return result;
  }

  /**
   * Track error occurrence
   */
  trackError(serverName, error) {
    if (!this.errorHistory.has(serverName)) {
      this.errorHistory.set(serverName, []);
    }

    const history = this.errorHistory.get(serverName);
    history.push({
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      type: error.code || error.type || 'unknown'
    });

    // Keep only recent errors
    const cutoff = Date.now() - this.config.timeWindow * 10;
    const filtered = history.filter(e => e.timestamp > cutoff);
    this.errorHistory.set(serverName, filtered);
  }

  /**
   * Determine recovery strategy
   */
  determineStrategy(serverName, error) {
    const errorCount = this.getRecentErrorCount(serverName);
    const attempts = this.recoveryAttempts.get(serverName) || 0;

    // Check if server is isolated
    if (this.isolatedServers.has(serverName)) {
      return 'none';
    }

    // Determine based on error type
    if (error.code === 'ECONNREFUSED' || error.code === 'EPIPE') {
      return 'restart';
    }

    if (error.code === 'ENOMEM' || error.code === 'EMFILE') {
      return 'reset';
    }

    // Determine based on error frequency
    if (errorCount > this.config.errorThreshold) {
      if (attempts >= this.config.maxRetries) {
        return 'isolate';
      }
      return 'reset';
    }

    if (attempts < 2) {
      return 'restart';
    }

    if (attempts < this.config.maxRetries) {
      return 'reload';
    }

    return 'fallback';
  }

  /**
   * Execute recovery strategy
   */
  async executeRecovery(serverName, strategy, error) {
    console.log(`Executing ${strategy} recovery for ${serverName}...`);

    // Update recovery attempts
    const attempts = (this.recoveryAttempts.get(serverName) || 0) + 1;
    this.recoveryAttempts.set(serverName, attempts);

    try {
      const result = await this.strategies[strategy](serverName, error);

      if (result.success) {
        // Reset attempts on success
        this.recoveryAttempts.delete(serverName);
        console.log(`✓ Recovery successful for ${serverName}`);
      } else {
        console.log(`✗ Recovery failed for ${serverName}`);
      }

      return result;

    } catch (recoveryError) {
      console.error(`Recovery error for ${serverName}:`, recoveryError);
      return {
        success: false,
        error: recoveryError.message,
        strategy
      };
    }
  }

  /**
   * Strategy: Restart server
   */
  async strategyRestart(serverName, error) {
    console.log(`Restarting ${serverName}...`);

    // Stop the server
    await this.loader.stopServer(serverName);

    // Wait before restart
    await this.delay(this.config.retryDelay);

    // Start the server
    const result = await this.loader.startServer(serverName);

    return {
      success: result.success,
      strategy: 'restart',
      message: result.success ? 'Server restarted successfully' : 'Failed to restart server'
    };
  }

  /**
   * Strategy: Reload configuration
   */
  async strategyReload(serverName, error) {
    console.log(`Reloading configuration for ${serverName}...`);

    // Reload configuration
    await this.loader.configLoader.loadConfiguration();

    // Get updated config
    const config = this.loader.configLoader.getServerConfig(serverName);

    if (!config || !config.enabled) {
      return {
        success: false,
        strategy: 'reload',
        message: 'Server is disabled in configuration'
      };
    }

    // Restart with new config
    return await this.strategyRestart(serverName, error);
  }

  /**
   * Strategy: Reset server state
   */
  async strategyReset(serverName, error) {
    console.log(`Resetting ${serverName}...`);

    // Stop the server
    await this.loader.stopServer(serverName);

    // Clear session state
    this.sessionState.updateServerState(serverName, {
      enabled: false,
      running: false,
      errorCount: 0,
      warningCount: 0,
      lastError: null,
      restartCount: 0
    });

    // Clear metrics
    this.healthMonitor.resetServerMetrics(serverName);

    // Wait longer before restart
    await this.delay(this.config.retryDelay * 2);

    // Start fresh
    const result = await this.loader.startServer(serverName);

    return {
      success: result.success,
      strategy: 'reset',
      message: result.success ? 'Server reset successfully' : 'Failed to reset server'
    };
  }

  /**
   * Strategy: Use fallback server
   */
  async strategyFallback(serverName, error) {
    console.log(`Attempting fallback for ${serverName}...`);

    // Find fallback server
    const fallback = this.findFallbackServer(serverName);

    if (!fallback) {
      return {
        success: false,
        strategy: 'fallback',
        message: 'No fallback server available'
      };
    }

    console.log(`Using ${fallback} as fallback for ${serverName}`);

    // Start fallback server
    const result = await this.loader.startServer(fallback);

    if (result.success) {
      // Update session to use fallback
      this.sessionState.updateServerState(serverName, {
        fallbackActive: true,
        fallbackServer: fallback
      });
    }

    return {
      success: result.success,
      strategy: 'fallback',
      message: result.success ? `Using ${fallback} as fallback` : 'Failed to start fallback server',
      fallback
    };
  }

  /**
   * Strategy: Isolate problematic server
   */
  async strategyIsolate(serverName, error) {
    console.log(`Isolating ${serverName} due to persistent errors...`);

    // Stop the server
    await this.loader.stopServer(serverName);

    // Add to isolation
    this.isolatedServers.add(serverName);

    // Schedule removal from isolation
    setTimeout(() => {
      this.isolatedServers.delete(serverName);
      this.recoveryAttempts.delete(serverName);
      console.log(`${serverName} removed from isolation`);
      this.emit('server:unisolated', serverName);
    }, this.config.isolationDuration);

    // Update state
    this.sessionState.updateServerState(serverName, {
      isolated: true,
      isolatedAt: Date.now(),
      isolationReason: error.message
    });

    this.emit('server:isolated', {
      serverName,
      duration: this.config.isolationDuration,
      reason: error.message
    });

    return {
      success: true,
      strategy: 'isolate',
      message: `Server isolated for ${this.config.isolationDuration / 1000} seconds`
    };
  }

  /**
   * Find fallback server
   */
  findFallbackServer(serverName) {
    const serverDef = this.loader.registry.getServer(serverName);
    if (!serverDef) return null;

    // Map primary servers to fallbacks
    const fallbackMap = {
      'brave-search': 'exa',
      'exa': 'brave-search',
      'postgres': 'mongodb',
      'mongodb': 'postgres',
      'pinecone': 'qdrant',
      'qdrant': 'pinecone',
      'figma': 'magic-ui',
      'magic-ui': 'shadcn-ui'
    };

    return fallbackMap[serverName] || null;
  }

  /**
   * Get recent error count
   */
  getRecentErrorCount(serverName) {
    const history = this.errorHistory.get(serverName) || [];
    const cutoff = Date.now() - this.config.timeWindow;
    return history.filter(e => e.timestamp > cutoff).length;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual recovery trigger
   */
  async recoverServer(serverName, strategy = null) {
    if (!strategy) {
      strategy = this.determineStrategy(serverName, { message: 'Manual recovery' });
    }

    return await this.executeRecovery(serverName, strategy, { message: 'Manual recovery' });
  }

  /**
   * Recover all problematic servers
   */
  async recoverAll() {
    const results = [];
    const status = this.healthMonitor.getHealthSummary();

    for (const [serverName, health] of Object.entries(status.servers)) {
      if (health.status !== 'healthy') {
        const result = await this.recoverServer(serverName);
        results.push({ serverName, ...result });
      }
    }

    return results;
  }

  /**
   * Get recovery status
   */
  getRecoveryStatus() {
    const status = {
      isolated: Array.from(this.isolatedServers),
      recovering: [],
      errorCounts: {},
      recoveryAttempts: {},
      recoveryCount: 0
    };

    // Get servers currently recovering
    for (const [serverName, attempts] of this.recoveryAttempts) {
      if (attempts > 0) {
        status.recovering.push(serverName);
        status.recoveryAttempts[serverName] = attempts;
      }
    }

    // Get error counts
    for (const [serverName, history] of this.errorHistory) {
      status.errorCounts[serverName] = this.getRecentErrorCount(serverName);
    }

    // Calculate total recovery count
    status.recoveryCount = status.recovering.length;

    return status;
  }

  /**
   * Clear error history
   */
  clearErrorHistory(serverName = null) {
    if (serverName) {
      this.errorHistory.delete(serverName);
      this.recoveryAttempts.delete(serverName);
    } else {
      this.errorHistory.clear();
      this.recoveryAttempts.clear();
    }

    this.emit('history:cleared', serverName);
  }

  /**
   * Export recovery report
   */
  exportRecoveryReport() {
    const report = {
      timestamp: new Date().toISOString(),
      status: this.getRecoveryStatus(),
      errorHistory: {},
      configuration: this.config
    };

    for (const [serverName, history] of this.errorHistory) {
      report.errorHistory[serverName] = history.slice(-10); // Last 10 errors
    }

    return report;
  }
}

// Export singleton
let instance = null;

function getInstance(dynamicLoader, sessionState, healthMonitor) {
  if (!instance) {
    instance = new MCPErrorRecovery(dynamicLoader, sessionState, healthMonitor);
  }
  return instance;
}

module.exports = {
  MCPErrorRecovery,
  getInstance
};