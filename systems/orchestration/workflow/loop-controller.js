/**
 * BUMBA Loop Controller
 * Critical component to prevent endless execution in workflows
 * Implements termination conditions, quality gates, and resource limits
 */

const { EventEmitter } = require('events');
// [OPTIONAL] const { logger } = require('../logging/bumba-logger'); // May need @bumba/* package

class LoopController extends EventEmitter {
  constructor(config = {}) {
    super();

    // Core configuration
    this.config = {
      maxIterations: config.maxIterations || 10,
      maxExecutionTime: config.maxExecutionTime || 3600000, // 1 hour
      maxMemoryUsage: config.maxMemoryUsage || 512 * 1024 * 1024, // 512MB
      convergenceThreshold: config.convergenceThreshold || 0.001,
      qualityThreshold: config.qualityThreshold || 0.8,
      enableResourceMonitoring: config.enableResourceMonitoring !== false,
      enableQualityGates: config.enableQualityGates !== false,
      enableConvergenceDetection: config.enableConvergenceDetection !== false,
      forceTerminationOnViolation: config.forceTerminationOnViolation !== false,
      ...config
    };

    // Loop state tracking
    this.activeLoops = new Map();
    this.terminatedLoops = new Map();
    this.loopMetrics = new Map();

    // Termination conditions registry
    this.terminationConditions = new Map();
    this.qualityGates = new Map();

    // Resource monitoring
    this.resourceMonitor = null;
    this.memoryBaseline = process.memoryUsage().heapUsed;

    // Convergence tracking
    this.convergenceHistory = new Map();

    this.initialize();
  }

  /**
   * Initialize loop controller
   */
  initialize() {
    // Register default termination conditions
    this.registerDefaultTerminationConditions();

    // Register default quality gates
    this.registerDefaultQualityGates();

    // Start resource monitoring if enabled
    if (this.config.enableResourceMonitoring) {
      this.startResourceMonitoring();
    }

    logger.info('🔄 Loop Controller initialized with safety limits');
  }

  /**
   * Register default termination conditions
   */
  registerDefaultTerminationConditions() {
    // Max iterations termination
    this.registerTerminationCondition('max_iterations', {
      name: 'Maximum Iterations',
      check: (loop) => loop.iterations >= loop.maxIterations,
      message: (loop) => `Maximum iterations (${loop.maxIterations}) reached`
    });

    // Timeout termination
    this.registerTerminationCondition('timeout', {
      name: 'Execution Timeout',
      check: (loop) => (Date.now() - loop.startTime) > loop.maxExecutionTime,
      message: (loop) => `Execution timeout (${loop.maxExecutionTime}ms) exceeded`
    });

    // Memory limit termination
    this.registerTerminationCondition('memory_limit', {
      name: 'Memory Limit',
      check: (loop) => {
        const currentMemory = process.memoryUsage().heapUsed;
        return (currentMemory - this.memoryBaseline) > loop.maxMemoryUsage;
      },
      message: (loop) => `Memory limit (${loop.maxMemoryUsage} bytes) exceeded`
    });

    // No progress termination
    this.registerTerminationCondition('no_progress', {
      name: 'No Progress',
      check: (loop) => {
        const history = this.convergenceHistory.get(loop.id) || [];
        if (history.length < 3) return false;

        // Check if last 3 iterations had no meaningful change
        const recent = history.slice(-3);
        const changes = recent.map((h, i) => {
          if (i === 0) return 1;
          return Math.abs(h.value - recent[i-1].value);
        });

        return changes.every(change => change < this.config.convergenceThreshold);
      },
      message: () => 'No progress detected in last 3 iterations'
    });

    // Quality degradation termination
    this.registerTerminationCondition('quality_degradation', {
      name: 'Quality Degradation',
      check: (loop) => {
        const metrics = this.loopMetrics.get(loop.id);
        if (!metrics || !metrics.quality) return false;

        // Check if quality is declining
        const qualityHistory = metrics.qualityHistory || [];
        if (qualityHistory.length < 2) return false;

        const recentQuality = qualityHistory.slice(-2);
        return recentQuality[1] < recentQuality[0] * 0.9; // 10% degradation
      },
      message: () => 'Quality degradation detected'
    });

    // Success termination (positive case)
    this.registerTerminationCondition('success', {
      name: 'Success Criteria Met',
      check: (loop) => {
        return loop.successCriteria && loop.successCriteria(loop);
      },
      message: () => 'Success criteria met'
    });
  }

