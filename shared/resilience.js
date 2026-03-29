/**
 * Resilience Patterns - Standalone stub
 * Circuit breakers, retries, and failure handling
 *
 * Replace this with your own implementation if needed
 */

const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.lastFailure = null;
  }

  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.emit('closed');
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.emit('open');
    }
  }

  getState() {
    return this.state;
  }
}

class RetryHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
  }

  async execute(fn, context = {}) {
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }
}

function createSafeAsync(fn, options = {}) {
  const handler = new RetryHandler(options);
  return async (...args) => handler.execute(() => fn(...args));
}

class UnifiedFailureManager extends EventEmitter {
  constructor() {
    super();
    this.circuits = new Map();
  }

  getCircuit(name, options) {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, new CircuitBreaker(options));
    }
    return this.circuits.get(name);
  }

  async executeWithResilience(name, fn, options = {}) {
    const circuit = this.getCircuit(name, options);
    const retry = new RetryHandler(options);
    return retry.execute(() => circuit.execute(fn));
  }
}

const failureManager = new UnifiedFailureManager();

module.exports = {
  CircuitBreaker,
  RetryHandler,
  UnifiedFailureManager,
  createSafeAsync,
  getInstance: () => failureManager,
  failureManager
};
