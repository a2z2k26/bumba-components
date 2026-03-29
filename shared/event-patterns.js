/**
 * Event Patterns - Common event patterns used across primitives
 */

const EventEmitter = require('events');

/**
 * Enhanced EventEmitter with typed events and debugging
 */
class TypedEventEmitter extends EventEmitter {
  constructor() {
    super();
    this._eventRegistry = new Map();
  }

  /**
   * Register an event type with description
   */
  registerEvent(eventName, description) {
    this._eventRegistry.set(eventName, { description, handlers: 0 });
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents() {
    return Object.fromEntries(this._eventRegistry);
  }

  /**
   * Emit with automatic error handling
   */
  safeEmit(eventName, ...args) {
    try {
      return this.emit(eventName, ...args);
    } catch (error) {
      this.emit('error', { event: eventName, error, args });
      return false;
    }
  }
}

/**
 * Debounced event emitter - batches rapid events
 */
class DebouncedEmitter extends TypedEventEmitter {
  constructor(debounceMs = 100) {
    super();
    this._debounceMs = debounceMs;
    this._pending = new Map();
  }

  debounceEmit(eventName, data) {
    if (this._pending.has(eventName)) {
      clearTimeout(this._pending.get(eventName).timer);
    }

    const timer = setTimeout(() => {
      const pending = this._pending.get(eventName);
      if (pending) {
        this.emit(eventName, pending.data);
        this._pending.delete(eventName);
      }
    }, this._debounceMs);

    this._pending.set(eventName, { timer, data });
  }
}

/**
 * Event bus for cross-module communication
 */
class EventBus extends TypedEventEmitter {
  constructor() {
    super();
    this._channels = new Map();
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel, handler) {
    if (!this._channels.has(channel)) {
      this._channels.set(channel, new Set());
    }
    this._channels.get(channel).add(handler);
    return () => this._channels.get(channel).delete(handler);
  }

  /**
   * Publish to a channel
   */
  publish(channel, message) {
    const handlers = this._channels.get(channel);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (e) {
          this.emit('error', { channel, error: e });
        }
      });
    }
    this.emit(channel, message);
  }
}

// Singleton event bus
const globalEventBus = new EventBus();

module.exports = {
  TypedEventEmitter,
  DebouncedEmitter,
  EventBus,
  eventBus: globalEventBus
};
