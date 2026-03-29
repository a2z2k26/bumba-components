/**
 * Error Handling & Resilience for BUMBA AI Providers
 * Sprint 2.10: Comprehensive error handling, retry strategies, and circuit breakers
 *
 * Provides:
 * - Error categorization and classification
 * - Automatic retry strategies with exponential backoff
 * - Circuit breaker pattern for fault tolerance
 * - Degraded mode operations
 * - Error recovery recommendations
 */

const EventEmitter = require('events');

/**
 * AI provider error categories
 */
const ErrorCategory = {
  // Network errors (transient, retryable)
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  CONNECTION: 'connection',

  // Rate limiting errors (retryable with backoff)
  RATE_LIMIT: 'rate_limit',
  QUOTA_EXCEEDED: 'quota_exceeded',

  // Authentication errors (not retryable without fixing credentials)
  AUTH: 'authentication',
  INVALID_KEY: 'invalid_key',
  EXPIRED_KEY: 'expired_key',

  // Request errors (not retryable without fixing request)
  INVALID_REQUEST: 'invalid_request',
  INVALID_MODEL: 'invalid_model',
  CONTEXT_LENGTH: 'context_length',

  // Server errors (retryable)
  SERVER_ERROR: 'server_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',

  // Resource errors (may need different provider)
  INSUFFICIENT_QUOTA: 'insufficient_quota',
  MODEL_UNAVAILABLE: 'model_unavailable',

  // Unknown errors
  UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',           // Transient, will retry
  MEDIUM: 'medium',     // May require intervention
  HIGH: 'high',         // Requires immediate attention
  CRITICAL: 'critical'  // Service is down
};

/**
 * Categorized AI provider error
 *
 * @class AIProviderError
 * @extends Error
 * @description Structured error with categorization and retry information
 * @param {string} message - Error message
 * @param {Object} options - Error options
 * @param {string} options.category - Error category from ErrorCategory
 * @param {string} options.severity - Error severity from ErrorSeverity
 * @param {boolean} options.retryable - Whether error is retryable
 * @param {number} options.retryAfter - Suggested retry delay in seconds
 * @param {string} options.provider - AI provider name
 * @param {Object} options.originalError - Original error object
 */
class AIProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.category = options.category || ErrorCategory.UNKNOWN;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.retryable = options.retryable !== undefined ? options.retryable : false;
    this.retryAfter = options.retryAfter || null;
    this.provider = options.provider || null;
    this.statusCode = options.statusCode || null;
    this.originalError = options.originalError || null;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIProviderError);
    }
  }

  /**
   * Get human-readable error description
   */
  getDescription() {
    const descriptions = {
      [ErrorCategory.NETWORK]: 'Network connection failed',
      [ErrorCategory.TIMEOUT]: 'Request timed out',
      [ErrorCategory.CONNECTION]: 'Connection error',
      [ErrorCategory.RATE_LIMIT]: 'Rate limit exceeded',
      [ErrorCategory.QUOTA_EXCEEDED]: 'Quota exceeded',
      [ErrorCategory.AUTH]: 'Authentication failed',
      [ErrorCategory.INVALID_KEY]: 'Invalid API key',
      [ErrorCategory.EXPIRED_KEY]: 'API key expired',
      [ErrorCategory.INVALID_REQUEST]: 'Invalid request',
      [ErrorCategory.INVALID_MODEL]: 'Model not found',
      [ErrorCategory.CONTEXT_LENGTH]: 'Context length exceeded',
      [ErrorCategory.SERVER_ERROR]: 'Server error',
      [ErrorCategory.SERVICE_UNAVAILABLE]: 'Service unavailable',
      [ErrorCategory.INSUFFICIENT_QUOTA]: 'Insufficient quota',
      [ErrorCategory.MODEL_UNAVAILABLE]: 'Model temporarily unavailable',
      [ErrorCategory.UNKNOWN]: 'Unknown error'
    };
    return descriptions[this.category] || 'Unknown error';
  }

  /**
   * Get recovery recommendation
   */
  getRecoveryRecommendation() {
    const recommendations = {
      [ErrorCategory.NETWORK]: 'Check network connection and retry',
      [ErrorCategory.TIMEOUT]: 'Retry with increased timeout',
      [ErrorCategory.CONNECTION]: 'Verify service endpoint and retry',
      [ErrorCategory.RATE_LIMIT]: `Wait ${this.retryAfter || 60} seconds before retrying`,
      [ErrorCategory.QUOTA_EXCEEDED]: 'Check quota limits or upgrade plan',
      [ErrorCategory.AUTH]: 'Verify API key and permissions',
      [ErrorCategory.INVALID_KEY]: 'Update API key in configuration',
      [ErrorCategory.EXPIRED_KEY]: 'Renew API key',
      [ErrorCategory.INVALID_REQUEST]: 'Check request parameters',
      [ErrorCategory.INVALID_MODEL]: 'Use a valid model name',
      [ErrorCategory.CONTEXT_LENGTH]: 'Reduce context length or use a larger model',
      [ErrorCategory.SERVER_ERROR]: 'Retry after a brief delay',
      [ErrorCategory.SERVICE_UNAVAILABLE]: 'Try alternative provider or retry later',
      [ErrorCategory.INSUFFICIENT_QUOTA]: 'Wait for quota reset or upgrade',
      [ErrorCategory.MODEL_UNAVAILABLE]: 'Try alternative model or retry later',
      [ErrorCategory.UNKNOWN]: 'Check error details and contact support if needed'
    };
    return recommendations[this.category] || 'Contact support';
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      provider: this.provider,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      description: this.getDescription(),
      recommendation: this.getRecoveryRecommendation()
    };
  }
}

