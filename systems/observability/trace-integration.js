/**
 * BUMBA Trace Integration Helper
 * Simplifies trace recording integration with chat command
 *
 * Part of Option 1: Integration - Sprint 1
 */

const TraceRecorder = require('./trace-recorder');
// [OPTIONAL] const OrchestrationLiveView = require('../../ui/orchestration-live-view'); // May need @bumba/* package

class TraceIntegration {
  constructor(options = {}) {
    this.options = {
      autoSave: options.autoSave !== false,
      enableWatch: options.enableWatch !== false,
      debug: options.debug || false,
      ...options
    };

    this.traceRecorder = null;
    this.liveView = null;
    this.currentTrace = null;
    this.stepTimings = {};
  }

  /**
   * Check if tracing is enabled
   * Sprint 3: Automatic tracing is now enabled by default
   *
   * Priority order (highest to lowest):
   * 1. forceTrace option (--trace flag) - always enables
   * 2. disableTrace option (--no-trace flag) - always disables
   * 3. BUMBA_DISABLE_TRACE env var - globally disables
   * 4. autoTrace option / env vars - default behavior
   */
  isTracingEnabled() {
    // Priority 1: Force trace via --trace flag (highest priority)
    if (this.options.forceTrace === true) {
      return true;
    }

    // Priority 2: Explicit disable via --no-trace flag
    if (this.options.disableTrace === true) {
      return false;
    }

    // Priority 3: Global disable via environment variable
    if (process.env.BUMBA_DISABLE_TRACE === 'true' ||
        process.env.BUMBA_DISABLE_TRACE === '1') {
      return false;
    }

    // Priority 4: Sprint 3 - Enable automatic tracing by default
    // Users can disable with --no-trace flag or BUMBA_DISABLE_TRACE env var
    const autoTraceEnabled = this.options.autoTrace !== false;

    return autoTraceEnabled ||
           process.env.BUMBA_TRACE_MODE === 'true' ||
           process.env.BUMBA_TRACE_MODE === '1' ||
           process.env.BUMBA_AUTO_TRACE === 'true';
  }

  /**
   * Check if watch mode is enabled
   */
  isWatchEnabled() {
    return this.options.enableWatch && (
      process.env.BUMBA_WATCH_MODE === 'true' ||
      process.env.BUMBA_WATCH_MODE === '1' ||
      this.options.forceWatch
    );
  }

  /**
   * Initialize tracing for a query
   */
  async initialize(query, options = {}) {
    try {
      // Initialize TraceRecorder if needed
      if (this.isTracingEnabled() && !this.traceRecorder) {
        this.traceRecorder = new TraceRecorder();
      }

      // Initialize Watch Mode if needed
      if (this.isWatchEnabled() && !this.liveView && this.traceRecorder) {
        try {
          this.liveView = new OrchestrationLiveView(this.traceRecorder, options.watchOptions);
          await this.liveView.initialize();
        } catch (error) {
          if (this.options.debug) {
            console.error('Watch mode initialization failed:', error.message);
          }
          this.liveView = null;
        }
      }

      // Start trace if enabled
      if (this.traceRecorder) {
        const queryId = options.queryId || `q${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
        this.currentTrace = this.traceRecorder.startTrace(queryId, query);
        this.stepTimings = {};

        return {
          tracing: true,
          watching: !!this.liveView,
          queryId,
          trace: this.currentTrace
        };
      }

      return {
        tracing: false,
        watching: false
      };
    } catch (error) {
      if (this.options.debug) {
        console.error('Trace initialization error:', error.message);
      }
      return {
        tracing: false,
        watching: false,
        error: error.message
      };
    }
  }

  /**
   * Record a step in the trace
   */
  recordStep(system, action, data = {}, duration = null) {
    if (!this.traceRecorder || !this.currentTrace) {
      return;
    }

    try {
      // Calculate duration if not provided
      let actualDuration = duration;
      if (actualDuration === null) {
        const stepKey = `${system}:${action}`;
        if (this.stepTimings[stepKey]) {
          actualDuration = Date.now() - this.stepTimings[stepKey];
          delete this.stepTimings[stepKey];
        } else {
          actualDuration = 0;
        }
      }

      // Record the step
      this.traceRecorder.recordStep(system, action, data, actualDuration);
    } catch (error) {
      if (this.options.debug) {
        console.error('Step recording error:', error.message);
      }
    }
  }

  /**
   * Start timing for a step (call before step begins)
   */
  startStep(system, action) {
    const stepKey = `${system}:${action}`;
    this.stepTimings[stepKey] = Date.now();
  }

  /**
   * End timing and record a step (call after step completes)
   */
  endStep(system, action, data = {}) {
    const stepKey = `${system}:${action}`;
    let duration = 0;

    if (this.stepTimings[stepKey]) {
      duration = Date.now() - this.stepTimings[stepKey];
      delete this.stepTimings[stepKey];
    }

    this.recordStep(system, action, data, duration);
  }

  /**
   * End the current trace
   */
  async endTrace(result = {}) {
    if (!this.traceRecorder || !this.currentTrace) {
      return null;
    }

    try {
      // End the trace
      const completedTrace = this.traceRecorder.endTrace(result);

      // Auto-save if enabled
      if (this.options.autoSave && completedTrace) {
        try {
          const filepath = await this.traceRecorder.saveTrace(completedTrace);
          if (this.options.debug) {
            console.log(`Trace saved: ${filepath}`);
          }
        } catch (error) {
          if (this.options.debug) {
            console.error('Trace save error:', error.message);
          }
        }
      }

      // Clean up
      const trace = this.currentTrace;
      this.currentTrace = null;
      this.stepTimings = {};

      return trace;
    } catch (error) {
      if (this.options.debug) {
        console.error('Trace end error:', error.message);
      }
      return null;
    }
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    // End any active trace
    if (this.currentTrace) {
      await this.endTrace({ success: false, message: 'Trace interrupted' });
    }

    // Cleanup live view
    if (this.liveView) {
      try {
        if (typeof this.liveView.shutdown === 'function') {
          this.liveView.shutdown();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
      this.liveView = null;
    }

    // Cleanup trace recorder
    this.traceRecorder = null;
    this.currentTrace = null;
    this.stepTimings = {};
  }

  /**
   * Helper: Wrap a function with automatic step recording
   */
  wrapStep(system, action, fn) {
    return async (...args) => {
      this.startStep(system, action);
      try {
        const result = await fn(...args);
        this.endStep(system, action, { success: true });
        return result;
      } catch (error) {
        this.endStep(system, action, { success: false, error: error.message });
        throw error;
      }
    };
  }

  /**
   * Helper: Record multiple steps at once
   */
  recordSteps(steps) {
    steps.forEach(step => {
      this.recordStep(
        step.system,
        step.action,
        step.data || {},
        step.duration || 0
      );
    });
  }

  /**
   * Get current trace information
   */
  getCurrentTrace() {
    return this.currentTrace;
  }

  /**
   * Check if currently tracing
   */
  isTracing() {
    return !!this.currentTrace;
  }

  /**
   * Check if watch mode is active
   */
  isWatching() {
    return !!this.liveView;
  }

  /**
   * Get the live view instance (for event wiring)
   */
  getLiveView() {
    return this.liveView;
  }
}

module.exports = TraceIntegration;
