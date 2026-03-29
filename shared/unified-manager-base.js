/**
 * Unified Manager Base - Standalone stub
 * Base class for managers in the BUMBA ecosystem
 *
 * Replace this with your own implementation if needed
 */

const EventEmitter = require('events');

const ManagerState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  ERROR: 'error',
  SHUTDOWN: 'shutdown'
};

class UnifiedManagerBase extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.state = ManagerState.UNINITIALIZED;
    this.options = options;
    this.initialized = false;
    this.startTime = null;
  }

  async initialize() {
    if (this.initialized) return;
    this.state = ManagerState.INITIALIZING;
    this.emit('initializing', { name: this.name });

    try {
      await this._doInitialize();
      this.initialized = true;
      this.state = ManagerState.READY;
      this.startTime = Date.now();
      this.emit('ready', { name: this.name });
    } catch (error) {
      this.state = ManagerState.ERROR;
      this.emit('error', { name: this.name, error });
      throw error;
    }
  }

  async _doInitialize() {
    // Override in subclass
  }

  async shutdown() {
    this.state = ManagerState.SHUTDOWN;
    this.emit('shutdown', { name: this.name });
  }

  getState() {
    return this.state;
  }

  isReady() {
    return this.state === ManagerState.READY || this.state === ManagerState.RUNNING;
  }

  getUptime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }
}

module.exports = { UnifiedManagerBase, ManagerState };
