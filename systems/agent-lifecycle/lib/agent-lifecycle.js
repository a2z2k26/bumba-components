/**
 * Agent Lifecycle - @bumba/agent-lifecycle v1.0
 * Finite state machine for managing agent lifecycles
 * Part of the BUMBA Platform
 */

const { EventEmitter } = require('events');

// Debug logging for Agent Lifecycle
const DEBUG = process.env.DEBUG && process.env.DEBUG.includes('agent-lifecycle');
const debug = (...args) => {
  if (DEBUG) {
    console.log('[Agent Lifecycle]', new Date().toISOString(), ...args);
  }
};

// Agent States
const AgentState = {
  IDLE: 'idle',
  SPAWNING: 'spawning',
  ACTIVE: 'active',
  VALIDATING: 'validating',
  COMPLETING: 'completing',
  COMPLETED: 'completed'
};

// State Events
const StateEvent = {
  SPAWN: 'spawn',
  ACTIVATE: 'activate',
  VALIDATE: 'validate',
  COMPLETE: 'complete',
  ERROR: 'error',
  TIMEOUT: 'timeout',
  RETRY: 'retry'
};

class AgentLifecycle extends EventEmitter {
  constructor(agentId, options = {}) {
    super();
    
    this.agentId = agentId;
    this.currentState = AgentState.IDLE;
    this.previousState = null;
    this.stateHistory = [];
    this.metadata = {};
    
    this.config = {
      maxIdleTime: options.maxIdleTime || 300000, // 5 minutes
      maxActiveTime: options.maxActiveTime || 1800000, // 30 minutes
      maxValidationTime: options.maxValidationTime || 60000, // 1 minute
      maxRetries: options.maxRetries || 3,
      autoComplete: options.autoComplete !== false,
      storeHistory: options.storeHistory !== false,
      ...options
    };
    
    this.timers = {};
    this.retryCount = 0;
    
    this.stats = {
      createdAt: Date.now(),
      lastStateChange: Date.now(),
      totalTransitions: 0,
      timeInStates: {},
      errors: []
    };
    
    // Initialize time tracking
    Object.values(AgentState).forEach(state => {
      this.stats.timeInStates[state] = 0;
    });
    
    this.transitions = this.defineTransitions();
    this.startTracking();
  }
  
  defineTransitions() {
    return {
      [AgentState.IDLE]: {
        [StateEvent.SPAWN]: AgentState.SPAWNING
      },
      [AgentState.SPAWNING]: {
        [StateEvent.ACTIVATE]: AgentState.ACTIVE,
        [StateEvent.ERROR]: AgentState.IDLE,
        [StateEvent.TIMEOUT]: AgentState.IDLE,
        [StateEvent.RETRY]: AgentState.SPAWNING
      },
      [AgentState.ACTIVE]: {
        [StateEvent.VALIDATE]: AgentState.VALIDATING,
        [StateEvent.COMPLETE]: AgentState.COMPLETING,
        [StateEvent.ERROR]: AgentState.IDLE,
        [StateEvent.TIMEOUT]: AgentState.COMPLETING
      },
      [AgentState.VALIDATING]: {
        [StateEvent.ACTIVATE]: AgentState.ACTIVE, // Validation failed, continue work
        [StateEvent.COMPLETE]: AgentState.COMPLETING, // Validation passed
        [StateEvent.ERROR]: AgentState.ACTIVE,
        [StateEvent.TIMEOUT]: AgentState.COMPLETING
      },
      [AgentState.COMPLETING]: {
        [StateEvent.COMPLETE]: AgentState.COMPLETED,
        [StateEvent.ERROR]: AgentState.COMPLETED,
        [StateEvent.TIMEOUT]: AgentState.COMPLETED
      },
      [AgentState.COMPLETED]: {
        // Terminal state
      }
    };
  }
  