  /**
   * Register default quality gates
   */
  registerDefaultQualityGates() {
    // Output quality gate
    this.registerQualityGate('output_quality', {
      name: 'Output Quality',
      evaluate: async (loop, output) => {
        // Check if output meets minimum quality
        if (!output || typeof output !== 'object') return 0;

        let score = 0;
        if (output.result) score += 0.3;
        if (output.confidence && output.confidence > 0.7) score += 0.3;
        if (output.errors && output.errors.length === 0) score += 0.2;
        if (output.validated) score += 0.2;

        return score;
      },
      threshold: 0.7
    });

    // Performance quality gate
    this.registerQualityGate('performance', {
      name: 'Performance',
      evaluate: async (loop) => {
        const metrics = this.loopMetrics.get(loop.id);
        if (!metrics) return 1;

        // Check iteration time
        const avgIterationTime = metrics.totalTime / metrics.iterations;
        const targetTime = loop.targetIterationTime || 5000; // 5 seconds default

        if (avgIterationTime > targetTime * 2) return 0.3; // Very slow
        if (avgIterationTime > targetTime * 1.5) return 0.6; // Slow
        if (avgIterationTime > targetTime) return 0.8; // Acceptable
        return 1; // Good
      },
      threshold: 0.5
    });

    // Resource usage quality gate
    this.registerQualityGate('resource_usage', {
      name: 'Resource Usage',
      evaluate: async (loop) => {
        const currentMemory = process.memoryUsage().heapUsed;
        const memoryUsed = currentMemory - this.memoryBaseline;
        const memoryRatio = memoryUsed / loop.maxMemoryUsage;

        if (memoryRatio > 0.9) return 0.3; // Critical
        if (memoryRatio > 0.7) return 0.6; // High
        if (memoryRatio > 0.5) return 0.8; // Moderate
        return 1; // Low
      },
      threshold: 0.3
    });
  }

  /**
   * Start a new loop with control
   */
  async startLoop(loopId, config = {}) {
    if (this.activeLoops.has(loopId)) {
      throw new Error(`Loop ${loopId} is already active`);
    }

    const loop = {
      id: loopId,
      startTime: Date.now(),
      iterations: 0,
      maxIterations: config.maxIterations || this.config.maxIterations,
      maxExecutionTime: config.maxExecutionTime || this.config.maxExecutionTime,
      maxMemoryUsage: config.maxMemoryUsage || this.config.maxMemoryUsage,
      qualityThreshold: config.qualityThreshold || this.config.qualityThreshold,
      terminationConditions: config.terminationConditions || [],
      qualityGates: config.qualityGates || [],
      successCriteria: config.successCriteria,
      targetIterationTime: config.targetIterationTime,
      state: 'active',
      results: [],
      metadata: config.metadata || {}
    };

    this.activeLoops.set(loopId, loop);

    // Initialize metrics
    this.loopMetrics.set(loopId, {
      iterations: 0,
      totalTime: 0,
      qualityHistory: [],
      resourceHistory: [],
      convergenceHistory: []
    });

    this.emit('loop:started', { loopId, config });
    logger.info(`🔄 Loop ${loopId} started with max ${loop.maxIterations} iterations`);

    return loop;
  }

  /**
   * Execute a loop iteration with control
   */
  async executeIteration(loopId, iterationFn, context = {}) {
    const loop = this.activeLoops.get(loopId);
    if (!loop) {
      throw new Error(`Loop ${loopId} not found`);
    }

    if (loop.state !== 'active') {
      throw new Error(`Loop ${loopId} is not active (state: ${loop.state})`);
    }

    const iterationStart = Date.now();
    loop.iterations++;

    try {
      // Check pre-iteration termination conditions
      const shouldTerminate = await this.checkTermination(loop);
      if (shouldTerminate) {
        return await this.terminateLoop(loopId, shouldTerminate);
      }

      // Execute iteration
      this.emit('iteration:starting', { loopId, iteration: loop.iterations });

      const result = await iterationFn({
        ...context,
        iteration: loop.iterations,
        loopId,
        previousResult: loop.results[loop.results.length - 1]
      });

      // Store result
      loop.results.push(result);

      // Update convergence history
      if (this.config.enableConvergenceDetection) {
        this.updateConvergenceHistory(loop, result);
      }

      // Check quality gates
      if (this.config.enableQualityGates) {
        const qualityScore = await this.evaluateQualityGates(loop, result);

        const metrics = this.loopMetrics.get(loopId);
        metrics.qualityHistory.push(qualityScore);

        if (qualityScore < loop.qualityThreshold) {
          logger.warn(`⚠️ Loop ${loopId} quality below threshold: ${qualityScore}`);

          if (this.config.forceTerminationOnViolation) {
            return await this.terminateLoop(loopId, {
              reason: 'quality_threshold_violation',
              message: `Quality score ${qualityScore} below threshold ${loop.qualityThreshold}`
            });
          }
        }
      }

      // Update metrics
      const iterationTime = Date.now() - iterationStart;
      const metrics = this.loopMetrics.get(loopId);
      metrics.iterations = loop.iterations;
      metrics.totalTime += iterationTime;

      // Check post-iteration termination conditions
      const postCheck = await this.checkTermination(loop);
      if (postCheck) {
        return await this.terminateLoop(loopId, postCheck);
      }

      this.emit('iteration:completed', {
        loopId,
        iteration: loop.iterations,
        result,
        time: iterationTime
      });

      return {
        continue: true,
        iteration: loop.iterations,
        result
      };

    } catch (error) {
      logger.error(`Loop ${loopId} iteration ${loop.iterations} failed:`, error);

      // Update loop state
      loop.state = 'error';
      loop.error = error;

      this.emit('loop:error', { loopId, iteration: loop.iterations, error });

      // Terminate on error
      return await this.terminateLoop(loopId, {
        reason: 'error',
        message: error.message,
        error
      });
    }
  }

