/**
 * BUMBA Shared Utilities
 * Standalone stubs for common dependencies
 *
 * Each module in this package can be replaced with your own implementation
 */

// Logger
const { logger, BumbaLogger, createLogger } = require('./bumba-logger');

// Event patterns
const { EventPatterns, applyEventEmitterPatterns } = require('./event-emitter-patterns');

// Manager base class
const { UnifiedManagerBase, ManagerState } = require('./unified-manager-base');

// Resilience patterns
const {
  CircuitBreaker,
  RetryHandler,
  UnifiedFailureManager,
  createSafeAsync,
  getInstance: getFailureManager,
  failureManager
} = require('./resilience');

// Consciousness compatibility stub
const { ConsciousnessLayer } = require('./consciousness-stub');

// Types (for documentation only)
const types = require('./types');

module.exports = {
  // Logger
  logger,
  BumbaLogger,
  createLogger,

  // Events
  EventPatterns,
  applyEventEmitterPatterns,

  // Manager base
  UnifiedManagerBase,
  ManagerState,

  // Resilience
  CircuitBreaker,
  RetryHandler,
  UnifiedFailureManager,
  createSafeAsync,
  getFailureManager,
  failureManager,

  // Consciousness (no-op compatibility stub)
  ConsciousnessLayer,

  // Types
  types
};