  async transition(event, data = {}) {
    const fromState = this.currentState;
    const validTransitions = this.transitions[fromState];

    debug(`Agent ${this.agentId}: attempting transition ${event} from ${fromState}`);

    if (!validTransitions || !validTransitions[event]) {
      throw new Error(`Invalid transition: ${event} from ${fromState}`);
    }

    const toState = validTransitions[event];
    
    // Check if transition is allowed
    if (!this.canTransition(fromState, toState, data)) {
      return false;
    }
    
    // Update state timing
    this.updateStateTime(fromState);
    
    // Store previous state
    this.previousState = fromState;
    this.currentState = toState;
    this.stats.lastStateChange = Date.now();
    this.stats.totalTransitions++;
    
    // Store in history
    if (this.config.storeHistory) {
      this.stateHistory.push({
        from: fromState,
        to: toState,
        event,
        timestamp: Date.now(),
        data: { ...data }
      });
    }
    
    // Clear old timers and set new ones
    this.clearTimers(fromState);
    this.setTimers(toState);
    
    // Handle state-specific logic
    await this.handleStateEntry(toState, data);
    
    // Emit events
    this.emit('stateChange', {
      agentId: this.agentId,
      from: fromState,
      to: toState,
      event,
      data
    });

    debug(`Agent ${this.agentId}: transitioned ${fromState} → ${toState}`);
    
    this.emit(`enter:${toState}`, {
      agentId: this.agentId,
      previousState: fromState,
      data
    });
    
    return true;
  }
  
  canTransition(from, to, data) {
    // Add custom validation logic
    if (to === AgentState.SPAWNING && data.resourceCheck === false) {
      return false;
    }
    
    if (to === AgentState.COMPLETED && data.forceComplete !== true && this.hasActiveTasks()) {
      return false;
    }
    
    return true;
  }
  
  async handleStateEntry(state, data) {
    switch (state) {
      case AgentState.SPAWNING:
        this.metadata.spawnStartTime = Date.now();
        this.metadata.spawnData = data;
        break;
        
      case AgentState.ACTIVE:
        this.metadata.activationTime = Date.now();
        this.metadata.taskCount = data.taskCount || 0;
        break;
        
      case AgentState.VALIDATING:
        this.metadata.validationStartTime = Date.now();
        this.metadata.validationData = data;
        break;
        
      case AgentState.COMPLETING:
        this.metadata.completionStartTime = Date.now();
        this.metadata.completionReason = data.reason || 'normal';
        break;
        
      case AgentState.COMPLETED:
        this.metadata.completedAt = Date.now();
        this.cleanup();
        break;
    }
  }
  
  setTimers(state) {
    switch (state) {
      case AgentState.IDLE:
        if (this.config.maxIdleTime > 0) {
          this.timers.idle = setTimeout(() => {
            this.transition(StateEvent.TIMEOUT, { reason: 'idle_timeout' });
          }, this.config.maxIdleTime);
        }
        break;
        
      case AgentState.ACTIVE:
        if (this.config.maxActiveTime > 0) {
          this.timers.active = setTimeout(() => {
            this.transition(StateEvent.TIMEOUT, { reason: 'active_timeout' });
          }, this.config.maxActiveTime);
        }
        break;
        
      case AgentState.VALIDATING:
        if (this.config.maxValidationTime > 0) {
          this.timers.validation = setTimeout(() => {
            this.transition(StateEvent.TIMEOUT, { reason: 'validation_timeout' });
          }, this.config.maxValidationTime);
        }
        break;
    }
  }
  
  clearTimers(state) {
    const timerName = state.toLowerCase();
    if (this.timers[timerName]) {
      clearTimeout(this.timers[timerName]);
      delete this.timers[timerName];
    }
  }
  
  updateStateTime(state) {
    const timeInState = Date.now() - this.stats.lastStateChange;
    this.stats.timeInStates[state] += timeInState;
  }
  
  hasActiveTasks() {
    return this.metadata.taskCount && this.metadata.taskCount > 0;
  }
  
  startTracking() {
    if (this.config.maxIdleTime > 0 && this.currentState === AgentState.IDLE) {
      this.setTimers(AgentState.IDLE);
    }
    
    this.emit('lifecycle:started', {
      agentId: this.agentId,
      config: this.config
    });
  }
  
