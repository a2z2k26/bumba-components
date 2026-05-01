/**
 * Command Routing (@bumba/command-routing)
 * Intelligent command routing system with pattern matching and extensible handlers
 * Part of the BUMBA Platform
 */

const { EventEmitter } = require('events');

class CommandAnalyzer {
  analyzeCommand(command, args = [], context = {}) {
    // Input validation
    if (!command || typeof command !== 'string') {
      throw new TypeError('Command must be a non-empty string');
    }

    // Ensure args is an array
    if (!Array.isArray(args)) {
      args = args ? [String(args)] : [];
    }

    // Filter and validate args
    args = args.filter(arg => arg !== null && arg !== undefined).map(String);

    const fullCommand = `${command} ${args.join(' ')}`.toLowerCase();

    return {
      command,
      args,
      fullCommand,
      intent: this.detectIntent(fullCommand),
      patterns: this.matchPatterns(fullCommand),
      complexity: this.calculateComplexity(fullCommand),
      confidence: this.calculateConfidence(fullCommand)
    };
  }
  
  detectIntent(command) {
    const intents = {
      'build': ['build', 'create', 'implement', 'develop', 'make'],
      'analyze': ['analyze', 'review', 'audit', 'examine', 'investigate'],
      'fix': ['fix', 'debug', 'resolve', 'troubleshoot', 'repair'],
      'optimize': ['optimize', 'improve', 'enhance', 'performance'],
      'test': ['test', 'verify', 'validate', 'check', 'ensure'],
      'deploy': ['deploy', 'release', 'publish', 'launch'],
      'document': ['document', 'write', 'explain', 'describe']
    };
    
    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(keyword => command.includes(keyword))) {
        return intent;
      }
    }
    
    return 'general';
  }
  
  matchPatterns(command) {
    const patterns = [
      {
        name: 'api-development',
        regex: /(?:build|create|implement).*api/i,
        priority: 'high'
      },
      {
        name: 'database-operation',
        regex: /(?:design|create|query).*(?:database|db|table)/i,
        priority: 'high'
      },
      {
        name: 'frontend-task',
        regex: /(?:build|create).*(?:component|ui|interface)/i,
        priority: 'medium'
      },
      {
        name: 'security-task',
        regex: /(?:security|vulnerability|auth|oauth)/i,
        priority: 'high'
      },
      {
        name: 'deployment-task',
        regex: /(?:deploy|ci\/cd|docker|kubernetes)/i,
        priority: 'medium'
      }
    ];
    
    return patterns.filter(pattern => pattern.regex.test(command));
  }
  
  calculateComplexity(command) {
    let complexity = 0;
    
    // Base complexity factors
    complexity += command.length > 50 ? 0.2 : 0;
    complexity += (command.match(/and|also|then|plus/g) || []).length * 0.1;
    complexity += /enterprise|platform|architecture/.test(command) ? 0.3 : 0;
    complexity += (command.match(/api|database|security|deployment/g) || []).length * 0.1;
    
    return Math.min(complexity, 1.0);
  }
  
  calculateConfidence(command) {
    let confidence = 0.2; // Base confidence
    
    // Increase confidence based on specificity
    confidence += /(?:build|create|implement|fix|deploy)/.test(command) ? 0.2 : 0;
    confidence += /(?:javascript|python|react|node|api)/.test(command) ? 0.2 : 0;
    confidence += this.matchPatterns(command).length > 0 ? 0.3 : 0;
    confidence += command.split(' ').length > 3 ? 0.1 : 0;
    
    return Math.min(confidence, 1.0);
  }
}

/**
 * Command Routing CommandRouter
 * Core routing engine for the BUMBA Platform
 */