/**
 * Error classifier for AI provider errors
 *
 * @class ErrorClassifier
 * @description Analyzes errors and categorizes them for appropriate handling
 */
class ErrorClassifier {
  /**
   * Classify error from HTTP response
   * @param {Object} error - Error object
   * @param {string} provider - Provider name
   * @returns {AIProviderError}
   */
  static classifyError(error, provider = null) {
    // Extract status code
    const statusCode = error.statusCode || error.status || error.response?.status;
    const message = error.message || 'Unknown error';
    const responseData = error.response?.data || error.data || {};

    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ENETUNREACH') {
      return new AIProviderError(message, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        provider,
        statusCode,
        originalError: error
      });
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT' || message.includes('timeout')) {
      return new AIProviderError(message, {
        category: ErrorCategory.TIMEOUT,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        provider,
        statusCode,
        originalError: error
      });
    }

    // HTTP status code based classification
    if (statusCode) {
      return this.classifyByStatusCode(statusCode, message, responseData, provider, error);
    }

    // Default unknown error
    return new AIProviderError(message, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      provider,
      originalError: error
    });
  }

  /**
   * Classify error by HTTP status code
   */
  static classifyByStatusCode(statusCode, message, responseData, provider, originalError) {
    // 401 - Authentication
    if (statusCode === 401) {
      const messageLower = message.toLowerCase();
      const isInvalidKey = messageLower.includes('invalid') || messageLower.includes('incorrect');
      const isExpired = messageLower.includes('expired');

      return new AIProviderError(message, {
        category: isExpired ? ErrorCategory.EXPIRED_KEY : isInvalidKey ? ErrorCategory.INVALID_KEY : ErrorCategory.AUTH,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        provider,
        statusCode,
        originalError
      });
    }

    // 403 - Insufficient quota or permissions
    if (statusCode === 403) {
      return new AIProviderError(message, {
        category: ErrorCategory.INSUFFICIENT_QUOTA,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        provider,
        statusCode,
        originalError
      });
    }

    // 404 - Model not found
    if (statusCode === 404 && (message.includes('model') || responseData.error?.includes('model'))) {
      return new AIProviderError(message, {
        category: ErrorCategory.INVALID_MODEL,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        provider,
        statusCode,
        originalError
      });
    }

    // 413 - Context length exceeded
    if (statusCode === 413 || message.includes('context_length') || message.includes('too long')) {
      return new AIProviderError(message, {
        category: ErrorCategory.CONTEXT_LENGTH,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        provider,
        statusCode,
        originalError
      });
    }

    // 429 - Rate limit
    if (statusCode === 429) {
      const retryAfter = this.extractRetryAfter(responseData, originalError);
      return new AIProviderError(message, {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.LOW,
        retryable: true,
        retryAfter,
        provider,
        statusCode,
        originalError
      });
    }

    // 400 - Bad request
    if (statusCode === 400) {
      return new AIProviderError(message, {
        category: ErrorCategory.INVALID_REQUEST,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        provider,
        statusCode,
        originalError
      });
    }

    // 500 - Server error
    if (statusCode >= 500 && statusCode < 600) {
      return new AIProviderError(message, {
        category: statusCode === 503 ? ErrorCategory.SERVICE_UNAVAILABLE : ErrorCategory.SERVER_ERROR,
        severity: statusCode === 503 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
        retryable: true,
        provider,
        statusCode,
        originalError
      });
    }

    // Unknown status code
    return new AIProviderError(message, {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      retryable: statusCode >= 500,
      provider,
      statusCode,
      originalError
    });
  }

  /**
   * Extract retry-after value from response
   */
  static extractRetryAfter(responseData, error) {
    // Check headers
    const headers = error.response?.headers || {};
    if (headers['retry-after']) {
      return parseInt(headers['retry-after'], 10);
    }

    // Check response body
    if (responseData.retry_after) {
      return responseData.retry_after;
    }

    // Default
    return 60;
  }
}