  cleanup() {
    // Clear all timers
    Object.keys(this.timers).forEach(timer => {
      clearTimeout(this.timers[timer]);
      delete this.timers[timer];
    });
    
    // Update final state time
    this.updateStateTime(this.currentState);
    
    this.emit('lifecycle:ended', {
      agentId: this.agentId,
      stats: this.getStatistics()
    });
  }
  
  async forceComplete(reason = 'forced') {
    try {
      await this.transition(StateEvent.COMPLETE, {
        reason,
        forceComplete: true
      });
    } catch (error) {
      // Force to completed state if transition fails
      this.currentState = AgentState.COMPLETED;
      this.cleanup();
    }
  }
  
  async retry(data = {}) {
    if (this.retryCount >= this.config.maxRetries) {
      throw new Error(`Max retries (${this.config.maxRetries}) exceeded`);
    }
    
    this.retryCount++;
    data.retryAttempt = this.retryCount;
    
    return await this.transition(StateEvent.RETRY, data);
  }
  
  // Getter methods
  getState() {
    return this.currentState;
  }
  
  isInState(state) {
    return this.currentState === state;
  }
  
  isAvailable() {
    return this.currentState === AgentState.ACTIVE;
  }
  
  isCompleted() {
    return this.currentState === AgentState.COMPLETED;
  }
  
  canAcceptWork() {
    return [AgentState.IDLE, AgentState.ACTIVE].includes(this.currentState);
  }
  
  getStatistics() {
    const totalTime = Date.now() - this.stats.createdAt;
    
    return {
      ...this.stats,
      currentState: this.currentState,
      totalLifetime: totalTime,
      retryCount: this.retryCount,
      statePercentages: Object.entries(this.stats.timeInStates).reduce((acc, [state, time]) => {
        acc[state] = totalTime > 0 ? `${((time / totalTime) * 100).toFixed(1)}%` : '0%';
        return acc;
      }, {})
    };
  }
  
  getHistory() {
    return [...this.stateHistory];
  }
  
  getMetadata() {
    return { ...this.metadata };
  }
  
  updateMetadata(updates) {
    this.metadata = { ...this.metadata, ...updates };
  }
  
  recordError(error) {
    this.stats.errors.push({
      timestamp: Date.now(),
      state: this.currentState,
      error: error.message || error.toString(),
      stack: error.stack
    });
  }
}

class AgentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.agents = new Map();
    this.config = {
      maxAgents: options.maxAgents || 50,
      defaultAgentConfig: options.defaultAgentConfig || {},
      enableMetrics: options.enableMetrics !== false,
      ...options
    };
    
    this.metrics = {
      totalSpawned: 0,
      totalCompleted: 0,
      activeAgents: 0,
      stateDistribution: {}
    };
    
    Object.values(AgentState).forEach(state => {
      this.metrics.stateDistribution[state] = 0;
    });
  }
  
  createAgent(agentId, config = {}) {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} already exists`);
    }
    
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum agent limit (${this.config.maxAgents}) reached`);
    }
    
    const agentConfig = { ...this.config.defaultAgentConfig, ...config };
    const agent = new AgentLifecycle(agentId, agentConfig);
    
    // Subscribe to events
    agent.on('stateChange', (data) => {
      this.handleStateChange(data);
    });
    
    agent.on('lifecycle:ended', (data) => {
      this.handleLifecycleEnd(data);
    });
    
    this.agents.set(agentId, agent);
    this.metrics.totalSpawned++;
    
    return agent;
  }
  
  getAgent(agentId) {
    return this.agents.get(agentId);
  }
  
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.cleanup();
      this.agents.delete(agentId);
      this.metrics.totalCompleted++;
    }
  }
  
  handleStateChange(data) {
    if (this.config.enableMetrics) {
      this.updateMetrics();
    }
    
    this.emit('agent:stateChange', data);
  }
  
  handleLifecycleEnd(data) {
    this.removeAgent(data.agentId);
    this.emit('agent:completed', data);
  }
  
  updateMetrics() {
    Object.keys(this.metrics.stateDistribution).forEach(state => {
      this.metrics.stateDistribution[state] = 0;
    });
    
    let activeCount = 0;
    this.agents.forEach(agent => {
      const state = agent.getState();
      this.metrics.stateDistribution[state]++;
      
      if (state === AgentState.ACTIVE) {
        activeCount++;
      }
    });
    
    this.metrics.activeAgents = activeCount;
  }
  
  getAgentsInState(state) {
    const agents = [];
    this.agents.forEach((agent, id) => {
      if (agent.getState() === state) {
        agents.push({ id, agent, stats: agent.getStatistics() });
      }
    });
    return agents;
  }
  
  getMetrics() {
    this.updateMetrics();
    return {
      ...this.metrics,
      totalAgents: this.agents.size,
      utilization: this.config.maxAgents > 0 
        ? `${((this.agents.size / this.config.maxAgents) * 100).toFixed(1)}%`
        : '0%'
    };
  }
  
  async completeAll(reason = 'shutdown') {
    const promises = Array.from(this.agents.values()).map(agent => 
      agent.forceComplete(reason)
    );
    
    await Promise.allSettled(promises);
  }
  
  getSummary() {
    return {
      totalAgents: this.agents.size,
      metrics: this.getMetrics(),
      agents: Array.from(this.agents.entries()).map(([id, agent]) => ({
        id,
        state: agent.getState(),
        stats: agent.getStatistics()
      }))
    };
  }

  /**
   * Health check for the orchestrator
   * Returns health status and diagnostic information
   */
  getHealth() {
    const metrics = this.getMetrics();
    const now = Date.now();

    // Check for stuck agents
    const stuckAgents = [];
    const warningAgents = [];

    this.agents.forEach((agent, id) => {
      const stats = agent.getStatistics();
      const timeSinceChange = now - stats.lastStateChange;

      // Agent stuck for more than 5 minutes (configurable)
      if (timeSinceChange > 300000 && agent.getState() !== AgentState.COMPLETED) {
        stuckAgents.push({
          id,
          state: agent.getState(),
          stuckDuration: timeSinceChange,
          lastChange: new Date(stats.lastStateChange).toISOString()
        });
      }

      // Warning if in same state for more than 2 minutes
      if (timeSinceChange > 120000 && timeSinceChange <= 300000 &&
          agent.getState() !== AgentState.COMPLETED) {
        warningAgents.push({
          id,
          state: agent.getState(),
          duration: timeSinceChange
        });
      }
    });

    const utilizationPercent = this.config.maxAgents > 0
      ? (this.agents.size / this.config.maxAgents) * 100
      : 0;

    const status = stuckAgents.length > 0 ? 'unhealthy' :
                  warningAgents.length > 0 ? 'degraded' :
                  utilizationPercent > 90 ? 'warning' :
                  'healthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      orchestrator: {
        totalAgents: this.agents.size,
        maxAgents: this.config.maxAgents,
        utilization: `${utilizationPercent.toFixed(1)}%`,
        activeAgents: metrics.activeAgents,
        totalSpawned: metrics.totalSpawned,
        totalCompleted: metrics.totalCompleted
      },
      stateDistribution: metrics.stateDistribution,
      issues: {
        stuck: stuckAgents,
        warnings: warningAgents
      },
      recommendations: this.getHealthRecommendations(status, stuckAgents, warningAgents, utilizationPercent)
    };
  }

  getHealthRecommendations(status, stuckAgents, warningAgents, utilization) {
    const recommendations = [];

    if (stuckAgents.length > 0) {
      recommendations.push('Consider force-completing stuck agents or investigating timeout configurations');
    }

    if (warningAgents.length > 0) {
      recommendations.push('Monitor agents that have been in the same state for extended periods');
    }

    if (utilization > 90) {
      recommendations.push('High utilization detected - consider scaling or completing inactive agents');
    }

    if (utilization < 10 && this.agents.size > 0) {
      recommendations.push('Low utilization - resources may be underutilized');
    }

    return recommendations;
  }
}

module.exports = {
  AgentState,
  StateEvent,
  AgentLifecycle,
  AgentOrchestrator,
  create: (agentId, options) => new AgentLifecycle(agentId, options),
  createOrchestrator: (options) => new AgentOrchestrator(options)
};