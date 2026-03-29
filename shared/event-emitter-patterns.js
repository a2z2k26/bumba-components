/**
 * Event Emitter Patterns - Standalone stub
 * Common event patterns for BUMBA ecosystem
 *
 * Replace this with your own implementation if needed
 */

const EventEmitter = require('events');

class EventPatterns {
  static LIFECYCLE = {
    INIT: 'init',
    READY: 'ready',
    START: 'start',
    STOP: 'stop',
    ERROR: 'error',
    SHUTDOWN: 'shutdown'
  };

  static TASK = {
    CREATED: 'task:created',
    STARTED: 'task:started',
    PROGRESS: 'task:progress',
    COMPLETED: 'task:completed',
    FAILED: 'task:failed'
  };

  static AGENT = {
    SPAWNED: 'agent:spawned',
    READY: 'agent:ready',
    BUSY: 'agent:busy',
    IDLE: 'agent:idle',
    TERMINATED: 'agent:terminated'
  };
}

function applyEventEmitterPatterns(target) {
  if (!(target instanceof EventEmitter)) {
    Object.setPrototypeOf(target, EventEmitter.prototype);
    EventEmitter.call(target);
  }

  target.safeEmit = function(event, ...args) {
    try {
      return this.emit(event, ...args);
    } catch (error) {
      this.emit('error', { event, error, args });
      return false;
    }
  };

  target.onceAsync = function(event, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      this.once(event, (...args) => {
        clearTimeout(timer);
        resolve(args.length === 1 ? args[0] : args);
      });
    });
  };

  return target;
}

module.exports = { EventPatterns, applyEventEmitterPatterns };