/**
 * Retry strategy with exponential backoff
 *
 * @class RetryStrategy
 * @description Implements retry logic with configurable backoff
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 60000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {boolean} options.jitter - Add random jitter (default: true)
 */
class RetryStrategy {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 60000,
      backoffMultiplier: options.backoffMultiplier || 2,
      jitter: options.jitter !== false,
      retryableCategories: options.retryableCategories || [
        ErrorCategory.NETWORK,
        ErrorCategory.TIMEOUT,
        ErrorCategory.CONNECTION,
        ErrorCategory.RATE_LIMIT,
        ErrorCategory.SERVER_ERROR,
        ErrorCategory.SERVICE_UNAVAILABLE,
        ErrorCategory.MODEL_UNAVAILABLE
      ],
      ...options
    };
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error, attemptNumber) {
    // Check attempt limit
    if (attemptNumber >= this.options.maxRetries) {
      return false;
    }

    // Check if error is retryable
    if (error instanceof AIProviderError) {
      return error.retryable && this.options.retryableCategories.includes(error.category);
    }

    // Unknown errors are not retried by default
    return false;
  }

  /**
   * Calculate delay for next retry
   */
  calculateDelay(attemptNumber, error = null) {
    // Use error's retry-after if available
    if (error instanceof AIProviderError && error.retryAfter) {
      return error.retryAfter * 1000;
    }

    // Exponential backoff
    let delay = this.options.initialDelay * Math.pow(this.options.backoffMultiplier, attemptNumber);

    // Cap at max delay
    delay = Math.min(delay, this.options.maxDelay);

    // Add jitter
    if (this.options.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Wait for specified delay
   */
  async wait(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = null) {
    let lastError = null;
    let attemptNumber = 0;

    while (attemptNumber <= this.options.maxRetries) {
      try {
        const result = await fn.call(context);
        return result;
      } catch (error) {
        lastError = error instanceof AIProviderError ? error : ErrorClassifier.classifyError(error);
        attemptNumber++;

        if (!this.shouldRetry(lastError, attemptNumber)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attemptNumber - 1, lastError);
        await this.wait(delay);
      }
    }

    throw lastError;
  }
}

/**
 * Circuit breaker for fault tolerance
 *
 * @class CircuitBreaker
 * @extends EventEmitter
 * @description Implements circuit breaker pattern to prevent cascading failures
 * @param {Object} options - Configuration options
 * @param {number} options.failureThreshold - Failures before opening circuit (default: 5)
 * @param {number} options.successThreshold - Successes before closing circuit (default: 2)
 * @param {number} options.timeout - Timeout in ms (default: 60000)
 * @param {number} options.resetTimeout - Time before attempting reset in ms (default: 30000)
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      resetTimeout: options.resetTimeout || 30000,
      ...options
    };

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * Get circuit state
   */
  getState() {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
      this.state = 'HALF_OPEN';
      this.successCount = 0;
      this.emit('state:half_open');
    }

    return this.state;
  }

  /**
   * Execute function through circuit breaker
   */
  async execute(fn, context = null) {
    const currentState = this.getState();

    // Reject immediately if circuit is open
    if (currentState === 'OPEN') {
      const waitTime = Math.ceil((this.nextAttemptTime - Date.now()) / 1000);
      const error = new AIProviderError('Circuit breaker is OPEN', {
        category: ErrorCategory.SERVICE_UNAVAILABLE,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        retryAfter: waitTime
      });
      this.emit('request:rejected', { state: currentState, error });
      throw error;
    }

    // Execute with timeout
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Circuit breaker timeout')), this.options.timeout);
      });

      const result = await Promise.race([
        fn.call(context),
        timeoutPromise
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Record successful execution
   */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.close();
      }
    }

    this.emit('request:success', { state: this.state });
  }

  /**
   * Record failed execution
   */
  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.emit('request:failure', {
      state: this.state,
      failureCount: this.failureCount,
      error
    });

    if (this.state === 'HALF_OPEN') {
      this.open();
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.open();
    }
  }

  /**
   * Open circuit
   */
  open() {
    if (this.state !== 'OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;

      this.emit('state:open', {
        failureCount: this.failureCount,
        nextAttemptTime: this.nextAttemptTime
      });
    }
  }

  /**
   * Close circuit
   */
  close() {
    if (this.state !== 'CLOSED') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.successCount = 0;
      this.nextAttemptTime = null;

      this.emit('state:closed');
    }
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    this.emit('state:reset');
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