  /**
   * Check termination conditions
   */
  async checkTermination(loop) {
    // Check all registered termination conditions
    for (const [conditionId, condition] of this.terminationConditions) {
      if (condition.check(loop)) {
        return {
          reason: conditionId,
          message: condition.message(loop)
        };
      }
    }

    // Check custom termination conditions
    for (const customCondition of loop.terminationConditions) {
      if (typeof customCondition === 'function') {
        const shouldTerminate = await customCondition(loop);
        if (shouldTerminate) {
          return {
            reason: 'custom',
            message: 'Custom termination condition met'
          };
        }
      }
    }

    return null;
  }

  /**
   * Evaluate quality gates
   */
  async evaluateQualityGates(loop, result) {
    let totalScore = 0;
    let gateCount = 0;

    // Evaluate registered quality gates
    for (const [gateId, gate] of this.qualityGates) {
      const score = await gate.evaluate(loop, result);
      totalScore += score;
      gateCount++;

      if (score < gate.threshold) {
        logger.warn(`Quality gate ${gateId} failed: ${score} < ${gate.threshold}`);
      }
    }

    // Evaluate custom quality gates
    for (const customGate of loop.qualityGates) {
      if (typeof customGate === 'function') {
        const score = await customGate(loop, result);
        totalScore += score;
        gateCount++;
      }
    }

    return gateCount > 0 ? totalScore / gateCount : 1;
  }

  /**
   * Update convergence history
   */
  updateConvergenceHistory(loop, result) {
    const history = this.convergenceHistory.get(loop.id) || [];

    // Extract convergence value from result
    let value = 0;
    if (typeof result === 'number') {
      value = result;
    } else if (result && typeof result.value === 'number') {
      value = result.value;
    } else if (result && typeof result.score === 'number') {
      value = result.score;
    }

    history.push({
      iteration: loop.iterations,
      value,
      timestamp: Date.now()
    });

    // Keep only last 10 iterations
    if (history.length > 10) {
      history.shift();
    }

    this.convergenceHistory.set(loop.id, history);
  }

  /**
   * Terminate a loop
   */
  async terminateLoop(loopId, termination) {
    const loop = this.activeLoops.get(loopId);
    if (!loop) return null;

    // Update state
    loop.state = 'terminated';
    loop.endTime = Date.now();
    loop.termination = termination;
    loop.duration = loop.endTime - loop.startTime;

    // Move to terminated
    this.activeLoops.delete(loopId);
    this.terminatedLoops.set(loopId, loop);

    // Emit termination event
    this.emit('loop:terminated', {
      loopId,
      iterations: loop.iterations,
      duration: loop.duration,
      termination
    });

    logger.info(`🛑 Loop ${loopId} terminated after ${loop.iterations} iterations: ${termination.message}`);

    return {
      continue: false,
      terminated: true,
      reason: termination.reason,
      message: termination.message,
      iterations: loop.iterations,
      duration: loop.duration,
      results: loop.results
    };
  }

  /**
   * Force terminate a loop
   */
  async forceTerminate(loopId, reason = 'forced') {
    return this.terminateLoop(loopId, {
      reason,
      message: 'Loop forcefully terminated'
    });
  }

  /**
   * Register custom termination condition
   */
  registerTerminationCondition(id, condition) {
    this.terminationConditions.set(id, condition);
  }

  /**
   * Register custom quality gate
   */
  registerQualityGate(id, gate) {
    this.qualityGates.set(id, gate);
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    this.resourceMonitor = setInterval(() => {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();

      // Check all active loops for resource violations
      for (const [loopId, loop] of this.activeLoops) {
        const memoryUsed = memory.heapUsed - this.memoryBaseline;

        if (memoryUsed > loop.maxMemoryUsage * 0.9) {
          logger.warn(`⚠️ Loop ${loopId} approaching memory limit: ${memoryUsed} bytes`);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Get loop status
   */
  getLoopStatus(loopId) {
    const active = this.activeLoops.get(loopId);
    if (active) return { ...active, state: 'active' };

    const terminated = this.terminatedLoops.get(loopId);
    if (terminated) return terminated;

    return null;
  }

  /**
   * Get all active loops
   */
  getActiveLoops() {
    return Array.from(this.activeLoops.values());
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
      this.resourceMonitor = null;
    }

    // Terminate all active loops
    for (const loopId of this.activeLoops.keys()) {
      this.forceTerminate(loopId, 'cleanup');
    }
  }
}

module.exports = LoopController;