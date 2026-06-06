/**
 * BUMBA Dashboard Manager
 * Aggregates and analyzes observability data for insights
 *
 * Part of BUMBA Observability Enhancement - Phase 4: Dashboard Mode
 * Sprint P4-S1: Base Structure
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class DashboardManager {
  constructor() {
    this.tracesDir = path.join(os.homedir(), '.bumba', 'traces');
    this.comparisonsDir = path.join(os.homedir(), '.bumba', 'comparisons');
    this.dashboardDataFile = path.join(os.homedir(), '.bumba', 'dashboard-data.json');

    this.metrics = null;
    this.trends = null;
    this.insights = null;
  }

  /**
   * Load traces from last N days
   * Phase 8-S131: Added to match documentation
   * @param {number} days - Number of days to look back
   * @returns {Array} Array of trace objects
   */
  async loadTraces(days = 7) {
    const traces = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();

    try {
      const traceFiles = await fs.readdir(this.tracesDir);
      const traceJsonFiles = traceFiles.filter(f =>
        f.startsWith('trace-') && (f.endsWith('.json') || f.endsWith('.json.gz'))
      );

      for (const file of traceJsonFiles) {
        try {
          const filepath = path.join(this.tracesDir, file);
          const stats = await fs.stat(filepath);

          // Check if file is within date range
          if (stats.mtime.getTime() >= cutoffTime) {
            const content = await fs.readFile(filepath, 'utf-8');
            const trace = JSON.parse(content);

            // Additional check on trace timestamp if available
            if (trace.metadata && trace.metadata.timestamp) {
              const traceTime = new Date(trace.metadata.timestamp).getTime();
              if (traceTime >= cutoffTime) {
                traces.push(trace);
              }
            } else {
              // If no metadata timestamp, use file mtime
              traces.push(trace);
            }
          }
        } catch (error) {
          // Skip corrupted files
          if (process.env.DEBUG) {
            console.error(`Skipping corrupted trace file: ${file}`);
          }
        }
      }

      // Sort by timestamp (newest first)
      traces.sort((a, b) => {
        const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
        const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      return traces;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Load all observability data from disk
   * P4-S2: Implemented
   */
  async loadAllData() {
    const data = {
      traces: [],
      comparisons: [],
      summary: {
        totalTraces: 0,
        totalComparisons: 0,
        dateRange: { earliest: null, latest: null }
      }
    };

    // Load traces
    try {
      const traceFiles = await fs.readdir(this.tracesDir);
      const traceJsonFiles = traceFiles.filter(f => f.startsWith('trace-') && f.endsWith('.json'));

      for (const file of traceJsonFiles) {
        try {
          const filepath = path.join(this.tracesDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const trace = JSON.parse(content);
          data.traces.push(trace);

          // Update date range
          const traceDate = new Date(trace.metadata.timestamp);
          if (!data.summary.dateRange.earliest || traceDate < data.summary.dateRange.earliest) {
            data.summary.dateRange.earliest = traceDate;
          }
          if (!data.summary.dateRange.latest || traceDate > data.summary.dateRange.latest) {
            data.summary.dateRange.latest = traceDate;
          }
        } catch (error) {
          // Skip corrupted files
          if (process.env.DEBUG) {
            console.error(`Skipping corrupted trace file: ${file}`);
          }
        }
      }

      data.summary.totalTraces = data.traces.length;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, that's okay
    }

    // Load comparisons
    try {
      const comparisonFiles = await fs.readdir(this.comparisonsDir);
      const comparisonJsonFiles = comparisonFiles.filter(f => f.startsWith('comparison-') && f.endsWith('.json'));

      for (const file of comparisonJsonFiles) {
        try {
          const filepath = path.join(this.comparisonsDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const comparison = JSON.parse(content);
          data.comparisons.push(comparison);

          // Update date range
          const compDate = new Date(comparison.timestamp);
          if (!data.summary.dateRange.earliest || compDate < data.summary.dateRange.earliest) {
            data.summary.dateRange.earliest = compDate;
          }
          if (!data.summary.dateRange.latest || compDate > data.summary.dateRange.latest) {
            data.summary.dateRange.latest = compDate;
          }
        } catch (error) {
          // Skip corrupted files
          if (process.env.DEBUG) {
            console.error(`Skipping corrupted comparison file: ${file}`);
          }
        }
      }

      data.summary.totalComparisons = data.comparisons.length;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist yet, that's okay
    }

    return data;
  }

  /**
   * Calculate aggregate metrics
   * P4-S3: Implemented
   * Phase 8-S131: Updated to accept both array and data object
   * @param {Array|Object} input - Array of traces or data object with traces/comparisons
   * @returns {Object} Metrics object
   */
  calculateMetrics(input) {
    // Support both array of traces and full data object
    let data;
    if (Array.isArray(input)) {
      data = { traces: input, comparisons: [] };
    } else {
      data = input;
    }

    // Phase 8-S133: Ensure traces and comparisons arrays exist
    if (!data.traces) data.traces = [];
    if (!data.comparisons) data.comparisons = [];
    if (!Array.isArray(data.traces)) data.traces = [];
    if (!Array.isArray(data.comparisons)) data.comparisons = [];

    const metrics = {
      traces: {
        total: data.traces.length,
        avgDuration: 0,
        avgOverhead: 0,
        avgSteps: 0,
        successRate: 0,
        totalErrors: 0
      },
      comparisons: {
        total: data.comparisons.length,
        orchestrationWins: 0,
        simpleWins: 0,
        ties: 0,
        avgOrchestrationDuration: 0,
        avgSimpleDuration: 0,
        avgConfidence: 0
      },
      specialists: {
        totalUsed: 0,
        avgPerQuery: 0,
        mostUsed: {},
        modelDistribution: {}
      },
      performance: {
        avgQueryDuration: 0,
        fastestQuery: null,
        slowestQuery: null,
        bottlenecks: []
      },
      costs: {
        totalQueries: 0,
        estimatedTokens: 0
      }
    };

    // Calculate trace metrics
    if (data.traces.length > 0) {
      let totalDuration = 0;
      let totalOverhead = 0;
      let totalSteps = 0;
      let successCount = 0;

      data.traces.forEach(trace => {
        // Phase 8-S133: Handle traces with different field names and missing fields
        totalDuration += trace.totalDuration || trace.duration || 0;
        totalSteps += (trace.steps ? trace.steps.length : 0);

        // Calculate overhead
        const analysis = this._analyzeTrace(trace);
        totalOverhead += analysis.orchestrationOverhead || 0;

        // Check success
        if (trace.result && trace.result.success !== false) {
          successCount++;
        } else {
          metrics.traces.totalErrors++;
        }

        // Track fastest/slowest
        if (!metrics.performance.fastestQuery || trace.totalDuration < metrics.performance.fastestQuery.duration) {
          metrics.performance.fastestQuery = {
            queryId: trace.queryId,
            duration: trace.totalDuration,
            userInput: trace.userInput
          };
        }
        if (!metrics.performance.slowestQuery || trace.totalDuration > metrics.performance.slowestQuery.duration) {
          metrics.performance.slowestQuery = {
            queryId: trace.queryId,
            duration: trace.totalDuration,
            userInput: trace.userInput
          };
        }

        // Count specialists and models (Phase 8-S133: Check if steps exists)
        if (trace.steps && Array.isArray(trace.steps)) {
          trace.steps.forEach(step => {
            if (step.system && step.system !== 'QueryAnalysis' && step.system !== 'DepartmentRoute') {
              metrics.specialists.totalUsed++;

            // Count specialist types
            if (!metrics.specialists.mostUsed[step.system]) {
              metrics.specialists.mostUsed[step.system] = 0;
            }
            metrics.specialists.mostUsed[step.system]++;
          }

          // Track model distribution
          if (step.data && step.data.model) {
            if (!metrics.specialists.modelDistribution[step.data.model]) {
              metrics.specialists.modelDistribution[step.data.model] = 0;
            }
            metrics.specialists.modelDistribution[step.data.model]++;
          }
          });
        } // End of if (trace.steps && Array.isArray(trace.steps))

        // Collect bottlenecks
        if (analysis.bottlenecks && analysis.bottlenecks.length > 0) {
          metrics.performance.bottlenecks.push(...analysis.bottlenecks.map(b => ({
            queryId: trace.queryId,
            ...b
          })));
        }
      });

      metrics.traces.avgDuration = Math.round(totalDuration / data.traces.length);
      metrics.traces.avgOverhead = Math.round(totalOverhead / data.traces.length);
      metrics.traces.avgSteps = Math.round(totalSteps / data.traces.length);
      metrics.traces.successRate = Math.round((successCount / data.traces.length) * 100);
      metrics.specialists.avgPerQuery = Math.round((metrics.specialists.totalUsed / data.traces.length) * 10) / 10;

      // Add standardized field names for API consistency (Phase 8-S131)
      metrics.averageDuration = metrics.traces.avgDuration;
      metrics.successRate = metrics.traces.successRate;
      metrics.totalExecutions = data.traces.length;

      // Calculate median duration
      const sortedDurations = data.traces
        .map(t => t.totalDuration || t.duration || 0)
        .sort((a, b) => a - b);
      const mid = Math.floor(sortedDurations.length / 2);
      metrics.medianDuration = sortedDurations.length % 2 === 0
        ? Math.round((sortedDurations[mid - 1] + sortedDurations[mid]) / 2)
        : sortedDurations[mid];
    }

    // Calculate comparison metrics
    if (data.comparisons.length > 0) {
      let totalOrchDuration = 0;
      let totalSimpleDuration = 0;
      let totalConfidence = 0;

      data.comparisons.forEach(comp => {
        // Count winners
        if (comp.winner && comp.winner.winner === 'orchestration') {
          metrics.comparisons.orchestrationWins++;
        } else if (comp.winner && comp.winner.winner === 'simple') {
          metrics.comparisons.simpleWins++;
        } else if (comp.winner && comp.winner.winner === 'tie') {
          metrics.comparisons.ties++;
        }

        // Durations
        if (comp.metrics) {
          totalOrchDuration += comp.metrics.duration?.orchestration || 0;
          totalSimpleDuration += comp.metrics.duration?.simple || 0;
        }

        // Confidence
        if (comp.winner && comp.winner.confidence) {
          totalConfidence += comp.winner.confidence;
        }
      });

      metrics.comparisons.avgOrchestrationDuration = Math.round(totalOrchDuration / data.comparisons.length);
      metrics.comparisons.avgSimpleDuration = Math.round(totalSimpleDuration / data.comparisons.length);
      metrics.comparisons.avgConfidence = Math.round(totalConfidence / data.comparisons.length);
    }

    // Calculate overall performance
    metrics.performance.avgQueryDuration = metrics.traces.avgDuration;

    // Calculate costs (estimate)
    metrics.costs.totalQueries = data.traces.length + (data.comparisons.length * 2); // Comparisons run twice

    this.metrics = metrics;
    return metrics;
  }

  /**
   * Helper: Analyze a single trace
   * Internal method for calculateMetrics
   */
  _analyzeTrace(trace) {
    const analysis = {
      totalDuration: trace.totalDuration || 0,
      orchestrationOverhead: 0,
      actualWork: 0,
      bottlenecks: []
    };

    // Phase 8-S133: Check if steps exists before iterating
    if (trace.steps && Array.isArray(trace.steps)) {
      trace.steps.forEach(step => {
        if (step.duration) {
          analysis.actualWork += step.duration;

          // Detect bottlenecks (>20% of total time)
          const percentage = (step.duration / trace.totalDuration) * 100;
          if (percentage > 20) {
            analysis.bottlenecks.push({
              system: step.system,
              action: step.action,
              duration: step.duration,
              percentage: Math.round(percentage)
            });
          }
        }
      });
    }

    analysis.orchestrationOverhead = analysis.totalDuration - analysis.actualWork;
    return analysis;
  }

  /**
   * Analyze trends over time
   * P4-S4: Implemented
   */
  analyzeTrends(data) {
    const trends = {
      successRateOverTime: [],
      durationOverTime: [],
      overheadOverTime: [],
      winRateOverTime: []
    };

    if (!data || data.traces.length === 0) {
      return trends;
    }

    // Group by day
    const dailyData = {};
    data.traces.forEach(trace => {
      const date = new Date(trace.metadata.timestamp).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { traces: [], comparisons: [] };
      }
      dailyData[date].traces.push(trace);
    });

    data.comparisons.forEach(comp => {
      const date = new Date(comp.timestamp).toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { traces: [], comparisons: [] };
      }
      dailyData[date].comparisons.push(comp);
    });

    // Calculate daily metrics
    Object.keys(dailyData).sort().forEach(date => {
      const dayData = dailyData[date];

      if (dayData.traces.length > 0) {
        const successCount = dayData.traces.filter(t => t.result && t.result.success !== false).length;
        const avgDuration = dayData.traces.reduce((sum, t) => sum + (t.totalDuration || 0), 0) / dayData.traces.length;

        trends.successRateOverTime.push({
          date,
          rate: Math.round((successCount / dayData.traces.length) * 100)
        });

        trends.durationOverTime.push({
          date,
          avgDuration: Math.round(avgDuration)
        });
      }

      if (dayData.comparisons.length > 0) {
        const orchWins = dayData.comparisons.filter(c => c.winner && c.winner.winner === 'orchestration').length;
        trends.winRateOverTime.push({
          date,
          orchestrationWinRate: Math.round((orchWins / dayData.comparisons.length) * 100)
        });
      }
    });

    this.trends = trends;
    return trends;
  }

  /**
   * Generate insights and recommendations
   * P4-S5: Implemented
   */
  generateInsights() {
    if (!this.metrics) {
      return [];
    }

    const insights = [];

    // Success rate insights
    if (this.metrics.traces.successRate < 80) {
      insights.push({
        type: 'warning',
        message: `Success rate is ${this.metrics.traces.successRate}% - investigate recent failures`,
        priority: 'high'
      });
    } else if (this.metrics.traces.successRate >= 95) {
      insights.push({
        type: 'success',
        message: `Excellent success rate of ${this.metrics.traces.successRate}%`,
        priority: 'low'
      });
    }

    // Overhead insights
    const overheadPercentage = Math.round((this.metrics.traces.avgOverhead / this.metrics.traces.avgDuration) * 100);
    if (overheadPercentage > 30) {
      insights.push({
        type: 'warning',
        message: `High orchestration overhead (${overheadPercentage}%) - consider optimization`,
        priority: 'medium'
      });
    }

    // Comparison insights
    if (this.metrics.comparisons.total > 0) {
      const orchWinRate = Math.round((this.metrics.comparisons.orchestrationWins / this.metrics.comparisons.total) * 100);
      if (orchWinRate < 30) {
        insights.push({
          type: 'info',
          message: `Simple mode wins ${100 - orchWinRate}% of comparisons - consider using simple mode more`,
          priority: 'medium'
        });
      } else if (orchWinRate > 70) {
        insights.push({
          type: 'success',
          message: `Orchestration wins ${orchWinRate}% of comparisons - complexity is adding value`,
          priority: 'low'
        });
      }
    }

    // Specialist insights
    if (this.metrics.specialists.avgPerQuery > 3) {
      insights.push({
        type: 'info',
        message: `High specialist usage (${this.metrics.specialists.avgPerQuery} avg) - queries may be complex`,
        priority: 'low'
      });
    }

    // Performance insights
    if (this.metrics.performance && this.metrics.performance.bottlenecks && this.metrics.performance.bottlenecks.length > 0) {
      const bottleneckCount = this.metrics.performance.bottlenecks.length;
      insights.push({
        type: 'warning',
        message: `${bottleneckCount} performance bottleneck${bottleneckCount > 1 ? 's' : ''} detected`,
        priority: 'high'
      });
    }

    this.insights = insights;
    return insights;
  }

  /**
   * Get real-time metrics summary
   * P4-S6: Implemented
   */
  getRealTimeMetrics() {
    if (!this.metrics) {
      return null;
    }

    return {
      totalQueries: this.metrics.traces.total + this.metrics.comparisons.total,
      successRate: this.metrics.traces.successRate,
      avgDuration: this.metrics.traces.avgDuration,
      avgOverhead: this.metrics.traces.avgOverhead,
      totalErrors: this.metrics.traces.totalErrors,
      totalComparisons: this.metrics.comparisons.total,
      orchestrationWinRate: this.metrics.comparisons.total > 0
        ? Math.round((this.metrics.comparisons.orchestrationWins / this.metrics.comparisons.total) * 100)
        : 0
    };
  }

  /**
   * Get historical performance data
   * P4-S7: Implemented
   */
  getHistoricalData(timeRange = '7d') {
    if (!this.trends) {
      return null;
    }

    // Parse time range
    const days = parseInt(timeRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return {
      successRate: this.trends.successRateOverTime.filter(d => new Date(d.date) >= cutoff),
      duration: this.trends.durationOverTime.filter(d => new Date(d.date) >= cutoff),
      winRate: this.trends.winRateOverTime.filter(d => new Date(d.date) >= cutoff)
    };
  }

  /**
   * Calculate cost analysis
   * P4-S8: Implemented
   */
  calculateCostAnalysis() {
    if (!this.metrics) {
      return null;
    }

    // Rough estimates (adjust based on actual pricing)
    const inputTokenCost = 0.003 / 1000;  // $3 per 1M tokens
    const outputTokenCost = 0.015 / 1000; // $15 per 1M tokens
    const avgTokensPerQuery = 2000; // Estimate

    const estimatedInputTokens = this.metrics.costs.totalQueries * avgTokensPerQuery * 0.3;
    const estimatedOutputTokens = this.metrics.costs.totalQueries * avgTokensPerQuery * 0.7;

    return {
      totalQueries: this.metrics.costs.totalQueries,
      estimatedInputTokens: Math.round(estimatedInputTokens),
      estimatedOutputTokens: Math.round(estimatedOutputTokens),
      estimatedCost: (estimatedInputTokens * inputTokenCost) + (estimatedOutputTokens * outputTokenCost),
      avgCostPerQuery: ((estimatedInputTokens * inputTokenCost) + (estimatedOutputTokens * outputTokenCost)) / this.metrics.costs.totalQueries
    };
  }

  /**
   * Get performance insights
   * P4-S9: Implemented
   */
  getPerformanceInsights() {
    if (!this.metrics || !this.metrics.performance) {
      return null;
    }

    const insights = {
      fastestQuery: this.metrics.performance.fastestQuery,
      slowestQuery: this.metrics.performance.slowestQuery,
      avgDuration: this.metrics.performance.avgQueryDuration,
      topBottlenecks: this.metrics.performance.bottlenecks
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5),
      mostUsedSpecialists: Object.entries(this.metrics.specialists.mostUsed)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))
    };

    return insights;
  }

  /**
   * Save dashboard data snapshot
   * P4-S10: Implemented
   */
  async saveDashboardData() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      trends: this.trends,
      insights: this.insights
    };

    try {
      await fs.writeFile(
        this.dashboardDataFile,
        JSON.stringify(snapshot, null, 2),
        'utf-8'
      );
      return this.dashboardDataFile;
    } catch (error) {
      throw new Error(`Failed to save dashboard data: ${error.message}`);
    }
  }

  /**
   * Format dashboard for terminal display
   * P4-S11: Implemented
   */
  formatDashboard() {
    if (!this.metrics) {
      return 'No data available. Run some queries first!';
    }

    const chalk = require('chalk');
    let output = '\n';

    output += chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    output += chalk.cyan('  BUMBA Observability Dashboard\n');
    output += chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    // Real-time metrics
    const realTime = this.getRealTimeMetrics();
    output += chalk.yellow(' Real-Time Metrics\n\n');
    output += chalk.white(`Total Queries: ${realTime.totalQueries}\n`);
    output += chalk.white(`Success Rate: ${realTime.successRate}%\n`);
    output += chalk.white(`Avg Duration: ${realTime.avgDuration}ms\n`);
    output += chalk.white(`Avg Overhead: ${realTime.avgOverhead}ms\n`);
    if (realTime.totalErrors > 0) {
      output += chalk.red(`Total Errors: ${realTime.totalErrors}\n`);
    }
    output += '\n';

    // Comparisons
    if (this.metrics.comparisons.total > 0) {
      output += chalk.yellow(' Comparison Results\n\n');
      output += chalk.white(`Total Comparisons: ${this.metrics.comparisons.total}\n`);
      output += chalk.blue(`Orchestration Wins: ${this.metrics.comparisons.orchestrationWins}\n`);
      output += chalk.green(`Simple Wins: ${this.metrics.comparisons.simpleWins}\n`);
      output += chalk.white(`Ties: ${this.metrics.comparisons.ties}\n\n`);
    }

    // Performance
    const perfInsights = this.getPerformanceInsights();
    if (perfInsights) {
      output += chalk.yellow(' Performance Insights\n\n');
      if (perfInsights.fastestQuery) {
        output += chalk.green(`Fastest Query: ${perfInsights.fastestQuery.duration}ms\n`);
      }
      if (perfInsights.slowestQuery) {
        output += chalk.red(`Slowest Query: ${perfInsights.slowestQuery.duration}ms\n`);
      }

      if (perfInsights.mostUsedSpecialists && perfInsights.mostUsedSpecialists.length > 0) {
        output += chalk.white('\nTop Specialists:\n');
        perfInsights.mostUsedSpecialists.forEach((s, i) => {
          output += chalk.gray(`  ${i + 1}. ${s.name}: ${s.count} uses\n`);
        });
      }
      output += '\n';
    }

    // Insights
    if (this.insights && this.insights.length > 0) {
      output += chalk.yellow(' Insights & Recommendations\n\n');
      this.insights.forEach((insight, i) => {
        const icon = insight.type === 'warning' ? ' ' :
                     insight.type === 'success' ? ' ' : 'ℹ  ';
        const color = insight.type === 'warning' ? chalk.yellow :
                      insight.type === 'success' ? chalk.green : chalk.blue;
        output += color(`${icon}${insight.message}\n`);
      });
      output += '\n';
    }

    output += chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

    return output;
  }
}

module.exports = DashboardManager;