/**
 * Error recovery coordinator
 *
 * @class ErrorRecoveryCoordinator
 * @extends EventEmitter
 * @description Orchestrates error handling, retries, and circuit breakers
 * @param {Object} options - Configuration options
 */
class ErrorRecoveryCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enableRetry: options.enableRetry !== false,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      ...options
    };

    this.retryStrategy = new RetryStrategy(options.retry || {});
    this.circuitBreakers = new Map(); // provider -> CircuitBreaker
    this.errorHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Register circuit breaker for a provider
   */
  registerProvider(provider, circuitBreakerOptions = {}) {
    if (this.options.enableCircuitBreaker) {
      const breaker = new CircuitBreaker(circuitBreakerOptions);

      // Forward events
      breaker.on('state:open', (data) => {
        this.emit('circuit:open', { provider, ...data });
      });
      breaker.on('state:half_open', () => {
        this.emit('circuit:half_open', { provider });
      });
      breaker.on('state:closed', () => {
        this.emit('circuit:closed', { provider });
      });
      breaker.on('request:rejected', (data) => {
        this.emit('request:rejected', { provider, ...data });
      });

      this.circuitBreakers.set(provider, breaker);
    }
  }

  /**
   * Execute function with error handling
   */
  async execute(provider, fn, context = null) {
    const executeWithRetry = async () => {
      if (this.options.enableRetry) {
        return await this.retryStrategy.execute(fn, context);
      } else {
        return await fn.call(context);
      }
    };

    try {
      // Execute through circuit breaker if enabled
      if (this.options.enableCircuitBreaker && this.circuitBreakers.has(provider)) {
        const breaker = this.circuitBreakers.get(provider);
        const result = await breaker.execute(executeWithRetry);
        this.recordSuccess(provider);
        return result;
      } else {
        const result = await executeWithRetry();
        this.recordSuccess(provider);
        return result;
      }
    } catch (error) {
      const classifiedError = error instanceof AIProviderError
        ? error
        : ErrorClassifier.classifyError(error, provider);

      this.recordError(provider, classifiedError);
      throw classifiedError;
    }
  }

  /**
   * Record successful execution
   */
  recordSuccess(provider) {
    this.emit('execution:success', { provider, timestamp: new Date().toISOString() });
  }

  /**
   * Record error
   */
  recordError(provider, error) {
    this.errorHistory.push({
      provider,
      error: error.toJSON(),
      timestamp: new Date().toISOString()
    });

    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    this.emit('execution:error', {
      provider,
      error: error.toJSON()
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(provider = null, timeWindowMs = 3600000) {
    const now = Date.now();
    const cutoff = new Date(now - timeWindowMs).toISOString();

    let errors = this.errorHistory.filter(e => e.timestamp >= cutoff);

    if (provider) {
      errors = errors.filter(e => e.provider === provider);
    }

    const byCategory = {};
    const bySeverity = {};
    const byProvider = {};

    for (const entry of errors) {
      const { category, severity } = entry.error;
      const prov = entry.provider;

      byCategory[category] = (byCategory[category] || 0) + 1;
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      byProvider[prov] = (byProvider[prov] || 0) + 1;
    }

    return {
      total: errors.length,
      timeWindowMs,
      byCategory,
      bySeverity,
      byProvider,
      recentErrors: errors.slice(-10)
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(provider = null) {
    if (provider) {
      const breaker = this.circuitBreakers.get(provider);
      return breaker ? breaker.getStatus() : null;
    }

    const status = {};
    for (const [prov, breaker] of this.circuitBreakers.entries()) {
      status[prov] = breaker.getStatus();
    }
    return status;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(provider) {
    const breaker = this.circuitBreakers.get(provider);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.errorHistory = [];
    this.circuitBreakers.clear();
  }
}

module.exports = {
  AIProviderError,
  ErrorCategory,
  ErrorSeverity,
  ErrorClassifier,
  RetryStrategy,
  CircuitBreaker,
  ErrorRecoveryCoordinator
};
