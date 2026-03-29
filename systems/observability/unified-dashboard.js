/**
 * BUMBA Unified Dashboard
 * Aggregates all observability data into a single unified view
 *
 * Part of BUMBA Observability Enhancement - Sub-Phase 1E: Unified Dashboard
 * Sprint 1-E-01: UnifiedDashboard Aggregator
 */

const TraceRecorder = require('./trace-recorder');
const EventEmitter = require('events');

class UnifiedDashboard extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      refreshInterval: config.refreshInterval || 1000,
      maxTraces: config.maxTraces || 50,
      maxComparisons: config.maxComparisons || 20,
      autoRefresh: config.autoRefresh !== false,
      ...config
    };

    this.traceRecorder = new TraceRecorder();
    this.refreshTimer = null;

    // Aggregated data
    this.data = {
      traces: [],
      comparisons: [],
      activeTraces: [],
      metrics: {
        totalTraces: 0,
        totalComparisons: 0,
        avgTraceDuration: 0,
        avgStepsPerTrace: 0,
        orchestrationWins: 0,
        simpleWins: 0,
        ties: 0
      },
      systemHealth: {
        status: 'healthy',
        traceRecorderStatus: 'active',
        diskUsage: 0,
        lastUpdate: null
      }
    };
  }

  /**
   * Initialize the dashboard and load all data
   */
  async initialize() {
    try {
      // Load all traces
      await this.loadTraces();

      // Load all comparisons
      await this.loadComparisons();

      // Calculate metrics
      this.calculateMetrics();

      // Check system health
      await this.checkSystemHealth();

      // Setup auto-refresh if enabled
      if (this.config.autoRefresh) {
        this.startAutoRefresh();
      }

      this.emit('initialized', { data: this.data });

      return this;
    } catch (error) {
      this.emit('error', { message: 'Initialization failed', error });
      throw error;
    }
  }

  /**
   * Load all traces from TraceRecorder
   */
  async loadTraces() {
    try {
      const allTraces = await this.traceRecorder.listTraces();

      // Sort by timestamp (newest first)
      const sortedTraces = allTraces.sort((a, b) => b.startTime - a.startTime);

      // Limit to maxTraces
      this.data.traces = sortedTraces.slice(0, this.config.maxTraces);

      // Identify active traces (currently running)
      this.data.activeTraces = this.data.traces.filter(t => !t.endTime);

      this.emit('traces:loaded', { count: this.data.traces.length });

      return this.data.traces;
    } catch (error) {
      this.emit('error', { message: 'Failed to load traces', error });
      this.data.traces = [];
      return [];
    }
  }

  /**
   * Load all saved comparisons
   */
  async loadComparisons() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');

      const comparisonsDir = path.join(os.homedir(), '.bumba', 'comparisons');

      try {
        const files = await fs.readdir(comparisonsDir);
        const comparisonFiles = files.filter(f => f.startsWith('comparison-') && f.endsWith('.json'));

        const comparisons = [];
        for (const file of comparisonFiles) {
          try {
            const filepath = path.join(comparisonsDir, file);
            const content = await fs.readFile(filepath, 'utf-8');
            const comparison = JSON.parse(content);
            comparisons.push(comparison);
          } catch (error) {
            // Skip corrupted files
            continue;
          }
        }

        // Sort by timestamp (newest first)
        comparisons.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Limit to maxComparisons
        this.data.comparisons = comparisons.slice(0, this.config.maxComparisons);

        this.emit('comparisons:loaded', { count: this.data.comparisons.length });

        return this.data.comparisons;
      } catch (error) {
        if (error.code === 'ENOENT') {
          // Directory doesn't exist yet
          this.data.comparisons = [];
          return [];
        }
        throw error;
      }
    } catch (error) {
      this.emit('error', { message: 'Failed to load comparisons', error });
      this.data.comparisons = [];
      return [];
    }
  }

  /**
   * Calculate aggregate metrics
   */
  calculateMetrics() {
    // Trace metrics
    this.data.metrics.totalTraces = this.data.traces.length;

    if (this.data.traces.length > 0) {
      const completedTraces = this.data.traces.filter(t => t.endTime);

      if (completedTraces.length > 0) {
        const totalDuration = completedTraces.reduce((sum, t) => sum + (t.totalDuration || 0), 0);
        this.data.metrics.avgTraceDuration = Math.round(totalDuration / completedTraces.length);

        const totalSteps = completedTraces.reduce((sum, t) => sum + (t.steps?.length || 0), 0);
        this.data.metrics.avgStepsPerTrace = Math.round(totalSteps / completedTraces.length);
      }
    }

    // Comparison metrics
    this.data.metrics.totalComparisons = this.data.comparisons.length;
    this.data.metrics.orchestrationWins = 0;
    this.data.metrics.simpleWins = 0;
    this.data.metrics.ties = 0;

    this.data.comparisons.forEach(comp => {
      const winner = comp.winner?.winner;
      if (winner === 'orchestration') {
        this.data.metrics.orchestrationWins++;
      } else if (winner === 'simple') {
        this.data.metrics.simpleWins++;
      } else if (winner === 'tie') {
        this.data.metrics.ties++;
      }
    });

    this.emit('metrics:calculated', { metrics: this.data.metrics });

    return this.data.metrics;
  }

  /**
   * Check system health
   */
  async checkSystemHealth() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');

      // Check trace recorder status
      const tracesDir = path.join(os.homedir(), '.bumba', 'traces');
      this.data.systemHealth.traceRecorderStatus = 'active';

      // Calculate disk usage
      try {
        const files = await fs.readdir(tracesDir);
        let totalSize = 0;

        for (const file of files) {
          try {
            const filepath = path.join(tracesDir, file);
            const stats = await fs.stat(filepath);
            totalSize += stats.size;
          } catch (error) {
            // Skip files we can't access
            continue;
          }
        }

        // Convert to MB
        this.data.systemHealth.diskUsage = Math.round((totalSize / 1024 / 1024) * 10) / 10;
      } catch (error) {
        this.data.systemHealth.diskUsage = 0;
      }

      // Determine overall status
      if (this.data.systemHealth.diskUsage > 1000) {
        this.data.systemHealth.status = 'warning';
      } else if (this.data.systemHealth.diskUsage > 5000) {
        this.data.systemHealth.status = 'critical';
      } else {
        this.data.systemHealth.status = 'healthy';
      }

      this.data.systemHealth.lastUpdate = new Date().toISOString();

      this.emit('health:checked', { health: this.data.systemHealth });

      return this.data.systemHealth;
    } catch (error) {
      this.emit('error', { message: 'Health check failed', error });
      this.data.systemHealth.status = 'unknown';
      return this.data.systemHealth;
    }
  }

  /**
   * Refresh all data
   */
  async refresh() {
    try {
      await this.loadTraces();
      await this.loadComparisons();
      this.calculateMetrics();
      await this.checkSystemHealth();

      this.emit('refreshed', { data: this.data });

      return this.data;
    } catch (error) {
      this.emit('error', { message: 'Refresh failed', error });
      throw error;
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refresh();
      } catch (error) {
        // Emit error but don't crash
        this.emit('error', { message: 'Auto-refresh failed', error });
      }
    }, this.config.refreshInterval);

    this.emit('autorefresh:started', { interval: this.config.refreshInterval });
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
      this.emit('autorefresh:stopped');
    }
  }

  /**
   * Get recent traces (last N)
   */
  getRecentTraces(limit = 10) {
    return this.data.traces.slice(0, limit);
  }

  /**
   * Get recent comparisons (last N)
   */
  getRecentComparisons(limit = 10) {
    return this.data.comparisons.slice(0, limit);
  }

  /**
   * Get traces by status
   */
  getTracesByStatus(status) {
    if (status === 'active') {
      return this.data.activeTraces;
    } else if (status === 'completed') {
      return this.data.traces.filter(t => t.endTime && t.result?.success);
    } else if (status === 'failed') {
      return this.data.traces.filter(t => t.endTime && !t.result?.success);
    }
    return this.data.traces;
  }

  /**
   * Get comparison statistics
   */
  getComparisonStats() {
    const total = this.data.metrics.totalComparisons;

    if (total === 0) {
      return {
        total: 0,
        orchestrationWinRate: 0,
        simpleWinRate: 0,
        tieRate: 0
      };
    }

    return {
      total,
      orchestrationWinRate: Math.round((this.data.metrics.orchestrationWins / total) * 100),
      simpleWinRate: Math.round((this.data.metrics.simpleWins / total) * 100),
      tieRate: Math.round((this.data.metrics.ties / total) * 100),
      orchestrationWins: this.data.metrics.orchestrationWins,
      simpleWins: this.data.metrics.simpleWins,
      ties: this.data.metrics.ties
    };
  }

  /**
   * Get trace performance statistics
   */
  getTracePerformanceStats() {
    const completedTraces = this.data.traces.filter(t => t.endTime);

    if (completedTraces.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        avgSteps: 0
      };
    }

    const durations = completedTraces.map(t => t.totalDuration || 0);
    const steps = completedTraces.map(t => t.steps?.length || 0);

    return {
      count: completedTraces.length,
      avgDuration: this.data.metrics.avgTraceDuration,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      avgSteps: this.data.metrics.avgStepsPerTrace,
      minSteps: Math.min(...steps),
      maxSteps: Math.max(...steps)
    };
  }

  /**
   * Search traces by query text
   */
  searchTraces(searchTerm) {
    if (!searchTerm) return this.data.traces;

    const term = searchTerm.toLowerCase();
    return this.data.traces.filter(trace => {
      const query = (trace.userInput || '').toLowerCase();
      const queryId = (trace.queryId || '').toLowerCase();
      return query.includes(term) || queryId.includes(term);
    });
  }

  /**
   * Search comparisons by query text
   */
  searchComparisons(searchTerm) {
    if (!searchTerm) return this.data.comparisons;

    const term = searchTerm.toLowerCase();
    return this.data.comparisons.filter(comp => {
      const query = (comp.query || '').toLowerCase();
      const id = (comp.comparisonId || '').toLowerCase();
      return query.includes(term) || id.includes(term);
    });
  }

  /**
   * Export dashboard data as JSON
   */
  exportData() {
    return {
      exported: new Date().toISOString(),
      traces: this.data.traces,
      comparisons: this.data.comparisons,
      metrics: this.data.metrics,
      systemHealth: this.data.systemHealth
    };
  }

  /**
   * Get summary for quick overview
   */
  getSummary() {
    return {
      traces: {
        total: this.data.metrics.totalTraces,
        active: this.data.activeTraces.length,
        avgDuration: this.data.metrics.avgTraceDuration,
        avgSteps: this.data.metrics.avgStepsPerTrace
      },
      comparisons: {
        total: this.data.metrics.totalComparisons,
        orchestrationWins: this.data.metrics.orchestrationWins,
        simpleWins: this.data.metrics.simpleWins,
        ties: this.data.metrics.ties
      },
      health: this.data.systemHealth
    };
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    this.stopAutoRefresh();
    this.removeAllListeners();
    this.emit('shutdown');
  }
}

module.exports = UnifiedDashboard;