class CommandRouter extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      enableAnalytics: options.enableAnalytics !== false,
      enableMiddleware: options.enableMiddleware !== false,
      defaultHandler: options.defaultHandler || 'general',
      timeout: options.timeout || 30000,
      maxRetries: options.maxRetries || 3,
      maxStatsHistory: options.maxStatsHistory || 1000, // Rolling window for stats
      telemetry: options.telemetry || null, // OpenTelemetry tracer instance
      ...options
    };

    this.handlers = new Map();
    this.middleware = [];
    this.analyzer = new CommandAnalyzer();

    this.stats = {
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      averageResponseTime: 0,
      commandsByIntent: {},
      handlerStats: {}
    };

    // Rolling window for command history (memory-safe)
    this.commandHistory = [];

    // Telemetry hooks for OpenTelemetry integration
    this.telemetryHooks = {
      onCommandStart: null,
      onCommandEnd: null,
      onHandlerStart: null,
      onHandlerEnd: null,
      onMiddlewareStart: null,
      onMiddlewareEnd: null,
      onError: null
    };

    this.setupDefaultHandlers();
  }
  
  setupDefaultHandlers() {
    // Default handlers for common patterns
    this.registerHandler('build', async (analysis, context) => {
      return {
        action: 'build',
        target: analysis.args[0] || 'project',
        status: 'queued',
        message: `Build task queued for: ${analysis.fullCommand}`
      };
    });
    
    this.registerHandler('analyze', async (analysis, context) => {
      return {
        action: 'analyze',
        target: analysis.args.join(' ') || 'general',
        status: 'processing',
        message: `Analysis started for: ${analysis.fullCommand}`
      };
    });
    
    this.registerHandler('general', async (analysis, context) => {
      return {
        action: 'general',
        command: analysis.command,
        args: analysis.args,
        status: 'processed',
        message: `Command processed: ${analysis.fullCommand}`
      };
    });
  }
  
  registerHandler(intent, handlerFunction, options = {}) {
    if (typeof handlerFunction !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    this.handlers.set(intent, {
      handler: handlerFunction,
      priority: options.priority || 'normal',
      timeout: options.timeout || this.config.timeout,
      retries: options.retries || this.config.maxRetries,
      middleware: options.middleware || []
    });
    
    this.emit('handler:registered', { intent, options });
    return this;
  }
  
  unregisterHandler(intent) {
    const removed = this.handlers.delete(intent);
    if (removed) {
      this.emit('handler:unregistered', { intent });
    }
    return removed;
  }
  
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    
    this.middleware.push(middleware);
    return this;
  }
  
  async route(command, args = [], context = {}) {
    const startTime = Date.now();
    const commandId = this.generateCommandId();

    // Telemetry: Start span
    const span = this.startTelemetrySpan('command.route', {
      'command.id': commandId,
      'command.name': command,
      'command.args.count': args.length
    });

    try {
      this.stats.totalCommands++;

      // Analyze the command
      const analysis = this.analyzer.analyzeCommand(command, args, context);

      // Telemetry: Add analysis attributes
      this.addTelemetryAttributes(span, {
        'command.intent': analysis.intent,
        'command.confidence': analysis.confidence,
        'command.complexity': analysis.complexity
      });

      this.emit('command:received', {
        commandId,
        analysis,
        timestamp: new Date().toISOString()
      });

      // Apply middleware
      const middlewareContext = { ...context, commandId, analysis };

      if (this.config.enableMiddleware && this.middleware.length > 0) {
        await this.applyMiddleware(middlewareContext);
      }

      // Route to appropriate handler
      const result = await this.executeHandler(analysis, middlewareContext);

      // Update statistics
      this.updateStats(analysis, startTime, true);

      this.emit('command:completed', {
        commandId,
        analysis,
        result,
        duration: Date.now() - startTime
      });

      // Telemetry: Success
      this.endTelemetrySpan(span, { status: 'ok' });

      return {
        success: true,
        commandId,
        analysis,
        result,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.stats.failedCommands++;

      // Telemetry: Error
      this.recordTelemetryError(span, error);

      this.emit('command:error', {
        commandId,
        command,
        args,
        error: error.message,
        duration: Date.now() - startTime
      });

      this.endTelemetrySpan(span, { status: 'error' });

      return {
        success: false,
        commandId,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
  
  async executeHandler(analysis, context) {
    const handlerInfo = this.handlers.get(analysis.intent) || 
                       this.handlers.get(this.config.defaultHandler);
                       
    if (!handlerInfo) {
      throw new Error(`No handler found for intent: ${analysis.intent}`);
    }
    
    const { handler, timeout, retries } = handlerInfo;
    
    // Execute with timeout and retry logic
    return await this.executeWithRetry(
      () => this.executeWithTimeout(handler, analysis, context, timeout),
      retries
    );
  }
  
  async executeWithTimeout(handler, analysis, context, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Handler timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        const result = await handler(analysis, context);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  async executeWithRetry(operation, maxRetries) {
    let lastError;
    const errors = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // Preserve error context
        const errorContext = {
          attempt: attempt + 1,
          timestamp: new Date().toISOString(),
          message: error.message,
          stack: error.stack
        };
        errors.push(errorContext);
        lastError = error;

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    // Enhance error with retry context
    lastError.retryContext = errors;
    lastError.totalAttempts = maxRetries + 1;
    throw lastError;
  }
  
  async applyMiddleware(context) {
    for (const middleware of this.middleware) {
      try {
        await middleware(context);
      } catch (error) {
        this.emit('middleware:error', { error: error.message, context });
        throw error;
      }
    }
  }
  
  updateStats(analysis, startTime, success) {
    const duration = Date.now() - startTime;

    // Add to rolling history
    const commandRecord = {
      timestamp: new Date().toISOString(),
      intent: analysis.intent,
      duration,
      success
    };

    this.commandHistory.push(commandRecord);

    // Maintain rolling window
    if (this.commandHistory.length > this.config.maxStatsHistory) {
      const removed = this.commandHistory.shift();
      // Adjust stats for removed record
      if (removed.success) {
        this.stats.successfulCommands = Math.max(0, this.stats.successfulCommands - 1);
      } else {
        this.stats.failedCommands = Math.max(0, this.stats.failedCommands - 1);
      }
      this.stats.totalCommands = Math.max(0, this.stats.totalCommands - 1);
    }

    // Update response time average based on window
    const recentCommands = this.commandHistory.slice(-100); // Last 100 for average
    const avgTime = recentCommands.reduce((sum, cmd) => sum + cmd.duration, 0) / recentCommands.length;
    this.stats.averageResponseTime = Math.round(avgTime);

    if (success) {
      this.stats.successfulCommands++;
    }

    // Update command intent stats
    this.stats.commandsByIntent[analysis.intent] =
      (this.stats.commandsByIntent[analysis.intent] || 0) + 1;
  }
  
  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalCommands > 0 
        ? (this.stats.successfulCommands / this.stats.totalCommands) * 100 
        : 0,
      registeredHandlers: Array.from(this.handlers.keys()),
      middlewareCount: this.middleware.length
    };
  }
  
  reset() {
    this.stats = {
      totalCommands: 0,
      successfulCommands: 0,
      failedCommands: 0,
      averageResponseTime: 0,
      commandsByIntent: {},
      handlerStats: {}
    };
    
    this.emit('stats:reset');
  }
  
  listHandlers() {
    return Array.from(this.handlers.entries()).map(([intent, info]) => ({
      intent,
      priority: info.priority,
      timeout: info.timeout,
      retries: info.retries,
      hasMiddleware: info.middleware.length > 0
    }));
  }

  /**
   * Cleanup method for long-running processes
   * Clears command history while preserving stats
   */
  cleanup() {
    const historyLength = this.commandHistory.length;
    this.commandHistory = [];
    this.emit('cleanup:completed', {
      clearedCommands: historyLength,
      timestamp: new Date().toISOString()
    });
    return { clearedCommands: historyLength };
  }

  /**
   * Destroy the router and cleanup all resources
   */
  destroy() {
    this.removeAllListeners();
    this.handlers.clear();
    this.middleware = [];
    this.commandHistory = [];
    this.reset();
    this.emit('router:destroyed');
  }

  /**
   * Get health status of the router
   */
  health() {
    const now = Date.now();
    const recentCommands = this.commandHistory.filter(
      cmd => (now - new Date(cmd.timestamp).getTime()) < 60000 // Last minute
    );

    const recentFailures = recentCommands.filter(cmd => !cmd.success).length;
    const failureRate = recentCommands.length > 0
      ? recentFailures / recentCommands.length
      : 0;

    const status = failureRate > 0.5 ? 'unhealthy' :
                   failureRate > 0.2 ? 'degraded' : 'healthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      handlers: this.handlers.size,
      middleware: this.middleware.length,
      uptime: process.uptime(),
      memory: {
        historySize: this.commandHistory.length,
        maxHistory: this.config.maxStatsHistory
      },
      stats: {
        total: this.stats.totalCommands,
        success: this.stats.successfulCommands,
        failed: this.stats.failedCommands,
        successRate: this.stats.totalCommands > 0
          ? (this.stats.successfulCommands / this.stats.totalCommands) * 100
          : 100,
        recentFailureRate: failureRate * 100,
        averageResponseTime: this.stats.averageResponseTime
      }
    };
  }

  /**
   * Get detailed diagnostics
   */
  diagnostics() {
    const health = this.health();

    return {
      ...health,
      configuration: {
        enableAnalytics: this.config.enableAnalytics,
        enableMiddleware: this.config.enableMiddleware,
        defaultHandler: this.config.defaultHandler,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        maxStatsHistory: this.config.maxStatsHistory
      },
      handlers: this.listHandlers(),
      recentErrors: this.commandHistory
        .filter(cmd => !cmd.success)
        .slice(-5)
        .map(cmd => ({
          timestamp: cmd.timestamp,
          intent: cmd.intent,
          duration: cmd.duration
        })),
      intentDistribution: this.stats.commandsByIntent
    };
  }

  /**
   * Set telemetry hooks for OpenTelemetry integration
   */
  setTelemetryHooks(hooks) {
    Object.assign(this.telemetryHooks, hooks);
    return this;
  }

  /**
   * Start a telemetry span (OpenTelemetry integration)
   */
  startTelemetrySpan(name, attributes = {}) {
    if (this.telemetryHooks.onCommandStart) {
      return this.telemetryHooks.onCommandStart(name, attributes);
    }
    // Return dummy span if no telemetry configured
    return { name, attributes, startTime: Date.now() };
  }

  /**
   * Add attributes to telemetry span
   */
  addTelemetryAttributes(span, attributes) {
    if (span && span.setAttributes) {
      span.setAttributes(attributes);
    } else if (span) {
      Object.assign(span.attributes || {}, attributes);
    }
  }

  /**
   * Record error in telemetry
   */
  recordTelemetryError(span, error) {
    if (this.telemetryHooks.onError) {
      this.telemetryHooks.onError(span, error);
    } else if (span && span.recordException) {
      span.recordException(error);
    }
  }

  /**
   * End telemetry span
   */
  endTelemetrySpan(span, options = {}) {
    if (this.telemetryHooks.onCommandEnd) {
      this.telemetryHooks.onCommandEnd(span, options);
    } else if (span && span.end) {
      if (options.status) {
        span.setStatus({ code: options.status === 'ok' ? 0 : 2 });
      }
      span.end();
    }
  }
}

// Utility function to create a new router instance
function createRouter(options) {
  return new CommandRouter(options);
}

module.exports = {
  CommandRouter,
  CommandAnalyzer,
  createRouter,

  // Intent constants
  Intent: {
    BUILD: 'build',
    ANALYZE: 'analyze',
    FIX: 'fix',
    OPTIMIZE: 'optimize',
    TEST: 'test',
    DEPLOY: 'deploy',
    DOCUMENT: 'document',
    GENERAL: 'general'
  },

  // Command Routing metadata
  CommandRouting: {
    version: '1.2.0',
    platform: 'BUMBA',
    name: 'Command Routing'
  }
};